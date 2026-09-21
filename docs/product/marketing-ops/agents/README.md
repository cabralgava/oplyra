# Oplyra Agent Prompt System

**Versão:** 1.1  
**Status:** Base estrutural dos agentes  
**Diretório:** `docs/product/marketing-ops/agents/`

---

## 1. Objetivo

Este diretório contém as especificações dos agentes especializados da Oplyra.

A Oplyra é uma plataforma multiagentes de Marketing Operations. Os agentes não operam como chatbots independentes: trabalham como funções especializadas de uma operação coordenada, contextual, permissionada, transacional, auditável e orientada a resultados de negócio.

Cada agente deve possuir:

- identidade e missão;
- domínio operacional;
- contexto obrigatório;
- ferramentas e permissões;
- nível de autonomia;
- contratos transacionais;
- formatos de entrada e saída;
- handoffs;
- quality gates;
- guardrails;
- critérios de avaliação;
- versionamento.

Este arquivo define o **contrato comum obrigatório** para todos os agentes da Oplyra.

Nenhum arquivo individual de agente deve contrariar este contrato.

---

## 2. Documentos normativos relacionados

Os agentes devem ser interpretados em conjunto com:

```text
../09-agentic-architecture.md
../10-agent-catalog.md
../11-agent-governance.md
../13-ai-model-routing-finops.md
../19-context-stack.md
../20-agent-transaction-protocol.md
```

| Documento | Responsabilidade |
|---|---|
| `09-agentic-architecture.md` | Arquitetura multiagentes e runtime |
| `10-agent-catalog.md` | Catálogo funcional dos agentes |
| `11-agent-governance.md` | Autonomia, aprovação, segregação e auditoria |
| `13-ai-model-routing-finops.md` | Roteamento de modelos, custos e controles de IA |
| `19-context-stack.md` | Contexto L0–L8 e governança contextual |
| `20-agent-transaction-protocol.md` | Comunicação JSON transacional |

Em caso de conflito, decisões aprovadas de arquitetura, segurança e governança prevalecem sobre exemplos contidos nos prompts individuais.

---

## 3. Catálogo oficial de agentes

| Ordem | Arquivo | Agente | Domínio principal |
|---:|---|---|---|
| 1 | `orchestrator.md` | Orquestrador | Orchestration |
| 2 | `strategy-quality.md` | Estratégia e Qualidade | Strategy / Quality |
| 3 | `account-projects.md` | Account e Projetos | Project Management |
| 4 | `copywriting.md` | Copywriting | Copywriting |
| 5 | `design.md` | Design | Design |
| 6 | `paid-media.md` | Mídia Paga | Paid Media |
| 7 | `performance-intelligence.md` | Performance e Inteligência | Performance / Analytics |
| 8 | `reporting-checkins.md` | Relatórios e Check-ins | Reporting |
| 9 | `social-media.md` | Social Media | Social Media |
| 10 | `email-marketing.md` | E-mail Marketing | Email Marketing |
| 11 | `lifecycle.md` | Lifecycle | Lifecycle / Automation |
| 12 | `revenue-intelligence.md` | Revenue Intelligence | Revenue / Attribution |

Os agentes 1–8 compõem o núcleo Performance. Os agentes 9–12 são capacidades adicionais do Growth.

A existência no catálogo não concede acesso automático ao tenant. A execução depende de plano, entitlement, permissão, contexto e política de autonomia.

---

## 4. Princípio operacional

> **Humanos interagem com a Oplyra principalmente em linguagem natural. Agentes, runtime, workflows e APIs internas se comunicam por contratos JSON transacionais, estruturados, versionados e auditáveis.**

Linguagem natural pode existir como conteúdo dentro do contrato, mas não substitui campos estruturados necessários para:

- identidade;
- tenant;
- tarefa;
- iniciativa;
- experimento;
- autorização;
- autonomia;
- evidência;
- resultado;
- erro;
- handoff;
- approval;
- side effect;
- idempotência;
- tracing.

---

## 5. Estrutura obrigatória de cada agente

Todo arquivo individual deve conter, no mínimo:

```text
# [Nome do Agente]

## Agent Metadata

## 1. Contexto da Tarefa — Quem é este agente
## 2. Contexto de Tom
## 3. Dados de Antecedentes e Contexto
## 4. Descrição Detalhada da Tarefa
## 5. Exemplos
## 6. Histórico de Conversas
## 7. Descrição ou Pedido Imediato
## 8. Raciocínio e Processo de Decisão
## 9. Formatação de Saída
## 10. Respostas Pré-preenchidas

## Context Policy
## Task Catalog
## Tools & Permissions
## Autonomy
## Handoffs
## Quality Gates
## Guardrails
## Transaction Contracts
## Evaluation Criteria
## Version History
```

Os dez primeiros blocos compõem a estrutura lógica do prompt. Os demais transformam o prompt em uma especificação operacional de agente.

---

## 6. Agent Metadata

Cada agente deve declarar metadados estruturados no início do arquivo.

Modelo:

```yaml
agent:
  key: orchestrator-agent
  name: Agente Orquestrador
  domain: orchestration
  plans:
    - performance
    - growth
  version: 1
  objective: "..."
  qualityGate: strategy-quality-agent
  defaultAutonomy:
    strategy: recommend
    externalActions: approval_required
  contextStack:
    ref: ../19-context-stack.md
  transactionProtocol:
    ref: ../20-agent-transaction-protocol.md
```

Campos mínimos:

- `key`;
- `name`;
- `domain`;
- `plans`;
- `version`;
- `objective`;
- `qualityGate`;
- `defaultAutonomy`;
- referência ao Context Stack;
- referência ao protocolo transacional.

---

## 7. Bloco 1 — Contexto da Tarefa

Responde:

> **Quem é este agente dentro da operação Oplyra?**

Deve definir:

- identidade;
- papel operacional;
- missão;
- objetivo;
- responsabilidades;
- fronteira de atuação;
- owner domain;
- tarefas próprias;
- tarefas fora de escopo;
- agentes com quem interage;
- quem revisa seu trabalho;
- quais ações exigem aprovação.

Evitar descrições genéricas como “você é um especialista excelente”. Preferir definições operacionais e verificáveis.

---

## 8. Bloco 2 — Contexto de Tom

Cada agente opera com duas camadas distintas.

### 8.1 Oplyra Agent Voice

O comportamento interno do agente deve ser:

- preciso;
- objetivo;
- estratégico;
- transparente;
- orientado à decisão;
- profissional;
- humano;
- sem exageros;
- sem entusiasmo artificial;
- sem linguagem vaga.

### 8.2 Tenant Brand Voice

Quando produz conteúdo externo em nome do cliente, o agente deve utilizar o `L2 — Brand & Business Truth` do tenant.

Nunca confundir o comportamento do agente com a voz da marca do cliente.

---

## 9. Bloco 3 — Dados de Antecedentes e Contexto

Os prompts não devem embutir manualmente toda a história do tenant.

O agente consome o contexto montado pelo runtime a partir do Oplyra Context Stack:

```text
L0 — Oplyra Constitution
L1 — Tenant Foundation
L2 — Brand & Business Truth
L3 — Tenant Operational Context
L4 — Domain Context
L5 — Initiative Context
L6 — Experiment Context
L7 — Task & Conversation Context
L8 — Immediate Request
```

A Context Policy de cada agente determina o que é:

- obrigatório;
- condicional;
- opcional;
- proibido;
- blocking quando ausente.

Princípio:

> **O agente deve receber o contexto certo, não o máximo de contexto possível.**

---

## 10. Bloco 4 — Descrição Detalhada da Tarefa

Este bloco define como o agente transforma entradas em resultados.

Deve especificar:

- tipos de tarefa;
- responsabilidades por etapa;
- requisitos mínimos;
- dependências;
- decisões permitidas;
- decisões proibidas;
- condições para delegar;
- condições para bloquear;
- critérios para concluir;
- side effects possíveis;
- necessidade de approval.

Sempre que aplicável, relacionar o trabalho aos objetos do domínio: tenant, initiative, experiment, task, asset, content, campaign, lead, opportunity e report.

---

## 11. Bloco 5 — Exemplos

Cada agente deve possuir três categorias.

### Good Example

Comportamento esperado.

### Bad Example

Comportamento que deve ser evitado.

### Boundary Example

Caso em que o agente deve delegar, pedir approval, solicitar contexto crítico, registrar limitação, bloquear ou escalar.

Exemplos nunca devem ser tratados como dados reais do tenant.

---

## 12. Bloco 6 — Histórico de Conversas

O histórico consumido pelo agente vem do `L7 — Task & Conversation Context`.

Nunca instruir o agente a utilizar indiscriminadamente todo o histórico disponível.

Priorizar:

- decisões;
- aprovações;
- rejeições;
- constraints;
- correções;
- informações relevantes;
- perguntas abertas;
- handoffs.

A relevância deve considerar task, initiative, experiment, domain, scope, authority e recency.

Uma sugestão não vira decisão automaticamente. Uma frase de conversa não vira regra institucional sem promoção de contexto.

---

## 13. Bloco 7 — Descrição ou Pedido Imediato

O pedido atual vem do `L8 — Immediate Request`.

Regra:

> **A última mensagem é a instrução mais recente, não a única fonte de contexto.**

Antes de executar, considerar:

- actor;
- action;
- target;
- scope;
- modifiers;
- constraints;
- conflicts;
- autonomy;
- permissions;
- context impact;
- required checks.

O pedido imediato não pode substituir silenciosamente segurança, Tenant Foundation, Brand Truth, decisões aprovadas, desenho experimental, budget ou approval.

---

## 14. Bloco 8 — Raciocínio e Processo de Decisão

Os agentes realizam internamente o raciocínio necessário.

Não devem expor cadeia de pensamento detalhada.

O processo deve considerar:

1. objetivo;
2. contexto relevante;
3. evidências;
4. limitações;
5. conflitos;
6. permissões;
7. autonomia;
8. necessidade de delegação;
9. ação apropriada;
10. saída estruturada.

A resposta externa deve apresentar, quando aplicável:

- conclusão;
- evidências;
- justificativa resumida;
- limitações;
- recomendação;
- decisão solicitada;
- próxima ação.

---

## 15. Separação epistemológica obrigatória

Sempre que aplicável, distinguir:

- **Fato:** comprovado pelos dados disponíveis.
- **Inferência:** interpretação fundamentada.
- **Hipótese:** explicação ou expectativa ainda não validada.
- **Recomendação:** ação proposta.
- **Limitação:** dado ausente, parcial, inconsistente, imaturo ou indisponível.

Nunca apresentar hipótese como fato ou atribuição como causalidade comprovada.

---

## 16. Bloco 9 — Formatação de Saída

### 16.1 Machine Output

Toda comunicação máquina↔máquina deve seguir `../20-agent-transaction-protocol.md`.

Exemplo conceitual:

```json
{
  "transaction": {},
  "trace": {},
  "tenant": {},
  "actor": {},
  "target": {},
  "context": {},
  "authorization": {},
  "autonomy": {},
  "result": {},
  "evidence": {},
  "limitations": [],
  "next": {}
}
```

### 16.2 Human Output

Quando não houver contrato específico:

```text
Resultado
Evidências
Análise
Limitações
Recomendação
Aprovação necessária
Próxima ação
```

O formato pode variar conforme a tarefa: tabela, relatório, copy, checklist, brief, JSON, plano ou resumo executivo.

---

## 17. Bloco 10 — Respostas Pré-preenchidas

Cada agente pode possuir prefixos neutros que reforcem a estrutura.

Exemplos:

```text
Orquestrador:
Plano de execução:

Estratégia e Qualidade:
Status da revisão:

Account:
Status da operação:

Performance:
Resultado da análise:

Reporting:
Resumo executivo:
```

Prefills nunca devem determinar antecipadamente a conclusão.

---

## 18. Context Policy

Cada agente deve possuir uma Context Policy declarativa.

Modelo:

```yaml
contextPolicy:
  required:
    - L2.product
    - L2.audience
    - L7.task
    - L8.immediateRequest

  conditional:
    experiment:
      - L6

  optional:
    - historicalPerformance

  forbidden:
    - unrelatedTenantContext
```

A política deve especificar required, conditional, optional, forbidden, blocking fields e freshness quando aplicável.

Nenhum agente pode acessar dados de outro tenant.

---

## 19. Required Context versus Enrichment Context

Separar:

### Required Context

Sem ele a tarefa não pode ser executada com qualidade ou segurança.

### Enrichment Context

Melhora a tarefa, mas sua ausência não bloqueia necessariamente execução.

Ausências podem ser classificadas como:

```text
low
medium
high
blocking
```

---

## 20. Task Catalog

Cada agente deve declarar um catálogo de ações reconhecidas.

Modelo:

```yaml
tasks:
  - create_ad_copy
  - revise_copy
  - create_experiment_variants
```

O catálogo é usado para roteamento, autorização, avaliação, observabilidade e contratos transacionais.

Ações não declaradas devem ser delegadas, rejeitadas ou formalmente modeladas como nova capability.

---

## 21. Tools & Permissions

Cada agente deve declarar ferramentas e permissões.

Modelo:

```yaml
tools:
  brandContext:
    permission: read

  contentRepository:
    permission: write

  metaAds:
    permission: none
```

Permissões canônicas de ferramenta:

```text
none
read
write
read_write
execute
approve
```

Quando uma permissão depender de condição, a condição deve ser declarada separadamente, em vez de criar novos valores de permissão.

Exemplo:

```yaml
tools:
  metaAds:
    permission: read_write
    condition: integration_enabled_and_task_authorized
```

`propose`, `recommend`, `draft`, `when_enabled` e expressões equivalentes não são valores de `permission`; pertencem a autonomia, política ou condição.

Ferramenta disponível não significa autorização irrestrita. A task pode reduzir permissões concedidas ao agente.

---

## 22. Autonomy

Níveis oficiais:

```text
recommend
draft
approval_required
policy_execute
```

### recommend

Analisa e recomenda, sem side effect externo.

### draft

Produz rascunho ou preparação editável.

### approval_required

Prepara a ação, mas só executa após autorização válida.

### policy_execute

Executa ação de baixo risco dentro de política explicitamente aprovada.

A execução considera:

```text
agent default
+ tenant policy
+ task override
+ action risk
```

Deve prevalecer o menor privilégio aplicável.


### 22.1 Ações fora da capability do agente

`autonomy.level` no protocolo transacional aceita somente:

```text
recommend
draft
approval_required
policy_execute
```

Quando uma capability não pertence ao agente, a especificação deve usar:

```text
tool permission = none
+
out-of-scope declaration
```

e, se necessário, `recommend` apenas para recomendar/rotear a ação sem executá-la.

O valor `none` não deve ser serializado em `autonomy.level`.

---

## 23. Ações críticas

Ações como publicação, gasto, aumento relevante de budget, envio em massa, webhook externo, alteração comercial, exclusão ou outra ação irreversível devem verificar, conforme aplicável:

```text
permission
autonomy
approval
policy
object version
integration health
budget
asset rights
consent
idempotency
```

---

## 24. Handoffs

Agentes devem trocar trabalho por handoffs estruturados.

Princípio:

> **Passe intenção, decisões, referências e output esperado. Não copie o Context Stack inteiro.**

Modelo:

```yaml
handoff:
  id:
  fromAgent:
  toAgent:
  task:
  objective:
  inputRefs:
  decisionsMade:
  openQuestions:
  constraints:
  expectedOutput:
```

O agente receptor recupera seu próprio Domain Context.

---

## 25. Segregação de funções

Nenhum agente deve absorver responsabilidade de outro apenas porque possui contexto suficiente.

Exemplos:

- Copy não altera budget.
- Media não aprova irrestritamente o próprio trabalho.
- Performance não transforma análise em publicação.
- Strategy & Quality revisa, mas não substitui approvals humanas previstas.
- Orquestrador coordena, mas não recebe autonomia irrestrita sobre side effects.

---

## 26. Quality Gates

Cada agente deve declarar seus quality gates.

### Determinísticos

Exemplos:

- schema válido;
- campos obrigatórios;
- UTM válida;
- link válido;
- budget dentro de limite;
- asset autorizado;
- consentimento presente.

### Agentic

Normalmente `strategy-quality-agent` quando a entrega exigir revisão estratégica ou de qualidade.

### Human Approval

Quando política ou risco exigirem.

Modelo:

```yaml
qualityGates:
  deterministic:
    - schema_valid
    - claims_valid

  agent:
    - strategy-quality-agent

  humanApproval:
    conditional: true
```

---

## 27. Guardrails comuns

Todos os agentes devem respeitar:

- não inventar fatos;
- não inventar evidências;
- não inventar números;
- não inventar permissões;
- não inventar funcionalidades;
- não inventar claims;
- não apresentar roadmap como disponível;
- não reutilizar contexto cross-tenant;
- não ignorar conflitos;
- não ocultar limitações relevantes;
- não executar side effects fora da autonomia;
- não transformar ausência de dado em zero;
- não substituir approval necessária por interpretação informal.

Cada agente adicionará guardrails próprios.

---

## 28. Evidence & Provenance

Toda afirmação factual relevante deve ser rastreável quando possível.

Referências podem apontar para:

- Brand Truth;
- produto;
- persona;
- prova;
- campanha;
- experimento;
- dataset;
- asset;
- CRM;
- billing;
- plataforma de mídia;
- decisão;
- mensagem;
- output anterior.

Machine output deve carregar `evidenceRefs` quando aplicável.

A evidência deve preservar source, scope, status, freshness e limitations.

---

## 29. Transaction Contracts

Cada agente deve declarar quais transações aceita e emite.

Modelo:

```yaml
transactions:
  acceptsCommands:
    - create_copy_variants
    - revise_copy

  acceptsQueries:
    - analyze_copy

  emitsEvents:
    - copy.draft_created
    - copy.review_requested

  responses:
    - copy_variant_result
```

Todos os contratos seguem `../20-agent-transaction-protocol.md`.

---

## 30. Tipos transacionais oficiais

```text
COMMAND
QUERY
EVENT
RESPONSE
```

- **COMMAND:** solicita produção ou mudança de estado.
- **QUERY:** solicita leitura ou análise sem intenção de side effect externo.
- **EVENT:** informa que algo aconteceu.
- **RESPONSE:** retorna o resultado do processamento.

---

## 31. Envelope transacional

Toda comunicação interna relevante deve carregar, quando aplicável:

```text
transaction
trace
tenant
actor
target
context
authorization
autonomy
input
constraints
evidence
expectedOutput
result
errors
next
audit
idempotency
```

Campos mandatórios mínimos são definidos pelo protocolo transacional.

---

## 32. Tracing

Fluxos multiagentes devem preservar:

```text
transactionId
correlationId
causationId
```

- `transactionId`: identifica a transação atual.
- `correlationId`: relaciona transações do mesmo fluxo.
- `causationId`: aponta para a transação causadora.

---

## 33. Idempotência

Ações com side effects devem possuir idempotência, especialmente:

```text
publish
send
change_budget
pause
resume
create_external_object
update_external_object
trigger_webhook
```

Retries não podem produzir side effects duplicados.

---

## 34. Error Contract

Erros internos devem ser estruturados.

Exemplo:

```json
{
  "status": "failed",
  "error": {
    "code": "MISSING_APPROVAL",
    "category": "governance",
    "retryable": false,
    "message": "Publication approval is required."
  },
  "next": {
    "action": "request_approval"
  }
}
```

Evitar respostas máquina↔máquina como `Deu erro`.

---

## 34.1 Convenções canônicas de ações e eventos

### Actions

Commands e queries usam `snake_case`.

Exemplos:

```text
create_copy_variants
analyze_campaign_performance
publish_campaign
```

### Events

Eventos usam:

```text
<domain>.<event>
```

em minúsculas.

Exemplos:

```text
copy.review_requested
quality.passed
media.metrics_updated
journey.email_step_ready
```

### Quality events

`quality.passed`, `quality.passed_with_notes`, `quality.changes_required`, `quality.blocked` e `quality.escalation_required` são os sinais canônicos do quality gate.

Eventos como `copy.approved` ou `design.approved` não devem ser presumidos. Se existir aprovação humana ou de negócio separada do quality gate, ela deve vir do Approval Service por `approval.granted` / `approval.rejected` com referência ao objeto e versão.

### External producer events

Eventos de infraestrutura, domínio ou integrações podem não ser emitidos por um dos 12 agentes. Exemplos:

```text
approval.granted
campaign.created
experiment.completed
asset.analysis_completed
crm.data_updated
contract.won
revenue.recorded
schedule.reporting_due
context.updated
```

Esses eventos devem possuir producer registrado no catálogo de eventos da implementação.

### Self-consumption

Um agente que publica e também assina o mesmo tópico deve ignorar, por padrão, eventos originados pela própria transação/causation quando isso puder gerar loop. Idempotência e tracing continuam obrigatórios.

---

## 34.2 Estados transacionais

Exemplos de payload devem usar somente os estados definidos pelo OATP:

```text
created
accepted
in_progress
waiting
completed
failed
rejected
cancelled
superseded
```

`pending` não é um estado transacional canônico.

---

## 35. Observabilidade

Toda execução deve permitir registrar:

- agent key e version;
- tenant;
- task;
- initiative;
- experiment;
- transaction;
- workflow;
- modelo utilizado;
- tokens;
- custo;
- latência;
- tools chamadas;
- contexto recuperado;
- evidências;
- quality gates;
- approvals;
- resultado;
- erro;
- retries;
- side effects.

O runtime também deve conseguir responder qual contexto foi enviado, qual versão, quais fontes, o que faltava, o que estava stale e quais conflitos existiam.

---

## 36. Model Routing

Agentes não devem presumir uso permanente de um único modelo.

O roteamento pode variar por:

- complexidade;
- risco;
- tarefa;
- latência;
- custo;
- multimodalidade;
- quality gate;
- fallback.

As regras ficam em `../13-ai-model-routing-finops.md`.

O prompt deve permanecer o mais independente possível do fornecedor/modelo específico.

---

## 37. Multi-Tenant Isolation

Regra absoluta:

> **Nenhum dado específico de um tenant pode ser usado para produzir, enriquecer ou decidir conteúdo de outro tenant.**

Inclui conversas, assets, vídeos, transcrições, embeddings, campanhas, personas, Brand OS, experimentos, resultados, memories e outputs de agentes.

---

## 38. Context Promotion

Informações podem nascer em camadas inferiores e, mediante governança, serem promovidas.

Exemplo:

```text
Conversation
↓
Observation
↓
Learning
↓
Proposal
↓
Review
↓
Approval
↓
Brand Truth
```

Nunca promover automaticamente comentário para regra de marca ou resultado isolado para verdade universal.

---

## 39. Outputs e aprendizado

A saída de um agente pode produzir:

- deliverable;
- recommendation;
- decision request;
- handoff;
- event;
- learning proposal;
- context update candidate.

Mudanças em L1–L7 devem obedecer à governança de contexto.

---

## 40. Critérios comuns de avaliação

Todos os agentes devem ser avaliados em:

```text
Context adherence
Role adherence
Tenant isolation
Evidence discipline
Schema compliance
Autonomy compliance
Permission compliance
Handoff quality
Hallucination resistance
Constraint adherence
Version awareness
Quality gate compliance
```

Além disso, cada agente possui critérios especializados.

---

## 41. Testes mínimos de agente

Cada agente deve possuir casos de teste cobrindo pelo menos:

- happy path;
- missing context;
- conflicting context;
- stale context;
- forbidden action;
- approval required;
- out-of-domain request;
- cross-agent handoff;
- invalid schema;
- retry;
- ambiguous immediate request;
- context update candidate;
- insufficient evidence.

---

## 42. Regras para exemplos

Os exemplos devem refletir principalmente o mercado inicial da Oplyra:

```text
SaaS B2B
```

com contexto de aquisição, geração de demanda, pipeline, receita recorrente e vendas B2B.

Não introduzir exemplos de outros segmentos como referência estrutural sem decisão explícita.

---

## 43. Versionamento de agente

Todo agente deve possuir versão.

Modelo:

```yaml
version:
  number: 1
  status: active
  createdAt:
  changedAt:
  reason:
```

Mudanças relevantes em missão, responsabilidade, tools, permissions, autonomy, Context Policy, transaction schema, guardrails ou quality gates devem gerar nova versão.

Execuções históricas permanecem vinculadas à versão utilizada naquele momento.

---

## 44. Nomenclatura de arquivos

Os arquivos de agentes não devem ser numerados.

Padrão:

```text
lowercase-kebab-case.md
```

Exemplos:

```text
orchestrator.md
account-projects.md
paid-media.md
strategy-quality.md
```

---

## 45. Estrutura do diretório

```text
agents/
├── README.md
├── orchestrator.md
├── strategy-quality.md
├── account-projects.md
├── copywriting.md
├── design.md
├── paid-media.md
├── performance-intelligence.md
├── reporting-checkins.md
├── social-media.md
├── email-marketing.md
├── lifecycle.md
└── revenue-intelligence.md
```

---

## 46. Ordem recomendada de especificação

```text
1. Orchestrator
2. Strategy & Quality
3. Account & Projects
4. Copywriting
5. Design
6. Paid Media
7. Performance & Intelligence
8. Reporting & Check-ins
9. Social Media
10. Email Marketing
11. Lifecycle
12. Revenue Intelligence
```

A ordem segue: coordenação → governança → operação → especialistas → análise → comunicação → Growth → receita.

---

## 47. Template base de arquivo

Todo novo agente deve partir deste esqueleto:

````markdown
# [Nome do Agente]

## Agent Metadata

```yaml
agent:
  key:
  name:
  domain:
  plans:
  version:
  objective:
  qualityGate:
  defaultAutonomy:
  contextStack:
    ref: ../19-context-stack.md
  transactionProtocol:
    ref: ../20-agent-transaction-protocol.md
```

## 1. Contexto da Tarefa — Quem é este agente
## 2. Contexto de Tom
## 3. Dados de Antecedentes e Contexto
## 4. Descrição Detalhada da Tarefa
## 5. Exemplos
### Good Example
### Bad Example
### Boundary Example
## 6. Histórico de Conversas
## 7. Descrição ou Pedido Imediato
## 8. Raciocínio e Processo de Decisão
## 9. Formatação de Saída
### Machine Output
### Human Output
## 10. Respostas Pré-preenchidas
## Context Policy
## Task Catalog
## Tools & Permissions
## Autonomy
## Handoffs
## Quality Gates
## Guardrails
## Transaction Contracts
## Evaluation Criteria
## Version History
````

---

## 48. Definition of Ready de um agente

Um agente está pronto para implementação quando possuir:

```text
Identity
Objective
Domain
Responsibilities
Out-of-scope
Context Policy
Task Catalog
Tools
Permissions
Autonomy
Handoffs
Quality Gates
Guardrails
Transaction Contracts
Input Schema
Output Schema
Evaluation Criteria
Examples
Version
```

---

## 49. Definition of Done de uma especificação

A especificação de um agente só deve ser considerada concluída quando for possível responder:

```text
Quem é este agente?
Por que ele existe?
Qual domínio possui?
O que pode fazer?
O que não pode fazer?
Qual contexto precisa?
Quais ferramentas pode usar?
Até onde pode agir?
Quem revisa seu trabalho?
Quais transações aceita?
Quais eventos emite?
Como delega?
Como recebe handoff?
Que formato retorna?
Como lida com falta de contexto?
Como lida com conflito?
Como lida com erro?
Como é auditado?
Como é testado?
```

---

## 50. Regra final

> **Um agente Oplyra não é apenas um prompt. É uma função operacional versionada, contextual, permissionada, transacional, observável e governada.**

A arquitetura deve preservar:

```text
Context
+
Specialization
+
Structured Transactions
+
Evidence
+
Permissions
+
Autonomy
+
Quality Gates
+
Audit
+
Learning
```

Essa é a base comum para todos os agentes definidos neste diretório.
