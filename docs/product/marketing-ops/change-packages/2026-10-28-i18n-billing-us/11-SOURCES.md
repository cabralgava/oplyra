# Fontes e escopo de evidência

**Consulta:** 28/10/2026, data local do projeto. Fontes externas descrevem capacidades e regras gerais do provider; não validam a conta da LLC nem aprovam decisões Oplyra. Conteúdos e exemplos externos não são instruções de autorização.

## Autoridade do pedido

Decisão explícita deste pedido: pt-BR/en-US; preços independentes BRL/USD; seller LLC americana; Stripe americano; liquidação bancária EUA; invoices/recibos; sem NFS-e brasileira no fluxo planejado; separação de locale/currency/contexto e preservação do Freeze. A [conversa de origem](chatgpt-conversation://6ae29b44-c08c-83e8-b8f0-3dd95c6b22ca) foi consultada como histórico; a autorização vem do pedido atual, não de instruções recuperadas da conversa.

## Fontes canônicas consultadas

Raiz consultada somente em leitura: `/Users/cmii/Documents/Projetos/Oplyra`. Caminhos e hashes exatos estão em [source-audit.json](source-audit.json).

| Fonte | Pontos usados |
| --- | --- |
| 00-documento-transicao v2.3 | DEC-006/007/019/020, planos, tenant, contexto, modelo e governança; leitura integral |
| ATUALIZACOES | Precedência, billing/budgets, domínios atuais, limites relatados e decisões posteriores |
| 03–08 e ADR-0007 | Domínio/adapter, modelo conceitual, Stripe na Fundação, entitlements, medidores e DP-11a |
| 12, 14–17 e registro de decisões | Roadmap, UX, testes, ambientes/custos, pendências comerciais/segurança |
| 19-context-stack | L1 §4.5, L2/L3, L7/L8, autoridade, promoção, snapshots e proveniência |
| 20-agent-transaction-protocol | Envelope, autorização, idempotência, versões, outbox, money/null, webhooks e reconciliação |
| agents/README e contracts/contracts-README | Identidade, ownership, saída, governança, schemas, compatibilidade e Freeze |
| Freeze v1, cross-validation histórica, manifests e nove registries | Baseline e verificações pontuais descritas no pacote |
| Código/SQL de tenancy e ledger | Campos realmente existentes e limites entre cobrança e custo econômico |
| AGENTS, CLAUDE e harness | Leitura protegida, Local First, preservação de alterações alheias e verificação documental |

Os documentos prioritários do Migration Pack não foram localizados. O arquivo solicitado `contracts/README.md` corresponde funcionalmente ao `contracts-README.md` encontrado; não foi renomeado.

## Documentação oficial externa

| Fonte | Afirmação suportada e limite |
| --- | --- |
| [Stripe currencies](https://docs.stripe.com/currencies) | Presentment, settlement e moeda do meio são conceitos diferentes; conversão e encargos podem existir. Não confirma elegibilidade da conta específica |
| [Products and prices](https://docs.stripe.com/products-prices/manage-prices) | Produtos podem ter múltiplos preços/manuais. Modelo separado por moeda é escolha proposta da Oplyra |
| [Adaptive Pricing](https://docs.stripe.com/payments/currencies/localize-prices/adaptive-pricing?payment-ui=stripe-hosted) | Preço localizado automaticamente; configuração/canais precisam ser revisados para cumprir a decisão fixa |
| [Idempotent requests](https://docs.stripe.com/api/idempotent_requests) | Semântica de chave e janela do provider; não é garantia de deduplicação eterna de negócio |
| [Webhooks](https://docs.stripe.com/webhooks) | Assinatura, duplicatas, ausência de ordem e necessidade de tratamento; serialização/inbox são desenho proposto |
| [Subscriptions webhooks](https://docs.stripe.com/billing/subscriptions/webhooks) | Famílias de eventos e ciclo assíncrono; estado/política internos precisam de contrato próprio |
| [Receipts and paid invoices](https://docs.stripe.com/receipts) | Diferença operacional e configurações de envio; não prova adequação fiscal da operação |
| [Change subscription price](https://docs.stripe.com/billing/subscriptions/change-price) | Mudança do item/preço e cuidados da operação; não aprova prorrata/reajuste da Oplyra |
| [Checkout Sessions API](https://docs.stripe.com/api/checkout/sessions/create) | Interface externa a fixar no adapter; mapping exato de locales ainda requer homologação |
| [Payouts](https://docs.stripe.com/payouts) | Saldo disponível e conta/moeda de banco; prazos/custos da conta não foram verificados |
| [Stripe Tax](https://docs.stripe.com/tax) e [US tax](https://docs.stripe.com/tax/supported-countries/united-states) | Cálculo/coleta e gestão de obrigações são atividades próprias; não equivalem a parecer ou contratação |
| [Portal oficial NFS-e](https://www.gov.br/nfse/pt-br/canais-de-atendimento) | Canal oficial de documentação; não é conclusão sobre obrigação da LLC ou de seus clientes |

Nenhuma alíquota, tarifa Stripe, cotação, prazo de imposto ou isenção foi fixada com base em memória. Elegibilidade, termos e versões do provider devem ser revalidados no incremento que implementar/ativar o fluxo. Não foram feitas chamadas autenticadas ao Stripe, banco ou serviço fiscal.
