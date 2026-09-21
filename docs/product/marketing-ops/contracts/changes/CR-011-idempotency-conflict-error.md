# CR-011 — Idempotency conflict error

**Status:** `approved_and_applied`  
**Classification:** `backward_compatible`  
**Issued at:** 2026-09-21T15:32:00Z  
**Base:** Contract Registry Release 2.0 / Errors Registry 1.1  
**Target:** Contract Registry Release 2.1 / Errors Registry 1.2

## Objective

Define the canonical failure for reusing an idempotency key with a materially different request, closing the blocker recorded by CR-010 before implementing the `create_copy_variants` write transaction.

## Approved error

`IDEMPOTENCY_CONFLICT`:

- category: `idempotency`;
- severity: `high`;
- retryable: `false`;
- default next action: `resolve_conflict`.

The code applies when the same `(tenantId, action, idempotency.key)` scope already exists with a different material request fingerprint.

It does not apply to:

- a missing required key, which maps to `TRANSACTION_SCHEMA_INVALID` before persistence;
- an identical replay, which returns the canonical stored result without another write;
- optimistic resource version divergence, which remains `CONFLICT_VERSION`.

## Supporting decision

`DEC-RUNTIME-002-idempotency-conflict.md` defines scope, fingerprint boundary, replay behavior, atomicity and the explicit absence of an approved retention TTL.

## Changes

- Errors Registry `1.1 → 1.2`;
- canonical errors `44 → 45`;
- additive `IdempotencyConflict` domain error class;
- executable registry and core tests;
- machine-readable idempotency policy fixture.

No existing error code or semantic was removed or changed.

## Compatibility

Result: **backward compatible**.

- additive registry value;
- existing consumers remain valid;
- no schema change is required because `error.schema.json` already supports category `idempotency` and next action `resolve_conflict`;
- no runtime writer, database table, privilege or event dispatch is enabled.

## Explicit limits

- no automatic retention period is approved;
- no HTTP status mapping is selected;
- no queue technology is selected;
- event dispatch and consumer deduplication remain out of scope.

## Next permitted increment

Implement the tenant-scoped `create_copy_variants` write transaction using the CR-010 action semantics and DEC-RUNTIME-002 conflict policy. Persist the domain result, idempotency record and outbox-ready event atomically, but do not dispatch the event.

## Rollback

Remove `IDEMPOTENCY_CONFLICT` and its core class, restore Errors Registry 1.1, remove the new decision, fixture and tests, and make Contract Registry Release 2.0 active again.

