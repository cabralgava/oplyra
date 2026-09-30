# Oplyra — AI Model Routing & FinOps

**Versão documental:** 0.5
**Data:** 30 de setembro de 2026
**Autoridade:** detalhamento do 00 v2.3, com decisões posteriores e regra de ancoragem em [ATUALIZACOES](ATUALIZACOES.md). Citar `DEC-0xx` apenas quando o identificador existir na v2.3. Propostas técnicas permanecem propostas.

**Status:** requisito de arquitetura e economia do MVP

## 1. Tese

A Oplyra será **multiagente, multimodelo e multiprovedor**. OpenRouter é o gateway inicial padrão, por adapter próprio e sem exclusividade. Os modelos subjacentes podem ser fornecidos por OpenAI, Anthropic, Google ou outros provedores elegíveis; nenhum workflow depende estruturalmente do OpenRouter, de um laboratório ou de um modelo específico.

A política padrão será:

> **selecionar o modelo de menor custo que ultrapasse consistentemente o quality threshold do workflow.**

## 1.1 Limite do Product AI Model Harness

O Product AI Model Harness é a infraestrutura que resolve qual provider/model executará uma chamada de IA do Product Agent Runtime. Não é o Developer / AI Harness e não se reduz a uma integração com fornecedor.

```text
Product Agent
  → Model Profile / requisitos da task/action
  → AI Model Router
  → Provider Port
  → Provider Adapter
  → OpenRouter Adapter (padrão inicial) | provider direto | Test Adapter
  → Resolved Model
```

Context7, Playwright, Git, shell, pnpm e Supabase CLI permanecem no Developer Harness e não entram no Product Agent Tool Registry.

## 1.2 Status contratual

Registry, Router, Eval Engine, Cost Ledger e OpenRouter como gateway inicial padrão não exclusivo são diretrizes aprovadas de arquitetura. **Estado aplicado:** o registry canônico de Model Profiles (1.0; 1.1 desde o CR-027), os schemas de Model Profile (1.0 e 1.1), de pedido, resposta, catálogo, Model Call e do Cost Ledger e o Error Registry (1.4, depois 1.5) são canônicos desde as Contract Registry Releases 2.16 e 2.17 (CR-026 e CR-027). Os vínculos produtivos entre perfis e modelos e os valores de temperatura e demais parâmetros dependem do EXP-05; adapters reais (OpenRouter ou diretos) não estão implementados. Qualquer novo schema, registry, campo em agent definition, action, event ou error é **PROPOSED — requires controlled contract change** e deve respeitar o Freeze v1 e o manifest da Contract Registry vigente antes de implementação.

**Implementação local (29/09/2026):** o primeiro slice do I-02 implementa portas, Test Adapter, Registry, Profiles por `agent + action`, Router e o caso de uso `invokeModel` (Product AI Model Harness, slice 1), inicialmente como tipos internos e depois com contratos canônicos pelo CR-026; ver [AI-MODEL-HARNESS](../../harness/AI-MODEL-HARNESS.md). O [CR-026](contracts/changes/CR-026-product-ai-model-harness-contracts.md) foi aprovado pelo proprietário em 29/09/2026 e aplicado na Contract Registry Release 2.16: Error Registry 1.4, registry canônico de Model Profiles, schemas de pedido, resposta, catálogo, perfil e Model Call, e Context Package 1.1 (ver [AI-MODEL-HARNESS-CONTRACTS](contracts/AI-MODEL-HARNESS-CONTRACTS.md)). Catálogo de modelos, tarifas e disponibilidade seguem como configuração operacional fora do freeze. O [CR-027](contracts/changes/CR-027-persistent-cost-ledger.md), aprovado em 29/09/2026 e aplicado na Release 2.17, implementa o **Cost Ledger persistente somente no Supabase local** (schema `finops`, aquisição idempotente, fechamento atômico com o Model Call Record, conciliação e isolamento por tenant; ver [COST-LEDGER-CONTRACTS](contracts/COST-LEDGER-CONTRACTS.md)). **Continuam pendentes ou não autorizados:** Product Agent Runtime, filas e scheduler de produto, integração Stripe, adapters reais (OpenRouter ou diretos), conta, chave, créditos, chamadas pagas, saída visual, chave produtiva de fingerprint e produção.

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

O agent não escolhe livremente provider/model. A resolução é declarativa e determinística: políticas de budget, entitlement, allowlist, elegibilidade de dados e restrições do tenant não são delegadas ao LLM. Implementado no harness local para allowlist, capabilities, privacidade e orçamento; a integração completa ao runtime de produto permanece pendente.

### 2.3 AI Eval Engine

Avaliar `ação × modelo × prompt version` por:

- qualidade;
- factualidade;
- Brand OS;
- schema adherence;
- instruction adherence;
- quality gate adherence;
- evidências;
- seleção de ferramentas;
- taxa de alucinação;
- sucesso;
- reprovação;
- retries;
- latência;
- uso de tokens/unidades;
- custo bruto;
- custo por sucesso;
- regressões;
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

### 2.5 Model Profiles — contrato implementado; valores produtivos propostos (EXP-05)

**Estado:** contratos, schemas e registry de Model Profiles são canônicos desde a Release 2.16 (CR-026; 1.1 no CR-027) e o Router os aplica no harness local com Test Adapter. Os vínculos produtivos a modelos e os valores de sampling continuam propostos e condicionados ao EXP-05.

Um agent pode possuir perfil padrão, sem espalhar model IDs em prompts/código. Cada action existente pode refinar os requisitos; o vínculo de routing é `agent + action`, não apenas o agente, e não cria actions novas:

```text
global policy
  → agent profile
  → task/action requirement
  → tenant policy
  → entitlement
  → budget
  → runtime availability
  → resolved provider/model
```

Um perfil deve representar identidade e versão, `agentKey`, `actionKey`, capability requirements, gateway, modelos preferenciais/permitidos/proibidos, provider allowlist, fallback order, temperatura e demais sampling parameters, limite de output, reasoning, structured output, tool calling, multimodalidade, context window, latency class, cost/budget class, quality tier, política de dados/ZDR, retry, fallback e evaluation policy. Nomes ilustrativos de perfis não são canônicos até change proposal e validação.

Temperatura não é propriedade permanente da identidade do agente. O perfil padrão pode oferecer um valor inicial, mas a action prevalece. O adapter deve validar suporte do modelo/provedor e nunca fingir que parâmetro ignorado foi aplicado.

### 2.5.1 Hipóteses iniciais de sampling — EXP-05

Faixas abaixo são **PROPOSED**, servem para iniciar os experimentos e não selecionam modelo nem autorizam chamada paga:

| Agent | Perfil predominante | Temperatura inicial |
| --- | --- | ---: |
| `orchestrator-agent` | coordenação estruturada e tool selection | 0,1–0,2 |
| `strategy-quality-agent` | julgamento e quality gate | 0,0–0,2 |
| `account-projects-agent` | planejamento operacional | 0,2–0,3 |
| `copywriting-agent` | geração criativa; revisão usa override menor | 0,6–0,8 |
| `design-agent` | direção criativa/multimodal; geração de imagem usa rota própria | 0,5–0,7 |
| `paid-media-agent` | análise e recomendação controlada | 0,1–0,3 |
| `performance-intelligence-agent` | análise quantitativa e síntese | 0,0–0,2 |
| `reporting-checkins-agent` | narrativa factual e concisa | 0,2–0,4 |
| `social-media-agent` | criação e adaptação por canal | 0,6–0,8 |
| `email-marketing-agent` | criação persuasiva com constraints | 0,5–0,7 |
| `lifecycle-agent` | desenho de jornada e decisão | 0,2–0,4 |
| `revenue-intelligence-agent` | análise conservadora de receita/atribuição | 0,0–0,2 |

Schema adherence, fatos, permissions, budgets, cálculos e decisões críticas continuam determinísticos; aumentar temperatura nunca reduz quality gate ou aprovação.

### 2.6 Provider Ports e Adapters

As políticas/casos de uso dependem de portas internas; SDKs, DTOs e erros de fornecedor são traduzidos na borda. O desenho preserva, sem obrigar a implementação de todos:

```text
AI Model Router
├── OpenRouter Adapter (padrão inicial)
├── OpenAI Direct Adapter
├── Anthropic Direct Adapter
├── Google Direct Adapter
└── Local/Test Adapter
```

OpenRouter é o gateway inicial padrão por adapter, sem exclusividade. `AI Model Harness != OpenRouter integration`. Agents e casos de uso não importam seus conceitos específicos; adapters diretos continuam possíveis como estratégia de continuidade, custo, privacidade ou capacidade.

O AI Model Router da Oplyra mantém autoridade sobre elegibilidade, `agent + action`, budget, privacy, allowlists e fallback entre modelos. O OpenRouter pode fazer failover entre endpoints elegíveis do mesmo modelo, desde que a configuração preserve as restrições e devolva o provider/model realmente usados. Fallback entre modelos não é irrestrito: cada tentativa deve ser permitida pela política versionada e registrada no Ledger.

Metadados de resposta como request/generation ID, provider resolvido, model, timestamps e usage pertencem ao Model Call/Cost Ledger. Não são configuração do agente.

`google/gemma-3-27b-it:free` entra somente como candidato `experimental` de sandbox/EXP-05. O sufixo `:free`, tarifa zero observada ou disponibilidade momentânea não autorizam produção, dados reais ou fallback; rate limit, qualidade, tool calling, structured output e política de dados devem ser medidos. Nenhum modelo gratuito é baseline comercial até aprovação posterior.

### 2.7 Test Adapter

Um adapter local determinístico deve permitir unit, integration, contract, workflow e routing tests sem chamada paga nem provider remoto. É o padrão de desenvolvimento local e CI. Suítes via OpenRouter ou provider real ficam explicitamente separadas, com conta, chave, autorização, budget, dados sintéticos e evidência próprios.

### 2.8 Referências operacionais do gateway

Fontes externas verificadas em 29/09/2026, usadas apenas para orientar o adapter e os experimentos; não substituem contratos nem decisões da Oplyra:

- [OpenRouter — Quickstart](https://openrouter.ai/docs/quickstart): API unificada e roteamento entre modelos;
- [OpenRouter — Model fallbacks](https://openrouter.ai/docs/guides/routing/model-fallbacks): comportamento de fallback entre modelos;
- [OpenRouter — Guardrails](https://openrouter.ai/docs/guides/features/guardrails/overview): budgets e allowlists de modelos/provedores;
- [OpenRouter — Request parameters](https://openrouter.ai/docs/api/reference/parameters): parâmetros como temperatura, tools e structured output;
- [OpenRouter — Sovereign AI e data policies](https://openrouter.ai/docs/guides/get-started/sovereign-ai): roteamento e restrições por política de dados;
- [OpenRouter — Gemma 3 27B IT Free](https://openrouter.ai/google/gemma-3-27b-it:free) e [FAQ](https://openrouter.ai/docs/faq): evidência datada para tratá-lo somente como candidato experimental gratuito, sujeito a disponibilidade e limites.

Capacidades, disponibilidade, termos, limites e tarifas são temporais. O Registry deve registrar a data da evidência e a rodada EXP-05 deve revalidá-los antes de qualquer seleção.

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

Fallback por indisponibilidade e escalonamento por qualidade são políticas distintas. Todo fallback revalida capability, data policy, tenant isolation, provider/model allowlists, entitlement, budget e disponibilidade. Não pode aumentar custo sem limite, relaxar segurança ou transformar falha crítica em sucesso aparente. Sem candidato compatível, produzir falha estruturada/escalonamento auditável. A governança de fallback (revalidação, limites e falha estruturada) está implementada e testada no harness local com Test Adapter; o fallback com provider real permanece pendente.

```text
preferred compatible model
  → unavailable/failure
  → compatible fallback
  → failure
  → compatible fallback
  → structured failure / escalation
```

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

## 12.1 Observabilidade de routing e chamadas

Quando aplicável, correlacionar `transactionId`, `correlationId`, `causationId`, `workflowId`, `taskId`, `tenantId`, agent/agentVersion, modelProfile, resolvedModel, provider, routingReason, fallbackOccurred, attempt, latency, usage e cost. Não registrar prompt body, resposta, PII ou conteúdo sensível indiscriminadamente; aplicar minimização, classificação, retenção e redaction na origem.

O Cost Ledger deve permitir análise por tenant, agent/version, workflow, task, AI run, model profile, resolved model, provider, input/output usage e custo estimado/apurado quando disponível. Cache, datasets e resultados de eval permanecem isolados por tenant quando contiverem contexto do tenant. O Cost Ledger persistente existe hoje somente no Supabase local (schema `finops`, CR-027); a integração produtiva permanece pendente.

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
