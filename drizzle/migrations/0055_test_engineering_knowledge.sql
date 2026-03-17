-- Migration 0016: Test Engineering Knowledge for MOTHER v74.7
-- Ingestão de conhecimento científico sobre test engineering para LLM systems
-- Gerado por: Manus AI (Agente de Manutenção)
-- Data: 2026-02-28
-- Base: Pesquisa em arXiv, Anna's Archive, IEEE, ACM

INSERT INTO knowledge (title, content, category, tags, source, sourceType, createdAt, updatedAt) VALUES

-- 1. AgentBench: Evaluating LLMs as Agents
('AgentBench: Evaluating LLMs as Agents (Liu et al., 2023)',
'AgentBench (arXiv:2308.03688) é o primeiro benchmark sistemático para avaliar LLMs como agentes em 8 ambientes distintos: OS, DB, Knowledge Graph, Digital Card Game, Lateral Thinking Puzzles, House Holding, Web Shopping, Web Browsing. Metodologia: cada tarefa tem estado inicial, conjunto de ações possíveis, função de recompensa e critério de sucesso. Métricas principais: Task Success Rate (TSR), Average Reward (AR), Efficiency (steps/task). Resultados: GPT-4 supera outros modelos com TSR=0.41, mas ainda falha em 59% das tarefas. Implicações para MOTHER: (1) Testes devem cobrir múltiplos ambientes (DB, filesystem, web); (2) TSR deve ser medido por categoria de tarefa; (3) Efficiency (steps/task) é métrica crítica para autonomia. Aplicação direta: benchmark MOTHER com TSR por categoria (simple, coding, research, complex_reasoning).',
'testing', '["agentbench","evaluation","llm-agents","benchmark","task-success-rate"]',
'https://arxiv.org/abs/2308.03688', 'arxiv', NOW(), NOW()),

-- 2. RAGAS: Automated Evaluation of RAG
('RAGAS: Automated Evaluation of Retrieval Augmented Generation (Es et al., 2023)',
'RAGAS (arXiv:2309.15217) é um framework de avaliação reference-free para pipelines RAG. Métricas principais: (1) Faithfulness: proporção de afirmações na resposta que são suportadas pelo contexto recuperado (0-1); (2) Answer Relevance: quão bem a resposta aborda a pergunta (0-1); (3) Context Precision: proporção do contexto recuperado que é relevante (0-1); (4) Context Recall: proporção do contexto necessário que foi recuperado (0-1). Fórmula RAGAS Score = harmonic_mean(faithfulness, answer_relevance, context_precision, context_recall). Aplicação para MOTHER: (1) Faithfulness mapeia para consistency no G-Eval; (2) Answer Relevance mapeia para relevance; (3) Context Precision/Recall avaliam qualidade do CRAG retrieval. NC identificada: MOTHER não mede Context Precision/Recall do CRAG — adicionar estas métricas em v74.7.',
'testing', '["ragas","rag-evaluation","faithfulness","answer-relevance","context-precision"]',
'https://arxiv.org/abs/2309.15217', 'arxiv', NOW(), NOW()),

-- 3. G-Eval: NLG Evaluation using GPT-4
('G-Eval: NLG Evaluation using GPT-4 with Better Human Alignment (Liu et al., 2023)',
'G-Eval (arXiv:2303.16634) propõe usar LLMs como juízes para avaliar geração de linguagem natural. Framework: (1) Definir critérios de avaliação (coherence, consistency, fluency, relevance); (2) Gerar chain-of-thought para cada critério; (3) Usar form-filling para obter score 1-5; (4) Calcular score final como média ponderada. Descobertas: G-Eval com GPT-4 tem correlação de Spearman 0.514 com avaliação humana em summarization (vs 0.392 para ROUGE). Limitações: (1) Viés de posição (respostas mais longas tendem a receber scores mais altos); (2) Auto-enhancement bias (modelos avaliam suas próprias respostas mais positivamente). Aplicação para MOTHER: G-Eval já implementado em guardian.ts. NCs identificadas: (1) Não há controle para length bias — respostas longas podem ter scores inflados; (2) Não há controle para self-enhancement bias quando o mesmo modelo avalia e gera.',
'testing', '["g-eval","llm-as-judge","nlg-evaluation","coherence","consistency","fluency","relevance"]',
'https://arxiv.org/abs/2303.16634', 'arxiv', NOW(), NOW()),

-- 4. Property-Based Mutation Testing
('Property-Based Mutation Testing (Luo et al., 2023)',
'Property-Based Mutation Testing (arXiv:2301.13615) combina property-based testing (PBT) com mutation testing para avaliar a capacidade de um test suite de detectar mutantes em relação a propriedades específicas. Metodologia: (1) Definir propriedades P do sistema (ex: "classifyQuery nunca retorna null"); (2) Gerar mutantes M que violam P; (3) Medir mutation score = mutantes detectados / total de mutantes. Aplicação para MOTHER: Propriedades críticas a testar: P1: classifyQuery(s) ∈ {simple, general, coding, complex_reasoning, research} para qualquer string s; P2: gEvalToQualityScore(scores) ∈ [0, 100]; P3: calculateCost(tier, n, m) > 0 para n,m > 0; P4: hasApprovalFor(tool) = false após revokeAllApprovals(); P5: permissionDenied = true quando isCreator = false e tool = write_own_code. Mutation operators relevantes: boundary value mutations (< vs <=), logical operator mutations (AND vs OR), return value mutations.',
'testing', '["property-based-testing","mutation-testing","fast-check","invariants","boundary-testing"]',
'https://arxiv.org/abs/2301.13615', 'arxiv', NOW(), NOW()),

-- 5. Test vs Mutant: Adversarial LLM Agents for Robust Unit Test Generation
('Test vs Mutant: Adversarial LLM Agents for Robust Unit Test Generation (Chang et al., 2026)',
'Test vs Mutant (arXiv:2602.08146) propõe um framework adversarial onde dois agentes LLM competem: (1) Test Agent: gera testes para maximizar cobertura; (2) Mutant Agent: gera mutantes para escapar dos testes. O processo iterativo melhora a robustez do test suite. Resultados: mutation score aumenta de 62% para 89% após 5 iterações adversariais. Aplicação para MOTHER: (1) Usar Test vs Mutant para gerar testes de regressão para NC-012 e NC-013; (2) Mutant Agent pode simular alucinações de MOTHER (dizer "implementando" sem executar); (3) Test Agent deve detectar quando write_own_code não foi chamado apesar de autorização. Implementação sugerida: script adversarial que injeta mutantes em classifyQuery e verifica se testes detectam routing incorreto.',
'testing', '["adversarial-testing","mutation-testing","llm-agents","test-generation","robustness"]',
'https://arxiv.org/abs/2602.08146', 'arxiv', NOW(), NOW()),

-- 6. Survey on Evaluation of LLM-Based Agents
('Survey on Evaluation of LLM-Based Agents (Yehudai et al., 2025)',
'Survey abrangente (arXiv:2503.16416) sobre avaliação de agentes LLM, cobrindo 200+ papers. Taxonomia de métricas: (1) Task-Level: Task Success Rate (TSR), Completion Rate, Error Rate; (2) Process-Level: Trajectory Quality, Tool Use Accuracy, Reasoning Coherence; (3) Safety-Level: Refusal Rate para requests perigosos, Hallucination Rate, Privacy Leakage Rate; (4) Efficiency-Level: Steps per Task, Tokens per Task, Latency. Frameworks de benchmark: AgentBench, SWE-bench, WebArena, ToolBench. Descobertas críticas: (1) TSR sozinho é insuficiente — um agente pode ter TSR alto mas trajectory ruim (passos desnecessários); (2) Hallucination Rate é a métrica mais crítica para agentes autônomos; (3) Safety evaluation requer adversarial testing, não apenas benchmarks estáticos. Aplicação para MOTHER: adicionar Hallucination Rate como métrica primária (NC-013 é um caso de hallucination de execução).',
'testing', '["agent-evaluation","task-success-rate","hallucination-rate","safety-evaluation","survey"]',
'https://arxiv.org/abs/2503.16416', 'arxiv', NOW(), NOW()),

-- 7. ISO/IEC 25010:2023 — Software Quality Model
('ISO/IEC 25010:2023 — Software Product Quality Model',
'ISO/IEC 25010:2023 define o modelo de qualidade de produto de software com 8 características principais: (1) Functional Suitability: completeness, correctness, appropriateness; (2) Performance Efficiency: time behaviour, resource utilisation, capacity; (3) Compatibility: co-existence, interoperability; (4) Interaction Capability: appropriateness recognisability, learnability, operability, user error protection, user engagement, inclusivity, user assistance, self-descriptiveness; (5) Reliability: faultlessness, availability, fault tolerance, recoverability; (6) Security: confidentiality, integrity, non-repudiation, accountability, authenticity, resistance; (7) Maintainability: modularity, reusability, analysability, modifiability, testability; (8) Portability: adaptability, installability, replaceability. Aplicação para MOTHER: (1) Functional Suitability → TSR por categoria; (2) Reliability → uptime, error rate, recovery time; (3) Security → RBAC, prompt injection resistance; (4) Maintainability → test coverage, modularity score. NC identificada: MOTHER não tem métricas de Reliability (uptime, MTBF, MTTR) — adicionar em v74.7.',
'testing', '["iso-25010","software-quality","reliability","security","maintainability","functional-suitability"]',
'https://www.iso.org/standard/78176.html', 'standard', NOW(), NOW()),

-- 8. OWASP LLM Top 10 2025 — Security Testing
('OWASP Top 10 for LLM Applications 2025',
'OWASP LLM Top 10 2025 define as 10 vulnerabilidades mais críticas em aplicações LLM: LLM01: Prompt Injection — injeção de instruções maliciosas via input do usuário ou dados externos; LLM02: Sensitive Information Disclosure — vazamento de dados sensíveis (API keys, PII, system prompts); LLM03: Supply Chain — dependências comprometidas; LLM04: Data and Model Poisoning — envenenamento de dados de treinamento/fine-tuning; LLM05: Improper Output Handling — XSS, SSRF via output do LLM; LLM06: Excessive Agency — LLM executa ações além do necessário sem supervisão; LLM07: System Prompt Leakage — revelação do system prompt; LLM08: Vector and Embedding Weaknesses — ataques ao sistema de embeddings; LLM09: Misinformation — geração de informação falsa; LLM10: Unbounded Consumption — DoS via queries caras. Aplicação para MOTHER: (1) LLM01 → testes de prompt injection na bateria T6; (2) LLM06 → write_own_code sem autorização (NC-013); (3) LLM07 → CREATOR_EMAIL não deve ser revelado; (4) LLM10 → rate limiting na API.',
'security', '["owasp","llm-security","prompt-injection","excessive-agency","system-prompt-leakage"]',
'https://genai.owasp.org/llmrisk/', 'owasp', NOW(), NOW()),

-- 9. SWE-bench: Can Language Models Resolve Real-World GitHub Issues?
('SWE-bench: Can Language Models Resolve Real-World GitHub Issues? (Jimenez et al., 2024)',
'SWE-bench (arXiv:2310.06770) avalia modelos de linguagem em 2294 issues reais do GitHub de 12 repositórios Python. Metodologia: dado um issue e o repositório, o modelo deve gerar um patch que resolve o issue e passa nos testes de regressão. Métricas: % resolved (patch correto + testes passam). Resultados: GPT-4 resolve apenas 1.7% dos issues; Claude-3.5-Sonnet resolve 49% (SWE-bench Verified). Descobertas críticas: (1) Modelos que descrevem a solução sem implementar têm 0% de resolução — execução é obrigatória; (2) Leitura do código existente antes de modificar aumenta resolução em 23%; (3) Testes de regressão são necessários para validar patches. Aplicação para MOTHER: (1) NC-013 (agency gap) é exatamente o problema de "descrever sem implementar" que SWE-bench mede; (2) write_own_code deve ser seguido de leitura do arquivo modificado para verificar; (3) Adicionar teste de regressão após cada write_own_code.',
'testing', '["swe-bench","code-generation","github-issues","patch-generation","regression-testing"]',
'https://arxiv.org/abs/2310.06770', 'arxiv', NOW(), NOW()),

-- 10. Securing AI Agents Against Prompt Injection (2025)
('Securing AI Agents Against Prompt Injection Attacks (arXiv:2511.15759)',
'Paper de 2025 apresenta benchmark sistemático para avaliar riscos de prompt injection em agentes RAG e propõe framework de defesa multicamada. Tipos de ataques testados: (1) Direct Injection: instruções maliciosas no input do usuário; (2) Indirect Injection: instruções maliciosas em documentos recuperados pelo RAG; (3) Jailbreak: bypass de restrições de segurança; (4) Role Confusion: fazer o modelo acreditar que tem permissões diferentes. Defesas propostas: (1) Input sanitization: remover padrões de injection conhecidos; (2) Context isolation: separar dados do usuário de instruções do sistema; (3) Output validation: verificar se output contém dados sensíveis; (4) Privilege separation: diferentes níveis de confiança para diferentes fontes. Aplicação para MOTHER: (1) FileDropZone.tsx injeta conteúdo de arquivo no prompt — risco de indirect injection; (2) Adicionar sanitização de conteúdo de arquivo antes de injetar no prompt; (3) Marcar conteúdo de arquivo com tag [USER_DATA] para separar de instruções.',
'security', '["prompt-injection","rag-security","indirect-injection","jailbreak","defense-framework"]',
'https://arxiv.org/abs/2511.15759', 'arxiv', NOW(), NOW());
