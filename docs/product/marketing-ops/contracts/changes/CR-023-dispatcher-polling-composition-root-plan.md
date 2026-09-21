# CR-023 — Dispatcher polling and composition-root plan

**Status:** `approved_and_applied`  
**Classification:** `planning_contract_no_runtime_activation`  
**Issued at:** 2026-09-21T21:00:00Z  
**Base:** Contract Registry Release 2.12  
**Target:** Contract Registry Release 2.13

## Objective

Close the dispatcher polling and composition-root planning gap while preserving the prohibition on runtime and environment activation.

## Changes

1. add the runtime-plan schema and validation;
2. define a canonical valid plan plus five invalid cases;
3. approve the worker, tenant scheduling, polling, scheduler, shutdown, observability and scaling boundaries;
4. separate the transactional event outbox from `pgmq` workflow jobs and `pg_cron` occurrence materialization;
5. define all composition-root dependencies without implementing them;
6. update dispatcher validation so that the contract gap becomes an implementation gap.

## Compatibility

This is an additive planning contract. No registry, published schema identifier, action, event, error, permission, database function or runtime API changes.

## Explicit non-changes

- no worker or process entrypoint;
- no polling loop implementation;
- no queue or cron creation;
- no database migration or privilege change;
- no staging or production environment;
- no external side effect;
- runtime activation remains false.

## Evidence and limits

EXP-02 supports one worker and batch maximum 500. Existing claim contracts support default batch 25 and lease 120 seconds. The 1-second idle interval, 5-second infrastructure-failure interval, round-robin scheduling, catch-up-once policy and 30-second drain are planning defaults without production-equivalent evidence and remain subject to staging revalidation.

## Remaining blockers

1. implement and align the retry/failure policy in TypeScript and SQL;
2. implement dead-letter escalation publication and consumption;
3. implement the activation gate, tenant scheduler and composition root;
4. implement telemetry and operational alert thresholds;
5. approve the production environment plan;
6. repeat E2-09 in production-equivalent staging;
7. approve explicit runtime activation.

## Rollback

Reactivate Release 2.12 and remove the CR-023 planning artifacts. No operational rollback is necessary.
