# ADR-0004 — Filas e scheduler no PostgreSQL (pgmq + pg_cron)

**Status:** aprovada para desenho do MVP após revisão de E2-09 (DP-04) — 21/09/2026

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

## Decisão de desenho

- Mensagens em pgmq gravadas na mesma transação do estado.
- Estado durável em `workflow_runs` e `workflow_steps`, com lease, fencing por `attempt` e checkpoints.
- Outbox para eventos de domínio.
- `pg_cron` apenas materializa ocorrências únicas e enfileira.
- Worker Node.js de longa duração.
- Porta `JobQueue` substituível.
- A configuração mais conservadora testada usou um worker por fila e leitura/ack em lotes de 500.
- O experimento exercitou máximo de cinco entregas, backoff exponencial, erro determinístico sem retry e efeito externo incerto em `waiting_human`/reconciliação; esses valores ainda não são contrato runtime aprovado.
- A aprovação define arquitetura para implementação. Não autoriza criar ambiente remoto, contratar recursos, publicar worker ou ativar execução recorrente.

## EXP-02 executado

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

**Resultado final consolidado:** 10/10 gates aprovados após revisão metodológica de E2-09. Evidência completa em [`experiments/exp-02/RESULTADO.md`](../../experiments/exp-02/RESULTADO.md).

Métricas decisivas:

- cinco rodadas × 6.000 jobs/50 tenants: lag p95 0,172 s com um worker;
- E2-09 revisado: 50 tenants, 5.000 campanhas e 450.000 snapshots;
- p95 agregado da consulta representativa: 1,417 ms → 1,600 ms, degradação de 12,92% (**limite: 20%**);
- 0 efeitos duplicados, 0 mensagens perdidas e 0 locks pendentes;
- CPU do container até 71,50%, 13 conexões observadas;
- crescimento de 185,69 bytes/job; vacuum concluiu sem tuplas mortas pendentes.

Os critérios requeridos eram:

- 0 efeitos duplicados e 0 mensagens perdidas.
- Retomada ≤ 3 min após queda.
- Nenhum reenvio automático de efeito incerto.
- Lag p95 ≤ 60 s na rajada.
- Degradação ≤ 20% no p95 das consultas da aplicação, sem esgotar conexões.

## Consequências e alternativa

- `pgmq`/`pg_cron` são a escolha de desenho para o MVP; a outbox transacional continua como fonte de verdade.
- A primeira medição reprovada foi preservada: seu proxy submilissegundo não representava a consulta típica do produto e apresentou alta variância percentual.
- A aprovação permanece condicionada a repetir E2-09 em homologação equivalente antes da ativação de produção.
- Um worker e lote 500 são limites iniciais; qualquer ampliação exige nova evidência.
- Nenhum runtime recorrente ou ambiente externo foi ativado por esta decisão.
- **Falha funcional:** corrigir ou adotar pg-boss e repetir.
- **Falha por disputa de recursos:** ajustar computação e concorrência. Persistindo, separar o transporte de mensagens do banco da aplicação, mantendo a outbox transacional como fonte de verdade.

## Escopo afetado

`agent-operations`, `integrations`, `commercial-signals`, `reporting`, worker.

## Evidências e referências

FX-01 e FX-03 em [02-discovery](../product/marketing-ops/02-discovery.md) §9; [09-agentic-architecture](../product/marketing-ops/09-agentic-architecture.md) §7 e §11; [resultado do EXP-02](../../experiments/exp-02/RESULTADO.md).

## Responsável pela decisão

Responsável pelo projeto.

## Aprovação

Aprovada para desenho do MVP em 21/09/2026 após repetição de E2-09 com consulta representativa. Provisionamento e ativação permanecem fora de escopo.

## Substitui / é substituída por

—
