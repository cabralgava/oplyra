# CR-020 — E2-09 planning-phase retest

**Status:** `approved_and_applied`  
**Classification:** `decision_refinement_no_environment_creation`  
**Issued at:** 2026-09-21T18:30:00Z  
**Base:** Contract Registry Release 2.9  
**Target:** Contract Registry Release 2.10

## Objective

Review and repeat E2-09 within the project-preparation phase, using only the local Supabase instance and a product-representative synthetic query. No production or staging environment may be created.

## Method correction

The prior benchmark used an indexed 50-row lookup with p95 around 0.4 ms. Sub-millisecond scheduler and client noise dominated its percentage, and the query did not represent Oplyra dashboard/check-in reads.

The retest uses:

- 50 tenants;
- 100 campaigns per tenant;
- 90 days and 450,000 metric snapshots;
- explicit null/unavailable values;
- a tenant-scoped 30-day campaign dashboard aggregation;
- five paired baseline/load trials and 1,500 samples per arm;
- the existing 1,000-job burst plus 5,000 jobs/h equivalent.

## Result

- baseline p95: 1.417 ms;
- under-load p95: 1.600 ms;
- aggregate degradation: 12.92% against a 20% maximum;
- queue lag p95: 0.172 s;
- 13 connections and zero waiting locks;
- E2-09: passed.

The earlier 23.95% result remains retained as evidence for the non-representative proxy. It is not erased or described as an execution error.

## Decision impact

- ADR-0004 is approved for MVP architecture design;
- `pgmq` and `pg_cron` are selected as the planned in-database queue/scheduler;
- one worker and batch 500 are initial planning limits;
- `eventRuntimeDispatchEnabled` remains false;
- no environment, worker, poller, daemon or recurring schedule was created or activated;
- E2-09 must be repeated in production-equivalent staging before activation.

## Compatibility

No registry, schema, product migration, runtime component or privilege changed. The experiment-only schema and data remain disposable.

## Remaining implementation blockers

1. canonical retry/failure-policy contract and tests;
2. canonical dead-letter escalation event identity and payload;
3. dispatcher polling/composition root;
4. production environment plan approval and later provision authorization;
5. E2-09 repetition in production-equivalent staging;
6. explicit runtime activation change.

## Rollback

Revert ADR-0004 to conditional status and reactivate Release 2.9. No remote resource or product database rollback is required.
