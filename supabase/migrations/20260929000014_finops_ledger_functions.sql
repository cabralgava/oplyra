-- CR-027 — funções do Cost Ledger. Única superfície de acesso às tabelas
-- `finops`: `security definer`, `search_path` fixo, nomes qualificados,
-- REVOKE de PUBLIC e EXECUTE somente para o papel listado no CR-027 §6.2.
--
-- Relógio: toda decisão temporal usa `v_db_now := clock_timestamp()`, lido
-- uma vez no início de cada função. Nenhuma assinatura recebe instante
-- decisório; `clientObservedAt` e `startedAt` são metadados (±300 s).
--
-- Ordem única de locks (§6.4): identidade (advisory) → linha da tentativa →
-- período `tenant` → período `workflow_key`.
--
-- Erros: 42501 tenant ativo diferente; 22023 parâmetro de aquisição, período
-- ou conciliação inválido; 55000 `INVALID_STATE_TRANSITION`; 23P01
-- sobreposição de períodos; 22003 estouro de contador.

-- ------------------------------------------------------------ utilidades
create or replace function finops.iso(p_ts timestamptz) returns text
language sql immutable
set search_path = pg_catalog, pg_temp
as $$
  select case when p_ts is null then null
    else pg_catalog.to_char(p_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end
$$;

create or replace function finops.identity_lock_key(p_tenant_id uuid, p_action_key text, p_invocation_id text, p_attempt integer)
returns bigint
language sql immutable
set search_path = pg_catalog, pg_temp
as $$
  select pg_catalog.hashtextextended(
    'finops.attempt|' || pg_catalog.jsonb_build_array(p_tenant_id::text, p_action_key, p_invocation_id, p_attempt)::text, 0)
$$;

-- Inteiro seguro não negativo em JSON (número sem parte fracionária).
create or replace function finops.is_safe_quantity(p_value jsonb) returns boolean
language sql immutable
set search_path = pg_catalog, pg_temp
as $$
  select p_value is not null and pg_catalog.jsonb_typeof(p_value) = 'number'
     and (p_value::text)::numeric = pg_catalog.trunc((p_value::text)::numeric)
     and (p_value::text)::numeric between 0 and 9007199254740991
$$;

create or replace function finops.is_text_or_null(p_value jsonb) returns boolean
language sql immutable
set search_path = pg_catalog, pg_temp
as $$
  select p_value is not null and (pg_catalog.jsonb_typeof(p_value) = 'null'
    or (pg_catalog.jsonb_typeof(p_value) = 'string' and pg_catalog.length(p_value #>> '{}') >= 1))
$$;

create or replace function finops.is_text(p_value jsonb) returns boolean
language sql immutable
set search_path = pg_catalog, pg_temp
as $$
  select p_value is not null and pg_catalog.jsonb_typeof(p_value) = 'string' and pg_catalog.length(p_value #>> '{}') >= 1
$$;

create or replace function finops.attempt_snapshot(a finops.model_attempts) returns jsonb
language sql stable
set search_path = pg_catalog, pg_temp
as $$
  select pg_catalog.jsonb_build_object(
    'tenantId', a.tenant_id::text,
    'actionKey', a.action_key,
    'invocationId', a.invocation_id,
    'attempt', a.attempt,
    'callId', a.call_id,
    'workflowKey', a.workflow_key,
    'agentKey', a.agent_key,
    'requestFingerprint', a.request_fingerprint,
    'fingerprintKeyId', a.fingerprint_key_id,
    'tenantPeriodId', a.tenant_period_id,
    'workflowPeriodId', a.workflow_period_id,
    'status', a.status,
    'estimateMicroUsd', a.estimate_micro_usd,
    'actualMicroUsd', a.actual_micro_usd,
    'pendingReason', a.pending_reason,
    'leaseSeconds', a.lease_seconds,
    'leaseExpiresAt', finops.iso(a.lease_expires_at),
    'acquiredAt', finops.iso(a.acquired_at),
    'closedAt', finops.iso(a.closed_at),
    'reconciledAt', finops.iso(a.reconciled_at),
    'reconciliationEvidenceRef', a.reconciliation_evidence_ref
  )
$$;

create or replace function finops.period_snapshot(p finops.budget_periods) returns jsonb
language sql stable
set search_path = pg_catalog, pg_temp
as $$
  select pg_catalog.jsonb_build_object(
    'tenantId', p.tenant_id::text,
    'periodId', p.period_id,
    'scope', p.scope,
    'workflowKey', p.workflow_key,
    'periodStart', finops.iso(p.period_start),
    'periodEnd', finops.iso(p.period_end),
    'currency', p.currency,
    'limitMicroUsd', p.limit_micro_usd,
    'reservedMicroUsd', p.reserved_micro_usd,
    'settledMicroUsd', p.settled_micro_usd,
    'heldMicroUsd', p.held_micro_usd,
    'status', p.status,
    'createdAt', finops.iso(p.created_at),
    'closedAt', finops.iso(p.closed_at)
  )
$$;

-- Aplica o delta de um passo a um período já travado pelo chamador e grava o
-- lançamento correspondente. Estouro do inteiro seguro aborta (22003).
create or replace function finops.apply_period_step(
  p_tenant_id uuid, p_period_id text, p_scope text, p_call_id text, p_kind text,
  p_reserved_delta numeric, p_settled_delta numeric, p_held_delta numeric, p_overrun numeric,
  p_actor_type text, p_reason text, p_db_now timestamptz
) returns void
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  v_period finops.budget_periods;
  v_reserved numeric;
  v_settled numeric;
  v_held numeric;
begin
  select * into strict v_period from finops.budget_periods b
   where b.tenant_id = p_tenant_id and b.period_id = p_period_id;
  v_reserved := v_period.reserved_micro_usd::numeric + p_reserved_delta;
  v_settled := v_period.settled_micro_usd::numeric + p_settled_delta;
  v_held := v_period.held_micro_usd::numeric + p_held_delta;
  if v_reserved < 0 or v_settled < 0 or v_held < 0
     or v_reserved > 9007199254740991 or v_settled > 9007199254740991 or v_held > 9007199254740991
     or v_reserved + v_settled + v_held > 9007199254740991 then
    raise exception 'contador do período fora do inteiro seguro' using errcode = '22003';
  end if;
  update finops.budget_periods b
     set reserved_micro_usd = v_reserved::bigint,
         settled_micro_usd = v_settled::bigint,
         held_micro_usd = v_held::bigint
   where b.tenant_id = p_tenant_id and b.period_id = p_period_id;
  insert into finops.cost_ledger_entries (
    tenant_id, entry_id, call_id, kind, period_id, period_scope,
    reserved_delta, settled_delta, held_delta, overrun_micro_usd, actor_type, reason, created_at
  ) values (
    p_tenant_id, p_call_id || ':' || p_kind || ':' || p_scope, p_call_id, p_kind, p_period_id, p_scope,
    p_reserved_delta::bigint, p_settled_delta::bigint, p_held_delta::bigint, p_overrun::bigint, p_actor_type, p_reason, p_db_now
  );
end
$$;

-- Trava os períodos vinculados na ordem tenant → workflow_key e aplica o
-- mesmo passo a cada um.
create or replace function finops.apply_attempt_step(
  a finops.model_attempts, p_kind text,
  p_reserved_delta numeric, p_settled_delta numeric, p_held_delta numeric, p_overrun numeric,
  p_actor_type text, p_reason text, p_db_now timestamptz
) returns void
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  perform 1 from finops.budget_periods b
   where b.tenant_id = a.tenant_id and b.period_id = a.tenant_period_id for update;
  if a.workflow_period_id is not null then
    perform 1 from finops.budget_periods b
     where b.tenant_id = a.tenant_id and b.period_id = a.workflow_period_id for update;
  end if;
  perform finops.apply_period_step(a.tenant_id, a.tenant_period_id, 'tenant', a.call_id, p_kind,
    p_reserved_delta, p_settled_delta, p_held_delta, p_overrun, p_actor_type, p_reason, p_db_now);
  if a.workflow_period_id is not null then
    perform finops.apply_period_step(a.tenant_id, a.workflow_period_id, 'workflow_key', a.call_id, p_kind,
      p_reserved_delta, p_settled_delta, p_held_delta, p_overrun, p_actor_type, p_reason, p_db_now);
  end if;
end
$$;

-- `reserved` com lease vencido → `pending_reconciliation (lease_expired)`,
-- sem registro. Chamador já detém a identidade e a linha da tentativa.
create or replace function finops.expire_locked_attempt(a finops.model_attempts, p_db_now timestamptz) returns void
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  perform finops.apply_attempt_step(a, 'hold', -a.estimate_micro_usd::numeric, 0, a.estimate_micro_usd::numeric, 0,
    'system', 'lease_expired', p_db_now);
  update finops.model_attempts m
     set status = 'pending_reconciliation', pending_reason = 'lease_expired',
         lease_owner = null, lease_expires_at = null, closed_at = p_db_now
   where m.tenant_id = a.tenant_id and m.action_key = a.action_key
     and m.invocation_id = a.invocation_id and m.attempt = a.attempt;
end
$$;

-- Problema do Model Call Record frente à tentativa e ao comando, ou null.
-- Só caminhos e regras; nunca valores recebidos.
create or replace function finops.record_problem(
  p_record jsonb, a finops.model_attempts, p_cost_status text, p_actual bigint, p_db_now timestamptz
) returns text
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  v_keys text[];
  v_expected constant text[] := array[
    'actionKey', 'adapterKey', 'agentKey', 'attempt', 'callId', 'classificationProvenance', 'costMicroUsd', 'costStatus',
    'dataClassification', 'estimatedCostMicroUsd', 'externalRequestId', 'failureKind', 'fallbackOccurred',
    'inputTokensEstimate', 'inputTokensEstimateMethod', 'invocationId', 'latencyMs', 'modelId', 'outcome',
    'outputAssetIds', 'profileRef', 'provider', 'providerModelId', 'registryVersion', 'requestFingerprint',
    'resolvedProvider', 'resolvedProviderModelId', 'routingReason', 'startedAt', 'tariffVersion', 'tenantId', 'trace',
    'usage', 'workflowKey'
  ]::text[];
  v_started timestamptz;
  v_item jsonb;
begin
  if p_record is null or pg_catalog.jsonb_typeof(p_record) <> 'object' then return 'record: objeto obrigatório'; end if;
  select pg_catalog.array_agg(k) into v_keys from pg_catalog.jsonb_object_keys(p_record) k;
  if not (v_keys @> v_expected and v_expected @> v_keys) then
    return 'record: conjunto de campos difere do Model Call Record 1.0';
  end if;
  if p_record->>'tenantId' is distinct from a.tenant_id::text then return 'record.tenantId: difere da tentativa'; end if;
  if p_record->>'callId' is distinct from a.call_id then return 'record.callId: difere da tentativa'; end if;
  if p_record->>'actionKey' is distinct from a.action_key or p_record->>'invocationId' is distinct from a.invocation_id
     or p_record->'attempt' is distinct from pg_catalog.to_jsonb(a.attempt) then
    return 'record: identidade difere da tentativa';
  end if;
  if p_record->>'workflowKey' is distinct from a.workflow_key or p_record->>'agentKey' is distinct from a.agent_key then
    return 'record: workflowKey ou agentKey difere da tentativa';
  end if;
  if p_record->>'requestFingerprint' is distinct from a.request_fingerprint then return 'record.requestFingerprint: difere da tentativa'; end if;
  if p_record->>'costStatus' is distinct from p_cost_status then return 'record.costStatus: difere do comando'; end if;
  if p_record->'costMicroUsd' is distinct from coalesce(pg_catalog.to_jsonb(p_actual), 'null'::jsonb) then
    return 'record.costMicroUsd: difere do comando';
  end if;
  if p_record->'estimatedCostMicroUsd' is distinct from pg_catalog.to_jsonb(a.estimate_micro_usd) then
    return 'record.estimatedCostMicroUsd: difere da reserva';
  end if;
  if p_record->>'outcome' = 'succeeded' then
    if pg_catalog.jsonb_typeof(p_record->'failureKind') <> 'null' then return 'record.failureKind: deve ser null em sucesso'; end if;
  elsif p_record->>'outcome' = 'failed' then
    if not finops.is_text(p_record->'failureKind') then return 'record.failureKind: obrigatório em falha'; end if;
  else
    return 'record.outcome: fora do enum';
  end if;
  if pg_catalog.jsonb_typeof(p_record->'outputAssetIds') = 'array' then
    if p_record->>'outcome' <> 'succeeded' then return 'record.outputAssetIds: só em sucesso'; end if;
    if exists (select 1 from pg_catalog.jsonb_array_elements(p_record->'outputAssetIds') e where not finops.is_text(e)) then
      return 'record.outputAssetIds: itens texto';
    end if;
  elsif pg_catalog.jsonb_typeof(p_record->'outputAssetIds') <> 'null' then
    return 'record.outputAssetIds: array ou null';
  end if;
  if pg_catalog.jsonb_typeof(p_record->'classificationProvenance') <> 'array'
     or pg_catalog.jsonb_array_length(p_record->'classificationProvenance') < 1 then
    return 'record.classificationProvenance: array não vazio';
  end if;
  for v_item in select e from pg_catalog.jsonb_array_elements(p_record->'classificationProvenance') e loop
    if pg_catalog.jsonb_typeof(v_item) <> 'object' or v_item->>'tenantId' is distinct from a.tenant_id::text then
      return 'record.classificationProvenance: proveniência fora do tenant';
    end if;
  end loop;
  if pg_catalog.jsonb_typeof(p_record->'trace') <> 'object' or not finops.is_text(p_record->'trace'->'correlationId') then
    return 'record.trace: correlationId obrigatório';
  end if;
  if pg_catalog.jsonb_typeof(p_record->'usage') = 'object' then
    if not (finops.is_safe_quantity(p_record->'usage'->'inputTokens') and finops.is_safe_quantity(p_record->'usage'->'outputTokens')
            and finops.is_safe_quantity(p_record->'usage'->'images')) then
      return 'record.usage: quantidades inteiras seguras';
    end if;
  elsif pg_catalog.jsonb_typeof(p_record->'usage') <> 'null' then
    return 'record.usage: objeto ou null';
  end if;
  if p_record->>'dataClassification' not in ('synthetic', 'internal', 'tenant_confidential', 'personal_data')
     or pg_catalog.jsonb_typeof(p_record->'dataClassification') <> 'string' then
    return 'record.dataClassification: fora do enum';
  end if;
  if p_record->>'inputTokensEstimateMethod' not in ('model_exact', 'conservative_bound', 'caller_hint')
     or pg_catalog.jsonb_typeof(p_record->'inputTokensEstimateMethod') <> 'string' then
    return 'record.inputTokensEstimateMethod: fora do enum';
  end if;
  if p_record->>'routingReason' not in ('preferred', 'lowest_cost_above_threshold', 'fallback', 'retry')
     or pg_catalog.jsonb_typeof(p_record->'routingReason') <> 'string' then
    return 'record.routingReason: fora do enum';
  end if;
  if pg_catalog.jsonb_typeof(p_record->'fallbackOccurred') <> 'boolean' then return 'record.fallbackOccurred: booleano'; end if;
  if not (finops.is_safe_quantity(p_record->'inputTokensEstimate') and finops.is_safe_quantity(p_record->'latencyMs')) then
    return 'record: inputTokensEstimate e latencyMs inteiros seguros';
  end if;
  if not (finops.is_text(p_record->'profileRef') and finops.is_text(p_record->'registryVersion') and finops.is_text(p_record->'modelId')
          and finops.is_text(p_record->'provider') and finops.is_text(p_record->'adapterKey') and finops.is_text(p_record->'providerModelId')
          and finops.is_text(p_record->'tariffVersion')) then
    return 'record: identificadores de rota obrigatórios';
  end if;
  if not (finops.is_text_or_null(p_record->'resolvedProvider') and finops.is_text_or_null(p_record->'resolvedProviderModelId')
          and finops.is_text_or_null(p_record->'externalRequestId')) then
    return 'record: campos resolvidos texto ou null';
  end if;
  if not finops.is_text(p_record->'startedAt') then return 'record.startedAt: obrigatório'; end if;
  begin
    v_started := (p_record->>'startedAt')::timestamptz;
  exception when others then
    return 'record.startedAt: data-hora inválida';
  end;
  if v_started < a.acquired_at - interval '300 seconds' or v_started > p_db_now + interval '300 seconds' then
    return 'record.startedAt: fora da janela de ±300 s do relógio do banco';
  end if;
  return null;
end
$$;

-- ---------------------------------------------------- acquire (worker)
create or replace function app.acquire_model_attempt(
  p_tenant_id uuid,
  p_workflow_key text,
  p_action_key text,
  p_invocation_id text,
  p_attempt integer,
  p_call_id text,
  p_agent_key text,
  p_request_fingerprint text,
  p_accepted_fingerprints text[],
  p_estimate_micro_usd bigint,
  p_lease_owner text,
  p_lease_seconds integer,
  p_client_observed_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_db_now timestamptz := pg_catalog.clock_timestamp();
  v_active_tenant uuid;
  v_row finops.model_attempts;
  v_tenant_period finops.budget_periods;
  v_workflow_period finops.budget_periods;
  v_available numeric;
begin
  v_active_tenant := app.current_tenant();
  if v_active_tenant is null or v_active_tenant <> p_tenant_id then
    raise exception 'tenant ativo não autoriza a aquisição' using errcode = '42501';
  end if;

  -- 1. Parâmetros, antes de qualquer lock ou escrita.
  if p_workflow_key is null or pg_catalog.char_length(p_workflow_key) not between 1 and 128
     or p_action_key is null or p_action_key !~ '^[a-z][a-z0-9_]*$' or pg_catalog.char_length(p_action_key) > 64
     or p_invocation_id is null or pg_catalog.char_length(p_invocation_id) not between 1 and 255
     or p_attempt is null or p_attempt not between 1 and 5
     or p_call_id is null or p_call_id <> finops.attempt_call_id(p_tenant_id, p_action_key, p_invocation_id, p_attempt)
     or p_agent_key is null or p_agent_key !~ '^[a-z][a-z0-9-]*-agent$' or pg_catalog.char_length(p_agent_key) > 64
     or p_request_fingerprint is null or p_request_fingerprint !~ '^hmac-sha256:v1:[a-z0-9][a-z0-9._-]{0,63}:[0-9a-f]{64}$'
     or p_accepted_fingerprints is null or pg_catalog.cardinality(p_accepted_fingerprints) not between 1 and 16
     or not (p_request_fingerprint = any (p_accepted_fingerprints))
     or exists (select 1 from pg_catalog.unnest(p_accepted_fingerprints) f
                 where f is null or f !~ '^hmac-sha256:v1:[a-z0-9][a-z0-9._-]{0,63}:[0-9a-f]{64}$')
     or p_estimate_micro_usd is null or p_estimate_micro_usd not between 0 and 9007199254740991
     or p_lease_owner is null or pg_catalog.char_length(p_lease_owner) not between 1 and 255
     or p_lease_seconds is null or p_lease_seconds not between 60 and 900 then
    raise exception 'parâmetros inválidos para aquisição de tentativa' using errcode = '22023';
  end if;
  if p_client_observed_at is not null
     and (p_client_observed_at < v_db_now - interval '300 seconds' or p_client_observed_at > v_db_now + interval '300 seconds') then
    raise exception 'clientObservedAt fora da janela de ±300 s do relógio do banco' using errcode = '22023';
  end if;

  -- 2. Identidade.
  perform pg_catalog.pg_advisory_xact_lock(finops.identity_lock_key(p_tenant_id, p_action_key, p_invocation_id, p_attempt));

  -- 3. Chave existente: resposta só pela tentativa, sem consultar período.
  select * into v_row from finops.model_attempts m
   where m.tenant_id = p_tenant_id and m.action_key = p_action_key
     and m.invocation_id = p_invocation_id and m.attempt = p_attempt
   for update;
  if found then
    if not (v_row.request_fingerprint = any (p_accepted_fingerprints)) then
      return pg_catalog.jsonb_build_object('status', 'conflict');
    end if;
    if v_row.status = 'reserved' and v_row.lease_expires_at > v_db_now then
      return pg_catalog.jsonb_build_object('status', 'in_progress');
    end if;
    if v_row.status = 'reserved' then
      perform finops.expire_locked_attempt(v_row, v_db_now);
    end if;
    return pg_catalog.jsonb_build_object('status', 'closed');
  end if;

  -- 4. Identidade nova: períodos aplicáveis pelo relógio do banco, tenant → workflow_key.
  select * into v_tenant_period from finops.budget_periods b
   where b.tenant_id = p_tenant_id and b.scope = 'tenant' and b.status = 'open'
     and b.period_start <= v_db_now and v_db_now < b.period_end
   order by b.period_start desc
   limit 1
   for update;
  if not found then
    return pg_catalog.jsonb_build_object('status', 'budget_not_configured');
  end if;
  select * into v_workflow_period from finops.budget_periods b
   where b.tenant_id = p_tenant_id and b.scope = 'workflow_key' and b.workflow_key = p_workflow_key and b.status = 'open'
     and b.period_start <= v_db_now and v_db_now < b.period_end
   order by b.period_start desc
   limit 1
   for update;

  -- 5. Saldo em numeric; nada é gravado quando não cabe.
  v_available := v_tenant_period.limit_micro_usd::numeric - v_tenant_period.reserved_micro_usd
    - v_tenant_period.settled_micro_usd - v_tenant_period.held_micro_usd;
  if v_workflow_period.period_id is not null then
    v_available := least(v_available, v_workflow_period.limit_micro_usd::numeric - v_workflow_period.reserved_micro_usd
      - v_workflow_period.settled_micro_usd - v_workflow_period.held_micro_usd);
  end if;
  if p_estimate_micro_usd::numeric > v_available then
    return pg_catalog.jsonb_build_object('status', 'insufficient', 'remainingMicroUsd', greatest(v_available, 0)::bigint);
  end if;

  insert into finops.model_attempts (
    tenant_id, action_key, invocation_id, attempt, call_id, workflow_key, agent_key, request_fingerprint,
    tenant_period_id, workflow_period_id, status, estimate_micro_usd,
    lease_owner, lease_expires_at, lease_seconds, fencing_token, acquired_at, client_observed_at
  ) values (
    p_tenant_id, p_action_key, p_invocation_id, p_attempt, p_call_id, p_workflow_key, p_agent_key, p_request_fingerprint,
    v_tenant_period.period_id, v_workflow_period.period_id, 'reserved', p_estimate_micro_usd,
    p_lease_owner, v_db_now + p_lease_seconds * interval '1 second', p_lease_seconds, pg_catalog.gen_random_uuid(),
    v_db_now, p_client_observed_at
  ) returning * into v_row;

  perform finops.apply_period_step(p_tenant_id, v_tenant_period.period_id, 'tenant', p_call_id, 'reserve',
    p_estimate_micro_usd, 0, 0, 0, 'worker', null, v_db_now);
  if v_workflow_period.period_id is not null then
    perform finops.apply_period_step(p_tenant_id, v_workflow_period.period_id, 'workflow_key', p_call_id, 'reserve',
      p_estimate_micro_usd, 0, 0, 0, 'worker', null, v_db_now);
  end if;

  return pg_catalog.jsonb_build_object(
    'status', 'acquired',
    'fencingToken', v_row.fencing_token::text,
    'leaseExpiresAt', finops.iso(v_row.lease_expires_at),
    'attempt', finops.attempt_snapshot(v_row)
  );
end
$$;

-- ------------------------------------------------------ close (worker)
create or replace function app.close_model_attempt(
  p_tenant_id uuid,
  p_action_key text,
  p_invocation_id text,
  p_attempt integer,
  p_fencing_token uuid,
  p_outcome text,
  p_actual_micro_usd bigint,
  p_cost_status text,
  p_pending_reason text,
  p_record jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_db_now timestamptz := pg_catalog.clock_timestamp();
  v_active_tenant uuid;
  v_row finops.model_attempts;
  v_document jsonb;
  v_problem text;
  v_status text;
begin
  v_active_tenant := app.current_tenant();
  if v_active_tenant is null or v_active_tenant <> p_tenant_id then
    raise exception 'tenant ativo não autoriza o fechamento' using errcode = '42501';
  end if;
  if p_action_key is null or p_invocation_id is null or p_attempt is null or p_fencing_token is null then
    raise exception 'INVALID_STATE_TRANSITION: identidade ou token ausente' using errcode = '55000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(finops.identity_lock_key(p_tenant_id, p_action_key, p_invocation_id, p_attempt));
  select * into v_row from finops.model_attempts m
   where m.tenant_id = p_tenant_id and m.action_key = p_action_key
     and m.invocation_id = p_invocation_id and m.attempt = p_attempt
   for update;
  if not found then
    raise exception 'INVALID_STATE_TRANSITION: tentativa inexistente' using errcode = '55000';
  end if;

  -- Já fechada pelo harness: só replay exato do comando normalizado.
  if v_row.close_outcome is not null then
    select r.record_document into v_document from finops.model_call_records r
     where r.tenant_id = v_row.tenant_id and r.call_id = v_row.call_id;
    if p_fencing_token = v_row.fencing_token
       and p_outcome is not distinct from v_row.close_outcome
       and p_actual_micro_usd is not distinct from v_row.close_actual_micro_usd
       and p_cost_status is not distinct from v_row.close_cost_status
       and p_pending_reason is not distinct from v_row.close_pending_reason
       and p_record is not distinct from v_document then
      return pg_catalog.jsonb_build_object('status', 'duplicate', 'attempt', finops.attempt_snapshot(v_row));
    end if;
    raise exception 'INVALID_STATE_TRANSITION: replay divergente do fechamento gravado' using errcode = '55000';
  end if;
  -- Movida pelo sweep (com ou sem conciliação): nunca ganha registro.
  if v_row.status <> 'reserved' then
    raise exception 'INVALID_STATE_TRANSITION: tentativa não está reservada' using errcode = '55000';
  end if;
  if p_fencing_token <> v_row.fencing_token then
    raise exception 'INVALID_STATE_TRANSITION: fencing token obsoleto' using errcode = '55000';
  end if;
  if not (
    (p_outcome = 'charged' and p_cost_status = 'settled' and p_pending_reason is null
      and p_actual_micro_usd is not null and p_actual_micro_usd between 0 and 9007199254740991)
    or (p_outcome = 'not_charged' and p_cost_status = 'not_charged' and p_pending_reason is null and p_actual_micro_usd = 0)
    or (p_outcome = 'unknown' and p_cost_status = 'pending_reconciliation' and p_actual_micro_usd is null
      and p_pending_reason in ('billing_unknown', 'provider_response_invalid', 'adapter_exception', 'cost_not_computable'))
  ) then
    raise exception 'INVALID_STATE_TRANSITION: comando de fechamento incoerente' using errcode = '55000';
  end if;
  v_problem := finops.record_problem(p_record, v_row, p_cost_status, p_actual_micro_usd, v_db_now);
  if v_problem is not null then
    raise exception 'INVALID_STATE_TRANSITION: %', v_problem using errcode = '55000';
  end if;

  if p_outcome = 'charged' then
    v_status := 'settled';
    perform finops.apply_attempt_step(v_row, 'settle', -v_row.estimate_micro_usd::numeric, p_actual_micro_usd::numeric, 0,
      greatest(p_actual_micro_usd::numeric - v_row.estimate_micro_usd, 0), 'worker', null, v_db_now);
  elsif p_outcome = 'not_charged' then
    v_status := 'released';
    perform finops.apply_attempt_step(v_row, 'release', -v_row.estimate_micro_usd::numeric, 0, 0, 0, 'worker', null, v_db_now);
  else
    v_status := 'pending_reconciliation';
    perform finops.apply_attempt_step(v_row, 'hold', -v_row.estimate_micro_usd::numeric, 0, v_row.estimate_micro_usd::numeric, 0,
      'worker', p_pending_reason, v_db_now);
  end if;

  update finops.model_attempts m
     set status = v_status,
         actual_micro_usd = case when p_outcome = 'unknown' then null else p_actual_micro_usd end,
         pending_reason = p_pending_reason,
         close_outcome = p_outcome,
         close_actual_micro_usd = p_actual_micro_usd,
         close_cost_status = p_cost_status,
         close_pending_reason = p_pending_reason,
         lease_owner = null,
         lease_expires_at = null,
         closed_at = v_db_now
   where m.tenant_id = v_row.tenant_id and m.action_key = v_row.action_key
     and m.invocation_id = v_row.invocation_id and m.attempt = v_row.attempt
  returning * into v_row;

  insert into finops.model_call_records (
    tenant_id, call_id, action_key, invocation_id, attempt, workflow_key, agent_key,
    correlation_id, transaction_id, causation_id, parent_transaction_id, workflow_id, task_id, run_id,
    request_fingerprint, data_classification, classification_provenance, input_tokens_estimate, input_tokens_estimate_method,
    profile_ref, registry_version, model_id, provider, adapter_key, provider_model_id, tariff_version,
    routing_reason, fallback_occurred, resolved_provider, resolved_provider_model_id, external_request_id,
    outcome, failure_kind, usage, output_asset_ids, estimated_cost_micro_usd, cost_micro_usd, cost_status,
    started_at, latency_ms, record_document, created_at
  ) values (
    v_row.tenant_id, v_row.call_id, v_row.action_key, v_row.invocation_id, v_row.attempt, v_row.workflow_key, v_row.agent_key,
    p_record->'trace'->>'correlationId', p_record->'trace'->>'transactionId', p_record->'trace'->>'causationId',
    p_record->'trace'->>'parentTransactionId', p_record->'trace'->>'workflowId', p_record->'trace'->>'taskId',
    p_record->'trace'->>'runId',
    v_row.request_fingerprint, p_record->>'dataClassification', p_record->'classificationProvenance',
    (p_record->>'inputTokensEstimate')::bigint, p_record->>'inputTokensEstimateMethod',
    p_record->>'profileRef', p_record->>'registryVersion', p_record->>'modelId', p_record->>'provider',
    p_record->>'adapterKey', p_record->>'providerModelId', p_record->>'tariffVersion',
    p_record->>'routingReason', (p_record->>'fallbackOccurred')::boolean, p_record->>'resolvedProvider',
    p_record->>'resolvedProviderModelId', p_record->>'externalRequestId',
    p_record->>'outcome', p_record->>'failureKind',
    case when pg_catalog.jsonb_typeof(p_record->'usage') = 'null' then null else p_record->'usage' end,
    case when pg_catalog.jsonb_typeof(p_record->'outputAssetIds') = 'null' then null
      else array(select pg_catalog.jsonb_array_elements_text(p_record->'outputAssetIds')) end,
    v_row.estimate_micro_usd, p_actual_micro_usd, p_cost_status,
    (p_record->>'startedAt')::timestamptz, (p_record->>'latencyMs')::bigint, p_record, v_db_now
  );

  return pg_catalog.jsonb_build_object('status', 'closed', 'attempt', finops.attempt_snapshot(v_row));
end
$$;

-- -------------------------------------------------- remaining (worker)
create or replace function app.budget_remaining(p_tenant_id uuid, p_workflow_key text) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_db_now timestamptz := pg_catalog.clock_timestamp();
  v_active_tenant uuid;
  v_tenant_available numeric;
  v_workflow_available numeric;
begin
  v_active_tenant := app.current_tenant();
  if v_active_tenant is null or v_active_tenant <> p_tenant_id then
    raise exception 'tenant ativo não autoriza a consulta' using errcode = '42501';
  end if;
  if p_workflow_key is null or pg_catalog.char_length(p_workflow_key) not between 1 and 128 then
    raise exception 'workflowKey inválido' using errcode = '22023';
  end if;
  select b.limit_micro_usd::numeric - b.reserved_micro_usd - b.settled_micro_usd - b.held_micro_usd
    into v_tenant_available
    from finops.budget_periods b
   where b.tenant_id = p_tenant_id and b.scope = 'tenant' and b.status = 'open'
     and b.period_start <= v_db_now and v_db_now < b.period_end
   order by b.period_start desc limit 1;
  if v_tenant_available is null then
    return pg_catalog.jsonb_build_object('remainingMicroUsd', null);
  end if;
  select b.limit_micro_usd::numeric - b.reserved_micro_usd - b.settled_micro_usd - b.held_micro_usd
    into v_workflow_available
    from finops.budget_periods b
   where b.tenant_id = p_tenant_id and b.scope = 'workflow_key' and b.workflow_key = p_workflow_key and b.status = 'open'
     and b.period_start <= v_db_now and v_db_now < b.period_end
   order by b.period_start desc limit 1;
  return pg_catalog.jsonb_build_object('remainingMicroUsd',
    greatest(least(v_tenant_available, coalesce(v_workflow_available, v_tenant_available)), 0)::bigint);
end
$$;

-- ----------------------------------------------------- sweep (worker)
create or replace function app.expire_next_model_attempt(p_tenant_id uuid) returns text
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_db_now timestamptz := pg_catalog.clock_timestamp();
  v_active_tenant uuid;
  v_candidate record;
  v_row finops.model_attempts;
begin
  v_active_tenant := app.current_tenant();
  if v_active_tenant is null or v_active_tenant <> p_tenant_id then
    raise exception 'tenant ativo não autoriza o sweep' using errcode = '42501';
  end if;
  -- (a) Candidatos sem nenhum lock de linha.
  for v_candidate in
    select m.action_key, m.invocation_id, m.attempt
      from finops.model_attempts m
     where m.tenant_id = p_tenant_id and m.status = 'reserved' and m.lease_expires_at <= v_db_now
     order by m.lease_expires_at, m.call_id
     limit 100
  loop
    -- (b) Identidade sem esperar; ocupada → próximo candidato.
    if pg_catalog.pg_try_advisory_xact_lock(
         finops.identity_lock_key(p_tenant_id, v_candidate.action_key, v_candidate.invocation_id, v_candidate.attempt)) then
      -- (c) Linha só depois da identidade, com revalidação pelo relógio do banco.
      select * into v_row from finops.model_attempts m
       where m.tenant_id = p_tenant_id and m.action_key = v_candidate.action_key
         and m.invocation_id = v_candidate.invocation_id and m.attempt = v_candidate.attempt
       for update;
      if not found or v_row.status <> 'reserved' or v_row.lease_expires_at > v_db_now then
        return null;
      end if;
      -- (d) Períodos vinculados e transição; uma tentativa por chamada.
      perform finops.expire_locked_attempt(v_row, v_db_now);
      return v_row.call_id;
    end if;
  end loop;
  return null;
end
$$;

-- ------------------------------------------------- operador: contexto
create or replace function finops.require_operator(p_tenant_id uuid, p_reason text) returns uuid
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  v_active_tenant uuid := app.current_tenant();
  v_operator uuid;
begin
  if v_active_tenant is null or v_active_tenant <> p_tenant_id then
    raise exception 'tenant ativo não autoriza a operação' using errcode = '42501';
  end if;
  begin
    v_operator := nullif(pg_catalog.current_setting('app.operator_id', true), '')::uuid;
  exception when others then
    v_operator := null;
  end;
  if v_operator is null then
    raise exception 'operação privilegiada exige operador identificado' using errcode = '42501';
  end if;
  if p_reason is null or pg_catalog.char_length(btrim(p_reason)) not between 1 and 500 then
    raise exception 'motivo obrigatório' using errcode = '22023';
  end if;
  return v_operator;
end
$$;

-- ---------------------------------------------- reconcile (operador)
create or replace function app.reconcile_model_attempt(
  p_tenant_id uuid,
  p_action_key text,
  p_invocation_id text,
  p_attempt integer,
  p_actual_micro_usd bigint,
  p_evidence_ref text,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_db_now timestamptz := pg_catalog.clock_timestamp();
  v_operator uuid;
  v_row finops.model_attempts;
begin
  v_operator := finops.require_operator(p_tenant_id, p_reason);
  if p_action_key is null or p_invocation_id is null or p_attempt is null
     or p_actual_micro_usd is null or p_actual_micro_usd not between 0 and 9007199254740991
     or p_evidence_ref is null or pg_catalog.char_length(p_evidence_ref) not between 1 and 512 then
    raise exception 'parâmetros inválidos para conciliação' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(finops.identity_lock_key(p_tenant_id, p_action_key, p_invocation_id, p_attempt));
  select * into v_row from finops.model_attempts m
   where m.tenant_id = p_tenant_id and m.action_key = p_action_key
     and m.invocation_id = p_invocation_id and m.attempt = p_attempt
   for update;
  if not found then
    raise exception 'INVALID_STATE_TRANSITION: tentativa inexistente' using errcode = '55000';
  end if;
  if v_row.status = 'reconciled' then
    if v_row.actual_micro_usd = p_actual_micro_usd and v_row.reconciliation_evidence_ref = p_evidence_ref then
      return pg_catalog.jsonb_build_object('status', 'duplicate', 'attempt', finops.attempt_snapshot(v_row));
    end if;
    raise exception 'INVALID_STATE_TRANSITION: conciliação divergente' using errcode = '55000';
  end if;
  if v_row.status <> 'pending_reconciliation' then
    raise exception 'INVALID_STATE_TRANSITION: tentativa não está pendente de conciliação' using errcode = '55000';
  end if;

  perform finops.apply_attempt_step(v_row, 'reconcile', 0, p_actual_micro_usd::numeric, -v_row.estimate_micro_usd::numeric,
    greatest(p_actual_micro_usd::numeric - v_row.estimate_micro_usd, 0), 'operator', p_reason, v_db_now);
  update finops.model_attempts m
     set status = 'reconciled', actual_micro_usd = p_actual_micro_usd, reconciled_at = v_db_now,
         reconciled_by = v_operator, reconciliation_evidence_ref = p_evidence_ref
   where m.tenant_id = v_row.tenant_id and m.action_key = v_row.action_key
     and m.invocation_id = v_row.invocation_id and m.attempt = v_row.attempt
  returning * into v_row;

  insert into core.audit_log (tenant_id, actor_type, actor_id, action, target, before, after, reason, created_at)
  values (p_tenant_id, 'operator', v_operator, 'finops.attempt.reconcile', v_row.call_id,
    pg_catalog.jsonb_build_object('status', 'pending_reconciliation', 'heldMicroUsd', v_row.estimate_micro_usd,
      'pendingReason', v_row.pending_reason),
    pg_catalog.jsonb_build_object('status', 'reconciled', 'actualMicroUsd', p_actual_micro_usd, 'evidenceRef', p_evidence_ref),
    p_reason, v_db_now);

  return pg_catalog.jsonb_build_object('status', 'reconciled', 'attempt', finops.attempt_snapshot(v_row));
end
$$;

-- ------------------------------------------- períodos (operador)
create or replace function app.open_budget_period(
  p_tenant_id uuid,
  p_scope text,
  p_workflow_key text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_limit_micro_usd bigint,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_db_now timestamptz := pg_catalog.clock_timestamp();
  v_operator uuid;
  v_period finops.budget_periods;
begin
  v_operator := finops.require_operator(p_tenant_id, p_reason);
  if p_scope is null or p_scope not in ('tenant', 'workflow_key')
     or (p_scope = 'tenant' and p_workflow_key is not null)
     or (p_scope = 'workflow_key' and (p_workflow_key is null or pg_catalog.char_length(p_workflow_key) not between 1 and 128))
     or p_period_start is null or p_period_end is null or p_period_end <= p_period_start
     or p_limit_micro_usd is null or p_limit_micro_usd not between 0 and 9007199254740991 then
    raise exception 'parâmetros inválidos para período de orçamento' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'finops.period|' || pg_catalog.jsonb_build_array(p_tenant_id::text, p_scope, coalesce(p_workflow_key, ''))::text, 0));
  if exists (
    select 1 from finops.budget_periods b
     where b.tenant_id = p_tenant_id and b.scope = p_scope
       and b.workflow_key is not distinct from p_workflow_key
       and b.period_start < p_period_end and p_period_start < b.period_end
  ) then
    raise exception 'BUDGET_PERIOD_OVERLAP: janela sobreposta a período existente' using errcode = '23P01';
  end if;

  insert into finops.budget_periods (
    tenant_id, period_id, scope, workflow_key, period_start, period_end, limit_micro_usd, created_by, created_at
  ) values (
    p_tenant_id, 'bp-' || pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), p_scope, p_workflow_key,
    p_period_start, p_period_end, p_limit_micro_usd, v_operator, v_db_now
  ) returning * into v_period;

  insert into core.audit_log (tenant_id, actor_type, actor_id, action, target, before, after, reason, created_at)
  values (p_tenant_id, 'operator', v_operator, 'finops.budget_period.open', v_period.period_id, null,
    finops.period_snapshot(v_period), p_reason, v_db_now);

  return finops.period_snapshot(v_period);
end
$$;

create or replace function app.close_budget_period(p_tenant_id uuid, p_period_id text, p_reason text) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_db_now timestamptz := pg_catalog.clock_timestamp();
  v_operator uuid;
  v_before finops.budget_periods;
  v_period finops.budget_periods;
begin
  v_operator := finops.require_operator(p_tenant_id, p_reason);
  select * into v_before from finops.budget_periods b
   where b.tenant_id = p_tenant_id and b.period_id = p_period_id
   for update;
  if not found or v_before.status <> 'open' then
    raise exception 'INVALID_STATE_TRANSITION: período inexistente ou já fechado' using errcode = '55000';
  end if;
  update finops.budget_periods b
     set status = 'closed', closed_at = v_db_now
   where b.tenant_id = p_tenant_id and b.period_id = p_period_id
  returning * into v_period;

  insert into core.audit_log (tenant_id, actor_type, actor_id, action, target, before, after, reason, created_at)
  values (p_tenant_id, 'operator', v_operator, 'finops.budget_period.close', p_period_id,
    finops.period_snapshot(v_before), finops.period_snapshot(v_period), p_reason, v_db_now);

  return finops.period_snapshot(v_period);
end
$$;

-- ------------------------------------------------ posse e privilégios
alter function app.acquire_model_attempt(uuid, text, text, text, integer, text, text, text, text[], bigint, text, integer, timestamptz) owner to postgres;
alter function app.close_model_attempt(uuid, text, text, integer, uuid, text, bigint, text, text, jsonb) owner to postgres;
alter function app.budget_remaining(uuid, text) owner to postgres;
alter function app.expire_next_model_attempt(uuid) owner to postgres;
alter function app.reconcile_model_attempt(uuid, text, text, integer, bigint, text, text) owner to postgres;
alter function app.open_budget_period(uuid, text, text, timestamptz, timestamptz, bigint, text) owner to postgres;
alter function app.close_budget_period(uuid, text, text) owner to postgres;

revoke all on function app.acquire_model_attempt(uuid, text, text, text, integer, text, text, text, text[], bigint, text, integer, timestamptz) from public;
revoke all on function app.close_model_attempt(uuid, text, text, integer, uuid, text, bigint, text, text, jsonb) from public;
revoke all on function app.budget_remaining(uuid, text) from public;
revoke all on function app.expire_next_model_attempt(uuid) from public;
revoke all on function app.reconcile_model_attempt(uuid, text, text, integer, bigint, text, text) from public;
revoke all on function app.open_budget_period(uuid, text, text, timestamptz, timestamptz, bigint, text) from public;
revoke all on function app.close_budget_period(uuid, text, text) from public;

-- Supabase concede EXECUTE em funções novas a anon/authenticated/service_role
-- por default privileges: revogação explícita para cada um.
revoke all on function app.acquire_model_attempt(uuid, text, text, text, integer, text, text, text, text[], bigint, text, integer, timestamptz) from anon, authenticated, service_role;
revoke all on function app.close_model_attempt(uuid, text, text, integer, uuid, text, bigint, text, text, jsonb) from anon, authenticated, service_role;
revoke all on function app.budget_remaining(uuid, text) from anon, authenticated, service_role;
revoke all on function app.expire_next_model_attempt(uuid) from anon, authenticated, service_role;
revoke all on function app.reconcile_model_attempt(uuid, text, text, integer, bigint, text, text) from anon, authenticated, service_role;
revoke all on function app.open_budget_period(uuid, text, text, timestamptz, timestamptz, bigint, text) from anon, authenticated, service_role;
revoke all on function app.close_budget_period(uuid, text, text) from anon, authenticated, service_role;

grant execute on function app.acquire_model_attempt(uuid, text, text, text, integer, text, text, text, text[], bigint, text, integer, timestamptz) to oplyra_worker_exec;
grant execute on function app.close_model_attempt(uuid, text, text, integer, uuid, text, bigint, text, text, jsonb) to oplyra_worker_exec;
grant execute on function app.budget_remaining(uuid, text) to oplyra_worker_exec;
grant execute on function app.expire_next_model_attempt(uuid) to oplyra_worker_exec;
grant execute on function app.reconcile_model_attempt(uuid, text, text, integer, bigint, text, text) to oplyra_ops_exec;
grant execute on function app.open_budget_period(uuid, text, text, timestamptz, timestamptz, bigint, text) to oplyra_ops_exec;
grant execute on function app.close_budget_period(uuid, text, text) to oplyra_ops_exec;

-- Utilidades internas: somente o dono as executa, a partir das funções acima.
do $$
declare
  v_fn regprocedure;
begin
  for v_fn in
    select p.oid::regprocedure from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'finops'
  loop
    execute pg_catalog.format('alter function %s owner to postgres', v_fn);
    execute pg_catalog.format('revoke all on function %s from public, anon, authenticated, service_role', v_fn);
  end loop;
end
$$;

comment on function app.acquire_model_attempt(uuid, text, text, text, integer, text, text, text, text[], bigint, text, integer, timestamptz) is
  'CR-027: aquisição idempotente (identidade antes de período), reserva atômica e lease pelo relógio do banco.';
comment on function app.close_model_attempt(uuid, text, text, integer, uuid, text, bigint, text, text, jsonb) is
  'CR-027: fechamento único com Model Call Record na mesma transação; replay somente exato.';
comment on function app.budget_remaining(uuid, text) is
  'CR-027: saldo consultivo dos períodos vigentes pelo relógio do banco; null sem período do tenant.';
comment on function app.expire_next_model_attempt(uuid) is
  'CR-027: move uma tentativa com lease vencido para pending_reconciliation (lease_expired), sem registro.';
comment on function app.reconcile_model_attempt(uuid, text, text, integer, bigint, text, text) is
  'CR-027: conciliação auditada por operador com referência de evidência.';
comment on function app.open_budget_period(uuid, text, text, timestamptz, timestamptz, bigint, text) is
  'CR-027: abre período explícito sem sobreposição (advisory lock, D-6); auditado.';
comment on function app.close_budget_period(uuid, text, text) is
  'CR-027: fecha período; tentativas vinculadas continuam fechando e conciliando contra ele; auditado.';
