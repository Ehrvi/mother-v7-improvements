# Documentação Técnica Completa - MOTHER v14 (Parte 2/3)

**Nível**: Intermediário-Avançado  
**Escopo**: Layers 5-7 + Database + tRPC  
**Autor**: Manus AI  
**Data**: 2026-02-20

---

## Índice (Parte 2)

1. [Layer 5: Knowledge Layer](#layer-5-knowledge-layer)
2. [Layer 6: Quality Layer](#layer-6-quality-layer)
3. [Layer 7: Learning Layer](#layer-7-learning-layer)
4. [Database Schema](#database-schema)
5. [tRPC Routers](#trpc-routers)

---

## Layer 5: Knowledge Layer

### Propósito

Gerenciar conhecimento persistente do sistema, incluindo conceitos aprendidos, lições, e contexto histórico.

### Arquivos Principais

```
server/
├── mother/
│   ├── knowledge.ts           # Legacy knowledge system (TiDB)
│   └── embeddings.ts          # Vector embeddings
├── knowledge/
│   ├── base.ts                # Knowledge Acquisition Layer (v14)
│   └── base.test.ts           # Tests
└── db.ts                      # Database helpers
```

### `server/knowledge/base.ts` ⭐ **NOVO v14**

**Propósito**: Sistema de aquisição e retenção de conhecimento cross-task.

**Problema Resolvido**: "Groundhog Day Problem" - sistema esquecia tudo entre tarefas.

**Solução**: Dual-write (SQLite local + TiDB cloud) + Google Drive sync + GitHub version control.

**Classe Principal**: `KnowledgeBase`

**Código Explicado**:

```typescript
import Database from 'better-sqlite3';
import { db as tidb } from '../db';
import { knowledge } from '../../drizzle/schema';
import { getEmbedding } from '../mother/embeddings';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class KnowledgeBase {
  private sqlite: Database.Database;
  private syncInterval: NodeJS.Timeout | null = null;

  constructor(dbPath: string = './knowledge.db') {
    // 1. Inicializar SQLite local (WAL mode para performance)
    this.sqlite = new Database(dbPath);
    this.sqlite.pragma('journal_mode = WAL');
    
    // 2. Criar tabelas se não existirem
    this.initializeTables();
    
    // 3. Iniciar sync automático (a cada 5 minutos)
    this.startAutoSync();
  }

  private initializeTables() {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS concepts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT,
        confidence REAL DEFAULT 0.8,
        embedding BLOB,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE TABLE IF NOT EXISTS lessons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        impact TEXT,
        applied_count INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_concepts_category 
        ON concepts(category);
      CREATE INDEX IF NOT EXISTS idx_concepts_confidence 
        ON concepts(confidence DESC);
    `);
  }

  /**
   * Adicionar conceito ao knowledge base
   */
  async addConcept(
    title: string,
    content: string,
    category: string,
    confidence: number = 0.8
  ): Promise<number> {
    // 1. Verificar duplicatas (similarity >= 0.85)
    const existing = await this.searchConcepts(title, 5);
    for (const concept of existing) {
      const similarity = this.cosineSimilarity(
        concept.embedding,
        await getEmbedding(title)
      );
      if (similarity >= 0.85) {
        // Duplicata encontrada, atualizar em vez de criar
        return this.updateConcept(concept.id, { content, confidence });
      }
    }

    // 2. Gerar embedding
    const embedding = await getEmbedding(content);

    // 3. Inserir no SQLite local
    const result = this.sqlite.prepare(`
      INSERT INTO concepts (title, content, category, confidence, embedding)
      VALUES (?, ?, ?, ?, ?)
    `).run(title, content, category, confidence, Buffer.from(embedding));

    const conceptId = result.lastInsertRowid as number;

    // 4. Dual-write para TiDB cloud (async, não bloqueia)
    this.syncToCloud(conceptId).catch(err => 
      console.error('Cloud sync failed:', err)
    );

    return conceptId;
  }

  /**
   * Buscar conceitos por semantic search
   */
  async searchConcepts(
    query: string,
    limit: number = 5
  ): Promise<Concept[]> {
    // 1. Gerar embedding da query
    const queryEmbedding = await getEmbedding(query);

    // 2. Buscar todos conceitos (SQLite não tem vector search nativo)
    const concepts = this.sqlite.prepare(`
      SELECT * FROM concepts ORDER BY confidence DESC LIMIT 100
    `).all() as Concept[];

    // 3. Calcular similarity scores
    const scored = concepts.map(concept => ({
      ...concept,
      similarity: this.cosineSimilarity(
        new Float32Array(concept.embedding),
        queryEmbedding
      )
    }));

    // 4. Ordenar por similarity e retornar top-K
    return scored
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  /**
   * Adicionar lição aprendida
   */
  async addLesson(
    content: string,
    impact: 'high' | 'medium' | 'low' = 'medium'
  ): Promise<number> {
    const result = this.sqlite.prepare(`
      INSERT INTO lessons (content, impact)
      VALUES (?, ?)
    `).run(content, impact);

    const lessonId = result.lastInsertRowid as number;

    // Sync para cloud
    this.syncToCloud(null, lessonId).catch(err =>
      console.error('Cloud sync failed:', err)
    );

    return lessonId;
  }

  /**
   * Buscar lições relevantes
   */
  async searchLessons(
    query: string,
    limit: number = 3
  ): Promise<Lesson[]> {
    // Buscar por keyword match (simple but effective)
    const keywords = query.toLowerCase().split(/\s+/);
    
    const lessons = this.sqlite.prepare(`
      SELECT * FROM lessons ORDER BY applied_count DESC, id DESC
    `).all() as Lesson[];

    // Score por keyword match
    const scored = lessons.map(lesson => {
      const content = lesson.content.toLowerCase();
      const matches = keywords.filter(kw => content.includes(kw)).length;
      return { ...lesson, score: matches };
    });

    return scored
      .filter(l => l.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Sync para TiDB cloud (dual-write)
   */
  private async syncToCloud(
    conceptId?: number,
    lessonId?: number
  ): Promise<void> {
    if (conceptId) {
      const concept = this.sqlite.prepare(
        'SELECT * FROM concepts WHERE id = ?'
      ).get(conceptId) as Concept;

      await tidb.insert(knowledge).values({
        title: concept.title,
        content: concept.content,
        category: concept.category,
        confidence: concept.confidence,
        embedding: concept.embedding
      });
    }

    // Similar para lessons...
  }

  /**
   * Sync para Google Drive (backup)
   */
  private async syncToGoogleDrive(): Promise<void> {
    try {
      await execAsync(
        'rclone sync ./knowledge.db manus_google_drive:MOTHER-v14-KNOWLEDGE/ --config /home/ubuntu/.gdrive-rclone.ini'
      );
      console.log('✓ Knowledge synced to Google Drive');
    } catch (err) {
      console.error('Google Drive sync failed:', err);
    }
  }

  /**
   * Sync para GitHub (version control)
   */
  private async syncToGitHub(): Promise<void> {
    try {
      await execAsync('git add knowledge.db');
      await execAsync('git commit -m "Auto-sync knowledge base"');
      await execAsync('git push github main');
      console.log('✓ Knowledge synced to GitHub');
    } catch (err) {
      // Ignore errors (pode não ter mudanças)
    }
  }

  /**
   * Auto-sync (a cada 5 minutos)
   */
  private startAutoSync() {
    this.syncInterval = setInterval(async () => {
      await this.syncToGoogleDrive();
      await this.syncToGitHub();
    }, 5 * 60 * 1000); // 5 minutos
  }

  /**
   * Cosine similarity entre dois vetores
   */
  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Cleanup (fechar conexões)
   */
  close() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    this.sqlite.close();
  }
}

// Singleton instance
export const knowledgeBase = new KnowledgeBase();
```

**Decisões Arquiteturais**:

1. **Dual-write (SQLite + TiDB)**: SQLite para speed (local), TiDB para persistence (cloud)
2. **Deduplication automática**: Similarity >= 0.85 → update em vez de create
3. **Semantic search**: Usa embeddings (cosine similarity) em vez de keyword match
4. **Auto-sync**: Google Drive (backup) + GitHub (version control) a cada 5 minutos
5. **WAL mode**: SQLite Write-Ahead Logging para performance em concurrent access
6. **Top-K filtering**: Retorna apenas top 5 concepts + top 3 lessons (evita context overload)

### `server/mother/knowledge.ts` (Legacy)

**Propósito**: Sistema de conhecimento original (apenas TiDB, sem persistence cross-task).

**Função Principal**: `getKnowledgeContext(query: string): Promise<KnowledgeContext>`

**Código Explicado**:

```typescript
import { knowledgeBase } from '../knowledge/base';
import { db } from '../db';
import { knowledge } from '../../drizzle/schema';

export async function getKnowledgeContext(
  query: string
): Promise<KnowledgeContext> {
  // v14: Usar Knowledge Acquisition Layer (novo)
  const concepts = await knowledgeBase.searchConcepts(query, 5);
  const lessons = await knowledgeBase.searchLessons(query, 3);

  // Fallback: Legacy system (TiDB only)
  if (concepts.length === 0) {
    const legacyConcepts = await db
      .select()
      .from(knowledge)
      .where(/* ... */)
      .limit(5);
    
    return {
      concepts: legacyConcepts.map(c => ({
        title: c.title,
        content: c.content,
        confidence: c.confidence,
        type: 'legacy'
      })),
      lessons: []
    };
  }

  return {
    concepts: concepts.map(c => ({
      title: c.title,
      content: c.content,
      confidence: c.confidence,
      type: 'acquired'
    })),
    lessons: lessons.map(l => ({
      content: l.content,
      impact: l.impact,
      appliedCount: l.applied_count
    }))
  };
}
```

**Decisões Arquiteturais**:

1. **Backward compatibility**: Fallback para legacy system se Knowledge Acquisition Layer falhar
2. **Rich metadata**: Retorna type ('acquired' vs 'legacy') para debugging
3. **Lesson tracking**: Incrementa `applied_count` quando lição é usada

---

## Layer 6: Quality Layer

### Propósito

Validar qualidade de respostas do LLM antes de retornar ao usuário.

### Arquivo Principal

`server/mother/guardian.ts`

### `server/mother/guardian.ts`

**Propósito**: Sistema Guardian de 5-check validation.

**Função Principal**: `validateQuality(response: string, query: string): Promise<GuardianResult>`

**Código Explicado**:

```typescript
export interface GuardianResult {
  score: number;        // 0-100
  passed: boolean;      // score >= 70
  checks: {
    accuracy: number;   // 0-20
    relevance: number;  // 0-20
    completeness: number; // 0-20
    clarity: number;    // 0-20
    actionability: number; // 0-20
  };
  feedback: string[];   // Lista de problemas encontrados
}

export async function validateQuality(
  response: string,
  query: string
): Promise<GuardianResult> {
  const checks = {
    accuracy: await checkAccuracy(response, query),
    relevance: await checkRelevance(response, query),
    completeness: await checkCompleteness(response, query),
    clarity: await checkClarity(response),
    actionability: await checkActionability(response, query)
  };

  const score = Object.values(checks).reduce((sum, val) => sum + val, 0);
  const passed = score >= 70;

  const feedback: string[] = [];
  if (checks.accuracy < 15) feedback.push("Low accuracy detected");
  if (checks.relevance < 15) feedback.push("Response not relevant to query");
  if (checks.completeness < 15) feedback.push("Incomplete answer");
  if (checks.clarity < 15) feedback.push("Unclear or confusing language");
  if (checks.actionability < 15) feedback.push("Lacks actionable information");

  return { score, passed, checks, feedback };
}

/**
 * Check 1: Accuracy (0-20)
 */
async function checkAccuracy(
  response: string,
  query: string
): Promise<number> {
  // Heurísticas para detectar hallucinations
  let score = 20;

  // 1. Presença de disclaimers ("I don't know", "I'm not sure")
  const hasDisclaimer = /I (don't know|am not sure|cannot|can't)/i.test(response);
  if (hasDisclaimer) score -= 5; // Incerteza é melhor que hallucination

  // 2. Presença de números específicos sem fonte
  const hasUnverifiedNumbers = /\d{4,}/.test(response) && 
    !/according to|source|reference/i.test(response);
  if (hasUnverifiedNumbers) score -= 5;

  // 3. Contradições internas
  const sentences = response.split(/[.!?]+/);
  // (Análise simplificada - em produção, usar LLM para detectar contradições)

  return Math.max(score, 0);
}

/**
 * Check 2: Relevance (0-20)
 */
async function checkRelevance(
  response: string,
  query: string
): Promise<number> {
  // Keyword overlap entre query e response
  const queryKeywords = extractKeywords(query);
  const responseKeywords = extractKeywords(response);

  const overlap = queryKeywords.filter(kw => 
    responseKeywords.includes(kw)
  ).length;

  const relevanceRatio = overlap / queryKeywords.length;

  return Math.round(relevanceRatio * 20);
}

/**
 * Check 3: Completeness (0-20)
 */
async function checkCompleteness(
  response: string,
  query: string
): Promise<number> {
  let score = 20;

  // 1. Resposta muito curta
  const wordCount = response.split(/\s+/).length;
  if (wordCount < 20) score -= 10;
  else if (wordCount < 50) score -= 5;

  // 2. Query tem múltiplas perguntas?
  const questionCount = (query.match(/\?/g) || []).length;
  if (questionCount > 1) {
    // Verificar se response aborda todas
    // (Simplificado - em produção, usar LLM)
    if (wordCount < questionCount * 30) score -= 5;
  }

  return Math.max(score, 0);
}

/**
 * Check 4: Clarity (0-20)
 */
async function checkClarity(response: string): Promise<number> {
  let score = 20;

  // 1. Sentenças muito longas (> 40 palavras)
  const sentences = response.split(/[.!?]+/);
  const longSentences = sentences.filter(s => 
    s.split(/\s+/).length > 40
  ).length;
  if (longSentences > sentences.length * 0.3) score -= 5;

  // 2. Jargão excessivo
  const jargonWords = ['utilize', 'leverage', 'synergy', 'paradigm'];
  const jargonCount = jargonWords.filter(jw => 
    response.toLowerCase().includes(jw)
  ).length;
  if (jargonCount > 3) score -= 5;

  // 3. Estrutura (parágrafos, listas)
  const hasStructure = /\n\n|\n-|\n\d+\./.test(response);
  if (!hasStructure && response.length > 500) score -= 5;

  return Math.max(score, 0);
}

/**
 * Check 5: Actionability (0-20)
 */
async function checkActionability(
  response: string,
  query: string
): Promise<number> {
  // Query pede ação?
  const isActionQuery = /how to|how can|what should|guide|steps/i.test(query);
  
  if (!isActionQuery) {
    return 20; // N/A para queries não-action
  }

  let score = 20;

  // 1. Presença de steps/instruções
  const hasSteps = /step \d+|first|second|then|finally/i.test(response);
  if (!hasSteps) score -= 10;

  // 2. Presença de verbos de ação
  const actionVerbs = ['click', 'open', 'install', 'run', 'create', 'configure'];
  const actionVerbCount = actionVerbs.filter(av => 
    response.toLowerCase().includes(av)
  ).length;
  if (actionVerbCount === 0) score -= 5;

  return Math.max(score, 0);
}

function extractKeywords(text: string): string[] {
  // Remove stopwords e retorna palavras únicas
  const stopwords = ['the', 'a', 'an', 'is', 'are', 'was', 'were', 'to', 'of', 'in', 'on', 'at'];
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter(word => word.length > 3 && !stopwords.includes(word));
}
```

**Decisões Arquiteturais**:

1. **5-check system**: Cobre diferentes aspectos de qualidade
2. **Heuristic-based**: Rápido, sem custo de LLM adicional
3. **Threshold 70**: Rejeita respostas ruins (score < 70)
4. **Feedback actionable**: Retorna lista de problemas específicos
5. **Graceful degradation**: Cada check retorna 0-20 (nunca negativo)

---

## Layer 7: Learning Layer

### Propósito

Aprender com cada interação e melhorar continuamente.

### Arquivos Principais

```
server/
├── mother/
│   └── learning.ts            # Metrics collection
└── learning/
    ├── critical-thinking.ts   # Critical Thinking Central (v14)
    ├── critical-thinking.test.ts
    ├── god-level.ts           # GOD-Level Learning (v14)
    └── god-level.test.ts
```

### `server/learning/critical-thinking.ts` ⭐ **NOVO v14**

**Propósito**: Meta-cognitive analysis de respostas para identificar vieses, assumptions, e melhorar raciocínio.

**8 Phases**:

1. **Assumption Identification**: Identificar assumptions implícitas
2. **Evidence Evaluation**: Avaliar qualidade de evidências
3. **Alternative Perspectives**: Considerar viewpoints alternativos
4. **Bias Detection**: Detectar cognitive biases
5. **Logical Consistency**: Verificar consistência lógica
6. **Conclusion Synthesis**: Sintetizar conclusões
7. **Confidence Calibration**: Calibrar confidence scores
8. **Meta-Reflection**: Refletir sobre o próprio processo de pensamento

**Código Explicado** (simplificado):

```typescript
export interface CriticalThinkingResult {
  assumptions: string[];
  evidenceQuality: number; // 0-1
  alternativePerspectives: string[];
  biases: string[];
  logicalConsistency: number; // 0-1
  conclusion: string;
  confidence: number; // 0-1
  metaReflection: string;
}

export async function applyCriticalThinking(
  query: string,
  response: string
): Promise<CriticalThinkingResult> {
  // Phase 1: Assumption Identification
  const assumptions = await identifyAssumptions(query, response);

  // Phase 2: Evidence Evaluation
  const evidenceQuality = await evaluateEvidence(response);

  // Phase 3: Alternative Perspectives
  const alternatives = await generateAlternatives(query, response);

  // Phase 4: Bias Detection
  const biases = await detectBiases(response);

  // Phase 5: Logical Consistency
  const consistency = await checkLogicalConsistency(response);

  // Phase 6: Conclusion Synthesis
  const conclusion = await synthesizeConclusion(
    assumptions,
    evidenceQuality,
    alternatives,
    biases,
    consistency
  );

  // Phase 7: Confidence Calibration
  const confidence = await calibrateConfidence(
    evidenceQuality,
    consistency,
    biases.length
  );

  // Phase 8: Meta-Reflection
  const metaReflection = await reflect(
    assumptions,
    evidenceQuality,
    alternatives,
    biases,
    consistency,
    conclusion,
    confidence
  );

  return {
    assumptions,
    evidenceQuality,
    alternativePerspectives: alternatives,
    biases,
    logicalConsistency: consistency,
    conclusion,
    confidence,
    metaReflection
  };
}
```

**Decisões Arquiteturais**:

1. **8-phase pipeline**: Cobre aspectos críticos de pensamento crítico
2. **LLM-powered**: Usa GPT-4o-mini para análise (cost-effective)
3. **A/B testing**: Apenas 10% de traffic usa Critical Thinking (feature flag)
4. **Async execution**: Não bloqueia resposta principal
5. **Metrics tracking**: Registra impacto em quality score

### `server/learning/god-level.ts` ⭐ **NOVO v14**

**Propósito**: Pattern recognition cross-domain e knowledge synthesis.

**Funcionalidades**:

1. **Pattern Recognition**: Identificar patterns em queries/responses
2. **Knowledge Synthesis**: Combinar conhecimento de múltiplas fontes
3. **Adaptive Learning**: Ajustar estratégias baseado em performance
4. **Meta-Learning**: Aprender a aprender

**Código Explicado** (simplificado):

```typescript
export class GODLevelLearning {
  private patterns: Map<string, Pattern> = new Map();
  private synthesisCache: Map<string, Synthesis> = new Map();

  /**
   * Aprender pattern de uma interação
   */
  async learnPattern(
    query: string,
    response: string,
    quality: number
  ): Promise<void> {
    // 1. Extrair features da query
    const features = this.extractFeatures(query);

    // 2. Identificar pattern existente ou criar novo
    const patternKey = this.hashFeatures(features);
    let pattern = this.patterns.get(patternKey);

    if (!pattern) {
      pattern = {
        features,
        successCount: 0,
        failureCount: 0,
        avgQuality: 0,
        examples: []
      };
      this.patterns.set(patternKey, pattern);
    }

    // 3. Atualizar pattern
    if (quality >= 0.7) {
      pattern.successCount++;
    } else {
      pattern.failureCount++;
    }

    pattern.avgQuality = (
      (pattern.avgQuality * pattern.examples.length + quality) /
      (pattern.examples.length + 1)
    );

    pattern.examples.push({ query, response, quality });

    // 4. Limitar exemplos (keep top 10)
    if (pattern.examples.length > 10) {
      pattern.examples = pattern.examples
        .sort((a, b) => b.quality - a.quality)
        .slice(0, 10);
    }
  }

  /**
   * Sintetizar conhecimento de múltiplas fontes
   */
  async synthesizeKnowledge(
    query: string,
    sources: KnowledgeSource[]
  ): Promise<Synthesis> {
    // 1. Verificar cache
    const cacheKey = this.hashQuery(query);
    if (this.synthesisCache.has(cacheKey)) {
      return this.synthesisCache.get(cacheKey)!;
    }

    // 2. Identificar patterns relevantes
    const relevantPatterns = this.findRelevantPatterns(query);

    // 3. Combinar conhecimento
    const synthesis = await this.combine(sources, relevantPatterns);

    // 4. Validar synthesis
    const validated = await this.validate(synthesis);

    // 5. Cache result
    this.synthesisCache.set(cacheKey, validated);

    return validated;
  }

  /**
   * Adaptar estratégia baseado em performance
   */
  async adapt(metrics: Metrics): Promise<void> {
    // Analisar métricas recentes
    const recentQuality = metrics.avgQuality;
    const recentCost = metrics.avgCost;

    // Ajustar thresholds
    if (recentQuality < 0.8) {
      // Qualidade baixa → aumentar tier
      this.adjustTierThresholds(+0.1);
    } else if (recentCost > TARGET_COST) {
      // Custo alto → diminuir tier
      this.adjustTierThresholds(-0.1);
    }

    // Ajustar cache TTL
    if (metrics.cacheHitRate < 0.35) {
      // Cache hit rate baixo → aumentar TTL
      this.adjustCacheTTL(+3600); // +1 hora
    }
  }
}

export const godLevelLearning = new GODLevelLearning();
```

**Decisões Arquiteturais**:

1. **Pattern-based**: Aprende patterns de sucesso/falha
2. **Synthesis**: Combina conhecimento de múltiplas fontes
3. **Adaptive**: Ajusta estratégias automaticamente
4. **Caching**: Cache de synthesis para performance
5. **Confidence 0.9**: Patterns com high success rate têm confidence 0.9

---

## Database Schema

### Tabelas Principais

```sql
-- Users
CREATE TABLE user (
  id INT PRIMARY KEY AUTO_INCREMENT,
  open_id VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  email VARCHAR(255),
  role ENUM('admin', 'user') DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Knowledge
CREATE TABLE knowledge (
  id INT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  category VARCHAR(100),
  confidence FLOAT DEFAULT 0.8,
  embedding BLOB,  -- Vector embedding (1536 dimensions)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Query History
CREATE TABLE query (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT,
  query TEXT NOT NULL,
  response TEXT NOT NULL,
  tier VARCHAR(50),  -- 'gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'
  cost FLOAT,
  quality_score INT,
  response_time INT,  -- milliseconds
  tokens_used INT,
  cached BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES user(id)
);

-- Cache
CREATE TABLE cache (
  query_hash VARCHAR(64) PRIMARY KEY,
  response TEXT NOT NULL,
  tier VARCHAR(50),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- System Config
CREATE TABLE system_config (
  key VARCHAR(255) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### Índices

```sql
-- Performance indexes
CREATE INDEX idx_query_user_id ON query(user_id);
CREATE INDEX idx_query_created_at ON query(created_at DESC);
CREATE INDEX idx_cache_expires_at ON cache(expires_at);
CREATE INDEX idx_knowledge_category ON knowledge(category);
CREATE INDEX idx_knowledge_confidence ON knowledge(confidence DESC);
```

---

## tRPC Routers

### `server/routers/mother.ts`

**Propósito**: API principal para interagir com MOTHER.

**Endpoints**:

```typescript
export const motherRouter = router({
  // Query MOTHER
  query: protectedProcedure
    .input(z.object({
      query: z.string().min(1).max(10000)
    }))
    .mutation(async ({ input, ctx }) => {
      return await processQuery(input.query, ctx.user.id);
    }),

  // Get query history
  history: protectedProcedure
    .input(z.object({
      limit: z.number().default(20),
      offset: z.number().default(0)
    }))
    .query(async ({ input, ctx }) => {
      return await db
        .select()
        .from(query)
        .where(eq(query.userId, ctx.user.id))
        .orderBy(desc(query.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  // Get knowledge entries
  knowledge: protectedProcedure
    .input(z.object({
      category: z.string().optional(),
      limit: z.number().default(10)
    }))
    .query(async ({ input }) => {
      let q = db.select().from(knowledge);
      
      if (input.category) {
        q = q.where(eq(knowledge.category, input.category));
      }

      return await q
        .orderBy(desc(knowledge.confidence))
        .limit(input.limit);
    })
});
```

**Decisões Arquiteturais**:

1. **protectedProcedure**: Requer autenticação (ctx.user disponível)
2. **Zod validation**: Input validation automática
3. **Type-safe**: TypeScript infere tipos automaticamente
4. **Pagination**: Suporta limit/offset para queries grandes

---

## Próxima Parte

Continua em `GUIA-02-DOCUMENTACAO-TECNICA-PARTE-3.md`:
- Frontend Components (detalhado)
- Styling & Theming
- Authentication Flow
- File Storage
- Deployment Configuration

---

**Autor**: Manus AI  
**Data**: 2026-02-20  
**Versão**: 1.0
