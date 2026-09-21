# Oplyra Agents — Revisão de Consistência v1.1

**Data:** 16 de setembro de 2026  
**Escopo:** `docs/product/marketing-ops/agents/`  
**Status:** validação estrutural concluída

## Resultado executivo

A revisão cruzada dos 12 agentes foi concluída. As funções de negócio não foram alteradas. A passagem v1.1 normaliza contratos mecânicos antes da implementação.

### Validações executadas

- 12 `agent.key` únicos e canônicos;
- 12 domínios conferidos;
- referências entre agentes validadas;
- planos Performance/Growth preservados;
- todos os blocos JSON dos exemplos parseiam corretamente;
- actions permanecem em `snake_case`;
- events permanecem em notação `<domain>.<event>`;
- `transaction.status` alinhado ao OATP;
- permissões de ferramentas normalizadas;
- autonomy alinhada aos quatro níveis do OATP;
- quality gate central preservado em `strategy-quality-agent`;
- eventos de handoff/review harmonizados;
- eventos externos distinguidos de eventos emitidos pelos agentes.

## Correções de consistência aplicadas

1. `pending` foi removido como estado transacional de exemplo; o canônico é `created`.
2. `permission` foi normalizada para `none | read | write | read_write | execute | approve`, com condições declaradas separadamente.
3. Valores `none` foram retirados de autonomy; capability proibida passa a ser expressa por `tool permission: none` + `outOfScope`.
4. `quality.passed` passa a ser o sinal canônico do quality gate; `copy.approved` e `design.approved` não são presumidos.
5. Strategy & Quality passa a reconhecer explicitamente reviews de Social, Email e Lifecycle.
6. Paid Media passa a emitir `media.metrics_updated`, consumível por Performance.
7. Lifecycle passa a emitir `journey.email_step_ready` para Email Marketing.
8. Revenue Intelligence passa a consumir `journey.contact_exited`, evento realmente produzido pelo Lifecycle Agent.
9. Copywriting usa `evidence.providedRefs`, alinhado ao OATP.
10. Tool permissions condicionais foram representadas por `permission` canônica + `condition`.
11. Orchestrator passa a consumir escalonamentos operacionais e de qualidade.
12. README ganhou convenções canônicas para actions, events, tool permissions, autonomy e transaction status.

## Matriz canônica

| Arquivo | agent.key | domain | Plano |
|---|---|---|---|
| orchestrator.md | orchestrator-agent | orchestration | Performance + Growth |
| strategy-quality.md | strategy-quality-agent | strategy_quality | Performance + Growth |
| account-projects.md | account-projects-agent | project_management | Performance + Growth |
| copywriting.md | copywriting-agent | copywriting | Performance + Growth |
| design.md | design-agent | design | Performance + Growth |
| paid-media.md | paid-media-agent | paid_media | Performance + Growth |
| performance-intelligence.md | performance-intelligence-agent | performance | Performance + Growth |
| reporting-checkins.md | reporting-checkins-agent | reporting | Performance + Growth |
| social-media.md | social-media-agent | social_media | Growth |
| email-marketing.md | email-marketing-agent | email_marketing | Growth |
| lifecycle.md | lifecycle-agent | lifecycle | Growth |
| revenue-intelligence.md | revenue-intelligence-agent | revenue_intelligence | Growth |

## Eventos externos

Os seguintes tópicos podem ter produtores fora dos 12 agentes e, portanto, não são tratados como órfãos:

- `approval.*` — Approval Service;
- `campaign.*` — Campaign/Initiative service;
- `experiment.*` — Experiment service/runtime;
- `asset.*` — Asset processing pipeline;
- `crm.*`, `lead.*`, `meeting.*`, `opportunity.*`, `proposal.*`, `contract.*`, `revenue.*`, `touchpoint.*` — adapters/commercial ingestion;
- `integration.*` — Integration health service;
- `schedule.*` — Scheduler;
- `context.*` — Context service.

## Resultado da validação automática


**Nenhuma inconsistência mecânica remanescente foi detectada pelos checks automáticos definidos para esta revisão.**


## Regra de implementação

Antes de implementar cada agente, gerar schemas formais para:

- Agent Definition;
- Context Policy;
- Task Catalog;
- Tool Permission;
- Command/Query inputs;
- Response results;
- Events;
- Handoffs;
- Quality Review;
- Error codes.

A documentação Markdown continua como especificação humana; JSON Schema deverá ser a fonte validável dos contratos de runtime.
