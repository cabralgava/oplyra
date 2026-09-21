# CR-003 — Bind `copy.draft_created` payload schema

**Status:** `approved_and_applied`  
**Classification:** `backward_compatible`  
**Issued at:** 2026-09-21T12:42:14Z  
**Base:** Contract Registry Release 1.2 / Events Registry 1.0  
**Target:** Contract Registry Release 1.3 / Events Registry 1.1

## Objective

Bind the approved payload schema to the canonical event `copy.draft_created`, without changing its identity, producer, consumers, category, durability or self-consumption policy.

## Approved changes

In `docs/product/marketing-ops/contracts/registries/events.json`:

- `registryVersion`: `1.0 → 1.1`;
- `copy.draft_created.payloadSchemaStatus`: `pending_event_schema → bound`;
- `copy.draft_created.payloadSchema`: `null → ../schemas/events/copywriting/copy-draft-created.payload.schema.json`.

`schemaVersion` remains `1.0`, because the shape of the Events Registry did not change.

The registry-level `generatedAt` was renewed. No other event entry was modified.

## Contract decision

`DEC-ACTION-EVENT-001` establishes the initial causal policy:

- a successfully persisted `create_copy_variants` result emits `copy.draft_created`;
- the payload carries persisted and versioned references;
- the first payload version accepts only `create_copy_variants` as `sourceAction`;
- tenant, actor, trace and context remain in the transaction envelope.

## Compatibility assessment

Result: **backward compatible**.

- no canonical event was added, removed or renamed;
- producer and consumer ownership remain unchanged;
- no previously valid payload is rejected because the event had no published payload schema;
- consumers gain a resolvable, versioned contract;
- the Events Registry shape remains at schema version 1.0;
- the registry receives a minor version increment because a published binding was added.

## Validation evidence

- 136 event identities preserved;
- exactly one event entry changed;
- only `payloadSchemaStatus` and `payloadSchema` changed inside that entry;
- payload schema path resolves from `contracts/registries/`;
- schema hash matches its validation report;
- 15/15 payload schema checks passed;
- 1 event payload schema bound and 135 still pending;
- Freeze v1 and releases 1.1/1.2 remain unchanged.

## Runtime boundary

Runtime dispatch remains out of scope. Before `design-agent` consumes this event, an authorized tenant-scoped resolver for `draftRef` and `variantRefs` must exist. This dependency is explicit and remains unimplemented.

## Migration strategy

1. save the decision and payload schema artifacts;
2. replace `events.json` with Events Registry 1.1;
3. replace `events.validation.json` with its 1.1 validation;
4. add `contract-registry-manifest-v1.3.json` without modifying previous manifests;
5. configure future loaders to resolve the payload schema path relative to `contracts/registries/`.

## Rollback

Restore `events.json` and `events.validation.json` from Release 1.2 and make manifest v1.2 active again. Do not delete or modify the Freeze v1 baseline.

## Explicitly unvalidated references

- `docs/product/marketing-ops/contracts/README.md` does not exist under that exact name; the canonical repository file is `contracts-README.md`.
- `docs/product/marketing-ops/OPLYRA-MIGRATION-PACK/06-OPEN-ITEMS.md` is absent from the current repository; the synchronized project mirror was historical support only.
