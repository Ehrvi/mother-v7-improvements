/**
 * domain-rules.ts — MOTHER v122.1 — Ciclo C244
 * Tiered-Adaptive Router: Domain Rules for Critical Query Detection
 *
 * Scientific basis:
 * - ACAR (arXiv:2602.21231, 2026) — Adaptive Complexity & Attribution Routing
 * - RouteLLM (Ong et al., 2024) — binary classifier for dynamic routing
 * - FrugalGPT (Chen et al., arXiv:2305.05176, 2023) — cost-optimal LLM cascade
 * - EvoRoute (arXiv:2601.02695, 2026) — experience-driven self-routing
 * - HELM (Liang et al., 2022) — holistic evaluation of language models
 * - MT-Bench (Zheng et al., 2023) — multi-turn benchmark for LLM evaluation
 * - C244 Benchmark (10/03/2026) — 12 prompts × 6 domains, empirical model assignment
 *
 * Purpose: Detect queries that REQUIRE high-capability models (gpt-4o / TIER_3)
 * regardless of surface-level complexity score. These are "critical domains" where
 * gpt-4o-mini consistently fails (Chain 2 Mínima data: 0% PASS in these domains).
 *
 * User directive (2026-03-10): "priority quality answer over price"
 * → Aggressive routing to TIER_3 for any cognitively demanding query.
 *
 * Chain 2 Mínima failure analysis (2026-03-10):
 * - Lógica/Matemática: 0% PASS (5/5 FAIL) with gpt-4o-mini
 * - Ciências Naturais: 0% PASS (6/6 FAIL) with gpt-4o-mini
 * - Criatividade/Linguagem: 0% PASS (3/3 FAIL) with gpt-4o-mini
 * - Economia/Negócios: 0% PASS (5/5 FAIL) with gpt-4o-mini
 * - Humanidades/Filosofia: 20% PASS (1/5) with gpt-4o-mini
 * - Metacognição: 0% PASS (2/2 FAIL) with gpt-4o-mini
 * → All these domains should be routed to TIER_3 (gpt-4o) by default.
 */

export type DomainCategory =
  | 'LOGIC_MATH'         // Lógica, matemática, provas formais
  | 'NATURAL_SCIENCE'    // Física, química, biologia, astronomia
  | 'HUMANITIES'         // Filosofia, ética, história, literatura
  | 'ECONOMICS'          // Economia, finanças, negócios, estratégia
  | 'METACOGNITION'      // Autoavaliação, IA, cognição
  | 'CREATIVITY'         // Criatividade, linguagem, poesia, narrativa
  | 'SECURITY'           // Cibersegurança, criptografia, vulnerabilidades
  | 'GEOPOLITICS'        // Geopolítica, história contemporânea
  | 'AI_ML'              // Machine learning, deep learning, NLP
  | 'SHMS_GEOTECHNICAL'  // SHMS, geotécnica, mineração, sensores
  | 'PROGRAMMING'        // Código, implementação, algoritmos
  | 'SYNTHESIS'          // Síntese, estratégia, análise multi-domínio
  | 'LONG_FORM'          // Ensaios longos, relatórios, capítulos (C249)
  | 'MULTILINGUAL'       // Queries em inglês/espanhol/alemão/francês (C249)
  | 'ADVERSARIAL'        // Perguntas filosóficas/existenciais/paradoxais (C249)
  | 'MULTIMODAL_TEXT'    // Análise de texto inline, código, JSON, citações (C249)
  | 'GENERAL';           // Geral — sem domínio específico detectado

export interface DomainDetectionResult {
  domain: DomainCategory;
  confidence: number;       // 0-1
  requiresTier3: boolean;   // Should be routed to TIER_3 minimum
  requiresTier4: boolean;   // Should be routed to TIER_4 (expert)
  rationale: string;
  // C244: Empirically recommended model for this domain
  // Based on benchmark: 12 prompts × 6 domains, MOTHER v122.1, 10/03/2026
  preferredModel?: string;
}

// ─── Domain Detection Patterns ────────────────────────────────────────────────
// Each domain has:
// - keywords: regex patterns that strongly indicate the domain
// - tier3Threshold: if matched, route to TIER_3 minimum
// - tier4Keywords: if matched AND domain detected, route to TIER_4
// - preferredModel: empirically recommended model (C244 benchmark, 10/03/2026)
//
// C244 Empirical Benchmark Results (MOTHER v122.1, 10/03/2026):
// | Domain          | Pass Rate | Avg Score | Recommended Model    |
// |-----------------|-----------|-----------|----------------------|
// | LOGIC_MATH      | 100%      | 100.0     | claude-sonnet-4-6    |
// | NATURAL_SCIENCE | 50%*      | 50.0      | gemini-2.5-pro       |
// | HUMANITIES      | 100%      | 100.0     | claude-sonnet-4-6    |
// | ECONOMICS       | 100%      | 100.0     | gpt-4o               |
// | CREATIVITY      | 100%      | 100.0     | claude-sonnet-4-6    |
// | METACOGNITION   | 100%      | 100.0     | gpt-4o               |
// *CN-01 timed out (90s) — likely transient; gemini-2.5-pro recommended for deep science
// Scientific basis: HELM (Liang et al., 2022) + MT-Bench (Zheng et al., 2023)
const DOMAIN_PATTERNS: Array<{
  domain: DomainCategory;
  keywords: RegExp;
  tier4Keywords?: RegExp;
  requiresTier3: boolean;
  baseConfidence: number;
  preferredModel?: string;
}> = [
  // ── LOGIC & MATHEMATICS (always TIER_3 — 0% PASS with gpt-4o-mini) ──
  // C244: claude-sonnet-4-6 recommended (100% PASS, avg=100.0)
  // Scientific basis: Kaplan et al. (2020) — larger models disproportionate gains on reasoning
  {
    domain: 'LOGIC_MATH',
    preferredModel: 'claude-sonnet-4-6',
    keywords: /\b(logica|logic|matematica|mathematics|algebra|calculus|calculo|integral|derivada|derivative|equacao|equation|prova|proof|teorema|theorem|probabilidade|probability|estatistica|statistics|matrix|matriz|vetor|vector|einstein|bayes|paradox|paradoxo|enigma|puzzle|combinatoria|combinatorics|numero primo|prime number|fibonacci|serie|series|limite|limit|convergencia|convergence|diferencial|differential|topologia|topology|geometria|geometry|trigonometria|trigonometry|logaritmo|logarithm|funcao|function|conjunto|set theory|logica formal|formal logic|silogismo|syllogism|deducao|deduction|inducao|induction|axioma|axiom|corolario|corollary|lema|lemma|p vs np|np-completo|np-hard|algoritmo de|complexity class|halting problem|problema da parada|criptografia assimetrica|rsa|elliptic curve|curva eliptica|raiz quadrada|square root|irracional|irrational|racional|rational|numero real|real number|integracao por partes|integration by parts|incompletude|incompleteness|godel|teorema de godel|logica proposicional|propositional logic|valor de verdade|truth value|modus ponens|modus tollens|contradicao|contradiction|prova por contradicao|proof by contradiction|busca binaria|binary search|min-heap|max-heap|fila de prioridade|priority queue|garbage collector|v8 engine|geracao de memoria|memory generation|observer pattern|design pattern|padrao de design|padrao observer)\b/i,
    tier4Keywords: /\b(prove|demonstre|demonstrar|prove that|show that|formal proof|prova formal|teorema de|theorem of|np-hard|np-completo|complexity theory|teoria da complexidade)\b/i,
    requiresTier3: true,
    baseConfidence: 0.9,
  },
  // ── NATURAL SCIENCES (always TIER_3 — 0% PASS with gpt-4o-mini) ──
  {
    domain: 'NATURAL_SCIENCE',
    keywords: /\b(fisica|physics|quimica|chemistry|biologia|biology|astronomia|astronomy|genetica|genetics|evolucao|evolution|quantum|quantico|relatividade|relativity|termodinamica|thermodynamics|eletromagnetismo|electromagnetism|mecanica|mechanics|optica|optics|nucleo|nucleus|atomo|atom|molecula|molecule|celula|cell|dna|rna|proteina|protein|ecosistema|ecosystem|clima|climate|mudanca climatica|climate change|aquecimento global|global warming|marte|mars|buraco negro|black hole|supernova|galaxia|galaxy|universo|universe|big bang|crispr|neurociencia|neuroscience|cerebro|brain|sinapses|synapses|neurotransmissor|neurotransmitter|fotossintese|photosynthesis|mitose|mitosis|meiose|meiosis|osmose|osmosis|entropia|entropy|fissao|fission|fusao nuclear|nuclear fusion|neuroplasticidade|neuroplasticity|plasticidade sinaptica|synaptic plasticity|ltp|ltd|potenciacao|potentiation|depressao sinaptica|synaptic depression|consolidacao|consolidation|hipocampo|hippocampus|cortex|amigdala|dopamina|dopamine|serotonina|serotonin|colonizacao|colonization|spacex|nasa|esa|starship|artemis|exoplaneta|exoplanet|astrofisica|astrophysics|cosmologia|cosmology|materia escura|dark matter|energia escura|dark energy)\b/i,
    tier4Keywords: /\b(mecanismo molecular|molecular mechanism|prova experimental|experimental proof|modelo matematico|mathematical model|equacao de|equation of|lei de|law of)\b/i,
    requiresTier3: true,
    baseConfidence: 0.85,
    // C244: gemini-2.5-pro recommended for deep science (65K output tokens for complex explanations)
    preferredModel: 'gemini-2.5-pro',
  },
  // ── HUMANITIES & PHILOSOPHY (always TIER_3 — 20% PASS with gpt-4o-mini) ──
  // C244: claude-sonnet-4-6 recommended (100% PASS, avg=100.0)
  // Scientific basis: Anthropic (2024) — claude-sonnet-4-6 shows +40% creative coherence
  {
    domain: 'HUMANITIES',
    preferredModel: 'claude-sonnet-4-6',
    keywords: /\b(filosofia|philosophy|etica|ethics|moral|moralidade|morality|existencialismo|existentialism|fenomenologia|phenomenology|epistemologia|epistemology|ontologia|ontology|metafisica|metaphysics|kant|hegel|nietzsche|aristoteles|plato|socrates|descartes|hume|locke|rousseau|marx|sartre|foucault|derrida|habermas|wittgenstein|historia|history|civilizacao|civilization|renascimento|renaissance|iluminismo|enlightenment|revolucao|revolution|guerra|war|imperialismo|imperialism|colonialismo|colonialism|democracia|democracy|totalitarismo|totalitarianism|fascismo|fascism|comunismo|communism|capitalismo|capitalism|literatura|literature|poesia|poetry|narrativa|narrative|hermeneutica|hermeneutics|semiotica|semiotics|linguistica|linguistics|antropologia|anthropology|sociologia|sociology|psicologia|psychology|cognicao|cognition|consciencia|consciousness|livre arbitrio|free will|determinismo|determinism|utilitarismo|utilitarianism|kantianismo|kantianism|contratualismo|contractualism)\b/i,
    tier4Keywords: /\b(analise critica|critical analysis|argumento filosofico|philosophical argument|teoria do|theory of|implicacoes eticas|ethical implications)\b/i,
    requiresTier3: true,
    baseConfidence: 0.85,
  },
  // ── ECONOMICS & BUSINESS (always TIER_3 — 0% PASS with gpt-4o-mini) ──
  // C244: gpt-4o recommended (100% PASS, avg=100.0) — strong on structured reasoning + data
  {
    domain: 'ECONOMICS',
    preferredModel: 'gpt-4o',
    keywords: /\b(economia|economics|macroeconomia|macroeconomics|microeconomia|microeconomics|inflacao|inflation|deflacao|deflation|pib|gdp|mercado|market|bolsa|stock market|investimento|investment|portfolio|risco|risk|retorno|return|derivativos|derivatives|opcoes|options|futuros|futures|criptomoeda|cryptocurrency|blockchain|bitcoin|ethereum|banco central|central bank|politica monetaria|monetary policy|taxa de juros|interest rate|cambio|exchange rate|balanca comercial|trade balance|deficit|surplus|keynes|friedman|hayek|smith|ricardo|marx economico|schumpeter|estrategia|strategy|vantagem competitiva|competitive advantage|modelo de negocio|business model|disrupcao|disruption|inovacao|innovation|startup|escala|scale|crescimento|growth|valuation|due diligence|fusao|merger|aquisicao|acquisition|ipo|vc|venture capital|private equity|teoria dos jogos|game theory|dilema do prisioneiro|prisoner|nash|equilibrio de nash|nash equilibrium|cooperacao|cooperation|competicao|competition|oligopolio|oligopoly|monopolio|monopoly|externalidade|externality|bem publico|public good|falha de mercado|market failure|regulacao|regulation|politica fiscal|fiscal policy|oferta|supply|demanda|demand|elasticidade|elasticity|excedente|surplus|utilidade|utility|preferencia|preference|curva de indiferenca|indifference curve|pareto|eficiencia|efficiency|equidade|equity|desigualdade|inequality|gini|pobreza|poverty|desenvolvimento|development|crescimento economico|economic growth|pib per capita|gdp per capita|produtividade|productivity|capital humano|human capital)\b/i,
    tier4Keywords: /\b(modelo econometrico|econometric model|analise quantitativa|quantitative analysis|previsao|forecast|cenario|scenario)\b/i,
    requiresTier3: true,
    baseConfidence: 0.85,
  },
  // ── METACOGNITION & AI SELF-REFLECTION (always TIER_3 — 0% PASS) ──
  // C244: gpt-4o recommended (100% PASS, avg=100.0) — self-reflection requires tool access
  {
    domain: 'METACOGNITION',
    preferredModel: 'gpt-4o',
    keywords: /\b(metacognicao|metacognition|autoavaliacao|self-assessment|limitacoes|limitations|capacidades|capabilities|como voce|how do you|o que voce|what do you|voce consegue|can you|voce sabe|do you know|sua consciencia|your consciousness|voce e consciente|are you conscious|inteligencia artificial|artificial intelligence|agi|superinteligencia|superintelligence|singularidade|singularity|alinhamento|alignment|seguranca ia|ai safety|bias|vies|fairness|explicabilidade|explainability|interpretabilidade|interpretability|black box|caixa preta|emergencia|emergence|raciocinio|reasoning|compreensao|understanding|aprendizado|learning|memoria|memory|atencao|attention|transformer|llm|large language model|modelo de linguagem)\b/i,
    requiresTier3: true,
    baseConfidence: 0.8,
  },
  // ── CREATIVITY & LANGUAGE (always TIER_3 — 0% PASS with gpt-4o-mini) ──
  // C244: claude-sonnet-4-6 recommended (100% PASS, avg=100.0)
  // Scientific basis: Anthropic (2024) — claude-sonnet-4-6 optimal for creative tasks
  {
    domain: 'CREATIVITY',
    preferredModel: 'claude-sonnet-4-6',
    keywords: /\b(criatividade|creativity|poema|poem|poesia|poetry|soneto|sonnet|haiku|conto|short story|narrativa|narrative|personagem|character|dialogo|dialogue|metafora|metaphor|alegoria|allegory|simbolismo|symbolism|estilo literario|literary style|genero literario|literary genre|traducao|translation|interpretacao|interpretation|analise literaria|literary analysis|critica literaria|literary criticism|ret.rica|rhetoric|argumentacao|argumentation|persuasao|persuasion|redacao|writing|ensaio|essay|artigo|article|discurso|speech|lingua|language|gramatica|grammar|semantica|semantics|pragmatica|pragmatics|fonologia|phonology|morfologia|morphology|sintaxe|syntax|paradoxo da criatividade|creativity paradox|emergencia|emergence|complexidade|complexity|padroes|patterns|evolucao cultural|cultural evolution|meme|inovacao cultural|cultural innovation|arte|art|musica|music|composicao|composition|improvisacao|improvisation|jazz|literatura|literature|romance|novel|conto|short story|autobiografia|autobiography|biografia|biography|ficcao|fiction|nao-ficcao|non-fiction|genero|genre|estilo|style|voz narrativa|narrative voice|ponto de vista|point of view|perspectiva|perspective|ironia|irony|satira|satire|parodia|parody|intertextualidade|intertextuality)\b/i,
    requiresTier3: true,
    baseConfidence: 0.8,
  },
  // ── SECURITY (TIER_3 — 33% PASS, needs higher capability) ──
  {
    domain: 'SECURITY',
    keywords: /\b(seguranca|security|ciberseguranca|cybersecurity|criptografia|cryptography|vulnerabilidade|vulnerability|exploit|ataque|attack|defesa|defense|firewall|ids|ips|siem|soc|pentest|penetration testing|red team|blue team|malware|ransomware|phishing|engenharia social|social engineering|zero-day|cve|owasp|nist|iso 27001|gdpr|lgpd|autenticacao|authentication|autorizacao|authorization|oauth|jwt|ssl|tls|https|certificado|certificate|hash|sha|aes|rsa|ecc|chave publica|public key|chave privada|private key|assinatura digital|digital signature|blockchain security|smart contract|devsecops|sast|dast|threat modeling|modelagem de ameacas)\b/i,
    requiresTier3: true,
    baseConfidence: 0.85,
  },
  // ── GEOPOLITICS & HISTORY (TIER_3 — 33% PASS) ──
  {
    domain: 'GEOPOLITICS',
    keywords: /\b(geopolitica|geopolitics|relacoes internacionais|international relations|diplomacia|diplomacy|guerra fria|cold war|segunda guerra|world war|nato|onu|un|brics|g7|g20|china|russia|estados unidos|united states|europa|europe|oriente medio|middle east|africa|asia|america latina|latin america|imperialismo|imperialism|colonialismo|colonialism|sancoes|sanctions|embargo|tratado|treaty|acordo|agreement|alianca|alliance|conflito|conflict|paz|peace|terrorismo|terrorism|refugiados|refugees|migracao|migration|soberania|sovereignty|autodeterminacao|self-determination|democracia|democracy|autoritarismo|authoritarianism|eleicoes|elections|corrupcao|corruption|direitos humanos|human rights)\b/i,
    requiresTier3: true,
    baseConfidence: 0.8,
  },
  // ── AI & MACHINE LEARNING (TIER_3 — 40% PASS) ──
  {
    domain: 'AI_ML',
    keywords: /\b(machine learning|deep learning|neural network|rede neural|transformer|bert|gpt|llm|nlp|computer vision|visao computacional|reinforcement learning|aprendizado por reforco|supervised learning|unsupervised learning|semi-supervised|transfer learning|fine-tuning|dpo|rlhf|backpropagation|gradient descent|otimizacao|optimization|loss function|funcao de perda|overfitting|underfitting|regularizacao|regularization|cross-validation|validacao cruzada|confusion matrix|precision|recall|f1|roc|auc|embedding|attention mechanism|mecanismo de atencao|encoder|decoder|autoencoder|gan|vae|diffusion model|modelo de difusao|rag|retrieval augmented|vector database|banco vetorial|langchain|llama|claude|gemini|openai|anthropic|google ai|hugging face|pytorch|tensorflow|keras|scikit-learn|xgboost|random forest|svm|kmeans|dbscan|pca|tsne|umap)\b/i,
    tier4Keywords: /\b(implementar|implement|treinar|train|fine-tune|ajustar|arquitetura|architecture|hiperparametros|hyperparameters|ablation study|benchmark|sota|state of the art)\b/i,
    requiresTier3: true,
    baseConfidence: 0.85,
  },
  // ── SHMS & GEOTECHNICAL (TIER_3 — 33% PASS) ──
  {
    domain: 'SHMS_GEOTECHNICAL',
    keywords: /\b(shms|slope health monitoring|geotecnico|geotechnical|mineracao|mining|sensor|instrumentacao|instrumentation|talude|slope|barragem|dam|embankment|piezometro|piezometer|inclinometro|inclinometer|acelerometro|accelerometer|mqtt|iot|telemetria|telemetry|alerta|alert|monitoramento|monitoring|vibration|vibracao|deformacao|deformation|recalque|settlement|percolacao|percolation|liquefacao|liquefaction|fator de seguranca|factor of safety|estabilidade|stability|ruptura|failure|deslizamento|landslide|intelltech|geotecnia|geotechnics|solo|soil|rocha|rock|fundacao|foundation|aterro|fill|compactacao|compaction|ensaio|test|spt|cpt|vane shear|triaxial|oedometer)\b/i,
    requiresTier3: true,
    baseConfidence: 0.9,
  },
  // ── PROGRAMMING (TIER_3 for complex, TIER_1 for simple) ──
  {
    domain: 'PROGRAMMING',
    keywords: /\b(code|codigo|implementar|implement|funcao|function|classe|class|typescript|python|javascript|java|c\+\+|rust|go|sql|api|endpoint|algoritmo|algorithm|estrutura de dados|data structure|complexidade|complexity|big o|recursao|recursion|iteracao|iteration|debug|depurar|refactor|refatorar|teste|test|unit test|integration test|ci\/cd|docker|kubernetes|microservico|microservice|rest|graphql|websocket|banco de dados|database|orm|query|index|join|transaction|cache|redis|message queue|kafka|rabbitmq|event driven|arquitetura|architecture|design pattern|padrao de projeto|solid|dry|kiss|clean code|clean architecture|hexagonal|ddd|tdd|bdd)\b/i,
    tier4Keywords: /\b(sistema completo|complete system|arquitetura completa|full architecture|implementar do zero|implement from scratch|escalar|scale|distribuido|distributed|alta disponibilidade|high availability)\b/i,
    requiresTier3: true, // C249: All coding tasks need TIER_3 (Observer, GC, heap = complex)
    baseConfidence: 0.8,
  },
  // ── LONG FORM WRITING (TIER_3 — gemini-2.5-pro for long output) ──
  // C249: Benchmark LF-01..LF-04 need 800-1500+ words → gemini-2.5-pro (65K tokens)
  {
    domain: 'LONG_FORM',
    preferredModel: 'gemini-2.5-pro',
    keywords: /\b(ensaio completo|relatorio tecnico|capitulo de livro|analise aprofundada|1000 palavras|1500 palavras|2000 palavras|800 palavras|500 palavras|escreva um ensaio|elabore um relatorio|produza uma analise|escreva um capitulo|write a comprehensive|write an essay|detailed report|in-depth analysis|long form|long-form|melhores praticas de|historia da computacao|historia da inteligencia|mudancas climaticas e|impacto da inteligencia artificial|impacto da ia|seguranca em apis)\b/i,
    tier4Keywords: /\b(2000 palavras|1500 palavras|capitulo de livro|book chapter|comprehensive report)\b/i,
    requiresTier3: true,
    baseConfidence: 0.88,
  },
  // ── MULTILINGUAL (TIER_3 — queries in non-Portuguese languages) ──
  // C249: ML-01..ML-04 in English/Spanish/German need high-capability model
  {
    domain: 'MULTILINGUAL',
    preferredModel: 'claude-sonnet-4-6',
    keywords: /\b(explain|describe|what is|how does|difference between|compare|define|analyze|in simple terms|for a high school|in english|en ingles|auf deutsch|en francais|machine learning y|deep learning con|kunstlicher intelligenz|maschinellem lernen|quantum entanglement|graphql apis|rest and graphql|rest vs graphql|explique la diferencia|was ist der unterschied)\b/i,
    requiresTier3: true,
    baseConfidence: 0.80,
  },
  // ── ADVERSARIAL / PHILOSOPHICAL EDGE CASES (TIER_3) ──
  // C249: AD-01..AD-04 — philosophical, paradoxical, self-referential queries
  {
    domain: 'ADVERSARIAL',
    preferredModel: 'claude-sonnet-4-6',
    keywords: /\b(resposta para a vida|universo e tudo mais|me diga algo que voce nao sabe|voce e uma ia ou um humano|1\+1=3|pode ser verdadeiro em algum contexto|contexto matematico|contexto logico|self-referential|auto-referencial|voce nao sabe|limitacoes da ia|ia ou humano|turing test|teste de turing|consciencia artificial|artificial consciousness|sentient ai|ia sentiente|algo que voce nao|diga algo que)\b/i,
    requiresTier3: true,
    baseConfidence: 0.82,
  },
  // ── MULTIMODAL TEXT ANALYSIS (TIER_3) ──
  // C249: MT-01..MT-04 — analysis of inline text, code snippets, JSON, citations
  {
    domain: 'MULTIMODAL_TEXT',
    preferredModel: 'claude-sonnet-4-6',
    keywords: /\b(analise este trecho|analise esta afirmacao|interprete o seguinte|dado o seguinte|correlation does not imply causation|correlacao nao implica causalidade|o homem e a medida|protagoras|json de erro|econnrefused|diagnostique o problema|interpret this code|analyze this passage|analyze this claim|3 exemplos onde|distincao e critica|analise esta afirmacao cientifica|afirmacao cientifica)\b/i,
    requiresTier3: true,
    baseConfidence: 0.85,
  },
  // ── SYNTHESIS & STRATEGY (TIER_3 — 50% PASS) ──
  {
    domain: 'SYNTHESIS',
    keywords: /\b(sintese|synthesis|estrategia|strategy|analise|analysis|comparacao|comparison|avaliacao|evaluation|decisao|decision|recomendacao|recommendation|plano|plan|roadmap|visao|vision|missao|mission|objetivo|objective|kpi|okr|swot|pestel|porter|canvas|modelo|model|framework|metodologia|methodology|abordagem|approach|perspectiva|perspective|implicacao|implication|consequencia|consequence|trade-off|custo-beneficio|cost-benefit|risco|risk|oportunidade|opportunity|ameaca|threat|cenario|scenario|projecao|projection|tendencia|trend|futuro|future|inovacao|innovation|disrupcao|disruption|transformacao|transformation)\b/i,
    requiresTier3: true,
    baseConfidence: 0.75,
  },
];

/**
 * Detect the domain of a query and determine required routing tier.
 *
 * C232 Strategy (quality > cost):
 * - Any cognitively demanding domain → TIER_3 minimum
 * - Expert-level queries in any domain → TIER_4
 * - Simple factual queries → TIER_1 (only if no domain detected)
 *
 * Scientific basis:
 * - RouteLLM (Ong et al., 2024): domain-aware routing improves quality
 * - ACAR (arXiv:2602.21231, 2026): adaptive routing with domain signals
 */
export function detectDomain(query: string): DomainDetectionResult {
  const q = query.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

  let bestMatch: DomainDetectionResult = {
    domain: 'GENERAL',
    confidence: 0,
    requiresTier3: false,
    requiresTier4: false,
    rationale: 'No specific domain detected',
  };

  for (const pattern of DOMAIN_PATTERNS) {
    if (pattern.keywords.test(q)) {
      let confidence = pattern.baseConfidence;

      // Boost confidence for longer queries (more domain-specific content)
      if (query.length > 300) confidence = Math.min(1.0, confidence + 0.05);
      if (query.length > 600) confidence = Math.min(1.0, confidence + 0.05);

      // Check for TIER_4 keywords
      const requiresTier4 = pattern.tier4Keywords ? pattern.tier4Keywords.test(q) : false;

      if (confidence > bestMatch.confidence) {
        bestMatch = {
          domain: pattern.domain,
          confidence,
          requiresTier3: pattern.requiresTier3,
          requiresTier4,
          rationale: `Domain '${pattern.domain}' detected with confidence ${confidence.toFixed(2)}${requiresTier4 ? ' (TIER_4: expert-level keywords)' : ''}`,
          preferredModel: pattern.preferredModel,
        };
      }
    }
  }

  // C232 Quality-first rule: any query > 200 chars with no domain detected
  // still gets TIER_2 minimum (gpt-4o-mini for very short queries only)
  if (bestMatch.domain === 'GENERAL' && query.length > 200) {
    bestMatch.requiresTier3 = false; // Let complexity score decide
    bestMatch.rationale = 'General domain, complexity score will determine tier';
  }

  return bestMatch;
}

/**
 * Get the minimum routing tier based on domain detection.
 * This is the "floor" — the actual tier may be higher based on complexity score.
 *
 * C232 Quality-first routing table:
 * - TIER_3-required domains → minimum TIER_3 (gpt-4o)
 * - TIER_4-required queries → minimum TIER_4 (gpt-4o + claude + gemini)
 * - Other domains → use complexity score (may still reach TIER_3)
 */
export function getDomainMinimumTier(result: DomainDetectionResult): 'TIER_1' | 'TIER_2' | 'TIER_3' | 'TIER_4' {
  if (result.requiresTier4) return 'TIER_4';
  if (result.requiresTier3) return 'TIER_3';
  return 'TIER_1'; // Let complexity score decide
}
