# CR-034 — Package entries for the Brand OS (I-03)

**Status:** `approved`
**Classification:** `additive_contract_extension` (two `exports` entries; no registry, schema, fixture, migration or runtime contract changes)
**Issued at:** 2026-10-04
**Approved by:** project owner, 2026-10-04 — the CR and **D-1: a separate Release 2.24 after 2.23**. Reported in the conversation with the development agent; D-2 was not answered separately, so the agent applied the safe reading (the allowlists of "Required test adjustments" items 1 and 2 are in place, so no frozen-release test is left failing). The release itself is not generated; it stays with the owner (`tools/contract-release`).
**Base:** Contract Registry Release 2.22 (commit `7107ade`); Release 2.23 is reserved for CR-033 and is not generated.
**Target:** the next release after CR-033's (proposed: 2.24, see D-1)

## Objective

I-03 (Brand OS and onboarding; slices S1–S4 approved by the owner on 2026-10-04, with the recommendations D-1 to D-8 of `docs/harness/PREPARACAO-I03.md`) adds a new bounded context. To import it without touching governed entry points, it needs one package entry in `@oplyra/core` and one in `@oplyra/infra`, following the precedent of `@oplyra/infra/ai-model-harness` (CR-026).

Nothing in this CR is applied. Until it is approved, `packages/core/package.json` and `packages/infra/package.json` stay unchanged and the I-03 code that imports `@oplyra/core/brand` or `@oplyra/infra/brand` does not resolve.

## Confrontation with frozen contracts

| Governed artifact | Where it is frozen | Effect of this CR |
| --- | --- | --- |
| `packages/core/package.json` | Release 2.22 manifest (and inherited) | `exports` gains `"./brand": "./src/brand.ts"` |
| `packages/infra/package.json` | Release 2.16 (`cr_026`) and inherited; the 2.16 test exempts only paths modified by 2.17/2.18 | `exports` gains `"./brand": "./src/brand-repository.ts"` |
| `packages/core/src/index.ts`, `packages/core/src/domain/errors.ts`, `packages/infra/src/index.ts`, `packages/testing/src/index.ts` | Governed | **Not modified.** I-03 adds its own modules (`brand-errors.ts`, `brand.ts`) instead |
| `packages/testing/package.json` | Not governed | `exports` gains `"./brand"` without a CR |
| Registries, schemas, fixtures | Frozen | Untouched |
| `supabase/migrations/20261004000016_brand_os.sql` | New file, outside the Release 2.22 set | Added; migrations 000001–000015 unchanged. Migration changes are governed by the release classification, so it is listed as an addition |

New files introduced by I-03 (additions, none governed before): `packages/core/src/domain/brand.ts`, `brand-errors.ts`, `application/brand-ports.ts`, `application/use-cases/brand.ts`, `src/brand.ts`; `packages/infra/src/brand-repository.ts`; `packages/testing/src/brand.ts`; the pgTAP, integration and use-case tests; the migration above.

## Required test adjustments (when approved)

1. `test/contracts/cr-033-current-content.test.ts`: add the two `package.json` paths to an explicit allowlist for CR-034 (or move the check to the next release snapshot).
2. `test/contracts/contract-registry-release-2.16.contract.test.ts` and any other frozen-release test that compares `cr_026` artifacts with the disk: extend the "modified by later releases" set with the changeSet of the release that carries this CR, or convert them to the frozen snapshot (`test/contracts/frozen-snapshot.ts`), as CR-033 did for 2.22.
3. Generate the release with `tools/contract-release` (recipe for the target release) after CR-033's Release 2.23.

## Decisions requested

- **D-1 — release sequencing.** Recommended: a separate Release 2.24 after 2.23, so CR-033's scope stays closed. Alternative: carry both CRs in 2.23 (couples a developer-harness release to a product increment).
- **D-2 — transitional state.** Until the release exists, the owner may accept the two frozen-release tests as expected failures only if the allowlist of item 1 is in place; otherwise I-03 integration waits for this CR.

## Out of scope

Any change to Error Registry, schemas, Model Profile registries, the Cost Ledger or the access model (`brand.read`, `brand.write`, `brand.publish` are seeded by the new migration, not by a contract).
