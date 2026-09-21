# CR-021 — Outbox retry and failure policy contract

**Status:** `approved_and_applied`  
**Classification:** `backward_compatible_contract_addition`  
**Issued at:** 2026-09-21T19:00:00Z  
**Base:** Contract Registry Release 2.10  
**Target:** Contract Registry Release 2.11

## Objective

Close the planning gap for canonical outbox retry classification, delivery limit, backoff and exhaustion without implementing or activating runtime infrastructure.

## Changes

1. approve `DEC-RUNTIME-004` and `RETRY-FAILURE-POLICY.md`;
2. add executable schema `outbox-retry-policy.schema.json`;
3. add one valid and three invalid fixtures, including a business-invariant overlap case;
4. bind the dispatcher policy fixture to five deliveries and 1/2/4/8-second backoff;
5. add `RETRY_ATTEMPTS_EXHAUSTED` to Errors Registry 1.3;
6. add contract tests and machine-readable validations;
7. record `pgmq` and `pg_cron` as selected for planning while keeping activation prohibited.

## Compatibility

- Errors Registry: 1.2 → 1.3;
- canonical errors: 45 → 46;
- no existing code is renamed, removed or reclassified;
- no existing schema identifier is replaced;
- the dispatcher policy fixture advances from 1.0 to 1.1;
- DEC-RUNTIME-003 remains authoritative except for its now-resolved maximum-attempt, backoff and transport-selection gaps.

## Explicit non-changes

- no TypeScript runtime behavior is added or changed;
- no SQL function or migration is added or changed;
- no worker, poller, daemon or recurring job is created;
- no local product database state is changed;
- no staging or production environment is created;
- `eventRuntimeDispatchEnabled` remains false.

## Validation scope

Contract tests validate the schema, exact schedule, registered error references, disjoint classification, exhaustion semantics, uncertain external-effect handling, settlement-failure behavior and dispatcher binding. The invalid overlap fixture is structurally schema-valid by design and is rejected by the cross-registry business invariant.

## Remaining blockers

1. implement `DeliveryFailurePolicy` and align TypeScript error types;
2. align outbox settlement SQL with the canonical policy;
3. register the dead-letter escalation event and payload;
4. implement polling/scheduler binding and composition root;
5. approve the production environment plan;
6. repeat E2-09 in production-equivalent staging;
7. approve an explicit runtime activation change.

## Rollback

Reactivate Release 2.10 and remove the CR-021 artifacts. Because this change has no database, runtime or external-resource effect, no operational rollback is required.
