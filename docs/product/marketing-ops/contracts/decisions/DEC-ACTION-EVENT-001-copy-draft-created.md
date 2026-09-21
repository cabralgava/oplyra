# DEC-ACTION-EVENT-001 — `copy.draft_created`

**Status:** `approved`  
**Approved at:** 2026-09-18  
**Scope:** first causal binding and payload policy for `copy.draft_created`

## Decision

For the first published version of the event contract:

1. a successful `create_copy_variants` completion emits `copy.draft_created` after the draft and its variants have been persisted;
2. a failed, rejected, cancelled or superseded action does not emit this event;
3. the payload carries persisted, versioned references rather than inline copy content;
4. the event envelope carries tenant, actor, trace and context; the payload does not duplicate those fields;
5. the first payload version accepts only `create_copy_variants` as `sourceAction`;
6. other Copywriting actions require an explicit compatible extension before they may emit this event under the same payload contract.

## Canonical payload fields

| Field | Required | Meaning |
|---|---:|---|
| `draftRef` | yes | Opaque reference to the persisted copy draft |
| `version` | yes | Persisted draft version, beginning at 1 |
| `sourceAction` | yes | Canonical action that created the draft; initially `create_copy_variants` |
| `variantRefs` | yes | Unique references to the persisted variants created by the action |
| `extensions` | no | Namespaced forward-compatible metadata |

The payload is the event `result`. It is validated separately from `transaction-envelope.schema.json`.

## Rationale

- Persisted references preserve auditability and version resolution.
- Avoiding inline content prevents duplicated copy bodies from diverging across event consumers.
- Restricting `sourceAction` to the only action with bound and tested schemas avoids claiming undocumented mappings for the other fourteen Copywriting actions.
- Keeping tenant and trace data in the envelope preserves the canonical transaction protocol.

## Consumer requirement

`design-agent` is the current registered consumer. Runtime dispatch must not be enabled until the consumer has an authorized, tenant-scoped resolution path for `draftRef` and `variantRefs`.

The resolver or retrieval action is not defined by this decision. This is an explicit implementation dependency, not evidence that such capability already exists.

## Compatibility

This decision adds a new event payload contract without altering the frozen event identity, producer or consumer list. Binding the schema in `events.json` requires a separate backward-compatible change proposal and a minor Events Registry version increment.

Adding another allowed `sourceAction` later is expected to be backward compatible for existing producers and consumers, but still requires compatibility assessment, fixtures and tests.

## Out of scope

- persistence implementation;
- reference resolver implementation;
- Events Registry binding;
- event dispatcher;
- retries and consumer deduplication storage;
- mappings for other Copywriting actions.
