# CR-067 — Conciliação Git/CI das migrations de Estratégia e Runtime já aplicadas em develop

**Status:** `approved` para a conciliação técnica solicitada explicitamente pelo proprietário em18/11/2026; não representa aprovação comercial, revisão humana dos bytes, emissão de release ou autorização produtiva.
**Classificação:** `develop_history_reconciliation_no_apply`.
**Destino exclusivo:** GitHub cabralgava/oplyra, base develop. Supabase eqpvjydnqbbawpkeizys somente leitura. Netlify oplyra-develop sem alteração funcional.
**Autoridade:** instrução do proprietário: continuar conciliando as migrations17/18 e seus testes no Git e na CI, sem reaplicar SQL em develop, preservando trabalho e produção.

## Conteúdo e correspondência

- 20261111000017_strategy.sql: SHA-256 f925e1ed287cf05f674e07d0f82cc3f8a946aa693465fb38bc236c1ebdd5421c; registro remoto20261116211241, name strategy.
- 20261111000018_runtime.sql: SHA-256 583533d6e3a036cf4cda991a13509bb1ac943e657cbe1b2ec1beb90fbb65f2a8; registro remoto20261116211251, name runtime.

Os dois hashes foram calculados por leitura do SQL armazenado em supabase_migrations.schema_migrations e recomputados sobre os arquivos locais. Cada registro remoto contém1 statement, sem diferença de conteúdo. As fontes canônicas conservam seus nomes e bytes; não renomear timestamps para simular execução. O mapa declarativo em deploy/develop/migrations-17-18-reconciliation.json registra as duas identidades, não executa SQL e não repara o histórico.

CR-042/043 preservados integralmente como autorizações locais históricas. CR-057 e a instrução atual estabelecem o escopo específico de develop; este complemento não promove as propostas de domínio, ADR-0006, DP-12a/b, DP-29, entitlement, autonomia ou campos pendentes a decisões aprovadas. Achado histórico UPDATE entre empresas continua aberto.

## Git, CI e segurança

A CI recria banco descartável local, isolado do Supabase hospedado, aplicando as fontes000001–000018. Acrescentar testes pgTAP, unidades com fakes e integração com papéis reais/concorrência necessários para exercer os adaptadores já versionados. Fakes não comprovam banco. Nenhum frontend, dependência, runner, allowlist, catálogo de execução de migrations ou credencial é alterado.

O perfil corrente2.23 passa a admitir SOMENTE os dois caminhos/hashes adicionais; alteração de bytes, retirada da autorização, troca do destino/mapa ou migration extra falham. Validador histórico2.22, releases, manifests/Freeze e fontes000001–000016 são preservados. Inventário corrente é conciliado somente para os arquivos selecionados; não copiar o inventário sujo.

Conferência do painel de integrações Supabase em18/11: campo GitHub repository sem repositório escolhido (Choose GitHub repository), tanto em develop quanto na configuração herdada. Leitura apenas; nenhuma integração foi criada, removida ou alterada. Workflow versionado da CI não publica migrations remotas. Não conectar automação de migrations como parte deste CR.

## Limites e operação

Não executar develop:migrate, db push, repair, reset, seed, DDL remoto ou merge de branch Supabase. Não editar supabase_migrations.schema_migrations nem duplicar entradas aplicadas. Local/CI usam versões canônicas; remoto conserva versões geradas, vinculadas pelo mapa de conteúdo. Isso NÃO torna seguro um futuro db push/merge automático: o plano futuro deve consultar o mapa e recusar reaplicação.

19/20 de mídia, baseline e dois overlays de search_path permanecem fora desta conciliação. A CI desta fatia representa as fontes17/18, não todos os hardenings/integrações já existentes no remoto. Consolidação desses itens exige fatia própria; não alegar equivalência total entre CI e ambiente hospedado.

## Validação

Exigir hashes independentes, recusa por mutações do perfil/mapa e CI completa no head do PR: tipos, testes unitários/integração, pgTAP, E2E existente, scanner e build. Não declarar aceites autenticados ou encerramento do achado I-04 com CI verde. Resultados e versão ficam nos checkpoints e na descrição do PR.
