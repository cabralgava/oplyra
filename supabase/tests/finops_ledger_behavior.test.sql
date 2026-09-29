-- CR-027 — comportamento do Cost Ledger: tenant, parâmetros e relógio,
-- aquisição idempotente, fechamento com replay exato, sweep, conciliação,
-- ciclo de vida dos períodos, contadores = diário, constraints e estouro.
-- Executa como dono das funções; a passagem do tempo do lease é simulada pelo
-- dono da tabela (somente em teste), movendo lease_expires_at para o passado.
begin;
create extension if not exists pgtap with schema extensions;
select plan(82);

\set TA '11111111-1111-4111-8111-111111111111'
\set TB '22222222-2222-4222-8222-222222222222'
\set TC 'c0000000-0000-4000-8000-00000000000c'
\set TD 'd0000000-0000-4000-8000-00000000000d'
\set OP '0e000000-0000-4000-8000-000000000001'

insert into core.tenants (id, name, slug, plan_key) values
  (:'TC', 'Gama sem período (fictícia)', 'gama-sem-periodo', 'performance'),
  (:'TD', 'Delta períodos (fictícia)', 'delta-periodos', 'performance');

create function pg_temp.fp(k text) returns text language sql as $$
  select 'hmac-sha256:v1:' || k || ':' || repeat('a', 64) $$;

create function pg_temp.acq(t uuid, wf text, inv text, est bigint, fps text[] default null, lease integer default 90,
  obs timestamptz default null, fp text default null) returns jsonb language sql as $$
  select app.acquire_model_attempt(t, wf, 'create_ad_copy', inv, 1, finops.attempt_call_id(t, 'create_ad_copy', inv, 1),
    'copywriting-agent', coalesce(fp, pg_temp.fp('k1')), coalesce(fps, array[coalesce(fp, pg_temp.fp('k1'))]), est,
    'pgtap-worker', lease, obs) $$;

create function pg_temp.rec(t uuid, wf text, inv text, est bigint, cs text, cost bigint, started timestamptz default null)
returns jsonb language sql as $$
  select jsonb_build_object(
    'invocationId', inv, 'attempt', 1, 'callId', finops.attempt_call_id(t, 'create_ad_copy', inv, 1),
    'tenantId', t::text, 'workflowKey', wf, 'agentKey', 'copywriting-agent', 'actionKey', 'create_ad_copy',
    'trace', jsonb_build_object('correlationId', 'corr-pgtap', 'transactionId', null, 'causationId', null,
      'parentTransactionId', null, 'workflowId', null, 'taskId', null, 'runId', null),
    'requestFingerprint', pg_temp.fp('k1'), 'dataClassification', 'synthetic',
    'classificationProvenance', jsonb_build_array(jsonb_build_object('kind', 'conservative_default', 'ref', null,
      'tenantId', t::text, 'classification', 'synthetic')),
    'inputTokensEstimate', 10, 'inputTokensEstimateMethod', 'conservative_bound', 'profileRef', 'p@1',
    'registryVersion', 'r1', 'modelId', 'm-a', 'provider', 'lab-a', 'adapterKey', 'test', 'providerModelId', 'lab-a/m-a',
    'tariffVersion', 't1', 'routingReason', 'preferred', 'fallbackOccurred', false, 'resolvedProvider', 'lab-a',
    'resolvedProviderModelId', 'lab-a/m-a', 'externalRequestId', null,
    'outcome', case when cs = 'pending_reconciliation' then 'failed' else 'succeeded' end,
    'failureKind', case when cs = 'pending_reconciliation' then 'provider_timeout' else null end,
    'usage', case when cs = 'pending_reconciliation' then null else jsonb_build_object('inputTokens', 10, 'outputTokens', 5, 'images', 0) end,
    'outputAssetIds', null, 'estimatedCostMicroUsd', est, 'costMicroUsd', cost, 'costStatus', cs,
    'startedAt', to_char(coalesce(started, now()) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'latencyMs', 5) $$;

create function pg_temp.fence(t uuid, inv text) returns uuid language sql as $$
  select fencing_token from finops.model_attempts
   where tenant_id = t and action_key = 'create_ad_copy' and invocation_id = inv and attempt = 1 $$;

create function pg_temp.fechar(t uuid, wf text, inv text, est bigint, outcome text, actual bigint, cs text, reason text,
  token uuid default null, rec jsonb default null) returns jsonb language sql as $$
  select app.close_model_attempt(t, 'create_ad_copy', inv, 1, coalesce(token, pg_temp.fence(t, inv)), outcome, actual, cs,
    reason, coalesce(rec, pg_temp.rec(t, wf, inv, est, cs, actual))) $$;

create function pg_temp.periodo(t uuid, id text) returns finops.budget_periods language sql as $$
  select * from finops.budget_periods where tenant_id = t and period_id = id $$;

create function pg_temp.estado(t uuid, inv text) returns text language sql as $$
  select status from finops.model_attempts where tenant_id = t and action_key = 'create_ad_copy' and invocation_id = inv and attempt = 1 $$;

create function pg_temp.vencer(t uuid, inv text) returns void language sql as $$
  update finops.model_attempts set lease_expires_at = acquired_at + interval '1 microsecond'
   where tenant_id = t and action_key = 'create_ad_copy' and invocation_id = inv and attempt = 1 $$;

create function pg_temp.fotografia(t uuid) returns text language sql as $$
  select coalesce((select string_agg(period_id || ':' || reserved_micro_usd || '/' || settled_micro_usd || '/' || held_micro_usd, ',' order by period_id)
                     from finops.budget_periods where tenant_id = t), '')
    || '|' || (select count(*) from finops.cost_ledger_entries where tenant_id = t)
    || '|' || (select count(*) from finops.model_call_records where tenant_id = t) $$;

-- ------------------------------------------------ tenant e parâmetros
select set_config('app.tenant_id', :'TB', true);
select throws_ok($$select pg_temp.acq('11111111-1111-4111-8111-111111111111', 'w', 'inv-x', 10)$$,
  '42501', null, 'tenant ativo diferente do pedido: 42501');
select throws_ok($$select app.budget_remaining('11111111-1111-4111-8111-111111111111', 'w')$$,
  '42501', null, 'saldo de outro tenant: 42501');
select throws_ok($$select app.expire_next_model_attempt('11111111-1111-4111-8111-111111111111')$$,
  '42501', null, 'sweep de outro tenant: 42501');

select set_config('app.tenant_id', :'TA', true);
select throws_ok($$select pg_temp.acq('11111111-1111-4111-8111-111111111111', 'w', 'inv-l59', 10, lease => 59)$$,
  '22023', null, 'lease 59 s recusado');
select throws_ok($$select pg_temp.acq('11111111-1111-4111-8111-111111111111', 'w', 'inv-l901', 10, lease => 901)$$,
  '22023', null, 'lease 901 s recusado');
select throws_ok($$select pg_temp.acq('11111111-1111-4111-8111-111111111111', 'w', 'inv-obs-p', 10, obs => clock_timestamp() - interval '301 seconds')$$,
  '22023', null, 'clientObservedAt 301 s no passado recusado');
select throws_ok($$select pg_temp.acq('11111111-1111-4111-8111-111111111111', 'w', 'inv-obs-f', 10, obs => clock_timestamp() + interval '301 seconds')$$,
  '22023', null, 'clientObservedAt 301 s no futuro recusado');
select throws_ok($$select app.acquire_model_attempt('11111111-1111-4111-8111-111111111111', 'w', 'create_ad_copy', 'inv-cid', 1,
    finops.attempt_call_id('11111111-1111-4111-8111-111111111111', 'create_ad_copy', 'outra', 1), 'copywriting-agent',
    pg_temp.fp('k1'), array[pg_temp.fp('k1')], 10, 'w1', 90, null)$$,
  '22023', null, 'callId que não deriva da identidade é recusado');
select throws_ok($$select pg_temp.acq('11111111-1111-4111-8111-111111111111', 'w', 'inv-neg', -1)$$,
  '22023', null, 'estimativa negativa recusada');
select is((select count(*)::int from finops.model_attempts where tenant_id = :'TA'), 0,
  'nenhuma tentativa gravada pelas recusas');

select is(pg_temp.acq(:'TA', 'w', 'inv-l60', 0, lease => 60)->>'status', 'acquired', 'lease 60 s aceito');
select is(pg_temp.acq(:'TA', 'w', 'inv-l900', 0, lease => 900)->>'status', 'acquired', 'lease 900 s aceito');
select is(
  (select count(*)::int from finops.model_attempts where tenant_id = :'TA' and invocation_id in ('inv-l60', 'inv-l900')
     and lease_seconds = case invocation_id when 'inv-l60' then 60 else 900 end
     and lease_expires_at = acquired_at + lease_seconds * interval '1 second'),
  2, 'lease gravado igual ao recebido e expiração = acquired_at + lease_seconds pelo relógio do banco');
select is(pg_temp.acq(:'TA', 'w', 'inv-obs-ok', 0, obs => clock_timestamp() - interval '200 seconds')->>'status', 'acquired',
  'clientObservedAt dentro de ±300 s aceito');
select ok(
  (select client_observed_at < acquired_at - interval '150 seconds' and lease_expires_at = acquired_at + interval '90 seconds'
     from finops.model_attempts where tenant_id = :'TA' and invocation_id = 'inv-obs-ok'),
  'clientObservedAt fica só como metadado: não altera lease nem aquisição');

-- --------------------------------------------- aquisição e orçamento
select is(pg_temp.acq(:'TA', 'seed-copy-review', 'inv-1', 2500)->>'status', 'acquired', 'tentativa nova adquirida');
select is(((pg_temp.periodo(:'TA', 'bp-a0000000000000000000000000000001')).reserved_micro_usd,
           (pg_temp.periodo(:'TA', 'bp-a0000000000000000000000000000002')).reserved_micro_usd), (2500::bigint, 2500::bigint),
  'reserva aplicada ao período do tenant e ao do workflow_key');
select is((select count(*)::int from finops.cost_ledger_entries where tenant_id = :'TA' and kind = 'reserve'
            and call_id = finops.attempt_call_id(:'TA', 'create_ad_copy', 'inv-1', 1)), 2,
  'um lançamento reserve por período afetado');
select is(pg_temp.acq(:'TA', 'seed-copy-review', 'inv-1', 2500)->>'status', 'in_progress', 'mesma chave com lease vivo: in_progress');
select is(pg_temp.acq(:'TA', 'seed-copy-review', 'inv-1', 2500, fp => pg_temp.fp('k2'))->>'status', 'conflict',
  'fingerprint fora dos aceitos: conflict antes do estado');
select is(pg_temp.acq(:'TA', 'seed-copy-review', 'inv-1', 2500, fps => array[pg_temp.fp('k2'), pg_temp.fp('k1')], fp => pg_temp.fp('k2'))->>'status',
  'in_progress', 'rotação: fingerprint antigo aceito responde pela tentativa');
select is(pg_temp.acq(:'TA', 'seed-copy-review', 'inv-caro', 998000)->>'status', 'insufficient',
  'estimativa acima do saldo do workflow_key: insufficient');
select is((select count(*)::int from finops.model_attempts where tenant_id = :'TA' and invocation_id = 'inv-caro'), 0,
  'insufficient não grava nada');
select is((app.budget_remaining(:'TA', 'seed-copy-review')->>'remainingMicroUsd')::bigint, 997500::bigint,
  'saldo consultivo = menor disponível entre os períodos aplicáveis');

select set_config('app.tenant_id', :'TC', true);
select is(pg_temp.acq(:'TC', 'w', 'inv-c', 10)->>'status', 'budget_not_configured', 'tenant sem período: budget_not_configured');
select is(app.budget_remaining(:'TC', 'w')->'remainingMicroUsd', 'null'::jsonb, 'saldo consultivo null sem período');

-- ------------------------------------------------ fechamento
select set_config('app.tenant_id', :'TA', true);
select is(pg_temp.fechar(:'TA', 'seed-copy-review', 'inv-1', 2500, 'charged', 3000, 'settled', null)->>'status', 'closed',
  'fechamento charged liquida');
select is(((pg_temp.periodo(:'TA', 'bp-a0000000000000000000000000000001')).reserved_micro_usd,
           (pg_temp.periodo(:'TA', 'bp-a0000000000000000000000000000001')).settled_micro_usd), (0::bigint, 3000::bigint),
  'reserva devolvida e custo real liquidado (acima da estimativa)');
select is((select overrun_micro_usd from finops.cost_ledger_entries
            where tenant_id = :'TA' and entry_id = finops.attempt_call_id(:'TA', 'create_ad_copy', 'inv-1', 1) || ':settle:tenant'),
  500::bigint, 'estouro registrado no lançamento');
select is((select count(*)::int from finops.model_call_records where tenant_id = :'TA'
            and call_id = finops.attempt_call_id(:'TA', 'create_ad_copy', 'inv-1', 1)), 1, 'exatamente um registro por fechamento');
select is(pg_temp.acq(:'TA', 'seed-copy-review', 'inv-1', 2500)->>'status', 'closed', 'reentrega após fechamento: closed');

create temp table antes as select pg_temp.fotografia(:'TA') f;
select is(pg_temp.fechar(:'TA', 'seed-copy-review', 'inv-1', 2500, 'charged', 3000, 'settled', null)->>'status', 'duplicate',
  'replay exato normalizado: duplicate');
select throws_ok($$select pg_temp.fechar('11111111-1111-4111-8111-111111111111', 'seed-copy-review', 'inv-1', 2500, 'charged', 2999, 'settled', null)$$,
  '55000', null, 'replay com actual diferente: INVALID_STATE_TRANSITION');
select throws_ok($$select pg_temp.fechar('11111111-1111-4111-8111-111111111111', 'seed-copy-review', 'inv-1', 2500, 'charged', 3000, 'settled', null,
    rec => pg_temp.rec('11111111-1111-4111-8111-111111111111', 'seed-copy-review', 'inv-1', 2500, 'settled', 3000) || '{"latencyMs": 6}')$$,
  '55000', null, 'replay com campo do registro diferente: INVALID_STATE_TRANSITION');
select throws_ok($$select pg_temp.fechar('11111111-1111-4111-8111-111111111111', 'seed-copy-review', 'inv-1', 2500, 'unknown', null, 'pending_reconciliation', 'billing_unknown')$$,
  '55000', null, 'replay com outro desfecho: INVALID_STATE_TRANSITION');
select throws_ok($$select pg_temp.fechar('11111111-1111-4111-8111-111111111111', 'seed-copy-review', 'inv-1', 2500, 'charged', 2999, 'settled', null,
    rec => pg_temp.rec('11111111-1111-4111-8111-111111111111', 'seed-copy-review', 'inv-1', 2500, 'settled', 3000))$$,
  '55000', null, 'replay com só actualMicroUsd diferente (registro idêntico): INVALID_STATE_TRANSITION');
select throws_ok($$select pg_temp.fechar('11111111-1111-4111-8111-111111111111', 'seed-copy-review', 'inv-1', 2500, 'charged', 3000, 'settled', 'billing_unknown')$$,
  '55000', null, 'replay com só pendingReason diferente: INVALID_STATE_TRANSITION');
select throws_ok($$select pg_temp.fechar('11111111-1111-4111-8111-111111111111', 'seed-copy-review', 'inv-1', 2500, 'charged', 3000, 'not_charged', null,
    rec => pg_temp.rec('11111111-1111-4111-8111-111111111111', 'seed-copy-review', 'inv-1', 2500, 'settled', 3000))$$,
  '55000', null, 'replay com só costStatus diferente: INVALID_STATE_TRANSITION');
select throws_ok($$select pg_temp.fechar('11111111-1111-4111-8111-111111111111', 'seed-copy-review', 'inv-1', 2500, 'charged', 3000, 'settled', null,
    token => gen_random_uuid())$$,
  '55000', null, 'replay idêntico com outro token: INVALID_STATE_TRANSITION');
select is(pg_temp.fotografia(:'TA'), (select f from antes), 'replays não mudam contadores, lançamentos nem registros');

select is(pg_temp.acq(:'TA', 'w', 'inv-2', 1000)->>'status', 'acquired', 'segunda tentativa adquirida');
select throws_ok($$select pg_temp.fechar('11111111-1111-4111-8111-111111111111', 'w', 'inv-2', 1000, 'charged', 10, 'settled', null, token => gen_random_uuid())$$,
  '55000', null, 'fencing token obsoleto: INVALID_STATE_TRANSITION');
select throws_ok($$select pg_temp.fechar('11111111-1111-4111-8111-111111111111', 'w', 'inv-2', 1000, 'charged', 10, 'settled', 'billing_unknown')$$,
  '55000', null, 'comando incoerente: INVALID_STATE_TRANSITION');
select throws_ok($$select pg_temp.fechar('11111111-1111-4111-8111-111111111111', 'w', 'inv-2', 1000, 'charged', 10, 'settled', null,
    rec => pg_temp.rec('11111111-1111-4111-8111-111111111111', 'w', 'inv-2', 1000, 'settled', 10, clock_timestamp() + interval '301 seconds'))$$,
  '55000', null, 'startedAt fora da janela de ±300 s: INVALID_STATE_TRANSITION');
select throws_ok($$select pg_temp.fechar('11111111-1111-4111-8111-111111111111', 'w', 'inv-2', 1000, 'charged', 10, 'settled', null,
    rec => jsonb_set(pg_temp.rec('11111111-1111-4111-8111-111111111111', 'w', 'inv-2', 1000, 'settled', 10),
      '{classificationProvenance,0,tenantId}', '"22222222-2222-4222-8222-222222222222"'))$$,
  '55000', null, 'proveniência de outro tenant: INVALID_STATE_TRANSITION');
select is(pg_temp.estado(:'TA', 'inv-2'), 'reserved', 'fechamentos recusados não alteram a tentativa');
select is(pg_temp.fechar(:'TA', 'w', 'inv-2', 1000, 'not_charged', 0, 'not_charged', null)->>'status', 'closed', 'not_charged libera');
select is((select (status, actual_micro_usd) from finops.model_attempts where tenant_id = :'TA' and invocation_id = 'inv-2'),
  ('released'::text, 0::bigint), 'released com custo zero garantido');

select is(pg_temp.acq(:'TA', 'w', 'inv-3', 700)->>'status', 'acquired', 'terceira tentativa adquirida');
select is(pg_temp.fechar(:'TA', 'w', 'inv-3', 700, 'unknown', null, 'pending_reconciliation', 'billing_unknown')->>'status', 'closed',
  'custo desconhecido fica retido');
select is((select (status, actual_micro_usd is null, pending_reason) from finops.model_attempts where tenant_id = :'TA' and invocation_id = 'inv-3'),
  ('pending_reconciliation'::text, true, 'billing_unknown'::text), 'custo incerto nunca vira zero');

-- ------------------------------------------------ sweep
select is(pg_temp.acq(:'TA', 'w', 'inv-4', 400)->>'status', 'acquired', 'tentativa para o sweep');
select is(app.expire_next_model_attempt(:'TA'), null, 'sweep não expira lease vivo pelo relógio do banco');
select pg_temp.vencer(:'TA', 'inv-4');
select is(app.expire_next_model_attempt(:'TA'), finops.attempt_call_id(:'TA', 'create_ad_copy', 'inv-4', 1), 'sweep move a tentativa vencida');
select is((select (status, pending_reason, close_outcome is null) from finops.model_attempts where tenant_id = :'TA' and invocation_id = 'inv-4'),
  ('pending_reconciliation'::text, 'lease_expired'::text, true), 'lease_expired sem comando de fechamento');
select throws_ok($$select pg_temp.fechar('11111111-1111-4111-8111-111111111111', 'w', 'inv-4', 400, 'charged', 10, 'settled', null)$$,
  '55000', null, 'fechamento depois do sweep: INVALID_STATE_TRANSITION');
select is((select count(*)::int from finops.model_call_records where tenant_id = :'TA'
            and call_id = finops.attempt_call_id(:'TA', 'create_ad_copy', 'inv-4', 1)), 0, 'tentativa movida pelo sweep não tem registro');

-- ------------------------------------------------ conciliação
select set_config('app.operator_id', :'OP', true);
select is(app.reconcile_model_attempt(:'TA', 'create_ad_copy', 'inv-3', 1, 650, 'evidencia-sintetica-3', 'conciliação sintética')->>'status',
  'reconciled', 'operador concilia com evidência');
select is(app.reconcile_model_attempt(:'TA', 'create_ad_copy', 'inv-3', 1, 650, 'evidencia-sintetica-3', 'conciliação sintética')->>'status',
  'duplicate', 'conciliação repetida idêntica: duplicate');
select is(pg_temp.fechar(:'TA', 'w', 'inv-3', 700, 'unknown', null, 'pending_reconciliation', 'billing_unknown')->>'status', 'duplicate',
  'replay exato do fechamento depois da conciliação: duplicate');
select is((select count(*)::int from core.audit_log where tenant_id = :'TA' and action = 'finops.attempt.reconcile'
            and target = finops.attempt_call_id(:'TA', 'create_ad_copy', 'inv-3', 1) and actor_id = :'OP'), 1,
  'conciliação auditada em core.audit_log');

-- -------------------------------------------- ciclo de vida dos períodos
select set_config('app.tenant_id', :'TD', true);
create temp table pd as select app.open_budget_period(:'TD', 'tenant', null, now() - interval '1 day', now() + interval '1 day', 10000, 'período sintético') p;
select throws_ok($$select app.open_budget_period('d0000000-0000-4000-8000-00000000000d', 'tenant', null, now(), now() + interval '2 days', 10, 'sobreposto')$$,
  '23P01', null, 'período sobreposto recusado');
select is(pg_temp.acq(:'TD', 'w', 'inv-d1', 1000)->>'status', 'acquired', 'aquisição no período aberto');
select is(app.close_budget_period(:'TD', (select p->>'periodId' from pd), 'fechamento sintético')->>'status', 'closed', 'período fechado');
select is(pg_temp.acq(:'TD', 'w', 'inv-d2', 10)->>'status', 'budget_not_configured', 'período fechado não aceita nova reserva');
select is(pg_temp.acq(:'TD', 'w', 'inv-d1', 1000)->>'status', 'in_progress', 'reentrega de chave existente não consulta período');
select is(pg_temp.fechar(:'TD', 'w', 'inv-d1', 1000, 'charged', 900, 'settled', null)->>'status', 'closed',
  'tentativa vinculada fecha contra o período já fechado');
select is(((pg_temp.periodo(:'TD', (select p->>'periodId' from pd))).reserved_micro_usd,
           (pg_temp.periodo(:'TD', (select p->>'periodId' from pd))).settled_micro_usd), (0::bigint, 900::bigint),
  'contadores do período fechado continuam atualizados');
select throws_ok($$select app.close_budget_period('d0000000-0000-4000-8000-00000000000d', (select p->>'periodId' from pd), 'de novo')$$,
  '55000', null, 'período fechado não reabre nem fecha de novo');
select is((select count(*)::int from core.audit_log where tenant_id = :'TD' and action in ('finops.budget_period.open', 'finops.budget_period.close')),
  2, 'abertura e fechamento auditados');

-- ------------------------------------------------ estouro
select set_config('app.tenant_id', 'c0000000-0000-4000-8000-00000000000c', true);
select app.open_budget_period(:'TC', 'tenant', null, now() - interval '1 day', now() + interval '1 day', 9007199254740991, 'teto máximo sintético');
select is(pg_temp.acq(:'TC', 'w', 'inv-max-1', 1)->>'status', 'acquired', 'aquisição sob teto máximo');
select is(pg_temp.fechar(:'TC', 'w', 'inv-max-1', 1, 'charged', 9007199254740991, 'settled', null)->>'status', 'closed',
  'liquidação que atinge exatamente 2^53 − 1 é aceita');
select is(pg_temp.acq(:'TC', 'w', 'inv-max-2', 0)->>'status', 'acquired', 'estimativa zero ainda cria a tentativa');
select throws_ok($$select pg_temp.fechar('c0000000-0000-4000-8000-00000000000c', 'w', 'inv-max-2', 0, 'charged', 1, 'settled', null)$$,
  '22003', null, 'liquidação acima do inteiro seguro aborta o fechamento');
select is(pg_temp.estado(:'TC', 'inv-max-2'), 'reserved', 'tentativa segue reservada até o sweep; nada vira zero');

-- -------------------------------------- contadores = soma do diário
select is(
  (select count(*)::int from finops.budget_periods b
    where b.reserved_micro_usd <> coalesce((select sum(e.reserved_delta) from finops.cost_ledger_entries e where e.tenant_id = b.tenant_id and e.period_id = b.period_id), 0)
       or b.settled_micro_usd <> coalesce((select sum(e.settled_delta) from finops.cost_ledger_entries e where e.tenant_id = b.tenant_id and e.period_id = b.period_id), 0)
       or b.held_micro_usd <> coalesce((select sum(e.held_delta) from finops.cost_ledger_entries e where e.tenant_id = b.tenant_id and e.period_id = b.period_id), 0)),
  0, 'todo contador é a soma dos lançamentos do período');

-- -------------------------------------- constraints e imutabilidade
select throws_ok($$update finops.model_call_records set latency_ms = 1 where tenant_id = '11111111-1111-4111-8111-111111111111'$$,
  '23514', null, 'registro é imutável');
select throws_ok($$delete from finops.cost_ledger_entries where tenant_id = '11111111-1111-4111-8111-111111111111'$$,
  '23514', null, 'diário é append-only');
select throws_ok($$update finops.model_attempts set status = 'released', actual_micro_usd = 10, lease_owner = null, lease_expires_at = null,
    close_outcome = 'not_charged', close_actual_micro_usd = 10, close_cost_status = 'not_charged', closed_at = now()
   where tenant_id = '11111111-1111-4111-8111-111111111111' and invocation_id = 'inv-l60'$$,
  '23514', null, 'released com custo diferente de zero é rejeitado');
select throws_ok($$delete from finops.budget_periods where tenant_id = 'd0000000-0000-4000-8000-00000000000d'$$,
  '23514', null, 'período não é apagado diretamente');
select lives_ok($$delete from core.tenants where id = 'd0000000-0000-4000-8000-00000000000d'$$,
  'exclusão do tenant remove períodos, tentativas, registros e lançamentos em cascata');
select is((select count(*)::int from finops.model_attempts where tenant_id = 'd0000000-0000-4000-8000-00000000000d'), 0,
  'nada do tenant excluído permanece no Ledger');

select * from finish();
rollback;
