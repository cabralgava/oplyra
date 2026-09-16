# ADR-0004 — Filas e scheduler no PostgreSQL (pgmq + pg_cron)

**Status:** proposta **condicionada ao EXP-02** — não aprovada (DP-04)

## Contexto e problema

Agentes, sincronizações, normalização de eventos e check-ins precisam de:

- execução assíncrona e agendamento persistente;
- idempotência e retentativas limitadas;
- dead-letter.

Falhas entre persistir o estado e enfileirar precisam ser recuperáveis ([PRODUTO.md](../harness/PRODUTO.md)). A fila não pode prejudicar as consultas da aplicação no mesmo banco.

## Alternativas consideradas

| Alternativa | Avaliação |
| --- | --- |
| **pgmq (Supabase Queues) + pg_cron + tabelas próprias** | Enfileiramento na mesma transação do estado; nativo do Supabase; retentativa e dead-letter implementados pela Oplyra. **Risco: disputa de recursos com a aplicação** |
| pg-boss / Graphile Worker | Recursos prontos; schema gerido pela biblioteca, que exige adaptação às migrations e ao menor privilégio; mesma disputa de recursos |
| Fila gerenciada externa (ex.: Cloud Tasks/Pub/Sub) + outbox no banco | Separa a carga do banco; novo fornecedor e ponto de falha; entrega ao menos uma vez continua exigindo idempotência |
| Inngest / Trigger.dev / Temporal | Execução durável pronta; fornecedor ou operação adicionais desproporcionais ao MVP |
| Edge Functions como consumidores | Limite de 400 s de tempo de relógio (FX-01) |

## Proposta sob teste

- Mensagens em pgmq gravadas na mesma transação do estado.
- Estado durável em `workflow_runs` e `workflow_steps`, com lease, fencing por `attempt` e checkpoints.
- Outbox para eventos de domínio.
- `pg_cron` apenas materializa ocorrências únicas e enfileira.
- Worker Node.js de longa duração.
- Porta `JobQueue` substituível.

## Experimento obrigatório (EXP-02)

Cenários em [18-technical-experiments](../product/marketing-ops/18-technical-experiments.md):

- carga;
- duplicação;
- concorrência e lease;
- retentativas;
- recuperação após queda;
- efeito externo incerto;
- enfileiramento transacional;
- scheduler (ticks concorrentes, fuso, misfire);
- **disputa de recursos com as consultas da aplicação**;
- mensagem envenenada.

**Critérios:**

- 0 efeitos duplicados e 0 mensagens perdidas.
- Retomada ≤ 3 min após queda.
- Nenhum reenvio automático de efeito incerto.
- Lag p95 ≤ 60 s na rajada.
- Degradação ≤ 20% no p95 das consultas da aplicação, sem esgotar conexões.

## Consequências e alternativa

- **Falha funcional:** corrigir ou adotar pg-boss e repetir.
- **Falha por disputa de recursos:** ajustar computação e concorrência. Persistindo, separar o transporte de mensagens do banco da aplicação, mantendo a outbox transacional como fonte de verdade.

## Escopo afetado

`agent-operations`, `integrations`, `commercial-signals`, `reporting`, worker.

## Evidências e referências

FX-01 e FX-03 em [02-discovery](../product/marketing-ops/02-discovery.md) §9; [09-agentic-architecture](../product/marketing-ops/09-agentic-architecture.md) §7 e §11.

## Responsável pela decisão

Responsável pelo projeto (pendente).

## Aprovação

Pendente; decisão só após o EXP-02, no início do I-02.

## Substitui / é substituída por

—
