# CR-014 — Outbox delivery persistence

**Status:** `approved_and_applied`  
**Classification:** `backward_compatible`  
**Issued at:** 2026-09-21T17:05:00Z  
**Base:** Contract Registry Release 2.3  
**Target:** Contract Registry Release 2.4

## Objective

Add the persistence required by DEC-RUNTIME-003 for outbox claim leases, fencing, terminal dead-letter state and consumer deduplication, while keeping dispatch and transport disabled.

## Database change

Migration `20260921000011_outbox_delivery_persistence.sql` adds to `content.event_outbox`:

- `lease_owner`;
- `fencing_token`;
- `lease_expires_at`;
- `dead_lettered_at`;
- canonical `dead_lettered` status;
- state-shape constraints for `pending`, `dispatching`, `failed`, `dispatched` and `dead_lettered`;
- tenant-first indexes for eligible records and expired leases;
- a composite consumer identity constraint.

It also creates `content.event_consumer_deduplication`, keyed by:

```text
tenant_id + event_transaction_id + consumer_agent
```

The table persists `processing`, `completed` and `failed` state, positive attempt, lease owner, fencing token, lease expiry, completion and error information. Its composite foreign key prevents a consumer different from the one registered in the outbox from claiming the event.

## Security boundary

- RLS is enabled and forced on the deduplication table;
- `tenant_id` is immutable;
- no policy was created for the table;
- no new grant was issued;
- `oplyra_worker_exec` still cannot read or update the outbox;
- the writer cannot read, insert or update consumer-deduplication rows.

This is intentional. Direct table access would let the writer bypass the claim/settlement state machine. A later increment must expose only controlled atomic operations through a dedicated dispatcher boundary.

## Validation

- migration 20260921000011 applied successfully to the isolated local database;
- 68/68 pgTAP assertions passed across four files;
- 21/21 CR-014-specific assertions passed;
- direct catalog inspection confirmed the migration, four new outbox columns, forced RLS, zero deduplication policies and no worker outbox update privilege;
- no runtime component or transport was added.

## Explicit limits

- no dispatcher role or login exists;
- no claim, reclaim or settlement procedure exists;
- retry maximum and backoff remain injected but unapproved;
- no dead-letter escalation event is emitted;
- no transport was selected;
- the migration was tested on the isolated local Supabase database, not production data.

## Compatibility

Result: **backward compatible with Release 2.3**. Existing pending outbox rows satisfy the new state constraint. Existing writer privileges and atomic writes remain unchanged. The new table is inaccessible to runtime roles until a governed dispatcher interface is added.

## Next permitted increment

Define and implement a dedicated dispatcher execution role plus atomic claim/reclaim/settlement database functions. The interface must enforce tenant scope, current attempt/fencing token, configured retry policy and consumer deduplication without granting direct table mutation. Transport activation remains blocked by EXP-02 / ADR-0004.

## Rollback

Use a forward rollback migration. It must first prove that no row uses `dead_lettered`, no active lease exists and no deduplication row would be lost. Do not drop the new table or columns through an unguarded rollback.
