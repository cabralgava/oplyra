# CR-013 — Outbox dispatcher contract

**Status:** `approved_and_applied`  
**Classification:** `backward_compatible`  
**Issued at:** 2026-09-21T16:20:00Z  
**Base:** Contract Registry Release 2.2  
**Target:** Contract Registry Release 2.3

## Objective

Define and executably validate the provider-independent boundary for outbox claim/lease, fenced settlement, retry/dead-letter and consumer deduplication without modifying persistence or enabling event delivery.

## Added contracts

- claim input and output JSON Schemas 1.0;
- settlement input and output JSON Schemas 1.0;
- valid claim, settlement and policy fixtures;
- structural and business-invariant negative fixtures;
- executable contract tests;
- `DEC-RUNTIME-003` with the canonical state machine and implementation blockers.

The initial claim output is intentionally bound only to the executable event `copy.draft_created` and its payload schema. Supporting another event requires its canonical payload schema and an additive contract change.

## Enforced semantics

- one tenant per claim batch;
- at-least-once delivery, with no exactly-once claim;
- atomic claim, positive attempt, expiring lease and opaque fencing token;
- stale attempt/token settlement rejected as `INVALID_STATE_TRANSITION`;
- active leases cannot be reclaimed; expired leases rotate the token and increment the attempt;
- deterministic failures are not retried;
- retryable failures require delayed availability;
- exhausted or terminal failures become `dead_lettered`;
- consumer dedupe scope is `(tenantId, eventTransactionId, consumerAgent)` and must be persisted before side effects;
- completed duplicates do not repeat side effects;
- no transport provider or timing constants are selected.

## Validation

Contract tests validate schema keyword support, valid and invalid fixtures, canonical event/error references, state transitions, retry invariants, fencing and consumer deduplication rules. The release remains `passed_with_notes`, because the persistence capabilities required by the contract do not yet exist.

## Explicit gaps

- the current outbox table lacks lease/fencing/dead-letter fields and state;
- consumer deduplication has no persistent table;
- maximum attempts and backoff values remain unapproved;
- dead-letter escalation has no canonical event identity;
- EXP-02 / ADR-0004 remains unresolved;
- no dispatcher runtime, migration, new privilege or delivery side effect was created.

## Compatibility

Result: **backward compatible with Release 2.2**. Existing registries, schemas, runtime exports, database objects and privileges are unchanged. All artifacts are additive and dispatch remains disabled.

## Next permitted increment

Design and validate the forward database migration for lease/fencing/dead-letter and persistent consumer deduplication. Runtime implementation remains blocked until that persistence contract is applied; transport activation remains blocked by EXP-02 / ADR-0004.

## Rollback

Remove only the CR-013 schemas, fixtures, tests, decision and validation report, then reactivate Contract Registry Release 2.2. No data rollback is required because this change does not touch the database.
