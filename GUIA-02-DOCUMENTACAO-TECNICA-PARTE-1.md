# Documentação Técnica Completa - MOTHER v14 (Parte 1/3)

**Nível**: Intermediário (requer conhecimento básico de programação)  
**Escopo**: Arquitetura Geral + Backend (server/)  
**Autor**: Manus AI  
**Data**: 2026-02-20

---

## Índice (Parte 1)

1. [Arquitetura Geral](#arquitetura-geral)
2. [Layer 1: Interface Layer](#layer-1-interface-layer)
3. [Layer 2: Orchestration Layer](#layer-2-orchestration-layer)
4. [Layer 3: Intelligence Layer](#layer-3-intelligence-layer)
5. [Layer 4: Execution Layer](#layer-4-execution-layer)

---

## Arquitetura Geral

MOTHER v14 é construído em **7 camadas (layers)** que trabalham juntas para processar queries de usuários e gerar respostas inteligentes.

### Diagrama de Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                    Layer 1: Interface                        │
│  (React 19 + tRPC Client + Tailwind 4)                      │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP/tRPC
┌──────────────────────▼──────────────────────────────────────┐
│                 Layer 2: Orchestration                       │
│  (core.ts - processQuery pipeline)                          │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
┌───────▼──────┐ ┌────▼─────┐ ┌─────▼──────┐
│   Layer 3:   │ │ Layer 5: │ │  Layer 6:  │
│ Intelligence │ │Knowledge │ │  Quality   │
│  (routing)   │ │  (base)  │ │ (guardian) │
└───────┬──────┘ └────┬─────┘ └─────┬──────┘
        │              │              │
        └──────────────┼──────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                  Layer 4: Execution                          │
│  (LLM invocation via OpenAI API)                            │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                   Layer 7: Learning                          │
│  (Critical Thinking + GOD-Level + Metrics)                  │
└─────────────────────────────────────────────────────────────┘
```

### Fluxo de Dados (Request → Response)

1. **Usuário faz query** → Interface (Layer 1)
2. **Interface envia para servidor** → tRPC call
3. **Orchestration recebe** → `processQuery()` em `core.ts` (Layer 2)
4. **Intelligence avalia complexidade** → `assessComplexity()` (Layer 3)
5. **Knowledge busca contexto** → `getKnowledgeContext()` (Layer 5)
6. **Execution chama LLM** → `invokeLLM()` (Layer 4)
7. **Quality valida resposta** → `validateQuality()` (Layer 6)
8. **Learning registra métricas** → `trackMetrics()` (Layer 7)
9. **Orchestration retorna resposta** → tRPC response
10. **Interface exibe para usuário** → React component

### Tecnologias Principais

| Camada | Tecnologia | Versão | Propósito |
|--------|-----------|--------|-----------|
| Frontend | React | 19.0.0 | Interface de usuário |
| Frontend | Tailwind CSS | 4.0.0 | Estilização |
| Frontend | tRPC Client | 11.6.0 | Comunicação type-safe com backend |
| Backend | Node.js | 22.13.0 | Runtime JavaScript |
| Backend | Express | 4.x | Servidor HTTP |
| Backend | tRPC Server | 11.6.0 | API type-safe |
| Backend | TypeScript | 5.9.3 | Tipagem estática |
| Database | TiDB Cloud | - | Banco de dados MySQL-compatible |
| Database | Drizzle ORM | 0.44.5 | ORM type-safe |
| AI | OpenAI API | - | LLM (GPT-4o, GPT-4o-mini, GPT-3.5-turbo) |
| Storage | SQLite | 3.x | Persistence local (Knowledge Acquisition Layer) |
| Storage | AWS S3 | - | File storage |

---

## Layer 1: Interface Layer

### Propósito

Fornecer interface visual para usuários interagirem com MOTHER v14.

### Arquivos Principais

```
client/
├── src/
│   ├── pages/
│   │   ├── Home.tsx           # Landing page + chat interface
│   │   ├── Admin.tsx          # Admin panel (feature flags)
│   │   └── NotFound.tsx       # 404 page
│   ├── components/
│   │   ├── AIChatBox.tsx      # Chat interface component
│   │   ├── DashboardLayout.tsx # Layout wrapper
│   │   └── ui/                # shadcn/ui components
│   ├── lib/
│   │   └── trpc.ts            # tRPC client configuration
│   ├── contexts/
│   │   └── ThemeContext.tsx   # Dark/light theme
│   ├── App.tsx                # Routes + layout
│   ├── main.tsx               # Entry point
│   └── index.css              # Global styles
└── index.html                 # HTML template
```

### `client/src/main.tsx`

**Propósito**: Entry point da aplicação React. Configura tRPC client e React Query.

**Código Explicado**:

```typescript
import { trpc } from "@/lib/trpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";

// Criar QueryClient (gerencia cache de queries)
const queryClient = new QueryClient();

// Criar tRPC client
const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",              // Endpoint do backend
      transformer: superjson,         // Serializa Date, BigInt, etc.
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",     // Envia cookies (auth)
        });
      },
    }),
  ],
});

// Renderizar app
createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
```

**Decisões Arquiteturais**:

1. **superjson transformer**: Permite enviar/receber `Date` objects sem conversão manual para string
2. **credentials: "include"**: Necessário para auth via cookies (Manus OAuth)
3. **httpBatchLink**: Agrupa múltiplas queries em uma única requisição HTTP (otimização)

### `client/src/App.tsx`

**Propósito**: Define rotas e layout global da aplicação.

**Código Explicado**:

```typescript
import { Route, Switch } from "wouter";
import Home from "./pages/Home";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";
import { ThemeProvider } from "./contexts/ThemeContext";
import { Toaster } from "@/components/ui/sonner";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/admin" component={Admin} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />  {/* Fallback */}
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
```

**Decisões Arquiteturais**:

1. **wouter** em vez de react-router: Mais leve (1.6KB vs 11KB)
2. **ThemeProvider**: Suporta dark/light theme (mas default é light)
3. **ErrorBoundary**: Captura erros React e exibe fallback UI
4. **Toaster**: Notificações toast (success, error, info)

### `client/src/pages/Home.tsx`

**Propósito**: Landing page + chat interface principal.

**Código Explicado**:

```typescript
import { useAuth } from "@/_core/hooks/useAuth";
import { AIChatBox } from "@/components/AIChatBox";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";

export default function Home() {
  const { user, loading, isAuthenticated, logout } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <h1>Welcome to MOTHER v14</h1>
        <Button onClick={() => window.location.href = getLoginUrl()}>
          Login
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <AIChatBox />
    </div>
  );
}
```

**Decisões Arquiteturais**:

1. **useAuth hook**: Abstrai lógica de autenticação (reutilizável)
2. **getLoginUrl()**: Gera URL de login Manus OAuth com redirect correto
3. **AIChatBox**: Componente reutilizável de chat (usado em múltiplas páginas)

### `client/src/components/AIChatBox.tsx`

**Propósito**: Interface de chat com MOTHER.

**Funcionalidades**:

1. **Input de texto**: Usuário digita query
2. **Histórico de mensagens**: Exibe conversas anteriores
3. **Streaming**: Suporta respostas em tempo real (SSE)
4. **Markdown rendering**: Formata respostas com código, listas, etc.
5. **Loading states**: Indica quando MOTHER está "pensando"

**Código Explicado** (simplificado):

```typescript
export function AIChatBox() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  
  const queryMutation = trpc.mother.query.useMutation({
    onSuccess: (data) => {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: data.response
      }]);
    }
  });

  const handleSubmit = () => {
    // Adicionar mensagem do usuário
    setMessages(prev => [...prev, {
      role: "user",
      content: input
    }]);
    
    // Enviar para backend
    queryMutation.mutate({ query: input });
    
    // Limpar input
    setInput("");
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Histórico de mensagens */}
      <div className="flex-1 overflow-y-auto">
        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}
      </div>
      
      {/* Input */}
      <div className="p-4">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === "Enter" && handleSubmit()}
        />
        <Button onClick={handleSubmit}>Send</Button>
      </div>
    </div>
  );
}
```

**Decisões Arquiteturais**:

1. **trpc.mother.query.useMutation**: Type-safe mutation (TypeScript infere tipos automaticamente)
2. **Optimistic updates**: Adiciona mensagem do usuário imediatamente (UX melhor)
3. **onKeyPress Enter**: Permite enviar com Enter (UX padrão de chat)

---

## Layer 2: Orchestration Layer

### Propósito

Orquestrar o fluxo de processamento de queries, coordenando todos os outros layers.

### Arquivo Principal

`server/mother/core.ts`

### `server/mother/core.ts`

**Propósito**: Pipeline principal de processamento de queries.

**Função Principal**: `processQuery(query: string, userId: string): Promise<Response>`

**Código Explicado**:

```typescript
export async function processQuery(
  query: string,
  userId: string
): Promise<Response> {
  // 1. Validar input
  if (!query || query.trim().length === 0) {
    throw new Error("Query cannot be empty");
  }

  // 2. Verificar cache
  const cached = await checkCache(query);
  if (cached) {
    return {
      response: cached.response,
      cached: true,
      tier: cached.tier,
      cost: 0
    };
  }

  // 3. Avaliar complexidade (Layer 3: Intelligence)
  const complexity = await assessComplexity(query);
  
  // 4. Selecionar tier de LLM
  const tier = selectTier(complexity);
  // tier = "gpt-4o" | "gpt-4o-mini" | "gpt-3.5-turbo"

  // 5. Buscar contexto de conhecimento (Layer 5: Knowledge)
  const knowledgeContext = await getKnowledgeContext(query);

  // 6. Construir prompt
  const prompt = buildPrompt(query, knowledgeContext);

  // 7. Executar LLM (Layer 4: Execution)
  const llmResponse = await invokeLLM({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt }
    ],
    model: tier
  });

  // 8. Validar qualidade (Layer 6: Quality)
  const quality = await validateQuality(llmResponse, query);
  
  if (quality.score < 70) {
    // Rejeitar resposta de baixa qualidade
    // Tentar novamente com tier superior
    return processQuery(query, userId); // Retry
  }

  // 9. Registrar métricas (Layer 7: Learning)
  await trackMetrics({
    query,
    response: llmResponse,
    tier,
    cost: calculateCost(tier, llmResponse.tokens),
    quality: quality.score,
    userId
  });

  // 10. Salvar em cache
  await saveCache(query, llmResponse, tier);

  // 11. Retornar resposta
  return {
    response: llmResponse.content,
    cached: false,
    tier,
    cost: calculateCost(tier, llmResponse.tokens),
    quality: quality.score
  };
}
```

**Decisões Arquiteturais**:

1. **Cache-first**: Verifica cache antes de processar (economiza custo)
2. **Complexity-based routing**: Queries simples usam modelos mais baratos
3. **Quality validation**: Rejeita respostas ruins e tenta novamente
4. **Metrics tracking**: Registra tudo para análise posterior
5. **Error handling**: Try-catch em cada etapa (não mostrado acima para simplicidade)

### Funções Auxiliares

#### `checkCache(query: string): Promise<CachedResponse | null>`

**Propósito**: Verificar se query já foi respondida antes.

**Implementação**:

```typescript
async function checkCache(query: string): Promise<CachedResponse | null> {
  // 1. Calcular hash da query (SHA-256)
  const queryHash = crypto
    .createHash("sha256")
    .update(query.toLowerCase().trim())
    .digest("hex");

  // 2. Buscar no banco de dados
  const cached = await db
    .select()
    .from(cache)
    .where(eq(cache.queryHash, queryHash))
    .limit(1);

  // 3. Verificar se expirou
  if (cached.length > 0) {
    const entry = cached[0];
    if (new Date() < entry.expiresAt) {
      return {
        response: entry.response,
        tier: entry.tier
      };
    } else {
      // Expirou, deletar
      await db.delete(cache).where(eq(cache.queryHash, queryHash));
    }
  }

  return null;
}
```

**Decisões Arquiteturais**:

1. **SHA-256 hash**: Normaliza query (case-insensitive, trim whitespace)
2. **Expiration**: Cache expira após 24 horas (configurável)
3. **Auto-cleanup**: Deleta entradas expiradas automaticamente

#### `buildPrompt(query: string, context: KnowledgeContext): string`

**Propósito**: Construir prompt para LLM com contexto de conhecimento.

**Implementação**:

```typescript
function buildPrompt(query: string, context: KnowledgeContext): string {
  let prompt = query;

  // Adicionar conceitos relevantes
  if (context.concepts.length > 0) {
    prompt += "\n\nRelevant concepts:\n";
    context.concepts.forEach(concept => {
      prompt += `- ${concept.title}: ${concept.content}\n`;
    });
  }

  // Adicionar lições aprendidas
  if (context.lessons.length > 0) {
    prompt += "\n\nLessons learned:\n";
    context.lessons.forEach(lesson => {
      prompt += `- ${lesson.content}\n`;
    });
  }

  return prompt;
}
```

**Decisões Arquiteturais**:

1. **Context injection**: Adiciona conhecimento relevante ao prompt
2. **Structured format**: Usa markdown para clareza
3. **Top-K filtering**: Apenas top 5 concepts + top 3 lessons (evita prompt muito longo)

---

## Layer 3: Intelligence Layer

### Propósito

Avaliar complexidade de queries e rotear para o tier de LLM apropriado.

### Arquivo Principal

`server/mother/intelligence.ts`

### `server/mother/intelligence.ts`

**Função Principal**: `assessComplexity(query: string): Promise<number>`

**Código Explicado**:

```typescript
export async function assessComplexity(query: string): Promise<number> {
  // Heurísticas para avaliar complexidade
  let score = 0;

  // 1. Comprimento da query
  const wordCount = query.split(/\s+/).length;
  if (wordCount > 50) score += 0.3;
  else if (wordCount > 20) score += 0.2;
  else score += 0.1;

  // 2. Presença de palavras-chave complexas
  const complexKeywords = [
    "analyze", "compare", "evaluate", "synthesize",
    "explain in detail", "comprehensive", "thorough"
  ];
  const hasComplexKeyword = complexKeywords.some(kw => 
    query.toLowerCase().includes(kw)
  );
  if (hasComplexKeyword) score += 0.3;

  // 3. Presença de múltiplas perguntas
  const questionCount = (query.match(/\?/g) || []).length;
  if (questionCount > 2) score += 0.2;
  else if (questionCount > 1) score += 0.1;

  // 4. Presença de código ou fórmulas
  const hasCode = /```|`[^`]+`|\$\$/.test(query);
  if (hasCode) score += 0.2;

  // Normalizar score (0-1)
  return Math.min(score, 1.0);
}
```

**Decisões Arquiteturais**:

1. **Heuristic-based**: Usa regras simples (rápido, sem custo de LLM)
2. **Multiple factors**: Combina vários sinais de complexidade
3. **Normalized score**: Retorna 0-1 (fácil de interpretar)

### `selectTier(complexity: number): string`

**Propósito**: Selecionar tier de LLM baseado em complexidade.

**Implementação**:

```typescript
function selectTier(complexity: number): string {
  if (complexity >= 0.7) {
    return "gpt-4o";           // Mais caro, mais inteligente
  } else if (complexity >= 0.4) {
    return "gpt-4o-mini";      // Meio termo
  } else {
    return "gpt-3.5-turbo";    // Mais barato, mais rápido
  }
}
```

**Thresholds**:

| Complexity | Tier | Cost (per 1M tokens) | Use Case |
|-----------|------|---------------------|----------|
| 0.7-1.0 | gpt-4o | $5.00 | Análises complexas, código, raciocínio multi-step |
| 0.4-0.7 | gpt-4o-mini | $0.15 | Perguntas médias, explicações |
| 0.0-0.4 | gpt-3.5-turbo | $0.50 | Perguntas simples, conversação casual |

**Decisões Arquiteturais**:

1. **3-tier system**: Balanceia custo vs qualidade
2. **Conservative thresholds**: Prefere tier superior em caso de dúvida
3. **Cost optimization**: 83% de redução de custo vs usar sempre gpt-4o

---

## Layer 4: Execution Layer

### Propósito

Executar chamadas para LLM (OpenAI API).

### Arquivo Principal

`server/_core/llm.ts`

### `server/_core/llm.ts`

**Função Principal**: `invokeLLM(params: LLMParams): Promise<LLMResponse>`

**Código Explicado**:

```typescript
import { OPENAI_API_KEY } from "./env";

export async function invokeLLM(params: LLMParams): Promise<LLMResponse> {
  const {
    messages,
    model = "gpt-4o-mini",
    temperature = 0.7,
    max_tokens = 4096,
    tools,
    tool_choice
  } = params;

  // 1. Validar API key
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  // 2. Fazer requisição para OpenAI
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens,
      tools,
      tool_choice
    })
  });

  // 3. Verificar erros
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI API error: ${error.error.message}`);
  }

  // 4. Parsear resposta
  const data = await response.json();
  
  return {
    content: data.choices[0].message.content,
    tokens: data.usage.total_tokens,
    model: data.model,
    finish_reason: data.choices[0].finish_reason
  };
}
```

**Decisões Arquiteturais**:

1. **Direct API call**: Usa fetch em vez de SDK (mais controle)
2. **Error handling**: Captura e propaga erros da OpenAI
3. **Token tracking**: Retorna usage para cálculo de custo
4. **Flexible parameters**: Suporta tools (function calling)

### Cálculo de Custo

```typescript
function calculateCost(tier: string, tokens: number): number {
  const COST_PER_1M_TOKENS = {
    "gpt-4o": 5.00,
    "gpt-4o-mini": 0.15,
    "gpt-3.5-turbo": 0.50
  };

  const costPer1M = COST_PER_1M_TOKENS[tier];
  return (tokens / 1_000_000) * costPer1M;
}
```

---

## Próxima Parte

Continua em `GUIA-02-DOCUMENTACAO-TECNICA-PARTE-2.md`:
- Layer 5: Knowledge Layer
- Layer 6: Quality Layer
- Layer 7: Learning Layer
- Database Schema
- tRPC Routers

---

**Autor**: Manus AI  
**Data**: 2026-02-20  
**Versão**: 1.0
