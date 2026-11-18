# CR-068 — Conciliação de mídia19/20 e overlays de segurança no Git/CI

**Status:** `approved` exclusivamente para a conciliação técnica solicitada pelo proprietário em18/11/2026. Não é revisão humana presumida dos bytes, autorização produtiva ou aprovação comercial.
**Classificação:** `develop_history_reconciliation_no_apply`.
**Pedido:** conciliar migrations19/20 e overlays no Git/CI, sem reaplicar SQL no Supabase develop, preservar trabalho e produção.
**Destinos:** branch develop de cabralgava/oplyra; Supabase eqpvjydnqbbawpkeizys apenas leitura; nenhum main ou alteração produtiva.

## Fonte de verdade e integridade

Os quatro SQLs são preservados nos bytes originais. Leitura de supabase_migrations.schema_migrations confirmou1statement por registro, com SHA-256 igual ao arquivo local:

- supabase/migrations/20261116210007_media_connection_read.sql → 20261116214247 / media_connection_read_cr055_v1; SHA-256 `7f10ffeb250d4b44badb058825414b921279e43db7b481ca1a2bffcc7bc87b85`.
- supabase/migrations/20261116214433_media_fk_indexes.sql → 20261116214625 / media_fk_indexes_cr055_v1; SHA-256 `6ae6fa4ae3041ff1805bd01e7ea1b1e7a3b81966860b4b0ff0ad8ee9d33c8df5`.
- deploy/develop/supabase/migrations/20261116202506_harden_application_function_search_paths.sql → 20261116211333 / harden_application_function_search_paths; SHA-256 `1eb1ff59a19625fac34f73371e1dee1224f9b6cfe4087f37b8050b1312d26908`.
- deploy/develop/supabase/migrations/20261116211348_harden_domain_validator_search_paths.sql → 20261116211501 / harden_domain_validator_search_paths; SHA-256 `a65156b4e48fb3176997290e05630a0da2e41602408f4ad09debaeb53878881a`.

Mapa declarativo: deploy/develop/migrations-19-20-security-reconciliation.json, history_only_no_apply. Ele não executa SQL, não repara histórico e não autoriza replay. Não copiar timestamps remotos sobre as fontes canônicas. O mapa17/18 do CR-067 é preservado; baseline remote_schema não é fonte de aplicação a reproduzir.

CR-055 e CR-058 preservados como fontes históricas, sem reemitir aprovação de contrato. Esta fatia versiona o schema19/20 já aplicado e suas verificações de banco; não publica os adapters ou a API de mídia, exports, registros, schemas ou manifest próprios ainda ausentes da base. Não declarar o serviço HTTP/integração com provedores entregue só pelo SQL. Nenhuma chamada externa, cofre, token, conexão de anúncios ou operação paga foi habilitada. Os tipos internos ad-platform-api e sua dependência metric-confidence (com testes) acompanham as referências TypeScript do handoff; não há export público, endpoint, adapter ou nova decisão comercial. As escolhas locais do domínio de indicadores conservam seu caráter proposto.

## Overlays e CI isolada

Os overlays já existem no Git nos caminhos deploy/develop/supabase/migrations; não são duplicados em supabase/migrations, renomeados ou promovidos ao conjunto produtivo. O novo prepare-ci-security.mjs aplica exatamente esses dois arquivos APENAS no PostgreSQL descartável da CI, depois das migrations e das senhas locais, antes de pnpm verificar.

Guardas: CI=true, GITHUB_ACTIONS=true, OPLYRA_ENV=ci, URL administrativa literal de loopback127.0.0.1:54422/postgres; qualquer outro valor recusa antes da conexão. Caminhos/SQL não vêm de argumentos ou do ambiente. Hashes dos dois arquivos verificados antes de conectar. Identidade database/login postgres conferida; duas alterações na mesma transação; metadata das11funções antes/depois comprova preservação de corpo, owner, ACL, SECURITY e volatilidade, permitindo somente proconfig fixo. Falha reverte a transação, fecha conexão e não repete. Saída apenas códigos conhecidos, sem mensagens do driver.

A guarda de ambiente não é sandbox ou atestação contra operador malicioso do SO; a CI confiável, URL literal e ausência de credenciais remotas limitam o destino. Nenhuma variável/credencial ou integração Supabase/GitHub é criada, removida ou ampliada. Conferência anterior do painel mostrou nenhum repositório GitHub conectado; o workflow existente nunca aplica SQL no Supabase hospedado.

Testes de integração de hardening executam suas mutações em transações revertidas, com fixtures próprias. Teste da mídia SQL exercita a fronteira humana, papel worker separado, leitura negada de credenciais, isolamento, idempotência e índices, sem APIs externas. Não substitui aceite Auth/HTTP ou prova de todo o workflow da mídia.

## Processo governado

Validador corrente2.23 aceita agora as fontes canônicas000001–000020 com hashes específicos de19/20, os quatro vínculos do mapa e os overlays fixos. Mutações de bytes, autoridade, versão remota, destino, modo ou remoção do bootstrap da CI falham. Preservados fontes1–18, CR-067/mapa17/18, histórico2.22, manifests/Freeze, registries e configurações de produção. Inventário corrente conciliado somente para o delta selecionado.

Não executar develop:migrate, db push, repair, reset, seed, merge/rebase de branch Supabase ou atualização de schema_migrations. Não alterar estado privado do executor para adotar este PR de manutenção. Fonte canônica e remoto têm identidades distintas; um futuro executor deve reconhecer os mapas e recusar replay, não usar db push às cegas.

## Limites

A CI passa a recriar os20SQLs canônicos e o efeito dos2overlays; não promete réplica de dados, Auth, baseline gerenciada ou configuração operacional do ambiente hospedado. Não integra adapters/front de mídia nem muda política de produto, entitlement, limiares, autonomy, approval ou acesso. O achado histórico UPDATE I-04 e o aceite autenticado permanecem abertos. Produção hysigyhfpyyydycxxpsm não é alterada.

Exigir CI do head exato, revisão das mutações, hashes independentes e confirmação de histórico remoto inalterado após a integração Git. Resultados ficam nos checkpoints e no PR.
