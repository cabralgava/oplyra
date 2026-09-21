# Secrets and Service Identities Plan v1

**Status:** `approved_for_planning`  
**Secret values:** none stored in this document or repository

## Identity separation

| Identity | Purpose | Explicit prohibitions |
|---|---|---|
| Browser public client | Auth and approved public API | No database password, service key or provider secret |
| Web server | Tenant-scoped BFF/API | No migration, worker or ops-admin privilege |
| Dispatcher login/exec | Controlled outbox claim and settlement | No direct table access; no cross-tenant batch |
| Workflow worker | Job execution through approved ports | No administrator role or unrestricted database access |
| Scheduler materializer | Create idempotent occurrences/jobs | No consumer delivery or external side effect |
| Migration identity | Apply reviewed migrations | Not present in web or worker runtime |
| CI deploy identity | Publish approved artifacts | Federated/short-lived credentials preferred; no product data access |
| Ops CLI identity | Narrow audited operational commands | No generic SQL shell or silent impersonation |
| Observability exporter | Export redacted telemetry | No product write access |

Every login identity maps to a non-login execution role where supported. Production and staging identities are distinct.

## Canonical configuration names

The existing names from `16-environments-release.md` remain canonical, including `OPLYRA_ENV`, `SUPABASE_URL`, `DATABASE_URL_POOLED`, `DATABASE_URL_MIGRATIONS`, `WORKER_DB_ROLE`, `OPS_ADMIN_CREDENTIAL`, provider API keys, OTLP configuration and `OPLYRA_ALLOW_REMOTE`.

Additional runtime-plan names proposed for implementation:

```text
OPLYRA_RUNTIME_ACTIVATION
OPLYRA_RUNTIME_KILL_SWITCH
OPLYRA_DISPATCHER_ID
OPLYRA_DISPATCHER_BATCH_SIZE
OPLYRA_DISPATCHER_LEASE_SECONDS
OPLYRA_DISPATCHER_IDLE_MS
OPLYRA_DISPATCHER_FAILURE_MS
OPLYRA_ENVIRONMENT_FINGERPRINT
```

Boolean strings are parsed strictly. Missing, malformed or mixed-environment configuration fails closed. Activation defaults to disabled.

## Storage and access rules

- provider-native secret stores only; never Git, artifacts, migrations, logs or database rows intended for product access;
- production access requires MFA, named person, least privilege and audit trail;
- applications receive only their own secrets;
- CI uses environment protection and approval for production;
- local `.env` remains ignored and cannot contain production credentials;
- secret presence is checked without printing values;
- telemetry headers are secrets and follow the same controls.

## Rotation

Rotate immediately on suspected exposure, personnel access change or provider incident. Routine periodicity remains a `DP-16b` decision. Rotation uses overlap where supported: create new version, deploy consumers, verify, revoke old version and record evidence. Database login rotation must also reconcile post-restore credentials.

## Environment fingerprint

Each process validates a non-secret fingerprint containing environment, database project identity and deployment identity. A mismatch stops startup. A preview or local build cannot use a production fingerprint even if other credentials are accidentally supplied.

## Pending decisions

Secret-manager providers, key ownership, rotation periodicity, break-glass custodians, CI provider and production support policy remain unapproved. No account or credential is created by this plan.
