# CR-008 — Content reference resolver core

**Status:** `approved_and_applied`  
**Classification:** `backward_compatible`  
**Issued at:** 2026-09-21T13:30:26Z  
**Base:** Contract Registry Release 1.7  
**Target:** Contract Registry Release 1.8

## Objective

Implement the first structural runtime component for content reference resolution in `@oplyra/core`, enforcing the contracts published by CR-006 and tested by CR-007, without creating infrastructure adapters or enabling event dispatch.

## Implementation

Added:

- `ContentReferenceResolverPort`;
- `ContentReferenceRepositoryPort`;
- `ContentReferenceAuthorizationPort`;
- `ContentReferenceResolverClockPort`;
- `createContentReferenceResolver` orchestration factory;
- `enforceContentReferenceResolution` pure policy;
- canonical domain error classes required by Errors Registry 1.1;
- 13 unit tests.

## Enforced behavior

- validates tenant and structural input before repository access;
- verifies authorization before lookup;
- keeps repository access tenant-scoped by contract;
- rejects explicit or returned cross-tenant data;
- enforces expected version;
- enforces exact draft and variant reference matching;
- rejects duplicate or extra adapter results;
- returns output only after all checks pass;
- maps failures to registered error codes.

## Security boundary

`TENANT_MISMATCH` remains available internally for audit and policy enforcement. External HTTP or UI boundaries must not disclose that a foreign resource exists and may normalize public responses while preserving the internal audit record.

## Compatibility assessment

Result: **backward compatible**.

- existing public functions and ports remain unchanged;
- only additive exports were introduced;
- no registry or schema was modified;
- no database model or adapter was introduced;
- no event dispatch was enabled.

## Validation

- TypeScript strict typecheck: passed with zero errors;
- resolver unit tests: 13/13 passed;
- contract suites remain a required regression gate in the target project;
- source integrity hashes recorded in the machine-readable implementation report.

## Explicit exclusions

- database migration or content table;
- `ContentReferenceRepositoryPort` infrastructure adapter;
- provider or Supabase coupling in core;
- event dispatcher integration;
- API endpoint;
- retry or queue behavior.

## Next permitted increment

Implement the repository adapter behind `ContentReferenceRepositoryPort` with tenant-scoped queries and integration tests. Event dispatch remains blocked until that adapter passes its boundary tests.

## Rollback

Remove the resolver source and test, remove its export from `packages/core/src/index.ts`, restore `packages/core/src/domain/errors.ts` from the pre-CR-008 state and make manifest v1.7 active again.
