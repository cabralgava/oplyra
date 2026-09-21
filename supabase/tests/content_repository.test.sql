-- CR-009 — boundary tests de persistência e RLS do contentRepository.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select has_schema('content', 'schema content existe fora da Data API');
select is(has_schema_privilege('public', 'content', 'USAGE'), false,
          'public não possui USAGE no schema content');
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'content' and c.relname in ('copy_drafts', 'copy_variants')
      and c.relrowsecurity and c.relforcerowsecurity),
  2, 'RLS está habilitada e forçada nas duas tabelas de conteúdo');
select is(has_table_privilege('oplyra_worker_exec', 'content.copy_drafts', 'SELECT'), true,
          'worker possui leitura de drafts');
select is(has_table_privilege('oplyra_worker_exec', 'content.copy_drafts', 'INSERT'), true,
          'worker possui inserção de drafts após a CR-012');
select is(has_table_privilege('oplyra_worker_exec', 'content.copy_drafts', 'UPDATE'), false,
          'worker não possui atualização de drafts nesta etapa');
select is(has_table_privilege('oplyra_worker_exec', 'content.copy_drafts', 'DELETE'), false,
          'worker não possui exclusão de drafts nesta etapa');

insert into content.copy_drafts (tenant_id, draft_ref, version, source_action) values
  ('11111111-1111-4111-8111-111111111111', 'pgtap-cr009-a', 1, 'create_copy_variants'),
  ('22222222-2222-4222-8222-222222222222', 'pgtap-cr009-b', 1, 'create_copy_variants');
insert into content.copy_variants
  (tenant_id, draft_ref, variant_ref, position, headline, primary_text, cta) values
  ('11111111-1111-4111-8111-111111111111', 'pgtap-cr009-a', 'pgtap-var-a1', 0, 'A1', 'Texto A1', 'request_demo'),
  ('11111111-1111-4111-8111-111111111111', 'pgtap-cr009-a', 'pgtap-var-a2', 1, 'A2', 'Texto A2', 'request_demo'),
  ('22222222-2222-4222-8222-222222222222', 'pgtap-cr009-b', 'pgtap-var-b1', 0, 'B1', 'Texto B1', 'request_demo');

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'content' and tablename in ('copy_drafts', 'copy_variants')
      and cmd = 'SELECT' and qual like '%app.current_tenant()%'
      and qual like '%app.tenant_is_authorized()%'
      and qual like '%app.is_worker()%'),
  2, 'as duas políticas de leitura exigem tenant ativo, autorização e worker');
select is(has_schema_privilege('authenticated', 'content', 'USAGE'), false,
          'authenticated não acessa diretamente o schema de conteúdo');
select is(has_table_privilege('oplyra_worker_login', 'content.copy_drafts', 'SELECT'), false,
          'login do worker não recebe privilégio direto');
select is(
  (select count(*)::int from information_schema.table_constraints
    where constraint_schema = 'content' and table_name = 'copy_variants'
      and constraint_type = 'FOREIGN KEY'),
  1, 'variantes possuem FK composta para o draft do mesmo tenant');
select throws_ok(
  $$update content.copy_drafts
       set tenant_id = '22222222-2222-4222-8222-222222222222'
     where tenant_id = '11111111-1111-4111-8111-111111111111' and draft_ref = 'pgtap-cr009-a'$$,
  'tenant_id é imutável (tabela copy_drafts)',
  'tenant_id do draft é imutável');

select * from finish();
rollback;
