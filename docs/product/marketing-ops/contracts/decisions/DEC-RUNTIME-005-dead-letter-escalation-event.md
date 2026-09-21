# DEC-RUNTIME-005 — Dead-letter escalation event

**Status:** `approved`  
**Approved at:** 2026-09-21  
**Scope:** canonical identity, ownership and payload for dead-letter escalation

## Decision

Create `runtime.dead_lettered` as the canonical durable event for a terminal outbox delivery. `runtime:event-runtime` is its single producer and `orchestrator-agent` is its canonical consumer.

The event is emitted only after a durable `dead_lettered` transition. Its payload preserves the original event transaction, event key, consumer, attempt, terminal reason, terminal code, last root cause and timestamp. Tenant and trace fields remain in the canonical transaction envelope.

## Identity isolation

The existing events have different semantics:

- `agent.escalation_requested` represents an agent-runtime escalation;
- `operational_escalation.requested` is produced by Account & Projects;
- `human_escalation.requested` is produced by the Orchestrator.

Reusing any of them would either violate single canonical producer ownership or erase the distinction between a recorded terminal runtime fact and a later human escalation workflow.

## Safety

`runtime.dead_lettered` does not authorize retry. Reprocessing remains manual, requires authorization revalidation, preserves the source link and must create a new audited transaction.

## Compatibility

Adding a new event and binding its initial payload is backward compatible. Events Registry advances from 1.1 to 1.2. No event is renamed, removed, reclassified or assigned a different producer.

## Implementation boundary

This decision authorizes contracts and tests only. It does not authorize publisher/consumer implementation, database migration, recurring scheduling, notification integration, environment creation or runtime activation.
