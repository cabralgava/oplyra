# DEC-RUNTIME-004 — Canonical outbox retry and failure policy

**Status:** `approved`  
**Approved at:** 2026-09-21  
**Scope:** retry classification, backoff, exhaustion and uncertain external effects

## Decision

Oplyra fixes the outbox policy at five total delivery attempts with deterministic exponential delays of 1, 2, 4 and 8 seconds after the first four retryable failures. No jitter is used in v1.

On the fifth failed delivery, the record becomes `dead_lettered` with `RETRY_ATTEMPTS_EXHAUSTED`, while retaining the original root-cause code and evidence. Unknown error codes are terminal. An uncertain external effect is never retried automatically and requires human reconciliation in `waiting_human`.

## Canonical classifications

Retryable: `INTEGRATION_UNAVAILABLE`, `PROVIDER_RATE_LIMITED`, `PROVIDER_TIMEOUT`, `UPSTREAM_SERVICE_UNAVAILABLE`.

Terminal for the dispatcher boundary: `EVENT_NOT_REGISTERED`, `INVALID_STATE_TRANSITION`. Exhaustion is represented separately by terminal code `RETRY_ATTEMPTS_EXHAUSTED`.

## Rationale

Five bounded deliveries provide controlled recovery from short transient failures without permitting an unbounded loop. The 1/2/4/8 sequence is deterministic, testable and suitable for the current planning boundary. Preserving the root cause distinguishes the terminal orchestration outcome from the provider failure that caused it.

## Compatibility

This is a backward-compatible contract addition. Errors Registry 1.3 adds one terminal error code and does not rename or reclassify existing codes. It supersedes only DEC-RUNTIME-003 statements that the maximum and backoff were not yet approved; all lease, fencing, tenant-isolation and consumer-deduplication rules remain in force.

## Implementation boundary

This decision authorizes schema, fixtures, validation and contract tests. It does not authorize database changes, runtime implementation, recurring scheduling, external environments or event dispatch activation. The missing implementation references are enumerated in `RETRY-FAILURE-POLICY.md` and both runtime validation files.
