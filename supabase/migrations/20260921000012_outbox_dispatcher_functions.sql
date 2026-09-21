-- CR-015 — boundary SQL atômica do dispatcher.
-- Cria papel dedicado e concede somente EXECUTE nas funções controladas.
-- Nenhuma tabela recebe privilégio direto e nenhum transporte é ativado.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'oplyra_dispatcher_login') then
    create role oplyra_dispatcher_login login noinherit nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'oplyra_dispatcher_exec') then
    create role oplyra_dispatcher_exec nologin nobypassrls;
  end if;
end
$$;

grant oplyra_dispatcher_exec to oplyra_dispatcher_login;
grant usage on schema app to oplyra_dispatcher_exec;

create or replace function app.claim_outbox_events(
  p_tenant_id uuid,
  p_dispatcher_id text,
  p_batch_size integer,
  p_lease_duration_seconds integer,
  p_requested_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_active_tenant uuid;
  v_claims jsonb;
  v_claimed_count integer;
  v_dedup_count integer;
begin
  v_active_tenant := nullif(current_setting('app.tenant_id', true), '')::uuid;
  if v_active_tenant is null or v_active_tenant <> p_tenant_id then
    raise exception 'tenant ativo não autoriza o claim solicitado' using errcode = '42501';
  end if;
  if p_dispatcher_id is null or length(p_dispatcher_id) = 0
     or p_batch_size is null or p_batch_size < 1
     or p_lease_duration_seconds is null or p_lease_duration_seconds < 1
     or p_requested_at is null then
    raise exception 'parâmetros inválidos para claim da outbox' using errcode = '22023';
  end if;

  with eligible as (
    select o.tenant_id, o.event_transaction_id
    from content.event_outbox o
    where o.tenant_id = p_tenant_id
      and (
        (o.status in ('pending', 'failed') and o.available_at <= p_requested_at)
        or
        (o.status = 'dispatching' and o.lease_expires_at <= p_requested_at)
      )
      and not exists (
        select 1
        from content.event_consumer_deduplication d
        where d.tenant_id = o.tenant_id
          and d.event_transaction_id = o.event_transaction_id
          and d.consumer_agent = o.consumer_agent
          and (
            d.status = 'completed'
            or (d.status = 'processing' and d.lease_expires_at > p_requested_at)
          )
      )
    order by o.available_at, o.created_at, o.event_transaction_id
    for update of o skip locked
    limit p_batch_size
  ), claimed as (
    update content.event_outbox o
       set status = 'dispatching',
           dispatch_attempts = o.dispatch_attempts + 1,
           lease_owner = p_dispatcher_id,
           fencing_token = gen_random_uuid()::text,
           lease_expires_at = p_requested_at + p_lease_duration_seconds * interval '1 second',
           last_error = null
      from eligible e
     where o.tenant_id = e.tenant_id
       and o.event_transaction_id = e.event_transaction_id
    returning o.*
  ), dedup as (
    insert into content.event_consumer_deduplication (
      tenant_id, event_transaction_id, consumer_agent, status, attempt,
      lease_owner, fencing_token, lease_expires_at, last_error, updated_at, completed_at
    )
    select c.tenant_id, c.event_transaction_id, c.consumer_agent, 'processing',
           c.dispatch_attempts, c.lease_owner, c.fencing_token, c.lease_expires_at,
           null, p_requested_at, null
    from claimed c
    on conflict (tenant_id, event_transaction_id, consumer_agent) do update
      set status = 'processing',
          attempt = excluded.attempt,
          lease_owner = excluded.lease_owner,
          fencing_token = excluded.fencing_token,
          lease_expires_at = excluded.lease_expires_at,
          last_error = null,
          updated_at = excluded.updated_at,
          completed_at = null
      where content.event_consumer_deduplication.status = 'failed'
         or (content.event_consumer_deduplication.status = 'processing'
             and content.event_consumer_deduplication.lease_expires_at <= p_requested_at)
    returning tenant_id, event_transaction_id, consumer_agent
  )
  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'eventTransactionId', c.event_transaction_id,
        'eventKey', c.event_key,
        'schemaVersion', c.schema_version,
        'producerAgent', c.producer_agent,
        'consumerAgent', c.consumer_agent,
        'payload', c.payload,
        'trace', jsonb_strip_nulls(jsonb_build_object(
          'correlationId', c.correlation_id,
          'causationId', c.causation_id,
          'workflowId', c.workflow_id,
          'taskId', c.task_id
        )),
        'context', c.context,
        'attempt', c.dispatch_attempts,
        'fencingToken', c.fencing_token,
        'leaseExpiresAt', c.lease_expires_at
      ) order by c.created_at, c.event_transaction_id
    ) filter (where d.event_transaction_id is not null), '[]'::jsonb),
    count(c.*)::integer,
    count(d.*)::integer
  into v_claims, v_claimed_count, v_dedup_count
  from claimed c
  left join dedup d
    on d.tenant_id = c.tenant_id
   and d.event_transaction_id = c.event_transaction_id
   and d.consumer_agent = c.consumer_agent;

  if v_claimed_count <> v_dedup_count then
    raise exception 'claim da outbox não obteve claim de consumidor equivalente'
      using errcode = '55000';
  end if;

  return jsonb_build_object(
    'tenantId', p_tenant_id,
    'dispatcherId', p_dispatcher_id,
    'claimedAt', p_requested_at,
    'claims', v_claims
  );
end
$$;

create or replace function app.settle_outbox_event(
  p_tenant_id uuid,
  p_dispatcher_id text,
  p_event_transaction_id text,
  p_consumer_agent text,
  p_attempt integer,
  p_fencing_token text,
  p_outcome text,
  p_settled_at timestamptz,
  p_next_available_at timestamptz default null,
  p_error jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_active_tenant uuid;
  v_status text;
  v_outbox_count integer;
  v_dedup_count integer;
begin
  v_active_tenant := nullif(current_setting('app.tenant_id', true), '')::uuid;
  if v_active_tenant is null or v_active_tenant <> p_tenant_id then
    raise exception 'tenant ativo não autoriza o settlement solicitado' using errcode = '42501';
  end if;
  if p_dispatcher_id is null or length(p_dispatcher_id) = 0
     or p_event_transaction_id is null or length(p_event_transaction_id) = 0
     or p_consumer_agent is null or length(p_consumer_agent) = 0
     or p_attempt is null or p_attempt < 1
     or p_fencing_token is null or length(p_fencing_token) = 0
     or p_settled_at is null
     or p_outcome not in ('dispatched', 'retryable_failure', 'terminal_failure') then
    raise exception 'parâmetros inválidos para settlement da outbox' using errcode = '22023';
  end if;

  if p_outcome = 'dispatched' and (p_next_available_at is not null or p_error is not null) then
    raise exception 'dispatched não aceita erro ou nextAvailableAt' using errcode = '22023';
  elsif p_outcome = 'retryable_failure' and (
    p_next_available_at is null or p_next_available_at <= p_settled_at
    or p_error is null or jsonb_typeof(p_error) <> 'object'
    or coalesce((p_error->>'retryable')::boolean, false) is not true
    or p_error->>'code' not in ('INTEGRATION_UNAVAILABLE', 'PROVIDER_TIMEOUT', 'UPSTREAM_SERVICE_UNAVAILABLE')
  ) then
    raise exception 'falha retryable exige erro canônico e nextAvailableAt futuro' using errcode = '22023';
  elsif p_outcome = 'terminal_failure' and (
    p_next_available_at is not null
    or p_error is null or jsonb_typeof(p_error) <> 'object'
    or coalesce((p_error->>'retryable')::boolean, true) is not false
    or p_error->>'code' not in ('EVENT_NOT_REGISTERED', 'INVALID_STATE_TRANSITION')
  ) then
    raise exception 'falha terminal exige erro canônico não retryable' using errcode = '22023';
  end if;

  if p_outcome = 'dispatched' and exists (
    select 1
    from content.event_outbox o
    join content.event_consumer_deduplication d
      on d.tenant_id = o.tenant_id
     and d.event_transaction_id = o.event_transaction_id
     and d.consumer_agent = o.consumer_agent
    where o.tenant_id = p_tenant_id
      and o.event_transaction_id = p_event_transaction_id
      and o.consumer_agent = p_consumer_agent
      and o.status = 'dispatched'
      and d.status = 'completed'
  ) then
    return jsonb_build_object(
      'tenantId', p_tenant_id,
      'eventTransactionId', p_event_transaction_id,
      'consumerAgent', p_consumer_agent,
      'status', 'duplicate',
      'attempt', p_attempt,
      'settledAt', p_settled_at
    );
  end if;

  v_status := case p_outcome
    when 'dispatched' then 'dispatched'
    when 'retryable_failure' then 'failed'
    else 'dead_lettered'
  end;

  update content.event_outbox
     set status = v_status,
         lease_owner = null,
         fencing_token = null,
         lease_expires_at = null,
         available_at = case when p_outcome = 'retryable_failure' then p_next_available_at else available_at end,
         dispatched_at = case when p_outcome = 'dispatched' then p_settled_at else null end,
         dead_lettered_at = case when p_outcome = 'terminal_failure' then p_settled_at else null end,
         last_error = p_error
   where tenant_id = p_tenant_id
     and event_transaction_id = p_event_transaction_id
     and consumer_agent = p_consumer_agent
     and status = 'dispatching'
     and dispatch_attempts = p_attempt
     and lease_owner = p_dispatcher_id
     and fencing_token = p_fencing_token;
  get diagnostics v_outbox_count = row_count;

  if v_outbox_count <> 1 then
    raise exception 'INVALID_STATE_TRANSITION: attempt ou fencing token obsoleto'
      using errcode = '55000';
  end if;

  update content.event_consumer_deduplication
     set status = case when p_outcome = 'dispatched' then 'completed' else 'failed' end,
         lease_owner = null,
         fencing_token = null,
         lease_expires_at = null,
         last_error = p_error,
         updated_at = p_settled_at,
         completed_at = case when p_outcome = 'dispatched' then p_settled_at else null end
   where tenant_id = p_tenant_id
     and event_transaction_id = p_event_transaction_id
     and consumer_agent = p_consumer_agent
     and status = 'processing'
     and attempt = p_attempt
     and lease_owner = p_dispatcher_id
     and fencing_token = p_fencing_token;
  get diagnostics v_dedup_count = row_count;

  if v_dedup_count <> 1 then
    raise exception 'INVALID_STATE_TRANSITION: claim do consumidor não corresponde ao settlement'
      using errcode = '55000';
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'tenantId', p_tenant_id,
    'eventTransactionId', p_event_transaction_id,
    'consumerAgent', p_consumer_agent,
    'status', v_status,
    'attempt', p_attempt,
    'settledAt', p_settled_at,
    'nextAvailableAt', case when p_outcome = 'retryable_failure' then p_next_available_at else null end
  ));
end
$$;

revoke all on function app.claim_outbox_events(uuid, text, integer, integer, timestamptz) from public;
revoke all on function app.settle_outbox_event(uuid, text, text, text, integer, text, text, timestamptz, timestamptz, jsonb) from public;
grant execute on function app.claim_outbox_events(uuid, text, integer, integer, timestamptz) to oplyra_dispatcher_exec;
grant execute on function app.settle_outbox_event(uuid, text, text, text, integer, text, text, timestamptz, timestamptz, jsonb) to oplyra_dispatcher_exec;

comment on function app.claim_outbox_events(uuid, text, integer, integer, timestamptz) is
  'Claim/reclaim tenant-scoped com SKIP LOCKED, lease, fencing e deduplicação persistente; sem transporte.';
comment on function app.settle_outbox_event(uuid, text, text, text, integer, text, text, timestamptz, timestamptz, jsonb) is
  'Settlement atômico da outbox e deduplicação, aceito somente para attempt/fencing atuais.';
