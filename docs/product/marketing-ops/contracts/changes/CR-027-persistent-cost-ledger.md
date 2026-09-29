# CR-027 — Persistent Cost Ledger for the Product AI Model Harness

**Status:** `approved_and_applied`
**Classification:** `additive_contract_extension`
**Approved by:** project owner, 29/09/2026
**Applied at:** 2026-09-29T22:00:00Z (local Supabase only; see "Application record")
**Issued at:** 2026-09-29T21:00:00Z
**Revised at:** 2026-09-29 (revision 3: lease derived from the Model Profile, Model Profile Schema 1.1 with bounded `timeoutMs`, sweep candidate selection without lock inversion, Model Call Record shape in the confrontation table; revision 2: PostgreSQL clock as the only time authority; identity-first idempotent acquisition with a uniform lock order; exact normalized close replay; `security definer` hardening; Budget Period lifecycle; Model Call Record cardinality)
**Decisions:** D-1 to D-6 approved by the project owner on 29/09/2026 as recommended (§15); clock skew tolerance of ±300 s approved; revised CR approved in full on 29/09/2026, including Model Profile Schema 1.1, Model Profile Registry 1.1 and the lease derivation of §6.6
**Base:** Contract Registry Release 2.16 (commit `7e00d89`)
**Target:** Contract Registry Release 2.17 (applied)

## Objective

Define, for approval, the persistent Cost Ledger slice of I-02: the durable model of model-call attempts, budget reservations, settlements, releases, pending costs and reconciliation, with database-level atomic acquisition, tenant isolation and auditable privileged operations. The slice replaces the in-memory `BudgetGuardPort` and `ModelCallRecorderPort` fakes of the harness with a Supabase-backed implementation, locally only.

At proposal time nothing in this CR was applied; the SQL-level descriptions below are the approved specification. The local implementation and Release 2.17 are recorded in "Application record" at the end, including every deviation found during implementation.

## Status of the repository at issue time

- Contract Registry Release 2.16 (CR-026) is committed in `7e00d89`: Error Registry 1.4, `common-definitions` 1.1, five AI Model Harness schemas, Model Profile Registry 1.0, Context Package 1.1.
- `docs/harness/ESTADO.md` has pending worktree edits that predate this task and still describe Release 2.16 as uncommitted; it was not edited here, to avoid mixing changes into a partially modified file. It must be updated when the owner reconciles those edits.
- Twelve migrations exist (`supabase/migrations/2026091500000{1..8}`, `2026092100000{9..12}`); the last is `20260921000012_outbox_dispatcher_functions.sql`.

## Confrontation with frozen contracts and Release 2.16

| Contract | What it already fixes | Consequence for this CR |
| --- | --- | --- |
| CR-026 §4 | Attempt identity `(tenantId, actionKey, invocationId, attempt)`; fingerprint `hmac-sha256:v1:<keyId>:<hex>`; comparison against `accepted` before state; rotation by keyring | Adopted unchanged as the primary key and conflict rule of the persisted attempt |
| CR-026 §9 | Acquisition statuses `acquired`, `conflict`, `in_progress`, `closed`, `insufficient`; "reservation closed exactly once"; crashed attempts go to reconciliation, never to a new call | Adopted; §6 below adds lease/fencing and the database semantics. The §9 port signature is extended (§11), not replaced |
| `model-call-record.schema.json` 1.0 | Shape of **each** record: identifiers, `callId`, trace, fingerprint, classification and provenance, token estimate, profile and routed/resolved model, routing reason, outcome and `failureKind`, validated `usage` or `null`, accepted `outputAssetIds` or `null`, estimated cost, `costMicroUsd` or `null`, `costStatus` `settled\|not_charged\|pending_reconciliation\|not_reserved`, `startedAt`, `latencyMs`; no prompt, response or PII | Persisted as-is; no schema change. Cardinality is defined by this CR, not by the schema: an attempt closed by `close_model_attempt` has exactly one record; an attempt moved to `pending_reconciliation` by the sweep has **no** record (§2 item 3). `not_reserved` stays unused by the persistent path (every attempt is reserved before the call) |
| `model-profile.schema.json` 1.0 | `limits.timeoutMs` integer from 1 to the safe-integer maximum | Incompatible with a bounded lease (§6.6). **Preserved byte for byte, same file and `$id`**; a new Model Profile Schema 1.1 bounds `timeoutMs` to 840 000 ms, and the Model Profile Registry moves to 1.1 pointing exclusively to it |
| `common-definitions` 1.1 | `nonNegativeSafeInteger`, `requestFingerprint`, `attemptCallId`, `identifierLimits`, `traceContext` | Reused by the new schemas; **no change** to `common-definitions` |
| Error Registry 1.4 | `BUDGET_LIMIT_EXCEEDED`, `IDEMPOTENCY_CONFLICT`, `MODEL_ATTEMPT_IN_PROGRESS`, `MODEL_ATTEMPT_ALREADY_EXECUTED`, `INVALID_STATE_TRANSITION`, `TENANT_MISMATCH`, `TENANT_REQUIRED`, `PERMISSION_DENIED`, `INTEGRATION_UNAVAILABLE` | Reused with registered semantics (§10); two new codes: `BUDGET_NOT_CONFIGURED` (D-2 approved) and `MODEL_ATTEMPT_CLOSE_UNCONFIRMED` (close outcome unknown after one idempotent replay; approved during application, see "Application record") |
| Doc 13 §14 | Ledger with idempotent entries, estimate, actual or pending cost, cause, reconciliation and auditable corrections; reservation checked atomically in workflow/tenant/platform scopes; "custo incerto não vira zero nem libera reserva automaticamente" | Implemented by §4–§8. The workflow-run and platform scopes are **not** included in this slice (decision D-3) — an explicit, documented deviation, not a silent one |
| Doc 05 §9 | `agentRun.costStatus` `pending\|estimated\|reconciled`; `null` means unknown, never zero; costs live in the Ledger, not summed again from run summaries | Ledger is the single source of cost; Agent Run persistence is out of scope |
| ATUALIZACOES §6 | Budget period, timezone, reset and plan change are pending; "não inferir que mês civil e ciclo de cobrança coincidem"; missing configuration blocks paid activation | Periods are explicit rows created by an operator; the ledger never infers a period (decision D-1) |
| 08 §3 | Internal COGS ceilings US$ 40 / 85 per tenant/month, not prices nor balances shown to customers | Only synthetic limits are used locally; no customer-visible balance is introduced |
| ADR-0003 / EXP-01 | Transaction-scoped tenant context, `app.current_tenant()`, login/exec role pairs without `BYPASSRLS`, wrappers as single access point | Followed (§7) |
| ADR-0004, CR-014/015 | Lease + fencing, `FOR UPDATE SKIP LOCKED`, state-shape constraints, `security definer` functions with fixed `search_path`, tables without direct grants | Followed as the persistence pattern, with two deliberate departures: the dispatcher takes its time from the caller (`p_requested_at`), while the Ledger takes every time from the database clock (§6.1); and the dispatcher claims rows with `FOR UPDATE SKIP LOCKED`, while the Ledger sweep selects candidates without any lock and locks an attempt row only after its identity advisory lock (§6.4) |
| `content.action_idempotency` (CR-012) | Workflow-action idempotency with an **unkeyed** SHA-256 `request_fingerprint` (`^[a-f0-9]{64}$`) | Not reused: different granularity (workflow action vs model attempt) and a fingerprint format that CR-026 rejected as persistent. Recorded as finding F-1; not changed silently |

## 1. Ubiquitous language

| Term | Meaning |
| --- | --- |
| **Budget Period** | Explicit, operator-created spending window of a tenant (`tenant` scope) or of one workflow key inside a tenant (`workflow_key` scope), with a limit in integer micro-USD and running counters |
| **Model Attempt** | One acquisition of `(tenantId, actionKey, invocationId, attempt)`; owns exactly one reservation; has exactly one Model Call Record when closed by `close_model_attempt`, and none when moved by the sweep (§2 item 3) |
| **Reservation** | Worst-case estimate reserved against every applicable Budget Period at acquisition |
| **Settlement** | Closing an attempt with a known cost (`settled`) |
| **Release** | Closing an attempt with the guarantee of no charge (`released`) |
| **Hold** | Closing an attempt with unknown cost (`pending_reconciliation`); the reserved amount keeps counting against the budget |
| **Reconciliation** | Privileged, audited resolution of a held attempt to a known cost, backed by an evidence reference |
| **Ledger Entry** | Immutable, idempotent journal line recording the counter deltas caused by one lifecycle step |
| **Model Call Record** | The Release 2.16 per-attempt record, persisted once when the attempt closes |

## 2. Aggregates and invariants (DDD)

1. **Budget Period** (root) protects: `reserved + settled + held` are non-negative safe integers; they equal the sums of its Ledger Entries; periods of the same tenant, scope and workflow key never overlap; a closed period accepts no new reservation, while attempts already bound to it keep closing and reconciling against it (§4.1).
2. **Model Attempt** (root) protects: identity unique forever per tenant; fingerprint fixed at acquisition; its periods fixed at acquisition; exactly one close (`settled`, `released` or `pending_reconciliation`, then optionally `reconciled`); only the fencing token issued at acquisition may close it; a close is repeatable only as an exact replay (§6.3).
3. **Model Call Record cardinality:** an attempt closed by `close_model_attempt` has **exactly one** record, written in the same transaction. An attempt moved to `pending_reconciliation` by the sweep has **no** record, even if the provider was called before the crash: the attempt row and its Ledger Entries are the persistent evidence, and no outcome, usage or cost is fabricated. Reconciliation of such an attempt does not create a record either; the reconciliation evidence lives on the attempt and in `core.audit_log`.
4. **Ledger Entry** is append-only and belongs to one attempt; its `entryId` is deterministic, so replaying a step never duplicates money.

Cross-aggregate consistency (reservation touches attempt + periods + journal) is kept inside one database transaction per operation, guarded by the uniform lock order of §6.4. All times are taken from the PostgreSQL clock (§6.1).

## 3. States and transitions

| From | To | Trigger | Budget effect (per applicable period) |
| --- | --- | --- | --- |
| — | `reserved` | acquire (`acquired`) | `reserved += estimate` |
| `reserved` | `settled` | close with known cost | `reserved -= estimate`; `settled += actual` |
| `reserved` | `released` | close with `billing: none` | `reserved -= estimate` |
| `reserved` | `pending_reconciliation` | close with unknown cost, invalid response, adapter exception, non-computable cost | `reserved -= estimate`; `held += estimate` |
| `reserved` (lease expired by the database clock) | `pending_reconciliation` (`pendingReason: lease_expired`, no record) | recovery sweep, or acquire of the same key | `reserved -= estimate`; `held += estimate` |
| `pending_reconciliation` | `reconciled` | privileged reconciliation with evidence | `held -= estimate`; `settled += actual` |

Every other transition is rejected (`INVALID_STATE_TRANSITION`). `settled`, `released` and `reconciled` are terminal. Budget effects always apply to the periods bound at acquisition, whether those periods are still open or already closed. An `actual` above the estimate is accepted and recorded as an overrun (`overrunMicroUsd` in the entry); it may push the period above its limit, which then makes the next acquisitions `insufficient`. An unknown cost is never converted to zero: only reconciliation with an evidence reference may set `actual = 0`.

## 4. Persistent model (conceptual; new schema `finops`)

Naming follows doc 05 §10 ("AI Routing & FinOps"). All tables: `tenant_id uuid not null references core.tenants(id)`, primary key starting with `tenant_id`, `app.forbid_tenant_change()` trigger, RLS **enabled and forced**, **no direct grant** to any application role, access only through the functions of §6.

### 4.1 `finops.budget_periods`

| Column | Rule |
| --- | --- |
| `period_id` | text, non-empty; PK `(tenant_id, period_id)` |
| `scope` | `tenant` \| `workflow_key` |
| `workflow_key` | `null` when `scope = tenant`; `identifierLimits.workflowKey` otherwise |
| `period_start`, `period_end` | `timestamptz`, `period_end > period_start`, half-open `[start, end)` |
| `limit_micro_usd`, `reserved_micro_usd`, `settled_micro_usd`, `held_micro_usd` | `bigint`, each `0 ≤ x ≤ 9007199254740991` |
| `currency` | `USD` only (tariffs are USD, doc 13 §14) |
| `status` | `open` \| `closed` |
| `created_by`, `created_at`, `closed_at` | operator identity; `created_at`/`closed_at` from the database clock; state-shape check `closed ⇔ closed_at not null` |

**Lifecycle.** `open → closed`, one way; no reopening (a new period is created instead).

- A period is *applicable* to a new acquisition only when it is `open` **and** `period_start ≤ db_now < period_end`, evaluated with the database clock. The worker never names or selects a period.
- `closed` (or an open period whose `period_end` has passed) accepts **no new reservation**.
- Closing does not release, settle or freeze anything: attempts already bound keep closing (`settle`, `release`, `hold`), being swept and being reconciled, and those steps keep updating the bound period's counters and writing Ledger Entries. A closed period with non-zero `reserved` or `held` is a valid state.
- `close_budget_period` locks only that period row and records the closure in `core.audit_log`.

Non-overlap is enforced by the open function under a transaction-scoped advisory lock per `(tenant, scope, workflow_key)` plus a unique `(tenant_id, scope, coalesce(workflow_key,''), period_start)`. Alternative: an exclusion constraint with `btree_gist` (extension not installed today; decision D-6).

### 4.2 `finops.model_attempts`

| Column | Rule |
| --- | --- |
| `action_key`, `invocation_id`, `attempt` | PK `(tenant_id, action_key, invocation_id, attempt)`; limits of `identifierLimits` (`attempt` 1–5) |
| `call_id` | `attemptCallId` pattern, `maxLength` 3171; unique `(tenant_id, call_id)` |
| `workflow_key`, `agent_key` | `identifierLimits` |
| `request_fingerprint` | `requestFingerprint` pattern; `fingerprint_key_id` derived column for rotation analysis |
| `tenant_period_id`, `workflow_period_id` | FKs to `budget_periods` of the same tenant, resolved by the database at acquisition and immutable afterwards; `workflow_period_id` null when no workflow-key period applies |
| `status` | `reserved` \| `settled` \| `released` \| `pending_reconciliation` \| `reconciled` |
| `estimate_micro_usd`, `actual_micro_usd` | safe-integer `bigint`; `actual_micro_usd` is the current effective cost: null unless `settled`/`released`/`reconciled` (`released` ⇒ `0`); reconciliation sets it without changing the close-time columns |
| `close_outcome`, `close_actual_micro_usd`, `close_cost_status`, `close_pending_reason` | the **close-time command**, written once by `close_model_attempt` and immutable afterwards (later reconciliation does not touch them); all `null` while `reserved` and for attempts moved by the sweep |
| `pending_reason` | `billing_unknown` \| `provider_response_invalid` \| `adapter_exception` \| `cost_not_computable` \| `lease_expired`; non-null iff status is `pending_reconciliation` or `reconciled` |
| `lease_owner`, `lease_expires_at` | non-null iff `reserved` (same shape rule as `content.event_outbox`) |
| `lease_seconds` | derived value received at acquisition (§6.6), integer in `[60, 900]`, immutable, kept for audit |
| `fencing_token` | always non-null; generated at acquisition and **retained after close**, so a replayed close is recognized by token and outcome, and any other token is rejected |
| `acquired_at`, `closed_at`, `reconciled_at` | database clock only; shape rules per status |
| `reconciled_by`, `reconciliation_evidence_ref` | required for `reconciled` |
| `client_observed_at` | optional, **non-authoritative** metadata sent by the worker; accepted only within ±300 s of the database clock (§6.1); never used for periods, leases, expiry or ordering |

Indexes: `(tenant_id, lease_expires_at) where status = 'reserved'` (recovery sweep); `(tenant_id, status, closed_at) where status = 'pending_reconciliation'` (reconciliation queue); `(tenant_id, tenant_period_id)`.

### 4.3 `finops.model_call_records`

Exactly one row per attempt closed by `close_model_attempt`, and none for attempts moved by the sweep (§2 item 3). It holds exactly the fields of `model-call-record.schema.json` 1.0 (scalar columns for identifiers, trace fields and costs; `jsonb` only for `classificationProvenance` and `usage`; `text[]` for `outputAssetIds`) plus `record_document jsonb`, the normalized record as received, whose content must equal the typed columns (checked at insert) and is the basis of exact replay comparison (§6.3). `startedAt` inside the record is worker metadata: accepted only between `acquired_at − 300 s` and the database close time `+ 300 s`. PK `(tenant_id, call_id)`; FK to the attempt; immutable (update/delete rejected by trigger; a future retention function is the only exception). Consistency checks mirror the business invariants of the schema: `succeeded ⇒ failureKind null`, cost status vs cost, `outputAssetIds` only on success, provenance tenant = row tenant (validated by the close function, since `jsonb` content cannot be constrained by a plain check).

### 4.4 `finops.cost_ledger_entries`

| Column | Rule |
| --- | --- |
| `entry_id` | deterministic: `<callId>:reserve`, `:settle`, `:release`, `:hold`, `:reconcile`; PK `(tenant_id, entry_id)` |
| `call_id` | FK to the attempt |
| `kind` | `reserve` \| `settle` \| `release` \| `hold` \| `reconcile` |
| `period_id` | the period whose counters changed (one entry per affected period; entry id suffixed by scope) |
| `reserved_delta`, `settled_delta`, `held_delta` | signed `bigint`, each `|delta| ≤ 9007199254740991`; allowed sign pattern fixed per `kind` |
| `overrun_micro_usd` | `≥ 0`; non-zero only when `actual > estimate` |
| `actor_type`, `reason`, `created_at` | `worker` \| `operator` \| `system`; append-only |

Invariant tested in pgTAP: for every period, each counter equals the sum of the corresponding deltas.

## 5. Money, overflow and unknown cost

- All amounts are integer micro-USD in `bigint`, constrained to `[0, 2^53 − 1]` so they round-trip through the TypeScript `nonNegativeSafeInteger`.
- Functions compute availability and new counters in `numeric` and reject any result above `2^53 − 1` before writing; a check violation aborts the transaction (fail closed).
- `available = limit − reserved − settled − held`; acquisition requires `estimate ≤ available`. A zero estimate is valid (Test Adapter) and still creates the attempt, because identity and idempotency do not depend on price.
- An overflow on close aborts the close; the attempt stays `reserved` until the lease expires and the sweep moves it to `pending_reconciliation`. No code path writes zero for an unknown cost.

## 6. Atomic acquisition and cross-process concurrency

### 6.1 Time authority

- **The PostgreSQL clock is the only authority.** Each function captures `v_db_now := clock_timestamp()` once, at its start, and uses that value for every time decision in the call: applicable period, `acquired_at`, `lease_expires_at = v_db_now + leaseSeconds`, lease liveness, expiry, `closed_at`, `reconciled_at`, `created_at`/`closed_at` of periods and `created_at` of Ledger Entries.
- No function accepts a timestamp that decides anything. The previous `requestedAt`, `closedAt`, `now` and `at` parameters are **removed**.
- The lease duration is **derived, never chosen**: `leaseSeconds = max(60, ceil(profile.limits.timeoutMs / 1000) + 60)`, which is at most 900 because Model Profile Schema 1.1 bounds `timeoutMs` to 840 000 ms (§6.6). The adapter computes it from the resolved profile; the database only validates that the received value is an integer in `[60, 900]`. The worker therefore cannot shorten another attempt's lease, and cannot expire any attempt: expiry is decided only by comparing the stored `lease_expires_at` with the database clock.
- Worker timestamps are **metadata only**: `clientObservedAt` (acquire) and the record's `startedAt` (close). They are validated against the database clock with a ±300 s skew window; outside it, acquisition fails with `22023` (`MODEL_INVOCATION_INVALID`) and close fails with `INVALID_STATE_TRANSITION`, before any write.

### 6.2 Functions

All functions follow the hardening of §6.5 and first check `app.current_tenant() = p_tenant_id` (otherwise `42501`).

| Function | Caller role | Contract |
| --- | --- | --- |
| `app.acquire_model_attempt(tenant, workflowKey, actionKey, invocationId, attempt, callId, agentKey, requestFingerprint, acceptedFingerprints[], estimateMicroUsd, leaseOwner, leaseSeconds, clientObservedAt?)` — `leaseSeconds` is the derived value of §6.6 | `oplyra_worker_exec` | Returns `acquired` (with `fencingToken`, `leaseExpiresAt`), `conflict`, `in_progress`, `closed`, `insufficient` (with `remainingMicroUsd`) or `budget_not_configured` |
| `app.close_model_attempt(tenant, actionKey, invocationId, attempt, fencingToken, outcome, actualMicroUsd, costStatus, pendingReason, record jsonb)` | `oplyra_worker_exec` | Closes a `reserved` attempt and inserts its record in the same transaction; exact replay returns `duplicate`; anything else is `INVALID_STATE_TRANSITION` (§6.3) |
| `app.budget_remaining(tenant, workflowKey)` | `oplyra_worker_exec` | Advisory remaining of the periods applicable **now** (database clock); acquisition remains the only authoritative check |
| `app.expire_next_model_attempt(tenant)` | `oplyra_worker_exec` | Moves **one** lease-expired `reserved` attempt to `pending_reconciliation (lease_expired)` and returns its `callId`, or `null`; the worker loops up to a batch size, one transaction per call |
| `app.reconcile_model_attempt(tenant, actionKey, invocationId, attempt, actualMicroUsd, evidenceRef, reason)` | `oplyra_ops_exec` | `pending_reconciliation → reconciled`; writes `core.audit_log` |
| `app.open_budget_period(tenant, scope, workflowKey, periodStart, periodEnd, limitMicroUsd, reason)`, `app.close_budget_period(tenant, periodId, reason)` | `oplyra_ops_exec` | Operator-defined window (`periodStart`/`periodEnd` are the business window being configured, not clock readings); overlap check; `created_at`/`closed_at` from the database clock; writes `core.audit_log` |

### 6.3 Idempotent acquisition and close

**Acquire** — identity first, budget only for new identities:

1. Validate parameters (identifier limits, patterns, safe-integer estimate, `leaseSeconds ∈ [60, 900]` as the database-side range check of the derived value, `clientObservedAt` skew); invalid → `22023`.
2. `pg_advisory_xact_lock` on the attempt identity key (§6.4), serializing every operation on the same `(tenant, action, invocation, attempt)`.
3. Look up the attempt row (`FOR UPDATE`). If it **exists**, answer from the attempt alone — **independently of whether any period is open, closed or absent now**:
   - stored fingerprint ∉ `acceptedFingerprints` → `conflict` (fingerprint before state, CR-026 §4);
   - `reserved` and `lease_expires_at > v_db_now` → `in_progress`;
   - `reserved` and lease expired → lock its bound periods, move it to `pending_reconciliation (lease_expired)` with counters and entries, then `closed`;
   - any other state → `closed`.
4. Only for a **new** identity: resolve the applicable tenant period with the database clock and lock it (`FOR UPDATE`); none → `budget_not_configured`. Then resolve and lock the applicable workflow-key period, if one exists.
5. `estimate > available` in any locked period → `insufficient` (nothing written). Otherwise insert the attempt (`reserved`, `fencing_token = gen_random_uuid()`, lease from the database clock), update counters and insert the `reserve` entries.

Serializing new identities on the tenant period row keeps the tenant balance strictly consistent: two processes competing for the last budget cannot both succeed. Redeliveries of existing keys never touch or require a period.

**Close** — exact replay only:

1. `pg_advisory_xact_lock` on the identity key; lock the attempt row. Absent → `INVALID_STATE_TRANSITION`.
2. The incoming command is normalized: `fencingToken`, `outcome`, `actualMicroUsd`, `costStatus`, `pendingReason` and the record as `jsonb` (key order and whitespace normalized by `jsonb`; arrays keep their order; numbers compared by value).
3. If the attempt is `reserved`: the token must equal the stored `fencing_token`; the command must be internally coherent (`charged ⇒ settled` with a non-null safe-integer actual; `not_charged ⇒ released` with actual `0`; `unknown ⇒ pending_reconciliation` with a null actual and a non-`lease_expired` reason) and the record must match the attempt (tenant, `callId`, attempt, fingerprint, `costStatus`, provenance tenant, `startedAt` skew). Then lock the bound periods, apply the transition, write entries and the record, clear the lease. Any failure → `INVALID_STATE_TRANSITION` with nothing written.
4. If the attempt is already closed **by** `close_model_attempt` (`close_outcome` not null), in any later state including `reconciled`: return `duplicate` **only** if every normalized field equals the persisted close-time command — `fencing_token`, `close_outcome`, `close_actual_micro_usd`, `close_cost_status`, `close_pending_reason` and `record_document`. Same token with any divergence → `INVALID_STATE_TRANSITION`, with no change to counters, entries or record.
5. If the attempt was moved by the sweep (close-time columns null, `pending_reason = lease_expired`), whether or not it was reconciled afterwards: `INVALID_STATE_TRANSITION`; no record is created (§2 item 3).

### 6.4 Uniform lock order and deadlock freedom

Every operation acquires locks in this order and never in another:

1. **Identity:** `pg_advisory_xact_lock(hashtextextended('finops.attempt|' || <JSON array of tenant, action, invocation, attempt>, 0))`. A hash collision between two identities only adds serialization, never incorrectness. The sweep uses `pg_try_advisory_xact_lock` and skips busy identities.
2. **Attempt row** (`SELECT … FOR UPDATE`, always **after** the identity lock).
3. **Tenant-scope period row**, then
4. **Workflow-key-scope period row**, when applicable.

| Operation | Locks taken |
| --- | --- |
| Acquire, existing identity | 1 → 2 (→ 3 → 4 of the bound periods only if the lease expired) |
| Acquire, new identity | 1 → 3 → 4 of the applicable periods (the attempt row is inserted after, under the identity lock) |
| Close, reconcile | 1 → 2 → 3 → 4 of the bound periods |
| Sweep (`expire_next_model_attempt`) | (a) plain `SELECT` **without any lock** of candidate expired `reserved` attempts, ordered by `lease_expires_at`; (b) for each candidate in that order, 1 via `pg_try_advisory_xact_lock` — on failure, move to the next candidate; (c) on success, 2 via `SELECT … FOR UPDATE` and revalidation that it is still `reserved` with `lease_expires_at ≤ v_db_now` (otherwise stop without writes); (d) 3 → 4 of the bound periods; **one** attempt per call |
| Open period | advisory lock `finops.period|<tenant>|<scope>|<workflowKey>` only |
| Close period | the period row only |

Each operation holds at most one identity lock, one tenant-scope row and one workflow-scope row, always in this order; waits for identities in the sweep are non-blocking, and the sweep never locks an attempt row before holding its identity lock. Therefore no wait cycle can form between acquire, close, reconcile, sweep and period operations. Deadlock detection remains a test (§14), not an assumption.

### 6.5 `security definer` hardening

Every function of §6.2:

- is created `security definer` with `set search_path = pg_catalog, pg_temp`, and references every object by schema-qualified name (`finops.*`, `core.*`, `app.*`, `pg_catalog.*`);
- is owned by the migration role that owns the `finops` tables (the only role that can read them under forced RLS, as for `app.claim_outbox_events`); ownership is set explicitly in the migration, never inherited from an ad-hoc session;
- has `REVOKE ALL ON FUNCTION … FROM PUBLIC` immediately after creation, and `GRANT EXECUTE` **only** to the role listed in §6.2 (`oplyra_worker_exec` or `oplyra_ops_exec`);
- is covered by pgTAP assertions of **effective** privileges: `has_function_privilege` false for `PUBLIC`, `anon`, `authenticated`, `oplyra_dispatcher_exec` and the role not listed; true only for the listed role; owner and `prosecdef`/`proconfig` as specified; no `finops` table privilege for any application role; no application role with `BYPASSRLS`.

### 6.6 Lease derivation and Model Profile Schema 1.1

**Problem.** Model Profile Schema 1.0 accepts `limits.timeoutMs` up to 9 007 199 254 740 991 ms, while the lease must stay within `[60, 900]` s so that a crashed attempt is recovered in bounded time. A profile with a long timeout would need a lease the database refuses, or an unbounded lease.

**Rule.**

```text
leaseSeconds = max(60, ceil(profile.limits.timeoutMs / 1000) + 60)    // 60 s grace after the call deadline
limits.timeoutMs ≤ 840 000 ms   ⇒   leaseSeconds ≤ 840 + 60 = 900
```

| `timeoutMs` | `leaseSeconds` |
| --- | --- |
| 1 | 61 |
| 30 000 (current local profiles) | 90 |
| 839 001 | 900 |
| 840 000 | 900 |
| 840 001 | rejected by Schema 1.1 and by the core profile validation (would give 901) |

**Who computes it.** The persistent budget adapter, wired by the composition root, computes `leaseSeconds` from the `timeoutMs` of the profile resolved by the harness and passes it to `acquire_model_attempt`. No domain caller supplies it: `ModelInvocationRequest` has no lease or timeout field, and the port receives the profile timeout, not a duration chosen by the caller. The database validates only the range `[60, 900]`; the derivation is enforced by the adapter and its tests. A compromised worker could still send another value inside the range: the range is the database backstop, the worker role is trusted infrastructure, and the chosen value is persisted (`lease_seconds`) for audit.

**Model Profile Schema 1.1** (new file `schemas/ai-model-harness/model-profile-1.1.schema.json`, `$id` `https://schemas.oplyra.com/ai-model-harness/model-profile/1.1`, following the precedent of `common-definitions-1.1.schema.json`):

- identical to 1.0 except `limits.timeoutMs`: `integer`, `minimum 1`, `maximum 840000`, and the new `$id`, title and description;
- references `common-definitions` 1.1, like 1.0;
- `model-profile.schema.json` 1.0 stays **byte for byte** as published in Release 2.16, same file and `$id`.

**Model Profile Registry 1.0 → 1.1.** `registryVersion` becomes `1.1` and `rules.entrySchema` points **exclusively** to `../schemas/ai-model-harness/model-profile-1.1.schema.json`. The three current entries are unchanged in content and all validate against 1.1 (each has `timeoutMs = 30 000`, derived lease 90 s).

**Compatibility.** Compatible versioning for every existing profile (all current entries remain valid). It is a **deliberate restriction** relative to Schema 1.0: a profile valid under 1.0 with `timeoutMs > 840 000` is invalid under 1.1 and cannot be registered in Registry 1.1. Schema 1.0 remains published for historical validation and is no longer referenced by the registry. The core runtime profile validation adopts the same maximum, so configuration fails closed at startup.

## 7. Tenant isolation, roles and privileged operations

- Tables: RLS enabled and forced, no policies for application roles and no direct grants, following `content.event_consumer_deduplication`. Access exists only through the functions of §6, which re-check the transaction-scoped tenant.
- The `security definer` functions run as their owner, the migration role, which is the only role able to read the forced-RLS tables — the same reliance as `app.claim_outbox_events`. Hardening and privilege tests: §6.5.
- Worker path: `EXECUTE` on acquire/close/remaining/expire granted to `oplyra_worker_exec`, reached through `withWorkerTransaction` (the harness runs inside the agent worker). Alternative: a dedicated `oplyra_ledger_login/exec` pair like the dispatcher (decision D-4).
- Operator path: reconcile and period functions granted to `oplyra_ops_exec` only; each writes `core.audit_log` (`actor_type = operator`, action `finops.budget_period.open|close` or `finops.attempt.reconcile`, target = period id or `callId`, before/after amounts, mandatory reason). `audit_log.correlation_id` is `uuid`, while trace ids are free text: the trace goes into `after`, not into that column (finding F-2).
- Users (`authenticated`): no access in this slice. A read model for cost visibility needs a new member permission and its own CR.
- No function takes a tenant id without matching it to `app.current_tenant()`; cross-tenant calls fail with `42501` and are indistinguishable from "not found" for reads.

## 8. Crash recovery, abandoned attempts and reconciliation

| Failure | Outcome |
| --- | --- |
| Process dies after acquire, before the provider call | Lease expires by the database clock → sweep → `pending_reconciliation (lease_expired)`, no record; the estimate stays held because nothing proves the call did not happen |
| Process dies after the provider call, before close | Same as above; no record is written and no outcome is fabricated; the external request id, if any, is lost with the process (risk R-3); attempt and entries are the evidence |
| Close commits, response is lost | The harness replays the **identical** close command once; it returns `duplicate` and the invocation proceeds; any divergence returns `INVALID_STATE_TRANSITION` without writes |
| Close outcome still unknown after that single replay | `MODEL_ATTEMPT_CLOSE_UNCONFIRMED`: no output is delivered, no fallback, the provider is not called again; the attempt stays `reserved` until the sweep moves it to `pending_reconciliation` or the replayed close is found committed |
| Redelivery of the same invocation after a crash, after the original period closed, or with no current period | Acquire answers from the existing attempt: `closed` → `MODEL_ATTEMPT_ALREADY_EXECUTED` (or `conflict`/`in_progress`); no period is consulted and the provider is **not** called again. Retrying the business step with a new `invocationId` is a workflow decision outside this CR |
| Two processes race on the same key | Serialized by the identity lock: exactly one `acquired`; the other gets `in_progress` (live lease) or `closed` |
| Original process closes after the sweep | `INVALID_STATE_TRANSITION`; no counter, entry or record changes |
| Worker sends a manipulated clock | Ignored for every decision; outside ±300 s the call is rejected before any write |

Reconciliation is manual and audited in this slice: an operator resolves a held attempt with the actual cost from provider evidence; `actual = 0` requires evidence of no charge. Automated reconciliation against provider usage exports requires a real adapter and is deferred.

## 9. Idempotency, fingerprints and key rotation

- Identity and conflict rule exactly as CR-026 §4 and §9; the persisted fingerprint is the `primary` value; acquisition compares against `accepted`.
- `fingerprint_key_id` is stored to measure which attempts depend on which key before retiring it.
- Rotation: keep the previous key in the keyring while attempts under it may be redelivered. Because rows have no TTL in this slice (§12), retiring a key makes old redeliveries fail closed as `IDEMPOTENCY_CONFLICT`, which is the approved behavior.
- Ledger entries are idempotent by deterministic `entry_id`; a replayed step returns the existing result instead of inserting.
- Productive keys still require a secret store (blocked); tests keep synthetic keys.

## 10. Error mapping (Error Registry)

| Situation | Code | Registered |
| --- | --- | --- |
| Estimate does not fit | `BUDGET_LIMIT_EXCEEDED` | yes |
| New identity and no applicable tenant period at the database time | **`BUDGET_NOT_CONFIGURED`** (`budget`, `high`, `retryable: false`, `request_approval`; D-2 approved) | to be registered in Error Registry 1.5 |
| Same key, different fingerprint | `IDEMPOTENCY_CONFLICT` | yes |
| Live lease held elsewhere | `MODEL_ATTEMPT_IN_PROGRESS` | yes |
| Attempt already closed or abandoned | `MODEL_ATTEMPT_ALREADY_EXECUTED` | yes |
| Stale fencing token, invalid transition, record inconsistent with attempt | `INVALID_STATE_TRANSITION` | yes |
| Active tenant differs from the requested tenant (`42501`) | `TENANT_MISMATCH` | yes |
| Invalid acquisition parameters or `clientObservedAt` outside the skew window (`22023`) | `MODEL_INVOCATION_INVALID` | yes |
| Close with divergent replay, stale or foreign token, incoherent command, record `startedAt` outside the skew window, or close after sweep | `INVALID_STATE_TRANSITION` | yes |
| Database unavailable or serialization failure **before** acquisition (`remaining`, `acquireAttempt`) | `INTEGRATION_UNAVAILABLE` (nothing was called; retryable) | yes |
| Close throws or gets no answer, and one replay of the identical close command also throws | **`MODEL_ATTEMPT_CLOSE_UNCONFIRMED`** (`integration`, `high`, `retryable: false`, `escalate`) | registered in Error Registry 1.5 |
| Close explicitly `rejected` (first call or the replay) | `INVALID_STATE_TRANSITION` | yes |

## 11. Contract impact

| Area | Change | Version |
| --- | --- | --- |
| Error Registry | `BUDGET_NOT_CONFIGURED` (D-2 approved) and `MODEL_ATTEMPT_CLOSE_UNCONFIRMED` | 1.4 → 1.5 (+2 codes) |
| Schemas (new, `schemas/ai-model-harness/`, referencing `common-definitions` 1.1) | `budget-period.schema.json` (operator input and persisted shape); `cost-ledger-entry.schema.json`; `model-attempt.schema.json` (attempt state snapshot returned by acquire/close) | 1.0 each |
| Model Profile Schema | new `model-profile-1.1.schema.json` (`timeoutMs ≤ 840 000`); `model-profile.schema.json` 1.0 preserved byte for byte, same `$id` | 1.0 kept; 1.1 new |
| Model Profile Registry | `registryVersion` 1.0 → 1.1; `rules.entrySchema` → `model-profile-1.1.schema.json` only; entries unchanged; derived report `model-profiles.validation.json` regenerated | 1.0 → 1.1 |
| Other existing schemas | none (`model-call-record` 1.0 persisted unchanged; `common-definitions` 1.1 unchanged) | — |
| Other registries | none: ledger operations are runtime infrastructure, not agent actions; no agent, action, tool, permission, handoff or quality gate | — |
| Events | none in this slice; reconciliation alerts and cost-overrun events would need a separate CR | — |
| Harness ports (code, not registry) | `acquireAttempt` gains `callId`, `agentKey`, lease owner, the resolved profile's `timeoutMs` (the adapter derives the lease, §6.6) and optional non-authoritative `clientObservedAt`, and returns `fencingToken`; statuses gain `budget_not_configured` (D-2); no port passes an authoritative time; `settle`/`release`/`holdForReconciliation` and `ModelCallRecorderPort.record` merge into one atomic `closeAttempt`; `remaining` keeps its scope and uses the database clock; the sweep port expires one attempt per call. CR-026 §9 remains valid; this CR extends it | runtime components modified |
| Core profile validation | `limits.timeoutMs` maximum 840 000 (same as Schema 1.1); pure `leaseSecondsFor(timeoutMs)` used by adapters | runtime components modified |
| Fakes | `@oplyra/testing` fakes follow the new ports; they keep serving unit tests, never as persistence | modified |
| Migrations | `…000013_finops_ledger_schema.sql` (schema, tables, constraints, indexes, triggers, RLS forced, no grants) and `…000014_finops_ledger_functions.sql` (functions, grants, comments) | new |

## 12. Retention and minimization

- Stored: identifiers, trace ids, HMAC fingerprints, model/provider ids, usage counts, costs, classification provenance **references** and asset ids. Never prompts, responses, message content or PII; classification `ref` values must be opaque ids (risk R-5).
- Retention: no TTL in this slice, following the precedent of `content.action_idempotency` ("sem TTL até política governada"); the retention class for financial records vs call records is decision D-5 (07 §11.6).
- Tenant deletion cascades like every other tenant table; whether financial records must survive tenant deletion for accounting is part of D-5.

## 13. Migration and rollback strategy

- Forward-only, additive migrations in the existing numbering; no change to existing tables or functions.
- Local rollback: `pnpm db:reset` recreates the database from migrations and synthetic seeds.
- Logical rollback (after release): a new forward migration revokes `EXECUTE`, drops the functions and, only when the ledger is empty, the `finops` schema; the harness returns to the in-memory composition. No production deployment exists; production rollout needs its own publication approval (PUBLICACAO).
- Seeds: synthetic budget periods for the two seed tenants only.
- Release 2.17 cross-validation adds: Model Profile Schema 1.0 unchanged against the v2.16 manifest hash; Schema 1.1 present, executable and referencing `common-definitions` 1.1; Model Profile Registry envelope at 1.1 with `entrySchema` → 1.1 only; every profile entry valid against 1.1 and against the frozen agents/actions; Error Registry 1.5 with `BUDGET_NOT_CONFIGURED` and `MODEL_ATTEMPT_CLOSE_UNCONFIRMED`; the three Ledger schemas; manifest 2.17 as a logical change set over 2.16, with `model-profile.schema.json` 1.0 among the inherited, unchanged artifacts.

## 14. Verification plan (after approval)

| Layer | Scenarios |
| --- | --- |
| Fixtures | Valid/invalid for the three new schemas: negative, decimal and above-safe-integer amounts; malformed identifiers; overlapping period; `released` with non-zero actual; `reconciled` without evidence; entry deltas with a forbidden sign pattern |
| Contract tests | Schemas with executable keywords only; error mapping of §10 against Error Registry; Release 2.17 cross-validation and manifest as a logical change set over 2.16 |
| Contract tests — Model Profile 1.1 | `model-profile.schema.json` 1.0 byte-for-byte identical to Release 2.16 (hash from the v2.16 manifest) and keeps `$id` `…/model-profile/1.0`; `model-profile-1.1.schema.json` validates with executable keywords and `$id` `…/model-profile/1.1`; Registry 1.1 `entrySchema` points only to 1.1; every current profile validates against 1.1; valid fixture with `timeoutMs = 840000`; invalid fixture with `timeoutMs = 840001` rejected by `maximum` |
| Unit tests — lease | `leaseSecondsFor` at the limits (`1 → 61`, `30000 → 90`, `839001 → 900`, `840000 → 900`); core profile validation rejects `840001`; `ModelInvocationRequest` and the ports expose no lease or duration field; the persistent adapter always sends the derived value, whatever the request contains |
| pgTAP | Tables exist with RLS forced and no grants to `anon`, `authenticated`, `oplyra_worker_exec`, `oplyra_dispatcher_exec`; **effective privileges**: no `EXECUTE` for `PUBLIC`, `anon`, `authenticated`, `oplyra_dispatcher_exec` or the unlisted role on any §6.2 function, `EXECUTE` only for the listed role, owner, `security definer` and fixed `search_path` as §6.5; state-shape and overflow constraints reject invalid rows; tenant mismatch `42501`; every transition of §3 and rejection of the others; stale fencing rejected; counters equal journal sums; operator functions write `core.audit_log` |
| pgTAP — lease | `leaseSeconds` 59 and 901 rejected with `22023` before any write; 60 and 900 accepted; the stored `lease_seconds` equals the received value; `lease_expires_at = acquired_at + lease_seconds` from the database clock |
| pgTAP — clock | Acquire resolves the period and lease from the database clock; `clientObservedAt` in the past or future beyond ±300 s is rejected before any write; within the window it is stored only as metadata and changes no period, lease or expiry; a record `startedAt` outside its window makes close fail without writes; no function signature accepts an authoritative time; the sweep cannot expire an attempt whose lease is live by the database clock, whatever the caller does |
| pgTAP — idempotency and periods | Redelivery of an existing key after its original period was **closed** returns `closed`/`conflict`/`in_progress` without touching periods; redelivery when **no** current period exists returns the same, never `budget_not_configured`; a new identity with no applicable period returns `budget_not_configured`; settlement, release, hold, sweep and reconciliation **after the bound period closed** update that period's counters and write entries; a closed period accepts no new reservation and cannot be reopened |
| pgTAP — close replay | Identical normalized replay returns `duplicate` with no change, also after the attempt was reconciled; same token with a different `actualMicroUsd`, cost status, pending reason, outcome, or any record field returns `INVALID_STATE_TRANSITION` with counters, entries and record unchanged; close after sweep returns `INVALID_STATE_TRANSITION` and writes no record; a swept attempt has no record, a closed attempt has exactly one |
| Integration (local Supabase, `pg` pools) | Persistent adapters implement the ports; `invokeModel` end to end with the Test Adapter; tenant A cannot see or close tenant B attempts; fingerprint rotation across processes |
| Concurrency (separate connections as processes) | 20 simultaneous acquisitions of one key → exactly one `acquired`; N competitors for a limit that fits k → exactly k `acquired`; backend killed (`pg_terminate_backend`) after acquire → lease expiry → sweep → `pending_reconciliation`; close racing sweep → one wins, the other gets `INVALID_STATE_TRANSITION`; mixed acquire/close/sweep/reconcile load on shared periods with no deadlock reported by PostgreSQL; a worker supplying manipulated timestamps to the sweep and to acquire cannot shorten or expire another attempt's lease; sweep candidate selection runs concurrently with acquire/close of the same attempts without taking the attempt row before the identity lock (lock-wait graph inspected through `pg_locks`, no inversion) |
| Mutation | Remove fingerprint-before-state check; resolve periods before the identity lookup; convert unknown cost to zero; skip the tenant check; release a held estimate on sweep; accept a stale fencing token; accept a divergent replay as `duplicate`; use a caller timestamp for lease or period; accept a lease different from the derived one in the adapter; raise the Schema 1.1 `timeoutMs` maximum; point Registry 1.1 to Schema 1.0; lock the attempt row before the identity in the sweep; grant `EXECUTE` to `PUBLIC`; allow overflow; change lock order (deadlock detection test) |
| Gates | `pnpm verificar`, `pnpm test:harness`, `git diff --check`, secret scan including untracked files |

## 15. Decisions (approved 29/09/2026 as recommended)

| ID | Decision | Approved | Blocking? |
| --- | --- | --- | --- |
| D-1 | How budget periods are defined (calendar month in tenant timezone, billing cycle, other) | Ledger stores explicit periods created by an operator; generation policy stays pending (ATUALIZACOES §6) | No for local implementation; yes for automatic period rollover |
| D-2 | Missing budget configuration: new `BUDGET_NOT_CONFIGURED` or reuse `BUDGET_LIMIT_EXCEEDED` | New code: configuration error and exhausted budget need different operator actions | No; affects Error Registry version |
| D-3 | Scopes now: tenant period + optional workflow-key period; workflow-run limit (13 §15) and platform ceiling deferred | Defer run and platform scopes until the workflow runtime exists; the platform scope serializes every tenant on one row | No, but it is a documented deviation from 13 §14 |
| D-4 | Worker role for ledger functions: existing `oplyra_worker_exec` or dedicated `oplyra_ledger_*` | Existing worker role: the harness runs inside the worker transaction | No |
| D-5 | Retention of attempts, records and ledger entries; survival after tenant deletion | No TTL now; decide with the retention policy of 07 §11.6 before real data | No for local; yes before real data |
| D-6 | Period non-overlap: function + advisory lock, or `btree_gist` exclusion constraint | Function + advisory lock (no new extension) | No |

## 16. Risks

| ID | Risk | Mitigation |
| --- | --- | --- |
| R-1 | Held estimates accumulate and block a tenant after crashes | Reconciliation queue index, sweep counts, operator runbook; no automatic release by design |
| R-2 | Tenant period row is a serialization point under heavy parallel calls | Short transactions; measure in the concurrency test; counter sharding as a later additive change |
| R-3 | External request id lost when the process dies after the call | Accepted in this slice; reconciliation relies on provider usage evidence |
| R-4 | Time decisions depend on the database clock; a wrong database clock would shift periods and leases for everyone | Database clock is the single authority (§6.1); worker timestamps are metadata with a ±300 s skew check, which also surfaces clock drift between worker and database. This deliberately departs from the dispatcher precedent, which takes `p_requested_at` from the caller |
| R-5 | Classification refs or workflow keys could carry PII if callers misuse them | Opaque-id rule in the contract; review before real data |
| R-6 | Settlement and record were two calls in the in-memory harness | Merged into one atomic `closeAttempt` (§6.3, §11) |

## 17. Findings outside the scope

- **F-1:** `content.action_idempotency.request_fingerprint` is an unkeyed SHA-256 (CR-012), a format CR-026 rejected as persistent. It is not changed here; a separate CR should decide.
- **F-2:** `core.audit_log.correlation_id` is `uuid`, while `traceContext.correlationId` is free text; ledger audit rows carry the trace in `after`.

## 18. Explicit non-changes

- No migration, table, function, policy, grant, registry, schema, fixture, manifest or production code in this CR.
- No Agent Run persistence, workflow runtime, queue, scheduler or reconciliation automation.
- No real provider, OpenRouter, Stripe, secret store, remote Supabase, real data or publication.
- No user-facing cost view and no new member permission.

## Compatibility assessment

Additive: a new schema namespace, new tables and functions, three new Ledger schemas, two new error codes (Error Registry 1.4 → 1.5) and Model Profile Schema 1.1 with Registry 1.0 → 1.1. Schema 1.1 is compatible for every existing profile but deliberately restricts `timeoutMs` relative to 1.0, which stays published unchanged. Release 2.16 contracts stay valid; the harness port signatures change inside repository-owned code only, with no external caller. Target release 2.17, issued as a logical change set over 2.16 like Release 2.16 over 2.15.

## Approval requested

Decisions D-1 to D-6 are approved. Final approval of this revised CR authorizes only the **local** implementation described in §4–§14 against the local Supabase, followed by application of the contract changes in Release 2.17.

## Application record

**Approval.** Project owner, 29/09/2026: the revised CR in full, D-1 to D-6, the ±300 s skew tolerance, Model Profile Schema 1.1, Model Profile Registry 1.1 and the lease derivation of §6.6, for **local** implementation only. No remote Supabase, real provider, OpenRouter, Stripe, real key, real data, publication, push or commit.

**Release.** Contract Registry Release 2.17 — manifest `contract-registry-manifest-v2.17.json`, a logical change set over Release 2.16: inherited artifacts keep their 2.16 entry; only artifacts modified or added by this CR carry current content; pending worktree edits outside this CR stay out of the digest.

**Applied changes.**

| Area | Before | After |
| --- | --- | --- |
| Error Registry | 1.4, 58 codes | 1.5, 60 codes (+`BUDGET_NOT_CONFIGURED`: `budget`, `high`, not retryable, `request_approval`; +`MODEL_ATTEMPT_CLOSE_UNCONFIRMED`: `integration`, `high`, not retryable, `escalate`); derived `errors.validation.json` regenerated |
| Model Profile Schema | 1.0 | 1.0 byte for byte (same file and `$id`); new `model-profile-1.1.schema.json`, identical except `limits.timeoutMs` ≤ 840 000 |
| Model Profile Registry | 1.0 | 1.1, `rules.entrySchema` → Schema 1.1 only; three entries unchanged (`timeoutMs` 30 000, lease 90 s) |
| Ledger schemas | — | `budget-period`, `cost-ledger-entry`, `model-attempt` 1.0 (`common-definitions` 1.1), each with a derived validation report |
| Fixtures | 40 valid, 92 invalid | 49 valid, 113 invalid (+9, +21: Ledger schemas and Model Profile 1.1; 10 `-business-invariant`) |
| Migrations | 12 | +`20260929000013_finops_ledger_schema.sql`, +`20260929000014_finops_ledger_functions.sql` |
| Seeds | — | three synthetic Budget Periods for the two seed tenants |
| Harness code | in-memory `settle`/`release`/`hold` + separate recorder | `acquireAttempt` (with `callId`, `agentKey`, `profileTimeoutMs`, `clientObservedAt`), atomic `closeAttempt` with the record, `remaining` nullable, `AttemptRecoveryPort`; `leaseSecondsFor`; `timeoutMs` ≤ 840 000; `PersistentCostLedger` and `CostLedgerOperations` |
| Release validation | 62 checks (2.16) | `cross-registry-validation-v2.17.json`, 75 checks |

**Implementation decisions and deviations (recorded, not silent).**

1. **Close command shape.** `close_model_attempt` receives `p_outcome` ∈ `charged | not_charged | unknown` (the billing outcome) plus `p_cost_status`, which must be the matching record status (`settled | not_charged | pending_reconciliation`); both are part of the exact-replay comparison, as are the token, actual, pending reason and `record_document`.
2. **`callId` enforced by the database.** `finops.attempt_call_id` reproduces the core derivation (`to_json` escaping equals `JSON.stringify` for valid Unicode); acquisition rejects a `callId` that does not derive from the identity (`22023`) and a check constraint enforces it on the table. Parity with the core is tested with Unicode, quotes, backslash and control characters.
3. **Harness failure mapping and unknown close outcome.** New kinds: `budget_not_configured` → `BUDGET_NOT_CONFIGURED`; `ledger_unavailable` → `INTEGRATION_UNAVAILABLE`, only when `remaining` or `acquireAttempt` fails (before any provider call); `attempt_close_rejected` → `INVALID_STATE_TRANSITION`, **only** for an explicit `rejected` answer (stale token, invalid transition, incoherent command, divergent replay, counter overflow); `attempt_close_unconfirmed` → `MODEL_ATTEMPT_CLOSE_UNCONFIRMED`. A close that throws or gets no answer leaves the commit **unknown** and is no longer treated as an invalid state: the harness re-sends the same close command object once — same fencing token, outcome, amounts, pending reason and record — and nothing else. `closed` or `duplicate` confirm the close and the invocation proceeds; `rejected` maps to `INVALID_STATE_TRANSITION`; a second exception returns `MODEL_ATTEMPT_CLOSE_UNCONFIRMED` without output, and the attempt stays `reserved` for the sweep or reconciliation. **This replay is not a retry of the invocation and not a new model call:** it is the idempotent Ledger command of §6.3 step 4, whose exact replay is answered as `duplicate` when the first call did commit; the provider is never called again, no fallback runs and the output is not rebuilt. An earlier revision of this implementation mapped the exception to `INVALID_STATE_TRANSITION`; that divergence from §10 was removed. `22023` from acquisition maps to `MODEL_INVOCATION_INVALID` through the `invalid` acquisition status.
   **Contract change beyond the proposal:** `MODEL_ATTEMPT_CLOSE_UNCONFIRMED` (`integration`, `high`, `retryable: false`, `escalate`) was approved by the project owner on 29/09/2026 during application. Because Release 2.17 and Error Registry 1.5 had not been committed or published, the registry stays at 1.5, which now adds two codes relative to 1.4 (58 → 60).
4. **Advisory remaining.** `budget_remaining` returns `null` without an applicable tenant period; the harness then routes without a budget filter and lets the acquisition decide (`budget_not_configured` for a new identity, the attempt's own answer for an existing key).
5. **Tenant deletion.** The first integration run showed that deleting a tenant failed on the period foreign keys. Period foreign keys now cascade, and triggers reject any **direct** delete of periods, attempts, records and entries (only a cascade from `core.tenants` passes), keeping §12 ("tenant deletion cascades") and immutability together. Deleting a tenant while its Ledger has live traffic can make PostgreSQL abort one side with a deadlock (observed once, caused by synthetic tenant ids shared with another test suite; fixed in the tests with Ledger-only ids); tenant deletion is an operator action outside worker traffic.
6. **Overlap.** Non-overlap is checked against every period of the same tenant, scope and workflow key, open or closed (§2 item 1 literally): a replacement for a closed period must start at or after the old `period_end`.
7. **Reconciliation replay.** An identical second reconciliation returns `duplicate`; a divergent one is `INVALID_STATE_TRANSITION`.
8. **Sweep batch.** Each call inspects at most 100 unlocked candidates; `recoverExpiredAttempts` loops up to a batch of 1–100, one transaction per attempt.
9. **Persistent adapter scope.** It accepts only canonical lowercase UUID tenants (the database key); other formats are `invalid` before any database call.
10. **Port changes.** `ModelCallRecorderPort` was removed (merged into `closeAttempt`); the fake `InMemoryModelCallRecorder` remains only as the record store of the in-memory Ledger.
11. **Tests and time.** Lease expiry in pgTAP and integration tests is simulated by the table owner moving `lease_expires_at` into the past; the database still decides expiry with its clock. No test waits 60 s of real time.
12. **Test placement.** The concurrency test lives in `packages/infra/test/` because it needs `pg` directly; the root `package.json` carries pending user edits and was not touched.

**Directed mutations (all detected).** Fingerprint-before-state removed; periods resolved before the identity lookup; tenant check skipped; held estimate released by the sweep; stale fencing token accepted; divergent replay accepted as `duplicate` (initially survived: the test changed the record too; strengthened with single-field replays); caller timestamp used for the lease; lease different from the derived one in the adapter; Schema 1.1 `timeoutMs` maximum raised; Registry 1.1 pointed to Schema 1.0; attempt row locked before the identity in the sweep; `EXECUTE` granted to `PUBLIC`; overflow check removed (initially mis-built; the table constraints still fail closed with `23514`); unknown cost converted to zero; period lock order inverted (detected by the mixed-load concurrency test); close exception mapped to `rejected`; no replay after a close exception; replay with a rebuilt command (changed record); replay repeated three times. 19 of 19 detected.

**Still blocked or deferred.** Workflow-run and platform scopes (D-3); automatic period generation (D-1); retention (D-5); automatic reconciliation from provider usage exports; real providers; productive fingerprint keys; any remote deployment, which needs its own publication approval.

**Superseded draft of Release 2.17 (never committed or published).** Before `MODEL_ATTEMPT_CLOSE_UNCONFIRMED` was added, a local draft of Release 2.17 existed with Error Registry 1.5 at 59 codes and 74 cross-validation checks. Its hashes are superseded by the rebuilt Release 2.17 and do not identify a historical release: manifest `5c52ffcb1021aa9888505bd505d25b4ea5d09734db7aced1f654ec6dfa9ace16`, aggregateDigest `6d79ffd6896162eb81e60ba65cb0a6cccea88838761c6f827ccf16b9433db25c`, report `cross-registry-validation-v2.17.json` `1cc534c72f147ecb2cf2bb10428eab610fb3cafd6245c743f2029d57f9fdcc0c`. The rebuilt manifest records them under `supersededDraft`.
