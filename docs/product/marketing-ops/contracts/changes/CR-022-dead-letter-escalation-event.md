# CR-022 — Dead-letter escalation event contract

**Status:** `approved_and_applied`  
**Classification:** `backward_compatible_event_addition`  
**Issued at:** 2026-09-21T20:00:00Z  
**Base:** Contract Registry Release 2.11 / Events Registry 1.1  
**Target:** Contract Registry Release 2.12 / Events Registry 1.2

## Objective

Close the dead-letter escalation identity and payload gap without implementing or activating the event runtime.

## Changes

1. add canonical event `runtime.dead_lettered`;
2. assign `runtime:event-runtime` as its single producer;
3. assign `orchestrator-agent` as its canonical consumer;
4. bind payload schema version 1.0;
5. define retry-exhausted and non-retryable terminal reasons;
6. require provenance, root cause, human escalation and guarded reprocessing;
7. add one valid fixture, five invalid fixtures and executable contract tests;
8. update dispatcher validation to reference the resolved identity and payload.
9. correct the validation-only unconsumed-agent list by removing `task.created`, whose canonical producer has already been `service:task-service` since the recorded collision resolution.

## Compatibility

- Events Registry: 1.1 → 1.2;
- canonical events: 136 → 137;
- external/runtime-produced events: 35 → 36;
- bound payload schemas: 1 → 2;
- pending payload schemas remain 135;
- no prior event identity, producer, consumer or payload is changed.
- the `task.created` correction changes validation evidence only; it does not change the registry entry.

## Explicit non-changes

- no publisher or consumer implementation;
- no SQL migration or database change;
- no scheduler, worker or poller activation;
- no notification provider or on-call destination;
- no staging or production environment;
- no automatic or manual reprocessing command;
- `eventRuntimeDispatchEnabled` remains false.

## Validation

The executable tests cover structural schema rules, registry uniqueness, producer/consumer ownership, registered source event and errors, retry-exhaustion binding, provenance separation and reprocessing safeguards. Business-invalid fixtures remain structurally valid by design and are rejected by cross-registry invariants.

## Remaining blockers

1. implement and align the canonical retry/failure policy in TypeScript and SQL;
2. implement atomic dead-letter escalation persistence/emission;
3. implement the Orchestrator escalation consumer;
4. implement dispatcher polling and composition root;
5. approve the production environment plan;
6. repeat E2-09 in production-equivalent staging;
7. approve explicit runtime activation.

## Rollback

Reactivate Release 2.11 and restore Events Registry 1.1. No operational resource rollback is required because this release creates no runtime or environment state.
