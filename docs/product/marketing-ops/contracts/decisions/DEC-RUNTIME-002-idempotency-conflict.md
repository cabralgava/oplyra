# DEC-RUNTIME-002 — Idempotency conflict semantics

**Status:** `approved`  
**Approved at:** 2026-09-21  
**Scope:** tenant-scoped internal action persistence

## Decision

An idempotency record is uniquely scoped by:

```text
tenantId + action + idempotency.key
```

For `create_copy_variants`:

1. the key is required before any database write;
2. a deterministic request fingerprint is produced from the validated, material action input;
3. volatile envelope fields such as transaction ID, timestamps, trace IDs and retry attempt are excluded from the fingerprint;
4. the first successful execution stores the fingerprint and canonical persisted result in the same database transaction as the draft, variants and outbox-ready event record;
5. replaying the same scoped key with the same fingerprint returns the canonical stored result and performs no new write;
6. replaying the same scoped key with a different fingerprint fails with `IDEMPOTENCY_CONFLICT`;
7. the conflict is high severity, non-retryable and requires explicit conflict resolution;
8. a missing required key fails as `TRANSACTION_SCHEMA_INVALID` before persistence.

## Fingerprint boundary

The material fingerprint includes the complete validated action input, including optional fields when present. It must use deterministic canonical JSON serialization before SHA-256 hashing.

The fingerprint excludes:

- transaction identifiers;
- creation or expiration timestamps;
- correlation, causation, workflow and task trace identifiers;
- retry counters and transport metadata;
- actor/session metadata that does not alter the requested copy output.

Changing a material input requires a new key or produces `IDEMPOTENCY_CONFLICT`.

## Atomicity

The idempotency record must not be committed separately from the domain result. A database rollback removes both. A committed record must always point to a committed canonical result.

## Information boundary

Conflict responses must not expose another tenant's key, request hash or result. Tenant isolation is enforced before scoped-key comparison.

## Retention

No automatic expiry is approved yet. Records remain durable until a governed retention policy is added. Implementations must not invent a TTL.

## Out of scope

- queue or scheduler technology;
- event dispatch;
- consumer deduplication;
- HTTP status mapping;
- retention duration.

