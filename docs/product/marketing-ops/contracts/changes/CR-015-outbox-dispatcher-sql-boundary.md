# CR-015 — Outbox dispatcher SQL boundary

**Status:** `approved_and_applied`  
**Classification:** `backward_compatible`  
**Issued at:** 2026-09-21T17:30:00Z  
**Base:** Contract Registry Release 2.4  
**Target:** Contract Registry Release 2.5

## Objective

Implement the controlled database boundary for tenant-scoped outbox claim/reclaim and fenced settlement, without granting direct table mutation or activating a transport/runtime loop.

## Dedicated roles

Migration `20260921000012_outbox_dispatcher_functions.sql` creates:

- `oplyra_dispatcher_login`: `LOGIN`, `NOINHERIT`, `NOBYPASSRLS`;
- `oplyra_dispatcher_exec`: `NOLOGIN`, `NOBYPASSRLS`.

The login can assume the execution role. The execution role receives `USAGE` only on `app` and `EXECUTE` only on the two controlled functions. Neither role receives direct privilege on `content.event_outbox` or `content.event_consumer_deduplication`.

The local password is configured by `scripts/local-db-roles.sh`; no password is stored in a migration.

## Atomic claim/reclaim

`app.claim_outbox_events(...)`:

- requires equality between the active transaction tenant and requested tenant;
- selects only eligible `pending`, delayed `failed` or expired `dispatching` rows;
- uses row locks with `SKIP LOCKED`;
- increments attempt and rotates a random opaque fencing token;
- creates or reclaims the matching consumer-deduplication record in the same transaction;
- blocks active consumer leases and completed duplicates;
- returns the CR-013 claim output structure;
- accepts batch size and lease duration as inputs without inventing global timing values.

If the outbox claim and consumer claim counts differ, the complete transaction fails and rolls back.

## Atomic settlement

`app.settle_outbox_event(...)` updates the outbox and consumer-deduplication record in one transaction. It requires the current:

```text
tenantId + eventTransactionId + consumerAgent + dispatcherId + attempt + fencingToken
```

Supported outcomes:

- `dispatched` → outbox `dispatched`, consumer `completed`;
- `retryable_failure` → outbox and consumer `failed`, with future `nextAvailableAt`;
- `terminal_failure` → outbox `dead_lettered`, consumer `failed`.

A stale attempt/token raises SQLSTATE `55000` with canonical `INVALID_STATE_TRANSITION`. Repeating an already completed successful settlement returns `duplicate` without repeating side effects.

Retryable and terminal failures accept only the error codes approved by DEC-RUNTIME-003. Maximum attempts remain a caller-injected policy because no canonical value is approved.

## Validation

- migration 20260921000012 applied to the isolated local Supabase database;
- 87/87 pgTAP assertions passed across five files;
- 19/19 CR-015 structural/privilege assertions passed;
- 9/9 PostgreSQL integration tests passed;
- concurrency produced exactly one claim winner;
- active lease, expired reclaim, fencing rotation, stale settlement, retry delay, successful duplicate and dead-letter were exercised against PostgreSQL;
- dedicated test tenants prevent interference with writer integration tests.

## Explicit limits

- no application adapter or continuous dispatcher process exists;
- no transport/provider is selected or contacted;
- no retry maximum or backoff formula is approved;
- no dead-letter escalation event is registered or emitted;
- functions currently support the only executable event payload, `copy.draft_created`;
- tests use the isolated local database, not production.

## Compatibility

Result: **backward compatible with Release 2.4**. Existing writer privileges are unchanged. Database access is additive through a new dedicated role and two functions, with default `PUBLIC` execution revoked.

## Next permitted increment

Implement the infrastructure adapter that invokes this SQL boundary and maps its JSON results/errors to typed core contracts. Add unit and PostgreSQL integration tests. Do not start a polling loop or choose transport until EXP-02 / ADR-0004 is resolved.

## Rollback

Use a forward migration that first revokes function execution, stops all dispatcher callers, drops the functions, revokes role membership and removes the roles only after confirming no active sessions depend on them. Persistence from CR-014 must remain intact.
