# CR-017 — Single-cycle outbox dispatcher

**Status:** `approved_and_applied`  
**Classification:** `backward_compatible`  
**Issued at:** 2026-09-21T18:25:00Z  
**Base:** Contract Registry Release 2.6  
**Target:** Contract Registry Release 2.7

## Objective

Implement one deterministic dispatcher cycle that claims a typed batch, invokes an injected consumer-delivery port and attempts fenced settlement for every claimed event. This release does not add polling, scheduling or external transport.

## Core service

`packages/core/src/application/outbox-dispatcher-cycle.ts` adds:

- `ConsumerDeliveryPort`;
- `DeliveryFailurePolicyPort`;
- `OutboxDispatcherCyclePort`;
- `createOutboxDispatcherCycle`;
- typed delivered, retryable and terminal outcomes;
- an explicit per-item result for successful or failed settlement.

The service obtains `requestedAt` and `settledAt` from the injected clock. Batch size and lease duration remain caller-provided and validated.

## Cycle semantics

For each cycle:

1. validate tenant, dispatcher, batch size and lease duration;
2. request one batch through `OutboxDispatcherPort`;
3. process claimed items sequentially;
4. invoke `ConsumerDeliveryPort.deliver`;
5. when delivery throws, invoke the injected failure policy;
6. validate the resulting retryable or terminal decision;
7. attempt settlement with the original attempt and fencing token;
8. continue to the next item if settlement itself fails;
9. return explicit counts and item statuses.

Sequential processing is intentional for this initial slice. Parallel consumer execution requires a separate bounded-concurrency decision and evidence.

## Failure boundary

The cycle does not invent retry timing. `DeliveryFailurePolicyPort` must provide a canonical error and, for retryable failures, a future `nextAvailableAt`.

Invalid classifications are rejected before settlement. If settlement fails after delivery, the item is returned as `settlement_failed`; delivery is not repeated within the same cycle. Persistent lease/fencing recovery remains authoritative.

The service does not swallow claim errors. A failed claim aborts the cycle before any consumer call.

## Validation

- 9/9 Core cycle tests passed;
- 4/4 end-to-end cycle tests passed against local PostgreSQL;
- success closed outbox and consumer-deduplication records atomically;
- retry persisted canonical error and next availability;
- terminal outcome persisted `dead_lettered`;
- thrown consumer failure was classified by the injected policy;
- invalid retry policy output was rejected before settlement;
- settlement failure was recorded explicitly and did not stop the next item;
- all three TypeScript packages passed isolated type checks.

## Explicit limits

- the injected delivery implementations used for validation are controlled in-memory fakes;
- no external consumer, queue, HTTP call or provider is used;
- no polling loop, scheduler, daemon or process entry point exists;
- no bounded parallelism policy is approved;
- retry maximum and backoff formula remain unapproved;
- no dead-letter escalation event is registered or emitted;
- only `copy.draft_created` is executable.

## Compatibility

Result: **backward compatible with Release 2.6**. The service and exports are additive. Database schema, roles, functions and privileges are unchanged.

## Next permitted increment

Implement the first internal `copy.draft_created` consumer adapter for `design-agent`, constrained to a deterministic, side-effect-free intake/acknowledgement boundary. Do not introduce external transport, polling or design-generation behavior without new canonical contracts.

## Rollback

Remove the cycle module, tests and export, then reactivate Contract Registry Release 2.6. Existing dispatcher SQL and adapter layers remain valid.
