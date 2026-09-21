# CR-006 — Content reference resolver schemas

**Status:** `approved_and_applied`  
**Classification:** `backward_compatible`  
**Issued at:** 2026-09-21T13:01:25Z  
**Base:** Contract Registry Release 1.5  
**Target:** Contract Registry Release 1.6

## Objective

Publish versioned input and output schemas for the tenant-scoped content reference resolver defined by `DEC-RUNTIME-001`, without implementing runtime or altering registries.

## Artifacts added

- `schemas/runtime/content-reference-resolver.input.schema.json`;
- `schemas/runtime/content-reference-resolver.output.schema.json`;
- `schemas/runtime/content-reference-resolver.validation.json`.

## Contract scope

The input requires:

- canonical `tenantId`;
- initial requester `design-agent`;
- required permission `read`;
- canonical repository `contentRepository`;
- `draftRef`;
- positive `expectedVersion`;
- non-empty and unique `variantRefs`.

The output returns:

- the resolved tenant and repository;
- the exact draft reference and version;
- initial source action `create_copy_variants`;
- content conforming to the existing `create-copy-variants.output` schema;
- a canonical resolution timestamp.

## Compatibility assessment

Result: **backward compatible**.

- no registry was modified;
- no existing schema was modified;
- no canonical identity was renamed;
- the schemas add a new structural component contract;
- runtime, repository adapters and event dispatch remain disabled.

## Validation evidence

- JSON Schema Draft 2020-12;
- unique, versioned `$id` values;
- all local and external `$ref` values resolved;
- no unsupported validation keyword in the strict harness;
- valid input and output examples accepted;
- 17 structural invalid scenarios rejected;
- 18/18 schema checks passed.

## Pending contract-test invariants

The following are deliberately not reported as enforced yet:

1. output tenant equals input tenant;
2. resolved draft reference and version equal the request;
3. resolved variant IDs equal the requested reference set;
4. resolution is atomic, with no partial content on any failure.

These invariants require executable cross-payload tests in the next change.

## Runtime boundary

This change does not create a resolver class, repository adapter, database table, endpoint, queue consumer or dispatcher. Critical behavior remains contractual until executable tests and implementation are separately approved.

## Rollback

Remove only the three schema artifacts introduced by CR-006 and make manifest v1.5 active again. Previous releases and Freeze v1 remain preserved.
