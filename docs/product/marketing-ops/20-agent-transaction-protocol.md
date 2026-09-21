# Oplyra Agent Transaction Protocol

## Protocolo JSON transacional para agentes, runtime, workflows e APIs internas

**Versão:** 1.0  
**Data:** 16 de setembro de 2026  
**Status:** Aprovado  
**Escopo:** comunicação máquina↔máquina da Oplyra  
**Documento relacionado:** `19-context-stack.md`

---

## 1. Objetivo

O **Oplyra Agent Transaction Protocol (OATP)** define o contrato padrão de comunicação entre:

- agentes;
- Orquestrador;
- runtime agentic;
- workflows;
- scheduler;
- filas;
- serviços internos;
- adapters;
- integrações internas;
- APIs de automação da Oplyra.

Princípio:

> **Humanos podem conversar com a Oplyra em linguagem natural. Componentes da Oplyra devem conversar entre si por contratos JSON versionados, transacionais e auditáveis.**

Linguagem natural pode existir dentro dos campos do contrato, mas nunca substituir metadados estruturados obrigatórios.

---

# 2. Por que JSON transacional

Um payload comum como:

```json
{
  "headline": "..."
}
```

não é suficiente para uma plataforma multiagentes auditável.

A Oplyra precisa saber:

```text
quem pediu
para qual tenant
qual ação
qual agente
qual task
qual initiative
qual experiment
qual versão de contexto
qual autonomia
qual autorização
qual transação causou esta
se pode ser repetida
qual resultado ocorreu
qual evidência foi usada
qual erro ocorreu
qual próximo passo é recomendado
```

Por isso, toda mensagem interna relevante deve usar um **envelope transacional**.

---

# 3. Tipos fundamentais de mensagem

O protocolo define quatro tipos principais.

## 3.1 Command

Solicita mudança de estado ou execução.

Exemplos:

```text
create_copy_variants
prepare_campaign
publish_campaign
pause_campaign
change_budget
send_email
```

```json
{
  "type": "command",
  "action": "create_copy_variants"
}
```

## 3.2 Query

Solicita leitura, análise ou recuperação sem efeito externo esperado.

Exemplos:

```text
analyze_campaign_performance
get_campaign_context
compare_variants
retrieve_brand_truth
```

```json
{
  "type": "query",
  "action": "analyze_campaign_performance"
}
```

## 3.3 Event

Declara algo que já aconteceu.

Exemplos:

```text
experiment.completed
crm.sync_failed
campaign.published
contract.won
approval.granted
```

```json
{
  "type": "event",
  "event": "experiment.completed"
}
```

## 3.4 Response

Representa resultado de command ou query.

```json
{
  "type": "response",
  "status": "completed"
}
```

---

# 4. Oplyra Transaction Envelope

Estrutura conceitual global:

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
  "input": {},
  "constraints": {},
  "evidence": {},
  "expectedOutput": {},
  "result": {},
  "error": {},
  "next": {},
  "audit": {},
  "idempotency": {}
}
```

Cada operação especializa `input`, `result` e, quando necessário, `constraints`.

---

# 5. transaction

Campos recomendados:

```json
{
  "transaction": {
    "id": "txn_01J...",
    "schemaVersion": "1.0",
    "type": "command",
    "action": "create_copy_variants",
    "status": "created",
    "createdAt": "2026-09-16T14:00:00Z",
    "expiresAt": null
  }
}
```

## 5.1 transaction.id

Identificador único da mensagem.

## 5.2 schemaVersion

Obrigatório. Permite evolução compatível.

## 5.3 type

Um de:

```text
command
query
event
response
```

## 5.4 action/event

`command`, `query` e `response` usam `action`.

`event` usa `event`.

## 5.5 status

Possíveis estados:

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

# 6. trace

Toda operação pertencente a um fluxo deve transportar tracing.

```json
{
  "trace": {
    "correlationId": "corr_01J...",
    "causationId": "txn_previous",
    "workflowId": "wf_campaign_01",
    "taskId": "task_998",
    "parentTransactionId": "txn_parent"
  }
}
```

## 6.1 correlationId

Agrupa todas as transações de uma mesma cadeia lógica.

Exemplo:

```text
User Request
↓
Orchestrator
↓
Strategy
↓
Copy
↓
Design
↓
Quality
↓
Media
```

Todas compartilham o mesmo `correlationId`.

## 6.2 causationId

Aponta para a transação que causou diretamente a atual.

Isso permite reconstruir causalidade operacional.

## 6.3 workflowId

Identifica workflow persistente quando aplicável.

## 6.4 taskId

Referencia a task do L7.

---

# 7. tenant

Obrigatório em toda mensagem que manipule contexto privado.

```json
{
  "tenant": {
    "tenantId": "tenant_123"
  }
}
```

Regra:

> nenhuma transação privada é processada sem `tenantId` resolvido e validado.

Subrecursos sempre devem ser validados dentro do mesmo tenant.

---

# 8. actor

Quem originou ou executou a transação.

```json
{
  "actor": {
    "type": "agent",
    "id": "orchestrator-agent",
    "userId": null,
    "role": null
  }
}
```

Tipos:

```text
user
agent
system
workflow
schedule
integration
service
```

---

# 9. target

Define destinatário lógico.

```json
{
  "target": {
    "agent": "copywriting-agent",
    "domain": "copywriting",
    "service": null
  }
}
```

Pode apontar para:

- agente;
- domínio;
- serviço;
- adapter;
- workflow.

---

# 10. context

O envelope não precisa carregar todo o contexto materializado. Deve transportar referências e versões suficientes.

```json
{
  "context": {
    "contextPackageId": "ctx_774",
    "contextVersion": 12,
    "initiativeId": "cmp_2026_q4_01",
    "experimentId": "exp_091",
    "hypothesisId": "hyp_091",
    "taskId": "task_998",
    "brandTruthVersion": 5,
    "tenantFoundationVersion": 3
  }
}
```

O `Context Assembly` definido em `19-context-stack.md` resolve o conteúdo necessário.

---

# 11. authorization

Descreve autorização e políticas já resolvidas ou que ainda precisam ser verificadas.

```json
{
  "authorization": {
    "permissionSet": "marketing_manager",
    "requiredPermissions": [
      "campaign.write"
    ],
    "policyRefs": [
      "policy_publication_v2"
    ],
    "approvalRefs": []
  }
}
```

Autoridade deve ser verificada no serviço responsável. O payload não é prova suficiente por si só.

---

# 12. autonomy

Define limite agentic da execução.

```json
{
  "autonomy": {
    "level": "draft"
  }
}
```

Valores:

```text
recommend
draft
approval_required
policy_execute
```

Nenhum agente ultrapassa o nível recebido.

---

# 13. input

É específico da operação.

Exemplo:

```json
{
  "input": {
    "objective": "Create challenger copy",
    "variantRole": "challenger",
    "testedDimension": "angle",
    "angle": "unattributed_revenue",
    "quantity": 3
  }
}
```

Todo `action` deve possuir JSON Schema versionado para seu `input`.

---

# 14. constraints

Restrições precisam ser explícitas quando relevantes.

```json
{
  "constraints": {
    "keepConstant": [
      "offer",
      "cta",
      "format"
    ],
    "forbidden": [
      "unauthorized_claims"
    ],
    "maxWords": 150
  }
}
```

---

# 15. evidence

Referências às evidências utilizadas ou exigidas.

```json
{
  "evidence": {
    "requiredRefs": [],
    "providedRefs": [
      "brand_claim_14",
      "proof_09"
    ]
  }
}
```

Evidências pertencem ao mesmo tenant e precisam respeitar escopo/uso.

---

# 16. expectedOutput

Todo command/query deve poder declarar contrato esperado.

```json
{
  "expectedOutput": {
    "schema": "oplyra.copy.variant.v1",
    "contentType": "application/json"
  }
}
```

Isso evita respostas livres impossíveis de consumir deterministicamente.

---

# 17. result

Resposta de sucesso.

```json
{
  "result": {
    "variants": [
      {
        "id": "variant_01",
        "headline": "Quanto da sua aquisição realmente vira receita?",
        "primaryText": "...",
        "cta": "request_demo"
      }
    ]
  }
}
```

`result` também possui schema específico.

---

# 18. error

Erros também são objetos estruturados.

```json
{
  "error": {
    "code": "MISSING_APPROVAL",
    "category": "governance",
    "retryable": false,
    "message": "Publication approval is required.",
    "details": {
      "requiredApproval": "publication"
    }
  }
}
```

Categorias iniciais:

```text
validation
authorization
governance
context
integration
rate_limit
external_provider
timeout
conflict
idempotency
system
unknown
```

---

# 19. next

Permite orientar o próximo passo sem obrigar execução.

```json
{
  "next": {
    "recommendedAction": "quality_review",
    "targetAgent": "strategy-quality-agent",
    "reason": "Creative output requires quality gate."
  }
}
```

`next` é recomendação operacional, não autorização.

---

# 20. audit

Pode transportar metadados de auditoria.

```json
{
  "audit": {
    "requestedBy": "user_123",
    "approvedBy": null,
    "executedBy": "copywriting-agent",
    "recordRefs": []
  }
}
```

O audit log canônico deve ficar no storage persistente, não depender apenas do payload.

---

# 21. idempotency

Obrigatório em operações com side effects relevantes.

```json
{
  "idempotency": {
    "key": "campaign_123-publish-v4"
  }
}
```

Aplicar especialmente a:

```text
publish_campaign
create_external_ad
pause_campaign
change_budget
send_email
trigger_webhook
create_external_resource
```

Se houver retry, a Oplyra não deve repetir o efeito.

---

# 22. Command completo — Copywriting

```json
{
  "transaction": {
    "id": "txn_01J_A",
    "schemaVersion": "1.0",
    "type": "command",
    "action": "create_copy_variants",
    "status": "created",
    "createdAt": "2026-09-16T14:00:00Z"
  },
  "trace": {
    "correlationId": "corr_campaign_123",
    "causationId": "txn_orchestrator_01",
    "workflowId": "wf_campaign_01",
    "taskId": "task_998"
  },
  "tenant": {
    "tenantId": "tenant_123"
  },
  "actor": {
    "type": "agent",
    "id": "orchestrator-agent"
  },
  "target": {
    "agent": "copywriting-agent",
    "domain": "copywriting"
  },
  "context": {
    "contextPackageId": "ctx_774",
    "initiativeId": "cmp_2026_q4_01",
    "experimentId": "exp_091",
    "hypothesisId": "hyp_091",
    "taskId": "task_998"
  },
  "authorization": {
    "requiredPermissions": [
      "content.create"
    ]
  },
  "autonomy": {
    "level": "draft"
  },
  "input": {
    "objective": "Create challenger copy",
    "variantRole": "challenger",
    "testedDimension": "angle",
    "angle": "unattributed_revenue",
    "quantity": 3
  },
  "constraints": {
    "keepConstant": [
      "offer",
      "cta",
      "format"
    ],
    "forbidden": [
      "unauthorized_claims"
    ]
  },
  "expectedOutput": {
    "schema": "oplyra.copy.variants.v1",
    "contentType": "application/json"
  },
  "idempotency": {
    "key": "task_998-copy-variants-v1"
  }
}
```

---

# 23. Response completa — Copywriting

```json
{
  "transaction": {
    "id": "txn_01J_B",
    "schemaVersion": "1.0",
    "type": "response",
    "action": "create_copy_variants",
    "status": "completed",
    "createdAt": "2026-09-16T14:00:05Z"
  },
  "trace": {
    "correlationId": "corr_campaign_123",
    "causationId": "txn_01J_A",
    "workflowId": "wf_campaign_01",
    "taskId": "task_998"
  },
  "tenant": {
    "tenantId": "tenant_123"
  },
  "actor": {
    "type": "agent",
    "id": "copywriting-agent"
  },
  "target": {
    "agent": "orchestrator-agent"
  },
  "context": {
    "initiativeId": "cmp_2026_q4_01",
    "experimentId": "exp_091",
    "taskId": "task_998"
  },
  "result": {
    "variants": [
      {
        "id": "variant_01",
        "headline": "Quanto da sua aquisição realmente vira receita?",
        "primaryText": "...",
        "cta": "request_demo"
      }
    ]
  },
  "evidence": {
    "providedRefs": [
      "brand_claim_14",
      "proof_09"
    ]
  },
  "next": {
    "recommendedAction": "quality_review",
    "targetAgent": "strategy-quality-agent"
  }
}
```

---

# 24. Query

Queries não devem alterar estado de negócio como efeito esperado.

```json
{
  "transaction": {
    "id": "txn_q_01",
    "schemaVersion": "1.0",
    "type": "query",
    "action": "analyze_experiment",
    "status": "created",
    "createdAt": "2026-09-16T14:10:00Z"
  },
  "trace": {
    "correlationId": "corr_exp_091",
    "taskId": "task_analysis_01"
  },
  "tenant": {
    "tenantId": "tenant_123"
  },
  "actor": {
    "type": "agent",
    "id": "orchestrator-agent"
  },
  "target": {
    "agent": "performance-intelligence-agent",
    "domain": "performance"
  },
  "context": {
    "experimentId": "exp_091"
  },
  "input": {
    "analysisWindow": "experiment_to_date"
  },
  "expectedOutput": {
    "schema": "oplyra.experiment.analysis.v1"
  }
}
```

---

# 25. Event

Eventos descrevem fatos que ocorreram.

```json
{
  "transaction": {
    "id": "evt_01",
    "schemaVersion": "1.0",
    "type": "event",
    "event": "experiment.completed",
    "status": "completed",
    "createdAt": "2026-09-16T15:00:00Z"
  },
  "trace": {
    "correlationId": "corr_exp_091"
  },
  "tenant": {
    "tenantId": "tenant_123"
  },
  "actor": {
    "type": "system",
    "id": "experiment-service"
  },
  "context": {
    "initiativeId": "cmp_2026_q4_01",
    "experimentId": "exp_091"
  },
  "result": {
    "completedAt": "2026-09-16T15:00:00Z"
  }
}
```

Eventos devem ser idempotentes no consumo ou possuir identificador deduplicável.

---

# 26. Agent handoff

Handoffs são comandos/requisições transacionais.

Exemplo Copy → Design:

```json
{
  "transaction": {
    "id": "txn_handoff_01",
    "schemaVersion": "1.0",
    "type": "command",
    "action": "create_visual_brief",
    "status": "created",
    "createdAt": "2026-09-16T14:20:00Z"
  },
  "trace": {
    "correlationId": "corr_campaign_123",
    "causationId": "txn_copy_result",
    "taskId": "task_design_01"
  },
  "tenant": {
    "tenantId": "tenant_123"
  },
  "actor": {
    "type": "agent",
    "id": "copywriting-agent"
  },
  "target": {
    "agent": "design-agent",
    "domain": "design"
  },
  "context": {
    "initiativeId": "cmp_2026_q4_01",
    "experimentId": "exp_091"
  },
  "input": {
    "copyVariantRef": "copy_var_b",
    "hypothesisRef": "hyp_091",
    "messageDecisionRefs": [
      "decision_44"
    ]
  },
  "constraints": {
    "keepConstant": [
      "offer",
      "cta"
    ]
  },
  "expectedOutput": {
    "schema": "oplyra.design.visual_brief.v1"
  }
}
```

O Design Agent recupera seu próprio Context Package. Não recebe o tenant inteiro no handoff.

---

# 27. Side-effect transaction

Ações externas exigem checks adicionais.

Exemplo de publicação:

```json
{
  "transaction": {
    "id": "txn_publish_01",
    "schemaVersion": "1.0",
    "type": "command",
    "action": "publish_campaign",
    "status": "created",
    "createdAt": "2026-09-16T16:00:00Z"
  },
  "trace": {
    "correlationId": "corr_campaign_123",
    "taskId": "task_publish_01"
  },
  "tenant": {
    "tenantId": "tenant_123"
  },
  "actor": {
    "type": "agent",
    "id": "paid-media-agent"
  },
  "target": {
    "service": "meta-ads-adapter"
  },
  "context": {
    "initiativeId": "cmp_2026_q4_01",
    "taskId": "task_publish_01"
  },
  "authorization": {
    "requiredPermissions": [
      "campaign.publish"
    ],
    "approvalRefs": [
      "approval_publication_v4"
    ],
    "policyRefs": [
      "budget_policy_2"
    ]
  },
  "autonomy": {
    "level": "approval_required"
  },
  "input": {
    "campaignDraftRef": "draft_meta_123",
    "objectVersion": 4
  },
  "constraints": {
    "maximumSpend": {
      "amount": 20000,
      "currency": "BRL"
    }
  },
  "expectedOutput": {
    "schema": "oplyra.external_campaign.publish_result.v1"
  },
  "idempotency": {
    "key": "tenant_123-meta-draft_123-v4-publish"
  }
}
```

---

# 28. Pre-execution checks

Antes de operações com efeito externo, validar conforme aplicável:

```text
tenant
target object ownership
actor permission
agent autonomy
approval
policy
object version
budget
asset rights
consent
integration health
idempotency
rate limits
kill switch
```

Falha em qualquer requisito crítico deve retornar erro estruturado.

---

# 29. Error response

```json
{
  "transaction": {
    "id": "txn_error_01",
    "schemaVersion": "1.0",
    "type": "response",
    "action": "publish_campaign",
    "status": "failed",
    "createdAt": "2026-09-16T16:00:01Z"
  },
  "trace": {
    "correlationId": "corr_campaign_123",
    "causationId": "txn_publish_01",
    "taskId": "task_publish_01"
  },
  "tenant": {
    "tenantId": "tenant_123"
  },
  "error": {
    "code": "MISSING_APPROVAL",
    "category": "governance",
    "retryable": false,
    "message": "Publication approval is required.",
    "details": {
      "requiredApproval": "publication"
    }
  },
  "next": {
    "recommendedAction": "request_approval"
  }
}
```

---

# 30. Retry policy

Retries devem ser limitados e dependem da classe do erro.

Exemplo:

```text
timeout / provider transient
→ retryable

missing approval
→ not retryable

validation
→ not retryable until input changes

rate limit
→ retry with backoff

idempotency conflict
→ resolve existing transaction
```

Toda tentativa deve manter o mesmo correlation e idempotency quando representar o mesmo efeito desejado.

---

# 31. Idempotency rules

## 31.1 Mesmo efeito

Retries da mesma intenção externa usam a mesma key.

## 31.2 Nova versão

Se o objeto mudou materialmente, nova versão pode gerar nova key.

## 31.3 Storage

A chave deve ser persistida pelo serviço executante pelo período adequado ao risco da operação.

## 31.4 Duplicate result

Ao receber comando duplicado já concluído, preferir retornar o resultado canônico anterior em vez de repetir side effect.

---

# 32. Schema versioning

Cada envelope possui `schemaVersion`.

Schemas específicos também são versionados:

```text
oplyra.copy.variants.v1
oplyra.design.visual_brief.v1
oplyra.experiment.analysis.v1
```

Regras:

- mudanças breaking criam nova major version;
- consumidores devem validar schema;
- versões antigas podem continuar suportadas durante janela de migração;
- nunca depender de parsing informal de texto quando campo estruturado for contratual.

---

# 33. JSON Schema

Cada `action` deverá possuir JSON Schema para:

- input;
- result;
- error details quando específico.

O schema deve definir:

- campos obrigatórios;
- tipos;
- enums;
- formatos;
- limites;
- additionalProperties conforme decisão do contrato.

---

# 34. Natural language fields

É permitido transportar texto natural:

```json
{
  "input": {
    "objective": "Create challenger copy",
    "brief": "..."
  }
}
```

Mas decisões estruturais não devem depender apenas de interpretar prosa.

Exemplo:

Preferir:

```json
{
  "variable": "angle",
  "keepConstant": [
    "cta"
  ]
}
```

a esconder essas informações em um briefing longo.

---

# 35. Binary assets

Não transportar imagens, vídeos, PDFs ou arquivos grandes em base64 no envelope por padrão.

Usar referências:

```json
{
  "input": {
    "assetRefs": [
      "asset_123"
    ]
  }
}
```

O storage e a autorização resolvem bytes.

---

# 36. Large datasets

Da mesma forma:

```json
{
  "input": {
    "datasetRef": "dataset_552"
  }
}
```

quando o volume não deve ser transportado na mensagem.

---

# 37. Context references

Preferir:

```json
{
  "context": {
    "contextPackageId": "ctx_774"
  }
}
```

a repetir integralmente L1–L8 em cada transação.

O runtime pode materializar a projeção necessária ao agente.

---

# 38. Evidence references

Exemplo:

```json
{
  "evidence": {
    "providedRefs": [
      "proof_09",
      "experiment_result_44"
    ]
  }
}
```

Toda referência deve ser resolvida dentro do tenant.

---

# 39. Structured claims in outputs

Quando um agente produzir análise, poderá retornar afirmações classificadas.

```json
{
  "result": {
    "statements": [
      {
        "classification": "fact",
        "statement": "Variant B generated 11 qualified meetings.",
        "evidenceRefs": [
          "metric_snapshot_91"
        ]
      },
      {
        "classification": "limitation",
        "statement": "Commercial maturity is incomplete."
      }
    ]
  }
}
```

Isso facilita quality gates e reporting.

---

# 40. Agent result contract

Outputs de agentes devem ser preferencialmente estruturados.

Campos comuns possíveis:

```json
{
  "result": {},
  "evidence": {},
  "limitations": [],
  "recommendations": [],
  "requiresApproval": false,
  "handoffs": [],
  "next": {}
}
```

A presença exata depende do schema.

---

# 41. Approval transaction

Aprovações também devem ser transacionais.

```json
{
  "transaction": {
    "id": "txn_approval_01",
    "schemaVersion": "1.0",
    "type": "command",
    "action": "approve_object",
    "status": "created",
    "createdAt": "2026-09-16T16:10:00Z"
  },
  "tenant": {
    "tenantId": "tenant_123"
  },
  "actor": {
    "type": "user",
    "id": "user_44"
  },
  "input": {
    "objectType": "campaign_draft",
    "objectId": "draft_123",
    "objectVersion": 4,
    "approvalType": "publication"
  }
}
```

A aprovação vale para a versão indicada.

---

# 42. Rejection transaction

```json
{
  "transaction": {
    "id": "txn_reject_01",
    "schemaVersion": "1.0",
    "type": "command",
    "action": "reject_object",
    "status": "created",
    "createdAt": "2026-09-16T16:10:00Z"
  },
  "tenant": {
    "tenantId": "tenant_123"
  },
  "actor": {
    "type": "user",
    "id": "user_44"
  },
  "input": {
    "objectType": "copy_variant",
    "objectId": "var_b",
    "objectVersion": 3,
    "reason": "Tone is too aggressive."
  }
}
```

Rejeição pode alimentar L7, mas não altera automaticamente L2.

---

# 43. Context update candidate transaction

Quando conversa ou agente sugerir mudança em contexto superior:

```json
{
  "transaction": {
    "id": "txn_context_proposal_01",
    "schemaVersion": "1.0",
    "type": "command",
    "action": "propose_context_update",
    "status": "created",
    "createdAt": "2026-09-16T16:20:00Z"
  },
  "tenant": {
    "tenantId": "tenant_123"
  },
  "actor": {
    "type": "agent",
    "id": "strategy-quality-agent"
  },
  "input": {
    "targetLayer": "L2",
    "entityType": "persona",
    "entityId": "persona_22",
    "field": "objections",
    "proposedChange": {
      "add": "Integration complexity"
    },
    "evidenceRefs": [
      "learning_77"
    ]
  }
}
```

O status inicial é proposta, não verdade aprovada.

---

# 44. Event naming

Preferir nomes estáveis em passado/fato:

```text
experiment.completed
campaign.published
approval.granted
integration.failed
contract.won
```

Evitar nomes vagos.

---

# 45. Action naming

Preferir verbos explícitos:

```text
create_copy_variants
analyze_experiment
prepare_campaign
approve_object
publish_campaign
change_budget
```

---

# 46. Validation order

Antes de processar:

```text
1. JSON parse
2. envelope schema
3. schemaVersion support
4. tenant
5. transaction uniqueness
6. actor/target resolution
7. action-specific schema
8. permission/policy
9. context references
10. idempotency
11. execution
```

---

# 47. Tenant isolation

Toda busca por ids transportados no payload deve incluir `tenantId`.

Nunca confiar que um UUID isolado pertence ao tenant informado.

---

# 48. Secrets

Nunca transportar credenciais brutas no envelope.

Usar:

```json
{
  "connectionRef": "conn_123"
}
```

O adapter resolve o secret de forma segura.

---

# 49. PII minimization

Transportar apenas PII necessária à operação.

Evitar replicar dados pessoais em logs e payloads quando uma referência for suficiente.

---

# 50. Logging

Logs podem registrar:

- transaction id;
- correlation;
- tenant;
- action/event;
- status;
- agent/service;
- durations;
- schema versions;
- error code;
- token/cost metadata.

Não registrar indiscriminadamente:

- secrets;
- tokens;
- payloads com PII;
- conteúdo privado desnecessário.

---

# 51. Observability

Toda transação deverá ser rastreável por:

```text
transactionId
correlationId
tenantId
workflowId
taskId
agent/service
action
status
```

Métricas possíveis:

- success rate;
- retry rate;
- failure rate por código;
- latency;
- queue time;
- model latency;
- tokens;
- estimated cost;
- approval wait time;
- external API latency;
- duplicate/idempotency hits.

---

# 52. Dead-letter

Transações não processáveis após política de retry podem ir para dead-letter com:

- transaction ref;
- last error;
- attempt count;
- tenant;
- workflow;
- required human escalation.

Dead-letter não deve perder provenance.

---

# 53. Cancellation

Commands long-running devem poder ser canceláveis quando tecnicamente possível.

Cancellation é outra transação:

```json
{
  "transaction": {
    "id": "txn_cancel_01",
    "schemaVersion": "1.0",
    "type": "command",
    "action": "cancel_transaction",
    "status": "created",
    "createdAt": "2026-09-16T16:40:00Z"
  },
  "tenant": {
    "tenantId": "tenant_123"
  },
  "input": {
    "targetTransactionId": "txn_long_running_01"
  }
}
```

---

# 54. Supersession

Quando nova solicitação substitui anterior:

```json
{
  "transaction": {
    "id": "txn_new_02",
    "schemaVersion": "1.0",
    "type": "command",
    "action": "create_copy_variants",
    "status": "created",
    "createdAt": "2026-09-16T16:50:00Z"
  },
  "trace": {
    "correlationId": "corr_campaign_123"
  },
  "input": {
    "supersedesTransactionId": "txn_old_01"
  }
}
```

O efeito depende do estado da transação anterior.

---

# 55. Optimistic concurrency

Operações mutáveis relevantes devem poder usar versão do objeto.

```json
{
  "input": {
    "objectId": "campaign_123",
    "expectedVersion": 8
  }
}
```

Se a versão atual for diferente:

```text
CONFLICT_VERSION
```

Isso evita sobrescrever decisões concorrentes.

---

# 56. Side effects e transactional outbox

Quando uma mudança de banco precisar publicar evento, preferir padrão consistente como transactional outbox para reduzir perda ou duplicação entre commit e mensageria.

A implementação final depende da stack definida no projeto.

---

# 57. At-least-once assumption

Filas e webhooks podem entregar mais de uma vez.

Consumidores devem ser idempotentes.

Nunca projetar side effects assumindo entrega exatamente uma vez.

---

# 58. External provider ids

Após criar recurso externo, registrar:

```json
{
  "result": {
    "externalRef": {
      "provider": "meta_ads",
      "accountId": "act_123",
      "campaignId": "ext_cmp_444"
    }
  }
}
```

Isso permite reconciliação.

---

# 59. Reconciliation

Serviços externos podem divergir do estado interno. O sistema deve permitir workflows de reconciliação e não assumir que response local garante estado permanente no provider.

---

# 60. Action classes

Sugestão de classes:

## Read-only

```text
query
retrieve
analyze
summarize
```

## Internal mutation

```text
create_draft
update_task
record_learning
```

## External reversible

```text
pause_campaign
schedule_email
```

## External financial / high-risk

```text
publish_campaign
change_budget
send_bulk_email
```

Quanto maior o risco, mais checks obrigatórios.

---

# 61. Quality gate transaction

Exemplo:

```json
{
  "transaction": {
    "id": "txn_qg_01",
    "schemaVersion": "1.0",
    "type": "command",
    "action": "review_output",
    "status": "created",
    "createdAt": "2026-09-16T17:00:00Z"
  },
  "tenant": {
    "tenantId": "tenant_123"
  },
  "actor": {
    "type": "agent",
    "id": "orchestrator-agent"
  },
  "target": {
    "agent": "strategy-quality-agent"
  },
  "context": {
    "initiativeId": "cmp_2026_q4_01",
    "experimentId": "exp_091"
  },
  "input": {
    "objectRef": "copy_variant_b_v3",
    "reviewType": "strategy_brand_evidence"
  },
  "expectedOutput": {
    "schema": "oplyra.quality.review.v1"
  }
}
```

---

# 62. Quality response

```json
{
  "transaction": {
    "id": "txn_qg_02",
    "schemaVersion": "1.0",
    "type": "response",
    "action": "review_output",
    "status": "completed",
    "createdAt": "2026-09-16T17:00:02Z"
  },
  "tenant": {
    "tenantId": "tenant_123"
  },
  "result": {
    "status": "approved_with_notes",
    "checks": {
      "strategy": "pass",
      "brand": "pass",
      "claims": "pass",
      "evidence": "pass",
      "experimentIntegrity": "pass"
    },
    "notes": []
  }
}
```

---

# 63. Agent message versus transaction

Mensagens internas de raciocínio ou colaboração não devem se tornar contratos frágeis baseados apenas em chat.

Quando uma mensagem tiver efeito operacional, decisão, handoff, resultado ou evento relevante, deve haver transação estruturada.

---

# 64. Transport independence

O protocolo é independente de transporte.

Pode ser usado sobre:

- HTTP;
- message broker;
- queue;
- workflow engine;
- internal RPC;
- event bus.

A decisão de infraestrutura será posterior.

---

# 65. Serialization

Formato padrão inicial:

```text
application/json
UTF-8
```

Outros formatos só devem ser introduzidos por necessidade explícita.

---

# 66. Timestamps

Usar ISO 8601 / RFC 3339 em UTC nos contratos internos.

Exemplo:

```text
2026-09-16T17:00:00Z
```

Timezone do tenant permanece no contexto para apresentação e regras locais.

---

# 67. Money

Nunca transportar valor monetário sem moeda.

```json
{
  "amount": 15000,
  "currency": "BRL"
}
```

Definir se valores são decimal string ou minor units na implementação para evitar erro de ponto flutuante.

---

# 68. Metrics

Métricas relevantes devem transportar definição, período, fonte e unidade quando necessário.

Evitar números soltos sem contexto.

---

# 69. Unknown versus zero

JSON deve preservar diferença:

```json
{
  "revenue": null,
  "revenueStatus": "unavailable"
}
```

não:

```json
{
  "revenue": 0
}
```

quando dado não existe.

---

# 70. Confidence

Quando aplicável:

```json
{
  "confidence": {
    "level": "medium",
    "reason": "Commercial coverage is partial."
  }
}
```

Confidence não transforma inferência em fato.

---

# 71. Decision payload

Decisões podem ser estruturadas:

```json
{
  "result": {
    "decision": {
      "question": "Redistribute budget?",
      "outcome": "maintain",
      "reason": "Experiment maturity is insufficient.",
      "evidenceRefs": [
        "exp_091_result_current"
      ],
      "limitations": [
        "CRM data delayed."
      ]
    }
  }
}
```

---

# 72. Recommendation payload

Recomendação é explicitamente separada:

```json
{
  "result": {
    "recommendations": [
      {
        "action": "maintain_budget",
        "reason": "Preserve experiment comparability.",
        "requiresApproval": false
      }
    ]
  }
}
```

---

# 73. Human-readable projection

A UI pode converter JSON em linguagem natural.

Exemplo:

```text
Recomendação:
manter o orçamento.

Motivo:
redistribuir agora reduziria a comparabilidade do experimento.
```

O JSON permanece como contrato canônico interno.

---

# 74. Transaction registry

Manter registro de:

```text
transactionId
tenantId
type
action/event
status
schemaVersion
correlationId
causationId
taskId
actor
target
createdAt
startedAt
finishedAt
errorCode
```

O payload completo pode ter política de retenção própria.

---

# 75. Security validation

Nunca confiar no envelope fornecido por outro componente sem validar:

- assinatura/autenticação interna quando aplicável;
- tenant;
- permissions;
- refs;
- schema;
- version;
- anti-replay quando necessário.

---

# 76. External webhook normalization

Webhooks de terceiros não devem entrar diretamente no domínio.

Fluxo:

```text
External Webhook
↓
Adapter Validation
↓
Provider-specific Parsing
↓
Normalized Oplyra Event JSON
↓
Domain Workflow
```

---

# 77. Normalized event example

```json
{
  "transaction": {
    "id": "evt_norm_01",
    "schemaVersion": "1.0",
    "type": "event",
    "event": "opportunity.stage_changed",
    "status": "completed",
    "createdAt": "2026-09-16T17:20:00Z"
  },
  "tenant": {
    "tenantId": "tenant_123"
  },
  "actor": {
    "type": "integration",
    "id": "crm-adapter"
  },
  "result": {
    "opportunityRef": "opp_123",
    "previousStage": "meeting",
    "currentStage": "proposal"
  }
}
```

---

# 78. Schema registry

A Oplyra deverá possuir catálogo versionado dos contratos.

Exemplo conceitual:

```text
schemas/
├── envelope/
│   └── transaction.v1.json
├── commands/
│   ├── create-copy-variants.v1.json
│   ├── publish-campaign.v1.json
│   └── approve-object.v1.json
├── queries/
├── events/
└── responses/
```

A localização final depende da stack/repositório.

---

# 79. Testing

Contratos transacionais precisam de testes:

- schema validation;
- backward compatibility;
- tenant isolation;
- authorization;
- idempotency;
- retry;
- duplicate event;
- version conflict;
- side-effect prevention;
- audit trace completeness.

---

# 80. Contract tests

Adapters e serviços devem possuir contract tests para garantir que continuam emitindo/consumindo schemas válidos.

---

# 81. Agent tool calls

Tool calls de agentes devem gerar registros auditáveis vinculados à transação de origem.

```text
agentRun
↓
transaction
↓
toolCall
↓
external/internal result
```

---

# 82. Model output validation

Saída de modelo destinada a automação deve ser validada contra schema antes de entrar no domínio.

Fluxo:

```text
LLM Output
↓
JSON parse
↓
Schema validation
↓
Deterministic validation
↓
Policy/Quality checks
↓
Accept or reject
```

Nunca executar side effect com JSON inválido ou não validado.

---

# 83. Repair

Se a saída do modelo não respeitar schema, o runtime pode tentar repair limitado sem side effect.

Falhas persistentes viram erro estruturado.

---

# 84. Transactional boundaries

O envelope representa intenção e resultado, mas não substitui transações ACID do banco.

A implementação deve definir atomicidade local por bounded context.

---

# 85. Auditability principle

Deve ser possível reconstruir:

```text
quem pediu
o que pediu
qual contexto foi usado
qual versão
qual agente executou
quais tools foram chamadas
que evidência foi usada
quem aprovou
qual side effect ocorreu
qual resultado retornou
```

---

# 86. Decisão formalizada

## DEC-020 — Comunicação JSON transacional

> Toda comunicação entre agentes, runtime, workflows, scheduler, filas, serviços e integrações internas da Oplyra utilizará contratos JSON versionados e transacionais. As mensagens serão classificadas como `command`, `query`, `event` ou `response` e carregarão identidade da transação, tenant, tracing, ator, target, referências de contexto, autorização, autonomia, input/output estruturados, evidências, erros e auditoria conforme aplicável. Fluxos relacionados utilizarão `correlationId`/`causationId`, e ações com side effect relevante deverão possuir idempotência, validação de versão/estado e controles de autorização antes da execução.

**Status:** aprovado.

### Regras obrigatórias derivadas

- toda transação deve possuir `transaction.id` e `schemaVersion`;
- transações com dados privados devem possuir `tenantId`;
- fluxos correlacionados devem utilizar `correlationId`;
- `causationId` deve ser utilizado quando houver uma causa transacional direta identificável;
- ações com side effect relevante devem possuir idempotência;
- mutações concorrentes relevantes devem suportar validação de versão/estado;
- outputs destinados a automação devem ser validados contra schema antes de qualquer execução externa.

---

# 87. Critério de qualidade

Um contrato transacional válido deve permitir responder:

```text
Qual transação é esta?
Qual schema?
Qual tenant?
Quem originou?
Quem é o target?
Que ação está sendo solicitada?
A qual workflow/task pertence?
Que contexto referencia?
Qual autonomia existe?
Que autorização é necessária?
Quais restrições existem?
Qual output é esperado?
É seguro repetir?
Que resultado ocorreu?
Que evidência foi usada?
Houve erro?
É retryable?
Qual próximo passo foi sugerido?
```

---

# 88. Regra final

> **A linguagem natural explica intenção. O JSON transacional governa execução.**

Isso permite que a Oplyra mantenha agentes flexíveis na interpretação e rígidos na integração, governança, auditoria e execução.
