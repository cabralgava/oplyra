# CR-001 — Bind create_copy_variants schemas

**Status:** `approved_and_applied`  
**Classificação:** `backward_compatible`  
**Emitido em:** 2026-09-18T13:36:10Z  
**Base:** Contract Registry Freeze v1 / Actions Registry 1.0  
**Destino:** Actions Registry 1.1

## Objetivo

Vincular os schemas de input e output aprovados à action canônica `create_copy_variants`, sem alterar identidade, ownership, callers, tipo, risk, autonomy, approval, idempotency ou semântica operacional da action.

## Mudanças aprovadas

Em `docs/product/marketing-ops/contracts/registries/actions.json`:

- `registryVersion`: `1.0 → 1.1`;
- `create_copy_variants.schemaStatus`: `pending_domain_schema → bound`;
- `create_copy_variants.inputSchema`: `null → ../schemas/copywriting/create-copy-variants.input.schema.json`;
- `create_copy_variants.outputSchema`: `null → ../schemas/copywriting/create-copy-variants.output.schema.json`.

`schemaVersion` permanece `1.0`, pois a forma do Actions Registry não mudou.

## Compatibility assessment

Resultado: **backward compatible**.

Fundamentos:

- nenhum campo obrigatório existente foi removido;
- nenhuma identidade canônica foi renomeada;
- nenhuma action foi adicionada ou removida;
- owner e callers permanecem iguais;
- os campos vinculados já existiam no registry;
- consumers que não utilizam schema binding continuam podendo ler a entry;
- consumers que utilizam binding passam a resolver schemas versionados e explícitos.

## Impacto

| Área | Impacto |
|---|---|
| Agent identity | Nenhum |
| Action identity | Nenhum |
| Ownership | Nenhum |
| Permissions/autonomy | Nenhum |
| Approval/idempotency | Nenhum |
| Tenant isolation | Nenhum |
| Registry version | Minor: 1.1 |
| Registry schema version | Permanece 1.0 |

## Migration strategy

1. salvar os dois schemas e sua validação no diretório `schemas/copywriting/`;
2. substituir `actions.json` pela versão 1.1;
3. substituir `actions.validation.json` pela versão 1.1;
4. adicionar `contract-registry-manifest-v1.1.json` sem modificar o manifest congelado v1.0;
5. configurar loaders para resolver paths relativos a partir de `contracts/registries/`;
6. validar `input` antes da execução e `result` antes de concluir a transação.

## Rollback

Restaurar `actions.json` e `actions.validation.json` pelos hashes preservados no manifest Freeze v1. A baseline v1.0 não é sobrescrita pelo manifest incremental v1.1.

## Evidência

- validação dos schemas: 16/16 checks;
- Actions Registry: 171 entries preservadas;
- exatamente uma action alterada;
- nenhuma mudança fora de `registryVersion`, `generatedAt`, `schemaStatus`, `inputSchema` e `outputSchema`;
- referências dos schemas resolvidas;
- Freeze v1 preservado como base imutável.
