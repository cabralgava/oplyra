# Action→Event Binding Analysis — Copywriting

**Artifact version:** 1.0  
**Generated at:** 2026-09-18T16:44:43Z  
**Status:** `passed_with_unresolved_binding`  
**Focus:** `create_copy_variants` → `copy.draft_created`

## Resultado

As duas identidades são canônicas e pertencem à vertical de Copywriting, mas **a relação causal entre elas não pode ser validada diretamente**.

O projeto comprova que:

- `create_copy_variants` existe, é um `command`, pertence a `copywriting-agent` e possui schemas vinculados;
- `copy.draft_created` existe, é produzido por `copywriting-agent` e consumido por `design-agent`;
- a spec de Copywriting aceita a action e declara a emissão do evento.

O projeto não comprova que:

- `create_copy_variants` sempre, condicionalmente ou nunca emite `copy.draft_created`;
- `copy.draft_created` é exclusivo dessa action;
- o payload deve carregar conteúdo inline, referências persistidas ou ambos;
- existe um identificador canônico aprovado para o draft de copy.

Portanto, não foi criado um payload schema nesta etapa. Fazer isso agora exigiria inventar campos ou restringir silenciosamente um evento que também pode ser emitido por outras actions de Copywriting.

## Evidência validada

| Item | Resultado |
|---|---|
| Actions do owner `copywriting-agent` | 15 |
| Commands | 10 |
| Queries | 5 |
| Eventos emitidos pelo agente | 5 |
| Bindings action→event diretamente documentados | 0 |
| `create_copy_variants` com schemas vinculados | Sim |
| Producer de `copy.draft_created` | `copywriting-agent` |
| Consumer de `copy.draft_created` | `design-agent` |
| Payload schema do evento | Pendente |

## Gaps explícitos

### AEB-001 — Binding causal não demonstrado

Classificação: `blocking_for_action_specific_event_binding`.

Os registries atuais não possuem campo que associe uma action aos eventos resultantes. As specs listam actions aceitas e eventos emitidos separadamente. A proximidade semântica entre os nomes é evidência insuficiente para declarar o binding.

### AEB-002 — Campos do payload não definidos

Classificação: `blocking_for_payload_field_selection`.

Não há fonte canônica que defina campos como `draftId`, `copyRef`, `variantIds` ou conteúdo inline para `copy.draft_created`. Nenhum deles deve ser incorporado silenciosamente ao contrato.

## Decisão contratual necessária

Antes de criar `copy-draft-created.payload.schema.json`, a decisão `DEC-ACTION-EVENT-001` deve definir:

1. se `create_copy_variants` emite `copy.draft_created` sempre, condicionalmente ou nunca;
2. se o payload carrega conteúdo inline, referências persistidas ou ambos;
3. qual identificador canônico representa o draft de copy;
4. quais referências são obrigatórias para o `design-agent` consumir o evento.

## Impacto nos contratos

Nenhum registry, schema ou manifest foi modificado. O Freeze v1 e as releases 1.1/1.2 permanecem intactos.

## Referências não validadas diretamente

- `docs/product/marketing-ops/contracts/README.md`: citado nas instruções do projeto, mas ausente no repositório atual;
- `docs/product/marketing-ops/OPLYRA-MIGRATION-PACK/06-OPEN-ITEMS.md`: citado nas instruções do projeto, mas ausente no repositório atual. O espelho sincronizado foi usado apenas como evidência histórica auxiliar.

## Próxima sequência após a decisão

1. criar `copy-draft-created.payload.schema.json`;
2. validar schema e exemplos;
3. submeter o binding no Events Registry como mudança backward compatible;
4. adicionar fixtures e contract tests executáveis.
