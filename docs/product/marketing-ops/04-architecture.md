# Oplyra — Architecture

**Versão documental:** 0.2  
**Data:** 11 de setembro de 2026  
**Autoridade:** detalhamento do 00 v2.2, com decisões posteriores e regra de ancoragem em [ATUALIZACOES](ATUALIZACOES.md). Citar `DEC-0xx` apenas quando o identificador existir na v2.2. Propostas técnicas permanecem propostas.

## 1. Direção

A Oplyra será uma plataforma greenfield, SaaS multi-tenant, independente e comercializável. Código, banco, autenticação, infraestrutura, design system, observabilidade e deploy serão próprios.

## 2. Princípios arquiteturais

- DDD e Clean Architecture;
- ports/adapters para integrações;
- dependência do domínio apontando para dentro;
- fornecedores substituíveis;
- segurança e tenancy desde a fundação;
- observabilidade e auditoria como capacidades nativas;
- workflows assíncronos persistentes;
- idempotência;
- feature flags;
- FinOps de IA desde o MVP.

## 3. Visão de componentes

```text
UI / API
   |
Application Services
   |
Domain / Policies / Entitlements
   |
Ports
   +--> Billing Adapter --> Stripe
   +--> Ads Adapters --> Meta / Google
   +--> Email Adapter --> provedor pendente
   +--> CRM/Data Adapters --> APIs / webhooks / imports
   +--> Social Adapters --> provedores suportados
   +--> Asset Analysis Adapter --> transcrição / visão multimodal
   +--> AI Gateway / Router
              +--> OpenAI
              +--> Anthropic
              +--> outros futuros
```

## 4. Multi-tenancy

Requisitos:

- tenant obrigatório em entidades e operações relevantes;
- isolamento de banco e storage;
- credenciais por tenant;
- RBAC;
- suporte auditado e temporário;
- logs sem cruzamento de contexto;
- exportação e exclusão;
- consumo/custo por tenant.

## 5. Entitlements

Evitar regras como:

```text
if plan == "growth" ...
```

Preferir:

```text
entitlements.can(tenantId, "relationshipJourneys")
```

Limites devem ser configuráveis sem deploy.

## 6. Runtime de workflows

Crons não contêm inteligência de negócio. Um scheduler persistente deve iniciar workflows versionados que:

1. coletam contexto;
2. validam permissões/entitlements;
3. aplicam budget;
4. chamam agentes/ferramentas;
5. executam quality gates;
6. aguardam aprovação quando necessário;
7. persistem resultado e custo;
8. publicam eventos/relatórios.

## 7. AI Gateway

O domínio solicita capacidade, não modelo específico. O Gateway aplica routing policy, fallback, budget e provider health.

Componentes obrigatórios:

- Model Registry;
- Model Router;
- Eval Engine;
- Cost Ledger;
- action catalog;
- circuit breakers.

Detalhes: `13-ai-model-routing-finops.md`.

## 8. Billing

Stripe Billing e Stripe Payments serão usados inicialmente atrás de adapter próprio.

O domínio deverá conhecer conceitos próprios como Subscription, Plan, Entitlement, Usage Meter e Invoice, sem depender diretamente dos objetos internos da Stripe.

## 9. Imagens e mídia

- geração de imagem suportada;
- edição/adaptação de imagem suportada;
- ativos armazenados na biblioteca do tenant;
- custos registrados no Cost Ledger/catálogo econômico;
- vídeo não é gerado, editado nem renderizado; ativos de vídeo enviados são analisados por adapter multimodal, com derivados versionados no tenant.

## 10. Dados comerciais

A Oplyra não terá CRM próprio no MVP. Dados de contatos, leads, etapas, reuniões, propostas, contratos, receita, perdas e feedback serão recebidos por conectores, APIs, webhooks ou importações controladas.

## 11. Observabilidade

Medir:

- saúde de APIs e filas;
- latência;
- erros;
- retries;
- dead letters;
- consumo por tenant;
- custo por workflow;
- custo por ação aprovada;
- qualidade por modelo;
- margem por tenant.

## 12. Stack final

Supabase PostgreSQL, Auth e Storage com RLS são obrigatórios por CLAUDE e ADR-0001; Stripe pela decisão de billing registrada em [ATUALIZACOES](ATUALIZACOES.md). A stack complementar de ADR-0002 e os destinos de ADR-0005 continuam propostas condicionadas. O 00 não é a única fonte de diretrizes: ver ATUALIZACOES.
