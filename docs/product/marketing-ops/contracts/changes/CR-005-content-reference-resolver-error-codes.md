# CR-005 — Content reference resolver error codes

**Status:** `approved_and_applied`  
**Classification:** `backward_compatible`  
**Issued at:** 2026-09-21T12:55:09Z  
**Base:** Contract Registry Release 1.4 / Errors Registry 1.0  
**Target:** Contract Registry Release 1.5 / Errors Registry 1.1

## Objective

Close the canonical error vocabulary required by the future tenant-scoped content reference resolver, without implementing the resolver or changing any existing error identity.

## Approved changes

Add two error codes to `docs/product/marketing-ops/contracts/registries/errors.json`:

- `CONFLICT_VERSION` — persisted version differs from the expected version;
- `REFERENCE_NOT_FOUND` — a reference is absent from the authorized tenant scope.

Registry metadata changes:

- `registryVersion`: `1.0 → 1.1`;
- `schemaVersion`: remains `1.0`;
- canonical errors: `42 → 44`.

## Evidence

- `CONFLICT_VERSION` is explicitly required by section 55, Optimistic concurrency, of `20-agent-transaction-protocol.md`;
- `contentRepository` is the canonical provider-independent repository for copy, content and versions;
- `design-agent` declares `read` permission for `contentRepository`;
- `TENANT_REQUIRED`, `TENANT_MISMATCH` and `PERMISSION_DENIED` already cover the remaining access-control failures;
- no existing registered error represents an authorized in-tenant lookup that returns no resource.

## Compatibility assessment

Result: **backward compatible**.

- no existing code was removed or renamed;
- no existing severity, retry policy or next action changed;
- categories and registry shape remain unchanged;
- consumers that ignore unknown codes remain unaffected;
- consumers validating against the registry gain two canonical values;
- a minor Errors Registry version increment is required.

## Validation

- 44 unique UPPER_SNAKE_CASE codes;
- 16 existing categories preserved;
- 4 retryable errors preserved;
- 4 critical errors preserved;
- both new errors are high severity and non-retryable;
- `CONFLICT_VERSION` uses `resolve_conflict`;
- `REFERENCE_NOT_FOUND` uses `stop`;
- runtime remains unimplemented.

## Migration strategy

1. replace `errors.json` with Errors Registry 1.1;
2. replace `errors.validation.json` with its 1.1 validation;
3. add `DEC-RUNTIME-001-content-reference-resolver-prerequisites.md`;
4. add `contract-registry-manifest-v1.5.json` without modifying prior manifests.

## Rollback

Restore `errors.json` and `errors.validation.json` from Release 1.4 and make manifest v1.4 active again. Freeze v1 and releases 1.1–1.4 remain preserved.
