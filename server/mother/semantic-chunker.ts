/**
 * semantic-chunker.ts — C154 — Fase 6B — MOTHER v81.0
 * Fix ISSUE-001: Loop de seções com prompts >46k tokens
 * 
 * Metodologia científica:
 * - Chunking semântico baseado em fronteiras de seção (não caracteres)
 * - Sliding window com overlap para preservar contexto
 * - Verificação de completude por seção obrigatória
 * - Detecção de loop por hash de saída (evita repetição)
 * - SHA-256 de cada chunk para rastreabilidade
 * 
 * ISSUE-001: MOTHER entra em loop com prompts >46k tokens
 * Descoberta empírica do Conselho v3 durante Rodada 2
 * Conselho v3 — Unanimidade: "ISSUE-001 é bloqueador de autonomia real"
 */

import * as crypto from 'crypto';
import { createLogger } from '../_core/logger';
const log = createLogger('SEMANTIC_CHUNKER');


export interface SemanticChunk {
  id: string;
  content: string;
  sectionName: string;
  tokenEstimate: number;
  sha256: string;
  chunkIndex: number;
  totalChunks: number;
  isComplete: boolean;
}

export interface ChunkingResult {
  chunks: SemanticChunk[];
  totalTokens: number;
  totalChunks: number;
  masterHash: string;
  loopDetected: boolean;
  timestamp: string;
}

export interface LoopDetectionState {
  outputHashes: Set<string>;
  repetitionCount: number;
  maxRepetitions: number;
}

export class SemanticChunker {
  private maxTokensPerChunk: number;
  private overlapTokens: number;
  private loopState: LoopDetectionState;

  // Seções obrigatórias que DEVEM aparecer em uma resposta completa
  private readonly REQUIRED_SECTIONS = [
    'convergências', 'divergências', 'autonomia', 'cronograma', 'moonshot', 'veredicto',
    'consensus', 'roadmap', 'recommendations', 'conclusion'
  ];

  constructor(maxTokensPerChunk: number = 8000, overlapTokens: number = 500) {
    this.maxTokensPerChunk = maxTokensPerChunk;
    this.overlapTokens = overlapTokens;
    this.loopState = {
      outputHashes: new Set(),
      repetitionCount: 0,
      maxRepetitions: 3
    };
  }

  /**
   * Estima tokens de uma string (aproximação: 1 token ≈ 4 chars em inglês/português)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Detecta fronteiras semânticas no texto (seções, parágrafos, etc.)
   */
  private findSemanticBoundaries(text: string): number[] {
    const boundaries: number[] = [0];
    
    // Detectar cabeçalhos Markdown (##, ###, etc.)
    const headerRegex = /^#{1,6}\s+.+$/gm;
    let match;
    while ((match = headerRegex.exec(text)) !== null) {
      boundaries.push(match.index);
    }

    // Detectar blocos de código (```)
    const codeBlockRegex = /^```/gm;
    while ((match = codeBlockRegex.exec(text)) !== null) {
      boundaries.push(match.index);
    }

    // Detectar parágrafos duplos
    const paragraphRegex = /\n\n/g;
    while ((match = paragraphRegex.exec(text)) !== null) {
      boundaries.push(match.index);
    }

    boundaries.push(text.length);
    return [...new Set(boundaries)].sort((a, b) => a - b);
  }

  /**
   * Divide texto em chunks semânticos respeitando fronteiras de seção
   */
  chunkText(text: string, contextLabel: string = 'unknown'): ChunkingResult {
    const totalTokens = this.estimateTokens(text);
    
    // Se cabe em um chunk, retornar diretamente
    if (totalTokens <= this.maxTokensPerChunk) {
      const sha256 = crypto.createHash('sha256').update(text).digest('hex');
      const chunk: SemanticChunk = {
        id: `${contextLabel}-chunk-0`,
        content: text,
        sectionName: 'full',
        tokenEstimate: totalTokens,
        sha256,
        chunkIndex: 0,
        totalChunks: 1,
        isComplete: true
      };
      return {
        chunks: [chunk],
        totalTokens,
        totalChunks: 1,
        masterHash: sha256,
        loopDetected: false,
        timestamp: new Date().toISOString()
      };
    }

    // Chunking semântico para textos grandes
    const boundaries = this.findSemanticBoundaries(text);
    const chunks: SemanticChunk[] = [];
    let currentStart = 0;
    let chunkIndex = 0;

    while (currentStart < text.length) {
      let currentEnd = currentStart;
      let currentTokens = 0;

      // Encontrar o maior chunk que cabe no limite
      for (const boundary of boundaries) {
        if (boundary <= currentStart) continue;
        
        const segment = text.substring(currentStart, boundary);
        const segmentTokens = this.estimateTokens(segment);
        
        if (currentTokens + segmentTokens > this.maxTokensPerChunk && currentEnd > currentStart) {
          break;
        }
        
        currentEnd = boundary;
        currentTokens += segmentTokens;
      }

      // Garantir progresso mínimo
      if (currentEnd <= currentStart) {
        currentEnd = Math.min(currentStart + this.maxTokensPerChunk * 4, text.length);
      }

      const chunkContent = text.substring(currentStart, currentEnd);
      const sha256 = crypto.createHash('sha256').update(chunkContent).digest('hex');
      
      // Detectar seção dominante no chunk
      const sectionName = this.detectSectionName(chunkContent);

      chunks.push({
        id: `${contextLabel}-chunk-${chunkIndex}`,
        content: chunkContent,
        sectionName,
        tokenEstimate: this.estimateTokens(chunkContent),
        sha256,
        chunkIndex,
        totalChunks: -1, // Será atualizado após
        isComplete: false // Será verificado após
      });

      // Overlap: retroceder um pouco para preservar contexto
      const overlapChars = this.overlapTokens * 4;
      currentStart = Math.max(currentEnd - overlapChars, currentEnd);
      if (currentStart >= text.length) break;
      chunkIndex++;
    }

    // Atualizar totalChunks e verificar completude
    const totalChunks = chunks.length;
    const allSections = chunks.map(c => c.sectionName.toLowerCase());
    
    chunks.forEach(chunk => {
      chunk.totalChunks = totalChunks;
      chunk.isComplete = totalChunks === 1;
    });

    // Verificar se todas as seções obrigatórias estão cobertas
    const coveredSections = this.REQUIRED_SECTIONS.filter(section =>
      allSections.some(s => s.includes(section)) ||
      chunks.some(c => c.content.toLowerCase().includes(section))
    );

    const masterHash = crypto.createHash('sha256')
      .update(chunks.map(c => c.sha256).join(''))
      .digest('hex');

    return {
      chunks,
      totalTokens,
      totalChunks,
      masterHash,
      loopDetected: false,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Detecta o nome da seção dominante em um chunk
   */
  private detectSectionName(content: string): string {
    const headerMatch = content.match(/^#{1,6}\s+(.+)$/m);
    if (headerMatch) return headerMatch[1].trim();
    
    for (const section of this.REQUIRED_SECTIONS) {
      if (content.toLowerCase().includes(section)) return section;
    }
    
    return 'general';
  }

  /**
   * Detecta loop em saída de LLM comparando hashes de outputs consecutivos
   * Fix direto para ISSUE-001
   */
  detectLoop(outputText: string): boolean {
    const outputHash = crypto.createHash('sha256').update(outputText).digest('hex');
    
    if (this.loopState.outputHashes.has(outputHash)) {
      this.loopState.repetitionCount++;
      log.warn(`[SemanticChunker C154] ⚠️ LOOP DETECTADO (repetição ${this.loopState.repetitionCount}/${this.loopState.maxRepetitions})`);
      
      if (this.loopState.repetitionCount >= this.loopState.maxRepetitions) {
        log.error('[SemanticChunker C154] 🛑 Loop máximo atingido — interrompendo geração');
        return true;
      }
      return true;
    }
    
    this.loopState.outputHashes.add(outputHash);
    return false;
  }

  /**
   * Reset do estado de detecção de loop
   */
  resetLoopState(): void {
    this.loopState = {
      outputHashes: new Set(),
      repetitionCount: 0,
      maxRepetitions: 3
    };
  }

  /**
   * Verifica se uma resposta está completa (todas as seções obrigatórias presentes)
   */
  isResponseComplete(text: string, requiredSections?: string[]): boolean {
    const sections = requiredSections || this.REQUIRED_SECTIONS;
    const lowerText = text.toLowerCase();
    
    // Verificar se pelo menos 60% das seções obrigatórias estão presentes
    const covered = sections.filter(s => lowerText.includes(s)).length;
    const ratio = covered / sections.length;
    
    return ratio >= 0.6;
  }
}

// Singleton export
export const semanticChunker = new SemanticChunker(8000, 500);

export default SemanticChunker;
