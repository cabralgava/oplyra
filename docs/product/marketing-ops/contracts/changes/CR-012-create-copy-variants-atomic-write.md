# CR-012 — create_copy_variants atomic write

**Status:** `approved_and_applied`  
**Classification:** `backward_compatible`  
**Issued at:** 2026-09-21T15:45:00Z  
**Base:** Contract Registry Release 2.1  
**Target:** Contract Registry Release 2.2

## Objective

Implement the first tenant-scoped write transaction for `create_copy_variants`, atomically persisting the draft, variants, idempotency result and a pending `copy.draft_created` outbox record without dispatching the event.

## Runtime components

Core adds:

- `CreateCopyVariantsWriterPort`;
- `CreateCopyVariantsWriteRepositoryPort`;
- `CreateCopyVariantsFingerprintPort`;
- `createCreateCopyVariantsWriter`;
- structural validation for action input, generated output, idempotency and persisted results.

Infrastructure adds:

- deterministic canonical JSON + SHA-256 fingerprints;
- PostgreSQL implementation of the atomic repository port;
- tenant-scoped idempotency claims and replay;
- exact event payload construction;
- canonical mapping to `IDEMPOTENCY_CONFLICT` and `CONFLICT_VERSION`.

## Database model

Migration `20260921000010_create_copy_variants_write.sql` adds:

- `content.action_idempotency`;
- `content.event_outbox`;
- forced RLS and immutable tenant IDs;
- insert-only content privileges for the writer;
- select/insert/update privileges limited to idempotency claims;
- insert-only outbox privilege, with no read, update, delete or dispatch privilege.

The idempotency scope is `(tenant_id, action, idempotency_key)`. A claim, domain result and outbox record are committed or rolled back together.

## Enforced behavior

- a missing key is rejected before database access;
- canonical fingerprinting ignores JSON property order;
- identical replay returns the first canonical result;
- different material input with the same scoped key raises `IDEMPOTENCY_CONFLICT`;
- concurrent identical calls produce one creation and one replay;
- duplicate draft creation under another key raises `CONFLICT_VERSION` and rolls back the new claim;
- the same key may be used independently in different tenants;
- output quantity and unique variant IDs are enforced before persistence;
- the persisted draft is immediately resolvable through the CR-009 read adapter;
- outbox payload contains exactly the persisted draft/version/action/variant references.

## Initial creation boundary

This writer implements creation only:

- `expectedVersion` may be absent or `0`;
- when `objectId` is supplied, it must equal `draftRef`;
- updating an existing draft is not inferred or implemented;
- draft version starts at `1`.

## Validation

- package-local TypeScript checks passed with zero errors;
- 112/112 Vitest tests passed across 12 files;
- 47/47 pgTAP checks passed across three files;
- 10/10 write integration tests passed, including real PostgreSQL concurrency;
- secret scan passed with zero findings;
- migration 20260921000010 is applied to the isolated local database.

## Explicit limits

- outbox status is `pending`; no dispatcher was implemented or authorized;
- writer cannot read or update the outbox;
- no queue technology is selected while ADR-0004 remains conditional on EXP-02;
- no idempotency TTL is approved, so records do not expire automatically;
- no update path for existing drafts is implemented;
- no external endpoint or production database was used;
- a separate `core.audit_log` row is not added; durable source transaction and trace fields are stored in idempotency/outbox records.

## Compatibility

Result: **backward compatible with Release 2.1**.

- no registry, schema or canonical identity changed;
- all exports are additive;
- existing read behavior is preserved;
- privileges are additive and restricted to the new write transaction;
- no externally visible event side effect is activated.

## Next permitted increment

Define and validate the outbox dispatcher boundary, including claim/lease, retry, failure and consumer-deduplication behavior. Do not select or enable transport until EXP-02 resolves ADR-0004.

## Rollback

Remove the writer components and tests, remove their exports, revert the database through a forward rollback migration, and make Contract Registry Release 2.1 active again. Pending outbox records must not be discarded without an explicit recovery decision.

