# Oplyra — Data Model

**Versão documental:** 0.2  
**Data:** 11 de setembro de 2026  
**Autoridade:** detalhamento do 00 v2.2, com decisões posteriores e regra de ancoragem em [ATUALIZACOES](ATUALIZACOES.md). Citar `DEC-0xx` apenas quando o identificador existir na v2.2. Propostas técnicas permanecem propostas.

**Status:** conceitual; não criar migrations antes da aprovação do discovery e DDD

## 1. Regras gerais

- IDs internos próprios;
- `tenantId` em todas as entidades isoladas por cliente;
- timestamps auditáveis;
- versionamento para objetos de configuração relevantes;
- referências externas separadas de IDs internos;
- soft delete/retention somente após política de dados definida;
- dados sensíveis minimizados.

## 2. Identity & Tenancy

Entidades conceituais:

- tenants;
- users;
- memberships;
- roles;
- permissions.

Campos mínimos do tenant:

```json
{
  "id": "uuid",
  "name": "string",
  "slug": "string",
  "status": "trial|active|past_due|suspended|cancelled",
  "planId": "performance|growth|custom",
  "timezone": "America/Sao_Paulo",
  "locale": "pt-BR",
  "currency": "BRL",
  "brandProfileId": "uuid|null",
  "subscriptionId": "uuid|null"
}
```

## 3. Subscription

- plans;
- entitlements;
- subscriptions;
- usageMeters;
- invoices;
- addOns;
- budgetPolicies.

A integração Stripe deve armazenar identificadores externos em campos próprios, sem usar IDs da Stripe como identidade de domínio.

## 4. Brand

- brandProfiles;
- brandVersions;
- products;
- personas;
- messageFrameworks.

Brand OS deve suportar voz, claims permitidos/proibidos, evidências e checklist de aprovação.

## 5. Strategy & Work

- objectives;
- kpis;
- campaigns;
- experiments;
- projects;
- tasks;
- comments;
- approvals;
- risks;
- decisions.

## 6. Content & Assets

- contents;
- contentVersions;
- contentRelations;
- assets;
- evidence;
- imageGenerationRuns;
- imageEditRuns;
- assetIngestions;
- assetTranscripts;
- assetInsights.

Campos de mídia devem identificar tipo, origem, versão, permissões de uso, campanha e custo quando aplicável.

Vídeo não possui entidades de geração ou renderização. Ativos de vídeo enviados usam as entidades de ingestão, transcrição e insight acima, que herdam tenant, permissões e retenção do ativo de origem e registram provedor, duração ou volume processado e custo.

## 7. Paid Media

- adAccounts;
- externalCampaigns;
- externalAds;
- metricSnapshots;
- recommendations.

## 8. Email & Automation — Growth

- senderProfiles;
- emailTemplates;
- emailCampaigns;
- emailDeliveries;
- emailEvents;
- suppressions;
- automations;
- automationVersions;
- enrollments;
- executions.

## 9. Agentic Operations

- agentDefinitions;
- agentVersions;
- agentRuns;
- agentMessages;
- agentEvaluations;
- agentToolCalls;
- agentSchedules;
- agentMemories;
- humanEscalations.

Contrato conceitual canônico de `agentRun` (detalha o exemplo do 00 §13.1):

```json
{
  "id": "uuid",
  "tenantId": "uuid",
  "agentDefinitionId": "uuid",
  "agentVersion": "string",
  "workflowId": "uuid",
  "workflowVersion": "string",
  "parentRunId": "uuid|null",
  "taskId": "uuid|null",
  "trigger": "user|event|schedule|agent",
  "status": "queued|running|waiting_approval|completed|failed|cancelled",
  "input": {},
  "structuredOutput": {},
  "evidence": [],
  "provider": "string|null",
  "model": "string|null",
  "routingPolicy": "string",
  "promptVersion": "string",
  "reasoningEffort": "string|null",
  "tokenUsage": {
    "input": 0,
    "cachedInput": 0,
    "output": 0,
    "reasoning": null
  },
  "toolCalls": 0,
  "retryCount": 0,
  "estimatedCost": null,
  "finalCost": null,
  "costCurrency": "USD",
  "costStatus": "pending|estimated|reconciled",
  "qualityScore": null,
  "successful": false,
  "modelCallIds": [],
  "costLedgerEntryIds": [],
  "startedAt": "ISO-8601",
  "finishedAt": "ISO-8601|null"
}
```

`null` significa desconhecido ou não aplicável, nunca custo zero. Provider/model resumem a última chamada; chamadas e tentativas completas ficam vinculadas por modelCallIds, com custos no Ledger de 13. Uma execução pode usar múltiplos modelos. Não somar o resumo com seus lançamentos, evitando duplicidade. Workflow e Agent Run possuem ciclos distintos: `waiting_human` do workflow não é um status adicional implícito de agentRun.

## 10. AI Routing & FinOps

Entidades candidatas:

- aiProviders;
- aiModels;
- aiModelPrices;
- routingPolicies;
- workflowQualityThresholds;
- aiEvalSuites;
- aiEvalRuns;
- aiEvalResults;
- aiCostLedgerEntries;
- aiActionCatalog;
- aiActionCostStats;
- aiBudgets;
- aiUsageAlerts.

O Cost Ledger deve registrar custo de texto/raciocínio, ferramentas cobradas, imagens, retries e outros custos diretamente atribuíveis ao workflow.

## 11. Integrations & Analytics

- connections;
- credentials;
- webhooks;
- syncRuns;
- deadLetters;
- touchpoints;
- attributionResults;
- reports;
- auditLogs.

## 12. Índices/constraints a validar posteriormente

- unicidade de slug por tenant/contexto;
- idempotency keys;
- external IDs por connection;
- constraints de tenant isolation;
- integridade de versões ativas;
- índices temporais para métricas e ledger.
