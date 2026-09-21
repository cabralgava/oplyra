# CR-019 — EXP-02 evidence and ADR-0004 remains conditional

**Status:** `applied_experiment_result_decision_blocked`  
**Classification:** `decision_only_no_runtime_activation`  
**Issued at:** 2026-09-21T17:55:00Z  
**Base:** Contract Registry Release 2.8  
**Target:** Contract Registry Release 2.9

## Objective

Execute EXP-02 against isolated local PostgreSQL infrastructure, preserve failed iterations and select the MVP queue/scheduler transport only if every mandatory gate passes.

## Result

E2-01 through E2-08 and E2-10 passed. E2-09 failed:

- five paired trials;
- 1,500 baseline and 1,500 under-load samples;
- p95 0.410 ms → 0.509 ms;
- aggregate degradation 23.95% against a 20% maximum;
- trial degradation ranged from −49.59% to 113.22%;
- no waiting locks or connection exhaustion.

The result is **9/10**. ADR-0004 remains conditional and `transportSelected` remains false.

## Evidence discipline

Initial harness failures, two failed tuning configurations, one isolated passing run later invalidated as insufficient, an audited isolated failure and the final paired benchmark are all retained under `experiments/exp-02/evidencias/`.

## Contract impact

- no registry, schema, runtime component, migration or privilege changed;
- no transport or scheduler was approved;
- no recurring runtime was activated;
- ADR-0004 now records an executed negative result instead of an unexecuted condition.

## Explicit limits

- measurements are local and synthetic;
- scheduler validation did not wait through a real 30-hour interval or calendar month;
- CPU samples cover the complete PostgreSQL container;
- retry values remain experimental, without canonical runtime contract;
- no poller, daemon, recurring scheduler, external adapter or real external side effect was enabled.

## Required next decision

Choose one controlled branch:

1. allocate a larger candidate database compute profile and repeat E2-01/E2-09; or
2. evaluate a queue transport separated from the application database while retaining the transactional outbox as source of truth.

No branch is selected by this change.

## Rollback

Reactivate Release 2.8 and remove only the experiment/result documentation. No product database rollback is required; experiment queues and schema are disposable local artifacts.
