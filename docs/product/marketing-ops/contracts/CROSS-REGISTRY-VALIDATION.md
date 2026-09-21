# Oplyra — Final Cross-Registry Validation

**Etapa:** Final Cross-Registry Validation  
**Gerado em:** 2026-09-17T23:17:05Z  
**Status:** `passed`  
**Contract Registry:** `not_frozen`

## Decisão

A Final Cross-Registry Validation foi concluída diretamente sobre os oito registries canônicos, os 11 schemas integrados e os três artefatos auxiliares exigidos.

Resultado:

- **70 checks executados**;
- **70 checks aprovados**;
- **0 checks falhos**;
- **0 blocking issues**;
- **0 unresolved registry gaps**;
- **0 referências órfãs**;
- **0 handoffs sem binding**.

O Contract Registry está elegível para a etapa **Contract Registry Freeze v1**, mas o Freeze não foi criado nesta execução. Runtime continua não autorizado até a emissão formal do Freeze e de seu manifest.

## Contagens validadas

| Registry | Entries |
|---|---:|
| Agents | 12 |
| Permissions | 6 |
| Tools | 58 |
| Actions | 171 |
| Events | 136 |
| Errors | 42 |
| Handoffs | 43 |
| Quality gates | 11 |
| Schemas integrados | 11 |

O binding contém **364 autorizações relacionais** em `handoffs.allowedActions`.

## Validações executadas

### Envelopes e identidade

- nomes, versões e status dos oito registries;
- contagens canônicas;
- unicidade de agent keys, permissions, tools, actions, events, errors, handoffs e gates;
- naming canônico aplicável a agents, actions, events, errors e gates.

### Referências entre registries

- agents → agents e schemas;
- permissions → permissions implicadas;
- tools → permissions e agents de origem;
- actions → owner, callers, declarantes e plans;
- events → producers e consumers;
- handoffs → fromAgent, toAgent e allowedActions;
- quality gates → ownerAgent, reviewerAgent e enums do Quality Review.

### Invariantes operacionais

- side effects exigem idempotência;
- self-transfer permanece proibido;
- tenant match é obrigatório em todos os handoffs;
- trace propagation é obrigatória em todos os handoffs;
- cada `allowedActions` existe e pertence ao `toAgent`;
- `actions.callableByAgents` não foi alterado pelo binding;
- Strategy & Quality não permite self-approval;
- `operational_gate` permanece determinístico sob `policy-engine`;
- checks de approval/policy, idempotency, consent, budget e asset rights são condicionais onde aplicável.

### Schemas

- 11 schemas presentes;
- JSON Schema Draft 2020-12;
- `$id` únicos;
- todos os `$ref` internos e externos resolvidos, incluindo JSON Pointers;
- manifest com os mesmos arquivos e IDs;
- integração registrada como aprovada, com zero checks falhos.

### Artefatos auxiliares

- `handoff-action-binding-analysis.json`: `passed`;
- hash do `handoffs.json` coincide com o registrado pela análise de binding;
- `quality-gates.validation.json`: 15/15 checks aprovados;
- `schema-integration-manifest.json`: aprovado, com 32/32 checks.

## Arquivos auxiliares não canônicos excluídos

Os seguintes arquivos presentes na pasta de trabalho não foram tratados como registries ativos e **não devem entrar no futuro Freeze manifest**:

- `contracts/handoffs.recovery.json` — artefato de recuperação;
- `contracts/registries/handoffs.recovery.json` — artefato de recuperação;
- `contracts/registries/handoff-action-binding-analysis.json` — duplicata antiga fora do caminho canônico.

O artefato autoritativo de binding é:

`docs/product/marketing-ops/contracts/handoff-action-binding-analysis.json`

## Resultado por domínio de validação

| Domínio | Resultado |
|---|---|
| Registry envelopes | Passed |
| Counts and uniqueness | Passed |
| Naming | Passed |
| Agent/permission/tool references | Passed |
| Action ownership and side effects | Passed |
| Event producers and consumers | Passed |
| Handoff/action binding | Passed |
| Quality gate registry | Passed |
| Schema integration and refs | Passed |
| Supporting artifact integrity | Passed |

## Próxima etapa autorizada

Criar, em etapa separada:

- `docs/product/marketing-ops/contracts/CONTRACT-REGISTRY-FREEZE-v1.md`;
- `docs/product/marketing-ops/contracts/contract-registry-manifest.json`.

O manifest do Freeze deverá usar somente os artefatos canônicos validados e registrar seus hashes. Nenhum runtime foi criado ou autorizado por esta validação.
