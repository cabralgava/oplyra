-- I-01 — identidade, empresas, vínculos, convites, auditoria e entitlements.
-- Catálogos são globais e não têm tenant_id; tabelas de empresa usam chave
-- composta (tenant_id, id) para que nenhuma referência cruze empresas.

-- ------------------------------------------------------------- catálogos
create table core.roles (
  key           text primary key,
  label         text not null,
  precedence    int  not null,           -- maior number = mais poder
  created_at    timestamptz not null default now()
);

create table core.permissions (
  key           text primary key,
  label         text not null
);

create table core.role_permissions (
  role_key        text not null references core.roles(key) on delete cascade,
  permission_key  text not null references core.permissions(key) on delete cascade,
  primary key (role_key, permission_key)
);

create table core.plans (
  key           text primary key,
  label         text not null
);

create table core.capabilities (
  key           text primary key,
  label         text not null
);

-- ---------------------------------------------------------- dados da empresa
create table core.tenants (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(btrim(name)) between 2 and 120),
  slug          text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),
  status        text not null default 'active' check (status in ('active','suspended')),
  timezone      text not null default 'America/Sao_Paulo',
  locale        text not null default 'pt-BR',
  plan_key      text references core.plans(key),
  created_at    timestamptz not null default now()
);

create table core.memberships (
  tenant_id     uuid not null references core.tenants(id) on delete cascade,
  id            uuid not null default gen_random_uuid(),
  user_id       uuid not null,
  role_key      text not null references core.roles(key),
  status        text not null default 'active' check (status in ('active','revoked')),
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  primary key (tenant_id, id),
  -- Um vínculo ativo por pessoa e empresa; revogados podem coexistir no histórico.
  constraint memberships_status_coerente check (
    (status = 'active' and revoked_at is null) or (status = 'revoked' and revoked_at is not null)
  )
);
create unique index memberships_um_ativo_por_pessoa
  on core.memberships (tenant_id, user_id) where status = 'active';
create index memberships_por_usuario on core.memberships (user_id) where status = 'active';

create table core.invitations (
  tenant_id     uuid not null references core.tenants(id) on delete cascade,
  id            uuid not null default gen_random_uuid(),
  email         text not null check (position('@' in email) > 1),
  role_key      text not null references core.roles(key),
  token_hash    text not null unique,          -- só o hash; o token aparece uma vez
  expires_at    timestamptz not null,
  status        text not null default 'pending' check (status in ('pending','accepted','revoked')),
  invited_by    uuid not null,
  accepted_by   uuid,
  accepted_at   timestamptz,
  created_at    timestamptz not null default now(),
  primary key (tenant_id, id)
);
create unique index invitations_um_pendente_por_email
  on core.invitations (tenant_id, lower(email)) where status = 'pending';

create table core.audit_log (
  tenant_id       uuid not null references core.tenants(id) on delete cascade,
  id              uuid not null default gen_random_uuid(),
  actor_type      text not null check (actor_type in ('user','operator','worker','system')),
  actor_id        uuid,
  action          text not null,
  target          text,
  before          jsonb,
  after           jsonb,
  reason          text,
  correlation_id  uuid,
  created_at      timestamptz not null default now(),
  primary key (tenant_id, id)
);
create index audit_log_recente on core.audit_log (tenant_id, created_at desc);

create table core.tenant_entitlements (
  tenant_id       uuid not null references core.tenants(id) on delete cascade,
  capability_key  text not null references core.capabilities(key),
  value           jsonb not null default 'true'::jsonb,
  source          text not null default 'plan' check (source in ('plan','override')),
  valid_until     timestamptz,
  primary key (tenant_id, capability_key)
);

-- --------------------------------------------------- imutabilidade do tenant
create trigger memberships_tenant_imutavel before update on core.memberships
  for each row execute function app.forbid_tenant_change();
create trigger invitations_tenant_imutavel before update on core.invitations
  for each row execute function app.forbid_tenant_change();
create trigger entitlements_tenant_imutavel before update on core.tenant_entitlements
  for each row execute function app.forbid_tenant_change();

-- ------------------------------------------------------- dados de referência
insert into core.roles (key, label, precedence) values
  ('owner','Owner',100), ('admin','Administrador',80),
  ('marketing_manager','Gestor de Marketing',50), ('viewer','Leitura',10);

insert into core.permissions (key, label) values
  ('tenant.read','Ver dados da empresa'),
  ('member.read','Ver equipe'),
  ('member.invite','Convidar pessoas'),
  ('member.role.change','Alterar papel'),
  ('member.remove','Remover vínculo'),
  ('entitlement.read','Ver capacidades'),
  ('asset.read','Ler arquivos'),
  ('asset.write','Gravar arquivos');

insert into core.role_permissions (role_key, permission_key)
select r.key, p.key from core.roles r, core.permissions p
where (r.key = 'owner')
   or (r.key = 'admin' and p.key <> 'member.remove')
   or (r.key = 'marketing_manager' and p.key in ('tenant.read','member.read','entitlement.read','asset.read','asset.write'))
   or (r.key = 'viewer' and p.key in ('tenant.read','member.read','entitlement.read','asset.read'));

insert into core.plans (key, label) values ('performance','Oplyra Performance'), ('growth','Oplyra Growth');
insert into core.capabilities (key, label) values
  ('team.invite','Convidar pessoas para a empresa'),
  ('assets.library','Biblioteca de ativos'),
  ('relationshipJourneys','Réguas de relacionamento (Growth)');

-- Catálogos: leitura para a aplicação, escrita apenas por migration.
grant select on core.roles, core.permissions, core.role_permissions, core.plans, core.capabilities
  to authenticated, oplyra_worker_exec;

-- ---------------------------------------------- autorização dependente de tabela
-- Estas funções consultam core.memberships, por isso só podem existir depois
-- das tabelas: o corpo de uma função SQL é validado na criação.
-- Vínculo consultado AO VIVO a cada verificação: revogar acesso tem efeito
-- na requisição seguinte, sem esperar o token expirar.
create or replace function app.has_active_membership(target_tenant uuid) returns boolean
language sql stable security definer set search_path = core, pg_temp as $$
  select exists (
    select 1 from core.memberships m
    where m.tenant_id = target_tenant
      and m.user_id = app.current_user_id()
      and m.status = 'active'
  )
$$;

-- Predicado único das políticas. Recebe o tenant ATIVO, não a coluna da linha:
-- é isso que o torna um InitPlan avaliado uma vez por consulta.
create or replace function app.tenant_is_authorized() returns boolean
language sql stable as $$
  select app.current_tenant() is not null
     and (app.is_worker() or app.has_active_membership(app.current_tenant()))
$$;

-- Permissão efetiva do solicitante na empresa ativa.
create or replace function app.has_permission(target_permission text) returns boolean
language sql stable security definer set search_path = core, pg_temp as $$
  select app.is_worker() or exists (
    select 1
    from core.memberships m
    join core.role_permissions rp on rp.role_key = m.role_key
    where m.tenant_id = app.current_tenant()
      and m.user_id = app.current_user_id()
      and m.status = 'active'
      and rp.permission_key = target_permission
  )
$$;

grant execute on function app.current_user_id(), app.current_tenant(), app.is_worker(),
  app.has_active_membership(uuid), app.tenant_is_authorized(), app.has_permission(text)
  to authenticated, oplyra_worker_exec;
