# CR-004 — `copy.draft_created` contract tests

**Status:** `approved_and_applied`  
**Classification:** `backward_compatible`  
**Issued at:** 2026-09-21T12:49:58Z  
**Base:** Contract Registry Release 1.3  
**Target:** Contract Registry Release 1.4

## Objective

Add fixtures and executable contract tests for the bound payload schema of `copy.draft_created`, without altering registries, schemas or runtime.

## Artifacts added

- 1 valid reference-based payload fixture;
- 6 invalid payload fixtures;
- 1 Vitest contract suite with 11 tests;
- 1 machine-readable execution report.

The existing strict JSON Schema Draft 2020-12 subset harness is reused unchanged.

## Compatibility assessment

Result: **backward compatible**.

- no registry was modified;
- no schema was modified;
- no canonical identity was modified;
- no producer or consumer was modified;
- no runtime was implemented or enabled;
- the change adds only executable evidence and test enforcement.

## Coverage

- Events Registry 1.1 binding resolution;
- canonical producer `copywriting-agent`;
- canonical consumer `design-agent`;
- source action resolution to the bound `create_copy_variants` contract;
- valid reference-based payload;
- missing `draftRef`;
- `version < 1`;
- unapproved `sourceAction`;
- empty `variantRefs`;
- duplicate `variantRefs`;
- undeclared inline copy content;
- unsupported-keyword guard.

## Result

`11 tests → 11 passed → 0 failed`.

## Runtime boundary

Event dispatch remains disabled. The contract proves payload structure and registry references, but does not provide the authorized tenant-scoped resolver required to dereference `draftRef` and `variantRefs` for `design-agent`.

## Migration strategy

Save the fixtures under `contracts/fixtures/`, the suite under `test/contracts/`, the execution report beside the event schema and add `contract-registry-manifest-v1.4.json`. No data or registry migration is required.

## Rollback

Remove only artifacts introduced by CR-004 and make manifest v1.3 active again. Freeze v1 and releases 1.1–1.3 remain preserved.
