-- Matriz de isolamento do I-01 (15 §3). Roda com `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

\set TA '11111111-1111-4111-8111-111111111111'
\set TB '22222222-2222-4222-8222-222222222222'
\set A_OWNER 'a0000001-0000-4000-8000-000000000001'
\set A_VIEWER 'a0000003-0000-4000-8000-000000000003'
\set A_REMOVIDO 'a0000004-0000-4000-8000-000000000004'
\set AB_USER 'ab000005-0000-4000-8000-000000000005'

-- ------------------------------------------------ RLS habilitada e forçada
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'core' and c.relkind = 'r'
      and c.relname in ('tenants','memberships','invitations','audit_log','tenant_entitlements')
      and c.relrowsecurity and c.relforcerowsecurity),
  5, 'RLS habilitada E forçada nas cinco tabelas de empresa');

-- --------------------------------------- papéis de login sem privilégio
select is(
  (select count(*)::int from information_schema.table_privileges
    where table_schema = 'core' and grantee in ('oplyra_web_login','oplyra_worker_login','oplyra_ops_login')),
  0, 'papéis de login não têm privilégio direto em nenhuma tabela');

-- ------------------------------------------------------- contexto: Owner de A
set local role authenticated;
select set_config('request.jwt.claim.sub', :'A_OWNER', true);
select set_config('app.tenant_id', :'TA', true);

select is((select count(*)::int from core.tenants), 1, 'Owner de A enxerga exatamente a própria empresa');
-- Contagem dos vínculos SEMEADOS: o banco local também recebe dados de outros
-- testes e da interface, e o que importa aqui é o isolamento, não o total.
select is((select count(*)::int from core.memberships
            where user_id in ('a0000001-0000-4000-8000-000000000001','a0000002-0000-4000-8000-000000000002',
                              'a0000003-0000-4000-8000-000000000003','a0000004-0000-4000-8000-000000000004',
                              'ab000005-0000-4000-8000-000000000005')),
          5, 'Owner de A enxerga os cinco vínculos semeados de A');
select is((select count(*)::int from core.memberships where tenant_id <> :'TA'::uuid), 0,
          'nenhum vínculo de outra empresa aparece');
select lives_ok($$insert into core.invitations (tenant_id, email, role_key, token_hash, expires_at, invited_by)
                  values ('11111111-1111-4111-8111-111111111111','pgtap-novo@local.test','viewer','hash-pgtap-1', now() + interval '7 days',
                          'a0000001-0000-4000-8000-000000000001')$$,
                'Owner convida na própria empresa');
select throws_ok($$insert into core.invitations (tenant_id, email, role_key, token_hash, expires_at, invited_by)
                   values ('22222222-2222-4222-8222-222222222222','pgtap-invasao@local.test','viewer','hash-pgtap-2', now() + interval '7 days',
                           'a0000001-0000-4000-8000-000000000001')$$,
                 '42501', null, 'Owner de A não convida na empresa B');
select is((select count(*)::int from core.audit_log where tenant_id <> :'TA'::uuid), 0,
          'nenhuma entrada de auditoria de outra empresa é visível');
select throws_ok($$update core.memberships set tenant_id = '22222222-2222-4222-8222-222222222222'
                   where user_id = 'a0000003-0000-4000-8000-000000000003'$$,
                 'tenant_id é imutável (tabela memberships)', 'trocar a empresa de um vínculo é negado');

-- --------------------------------------------- contexto: empresa forjada
select set_config('app.tenant_id', :'TB', true);
select is((select count(*)::int from core.tenants), 0, 'Owner de A com empresa B ativa não enxerga nada');
select is((select count(*)::int from core.memberships), 0, 'nem os vínculos de B');

-- ------------------------------------ contexto: usuário de duas empresas
-- Regressão do achado do EXP-01: ele deve ver apenas a empresa ATIVA.
select set_config('request.jwt.claim.sub', :'AB_USER', true);
select set_config('app.tenant_id', :'TA', true);
select is((select count(*)::int from core.memberships where tenant_id = :'TB'::uuid), 0,
          'usuário de duas empresas, com A ativa, não enxerga B');
select set_config('app.tenant_id', :'TB', true);
select is((select count(*)::int from core.memberships where tenant_id = :'TA'::uuid), 0,
          'o mesmo usuário, com B ativa, não enxerga A');
select is((select count(*)::int from core.tenants), 1, 'e enxerga exatamente a empresa ativa');

-- ---------------------------------------------- contexto: vínculo revogado
select set_config('request.jwt.claim.sub', :'A_REMOVIDO', true);
select set_config('app.tenant_id', :'TA', true);
select is((select count(*)::int from core.tenants), 0, 'vínculo revogado não enxerga a empresa');
select is((select count(*)::int from core.memberships), 0, 'vínculo revogado não enxerga a equipe');

-- ------------------------------------------------- contexto: papel Leitura
select set_config('request.jwt.claim.sub', :'A_VIEWER', true);
select is((select count(*)::int from core.memberships
            where user_id in ('a0000001-0000-4000-8000-000000000001','a0000002-0000-4000-8000-000000000002',
                              'a0000003-0000-4000-8000-000000000003','a0000004-0000-4000-8000-000000000004',
                              'ab000005-0000-4000-8000-000000000005')),
          5, 'Leitura enxerga a equipe');
select throws_ok($$insert into core.invitations (tenant_id, email, role_key, token_hash, expires_at, invited_by)
                   values ('11111111-1111-4111-8111-111111111111','x@local.test','viewer','hash-pgtap-3', now() + interval '7 days',
                           'a0000003-0000-4000-8000-000000000003')$$,
                 '42501', null, 'Leitura não convida');

-- -------------------------------------------------- último Owner protegido
reset role;
select throws_ok($$update core.memberships set status = 'revoked', revoked_at = now()
                   where tenant_id = '11111111-1111-4111-8111-111111111111' and role_key = 'owner'$$,
                 'a empresa ficaria sem Owner ativo', 'o último Owner não pode ser revogado');

select * from finish();
rollback;
