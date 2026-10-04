# CR-035 — Package entries for Strategy (I-04)

**Status:** `approved`
**Classification:** `additive_contract_extension` (two `exports` entries; no registry, schema, fixture, migration-history or runtime contract changes)
**Issued at:** 2026-10-04
**Approved by:** project owner, 2026-10-04 — approved D-1 of `docs/harness/PREPARACAO-I04.md` as recommended (a CR creating `./strategy` in core and infra, same pattern as CR-034). The owner did not review this text separately; it repeats CR-034 for a new bounded context.
**Base:** Contract Registry Release 2.22 plus CR-034 (applied by Release 2.24, not yet generated)
**Target:** the same Release 2.24 as CR-034 (D-1 below), or the release after it

## Objective

I-04 (Strategy, campaigns and tests; slices S1, S2, S3 and S5 approved on 2026-10-04, S4 tasks deferred) adds a bounded context. It needs one package entry in `@oplyra/core` and one in `@oplyra/infra`, exactly as `./brand` does for I-03 (CR-034).

## Confrontation with frozen contracts

| Governed artifact | Effect of this CR |
| --- | --- |
| `packages/core/package.json` | `exports` gains `"./strategy": "./src/strategy.ts"` |
| `packages/infra/package.json` | `exports` gains `"./strategy": "./src/strategy-repository.ts"` |
| `packages/core/src/index.ts`, `errors.ts`, `packages/infra/src/index.ts`, `packages/testing/src/index.ts`, `apps/web/src/lib/deps.ts` | **Not modified.** I-04 adds its own modules (`strategy-errors.ts`, `strategy.ts`, `deps-estrategia.ts`) |
| `packages/testing/package.json` | Not governed; gains `"./strategy"` without a CR |
| Registries, schemas, fixtures, earlier migrations | Untouched; `supabase/migrations/20261004000017_strategy.sql` is a new file |

Both `package.json` paths are already on the contract-test allowlists created for CR-034 (`test/contracts/cr-033-current-content.test.ts` and the Release 2.16 exemption), so no test list changes.

## Decisions requested

- **D-1 — release sequencing.** Recommended: carry CR-034 and CR-035 in the same Release 2.24 (both are the same two files). Alternative: a Release 2.25.

## Out of scope

Any change to Error Registry, schemas, Model Profile registries, the Cost Ledger or the access model (`strategy.read`, `strategy.write` and `campaign.activate` are seeded by the new migration).
