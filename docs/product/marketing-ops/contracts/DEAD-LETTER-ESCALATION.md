# Dead-letter Escalation Contract v1

**Status:** `approved`  
**Event:** `runtime.dead_lettered`  
**Payload version:** `1.0`  
**Runtime activation:** `prohibited`

## Purpose

`runtime.dead_lettered` is the canonical durable fact that an event delivery reached terminal dead-letter state and requires operational escalation. It is not an agent-authored request and therefore does not reuse `agent.escalation_requested`, `operational_escalation.requested` or `human_escalation.requested`.

## Ownership and routing

- canonical producer: `runtime:event-runtime`;
- canonical consumer: `orchestrator-agent`;
- category: `runtime`;
- durability: `durable`;
- self-consumption: prohibited.

The producer records the terminal runtime fact. The Orchestrator coordinates the human-visible operational response but cannot silently retry or approve reprocessing.

## Causal rule

The event may be produced only after the corresponding outbox record is durably transitioned to `dead_lettered`. The future implementation must persist the terminal state and publish its escalation atomically or through a transactional derivative that cannot lose the escalation.

Two terminal reasons are contracted:

- `retry_exhausted`: the fifth delivery failed, `terminalErrorCode` is `RETRY_ATTEMPTS_EXHAUSTED`, and the root cause retains the last retryable error;
- `non_retryable_failure`: a deterministic or terminal error immediately caused dead-letter, and the root cause is non-retryable.

## Provenance

The payload requires a stable dead-letter reference, original event transaction, original event key, target consumer, attempt, terminal reason, terminal error, root cause and terminal timestamp. Tenant, workflow, task, correlation and causation stay in the transaction envelope and are not duplicated in the payload.

Evidence references are optional, but any provided references must be non-empty and unique. The root cause cannot be replaced by the generic exhaustion code.

## Reprocessing

Automatic reprocessing is prohibited. A future manual reprocessing command must:

1. preserve the link to the original transaction and dead-letter record;
2. revalidate tenant membership, authorization, autonomy, entitlement, consent, budget and approval when applicable;
3. receive a new idempotency identity;
4. create an auditable causation link;
5. never mutate the historical dead-letter fact into success.

That command is not defined by this release.

## Directly validated references

- Agent Transaction Protocol section 52;
- harness requirement to record dead-letter and escalation after retry exhaustion;
- Events Registry 1.2;
- Errors Registry 1.3;
- Outbox Retry and Failure Policy v1;
- payload schema, fixtures and executable contract tests.

## References not directly validated

The following remain explicit implementation gaps:

1. atomic persistence/emission linkage;
2. runtime publisher;
3. Orchestrator escalation consumer;
4. human notification channel, ownership rota and response SLA;
5. authorized manual reprocessing command and audit workflow.

No zero-gap claim is made. The identity and payload contract are complete; emission and operational handling are not implemented.
