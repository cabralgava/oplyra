# ADR-0007 — Entitlements e Stripe na Fundação SaaS

**Status:** Stripe e a integração na Fundação são diretrizes vigentes, registradas em [ATUALIZACOES](../product/marketing-ops/ATUALIZACOES.md) §2; não possuem identificador DEC na referência v2.2. Detalhes de implementação, provisionamento manual e cobrança de pilotos permanecem propostas/decisões abertas.

## Contexto e decisão vigente

DEC-006 exige capacidades configuráveis; a decisão de billing registrada em ATUALIZACOES escolhe Stripe e fixa os budgets internos de referência. A proposta antiga de adiar o fornecedor e a integração para a Fase 5 foi superada por essa decisão. Não reabrir seleção de provedor.

## Proposta de implementação

- Identidades internas de Subscription, Plan, Entitlement e Usage Meter, desacopladas dos IDs externos Stripe.
- I-01: entitlements básicos. I-02, ainda na Fase 1: integração Stripe Billing/Payments em modo teste, webhooks com assinatura, deduplicação, conciliação e tratamento de eventos fora de ordem.
- Capacidade no backend, reserva atômica, liquidação, overrides com motivo/autor/validade e auditoria. Consumo comercial e custo econômico são separados conforme 08.
- Provisionamento manual auditado pode coexistir para pilotos; não substitui a integração Stripe nem define cobrança real.
- referenceScope fora do catálogo persistido permanece DP-25; não transformar dado histórico em lógica comercial.

## DP-11a — Decisão comercial ainda aberta

Definir se e quando cobrar pilotos, preços, trial, inadimplência, cancelamento e excedentes. Até essa decisão e autorização de operação, somente testes/fakes no escopo de implementação aprovado. Nenhuma cobrança real é autorizada pela correção documental.

A Fase 5 amplia self-service e operação comercial. NFS-e, meios de pagamento locais e obrigações fiscais não são capacidades presumidas de Stripe nem escopo já aprovado.

## Alternativas

Usar Stripe como fonte direta de todas as capacidades foi descartado por acoplamento. Adiar sua integração até a Fase 5 foi substituído pela decisão de billing e pelo roadmap vigente. Mantém-se adapter próprio com fake local e integração de teste antes dos pilotos.

## Referências e aprovação

[08](../product/marketing-ops/08-billing-entitlements.md), [12](../product/marketing-ops/12-roadmap.md), [ADR-0008](ADR-0008-autorizacao-rbac-por-vinculo.md), [decisões](README.md). Responsável: usuário do projeto. Diretrizes de fornecedor/fase aprovadas; proposta técnica e ativação de cobrança pendentes. ID preservado para rastreabilidade.
