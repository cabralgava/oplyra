# CR-007 — Content reference resolver contract tests

**Status:** `approved_and_applied`  
**Classification:** `backward_compatible`  
**Issued at:** 2026-09-21T13:01:25Z  
**Base:** Contract Registry Release 1.6  
**Target:** Contract Registry Release 1.7

## Objective

Add fixtures and executable contract tests for the content reference resolver schemas and the four cross-payload invariants identified by CR-006, without implementing runtime or repository adapters.

## Artifacts added

- 2 schema-valid payload fixtures;
- 1 valid failure-policy fixture;
- 4 structurally invalid input fixtures;
- 3 cross-payload business-invariant fixtures;
- 1 Vitest suite with 12 tests;
- 1 machine-readable execution report.

## Compatibility assessment

Result: **backward compatible**.

- no registry was modified;
- no schema was modified;
- no canonical identity was modified;
- no runtime component or adapter was implemented;
- the change adds only executable evidence and enforcement.

## Enforced invariants

1. output tenant equals input tenant;
2. resolved draft reference and version equal the request;
3. resolved variant IDs equal the requested reference set;
4. any failure returns no partial result.

## Canonical failure mapping

| Condition | Error |
|---|---|
| tenant omitted | `TENANT_REQUIRED` |
| cross-tenant reference | `TENANT_MISMATCH` |
| read permission missing | `PERMISSION_DENIED` |
| reference absent in authorized scope | `REFERENCE_NOT_FOUND` |
| persisted version differs | `CONFLICT_VERSION` |
| schema invalid | `TRANSACTION_SCHEMA_INVALID` |

All six codes resolve in Errors Registry 1.1.

## Result

Resolver suite: `12 tests → 12 passed → 0 failed`.

Cumulative contract suites: `3 files → 32 tests → 32 passed → 0 failed`.

## Runtime boundary

The tests operate on schemas, fixtures, registries and business invariants. They do not create a repository adapter, execute a database lookup or enable `copy.draft_created` dispatch.

## Next permitted increment

Implement the core resolver port and pure policy enforcement behind the published contracts. The infrastructure adapter and event dispatch remain separate later increments.

## Rollback

Remove only artifacts introduced by CR-007 and make manifest v1.6 active again. Previous releases and Freeze v1 remain preserved.
