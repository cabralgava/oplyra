-- I-03 — Brand OS: versões da marca, produtos e afirmações (claims), por empresa.
--
-- Modelo (docs/harness/PREPARACAO-I03.md):
--  * versão da marca = rascunho ou publicada; no máximo um rascunho por empresa;
--  * publicada é imutável (a vigente é a publicada de maior número; não há ponteiro);
--  * publicar exige posicionamento, tom e ao menos um produto (D-2) e afirmações coerentes;
--  * produtos e afirmações pertencem a UMA versão (chave composta com o tenant);
--  * afirmação de disponibilidade PERMITIDA nunca recai sobre produto `future`.
-- O domínio (packages/core) aplica as mesmas regras; aqui elas são repetidas como defesa
-- em profundidade. RLS habilitada e forçada desde a primeira tabela.

create schema if not exists brand;
revoke all on schema brand from public;
grant usage on schema brand to authenticated;

-- ------------------------------------------------------------------ permissões
insert into core.permissions (key, label) values
  ('brand.read',    'Ver a marca'),
  ('brand.write',   'Editar o rascunho da marca'),
  ('brand.publish', 'Publicar uma versão da marca');

-- D-4: leitura para todos; edição do rascunho para o gestor; publicar é de Owner e Admin.
insert into core.role_permissions (role_key, permission_key) values
  ('owner', 'brand.read'), ('owner', 'brand.write'), ('owner', 'brand.publish'),
  ('admin', 'brand.read'), ('admin', 'brand.write'), ('admin', 'brand.publish'),
  ('marketing_manager', 'brand.read'), ('marketing_manager', 'brand.write'),
  ('viewer', 'brand.read');

-- --------------------------------------------------------------------- tabelas
create table brand.versions (
  tenant_id        uuid not null references core.tenants(id) on delete cascade,
  id               uuid not null default gen_random_uuid(),
  number           integer not null check (number >= 1),
  status           text not null default 'draft' check (status in ('draft', 'published')),
  revision         integer not null default 1 check (revision >= 1),
  positioning      text not null default '' check (length(positioning) <= 2000),
  tone             text not null default '' check (length(tone) <= 1000),
  derived_from_id  uuid,
  created_by       uuid not null,
  created_at       timestamptz not null default now(),
  published_by     uuid,
  published_at     timestamptz,
  primary key (tenant_id, id),
  unique (tenant_id, number),
  foreign key (tenant_id, derived_from_id) references brand.versions (tenant_id, id),
  constraint versions_publicacao_coerente check (
    (status = 'draft' and published_by is null and published_at is null)
    or (status = 'published' and published_by is not null and published_at is not null)
  )
);
-- No máximo um rascunho por empresa.
create unique index versions_um_rascunho on brand.versions (tenant_id) where status = 'draft';

create table brand.products (
  tenant_id     uuid not null,
  version_id    uuid not null,
  product_key   uuid not null,               -- identidade estável do produto entre versões
  position      integer not null default 0 check (position >= 0),
  name          text not null check (length(name) <= 120),
  description   text not null default '' check (length(description) <= 1000),
  availability  text not null check (availability in ('available', 'future')),
  primary key (tenant_id, version_id, product_key),
  foreign key (tenant_id, version_id) references brand.versions (tenant_id, id) on delete cascade
);

-- Validação estrutural da lista de evidências (D-5: texto ou URL http/https).
create or replace function brand.evidence_valid(e jsonb) returns boolean
language plpgsql immutable as $$
declare item jsonb;
begin
  if e is null or jsonb_typeof(e) <> 'array' or jsonb_array_length(e) > 10 then return false; end if;
  for item in select value from jsonb_array_elements(e) loop
    if jsonb_typeof(item) <> 'object' then return false; end if;
    if coalesce(item->>'kind', '') not in ('text', 'url') then return false; end if;
    if jsonb_typeof(item->'value') <> 'string' or btrim(item->>'value') = '' or length(item->>'value') > 1000 then return false; end if;
    if item->>'kind' = 'url' and item->>'value' !~* '^https?://[^[:space:]]+$' then return false; end if;
  end loop;
  return true;
end
$$;

create table brand.claims (
  tenant_id    uuid not null,
  id           uuid not null default gen_random_uuid(),
  version_id   uuid not null,
  product_key  uuid,                          -- nulo = afirmação geral da marca
  position     integer not null default 0 check (position >= 0),
  kind         text not null check (kind in ('availability', 'benefit', 'proof', 'differentiator')),
  polarity     text not null check (polarity in ('allowed', 'forbidden')),
  text         text not null check (length(text) <= 500),
  usage_rule   text not null default '' check (length(usage_rule) <= 500),
  evidence     jsonb not null default '[]'::jsonb check (brand.evidence_valid(evidence)),
  primary key (tenant_id, id),
  foreign key (tenant_id, version_id) references brand.versions (tenant_id, id) on delete cascade,
  -- Com product_key nulo a FK não é avaliada (MATCH SIMPLE); com valor, o produto é da MESMA versão e empresa.
  foreign key (tenant_id, version_id, product_key) references brand.products (tenant_id, version_id, product_key),
  constraint claims_disponibilidade_exige_produto check (kind <> 'availability' or product_key is not null)
);
create index claims_por_versao on brand.claims (tenant_id, version_id, position);

-- ----------------------------------------------------- imutabilidade do tenant
create trigger versions_tenant_imutavel before update on brand.versions
  for each row execute function app.forbid_tenant_change();
create trigger products_tenant_imutavel before update on brand.products
  for each row execute function app.forbid_tenant_change();
create trigger claims_tenant_imutavel before update on brand.claims
  for each row execute function app.forbid_tenant_change();

-- ------------------------------------------------------ regras de publicação
-- Primeiro problema que impede a publicação, ou nulo. Roda como dono para enxergar as
-- linhas reais, e é a única fonte das regras de publicação no banco.
create or replace function brand.publish_problem(p_tenant uuid, p_version uuid, p_positioning text, p_tone text)
returns text
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if btrim(p_positioning) = '' then return 'o posicionamento é obrigatório'; end if;
  if btrim(p_tone) = '' then return 'o tom de voz é obrigatório'; end if;
  if not exists (select 1 from brand.products p where p.tenant_id = p_tenant and p.version_id = p_version) then
    return 'cadastre ao menos um produto';
  end if;
  if exists (select 1 from brand.products p where p.tenant_id = p_tenant and p.version_id = p_version and btrim(p.name) = '') then
    return 'todo produto precisa de nome';
  end if;
  if exists (select 1 from brand.claims c where c.tenant_id = p_tenant and c.version_id = p_version and btrim(c.text) = '') then
    return 'toda afirmação precisa de texto';
  end if;
  if exists (select 1 from brand.claims c where c.tenant_id = p_tenant and c.version_id = p_version and btrim(c.usage_rule) = '') then
    return 'toda afirmação precisa de regra de uso';
  end if;
  if exists (select 1 from brand.claims c where c.tenant_id = p_tenant and c.version_id = p_version
              and c.polarity = 'allowed' and jsonb_array_length(c.evidence) = 0) then
    return 'afirmação permitida exige evidência';
  end if;
  if exists (select 1 from brand.claims c join brand.products p
                on p.tenant_id = c.tenant_id and p.version_id = c.version_id and p.product_key = c.product_key
              where c.tenant_id = p_tenant and c.version_id = p_version
                and c.kind = 'availability' and c.polarity = 'allowed' and p.availability = 'future') then
    return 'produto futuro não pode ter afirmação de disponibilidade permitida';
  end if;
  return null;
end
$$;

-- Guarda da versão: publicada é imutável; identidade não muda; a publicação valida o conteúdo.
create or replace function brand.guard_version() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_problem text;
begin
  if tg_op = 'DELETE' then
    -- Rascunho pode ser descartado; publicada só some na cascata real da exclusão da empresa.
    if old.status = 'draft' or not exists (select 1 from core.tenants t where t.id = old.tenant_id) then
      return old;
    end if;
    raise exception 'versão publicada da marca é imutável' using errcode = 'check_violation';
  end if;

  if old.status = 'published' then
    raise exception 'versão publicada da marca é imutável' using errcode = 'check_violation';
  end if;
  if new.id is distinct from old.id or new.number is distinct from old.number
     or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at
     or new.derived_from_id is distinct from old.derived_from_id then
    raise exception 'identidade da versão da marca é imutável' using errcode = 'check_violation';
  end if;
  if new.status = 'published' then
    v_problem := brand.publish_problem(new.tenant_id, new.id, new.positioning, new.tone);
    if v_problem is not null then
      raise exception 'não é possível publicar: %', v_problem using errcode = 'check_violation';
    end if;
  end if;
  return new;
end
$$;

-- Guarda de produtos e afirmações: só se alteram em versão rascunho.
create or replace function brand.guard_child() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_tenant  uuid := coalesce(new.tenant_id, old.tenant_id);
  v_version uuid := coalesce(new.version_id, old.version_id);
  v_status  text;
  v_total   integer;
begin
  if tg_op = 'DELETE' and not exists (select 1 from core.tenants t where t.id = v_tenant) then
    return old;
  end if;
  select v.status into v_status from brand.versions v where v.tenant_id = v_tenant and v.id = v_version;
  if v_status is null then
    -- Pai ausente: só acontece na cascata do descarte de um rascunho.
    if tg_op = 'DELETE' then return old; end if;
    raise exception 'versão da marca inexistente' using errcode = 'foreign_key_violation';
  end if;
  if v_status <> 'draft' then
    raise exception 'versão publicada da marca é imutável' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and new.version_id is distinct from old.version_id then
    raise exception 'a versão de um item da marca não pode mudar' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    if tg_table_name = 'products' then
      select count(*) into v_total from brand.products p where p.tenant_id = v_tenant and p.version_id = v_version;
      if v_total >= 50 then raise exception 'máximo de 50 produtos por versão' using errcode = 'check_violation'; end if;
    else
      select count(*) into v_total from brand.claims c where c.tenant_id = v_tenant and c.version_id = v_version;
      if v_total >= 200 then raise exception 'máximo de 200 afirmações por versão' using errcode = 'check_violation'; end if;
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

-- Afirmação de disponibilidade permitida sobre produto futuro é inválida em qualquer gravação.
create or replace function brand.guard_claim_availability() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if new.kind = 'availability' and new.polarity = 'allowed' and exists (
       select 1 from brand.products p
        where p.tenant_id = new.tenant_id and p.version_id = new.version_id
          and p.product_key = new.product_key and p.availability = 'future') then
    raise exception 'produto futuro não pode ter afirmação de disponibilidade permitida' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create or replace function brand.guard_product_availability() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if new.availability = 'future' and exists (
       select 1 from brand.claims c
        where c.tenant_id = new.tenant_id and c.version_id = new.version_id and c.product_key = new.product_key
          and c.kind = 'availability' and c.polarity = 'allowed') then
    raise exception 'produto futuro não pode ter afirmação de disponibilidade permitida' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

alter function brand.publish_problem(uuid, uuid, text, text) owner to postgres;
alter function brand.guard_version() owner to postgres;
alter function brand.guard_child() owner to postgres;
alter function brand.guard_claim_availability() owner to postgres;
alter function brand.guard_product_availability() owner to postgres;

create trigger versions_guarda before update or delete on brand.versions
  for each row execute function brand.guard_version();
create trigger products_guarda before insert or update or delete on brand.products
  for each row execute function brand.guard_child();
create trigger claims_guarda before insert or update or delete on brand.claims
  for each row execute function brand.guard_child();
create trigger claims_disponibilidade before insert or update on brand.claims
  for each row execute function brand.guard_claim_availability();
create trigger products_disponibilidade before update on brand.products
  for each row execute function brand.guard_product_availability();

-- Funções de trigger não precisam de EXECUTE de quem dispara a operação.
do $$
declare v_fn text; v_role text;
begin
  foreach v_fn in array array[
    'brand.publish_problem(uuid, uuid, text, text)', 'brand.guard_version()', 'brand.guard_child()',
    'brand.guard_claim_availability()', 'brand.guard_product_availability()'
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
grant execute on function brand.evidence_valid(jsonb) to authenticated;

-- ------------------------------------------------------------------------- RLS
alter table brand.versions enable row level security;
alter table brand.versions force  row level security;
alter table brand.products enable row level security;
alter table brand.products force  row level security;
alter table brand.claims   enable row level security;
alter table brand.claims   force  row level security;

create policy versions_select on brand.versions for select
  using (tenant_id = app.current_tenant() and (select app.tenant_is_authorized())
         and (select app.has_permission('brand.read')));
create policy versions_insert on brand.versions for insert
  with check (tenant_id = app.current_tenant() and (select app.tenant_is_authorized())
              and status = 'draft' and (select app.has_permission('brand.write')));
-- Só o rascunho é atualizável; publicar (status -> published) exige brand.publish.
create policy versions_update on brand.versions for update
  using (tenant_id = app.current_tenant() and (select app.tenant_is_authorized()) and status = 'draft'
         and ((select app.has_permission('brand.write')) or (select app.has_permission('brand.publish'))))
  with check (tenant_id = app.current_tenant() and (select app.tenant_is_authorized())
              and ((status = 'draft' and (select app.has_permission('brand.write')))
                or (status = 'published' and (select app.has_permission('brand.publish')))));

create policy products_select on brand.products for select
  using (tenant_id = app.current_tenant() and (select app.tenant_is_authorized())
         and (select app.has_permission('brand.read')));
create policy products_write on brand.products for all
  using (tenant_id = app.current_tenant() and (select app.tenant_is_authorized())
         and (select app.has_permission('brand.write')))
  with check (tenant_id = app.current_tenant() and (select app.tenant_is_authorized())
              and (select app.has_permission('brand.write')));

create policy claims_select on brand.claims for select
  using (tenant_id = app.current_tenant() and (select app.tenant_is_authorized())
         and (select app.has_permission('brand.read')));
create policy claims_write on brand.claims for all
  using (tenant_id = app.current_tenant() and (select app.tenant_is_authorized())
         and (select app.has_permission('brand.write')))
  with check (tenant_id = app.current_tenant() and (select app.tenant_is_authorized())
              and (select app.has_permission('brand.write')));

-- ------------------------------------------------------------------ privilégios
-- Papéis de LOGIN continuam sem nada; operador e worker não acessam a marca neste incremento.
grant select, insert, update          on brand.versions to authenticated;
grant select, insert, update, delete  on brand.products to authenticated;
grant select, insert, update, delete  on brand.claims   to authenticated;

comment on schema brand is 'Brand OS (I-03): persistência da marca por empresa, fora da Data API.';
comment on table brand.versions is 'Versão da marca: rascunho (no máximo um por empresa) ou publicada (imutável).';
comment on table brand.products is 'Produtos de UMA versão da marca; product_key é estável entre versões.';
comment on table brand.claims is 'Afirmações (claims) de UMA versão: regra de uso, evidência e polaridade.';
