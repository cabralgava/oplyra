# Oplyra Universal Schemas — Integration Review v1

**Data:** 17 de setembro de 2026  
**Escopo:** 10 schemas universais + definições compartilhadas  
**Status:** APROVADO

## Resultado

A integração estrutural dos 10 schemas universais foi executada antes da criação dos registries canônicos.

Foram validados:

- 10 schemas universais em JSON Schema Draft 2020-12;
- 1 schema auxiliar de definições compartilhadas;
- todos os fixtures válidos existentes;
- todos os fixtures estruturalmente inválidos existentes;
- resolução de `$ref` entre schemas;
- validação real de `format: date-time`;
- integração de erro canônico dentro do Transaction Envelope.

## Alterações aplicadas

### 1. `common-definitions.schema.json`

Foi criado um contrato auxiliar compartilhado para:

- `nonEmptyString`;
- `nullableNonEmptyString`;
- `timestamp`;
- `schemaVersion`;
- `agentKey`;
- `domainKey`;
- `actionKey`;
- `eventKey`;
- `autonomyLevel`;
- `riskLevel`;
- `tenantId`.

Isso reduz drift entre schemas.

### 2. Erro transacional centralizado

`transaction-envelope.schema.json` não mantém mais uma taxonomia de erro independente.

Agora utiliza:

```text
error.schema.json#/$defs/transactionError
```

O `error.schema.json` continua sendo o contrato completo de erro e também fornece o profile usado dentro de transações.

### 3. Taxonomia de erro alinhada

O Transaction Envelope passa a reutilizar `errorCategory` e `errorSeverity` do contrato canônico de erro.

### 4. Autonomy centralizada

Os quatro níveis continuam:

```text
recommend
draft
approval_required
policy_execute
```

mas a definição passa a ser compartilhada.

### 5. Agent/action/event/risk patterns centralizados

Patterns estruturais deixam de ser redefinidos independentemente em vários arquivos.

## Decisões preservadas

Não foram alteradas as decisões funcionais aprovadas:

- 12 agentes;
- Context Stack L0–L8;
- quatro níveis de autonomy;
- transaction types;
- transaction statuses;
- task statuses;
- quality gate statuses;
- approval lifecycle;
- context promotion governance;
- learning governance;
- tenant isolation;
- idempotency;
- separação entre JSON Schema e invariantes de runtime.

## Invariantes que continuam fora do JSON Schema

Continuam sendo responsabilidades de registry/runtime:

- `fromAgent != toAgent`;
- reviewer independente quando exigido;
- approval válida para a versão atual;
- target/context version atual;
- tenant consistency entre refs;
- action owner existe;
- event producer existe;
- tool/permission existe;
- Growth entitlement;
- approval por risk/action;
- idempotency obrigatória por Action Registry;
- evidence ref pertence ao mesmo tenant;
- error code existe no Error Registry.

## Validação automática

Total de checks: **32**  
Falhas: **0**

Todos os checks passaram.

## Próxima etapa

Com os schemas integrados, a próxima fase é criar os registries canônicos:

1. `agents.json`
2. `permissions.json`
3. `tools.json`
4. `actions.json`
5. `events.json`
6. `errors.json`
7. `handoffs.json`
8. `quality-gates.json`

Depois:

```text
cross-reference validation
→ fixtures finais
→ contract tests
→ Contract Registry Freeze v1
```
