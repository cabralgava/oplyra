# CR-058 — Hardening de search_path para develop

## Execução em develop — 2026-11-16 18:40

**Estado de execução:** aplicado somente em develop eqpvjydnqbbawpkeizys, após as18 migrations; não é aceite produtivo, release emitida ou revisão humana presumida dos bytes. Registros posteriores substituem o estado proposto anterior, preservado abaixo.

- Hardening de base: remoto 20261116211333, SHA-256 `1eb1ff59a19625fac34f73371e1dee1224f9b6cfe4087f37b8050b1312d26908`.
- Complemento de validadores: deploy/develop/supabase/migrations/20261116211348_harden_domain_validator_search_paths.sql, remoto 20261116211501, SHA-256 `a65156b4e48fb3176997290e05630a0da2e41602408f4ad09debaeb53878881a`. Somente SET search_path de brand.evidence_valid(jsonb), strategy.kpis_valid(jsonb), method_valid(jsonb), method_complete(jsonb), variants_valid(jsonb); corpos/ACL/owner/SECURITY/volatilidade preservados.

Após concluir as18, o advisor passou a listar11 avisos:6 da base (legada removida pela000015) +5 validadores. As duas correções deixaram0 WARN/ERROR. Restam5 INFO rls_enabled_no_policy, intencionais em tabelas internas de acesso exclusivo por funções. SELECT/INSERT/UPDATE/DELETE diretos negados em35 combinações de7 papéis e5 tabelas, incluindo anon/authenticated/service_role e papéis oplyra. Nenhuma política permissiva foi criada para mascarar o aviso.

Teste focal expandido:21 casos locais, incluindo cinco pares válido/inválido, preservação de metadados e path hostil para method_complete. Remover a fixação dessa função foi detectado por mutação; SQL restaurado. Validação final selecionada538/538 em27 arquivos; pgTAP561/561 em20 e typecheck passaram na árvore compartilhada atual. Os números anteriores são históricos. SQL local sempre revertido. Smoke de isolamento remoto não executado por expiração da confirmação; não declarar segurança HTTP/JWT comprovada. As18 migrations canônicas e seus hashes permaneceram intactos; overlays fora do perfil de produção.

## Proposta e validação anteriores (histórico)

**Status:** proposed; correção validada localmente, não aplicada no remoto. **Pedido:** 16/11/2026, retomar13 migrations de develop, tratar avisos e preparar conexão Netlify, preservando produção/frontend. A aplicação da000006 foi cancelada pelo cliente antes de SQL; não houve nova tentativa ou fallback. O histórico continua baseline+5.

## Diagnóstico

Advisor em develop aponta7 funções app com search_path mutável: current_user_id, current_tenant, is_worker, is_operator, tenant_is_authorized, forbid_tenant_change, ensure_tenant_keeps_owner. Definições/proconfig conferidos somente por leitura. Seis continuam após a000018; a000015 remove a função legada ensure_tenant_keeps_owner e instala tenant_owner_guard já com caminho fixo. Não recriar a função removida.

## Mudança aditiva candidata

Arquivo gerado por `supabase migration new` com workdir isolado develop: `deploy/develop/supabase/migrations/20261116202506_harden_application_function_search_paths.sql`. SHA-256 `1eb1ff59a19625fac34f73371e1dee1224f9b6cfe4087f37b8050b1312d26908`. Fixa search_path em pg_catalog, pg_temp nas seis funções obrigatórias; ajusta a legada somente se já existir. Função obrigatória ausente causa falha. Não modifica corpos, owner, SECURITY INVOKER/DEFINER, ACLs, políticas ou as18 migrations congeladas. Não traz seed ou credencial.

É overlay separado de develop, fora de supabase/migrations; não é uma000019 silenciosamente adicionada ao conjunto aprovado nem entra no perfil produtivo15/18. Promoção futura ao conjunto canônico exige reconciliação governada própria. Aplicar preferencialmente após terminar as18 e reconsultar advisor; este fix cobre os7 avisos observados e não promete remover avisos que possam surgir nas migrations restantes.

## Prova local

packages/infra/test/develop-search-path.integration.test.ts:9 testes, todas as alterações revertidas em transação local. Compara corpo, owner, ACL, SECURITY e proconfig antes/depois; verifica idempotência, presença/ausência da função legada, resolução sob path hostil e acesso autenticado com duas empresas, INSERT/UPDATE alheios negados, tenant ausente e proteção do último Owner. Confere metadados originais após rollback.

Mutação dirigida: retirar só a fixação de app.current_tenant faz o teste de path hostil falhar. SQL restaurado byte a byte; transação revertida. O teste usa schema hostil criado pelo administrador somente como fixture: não comprova que um usuário externo consiga criar esse schema na aplicação real, nem explica o episódio histórico I-04.

Validação final selecionada:515/515 em26 arquivos, typecheck e545pgTAP passaram. Sem build/E2E ou suite completa de produto nova. Nenhuma alteração persistente local, SQL/DDL remoto desta retomada, segredo de banco ou política de produção. Avisos permanecem7 até aplicação autorizada e conferência posterior.

## Operação futura

Conferir destino eqpvjydnqbbawpkeizys/develop e histórico conhecido antes de qualquer execução. Depois de aplicar, conferir proconfig das assinaturas, direitos inalterados, advisor, isolamento e logins por mecanismo seguro. Não usar execute_sql ou CLI como alternativa à confirmação cancelada. Não reescrever histórico gerado pelo conector. Revisão humana dos bytes e eventual promoção produtiva não foram fabricadas por este CR.

Referências: [Supabase — aviso de search_path mutável](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [PostgreSQL17 — ALTER FUNCTION](https://www.postgresql.org/docs/17/sql-alterfunction.html).
