# EXP-02 — Resultado consolidado

**Status:** aprovado com notas após revisão e repetição de E2-09  
**Executado em:** 21/09/2026  
**Ambiente:** Supabase local da Oplyra, dados exclusivamente sintéticos  
**Versões:** pgmq 1.5.1; pg_cron 1.6.4

## Decisão

A hipótese `pgmq` + `pg_cron` + tabelas próprias de execução foi aprovada para o **desenho do MVP**, sem criar ou ativar ambiente de produção.

E2-01 a E2-08 e E2-10 já estavam aprovados. E2-09 foi revisto porque a primeira consulta usada como proxy da aplicação era uma leitura indexada submilissegundo de 50 linhas. A variação de poucos décimos de milissegundo dominava o percentual e não representava dashboard/check-in da Oplyra.

A repetição substituiu esse proxy por uma consulta tenant-scoped sobre campanhas e snapshots de métricas, coerente com os documentos 05, 06 e 15.

## E2-09 revisado

Dataset sintético:

- 50 tenants;
- 100 campanhas por tenant;
- 90 dias de snapshots;
- 450.000 snapshots de métricas;
- valores `null` e confiança `unavailable` preservados, sem conversão para zero.

Consulta representativa:

- dashboard de campanhas ativas/pausadas de um tenant;
- agregação de gasto, impressões, cliques e conversões dos últimos 30 dias;
- contagem de pontos indisponíveis, confiança disponível mais restritiva e freshness;
- agrupamento e ordenação das 20 campanhas de maior gasto.

Resultado de cinco rodadas pareadas:

| Métrica | Resultado |
| --- | ---: |
| Amostras baseline | 1.500 |
| Amostras sob carga | 1.500 |
| p95 baseline | 1,417 ms |
| p95 sob carga | 1,600 ms |
| Degradação agregada | **12,92%** |
| Limite | 20% |
| Conexões observadas | 13 |
| Locks pendentes | 0 |
| CPU do container | 0,14%–71,50% |
| Memória máxima | 248,5 MiB / 7,746 GiB |

Degradações por rodada: −2,68%, 2,82%, −7,89%, 37,27% e 9,13%. O critério normativo é o p95 agregado; a rodada de 37,27% permanece registrada como nota de variância e exige observabilidade/revalidação antes de aumentar concorrência.

## E2-01 correlato

- cinco rodadas × 6.000 jobs;
- um worker, lote de 500;
- lag p95: 0,172 s;
- throughput observado: 14.724,5 jobs/s no ensaio local;
- crescimento: 185,69 bytes/job;
- 12.000 tuplas mortas antes do vacuum e 0 depois.

## Resultado dos gates

| Gate | Resultado |
| --- | --- |
| E2-01 | aprovado |
| E2-02 | aprovado |
| E2-03 | aprovado |
| E2-04 | aprovado |
| E2-05 | aprovado |
| E2-06 | aprovado |
| E2-07 | aprovado |
| E2-08 | aprovado com limite explícito |
| E2-09 | aprovado após revisão metodológica |
| E2-10 | aprovado |

## Interpretação do resultado anterior

O resultado anterior de 23,95% não foi apagado nem reclassificado como erro de execução. Ele continua válido para o proxy submilissegundo utilizado naquela rodada. A revisão concluiu que esse proxy não representava a consulta típica exigida por E2-09. Todas as evidências anteriores permanecem no diretório.

## Guardrails aprovados para planejamento

- iniciar com um worker por fila e lote máximo de 500;
- manter outbox transacional como fonte de verdade;
- mensagens com entrega ao menos uma vez exigem idempotência e fencing;
- aumentar workers, lote ou volume exige repetir E2-01/E2-09;
- o ambiente futuro deve observar CPU, conexões, locks, lag, crescimento e autovacuum;
- antes de ativar produção, repetir E2-09 no ambiente de homologação equivalente ao tamanho contratado;
- nenhum resultado local autoriza provisionamento, deploy ou ativação automática.

## Limitações

- Não foi criado ambiente de produção ou homologação externo.
- Os números são locais e sintéticos; servem para decisão de desenho.
- O scheduler não aguardou 30 horas ou um mês civil real.
- Uma das cinco rodadas revisadas excedeu 20%, embora o p95 agregado tenha passado.
- Retry policy, evento de escalonamento de dead-letter, poller e composition root continuam pendentes.

## Evidências principais

- `evidencias/e2-09-reteste-planejamento.json` — repetição estruturada;
- `evidencias/e2-09-reteste-planejamento.txt` — resumo da repetição;
- `evidencias/cpu-e2-09-reteste-planejamento.txt` — CPU/memória correlatas;
- `evidencias/execucao-completa.json` — execução integral anterior, preservada;
- demais evidências — iterações e reprovações preservadas.
