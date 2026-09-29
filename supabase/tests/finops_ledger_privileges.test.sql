-- CR-027 — superfície de privilégio do Cost Ledger: RLS forçada, nenhuma
-- policy ou grant de tabela, funções hardened e EXECUTE efetivo somente para o
-- papel listado no CR-027 §6.2.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

select has_schema('finops', 'schema finops existe');
select is(
  (select count(*)::int from pg_tables where schemaname = 'finops'
    and tablename in ('budget_periods', 'model_attempts', 'model_call_records', 'cost_ledger_entries')),
  4, 'as quatro tabelas do Ledger existem');
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'finops' and c.relkind = 'r' and c.relrowsecurity and c.relforcerowsecurity),
  4, 'RLS habilitada e forçada nas quatro tabelas');
select is((select count(*)::int from pg_policies where schemaname = 'finops'), 0,
  'nenhuma policy: sem acesso direto por papel de aplicação');
select is(
  (select count(*)::int
     from unnest(array['anon', 'authenticated', 'service_role', 'oplyra_worker_exec', 'oplyra_ops_exec',
                       'oplyra_dispatcher_exec', 'oplyra_worker_login', 'oplyra_ops_login',
                       'oplyra_dispatcher_login', 'oplyra_web_login']) r(role)
     cross join unnest(array['finops.budget_periods', 'finops.model_attempts', 'finops.model_call_records',
                             'finops.cost_ledger_entries']) t(tab)
     cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p(priv)
    where has_table_privilege(r.role, t.tab, p.priv)),
  0, 'nenhum privilégio de tabela finops para papel de aplicação');
select is(
  (select count(*)::int
     from unnest(array['anon', 'authenticated', 'oplyra_worker_exec', 'oplyra_ops_exec', 'oplyra_dispatcher_exec']) r(role)
    where has_schema_privilege(r.role, 'finops', 'USAGE')),
  0, 'nenhum papel de aplicação usa o schema finops diretamente');
select is(
  (select count(*)::int from pg_roles
    where (rolname like 'oplyra\_%' or rolname in ('anon', 'authenticated')) and rolbypassrls),
  0, 'nenhum papel de aplicação tem BYPASSRLS');

-- Funções da boundary: definer, search_path fixo, dono explícito.
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app' and p.proname in ('acquire_model_attempt', 'close_model_attempt', 'budget_remaining',
      'expire_next_model_attempt', 'reconcile_model_attempt', 'open_budget_period', 'close_budget_period')),
  7, 'sete funções formam a boundary do Ledger (sem sobrecarga)');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app' and p.proname in ('acquire_model_attempt', 'close_model_attempt', 'budget_remaining',
      'expire_next_model_attempt', 'reconcile_model_attempt', 'open_budget_period', 'close_budget_period')
      and p.prosecdef and 'search_path=pg_catalog, pg_temp' = any(p.proconfig)
      and pg_get_userbyid(p.proowner) = 'postgres'),
  7, 'as sete são security definer, com search_path fixo e dono postgres');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'finops' and pg_get_userbyid(p.proowner) <> 'postgres'),
  0, 'utilidades finops pertencem ao dono das tabelas');

-- EXECUTE efetivo: worker.
select is(has_function_privilege('oplyra_worker_exec',
  'app.acquire_model_attempt(uuid,text,text,text,integer,text,text,text,text[],bigint,text,integer,timestamptz)', 'EXECUTE'), true,
  'worker executa acquire');
select is(has_function_privilege('oplyra_worker_exec',
  'app.close_model_attempt(uuid,text,text,integer,uuid,text,bigint,text,text,jsonb)', 'EXECUTE'), true,
  'worker executa close');
select is(has_function_privilege('oplyra_worker_exec', 'app.budget_remaining(uuid,text)', 'EXECUTE'), true,
  'worker executa budget_remaining');
select is(has_function_privilege('oplyra_worker_exec', 'app.expire_next_model_attempt(uuid)', 'EXECUTE'), true,
  'worker executa o sweep');
-- EXECUTE efetivo: operador.
select is(has_function_privilege('oplyra_ops_exec',
  'app.reconcile_model_attempt(uuid,text,text,integer,bigint,text,text)', 'EXECUTE'), true, 'operador executa conciliação');
select is(has_function_privilege('oplyra_ops_exec',
  'app.open_budget_period(uuid,text,text,timestamptz,timestamptz,bigint,text)', 'EXECUTE'), true, 'operador abre período');
select is(has_function_privilege('oplyra_ops_exec', 'app.close_budget_period(uuid,text,text)', 'EXECUTE'), true,
  'operador fecha período');

-- Nenhum outro papel executa: PUBLIC, anon, authenticated, service_role, dispatcher e o papel não listado.
select is(
  (select count(*)::int
     from (values
       ('app.acquire_model_attempt(uuid,text,text,text,integer,text,text,text,text[],bigint,text,integer,timestamptz)', 'oplyra_worker_exec'),
       ('app.close_model_attempt(uuid,text,text,integer,uuid,text,bigint,text,text,jsonb)', 'oplyra_worker_exec'),
       ('app.budget_remaining(uuid,text)', 'oplyra_worker_exec'),
       ('app.expire_next_model_attempt(uuid)', 'oplyra_worker_exec'),
       ('app.reconcile_model_attempt(uuid,text,text,integer,bigint,text,text)', 'oplyra_ops_exec'),
       ('app.open_budget_period(uuid,text,text,timestamptz,timestamptz,bigint,text)', 'oplyra_ops_exec'),
       ('app.close_budget_period(uuid,text,text)', 'oplyra_ops_exec')
     ) f(sig, listed)
     cross join unnest(array['public', 'anon', 'authenticated', 'service_role', 'oplyra_dispatcher_exec',
                             'oplyra_worker_exec', 'oplyra_ops_exec', 'oplyra_web_login']) r(role)
    where r.role <> f.listed and has_function_privilege(r.role, f.sig, 'EXECUTE')),
  0, 'EXECUTE somente para o papel listado em cada função');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     cross join unnest(array['public', 'anon', 'authenticated', 'service_role', 'oplyra_worker_exec',
                             'oplyra_ops_exec', 'oplyra_dispatcher_exec']) r(role)
    where n.nspname = 'finops' and has_function_privilege(r.role, p.oid, 'EXECUTE')),
  0, 'utilidades internas finops não são executáveis por papel de aplicação');
select is(
  (select count(*)::int from information_schema.routine_privileges
    where routine_schema = 'app' and grantee = 'PUBLIC'
      and routine_name in ('acquire_model_attempt', 'close_model_attempt', 'budget_remaining',
        'expire_next_model_attempt', 'reconcile_model_attempt', 'open_budget_period', 'close_budget_period')),
  0, 'nenhum grant a PUBLIC nas funções do Ledger');

-- Nenhuma assinatura recebe instante decisório (CR-027 §6.1).
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     cross join unnest(p.proargnames) a(nome)
    where n.nspname = 'app' and p.proname in ('acquire_model_attempt', 'close_model_attempt', 'budget_remaining',
      'expire_next_model_attempt', 'reconcile_model_attempt', 'close_budget_period')
      and a.nome in ('p_requested_at', 'p_closed_at', 'p_now', 'p_at', 'p_settled_at', 'p_expires_at')),
  0, 'nenhuma função recebe requestedAt, closedAt, now ou at');
select is(
  (select pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app' and p.proname = 'expire_next_model_attempt'),
  'p_tenant_id uuid', 'o sweep recebe somente o tenant');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app' and p.proname = 'acquire_model_attempt'
      and pg_get_function_identity_arguments(p.oid) like '%p_client_observed_at timestamp with time zone%'),
  1, 'acquire recebe apenas clientObservedAt, metadado não autoritativo');
select is(
  (select count(*)::int from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'finops' and not t.tgisinternal),
  7, 'triggers de tenant imutável, identidade imutável, registro imutável, diário append-only e sem delete direto');

select * from finish();
rollback;
