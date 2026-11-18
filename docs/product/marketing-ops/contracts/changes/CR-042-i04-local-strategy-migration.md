# CR-042 — I-04: migration local de estratégia

**Status:** `approved`
**Classificação:** `additive_local_database_extension`
**Data:** 2026-11-11
**Escopo da autorização:** implementação e evolução **somente local** do MVP Performance, sob o mandato explícito do proprietário de 11/11/2026 para continuidade com Claude, inclusive após o I-04, sem autorização adicional por tarefa. Esta anotação aplica o mandato já concedido; não representa revisão humana destes bytes nem aprovação de publicação.
**Migration:** `supabase/migrations/20261111000017_strategy.sql`
**Migration SHA-256:** `f925e1ed287cf05f674e07d0f82cc3f8a946aa693465fb38bc236c1ebdd5421c`
**Release produtiva/Freeze:** não emitidos; composição e evidências de release permanecem pendentes.

## Escopo técnico

Reconhecer a migration do I-04 no conjunto **local** de migrations permitidas pelo perfil corrente, preservando a lista histórica e os hashes de 000001–000015 e o precedente do Brand OS (000016, CR-034). O hash acima fixa os bytes revistos; o caminho sozinho não autoriza conteúdo posterior. O teste pgTAP correspondente é `supabase/tests/strategy.test.sql`.

A migration acrescenta cinco tabelas no schema privado `strategy`, permissões locais RBAC `strategy.read`/`strategy.write`, FKs compostas com tenant, RLS habilitada e forçada, estados de campanha/experimento/tarefa e guardas de integridade. Nenhuma permission, action, tool, event, error ou agent dos registries de marketing é criada ou renomeada; RBAC da aplicação não substitui os contratos dos agentes do produto.

A revisão corrigiu comparações com SQL NULL em campos JSON obrigatórios (`IS DISTINCT FROM`) e agregação do método completo. KPI vazio/campo ausente, elemento canônico substituído por chave extra, amostra ausente e aprendizado sem evidência passam a ser recusados no banco. A função de agregação não ignora elemento ausente. A correção muda rejeições de entradas inválidas; não muda payloads válidos nem adiciona campos.

## Preservação e compatibilidade

- O validador histórico 2.22, Freeze, manifests, schemas, registries e migrations 000001–000016 não são alterados.
- O perfil corrente aceita apenas o conjunto explícito e exige que esta decisão tenha escopo local e que o hash da 000017 corresponda ao declarado; migration extra ou alteração dos bytes continua falhando.
- O inventário **não congelado** 2.23 recebe os arquivos desta evolução como preparação; isso não emite release, não fecha o inventário do I-04 e não aprova automaticamente a composição final de uma publicação.
- A 000017 ainda não está commitada nem aplicada a ambiente compartilhado segundo o relato e a árvore inspecionada. Sua revisão em andamento é local. Não reescrever migration já publicada/aplicada em produção: evolução posterior exigirá nova migration e autorização produtiva.
- Não há mudança de package exports neste CR. `@oplyra/core/strategy` permanece dependente de evolução governada própria; o adaptador Postgres e as telas continuam pendentes.

## Validação e limites

As consultas independentes no Postgres local reproduziram os defeitos de JSON antes da correção. Os cenários pgTAP cobrem ausência de campos e fixam papel, ausência de BYPASSRLS e tenant do UPDATE entre empresas. Os resultados executados são registrados em `docs/harness/ESTADO.md`; não transformar esta decisão em evidência de teste.

O episódio anterior de UPDATE de T6 sobre campanha de T5 permanece **sem causa estabelecida**. A revisão encontrou `USING` e `WITH CHECK` nas quatro políticas atuais, mas isso não prova a configuração da execução anterior. Repetição verde não fecha a anomalia. Sessões reais de Auth, concorrência real do lock de dependências, mutações específicas de isolamento e revisão do adaptador permanecem necessárias antes de concluir o aceite correspondente.

Modelo detalhado de objetivo/KPI, tabela de canais UTM e campos de campanha ainda propostos permanecem **propostas locais**, sem aprovação implícita de seus critérios de produto. Período/orçamento/persona/mensagem-chave de campanha continuam pendentes. Slug não garante ausência de PII.

## Produção

Nenhum deploy, migration remota, SQL remoto, ativação de integração ou acesso ao projeto `hysigyhfpyyydycxxpsm` é autorizado por este CR. Preparar pacote revisável, resolver os gates de segurança e obter autorização específica antes de publicar.
