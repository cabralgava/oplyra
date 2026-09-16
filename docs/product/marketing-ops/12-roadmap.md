# Oplyra — Roadmap

**Versão documental:** 0.2  
**Data:** 11 de setembro de 2026  
**Autoridade:** detalhamento do 00 v2.2, com decisões posteriores e regra de ancoragem em [ATUALIZACOES](ATUALIZACOES.md). Citar `DEC-0xx` apenas quando o identificador existir na v2.2. Propostas técnicas permanecem propostas.

## Fase 0 — Discovery

- entrevistas;
- validação dos planos;
- jornada;
- linguagem ubíqua;
- bounded contexts;
- custos;
- integrações;
- protótipos;
- arquitetura greenfield;
- catálogo/contratos/autonomia de agentes;
- benchmarks iniciais de modelos;
- catálogo econômico v0.1.

**Gate:** aprovação antes de migrations estruturais.

## Fase 1 — Fundação SaaS

- autenticação;
- tenants/memberships;
- RBAC;
- planos/entitlements;
- Stripe Billing/Payments via adapter;
- feature flags;
- auditoria;
- onboarding básico;
- filas/scheduler;
- observabilidade;
- runtime de agentes;
- prompt versioning;
- Model Registry;
- Router;
- Cost Ledger;
- budgets/circuit breakers.

## Fase 2 — Performance MVP

- estratégia;
- campanhas;
- projetos/tarefas;
- copy;
- ativos;
- geração/edição de imagens;
- aprovações;
- Meta/Google read-only;
- dashboard;
- check-ins;
- Orquestrador;
- Account;
- Copywriting;
- Mídia;
- Estratégia & Qualidade;
- Design para geração/edição de imagens;
- Eval Engine inicial e benchmarks dos workflows prioritários, incluindo imagens;
- API de eventos/conversões comerciais;
- telemetria de custo por ação.

## Fase 3 — Performance operacional

- recomendações;
- alertas;
- rascunhos;
- atribuição básica;
- experimentos;
- Account digital refinado;
- Performance & Intelligence;
- relatórios agendados;
- escalonamento humano;
- evals contínuos e recalibração de modelos/limites.

## Fase 4 — Growth MVP

- agenda editorial;
- social media;
- e-mail;
- segmentos;
- réguas;
- automações;
- n8n;
- relatórios cross-channel;
- agentes Social, E-mail, Lifecycle e Revenue Intelligence;
- limite inicial de 25.000 e-mails/mês.

## Fase 5 — Comercialização

- onboarding self-service;
- templates SaaS B2B;
- documentação;
- suporte;
- billing completo;
- trial;
- métricas de produto;
- primeiros clientes beta;
- revisão de COGS real e definição final de pricing.

## Fase 6 — Escala

- novos conectores;
- parceiros/agências;
- white-label;
- marketplace de templates;
- automação controlada de mídia;
- novos segmentos.

## Fora do roadmap inicial

- geração, edição ou renderização nativa de vídeo; a análise de vídeo enviado pelo cliente está no escopo;
- CRM próprio;
- autonomia irrestrita de orçamento/publicação.

## 1. Relação entre fases e incrementos

As fases acima preservam a direção do produto. I-01 a I-09 são a proposta de decomposição, com aceite em [15](15-test-plan.md#6-critérios-de-aceite-por-incremento); não são um roadmap concorrente nem aprovação em bloco.

## 2. Sequência proposta

### 2.1 Incrementos e dependências

| Incremento | Fase | Entrega e dependências |
| --- | --- | --- |
| I-01 | 1 | Identidade, tenants, RLS, Storage e entitlements básicos; EXP-01 antes das tabelas definitivas. |
| I-02 | 1 | Filas/runtime, Registry, Router, Cost Ledger, budgets e integração Stripe em teste; depende de I-01 e EXP-02. Fundação não concluída sem Stripe. |
| I-03 | 2 | Brand OS e onboarding; depende de I-01. |
| I-04 | 2 | Estratégia, campanhas e tarefas; depende de I-03. |
| I-05 | 2 | Copy, Design para imagens, ativos, revisão e aprovação; Eval Engine inicial e EXP-05; depende de I-02/I-04. |
| I-06 | 2 | Mídia somente leitura; depende de I-02/I-04 e acessos da trilha T-B. |
| I-07 | 2 | Eventos comerciais e ingestão de ativos enviados, incluindo vídeo, com transcrição, resumo e derivados textuais; depende de I-01/I-02 e dos agentes de I-05 para os derivados; pode avançar antes de acessos de mídia. Ativação depende do provedor e dos limites pendentes. |
| I-08 | 2 | Dashboard e check-in; depende de I-06/I-07 para fontes completas, com indisponibilidade explícita quando parcial. |
| I-09 | 2 | Planejamento pelo Orquestrador com aceite humano; depende das capacidades anteriores. |

A arquitetura do Orquestrador começa na fundação; sua interface de planejamento é incremental. Análises aprofundadas de Performance seguem na Fase 3. Imagens não esperam a Fase 3.

## 3. Trilhas complementares

- T-A: entrevistas SaaS B2B e validação de UX/valor (02 §4).
- T-B: acessos e aprovação das integrações de mídia (06 §11.2).
- T-C: dados, contratos e revisão jurídica (07 §5).

## 4. Escopo proposto do I-01 local

### 4.1 Pré-requisitos

Decisão de stack e aprovação explícita do incremento, com EXP-01 delimitado. Não criar serviços remotos por consequência dessa aprovação.

### 4.2 Incluído

Supabase local com dados sintéticos; EXP-01; Auth, tenants/memberships, RLS/Storage; entitlements básicos; interfaces de administração delimitadas conforme ADR-0008; checks de isolamento. Critérios detalhados em 15 §6, I-01.

### 4.3 Fora deste incremento

Cobrança real, deploy, dados de pilotos e APIs pagas. Integração Stripe em teste e runtime entram em I-02, ainda na Fase 1. Uso produtivo depende dos gates correspondentes.
