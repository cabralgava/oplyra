-- I-04 — Estratégia: objetivos, indicadores, personas, campanhas e testes, por empresa.
--
-- Modelo (docs/harness/PREPARACAO-I04.md):
--  * campanha referencia objetivo e personas da MESMA empresa e um produto de uma versão PUBLICADA da marca
--    (FK composta com o tenant; a versão da marca usada fica fixada);
--  * a chave de rastreamento é única por empresa e fica fixa quando a campanha é ativada pela primeira vez;
--  * ativar exige o método completo (DEC-017), objetivo ativo e produto disponível (D-7);
--  * estados da campanha: Planejada -> Ativa <-> Pausada -> Concluída | Cancelada (14 §5);
--  * teste declara hipótese e dimensão desde a criação (I-HYP).
-- O domínio (packages/core) aplica as mesmas regras; aqui elas são repetidas como defesa em profundidade.
-- RLS habilitada e forçada desde a primeira tabela.

create schema if not exists strategy;
revoke all on schema strategy from public;
grant usage on schema strategy to authenticated;

-- ------------------------------------------------------------------ permissões
insert into core.permissions (key, label) values
  ('strategy.read',     'Ver a estratégia'),
  ('strategy.write',    'Editar objetivos, personas, campanhas e testes'),
  ('campaign.activate', 'Ativar e mudar o estado de campanhas');

-- D-6: leitura para todos; edição e ativação para Gestor, Admin e Owner.
insert into core.role_permissions (role_key, permission_key) values
  ('owner', 'strategy.read'), ('owner', 'strategy.write'), ('owner', 'campaign.activate'),
  ('admin', 'strategy.read'), ('admin', 'strategy.write'), ('admin', 'campaign.activate'),
  ('marketing_manager', 'strategy.read'), ('marketing_manager', 'strategy.write'), ('marketing_manager', 'campaign.activate'),
  ('viewer', 'strategy.read');

-- --------------------------------------------------------------------- tabelas
create table strategy.objectives (
  tenant_id     uuid not null references core.tenants(id) on delete cascade,
  id            uuid not null default gen_random_uuid(),
  name          text not null check (btrim(name) <> '' and length(name) <= 120),
  description   text not null default '' check (length(description) <= 1000),
  period_start  date not null,
  period_end    date not null,
  status        text not null default 'active' check (status in ('active', 'archived')),
  created_by    uuid not null,
  created_at    timestamptz not null default now(),
  primary key (tenant_id, id),
  check (period_end >= period_start)
);

create table strategy.kpis (
  tenant_id     uuid not null,
  id            uuid not null default gen_random_uuid(),
  objective_id  uuid not null,
  position      integer not null default 0 check (position >= 0),
  name          text not null check (btrim(name) <> '' and length(name) <= 80),
  unit          text not null default '' check (length(unit) <= 20),
  target        numeric(18, 4) not null check (target >= 0 and target <= 1000000000000),
  primary key (tenant_id, id),
  foreign key (tenant_id, objective_id) references strategy.objectives (tenant_id, id) on delete cascade
);

create table strategy.personas (
  tenant_id    uuid not null references core.tenants(id) on delete cascade,
  id           uuid not null default gen_random_uuid(),
  name         text not null check (btrim(name) <> '' and length(name) <= 120),
  description  text not null default '' check (length(description) <= 1000),
  pains        text not null default '' check (length(pains) <= 1000),
  objections   text not null default '' check (length(objections) <= 1000),
  status       text not null default 'active' check (status in ('active', 'archived')),
  created_by   uuid not null,
  created_at   timestamptz not null default now(),
  primary key (tenant_id, id)
);

create table strategy.campaigns (
  tenant_id         uuid not null references core.tenants(id) on delete cascade,
  id                uuid not null default gen_random_uuid(),
  name              text not null check (btrim(name) <> '' and length(name) <= 120),
  status            text not null default 'planned' check (status in ('planned', 'active', 'paused', 'completed', 'cancelled')),
  revision          integer not null default 1 check (revision >= 1),
  objective_id      uuid not null,
  brand_version_id  uuid not null,
  product_key       uuid not null,
  persona_id        uuid,
  tracking_key      text not null check (tracking_key ~ '^cmp-[a-z0-9]+(-[a-z0-9]+)*-[0-9a-f]{4}$' and length(tracking_key) <= 60),
  situation         text not null default '' check (length(situation) <= 1000),
  pain              text not null default '' check (length(pain) <= 1000),
  consequence       text not null default '' check (length(consequence) <= 1000),
  desire            text not null default '' check (length(desire) <= 1000),
  mechanism         text not null default '' check (length(mechanism) <= 1000),
  proof             text not null default '' check (length(proof) <= 1000),
  offer             text not null default '' check (length(offer) <= 1000),
  period_start      date not null,
  period_end        date not null,
  budget_minor      bigint check (budget_minor >= 0 and budget_minor <= 100000000000),
  budget_currency   text not null default 'BRL' check (budget_currency = 'BRL'),
  key_message       text not null default '' check (length(key_message) <= 500),
  activated_at      timestamptz,
  created_by        uuid not null,
  created_at        timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, tracking_key),
  check (period_end >= period_start),
  check ((status = 'planned' and activated_at is null)
      or (status in ('active', 'paused') and activated_at is not null)
      or status in ('completed', 'cancelled')),
  -- I-CMP: as três referências são da MESMA empresa (chave composta com o tenant).
  foreign key (tenant_id, objective_id) references strategy.objectives (tenant_id, id),
  foreign key (tenant_id, brand_version_id, product_key) references brand.products (tenant_id, version_id, product_key),
  foreign key (tenant_id, persona_id) references strategy.personas (tenant_id, id)
);
create index campaigns_por_objetivo on strategy.campaigns (tenant_id, objective_id);

create table strategy.experiments (
  tenant_id       uuid not null references core.tenants(id) on delete cascade,
  id              uuid not null default gen_random_uuid(),
  campaign_id     uuid not null,
  hypothesis      text not null check (btrim(hypothesis) <> '' and length(hypothesis) <= 1000),
  dimension       text not null check (dimension in ('angle', 'pain', 'hook', 'proof', 'visual', 'cta', 'other')),
  dimension_note  text not null default '' check (length(dimension_note) <= 200),
  status          text not null default 'planned' check (status in ('planned', 'running', 'stopped')),
  created_by      uuid not null,
  created_at      timestamptz not null default now(),
  started_at      timestamptz,
  primary key (tenant_id, id),
  foreign key (tenant_id, campaign_id) references strategy.campaigns (tenant_id, id),
  check (dimension <> 'other' or btrim(dimension_note) <> ''),
  check (status <> 'running' or started_at is not null)
);

-- ----------------------------------------------------- imutabilidade do tenant
create trigger objectives_tenant_imutavel  before update on strategy.objectives  for each row execute function app.forbid_tenant_change();
create trigger kpis_tenant_imutavel        before update on strategy.kpis        for each row execute function app.forbid_tenant_change();
create trigger personas_tenant_imutavel    before update on strategy.personas    for each row execute function app.forbid_tenant_change();
create trigger campaigns_tenant_imutavel   before update on strategy.campaigns   for each row execute function app.forbid_tenant_change();
create trigger experiments_tenant_imutavel before update on strategy.experiments for each row execute function app.forbid_tenant_change();

-- ------------------------------------------------------------------- guardas
-- Objetivo e persona: só mudam de ativo para arquivado. Não há exclusão (só a cascata real da empresa).
create or replace function strategy.guard_archivable() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from core.tenants t where t.id = old.tenant_id) then return old; end if;
    raise exception '% não é excluído: arquive-o', tg_table_name using errcode = 'check_violation';
  end if;
  if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
    raise exception '% só pode ser arquivado', tg_table_name using errcode = 'check_violation';
  end if;
  if new.status is distinct from old.status and not (old.status = 'active' and new.status = 'archived') then
    raise exception 'transição de estado inválida em %', tg_table_name using errcode = 'check_violation';
  end if;
  return new;
end
$$;

-- Indicadores: só entram (junto do objetivo), no máximo 20 por objetivo; nunca mudam.
create or replace function strategy.guard_kpi() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_total integer;
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from core.tenants t where t.id = old.tenant_id) then return old; end if;
    -- cascata do descarte do objetivo não existe: objetivo não é excluído
    raise exception 'indicador não é excluído' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' then
    raise exception 'indicador não é alterado' using errcode = 'check_violation';
  end if;
  select count(*) into v_total from strategy.kpis k where k.tenant_id = new.tenant_id and k.objective_id = new.objective_id;
  if v_total >= 20 then raise exception 'máximo de 20 indicadores por objetivo' using errcode = 'check_violation'; end if;
  return new;
end
$$;

create or replace function strategy.guard_campaign() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_status text; v_avail text; v_objective text;
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from core.tenants t where t.id = old.tenant_id) then return old; end if;
    raise exception 'campanha não é excluída: cancele-a' using errcode = 'check_violation';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'planned' then
      raise exception 'a campanha nasce planejada' using errcode = 'check_violation';
    end if;
    select v.status into v_status from brand.versions v where v.tenant_id = new.tenant_id and v.id = new.brand_version_id;
    if v_status is distinct from 'published' then
      raise exception 'a campanha só referencia versão publicada da marca' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- UPDATE
  if old.status in ('completed', 'cancelled') then
    raise exception 'campanha encerrada não é alterada' using errcode = 'check_violation';
  end if;
  if new.id is distinct from old.id or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'identidade da campanha é imutável' using errcode = 'check_violation';
  end if;
  if old.activated_at is not null then
    if new.activated_at is distinct from old.activated_at then
      raise exception 'a data da primeira ativação não é reescrita' using errcode = 'check_violation';
    end if;
    if new.tracking_key is distinct from old.tracking_key then
      raise exception 'a chave de rastreamento é fixa depois de ativada a campanha' using errcode = 'check_violation';
    end if;
    if new.objective_id is distinct from old.objective_id or new.brand_version_id is distinct from old.brand_version_id
       or new.product_key is distinct from old.product_key then
      raise exception 'objetivo, produto e versão da marca são fixos depois de ativada a campanha' using errcode = 'check_violation';
    end if;
  end if;
  if new.brand_version_id is distinct from old.brand_version_id then
    select v.status into v_status from brand.versions v where v.tenant_id = new.tenant_id and v.id = new.brand_version_id;
    if v_status is distinct from 'published' then
      raise exception 'a campanha só referencia versão publicada da marca' using errcode = 'check_violation';
    end if;
  end if;
  if new.status is distinct from old.status and not (
       (old.status = 'planned' and new.status in ('active', 'cancelled'))
    or (old.status = 'active'  and new.status in ('paused', 'completed', 'cancelled'))
    or (old.status = 'paused'  and new.status in ('active', 'completed', 'cancelled'))) then
    raise exception 'transição de estado da campanha inválida' using errcode = 'check_violation';
  end if;

  -- Primeira ativação: método completo (DEC-017), objetivo ativo e produto disponível.
  if old.activated_at is null and new.status = 'active' then
    if btrim(new.situation) = '' or btrim(new.pain) = '' or btrim(new.consequence) = '' or btrim(new.desire) = ''
       or btrim(new.mechanism) = '' or btrim(new.proof) = '' or btrim(new.offer) = '' then
      raise exception 'não é possível ativar: o método da campanha está incompleto' using errcode = 'check_violation';
    end if;
    select o.status into v_objective from strategy.objectives o where o.tenant_id = new.tenant_id and o.id = new.objective_id;
    if v_objective is distinct from 'active' then
      raise exception 'não é possível ativar: o objetivo está arquivado' using errcode = 'check_violation';
    end if;
    select p.availability into v_avail from brand.products p
     where p.tenant_id = new.tenant_id and p.version_id = new.brand_version_id and p.product_key = new.product_key;
    if v_avail is distinct from 'available' then
      raise exception 'não é possível ativar: o produto ainda não está disponível' using errcode = 'check_violation';
    end if;
  end if;
  -- Depois de ativada, o método não pode voltar a ficar incompleto.
  if new.activated_at is not null and (btrim(new.situation) = '' or btrim(new.pain) = '' or btrim(new.consequence) = ''
     or btrim(new.desire) = '' or btrim(new.mechanism) = '' or btrim(new.proof) = '' or btrim(new.offer) = '') then
    raise exception 'o método de uma campanha ativada não pode ficar incompleto' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create or replace function strategy.guard_experiment() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_campaign text;
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from core.tenants t where t.id = old.tenant_id) then return old; end if;
    raise exception 'teste não é excluído: interrompa-o' using errcode = 'check_violation';
  end if;

  select c.status into v_campaign from strategy.campaigns c where c.tenant_id = new.tenant_id and c.id = new.campaign_id;
  if tg_op = 'INSERT' then
    if new.status <> 'planned' then raise exception 'o teste nasce planejado' using errcode = 'check_violation'; end if;
    if v_campaign in ('completed', 'cancelled') then
      raise exception 'campanha concluída ou cancelada não recebe testes' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id or new.campaign_id is distinct from old.campaign_id
     or new.hypothesis is distinct from old.hypothesis or new.dimension is distinct from old.dimension
     or new.dimension_note is distinct from old.dimension_note or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'hipótese e dimensão são declaradas antes da execução e não mudam' using errcode = 'check_violation';
  end if;
  if new.status is distinct from old.status then
    if not ((old.status = 'planned' and new.status in ('running', 'stopped')) or (old.status = 'running' and new.status = 'stopped')) then
      raise exception 'transição de estado do teste inválida' using errcode = 'check_violation';
    end if;
    if new.status = 'running' and v_campaign in ('completed', 'cancelled') then
      raise exception 'campanha concluída ou cancelada não executa testes' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end
$$;

alter function strategy.guard_archivable() owner to postgres;
alter function strategy.guard_kpi() owner to postgres;
alter function strategy.guard_campaign() owner to postgres;
alter function strategy.guard_experiment() owner to postgres;

create trigger objectives_guarda before update or delete on strategy.objectives for each row execute function strategy.guard_archivable();
create trigger personas_guarda   before update or delete on strategy.personas   for each row execute function strategy.guard_archivable();
create trigger kpis_guarda       before insert or update or delete on strategy.kpis for each row execute function strategy.guard_kpi();
create trigger campaigns_guarda  before insert or update or delete on strategy.campaigns for each row execute function strategy.guard_campaign();
create trigger experiments_guarda before insert or update or delete on strategy.experiments for each row execute function strategy.guard_experiment();

-- Funções de trigger não precisam de EXECUTE de quem dispara a operação.
do $$
declare v_fn text; v_role text;
begin
  foreach v_fn in array array[
    'strategy.guard_archivable()', 'strategy.guard_kpi()', 'strategy.guard_campaign()', 'strategy.guard_experiment()'
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

-- ------------------------------------------------------------------------- RLS
alter table strategy.objectives  enable row level security;  alter table strategy.objectives  force row level security;
alter table strategy.kpis        enable row level security;  alter table strategy.kpis        force row level security;
alter table strategy.personas    enable row level security;  alter table strategy.personas    force row level security;
alter table strategy.campaigns   enable row level security;  alter table strategy.campaigns   force row level security;
alter table strategy.experiments enable row level security;  alter table strategy.experiments force row level security;

create policy objectives_select on strategy.objectives for select
  using (tenant_id = app.current_tenant() and (select app.tenant_is_authorized()) and (select app.has_permission('strategy.read')));
create policy objectives_insert on strategy.objectives for insert
  with check (tenant_id = app.current_tenant() and (select app.tenant_is_authorized()) and status = 'active' and (select app.has_permission('strategy.write')));
create policy objectives_update on strategy.objectives for update
  using (tenant_id = app.current_tenant() and (select app.tenant_is_authorized()) and (select app.has_permission('strategy.write')))
  with check (tenant_id = app.current_tenant() and (select app.tenant_is_authorized()) and (select app.has_permission('strategy.write')));

create policy kpis_select on strategy.kpis for select
  using (tenant_id = app.current_tenant() and (select app.tenant_is_authorized()) and (select app.has_permission('strategy.read')));
create policy kpis_insert on strategy.kpis for insert
  with check (tenant_id = app.current_tenant() and (select app.tenant_is_authorized()) and (select app.has_permission('strategy.write')));

create policy personas_select on strategy.personas for select
  using (tenant_id = app.current_tenant() and (select app.tenant_is_authorized()) and (select app.has_permission('strategy.read')));
create policy personas_insert on strategy.personas for insert
  with check (tenant_id = app.current_tenant() and (select app.tenant_is_authorized()) and status = 'active' and (select app.has_permission('strategy.write')));
create policy personas_update on strategy.personas for update
  using (tenant_id = app.current_tenant() and (select app.tenant_is_authorized()) and (select app.has_permission('strategy.write')))
  with check (tenant_id = app.current_tenant() and (select app.tenant_is_authorized()) and (select app.has_permission('strategy.write')));

create policy campaigns_select on strategy.campaigns for select
  using (tenant_id = app.current_tenant() and (select app.tenant_is_authorized()) and (select app.has_permission('strategy.read')));
create policy campaigns_insert on strategy.campaigns for insert
  with check (tenant_id = app.current_tenant() and (select app.tenant_is_authorized()) and status = 'planned' and (select app.has_permission('strategy.write')));
-- Editar exige strategy.write; o resultado fora de "planejada" (ativar, pausar, concluir, cancelar) exige também campaign.activate.
create policy campaigns_update on strategy.campaigns for update
  using (tenant_id = app.current_tenant() and (select app.tenant_is_authorized()) and (select app.has_permission('strategy.write')))
  with check (tenant_id = app.current_tenant() and (select app.tenant_is_authorized()) and (select app.has_permission('strategy.write'))
              and (status = 'planned' or (select app.has_permission('campaign.activate'))));

create policy experiments_select on strategy.experiments for select
  using (tenant_id = app.current_tenant() and (select app.tenant_is_authorized()) and (select app.has_permission('strategy.read')));
create policy experiments_insert on strategy.experiments for insert
  with check (tenant_id = app.current_tenant() and (select app.tenant_is_authorized()) and status = 'planned' and (select app.has_permission('strategy.write')));
create policy experiments_update on strategy.experiments for update
  using (tenant_id = app.current_tenant() and (select app.tenant_is_authorized()) and (select app.has_permission('strategy.write')))
  with check (tenant_id = app.current_tenant() and (select app.tenant_is_authorized()) and (select app.has_permission('strategy.write')));

-- ------------------------------------------------------------------ privilégios
-- Papéis de LOGIN continuam sem nada; operador e worker não acessam a estratégia neste incremento.
-- Sem DELETE para ninguém: objetivos, personas, campanhas e testes encerram por estado.
grant select, insert, update on strategy.objectives, strategy.personas, strategy.campaigns, strategy.experiments to authenticated;
grant select, insert on strategy.kpis to authenticated;

comment on schema strategy is 'Estratégia (I-04): objetivos, personas, campanhas e testes por empresa, fora da Data API.';
comment on table strategy.campaigns is 'Campanha: método DEC-017, chave de rastreamento fixa após a ativação e produto de versão publicada da marca.';
comment on table strategy.experiments is 'Teste: hipótese e dimensão declaradas antes da execução (I-HYP).';
