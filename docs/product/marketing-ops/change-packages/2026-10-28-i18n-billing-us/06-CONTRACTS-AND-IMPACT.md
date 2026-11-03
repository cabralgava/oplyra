# Inventário de impacto contratual e de implementação

**Status:** análise da base observada; alterações candidatas. **Destino recomendado:** acompanhar o CR no pacote e vincular ao índice contratual. **Requisitos:** R-05 a R-07, R-09 a R-12. Caminhos desta seção são relativos à raiz do repositório principal, não instrução de overwrite.

## Documentos normativos e derivados

| Caminho real ou solicitado | Impacto proposto | Compatibilidade e tratamento |
| --- | --- | --- |
| `docs/product/marketing-ops/00-documento-transicao.md` | Referência histórica de tenant.locale/currency e DEC-007 | Somente leitura; novo adendo em ATUALIZACOES |
| `docs/product/marketing-ops/ATUALIZACOES.md` | Registrar decisão bilíngue, moedas independentes, seller e escopo de documentos | Complemento aprovado no escopo da decisão; não declarar detalhes propostos aprovados |
| `docs/product/marketing-ops/01-product-requirements.md` | Requisitos de i18n e billing no escopo Performance | Adição documental; lançamento Growth continua condicionado |
| `docs/product/marketing-ops/03-domain-model.md` | Semântica separada de PriceVersion, preferências e moedas | Estender Subscription & Entitlements existente; não inventar novo domínio canônico |
| `docs/product/marketing-ops/04-architecture.md` | Fronteiras de locale, catálogo e billing adapter | Preservar Dependency Rule e stack |
| `docs/product/marketing-ops/05-data-model.md` | Distinguir exemplo conceitual currency de campos realmente persistidos | Nunca renomear ou reinterpretar campo sem migração |
| `docs/product/marketing-ops/06-integrations.md` | Conta US, webhook/inbox, mappings e conciliação | Delta específico de adapter; sem afirmar operação real |
| `docs/product/marketing-ops/07-security-lgpd.md` | Retenção/acesso de dados financeiros e transferência internacional | Revisão jurídica de DP-22; não presumir prazo fiscal |
| `docs/product/marketing-ops/08-billing-entitlements.md` | Preços por moeda, documentos, lifecycle e pendências | Preservar limites/budgets e status de DP-29/30/31 |
| `docs/product/marketing-ops/12-roadmap.md` | i18n transversal e Stripe fake/test/live por gates | Stripe permanece na Fundação; self-service completo não é antecipado implicitamente |
| `docs/product/marketing-ops/14-ux-flows.md` | Seletores independentes, confirmação comercial, recuperação e formatos | Referências Figma/marca preservadas; sem criar telas neste pacote |
| `docs/product/marketing-ops/15-test-plan.md` | Acrescentar testes deste pacote a TST-03/04/06/07/10–13/23/26/28 | IDs locais de casos não renumeram TST existentes |
| `docs/product/marketing-ops/16-environments-release.md` | Isolar conta/test-live, API/SDK, locale mappings e rollout | Nenhum segredo ou remoto configurado |
| `docs/product/marketing-ops/17-risks-costs.md` | Exposição cambial e margem separadas da precificação fixa | Sem tarifas ou taxas numéricas inventadas |
| `docs/product/marketing-ops/19-context-stack.md` | Clarificar idioma empresarial/saída e moedas por fonte | Preferir addendum/contrato específico; mudar estrutura publicada exige análise |
| `docs/product/marketing-ops/20-agent-transaction-protocol.md` | Manter envelope e controles; especificar payloads próprios | Não adicionar locale/currency na raiz; dinheiro sempre com unidade e moeda |
| `docs/product/marketing-ops/agents/README.md` e 12 specs | Regra comum de idioma de entrega, versão e revisão | Não reescrever catálogo ou autonomia; inspecionar cada spec afetada antes do patch |
| `docs/decisions/ADR-0007-entitlements-e-billing.md` | Vincular nova decisão sem apagar DP-11a remanescente | Registrar sucessão parcial, sem reaproveitar seu número para outro ADR |
| `docs/decisions/README.md` e índice de produto | Registrar novo ADR, CR e status/pendências | Atribuir próximos IDs livres após conferir destino |
| `contracts/contracts-README.md`, Freeze e manifests | Referenciar procedimento pós-Freeze | Freeze/manifests históricos imutáveis; README real usa nome diferente do solicitado |
| `OPLYRA-MIGRATION-PACK/00-START-HERE.md` e `06-OPEN-ITEMS.md` | Reconciliar se reaparecerem | Ausentes; não inferir conteúdo ou sobrescrever |

## Registries e schemas atuais

| Artefato em `docs/product/marketing-ops/contracts/` | Achado e dependência | Alteração nesta entrega |
| --- | --- | --- |
| `registries/agents.json` | 12 agentes; não há billing agent | Nenhuma; não criar um para operar assinatura do SaaS |
| `registries/permissions.json` | 6 permissões abstratas de ferramenta | Nenhuma; RBAC de billing não se confunde com esse catálogo |
| `registries/tools.json` | `billingData` somente leitura analítica; `entitlementService` somente leitura | Nenhuma; não são ferramentas para cobrar ou reembolsar |
| `registries/actions.json` | 171 actions; não localizada capability de administração Stripe da plataforma | Nenhuma; avaliar contrato de serviço e alcance do registry antes de adicionar |
| `registries/events.json` | `revenue.recorded` produzido por `integration: billing-adapter`, consumido por `revenue-intelligence-agent` | Nenhuma; preservar receita de negócio do tenant, sem reuso para mensalidade Oplyra |
| `registries/errors.json` | `CURRENCY_REQUIRED` e `ENTITLEMENT_REQUIRED` existem | Nenhuma; novos motivos de billing precisam de avaliação, não error codes improvisados |
| `registries/handoffs.json` | 43 handoffs e 364 bindings conferidos | Nenhuma; novas actions agentic exigiriam novo binding e validação |
| `registries/quality-gates.json` | 11 gates; `operational_gate` pertence a `policy-engine`, determinístico | Nenhuma; aplicabilidade à futura ação financeira depende do contrato, sem autoapproval |
| `registries/model-profiles.json` | 3 profiles locais de IA; distinto de catálogo comercial | Nenhuma; não inserir moeda de assinatura em tarifa de modelo |
| `schemas/context-package.schema.json` | `$id` 1.1, raiz fechada, slices `data` estruturados e metadata aberta | Não usar abertura como autorização para esquema crítico implícito; publicar contrato de slice/payload necessário |
| `schemas/transaction-envelope.schema.json` | `$id` 1.0, raiz e `context` fechados; input/constraints genéricos | Não adicionar campos arbitrários; input específico exige schema versionado |
| `schemas/common-definitions.schema.json` e `common-definitions-1.1.schema.json` | Versões distintas coexistem e têm dependentes | Não trocar `$id` ou fazer atualização global por busca/substituição |

### Contratos ainda necessários

Nenhum arquivo abaixo é declarado já existente ou schema aprovado. Os caminhos são propostas para a fase contratual, após definir ownership, `$id` e versões. Não criar stubs vazios como se validassem regras.

| Contrato candidato | Caminho recomendado | Owner proposto e invariantes |
| --- | --- | --- |
| Preferências de locale e requisito de saída | `schemas/i18n/locale-preferences.schema.json` e contrato específico de output por ação | Identity & Tenancy / Context Assembly; permitir somente combinações suportadas, proveniência e escopo |
| Catálogo/versão de preço | `schemas/billing/pricing-catalog.schema.json` | Subscription & Entitlements; valores completos, moeda, intervalo, tax behavior, vigência e aprovação |
| Intenção e resultado de checkout | `schemas/billing/checkout-intent.input.schema.json` e `.output.schema.json` | Serviço de billing proposto; mapping confiável, aceite e idempotência |
| Snapshot de assinatura/entitlement | `schemas/billing/subscription-snapshot.schema.json` e política correspondente | Subscription & Entitlements; estados normalizados, prazo e revisão concorrente |
| Evento normalizado de billing da plataforma | `schemas/events/billing/` com nome a decidir | Produtor/consumidor/namespace pendentes; nunca alias silencioso de `revenue.recorded` |
| Refund/cancelamento/mudança | `schemas/billing/` com nomes a definir no catálogo de serviços | Serviço de billing proposto; autorização, versão, moeda, limite e política |
| Entrada de webhook e reconciliação | `schemas/billing/` com contratos internos próprios | Adapter / serviço de reconciliação propostos; evento externo não entra cru no domínio |

Os owners acima são responsabilidades de componentes já previstos ou propostas de serviço, não novas `agent.key`. Antes da implementação, registrar identidade operacional do serviço e produtor/consumidor. Não forçar uma action financeira em ownerAgent especialista apenas porque `actions.json` hoje exige esse campo. Resolver o contrato de serviços com escopo e versionamento próprios ou mudança controlada do registry existente.

## Impacto nos componentes reais

| Caminho | Estado observado e delta proposto |
| --- | --- |
| `packages/core/src/domain/entities.ts` | Tenant tem locale/timezone e status de identidade; preservar e adicionar modelo separado de billing |
| `packages/core/src/application/use-cases/provision-tenant.ts` | Provisionamento auditado não recebe moeda/locale; futuros defaults explícitos não podem criar assinatura paga |
| `packages/infra/src/repositories.ts` | SQL retorna locale; não inferir que há currency persistida |
| `supabase/migrations/20260915000002_identity_and_tenancy.sql` | `core.tenants.locale` default pt-BR; `core.plans` e entitlements locais; acrescentar migrations novas, nunca editar a antiga |
| `supabase/migrations/20260915000003_rls_policies.sql` | RLS existente precisa de extensão/testes para novas entidades; não presumir cobertura automática |
| `supabase/migrations/20260929000013_finops_ledger_schema.sql` | Ledger econômico USD; manter unidade e semântica |
| `packages/core/src/ai-model-harness/` e `packages/infra/src/ai-model-harness/` | Custos/tarifas de modelo distintos de Stripe Billing; regressão de budgets/`null` é relevante |
| `apps/web/src/app/` | Rotas locais reais de login/convite/empresas/equipe; i18n e superfícies de billing dependem de implementação futura |
| `test/contracts/`, `packages/core/test/`, `packages/infra/test/`, `supabase/tests/` | Acrescentar casos por contrato/isolamento/concorrência, seguindo organização real no incremento |
| `package.json` e ferramentas de release | Comandos existentes de verificação/release inspecionados; nenhuma execução de build/release neste pacote |

## Validação cruzada exigida para o delta

Verificar unicidade de identidade/versão, refs de schemas/JSON Pointer, policies/autonomy/permissions, plano/entitlement, produtor/consumidor, ownership, todos os side effects, error codes e políticas de retry, bindings de handoff afetados e fixtures válidas/inválidas. Incluir compatibilidade de leitores e rejeição de versão desconhecida. Recalcular relatório e manifest da release alvo sem regravar o Freeze original. O hash pontual de registries no pacote não substitui isso.
