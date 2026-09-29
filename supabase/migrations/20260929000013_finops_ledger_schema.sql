-- CR-027 — Cost Ledger persistente: schema `finops`, tabelas, constraints,
-- índices, triggers e RLS forçada. Nenhuma policy e nenhum GRANT a papel de
-- aplicação: o acesso existe somente pelas funções `security definer` da
-- migration 20260929000014. Valores monetários em micro-USD inteiros,
-- limitados a 2^53 − 1 para atravessar o `nonNegativeSafeInteger` do TypeScript.

create schema if not exists finops;
revoke all on schema finops from public;

-- ------------------------------------------------------------ callId
-- `att1.` + base64url sem preenchimento de UTF-8(JSON.stringify([tenant,
-- action, invocationId, attempt])) — mesma derivação do núcleo (CR-026 §4).
-- `to_json(text)` escapa como `JSON.stringify` (aspas, barra invertida e
-- controles < U+0020 em minúsculas); os separadores não levam espaço.
create or replace function finops.attempt_call_id(
  p_tenant_id uuid, p_action_key text, p_invocation_id text, p_attempt integer
) returns text
language sql immutable strict
set search_path = pg_catalog, pg_temp
as $$
  select 'att1.' || rtrim(translate(replace(pg_catalog.encode(pg_catalog.convert_to(
    '[' || pg_catalog.to_json(p_tenant_id::text)::text || ',' || pg_catalog.to_json(p_action_key)::text || ','
        || pg_catalog.to_json(p_invocation_id)::text || ',' || p_attempt::text || ']', 'UTF8'), 'base64'), E'\n', ''),
    '+/', '-_'), '=')
$$;
revoke all on function finops.attempt_call_id(uuid, text, text, integer) from public;

-- ------------------------------------------------------ budget_periods
create table finops.budget_periods (
  tenant_id           uuid not null references core.tenants(id) on delete cascade,
  period_id           text not null check (period_id ~ '^bp-[0-9a-f]{32}$'),
  scope               text not null check (scope in ('tenant', 'workflow_key')),
  workflow_key        text check (workflow_key is null or char_length(workflow_key) between 1 and 128),
  period_start        timestamptz not null,
  period_end          timestamptz not null,
  limit_micro_usd     bigint not null check (limit_micro_usd between 0 and 9007199254740991),
  reserved_micro_usd  bigint not null default 0 check (reserved_micro_usd between 0 and 9007199254740991),
  settled_micro_usd   bigint not null default 0 check (settled_micro_usd between 0 and 9007199254740991),
  held_micro_usd      bigint not null default 0 check (held_micro_usd between 0 and 9007199254740991),
  currency            text not null default 'USD' check (currency = 'USD'),
  status              text not null default 'open' check (status in ('open', 'closed')),
  created_by          uuid not null,
  created_at          timestamptz not null,
  closed_at           timestamptz,
  primary key (tenant_id, period_id),
  constraint budget_periods_window check (period_end > period_start),
  constraint budget_periods_scope_shape check (
    (scope = 'tenant' and workflow_key is null) or (scope = 'workflow_key' and workflow_key is not null)
  ),
  constraint budget_periods_state_shape check (
    (status = 'open' and closed_at is null) or (status = 'closed' and closed_at is not null)
  ),
  constraint budget_periods_counters_safe check (
    reserved_micro_usd::numeric + settled_micro_usd::numeric + held_micro_usd::numeric <= 9007199254740991
  )
);

-- Mesmo início na mesma janela é sempre duplicata; sobreposição geral é
-- barrada pela função de abertura sob advisory lock (D-6).
create unique index budget_periods_start_unique
  on finops.budget_periods (tenant_id, scope, coalesce(workflow_key, ''), period_start);
create index budget_periods_applicable
  on finops.budget_periods (tenant_id, scope, workflow_key, period_start) where status = 'open';

create trigger budget_periods_tenant_imutavel
  before update on finops.budget_periods
  for each row execute function app.forbid_tenant_change();

-- ------------------------------------------------------ model_attempts
create table finops.model_attempts (
  tenant_id                    uuid not null references core.tenants(id) on delete cascade,
  action_key                   text not null check (action_key ~ '^[a-z][a-z0-9_]*$' and char_length(action_key) <= 64),
  invocation_id                text not null check (char_length(invocation_id) between 1 and 255),
  attempt                      integer not null check (attempt between 1 and 5),
  call_id                      text not null check (call_id ~ '^att1\.[A-Za-z0-9_-]+$' and char_length(call_id) <= 3171),
  workflow_key                 text not null check (char_length(workflow_key) between 1 and 128),
  agent_key                    text not null check (agent_key ~ '^[a-z][a-z0-9-]*-agent$' and char_length(agent_key) <= 64),
  request_fingerprint          text not null check (request_fingerprint ~ '^hmac-sha256:v1:[a-z0-9][a-z0-9._-]{0,63}:[0-9a-f]{64}$'),
  fingerprint_key_id           text generated always as (split_part(request_fingerprint, ':', 3)) stored,
  tenant_period_id             text not null,
  workflow_period_id           text,
  status                       text not null check (status in ('reserved', 'settled', 'released', 'pending_reconciliation', 'reconciled')),
  estimate_micro_usd           bigint not null check (estimate_micro_usd between 0 and 9007199254740991),
  actual_micro_usd             bigint check (actual_micro_usd between 0 and 9007199254740991),
  close_outcome                text check (close_outcome in ('charged', 'not_charged', 'unknown')),
  close_actual_micro_usd       bigint check (close_actual_micro_usd between 0 and 9007199254740991),
  close_cost_status            text check (close_cost_status in ('settled', 'not_charged', 'pending_reconciliation')),
  close_pending_reason         text check (close_pending_reason in ('billing_unknown', 'provider_response_invalid', 'adapter_exception', 'cost_not_computable')),
  pending_reason               text check (pending_reason in ('billing_unknown', 'provider_response_invalid', 'adapter_exception', 'cost_not_computable', 'lease_expired')),
  lease_owner                  text check (lease_owner is null or char_length(lease_owner) between 1 and 255),
  lease_expires_at             timestamptz,
  lease_seconds                integer not null check (lease_seconds between 60 and 900),
  fencing_token                uuid not null,
  acquired_at                  timestamptz not null,
  closed_at                    timestamptz,
  reconciled_at                timestamptz,
  reconciled_by                uuid,
  reconciliation_evidence_ref  text check (reconciliation_evidence_ref is null or char_length(reconciliation_evidence_ref) between 1 and 512),
  client_observed_at           timestamptz,
  primary key (tenant_id, action_key, invocation_id, attempt),
  unique (tenant_id, call_id),
  foreign key (tenant_id, tenant_period_id) references finops.budget_periods (tenant_id, period_id) on delete cascade,
  foreign key (tenant_id, workflow_period_id) references finops.budget_periods (tenant_id, period_id) on delete cascade,
  constraint model_attempts_call_id_derived check (call_id = finops.attempt_call_id(tenant_id, action_key, invocation_id, attempt)),
  constraint model_attempts_lease_derived check (lease_expires_at is null or lease_expires_at > acquired_at),
  -- Comando de fechamento: todo nulo (reservada ou movida pelo sweep) ou coerente.
  constraint model_attempts_close_command_shape check (
    (close_outcome is null and close_actual_micro_usd is null and close_cost_status is null and close_pending_reason is null)
    or (close_outcome = 'charged' and close_actual_micro_usd is not null and close_cost_status = 'settled' and close_pending_reason is null)
    or (close_outcome = 'not_charged' and close_actual_micro_usd = 0 and close_cost_status = 'not_charged' and close_pending_reason is null)
    or (close_outcome = 'unknown' and close_actual_micro_usd is null and close_cost_status = 'pending_reconciliation' and close_pending_reason is not null)
  ),
  constraint model_attempts_state_shape check (
    (status = 'reserved'
      and lease_owner is not null and lease_expires_at is not null
      and actual_micro_usd is null and pending_reason is null and close_outcome is null
      and closed_at is null and reconciled_at is null and reconciled_by is null and reconciliation_evidence_ref is null)
    or
    (status = 'settled'
      and lease_owner is null and lease_expires_at is null
      and close_outcome = 'charged' and actual_micro_usd = close_actual_micro_usd and pending_reason is null
      and closed_at is not null and reconciled_at is null and reconciled_by is null and reconciliation_evidence_ref is null)
    or
    (status = 'released'
      and lease_owner is null and lease_expires_at is null
      and close_outcome = 'not_charged' and actual_micro_usd = 0 and pending_reason is null
      and closed_at is not null and reconciled_at is null and reconciled_by is null and reconciliation_evidence_ref is null)
    or
    (status = 'pending_reconciliation'
      and lease_owner is null and lease_expires_at is null
      and actual_micro_usd is null and pending_reason is not null
      and ((close_outcome = 'unknown' and pending_reason = close_pending_reason)
           or (close_outcome is null and pending_reason = 'lease_expired'))
      and closed_at is not null and reconciled_at is null and reconciled_by is null and reconciliation_evidence_ref is null)
    or
    (status = 'reconciled'
      and lease_owner is null and lease_expires_at is null
      and actual_micro_usd is not null and pending_reason is not null
      and ((close_outcome = 'unknown' and pending_reason = close_pending_reason)
           or (close_outcome is null and pending_reason = 'lease_expired'))
      and closed_at is not null and reconciled_at is not null and reconciled_by is not null
      and reconciliation_evidence_ref is not null)
  )
);

create index model_attempts_expired_lease
  on finops.model_attempts (tenant_id, lease_expires_at) where status = 'reserved';
create index model_attempts_reconciliation_queue
  on finops.model_attempts (tenant_id, status, closed_at) where status = 'pending_reconciliation';
create index model_attempts_tenant_period
  on finops.model_attempts (tenant_id, tenant_period_id);
create index model_attempts_workflow_period
  on finops.model_attempts (tenant_id, workflow_period_id) where workflow_period_id is not null;

-- Identidade, fingerprint, períodos, estimativa, lease derivado e comando de
-- fechamento nunca mudam depois de gravados.
create or replace function finops.forbid_attempt_identity_change() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.action_key is distinct from old.action_key or new.invocation_id is distinct from old.invocation_id
     or new.attempt is distinct from old.attempt or new.call_id is distinct from old.call_id
     or new.workflow_key is distinct from old.workflow_key or new.agent_key is distinct from old.agent_key
     or new.request_fingerprint is distinct from old.request_fingerprint
     or new.tenant_period_id is distinct from old.tenant_period_id
     or new.workflow_period_id is distinct from old.workflow_period_id
     or new.estimate_micro_usd is distinct from old.estimate_micro_usd
     or new.lease_seconds is distinct from old.lease_seconds
     or new.fencing_token is distinct from old.fencing_token
     or new.acquired_at is distinct from old.acquired_at
     or new.client_observed_at is distinct from old.client_observed_at
     or (old.close_outcome is not null and (
          new.close_outcome is distinct from old.close_outcome
          or new.close_actual_micro_usd is distinct from old.close_actual_micro_usd
          or new.close_cost_status is distinct from old.close_cost_status
          or new.close_pending_reason is distinct from old.close_pending_reason))
     or (old.closed_at is not null and new.closed_at is distinct from old.closed_at) then
    raise exception 'campo imutável de model_attempts alterado' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger model_attempts_tenant_imutavel
  before update on finops.model_attempts
  for each row execute function app.forbid_tenant_change();
create trigger model_attempts_identidade_imutavel
  before update on finops.model_attempts
  for each row execute function finops.forbid_attempt_identity_change();

-- -------------------------------------------------- model_call_records
create table finops.model_call_records (
  tenant_id                     uuid not null,
  call_id                       text not null,
  action_key                    text not null,
  invocation_id                 text not null,
  attempt                       integer not null,
  workflow_key                  text not null,
  agent_key                     text not null,
  correlation_id                text not null,
  transaction_id                text,
  causation_id                  text,
  parent_transaction_id         text,
  workflow_id                   text,
  task_id                       text,
  run_id                        text,
  request_fingerprint           text not null,
  data_classification           text not null check (data_classification in ('synthetic', 'internal', 'tenant_confidential', 'personal_data')),
  classification_provenance     jsonb not null check (jsonb_typeof(classification_provenance) = 'array' and jsonb_array_length(classification_provenance) >= 1),
  input_tokens_estimate         bigint not null check (input_tokens_estimate between 0 and 9007199254740991),
  input_tokens_estimate_method  text not null check (input_tokens_estimate_method in ('model_exact', 'conservative_bound', 'caller_hint')),
  profile_ref                   text not null,
  registry_version              text not null,
  model_id                      text not null,
  provider                      text not null,
  adapter_key                   text not null,
  provider_model_id             text not null,
  tariff_version                text not null,
  routing_reason                text not null check (routing_reason in ('preferred', 'lowest_cost_above_threshold', 'fallback', 'retry')),
  fallback_occurred             boolean not null,
  resolved_provider             text,
  resolved_provider_model_id    text,
  external_request_id           text,
  outcome                       text not null check (outcome in ('succeeded', 'failed')),
  failure_kind                  text,
  usage                         jsonb check (usage is null or jsonb_typeof(usage) = 'object'),
  output_asset_ids              text[],
  estimated_cost_micro_usd      bigint not null check (estimated_cost_micro_usd between 0 and 9007199254740991),
  cost_micro_usd                bigint check (cost_micro_usd between 0 and 9007199254740991),
  cost_status                   text not null check (cost_status in ('settled', 'not_charged', 'pending_reconciliation')),
  started_at                    timestamptz not null,
  latency_ms                    bigint not null check (latency_ms between 0 and 9007199254740991),
  record_document               jsonb not null check (jsonb_typeof(record_document) = 'object'),
  created_at                    timestamptz not null,
  primary key (tenant_id, call_id),
  foreign key (tenant_id, call_id) references finops.model_attempts (tenant_id, call_id) on delete cascade,
  constraint model_call_records_outcome_shape check (
    (outcome = 'succeeded' and failure_kind is null) or (outcome = 'failed' and failure_kind is not null)
  ),
  constraint model_call_records_cost_shape check (
    (cost_status = 'settled' and cost_micro_usd is not null)
    or (cost_status = 'not_charged' and cost_micro_usd = 0)
    or (cost_status = 'pending_reconciliation' and cost_micro_usd is null)
  ),
  constraint model_call_records_assets_on_success check (output_asset_ids is null or outcome = 'succeeded'),
  -- As colunas tipadas são projeção do documento normalizado, base do replay exato.
  constraint model_call_records_document_matches check (
    record_document->>'tenantId' = tenant_id::text
    and record_document->>'callId' = call_id
    and record_document->>'actionKey' = action_key
    and record_document->>'invocationId' = invocation_id
    and (record_document->>'attempt')::numeric = attempt
    and record_document->>'workflowKey' = workflow_key
    and record_document->>'agentKey' = agent_key
    and record_document->>'requestFingerprint' = request_fingerprint
    and record_document->'trace'->>'correlationId' = correlation_id
    and record_document->>'dataClassification' = data_classification
    and record_document->'classificationProvenance' = classification_provenance
    and record_document->>'outcome' = outcome
    and record_document->>'costStatus' = cost_status
    and (record_document->>'estimatedCostMicroUsd')::numeric = estimated_cost_micro_usd
    and (record_document->>'costMicroUsd')::numeric is not distinct from cost_micro_usd::numeric
    and record_document->'usage' is not distinct from coalesce(usage, 'null'::jsonb)
    and (record_document->>'latencyMs')::numeric = latency_ms
  )
);

create or replace function finops.forbid_record_mutation() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  -- Delete em cascata (exclusão do tenant ou da tentativa) chega aninhado na
  -- ação referencial; update e delete direto são sempre rejeitados.
  if tg_op = 'DELETE' and pg_catalog.pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'model_call_records é imutável' using errcode = 'check_violation';
end
$$;

-- Retenção (D-5): a exclusão do tenant apaga por cascata, única exceção até
-- existir função de retenção governada.
create trigger model_call_records_imutavel
  before update or delete on finops.model_call_records
  for each row execute function finops.forbid_record_mutation();

-- ------------------------------------------------- cost_ledger_entries
create table finops.cost_ledger_entries (
  tenant_id          uuid not null,
  entry_id           text not null,
  call_id            text not null,
  kind               text not null check (kind in ('reserve', 'settle', 'release', 'hold', 'reconcile')),
  period_id          text not null,
  period_scope       text not null check (period_scope in ('tenant', 'workflow_key')),
  reserved_delta     bigint not null check (abs(reserved_delta) <= 9007199254740991),
  settled_delta      bigint not null check (abs(settled_delta) <= 9007199254740991),
  held_delta         bigint not null check (abs(held_delta) <= 9007199254740991),
  overrun_micro_usd  bigint not null default 0 check (overrun_micro_usd between 0 and 9007199254740991),
  actor_type         text not null check (actor_type in ('worker', 'operator', 'system')),
  reason             text check (reason is null or char_length(reason) between 1 and 500),
  created_at         timestamptz not null,
  primary key (tenant_id, entry_id),
  foreign key (tenant_id, call_id) references finops.model_attempts (tenant_id, call_id) on delete cascade,
  foreign key (tenant_id, period_id) references finops.budget_periods (tenant_id, period_id) on delete cascade,
  constraint cost_ledger_entries_deterministic_id check (entry_id = call_id || ':' || kind || ':' || period_scope),
  -- Padrão de sinais fixo por tipo de lançamento (§3).
  constraint cost_ledger_entries_sign_pattern check (
    (kind = 'reserve'   and reserved_delta >= 0 and settled_delta = 0  and held_delta = 0  and overrun_micro_usd = 0)
    or (kind = 'settle'    and reserved_delta <= 0 and settled_delta >= 0 and held_delta = 0)
    or (kind = 'release'   and reserved_delta <= 0 and settled_delta = 0  and held_delta = 0  and overrun_micro_usd = 0)
    or (kind = 'hold'      and reserved_delta <= 0 and settled_delta = 0  and held_delta >= 0 and reserved_delta = -held_delta and overrun_micro_usd = 0)
    or (kind = 'reconcile' and reserved_delta = 0  and settled_delta >= 0 and held_delta <= 0)
  ),
  constraint cost_ledger_entries_actor check (
    (kind = 'reconcile' and actor_type = 'operator') or (kind <> 'reconcile' and actor_type in ('worker', 'system'))
  )
);

create index cost_ledger_entries_period on finops.cost_ledger_entries (tenant_id, period_id);
create index cost_ledger_entries_call on finops.cost_ledger_entries (tenant_id, call_id);

create or replace function finops.forbid_entry_mutation() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  -- Delete em cascata (exclusão do tenant ou da tentativa) chega aninhado na
  -- ação referencial; update e delete direto são sempre rejeitados.
  if tg_op = 'DELETE' and pg_catalog.pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'cost_ledger_entries é append-only' using errcode = 'check_violation';
end
$$;

create trigger cost_ledger_entries_append_only
  before update or delete on finops.cost_ledger_entries
  for each row execute function finops.forbid_entry_mutation();

-- Períodos e tentativas só saem por cascata da exclusão do tenant (D-5);
-- delete direto, mesmo pelo dono, é rejeitado.
create or replace function finops.forbid_direct_delete() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if pg_catalog.pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception '% só é removido pela exclusão do tenant', tg_table_name using errcode = 'check_violation';
end
$$;

create trigger budget_periods_sem_delete_direto
  before delete on finops.budget_periods
  for each row execute function finops.forbid_direct_delete();
create trigger model_attempts_sem_delete_direto
  before delete on finops.model_attempts
  for each row execute function finops.forbid_direct_delete();

revoke all on function finops.forbid_direct_delete() from public;
revoke all on function finops.forbid_attempt_identity_change() from public;
revoke all on function finops.forbid_record_mutation() from public;
revoke all on function finops.forbid_entry_mutation() from public;

-- ----------------------------------------------------------------- RLS
alter table finops.budget_periods      enable row level security;
alter table finops.budget_periods      force  row level security;
alter table finops.model_attempts      enable row level security;
alter table finops.model_attempts      force  row level security;
alter table finops.model_call_records  enable row level security;
alter table finops.model_call_records  force  row level security;
alter table finops.cost_ledger_entries enable row level security;
alter table finops.cost_ledger_entries force  row level security;

-- Intencionalmente sem policy e sem GRANT: nenhuma leitura ou escrita direta
-- por papel de aplicação. O dono (papel da migration) é o único que lê.
revoke all on all tables in schema finops from public, anon, authenticated;

comment on schema finops is 'CR-027 — Cost Ledger persistente do Product AI Model Harness; acesso somente por funções app.* hardened.';
comment on table finops.budget_periods is 'Janela de gasto explícita criada por operador (D-1); contadores iguais à soma dos lançamentos.';
comment on table finops.model_attempts is 'Uma aquisição por (tenant, action, invocationId, tentativa); lease, fencing e fechamento único.';
comment on table finops.model_call_records is 'Model Call Record 1.0 persistido no fechamento; nenhum para tentativa movida pelo sweep.';
comment on table finops.cost_ledger_entries is 'Diário append-only com id determinístico por passo e período.';
comment on column finops.model_attempts.client_observed_at is 'Metadado não autoritativo do worker (±300 s); nunca decide período, lease ou expiração.';
