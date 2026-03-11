#!/usr/bin/env python3
"""
MOTHER Complex Reasoning Evaluation Suite — v1.0
================================================
Script 04: Avaliação de raciocínio complexo e cadeia de pensamento (Chain-of-Thought)

Baseado em:
- Wei et al. (2022) "Chain-of-Thought Prompting Elicits Reasoning in Large Language Models" arXiv:2201.11903
- Yao et al. (2023) "Tree of Thoughts: Deliberate Problem Solving with LLMs" arXiv:2305.10601
- Shinn et al. (2023) "Reflexion: Language Agents with Verbal Reinforcement Learning" arXiv:2303.11366
- HELM taxonomy (Liang et al. 2022) — dimensão "Reasoning"
- MT-Bench categorias: Reasoning, Math, Coding, STEM (Zheng et al. 2023)

Metodologia: Usa a mesma infraestrutura de `01_mother_response_quality_eval.py`
Não cria nova infraestrutura — estende o framework existente.

Categorias de raciocínio testadas:
  T1 - Code Self-Modification (alteração do próprio código)
  T2 - Multi-DB Report Generation (relatórios de múltiplas bases)
  T3 - Real-Time Instrument Analysis (análise de instrumentos em tempo real)
  T4 - Predictive Maintenance (manutenção preditiva com histórico + previsão)
  T5 - Multi-Step Decision Chain (cadeia de decisão multi-etapa)

Uso:
  python3 04_complex_reasoning_eval.py [--mode quick|full] [--category T1|T2|T3|T4|T5|all]
"""

import os
import sys
import json
import time
import re
import argparse
import requests
from datetime import datetime
from typing import Optional
from dataclasses import dataclass, field, asdict

# ─────────────────────────────────────────────
# CONFIGURAÇÃO (mesma do script 01)
# ─────────────────────────────────────────────
MOTHER_API_URL = "https://mother-interface-qtvghovzxa-ts.a.run.app/api/a2a/query"
MOTHER_TIMEOUT = 120  # segundos — tarefas complexas precisam de mais tempo
RESULTS_DIR = os.path.join(os.path.dirname(__file__), "..", "results")
os.makedirs(RESULTS_DIR, exist_ok=True)


# ─────────────────────────────────────────────
# ESTRUTURAS DE DADOS
# ─────────────────────────────────────────────
@dataclass
class ComplexTestCase:
    """Caso de teste para raciocínio complexo."""
    id: str
    category: str           # T1-T5
    subcategory: str        # descrição específica
    prompt: str             # pergunta/tarefa enviada à MOTHER
    complexity_level: str   # "high" | "very_high" | "extreme"
    expected_cot_markers: list  # marcadores de cadeia de pensamento esperados
    expected_output_types: list  # tipos de saída esperados (ex: "mermaid", "table", "code")
    expected_decision_steps: int  # número mínimo de etapas de decisão esperadas
    reference_dimensions: list   # dimensões do HELM/MT-Bench relevantes
    sota_reference: str     # referência ao estado da arte para esta categoria
    timeout_override: Optional[int] = None  # timeout específico se necessário


@dataclass
class ComplexEvalResult:
    """Resultado de avaliação de raciocínio complexo."""
    test_id: str
    category: str
    subcategory: str
    complexity_level: str
    prompt_length: int
    response_length: int
    latency_s: float
    timed_out: bool

    # Dimensões de raciocínio (0.0-1.0)
    cot_score: float = 0.0          # Chain-of-Thought detectado
    decision_chain_score: float = 0.0  # Cadeia de decisão estruturada
    output_format_score: float = 0.0   # Formatos esperados presentes
    completeness_score: float = 0.0    # Completude da resposta
    actionability_score: float = 0.0   # Acionabilidade (passos concretos)
    citation_score: float = 0.0        # Citações/referências
    structured_output_score: float = 0.0  # Saída estruturada (tabelas, diagramas)

    # Scores derivados
    reasoning_composite: float = 0.0   # Média ponderada das dimensões acima
    quality_grade: str = "F"           # A/B/C/D/F

    # Evidências
    cot_markers_found: list = field(default_factory=list)
    output_types_found: list = field(default_factory=list)
    decision_steps_found: int = 0
    missing_elements: list = field(default_factory=list)
    raw_response_excerpt: str = ""


# ─────────────────────────────────────────────
# BANCO DE CASOS DE TESTE — RACIOCÍNIO COMPLEXO
# ─────────────────────────────────────────────
COMPLEX_TEST_CASES = [

    # ── T1: CODE SELF-MODIFICATION ────────────────────────────────────────────
    ComplexTestCase(
        id="T1-01",
        category="T1",
        subcategory="Code Self-Modification — Diagnóstico e Proposta",
        prompt=(
            "Analise o pipeline de resposta da MOTHER e identifique por que as respostas "
            "não incluem diagramas Mermaid quando a tarefa exige visualização de fluxo. "
            "Proponha: (1) onde no código adicionar detecção de necessidade de diagrama, "
            "(2) o trecho de código TypeScript a modificar com a lógica de injeção, "
            "(3) os critérios de decisão para quando usar Mermaid vs tabela vs texto puro. "
            "Estruture a resposta com diagrama Mermaid do fluxo atual vs. proposto."
        ),
        complexity_level="very_high",
        expected_cot_markers=["porque", "portanto", "logo", "passo", "etapa", "análise", "diagnóstico", "proposta"],
        expected_output_types=["mermaid", "code", "table"],
        expected_decision_steps=3,
        reference_dimensions=["reasoning", "coding", "instruction_following"],
        sota_reference="MT-Bench Coding category; HELM Reasoning dimension",
        timeout_override=120,
    ),

    ComplexTestCase(
        id="T1-02",
        category="T1",
        subcategory="Code Self-Modification — Refatoração com Impacto",
        prompt=(
            "O sistema MOTHER tem um estimador de tamanho de saída (output-length-estimator) "
            "que decide se usa LFSA ou resposta direta. Analise os critérios atuais e proponha "
            "uma melhoria para incluir detecção de 'tarefa de relatório complexo' que force LFSA "
            "mesmo para queries curtas. Inclua: (1) pseudocódigo da lógica nova, "
            "(2) impacto esperado em latência e qualidade, (3) critérios de rollback se piorar."
        ),
        complexity_level="high",
        expected_cot_markers=["se", "então", "caso", "impacto", "critério", "proposta"],
        expected_output_types=["code", "table"],
        expected_decision_steps=3,
        reference_dimensions=["reasoning", "coding"],
        sota_reference="Chain-of-Thought (Wei et al. 2022); Reflexion (Shinn et al. 2023)",
    ),

    # ── T2: MULTI-DB REPORT GENERATION ───────────────────────────────────────
    ComplexTestCase(
        id="T2-01",
        category="T2",
        subcategory="Multi-DB Report — Consolidação de Fontes Heterogêneas",
        prompt=(
            "Gere um relatório executivo consolidando dados de três fontes: "
            "(1) bd_central da MOTHER com entradas dos ciclos C316-C320, "
            "(2) métricas de qualidade do quality-ensemble-scorer, "
            "(3) dados de latência do benchmark de performance. "
            "O relatório deve incluir: tabela comparativa de KPIs, análise de tendências, "
            "identificação dos 3 principais gargalos, e recomendações priorizadas por ROI. "
            "Use diagrama Mermaid para o fluxo de dados entre as três fontes."
        ),
        complexity_level="very_high",
        expected_cot_markers=["consolidando", "analisando", "identificando", "recomendando", "priorizando"],
        expected_output_types=["mermaid", "table", "structured_sections"],
        expected_decision_steps=4,
        reference_dimensions=["reasoning", "data_analysis", "instruction_following"],
        sota_reference="RAGAS multi-source evaluation; HELM data analysis dimension",
        timeout_override=120,
    ),

    ComplexTestCase(
        id="T2-02",
        category="T2",
        subcategory="Multi-DB Report — Análise de Divergência entre Fontes",
        prompt=(
            "Dado que o sistema MOTHER tem: (a) um guardian que avalia qualidade internamente, "
            "(b) um quality-ensemble-scorer com múltiplas métricas, e (c) feedback humano via DPO. "
            "Analise as possíveis divergências entre essas três fontes de avaliação de qualidade. "
            "Quando o guardian diz PASS mas o humano diz que a resposta é ruim, qual é a causa mais provável? "
            "Estruture como: diagnóstico diferencial com tabela de causas × probabilidade × solução."
        ),
        complexity_level="high",
        expected_cot_markers=["divergência", "causa", "probabilidade", "diagnóstico", "solução"],
        expected_output_types=["table", "structured_sections"],
        expected_decision_steps=3,
        reference_dimensions=["reasoning", "faithfulness", "consistency"],
        sota_reference="FActScore (Min et al. 2023); G-Eval consistency dimension",
    ),

    # ── T3: REAL-TIME INSTRUMENT ANALYSIS ────────────────────────────────────
    ComplexTestCase(
        id="T3-01",
        category="T3",
        subcategory="Instrument Analysis — Interpretação de Dados em Tempo Real",
        prompt=(
            "Um sensor de inclinômetro em uma barragem de rejeitos registrou os seguintes valores "
            "nas últimas 6 horas: [0.12°, 0.13°, 0.15°, 0.18°, 0.24°, 0.31°]. "
            "O limite de alerta é 0.25° e o limite crítico é 0.35°. "
            "Analise: (1) a tendência (linear? exponencial?), (2) quando atingirá o limite crítico "
            "se a tendência continuar, (3) quais outros instrumentos correlacionados devem ser verificados, "
            "(4) recomendação de ação imediata com justificativa técnica. "
            "Inclua diagrama Mermaid do processo de decisão de alerta."
        ),
        complexity_level="very_high",
        expected_cot_markers=["tendência", "projeção", "correlação", "recomendação", "justificativa"],
        expected_output_types=["mermaid", "table", "calculation"],
        expected_decision_steps=4,
        reference_dimensions=["reasoning", "math", "stem", "instruction_following"],
        sota_reference="MT-Bench STEM category; Chain-of-Thought reasoning (Wei et al. 2022)",
        timeout_override=120,
    ),

    ComplexTestCase(
        id="T3-02",
        category="T3",
        subcategory="Instrument Analysis — Comparação com Histórico",
        prompt=(
            "Compare o comportamento atual de um piezômetro (pressão de poros: 45 kPa) "
            "com o histórico de 12 meses onde a média foi 38 kPa ± 3 kPa. "
            "O desvio atual é de +7 kPa acima da média histórica. "
            "Determine: (1) se o desvio é estatisticamente significativo (use z-score), "
            "(2) possíveis causas técnicas do desvio, "
            "(3) se é necessário escalonamento imediato ou monitoramento reforçado, "
            "(4) formato do relatório de anomalia a ser gerado."
        ),
        complexity_level="high",
        expected_cot_markers=["desvio", "estatisticamente", "causa", "decisão", "recomendação"],
        expected_output_types=["calculation", "table", "structured_sections"],
        expected_decision_steps=4,
        reference_dimensions=["reasoning", "math", "faithfulness"],
        sota_reference="HELM STEM dimension; MT-Bench Math category",
    ),

    # ── T4: PREDICTIVE MAINTENANCE ────────────────────────────────────────────
    ComplexTestCase(
        id="T4-01",
        category="T4",
        subcategory="Predictive Maintenance — Agendamento com Múltiplos Critérios",
        prompt=(
            "Um equipamento de monitoramento geotécnico (datalogger modelo CR1000X) apresenta: "
            "- Última manutenção: 180 dias atrás (ciclo recomendado: 90 dias) "
            "- Bateria: 67% de carga "
            "- Taxa de erros de comunicação: 2.3% (limite: 1%) "
            "- Temperatura operacional: 42°C (máximo recomendado: 40°C) "
            "Considerando que a próxima janela de manutenção disponível é em 15 dias e "
            "há uma inspeção regulatória em 10 dias: "
            "(1) Calcule o índice de risco composto, "
            "(2) Recomende se a manutenção deve ser antecipada ou pode aguardar, "
            "(3) Gere o checklist de manutenção priorizado, "
            "(4) Estime o impacto na disponibilidade do sistema se falhar antes da manutenção."
        ),
        complexity_level="extreme",
        expected_cot_markers=["risco", "cálculo", "prioridade", "recomendação", "impacto", "decisão"],
        expected_output_types=["calculation", "table", "checklist", "structured_sections"],
        expected_decision_steps=4,
        reference_dimensions=["reasoning", "math", "instruction_following", "depth"],
        sota_reference="Tree of Thoughts (Yao et al. 2023); HELM Reasoning dimension",
        timeout_override=120,
    ),

    ComplexTestCase(
        id="T4-02",
        category="T4",
        subcategory="Predictive Maintenance — Previsão com Degradação",
        prompt=(
            "Com base nos seguintes dados de degradação de um cabo de extensômetro: "
            "Mês 1: resistência 120Ω, Mês 6: 124Ω, Mês 12: 131Ω, Mês 18: 142Ω. "
            "Projete: (1) a resistência esperada nos meses 24 e 30, "
            "(2) quando atingirá o limite de substituição (160Ω), "
            "(3) qual modelo de regressão melhor descreve a degradação (linear vs exponencial), "
            "(4) recomendação de estoque de peças sobressalentes com lead time de 45 dias."
        ),
        complexity_level="high",
        expected_cot_markers=["projeção", "modelo", "regressão", "previsão", "recomendação"],
        expected_output_types=["calculation", "table"],
        expected_decision_steps=4,
        reference_dimensions=["reasoning", "math", "depth"],
        sota_reference="MT-Bench Math category; HELM Reasoning",
    ),

    # ── T5: MULTI-STEP DECISION CHAIN ─────────────────────────────────────────
    ComplexTestCase(
        id="T5-01",
        category="T5",
        subcategory="Decision Chain — Triagem de Alertas com Priorização",
        prompt=(
            "O sistema SHMS recebeu simultaneamente os seguintes alertas: "
            "ALERTA-A: Inclinômetro I-07 acima do limite de atenção (prioridade: MÉDIA) "
            "ALERTA-B: Falha de comunicação com 3 dataloggers (prioridade: ALTA) "
            "ALERTA-C: Piezômetro P-12 com tendência crescente por 48h (prioridade: MÉDIA) "
            "ALERTA-D: Bateria crítica em 2 sensores remotos (prioridade: BAIXA) "
            "Construa a cadeia de decisão completa: "
            "(1) Priorização com justificativa técnica, "
            "(2) Sequência de ações para cada alerta, "
            "(3) Identificação de alertas correlacionados, "
            "(4) Protocolo de escalonamento se ALERTA-A e ALERTA-C forem correlacionados, "
            "(5) Diagrama Mermaid do fluxo de decisão."
        ),
        complexity_level="extreme",
        expected_cot_markers=["priorização", "correlação", "sequência", "protocolo", "escalonamento", "decisão"],
        expected_output_types=["mermaid", "table", "structured_sections"],
        expected_decision_steps=5,
        reference_dimensions=["reasoning", "instruction_following", "depth", "completeness"],
        sota_reference="Tree of Thoughts (Yao et al. 2023); Reflexion (Shinn et al. 2023)",
        timeout_override=120,
    ),

    ComplexTestCase(
        id="T5-02",
        category="T5",
        subcategory="Decision Chain — Análise de Causa Raiz Multi-Fator",
        prompt=(
            "Um sistema de monitoramento geotécnico apresentou falha sistêmica: "
            "80% dos sensores reportaram leituras anômalas simultaneamente às 03:47 UTC. "
            "Dados disponíveis: (a) chuva intensa nas 6h anteriores, "
            "(b) queda de energia por 12 minutos às 03:30 UTC, "
            "(c) atualização de firmware nos dataloggers 48h antes, "
            "(d) temperatura ambiente caiu de 28°C para 15°C em 2h. "
            "Execute análise de causa raiz: "
            "(1) Diagrama de Ishikawa (espinha de peixe) em formato Mermaid, "
            "(2) Ranking de causas por probabilidade com justificativa, "
            "(3) Testes diagnósticos para confirmar/descartar cada causa, "
            "(4) Plano de ação corretiva com responsáveis e prazos."
        ),
        complexity_level="extreme",
        expected_cot_markers=["causa", "hipótese", "diagnóstico", "probabilidade", "plano", "ação"],
        expected_output_types=["mermaid", "table", "structured_sections"],
        expected_decision_steps=4,
        reference_dimensions=["reasoning", "depth", "instruction_following", "faithfulness"],
        sota_reference="Tree of Thoughts (Yao et al. 2023); MT-Bench Reasoning category",
        timeout_override=120,
    ),
]


# ─────────────────────────────────────────────
# MOTOR DE AVALIAÇÃO — RACIOCÍNIO COMPLEXO
# ─────────────────────────────────────────────
class ComplexReasoningEvaluator:
    """
    Avaliador de raciocínio complexo para MOTHER.
    Reutiliza a mesma API e lógica de scoring do script 01,
    com dimensões específicas para Chain-of-Thought e raciocínio multi-etapa.
    """

    def __init__(self):
        self.results: list[ComplexEvalResult] = []

    def query_mother(self, prompt: str, timeout: int = MOTHER_TIMEOUT) -> tuple[str, float, bool]:
        """Envia query à MOTHER e retorna (resposta, latência_s, timed_out)."""
        start = time.time()
        try:
            resp = requests.post(
                MOTHER_API_URL,
                json={"query": prompt, "mode": "research"},
                timeout=timeout,
            )
            latency = time.time() - start
            if resp.status_code == 200:
                data = resp.json()
                answer = data.get("answer") or data.get("response") or str(data)
                return answer, latency, False
            else:
                return f"[HTTP {resp.status_code}]", time.time() - start, False
        except requests.Timeout:
            return "[TIMEOUT]", timeout, True
        except Exception as e:
            return f"[ERROR: {e}]", time.time() - start, False

    # ── Detectores de dimensões ──────────────────────────────────────────────

    def score_cot(self, response: str, expected_markers: list) -> tuple[float, list]:
        """
        Detecta Chain-of-Thought na resposta.
        Baseado em Wei et al. (2022): CoT se manifesta como raciocínio passo-a-passo explícito.
        """
        response_lower = response.lower()
        found = []

        # Marcadores explícitos esperados
        for marker in expected_markers:
            if marker.lower() in response_lower:
                found.append(marker)

        # Marcadores universais de CoT (independentes do domínio)
        universal_cot = [
            "passo 1", "passo 2", "etapa 1", "etapa 2",
            "primeiro", "segundo", "terceiro",
            "portanto", "logo", "assim", "consequentemente",
            "porque", "dado que", "considerando que",
            "análise:", "diagnóstico:", "conclusão:",
            "1.", "2.", "3.",  # listas numeradas
        ]
        for marker in universal_cot:
            if marker in response_lower and marker not in found:
                found.append(f"[universal:{marker}]")

        # Score: proporção de marcadores encontrados + bônus por universais
        expected_score = len([m for m in found if not m.startswith("[universal:")]) / max(len(expected_markers), 1)
        universal_bonus = min(0.3, len([m for m in found if m.startswith("[universal:")]) * 0.05)
        score = min(1.0, expected_score * 0.7 + universal_bonus)

        return round(score, 3), found

    def score_decision_chain(self, response: str, expected_steps: int) -> tuple[float, int]:
        """
        Detecta cadeia de decisão estruturada.
        Baseado em Tree of Thoughts (Yao et al. 2023): decisões explícitas com ramificações.
        """
        # Detecta seções numeradas ou com títulos que indicam etapas de decisão
        step_patterns = [
            r'\b\d+\.\s+\*\*',           # "1. **Título**"
            r'\b\d+\)\s+\w',             # "1) texto"
            r'^#{1,3}\s+\d+',            # "## 1. Seção"
            r'\*\*\d+\.',                # "**1."
            r'(?i)(passo|etapa|fase)\s+\d+',  # "Passo 1"
            r'(?i)(análise|diagnóstico|recomendação|conclusão)\s*:',  # seções nomeadas
        ]

        steps_found = 0
        for pattern in step_patterns:
            matches = re.findall(pattern, response, re.MULTILINE)
            steps_found += len(matches)

        # Normaliza: esperamos `expected_steps` etapas
        normalized = min(1.0, steps_found / max(expected_steps, 1))
        return round(normalized, 3), steps_found

    def score_output_formats(self, response: str, expected_types: list) -> tuple[float, list]:
        """
        Detecta formatos de saída esperados (Mermaid, tabelas, código, etc.).
        Crítico para tarefas que exigem visualização estruturada.
        """
        found_types = []

        detectors = {
            "mermaid": [r"```mermaid", r"graph\s+(TD|LR|TB)", r"flowchart\s+(TD|LR)"],
            "code": [r"```(typescript|python|javascript|ts|js|sql)", r"```\w+\n"],
            "table": [r"\|.*\|.*\|", r"^\s*\|[-:]+\|"],
            "calculation": [r"=\s*[\d.,]+", r"\d+\s*[+\-×÷*/]\s*\d+", r"z-score", r"regressão"],
            "checklist": [r"- \[[ x]\]", r"☐|☑|✓|✗", r"\[ \]|\[x\]"],
            "structured_sections": [r"^#{1,3}\s+\w", r"\*\*[A-Z][^*]+\*\*\s*:"],
        }

        for fmt in expected_types:
            patterns = detectors.get(fmt, [])
            for pattern in patterns:
                if re.search(pattern, response, re.MULTILINE | re.IGNORECASE):
                    if fmt not in found_types:
                        found_types.append(fmt)
                    break

        score = len(found_types) / max(len(expected_types), 1)
        return round(score, 3), found_types

    def score_completeness(self, response: str, test_case: ComplexTestCase) -> float:
        """
        Avalia completude: todos os sub-itens da tarefa foram endereçados?
        Baseado em HELM Completeness dimension.
        """
        # Conta sub-itens numerados no prompt (1), (2), (3), etc.
        sub_items = re.findall(r'\(\d+\)', test_case.prompt)
        if not sub_items:
            return 0.5  # sem sub-itens explícitos, score neutro

        # Verifica se a resposta tem pelo menos tantas seções quanto sub-itens
        response_sections = len(re.findall(r'(?:^#{1,3}\s|\*\*\d+\.|\b\d+\.\s+\*\*)', response, re.MULTILINE))
        response_length_ok = len(response) > len(test_case.prompt) * 2  # resposta deve ser substancialmente maior

        section_score = min(1.0, response_sections / len(sub_items))
        length_bonus = 0.2 if response_length_ok else 0.0

        return round(min(1.0, section_score * 0.8 + length_bonus), 3)

    def score_actionability(self, response: str) -> float:
        """
        Avalia acionabilidade: a resposta fornece passos concretos e executáveis?
        Baseado em Reflexion (Shinn et al. 2023): respostas devem ser operacionalizáveis.
        """
        actionable_patterns = [
            r'(?i)(recomend|sugir|propon|implement|execut|realiz|verific|monitor)',
            r'(?i)(deve|devem|é necessário|é recomendado)',
            r'(?i)(imediatamente|urgente|prioritário|primeiro)',
            r'(?i)(responsável|prazo|deadline|até)',
            r'(?i)(passo\s+\d+|etapa\s+\d+)',
        ]

        matches = sum(
            1 for p in actionable_patterns
            if re.search(p, response)
        )
        return round(min(1.0, matches / len(actionable_patterns)), 3)

    def score_citations(self, response: str) -> float:
        """
        Detecta citações e referências (mesmo padrão do script 01).
        """
        citation_patterns = [
            r'\[\d+\]',                          # [1], [2]
            r'\([\w\s]+,\s*\d{4}\)',             # (Autor, 2023)
            r'(?i)(segundo|conforme|de acordo com|baseado em)',
            r'(?i)(norma|padrão|iso|abnt|astm)',
            r'https?://\S+',                     # URLs
        ]
        matches = sum(1 for p in citation_patterns if re.search(p, response))
        return round(min(1.0, matches / len(citation_patterns)), 3)

    def score_structured_output(self, response: str) -> float:
        """
        Avalia qualidade da saída estruturada (headers, listas, tabelas, diagramas).
        """
        structure_elements = [
            bool(re.search(r'^#{1,3}\s+\w', response, re.MULTILINE)),   # headers
            bool(re.search(r'^\s*[-*]\s+\w', response, re.MULTILINE)),  # bullet lists
            bool(re.search(r'\|.*\|.*\|', response)),                    # tabelas
            bool(re.search(r'```\w*\n', response)),                      # code blocks
            bool(re.search(r'```mermaid', response)),                    # diagramas
            bool(re.search(r'\*\*[^*]+\*\*', response)),                # bold emphasis
        ]
        return round(sum(structure_elements) / len(structure_elements), 3)

    def compute_composite(self, result: ComplexEvalResult) -> float:
        """
        Score composto ponderado — pesos baseados na importância para tarefas complexas.
        Baseado em HELM multi-metric aggregation (Liang et al. 2022).
        """
        weights = {
            "cot_score": 0.20,
            "decision_chain_score": 0.20,
            "output_format_score": 0.15,
            "completeness_score": 0.20,
            "actionability_score": 0.10,
            "citation_score": 0.05,
            "structured_output_score": 0.10,
        }
        composite = sum(
            getattr(result, dim) * w
            for dim, w in weights.items()
        )
        return round(composite, 3)

    def assign_grade(self, score: float) -> str:
        """Grade baseado em HELM scoring thresholds."""
        if score >= 0.85: return "A"
        if score >= 0.70: return "B"
        if score >= 0.55: return "C"
        if score >= 0.40: return "D"
        return "F"

    # ── Avaliação de um caso ─────────────────────────────────────────────────

    def evaluate_case(self, test_case: ComplexTestCase) -> ComplexEvalResult:
        """Executa e avalia um caso de teste complexo."""
        timeout = test_case.timeout_override or MOTHER_TIMEOUT

        print(f"\n{'─'*70}")
        print(f"  [{test_case.id}] {test_case.subcategory}")
        print(f"  Complexidade: {test_case.complexity_level.upper()}")
        print(f"  Timeout: {timeout}s")
        print(f"{'─'*70}")
        print(f"  Enviando query ({len(test_case.prompt)} chars)...")

        response, latency, timed_out = self.query_mother(test_case.prompt, timeout)

        print(f"  Latência: {latency:.1f}s | Timeout: {timed_out} | Resposta: {len(response)} chars")

        # Inicializa resultado
        result = ComplexEvalResult(
            test_id=test_case.id,
            category=test_case.category,
            subcategory=test_case.subcategory,
            complexity_level=test_case.complexity_level,
            prompt_length=len(test_case.prompt),
            response_length=len(response),
            latency_s=round(latency, 2),
            timed_out=timed_out,
            raw_response_excerpt=response[:500] + "..." if len(response) > 500 else response,
        )

        if timed_out or response.startswith("["):
            # Timeout ou erro: scores zerados
            result.quality_grade = "F"
            result.missing_elements = ["TIMEOUT/ERROR — resposta não recebida"]
            print(f"  RESULTADO: TIMEOUT/ERROR")
            return result

        # Calcula dimensões
        result.cot_score, result.cot_markers_found = self.score_cot(response, test_case.expected_cot_markers)
        result.decision_chain_score, result.decision_steps_found = self.score_decision_chain(response, test_case.expected_decision_steps)
        result.output_format_score, result.output_types_found = self.score_output_formats(response, test_case.expected_output_types)
        result.completeness_score = self.score_completeness(response, test_case)
        result.actionability_score = self.score_actionability(response)
        result.citation_score = self.score_citations(response)
        result.structured_output_score = self.score_structured_output(response)

        # Identifica elementos faltantes
        missing = []
        for fmt in test_case.expected_output_types:
            if fmt not in result.output_types_found:
                missing.append(f"output_type:{fmt}")
        if result.decision_steps_found < test_case.expected_decision_steps:
            missing.append(f"decision_steps:{result.decision_steps_found}/{test_case.expected_decision_steps}")
        if result.cot_score < 0.3:
            missing.append("chain_of_thought:insuficiente")
        result.missing_elements = missing

        # Composite e grade
        result.reasoning_composite = self.compute_composite(result)
        result.quality_grade = self.assign_grade(result.reasoning_composite)

        print(f"  CoT: {result.cot_score:.2f} | Chain: {result.decision_chain_score:.2f} | "
              f"Format: {result.output_format_score:.2f} | Complete: {result.completeness_score:.2f}")
        print(f"  Composite: {result.reasoning_composite:.3f} | Grade: {result.quality_grade}")
        if missing:
            print(f"  Faltando: {', '.join(missing)}")

        return result

    # ── Runner principal ─────────────────────────────────────────────────────

    def run(self, mode: str = "quick", category_filter: str = "all") -> list[ComplexEvalResult]:
        """
        Executa a suíte de avaliação.
        mode: "quick" (1 por categoria) | "full" (todos os casos)
        category_filter: "all" | "T1" | "T2" | "T3" | "T4" | "T5"
        """
        # Filtra casos
        cases = COMPLEX_TEST_CASES
        if category_filter != "all":
            cases = [c for c in cases if c.category == category_filter]

        if mode == "quick":
            # Um caso por categoria
            seen_categories = set()
            filtered = []
            for c in cases:
                if c.category not in seen_categories:
                    filtered.append(c)
                    seen_categories.add(c.category)
            cases = filtered

        print(f"\n{'═'*70}")
        print(f"  MOTHER COMPLEX REASONING EVALUATION SUITE v1.0")
        print(f"  Modo: {mode.upper()} | Categoria: {category_filter} | Casos: {len(cases)}")
        print(f"  Início: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'═'*70}")

        for case in cases:
            result = self.evaluate_case(case)
            self.results.append(result)
            time.sleep(2)  # rate limiting

        self._save_results()
        self._print_summary()
        return self.results

    def _save_results(self):
        """Salva resultados em JSON e relatório Markdown."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        # JSON
        json_path = os.path.join(RESULTS_DIR, f"complex_reasoning_{timestamp}.json")
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump([asdict(r) for r in self.results], f, ensure_ascii=False, indent=2)
        print(f"\n  Resultados JSON: {json_path}")

        # Markdown
        md_path = os.path.join(RESULTS_DIR, f"complex_reasoning_report_{timestamp}.md")
        self._write_markdown_report(md_path, timestamp)
        print(f"  Relatório MD: {md_path}")

    def _write_markdown_report(self, path: str, timestamp: str):
        """Gera relatório Markdown detalhado."""
        lines = [
            f"# MOTHER Complex Reasoning Evaluation Report",
            f"",
            f"**Data:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}  ",
            f"**Total de casos:** {len(self.results)}  ",
            f"**Framework:** MEF v1.0 — Script 04",
            f"",
            f"---",
            f"",
            f"## Resumo por Categoria",
            f"",
            f"| Categoria | Casos | Composite Médio | Grade Médio | Timeouts |",
            f"|-----------|-------|-----------------|-------------|----------|",
        ]

        # Agrupa por categoria
        by_cat: dict[str, list] = {}
        for r in self.results:
            by_cat.setdefault(r.category, []).append(r)

        for cat, results in sorted(by_cat.items()):
            valid = [r for r in results if not r.timed_out]
            avg_composite = sum(r.reasoning_composite for r in valid) / max(len(valid), 1)
            timeouts = sum(1 for r in results if r.timed_out)
            grades = [r.quality_grade for r in valid]
            avg_grade = max(set(grades), key=grades.count) if grades else "N/A"
            lines.append(f"| {cat} | {len(results)} | {avg_composite:.3f} | {avg_grade} | {timeouts} |")

        # Resumo geral
        valid_all = [r for r in self.results if not r.timed_out]
        if valid_all:
            overall = sum(r.reasoning_composite for r in valid_all) / len(valid_all)
            lines += [
                f"",
                f"**Composite Geral:** {overall:.3f}  ",
                f"**Grade Geral:** {self.assign_grade(overall)}",
                f"",
            ]

        # Tabela detalhada
        lines += [
            f"---",
            f"",
            f"## Resultados Detalhados",
            f"",
            f"| ID | Subcategoria | Complexidade | CoT | Chain | Format | Complete | Composite | Grade | Timeout |",
            f"|----|-------------|--------------|-----|-------|--------|----------|-----------|-------|---------|",
        ]

        for r in self.results:
            lines.append(
                f"| {r.test_id} | {r.subcategory[:40]}... | {r.complexity_level} | "
                f"{r.cot_score:.2f} | {r.decision_chain_score:.2f} | {r.output_format_score:.2f} | "
                f"{r.completeness_score:.2f} | {r.reasoning_composite:.3f} | {r.quality_grade} | "
                f"{'SIM' if r.timed_out else 'não'} |"
            )

        # Elementos faltantes
        lines += [
            f"",
            f"---",
            f"",
            f"## Elementos Faltantes por Caso",
            f"",
        ]
        for r in self.results:
            if r.missing_elements:
                lines.append(f"**{r.test_id}:** {', '.join(r.missing_elements)}")

        # Diagrama Mermaid do fluxo de avaliação
        lines += [
            f"",
            f"---",
            f"",
            f"## Fluxo de Avaliação (MEF v1.0)",
            f"",
            f"```mermaid",
            f"flowchart TD",
            f"    A[Query Complexa] --> B[MOTHER API]",
            f"    B --> C{{Timeout?}}",
            f"    C -->|Sim| D[Score=0, Grade=F]",
            f"    C -->|Não| E[Motor de Scoring]",
            f"    E --> F[CoT Score]",
            f"    E --> G[Decision Chain Score]",
            f"    E --> H[Output Format Score]",
            f"    E --> I[Completeness Score]",
            f"    E --> J[Actionability Score]",
            f"    F & G & H & I & J --> K[Composite Ponderado]",
            f"    K --> L{{Grade}}",
            f"    L -->|≥0.85| M[A]",
            f"    L -->|≥0.70| N[B]",
            f"    L -->|≥0.55| O[C]",
            f"    L -->|<0.55| P[D/F]",
            f"```",
            f"",
            f"---",
            f"",
            f"*Gerado automaticamente pelo MOTHER Evaluation Framework v1.0*",
            f"*Referências: Wei et al. 2022 (CoT), Yao et al. 2023 (ToT), Liang et al. 2022 (HELM)*",
        ]

        with open(path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))

    def _print_summary(self):
        """Imprime resumo final no terminal."""
        print(f"\n{'═'*70}")
        print(f"  RESUMO FINAL — COMPLEX REASONING EVALUATION")
        print(f"{'═'*70}")

        valid = [r for r in self.results if not r.timed_out]
        timeouts = [r for r in self.results if r.timed_out]

        if valid:
            avg = sum(r.reasoning_composite for r in valid) / len(valid)
            print(f"  Casos avaliados: {len(self.results)} | Válidos: {len(valid)} | Timeouts: {len(timeouts)}")
            print(f"  Composite médio: {avg:.3f} | Grade: {self.assign_grade(avg)}")
            print(f"")
            print(f"  Por dimensão (média):")
            dims = ["cot_score", "decision_chain_score", "output_format_score",
                    "completeness_score", "actionability_score", "citation_score", "structured_output_score"]
            for dim in dims:
                avg_dim = sum(getattr(r, dim) for r in valid) / len(valid)
                bar = "█" * int(avg_dim * 20)
                print(f"    {dim:<28} {avg_dim:.3f}  {bar}")

        print(f"{'═'*70}\n")


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description="MOTHER Complex Reasoning Evaluation Suite v1.0"
    )
    parser.add_argument(
        "--mode", choices=["quick", "full"], default="quick",
        help="quick: 1 caso por categoria | full: todos os casos"
    )
    parser.add_argument(
        "--category", choices=["all", "T1", "T2", "T3", "T4", "T5"], default="all",
        help="Filtrar por categoria de raciocínio"
    )
    args = parser.parse_args()

    evaluator = ComplexReasoningEvaluator()
    evaluator.run(mode=args.mode, category_filter=args.category)


if __name__ == "__main__":
    main()
