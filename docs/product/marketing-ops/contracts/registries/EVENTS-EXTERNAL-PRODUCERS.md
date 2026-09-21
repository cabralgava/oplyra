# Oplyra Events Registry — External Producers v1

**Status:** validated

Todo evento consumido por um agente possui producer canônico registrado.

## Eventos e produtores externos

- `agent.escalation_requested` → `runtime:agent-runtime`
- `approval.granted` → `service:approval-service`
- `approval.rejected` → `service:approval-service`
- `asset.analysis_completed` → `service:asset-processing-service`
- `asset.created` → `service:asset-service`
- `campaign.brief_approved` → `service:campaign-service`
- `campaign.completed` → `service:campaign-service`
- `campaign.created` → `service:campaign-service`
- `campaign.updated` → `service:campaign-service`
- `consent.revoked` → `service:consent-service`
- `contact.unsubscribed` → `service:consent-service`
- `contact.updated` → `service:contact-service`
- `content.published` → `service:content-service`
- `context.updated` → `service:context-service`
- `context_update.proposed` → `service:context-update-service`
- `contract.won` → `integration:commercial-adapter`
- `crm.data_updated` → `integration:crm-adapter`
- `experiment.approved` → `service:experiment-service`
- `experiment.completed` → `service:experiment-service`
- `experiment.ready_for_review` → `service:experiment-service`
- `integration.degraded` → `service:integration-health-service`
- `integration.failed` → `service:integration-health-service`
- `integration.recovered` → `service:integration-health-service`
- `lead.created` → `integration:commercial-adapter`
- `lead.qualified` → `integration:commercial-adapter`
- `meeting.scheduled` → `integration:commercial-adapter`
- `opportunity.created` → `integration:commercial-adapter`
- `opportunity.lost` → `integration:commercial-adapter`
- `proposal.created` → `integration:commercial-adapter`
- `revenue.recorded` → `integration:billing-adapter`
- `runtime.dead_lettered` → `runtime:event-runtime`
- `schedule.reporting_due` → `scheduler:scheduler`
- `scope.changed` → `service:initiative-service`
- `task.created` → `service:task-service`
- `task.failed` → `service:task-service`
- `touchpoint.recorded` → `integration:touchpoint-ingestion`

## Decisões de ownership

- `task.created` → `service:task-service`. Orchestrator e Account & Projects podem iniciar a criação, mas o serviço publica o evento canônico.
- `agent.escalation_requested` → `runtime:agent-runtime`.
- `content.published` → `service:content-service`.
- `context_update.proposed` → `service:context-update-service`.
- `scope.changed` → `service:initiative-service`.
- `runtime.dead_lettered` → `runtime:event-runtime`; the Orchestrator consumes the durable escalation only after explicit runtime activation.

## Regra

Nenhum evento consumido pode permanecer sem producer. Eventos agent-originated sem consumidor agentic são permitidos quando destinados a runtime, UI, audit ou consumidores futuros.
