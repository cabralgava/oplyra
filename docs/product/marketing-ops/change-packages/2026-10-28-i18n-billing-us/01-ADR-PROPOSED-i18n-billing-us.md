# ADR proposto para internacionalização e billing pela LLC americana

**Status:** decisão de negócio aprovada; desenho de implementação proposto. **Autoridade:** pedido explícito do proprietário em 28/10/2026 e conversa referenciada “Analisar idioma e pagamento”. **Destino:** `docs/decisions/ADR-<próximo número livre>-i18n-pricing-billing-us.md`, após atribuição pelo índice. Nenhum novo DEC da referência v2.3 é criado.

## Contexto e problema

A Oplyra já define Performance/Growth por capacidades, Stripe por adapter, entitlements internos e contexto L0–L8. Os documentos de billing mantêm preço e condições comerciais em aberto. A implementação local de tenancy usa `locale` com padrão `pt-BR`, sem um modelo operacional completo de moeda/assinatura. Usar esse campo para escolher preço, contexto da marca e apresentação ao mesmo tempo criaria efeitos financeiros implícitos e erros de isolamento.

## Decisões aprovadas

1. Lançamento com interface, páginas e comunicações em `pt-BR` e `en-US`, respeitando o recorte funcional do Performance MVP.
2. Cada plano terá preços explícitos e independentes em BRL e USD. Equivalência comercial aproximada pode orientar revisão humana; não existe vínculo automático à cotação.
3. Oplyra LLC dos EUA é a vendedora. Stripe da LLC processa assinaturas, invoices e recibos comerciais. Banco de destino nos EUA, com liquidação em USD como configuração alvo a confirmar na conta.
4. Não integrar emissão de NFS-e brasileira no fluxo planejado. Essa exclusão de escopo não é conclusão de inexistência de obrigações tributárias no Brasil ou nos EUA.
5. Separar locale, billing currency e tenant context, mantendo idempotência, entitlement e auditoria como controles estruturais.

## Modelo proposto e fronteiras

| Componente | Responsabilidade | Limite |
| --- | --- | --- |
| Identity & Tenancy existente | Tenant, membership, acesso, locale padrão e timezone | Não inferir moeda de assinatura pelo país/idioma |
| Subscription & Entitlements existente | Plan, PriceVersion proposto, Subscription, direitos e período | Não importar SDK Stripe ou deixar cliente arbitrar valores |
| Preferências de apresentação | Locale da pessoa/sessão, tradução de labels e formatos | Não reescrever moeda dos dados nem mudar contrato financeiro |
| Context Assembly existente | Selecionar idioma de entrega e evidências L1/L2/L5/L7/L8 | Não promover preferência de sessão a verdade de marca |
| Billing adapter | Mapear objetos/estados externos, autenticar webhooks, executar operações autorizadas | Não usar modelo do provedor como identidade de domínio |
| FinOps existente | Custo econômico em USD/microUSD e budgets | Não receber BRL como se fosse USD nem deduzir custo do preço de venda |

`PriceVersion`, preferências e portas adicionais são nomes conceituais propostos, sem status de schema ou registry publicado. Não é proposto novo bounded context ou microserviço. O domínio mantém regras puras; casos de uso dependem de portas internas. SDK, API version, webhook e código de locale Stripe ficam no adapter; apresentação depende de políticas, não o inverso.

Casos de uso propostos: resolver apresentação; consultar oferta elegível; iniciar checkout; reconciliar assinatura; aplicar política de entitlement; pedir mudança/cancelamento; processar reembolso autorizado; consultar documentos comerciais. A exposição machine-to-machine depende dos contratos futuros de [06](06-CONTRACTS-AND-IMPACT.md).

## Invariantes derivados

- Trocar `pt-BR` por `en-US` não muda preço, moeda, plano, budget ou tenant ativo.
- BRL de cobrança não é moeda de liquidação nem moeda funcional da empresa cliente. O câmbio financeiro BRL→USD na liquidação não recalcula o preço da assinatura. A Stripe distingue presentment e settlement, podendo converter entre ambos. [Moedas na Stripe](https://docs.stripe.com/currencies).
- Entitlement interno é avaliado no backend em toda execução, inclusive jobs e retomadas. Pagamento não concede permissões ou approval irrestritos.
- Nenhuma chamada de LLM decide preço, concede direito ou libera refund.
- Operações financeiras exigem ator, tenant, permissão, versão, política/aprovação, idempotência e auditoria. Consentimento, budget e direitos de ativos entram quando aplicáveis à ação.
- Preço e condições aceitos são snapshots recuperáveis. Documento financeiro histórico não é reemitido por mudança de idioma.

## Alternativas avaliadas

| Alternativa | Decisão e motivo |
| --- | --- |
| Um preço USD convertido dinamicamente para BRL | Descartada pela decisão explícita de valores independentes |
| Stripe Adaptive Pricing | Fora do fluxo proposto: calcula preços localizados automaticamente; revisar configuração e canais para impedir ativação acidental. [Adaptive Pricing](https://docs.stripe.com/payments/currencies/localize-prices/adaptive-pricing?payment-ui=stripe-hosted) |
| Preços separados por moeda ou um Price com currency options | Ambos podem representar valores manuais; propor Price separado por moeda/intervalo/versão pela clareza de migração e auditoria. Não criar produtos agora |
| Entitlements determinados diretamente pelos objetos Stripe | Preservar o descarte de ADR-0007: política interna evita acoplamento e suporta overrides auditáveis |
| Provider fiscal brasileiro no lançamento | Fora do fluxo planejado; eventual necessidade exige análise e change proposal específico |

## Consequências e dependências

São necessários catálogos de tradução, catálogo de preços versionado, mappings por ambiente/conta, política comercial explícita, reconciliação e auditoria de billing. Não se alteram os 12 agentes nem suas capabilities. DP-11a permanece parcialmente aberta; DP-29/30/31 permanecem com seus status. Elegibilidade da LLC, documentação e tributação dependem de validação específica, conforme [08](08-RISKS-ASSUMPTIONS-OPEN-ITEMS.md).

Compatibilidade: adicionar modelo de preço separado pode ser compatível; reinterpretar `tenant.currency`, substituir `tenant.locale` ou mudar semântica de `revenue.recorded` não é. A proposta mantém campos legados com significado anterior até migração explícita. Freeze e snapshots são preservados; a aplicação seguirá [02](02-CR-PROPOSED-i18n-billing-us.md).
