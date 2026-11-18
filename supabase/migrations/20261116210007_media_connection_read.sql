-- CR-055 v1.0: conexão e leitura Google/Meta. Nenhuma operação de escrita de anúncios.
-- Tabelas privadas; autoridade deriva do papel e contexto da transação, nunca do JSON.
create schema media;
revoke all on schema media from public, anon, authenticated, oplyra_worker_exec;
insert into core.permissions(key,label) values
 ('media.read','Consultar mídia'),('media.connection.manage','Administrar conexões de mídia');
insert into core.role_permissions(role_key,permission_key) values
 ('owner','media.read'),('admin','media.read'),('marketing_manager','media.read'),('viewer','media.read'),
 ('owner','media.connection.manage'),('admin','media.connection.manage');

create table media.connections (
 tenant_id uuid not null references core.tenants(id) on delete cascade,
 platform text not null check(platform in ('googleAds','metaAds')),
 generation bigint not null default 1 check(generation between 1 and 9007199254740991),
 status text not null default 'disconnected' check(status in ('disconnected','awaiting_account_selection','connected','authorization_expired','no_access','unavailable')),
 pending_attempt uuid, auth_attempt uuid, selected_account uuid,
 discovery_revision bigint not null default 0, discovery_hash text,
 scopes jsonb not null default '[]' check(jsonb_typeof(scopes)='array'),
 last_attempt_at timestamptz, last_success_at timestamptz, published_job uuid,
 primary key(tenant_id,platform)
);
create table media.attempts (
 tenant_id uuid not null, platform text not null, id uuid not null, user_id uuid not null,
 state_hash text not null unique check(state_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz not null, consumed_at timestamptz,
 primary key(tenant_id,platform,id),
 foreign key(tenant_id,platform) references media.connections on delete cascade
);
create table media.credentials (
 tenant_id uuid not null, platform text not null, attempt_id uuid not null,
 envelope jsonb check(jsonb_typeof(envelope)='object' and pg_column_size(envelope)<=131072
   and envelope-array['versao','chaveId','nonce','tag','ciphertext']='{}'::jsonb and envelope->>'chaveId' ~ '^[A-Za-z0-9_-]{1,64}$'
   and envelope ?& array['versao','chaveId','nonce','tag','ciphertext'] and envelope->>'versao'='1'
   and envelope->>'nonce' ~ '^[A-Za-z0-9_-]{16}$' and envelope->>'tag' ~ '^[A-Za-z0-9_-]{22}$'
   and envelope->>'ciphertext' ~ '^[A-Za-z0-9_-]+$'),
 primary key(tenant_id,platform,attempt_id),
 foreign key(tenant_id,platform,attempt_id) references media.attempts on delete cascade
);
create table media.accounts (
 tenant_id uuid not null, platform text not null, id uuid not null default gen_random_uuid(),
 attempt_id uuid not null, active boolean not null default true, external_id text not null check(external_id ~ '^[0-9]{1,30}$'),
 name text not null check(length(name) between 1 and 8192), currency text not null check(currency ~ '^[A-Z]{3}$'),
 timezone text not null check(length(timezone) between 1 and 200),
 login_customer_id text check(login_customer_id is null or login_customer_id ~ '^[0-9]{1,30}$'),
 primary key(tenant_id,platform,id), unique(tenant_id,platform,attempt_id,external_id),
 foreign key(tenant_id,platform,attempt_id) references media.credentials on delete cascade
);
create table media.account_claims (
 platform text not null, external_id text not null, tenant_id uuid not null,
 primary key(platform,external_id),
 foreign key(tenant_id,platform) references media.connections on delete cascade
);
create table media.sync_jobs (
 tenant_id uuid not null, platform text not null, id uuid not null default gen_random_uuid(),
 generation bigint not null, account_id uuid not null, requested_by uuid not null,
 period_start date not null, period_end date not null check(period_end>period_start),
 currency text not null, timezone text not null,
 status text not null default 'queued' check(status in ('queued','running','complete','partial','failed')),
 phase text not null default 'campaigns' check(phase in ('campaigns','metrics','done')),
 cursor text, revision integer not null default 0, partial boolean not null default false,
 attempt integer not null default 0 check(attempt between 0 and 3),
 available_at timestamptz not null default now(), lease_token uuid, lease_until timestamptz,
 failure text check(failure in ('quota','authorization_expired','no_access','transient','invalid_response','cancelled')),
 created_at timestamptz not null default now(), last_attempt_at timestamptz, finished_at timestamptz,
 primary key(tenant_id,id),
 foreign key(tenant_id,platform,account_id) references media.accounts on delete cascade,
 check((status='running')=(lease_token is not null and lease_until is not null))
);
create unique index media_one_active_window on media.sync_jobs(tenant_id,platform,generation,period_start,period_end) where status in ('queued','running');
create index media_jobs_eligible on media.sync_jobs(tenant_id,available_at,created_at) where status='queued';
create table media.intents (
 tenant_id uuid not null references core.tenants on delete cascade, key text not null check(length(key) between 1 and 200),
 operation text not null, fingerprint text not null, result jsonb,
 primary key(tenant_id,key)
);
create table media.pages (
 tenant_id uuid not null, job_id uuid not null, page_key text not null, fingerprint text not null,
 primary key(tenant_id,job_id,page_key), foreign key(tenant_id,job_id) references media.sync_jobs on delete cascade
);
create table media.resources (
 tenant_id uuid not null, job_id uuid not null, external_id text not null check(external_id ~ '^[0-9]{1,30}$'),
 data jsonb not null check(jsonb_typeof(data)='object' and pg_column_size(data)<=262144),
 primary key(tenant_id,job_id,external_id), foreign key(tenant_id,job_id) references media.sync_jobs on delete cascade
);
create table media.campaign_links (
 tenant_id uuid not null, platform text not null, account_id uuid not null, external_id text not null,
 campaign_id uuid not null,
 primary key(tenant_id,platform,account_id,external_id),
 foreign key(tenant_id,platform,account_id) references media.accounts on delete cascade,
 foreign key(tenant_id,campaign_id) references strategy.campaigns(tenant_id,id) on delete cascade
);
-- RLS de defesa em profundidade; sem privilégios diretos de tabela para os papéis da aplicação.
do $$ declare n text; begin
 foreach n in array array['connections','attempts','credentials','accounts','account_claims','sync_jobs','intents','pages','resources','campaign_links'] loop
  execute format('alter table media.%I enable row level security',n);
  execute format('alter table media.%I force row level security',n);
  execute format('create policy tenant_scope on media.%I using (tenant_id=app.current_tenant() and app.tenant_is_authorized()) with check (tenant_id=app.current_tenant() and app.tenant_is_authorized())',n);
 end loop;
end $$;

-- Trava membership para serializar revogação/mudança de papel contra a transação em curso.
-- Licença do produto pelos planos existentes; sem criar capability, franquia ou limite por conexão.
create function app.media_authorize(p_tenant uuid,p_need text,p_user uuid default null) returns uuid
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare u uuid; r text; begin
 if p_tenant is null or p_tenant is distinct from app.current_tenant() then raise exception 'MEDIA_FORBIDDEN' using errcode='42501'; end if;
 if current_setting('role',true)='authenticated' then u:=app.current_user_id();
 elsif current_setting('role',true)='oplyra_worker_exec' and p_user is not null then u:=p_user;
 else raise exception 'MEDIA_FORBIDDEN' using errcode='42501'; end if;
 if u is null then raise exception 'MEDIA_FORBIDDEN' using errcode='42501'; end if;
 select m.role_key into r from core.memberships m where m.tenant_id=p_tenant and m.user_id=u and m.status='active' for share;
 if not found or not exists(select 1 from core.role_permissions where role_key=r and permission_key=p_need) then raise exception 'MEDIA_FORBIDDEN' using errcode='42501'; end if;
 perform 1 from core.tenants where id=p_tenant and status='active' and plan_key in ('performance','growth') for share;
 if not found then raise exception 'MEDIA_NOT_ENTITLED' using errcode='42501'; end if;
 return u;
end $$;
create function app.media_connection_json(c media.connections) returns jsonb
language sql stable set search_path=pg_catalog,pg_temp as $$
 select jsonb_build_object('plataforma',c.platform,'estado',case when c.status='disconnected' and exists(select 1 from media.attempts atp where atp.tenant_id=c.tenant_id and atp.platform=c.platform and atp.id=c.pending_attempt and atp.consumed_at is null and atp.expires_at>now()) then 'authorizing' else c.status end,'geracao',c.generation,'datasetVersion',c.published_job,'discoveryRevision',c.discovery_revision,
  'conta',case when a.id is null then null else jsonb_build_object('id',a.id,'nome',a.name,'moeda',a.currency,'fuso',a.timezone) end,
  'escopos',c.scopes,'ultimaTentativaEm',c.last_attempt_at,'ultimaSincronizacaoBemSucedidaEm',c.last_success_at)
 from (select 1) x left join media.accounts a on a.tenant_id=c.tenant_id and a.platform=c.platform and a.id=c.selected_account
$$;

-- Lista fechada de operações do serviço; não recebe URL, SQL, query GAQL ou credenciais em claro.
create function app.media_command(p_tenant uuid,p_operation text,p jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare u uuid; c media.connections; a media.attempts; acc media.accounts; j media.sync_jobs;
 v jsonb; old media.intents; fp text; k text; aid uuid; target_job uuid; plt text:=p->>'plataforma'; selected uuid; need text;
begin
 need:=case when p_operation in ('connections.list','campaigns.list','campaigns.get','metrics.list','sync.get','sync.latest') then 'media.read' else 'media.connection.manage' end;
 u:=app.media_authorize(p_tenant,need);
 if jsonb_typeof(p) is distinct from 'object' then raise exception 'MEDIA_INPUT' using errcode='22023'; end if;
 if p_operation='connections.list' then
  return (select coalesce(jsonb_agg(app.media_connection_json(x) order by x.platform),'[]') from media.connections x where x.tenant_id=p_tenant);
 end if;
 if p_operation='sync.get' then
  select * into j from media.sync_jobs where tenant_id=p_tenant and id=(p->>'id')::uuid;
  if not found then raise exception 'MEDIA_NOT_FOUND' using errcode='P0002'; end if;
  return to_jsonb(j)-array['lease_token','cursor','requested_by'];
 end if;
 if plt is null or plt not in ('googleAds','metaAds') then raise exception 'MEDIA_INPUT' using errcode='22023'; end if;
 -- Ordem de locks: membership → conexão → job. Mantém serialização de geração e credenciais.
 if need='media.connection.manage' then insert into media.connections(tenant_id,platform) values(p_tenant,plt) on conflict do nothing; end if;
 select * into c from media.connections where tenant_id=p_tenant and platform=plt for update;
 if p ? 'expectedGeneration' and c.generation is distinct from (p->>'expectedGeneration')::bigint then raise exception 'MEDIA_STALE' using errcode='55000'; end if;
 if p ? 'expectedDataset' and c.published_job is distinct from (p->>'expectedDataset')::uuid then raise exception 'MEDIA_STALE' using errcode='55000'; end if;
 if p ? 'expectedDiscovery' and c.discovery_revision is distinct from (p->>'expectedDiscovery')::bigint then raise exception 'MEDIA_STALE' using errcode='55000'; end if;
 if p_operation='sync.latest' then
  select * into j from media.sync_jobs where tenant_id=p_tenant and platform=plt and account_id=coalesce(c.selected_account,(select account_id from media.sync_jobs where tenant_id=p_tenant and id=c.published_job)) and period_start=(p->>'inicio')::date and period_end=(p->>'fimExclusivo')::date order by created_at desc limit 1;
  if not found then return null; end if;return to_jsonb(j)-array['lease_token','cursor','requested_by'];
 end if;
 if p_operation='attempt.create' then
  aid:=(p->>'tentativaId')::uuid;
  insert into media.intents(tenant_id,key,operation,fingerprint) values(p_tenant,coalesce(p->>'idempotencyKey',aid::text),'oauth.start',encode(sha256(convert_to(plt||u::text,'UTF8')),'hex')) on conflict do nothing;
  if not found then return 'false'; end if;
  if (p->>'expiraEm')::timestamptz<=clock_timestamp() or (p->>'expiraEm')::timestamptz>clock_timestamp()+interval '10 minutes' then raise exception 'MEDIA_INPUT' using errcode='22023'; end if;
  insert into media.attempts(tenant_id,platform,id,user_id,state_hash,expires_at) values(p_tenant,plt,aid,u,p->>'stateHash',(p->>'expiraEm')::timestamptz) on conflict do nothing;
  if not found then return 'false'; end if;
  update media.connections set pending_attempt=aid where tenant_id=p_tenant and platform=plt;
  return 'true';
 elsif p_operation='attempt.consume' then
  update media.attempts set consumed_at=clock_timestamp() where tenant_id=p_tenant and platform=plt and id=(p->>'tentativaId')::uuid
   and id=c.pending_attempt and user_id=u and state_hash=p->>'stateHash' and consumed_at is null and expires_at>clock_timestamp();
  return to_jsonb(found);
 elsif p_operation='authorization.save' then
  select * into a from media.attempts where tenant_id=p_tenant and platform=plt and id=(p->>'tentativaId')::uuid;
  if not found or a.user_id<>u or a.id is distinct from c.pending_attempt or a.consumed_at is null or a.expires_at<=clock_timestamp() then return 'false'; end if;
  if p->'envelope' is null or jsonb_typeof(p->'envelope') is distinct from 'object' then raise exception 'MEDIA_INPUT' using errcode='22023'; end if;
  insert into media.credentials values(p_tenant,plt,a.id,p->'envelope') on conflict do nothing;
  if not found then return 'false'; end if;
  update media.connections set generation=generation+1,status='awaiting_account_selection',auth_attempt=a.id,pending_attempt=null,
   selected_account=null,scopes=case when plt='googleAds' then '["https://www.googleapis.com/auth/adwords"]'::jsonb else '["ads_read"]'::jsonb end where tenant_id=p_tenant and platform=plt;
  update media.sync_jobs set status='failed',failure='cancelled',lease_token=null,lease_until=null,finished_at=now()
   where tenant_id=p_tenant and platform=plt and status in ('queued','running');
  insert into core.audit_log(tenant_id,actor_type,actor_id,action,target) values(p_tenant,'user',u,'media.authorization.completed',plt);
  return 'true';
 elsif p_operation='attempt.lookup' then
  select jsonb_build_object('tentativaId',id,'usuarioId',user_id) into v from media.attempts where tenant_id=p_tenant and platform=plt and id=c.pending_attempt and user_id=u and state_hash=p->>'stateHash' and expires_at>clock_timestamp() and consumed_at is null;
  return v;
 elsif p_operation='credential.refresh' then
  if c.auth_attempt is distinct from (p->>'tentativaId')::uuid or c.generation is distinct from (p->>'geracao')::bigint or c.status='disconnected' or p->'envelope' is null then return 'false'; end if;
  update media.credentials set envelope=p->'envelope' where tenant_id=p_tenant and platform=plt and attempt_id=c.auth_attempt and envelope=p->'anterior';
  return to_jsonb(found);
 elsif p_operation='credential.get' then
  if c.auth_attempt is null or c.status='disconnected' then raise exception 'MEDIA_NOT_FOUND' using errcode='P0002'; end if;
  select jsonb_build_object('tentativaId',ta.id,'usuarioId',ta.user_id,'geracao',c.generation,'datasetVersion',c.published_job,'discoveryRevision',c.discovery_revision,'envelope',e.envelope) into v
   from media.credentials e join media.attempts ta on (ta.tenant_id,ta.platform,ta.id)=(e.tenant_id,e.platform,e.attempt_id)
   where e.tenant_id=p_tenant and e.platform=plt and e.attempt_id=c.auth_attempt;
  return v;
 elsif p_operation='accounts.save' then
  select * into acc from media.accounts where tenant_id=p_tenant and platform=plt and id=c.selected_account;
  if c.auth_attempt is null or c.auth_attempt is distinct from (p->>'tentativaId')::uuid or c.generation is distinct from (p->>'geracao')::bigint or c.status='disconnected' then raise exception 'MEDIA_STALE' using errcode='55000'; end if;
  if jsonb_typeof(p->'contas') is distinct from 'array' then raise exception 'MEDIA_INPUT' using errcode='22023'; end if;
  fp:=encode(sha256(convert_to(coalesce((select jsonb_agg(value order by value->>'id')::text from jsonb_array_elements(p->'contas')),'[]'),'UTF8')),'hex');
  update media.accounts set active=false where tenant_id=p_tenant and platform=plt and attempt_id=c.auth_attempt;
  for v in select value from jsonb_array_elements(p->'contas') loop
   if not exists(select 1 from pg_timezone_names where name=v->>'fuso') then raise exception 'MEDIA_INPUT' using errcode='22023'; end if;
   insert into media.accounts(tenant_id,platform,attempt_id,external_id,name,currency,timezone,login_customer_id)
    values(p_tenant,plt,c.auth_attempt,v->>'id',v->>'nome',v->>'moeda',v->>'fuso',v->>'gerenteId')
    on conflict(tenant_id,platform,attempt_id,external_id) do update set active=true,name=excluded.name,currency=excluded.currency,timezone=excluded.timezone,login_customer_id=excluded.login_customer_id;
  end loop;
  if acc.id is not null and exists(select 1 from media.accounts x where x.tenant_id=p_tenant and x.platform=plt and x.id=acc.id and (not x.active or x.currency<>acc.currency or x.timezone<>acc.timezone or x.login_customer_id is distinct from acc.login_customer_id)) then
   update media.connections set generation=generation+1,status=case when exists(select 1 from media.accounts where tenant_id=p_tenant and platform=plt and id=acc.id and active) then status else 'no_access' end where tenant_id=p_tenant and platform=plt;
   update media.sync_jobs set status='failed',failure='cancelled',lease_token=null,lease_until=null,finished_at=now() where tenant_id=p_tenant and platform=plt and status in ('queued','running');
  end if;
  if c.discovery_hash is distinct from fp then update media.connections set discovery_revision=discovery_revision+1,discovery_hash=fp where tenant_id=p_tenant and platform=plt; end if;
  return 'true';
 elsif p_operation='accounts.list' then
  return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'nome',name,'moeda',currency,'fuso',timezone) order by id),'[]') from (select * from media.accounts
   where tenant_id=p_tenant and platform=plt and attempt_id=c.auth_attempt and active and (p->>'afterId' is null or id::text>p->>'afterId') order by id limit 101) listed);
 end if;
 -- Mutations humanas com chave e fingerprint persistidos, incluindo replay após troca de estado.
 if p_operation in ('account.select','disconnect','sync.request','campaign.link') then
  k:=p->>'idempotencyKey'; fp:=encode(sha256(convert_to((p-'idempotencyKey')::text,'UTF8')),'hex');
  if k is null or length(k) not between 1 and 200 then raise exception 'MEDIA_INPUT' using errcode='22023'; end if;
  insert into media.intents(tenant_id,key,operation,fingerprint) values(p_tenant,k,p_operation,fp) on conflict do nothing;
  select * into old from media.intents where tenant_id=p_tenant and key=k for update;
  if old.operation<>p_operation or old.fingerprint<>fp then raise exception 'MEDIA_IDEMPOTENCY_CONFLICT' using errcode='23505'; end if;
  if old.result is not null then return old.result; end if;
 end if;
 if p_operation='account.select' then
  select * into acc from media.accounts where tenant_id=p_tenant and platform=plt and id=(p->>'contaId')::uuid and attempt_id=c.auth_attempt and active;
  if not found or c.status='disconnected' then raise exception 'MEDIA_NOT_FOUND' using errcode='P0002'; end if;
  insert into media.account_claims values(plt,acc.external_id,p_tenant) on conflict do nothing;
  if not exists(select 1 from media.account_claims where platform=plt and external_id=acc.external_id and tenant_id=p_tenant) then raise exception 'MEDIA_ACCOUNT_UNAVAILABLE' using errcode='23505'; end if;
  if c.selected_account is distinct from acc.id or c.status<>'connected' then
   update media.connections set generation=generation+1,selected_account=acc.id,status='connected',published_job=null,last_success_at=null where tenant_id=p_tenant and platform=plt returning * into c;
   update media.sync_jobs set status='failed',failure='cancelled',lease_token=null,lease_until=null,finished_at=now() where tenant_id=p_tenant and platform=plt and status in ('queued','running');
  end if;
  v:=app.media_connection_json(c);
 elsif p_operation='disconnect' then
  update media.connections set generation=generation+1,status='disconnected',selected_account=null,auth_attempt=null,pending_attempt=null,scopes='[]'
   where tenant_id=p_tenant and platform=plt returning * into c;
  update media.sync_jobs set status='failed',failure='cancelled',lease_token=null,lease_until=null,finished_at=now() where tenant_id=p_tenant and platform=plt and status in ('queued','running');
  -- Destrói somente o ciphertext, preservando contas e históricos referenciados.
  update media.credentials set envelope=null where tenant_id=p_tenant and platform=plt;
  v:=app.media_connection_json(c);
 elsif p_operation='sync.request' then
  if c.status<>'connected' then raise exception 'MEDIA_STALE' using errcode='55000'; end if;
  select * into acc from media.accounts where tenant_id=p_tenant and platform=plt and id=c.selected_account;
  insert into media.sync_jobs(tenant_id,platform,generation,account_id,requested_by,period_start,period_end,currency,timezone)
   values(p_tenant,plt,c.generation,acc.id,u,(p->>'inicio')::date,(p->>'fimExclusivo')::date,acc.currency,acc.timezone)
   on conflict(tenant_id,platform,generation,period_start,period_end) where status in ('queued','running') do nothing returning * into j;
  if not found then select * into j from media.sync_jobs where tenant_id=p_tenant and platform=plt and generation=c.generation and period_start=(p->>'inicio')::date and period_end=(p->>'fimExclusivo')::date and status in ('queued','running'); end if;
  v:=to_jsonb(j)-array['lease_token','cursor','requested_by'];
 elsif p_operation='campaign.link' then
  if c.selected_account is null or not exists(select 1 from media.resources where tenant_id=p_tenant and job_id=c.published_job and external_id=p->>'campanhaId') then raise exception 'MEDIA_NOT_FOUND' using errcode='P0002'; end if;
  if p->>'campanhaOplyraId' is null then
   delete from media.campaign_links where tenant_id=p_tenant and platform=plt and account_id=c.selected_account and external_id=p->>'campanhaId';
  else
   insert into media.campaign_links values(p_tenant,plt,c.selected_account,p->>'campanhaId',(p->>'campanhaOplyraId')::uuid)
    on conflict(tenant_id,platform,account_id,external_id) do update set campaign_id=excluded.campaign_id;
  end if;
  v:='true';
 elsif p_operation in ('campaigns.list','campaigns.get','metrics.list') then
  -- Apenas snapshot completo; filtros de período selecionam o snapshot correspondente, nunca outro período.
  target_job:=c.published_job;
  if p_operation='metrics.list' then
   select sj.id into target_job from media.sync_jobs sj where sj.tenant_id=p_tenant and sj.platform=plt and sj.status='complete'
    and sj.account_id=coalesce(c.selected_account,(select account_id from media.sync_jobs where tenant_id=p_tenant and id=c.published_job))
    and sj.period_start=(p->>'inicio')::date and sj.period_end=(p->>'fimExclusivo')::date order by sj.finished_at desc limit 1;
  end if;
  return (select coalesce(jsonb_agg(r.data||jsonb_build_object('id',r.external_id,'campanhaOplyraId',l.campaign_id)||case when p_operation='metrics.list' then jsonb_build_object('dadosAntigos',c.status<>'connected' or exists(select 1 from media.sync_jobs origin_job where origin_job.tenant_id=p_tenant and origin_job.id=r.job_id and origin_job.generation<>c.generation)) else '{}'::jsonb end order by r.external_id),'[]') from (select * from media.resources r
   where r.tenant_id=p_tenant and r.job_id=target_job and (p->>'campanhaId' is null or r.external_id=p->>'campanhaId')
    and (p->>'afterId' is null or r.external_id>p->>'afterId')
     order by r.external_id limit 101) r
   left join media.campaign_links l on l.tenant_id=p_tenant and l.platform=plt and l.account_id=c.selected_account and l.external_id=r.external_id);
 else raise exception 'MEDIA_OPERATION' using errcode='22023'; end if;
 update media.intents set result=v where tenant_id=p_tenant and key=k;
 insert into core.audit_log(tenant_id,actor_type,actor_id,action,target,correlation_id,after) values(p_tenant,'user',u,'media.'||p_operation,case when p_operation='sync.request' then j.id::text else plt end,case when p_operation='sync.request' then j.id else gen_random_uuid() end,jsonb_build_object('generation',c.generation));
 return v;
end $$;

create function app.media_worker(p_tenant uuid,p_operation text,p jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare j media.sync_jobs; c media.connections; a media.accounts; v jsonb; fp text; seen media.pages; nxt text;
begin
 if current_setting('role',true) is distinct from 'oplyra_worker_exec' or p_tenant is distinct from app.current_tenant() or p_tenant is null then raise exception 'MEDIA_FORBIDDEN' using errcode='42501'; end if;
 if p_operation='claim' then
  select * into j from media.sync_jobs where tenant_id=p_tenant and
   ((status='queued' and available_at<=clock_timestamp()) or (status='running' and lease_until<=clock_timestamp()))
   order by created_at limit 1;
  if not found then return null; end if;
  begin perform app.media_authorize(p_tenant,'media.connection.manage',j.requested_by);
  exception when insufficient_privilege then
   update media.sync_jobs set status='failed',failure='no_access',lease_token=null,lease_until=null,finished_at=now() where tenant_id=p_tenant and id=j.id; return null;
  end;
  select * into c from media.connections where tenant_id=p_tenant and platform=j.platform for update skip locked;
  if not found then return null; end if;
  select * into j from media.sync_jobs where tenant_id=p_tenant and id=j.id and
   ((status='queued' and available_at<=clock_timestamp()) or (status='running' and lease_until<=clock_timestamp())) for update skip locked;
  if not found then return null; end if;
  if j.attempt>=3 or c.generation<>j.generation or c.status<>'connected' or c.selected_account<>j.account_id then
   update media.sync_jobs set status='failed',failure=case when j.attempt>=3 then 'transient' else 'cancelled' end,lease_token=null,lease_until=null,finished_at=now() where tenant_id=p_tenant and id=j.id; return null;
  end if;
  update media.sync_jobs set status='running',attempt=attempt+1,lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '30 seconds',last_attempt_at=now()
   where tenant_id=p_tenant and id=j.id returning * into j;
  update media.connections set last_attempt_at=now() where tenant_id=p_tenant and platform=j.platform;
 else
  select * into j from media.sync_jobs where tenant_id=p_tenant and id=(p->>'id')::uuid;
  if not found then raise exception 'MEDIA_NOT_FOUND' using errcode='P0002'; end if;
  perform app.media_authorize(p_tenant,'media.connection.manage',j.requested_by);
  select * into c from media.connections where tenant_id=p_tenant and platform=j.platform for update;
  select * into j from media.sync_jobs where tenant_id=p_tenant and id=j.id for update;
  if c.generation<>j.generation or c.status<>'connected' or c.selected_account<>j.account_id or j.status<>'running' or j.lease_token is distinct from (p->>'leaseToken')::uuid or j.lease_until<=clock_timestamp() then raise exception 'MEDIA_STALE' using errcode='55000'; end if;
  if p_operation='credential.refresh' then
   if p->'envelope' is null then raise exception 'MEDIA_INPUT' using errcode='22023'; end if;
   update media.credentials set envelope=p->'envelope' where tenant_id=p_tenant and platform=j.platform and attempt_id=c.auth_attempt and envelope=p->'anterior';
   if not found then raise exception 'MEDIA_STALE' using errcode='55000'; end if;
  elsif p_operation='commit' then
   fp:=encode(sha256(convert_to((p-'leaseToken')::text,'UTF8')),'hex');
   select * into seen from media.pages where tenant_id=p_tenant and job_id=j.id and page_key=p->>'pageKey';
   if found then
    if seen.fingerprint<>fp then raise exception 'MEDIA_PAGE_CONFLICT' using errcode='23505'; end if;
    return to_jsonb(j);
   end if;
   if j.revision is distinct from (p->>'revision')::integer then raise exception 'MEDIA_STALE' using errcode='55000'; end if;
   nxt:=p->>'nextCursor';
   if nxt is not null and (nxt=j.cursor or exists(select 1 from media.pages where tenant_id=p_tenant and job_id=j.id and page_key=j.phase||':'||nxt)) then raise exception 'MEDIA_CURSOR_CYCLE' using errcode='22023'; end if;
   if jsonb_typeof(p->'resources') is distinct from 'array' then raise exception 'MEDIA_INPUT' using errcode='22023'; end if;
   if (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(p->'resources')) then raise exception 'MEDIA_INPUT' using errcode='22023'; end if;
   if p->>'pageKey' is distinct from j.phase||':'||coalesce(j.cursor,'') then raise exception 'MEDIA_PAGE_CONFLICT' using errcode='23505'; end if;
   for v in select value from jsonb_array_elements(p->'resources') loop
    if not (v ?& array['id','data']) or jsonb_typeof(v->'data') is distinct from 'object' then raise exception 'MEDIA_INPUT' using errcode='22023'; end if;
    if j.phase='metrics' and not exists(select 1 from media.resources where tenant_id=p_tenant and job_id=j.id and external_id=v->>'id') then update media.sync_jobs set partial=true where tenant_id=p_tenant and id=j.id; end if;
    insert into media.resources values(p_tenant,j.id,v->>'id',v->'data')
     on conflict(tenant_id,job_id,external_id) do update set data=media.resources.data||excluded.data;
   end loop;
   insert into media.pages values(p_tenant,j.id,p->>'pageKey',fp);
   update media.sync_jobs set cursor=nxt,revision=revision+1,partial=partial or coalesce((p->>'partial')::boolean,false),
    phase=case when nxt is null then case when phase='campaigns' then 'metrics' else 'done' end else phase end,
    lease_until=clock_timestamp()+interval '30 seconds' where tenant_id=p_tenant and id=j.id returning * into j;
   if j.phase='done' then
    update media.sync_jobs set status=case when partial then 'partial' else 'complete' end,lease_token=null,lease_until=null,finished_at=now() where tenant_id=p_tenant and id=j.id returning * into j;
    if not j.partial then update media.connections set published_job=j.id,last_success_at=now() where tenant_id=p_tenant and platform=j.platform; end if;
   end if;
  elsif p_operation='fail' then
   if p->>'motivo' is null or p->>'motivo' not in ('quota','authorization_expired','no_access','transient','invalid_response') then raise exception 'MEDIA_INPUT' using errcode='22023'; end if;
   update media.sync_jobs set status=case when attempt<3 and p->>'motivo' in ('quota','transient') then 'queued' else 'failed' end,
    available_at=clock_timestamp()+make_interval(secs=>least(900,30*attempt)),failure=p->>'motivo',lease_token=null,lease_until=null,
    finished_at=case when attempt<3 and p->>'motivo' in ('quota','transient') then null else now() end where tenant_id=p_tenant and id=j.id returning * into j;
   if p->>'motivo' in ('authorization_expired','no_access') then update media.connections set status=p->>'motivo' where tenant_id=p_tenant and platform=j.platform; end if;
  else raise exception 'MEDIA_OPERATION' using errcode='22023'; end if;
 end if;
 insert into core.audit_log(tenant_id,actor_type,action,target,correlation_id,after) values(p_tenant,'worker','media.sync.'||case when p_operation='claim' then 'claimed' when p_operation='credential.refresh' then 'credential_refreshed' when p_operation='fail' then case when j.status='queued' then 'retry_scheduled' else 'failed' end when j.status in ('complete','partial') then j.status else 'page_committed' end,j.id::text,j.id,jsonb_build_object('generation',j.generation,'attempt',j.attempt,'revision',j.revision,'status',j.status,'failure',j.failure));
 select * into a from media.accounts where tenant_id=p_tenant and platform=j.platform and id=j.account_id;
 return to_jsonb(j)||jsonb_build_object('externalAccountId',a.external_id,'loginCustomerId',a.login_customer_id,'authorization',(
  select jsonb_build_object('tentativaId',t.id,'usuarioId',t.user_id,'envelope',e.envelope) from media.credentials e join media.attempts t
   on (t.tenant_id,t.platform,t.id)=(e.tenant_id,e.platform,e.attempt_id)
   where e.tenant_id=p_tenant and e.platform=j.platform and e.attempt_id=c.auth_attempt));
end $$;

revoke all on function app.media_authorize(uuid,text,uuid),app.media_connection_json(media.connections),app.media_command(uuid,text,jsonb),app.media_worker(uuid,text,jsonb) from public;
grant execute on function app.media_command(uuid,text,jsonb) to authenticated;
grant execute on function app.media_worker(uuid,text,jsonb) to oplyra_worker_exec;
