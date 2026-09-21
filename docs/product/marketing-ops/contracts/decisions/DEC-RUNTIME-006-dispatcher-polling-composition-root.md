# DEC-RUNTIME-006 — Dispatcher polling and composition root

**Status:** `approved_for_implementation_planning`  
**Approved at:** 2026-09-21  
**Scope:** worker topology, polling, scheduler boundary, activation and dependency composition

## Decision

The future event dispatcher runs as a dedicated long-lived Node process composed from explicit ports. It polls the transactional outbox through the existing tenant-scoped claim boundary and executes one sequential tenant cycle at a time.

The initial ceiling is one worker per queue and batch 500. The default event claim batch is 25 with a 120-second lease. Tenant selection is round-robin and a claim can never mix tenants.

`pgmq` is the workflow JobQueue, not a second source of truth for event delivery. `pg_cron` only materializes UTC schedule occurrences idempotently and enqueues them. It cannot call consumers directly.

## Safety

Activation is false by default and checked with the kill switch before every claim. Shutdown stops claims first, attempts settlement without redelivery and delegates incomplete recovery to lease expiry and fencing.

No automatic scale-out is allowed. Any worker or batch increase requires explicit approval and repetition of E2-01 and E2-09.

## Evidence classification

One worker and batch 500 are experimental ceilings supported by EXP-02. Default batch 25 and lease 120 seconds preserve existing contracts. Polling intervals, round-robin tenant scheduling, catch-up-once and 30-second drain are approved planning defaults but lack production-equivalent evidence.

## Implementation boundary

This decision approves the executable plan contract only. It does not authorize process implementation, queue or cron creation, deployment, database changes, external side effects or runtime activation.
