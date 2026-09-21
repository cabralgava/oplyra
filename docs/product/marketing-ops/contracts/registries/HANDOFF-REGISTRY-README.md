# Oplyra Handoff Registry — v1

**Status:** validated

O `handoffs.json` registra os pares canônicos de transferência de trabalho entre os 12 agentes.

## Regras congeladas

```text
fromAgent != toAgent
tenant match obrigatório
trace propagation obrigatória
pair precisa estar registrado
agents precisam existir em agents.json
```

## Labels compostos normalizados

Os Markdown possuíam alguns headings com mais de um destino:

```text
Lifecycle → Revenue Intelligence / Performance
Paid Media → Orchestrator / Account
Performance → Orchestrator / Paid Media
```

Esses headings foram decompostos em pares independentes no registry.

`Reporting → Delivery` não virou handoff agentic, pois delivery externo é uma execução por tool/service, não transferência para outro agente.

## Binding com actions

`allowedActions` permanece vazio nesta primeira passada.

Na etapa de cross-registry binding, os pares serão ligados às actions canônicas de `actions.json`.
