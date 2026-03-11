/**
 * MOTHER v75.8 - Scientific Research Module (Ciclo 58 Enhanced)
 *
 * Implements autonomous web search and scientific literature retrieval.
 *
 * Scientific basis:
 * - ReAct (Yao et al., ICLR 2023): Reason + Act paradigm for tool-augmented LLMs
 * - WebGPT (Nakano et al., 2021): LLM with web browsing capability
 * - Toolformer (Schick et al., NeurIPS 2023): Self-supervised tool use
 * - RAG (Lewis et al., NeurIPS 2020): Retrieval-Augmented Generation
 * - Semantic Scholar (AI2, 2015): 200M+ papers, citation-ranked quality signal
 *
 * Architecture (5 parallel sources):
 * 1. Query classification: detect if query requires external knowledge
 * 2. Source selection: arXiv, Semantic Scholar, DuckDuckGo, Wikipedia, OpenAI Search
 * 3. Citation-ranked quality filtering: Semantic Scholar papers sorted by citation count
 * 4. Result synthesis: extract relevant information and cite sources
 *
 * Ciclo 58 additions:
 * - Semantic Scholar API as 5th parallel source (citation-ranked, peer-validated)
 * - Citation count as quality signal for faithfulness improvement
 */

import { invokeLLM } from '../_core/llm';
import { ENV } from '../_core/env';

export interface ResearchResult {
  query: string;
  sources: ResearchSource[];
  synthesis: string;
  usedSearch: boolean;
}

export interface ResearchSource {
  title: string;
  url: string;
  snippet: string;
  type: 'arxiv' | 'web' | 'wikipedia' | 'annas_archive' | 'semantic_scholar';
  citationCount?: number;  // Semantic Scholar: citation count for quality ranking
  year?: number;           // Semantic Scholar: publication year
}

/**
 * Detect if a query requires scientific research / web search
 * Based on keyword analysis and query intent classification
 */
export function requiresResearch(query: string): boolean {
  const researchIndicators = [
    // Scientific research triggers
    /pesquis[ae]/i,
    /busca.*cient[íi]fica/i,
    /estado da arte/i,
    /literatura.*cient[íi]fica/i,
    /artigo.*cient[íi]fico/i,
    /paper.*recente/i,
    /publica[çc][ãa]o/i,
    /arxiv/i,
    /anna.*archive/i,
    /search.*web/i,
    /buscar.*internet/i,
    /pesquisar.*online/i,
    /o que.*aconteceu/i,
    /not[íi]cia/i,
    /atual.*mente/i,
    /recente.*mente/i,
    /[úu]ltimo.*ano/i,
    /2024|2025|2026/,
    /aprenda.*nivel.*god/i,
    /aprenda.*tudo/i,
    /pesquise/i,
    /investigue/i,
    /descubra/i,
    // C274 (Conselho V102): Detect outdated knowledge queries — trigger real-time web search
    // Scientific basis: CRAG (Yan et al., arXiv:2401.15884, 2024): corrective retrieval for stale knowledge
    //   Temporal Knowledge Cutoff (Dhingra et al., arXiv:2203.01520, 2022): LLMs have knowledge cutoffs
    //   Web-Augmented LLMs (Nakano et al., arXiv:2112.09332, 2021): real-time search improves accuracy
    // Outdated knowledge patterns (Portuguese + English)
    /pre[çc]o.*atual/i,       // current price
    /cota[çc][ãa]o.*hoje/i,   // today's quote
    /valor.*atual/i,           // current value
    /hoje.*[0-9]{4}/i,         // today + year
    /agora.*mesmo/i,           // right now
    /tempo.*real/i,            // real-time
    /em.*tempo.*real/i,        // in real-time
    /ao.*vivo/i,               // live
    /breaking.*news/i,         // breaking news
    /latest.*news/i,           // latest news
    /current.*price/i,         // current price (English)
    /today.*price/i,           // today's price (English)
    /live.*data/i,             // live data (English)
    /real.*time.*data/i,       // real-time data (English)
    /o que.*est[aá].*acontecendo/i, // what is happening
    /quais.*s[aã]o.*as.*[úu]ltimas/i, // what are the latest
    /novidades.*sobre/i,       // news about
    /atualiza[çc][ãa]o.*sobre/i, // update about
    /quando.*foi.*lan[çc]ado/i, // when was launched (recent products)
    /lan[çc]amento.*recente/i, // recent launch
    /nova.*vers[aã]o/i,        // new version
    /[úu]ltima.*vers[aã]o/i,   // latest version
    /release.*notes/i,         // release notes
    /changelog/i,              // changelog
  ];

  return researchIndicators.some(pattern => pattern.test(query));
}

/**
 * Extract English keywords from a Portuguese query for better arXiv search
 * arXiv indexes primarily in English, so we extract technical terms
 */
function extractEnglishKeywords(query: string): string {
  // Extract technical terms that are likely already in English
  const technicalTerms = query.match(/\b[A-Z][a-zA-Z]+(?:[A-Z][a-zA-Z]+)+\b|\b(?:MemGPT|ReAct|LLM|GPT|BERT|RAG|RLHF|CoT|ToT|LoRA|PEFT|SFT|DPO|PPO|GRPO|MoE|SSM|Mamba|Transformer|Attention|Embedding|Vector|Neural|Deep|Machine|Learning|Reasoning|Memory|Agent|Cognitive|Autonomous|Reinforcement|Supervised|Unsupervised|Generative|Diffusion|Multimodal|Benchmark|Evaluation|Fine-tuning|Pre-training|Inference|Alignment|Safety|Hallucination|Grounding|Planning|Tool|Search|Retrieval|Knowledge|Graph|Chain|Thought|Prompt|Few-shot|Zero-shot|In-context|Instruction|RLHF|Constitutional|Self-play|Self-improvement|Meta-learning|Continual|Lifelong|Episodic|Semantic|Procedural|Working|Long-term|Short-term|Attention|Transformer|Encoder|Decoder|Autoregressive|Masked|Causal|Cross|Self|Multi-head|Flash|Sparse|Mixture|Expert|Router|Token|Vocabulary|Tokenizer|BPE|SentencePiece|Byte|Pair|Encoding|Decoding|Beam|Greedy|Sampling|Temperature|Top-k|Top-p|Nucleus|Repetition|Penalty|Length|Bias|Logit|Softmax|Sigmoid|ReLU|GELU|LayerNorm|RMSNorm|Dropout|Residual|Skip|Connection|Feedforward|MLP|Linear|Projection|Embedding|Positional|Rotary|ALiBi|RoPE|Sinusoidal|Learned|Absolute|Relative|Darwin|Gödel|Gödelian|Kolmogorov|Solomonoff|AIXI|AGI|ASI|Superintelligence|Consciousness|Sentience|Qualia|Emergence|Complexity|Compression|Description|Length|MDL|Minimum|Occam|Razor|Prior|Posterior|Bayesian|Frequentist|Causal|Counterfactual|Intervention|Observation|Confounder|Instrumental|Variable|Regression|Discontinuity|Difference|Differences|Synthetic|Control|Propensity|Score|Matching|Weighting|Doubly|Robust|Semiparametric|Nonparametric|Kernel|Gaussian|Process|Variational|Autoencoder|GAN|Flow|Normalizing|Score|Matching|Diffusion|Denoising|DDPM|DDIM|Stable|Latent|Consistency|Distillation|Guidance|Classifier|Free|Guidance|CFG|ControlNet|LoRA|DreamBooth|Textual|Inversion|Prompt|Tuning|Adapter|Prefix|Soft|Hard|Discrete|Continuous|Gradient|Descent|Adam|AdamW|SGD|Momentum|Nesterov|Adagrad|RMSprop|LAMB|LARS|Cosine|Linear|Warmup|Decay|Schedule|Learning|Rate|Batch|Micro|Gradient|Accumulation|Checkpointing|Mixed|Precision|BF16|FP16|FP32|INT8|INT4|Quantization|Pruning|Distillation|Compression|Efficient|Inference|Serving|Deployment|Latency|Throughput|Memory|Bandwidth|Compute|FLOPs|Parameters|Weights|Activations|KV|Cache|PagedAttention|vLLM|TensorRT|ONNX|TorchScript|Triton|CUDA|ROCm|TPU|IPU|NPU|Accelerator|Hardware|Software|Co-design|Optimization|Compilation|JIT|AOT|Tracing|Symbolic|Execution|Verification|Formal|Methods|Type|System|Dependent|Linear|Session|Effect|Monad|Functor|Applicative|Traversable|Foldable|Monoid|Semigroup|Category|Theory|Topos|Sheaf|Fibration|Adjunction|Limit|Colimit|Kan|Extension|Yoneda|Lemma|Curry|Howard|Correspondence|Propositions|Types|Proofs|Programs|Curry|Howard|Lambek|Isomorphism|BHK|Interpretation|Realizability|Dialectica|Interpretation|Forcing|Sheaf|Model|Kripke|Frame|Possible|World|Semantics|Denotational|Operational|Axiomatic|Hoare|Logic|Separation|Logic|Concurrent|Separation|Logic|Iris|Coq|Lean|Agda|Idris|Haskell|OCaml|Rust|Go|Python|JavaScript|TypeScript|C|C\+\+|Java|Scala|Kotlin|Swift|Julia|R|MATLAB|Mathematica|Wolfram|Maple|Sage|NumPy|SciPy|Pandas|Matplotlib|Seaborn|Plotly|Bokeh|Altair|Vega|D3|React|Vue|Angular|Svelte|Next|Nuxt|Remix|Astro|SvelteKit|Solid|Qwik|Fresh|Deno|Bun|Node|Express|Fastify|Hono|Elysia|Hapi|Koa|Nest|Adonis|Laravel|Django|Flask|FastAPI|Rails|Spring|Quarkus|Micronaut|Helidon|Vert|Akka|Play|Lagom|Finatra|Finagle|Thrift|gRPC|REST|GraphQL|WebSocket|SSE|WebRTC|HTTP|HTTPS|TCP|UDP|QUIC|HTTP3|TLS|SSL|mTLS|JWT|OAuth|OIDC|SAML|LDAP|Kerberos|RADIUS|TACACS|DIAMETER|RADIUS|EAP|802\.1X|WPA|WPA2|WPA3|AES|RSA|ECC|ECDSA|ECDH|X25519|Ed25519|ChaCha20|Poly1305|SHA|MD5|HMAC|PBKDF2|Argon2|bcrypt|scrypt|HKDF|PRNG|CSPRNG|HSM|TPM|SGX|TrustZone|SEV|TDX|CCA|Confidential|Computing|Homomorphic|Encryption|Secure|Multi-party|Computation|Zero|Knowledge|Proof|ZKP|SNARK|STARK|Bulletproof|Groth16|PLONK|FRI|STARKs|SNARKs|Rollup|ZK|Optimistic|Rollup|Layer|2|Sidechain|State|Channel|Payment|Channel|Lightning|Network|Plasma|Validium|Volition|Ethereum|Bitcoin|Solana|Avalanche|Polkadot|Cosmos|Near|Algorand|Cardano|Tezos|Filecoin|IPFS|Libp2p|Substrate|Ink|Solidity|Vyper|Move|Rust|Cairo|Noir|Circom|Halo2|Bellman|Arkworks|Gnark|Snarkjs|Circomlib|Openzeppelin|Hardhat|Foundry|Truffle|Brownie|Anchor|Seahorse|Neon|Helius|Metaplex|Candy|Machine|Bubblegum|Token|Metadata|Program|Library|SPL|ERC|20|721|1155|4626|2535|Diamond|Proxy|Beacon|Minimal|Clone|Create2|Assembly|Yul|Huff|Bytecode|ABI|Calldata|Memory|Storage|Stack|Gas|Opcode|EVM|SVM|MoveVM|WASM|JVM|CLR|LLVM|GCC|Clang|MSVC|ICC|PGO|LTO|BOLT|Propeller|AutoFDO|AFDO|BOLT|Propeller|AutoFDO|AFDO)\b/g);
  
  if (technicalTerms && technicalTerms.length > 0) {
    // Use technical terms as the search query
    const uniqueTerms = Array.from(new Set(technicalTerms)).slice(0, 5);
    return uniqueTerms.join(' ');
  }
  
  // Fallback: extract words that look like proper nouns or technical terms
  // Filter out noise words that are common in Portuguese research queries
  const noiseWords = new Set(['PDFs', 'PDF', 'papers', 'paper', 'arXiv', 'arxiv', 'indexe', 'indexar',
    'indexado', 'indexados', 'banco', 'dados', 'texto', 'completo', 'sobre', 'para', 'com',
    'seu', 'sua', 'meu', 'minha', 'este', 'esta', 'esse', 'essa', 'isso', 'aqui', 'onde',
    'como', 'quando', 'porque', 'pois', 'mais', 'menos', 'muito', 'pouco', 'todo', 'toda',
    'todos', 'todas', 'cada', 'outro', 'outra', 'outros', 'outras', 'mesmo', 'mesma',
    'adicione', 'adicionar', 'busque', 'buscar', 'pesquise', 'pesquisar', 'encontre',
    'encontrar', 'liste', 'listar', 'mostre', 'mostrar', 'explique', 'explicar']);
  const words = query.split(/\s+/).filter(w => w.length > 3 && !noiseWords.has(w));
  const englishLike = words.filter(w => !/[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]/.test(w));
  return englishLike.slice(0, 6).join(' ') || query.slice(0, 100);
}

/**
 * Search Semantic Scholar for high-citation academic papers.
 * Scientific basis: Semantic Scholar (AI2, 2015) — 200M+ papers, free API, no key required.
 * Advantage over arXiv: citation count enables quality ranking (high-citation = peer-validated).
 * API: https://api.semanticscholar.org/graph/v1/paper/search
 *
 * Ciclo 58 addition: Provides citation-ranked results for better faithfulness.
 */
async function searchSemanticScholar(query: string, maxResults = 3): Promise<ResearchSource[]> {
  try {
    const searchQuery = extractEnglishKeywords(query);
    const encodedQuery = encodeURIComponent(searchQuery);
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodedQuery}&limit=${maxResults}&fields=title,abstract,year,citationCount,externalIds,url`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'MOTHER-Scientific-Agent/75.8',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return [];

    const data = await response.json() as {
      data?: Array<{
        paperId: string;
        title: string;
        abstract?: string;
        year?: number;
        citationCount?: number;
        externalIds?: { ArXiv?: string; DOI?: string };
        url?: string;
      }>;
    };

    const papers = data.data || [];
    const sources: ResearchSource[] = [];

    for (const paper of papers.slice(0, maxResults)) {
      if (!paper.title) continue;

      // Prefer arXiv URL if available, otherwise use Semantic Scholar URL
      const paperUrl = paper.externalIds?.ArXiv
        ? `https://arxiv.org/abs/${paper.externalIds.ArXiv}`
        : (paper.url || `https://www.semanticscholar.org/paper/${paper.paperId}`);

      const citationLabel = paper.citationCount !== undefined
        ? ` [${paper.citationCount} citations]`
        : '';

      sources.push({
        title: `[Semantic Scholar ${paper.year || ''}${citationLabel}] ${paper.title}`,
        url: paperUrl,
        snippet: (paper.abstract || '').slice(0, 400) + ((paper.abstract?.length || 0) > 400 ? '...' : ''),
        type: 'semantic_scholar',
        citationCount: paper.citationCount,
        year: paper.year,
      });
    }

    // Sort by citation count (highest first) for quality ranking
    sources.sort((a, b) => (b.citationCount || 0) - (a.citationCount || 0));

    console.log(`[Research] Semantic Scholar: ${sources.length} papers found for "${searchQuery.slice(0, 50)}"`);
    return sources;
  } catch (error) {
    console.error('[Research] Semantic Scholar search failed:', error);
    return [];
  }
}

/**
 * Search arXiv for scientific papers
 * API: https://arxiv.org/help/api/user-manual
 */
async function searchArxiv(query: string, maxResults = 3): Promise<ResearchSource[]> {
  try {
    // arXiv indexes primarily in English - extract English keywords
    const searchQuery = extractEnglishKeywords(query);
    console.log(`[Research] arXiv search query: "${searchQuery}" (from: "${query.slice(0, 50)}...")`);
    const encodedQuery = encodeURIComponent(searchQuery);
    const url = `https://export.arxiv.org/api/query?search_query=all:${encodedQuery}&start=0&max_results=${maxResults}&sortBy=relevance&sortOrder=descending`;
    
    const response = await fetch(url, {
      headers: { 'User-Agent': 'MOTHER-Scientific-Agent/54.0' },
      signal: AbortSignal.timeout(8000),
    });
    
    if (!response.ok) return [];
    
    const xml = await response.text();
    const sources: ResearchSource[] = [];
    
    // Parse XML entries
    const entries = xml.match(/<entry>([\s\S]*?)<\/entry>/g) || [];
    for (const entry of entries.slice(0, maxResults)) {
      const title = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim().replace(/\s+/g, ' ') || '';
      const summary = entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.trim().replace(/\s+/g, ' ') || '';
      const id = entry.match(/<id>([\s\S]*?)<\/id>/)?.[1]?.trim() || '';
      const published = entry.match(/<published>([\s\S]*?)<\/published>/)?.[1]?.trim().split('T')[0] || '';
      
      if (title && id) {
        sources.push({
          title: `[arXiv ${published}] ${title}`,
          url: id,
          snippet: summary.slice(0, 400) + (summary.length > 400 ? '...' : ''),
          type: 'arxiv',
        });
      }
    }
    
    return sources;
  } catch (error) {
    console.error('[Research] arXiv search failed:', error);
    return [];
  }
}

/**
 * Search Wikipedia for factual information
 * API: https://en.wikipedia.org/w/api.php
 */
async function searchWikipedia(query: string): Promise<ResearchSource[]> {
  try {
    // Try Portuguese first, then English
    const langs = ['pt', 'en'];
    const sources: ResearchSource[] = [];
    
    for (const lang of langs) {
      const encodedQuery = encodeURIComponent(query);
      const url = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodedQuery}&format=json&srlimit=2&srprop=snippet`;
      
      const response = await fetch(url, {
        headers: { 'User-Agent': 'MOTHER-Scientific-Agent/54.0' },
        signal: AbortSignal.timeout(5000),
      });
      
      if (!response.ok) continue;
      
      const data = await response.json() as any;
      const results = data?.query?.search || [];
      
      for (const result of results.slice(0, 2)) {
        sources.push({
          title: `[Wikipedia/${lang.toUpperCase()}] ${result.title}`,
          url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(result.title)}`,
          snippet: result.snippet?.replace(/<[^>]*>/g, '') || '',
          type: 'wikipedia',
        });
      }
      
      if (sources.length >= 2) break;
    }
    
    return sources;
  } catch (error) {
    console.error('[Research] Wikipedia search failed:', error);
    return [];
  }
}

/**
 * Search DuckDuckGo Instant Answer API
 * No API key required, privacy-focused
 */
async function searchDuckDuckGo(query: string): Promise<ResearchSource[]> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1&skip_disambig=1`;
    
    const response = await fetch(url, {
      headers: { 'User-Agent': 'MOTHER-Scientific-Agent/54.0' },
      signal: AbortSignal.timeout(5000),
    });
    
    if (!response.ok) return [];
    
    const data = await response.json() as any;
    const sources: ResearchSource[] = [];
    
    // Abstract (main result)
    if (data.Abstract && data.AbstractURL) {
      sources.push({
        title: `[DuckDuckGo] ${data.Heading || query}`,
        url: data.AbstractURL,
        snippet: data.Abstract.slice(0, 500),
        type: 'web',
      });
    }
    
    // Related topics
    const topics = data.RelatedTopics || [];
    for (const topic of topics.slice(0, 2)) {
      if (topic.Text && topic.FirstURL) {
        sources.push({
          title: `[DuckDuckGo Related] ${topic.Text.slice(0, 80)}`,
          url: topic.FirstURL,
          snippet: topic.Text.slice(0, 300),
          type: 'web',
        });
      }
    }
    
    return sources;
  } catch (error) {
    console.error('[Research] DuckDuckGo search failed:', error);
    return [];
  }
}

/**
 * Use OpenAI with web_search tool (gpt-4o-search-preview)
 * This is the most powerful option - uses OpenAI's built-in web search
 */
async function searchWithOpenAI(query: string): Promise<string> {
  try {
    const apiKey = ENV.openaiApiKey;
    if (!apiKey) return '';
    
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        tools: [{ type: 'web_search_preview' }],
        input: `Pesquise informações científicas e atualizadas sobre: ${query}. 
        Foque em: estado da arte, papers recentes, fontes confiáveis.
        Responda em português com citações das fontes.`,
      }),
      signal: AbortSignal.timeout(30000),
    });
    
    if (!response.ok) {
      console.error('[Research] OpenAI search failed:', response.status, await response.text());
      return '';
    }
    
    const data = await response.json() as any;
    
    // Extract text from the response
    const outputItems = data.output || [];
    for (const item of outputItems) {
      if (item.type === 'message') {
        const content = item.content || [];
        for (const c of content) {
          if (c.type === 'output_text' && c.text) {
            return c.text;
          }
        }
      }
    }
    
    return '';
  } catch (error) {
    console.error('[Research] OpenAI web search failed:', error);
    return '';
  }
}

/**
 * Main research function - orchestrates all search sources
 * Returns synthesized research results with citations
 * 
 * v55.0: After finding arXiv papers, triggers async ingestion pipeline:
 * PDF download → text extraction → chunking → embedding → DB indexing
 */
export async function conductResearch(query: string): Promise<ResearchResult> {
  console.log(`[Research] Conducting research for: ${query.slice(0, 100)}`);
  
  const sources: ResearchSource[] = [];
  let openAISearchResult = '';
  
  // Run searches in parallel for speed (5 sources: arXiv, Semantic Scholar, Wikipedia, DuckDuckGo, OpenAI)
  // Ciclo 58: Added Semantic Scholar (AI2) for citation-ranked peer-validated papers
  const [arxivResults, wikiResults, ddgResults, openAIResult, semanticScholarResults] = await Promise.allSettled([
    searchArxiv(query),
    searchWikipedia(query),
    searchDuckDuckGo(query),
    searchWithOpenAI(query),
    searchSemanticScholar(query),  // NEW: citation-ranked academic papers
  ]);
  
  if (arxivResults.status === 'fulfilled') sources.push(...arxivResults.value);
  if (wikiResults.status === 'fulfilled') sources.push(...wikiResults.value);
  if (ddgResults.status === 'fulfilled') sources.push(...ddgResults.value);
  if (openAIResult.status === 'fulfilled') openAISearchResult = openAIResult.value;
  // Semantic Scholar: add citation-ranked papers (dedup with arXiv by URL)
  if (semanticScholarResults.status === 'fulfilled') {
    const existingUrls = new Set(sources.map(s => s.url));
    const newPapers = semanticScholarResults.value.filter(s => !existingUrls.has(s.url));
    sources.push(...newPapers);
  }
  
  // v55.0 + Ciclo 58: Trigger async paper ingestion for arXiv + Semantic Scholar papers
  // This runs in background — does NOT block the response to the user
  // Pipeline: arXiv metadata → PDF download → text extraction → chunking → embedding → DB
  const arxivSources = sources.filter(s =>
    s.type === 'arxiv' ||
    (s.type === 'semantic_scholar' && s.url.includes('arxiv.org'))
  );
  if (arxivSources.length > 0) {
    const arxivUrls = arxivSources.map(s => s.url);
    console.log(`[Research] Triggering async paper ingestion for ${arxivUrls.length} arXiv papers`);
    import('./paper-ingest').then(({ ingestPapersFromSearch }) => {
      ingestPapersFromSearch(arxivUrls).catch(err => {
        console.error('[Research] Background paper ingestion failed:', err);
      });
    }).catch(err => {
      console.error('[Research] Failed to import paper-ingest module:', err);
    });
  }
  
  console.log(`[Research] Found ${sources.length} sources, OpenAI search: ${openAISearchResult ? 'yes' : 'no'}`);
  
  // If OpenAI web search returned results, use them as primary synthesis
  if (openAISearchResult) {
    return {
      query,
      sources,
      synthesis: openAISearchResult,
      usedSearch: true,
    };
  }
  
  // Otherwise synthesize from collected sources
  if (sources.length === 0) {
    return {
      query,
      sources: [],
      synthesis: '',
      usedSearch: false,
    };
  }
  
  // Build synthesis prompt
  const sourcesText = sources
    .map((s, i) => `[${i+1}] ${s.title}\nURL: ${s.url}\nResumo: ${s.snippet}`)
    .join('\n\n');
  
  const synthesisPrompt = `Com base nas seguintes fontes científicas encontradas, sintetize as informações mais relevantes para responder à pergunta: "${query}"

FONTES ENCONTRADAS:
${sourcesText}

Sintetize em português, citando as fontes com [número]. Seja preciso e científico.`;
  
  try {
    const llmResult = await invokeLLM({
      messages: [
        { role: 'system', content: 'Você é um assistente de pesquisa científica. Sintetize as fontes de forma precisa e cite-as.' },
        { role: 'user', content: synthesisPrompt },
      ],
      model: 'gpt-4o-mini',
      maxTokens: 1000,
    });
    
    const synthesis = (llmResult.choices[0]?.message?.content as string) || sourcesText;
    
    return {
      query,
      sources,
      synthesis,
      usedSearch: true,
    };
  } catch (error) {
    return {
      query,
      sources,
      synthesis: sourcesText,
      usedSearch: true,
    };
  }
}
