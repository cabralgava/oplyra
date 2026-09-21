-- CR-012 — estrutura, privilégios e RLS da escrita atômica.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

select is(
  (select count(*)::int from information_schema.tables
    where table_schema = 'content' and table_name in ('action_idempotency', 'event_outbox')),
  2, 'as duas tabelas transacionais existem');
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'content' and c.relname in ('action_idempotency', 'event_outbox')
      and c.relrowsecurity and c.relforcerowsecurity),
  2, 'RLS está habilitada e forçada nas tabelas transacionais');
select is(
  (select count(*)::int from information_schema.triggers
    where event_object_schema = 'content'
      and event_object_table in ('action_idempotency', 'event_outbox')
      and trigger_name like '%tenant_imutavel'),
  2, 'tenant_id é protegido por trigger nas duas tabelas');

select is(has_table_privilege('oplyra_worker_exec', 'content.copy_drafts', 'INSERT'), true,
          'worker pode inserir drafts');
select is(has_table_privilege('oplyra_worker_exec', 'content.copy_variants', 'INSERT'), true,
          'worker pode inserir variantes');
select is(has_table_privilege('oplyra_worker_exec', 'content.action_idempotency', 'SELECT'), true,
          'worker pode consultar idempotência no tenant ativo');
select is(has_table_privilege('oplyra_worker_exec', 'content.action_idempotency', 'INSERT'), true,
          'worker pode criar claim idempotente');
select is(has_table_privilege('oplyra_worker_exec', 'content.action_idempotency', 'UPDATE'), true,
          'worker pode concluir claim idempotente');
select is(has_table_privilege('oplyra_worker_exec', 'content.action_idempotency', 'DELETE'), false,
          'worker não pode apagar histórico idempotente');
select is(has_table_privilege('oplyra_worker_exec', 'content.event_outbox', 'INSERT'), true,
          'writer pode inserir outbox pendente');
select is(has_table_privilege('oplyra_worker_exec', 'content.event_outbox', 'SELECT'), false,
          'writer não pode ler a outbox');
select is(has_table_privilege('oplyra_worker_exec', 'content.event_outbox', 'UPDATE'), false,
          'writer não pode despachar ou alterar a outbox');
select is(has_schema_privilege('authenticated', 'content', 'USAGE'), false,
          'authenticated permanece sem acesso direto ao schema content');
select is(has_table_privilege('oplyra_worker_login', 'content.action_idempotency', 'SELECT'), false,
          'login do worker continua sem privilégio direto');
select is(
  (select count(*)::int from pg_constraint
    where connamespace = 'content'::regnamespace
      and conname = 'event_outbox_one_draft_created_version'),
  1, 'outbox impede duplicar o evento da mesma versão do draft');
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'content'
      and tablename in ('copy_drafts', 'copy_variants', 'action_idempotency', 'event_outbox')
      and (qual like '%app.current_tenant()%' or with_check like '%app.current_tenant()%')),
  8, 'as oito políticas de conteúdo exigem tenant ativo');

select * from finish();
rollback;
