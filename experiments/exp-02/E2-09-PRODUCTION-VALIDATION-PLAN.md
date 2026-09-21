# E2-09 — Plano de validação do ambiente futuro

**Status:** planejamento; nenhuma infraestrutura criada

## Objetivo

Preservar o resultado local como decisão de desenho e definir como o E2-09 deverá ser repetido quando a Oplyra entrar na etapa autorizada de criação de homologação/produção.

## Configuração inicial planejada

- PostgreSQL/Supabase com `pgmq` e `pg_cron` disponíveis;
- outbox transacional como fonte de verdade;
- um worker por fila;
- leitura/ack em lotes de até 500;
- aplicação e fila no mesmo banco somente enquanto os gates permanecerem atendidos;
- nenhuma ampliação automática de concorrência.

O plano não fixa agora tier comercial, região, fornecedor de worker ou quantidade final de CPU/memória. Esses parâmetros pertencem à futura decisão de ambiente e custo.

## Dataset de homologação

Usar somente dados sintéticos ou anonimizados autorizados, com no mínimo:

- 50 tenants;
- 100 campanhas por tenant;
- 90 dias de snapshots;
- valores ausentes e confiança `unavailable` preservados;
- rajada de 1.000 workflows e carga de 5.000 jobs/h.

## Consulta de referência

Dashboard tenant-scoped de campanhas, agregando 30 dias de gasto, impressões, cliques e conversões, com disponibilidade, confiança e freshness. A consulta e seus índices devem ser versionados junto ao teste.

## Critérios antes da ativação

- degradação do p95 agregado ≤20%;
- lag p95 da fila ≤60 s;
- nenhuma conexão esgotada ou lock pendente persistente;
- autovacuum acompanha o churn da fila;
- crescimento e retenção cabem no orçamento de storage;
- 0 efeitos duplicados e 0 mensagens perdidas;
- toda rodada individual acima de 20% é investigada, mesmo quando o agregado passa.

## Decisões após o teste futuro

- passou: manter banco compartilhado com os limites de concorrência medidos;
- falhou por capacidade: ajustar o tamanho candidato e repetir;
- falhou novamente: separar o transporte do banco da aplicação, preservando a outbox.

## Proibições nesta fase

- não criar projeto Supabase remoto;
- não contratar tier ou add-on;
- não provisionar worker, scheduler ou fila gerenciada;
- não ativar poller/daemon;
- não usar dados reais de clientes.
