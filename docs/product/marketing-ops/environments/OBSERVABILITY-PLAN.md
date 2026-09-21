# Observability Plan v1

**Status:** `approved_for_planning`  
**Backend provider:** pending `DP-15b`

## Instrumentation

Use OpenTelemetry-compatible traces, metrics and structured logs so the backend can be replaced. Propagate `correlationId`, `causationId`, `workflowId`, `taskId`, transaction identity and deployment version where applicable.

Tenant IDs, user identifiers, email addresses, tokens, prompt bodies, commercial payloads and provider responses are prohibited as metric labels. Logs use an allowlist and redact at the source.

## Required signals

| Area | Signals |
|---|---|
| Web/API | request rate, latency, error rate, auth failures, dependency health |
| Database | connections/capacity, waiting locks, slow queries, migration state, storage growth |
| Dispatcher | cycle duration, claims, empty cycles, delivery, settlement failure, retry, dead letter |
| Queues/scheduler | lag, depth, oldest age, materialization delay, duplicate occurrence rejection |
| Agents/AI | execution status, model route, token/cost aggregates, budget blocks, approval waits |
| Security | denied cross-tenant access, privilege failure, suspicious auth and secret/config mismatch |
| Release | version, environment fingerprint, deployment and rollback markers |

## Proposed initial alert gates

These thresholds are planning hypotheses, not production evidence:

- queue lag p95 warning at 30 seconds and critical at 60 seconds;
- any sustained settlement failure or new dead-letter triggers operational review;
- waiting locks, connection saturation or abnormal autovacuum growth blocks scale-up;
- environment fingerprint mismatch is startup-fatal;
- failed negative tenant-isolation check is SEV1 and blocks release;
- anomalous spend or paid-call activity while runtime is disabled is SEV1.

Numeric database, CPU, memory, availability and cost thresholds must be calibrated in staging and approved with the contracted provider capacity.

## Retention and access

The discovery proposals of 30-day logs, 14-day traces and 13-month aggregate metrics remain unapproved. Final retention depends on legal validation, backend capability, region, cost and deletion controls. Access requires MFA, least privilege and audit trail.

## Readiness

Before production creation is accepted, staging must demonstrate trace continuity across web → transaction → job/event → worker → settlement, redaction tests, alert delivery, dashboard ownership and an incident drill. A dashboard without actionable owner and response procedure does not satisfy readiness.

## Unresolved references

Provider, residence, DPA, international transfer assessment, alert channel, on-call ownership, retention and cost ceiling remain pending. This plan creates no telemetry account or export.
