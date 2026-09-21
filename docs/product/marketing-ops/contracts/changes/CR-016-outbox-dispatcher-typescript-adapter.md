# CR-016 — Outbox dispatcher TypeScript port and adapter

**Status:** `approved_and_applied`  
**Classification:** `backward_compatible`  
**Issued at:** 2026-09-21T17:55:00Z  
**Base:** Contract Registry Release 2.5  
**Target:** Contract Registry Release 2.6

## Objective

Expose the CR-013/CR-015 dispatcher boundary as typed Core contracts and a PostgreSQL infrastructure adapter, without creating a polling loop or selecting a transport.

## Core contract

`packages/core/src/application/outbox-dispatcher.ts` adds:

- typed claim request, batch and event payload;
- typed settlement request, error and result;
- `OutboxDispatcherPort`;
- structural validation before database access;
- validation of returned tenant, dispatcher, event, payload, trace, attempt, fencing and timestamps;
- retryable and terminal error-code validation aligned with DEC-RUNTIME-003.

Core now exposes canonical `InvalidStateTransition` and `IntegrationUnavailable` errors, both already registered in Errors Registry 1.2.

## Transaction boundary

`UnitOfWork` adds `withDispatcherTransaction`. The infrastructure implementation:

- assumes only `oplyra_dispatcher_exec`;
- sets tenant and dispatcher context with transaction-local settings;
- releases the pooled connection only after commit/rollback, so role and settings cannot leak.

The testing package receives the equivalent in-memory transaction hook.

## PostgreSQL adapter

`packages/infra/src/outbox-dispatcher-adapter.ts` implements `OutboxDispatcherPort` by calling only:

- `app.claim_outbox_events(...)`;
- `app.settle_outbox_event(...)`.

It never reads or updates the content tables directly. Inputs are validated before opening a transaction. JSON returned by PostgreSQL is validated again before leaving the adapter.

Database failures are mapped as follows:

- SQLSTATE `55000` with stale-state marker → `INVALID_STATE_TRANSITION`;
- SQLSTATE `42501` → `TENANT_MISMATCH`;
- SQLSTATE `22023` → `TRANSACTION_SCHEMA_INVALID`;
- connection/shutdown SQLSTATEs → `INTEGRATION_UNAVAILABLE`;
- unknown failures remain visible to internal observability and are not silently reclassified.

## Validation

- 10/10 Core contract tests passed;
- 7/7 adapter tests passed against PostgreSQL where applicable;
- concurrent adapter claims produced exactly one winner;
- stale fencing mapped to the canonical domain error;
- successful replay returned `duplicate`;
- retry timing and attempt increment were validated;
- invalid retry was rejected before any transaction;
- database unavailability mapping was validated without exposing driver errors;
- all three TypeScript packages passed isolated type checks.

## Explicit limits

- no scheduler, poller or continuous process exists;
- the adapter does not deliver an event to a consumer yet;
- no transport/provider was selected;
- retry maximum and backoff calculation remain unapproved;
- no dead-letter escalation event is emitted;
- only `copy.draft_created` is executable through this typed slice.

## Compatibility

Result: **backward compatible with Release 2.5**. Core and infrastructure exports are additive. The new UnitOfWork method is implemented by every repository-owned implementation. No registry, schema, database object or privilege changed.

## Next permitted increment

Implement a single-cycle dispatcher service that obtains one typed batch, invokes an injected consumer-delivery port, and settles every claimed item. Use a fake/in-memory delivery port first; do not implement polling, scheduling or external transport until EXP-02 / ADR-0004 is resolved.

## Rollback

Remove the Core dispatcher module and exports, adapter and export, UnitOfWork method and testing hook, then restore Contract Registry Release 2.5. Database functions and persistence remain valid and require no rollback.
