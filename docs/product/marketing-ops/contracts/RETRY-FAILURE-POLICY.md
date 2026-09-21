# Outbox Retry and Failure Policy v1

**Status:** `approved`  
**Contract version:** `1.0`  
**Applies to:** transactional outbox delivery  
**Runtime activation:** `prohibited`

## Purpose

This contract fixes the retry and terminal-failure decisions that were deliberately left injectable by DEC-RUNTIME-003. It is an executable planning artifact: the JSON Schema, fixtures and contract tests validate the policy, but this release does not create or activate a poller, worker, schedule, database migration, staging environment or production environment.

## Canonical delivery policy

An outbox record has at most five delivery attempts. Attempt 1 is the initial delivery. Failed retryable attempts schedule the next delivery after 1, 2, 4 and 8 seconds respectively. Jitter is disabled in v1 so that the contract remains deterministic and directly testable.

| Failed attempt | Next delay |
|---:|---:|
| 1 | 1 second |
| 2 | 2 seconds |
| 3 | 4 seconds |
| 4 | 8 seconds |
| 5 | no retry; terminal exhaustion |

The fifth failed delivery moves the record to `dead_lettered` with `RETRY_ATTEMPTS_EXHAUSTED`. The original failure code and provider evidence must be preserved as root-cause evidence; exhaustion must not erase them.

## Error classification

Automatic retry is allowed only for these registered transient codes:

- `INTEGRATION_UNAVAILABLE`;
- `PROVIDER_RATE_LIMITED`;
- `PROVIDER_TIMEOUT`;
- `UPSTREAM_SERVICE_UNAVAILABLE`.

The dispatcher treats `EVENT_NOT_REGISTERED` and `INVALID_STATE_TRANSITION` as terminal for its own boundary. An unknown error code is terminal. The retryable and terminal sets must be disjoint. Adding or reclassifying a code requires a governed registry change and compatibility review; prompt inference cannot change this behavior.

## Uncertain external effect

If a provider call may have produced an external side effect but no reliable acknowledgement exists, automatic retry is prohibited. The workflow moves to `waiting_human`, requires reconciliation and preserves evidence. This prevents an at-least-once transport from silently repeating a potentially non-idempotent external action.

## Settlement failure

Failure to persist a settlement does not authorize a second delivery in the same dispatcher cycle. Recovery authority remains the persisted lease and fencing-token state. A later cycle may reclaim only according to the canonical lease rules.

## Transport and activation boundary

ADR-0004 selects `pgmq` and `pg_cron` for MVP planning, subject to production-equivalent staging revalidation. This policy does not activate either component. `eventRuntimeDispatchEnabled` remains false until an explicit activation change is approved after implementation, environment planning and staging evidence.

## Directly validated references

- Errors Registry 1.3, including `RETRY_ATTEMPTS_EXHAUSTED`;
- DEC-RUNTIME-003 lease, fencing, terminal-state and deduplication rules;
- ADR-0004 transport selection for planning;
- EXP-02, including the E2-09 representative local retest;
- `outbox-retry-policy.schema.json` and its valid/invalid fixtures;
- dispatcher policy fixture binding and contract tests.

## References not directly validated

The following do not yet exist in aligned executable form and remain blockers:

1. canonical `DeliveryFailurePolicy` implementation;
2. TypeScript `OutboxDeliveryError` support for `PROVIDER_RATE_LIMITED` and `RETRY_ATTEMPTS_EXHAUSTED`;
3. SQL settlement enforcement of the five-delivery limit and exhaustion semantics;
4. canonical dead-letter escalation event identity and payload schema;
5. dispatcher polling/scheduler binding and composition root;
6. production environment plan approval and production-equivalent staging revalidation.

No claim of zero gaps is made. The contract is complete; its runtime implementation is not.
