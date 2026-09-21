# Dispatcher Polling and Composition Root Plan v1

**Status:** `approved_for_implementation_planning`  
**Plan version:** `1.0`  
**Runtime activation:** `prohibited`

## Boundary

This contract defines how the future dedicated Node worker is assembled and how it polls safely. It does not create the worker, configure `pg_cron`, create a `pgmq` queue, change the database or activate dispatch.

The event outbox remains the authoritative source for domain-event delivery. `pgmq` is the replaceable job queue for workflow jobs. `pg_cron` only materializes idempotent scheduled occurrences and enqueues work; it cannot invoke consumers, deliver events or perform external side effects.

## Initial topology

- one long-running Node worker per queue;
- one tenant per dispatcher cycle;
- tenants selected in round-robin order;
- cross-tenant batches prohibited;
- sequential single-cycle processing;
- unique dispatcher identity per process;
- default claim batch 25, hard maximum 500;
- lease duration 120 seconds;
- idle interval 1 second;
- infrastructure-failure interval 5 seconds.

The one-worker and batch-500 ceilings are backed by EXP-02. Batch 25 and lease 120 seconds preserve the existing dispatcher claim fixture. The polling intervals and 30-second shutdown drain are planning defaults and still require production-equivalent staging evidence.

## Activation and kill switch

Activation defaults to false. The worker must remain healthy but idle when disabled. An explicit, versioned activation change is required.

The activation gate and kill switch are checked before every claim, not only at startup. Disabling the worker stops new claims. It does not pretend to cancel an external effect already in progress.

## Composition root

The future process entrypoint must inject these dependencies explicitly:

1. activation gate;
2. tenant scheduler;
3. outbox dispatcher adapter;
4. consumer registry;
5. delivery-failure policy;
6. dead-letter publisher;
7. clock;
8. telemetry.

Consumer resolution uses the registered `eventKey + consumerAgent` pair. Missing registration is terminal and cannot fall back to a prompt-selected consumer.

## Scheduler

All occurrence timestamps are UTC. The idempotency scope is:

```text
tenantId + scheduleRef + occurrenceAt
```

Overlapping materialization is prohibited. A misfire may catch up one occurrence through the same idempotent path; it cannot replay an unbounded history automatically.

## Shutdown and recovery

Shutdown stops new claims first and gives the current cycle up to 30 seconds to settle. It never redelivers inside the same process cycle. If settlement cannot complete, the durable lease and fencing rules govern recovery after lease expiry.

## Observability and privacy

Required metrics are queue lag, claims, empty cycles, deliveries, retries, dead letters, settlement failures and cycle duration. Tenant identifiers and payload contents are prohibited as metric labels. Alert thresholds remain an environment-plan dependency.

## Scaling

Automatic scale-out is prohibited. Increasing workers above one or batch above 500 requires an explicit change plus E2-01 and E2-09 repetition. E2-09 must pass in production-equivalent staging before activation.

## Unvalidated references

The implementation does not yet exist for the activation gate, tenant scheduler, process entrypoint, canonical failure policy, dead-letter publisher, consumer composition, telemetry, `pgmq` JobQueue adapter, `pg_cron` materializer or graceful shutdown. No zero-gap claim is made.
