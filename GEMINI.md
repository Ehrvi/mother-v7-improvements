# MOTHER — Contexto para IA

> Este arquivo é lido automaticamente por todas as conversas Antigravity neste workspace.
> **Revisão**: 2026-03-21 · 29 artefatos consolidados de 4 conversas

## O que é MOTHER

Sistema cognitivo autônomo auto-evolutivo criado por **Everton Garcia** (Wizards Down Under / Intelltech).

- **Objetivo A**: SHMS Brain — monitoramento geotécnico de barragens/minas (IoT → MQTT → TimescaleDB → LSTM → alertas)
- **Objetivo B**: Autonomia Total via Darwin Gödel Machine (arXiv:2505.22954)
- **Stack**: 500+ arquivos TypeScript, 9 camadas de qualidade, Multi-LLM, PostgreSQL + pgvector + TimescaleDB
- **Deploy**: Google Cloud Run (australia-southeast1)

## Documentos de contexto

Todos em `.agents/context/`. **Leia os relevantes antes de trabalhar.**

### 📐 Arquitetura & Pipeline (conversa principal)

| Arquivo | Conteúdo |
|---------|----------|
| `mother_architecture_real.md` | Arquitetura completa — módulos, camadas, diagramas mermaid |
| `mother_complete_interconnection_diagram.md` | Diagrama de interconexão entre todos os módulos |
| `mother_answer_pipeline_disclosure.md` | Pipeline de 35 estágios de processamento de queries |
| `mother_evaluation.md` | Métricas e avaliação de qualidade |
| `mother_visual_identity_sota.md` | Design system, oklch tokens, UX/UI guidelines |
| `mother_info_consolidation.md` | Consolidação de informações do sistema |
| `scientific_evaluation_mother_learning.md` | Avaliação científica do aprendizado |
| `mistral_ft_diagnostic_report.md` | Status do fine-tuning Mistral LoRA |

### 🏗️ FOS/LEM & Geotecnia (conversa FOS debugging)

| Arquivo | Conteúdo |
|---------|----------|
| `conv_fos_metodos_estabilidade_completo.md` | Métodos de estabilidade completos (Bishop, Janbu, Spencer, etc.) |
| `conv_fos_lem_architecture_research.md` | Pesquisa de arquitetura LEM |
| `conv_fos_lem_digital_twin_architecture.md` | Arquitetura Digital Twin + LEM |
| `conv_fos_ga_geotechnics_sota.md` | SOTA em geotecnia — Algoritmos Genéticos |
| `conv_fos_sota_research_shms.md` | Pesquisa SOTA — SHMS |
| `conv_fos_dam_3d_models_research.md` | Pesquisa modelos 3D de barragens |
| `conv_fos_digital_twins_research.md` | Pesquisa Digital Twins |
| `conv_fos_dgm_flowchart.md` | Fluxograma DGM completo |
| `conv_fos_design_manual.md` | Manual de design do sistema |
| `conv_fos_visual_identity_manual.md` | Manual de identidade visual |
| `conv_fos_sota_stability_ux_research.md` | Pesquisa UX para estabilidade |
| `conv_fos_sota_ux_bench_consolidation.md` | Consolidação benchmarks UX |
| `conv_fos_implementation_plan.md` | Plano de implementação FOS |
| `conv_fos_walkthrough.md` | Walkthrough das mudanças FOS |

### 📊 SHMS UI & Instrumentação (conversa SHMS UI)

| Arquivo | Conteúdo |
|---------|----------|
| `conv_shms_ui_shms-data-instrumentation-research.md` | Pesquisa instrumentação SHMS |
| `conv_shms_ui_shms-ui-concepts.md` | Conceitos de UI SHMS |
| `conv_shms_ui_shms-ui-research.md` | Pesquisa UI SHMS |
| `conv_shms_ui_shms_evaluation.md` | Avaliação do SHMS |
| `conv_shms_ui_shms_ui_prompt.md` | Prompts de UI SHMS |
| `conv_shms_ui_implementation_plan.md` | Plano de implementação SHMS UI |
| `conv_shms_ui_walkthrough.md` | Walkthrough SHMS UI |

## Regras

- Siga `/rules` workflow
- Use `/startup` para iniciar o dev server
- Use `/mother-pipeline` para referência do pipeline de 35 estágios
- **ZERO BULLSHIT**: não inventar, não chutar, não mentir
- **Leia os docs relevantes em `.agents/context/` antes de responder**
