# Incorporação de idiomas e billing internacional da Oplyra

**Data:** 28/10/2026. **Registro:** CR-040 / ADR-0010. **Escopo:** atualização e gravação local de documentação autorizadas pelo proprietário no chat. **Status da gravação de 28/10:** documentos salvos localmente. **Versionamento de 30/10:** este registro integra o commit documental autorizado pelo proprietário; ver seção abaixo. Não houve push, PR, merge, deploy ou nova release contratual por esta entrega.

## Decisão e referências atuais

A Oplyra terá lançamento pt-BR/en-US e preços fixos e independentes BRL/USD por plano. Oplyra LLC americana é a seller, com Stripe americano para billing/invoices/recibos e liquidação bancária nos EUA. O fluxo planejado não inclui NFS-e brasileira. Locale, moeda de assinatura e contexto empresarial são separados; idempotência, entitlement e auditoria continuam estruturais.

Decisão: [ADR-0010](../../decisions/ADR-0010-i18n-pricing-billing-us.md). Aplicação documental: [CR-040](contracts/changes/CR-040-i18n-pricing-billing-us-documentation.md). Specs de trabalho: [i18n](i18n/I18N-SPEC.md), [pricing/billing](billing/PRICING-BILLING-SPEC.md), [Stripe](billing/STRIPE-FLOWS.md), [migração/rollback](billing/MIGRATION-ROLLOUT.md).

Os valores/intervalos, condições de DP-11a, DP-29/30/31, enquadramento jurídico/fiscal, conta/banco e políticas técnicas ainda propostas mantêm seus status. Gravar a documentação não significa implementar ou ativar a operação financeira.

## Histórico e fonte protegida

O [pacote de preparação](change-packages/2026-10-28-i18n-billing-us/README.md) foi incorporado byte a byte como histórico. Seus relatórios descrevem a primeira entrega, anterior à atualização de canônicos. A presente página e sua [evidência](I18N-BILLING-US-INCORPORACAO.validation.json) descrevem esta incorporação. O Project original continua com o pacote preparado; o repositório principal recebe os documentos de trabalho.

Documento de Transição v2.3, registries, schemas, fixtures, Freeze v1 e manifests existentes permanecem intactos. A atualização dos documentos de trabalho implica divergência dos seus hashes em releases históricas: não se declara reprodução integral da Release 2.22. Nenhuma nova versão de schema/registry/release foi emitida. Qualquer delta executável futuro precisa de compatibilidade, cross-validation completa, versões e novo manifest pelo processo canônico.

## Verificação documental

Conferidos os links introduzidos e os arquivos novos, JSONs parseáveis, diff restrito à documentação, IDs de ADR/CR disponíveis na base observada e integridade do pacote original. A evidência lista hashes de antes/depois e arquivos protegidos conferidos. Nenhuma alteração de terceiros foi reescrita. Os 58 cenários de produto permanecem especificados e não executados; não houve teste Stripe, banco/RLS, E2E, gate de release ou cross-validation completa.

## Arquivos desta incorporação

| Caminho relativo ao repositório | Mudança |
| --- | --- |
| `README.md` | Atualizado |
| `docs/decisions/ADR-0007-entitlements-e-billing.md` | Atualizado |
| `docs/decisions/ADR-0010-i18n-pricing-billing-us.md` | Adicionado |
| `docs/decisions/README.md` | Atualizado |
| `docs/harness/ESTADO.md` | Atualizado |
| `docs/product/marketing-ops/01-product-requirements.md` | Atualizado |
| `docs/product/marketing-ops/03-domain-model.md` | Atualizado |
| `docs/product/marketing-ops/04-architecture.md` | Atualizado |
| `docs/product/marketing-ops/05-data-model.md` | Atualizado |
| `docs/product/marketing-ops/06-integrations.md` | Atualizado |
| `docs/product/marketing-ops/07-security-lgpd.md` | Atualizado |
| `docs/product/marketing-ops/08-billing-entitlements.md` | Atualizado |
| `docs/product/marketing-ops/09-agentic-architecture.md` | Atualizado |
| `docs/product/marketing-ops/10-agent-catalog.md` | Atualizado |
| `docs/product/marketing-ops/11-agent-governance.md` | Atualizado |
| `docs/product/marketing-ops/12-roadmap.md` | Atualizado |
| `docs/product/marketing-ops/13-ai-model-routing-finops.md` | Atualizado |
| `docs/product/marketing-ops/14-ux-flows.md` | Atualizado |
| `docs/product/marketing-ops/15-test-plan.md` | Atualizado |
| `docs/product/marketing-ops/16-environments-release.md` | Atualizado |
| `docs/product/marketing-ops/17-risks-costs.md` | Atualizado |
| `docs/product/marketing-ops/19-context-stack.md` | Atualizado |
| `docs/product/marketing-ops/20-agent-transaction-protocol.md` | Atualizado |
| `docs/product/marketing-ops/ATUALIZACOES.md` | Atualizado |
| `docs/product/marketing-ops/I18N-BILLING-US-INCORPORACAO.md` | Adicionado |
| `docs/product/marketing-ops/I18N-BILLING-US-INCORPORACAO.validation.json` | Adicionado |
| `docs/product/marketing-ops/README.md` | Atualizado |
| `docs/product/marketing-ops/agents/README.md` | Atualizado |
| `docs/product/marketing-ops/billing/MIGRATION-ROLLOUT.md` | Adicionado |
| `docs/product/marketing-ops/billing/PRICING-BILLING-SPEC.md` | Adicionado |
| `docs/product/marketing-ops/billing/STRIPE-FLOWS.md` | Adicionado |
| `docs/product/marketing-ops/change-packages/2026-10-28-i18n-billing-us/00-BASELINE-E-PRECEDENCIA.md` | Adicionado |
| `docs/product/marketing-ops/change-packages/2026-10-28-i18n-billing-us/01-ADR-PROPOSED-i18n-billing-us.md` | Adicionado |
| `docs/product/marketing-ops/change-packages/2026-10-28-i18n-billing-us/02-CR-PROPOSED-i18n-billing-us.md` | Adicionado |
| `docs/product/marketing-ops/change-packages/2026-10-28-i18n-billing-us/03-I18N-SPEC.md` | Adicionado |
| `docs/product/marketing-ops/change-packages/2026-10-28-i18n-billing-us/04-PRICING-BILLING-SPEC.md` | Adicionado |
| `docs/product/marketing-ops/change-packages/2026-10-28-i18n-billing-us/05-STRIPE-FLOWS.md` | Adicionado |
| `docs/product/marketing-ops/change-packages/2026-10-28-i18n-billing-us/06-CONTRACTS-AND-IMPACT.md` | Adicionado |
| `docs/product/marketing-ops/change-packages/2026-10-28-i18n-billing-us/07-MIGRATION-ROLLOUT-ROLLBACK.md` | Adicionado |
| `docs/product/marketing-ops/change-packages/2026-10-28-i18n-billing-us/08-RISKS-ASSUMPTIONS-OPEN-ITEMS.md` | Adicionado |
| `docs/product/marketing-ops/change-packages/2026-10-28-i18n-billing-us/09-ACCEPTANCE-AND-TESTS.md` | Adicionado |
| `docs/product/marketing-ops/change-packages/2026-10-28-i18n-billing-us/10-CANONICAL-UPDATE-PLAN.md` | Adicionado |
| `docs/product/marketing-ops/change-packages/2026-10-28-i18n-billing-us/11-SOURCES.md` | Adicionado |
| `docs/product/marketing-ops/change-packages/2026-10-28-i18n-billing-us/README.md` | Adicionado |
| `docs/product/marketing-ops/change-packages/2026-10-28-i18n-billing-us/VALIDATION.md` | Adicionado |
| `docs/product/marketing-ops/change-packages/2026-10-28-i18n-billing-us/package-manifest.json` | Adicionado |
| `docs/product/marketing-ops/change-packages/2026-10-28-i18n-billing-us/package-validation.json` | Adicionado |
| `docs/product/marketing-ops/change-packages/2026-10-28-i18n-billing-us/pricing-catalog.proposed.json` | Adicionado |
| `docs/product/marketing-ops/change-packages/2026-10-28-i18n-billing-us/source-audit.json` | Adicionado |
| `docs/product/marketing-ops/contracts/changes/CR-040-i18n-pricing-billing-us-documentation.md` | Adicionado |
| `docs/product/marketing-ops/contracts/contracts-README.md` | Atualizado |
| `docs/product/marketing-ops/i18n/I18N-SPEC.md` | Adicionado |

## Próxima etapa e recuperação

Resolver pendências comerciais e os contratos específicos do desenho proposto, preservando a governança pós-Freeze antes de implementação estrutural/publicação. A gravação não altera as autorizações separadas de cobrança, serviços externos, dados reais ou deploy. Para recuperar, reverter exclusivamente o delta identificado pelo CR e pelos hashes; preservar alterações alheias, snapshots e histórico, sem reset ou limpeza geral.

## Versionamento local — 30/10/2026

O proprietário autorizou explicitamente commitar esta documentação. Os 52 arquivos desta relação constituem o escopo do commit local `docs: register bilingual launch and US billing decision (CR-034)`. A versão do registro e da evidência foi atualizada para distinguir a gravação de 28/10 do versionamento de 30/10. O pacote histórico de preparação continua byte a byte preservado.

O SHA deve ser obtido no histórico Git deste registro; não é incluído no conteúdo do próprio commit para evitar autorreferência. A evidência JSON registra as validações anteriores ao commit, sem substituir a verificação do objeto Git. Alterações de outros trabalhos, incluindo scripts e CI, não entram no commit documental. A entrega não inclui push, merge, deploy ou execução de billing.

## Reconciliação — 03/11/2026

O identificador corrente desta entrega é CR-040. CR-034 designava billing somente na branch histórica `2394d15`; em main ele designa Brand OS. O pacote e o relatório de validação de 28/10 permanecem byte a byte históricos; seus hashes e a lista original não devem ser usados como evidência da base conciliada. A conciliação corrente, seus hashes e os limites são registrados em `I18N-BILLING-US-RECONCILIACAO-2026-11-03.validation.json`. Nenhuma decisão comercial foi ampliada por essa renumeração.
