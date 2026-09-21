# CR-009 — Content reference repository adapter

**Status:** `approved_and_applied`  
**Classification:** `backward_compatible`  
**Issued at:** 2026-09-21T13:54:00Z  
**Base:** Contract Registry Release 1.8  
**Target:** Contract Registry Release 1.9

## Objective

Implement the PostgreSQL adapter behind `ContentReferenceRepositoryPort`, including the minimum tenant-scoped persistence model and executable boundary tests, without enabling content writes, event dispatch or an external endpoint.

## Persistence model

Added the non-Data-API schema `content` with:

- `content.copy_drafts`;
- `content.copy_variants`;
- composite tenant keys and foreign keys;
- immutable `tenant_id`;
- forced RLS;
- worker access restricted to `select` under the active tenant.

The table and column names are implementation details of the provider-independent canonical tool `contentRepository`; no tool, action, event, error or schema identity was renamed.

## Adapter behavior

`criarContentReferenceRepository`:

- executes only through `withWorkerTransaction`;
- filters both draft and variants explicitly by `tenant_id`;
- relies on forced RLS as a second boundary;
- fetches only requested variant references;
- preserves persisted variant ordering;
- returns `not_found` for missing or foreign-tenant references, avoiding existence disclosure;
- leaves version, exact-set and atomic-result enforcement in the core resolver.

## Validation

- TypeScript strict typecheck: passed;
- all Vitest suites: passed;
- PostgreSQL adapter integration tests: passed;
- pgTAP persistence/RLS boundary tests: passed;
- complete database test suite: passed;
- contract manifest integrity: passed.

Exact counts and integrity hashes are recorded in `runtime/content-reference-repository.implementation-validation.json` and manifest v1.9.

## Explicitly unresolved or not directly validated

- The common contract defines `tenantId` as a non-empty opaque string, while the approved PostgreSQL tenancy model and current core IDs use UUID. CR-009 does not tighten the published JSON Schema; the adapter was directly validated against UUID-backed tenants only.
- No independent security review of the direct-connection code was performed; this remains the pre-existing ADR-0003 pendency.
- The write path that persists `create_copy_variants` output is not implemented. Test fixtures are inserted by the database owner solely for boundary validation.
- The causal event dispatch `create_copy_variants → copy.draft_created` remains disabled.
- No production Supabase environment, remote database or real tenant data was used.

## Compatibility assessment

Result: **backward compatible**.

- registries and JSON Schemas are unchanged;
- existing exports are preserved;
- the new infrastructure export is additive;
- worker privileges are read-only and limited to the new schema;
- no runtime endpoint or event side effect is activated.

## Next permitted increment

Implement the tenant-scoped write transaction for `create_copy_variants`, including idempotency, persisted draft/variant validation and outbox-ready atomicity. Event dispatch remains disabled until the write transaction and its contract tests pass.

## Rollback

Remove the adapter and tests, remove its export from `packages/infra/src/index.ts`, revert migration `20260921000009_content_repository.sql` through a forward rollback migration, and make manifest v1.8 active again.
