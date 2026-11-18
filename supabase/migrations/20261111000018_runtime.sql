-- I-02 (local) — Product Agent Runtime: execuções de agentes, passos com checkpoint, kill switch.
--
-- Modelo (packages/core/src/runtime): lease + fencing por tentativa, idempotência por (empresa, chave),
-- passo com checkpoint atômico com o uso, limites e escalonamento humano. O domínio aplica as regras; o
-- banco as repete como defesa em profundidade e é a única fonte de ATOMICIDADE (SKIP LOCKED, travas).
--
-- Fronteira: as tabelas de `runtime` NÃO têm privilégio para ninguém (nem authenticated, nem worker).
-- Todo acesso passa por funções `app.runtime_*` SECURITY DEFINER, que (a) exigem o tenant ativo da
-- transação, (b) identificam o chamador pelo papel da transação (`authenticated` = pessoa, com a
-- permissão RBAC; `oplyra_worker_exec` = worker) e (c) recusam o resto. O dono do banco, fora de uma
-- transação com papel, também é recusado (papel `none`).
-- PROPOSTA local: o ADR-0006 mantém o runtime próprio como proposta não aprovada. RLS habilitada e forçada.

create schema if not exists runtime;
revoke all on schema runtime from public;

-- ------------------------------------------------------------------ permissões
insert into core.permissions (key, label) values
  ('runtime.read',    'Ver execuções de agentes'),
  ('runtime.operate', 'Submeter e cancelar execuções e acionar a interrupção da empresa');

insert into core.role_permissions (role_key, permission_key) values
  ('owner', 'runtime.read'), ('owner', 'runtime.operate'),
  ('admin', 'runtime.read'), ('admin', 'runtime.operate'),
  ('marketing_manager', 'runtime.read'), ('marketing_manager', 'runtime.operate'),
  ('viewer', 'runtime.read');

-- --------------------------------------------------------------------- tabelas
create table runtime.agent_runs (
  tenant_id           uuid not null references core.tenants(id) on delete cascade,
  id                  uuid not null default gen_random_uuid(),
  agent_key           text not null check (agent_key ~ '^[a-z][a-z0-9-]*-agent$' and length(agent_key) <= 80),
  action_key          text not null check (action_key ~ '^[a-z][a-z0-9_]*$' and length(action_key) <= 80),
  trigger_kind        text not null check (trigger_kind in ('user', 'event', 'schedule', 'agent')),
  autonomy            text not null check (autonomy in ('recommend', 'draft', 'approval_required', 'policy_execute')),
  status              text not null default 'queued'
                        check (status in ('queued', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled')),
  correlation_id      text not null check (btrim(correlation_id) <> '' and length(correlation_id) <= 200),
  causation_id        text check (causation_id is null or (btrim(causation_id) <> '' and length(causation_id) <= 200)),
  workflow_id         text check (workflow_id is null or (btrim(workflow_id) <> '' and length(workflow_id) <= 200)),
  task_id             text check (task_id is null or (btrim(task_id) <> '' and length(task_id) <= 200)),
  idempotency_key     text not null check (btrim(idempotency_key) <> '' and length(idempotency_key) <= 255),
  input               jsonb not null default '{}'::jsonb
                        check (jsonb_typeof(input) = 'object' and pg_column_size(input) <= 65536),
  -- Limites (09 §8, 11 §6): ausência de limite impede a execução, por isso todos são obrigatórios e >= 1.
  max_cost_micro_usd  bigint not null check (max_cost_micro_usd >= 1),
  max_tool_calls      integer not null check (max_tool_calls >= 1),
  max_turns           integer not null check (max_turns >= 1),
  max_attempts        integer not null check (max_attempts between 1 and 10),
  timeout_ms          bigint not null check (timeout_ms >= 1),
  attempt             integer not null default 0 check (attempt >= 0),
  cost_micro_usd      bigint not null default 0 check (cost_micro_usd >= 0),
  tool_calls          integer not null default 0 check (tool_calls >= 0),
  turns               integer not null default 0 check (turns >= 0),
  deadline_at         timestamptz,
  available_at        timestamptz not null,
  lease_owner         text check (lease_owner is null or length(lease_owner) between 1 and 200),
  lease_expires_at    timestamptz,
  fencing_token       text check (fencing_token is null or length(fencing_token) > 0),
  needs_human         boolean not null default false,
  error               jsonb check (error is null or (jsonb_typeof(error) = 'object' and error ? 'code')),
  requested_by_type   text not null check (requested_by_type in ('user', 'system', 'schedule', 'agent')),
  requested_by_id     text check (requested_by_id is null or length(requested_by_id) <= 200),
  created_at          timestamptz not null default now(),
  started_at          timestamptz,
  finished_at         timestamptz,
  primary key (tenant_id, id),
  -- 20 §21: a mesma intenção reutiliza a chave; mensagem entregue duas vezes não cria duas execuções.
  unique (tenant_id, idempotency_key),
  constraint runs_lease_coerente check (
    (status = 'running' and lease_owner is not null and fencing_token is not null and lease_expires_at is not null and attempt >= 1)
    or (status <> 'running' and lease_owner is null and fencing_token is null and lease_expires_at is null)
  ),
  constraint runs_terminal_tem_fim check ((status in ('completed', 'failed', 'cancelled')) = (finished_at is not null)),
  constraint runs_falha_tem_erro check (status not in ('failed', 'cancelled') or error is not null),
  constraint runs_escalonamento_so_na_falha check (not needs_human or status = 'failed'),
  -- Contagens exatas nunca passam do limite (o custo pode passar: o valor real é conhecido só depois da chamada).
  constraint runs_ferramentas_no_limite check (tool_calls <= max_tool_calls),
  constraint runs_turnos_no_limite check (turns <= max_turns),
  constraint runs_tentativas_no_limite check (attempt <= max_attempts)
);
create index runs_elegiveis on runtime.agent_runs (tenant_id, available_at, created_at) where status = 'queued';
create index runs_lease_vencido on runtime.agent_runs (tenant_id, lease_expires_at) where status = 'running';

create table runtime.run_steps (
  tenant_id     uuid not null,
  run_id        uuid not null,
  step_key      text not null check (step_key ~ '^[A-Za-z0-9._:-]+$' and length(step_key) <= 200),
  attempt       integer not null check (attempt >= 1),
  effectful     boolean not null,
  started_at    timestamptz not null,
  completed_at  timestamptz,
  -- JSON `null` é um resultado válido; SQL NULL significa "sem checkpoint".
  result        jsonb check (pg_column_size(result) <= 262144),
  -- Falha CONHECIDA e classificada do passo (o resultado do efeito é sabido): não é "incerto". Só a queda do
  -- processo (passo iniciado, sem checkpoint e sem aborto) deixa o efeito incerto.
  aborted_at    timestamptz,
  primary key (tenant_id, run_id, step_key),
  foreign key (tenant_id, run_id) references runtime.agent_runs (tenant_id, id) on delete cascade,
  constraint steps_checkpoint_coerente check ((completed_at is null) = (result is null)),
  constraint steps_conclusao_xor_aborto check (completed_at is null or aborted_at is null)
);

create table runtime.kill_switches (
  tenant_id  uuid references core.tenants(id) on delete cascade,
  scope      text not null check (scope in ('tenant', 'global')),
  active     boolean not null,
  reason     text not null check (btrim(reason) <> '' and length(reason) <= 500),
  set_by     uuid,
  set_at     timestamptz not null default now(),
  constraint kill_escopo_coerente check ((scope = 'global') = (tenant_id is null))
);
create unique index kill_um_por_empresa on runtime.kill_switches (tenant_id) where tenant_id is not null;
-- No máximo UMA linha global. Ela só é escrita pelo operador da plataforma (sem função de aplicação).
create unique index kill_um_global on runtime.kill_switches ((true)) where tenant_id is null;

create trigger runs_tenant_imutavel before update on runtime.agent_runs for each row execute function app.forbid_tenant_change();
create trigger steps_tenant_imutavel before update on runtime.run_steps for each row execute function app.forbid_tenant_change();
create trigger kill_tenant_imutavel before update on runtime.kill_switches for each row execute function app.forbid_tenant_change();

-- ---------------------------------------------------------------------- guardas
create or replace function runtime.guard_run() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from core.tenants t where t.id = old.tenant_id) then return old; end if;
    raise exception 'execução não é removida' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'queued' or new.attempt <> 0 then
      raise exception 'execução nasce na fila' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- Identidade e limites são imutáveis.
  if new.id is distinct from old.id or new.agent_key is distinct from old.agent_key
     or new.action_key is distinct from old.action_key or new.trigger_kind is distinct from old.trigger_kind
     or new.autonomy is distinct from old.autonomy or new.correlation_id is distinct from old.correlation_id
     or new.causation_id is distinct from old.causation_id or new.workflow_id is distinct from old.workflow_id
     or new.task_id is distinct from old.task_id or new.idempotency_key is distinct from old.idempotency_key
     or new.input is distinct from old.input or new.created_at is distinct from old.created_at
     or new.requested_by_type is distinct from old.requested_by_type or new.requested_by_id is distinct from old.requested_by_id
     or new.max_cost_micro_usd is distinct from old.max_cost_micro_usd or new.max_tool_calls is distinct from old.max_tool_calls
     or new.max_turns is distinct from old.max_turns or new.max_attempts is distinct from old.max_attempts
     or new.timeout_ms is distinct from old.timeout_ms then
    raise exception 'identidade e limites da execução são imutáveis' using errcode = 'check_violation';
  end if;
  if old.status in ('completed', 'failed', 'cancelled') then
    raise exception 'execução encerrada é imutável' using errcode = 'check_violation';
  end if;
  -- Uso e tentativa só crescem; a tentativa só sobe numa tomada de lease.
  if new.cost_micro_usd < old.cost_micro_usd or new.tool_calls < old.tool_calls or new.turns < old.turns or new.attempt < old.attempt then
    raise exception 'uso e tentativa não retrocedem' using errcode = 'check_violation';
  end if;
  if new.attempt > old.attempt and not (new.status = 'running' and new.attempt = old.attempt + 1) then
    raise exception 'a tentativa só sobe numa tomada de lease' using errcode = 'check_violation';
  end if;
  if new.status is distinct from old.status and not ((old.status, new.status) in (
      ('queued', 'running'), ('queued', 'cancelled'), ('queued', 'failed'),
      ('running', 'queued'), ('running', 'completed'), ('running', 'failed'), ('running', 'waiting_approval'), ('running', 'cancelled'),
      ('waiting_approval', 'queued'), ('waiting_approval', 'cancelled'), ('waiting_approval', 'failed'))) then
    raise exception 'transição de estado da execução inválida: % -> %', old.status, new.status using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create or replace function runtime.guard_step() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    -- Só some na cascata (execução ou empresa já removidas); nunca por exclusão direta.
    if not exists (select 1 from runtime.agent_runs r where r.tenant_id = old.tenant_id and r.id = old.run_id) then return old; end if;
    raise exception 'passo não é removido' using errcode = 'check_violation';
  end if;
  if old.completed_at is not null then
    raise exception 'passo com checkpoint é imutável' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

alter function runtime.guard_run() owner to postgres;
alter function runtime.guard_step() owner to postgres;
create trigger runs_guarda before insert or update or delete on runtime.agent_runs for each row execute function runtime.guard_run();
create trigger steps_guarda before update or delete on runtime.run_steps for each row execute function runtime.guard_step();

-- ------------------------------------------------------------------------- RLS
-- Sem privilégio de tabela para ninguém: a RLS é defesa em profundidade caso um GRANT apareça no futuro.
alter table runtime.agent_runs    enable row level security;
alter table runtime.agent_runs    force  row level security;
alter table runtime.run_steps     enable row level security;
alter table runtime.run_steps     force  row level security;
alter table runtime.kill_switches enable row level security;
alter table runtime.kill_switches force  row level security;

create policy runs_select on runtime.agent_runs for select
  using (tenant_id = app.current_tenant() and (select app.tenant_is_authorized()) and (select app.has_permission('runtime.read')));
create policy steps_select on runtime.run_steps for select
  using (tenant_id = app.current_tenant() and (select app.tenant_is_authorized()) and (select app.has_permission('runtime.read')));
create policy kill_select on runtime.kill_switches for select
  using (tenant_id = app.current_tenant() and (select app.tenant_is_authorized()) and (select app.has_permission('runtime.read')));

-- ------------------------------------------------------------ fronteira (funções)
-- Identifica o chamador e confere o tenant ativo e a permissão. `p_need`:
--   read    pessoa (runtime.read) ou worker
--   submit  pessoa (runtime.operate) ou worker (sistema/agendamento)
--   operate pessoa (runtime.operate); NUNCA o worker (decisão humana: cancelar, interromper)
--   worker  somente worker
create or replace function app.runtime_caller(p_tenant uuid, p_need text) returns text
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_tenant uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
  v_role text := current_setting('role', true);
begin
  if p_tenant is null or v_tenant is null or v_tenant <> p_tenant then
    raise exception 'tenant ativo não autoriza a operação' using errcode = '42501';
  end if;
  if v_role = 'oplyra_worker_exec' then
    if p_need in ('read', 'submit', 'worker') then return 'worker'; end if;
    raise exception 'o worker não executa decisões humanas' using errcode = '42501';
  elsif v_role = 'authenticated' then
    if p_need = 'worker' then raise exception 'operação restrita ao worker' using errcode = '42501'; end if;
    if not app.tenant_is_authorized() then raise exception 'vínculo inativo' using errcode = '42501'; end if;
    if p_need = 'read' and app.has_permission('runtime.read') then return 'user'; end if;
    if p_need in ('submit', 'operate') and app.has_permission('runtime.operate') then return 'user'; end if;
    raise exception 'sem permissão para a operação' using errcode = '42501';
  end if;
  raise exception 'papel sem acesso ao runtime' using errcode = '42501';
end
$$;

create or replace function app.runtime_run_json(r runtime.agent_runs) returns jsonb
language sql stable set search_path = pg_catalog, pg_temp as $$
  select jsonb_build_object(
    'id', r.id, 'tenantId', r.tenant_id, 'agentKey', r.agent_key, 'actionKey', r.action_key, 'trigger', r.trigger_kind,
    'autonomy', r.autonomy, 'status', r.status, 'correlationId', r.correlation_id, 'causationId', r.causation_id,
    'workflowId', r.workflow_id, 'taskId', r.task_id, 'idempotencyKey', r.idempotency_key, 'input', r.input,
    'limits', jsonb_build_object('maxCostMicroUsd', r.max_cost_micro_usd, 'maxToolCalls', r.max_tool_calls,
                                 'maxTurns', r.max_turns, 'maxAttempts', r.max_attempts, 'timeoutMs', r.timeout_ms),
    'attempt', r.attempt,
    'usage', jsonb_build_object('costMicroUsd', r.cost_micro_usd, 'toolCalls', r.tool_calls, 'turns', r.turns),
    'deadlineAt', r.deadline_at, 'availableAt', r.available_at, 'leaseOwner', r.lease_owner,
    'leaseExpiresAt', r.lease_expires_at, 'fencingToken', r.fencing_token, 'needsHuman', r.needs_human,
    'error', r.error, 'createdAt', r.created_at, 'startedAt', r.started_at, 'finishedAt', r.finished_at)
$$;

create or replace function app.runtime_step_json(s runtime.run_steps) returns jsonb
language sql stable set search_path = pg_catalog, pg_temp as $$
  select jsonb_build_object('stepKey', s.step_key, 'attempt', s.attempt, 'effectful', s.effectful, 'startedAt', s.started_at,
    'abortedAt', s.aborted_at,
    'checkpoint', case when s.completed_at is null then null
                       else jsonb_build_object('result', s.result, 'at', s.completed_at) end)
$$;

-- Trava a execução e confere que o lease apresentado ainda é o atual (tentativa + token + rodando).
create or replace function app.runtime_lock_lease(p_tenant uuid, p_run uuid, p_attempt integer, p_token text)
returns runtime.agent_runs
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v runtime.agent_runs;
begin
  select * into v from runtime.agent_runs where tenant_id = p_tenant and id = p_run for update;
  if not found or v.status <> 'running' or v.attempt <> p_attempt or v.fencing_token is distinct from p_token or p_token is null then
    raise exception 'RUN_ATTEMPT_STALE: tentativa ou fencing token obsoleto' using errcode = '55000';
  end if;
  return v;
end
$$;

create or replace function app.runtime_enqueue(
  p_tenant uuid, p_run jsonb, p_requested_by_type text, p_requested_by_id text, p_now timestamptz
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_caller text := app.runtime_caller(p_tenant, 'submit');
  v_row runtime.agent_runs;
  v_dup boolean := false;
  v_by_type text; v_by_id text;
begin
  if p_run is null or jsonb_typeof(p_run) <> 'object' or p_now is null then
    raise exception 'parâmetros inválidos para a submissão' using errcode = '22023';
  end if;
  -- Quem submitiu NÃO vem do payload quando é uma pessoa: vem da sessão.
  if v_caller = 'user' then
    v_by_type := 'user'; v_by_id := app.current_user_id()::text;
  else
    if p_requested_by_type not in ('system', 'schedule', 'agent') then
      raise exception 'o worker submete como sistema, agendamento ou agente' using errcode = '42501';
    end if;
    v_by_type := p_requested_by_type; v_by_id := p_requested_by_id;
  end if;

  insert into runtime.agent_runs (
    tenant_id, agent_key, action_key, trigger_kind, autonomy, correlation_id, causation_id, workflow_id, task_id,
    idempotency_key, input, max_cost_micro_usd, max_tool_calls, max_turns, max_attempts, timeout_ms, available_at,
    requested_by_type, requested_by_id, created_at)
  values (
    p_tenant, p_run->>'agentKey', p_run->>'actionKey', p_run->>'trigger', p_run->>'autonomy',
    p_run->>'correlationId', p_run->>'causationId', p_run->>'workflowId', p_run->>'taskId',
    p_run->>'idempotencyKey', coalesce(p_run->'input', '{}'::jsonb),
    (p_run#>>'{limits,maxCostMicroUsd}')::bigint, (p_run#>>'{limits,maxToolCalls}')::integer,
    (p_run#>>'{limits,maxTurns}')::integer, (p_run#>>'{limits,maxAttempts}')::integer, (p_run#>>'{limits,timeoutMs}')::bigint,
    (p_run->>'availableAt')::timestamptz, v_by_type, v_by_id, p_now)
  on conflict (tenant_id, idempotency_key) do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from runtime.agent_runs where tenant_id = p_tenant and idempotency_key = p_run->>'idempotencyKey';
    v_dup := true;
  end if;
  return jsonb_build_object('run', app.runtime_run_json(v_row), 'duplicate', v_dup);
end
$$;

create or replace function app.runtime_get(p_tenant uuid, p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
declare v runtime.agent_runs;
begin
  perform app.runtime_caller(p_tenant, 'read');
  select * into v from runtime.agent_runs where tenant_id = p_tenant and id = p_id;
  if not found then return null; end if;
  return app.runtime_run_json(v);
end
$$;

create or replace function app.runtime_list(p_tenant uuid, p_limit integer) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
begin
  perform app.runtime_caller(p_tenant, 'read');
  if p_limit is null or p_limit < 1 or p_limit > 200 then raise exception 'limite inválido' using errcode = '22023'; end if;
  return coalesce((select jsonb_agg(app.runtime_run_json(r) order by r.created_at desc, r.id)
                     from (select * from runtime.agent_runs where tenant_id = p_tenant order by created_at desc, id limit p_limit) r), '[]'::jsonb);
end
$$;

create or replace function app.runtime_steps(p_tenant uuid, p_run uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
begin
  perform app.runtime_caller(p_tenant, 'read');
  return coalesce((select jsonb_agg(app.runtime_step_json(s) order by s.started_at, s.step_key)
                     from runtime.run_steps s where s.tenant_id = p_tenant and s.run_id = p_run), '[]'::jsonb);
end
$$;

create or replace function app.runtime_claim(p_tenant uuid, p_worker text, p_now timestamptz, p_lease_seconds integer)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v runtime.agent_runs;
begin
  perform app.runtime_caller(p_tenant, 'worker');
  if p_worker is null or length(p_worker) = 0 or p_now is null or p_lease_seconds is null or p_lease_seconds < 1 then
    raise exception 'parâmetros inválidos para o claim' using errcode = '22023';
  end if;
  loop
    select * into v from runtime.agent_runs
     where tenant_id = p_tenant
       and ((status = 'queued' and available_at <= p_now) or (status = 'running' and lease_expires_at <= p_now))
     order by available_at, created_at, id
       for update skip locked
     limit 1;
    if not found then return null; end if;

    -- Abandonada com as tentativas esgotadas: dead-letter, nunca entregue de novo.
    if v.status = 'running' and v.attempt >= v.max_attempts then
      update runtime.agent_runs
         set status = 'failed', needs_human = true, finished_at = p_now,
             lease_owner = null, lease_expires_at = null, fencing_token = null,
             error = jsonb_build_object('code', 'RETRY_ATTEMPTS_EXHAUSTED', 'category', 'system', 'retryable', false,
                                        'message', 'lease expirado com as tentativas esgotadas')
       where tenant_id = v.tenant_id and id = v.id;
      continue;
    end if;

    update runtime.agent_runs
       set status = 'running', attempt = v.attempt + 1, lease_owner = p_worker, fencing_token = gen_random_uuid()::text,
           lease_expires_at = p_now + p_lease_seconds * interval '1 second',
           deadline_at = coalesce(v.deadline_at, p_now + v.timeout_ms * interval '1 millisecond'),
           started_at = coalesce(v.started_at, p_now)
     where tenant_id = v.tenant_id and id = v.id
    returning * into v;

    return jsonb_build_object(
      'run', app.runtime_run_json(v),
      'lease', jsonb_build_object('runId', v.id, 'tenantId', v.tenant_id, 'attempt', v.attempt,
                                  'fencingToken', v.fencing_token, 'workerId', p_worker),
      'steps', coalesce((select jsonb_agg(app.runtime_step_json(s) order by s.started_at, s.step_key)
                           from runtime.run_steps s where s.tenant_id = v.tenant_id and s.run_id = v.id), '[]'::jsonb));
  end loop;
end
$$;

create or replace function app.runtime_heartbeat(
  p_tenant uuid, p_run uuid, p_attempt integer, p_token text, p_now timestamptz, p_lease_seconds integer
) returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v runtime.agent_runs;
begin
  perform app.runtime_caller(p_tenant, 'worker');
  if p_now is null or p_lease_seconds is null or p_lease_seconds < 1 then
    raise exception 'parâmetros inválidos para o heartbeat' using errcode = '22023';
  end if;
  v := app.runtime_lock_lease(p_tenant, p_run, p_attempt, p_token);
  update runtime.agent_runs set lease_expires_at = p_now + p_lease_seconds * interval '1 second'
   where tenant_id = p_tenant and id = p_run;
end
$$;

create or replace function app.runtime_begin_step(
  p_tenant uuid, p_run uuid, p_attempt integer, p_token text, p_step text, p_effectful boolean, p_now timestamptz
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v runtime.agent_runs; s runtime.run_steps;
begin
  perform app.runtime_caller(p_tenant, 'worker');
  v := app.runtime_lock_lease(p_tenant, p_run, p_attempt, p_token);
  select * into s from runtime.run_steps where tenant_id = p_tenant and run_id = p_run and step_key = p_step;
  if found and s.completed_at is not null then
    return app.runtime_step_json(s);          -- retomada: o checkpoint prevalece, nada é reiniciado
  end if;
  insert into runtime.run_steps (tenant_id, run_id, step_key, attempt, effectful, started_at)
  values (p_tenant, p_run, p_step, p_attempt, p_effectful, p_now)
  on conflict (tenant_id, run_id, step_key) do update
    set attempt = excluded.attempt, effectful = excluded.effectful, started_at = excluded.started_at, aborted_at = null
    where runtime.run_steps.completed_at is null
  returning * into s;
  return app.runtime_step_json(s);
end
$$;

-- Falha conhecida e classificada do passo: tira-o do estado "incerto". Não apaga nada (a trilha fica).
create or replace function app.runtime_abort_step(
  p_tenant uuid, p_run uuid, p_attempt integer, p_token text, p_step text, p_now timestamptz
) returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v runtime.agent_runs; n integer;
begin
  perform app.runtime_caller(p_tenant, 'worker');
  if p_now is null then raise exception 'parâmetros inválidos para o aborto' using errcode = '22023'; end if;
  v := app.runtime_lock_lease(p_tenant, p_run, p_attempt, p_token);
  update runtime.run_steps set aborted_at = p_now
   where tenant_id = p_tenant and run_id = p_run and step_key = p_step and completed_at is null;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'INVALID_STATE_TRANSITION: passo inexistente ou já concluído' using errcode = '55000';
  end if;
end
$$;

create or replace function app.runtime_complete_step(
  p_tenant uuid, p_run uuid, p_attempt integer, p_token text, p_step text, p_result jsonb,
  p_cost bigint, p_tool_calls integer, p_turns integer, p_now timestamptz
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v runtime.agent_runs; s runtime.run_steps;
begin
  perform app.runtime_caller(p_tenant, 'worker');
  if p_result is null or p_cost is null or p_cost < 0 or p_tool_calls is null or p_tool_calls < 0
     or p_turns is null or p_turns < 0 or p_now is null then
    raise exception 'parâmetros inválidos para o checkpoint' using errcode = '22023';
  end if;
  v := app.runtime_lock_lease(p_tenant, p_run, p_attempt, p_token);
  select * into s from runtime.run_steps where tenant_id = p_tenant and run_id = p_run and step_key = p_step for update;
  if not found then
    raise exception 'INVALID_STATE_TRANSITION: passo não iniciado' using errcode = '55000';
  end if;
  if s.aborted_at is not null then
    raise exception 'INVALID_STATE_TRANSITION: passo abortado; inicie-o de novo' using errcode = '55000';
  end if;
  if s.completed_at is not null then
    return jsonb_build_object('run', app.runtime_run_json(v), 'replayed', true);   -- sem checkpoint nem uso em dobro
  end if;
  update runtime.run_steps set result = p_result, completed_at = p_now
   where tenant_id = p_tenant and run_id = p_run and step_key = p_step;
  update runtime.agent_runs
     set cost_micro_usd = cost_micro_usd + p_cost, tool_calls = tool_calls + p_tool_calls, turns = turns + p_turns
   where tenant_id = p_tenant and id = p_run
  returning * into v;
  return jsonb_build_object('run', app.runtime_run_json(v), 'replayed', false);
end
$$;

create or replace function app.runtime_settle(
  p_tenant uuid, p_run uuid, p_attempt integer, p_token text, p_outcome text,
  p_error jsonb, p_available_at timestamptz, p_needs_human boolean, p_now timestamptz
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v runtime.agent_runs;
begin
  perform app.runtime_caller(p_tenant, 'worker');
  if p_outcome not in ('completed', 'waiting_approval', 'retry', 'failed') or p_now is null then
    raise exception 'parâmetros inválidos para o settlement' using errcode = '22023';
  end if;
  if p_outcome in ('retry', 'failed') and (p_error is null or jsonb_typeof(p_error) <> 'object') then
    raise exception 'falha exige erro estruturado' using errcode = '22023';
  end if;
  if p_outcome = 'retry' and (p_available_at is null or p_available_at <= p_now) then
    raise exception 'retentativa exige disponibilidade futura' using errcode = '22023';
  end if;
  v := app.runtime_lock_lease(p_tenant, p_run, p_attempt, p_token);
  update runtime.agent_runs
     set status = case p_outcome when 'completed' then 'completed' when 'waiting_approval' then 'waiting_approval'
                                 when 'retry' then 'queued' else 'failed' end,
         lease_owner = null, lease_expires_at = null, fencing_token = null,
         available_at = case when p_outcome = 'retry' then p_available_at else available_at end,
         error = case when p_outcome in ('retry', 'failed') then p_error else error end,
         needs_human = case when p_outcome = 'failed' then coalesce(p_needs_human, false) else false end,
         finished_at = case when p_outcome in ('completed', 'failed') then p_now else null end
   where tenant_id = p_tenant and id = p_run
  returning * into v;
  return app.runtime_run_json(v);
end
$$;

create or replace function app.runtime_cancel(p_tenant uuid, p_run uuid, p_reason text, p_now timestamptz) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v runtime.agent_runs;
begin
  perform app.runtime_caller(p_tenant, 'operate');
  if p_reason is null or btrim(p_reason) = '' or p_now is null then
    raise exception 'o motivo do cancelamento é obrigatório' using errcode = '22023';
  end if;
  select * into v from runtime.agent_runs where tenant_id = p_tenant and id = p_run for update;
  if not found then raise exception 'RUN_NOT_FOUND' using errcode = 'P0002'; end if;
  if v.status in ('completed', 'failed', 'cancelled') then
    raise exception 'INVALID_STATE_TRANSITION: a execução já terminou' using errcode = '55000';
  end if;
  update runtime.agent_runs
     set status = 'cancelled', lease_owner = null, lease_expires_at = null, fencing_token = null, finished_at = p_now,
         error = jsonb_build_object('code', 'CANCELLED', 'category', 'governance', 'retryable', false, 'message', p_reason)
   where tenant_id = p_tenant and id = p_run
  returning * into v;
  return app.runtime_run_json(v);
end
$$;

-- Estado efetivo da interrupção: a GLOBAL prevalece sobre a da empresa.
create or replace function app.runtime_kill_effective(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
declare k runtime.kill_switches;
begin
  perform app.runtime_caller(p_tenant, 'read');
  select * into k from runtime.kill_switches where tenant_id is null and active;
  if not found then
    select * into k from runtime.kill_switches where tenant_id = p_tenant and active;
  end if;
  if not found then return null; end if;
  return jsonb_build_object('active', k.active, 'scope', k.scope, 'reason', k.reason);
end
$$;

create or replace function app.runtime_kill_activate(p_tenant uuid, p_reason text, p_now timestamptz) returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  perform app.runtime_caller(p_tenant, 'operate');
  if p_reason is null or btrim(p_reason) = '' or p_now is null then
    raise exception 'o motivo da interrupção é obrigatório' using errcode = '22023';
  end if;
  insert into runtime.kill_switches (tenant_id, scope, active, reason, set_by, set_at)
  values (p_tenant, 'tenant', true, p_reason, app.current_user_id(), p_now)
  on conflict (tenant_id) where tenant_id is not null
  do update set active = true, reason = excluded.reason, set_by = excluded.set_by, set_at = excluded.set_at;
end
$$;

create or replace function app.runtime_kill_release(p_tenant uuid, p_now timestamptz) returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  perform app.runtime_caller(p_tenant, 'operate');
  update runtime.kill_switches set active = false, set_by = app.current_user_id(), set_at = p_now
   where tenant_id = p_tenant;
end
$$;

-- ------------------------------------------------------------------ privilégios
do $$
declare v_fn text; v_role text;
begin
  foreach v_fn in array array[
    'runtime.guard_run()', 'runtime.guard_step()',
    'app.runtime_caller(uuid, text)', 'app.runtime_lock_lease(uuid, uuid, integer, text)',
    'app.runtime_run_json(runtime.agent_runs)', 'app.runtime_step_json(runtime.run_steps)'
  ] loop
    execute pg_catalog.format('revoke all on function %s from public', v_fn);
    for v_role in select r.rolname from pg_catalog.pg_roles r
                   where r.rolname in ('anon', 'authenticated', 'service_role') or r.rolname like 'oplyra\_%' loop
      execute pg_catalog.format('revoke all on function %s from %I', v_fn, v_role);
    end loop;
  end loop;
end
$$;
-- A construção do JSON roda como o dono dentro das funções de fronteira; nenhum papel precisa dos helpers.

revoke all on function app.runtime_enqueue(uuid, jsonb, text, text, timestamptz) from public;
revoke all on function app.runtime_get(uuid, uuid) from public;
revoke all on function app.runtime_list(uuid, integer) from public;
revoke all on function app.runtime_steps(uuid, uuid) from public;
revoke all on function app.runtime_claim(uuid, text, timestamptz, integer) from public;
revoke all on function app.runtime_heartbeat(uuid, uuid, integer, text, timestamptz, integer) from public;
revoke all on function app.runtime_begin_step(uuid, uuid, integer, text, text, boolean, timestamptz) from public;
revoke all on function app.runtime_abort_step(uuid, uuid, integer, text, text, timestamptz) from public;
revoke all on function app.runtime_complete_step(uuid, uuid, integer, text, text, jsonb, bigint, integer, integer, timestamptz) from public;
revoke all on function app.runtime_settle(uuid, uuid, integer, text, text, jsonb, timestamptz, boolean, timestamptz) from public;
revoke all on function app.runtime_cancel(uuid, uuid, text, timestamptz) from public;
revoke all on function app.runtime_kill_effective(uuid) from public;
revoke all on function app.runtime_kill_activate(uuid, text, timestamptz) from public;
revoke all on function app.runtime_kill_release(uuid, timestamptz) from public;

-- Pessoa e worker chamam as mesmas funções; cada função decide, pelo papel da transação, o que é permitido.
grant execute on function
  app.runtime_enqueue(uuid, jsonb, text, text, timestamptz), app.runtime_get(uuid, uuid), app.runtime_list(uuid, integer),
  app.runtime_steps(uuid, uuid), app.runtime_cancel(uuid, uuid, text, timestamptz), app.runtime_kill_effective(uuid),
  app.runtime_kill_activate(uuid, text, timestamptz), app.runtime_kill_release(uuid, timestamptz)
  to authenticated, oplyra_worker_exec;
-- Somente o worker.
grant execute on function
  app.runtime_claim(uuid, text, timestamptz, integer), app.runtime_heartbeat(uuid, uuid, integer, text, timestamptz, integer),
  app.runtime_begin_step(uuid, uuid, integer, text, text, boolean, timestamptz),
  app.runtime_abort_step(uuid, uuid, integer, text, text, timestamptz),
  app.runtime_complete_step(uuid, uuid, integer, text, text, jsonb, bigint, integer, integer, timestamptz),
  app.runtime_settle(uuid, uuid, integer, text, text, jsonb, timestamptz, boolean, timestamptz)
  to oplyra_worker_exec;

comment on schema runtime is 'Product Agent Runtime (I-02, local): execuções, passos e interrupção; sem privilégio de tabela, acesso por funções app.runtime_*.';
comment on table runtime.agent_runs is 'Execução de agente: lease + fencing por tentativa, idempotência por empresa, limites obrigatórios.';
comment on table runtime.run_steps is 'Passo com checkpoint atômico com o uso; passo com efeito sem checkpoint tem resultado incerto.';
comment on table runtime.kill_switches is 'Interrupção por empresa (função de aplicação) e global (somente operador da plataforma).';
