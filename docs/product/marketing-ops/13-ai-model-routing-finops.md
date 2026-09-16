# Oplyra — AI Model Routing & FinOps

**Versão documental:** 0.2  
**Data:** 11 de setembro de 2026  
**Autoridade:** detalhamento do 00 v2.2, com decisões posteriores e regra de ancoragem em [ATUALIZACOES](ATUALIZACOES.md). Citar `DEC-0xx` apenas quando o identificador existir na v2.2. Propostas técnicas permanecem propostas.

**Status:** requisito de arquitetura e economia do MVP

## 1. Tese

A Oplyra será **multiagente, multimodelo e multiprovedor**. OpenAI e Anthropic são provedores iniciais candidatos, mas nenhum workflow deve depender estruturalmente de um fornecedor ou modelo específico.

A política padrão será:

> **selecionar o modelo de menor custo que ultrapasse consistentemente o quality threshold do workflow.**

## 2. Componentes

### 2.1 AI Model Registry

Registrar:

- provider;
- model ID;
- capacidades;
- limites de contexto;
- preços vigentes;
- cache/batch/tools/structured output;
- latência observada;
- disponibilidade;
- data de atualização;
- status `active|degraded|disabled|experimental`.

Preços de fornecedor não devem ser hardcoded no domínio.

### 2.2 AI Model Router / Gateway

Entrada conceitual:

```json
{
  "tenantId": "uuid",
  "workflowKey": "string",
  "agentKey": "string",
  "capability": "classification|generation|analysis|strategy|quality_gate|image_generation|image_edit|asset_analysis|other",
  "qualityThreshold": 0.0,
  "maxCost": 0.0,
  "maxLatencyMs": 0,
  "riskLevel": "low|medium|high|critical",
  "routingPolicy": "lowest_cost_above_threshold",
  "fallbackPolicy": "string"
}
```

### 2.3 AI Eval Engine

Avaliar `ação × modelo × prompt version` por:

- qualidade;
- factualidade;
- Brand OS;
- schema adherence;
- evidências;
- sucesso;
- reprovação;
- retries;
- latência;
- custo bruto;
- custo por sucesso;
- estabilidade.

### 2.4 AI Cost Ledger

Registrar por execução:

- tenant;
- workflow;
- agente;
- provider/model;
- prompt version;
- effort/reasoning quando aplicável;
- input/cache/output/reasoning usage quando fornecido;
- tool calls cobradas;
- imagem gerada/editada;
- retries;
- custo estimado/final;
- latência;
- quality result;
- sucesso/falha.

## 3. Métrica principal

```text
Effective Cost per Successful Action =
(custo de execuções + retries + revisões + ferramentas cobradas)
/ ações aprovadas com sucesso
```

O modelo mais barato por chamada não é necessariamente o mais barato por entrega aprovada.

## 4. Progressive escalation

Exemplo conceitual:

```text
modelo econômico
   ↓
quality/confidence suficiente?
   ├─ sim → concluir
   └─ não → modelo intermediário
               ↓
          suficiente?
             ├─ sim → concluir
             └─ não → modelo avançado
```

Modelos avançados devem ser reservados para tarefas cuja qualidade/risco justifique o custo.

## 5. Regras determinísticas

Não usar LLM quando código/regra determinística resolver com segurança:

- schemas;
- campos obrigatórios;
- cálculos;
- limites;
- permissões;
- UTMs;
- links;
- idempotência;
- políticas de budget.

## 6. Imagens

Criação e edição de imagens entram no mesmo sistema econômico:

- provider/model registrado;
- custo por render;
- custo por edição;
- tentativas até aprovação;
- custo efetivo da imagem aprovada;
- limites por plano.

Franquias de imagens: [08](08-billing-entitlements.md#4-limites-mensais-iniciais).

Vídeo não é gerado nem editado. A análise de vídeo enviado é uma modalidade própria do Registry, com custo por ativo ou por volume processado registrado no Ledger; seus limites permanecem pendentes.

## 7. E-mail e custos não-LLM

O Cost Ledger/COGS por tenant deve incorporar, quando atribuível:

- envio de e-mail;
- storage;
- APIs cobradas;
- ferramentas externas cobradas;
- custos variáveis de imagem;
- outros custos diretamente ligados ao workflow.

Growth inclui inicialmente 25.000 e-mails/mês.

## 8. Budgets por plano

Fonte canônica: [08](08-billing-entitlements.md#3-budgets-econômicos-internos). Cálculo, custos não-LLM e limitações em [17](17-risks-costs.md#2-baseline-econômico-reconstruído). Reservar e medir custo acumulado por tenant e workflow; não duplicar estes totais nos documentos derivados.

## 9. Action Catalog inicial

O catálogo deverá incluir pelo menos:

- classificar lead;
- analisar feedback;
- gerar copy;
- revisar copy;
- quality gate;
- gerar imagem;
- editar/adaptar imagem;
- analisar ativo enviado, incluindo transcrição de vídeo;
- analisar mídia;
- gerar check-in;
- criar plano de campanha;
- planejamento estratégico;
- campanha de e-mail;
- construir/otimizar jornada Lifecycle;
- análise Revenue/cross-channel;
- decisão assistida de automação.

Para cada ação armazenar p50, p90 e p95 de custo e latência.

## 10. Benchmarks

Tabela mínima a preencher com dados reais:

| Workflow | Modelo | Quality | Success | Avg cost | Cost/success | p95 cost | Latency | Status |
|---|---|---:|---:|---:|---:|---:|---:|---|
| copy | TBD | TBD | TBD | TBD | TBD | TBD | TBD | experimental |
| paid-media-analysis | TBD | TBD | TBD | TBD | TBD | TBD | TBD | experimental |
| weekly-checkin | TBD | TBD | TBD | TBD | TBD | TBD | TBD | experimental |
| strategic-plan | TBD | TBD | TBD | TBD | TBD | TBD | TBD | experimental |
| quality-gate | TBD | TBD | TBD | TBD | TBD | TBD | TBD | experimental |
| image-generation | TBD | TBD | TBD | TBD | TBD | TBD | TBD | experimental |
| image-edit | TBD | TBD | TBD | TBD | TBD | TBD | TBD | experimental |

Nenhum vencedor deverá ser definido por preferência subjetiva do fornecedor.

## 11. Créditos/capacidade comercial

O cliente não verá tokens de fornecedor como unidade principal.

Possíveis abstrações:

- créditos Oplyra;
- capacidade mensal;
- franquias por tipo de ação.

Os pesos deverão ser lastreados no Action Catalog e recalibráveis sem mudança de código de domínio.

## 12. Proteções obrigatórias antes do beta pago

1. telemetria por tenant/workflow/agente/modelo/provedor;
2. max cost por workflow;
3. max turns/tokens/tool calls/retries;
4. timeout;
5. circuit breaker;
6. provider/model kill switch;
7. alertas de anomalia;
8. painel interno de consumo;
9. quality thresholds;
10. benchmarks dos principais workflows;
11. política de fallback/escalonamento;
12. mecanismos de limite/excedente.

## 13. Relação com pricing

O pricing final deverá partir de:

```text
receita do tenant
- COGS IA
- imagens
- e-mail
- infraestrutura variável
- APIs pagas
- taxas de pagamento
- impostos
- suporte/serviço atribuível
= margem de contribuição
```

Stripe será o provedor inicial de billing/pagamentos, mas suas taxas não consomem os budgets operacionais de US$ 40/85; serão consideradas na formação do preço final.

## 14. Contratos e contabilização

| Componente | Contrato mínimo |
| --- | --- |
| Registry | modelId interno, provider/model/version, modalidades, limites, elegibilidade de dados, tarifas por unidade/moeda/vigência, referências de eval, disponibilidade e kill switch. Credenciais ficam fora do catálogo. |
| Router | Request de §2.2 + policyVersion, deadline e reservationId; resultado registra modelo escolhido, motivo, alternativas tentadas e versão da tarifa. Todas as tentativas, inclusive fallback, revalidam budget, privacidade e qualidade. |
| Eval Engine | suiteId/version, datasetVersion, workflow/prompt/model/policy, métricas, falhas, custo, latência, amostra humana e decisão. Matriz comparável por modalidade; modelo sem imagem não participa de rota visual. |
| Model Call | callId, runId, tenantId, tentativa, provider/model, requestId externo quando disponível, modalidade, quantidade/tokens, timestamps e estado. |
| Cost Ledger | entryId idempotente, callId/actionId, tenant/workflow/agente, provider/model/tarifa, moeda, estimativa, custo apurado ou pendente, unidade/quantidade, causa (produção/retry/revisão), conciliação e correções auditáveis. |
| Reserva | Checagem atômica nos escopos workflow/tenant/plataforma, soma de subexecuções, saldo disponível e liquidação. Custo incerto não vira zero nem libera reserva automaticamente. |

Agent Run canônico em [05](05-data-model.md#9-agentic-operations); não duplicar seu schema. Ledger contém todas as tentativas cobradas, incluindo falhas, renders e revisões. Somar lançamentos, não somar outra vez resumos de Agent Run. Para ação sem nenhum sucesso, cost/success é indefinido; reportar custo perdido e quantidade de falhas, nunca zero.

Tarifas são dados versionados; configuração sem tarifa ou limite válido impede novas chamadas pagas. Custos externos podem superar estimativas: conciliar diferenças, interromper novas chamadas se necessário e registrar alerta. O guardrail limita exposição, não garante matematicamente o valor da fatura.

## 15. Limites por workflow — proposta DP-32

Valores iniciais propostos para sandbox/evals, não custos unitários nem autorização de gasto. Reavaliar no EXP-05; menor limite entre workflow, saldo reservado do tenant e teto da rodada sempre prevalece. O custo cobre a árvore inteira (produção, revisão, retries e subexecuções).

| Workflow | USD máximo | Chamadas de modelo totais | Tokens totais texto (entrada + saída) | Tool calls | Retries técnicos por chamada | Delegações | Tempo ativo máximo (s) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Classificar/decisão simples | 0,02 | 2 | 8.000 | 2 | 1 | 0 | 30 |
| Copy + revisão | 1,00 | 6 | 150.000 | 8 | 1 | 2 | 180 |
| Análise de uma conta | 0,50 | 4 | 100.000 | 8 | 1 | 1 | 180 |
| Check-in até duas contas | 2,00 | 8 | 250.000 | 12 | 1 | 3 | 360 |
| Plano estratégico | 3,00 | 8 | 300.000 | 12 | 1 | 4 | 480 |
| Geração de uma imagem | 0,30 | 2 | 12.000 | 2 | 1 | 0 | 180 |
| Edição de uma imagem | 0,40 | 2 | 12.000 | 2 | 1 | 0 | 180 |

Tokens de imagem/renders usam unidades próprias na tarifa; o teto em USD inclui ambos. Cada chamada ao modelo, inclusive retry ou juiz, conta no total. Espera humana fica persistida fora do tempo ativo e requer revalidar autorização/saldo ao retomar. Rotas Growth exigem configuração específica antes de ativação, sem herdar defaults ilimitados. Workflow determinístico executa sem LLM.

Os máximos protegem cada execução; multiplicá-los pelas franquias não demonstra viabilidade mensal. Sem medição de distribuição e taxa de retrabalho, não prometer uso integral das franquias dentro do COGS.
