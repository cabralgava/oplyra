\set ON_ERROR_STOP on

create extension if not exists pgmq;
create extension if not exists pg_cron;

do $$
declare q text;
begin
  foreach q in array array['exp02_jobs','exp02_load','exp02_tx','exp02_poison','exp02_retry'] loop
    if exists (select 1 from pgmq.list_queues() where queue_name = q) then
      perform pgmq.drop_queue(q);
    end if;
    perform pgmq.create(q);
  end loop;
end $$;

drop schema if exists exp02 cascade;
create schema exp02;

create table exp02.workflow_runs (
  id uuid primary key,
  tenant_id uuid not null,
  state text not null check (state in ('queued','running','waiting_human','completed','dead_lettered')),
  attempt integer not null default 0,
  lease_owner text,
  lease_token uuid,
  lease_expires_at timestamptz,
  checkpoint text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table exp02.effects (
  tenant_id uuid not null,
  idempotency_key text not null,
  workflow_run_id uuid not null references exp02.workflow_runs(id),
  payload jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (tenant_id, idempotency_key)
);

create table exp02.alerts (
  id bigint generated always as identity primary key,
  workflow_run_id uuid not null references exp02.workflow_runs(id),
  kind text not null,
  payload jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);

create table exp02.schedule_occurrences (
  schedule_key text not null,
  occurrence_at timestamptz not null,
  source text not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (schedule_key, occurrence_at)
);

create table exp02.campaigns (
  tenant_id integer not null,
  campaign_id integer not null,
  name text not null,
  status text not null check (status in ('draft','active','paused','completed')),
  primary key (tenant_id, campaign_id)
);

create table exp02.metric_snapshots (
  tenant_id integer not null,
  campaign_id integer not null,
  captured_on date not null,
  spend numeric(14,2),
  impressions bigint,
  clicks bigint,
  conversions numeric(14,2),
  confidence text not null check (confidence in ('high','medium','low','unavailable')),
  primary key (tenant_id, campaign_id, captured_on),
  foreign key (tenant_id, campaign_id) references exp02.campaigns(tenant_id, campaign_id)
);

insert into exp02.campaigns(tenant_id,campaign_id,name,status)
select t, c, 'campaign-' || t || '-' || c,
  (array['active','active','paused','completed'])[((c - 1) % 4) + 1]
from generate_series(1,50) t
cross join generate_series(1,100) c;

insert into exp02.metric_snapshots(
  tenant_id,campaign_id,captured_on,spend,impressions,clicks,conversions,confidence
)
select t, c, date '2026-09-21' - d,
  case when (t+c+d)%29=0 then null else ((t*17+c*13+d*7)%10000)/10.0 end,
  case when (t+c+d)%31=0 then null else ((t*101+c*83+d*47)%100000) end,
  case when (t+c+d)%31=0 then null else ((t*19+c*11+d*5)%5000) end,
  case when (t+c+d)%37=0 then null else ((t*7+c*5+d*3)%400)/10.0 end,
  case when (t+c+d)%37=0 then 'unavailable' when (t+c+d)%11=0 then 'low' when (t+c+d)%5=0 then 'medium' else 'high' end
from generate_series(1,50) t
cross join generate_series(1,100) c
cross join generate_series(0,89) d;

create index metric_snapshots_tenant_date_campaign_idx
  on exp02.metric_snapshots(tenant_id,captured_on,campaign_id);
analyze exp02.campaigns;
analyze exp02.metric_snapshots;

create or replace function exp02.try_acquire_lease(
  p_run_id uuid,
  p_owner text,
  p_token uuid,
  p_lease_seconds integer
) returns boolean language plpgsql as $$
declare affected integer;
begin
  update exp02.workflow_runs
     set state = 'running', lease_owner = p_owner, lease_token = p_token,
         lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
         attempt = attempt + 1, updated_at = clock_timestamp()
   where id = p_run_id
     and state not in ('completed','dead_lettered','waiting_human')
     and (lease_expires_at is null or lease_expires_at <= clock_timestamp());
  get diagnostics affected = row_count;
  return affected = 1;
end $$;

create or replace function exp02.write_checkpoint(
  p_run_id uuid,
  p_owner text,
  p_token uuid,
  p_checkpoint text,
  p_final boolean default false
) returns boolean language plpgsql as $$
declare affected integer;
begin
  update exp02.workflow_runs
     set checkpoint = p_checkpoint,
         state = case when p_final then 'completed' else state end,
         lease_owner = case when p_final then null else lease_owner end,
         lease_token = case when p_final then null else lease_token end,
         lease_expires_at = case when p_final then null else lease_expires_at end,
         updated_at = clock_timestamp()
   where id = p_run_id and lease_owner = p_owner and lease_token = p_token
     and lease_expires_at > clock_timestamp();
  get diagnostics affected = row_count;
  return affected = 1;
end $$;

create or replace function exp02.materialize_occurrence(
  p_schedule_key text,
  p_occurrence_at timestamptz,
  p_source text
) returns boolean language plpgsql as $$
begin
  insert into exp02.schedule_occurrences(schedule_key, occurrence_at, source)
  values (p_schedule_key, p_occurrence_at, p_source)
  on conflict do nothing;
  return found;
end $$;
