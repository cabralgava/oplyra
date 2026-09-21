-- CR-009 — persistência tenant-scoped do contentRepository.
--
-- O schema de domínio fica fora da Data API. Nesta etapa o worker recebe
-- apenas leitura: a escrita de create_copy_variants continua fora do escopo.

create schema if not exists content;
revoke all on schema content from public;

create table content.copy_drafts (
  tenant_id     uuid not null references core.tenants(id) on delete cascade,
  draft_ref     text not null check (length(draft_ref) > 0),
  version       integer not null check (version >= 1),
  source_action text not null check (source_action = 'create_copy_variants'),
  extensions    jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (tenant_id, draft_ref),
  check (extensions is null or jsonb_typeof(extensions) = 'object')
);

create table content.copy_variants (
  tenant_id         uuid not null,
  draft_ref         text not null,
  variant_ref       text not null check (length(variant_ref) > 0),
  position          integer not null check (position >= 0),
  headline          text not null check (length(headline) > 0),
  primary_text      text not null check (length(primary_text) > 0),
  cta               text not null check (length(cta) > 0),
  role              text check (role in ('reference', 'challenger')),
  angle             text check (angle is null or length(angle) > 0),
  changed_elements  text[],
  constant_elements text[],
  version           integer check (version is null or version >= 1),
  extensions        jsonb,
  primary key (tenant_id, draft_ref, variant_ref),
  unique (tenant_id, draft_ref, position),
  foreign key (tenant_id, draft_ref)
    references content.copy_drafts(tenant_id, draft_ref) on delete cascade,
  check (changed_elements is null or array_position(changed_elements, '') is null),
  check (constant_elements is null or array_position(constant_elements, '') is null),
  check (extensions is null or jsonb_typeof(extensions) = 'object')
);

create index copy_variants_lookup
  on content.copy_variants (tenant_id, draft_ref, variant_ref);

create trigger copy_drafts_tenant_imutavel before update on content.copy_drafts
  for each row execute function app.forbid_tenant_change();
create trigger copy_variants_tenant_imutavel before update on content.copy_variants
  for each row execute function app.forbid_tenant_change();

alter table content.copy_drafts enable row level security;
alter table content.copy_drafts force row level security;
alter table content.copy_variants enable row level security;
alter table content.copy_variants force row level security;

create policy copy_drafts_worker_select on content.copy_drafts for select
  using (tenant_id = app.current_tenant()
         and (select app.tenant_is_authorized())
         and (select app.is_worker()));

create policy copy_variants_worker_select on content.copy_variants for select
  using (tenant_id = app.current_tenant()
         and (select app.tenant_is_authorized())
         and (select app.is_worker()));

grant usage on schema content to oplyra_worker_exec;
grant select on content.copy_drafts, content.copy_variants to oplyra_worker_exec;

comment on schema content is
  'Persistência de domínio do contentRepository, fora da Data API.';
comment on table content.copy_drafts is
  'Snapshot versionado criado pela action canônica create_copy_variants.';
comment on table content.copy_variants is
  'Variantes pertencentes a um draft no mesmo tenant; FK sempre composta.';

