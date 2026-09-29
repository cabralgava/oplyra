# Product AI Model Harness Contracts v1

**Status:** `approved`
**Contract version:** `1.0`
**Change:** [CR-026](changes/CR-026-product-ai-model-harness-contracts.md), Contract Registry Release 2.16
**Applies to:** Product AI Model Harness (doc 13 §1.1, §2, §12.1, §14)
**Runtime activation:** local Test Adapter only; real providers, productive fingerprint keys, persisted Cost Ledger and visual output remain blocked

## Purpose

This release makes canonical the contracts that the first local slice of I-02 implemented as internal types. It adds registered error codes, shared definitions, five JSON Schemas, a canonical Model Profile registry and an optional classification field in the Context Package. It does not provision infrastructure, persist data, call external providers or load secrets.

## Canonical artifacts

| Artifact | Path | Version |
| --- | --- | --- |
| Error Registry | `registries/errors.json` (+ derived `errors.validation.json`) | 1.3 → 1.4 (+12 codes) |
| Model Profile Registry | `registries/model-profiles.json` (+ derived `model-profiles.validation.json`) | new, 1.0 (3 synthetic local bindings) |
| Shared definitions | `schemas/common-definitions-1.1.schema.json` | `commonDefinitions` 1.0 → 1.1 (superset; `common-definitions.schema.json` stays published as 1.0, unchanged) |
| Context Package | `schemas/context-package.schema.json` | 1.0 → 1.1 (optional `dataClassification`) |
| Invocation request | `schemas/ai-model-harness/model-invocation-request.schema.json` | 1.0 |
| Provider response | `schemas/ai-model-harness/provider-response.schema.json` | 1.0 |
| Model catalog entry | `schemas/ai-model-harness/model-registry-entry.schema.json` | 1.0 (operational configuration, outside the freeze) |
| Model Profile | `schemas/ai-model-harness/model-profile.schema.json` | 1.0 |
| Model Call record | `schemas/ai-model-harness/model-call-record.schema.json` | 1.0 |
| Release validation | `cross-registry-validation-v2.16.json` | 2.16 (62 checks) |

Each schema keeps a stable `$id` per version. The new shared definitions are published only under `common-definitions/1.1`, a compatible superset whose 1.0 definitions are byte-for-byte equivalent; `common-definitions/1.0` remains published exactly as in Release 2.15 because the frozen universal and runtime schemas reference it. The Context Package 1.1 and the five AI Model Harness schemas reference only 1.1. The Context Package follows the precedent of a versioned `$id` for an additive optional field.

The Release 2.16 manifest is a logical change set over Release 2.15: inherited artifacts keep their 2.15 hash, size, category and source; only the paths listed as modified or added by CR-026 carry current content. Pending worktree edits outside CR-026 are excluded from the digest.

## Shared definitions (`common-definitions` 1.1)

`dataClassification`, `nonNegativeSafeInteger`, `identifierLimits` (`wellFormedText`, `tenantId`, `workflowKey`, `invocationId`, `actionKey`, `agentKey`, `traceField`, `attempt`), `traceContext`, `classificationSourceRef`, `requestFingerprint` (`hmac-sha256:v1:<keyId>:<hex>`) and `attemptCallId` (`att1.` + base64url of the JSON scope, `maxLength` 3171 = worst case under `identifierLimits`). Lengths are counted in code points; the executable subset validator gained `maxLength` with that semantics.

## Error codes (Error Registry 1.4)

| Code | Harness kind |
| --- | --- |
| `MODEL_INVOCATION_INVALID` | `invalid_request` |
| `MODEL_PROFILE_NOT_FOUND` | `profile_not_found` |
| `MODEL_CAPABILITY_BLOCKED` | `visual_capability_blocked` |
| `MODEL_ROUTE_UNAVAILABLE` | `no_eligible_model` |
| `MODEL_ATTEMPTS_EXHAUSTED` | `attempts_exhausted` |
| `MODEL_REQUEST_REJECTED` | `provider_rejected_request` |
| `MODEL_PARAMETER_NOT_APPLIED` | `parameter_not_applied` |
| `MODEL_OUTPUT_INVALID` | `output_invalid` |
| `MODEL_RESOLUTION_MISMATCH` | `resolution_mismatch` |
| `MODEL_PROVIDER_RESPONSE_INVALID` | `provider_response_invalid` |
| `MODEL_ATTEMPT_IN_PROGRESS` | `attempt_in_progress` |
| `MODEL_ATTEMPT_ALREADY_EXECUTED` | `attempt_already_executed` |

All twelve are non-retryable. The two `critical` codes stop. The harness also reuses, unchanged, `TENANT_REQUIRED`, `TENANT_MISMATCH`, `IDEMPOTENCY_CONFLICT`, `REFERENCE_NOT_FOUND`, `AGENT_NOT_FOUND`, `ACTION_NOT_FOUND`, `PERMISSION_DENIED`, `ENTITLEMENT_REQUIRED`, `BUDGET_LIMIT_EXCEEDED`, `PROVIDER_TIMEOUT`, `PROVIDER_RATE_LIMITED` and `UPSTREAM_SERVICE_UNAVAILABLE`. No harness outcome is left without a registered code.

## Invariants outside the schema subset

The executable schema subset does not express byte limits, cross-field coherence or sequence rules. Those invariants are enforced by the core runtime validators and verified by `-business-invariant` fixtures (accepted by the schema, rejected at runtime):

- message size in UTF-8 bytes (256 KiB each, 1 MiB total) and `text` among input modalities;
- classification downgrade below the verified value;
- same `(tenantId, actionKey, invocationId, attempt)` with a different fingerprint → `IDEMPOTENCY_CONFLICT`;
- provider response coherence (success vs failure fields, text vs visual route, delivered images ≤ requested, `usage.images` = delivered assets);
- Model Profile semantics (threshold required by `lowest_cost_above_threshold`, candidates not forbidden, frozen `agent + action` binding, one active profile);
- Model Call record coherence (outcome vs failure kind, cost status vs cost, accepted assets only on success, provenance in the record tenant, `callId` bound to the record scope).

## What remains blocked or deferred

- **Visual output:** no canonical asset contract exists; without a `GeneratedAssetPort` the harness returns `MODEL_CAPABILITY_BLOCKED`. The asset contract needs its own CR.
- **Fingerprint keys:** HMAC runs in infrastructure with caller-supplied keys; loading keys from a secret store is not implemented, so productive use is blocked.
- **Cost Ledger:** attempt acquisition and reservations exist only as in-memory fakes; persistence, RLS and database-level atomicity need their own CR and migrations.
- **Real providers:** no OpenRouter or direct adapter; the local composition enables only the Test Adapter.
- **Model Profile entries:** the three canonical entries are synthetic local bindings to the operational test catalog; production bindings depend on EXP-05 evidence.
