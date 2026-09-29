# Cost Ledger Contracts v1

**Status:** `approved`
**Contract version:** `1.0`
**Change:** [CR-027](changes/CR-027-persistent-cost-ledger.md), Contract Registry Release 2.17
**Applies to:** Product AI Model Harness (doc 13 §14), persisted locally in schema `finops`
**Runtime activation:** local Supabase only, synthetic data; no remote database, real provider, Stripe or publication

## Purpose

The persistent Cost Ledger replaces the in-memory budget and recorder fakes of the harness with database-level atomic acquisition, a single atomic close that writes the Model Call Record, recovery of abandoned attempts and audited reconciliation. Every time decision uses the PostgreSQL clock.

## Canonical artifacts

| Artifact | Path | Version |
| --- | --- | --- |
| Error Registry | `registries/errors.json` (+ derived `errors.validation.json`) | 1.4 → 1.5 (+`BUDGET_NOT_CONFIGURED`, +`MODEL_ATTEMPT_CLOSE_UNCONFIRMED`) |
| Model Profile Schema | `schemas/ai-model-harness/model-profile-1.1.schema.json` | new 1.1 (`limits.timeoutMs` ≤ 840 000); 1.0 kept byte for byte |
| Model Profile Registry | `registries/model-profiles.json` (+ derived `model-profiles.validation.json`) | 1.0 → 1.1, `entrySchema` → Schema 1.1 only; entries unchanged |
| Budget Period | `schemas/ai-model-harness/budget-period.schema.json` | 1.0 |
| Cost Ledger Entry | `schemas/ai-model-harness/cost-ledger-entry.schema.json` | 1.0 |
| Model Attempt snapshot | `schemas/ai-model-harness/model-attempt.schema.json` | 1.0 |
| Migrations | `supabase/migrations/20260929000013_finops_ledger_schema.sql`, `…000014_finops_ledger_functions.sql` | new |
| Release validation | `cross-registry-validation-v2.17.json` | 2.17 (75 checks) |

`model-call-record.schema.json` 1.0 and `common-definitions` 1.1 are unchanged and reused.

## Database boundary

| Function | Role | Result |
| --- | --- | --- |
| `app.acquire_model_attempt` | `oplyra_worker_exec` | `acquired` (+ `fencingToken`, `leaseExpiresAt`, snapshot), `conflict`, `in_progress`, `closed`, `insufficient` (+ `remainingMicroUsd`), `budget_not_configured`; `22023` for invalid parameters |
| `app.close_model_attempt` | `oplyra_worker_exec` | `closed` or `duplicate` (exact replay); `55000 INVALID_STATE_TRANSITION` otherwise; `22003` on counter overflow |
| `app.budget_remaining` | `oplyra_worker_exec` | advisory remaining, `null` without an applicable tenant period |
| `app.expire_next_model_attempt` | `oplyra_worker_exec` | `callId` of one attempt moved to `pending_reconciliation (lease_expired)`, or `null` |
| `app.reconcile_model_attempt` | `oplyra_ops_exec` | `reconciled` or `duplicate`; audited |
| `app.open_budget_period` / `app.close_budget_period` | `oplyra_ops_exec` | period snapshot; `23P01` on overlap; audited |

All functions are `security definer`, owned by `postgres`, with `search_path = pg_catalog, pg_temp`, `REVOKE ALL FROM PUBLIC` and explicit revokes from `anon`, `authenticated`, `service_role`. Tables have RLS enabled and forced, no policies and no grants. Cross-tenant calls fail with `42501`.

## Invariants outside the schema subset

Enforced by constraints, triggers and functions (pgTAP) and mirrored by `test/contracts/cost-ledger-invariants.ts` for `-business-invariant` fixtures:

- Budget Period: `tenant` scope ⇔ `workflowKey` null; `periodEnd > periodStart`; `closed` ⇔ `closedAt`; counters sum to at most 2^53 − 1 and equal the journal sums; no overlap per tenant, scope and workflow key.
- Cost Ledger Entry: `entryId = callId:kind:periodScope`; fixed sign pattern per kind; `reconcile` only by `operator`; append-only.
- Model Attempt: `callId` derived from the identity (also a database check); state shape per status (`released` ⇒ actual 0, `reconciled` ⇒ evidence); identity, fingerprint, periods, estimate, lease and close-time command immutable; the fencing token is retained and never exposed in snapshots.
- Model Call Record: exactly one per attempt closed by `close_model_attempt`, none for attempts moved by the sweep; immutable; typed columns equal the stored `record_document`.

## Harness mapping

| Ledger outcome | Harness failure kind | Code |
| --- | --- | --- |
| `budget_not_configured` | `budget_not_configured` | `BUDGET_NOT_CONFIGURED` |
| `insufficient` | `budget_exceeded` | `BUDGET_LIMIT_EXCEEDED` |
| `conflict` / `in_progress` / `closed` | `idempotency_conflict` / `attempt_in_progress` / `attempt_already_executed` | registered |
| `invalid` (acquire `22023`) | `invalid_request` | `MODEL_INVOCATION_INVALID` |
| acquire or remaining throws | `ledger_unavailable` | `INTEGRATION_UNAVAILABLE` (only before any provider call) |
| close `rejected` (first call or replay) | `attempt_close_rejected` | `INVALID_STATE_TRANSITION` |
| close throws, then one replay of the identical command also throws | `attempt_close_unconfirmed` | `MODEL_ATTEMPT_CLOSE_UNCONFIRMED` (no output; attempt stays `reserved`) |

The single replay re-sends the same close command object (same fencing token, amounts and record). It is the idempotent Ledger command of CR-027 §6.3, answered as `duplicate` if the first call committed; it is not a retry of the invocation, never calls the provider again and never triggers a fallback.

## Deliberate limits of this slice

- Workflow-run and platform scopes, automatic period generation, retention and automatic reconciliation are deferred (D-1, D-3, D-5).
- The persistent adapter accepts only canonical lowercase UUID tenants.
- Deleting a tenant while its Ledger is in use can make PostgreSQL abort one side with a deadlock (tenant cascade versus Ledger lock order); tenant deletion is an operator action outside normal worker traffic.
