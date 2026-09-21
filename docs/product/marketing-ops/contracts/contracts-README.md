# Oplyra Contract Registry

**Arquivo de destino:** `docs/product/marketing-ops/contracts/README.md`  
**Versão:** 1.0  
**Status:** Especificação inicial  
**Escopo:** Contratos executáveis e registries da arquitetura agentic da Oplyra  
**Dependências normativas:** `../19-context-stack.md`, `../20-agent-transaction-protocol.md`, `../agents/README.md`, `../09-agentic-architecture.md`, `../10-agent-catalog.md`, `../11-agent-governance.md`

---

# 1. Objetivo

O **Oplyra Contract Registry** transforma as especificações humanas da arquitetura em contratos estruturados, versionados e validáveis por máquina.

Até aqui, a Oplyra possui:

```text
Produto e domínio
+
Context Stack
+
Agent Transaction Protocol
+
12 agentes especializados
+
Governança
```

O Contract Registry adiciona:

```text
JSON Schema
+
Registries
+
Canonical IDs
+
Validation Rules
+
Fixtures
+
Compatibility Rules
+
Contract Tests
```

Sua função principal é:

> **Garantir que agentes, runtime, workflows, integrações e serviços internos compartilhem contratos explícitos em vez de depender de interpretações livres de texto.**

---

# 2. Princípio fundamental

A documentação Markdown explica:

```text
por que
como
quando
```

Os schemas e registries definem:

```text
o que é válido
o que é inválido
quem é owner
qual versão existe
qual contrato deve ser usado
```

Regra:

> **Markdown é a especificação humana. JSON Schema e Registries são a especificação validável do runtime.**

---

# 3. O que este registry não é

O Contract Registry não é:

- banco de dados de produção;
- implementação de runtime;
- ferramenta de workflow;
- catálogo de prompts;
- contexto do tenant;
- event bus;
- fila;
- API gateway;
- substituto do domínio;
- substituto dos documentos normativos.

Ele é a fonte de contratos para esses componentes.

---

# 4. Estrutura de diretórios

```text
contracts/
├── README.md
│
├── schemas/
│   ├── agent-definition.schema.json
│   ├── context-package.schema.json
│   ├── transaction-envelope.schema.json
│   ├── task.schema.json
│   ├── handoff.schema.json
│   ├── quality-review.schema.json
│   ├── approval.schema.json
│   ├── error.schema.json
│   ├── context-update-candidate.schema.json
│   └── learning-record.schema.json
│
├── registries/
│   ├── agents.json
│   ├── actions.json
│   ├── events.json
│   ├── errors.json
│   ├── tools.json
│   ├── permissions.json
│   ├── handoffs.json
│   └── quality-gates.json
│
└── fixtures/
    ├── valid/
    └── invalid/
```

A estrutura poderá crescer, mas os conceitos principais devem permanecer:

```text
schemas
registries
fixtures
```

---

# 5. Responsabilidade dos diretórios

## `schemas/`

Valida:

- estrutura;
- campos obrigatórios;
- enums;
- tipos;
- formatos;
- referências locais;
- invariantes de payload.

## `registries/`

Responde deterministicamente:

```text
Quais agentes existem?
Quais actions existem?
Quem é owner?
Quais eventos existem?
Quem produz?
Quem consome?
Quais ferramentas existem?
Quais erros existem?
```

## `fixtures/`

Contém exemplos válidos e inválidos para:

- contract tests;
- regressão;
- documentação;
- onboarding técnico.

---

# 6. Fonte de verdade e precedência

```text
Decisões aprovadas
↓
Documentos normativos
↓
Contract Registry
↓
Implementação
```

A implementação não deve introduzir silenciosamente:

- action inexistente;
- agent key inexistente;
- permission inexistente;
- autonomy inexistente;
- event inexistente;
- error code inexistente.

Nova capability deve seguir:

```text
documentar
↓
registrar
↓
versionar
↓
implementar
```

---

# 7. Versionamento

Contratos relevantes usam:

```text
major.minor
```

Exemplos:

```text
1.0
1.1
2.0
```

## Minor

Mudança backward compatible.

Exemplos:

- campo opcional novo;
- nova action independente;
- novo evento independente.

## Major

Mudança incompatível.

Exemplos:

- remoção de campo obrigatório;
- mudança de tipo;
- mudança semântica;
- rename de action existente;
- mudança de identidade canônica.

Runtime deve rejeitar `schemaVersion` desconhecido em vez de inferir compatibilidade.

---

# 8. Canonical IDs e naming

## Agent keys

```text
lowercase-kebab-case
```

Exemplo:

```text
performance-intelligence-agent
```

## Domains

```text
snake_case
```

Exemplo:

```text
revenue_intelligence
```

## Actions

```text
snake_case
```

Exemplo:

```text
analyze_revenue_attribution
```

## Events

```text
domain.event
```

Exemplo:

```text
quality.passed
```

## Error codes

```text
UPPER_SNAKE_CASE
```

Exemplo:

```text
MISSING_APPROVAL
```

## Schema files

```text
lowercase-kebab-case.schema.json
```

---

# 9. JSON Schema

Versão inicial recomendada:

```text
JSON Schema Draft 2020-12
```

Todo schema deve declarar:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema"
}
```

Cada schema deve possuir `$id` estável.

Padrão conceitual:

```text
https://schemas.oplyra.com/<domain>/<schema-name>/<version>
```

Schemas compartilhados devem reutilizar `$defs` para referências como:

```text
tenantRef
agentRef
taskRef
initiativeRef
experimentRef
money
timestamp
approvalRef
evidenceRef
```

---

# 10. Schemas universais iniciais

A primeira versão deverá conter:

```text
agent-definition.schema.json
context-package.schema.json
transaction-envelope.schema.json
task.schema.json
handoff.schema.json
quality-review.schema.json
approval.schema.json
error.schema.json
context-update-candidate.schema.json
learning-record.schema.json
```

---

# 11. Agent Definition

`agent-definition.schema.json` representa:

```text
identity
domain
plans
version
objective
owner domain
quality gate
autonomy
context policy
tools
transactions
evaluation metadata
```

Exemplo:

```json
{
  "key": "copywriting-agent",
  "name": "Agente de Copywriting",
  "domain": "copywriting",
  "version": 1,
  "plans": ["performance", "growth"],
  "objective": "Transformar contexto estratégico aprovado em mensagens rastreáveis.",
  "ownerDomain": "copywriting",
  "qualityGate": {
    "primary": "strategy-quality-agent"
  }
}
```

Validações cross-registry devem impedir:

```text
agent key duplicado
domain inexistente
plan inexistente
quality gate inexistente
autonomy fora do enum
tool inexistente
action inexistente
```

---

# 12. Context Package

`context-package.schema.json` representa o contexto montado para uma execução.

Pode referenciar:

```text
L0
L1
L2
L3
L4
L5
L6
L7
L8
evidence
permissions
autonomy
missingContext
conflicts
```

Metadados mínimos quando aplicável:

```text
generatedAt
tenantId
agentKey
taskId
sourceVersions
freshness
missingContext
conflicts
```

O Context Package não deve ser um data dump. Deve privilegiar referências, versões, resumos e campos selecionados.

---

# 13. Transaction Envelope

`transaction-envelope.schema.json` é o contrato central da comunicação agentic.

Tipos:

```text
command
query
event
response
```

Blocos possíveis:

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
error
next
audit
idempotency
```

Campos mínimos incluem, conforme tipo:

```text
transaction.id
transaction.schemaVersion
transaction.type
transaction.action ou transaction.event
transaction.status
tenant.tenantId
```

Estados transacionais canônicos:

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

---

# 14. Trace e idempotência

Trace deve suportar:

```text
correlationId
causationId
workflowId
taskId
```

Transações do mesmo fluxo compartilham `correlationId`.

Transações derivadas apontam para `causationId` quando aplicável.

Se uma action possuir:

```text
requiresIdempotency = true
```

então `idempotency.key` é obrigatório antes de side effect.

---

# 15. Task Contract

`task.schema.json` representa uma unidade de trabalho.

Campos conceituais:

```text
id
tenantId
initiativeId
experimentId
type
title
description
status
priority
owner
assignedAgent
dueAt
dependencies
acceptanceCriteria
approvals
```

Estados:

```text
backlog
ready
in_progress
waiting_dependency
waiting_approval
blocked
completed
cancelled
failed
```

---

# 16. Handoff Contract

`handoff.schema.json` representa transferência estruturada entre agentes.

Campos:

```text
id
tenantId
fromAgent
toAgent
taskId
objective
initiativeId
experimentId
inputRefs
decisionsMade
constraints
openQuestions
expectedOutput
```

Invariante inicial:

```text
fromAgent != toAgent
```

salvo futuro caso explicitamente modelado.

---

# 17. Quality Review Contract

`quality-review.schema.json` representa quality gate agentic.

Campos:

```text
reviewId
tenantId
reviewerAgent
target
targetVersion
gateType
gateStatus
findings
limitations
nextAction
```

Gate status:

```text
passed
passed_with_notes
changes_required
blocked
escalation_required
```

Finding severity:

```text
info
low
medium
high
blocking
```

---

# 18. Approval Contract

`approval.schema.json` representa aprovação formal.

Campos:

```text
approvalId
tenantId
target
targetVersion
scope
status
requestedBy
approvedBy
requestedAt
decidedAt
expiresAt
policyRef
```

Status:

```text
pending
approved
rejected
expired
revoked
stale
```

Approval deve ser:

```text
target-specific
+
version-specific
+
scope-specific
```

---

# 19. Error Contract

`error.schema.json` representa erro estruturado.

Campos:

```text
code
category
severity
retryable
message
details
defaultNextAction
```

Todo error code usado pelo runtime deve existir em `registries/errors.json`.

---

# 20. Context Update Candidate

`context-update-candidate.schema.json` representa proposta de alteração contextual.

Campos:

```text
id
tenantId
targetLayer
targetField
currentValue
proposedValue
source
evidenceRefs
confidence
reason
requiresApproval
status
```

Status:

```text
proposed
under_review
approved
rejected
applied
superseded
```

---

# 21. Learning Record

`learning-record.schema.json` representa aprendizado derivado de evidência.

Campos:

```text
id
tenantId
source
context
evidence
conclusion
confidence
limitations
decision
proposedUpdates
reviewStatus
nextExperiment
```

Learning não altera L1/L2 automaticamente.

---

# 22. Registries

Cada registry deve possuir pelo menos:

```text
registryVersion
generatedAt
entries
```

---

# 23. Agents Registry

`agents.json` registra os 12 agentes iniciais:

```text
orchestrator-agent
strategy-quality-agent
account-projects-agent
copywriting-agent
design-agent
paid-media-agent
performance-intelligence-agent
reporting-checkins-agent
social-media-agent
email-marketing-agent
lifecycle-agent
revenue-intelligence-agent
```

Cada entrada contém:

```text
key
name
domain
plans
version
status
definitionSchema
documentationRef
```

Status inicial permitido:

```text
active
beta
deprecated
disabled
```

---

# 24. Actions Registry

`actions.json` registra Commands e Queries.

Cada entrada contém:

```text
action
type
ownerAgent
domain
risk
sideEffect
requiresApproval
requiresIdempotency
inputSchema
outputSchema
plans
```

`type`:

```text
command
query
```

Risk:

```text
low
medium
high
critical
```

Toda action executável deve possuir owner.

Exemplo de query:

```json
{
  "action": "compare_copy_versions",
  "type": "query",
  "ownerAgent": "copywriting-agent",
  "domain": "copywriting",
  "risk": "low",
  "sideEffect": false,
  "requiresApproval": false,
  "requiresIdempotency": false
}
```

Exemplo de command crítico:

```json
{
  "action": "publish_campaign",
  "type": "command",
  "ownerAgent": "paid-media-agent",
  "domain": "paid_media",
  "risk": "high",
  "sideEffect": true,
  "requiresApproval": true,
  "requiresIdempotency": true
}
```

---

# 25. Events Registry

`events.json` registra eventos canônicos.

Campos:

```text
event
producer
consumers
payloadSchema
category
durability
```

Producer pode ser:

```text
agent
service
integration
runtime
scheduler
```

Exemplo agentic:

```json
{
  "event": "quality.passed",
  "producer": {
    "type": "agent",
    "id": "strategy-quality-agent"
  },
  "consumers": [
    "orchestrator-agent",
    "account-projects-agent"
  ]
}
```

Exemplo externo:

```json
{
  "event": "contract.won",
  "producer": {
    "type": "integration",
    "id": "commercial-adapter"
  },
  "consumers": [
    "performance-intelligence-agent",
    "lifecycle-agent",
    "revenue-intelligence-agent"
  ]
}
```

Todo evento consumido deve possuir producer registrado, ainda que externo aos 12 agentes.

---

# 26. Errors Registry

`errors.json` registra erros canônicos.

Campos:

```text
code
category
severity
retryable
defaultNextAction
description
```

Categorias iniciais:

```text
validation
context
governance
permission
entitlement
integration
asset
tracking
budget
consent
journey
analytics
runtime
external
```

Primeiro conjunto recomendado:

```text
TRANSACTION_SCHEMA_INVALID
TRANSACTION_SCHEMA_VERSION_UNSUPPORTED
AGENT_NOT_FOUND
ACTION_NOT_FOUND
EVENT_NOT_REGISTERED
TENANT_REQUIRED
TENANT_MISMATCH
CONTEXT_MISSING
CONTEXT_CONFLICT
PERMISSION_DENIED
ENTITLEMENT_REQUIRED
MISSING_APPROVAL
STALE_APPROVAL
INVALID_STATE_TRANSITION
ASSET_RIGHTS_UNCONFIRMED
TRACKING_NOT_READY
BUDGET_LIMIT_EXCEEDED
RECIPIENT_NOT_ELIGIBLE
SUPPRESSION_REQUIRED
UNBOUNDED_LOOP_DETECTED
DUPLICATE_ENROLLMENT
INTEGRATION_UNAVAILABLE
ATTRIBUTION_DATA_INSUFFICIENT
REVENUE_DEFINITION_REQUIRED
```

---

# 27. Tools Registry

`tools.json` registra ferramentas disponíveis aos agentes.

Campos:

```text
key
name
category
allowedPermissions
risk
sideEffects
providerIndependent
```

Exemplo:

```json
{
  "key": "campaignRepository",
  "name": "Campaign Repository",
  "category": "domain_repository",
  "allowedPermissions": ["read", "write", "read_write"],
  "sideEffects": true,
  "providerIndependent": true
}
```

---

# 28. Permissions Registry

`permissions.json` registra permissões canônicas:

```text
none
read
write
read_write
execute
approve
```

Permission não é autonomy.

Exemplo:

```text
tool permission = execute
```

não significa:

```text
autonomy = policy_execute
```

Ambos precisam ser satisfeitos.

---

# 29. Handoffs Registry

`handoffs.json` registra handoffs esperados entre agentes.

Cada entrada pode declarar:

```text
fromAgent
toAgent
allowedActions
requiredRefs
expectedOutput
```

Produção não deve criar handoff arbitrário fora do registry sem contrato correspondente.

---

# 30. Quality Gates Registry

`quality-gates.json` registra gates canônicos.

Exemplos:

```text
strategy_gate
brand_gate
claim_gate
evidence_gate
creative_gate
experiment_gate
analysis_gate
reporting_gate
learning_gate
publication_gate
```

Um gate pode combinar:

```text
deterministic checks
+
agentic review
+
human approval
```

---

# 31. Fixtures

Fixtures devem existir para contratos críticos.

## Valid

```text
valid/agent-definition-copywriting.json
valid/transaction-query-performance.json
valid/handoff-copy-to-design.json
valid/quality-review-passed.json
valid/publish-campaign-approved.json
valid/email-send-eligible.json
valid/lifecycle-enrollment.json
valid/revenue-attribution-partial.json
```

## Invalid

```text
invalid/unknown-agent.json
invalid/unknown-action.json
invalid/autonomy-invalid.json
invalid/cross-tenant-handoff.json
invalid/publish-campaign-without-approval.json
invalid/publish-campaign-without-idempotency.json
invalid/email-send-suppressed-recipient.json
invalid/lifecycle-unbounded-loop.json
invalid/quality-review-without-version.json
invalid/revenue-without-definition.json
```

---

# 32. Contract Tests

Categorias mínimas:

```text
schema validation
registry validation
cross-reference validation
business invariant validation
compatibility validation
fixture validation
```

## Schema Validation

Pergunta:

> O JSON está estruturalmente válido?

## Registry Validation

Pergunta:

> Os IDs utilizados existem?

## Cross-reference Validation

Exemplo:

```text
actions.ownerAgent
→ agents.json
```

## Business Invariant Validation

Regras que não cabem apenas em JSON Schema:

```text
publish_campaign requires approval
publish_campaign requires idempotency
cross-tenant handoff is forbidden
Growth agent requires Growth entitlement
quality review requires target version
```

## Compatibility Validation

Pergunta:

> A nova versão continua compatível com consumidores anteriores?

---

# 33. Validações de build

Antes de deploy, validar:

```text
schemas
registries
fixtures
cross-refs
event producers
action owners
enums
side-effect rules
```

Eventos órfãos devem falhar no build.

Actions sem owner devem falhar no build.

Tools inexistentes devem falhar no build.

Permissions desconhecidas devem falhar no build.

---

# 34. Autonomy

Enum oficial:

```text
recommend
draft
approval_required
policy_execute
```

Quando uma capability não existe para um agente:

```text
tool permission = none
+
out-of-scope declaration
```

Não usar:

```text
autonomy = none
```

---

# 35. Security invariants

Regras obrigatórias:

```text
tenantId obrigatório em transação tenant-scoped
cross-tenant refs proibidas
external side effect auditável
critical action permissionada
critical action com approval/policy
idempotência para side effect marcado
```

---

# 36. Audit invariants

Side effect deve registrar:

```text
actor
tenant
action
target
approval/policy
timestamp
result
transactionId
```

---

# 37. Evidence invariants

Afirmações factuais críticas devem possuir `evidenceRefs` quando a política exigir.

Evidence deve preservar:

```text
source
scope
status
freshness
limitations
```

---

# 38. Context invariants

Context Package deve:

```text
pertencer ao mesmo tenant
declarar versão
declarar missing context relevante
declarar conflicts relevantes
```

---

# 39. Retry invariant

Se:

```text
retryable = false
```

runtime não realiza retry automático.

Se:

```text
requiresIdempotency = true
```

mas idempotency estiver ausente:

```text
reject before execution
```

---

# 40. Provider independence

Schemas internos não devem espelhar diretamente SDK de:

- Meta;
- Google;
- provedor de e-mail;
- LLM provider;
- CRM;
- billing provider.

Adapters traduzem contratos externos para contratos Oplyra.

Regra:

> **O domínio interno define os contratos; integrações se adaptam a eles.**

---

# 41. Arquivos, datasets e credentials

Para arquivos grandes, usar:

```text
assetRef
documentRef
datasetRef
```

Não transportar binários ou datasets extensos inline.

Para credenciais, usar:

```text
credentialRef
connectionRef
```

Nunca transportar:

```text
raw token
password
API secret
```

---

# 42. Deterministic validation first

Antes de LLM, validar deterministicamente quando possível:

```text
schema
permissions
entitlement
approval
budget
asset rights
consent
idempotency
```

LLM não é o mecanismo de segurança estrutural para:

```text
tenant isolation
permission
approval
idempotency
consent
budget ceiling
```

---

# 43. Contract Freeze v1

Antes de escrever runtime estrutural, deve ocorrer:

```text
Contract Registry Freeze v1
```

Freeze significa estabilidade suficiente para implementação, não imutabilidade eterna.

Mudanças posteriores seguem:

```text
change proposal
↓
compatibility assessment
↓
version bump
↓
migration strategy
```

---

# 44. Critérios para Freeze v1

```text
[ ] schemas universais válidos
[ ] agents registry completo
[ ] actions registry completo
[ ] events registry completo
[ ] errors registry completo
[ ] tools registry completo
[ ] permissions registry completo
[ ] handoffs registry completo
[ ] quality gates registry completo
[ ] fixtures mínimas
[ ] contract tests especificados
[ ] zero referências órfãs
[ ] zero enums desconhecidos
[ ] zero side effects sem política
```

---

# 45. O que ainda não deve ser feito

Antes do Freeze v1, evitar:

- migrations estruturais dependentes dos schemas;
- runtime hardcoded;
- event handlers com nomes improvisados;
- actions fora do registry;
- tools sem catálogo;
- error codes locais;
- lógica de approval espalhada;
- autonomy hardcoded por agente;
- payloads livres sem validação.

---

# 46. Ordem de construção recomendada

Primeiro schemas universais:

```text
1. agent-definition.schema.json
2. transaction-envelope.schema.json
3. context-package.schema.json
4. task.schema.json
5. handoff.schema.json
6. quality-review.schema.json
7. approval.schema.json
8. error.schema.json
9. context-update-candidate.schema.json
10. learning-record.schema.json
```

Depois registries:

```text
11. agents.json
12. permissions.json
13. tools.json
14. actions.json
15. events.json
16. errors.json
17. handoffs.json
18. quality-gates.json
```

Depois:

```text
19. fixtures
20. contract tests
21. Freeze v1
```

---

# 47. Schemas específicos por agente

Não criar todos de imediato.

Primeiro congelar contratos universais.

Depois criar por capability, por exemplo:

```text
schemas/copywriting/
├── create-copy-variants.input.schema.json
└── create-copy-variants.output.schema.json
```

Estrutura futura possível:

```text
schemas/
├── core/
├── orchestration/
├── strategy-quality/
├── project-management/
├── copywriting/
├── design/
├── paid-media/
├── performance/
├── reporting/
├── social-media/
├── email-marketing/
├── lifecycle/
└── revenue-intelligence/
```

---

# 48. Registry ownership

Responsabilidade conceitual:

```text
Product / Architecture
→ define contrato

Engineering
→ implementa validação

Quality
→ valida invariantes

Agents
→ consomem contratos
```

Nenhum agente deve editar autonomamente o Contract Registry.

---

# 49. Documentation refs

Cada registry entry deve, quando possível, apontar para:

```text
documentationRef
```

Exemplo:

```text
../agents/copywriting.md
```

Na implementação, poderá também apontar para:

```text
inputSchema
outputSchema
handlerKey
```

sem acoplar o domínio a framework específico.

---

# 50. Observabilidade de contratos

Em produção, deve ser possível registrar:

```text
schema version
registry version
agent version
action
event
validation result
```

para cada transação relevante.

Payload inválido deve falhar antes de side effect.

---

# 51. Backward compatibility

Consumers não devem assumir que todos os campos opcionais existem.

Producers não removem campo obrigatório sem major version.

Para contratos críticos, preferir política estrita de campos desconhecidos, como `unevaluatedProperties: false`, quando adequado.

Extensibilidade deve usar campos explícitos, como:

```text
metadata
extensions
providerMetadata
```

em vez de permitir campos arbitrários em todos os objetos.

---

# 52. Definition of Ready

O Contract Registry está pronto para implementação quando for possível responder deterministicamente:

```text
Esse agente existe?
Essa action existe?
Quem é owner?
Esse payload é válido?
Esse evento existe?
Quem produz?
Quem consome?
Essa permission existe?
Essa tool existe?
Essa action exige approval?
Essa action exige idempotency?
Esse erro pode retry?
Esse handoff é válido?
Esse quality gate existe?
```

---

# 53. Definition of Done da etapa pré-runtime

A etapa de registro estará concluída quando:

```text
Schemas universais
+
Registries canônicos
+
Fixtures
+
Contract tests
+
Freeze v1
```

estiverem aprovados.

---

# 54. Regra final

> **Nenhum comportamento estrutural do runtime agentic da Oplyra deve depender de um nome, enum, payload ou permissão que exista apenas informalmente em um prompt.**

Toda capability operacional relevante deve possuir:

```text
identidade
+
schema
+
registry
+
owner
+
version
+
validation
+
test
```

antes de ser considerada pronta para implementação.
