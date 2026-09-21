# DEC-RUNTIME-001 — Content reference resolver prerequisites

**Status:** `approved`  
**Approved at:** 2026-09-21  
**Scope:** contractual prerequisites for resolving `draftRef` and `variantRefs`

## Decision

The content reference resolver will be a structural runtime component over the canonical tool `contentRepository`; it will not be introduced as a new agent action.

The component contract must enforce:

1. a resolved and validated `tenantId`;
2. an authenticated requester identity;
3. canonical `read` permission for `contentRepository`;
4. lookup constrained by both reference and tenant;
5. exact version matching when an expected version is supplied;
6. all requested variant references belonging to the resolved draft and tenant;
7. no partial success: the result is returned only when every requested reference is valid and authorized;
8. audit-safe metadata without unrestricted logging of copy bodies.

## Existing canonical capability

`contentRepository` already exists in Tools Registry 1.0 as a provider-independent `domain_repository` for copy, content and versions.

- `copywriting-agent` has observed `write` access for persistence;
- `design-agent` declares `read` access for consumption;
- the tool permits `read`, `write` and `read_write`;
- tenant isolation remains mandatory regardless of tool permission.

No new tool or permission is required by this decision.

## Canonical failures

The resolver must use registered errors only:

| Condition | Error code |
|---|---|
| tenant omitted | `TENANT_REQUIRED` |
| reference belongs to another tenant | `TENANT_MISMATCH` |
| requester lacks read permission | `PERMISSION_DENIED` |
| reference absent in the authorized tenant scope | `REFERENCE_NOT_FOUND` |
| persisted version differs from expected version | `CONFLICT_VERSION` |
| request or result violates schema | `TRANSACTION_SCHEMA_INVALID` |

`CONFLICT_VERSION` is already normative in the Agent Transaction Protocol but was missing from Error Registry 1.0. `REFERENCE_NOT_FOUND` is added as a generic runtime error so domain repositories do not invent incompatible not-found codes.

## Information-disclosure rule

An unauthorized requester receives `PERMISSION_DENIED`. An authorized lookup that cannot find a reference within the tenant scope receives `REFERENCE_NOT_FOUND`. Cross-tenant ownership detected during controlled resolution produces `TENANT_MISMATCH` and must not return foreign resource metadata.

## Implementation boundary

This decision does not implement the resolver, repository adapter, database model or event dispatch. It only closes the canonical error vocabulary required before publishing resolver input/output schemas.

## Next step

Create and validate versioned input/output schemas for the content reference resolver, then add executable contract tests before any runtime implementation.
