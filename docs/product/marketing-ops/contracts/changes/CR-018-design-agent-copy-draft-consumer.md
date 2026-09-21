# CR-018 — design-agent `copy.draft_created` consumer

**Status:** `approved_and_applied`  
**Classification:** `internal_breaking_pre_activation`  
**Issued at:** 2026-09-21T18:50:00Z  
**Base:** Contract Registry Release 2.7  
**Target:** Contract Registry Release 2.8

## Objective

Implement the first registered internal consumer for `copy.draft_created`. The `design-agent` consumer resolves the persisted draft and exact variant set through the authorized content-reference boundary and acknowledges intake without creating any design artifact or external side effect.

## Tenant boundary correction

CR-017 initially passed only the event claim to `ConsumerDeliveryPort`. Tenant identity belongs to the claim batch envelope, so the consumer could not safely resolve tenant-scoped references without implicit binding.

CR-018 changes the internal delivery signature to receive:

```text
tenantId + dispatcherId + event
```

`DeliveryFailurePolicyPort` receives the same tenant-scoped request. This is an intentional internal breaking correction applied before runtime activation. All repository-owned callers and tests were migrated in the same release. No external endpoint or active consumer existed.

## Consumer behavior

`createDesignAgentCopyDraftConsumer`:

- accepts only `copy.draft_created` addressed to `design-agent`;
- requires explicit `tenantId`;
- calls `ContentReferenceResolverPort` as `design-agent` with `read` on `contentRepository`;
- resolves the exact `draftRef`, version and complete unique `variantRefs` from the event;
- verifies that the resolved tenant, repository, draft, version, source action and variant set exactly match the event;
- returns `delivered` only after complete resolution;
- creates no task, briefing, design asset, handoff or publication.

## Failure semantics

Deterministic resolver failures (`REFERENCE_NOT_FOUND`, `CONFLICT_VERSION`, `TENANT_MISMATCH`, `PERMISSION_DENIED`, `TRANSACTION_SCHEMA_INVALID`, `TENANT_REQUIRED`) are normalized at the delivery boundary to terminal `INVALID_STATE_TRANSITION`. This expresses that a committed event cannot be materialized from its persisted references, while keeping the dispatcher settlement error within the approved CR-013 code set.

Unsupported event identity maps to terminal `EVENT_NOT_REGISTERED`.

`INTEGRATION_UNAVAILABLE` and unexpected failures are not converted to terminal outcomes; they are rethrown for the injected delivery-failure policy to classify.

## Validation

- 8/8 consumer unit tests passed;
- 3/3 end-to-end integration tests passed with real PostgreSQL, dispatcher adapter, content repository and resolver;
- successful intake resolved the real draft/variants and atomically completed outbox/deduplication;
- missing variant and version mismatch produced terminal dead-letter without partial content;
- no content row or design artifact was created by intake;
- updated tenant-scoped cycle tests remain passing;
- all TypeScript packages passed isolated type checks.

## Explicit limits

- intake acknowledgement is represented by completed consumer deduplication and outbox settlement;
- no design task, visual brief, asset or generation is created;
- no external transport, polling loop, scheduler or daemon is enabled;
- deterministic root resolution codes are not added to settlement storage; they are normalized to the already approved `INVALID_STATE_TRANSITION` delivery code;
- only `copy.draft_created` → `design-agent` is implemented.

## Compatibility

Result: **internal breaking correction before activation**.

- `ConsumerDeliveryPort` and `DeliveryFailurePolicyPort` signatures changed to carry explicit tenant context;
- all repository-owned implementations and callers were migrated;
- no active runtime or external caller requires migration;
- registries, schemas, database objects and privileges are unchanged.

## Next permitted increment

Before enabling any recurring execution, run and record EXP-02 against the implemented lease/fencing/retry path and resolve conditional ADR-0004. A composition root may be tested in-process, but no poller, scheduler or external transport should be activated until that decision is approved.

## Rollback

Remove the Design consumer and its tests, restore the CR-017 delivery signatures and callers, and reactivate Contract Registry Release 2.7. No database rollback is required.
