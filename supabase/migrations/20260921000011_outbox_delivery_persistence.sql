-- CR-014 — persistência para lease/fencing/dead-letter e deduplicação do consumidor.
-- Esta migration não concede privilégios de dispatch nem implementa transporte.

alter table content.event_outbox
  drop constraint event_outbox_status_check;

alter table content.event_outbox
  add column lease_owner text,
  add column fencing_token text,
  add column lease_expires_at timestamptz,
  add column dead_lettered_at timestamptz,
  add constraint event_outbox_status_check
    check (status in ('pending', 'dispatching', 'dispatched', 'failed', 'dead_lettered')),
  add constraint event_outbox_lease_owner_nonempty
    check (lease_owner is null or length(lease_owner) > 0),
  add constraint event_outbox_fencing_token_nonempty
    check (fencing_token is null or length(fencing_token) > 0),
  add constraint event_outbox_delivery_state_shape
    check (
      (status = 'pending'
        and dispatch_attempts = 0
        and lease_owner is null and fencing_token is null and lease_expires_at is null
        and dispatched_at is null and dead_lettered_at is null and last_error is null)
      or
      (status = 'dispatching'
        and dispatch_attempts >= 1
        and lease_owner is not null and fencing_token is not null and lease_expires_at is not null
        and dispatched_at is null and dead_lettered_at is null)
      or
      (status = 'failed'
        and dispatch_attempts >= 1
        and lease_owner is null and fencing_token is null and lease_expires_at is null
        and dispatched_at is null and dead_lettered_at is null and last_error is not null)
      or
      (status = 'dispatched'
        and dispatch_attempts >= 1
        and lease_owner is null and fencing_token is null and lease_expires_at is null
        and dispatched_at is not null and dead_lettered_at is null)
      or
      (status = 'dead_lettered'
        and dispatch_attempts >= 1
        and lease_owner is null and fencing_token is null and lease_expires_at is null
        and dispatched_at is null and dead_lettered_at is not null and last_error is not null)
    ),
  add constraint event_outbox_consumer_identity
    unique (tenant_id, event_transaction_id, consumer_agent);

drop index content.event_outbox_pending;

create index event_outbox_dispatch_eligible
  on content.event_outbox (tenant_id, status, available_at, created_at)
  where status in ('pending', 'failed');

create index event_outbox_expired_lease
  on content.event_outbox (tenant_id, lease_expires_at, created_at)
  where status = 'dispatching';

create table content.event_consumer_deduplication (
  tenant_id            uuid not null references core.tenants(id) on delete cascade,
  event_transaction_id text not null,
  consumer_agent       text not null check (consumer_agent ~ '^[a-z][a-z0-9-]*-agent$'),
  status               text not null check (status in ('processing', 'completed', 'failed')),
  attempt              integer not null check (attempt >= 1),
  lease_owner          text,
  fencing_token        text,
  lease_expires_at     timestamptz,
  last_error           jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  completed_at         timestamptz,
  primary key (tenant_id, event_transaction_id, consumer_agent),
  foreign key (tenant_id, event_transaction_id, consumer_agent)
    references content.event_outbox(tenant_id, event_transaction_id, consumer_agent)
    on delete cascade,
  check (lease_owner is null or length(lease_owner) > 0),
  check (fencing_token is null or length(fencing_token) > 0),
  check (last_error is null or jsonb_typeof(last_error) = 'object'),
  constraint event_consumer_deduplication_state_shape check (
    (status = 'processing'
      and lease_owner is not null and fencing_token is not null and lease_expires_at is not null
      and completed_at is null)
    or
    (status = 'completed'
      and lease_owner is null and fencing_token is null and lease_expires_at is null
      and completed_at is not null and last_error is null)
    or
    (status = 'failed'
      and lease_owner is null and fencing_token is null and lease_expires_at is null
      and completed_at is null and last_error is not null)
  )
);

create index event_consumer_deduplication_expired_lease
  on content.event_consumer_deduplication (tenant_id, lease_expires_at, created_at)
  where status = 'processing';

create trigger event_consumer_deduplication_tenant_imutavel
  before update on content.event_consumer_deduplication
  for each row execute function app.forbid_tenant_change();

alter table content.event_consumer_deduplication enable row level security;
alter table content.event_consumer_deduplication force row level security;

-- Intencionalmente sem policy e sem GRANT nesta etapa. O futuro dispatcher
-- deverá operar por boundary controlada; o writer não recebe leitura/update.

comment on table content.event_consumer_deduplication is
  'Claim persistente por tenant, evento e consumidor para deduplicação at-least-once; CR-014 não concede acesso runtime.';
comment on column content.event_outbox.fencing_token is
  'Token opaco rotacionado em cada claim/reclaim; settlement obsoleto não pode prevalecer.';
comment on column content.event_outbox.lease_expires_at is
  'Limite do lease atual; não define polling ou tecnologia de transporte.';
