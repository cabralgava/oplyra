# CR-040 — Incorporação documental de idiomas e billing internacional

**Status:** documentação incorporada localmente por autorização explícita do proprietário em 28/10/2026 (“consegue atualizar e gravar tudo?!”). **Classificação:** atualização documental sem alteração de registries, schemas, fixtures, migrations ou runtime. **Decisão:** [ADR-0010](../../../../decisions/ADR-0010-i18n-pricing-billing-us.md). **Base observada:** HEAD `6d0dfe486292e05fade19a93b650bb54c1bde732`, working tree com alterações de terceiros preservadas; Freeze v1 e registries compatíveis em hash com manifest v2.22. **Target release:** nenhuma emitida nesta incorporação.

## Escopo aplicado

Registradas as decisões aprovadas de lançamento pt-BR/en-US, preços fixos e independentes em BRL e USD, Oplyra LLC americana como seller, Stripe americano para billing/invoices/recibos e liquidação bancária nos EUA, sem NFS-e brasileira no fluxo planejado. Locale, moeda da assinatura, fuso e contexto empresarial permanecem separados.

Atualizados documentos de produto, agentes, protocolo, decisões, índices e checkpoint. Criadas referências de trabalho em `i18n/` e `billing/`, com proposta técnica e pendências explícitas. Preservado o [pacote de preparação](../../change-packages/2026-10-28-i18n-billing-us/README.md) byte a byte como histórico: seus status e relatórios descrevem a preparação anterior, não o estado posterior a esta incorporação.

A relação exata de arquivos e a evidência da gravação estão no [registro de incorporação](../../I18N-BILLING-US-INCORPORACAO.md). Os [58 cenários especificados](../../change-packages/2026-10-28-i18n-billing-us/09-ACCEPTANCE-AND-TESTS.md) não foram executados como testes de produto.

## Compatibilidade e Freeze

Nenhuma agent.key, action, event, error, permission, domain, schema, tool, gate ou handoff foi criada, renomeada ou modificada. Os adendos de 19–20 clarificam responsabilidades e indicam contratos específicos futuros; não adicionam campos à versão publicada do envelope ou Context Package. A revisão documental CR-040 não é schemaVersion ou registryVersion.

Freeze v1, manifests e snapshots existentes não são sobrescritos. Documentos de trabalho alterados podem divergir dos hashes de documentação das releases históricas; este checkout não é declarado uma reprodução integral da Release 2.22. Antes de publicar nova release, avaliar o delta contratual efetivo, produzir schemas/owners/fixtures, executar cross-validation completa e emitir novo manifest pelo procedimento canônico. Nenhuma versão futura é reservada ou declarada frozen aqui.

## Aprovado proposto e pendente

Diretrizes comerciais aprovadas; atualização e gravação dos documentos autorizadas. Políticas técnicas candidatas continuam propostas onde assim marcadas. Permanecem pendentes valores/intervalos e condições de DP-11a, DP-29/30/31, validação jurídica/contábil, conta/banco, elegibilidade dos meios, mapping de locales e operação live. Não há aprovação em bloco de DPs.

## Validação e limites

Verificados diff e escopo documental, links novos, identidades dos registries, bindings pertinentes, integridade do pacote histórico e preservação das fontes protegidas e alterações alheias. Ver a evidência no registro de incorporação. Não executados runtime, banco, E2E, Stripe, cross-validation completa ou gates de nova release. A gravação inicial de 28/10 não incluiu commit/push/PR/merge/deploy; o versionamento local posterior está registrado abaixo.

## Recuperação

Reverter apenas o delta documental deste CR, usando a lista e os hashes de antes/depois do registro de incorporação; preservar alterações de terceiros e fontes históricas. Não usar reset ou limpeza de checkout. Não há efeito financeiro externo a compensar.

## Versionamento local — 30/10/2026

Autorizado explicitamente pelo proprietário neste chat. Este CR integra o commit documental de 52 arquivos, identificado pela mensagem `docs: register bilingual launch and US billing decision (CR-034)` e pelo histórico Git do [registro de incorporação](../../I18N-BILLING-US-INCORPORACAO.md). O SHA não é escrito no conteúdo do próprio commit. Checkpoint e evidência distinguem a autorização e validação do commit da gravação inicial. Sem push, PR, merge, deploy, nova release ou alteração de contrato executável nesta entrega; trabalho de outros escopos permanece fora do commit.

## Conciliação do identificador — 03/11/2026

**Identificador canônico corrente:** CR-040. O commit histórico `2394d1542eed13e7f265a14c807a1d2a9fc49be5` usava o nome CR-034 para esta documentação; ele e sua mensagem permanecem imutáveis. Após o merge da PR #10, CR-034 identifica canonicamente o Brand OS. CR-035 identifica Strategy e CR-036 a CR-039 estão presentes em branches de trabalho; por isso este CR passa a CR-040, sem reutilizar esses números.

O caminho anterior `contracts/changes/CR-034-i18n-pricing-billing-us-documentation.md` migra para este arquivo. Referências correntes foram ajustadas; relatórios e pacote históricos preservam a identificação que tinham ao serem produzidos. “CR-034 de billing” só deve ser interpretado como alias histórico qualificado pelo commit `2394d15`, nunca como o CR-034 do Brand OS.

Base conciliada: `433e183791062ca8d8e614331547463f54504733`. O delta de 52 documentos do commit de origem foi reaplicado sem conflito e sem transportar alterações de runtime. Não se renomeia agente, action, event, error, permission, schema, registry ou capability.

O teste corrente usa `AUTORIZADOS_PELO_CR040`, com os mesmos 21 caminhos documentais revisados no rascunho anterior e hashes recalculados dos conteúdos conciliados. Mudanças de hash são justificadas pela conciliação do identificador e da base; não há exceção aberta para edits posteriores. O mapa é transitório até absorção por uma release explicitamente autorizada, sem reservar número de release. ADR-0006 fica excluído e seu stash permanece intocado.

A verificação corrente e o mapa de proveniência estão em `I18N-BILLING-US-RECONCILIACAO-2026-11-03.validation.json`, na raiz da documentação de produto. A evidência de 28/10 continua sendo histórica, com seu identificador e hashes originais.
