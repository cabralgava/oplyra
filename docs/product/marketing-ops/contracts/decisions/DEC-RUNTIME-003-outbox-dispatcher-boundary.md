# DEC-RUNTIME-003 — Outbox dispatcher boundary

**Status:** `approved`  
**Approved at:** 2026-09-21  
**Scope:** transactional outbox dispatch and consumer delivery deduplication

## Decision

The Oplyra event runtime uses tenant-scoped, at-least-once delivery. It does not claim exactly-once delivery. Correctness is obtained by combining an atomic transactional outbox, leased claims with fencing tokens, retry/dead-letter policy and persistent consumer deduplication.

## Claim and lease

1. Every claim is restricted to one `tenantId`; cross-tenant batches are prohibited.
2. `pending` records that are available, retryable `failed` records whose delay elapsed, and `dispatching` records whose lease expired are eligible.
3. A claim atomically moves the record to `dispatching`, increments `attempt`, creates a new opaque `fencingToken` and sets `leaseExpiresAt`.
4. An active lease cannot be reclaimed.
5. Reclaim after expiry must increment `attempt` and rotate the fencing token.
6. Only the current attempt and fencing token may settle a delivery. A stale settlement fails with canonical `INVALID_STATE_TRANSITION` and cannot modify the current record.

## Settlement and retries

- successful delivery moves `dispatching → dispatched`;
- retryable failure below the configured maximum moves `dispatching → failed` and requires `nextAvailableAt`;
- deterministic/non-retryable failure, or exhaustion of attempts, moves the record to terminal `dead_lettered`;
- retry schedule and maximum attempts are injected runtime policy; this contract deliberately does not invent fixed values;
- `dispatched` and `dead_lettered` are terminal.

Retryable transport failures currently map only to registered codes `INTEGRATION_UNAVAILABLE`, `PROVIDER_TIMEOUT` and `UPSTREAM_SERVICE_UNAVAILABLE`. `EVENT_NOT_REGISTERED` and `INVALID_STATE_TRANSITION` are terminal for this boundary.

## Consumer deduplication

Before any consumer side effect, the consumer must persistently claim this scope:

```text
tenantId + eventTransactionId + consumerAgent
```

A completed duplicate returns `duplicate` and performs no repeated side effect. Concurrent processing under an active lease is prohibited. An expired consumer lease may be reclaimed only with a new fencing token; completion/failure is accepted only from the current token.

## Transport neutrality

No broker, queue, scheduler, polling cadence or provider is selected. EXP-02 must resolve the conditional ADR-0004 before transport activation. The boundary applies independently of that choice.

## Directly validated references

- Agent Transaction Protocol: transactional outbox, at-least-once delivery and consumer idempotency;
- `18-technical-experiments.md`, EXP-02 E2-03 to E2-05: concurrency, fencing, retry/dead-letter and crash recovery;
- `docs/harness/PRODUTO.md`: lease/lock, fencing, dead-letter and escalation;
- Events Registry 1.1 and payload schema 1.0 for `copy.draft_created`;
- Errors Registry 1.2 for every error code named by this decision.

## Unresolved implementation dependencies

These references cannot yet be validated against an implementation and remain explicit blockers:

1. `content.event_outbox` has no persisted lease owner, fencing token, lease expiry or terminal `dead_lettered` state;
2. no persistent consumer-deduplication store exists;
3. maximum attempts and backoff policy have no approved values;
4. no canonical dead-letter escalation event is registered, so implementation must not emit an invented event;
5. EXP-02 / ADR-0004 has not selected a transport.

Therefore this decision authorizes contracts and executable contract tests only. It does not authorize database migration, dispatcher implementation, privileges, transport or runtime dispatch.
