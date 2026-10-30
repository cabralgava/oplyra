# CR-034 — Incorporação documental de idiomas e billing internacional

**Status:** documentação incorporada localmente por autorização explícita do proprietário em 28/10/2026 (“consegue atualizar e gravar tudo?!”). **Classificação:** atualização documental sem alteração de registries, schemas, fixtures, migrations ou runtime. **Decisão:** [ADR-0010](../../../../decisions/ADR-0010-i18n-pricing-billing-us.md). **Base observada:** HEAD `6d0dfe486292e05fade19a93b650bb54c1bde732`, working tree com alterações de terceiros preservadas; Freeze v1 e registries compatíveis em hash com manifest v2.22. **Target release:** nenhuma emitida nesta incorporação.

## Escopo aplicado

Registradas as decisões aprovadas de lançamento pt-BR/en-US, preços fixos e independentes em BRL e USD, Oplyra LLC americana como seller, Stripe americano para billing/invoices/recibos e liquidação bancária nos EUA, sem NFS-e brasileira no fluxo planejado. Locale, moeda da assinatura, fuso e contexto empresarial permanecem separados.

Atualizados documentos de produto, agentes, protocolo, decisões, índices e checkpoint. Criadas referências de trabalho em `i18n/` e `billing/`, com proposta técnica e pendências explícitas. Preservado o [pacote de preparação](../../change-packages/2026-10-28-i18n-billing-us/README.md) byte a byte como histórico: seus status e relatórios descrevem a preparação anterior, não o estado posterior a esta incorporação.

A relação exata de arquivos e a evidência da gravação estão no [registro de incorporação](../../I18N-BILLING-US-INCORPORACAO.md). Os [58 cenários especificados](../../change-packages/2026-10-28-i18n-billing-us/09-ACCEPTANCE-AND-TESTS.md) não foram executados como testes de produto.

## Compatibilidade e Freeze

Nenhuma agent.key, action, event, error, permission, domain, schema, tool, gate ou handoff foi criada, renomeada ou modificada. Os adendos de 19–20 clarificam responsabilidades e indicam contratos específicos futuros; não adicionam campos à versão publicada do envelope ou Context Package. A revisão documental CR-034 não é schemaVersion ou registryVersion.

Freeze v1, manifests e snapshots existentes não são sobrescritos. Documentos de trabalho alterados podem divergir dos hashes de documentação das releases históricas; este checkout não é declarado uma reprodução integral da Release 2.22. Antes de publicar nova release, avaliar o delta contratual efetivo, produzir schemas/owners/fixtures, executar cross-validation completa e emitir novo manifest pelo procedimento canônico. Nenhuma versão futura é reservada ou declarada frozen aqui.

## Aprovado proposto e pendente

Diretrizes comerciais aprovadas; atualização e gravação dos documentos autorizadas. Políticas técnicas candidatas continuam propostas onde assim marcadas. Permanecem pendentes valores/intervalos e condições de DP-11a, DP-29/30/31, validação jurídica/contábil, conta/banco, elegibilidade dos meios, mapping de locales e operação live. Não há aprovação em bloco de DPs.

## Validação e limites

Verificados diff e escopo documental, links novos, identidades dos registries, bindings pertinentes, integridade do pacote histórico e preservação das fontes protegidas e alterações alheias. Ver a evidência no registro de incorporação. Não executados runtime, banco, E2E, Stripe, cross-validation completa ou gates de nova release. A gravação inicial de 28/10 não incluiu commit/push/PR/merge/deploy; o versionamento local posterior está registrado abaixo.

## Recuperação

Reverter apenas o delta documental deste CR, usando a lista e os hashes de antes/depois do registro de incorporação; preservar alterações de terceiros e fontes históricas. Não usar reset ou limpeza de checkout. Não há efeito financeiro externo a compensar.

## Versionamento local — 30/10/2026

Autorizado explicitamente pelo proprietário neste chat. Este CR integra o commit documental de 52 arquivos, identificado pela mensagem `docs: register bilingual launch and US billing decision (CR-034)` e pelo histórico Git do [registro de incorporação](../../I18N-BILLING-US-INCORPORACAO.md). O SHA não é escrito no conteúdo do próprio commit. Checkpoint e evidência distinguem a autorização e validação do commit da gravação inicial. Sem push, PR, merge, deploy, nova release ou alteração de contrato executável nesta entrega; trabalho de outros escopos permanece fora do commit.
