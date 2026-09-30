-- CR-028 — guarda do último Owner (B-3) e proteções de exclusão do FinOps
-- (D-18). Tudo em uma transação desfeita, com empresas sintéticas próprias.
begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

\set TX 'c2800000-0000-4000-8000-0000000000a1'
\set TY 'c2800000-0000-4000-8000-0000000000b2'
\set OWN1 'c2800000-0000-4000-8000-000000000011'
\set OWN2 'c2800000-0000-4000-8000-000000000012'
\set OWNY 'c2800000-0000-4000-8000-000000000021'
\set OP '0e000000-0000-4000-8000-0000000000c2'

insert into core.tenants (id, name, slug, plan_key) values
  (:'TX', 'Empresa X CR-028 (fictícia)', 'cr028-x', 'performance'),
  (:'TY', 'Empresa Y CR-028 (fictícia)', 'cr028-y', 'performance');
insert into core.memberships (tenant_id, user_id, role_key) values
  (:'TX', :'OWN1', 'owner'), (:'TY', :'OWNY', 'owner');

-- Dados do Ledger nas duas empresas: período, tentativa fechada (registro + lançamentos).
create function pg_temp.ledger(t uuid) returns void language plpgsql as $$
declare v_call text := finops.attempt_call_id(t, 'create_ad_copy', 'inv-cr028', 1);
        v_fp text := 'hmac-sha256:v1:k1:' || repeat('a', 64);
begin
  perform set_config('app.tenant_id', t::text, true);
  perform set_config('app.operator_id', '0e000000-0000-4000-8000-0000000000c2', true);
  perform app.open_budget_period(t, 'tenant', null, now() - interval '1 day', now() + interval '1 day', 100000, 'cr-028 teste');
  perform app.acquire_model_attempt(t, 'w', 'create_ad_copy', 'inv-cr028', 1, v_call, 'copywriting-agent', v_fp, array[v_fp], 100, 'w', 90, null);
  perform app.close_model_attempt(t, 'create_ad_copy', 'inv-cr028', 1,
    (select fencing_token from finops.model_attempts where tenant_id = t and invocation_id = 'inv-cr028'),
    'charged', 80, 'settled', null,
    jsonb_build_object('invocationId', 'inv-cr028', 'attempt', 1, 'callId', v_call, 'tenantId', t::text, 'workflowKey', 'w',
      'agentKey', 'copywriting-agent', 'actionKey', 'create_ad_copy',
      'trace', jsonb_build_object('correlationId', 'c', 'transactionId', null, 'causationId', null, 'parentTransactionId', null,
        'workflowId', null, 'taskId', null, 'runId', null),
      'requestFingerprint', v_fp, 'dataClassification', 'synthetic',
      'classificationProvenance', jsonb_build_array(jsonb_build_object('kind', 'conservative_default', 'ref', null, 'tenantId', t::text, 'classification', 'synthetic')),
      'inputTokensEstimate', 1, 'inputTokensEstimateMethod', 'conservative_bound', 'profileRef', 'p@1', 'registryVersion', 'r',
      'modelId', 'm', 'provider', 'p', 'adapterKey', 'test', 'providerModelId', 'p/m', 'tariffVersion', 't', 'routingReason', 'preferred',
      'fallbackOccurred', false, 'resolvedProvider', 'p', 'resolvedProviderModelId', 'p/m', 'externalRequestId', null,
      'outcome', 'succeeded', 'failureKind', null, 'usage', jsonb_build_object('inputTokens', 1, 'outputTokens', 1, 'images', 0),
      'outputAssetIds', null, 'estimatedCostMicroUsd', 100, 'costMicroUsd', 80, 'costStatus', 'settled',
      'startedAt', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'latencyMs', 1));
end $$;
select pg_temp.ledger(:'TX');
select pg_temp.ledger(:'TY');

create function pg_temp.linhas(t uuid) returns bigint language sql as $$
  select (select count(*) from core.memberships where tenant_id = t) + (select count(*) from core.audit_log where tenant_id = t)
       + (select count(*) from finops.budget_periods where tenant_id = t) + (select count(*) from finops.model_attempts where tenant_id = t)
       + (select count(*) from finops.model_call_records where tenant_id = t) + (select count(*) from finops.cost_ledger_entries where tenant_id = t) $$;

-- ------------------------------------------------ atributos das funções
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname, p.proname) in (('app', 'tenant_owner_guard'), ('finops', 'forbid_record_mutation'),
                                     ('finops', 'forbid_entry_mutation'), ('finops', 'forbid_direct_delete'))
      and p.prosecdef and 'search_path=pg_catalog, pg_temp' = any(p.proconfig) and pg_get_userbyid(p.proowner) = 'postgres'),
  4, 'as quatro funções de guarda são security definer, search_path fixo e dono postgres');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     cross join unnest(array['public', 'anon', 'authenticated', 'service_role', 'oplyra_worker_exec', 'oplyra_ops_exec',
                             'oplyra_dispatcher_exec', 'oplyra_web_login', 'oplyra_worker_login', 'oplyra_ops_login',
                             'oplyra_dispatcher_login']) r(role)
    where (n.nspname, p.proname) in (('app', 'tenant_owner_guard'), ('finops', 'forbid_record_mutation'),
                                     ('finops', 'forbid_entry_mutation'), ('finops', 'forbid_direct_delete'))
      and has_function_privilege(r.role, p.oid, 'EXECUTE')),
  0, 'nenhum papel de aplicação executa as funções de guarda');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app' and p.proname = 'ensure_tenant_keeps_owner'), 0, 'função antiga removida');
select is(
  (select p.proname::text from pg_trigger tg join pg_proc p on p.oid = tg.tgfoid
    where tg.tgrelid = 'core.memberships'::regclass and tg.tgname = 'memberships_preserva_owner'),
  'tenant_owner_guard', 'constraint trigger recriado com a nova função');
select ok((select tgconstraint <> 0 and tgdeferrable and not tginitdeferred from pg_trigger
            where tgrelid = 'core.memberships'::regclass and tgname = 'memberships_preserva_owner'),
  'trigger continua constraint, deferrable e initially immediate');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname, p.proname) in (('app', 'tenant_owner_guard'), ('finops', 'forbid_record_mutation'),
                                     ('finops', 'forbid_entry_mutation'), ('finops', 'forbid_direct_delete'))
      and p.prosrc like '%pg_trigger_depth%'),
  0, 'nenhuma guarda usa pg_trigger_depth()');

-- ------------------------------------------------ último Owner
select throws_ok($$delete from core.memberships where tenant_id = 'c2800000-0000-4000-8000-0000000000a1'$$,
  '23514', null, 'remover o último Owner é rejeitado');
select throws_ok($$update core.memberships set status = 'revoked', revoked_at = now() where tenant_id = 'c2800000-0000-4000-8000-0000000000a1'$$,
  '23514', null, 'revogar o último Owner é rejeitado');
select throws_ok($$update core.memberships set role_key = 'admin' where tenant_id = 'c2800000-0000-4000-8000-0000000000a1'$$,
  '23514', null, 'rebaixar o último Owner é rejeitado');
insert into core.memberships (tenant_id, user_id, role_key) values (:'TX', :'OWN2', 'owner');
select lives_ok($$delete from core.memberships where tenant_id = 'c2800000-0000-4000-8000-0000000000a1' and user_id = 'c2800000-0000-4000-8000-000000000012'$$,
  'com dois Owners, remover um é permitido');
insert into core.memberships (tenant_id, user_id, role_key) values (:'TX', :'OWN2', 'owner');
select lives_ok($$update core.memberships set role_key = 'admin' where tenant_id = 'c2800000-0000-4000-8000-0000000000a1' and user_id = 'c2800000-0000-4000-8000-000000000012'$$,
  'com dois Owners, rebaixar um é permitido');
select is((select count(*)::int from core.memberships where tenant_id = :'TX' and role_key = 'owner' and status = 'active'), 1,
  'segue exatamente um Owner ativo');

-- Caller sob RLS: o próprio Owner revoga o vínculo; depois disso, sob RLS, não
-- enxergaria mais a empresa. A guarda roda como dono e não vê "tenant ausente".
set local role authenticated;
select set_config('request.jwt.claim.sub', :'OWN1', true);
select set_config('app.tenant_id', :'TX', true);
select throws_ok($$update core.memberships set status = 'revoked', revoked_at = now()
                    where tenant_id = 'c2800000-0000-4000-8000-0000000000a1' and user_id = 'c2800000-0000-4000-8000-000000000011'$$,
  '23514', null, 'Owner sob RLS revogando o próprio vínculo não provoca falso tenant ausente');
reset role;

-- Helper trigger (profundidade > 1) não contorna a guarda.
create schema cr028_bypass;
create table cr028_bypass.gatilho (tenant_id uuid, alvo text);
create function cr028_bypass.executar() returns trigger language plpgsql as $$
begin
  if new.alvo = 'owner' then delete from core.memberships where tenant_id = new.tenant_id and role_key = 'owner';
  elsif new.alvo = 'period' then delete from finops.budget_periods where tenant_id = new.tenant_id;
  elsif new.alvo = 'attempt' then delete from finops.model_attempts where tenant_id = new.tenant_id;
  elsif new.alvo = 'record' then delete from finops.model_call_records where tenant_id = new.tenant_id;
  elsif new.alvo = 'entry' then delete from finops.cost_ledger_entries where tenant_id = new.tenant_id;
  end if;
  return new;
end $$;
create trigger executar after insert on cr028_bypass.gatilho for each row execute function cr028_bypass.executar();
select throws_ok($$insert into cr028_bypass.gatilho values ('c2800000-0000-4000-8000-0000000000a1', 'owner')$$,
  '23514', null, 'delete do último Owner dentro de outro trigger é rejeitado');

-- Constraint diferida não cria bypass enquanto a empresa existir.
select throws_ok($q$do $b$ begin
    set constraints core.memberships_preserva_owner deferred;
    delete from core.memberships where tenant_id = 'c2800000-0000-4000-8000-0000000000a1' and role_key = 'owner';
    set constraints core.memberships_preserva_owner immediate;
  end $b$ $q$,
  '23514', null, 'adiar a constraint e remover o Owner é rejeitado ao reavaliar');
select is((select count(*)::int from core.memberships where tenant_id = :'TX' and role_key = 'owner' and status = 'active'), 1,
  'Owner preservado após as tentativas de bypass');

-- ------------------------------------------------ FinOps: delete direto e cascatas intermediárias
select throws_ok($$delete from finops.budget_periods where tenant_id = 'c2800000-0000-4000-8000-0000000000a1'$$,
  '23514', null, 'delete de período (cascataria tentativas e lançamentos) rejeitado com a empresa existente');
select throws_ok($$delete from finops.model_attempts where tenant_id = 'c2800000-0000-4000-8000-0000000000a1'$$,
  '23514', null, 'delete de tentativa (cascataria registro e lançamentos) rejeitado com a empresa existente');
select throws_ok($$delete from finops.model_call_records where tenant_id = 'c2800000-0000-4000-8000-0000000000a1'$$,
  '23514', null, 'delete de registro rejeitado com a empresa existente');
select throws_ok($$delete from finops.cost_ledger_entries where tenant_id = 'c2800000-0000-4000-8000-0000000000a1'$$,
  '23514', null, 'delete de lançamento rejeitado com a empresa existente');
-- Período sem nenhuma tentativa vinculada: ausência de filho/pai intermediário não autoriza.
select set_config('app.tenant_id', :'TX', true);
select set_config('app.operator_id', :'OP', true);
select app.open_budget_period(:'TX', 'workflow_key', 'sem-tentativas', now() - interval '1 day', now() + interval '1 day', 10, 'cr-028 período vazio');
select throws_ok($$delete from finops.budget_periods where tenant_id = 'c2800000-0000-4000-8000-0000000000a1' and workflow_key = 'sem-tentativas'$$,
  '23514', null, 'delete de período sem tentativas rejeitado com a empresa existente');
select throws_ok($$insert into cr028_bypass.gatilho values ('c2800000-0000-4000-8000-0000000000a1', 'period')$$,
  '23514', null, 'delete de período dentro de outro trigger rejeitado');
select throws_ok($$insert into cr028_bypass.gatilho values ('c2800000-0000-4000-8000-0000000000a1', 'attempt')$$,
  '23514', null, 'delete de tentativa dentro de outro trigger rejeitado');
select throws_ok($$insert into cr028_bypass.gatilho values ('c2800000-0000-4000-8000-0000000000a1', 'record')$$,
  '23514', null, 'delete de registro dentro de outro trigger rejeitado');
select throws_ok($$insert into cr028_bypass.gatilho values ('c2800000-0000-4000-8000-0000000000a1', 'entry')$$,
  '23514', null, 'delete de lançamento dentro de outro trigger rejeitado');
-- created_at fica fora da constraint de coerência do documento: só a trigger pode rejeitar.
select throws_ok($$update finops.model_call_records set created_at = created_at + interval '1 second' where tenant_id = 'c2800000-0000-4000-8000-0000000000a1'$$,
  '23514', 'model_call_records é imutável', 'update de registro continua rejeitado pela trigger');
select throws_ok($$update finops.cost_ledger_entries set reason = 'x' where tenant_id = 'c2800000-0000-4000-8000-0000000000a1'$$,
  '23514', 'cost_ledger_entries é append-only', 'update de lançamento continua rejeitado pela trigger');
select is((select count(*)::int from finops.model_attempts where tenant_id = :'TX'), 1, 'tentativa intacta');
select is((select count(*)::int from finops.model_call_records where tenant_id = :'TX'), 1, 'registro intacto');
select is((select count(*)::int from finops.cost_ledger_entries where tenant_id = :'TX'), 2, 'lançamentos intactos');
select is((select count(*)::int from finops.budget_periods where tenant_id = :'TX'), 2, 'períodos intactos');

-- ------------------------------------------------ exclusão da empresa
create temp table antes_y as select pg_temp.linhas(:'TY') n,
  (select md5(string_agg(m::text, '|' order by m.id)) from core.memberships m where m.tenant_id = :'TY') mm,
  (select md5(string_agg(a::text, '|' order by a.call_id)) from finops.model_attempts a where a.tenant_id = :'TY') ma;
create temp table antes_x as select pg_temp.linhas(:'TX') n;
select ok((select n from antes_x) > 0, 'empresa X tem linhas em core e finops antes da exclusão');

savepoint antes_da_exclusao;
select lives_ok($$delete from core.tenants where id = 'c2800000-0000-4000-8000-0000000000a1'$$,
  'excluir a empresa permite a cascata real');
select is(pg_temp.linhas(:'TX'), 0::bigint, 'nenhuma linha da empresa excluída permanece em core e finops');
select is((select count(*)::int from core.invitations where tenant_id = :'TX')
        + (select count(*)::int from core.tenant_entitlements where tenant_id = :'TX'), 0, 'convites e entitlements também removidos');
select is((select count(*)::int from finops.cost_ledger_entries e where not exists
            (select 1 from finops.model_attempts a where a.tenant_id = e.tenant_id and a.call_id = e.call_id)), 0, 'nenhum lançamento órfão');
select is((select count(*)::int from finops.model_call_records r where not exists
            (select 1 from finops.model_attempts a where a.tenant_id = r.tenant_id and a.call_id = r.call_id)), 0, 'nenhum registro órfão');
select is((select count(*)::int from finops.model_attempts a where not exists
            (select 1 from core.tenants t where t.id = a.tenant_id)), 0, 'nenhuma tentativa sem empresa');
select is(pg_temp.linhas(:'TY'), (select n from antes_y), 'empresa Y mantém a mesma quantidade de linhas');
select is((select md5(string_agg(m::text, '|' order by m.id)) from core.memberships m where m.tenant_id = :'TY'), (select mm from antes_y),
  'vínculos da empresa Y inalterados');
select is((select md5(string_agg(a::text, '|' order by a.call_id)) from finops.model_attempts a where a.tenant_id = :'TY'), (select ma from antes_y),
  'tentativas da empresa Y inalteradas');
rollback to savepoint antes_da_exclusao;
select is(pg_temp.linhas(:'TX'), (select n from antes_x), 'rollback restaura todas as linhas da empresa X');
select is((select count(*)::int from core.tenants where id = :'TX'), 1, 'rollback restaura a empresa X');

-- Exclusão da empresa com a constraint diferida também funciona.
select lives_ok($q$do $b$ begin
    set constraints core.memberships_preserva_owner deferred;
    delete from core.tenants where id = 'c2800000-0000-4000-8000-0000000000a1';
    set constraints core.memberships_preserva_owner immediate;
  end $b$ $q$, 'exclusão da empresa com constraint diferida é aceita');
select is(pg_temp.linhas(:'TX'), 0::bigint, 'cascata completa com constraint diferida');
select is(pg_temp.linhas(:'TY'), (select n from antes_y), 'empresa Y segue intacta');
select is((select count(*)::int from core.memberships where tenant_id = :'TY' and role_key = 'owner'), 1, 'Owner da empresa Y preservado');

select * from finish();
rollback;
