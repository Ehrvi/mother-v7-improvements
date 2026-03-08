/**
 * curriculum-v2.ts — Curriculum Learning v2 for MOTHER
 * Sprint 1 | C200 | Conselho dos 6 IAs | 2026-03-08
 *
 * Scientific basis:
 * - Bengio et al. (2009) "Curriculum Learning" — easy-to-hard task ordering
 * - GRPO (arXiv:2402.03300) — group relative policy optimization for RL training
 * - DPO (arXiv:2305.18290) — direct preference optimization for alignment
 * - SHMS domain: Slope Health Monitoring System (IntellTech core domain)
 *
 * Architecture:
 * - 10+ SHMS-specific tasks organized in 5 difficulty levels
 * - Each task has: prompt, expected_output_criteria, difficulty, domain
 * - Used by DGM to generate training pairs for GRPO/DPO fine-tuning
 */

export type TaskDifficulty = "trivial" | "easy" | "medium" | "hard" | "expert";
export type TaskDomain =
  | "shms"
  | "geotechnical"
  | "iot"
  | "data_analysis"
  | "report_writing"
  | "code_generation"
  | "reasoning";

export interface CurriculumTask {
  id: string;
  title: string;
  prompt: string;
  difficulty: TaskDifficulty;
  domain: TaskDomain;
  /** Criteria the response must satisfy (used by fitness scorer) */
  successCriteria: string[];
  /** Minimum expected response length in tokens */
  minResponseTokens: number;
  /** Maximum allowed response time in seconds */
  maxResponseTimeSec: number;
  /** Weight in DGM fitness calculation */
  fitnessWeight: number;
  /** Tags for filtering and grouping */
  tags: string[];
}

export interface CurriculumLevel {
  level: number;
  name: string;
  difficulty: TaskDifficulty;
  tasks: CurriculumTask[];
  /** Minimum score to advance to next level (0-1) */
  promotionThreshold: number;
}

/**
 * MOTHER Curriculum v2 — 10+ SHMS tasks across 5 difficulty levels.
 * Organized from trivial (level 1) to expert (level 5).
 */
export const CURRICULUM_V2: CurriculumLevel[] = [
  {
    level: 1,
    name: "Fundamentos SHMS",
    difficulty: "trivial",
    promotionThreshold: 0.9,
    tasks: [
      {
        id: "shms-l1-t1",
        title: "Definição de SHMS",
        prompt:
          "O que é um Sistema de Monitoramento de Saúde de Taludes (SHMS)? Explique em 3 parágrafos para um engenheiro civil.",
        difficulty: "trivial",
        domain: "shms",
        successCriteria: [
          "Define SHMS corretamente",
          "Menciona sensores IoT",
          "Menciona alertas em tempo real",
          "Linguagem técnica mas acessível",
        ],
        minResponseTokens: 200,
        maxResponseTimeSec: 30,
        fitnessWeight: 0.5,
        tags: ["shms", "definition", "basics"],
      },
      {
        id: "shms-l1-t2",
        title: "Tipos de Sensores",
        prompt:
          "Liste e descreva os 5 principais tipos de sensores usados em monitoramento geotécnico de taludes.",
        difficulty: "trivial",
        domain: "geotechnical",
        successCriteria: [
          "Menciona piezômetros",
          "Menciona inclinômetros",
          "Menciona acelerômetros",
          "Menciona extensômetros",
          "Descreve função de cada sensor",
        ],
        minResponseTokens: 300,
        maxResponseTimeSec: 30,
        fitnessWeight: 0.5,
        tags: ["sensors", "geotechnical", "basics"],
      },
    ],
  },
  {
    level: 2,
    name: "Análise de Dados IoT",
    difficulty: "easy",
    promotionThreshold: 0.85,
    tasks: [
      {
        id: "shms-l2-t1",
        title: "Interpretação de Leituras",
        prompt:
          "Um piezômetro instalado a 15m de profundidade registrou as seguintes leituras em kPa: [120, 125, 130, 145, 180, 210]. Analise a tendência e avalie o risco de instabilidade.",
        difficulty: "easy",
        domain: "data_analysis",
        successCriteria: [
          "Identifica tendência crescente",
          "Calcula taxa de variação",
          "Avalia nível de risco",
          "Recomenda ação",
        ],
        minResponseTokens: 400,
        maxResponseTimeSec: 45,
        fitnessWeight: 0.7,
        tags: ["piezometer", "data_analysis", "risk"],
      },
      {
        id: "shms-l2-t2",
        title: "Protocolo de Alertas",
        prompt:
          "Defina um protocolo de 3 níveis de alerta (verde/amarelo/vermelho) para um SHMS monitorando um talude de mineração com 50m de altura.",
        difficulty: "easy",
        domain: "shms",
        successCriteria: [
          "Define 3 níveis claramente",
          "Especifica thresholds numéricos",
          "Define ações para cada nível",
          "Considera múltiplos parâmetros",
        ],
        minResponseTokens: 500,
        maxResponseTimeSec: 60,
        fitnessWeight: 0.7,
        tags: ["alerts", "protocol", "shms"],
      },
    ],
  },
  {
    level: 3,
    name: "Relatórios Técnicos",
    difficulty: "medium",
    promotionThreshold: 0.80,
    tasks: [
      {
        id: "shms-l3-t1",
        title: "Relatório de Monitoramento Mensal",
        prompt:
          "Gere um relatório técnico mensal de monitoramento geotécnico para o Talude Norte da Mina Carajás. Período: fevereiro/2026. Inclua: resumo executivo, análise de dados, tendências, anomalias detectadas e recomendações.",
        difficulty: "medium",
        domain: "report_writing",
        successCriteria: [
          "Tem resumo executivo",
          "Analisa dados quantitativamente",
          "Identifica tendências",
          "Tem recomendações concretas",
          "Linguagem técnica formal",
          "Mínimo 800 palavras",
        ],
        minResponseTokens: 800,
        maxResponseTimeSec: 90,
        fitnessWeight: 0.85,
        tags: ["report", "monthly", "shms", "mining"],
      },
      {
        id: "shms-l3-t2",
        title: "Análise de Falha",
        prompt:
          "Um inclinômetro registrou deslocamento horizontal de 45mm em 72 horas em um talude de 80m. Realize análise de causa raiz, avalie mecanismo de ruptura provável e proponha medidas de mitigação imediatas e de longo prazo.",
        difficulty: "medium",
        domain: "geotechnical",
        successCriteria: [
          "Identifica mecanismo de ruptura",
          "Analisa causa raiz",
          "Propõe medidas imediatas",
          "Propõe medidas de longo prazo",
          "Usa terminologia geotécnica correta",
        ],
        minResponseTokens: 700,
        maxResponseTimeSec: 90,
        fitnessWeight: 0.85,
        tags: ["failure_analysis", "inclinometer", "geotechnical"],
      },
    ],
  },
  {
    level: 4,
    name: "Código e Integração IoT",
    difficulty: "hard",
    promotionThreshold: 0.75,
    tasks: [
      {
        id: "shms-l4-t1",
        title: "API de Ingestão de Dados",
        prompt:
          "Escreva uma API REST em TypeScript/Express para ingestão de dados de sensores SHMS. Deve aceitar leituras de múltiplos sensores, validar dados, detectar anomalias por z-score e disparar alertas via webhook.",
        difficulty: "hard",
        domain: "code_generation",
        successCriteria: [
          "Código TypeScript válido",
          "Endpoint POST /api/readings",
          "Validação de dados",
          "Detecção de anomalias z-score",
          "Webhook de alertas",
          "Tratamento de erros",
        ],
        minResponseTokens: 1000,
        maxResponseTimeSec: 120,
        fitnessWeight: 0.9,
        tags: ["api", "typescript", "iot", "anomaly_detection"],
      },
      {
        id: "shms-l4-t2",
        title: "Dashboard de Monitoramento",
        prompt:
          "Projete a arquitetura de um dashboard React para monitoramento em tempo real de 50 sensores SHMS. Inclua: componentes principais, fluxo de dados via WebSocket, estratégia de cache e visualizações recomendadas.",
        difficulty: "hard",
        domain: "code_generation",
        successCriteria: [
          "Arquitetura clara",
          "Componentes definidos",
          "WebSocket descrito",
          "Estratégia de cache",
          "Visualizações específicas para SHMS",
        ],
        minResponseTokens: 900,
        maxResponseTimeSec: 120,
        fitnessWeight: 0.9,
        tags: ["dashboard", "react", "websocket", "shms"],
      },
    ],
  },
  {
    level: 5,
    name: "Raciocínio Expert e Long-form",
    difficulty: "expert",
    promotionThreshold: 0.70,
    tasks: [
      {
        id: "shms-l5-t1",
        title: "Capítulo de Livro: SHMS e IA",
        prompt:
          "Escreva o Capítulo 3 de um livro técnico sobre 'Inteligência Artificial Aplicada ao Monitoramento Geotécnico'. Título: 'Sistemas de Monitoramento de Saúde de Taludes de Nova Geração'. O capítulo deve ter 15 seções, incluir fundamentos teóricos, estado da arte, casos de uso reais, limitações e perspectivas futuras. Mínimo 5000 palavras.",
        difficulty: "expert",
        domain: "report_writing",
        successCriteria: [
          "Mínimo 5000 palavras",
          "15+ seções estruturadas",
          "Fundamentos teóricos sólidos",
          "Estado da arte com referências",
          "Casos de uso reais",
          "Limitações identificadas",
          "Perspectivas futuras",
          "Linguagem acadêmica",
        ],
        minResponseTokens: 5000,
        maxResponseTimeSec: 300,
        fitnessWeight: 1.0,
        tags: ["long_form", "book_chapter", "shms", "ai", "expert"],
      },
      {
        id: "shms-l5-t2",
        title: "Plano Estratégico SHMS 5 Anos",
        prompt:
          "Desenvolva um plano estratégico de 5 anos para implementação de SHMS em todas as minas da Vale S.A. no Brasil. Inclua: diagnóstico atual, roadmap tecnológico, análise de ROI, gestão de riscos, cronograma de implementação e KPIs de sucesso.",
        difficulty: "expert",
        domain: "shms",
        successCriteria: [
          "Diagnóstico atual detalhado",
          "Roadmap por fases",
          "ROI calculado",
          "Riscos identificados e mitigados",
          "Cronograma realista",
          "KPIs mensuráveis",
          "Mínimo 3000 palavras",
        ],
        minResponseTokens: 3000,
        maxResponseTimeSec: 240,
        fitnessWeight: 1.0,
        tags: ["strategic_plan", "shms", "mining", "roi", "expert"],
      },
      {
        id: "shms-l5-t3",
        title: "Análise Comparativa: SHMS vs Concorrentes",
        prompt:
          "Realize uma análise técnica comparativa entre o SHMS da IntellTech e os 5 principais concorrentes globais (Trimble, Sisgeo, RST Instruments, Geokon, Campbell Scientific). Avalie: funcionalidades, precisão, custo, integração IoT, IA embarcada e suporte.",
        difficulty: "expert",
        domain: "reasoning",
        successCriteria: [
          "Analisa 5+ concorrentes",
          "Critérios de avaliação claros",
          "Dados técnicos precisos",
          "Tabela comparativa",
          "Conclusão fundamentada",
          "Pontos fortes e fracos do SHMS IntellTech",
        ],
        minResponseTokens: 2500,
        maxResponseTimeSec: 180,
        fitnessWeight: 1.0,
        tags: ["competitive_analysis", "shms", "intelltech", "expert"],
      },
    ],
  },
];

/**
 * Get all tasks from all levels (flattened).
 */
export function getAllTasks(): CurriculumTask[] {
  return CURRICULUM_V2.flatMap((level) => level.tasks);
}

/**
 * Get tasks by difficulty level.
 */
export function getTasksByDifficulty(difficulty: TaskDifficulty): CurriculumTask[] {
  return getAllTasks().filter((t) => t.difficulty === difficulty);
}

/**
 * Get tasks by domain.
 */
export function getTasksByDomain(domain: TaskDomain): CurriculumTask[] {
  return getAllTasks().filter((t) => t.domain === domain);
}

/**
 * Get the curriculum level for a given difficulty.
 */
export function getLevelForDifficulty(difficulty: TaskDifficulty): CurriculumLevel | undefined {
  return CURRICULUM_V2.find((l) => l.difficulty === difficulty);
}

/**
 * Get the next difficulty level (for promotion).
 */
export function getNextDifficulty(current: TaskDifficulty): TaskDifficulty | null {
  const order: TaskDifficulty[] = ["trivial", "easy", "medium", "hard", "expert"];
  const idx = order.indexOf(current);
  return idx < order.length - 1 ? order[idx + 1] : null;
}

/**
 * CurriculumManager — manages task selection and progression for DGM training.
 */
export class CurriculumManager {
  private currentLevel = 1;
  private taskScores: Map<string, number[]> = new Map();

  /**
   * Get the next task to attempt based on current performance.
   */
  getNextTask(): CurriculumTask {
    const level = CURRICULUM_V2[this.currentLevel - 1];
    const tasks = level.tasks;

    // Find the task with the lowest average score (prioritize weak areas)
    let lowestScoreTask = tasks[0];
    let lowestAvg = this.getAverageScore(tasks[0].id);

    for (const task of tasks) {
      const avg = this.getAverageScore(task.id);
      if (avg < lowestAvg) {
        lowestAvg = avg;
        lowestScoreTask = task;
      }
    }

    return lowestScoreTask;
  }

  /**
   * Record a score for a task and potentially advance to next level.
   */
  recordScore(taskId: string, score: number): { promoted: boolean; newLevel?: number } {
    const scores = this.taskScores.get(taskId) ?? [];
    scores.push(score);
    this.taskScores.set(taskId, scores.slice(-10)); // Keep last 10 scores

    // Check if we should advance to next level
    const level = CURRICULUM_V2[this.currentLevel - 1];
    const levelAvg = this.getLevelAverageScore(level);

    if (levelAvg >= level.promotionThreshold && this.currentLevel < CURRICULUM_V2.length) {
      this.currentLevel++;
      return { promoted: true, newLevel: this.currentLevel };
    }

    return { promoted: false };
  }

  getCurrentLevel(): number {
    return this.currentLevel;
  }

  getLevelStats(): { level: number; name: string; avgScore: number; taskCount: number } {
    const level = CURRICULUM_V2[this.currentLevel - 1];
    return {
      level: this.currentLevel,
      name: level.name,
      avgScore: this.getLevelAverageScore(level),
      taskCount: level.tasks.length,
    };
  }

  private getAverageScore(taskId: string): number {
    const scores = this.taskScores.get(taskId) ?? [];
    if (scores.length === 0) return 0;
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  private getLevelAverageScore(level: CurriculumLevel): number {
    const scores = level.tasks.map((t) => this.getAverageScore(t.id));
    if (scores.length === 0) return 0;
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }
}

// Singleton instance
export const curriculumManager = new CurriculumManager();
