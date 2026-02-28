/**
 * ORPO Fine-tuning Offline Pipeline — MOTHER v75.9
 * 
 * Base científica: arXiv:2403.07691 (Hong et al., EMNLP 2024)
 * "ORPO: Monolithic Preference Optimization without Reference Model"
 * 
 * Fórmula: L_ORPO = L_SFT + λ * L_OR
 * onde L_OR = -log(σ(log(odds_ratio(chosen, rejected))))
 * 
 * Vantagem sobre DPO: sem modelo de referência separado
 * Vantagem sobre SimPO: mais estável em treinamento (sem length normalization instável)
 * 
 * Pipeline:
 * 1. Coleta: orpo-optimizer.ts coleta pares (prompt, chosen, rejected) em produção
 * 2. Exportação: este módulo exporta em formato JSONL HuggingFace TRL
 * 3. Treinamento: script Python offline com TRL ORPOTrainer
 * 4. Avaliação: benchmark antes/depois para validar melhoria
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../_core/logger';

const logger = createLogger('ORPO-PIPELINE');

export interface ORPODatasetEntry {
  prompt: string;
  chosen: string;
  rejected: string;
  chosen_score: number;
  rejected_score: number;
  category: string;
  timestamp: string;
  source: string;  // "production" | "benchmark" | "synthetic"
}

export interface ORPOExportResult {
  totalPairs: number;
  exportedPairs: number;
  filteredOut: number;
  outputPath: string;
  trainPath: string;
  evalPath: string;
  trainScript: string;
  qualityDistribution: {
    chosen_avg: number;
    rejected_avg: number;
    margin_avg: number;
  };
}

// In-memory dataset (persisted to disk periodically)
const dataset: ORPODatasetEntry[] = [];

/**
 * Add a preference pair to the dataset
 * Called by core.ts after each response with quality score
 */
export function addORPOPair(entry: ORPODatasetEntry): void {
  // Quality gate: minimum margin between chosen and rejected
  const margin = entry.chosen_score - entry.rejected_score;
  if (margin < 15) {
    logger.debug(`[ORPO Pipeline] Skipping pair with insufficient margin: ${margin}`);
    return;
  }
  
  dataset.push(entry);
  logger.debug(`[ORPO Pipeline] Added pair: chosen=${entry.chosen_score}, rejected=${entry.rejected_score}, margin=${margin}`);
}

/**
 * Export dataset in HuggingFace TRL ORPO format
 * Format: {"prompt": "...", "chosen": "...", "rejected": "..."}
 * 
 * Splits into train (80%) and eval (20%)
 */
export async function exportORPODatasetTRL(
  outputDir: string = '/tmp/orpo-dataset'
): Promise<ORPOExportResult> {
  
  if (dataset.length < 10) {
    logger.warn(`[ORPO Pipeline] Insufficient data: ${dataset.length} pairs (minimum 10)`);
    return {
      totalPairs: dataset.length,
      exportedPairs: 0,
      filteredOut: dataset.length,
      outputPath: outputDir,
      trainPath: '',
      evalPath: '',
      trainScript: '',
      qualityDistribution: { chosen_avg: 0, rejected_avg: 0, margin_avg: 0 },
    };
  }
  
  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Filter and format for TRL
  const validPairs = dataset.filter(e => 
    e.chosen.length > 50 && 
    e.rejected.length > 50 && 
    e.chosen_score > e.rejected_score &&
    (e.chosen_score - e.rejected_score) >= 15
  );
  
  // Shuffle and split 80/20
  const shuffled = validPairs.sort(() => Math.random() - 0.5);
  const splitIdx = Math.floor(shuffled.length * 0.8);
  const trainSet = shuffled.slice(0, splitIdx);
  const evalSet = shuffled.slice(splitIdx);
  
  // Format for TRL ORPO
  const formatEntry = (e: ORPODatasetEntry) => JSON.stringify({
    prompt: e.prompt,
    chosen: e.chosen,
    rejected: e.rejected,
    // Metadata (TRL ignores extra fields)
    _chosen_score: e.chosen_score,
    _rejected_score: e.rejected_score,
    _category: e.category,
    _source: e.source,
  });
  
  const trainPath = path.join(outputDir, 'train.jsonl');
  const evalPath = path.join(outputDir, 'eval.jsonl');
  
  fs.writeFileSync(trainPath, trainSet.map(formatEntry).join('\n'));
  fs.writeFileSync(evalPath, evalSet.map(formatEntry).join('\n'));
  
  // Generate training script
  const trainScript = generateTRLTrainScript(outputDir, trainPath, evalPath);
  const scriptPath = path.join(outputDir, 'train_orpo.py');
  fs.writeFileSync(scriptPath, trainScript);
  
  // Generate dataset card
  const datasetCard = generateDatasetCard(validPairs, trainSet.length, evalSet.length);
  fs.writeFileSync(path.join(outputDir, 'README.md'), datasetCard);
  
  // Quality distribution
  const chosenAvg = validPairs.reduce((s, e) => s + e.chosen_score, 0) / validPairs.length;
  const rejectedAvg = validPairs.reduce((s, e) => s + e.rejected_score, 0) / validPairs.length;
  const marginAvg = chosenAvg - rejectedAvg;
  
  logger.info(`[ORPO Pipeline] Exported ${validPairs.length} pairs (train=${trainSet.length}, eval=${evalSet.length})`);
  logger.info(`[ORPO Pipeline] Quality: chosen_avg=${chosenAvg.toFixed(1)}, rejected_avg=${rejectedAvg.toFixed(1)}, margin=${marginAvg.toFixed(1)}`);
  
  return {
    totalPairs: dataset.length,
    exportedPairs: validPairs.length,
    filteredOut: dataset.length - validPairs.length,
    outputPath: outputDir,
    trainPath,
    evalPath,
    trainScript: scriptPath,
    qualityDistribution: {
      chosen_avg: chosenAvg,
      rejected_avg: rejectedAvg,
      margin_avg: marginAvg,
    },
  };
}

/**
 * Generate HuggingFace TRL training script
 * Uses ORPOConfig and ORPOTrainer from TRL library
 */
function generateTRLTrainScript(outputDir: string, trainPath: string, evalPath: string): string {
  return `#!/usr/bin/env python3
"""
ORPO Fine-tuning Script — MOTHER v75.9
Base científica: arXiv:2403.07691 (Hong et al., EMNLP 2024)
L_ORPO = L_SFT + λ * L_OR

Requirements:
  pip install trl transformers datasets accelerate peft bitsandbytes

Usage:
  python train_orpo.py --model meta-llama/Llama-3.2-3B-Instruct --output ./orpo-model
"""

import argparse
import json
from datasets import Dataset
from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
from trl import ORPOConfig, ORPOTrainer
from peft import LoraConfig, get_peft_model
import torch

def load_jsonl(path):
    with open(path) as f:
        return [json.loads(l) for l in f if l.strip()]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="meta-llama/Llama-3.2-3B-Instruct")
    parser.add_argument("--output", default="${outputDir}/orpo-model")
    parser.add_argument("--beta", type=float, default=0.1, help="λ in L_ORPO = L_SFT + λ * L_OR")
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch_size", type=int, default=4)
    parser.add_argument("--lr", type=float, default=8e-6)
    parser.add_argument("--max_length", type=int, default=2048)
    parser.add_argument("--use_qlora", action="store_true", default=True)
    args = parser.parse_args()
    
    print(f"Loading dataset from ${trainPath}...")
    train_data = load_jsonl("${trainPath}")
    eval_data = load_jsonl("${evalPath}")
    
    train_dataset = Dataset.from_list(train_data)
    eval_dataset = Dataset.from_list(eval_data)
    
    print(f"Train: {len(train_dataset)} pairs | Eval: {len(eval_dataset)} pairs")
    
    # QLoRA configuration for memory efficiency
    bnb_config = None
    if args.use_qlora:
        bnb_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.bfloat16,
        )
    
    print(f"Loading model: {args.model}")
    model = AutoModelForCausalLM.from_pretrained(
        args.model,
        quantization_config=bnb_config,
        device_map="auto",
        torch_dtype=torch.bfloat16,
    )
    tokenizer = AutoTokenizer.from_pretrained(args.model)
    tokenizer.pad_token = tokenizer.eos_token
    
    # LoRA configuration
    lora_config = LoraConfig(
        r=16,
        lora_alpha=32,
        target_modules=["q_proj", "v_proj", "k_proj", "o_proj"],
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()
    
    # ORPO training configuration
    # β=0.1 from Hong et al. (2024) — optimal for instruction following
    orpo_config = ORPOConfig(
        output_dir=args.output,
        learning_rate=args.lr,
        beta=args.beta,  # λ: weight of odds ratio loss
        max_length=args.max_length,
        max_prompt_length=512,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=4,
        warmup_ratio=0.1,
        logging_steps=10,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        fp16=False,
        bf16=True,
        report_to="none",
    )
    
    trainer = ORPOTrainer(
        model=model,
        args=orpo_config,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        tokenizer=tokenizer,
    )
    
    print("Starting ORPO training...")
    trainer.train()
    
    print(f"Saving model to {args.output}")
    trainer.save_model()
    tokenizer.save_pretrained(args.output)
    
    print("Training complete!")
    print(f"Model saved to: {args.output}")

if __name__ == "__main__":
    main()
`;
}

/**
 * Generate dataset card for HuggingFace
 */
function generateDatasetCard(
  pairs: ORPODatasetEntry[],
  trainCount: number,
  evalCount: number
): string {
  const categories = pairs.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  return `# MOTHER ORPO Dataset

Dataset de preferências coletado em produção pelo sistema MOTHER v75.9.

## Estatísticas
- Total de pares: ${pairs.length}
- Train: ${trainCount} | Eval: ${evalCount}
- Categorias: ${Object.entries(categories).map(([k, v]) => `${k}(${v})`).join(', ')}

## Formato
Cada entrada contém:
- \`prompt\`: A pergunta/instrução original
- \`chosen\`: Resposta de alta qualidade (score > 85)
- \`rejected\`: Resposta de baixa qualidade (score < 65)

## Base Científica
- ORPO: arXiv:2403.07691 (Hong et al., EMNLP 2024)
- L_ORPO = L_SFT + λ * L_OR (β=0.1)
- Sem modelo de referência separado (mais eficiente que DPO)

## Uso com TRL
\`\`\`bash
python train_orpo.py --model meta-llama/Llama-3.2-3B-Instruct --output ./orpo-model
\`\`\`
`;
}

/**
 * Get dataset statistics
 */
export function getORPOPipelineStats() {
  const validPairs = dataset.filter(e => 
    e.chosen_score > e.rejected_score && 
    (e.chosen_score - e.rejected_score) >= 15
  );
  
  const byCategory = dataset.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  return {
    totalPairs: dataset.length,
    validPairs: validPairs.length,
    readyForExport: validPairs.length >= 10,
    byCategory,
    avgChosenScore: validPairs.length > 0 
      ? validPairs.reduce((s, e) => s + e.chosen_score, 0) / validPairs.length 
      : 0,
    avgRejectedScore: validPairs.length > 0 
      ? validPairs.reduce((s, e) => s + e.rejected_score, 0) / validPairs.length 
      : 0,
  };
}
