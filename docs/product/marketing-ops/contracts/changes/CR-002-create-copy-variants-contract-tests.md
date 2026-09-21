# CR-002 — create_copy_variants contract tests

**Status:** `approved_and_applied`  
**Classificação:** `backward_compatible`  
**Emitido em:** 2026-09-18T16:22:30Z  
**Base:** Contract Registry Release 1.1  
**Destino:** Contract Registry Release 1.2

## Objetivo

Adicionar fixtures e contract tests executáveis para os schemas vinculados à action `create_copy_variants`, sem alterar registries, schemas ou runtime.

## Artefatos adicionados

- 2 fixtures válidas;
- 5 fixtures inválidas;
- harness estrito do subconjunto JSON Schema Draft 2020-12 utilizado pela vertical slice;
- suíte Vitest com 9 testes;
- relatório machine-readable de execução.

## Compatibility assessment

Resultado: **backward compatible**.

- nenhum registry foi alterado;
- nenhum schema foi alterado;
- nenhum ID canônico foi alterado;
- nenhum runtime foi implementado;
- a mudança adiciona somente evidência e enforcement de teste;
- o harness falha diante de keyword de validação não suportada.

## Cobertura

- resolução do binding em `actions.json` v1.1;
- fixtures válidas de input e output;
- ausência de `objective`;
- `quantity < 1`;
- output sem variants;
- variant sem CTA;
- invariante `input.quantity = result.variants.length`;
- guarda contra keywords não suportadas.

## Resultado

`9 tests → 9 passed → 0 failed`.

## Migration strategy

Salvar as fixtures em `contracts/fixtures/`, os testes em `test/contracts/` e o relatório ao lado dos schemas de Copywriting. Não há migração de dados nem alteração de registry.

## Rollback

Remover somente os artefatos introduzidos por CR-002 e restaurar o manifest v1.1 como release ativa. A baseline Freeze v1.0 e a Release v1.1 permanecem preservadas.
