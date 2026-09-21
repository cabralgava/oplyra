# Oplyra Environment Architecture v1

**Status:** `approved_for_planning`  
**Provisioning:** `not_authorized`  
**Runtime activation:** `not_authorized`

## Environments

| Environment | Current state | Data | Purpose |
|---|---|---|---|
| Local | existing | synthetic only | Development, migrations and destructive tests |
| CI | ephemeral when configured | synthetic only | Reproducible build, contract, database and browser gates |
| Staging | planned, not created | synthetic only | Production-equivalent security, recovery, EXP-03/04 and E2-09 evidence |
| Production | planned, not created | real data only after readiness approval | Approved product increments and internal verification tenants |

The older two-environment decision remains authoritative until `DP-28b` is explicitly resolved. This document specifies staging because production-equivalent E2-09 evidence is already a runtime activation gate; it does not authorize creating staging.

## Proposed destinations — not approved

| Component | Proposed destination | Status and dependency |
|---|---|---|
| PostgreSQL, Auth, Storage | Supabase, proposed `sa-east-1` | `DP-07a`, EXP-03 and current capability/cost verification |
| Web/BFF/API | Vercel, proposed `gru1` | `DP-05a/b`, EXP-03 and current capability/cost verification |
| Worker | Cloud Run worker pools, proposed `southamerica-east1` | `DP-06a/b`, EXP-03; Fly.io/AWS remain alternatives |
| Observability backend | not selected | `DP-15b` |
| Transactional email | not selected | `DP-08a` |
| Source control/CI | GitHub private + GitHub Actions proposed | `DP-14b` |

No historical price, regional availability or product feature is treated as current evidence. These facts must be revalidated immediately before a provider decision.

## Isolation

Staging and production require separate database projects, credentials, secrets, queues, storage namespaces, OAuth callbacks, email credentials, telemetry tokens and DNS configuration. Preview/local workloads cannot fall back to production configuration. Production data cannot be copied to local or staging.

## Component flow

```text
Browser → Web/BFF → tenant-scoped database boundary
                     ↓ transactional writes
              content.event_outbox
                     ↓ controlled claim
             dedicated Node worker
                     ↓ registered consumer
               governed side effect

pg_cron → idempotent occurrence materializer → pgmq workflow jobs
```

The outbox remains the event-delivery source of truth. `pgmq` and `pg_cron` do not bypass tenant, authorization, approval, budget, consent, idempotency or audit checks.

## Network and exposure

- database and worker administration are never browser-accessible;
- the web uses publishable credentials only in the browser;
- server and worker identities are distinct and least-privileged;
- domain schemas are not exposed through the Data API;
- inbound webhooks terminate at authenticated, rate-limited adapters;
- health endpoints disclose no tenant data, dependency credentials or detailed topology.

## Creation order

1. approve providers, regions, budget and staging decision;
2. authorize creation with exact resource names and owners;
3. create isolated staging;
4. validate network, identities, migrations, RLS, backup/restore and E2-09;
5. separately approve production creation;
6. create production with runtime disabled;
7. run non-destructive readiness checks;
8. request a separate runtime activation change.

Creating an environment, deploying software and activating runtime are three separate authorizations.
