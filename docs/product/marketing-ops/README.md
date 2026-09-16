# Documentação de produto — Oplyra

**Referência protegida:** [00 — Documento de Transição v2.2, de 13/09/2026](00-documento-transicao.md), somente leitura.
**Precedência e decisões posteriores:** [ATUALIZACOES](ATUALIZACOES.md), que registra a ancoragem das decisões, o escopo de vídeo, o método de campanha, os domínios oficiais e a referência visual vigente.

Leia ATUALIZACOES antes dos documentos derivados: ela indica onde uma decisão posterior prevalece sobre o texto da referência.

## Índice

| Nº | Documento | Conteúdo |
| --- | --- | --- |
| 00 | [Documento de transição](00-documento-transicao.md) | Referência protegida v2.2 |
| 01 | [Requisitos de produto](01-product-requirements.md) | Planos, capacidades, MVP e não objetivos |
| 02 | [Discovery](02-discovery.md) | Hipóteses, pesquisa, evidências herdadas e questões abertas |
| 03 | [Modelo de domínio](03-domain-model.md) | Linguagem ubíqua, bounded contexts, agregados e invariantes |
| 04 | [Arquitetura](04-architecture.md) | Camadas, portas e adapters, multi-tenancy e runtime |
| 05 | [Modelo de dados](05-data-model.md) | Entidades conceituais e contrato canônico de Agent Run |
| 06 | [Integrações](06-integrations.md) | Stripe, mídia, dados comerciais, IA, imagens e ativos |
| 07 | [Segurança e LGPD](07-security-lgpd.md) | Isolamento, credenciais, PII, retenção e auditoria |
| 08 | [Billing, franquias e medidores](08-billing-entitlements.md) | Fonte canônica de limites e budgets |
| 09 | [Arquitetura agêntica](09-agentic-architecture.md) | Workflows, autonomia, limites e scheduler |
| 10 | [Catálogo de agentes](10-agent-catalog.md) | Papéis, responsabilidades e contrato de definição |
| 11 | [Governança dos agentes](11-agent-governance.md) | Autonomia canônica, quality gates e aprovação por versão |
| 12 | [Fases e incrementos](12-roadmap.md) | Fases 0–6 e incrementos I-01 a I-09 |
| 13 | [Model Routing e FinOps](13-ai-model-routing-finops.md) | Registry, Router, Eval Engine, Cost Ledger e limites |
| 14 | [Fluxos de UX e protótipo](14-ux-flows.md) | Arquitetura de informação, fluxos, estados e referência visual |
| 15 | [Plano de testes](15-test-plan.md) | Cenários TST, avaliação de agentes e aceite por incremento |
| 16 | [Ambientes e publicação](16-environments-release.md) | Destinos, variáveis, versionamento e recuperação |
| 17 | [Riscos e memória de cálculo](17-risks-costs.md) | Registro de riscos e baseline econômico reconstruído |
| 18 | [Experimentos técnicos](18-technical-experiments.md) | EXP-01 a EXP-05 e critérios de aprovação |

## Referências relacionadas

| Recurso | Caminho | Situação |
| --- | --- | --- |
| Guia de interface Figma | [GUIA-INTERFACE-FIGMA.md](GUIA-INTERFACE-FIGMA.md) | Referência visual vigente; frames ainda não inspecionados |
| Manual de marca | [../../brand/oplyra_brand_system.md](../../brand/oplyra_brand_system.md) | Identidade, paleta e tipografia |
| Decisões e ADRs | [../../decisions/README.md](../../decisions/README.md) | ADR-0001 a ADR-0008 e pendências DP |
| Skills e compatibilidade | [../../harness/SKILLS-COMPATIBILIDADE.md](../../harness/SKILLS-COMPATIBILIDADE.md) | Quatro skills presentes; trechos de outros produtos desconsiderados |
| Protótipo vigente | [prototypes/performance-mvp.html](prototypes/performance-mvp.html) | Realinhado ao guia de interface |
| Protótipo histórico | [prototypes/performance-mvp-legacy-claro.html](prototypes/performance-mvp-legacy-claro.html) | Tema claro; preservado apenas como histórico |
| Estado do trabalho | [../../harness/ESTADO.md](../../harness/ESTADO.md) | Checkpoint, evidências e próximo passo |

Os arquivos acima existem neste repositório. Existência não implica aprovação: propostas técnicas continuam propostas até decisão registrada, e verificação executada é distinta de cenário especificado.
