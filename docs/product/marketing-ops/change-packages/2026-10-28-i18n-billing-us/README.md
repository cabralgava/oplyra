# Pacote de mudança de idiomas e billing internacional da Oplyra

**Data:** 28/10/2026. **Versão do pacote:** 1.0. **Identificador documental:** CP-I18N-BILLING-US-2026-10-28. Este identificador organiza a proposta; não é identidade de registry.

A Oplyra será lançada em `pt-BR` e `en-US`, com preços fixos e independentes em BRL e USD por plano. A entidade vendedora será a Oplyra LLC americana, com Stripe americano para cobrança, invoices e recibos e liquidação bancária nos EUA. O fluxo planejado não inclui emissão de NFS-e brasileira. Locale da interface, idioma do conteúdo, moeda da assinatura e contexto empresarial têm responsabilidades separadas.

Essas diretrizes estão **aprovadas pelo usuário no pedido de 28/10/2026**. As especificações técnicas deste pacote são **propostas para incorporação controlada**. Valores, condições comerciais e conclusões tributárias ainda não definidos permanecem **pendentes**. Nenhuma conta, cobrança, migration, publicação ou mudança de registry foi executada.

## Leitura e arquivos

| Arquivo | Uso |
| --- | --- |
| [00-BASELINE-E-PRECEDENCIA.md](00-BASELINE-E-PRECEDENCIA.md) | Fontes, divergências do espelho e autoridade do Freeze |
| [01-ADR-PROPOSED-i18n-billing-us.md](01-ADR-PROPOSED-i18n-billing-us.md) | Decisão e desenho das fronteiras |
| [02-CR-PROPOSED-i18n-billing-us.md](02-CR-PROPOSED-i18n-billing-us.md) | Proposta de mudança, compatibilidade e requisitos |
| [03-I18N-SPEC.md](03-I18N-SPEC.md) | Resolução de idiomas, conteúdo, contexto e comunicações |
| [04-PRICING-BILLING-SPEC.md](04-PRICING-BILLING-SPEC.md) | Catálogo, lifecycle comercial e entitlements |
| [05-STRIPE-FLOWS.md](05-STRIPE-FLOWS.md) | Checkout, webhooks, documentos, reconciliação e recuperação |
| [06-CONTRACTS-AND-IMPACT.md](06-CONTRACTS-AND-IMPACT.md) | Impacto nos contratos, documentação e componentes existentes |
| [07-MIGRATION-ROLLOUT-ROLLBACK.md](07-MIGRATION-ROLLOUT-ROLLBACK.md) | Fases, backfill, lançamento e recuperação |
| [08-RISKS-ASSUMPTIONS-OPEN-ITEMS.md](08-RISKS-ASSUMPTIONS-OPEN-ITEMS.md) | Assunções, riscos, responsáveis e decisões remanescentes |
| [09-ACCEPTANCE-AND-TESTS.md](09-ACCEPTANCE-AND-TESTS.md) | Casos verificáveis e checklist de entrada em operação |
| [10-CANONICAL-UPDATE-PLAN.md](10-CANONICAL-UPDATE-PLAN.md) | Texto de atualização e caminhos de incorporação |
| [11-SOURCES.md](11-SOURCES.md) | Fontes internas e documentação oficial externa |
| [pricing-catalog.proposed.json](pricing-catalog.proposed.json) | Matriz editável sem preços inventados; não consumível por runtime |
| [source-audit.json](source-audit.json) | Hashes e verificações pontuais das fontes |
| [VALIDATION.md](VALIDATION.md) | Verificações documentais realmente executadas |
| [package-manifest.json](package-manifest.json) | Integridade dos arquivos do pacote; não substitui manifest contratual |

## Caminhos e incorporação

Diretório recomendado no repositório: `docs/product/marketing-ops/change-packages/2026-10-28-i18n-billing-us/`. Os arquivos atuais são editáveis e estão nesse caminho no workspace do Project. O repositório principal foi consultado em `/Users/cmii/Documents/Projetos/Oplyra` somente para leitura.

Depois da revisão, registrar o ADR e o CR nos índices existentes, atribuindo os próximos números livres; `ADR-PROPOSED` e `CR-PROPOSED` não reservam numeração. O plano [10](10-CANONICAL-UPDATE-PLAN.md) identifica os destinos definitivos. Não copiar o pacote inteiro sobre documentos canônicos ou recriar os agentes.

## O que libera a próxima etapa

O Freeze v1 já existe no repositório consultado. A presente mudança deve seguir sua política pós-Freeze: proposta → avaliação de compatibilidade → versões/fixtures → cross-validation → manifest de nova release → implementação compatível → verificação → ativação autorizada. O pacote não emite novo Freeze nem declara a cross-validation completa aprovada.

A revisão documental pode avançar agora. Cobrança real depende dos preços e condições de DP-11a, verificação da LLC/Stripe/banco, parecer fiscal aplicável e testes de integração autorizados. Preservar DP-29, DP-30 e DP-31; idiomas e moedas não resolvem essas pendências.
