-- I-04 — Estratégia e operação: objetivos/indicadores, campanhas, testes por hipótese e tarefas, por empresa.
--
-- Modelo (domínio em packages/core/src/domain/strategy.ts; o banco repete as regras como defesa em
-- profundidade, nunca como única fonte):
--  * objetivo: indicadores (1..10) com alvo > 0; no máximo UM principal ativo por empresa;
--  * campanha: planejada → ativa ⇄ pausada → concluída; cancelável; ativar exige o método completo
--    (DEC-017) e chave de rastreamento; a chave é única por empresa, FIXA depois da ativação e
--    continua reservada nos estados terminais (I-CMP); objetivo na MESMA empresa (FK composta);
--  * teste: hipótese e plano imutáveis desde o registro e anteriores à execução (I-HYP); só inicia com
--    a campanha ativa; resultado `supported`/`refuted` exige a amostra mínima do plano;
--  * tarefa: dependências na mesma empresa e sem ciclo.
-- NÃO cobertos aqui (a aplicação os verifica): produto da campanha existir na marca vigente (a marca é
-- versionada: não há FK estável) e agente responsável estar habilitado (entitlement).
-- RLS habilitada e forçada desde a primeira tabela.

create schema if not exists strategy;
revoke all on schema strategy from public;
grant usage on schema strategy to authenticated;

-- ------------------------------------------------------------------ permissões
insert into core.permissions (key, label) values
  ('strategy.read',  'Ver objetivos, campanhas, testes e tarefas'),
  ('strategy.write', 'Operar objetivos, campanhas, testes e tarefas');

insert into core.role_permissions (role_key, permission_key) values
  ('owner', 'strategy.read'), ('owner', 'strategy.write'),
  ('admin', 'strategy.read'), ('admin', 'strategy.write'),
  ('marketing_manager', 'strategy.read'), ('marketing_manager', 'strategy.write'),
  ('viewer', 'strategy.read');

-- ------------------------------------------------------------ validações puras
-- Indicadores: lista de 1 a 10 objetos {key, name, metric, unit, target}, chaves únicas.
create or replace function strategy.kpis_valid(k jsonb) returns boolean
language plpgsql immutable as $$
declare item jsonb; seen text[] := '{}';
begin
  if k is null or jsonb_typeof(k) is distinct from 'array' or jsonb_array_length(k) < 1 or jsonb_array_length(k) > 10 then return false; end if;
  for item in select value from jsonb_array_elements(k) loop
    if jsonb_typeof(item) is distinct from 'object' then return false; end if;
    if jsonb_typeof(item->'key') is distinct from 'string' or item->>'key' !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(item->>'key') > 40 then return false; end if;
    if item->>'key' = any(seen) then return false; end if;
    seen := seen || (item->>'key');
    if jsonb_typeof(item->'name') is distinct from 'string' or btrim(item->>'name') = '' or length(item->>'name') > 120 then return false; end if;
    if jsonb_typeof(item->'metric') is distinct from 'string' or btrim(item->>'metric') = '' or length(item->>'metric') > 120 then return false; end if;
    if jsonb_typeof(item->'unit') is distinct from 'string' or btrim(item->>'unit') = '' or length(item->>'unit') > 30 then return false; end if;
    if jsonb_typeof(item->'target') is distinct from 'number' or (item->>'target')::numeric <= 0 then return false; end if;
  end loop;
  return true;
end
$$;

-- Método da campanha (DEC-017): exatamente os sete elementos, cada um texto de até 1000 caracteres
-- (pode estar vazio no rascunho; a ativação exige todos preenchidos).
create or replace function strategy.method_valid(m jsonb) returns boolean
language plpgsql immutable as $$
declare k text;
begin
  if m is null or jsonb_typeof(m) is distinct from 'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(m)) <> 7 then return false; end if;
  foreach k in array array['situation','pain','consequence','desire','mechanism','proof','offer'] loop
    if jsonb_typeof(m->k) is distinct from 'string' or length(m->>k) > 1000 then return false; end if;
  end loop;
  return true;
end
$$;

create or replace function strategy.method_complete(m jsonb) returns boolean
language sql immutable as $$
  select coalesce(bool_and(coalesce(btrim(m->>k) <> '', false)), false)
    from unnest(array['situation','pain','consequence','desire','mechanism','proof','offer']) as k
$$;

-- Variantes do teste: 2 a 10 textos não vazios, distintos sem considerar caixa e espaços nas pontas.
create or replace function strategy.variants_valid(v jsonb) returns boolean
language plpgsql immutable as $$
declare item jsonb; seen text[] := '{}'; norm text;
begin
  if v is null or jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v) < 2 or jsonb_array_length(v) > 10 then return false; end if;
  for item in select value from jsonb_array_elements(v) loop
    if jsonb_typeof(item) is distinct from 'string' or btrim(item #>> '{}') = '' or length(item #>> '{}') > 500 then return false; end if;
    norm := lower(btrim(item #>> '{}'));
    if norm = any(seen) then return false; end if;
    seen := seen || norm;
  end loop;
  return true;
end
$$;

-- --------------------------------------------------------------------- tabelas
create table strategy.objectives (
  tenant_id     uuid not null references core.tenants(id) on delete cascade,
  id            uuid not null default gen_random_uuid(),
  name          text not null check (btrim(name) <> '' and length(name) <= 160),
  description   text not null default '' check (length(description) <= 1000),
  period_start  date not null,
  period_end    date not null,
  kpis          jsonb not null check (strategy.kpis_valid(kpis)),
  status        text not null default 'active' check (status in ('active', 'archived')),
  is_primary    boolean not null default false,
  revision      integer not null default 1 check (revision >= 1),
  created_by    uuid not null,
  created_at    timestamptz not null default now(),
  primary key (tenant_id, id),
  constraint objectives_periodo check (period_end >= period_start),
  constraint objectives_principal_ativo check (not is_primary or status = 'active')
);
-- No máximo um objetivo principal por empresa.
create unique index objectives_um_principal on strategy.objectives (tenant_id) where is_primary;

create table strategy.campaigns (
  tenant_id     uuid not null references core.tenants(id) on delete cascade,
  id            uuid not null default gen_random_uuid(),
  name          text not null default '' check (length(name) <= 160),
  objective_id  uuid,
  product_key   uuid,                         -- sem FK: a marca é versionada; a aplicação confere (ver cabeçalho)
  method        jsonb not null check (strategy.method_valid(method)),
  tracking_key  text not null default '' check (tracking_key = '' or (tracking_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(tracking_key) between 3 and 60)),
  status        text not null default 'draft' check (status in ('draft', 'active', 'paused', 'completed', 'cancelled')),
  revision      integer not null default 1 check (revision >= 1),
  created_by    uuid not null,
  created_at    timestamptz not null default now(),
  activated_at  timestamptz,
  primary key (tenant_id, id),
  -- Com objective_id nulo a FK não é avaliada (MATCH SIMPLE); com valor, o objetivo é da MESMA empresa (I-CMP).
  foreign key (tenant_id, objective_id) references strategy.objectives (tenant_id, id),
  constraint campaigns_ativacao_coerente check ((status = 'draft') = (activated_at is null) or status in ('cancelled'))
);
-- Chave de rastreamento única por empresa; vazia (rascunho sem chave) não colide. Estados terminais mantêm a reserva.
create unique index campaigns_chave_unica on strategy.campaigns (tenant_id, tracking_key) where tracking_key <> '';

create table strategy.experiments (
  tenant_id        uuid not null references core.tenants(id) on delete cascade,
  id               uuid not null default gen_random_uuid(),
  campaign_id      uuid not null,
  hypothesis       text not null check (btrim(hypothesis) <> '' and length(hypothesis) <= 1000),
  dimension        text not null check (dimension in ('angle', 'pain', 'hook', 'proof', 'visual', 'cta', 'other')),
  dimension_note   text not null default '' check (length(dimension_note) <= 300),
  variants         jsonb not null check (strategy.variants_valid(variants)),
  decision_metric  text not null check (btrim(decision_metric) <> '' and length(decision_metric) <= 120),
  minimum_sample   integer not null check (minimum_sample >= 1),
  status           text not null default 'planned' check (status in ('planned', 'running', 'concluded', 'cancelled')),
  result           jsonb,
  learning         jsonb,
  revision         integer not null default 1 check (revision >= 1),
  created_by       uuid not null,
  created_at       timestamptz not null default now(),
  started_at       timestamptz,
  concluded_at     timestamptz,
  primary key (tenant_id, id),
  foreign key (tenant_id, campaign_id) references strategy.campaigns (tenant_id, id),
  constraint experiments_outra_exige_nota check (dimension <> 'other' or btrim(dimension_note) <> ''),
  constraint experiments_estado_coerente check (
    (status in ('planned') and started_at is null and concluded_at is null and result is null and learning is null)
    or (status = 'running' and started_at is not null and concluded_at is null and result is null and learning is null)
    or (status = 'concluded' and started_at is not null and concluded_at is not null and result is not null)
    or (status = 'cancelled' and concluded_at is null and result is null and learning is null)
  ),
  constraint experiments_hipotese_antes check (started_at is null or started_at >= created_at)
);
create index experiments_por_campanha on strategy.experiments (tenant_id, campaign_id);

create table strategy.tasks (
  tenant_id      uuid not null references core.tenants(id) on delete cascade,
  id             uuid not null default gen_random_uuid(),
  title          text not null check (btrim(title) <> '' and length(title) <= 200),
  description    text not null default '' check (length(description) <= 2000),
  campaign_id    uuid,
  due_date       date,
  assignee_kind  text check (assignee_kind in ('user', 'agent')),
  assignee_ref   text check (assignee_ref is null or (btrim(assignee_ref) <> '' and length(assignee_ref) <= 120)),
  status         text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'cancelled')),
  revision       integer not null default 1 check (revision >= 1),
  created_by     uuid not null,
  created_at     timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, campaign_id) references strategy.campaigns (tenant_id, id),
  constraint tasks_responsavel_coerente check ((assignee_kind is null) = (assignee_ref is null))
);
create index tasks_por_campanha on strategy.tasks (tenant_id, campaign_id);

create table strategy.task_dependencies (
  tenant_id      uuid not null,
  task_id        uuid not null,
  depends_on_id  uuid not null,
  primary key (tenant_id, task_id, depends_on_id),
  foreign key (tenant_id, task_id) references strategy.tasks (tenant_id, id) on delete cascade,
  foreign key (tenant_id, depends_on_id) references strategy.tasks (tenant_id, id) on delete cascade,
  constraint task_dependencies_sem_auto check (task_id <> depends_on_id)
);

-- ----------------------------------------------------- imutabilidade do tenant
create trigger objectives_tenant_imutavel before update on strategy.objectives for each row execute function app.forbid_tenant_change();
create trigger campaigns_tenant_imutavel before update on strategy.campaigns for each row execute function app.forbid_tenant_change();
create trigger experiments_tenant_imutavel before update on strategy.experiments for each row execute function app.forbid_tenant_change();
create trigger tasks_tenant_imutavel before update on strategy.tasks for each row execute function app.forbid_tenant_change();
create trigger task_dependencies_tenant_imutavel before update on strategy.task_dependencies for each row execute function app.forbid_tenant_change();

-- ---------------------------------------------------------------------- guardas
-- Exclusão: só na cascata real da exclusão da empresa. Tarefas e dependências têm regra própria.
create or replace function strategy.guard_no_delete() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if not exists (select 1 from core.tenants t where t.id = old.tenant_id) then return old; end if;
  raise exception '% não é removido; use o estado terminal', tg_table_name using errcode = 'check_violation';
end
$$;

create or replace function strategy.guard_objective() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if new.id is distinct from old.id or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'identidade do objetivo é imutável' using errcode = 'check_violation';
  end if;
  if old.status = 'archived' then
    raise exception 'objetivo arquivado é imutável' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create or replace function strategy.guard_campaign() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'campanha nasce planejada' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'identidade da campanha é imutável' using errcode = 'check_violation';
  end if;
  if old.status in ('completed', 'cancelled') then
    raise exception 'campanha encerrada é imutável' using errcode = 'check_violation';
  end if;

  if new.status is distinct from old.status then
    if not ((old.status, new.status) in (
        ('draft','active'), ('draft','cancelled'),
        ('active','paused'), ('active','completed'), ('active','cancelled'),
        ('paused','active'), ('paused','completed'), ('paused','cancelled'))) then
      raise exception 'transição de estado da campanha inválida: % -> %', old.status, new.status using errcode = 'check_violation';
    end if;
    if new.status = 'active' and old.status = 'draft' and (
         btrim(new.name) = '' or new.tracking_key = '' or not strategy.method_complete(new.method)) then
      raise exception 'não é possível ativar: nome, método completo e chave de rastreamento são obrigatórios' using errcode = 'check_violation';
    end if;
  end if;

  -- Conteúdo só muda no rascunho; a chave de rastreamento nunca muda depois da ativação (I-CMP).
  if old.status <> 'draft' then
    if new.tracking_key is distinct from old.tracking_key then
      raise exception 'a chave de rastreamento não muda depois da ativação' using errcode = 'check_violation';
    end if;
    if new.name is distinct from old.name or new.objective_id is distinct from old.objective_id
       or new.product_key is distinct from old.product_key or new.method is distinct from old.method then
      raise exception 'campanha ativa não tem o conteúdo editado' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end
$$;

-- SECURITY INVOKER de propósito: o gatilho BEFORE roda antes da RLS; se lesse a campanha como dono, o
-- erro devolvido revelaria o estado de uma campanha de OUTRA empresa. Como invocador, a RLS limita a
-- leitura à empresa do usuário e uma campanha alheia é indistinguível de uma inexistente.
create or replace function strategy.guard_experiment() returns trigger
language plpgsql security invoker set search_path = pg_catalog, pg_temp as $$
declare v_campaign text; v_min integer; v_outcome text;
begin
  select c.status into v_campaign from strategy.campaigns c where c.tenant_id = new.tenant_id and c.id = new.campaign_id;

  if tg_op = 'INSERT' then
    if new.status <> 'planned' then
      raise exception 'teste nasce planejado: a hipótese é registrada antes da execução' using errcode = 'check_violation';
    end if;
    if v_campaign is null or v_campaign in ('completed', 'cancelled') then
      raise exception 'campanha inexistente ou encerrada' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id or new.campaign_id is distinct from old.campaign_id
     or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'identidade do teste é imutável' using errcode = 'check_violation';
  end if;
  -- I-HYP: a hipótese, a dimensão e o plano não mudam depois de registrados.
  if new.hypothesis is distinct from old.hypothesis or new.dimension is distinct from old.dimension
     or new.dimension_note is distinct from old.dimension_note or new.variants is distinct from old.variants
     or new.decision_metric is distinct from old.decision_metric or new.minimum_sample is distinct from old.minimum_sample then
    raise exception 'o plano do teste é imutável depois de registrado' using errcode = 'check_violation';
  end if;
  if old.status in ('concluded', 'cancelled') then
    raise exception 'teste encerrado é imutável' using errcode = 'check_violation';
  end if;
  if new.status is distinct from old.status then
    if not ((old.status, new.status) in (('planned','running'), ('planned','cancelled'), ('running','concluded'), ('running','cancelled'))) then
      raise exception 'transição de estado do teste inválida: % -> %', old.status, new.status using errcode = 'check_violation';
    end if;
    if new.status = 'running' and v_campaign is distinct from 'active' then
      raise exception 'o teste só roda com a campanha ativa' using errcode = 'check_violation';
    end if;
  end if;
  if new.status = 'concluded' then
    v_outcome := new.result->>'outcome';
    v_min := new.minimum_sample;
    if v_outcome is null or v_outcome not in ('supported', 'refuted', 'inconclusive')
       or jsonb_typeof(new.result->'observedSample') is distinct from 'number'
       or (new.result->>'observedSample')::numeric < 0
       or (new.result->>'observedSample')::numeric <> trunc((new.result->>'observedSample')::numeric) then
      raise exception 'resultado do teste inválido' using errcode = 'check_violation';
    end if;
    -- I-HYP: resultado sem dado suficiente é inconclusivo, nunca sucesso.
    if v_outcome <> 'inconclusive' and (new.result->>'observedSample')::numeric < v_min then
      raise exception 'amostra insuficiente: registre como inconclusivo' using errcode = 'check_violation';
    end if;
    if v_outcome = 'inconclusive' and (jsonb_typeof(new.result->'limitations') is distinct from 'string' or btrim(new.result->>'limitations') = '') then
      raise exception 'resultado inconclusivo exige a limitação' using errcode = 'check_violation';
    end if;
    if new.learning is not null and (
         jsonb_typeof(new.learning->'summary') is distinct from 'string' or btrim(new.learning->>'summary') = ''
         or jsonb_typeof(new.learning->'evidence') is distinct from 'array' or jsonb_array_length(new.learning->'evidence') = 0
         or jsonb_typeof(new.learning->'campaignVersion') is distinct from 'number' or (new.learning->>'campaignVersion')::numeric < 1) then
      raise exception 'aprendizado exige resumo, evidência e versão' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end
$$;

create or replace function strategy.guard_task() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from core.tenants t where t.id = old.tenant_id) then return old; end if;
    raise exception 'tarefa não é removida; cancele-a' using errcode = 'check_violation';
  end if;
  if new.id is distinct from old.id or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'identidade da tarefa é imutável' using errcode = 'check_violation';
  end if;
  if old.status = 'cancelled' then
    raise exception 'tarefa cancelada é imutável' using errcode = 'check_violation';
  end if;
  if new.status is distinct from old.status and not ((old.status, new.status) in (
      ('todo','in_progress'), ('todo','cancelled'),
      ('in_progress','todo'), ('in_progress','done'), ('in_progress','cancelled'),
      ('done','in_progress'))) then
    raise exception 'transição de estado da tarefa inválida: % -> %', old.status, new.status using errcode = 'check_violation';
  end if;
  return new;
end
$$;

-- Dependências: sem ciclo. O lock por empresa serializa inserções concorrentes que, juntas, fechariam um ciclo.
-- SECURITY INVOKER pelo mesmo motivo do guard_experiment: o grafo lido é o que a RLS permite ao usuário,
-- então inserir arestas em outra empresa não revela se existe ciclo lá (a RLS nega depois, com 42501).
create or replace function strategy.guard_task_dependency() returns trigger
language plpgsql security invoker set search_path = pg_catalog, pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('strategy.task_dependencies:' || new.tenant_id::text, 0));
  if exists (
    with recursive alcanca(id) as (
      select new.depends_on_id
      union
      select d.depends_on_id from strategy.task_dependencies d join alcanca a on d.task_id = a.id and d.tenant_id = new.tenant_id
    )
    select 1 from alcanca where id = new.task_id
  ) then
    raise exception 'a dependência criaria um ciclo entre tarefas' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

alter function strategy.guard_no_delete() owner to postgres;
alter function strategy.guard_objective() owner to postgres;
alter function strategy.guard_campaign() owner to postgres;
alter function strategy.guard_experiment() owner to postgres;
alter function strategy.guard_task() owner to postgres;
alter function strategy.guard_task_dependency() owner to postgres;

create trigger objectives_guarda before update on strategy.objectives for each row execute function strategy.guard_objective();
create trigger objectives_sem_exclusao before delete on strategy.objectives for each row execute function strategy.guard_no_delete();
create trigger campaigns_guarda before insert or update on strategy.campaigns for each row execute function strategy.guard_campaign();
create trigger campaigns_sem_exclusao before delete on strategy.campaigns for each row execute function strategy.guard_no_delete();
create trigger experiments_guarda before insert or update on strategy.experiments for each row execute function strategy.guard_experiment();
create trigger experiments_sem_exclusao before delete on strategy.experiments for each row execute function strategy.guard_no_delete();
create trigger tasks_guarda before update or delete on strategy.tasks for each row execute function strategy.guard_task();
create trigger task_dependencies_ciclo before insert on strategy.task_dependencies for each row execute function strategy.guard_task_dependency();

-- Funções de trigger não precisam de EXECUTE de quem dispara a operação.
do $$
declare v_fn text; v_role text;
begin
  foreach v_fn in array array[
    'strategy.guard_no_delete()', 'strategy.guard_objective()', 'strategy.guard_campaign()',
    'strategy.guard_experiment()', 'strategy.guard_task()', 'strategy.guard_task_dependency()'
  ] loop
    execute pg_catalog.format('revoke all on function %s from public', v_fn);
    for v_role in
      select r.rolname from pg_catalog.pg_roles r
       where r.rolname in ('anon', 'authenticated', 'service_role') or r.rolname like 'oplyra\_%'
    loop
      execute pg_catalog.format('revoke all on function %s from %I', v_fn, v_role);
    end loop;
  end loop;
end
$$;
grant execute on function strategy.kpis_valid(jsonb), strategy.method_valid(jsonb),
  strategy.method_complete(jsonb), strategy.variants_valid(jsonb) to authenticated;

-- ------------------------------------------------------------------------- RLS
alter table strategy.objectives        enable row level security;
alter table strategy.objectives        force  row level security;
alter table strategy.campaigns         enable row level security;
alter table strategy.campaigns         force  row level security;
alter table strategy.experiments       enable row level security;
alter table strategy.experiments       force  row level security;
alter table strategy.tasks             enable row level security;
alter table strategy.tasks             force  row level security;
alter table strategy.task_dependencies enable row level security;
alter table strategy.task_dependencies force  row level security;

do $$
declare t text;
begin
  foreach t in array array['objectives', 'campaigns', 'experiments', 'tasks', 'task_dependencies'] loop
    execute pg_catalog.format($f$
      create policy %1$s_select on strategy.%1$s for select
        using (tenant_id = app.current_tenant() and (select app.tenant_is_authorized())
               and (select app.has_permission('strategy.read')))$f$, t);
    execute pg_catalog.format($f$
      create policy %1$s_insert on strategy.%1$s for insert
        with check (tenant_id = app.current_tenant() and (select app.tenant_is_authorized())
                    and (select app.has_permission('strategy.write')))$f$, t);
  end loop;
  foreach t in array array['objectives', 'campaigns', 'experiments', 'tasks'] loop
    execute pg_catalog.format($f$
      create policy %1$s_update on strategy.%1$s for update
        using (tenant_id = app.current_tenant() and (select app.tenant_is_authorized())
               and (select app.has_permission('strategy.write')))
        with check (tenant_id = app.current_tenant() and (select app.tenant_is_authorized())
                    and (select app.has_permission('strategy.write')))$f$, t);
  end loop;
end
$$;
-- Reescrever as dependências de uma tarefa remove as antigas.
create policy task_dependencies_delete on strategy.task_dependencies for delete
  using (tenant_id = app.current_tenant() and (select app.tenant_is_authorized())
         and (select app.has_permission('strategy.write')));

-- ------------------------------------------------------------------ privilégios
-- Papéis de LOGIN continuam sem nada; operador e worker não acessam estratégia neste incremento.
grant select, insert, update on strategy.objectives, strategy.campaigns, strategy.experiments, strategy.tasks to authenticated;
grant select, insert, delete on strategy.task_dependencies to authenticated;

comment on schema strategy is 'Estratégia e operação (I-04): objetivos, campanhas, testes e tarefas por empresa, fora da Data API.';
comment on table strategy.objectives is 'Objetivo com indicadores e alvos; no máximo um principal ativo por empresa.';
comment on table strategy.campaigns is 'Campanha (DEC-017): método completo para ativar; chave de rastreamento única e fixa após a ativação.';
comment on table strategy.experiments is 'Teste por hipótese (I-HYP): plano imutável, resultado coerente com a amostra mínima.';
comment on table strategy.tasks is 'Tarefa operacional; cancelamento no lugar de exclusão.';
comment on table strategy.task_dependencies is 'Dependências entre tarefas da mesma empresa, sem ciclo.';
