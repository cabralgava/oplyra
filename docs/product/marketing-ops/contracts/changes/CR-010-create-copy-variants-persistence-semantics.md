# CR-010 — Reconcile create_copy_variants persistence semantics

**Status:** `approved_and_applied`  
**Classification:** `behavioral_breaking`  
**Issued at:** 2026-09-21T14:06:00Z  
**Base:** Contract Registry Release 1.9 / Actions Registry 1.1  
**Target:** Contract Registry Release 2.0 / Actions Registry 2.0

## Blocking conflict

`DEC-ACTION-EVENT-001-copy-draft-created` requires a successful `create_copy_variants` completion to persist the draft and its variants before emitting `copy.draft_created`.

Actions Registry 1.1 still classified the same action as:

- `sideEffect: false`;
- `sideEffectType: null`;
- `requiresIdempotency: false`.

Implementing a write transaction under those fields would make critical behavior implicit in runtime and would contradict the frozen side-effect and idempotency policy.

## Approved reconciliation

For `create_copy_variants` only:

- `sideEffect`: `false → true`;
- `sideEffectType`: `null → internal`;
- `requiresIdempotency`: `false → true`.

No action identity, owner, domain, caller, plan, risk, approval policy, input schema or output schema changes.

The valid command fixture now includes:

```json
{
  "idempotency": {
    "key": "task_copy_01-create-copy-variants-v1"
  }
}
```

The former command shape without `idempotency.key` is retained as an explicit invalid business-invariant fixture.

## Compatibility and migration

This is **behaviorally breaking** even though the JSON Schemas remain unchanged. A caller that previously submitted `create_copy_variants` without `idempotency.key` must migrate before the write runtime is enabled.

Consequently:

- Actions Registry receives a major bump from `1.1` to `2.0`;
- Contract Registry Release receives a major bump from `1.9` to `2.0`;
- the future writer must reject a missing key before any persistence;
- a duplicate completed key must return the canonical persisted result instead of inserting another draft;
- reuse of the same key with a materially different request must fail with a canonical conflict rather than overwrite data.

## Validation

- action identity and schema binding preserved;
- side-effect/idempotency invariant restored;
- valid and invalid transaction fixtures added to executable contract tests;
- no other action changed;
- no runtime write, outbox row or dispatch was enabled in this change.

Exact test counts and artifact hashes are recorded in Contract Registry manifest v2.0.

## Explicitly unresolved

- The retention period for idempotency records is not defined by existing contracts. The first implementation will retain records without automatic expiry until a governed retention policy exists.
- The canonical conflict code for reusing a key with a different request is not explicitly defined. `CONFLICT_VERSION` is not assumed to cover this case; the writer remains blocked until error mapping is decided.
- ADR-0004 transport technology remains conditional on EXP-02. CR-010 does not select pgmq, pg_cron or an external queue.
- Event dispatch and consumer deduplication remain disabled.

## Next permitted increment

Resolve the idempotency-conflict error mapping, then implement the tenant-scoped `create_copy_variants` write transaction with atomic persistence and an outbox-ready record. Do not dispatch the event yet.

## Rollback

Restore Actions Registry 1.1, restore the command fixture without idempotency, restore the previous contract test and make Contract Registry Release 1.9 active again. The future write runtime must remain disabled after rollback.

