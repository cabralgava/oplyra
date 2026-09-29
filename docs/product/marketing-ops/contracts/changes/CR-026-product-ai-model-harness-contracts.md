# CR-026 — Product AI Model Harness contracts

**Status:** `approved_and_applied`
**Classification:** `backward_compatible_contract_addition`
**Approved by:** project owner, 29/09/2026
**Applied at:** 2026-09-29T18:00:00Z
**Issued at:** 2026-09-29T15:00:00Z
**Revised at:** 2026-09-29 (revision 5: attempt `callId` over the full scope, identifier limits, well-formed Unicode, opaque external idempotency key; revision 4: idempotency scope tenant + action + key, keyed fingerprint with rotation, public visual output, accepted-only asset record)
**Base:** Contract Registry Release 2.15
**Target:** Contract Registry Release 2.16

## Objective

Give the Product AI Model Harness (doc 13 §1.1, §2, §12.1 and §14) a canonical contract for the parts the first I-02 slice could only implement as internal, non-canonical types. The project owner approved this CR on 29/09/2026 and it was applied in Contract Registry Release 2.16 (see "Application record"). The approval covers only this CR: it does not authorize a persisted Cost Ledger, database migrations, a real provider adapter, OpenRouter, Stripe, external services, real keys, publication or commit.

## Decisions already taken by the project owner (29/09/2026)

| Topic | Decision |
| --- | --- |
| Category of `MODEL_REQUEST_REJECTED` | `external_provider` |
| Where profiles and the model catalog live | **Option A:** Model Profiles as a canonical, versioned registry; model catalog, tariffs and availability as operational configuration validated by schema, outside the freeze |

These decisions shaped the proposal below and were applied as written.

## Context

The first local slice of I-02 (see [ESTADO](../../../../harness/ESTADO.md) and [AI-MODEL-HARNESS](../../../../harness/AI-MODEL-HARNESS.md)) implemented, in `packages/core/src/ai-model-harness` and `packages/infra/src/ai-model-harness`:

- provider ports and a deterministic in-process Test Adapter;
- a Model Registry and Model Profiles keyed by `agent + action`, validated against the frozen `agents.json@1.0` and `actions.json@2.0` in read-only mode;
- a deterministic AI Model Router (capability, allowlists, tenant policy, kill switch, privacy, tariff, budget and fallback);
- internal result and failure contracts that reuse twelve codes from `errors.json@1.3` with unchanged semantics;
- atomic acquisition of each attempt in the scope `(tenantId, actionKey, invocationId, attempt)` with a keyed request fingerprint (HMAC-SHA-256 behind a port, key identified for rotation) and its budget reservation; `IDEMPOTENCY_CONFLICT` when the same key in the same action carries a materially different request;
- data classification resolved from verifiable sources through a trusted port, with caller downgrade forbidden;
- input token estimation owned by the harness (model-specific exact count or conservative bound), with the caller value reduced to a non-authoritative hint;
- provider output modelled by modality; visual output as typed asset references, blocked at runtime until an asset contract exists;
- deadline enforcement, runtime validation of request and adapter response, and one record per attempt carrying the full `TraceContext`, without prompt or response.

Twelve failure kinds have no registered code. Model Profiles, the model catalog entry, the invocation request, the provider response, the Model Call record, the trace context, the classification source and the data classification vocabulary have no canonical schema. The Context Package has no classification field and there is no canonical asset schema. Those gaps are the scope of this CR.

## Proposed changes

### 1. Error Registry 1.3 → 1.4 (additive)

| Proposed code | Harness kind | Category | Severity | Retryable | defaultNextAction | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `MODEL_INVOCATION_INVALID` | `invalid_request` | `validation` | `high` | `false` | `revise_input` | The invocation request violates the schema or a runtime invariant (identifiers and their limits, malformed Unicode such as an isolated surrogate, trace, classification, messages and their limits, modalities, quantities, image semantics, classification downgrade). No attempt, reservation or record is created. |
| `MODEL_PROFILE_NOT_FOUND` | `profile_not_found` | `runtime` | `high` | `false` | `stop` | No active Model Profile for the requested `agent + action`. |
| `MODEL_CAPABILITY_BLOCKED` | `visual_capability_blocked` | `runtime` | `high` | `false` | `stop` | The resolved route produces visual output but no canonical asset contract (and therefore no generated-asset port) is available; no attempt is made. |
| `MODEL_ROUTE_UNAVAILABLE` | `no_eligible_model` | `runtime` | `high` | `false` | `escalate` | No candidate satisfies capability, allowlist, tenant policy, availability, privacy and tariff rules. |
| `MODEL_ATTEMPTS_EXHAUSTED` | `attempts_exhausted` | `runtime` | `high` | `false` | `escalate` | Retries and compatible fallbacks were exhausted without a valid result. |
| `MODEL_REQUEST_REJECTED` | `provider_rejected_request` | `external_provider` | `high` | `false` | `stop` | The provider rejected the request as invalid for the routed model. |
| `MODEL_PARAMETER_NOT_APPLIED` | `parameter_not_applied` | `validation` | `high` | `false` | `stop` | The provider reported that a profile parameter was ignored; the response is discarded. |
| `MODEL_OUTPUT_INVALID` | `output_invalid` | `validation` | `medium` | `false` | `revise_input` | Output does not satisfy the required structured format. |
| `MODEL_RESOLUTION_MISMATCH` | `resolution_mismatch` | `integration` | `critical` | `false` | `stop` | The adapter returned a provider/model different from the routed one; output is discarded. |
| `MODEL_PROVIDER_RESPONSE_INVALID` | `provider_response_invalid` | `integration` | `critical` | `false` | `stop` | The adapter response violates the provider response contract (usage, images, visual outputs, reported cost, identifiers, applied parameters, result shape). Nothing is settled; the reservation is held for reconciliation and the output is discarded. |
| `MODEL_ATTEMPT_IN_PROGRESS` | `attempt_in_progress` | `idempotency` | `medium` | `false` | `stop` | Another execution holds the same attempt `(tenantId, actionKey, invocationId, attempt)` with an accepted fingerprint. The caller must wait for that execution's result instead of calling the provider again. |
| `MODEL_ATTEMPT_ALREADY_EXECUTED` | `attempt_already_executed` | `idempotency` | `high` | `false` | `stop` | The same attempt `(tenantId, actionKey, invocationId, attempt)` with an accepted fingerprint was already settled, released or held; repeating it would spend outside any reservation. |

**Category `external_provider`.** It already exists in the `category` enum of `error.schema.json`; no schema change is needed. `errors.validation.json` is a **derived validation report**, not a normative registry: the manifest classifies it as `registry_validation`, the Freeze v1 declaration lists it among the "relatórios de validação dos registries", and its `categories` field is exactly the set of categories used by the current entries (17 of 17), not an allow-list. No script in this repository generates it. On application, the report is regenerated from the updated registry and will then list `external_provider` because an entry uses it.

**Alternative for `MODEL_ATTEMPTS_EXHAUSTED`:** reuse `RETRY_ATTEMPTS_EXHAUSTED` by widening its description beyond outbox deliveries. Not adopted because it changes the semantics of a frozen code.

`critical` requires explicit stop/escalation (registry rule `criticalErrorsRequireExplicitStopOrEscalation`); both `critical` codes use `stop`.

**Codes reused unchanged:** `TENANT_REQUIRED`, `TENANT_MISMATCH` (including classification provenance or generated asset belonging to another tenant), `IDEMPOTENCY_CONFLICT` (same `invocationId` in the same tenant **and action** with a materially different request — exactly the registered scope: "mesmo tenant e action"), `REFERENCE_NOT_FOUND` (classification source absent from the tenant scope; absence and foreign ownership get the same answer), `AGENT_NOT_FOUND`, `ACTION_NOT_FOUND`, `PERMISSION_DENIED` (action not callable by the agent), `ENTITLEMENT_REQUIRED`, `BUDGET_LIMIT_EXCEEDED`, `PROVIDER_TIMEOUT`, `PROVIDER_RATE_LIMITED`, `UPSTREAM_SERVICE_UNAVAILABLE`.

### 2. Shared definitions (additive; applied as `common-definitions` 1.1, see "Application record")

1. `dataClassification`: `synthetic|internal|tenant_confidential|personal_data`, ordered by sensitivity.
2. `nonNegativeSafeInteger`: integer, `minimum: 0`, `maximum: 9007199254740991`. Used by every quantity (tokens, images, attempts) and every monetary value (integer micro-USD). JSON Schema cannot express `NaN`/`Infinity`; runtime validation must also reject them, decimals and values above the safe integer range.
3. `traceContext`: see §3.
4. `classificationSourceRef`: `{ kind: "context_package" | "asset", ref: non-empty string ≤ 256 }`.
5. `requestFingerprint`: string matching `^hmac-sha256:v1:[a-z0-9][a-z0-9._-]{0,63}:[0-9a-f]{64}$` (§4).
6. `attemptCallId`: `"att1." + base64url_nopad(UTF-8(JSON.stringify([tenantId, actionKey, invocationId, attempt])))`, pattern `^att1\.[A-Za-z0-9_-]+$`. It covers the **full attempt scope**, so the same action and invocation in different tenants never share an id; the JSON array makes it unambiguous for any content (`/`, `#`, `%`, quotes, valid Unicode); the identifier limits (item 7) bound it. Worst case under those limits (control characters escaped by JSON as six bytes): 3171 characters, which is the canonical `maxLength` (see "Application record"). It is the `callId` sent to the adapter, recorded in the Model Call record and used as `producedByCallId` of generated assets. It is an **internal** identifier: being reversible, it is never forwarded to an external provider (§4, "External idempotency key").
7. `identifierLimits` (all identifiers must also be well-formed Unicode — no isolated surrogate):

   | Identifier | Rule | Source |
   | --- | --- | --- |
   | `invocationId` | 1–255 characters | **reuses** `idempotency.key` of `transaction-envelope.schema.json` (`minLength 1`, `maxLength 255`) |
   | `actionKey` | pattern `^[a-z][a-z0-9_]*$` | **reuses** `common-definitions#/$defs/actionKey`; maximum 64 **added by this CR** |
   | `agentKey` | pattern `^[a-z][a-z0-9-]*-agent$` | **reuses** `common-definitions#/$defs/agentKey`; maximum 64 **added by this CR** |
   | `tenantId` | 1–128 characters | `common-definitions#/$defs/tenantId` has no maximum; 128 **added by this CR** |
   | `workflowKey` | 1–128 characters | no previous canonical definition; **added by this CR** |
   | trace fields | 1–255 characters | `nonEmptyString` has no maximum; 255 **added by this CR** |
   | `attempt` | integer 1–5 | profile `maxAttempts` (§8) |

   These maxima are canonical since Release 2.16, in `common-definitions/1.1#/$defs/identifierLimits`, counted in code points.

### 3. `TraceContext`

Aligned with the `trace` object of the transaction envelope (doc 20 §6) plus the transaction and run identifiers required by doc 13 §12.1 and §14.

| Field | Type | Source | Invariant |
| --- | --- | --- | --- |
| `correlationId` | non-empty string | doc 20 §6.1 | required |
| `transactionId` | non-empty string or `null` | doc 20 envelope `transaction.id` | never empty string |
| `causationId` | non-empty string or `null` | doc 20 §6.2 | never empty string |
| `parentTransactionId` | non-empty string or `null` | doc 20 §6 | never empty string |
| `workflowId` | non-empty string or `null` | doc 20 §6.3 | never empty string |
| `taskId` | non-empty string or `null` | doc 20 §6.4 | never empty string |
| `runId` | non-empty string or `null` | doc 13 §14 (Agent Run) | never empty string |

Invariants: all seven keys are always present (`null` when not applicable); the harness copies the trace unchanged into every Model Call record of the invocation, including retries and fallbacks; the trace is **not** sent to the provider and is **not** part of the fingerprint.

### 4. Idempotency scope and protected fingerprint

**Scope.** Aligned with the frozen `IDEMPOTENCY_CONFLICT` ("mesmo tenant e action"): each attempt is identified by `(tenantId, actionKey, invocationId, attempt)`. The same `invocationId` in another action or another tenant is a different attempt and never conflicts. The adapter-facing `callId` (§2 item 6) encodes this same full scope.

**Malformed identifiers.** Identifiers, trace fields, classification refs and message contents must be well-formed Unicode. An isolated surrogate is rejected as `MODEL_INVOCATION_INVALID` during request validation — before fingerprint, reservation, record or provider call. This also prevents fingerprint collisions: HMAC over UTF-8 would otherwise map an isolated surrogate and U+FFFD to the same bytes.

**External idempotency key.** Adapters never forward `tenantId`, `actionKey`, `invocationId` or the raw `callId` to an external provider. When a provider supports an idempotency key, the infrastructure derives it opaquely: `oik1-<64 hex>` = HMAC-SHA-256(key, `"oplyra.external-idempotency-key.v1\u0000" + callId`). The domain prefix separates it from the request fingerprint even under the same key. It is deterministic per attempt, distinct across attempts and tenants, and reveals none of the scope components. No real adapter uses it yet.

**Canonical material, version 1.** Built deterministically by the core and serialized as one JSON array, in this order:

| # | Component | Normalization |
| --- | --- | --- |
| 0 | literal `"oplyra.model-invocation.v1"` | material version marker |
| 1 | `tenantId` | as received |
| 2 | `workflowKey` | as received |
| 3 | `agentKey` | as received |
| 4 | `actionKey` (the operation) | as received |
| 5 | `profileRef` = `profileId@version` of the active profile resolved by the harness | a new profile version is a different request |
| 6 | effective data classification (after provenance and caller elevation) | enum value |
| 7 | declared classification | enum value or `null` |
| 8 | classification sources as `kind:ref` | sorted (set semantics) |
| 9 | `inputModalities` | sorted (set semantics) |
| 10 | `requestedImages` | `0` when absent |
| 11 | messages, each `[role, content]` | order preserved; content byte-exact |

**Excluded:** `invocationId` and `attempt` (they form the key), `trace` (changes between redeliveries of the same request) and `inputTokensHint` (not material; it can only raise the reservation).

**Protected format.** The core never hashes the material. A `RequestFingerprintPort` computes HMAC-SHA-256 over the UTF-8 material with a platform cryptographic primitive, and the persisted value is:

```text
hmac-sha256:v1:<keyId>:<64 lowercase hex>
```

- `hmac-sha256` names the algorithm; `v1` is the canonical material version; `keyId` (`^[a-z0-9][a-z0-9._-]{0,63}$`) identifies the key **and its version**; the hex is the MAC.
- Keys have at least 32 bytes, are per environment, live only in the runtime secret store, and are never logged, recorded or sent to providers. The material contains the prompt and is never stored, logged or returned.
- An unkeyed digest (`sha256:v1:<hex>`, used only during revision 3 development and never persisted outside volatile test fakes) is **not** a canonical format: low-entropy content could be confirmed by guessing.

**Comparison.** The port returns `primary` (active key) and `accepted` (the MACs under every key still in the keyring, `primary` first). `acquireAttempt` stores `primary` and, in the same atomic check-and-set, before looking at the state, treats an existing key whose stored fingerprint is **not in `accepted`** as `conflict`. The harness refuses a port answer outside the protected format and makes no acquisition.

**Rotation.** Add the new key as active and keep the previous one as `previous` in the keyring for at least the retention window of attempt reservations; redeliveries during that window match through `accepted`. After retirement, a redelivery of an old attempt no longer matches and fails closed as `IDEMPOTENCY_CONFLICT` without calling the provider. Stored fingerprints are never re-keyed; they age out with their reservations.

**Migration.** Nothing persisted exists yet. A future change of canonical material increments the marker (`oplyra.model-invocation.v2`) and the format (`hmac-sha256:v2:…`); both versions can be accepted during the transition by computing `accepted` for each supported material version.

**Runtime block.** This slice provides the HMAC adapter with caller-supplied keys only; tests use explicit synthetic keys. Loading keys from a secret store is not implemented, so no productive fingerprint adapter exists and production use stays blocked until the runtime provides it.

### 5. Data classification provenance

The caller no longer declares an authoritative classification. The request carries `classification: { sources: classificationSourceRef[] (≤ 32, unique), declared: dataClassification | null }`.

- A trusted `DataClassificationPort` resolves each source **within the caller's tenant** and returns the classification recorded at the source plus one provenance entry per source (`kind`, `ref`, `tenantId`, `classification`). A source that does not exist, or belongs to another tenant, yields `REFERENCE_NOT_FOUND` without revealing which.
- The harness rejects provenance from another tenant (`TENANT_MISMATCH`) and resolutions that do not cover every requested source.
- Effective classification = the most sensitive among the resolved value and all provenance entries.
- Without sources, the effective classification is the conservative default `personal_data` (provenance `conservative_default`).
- `declared` may **raise** the effective classification; declaring below it is a downgrade and is rejected (`MODEL_INVOCATION_INVALID`) before any reservation or provider call.
- The effective classification and the provenance (kinds, refs, tenant, classification — no content) are recorded in every Model Call record and enter the fingerprint.

**Contract dependencies and impact (item 1 applied in Release 2.16; item 2 still open):**

1. `context-package.schema.json` (frozen) has **no** classification field. Proposal: add an optional `dataClassification` (`dataClassification` definition) to the Context Package, set by the Context Builder from its layers and sources. Additive, optional field → minor version of that schema. Impact: Context Builder must populate it; until then no canonical Context Package can back the port, so the local composition requires the caller to supply a `DataClassificationPort` and only synthetic fixtures resolve.
2. Asset metadata classification depends on the canonical asset schema that does not exist yet (§7).

### 6. Input token estimation

- `inputTokensHint` (optional `nonNegativeSafeInteger`) replaces the former `estimatedInputTokens`. It is **non-authoritative**: it can only raise the estimate.
- For each candidate model the harness uses, in order: an exact count from a model-specific `TokenEstimatorPort` (`method: model_exact`), otherwise the conservative bound (`method: conservative_bound`); if the hint is higher, the hint is used (`method: caller_hint`). An estimator returning an invalid value is ignored.
- Conservative bound = Σ(UTF-8 bytes of each message + 16) + 32. It is an upper bound for byte-level tokenizers (every token covers at least one byte); image inputs are not covered and remain out of scope.
- Structural limits: at most 64 messages, 256 KiB per message, 1 MiB in total (UTF-8). Exceeding them is `MODEL_INVOCATION_INVALID`.
- The reservation and the context-window check use the per-model estimate; the record keeps `inputTokensEstimate` and `inputTokensEstimateMethod`.

### 7. Output by modality and visual assets

`ProviderSuccess.output` is `{ modality: "text", text }` or `{ modality: "visual", assets: [{ assetId, mediaType }] }`, where `mediaType` ∈ `image/png|image/jpeg|image/webp`.

- Text routes require `text`; visual routes (`image_generation`, `image_edit`) require `visual`.
- A visual asset is a **typed reference** only: any extra field (binary, base64, URL) is rejected, and `assetId` cannot be a `data:` URL.
- A visual call succeeds only with **at least one** valid asset, **no more** than `requestedImages`, `usage.images` equal to the number of delivered assets, and each asset confirmed by a `GeneratedAssetPort` as existing in the caller's tenant, with the declared media type, produced by the same attempt (`producedByCallId` = `attemptCallId`). An asset in another tenant is `TENANT_MISMATCH`; any other violation is `MODEL_PROVIDER_RESPONSE_INVALID`. In both cases nothing is settled.
- For visual routes the adapter receives `visualOutputScope = { tenantId, callId }` to write assets in the right tenant; it must not forward it to the external provider.
- **Two separate visual contracts.** The public `invokeModel` output is `{ modality: "visual", assets: [{ assetId, mediaType }] }` — no tenant, no provenance. `tenantId` and `producedByCallId` exist only in the internal `GeneratedAssetDescriptor` returned by the `GeneratedAssetPort` for verification.
- **Record semantics.** `outputAssetIds` in the Model Call record contains only assets accepted in a successful visual call. On any failure or discarded output (asset missing, other tenant, other attempt, media type mismatch, resolution mismatch, ignored parameter, invalid response) it is `null`, so an id belonging to another tenant or attempt never enters the caller's record.

**Contract dependency and runtime block.** There is no canonical asset schema (the storage manifest `asset_versions` of doc 18 is an experiment design, not a contract). Required before activation: an asset contract with at least `assetId`, `tenantId`, `mediaType`, `producedByCallId` (provenance), storage location, retention and rights (the registered `ASSET_RIGHTS_UNCONFIRMED` applies). **Until that contract is approved the visual capability is blocked:** without a `GeneratedAssetPort` the harness returns `MODEL_CAPABILITY_BLOCKED` before any attempt, and the local composition provides no such port.

### 8. New schemas (additive, `schemas/ai-model-harness/`)

1. **`model-invocation-request.schema.json`** — `invocationId`, `tenantId`, `workflowKey`, `agentKey`, `actionKey` (non-empty, well-formed Unicode, `identifierLimits` of §2 item 7); `trace` (`traceContext`); `classification` (§5); `messages` (1–64 items; `role` in `system|user|assistant`; `content` non-empty, ≤ 256 KiB; total ≤ 1 MiB); `inputModalities` (non-empty, unique, from `text|image|audio|video`, must contain `text`); `inputTokensHint` (optional `nonNegativeSafeInteger`); `requestedImages` (optional `nonNegativeSafeInteger`; required and `>= 1` on visual routes, absent or `0` otherwise). No field selects model, provider, temperature or any sampling parameter.
2. **`provider-response.schema.json`** — success: `ok: true`, `output` (§7), `usage.{inputTokens, outputTokens, images}` as `nonNegativeSafeInteger`, `resolvedProvider` and `resolvedProviderModelId` non-empty, `ignoredParameters` array of non-empty strings, `externalRequestId` non-empty or `null`, `billing`; failure: `ok: false`, `errorKind` in `timeout|rate_limited|unavailable|rejected_request`, `externalRequestId`, `billing`; `billing` is `{kind: "charged", reportedCostMicroUsd: nonNegativeSafeInteger | null}`, `{kind: "none"}` or `{kind: "unknown"}`. Coherence: `usage.outputTokens <= maxOutputTokens` sent; text route ⇒ `usage.images = 0`; visual route ⇒ §7. A response violating this schema is never settled nor released; a computed cost outside the safe integer range is also held.
3. **`model-registry-entry.schema.json`** (operational configuration, outside the freeze — Option A) — as in revision 2: identity, adapter, status, capabilities, modalities, supported parameters, limits, versioned tariff in `nonNegativeSafeInteger` micro-USD (visual routes require `microUsdPerImage`), data policy with evidence, quality evidence per `agent + action`, evidence date; `experimental` accepts only `synthetic`.
4. **`model-profile.schema.json`** and canonical registry **`registries/model-profiles.json`** (Option A) — as in revision 2; at most one `active` profile per `agent + action`, frozen identities, candidates validated against the operational catalog at load time.
5. **`model-call-record.schema.json`** — per attempt: `invocationId`, `attempt`, `callId` (`attemptCallId`), `tenantId`, `workflowKey`, `agentKey`, `actionKey`, `trace`, `requestFingerprint`, `dataClassification`, `classificationProvenance`, `inputTokensEstimate`, `inputTokensEstimateMethod` (`model_exact|conservative_bound|caller_hint`), `profileRef`, `registryVersion`, routed `modelId/provider/adapterKey/providerModelId`, `tariffVersion`, `routingReason`, `fallbackOccurred`, resolved provider/model or `null`, `externalRequestId` or `null`, `outcome`, `failureKind`, `usage` (validated) or `null`, `outputAssetIds` (only accepted visual asset ids; `null` on any failure or discarded output), `estimatedCostMicroUsd`, `costMicroUsd` or `null`, `costStatus`, `startedAt`, `latencyMs`. No prompt, response or PII.

### 9. Attempt acquisition semantics (port contract, for the future persisted Cost Ledger CR)

`acquireAttempt(tenantId, workflowKey, attempt = { actionKey, invocationId, number }, requestFingerprint, acceptedFingerprints, amountMicroUsd)` is a single atomic check-and-set keyed by `(tenantId, actionKey, invocationId, number)`:

| Status | Meaning | Harness behavior |
| --- | --- | --- |
| `acquired` | this execution owns the attempt and its reservation | only this execution calls the provider |
| `conflict` | the key exists and its stored fingerprint is not in `acceptedFingerprints` | `IDEMPOTENCY_CONFLICT`, no call |
| `in_progress` | same fingerprint, reservation still open in another execution | `MODEL_ATTEMPT_IN_PROGRESS`, no call |
| `closed` | same fingerprint, reservation settled, released or held | `MODEL_ATTEMPT_ALREADY_EXECUTED`, no call |
| `insufficient` | the estimate does not fit the remaining budget | `BUDGET_LIMIT_EXCEEDED`, no call |

Invariants: at most one `acquired` per `(tenantId, actionKey, invocationId, number)`, forever; the fingerprint is compared before the state; a reservation is closed exactly once and only by the same tenant; amounts are `nonNegativeSafeInteger`. Recovery of attempts left `in_progress` by a crashed process belongs to the reconciliation job of the persisted Ledger, not to a new call.

### 10. Explicit non-changes

- No new agent, action, event, tool, permission, handoff or quality gate.
- No field added to `agent-definition.schema.json`: profiles reference agents, agents do not reference profiles or models.
- No change to `transaction-envelope.schema.json`: `TraceContext` reuses its `trace` fields and adds `transactionId`/`runId` only inside the harness contracts.
- `context-package.schema.json` receives only the optional classification field of §5 (applied, `$id` 1.1); no other change.
- No asset schema created: §7 lists the minimum requirements and keeps the visual capability blocked.
- No event proposed for model calls in this CR; the persisted Cost Ledger (migration, RLS, atomic acquisition in the database) will need its own CR.
- No real model, provider, tariff or temperature is selected; EXP-05 remains the only source for that.

## Compatibility assessment

All changes are additive: new codes, new schemas, new shared definitions published as `common-definitions` 1.1 (1.0 unchanged), one new canonical registry and one optional field added to the Context Package (minor version of that schema). Versions: Error Registry 1.3 → 1.4; `commonDefinitions` 1.0 → 1.1; Context Package 1.0 → 1.1; Model Profile Registry new at 1.0. Existing actions, events and runtime behavior are unaffected. Error Registry goes 1.3 → 1.4 (minor). No migration of stored data is needed because no harness data is persisted yet. The request field `estimatedInputTokens` of revision 2 was never canonical; it is replaced by `inputTokensHint`.

## Migration strategy

1. Approve the CR.
2. Add codes, shared definitions, schemas, `registries/model-profiles.json`, the Context Package classification field, valid/invalid fixtures; regenerate the derived validation reports; issue manifest v2.16.
3. In code, switch the twelve `pending` entries of `HARNESS_FAILURE_CONTRACT` to the approved codes; the contract test `test/contracts/ai-model-harness.contract.test.ts` then asserts they exist in the registry.
4. Move the local synthetic profiles into the canonical registry format; keep the local model catalog as operational configuration validated by schema.
5. Visual capability stays blocked until a separate asset contract is approved and a `GeneratedAssetPort` implementation exists.

## Validation (executed on application)

- schema and fixture tests for the five new schemas, including invalid fixtures with negative, decimal and out-of-range quantities, inline binaries and oversized messages;
- cross-registry check: every profile `agentKey/actionKey` exists and is callable;
- error registry validation rules (unique codes, categories, critical behavior);
- `pnpm verificar`, `pnpm test:harness`, `git diff --check` and secret scan including untracked files.

## Rollback

Revert the CR-026 changes and reactivate Release 2.15 (its manifest is preserved unchanged). The harness code would then need the `pending_contract_change` markers restored, because the MODEL_* codes would no longer be registered.

## Application record

**Approval.** Project owner, 29/09/2026, explicitly for this CR only.

**Release.** Contract Registry Release 2.16 — manifest `contract-registry-manifest-v2.16.json`, base Release 2.15 (unchanged and preserved), base Freeze v1. The manifest is a logical change set over Release 2.15: inherited artifacts keep exactly the 2.15 hash, size, category and source; only artifacts added or modified by this CR carry current content. Pending worktree edits outside this CR are not part of the release digest.

**Applied changes.**

| Area | Before | After |
| --- | --- | --- |
| Error Registry | 1.3, 46 codes | 1.4, 58 codes (+12 of §1); derived `errors.validation.json` regenerated |
| Model Profile Registry | — | `registries/model-profiles.json` 1.0, 3 synthetic local bindings; derived `model-profiles.validation.json` |
| Shared definitions | `common-definitions` 1.0 | `common-definitions` 1.1 (`schemas/common-definitions-1.1.schema.json`): superset of 1.0 plus `dataClassification`, `nonNegativeSafeInteger`, `identifierLimits`, `traceContext`, `classificationSourceRef`, `requestFingerprint`, `attemptCallId`; 1.0 stays published unchanged |
| Context Package | 1.0 | 1.1, optional `dataClassification`; `schema-integration-manifest` integration 1.1 |
| Schemas | 24 | 30 (+5 in `schemas/ai-model-harness/`, each with a derived validation report; +1 `common-definitions` 1.1) |
| Fixtures | 29 valid, 56 invalid | 40 valid, 92 invalid |
| Harness code | 12 outcomes marked `pending_contract_change` | every outcome mapped to a registered code; profiles loaded from the canonical registry |
| Release validation | — | `cross-registry-validation-v2.16.json`, 60/60 checks |

**Corrections and clarifications made during application (no change of approved rules).**

1. **Factual correction — `attemptCallId` bound.** Revision 5 stated that the worst case was "well under 1 KiB". That statement was incorrect. Computed against the approved limits, the worst case is 3171 characters (128 + 255 control characters, each escaped by JSON as `\u00XX`). The canonical `maxLength` is 3171. The approved rule — the id is bounded by `identifierLimits` — is unchanged; only the incorrect estimate was corrected.
2. **Versioning — `commonDefinitions: 1.0 → 1.1`.** The first packaging of Release 2.16 added the new `$defs` inside the file published as 1.0, which republished new definitions under an existing, stable identity. It was corrected before any commit: `common-definitions.schema.json` is restored byte for byte to the 1.0 content of Release 2.15 (still referenced by the frozen universal and runtime schemas), and the new definitions are published only in `common-definitions-1.1.schema.json` (`$id` `https://schemas.oplyra.com/core/common-definitions/1.1`), a compatible superset whose 1.0 definitions are identical. The Context Package 1.1 and the five AI Model Harness schemas reference only 1.1; `schema-integration-manifest.json` lists both versions. This follows the repository rule that each schema has a stable `$id` and that additive changes are minor versions.
3. The executable subset validator (`test/contracts/json-schema-subset.ts`) gained `maxLength`, counted in code points as in JSON Schema. The harness counts identifier lengths the same way.
4. The Freeze v1 artifact `cross-registry-validation.json` is historical evidence cited by the freeze declaration and was not modified; this release's cross-validation is `cross-registry-validation-v2.16.json`.
5. `errors.validation.json` is treated as a derived report: its `categories` lists categories in use and now includes `external_provider`.
6. Invariants that the schema subset cannot express are covered by `-business-invariant` fixtures, which the contract tests run through the core runtime validators and, for downgrade and idempotency conflict, through the local harness.

7. **Manifest rebuilt as a logical change set.** The first manifest of Release 2.16 re-hashed every inherited artifact from the working tree, which absorbed pending user edits outside this CR (marked `worktree_change_outside_cr`) and doc 13, which also carries pending user edits. The rebuilt manifest keeps every inherited artifact exactly as in Release 2.15, lists the authorized modified and added paths explicitly in `changeSet`, and excludes doc 13 and the pending edits from the digest. The files themselves were preserved untouched.

**Still blocked or deferred.** Asset contract and visual output; productive fingerprint key loading; persisted Cost Ledger, migrations and RLS; real provider adapters; production Model Profile bindings (EXP-05).
