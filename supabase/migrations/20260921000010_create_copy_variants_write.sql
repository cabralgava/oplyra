-- CR-012 — escrita atômica de create_copy_variants.
-- Draft, variantes, idempotência e outbox compartilham a mesma transação.
-- Nenhum privilégio de dispatch é concedido nesta migration.

create table content.action_idempotency (
  tenant_id            uuid not null references core.tenants(id) on delete cascade,
  action               text not null check (action = 'create_copy_variants'),
  idempotency_key      text not null check (length(idempotency_key) > 0),
  request_fingerprint  text not null check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  status               text not null check (status in ('pending', 'completed')),
  source_transaction_id text not null check (length(source_transaction_id) > 0),
  draft_ref            text,
  result                jsonb,
  outbox_event_ref      text,
  created_at            timestamptz not null default now(),
  completed_at          timestamptz,
  primary key (tenant_id, action, idempotency_key),
  foreign key (tenant_id, draft_ref)
    references content.copy_drafts(tenant_id, draft_ref),
  check (
    (status = 'pending' and draft_ref is null and result is null and outbox_event_ref is null and completed_at is null)
    or
    (status = 'completed' and draft_ref is not null and result is not null
      and outbox_event_ref is not null and completed_at is not null
      and jsonb_typeof(result) = 'object')
  )
);

create table content.event_outbox (
  tenant_id             uuid not null references core.tenants(id) on delete cascade,
  event_transaction_id  text not null check (event_transaction_id ~ '^txn_[A-Za-z0-9][A-Za-z0-9._:-]*$'),
  event_key             text not null check (event_key = 'copy.draft_created'),
  schema_version        text not null default '1.0' check (schema_version = '1.0'),
  producer_agent        text not null default 'copywriting-agent' check (producer_agent = 'copywriting-agent'),
  consumer_agent        text not null default 'design-agent' check (consumer_agent = 'design-agent'),
  draft_ref             text not null,
  aggregate_version     integer not null check (aggregate_version >= 1),
  source_transaction_id text not null check (length(source_transaction_id) > 0),
  correlation_id        text not null check (length(correlation_id) > 0),
  causation_id          text,
  workflow_id           text,
  task_id               text,
  context               jsonb not null default '{}'::jsonb check (jsonb_typeof(context) = 'object'),
  payload               jsonb not null check (jsonb_typeof(payload) = 'object'),
  status                text not null default 'pending'
                          check (status in ('pending', 'dispatching', 'dispatched', 'failed')),
  dispatch_attempts     integer not null default 0 check (dispatch_attempts >= 0),
  available_at          timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  dispatched_at         timestamptz,
  last_error            jsonb,
  primary key (tenant_id, event_transaction_id),
  constraint event_outbox_one_draft_created_version
    unique (tenant_id, event_key, draft_ref, aggregate_version),
  foreign key (tenant_id, draft_ref)
    references content.copy_drafts(tenant_id, draft_ref) on delete cascade,
  check (causation_id is null or length(causation_id) > 0),
  check (workflow_id is null or length(workflow_id) > 0),
  check (task_id is null or length(task_id) > 0),
  check (last_error is null or jsonb_typeof(last_error) = 'object')
);

create index event_outbox_pending
  on content.event_outbox (status, available_at, created_at)
  where status in ('pending', 'failed');

create trigger action_idempotency_tenant_imutavel before update on content.action_idempotency
  for each row execute function app.forbid_tenant_change();
create trigger event_outbox_tenant_imutavel before update on content.event_outbox
  for each row execute function app.forbid_tenant_change();

alter table content.action_idempotency enable row level security;
alter table content.action_idempotency force row level security;
alter table content.event_outbox enable row level security;
alter table content.event_outbox force row level security;

create policy copy_drafts_worker_insert on content.copy_drafts for insert
  with check (tenant_id = app.current_tenant()
              and (select app.tenant_is_authorized())
              and (select app.is_worker()));
create policy copy_variants_worker_insert on content.copy_variants for insert
  with check (tenant_id = app.current_tenant()
              and (select app.tenant_is_authorized())
              and (select app.is_worker()));

create policy action_idempotency_worker_select on content.action_idempotency for select
  using (tenant_id = app.current_tenant()
         and (select app.tenant_is_authorized())
         and (select app.is_worker()));
create policy action_idempotency_worker_insert on content.action_idempotency for insert
  with check (tenant_id = app.current_tenant()
              and (select app.tenant_is_authorized())
              and (select app.is_worker()));
create policy action_idempotency_worker_update on content.action_idempotency for update
  using (tenant_id = app.current_tenant()
         and (select app.tenant_is_authorized())
         and (select app.is_worker()))
  with check (tenant_id = app.current_tenant()
              and (select app.tenant_is_authorized())
              and (select app.is_worker()));

create policy event_outbox_worker_insert on content.event_outbox for insert
  with check (tenant_id = app.current_tenant()
              and (select app.tenant_is_authorized())
              and (select app.is_worker()));

grant insert on content.copy_drafts, content.copy_variants to oplyra_worker_exec;
grant select, insert, update on content.action_idempotency to oplyra_worker_exec;
grant insert on content.event_outbox to oplyra_worker_exec;

comment on table content.action_idempotency is
  'Resultado canônico por tenant, action e idempotency key; sem TTL até política governada.';
comment on table content.event_outbox is
  'Eventos persistidos atomicamente; CR-012 não concede leitura, update ou dispatch ao worker.';

