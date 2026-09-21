-- CR-015 — papéis e superfície de privilégio do dispatcher.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

select is(
  (select count(*)::int from pg_roles
    where rolname in ('oplyra_dispatcher_login', 'oplyra_dispatcher_exec')),
  2, 'papéis dedicados de login e execução existem');
select is(pg_has_role('oplyra_dispatcher_login', 'oplyra_dispatcher_exec', 'MEMBER'), true,
          'login pode assumir somente o papel de execução concedido');
select is(
  (select count(*)::int from information_schema.table_privileges
    where grantee = 'oplyra_dispatcher_login'),
  0, 'login do dispatcher não possui privilégio direto em tabela');
select is(has_table_privilege('oplyra_dispatcher_exec', 'content.event_outbox', 'SELECT'), false,
          'dispatcher exec não lê a outbox diretamente');
select is(has_table_privilege('oplyra_dispatcher_exec', 'content.event_outbox', 'UPDATE'), false,
          'dispatcher exec não altera a outbox diretamente');
select is(has_table_privilege('oplyra_dispatcher_exec', 'content.event_consumer_deduplication', 'SELECT'), false,
          'dispatcher exec não lê deduplicação diretamente');
select is(has_table_privilege('oplyra_dispatcher_exec', 'content.event_consumer_deduplication', 'INSERT'), false,
          'dispatcher exec não insere deduplicação diretamente');
select is(has_table_privilege('oplyra_dispatcher_exec', 'content.event_consumer_deduplication', 'UPDATE'), false,
          'dispatcher exec não altera deduplicação diretamente');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app' and p.proname in ('claim_outbox_events', 'settle_outbox_event')),
  2, 'duas funções controladas formam a boundary do dispatcher');
select is(has_function_privilege('oplyra_dispatcher_exec',
  'app.claim_outbox_events(uuid,text,integer,integer,timestamptz)', 'EXECUTE'), true,
  'dispatcher exec pode executar claim');
select is(has_function_privilege('oplyra_dispatcher_exec',
  'app.settle_outbox_event(uuid,text,text,text,integer,text,text,timestamptz,timestamptz,jsonb)', 'EXECUTE'), true,
  'dispatcher exec pode executar settlement');
select is(has_function_privilege('public',
  'app.claim_outbox_events(uuid,text,integer,integer,timestamptz)', 'EXECUTE'), false,
  'public não executa claim');
select is(has_function_privilege('public',
  'app.settle_outbox_event(uuid,text,text,text,integer,text,text,timestamptz,timestamptz,jsonb)', 'EXECUTE'), false,
  'public não executa settlement');
select is(has_function_privilege('oplyra_worker_exec',
  'app.claim_outbox_events(uuid,text,integer,integer,timestamptz)', 'EXECUTE'), false,
  'writer não executa claim');
select is(has_function_privilege('oplyra_worker_exec',
  'app.settle_outbox_event(uuid,text,text,text,integer,text,text,timestamptz,timestamptz,jsonb)', 'EXECUTE'), false,
  'writer não executa settlement');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app' and p.proname in ('claim_outbox_events', 'settle_outbox_event')
      and p.prosecdef),
  2, 'as duas funções usam security definer para evitar grants de tabela');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app' and p.proname in ('claim_outbox_events', 'settle_outbox_event')
      and 'search_path=pg_catalog, pg_temp' = any(p.proconfig)),
  2, 'as duas funções fixam search_path seguro');
select is(has_schema_privilege('oplyra_dispatcher_exec', 'content', 'USAGE'), false,
          'dispatcher não recebe acesso direto ao schema content');
select is(has_schema_privilege('oplyra_dispatcher_exec', 'app', 'USAGE'), true,
          'dispatcher acessa somente a API controlada do schema app');

select * from finish();
rollback;
