-- EXP-01 — Acesso a dados por conexão direta com RLS efetiva
-- Schema DESCARTÁVEL de experimento. Não é migration do produto.
-- Referência: docs/product/marketing-ops/18-technical-experiments.md (EXP-01)

begin;

drop schema if exists exp01 cascade;
create schema exp01;

-- ---------------------------------------------------------------- papéis
-- Papéis de login: sem posse de tabela, sem privilégio direto, não contornam RLS.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'oplyra_web_login') then
    create role oplyra_web_login login password 'exp01_local_web' noinherit nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'oplyra_worker_login') then
    create role oplyra_worker_login login password 'exp01_local_worker' noinherit nobypassrls;
  end if;
  -- Papel de execução do worker: sem login, sem bypass.
  if not exists (select 1 from pg_roles where rolname = 'oplyra_worker_exec') then
    create role oplyra_worker_exec nologin nobypassrls;
  end if;
end
$$;

-- Cada login só pode assumir o próprio papel de execução.
grant authenticated to oplyra_web_login;
grant oplyra_worker_exec to oplyra_worker_login;

-- ---------------------------------------------------------------- tabelas
create table exp01.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table exp01.memberships (
  tenant_id uuid not null references exp01.tenants(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  role_key text not null,
  status text not null default 'active' check (status in ('active','revoked')),
  primary key (tenant_id, id),
  unique (tenant_id, user_id)
);
create index on exp01.memberships (user_id) where status = 'active';

create table exp01.campaigns (
  tenant_id uuid not null references exp01.tenants(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id)
);

-- Relação entre dados do mesmo tenant, por FK composta.
create table exp01.tasks (
  tenant_id uuid not null,
  id uuid not null default gen_random_uuid(),
  campaign_id uuid not null,
  title text not null,
  primary key (tenant_id, id),
  foreign key (tenant_id, campaign_id) references exp01.campaigns (tenant_id, id) on delete cascade
);

-- ------------------------------------------------- contexto da transação
-- Claims e tenant do worker vivem apenas no escopo da transação (set_config local).
create or replace function exp01.current_user_id() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create or replace function exp01.current_worker_tenant() returns uuid
language sql stable as $$
  select nullif(current_setting('app.tenant_id', true), '')::uuid
$$;

-- Vínculo consultado AO VIVO: nada vem do token além da identidade.
create or replace function exp01.has_active_membership(target_tenant uuid) returns boolean
language sql stable security definer set search_path = exp01, pg_temp as $$
  select exists (
    select 1 from exp01.memberships m
    where m.tenant_id = target_tenant
      and m.user_id = exp01.current_user_id()
      and m.status = 'active'
  )
$$;

create or replace function exp01.worker_owns(target_tenant uuid) returns boolean
language sql stable as $$
  select exp01.current_worker_tenant() is not null
     and exp01.current_worker_tenant() = target_tenant
$$;

-- ---------------------------------------------------------------- RLS
alter table exp01.tenants     enable row level security;
alter table exp01.tenants     force row level security;
alter table exp01.memberships enable row level security;
alter table exp01.memberships force row level security;
alter table exp01.campaigns   enable row level security;
alter table exp01.campaigns   force row level security;
alter table exp01.tasks       enable row level security;
alter table exp01.tasks       force row level security;

create policy tenants_read on exp01.tenants for select
  using (exp01.has_active_membership(id) or exp01.worker_owns(id));

create policy memberships_read on exp01.memberships for select
  using (exp01.has_active_membership(tenant_id) or exp01.worker_owns(tenant_id));

create policy campaigns_read on exp01.campaigns for select
  using (exp01.has_active_membership(tenant_id) or exp01.worker_owns(tenant_id));
create policy campaigns_insert on exp01.campaigns for insert
  with check (exp01.has_active_membership(tenant_id) or exp01.worker_owns(tenant_id));
-- using: linha visível ANTES; with check: linha resultante DEPOIS.
-- As duas cláusulas juntas impedem trocar o tenant_id de um registro.
create policy campaigns_update on exp01.campaigns for update
  using (exp01.has_active_membership(tenant_id) or exp01.worker_owns(tenant_id))
  with check (exp01.has_active_membership(tenant_id) or exp01.worker_owns(tenant_id));
create policy campaigns_delete on exp01.campaigns for delete
  using (exp01.has_active_membership(tenant_id) or exp01.worker_owns(tenant_id));

create policy tasks_read on exp01.tasks for select
  using (exp01.has_active_membership(tenant_id) or exp01.worker_owns(tenant_id));
create policy tasks_insert on exp01.tasks for insert
  with check (exp01.has_active_membership(tenant_id) or exp01.worker_owns(tenant_id));
create policy tasks_update on exp01.tasks for update
  using (exp01.has_active_membership(tenant_id) or exp01.worker_owns(tenant_id))
  with check (exp01.has_active_membership(tenant_id) or exp01.worker_owns(tenant_id));

-- ------------------------------------------------------------ privilégios
-- Os papéis de LOGIN não recebem nada. Só os papéis de execução recebem.
revoke all on schema exp01 from public;
revoke all on all tables in schema exp01 from public;

grant usage on schema exp01 to authenticated, oplyra_worker_exec;
grant select on exp01.tenants, exp01.memberships to authenticated, oplyra_worker_exec;
grant select, insert, update, delete on exp01.campaigns to authenticated;
grant select, insert, update on exp01.tasks to authenticated;
grant select, insert, update on exp01.campaigns, exp01.tasks to oplyra_worker_exec;
grant execute on all functions in schema exp01 to authenticated, oplyra_worker_exec;

commit;
