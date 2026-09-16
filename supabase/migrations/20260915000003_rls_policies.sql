-- I-01 — RLS habilitada e forçada, com a forma validada pelo EXP-01:
--   tenant_id = app.current_tenant()  E  (select app.tenant_is_authorized())
-- A igualdade é indexável pela PK (tenant_id, id); a autorização vira InitPlan,
-- avaliada uma vez por consulta e não por linha.

-- Papel do operador da plataforma: menor privilégio, separado de migrations.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'oplyra_ops_login') then
    create role oplyra_ops_login login noinherit nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'oplyra_ops_exec') then
    create role oplyra_ops_exec nologin nobypassrls;
  end if;
end
$$;
grant oplyra_ops_exec to oplyra_ops_login;
grant usage on schema app, core to oplyra_ops_exec;
grant execute on function app.current_user_id(), app.current_tenant(), app.is_worker(),
  app.has_active_membership(uuid), app.tenant_is_authorized(), app.has_permission(text) to oplyra_ops_exec;

create or replace function app.is_operator() returns boolean
language sql stable as $$ select current_user = 'oplyra_ops_exec' $$;
grant execute on function app.is_operator() to authenticated, oplyra_worker_exec, oplyra_ops_exec;

alter table core.tenants             enable row level security;
alter table core.tenants             force  row level security;
alter table core.memberships         enable row level security;
alter table core.memberships         force  row level security;
alter table core.invitations         enable row level security;
alter table core.invitations         force  row level security;
alter table core.audit_log           enable row level security;
alter table core.audit_log           force  row level security;
alter table core.tenant_entitlements enable row level security;
alter table core.tenant_entitlements force  row level security;

-- ------------------------------------------------------------------ tenants
create policy tenants_select on core.tenants for select
  using (id = app.current_tenant() and (select app.tenant_is_authorized()));
create policy tenants_insert on core.tenants for insert
  with check ((select app.is_operator()));
create policy tenants_update on core.tenants for update
  using ((select app.is_operator())) with check ((select app.is_operator()));

-- -------------------------------------------------------------- memberships
create policy memberships_select on core.memberships for select
  using (tenant_id = app.current_tenant() and (select app.tenant_is_authorized())
         and (select app.has_permission('member.read')));
create policy memberships_insert on core.memberships for insert
  with check ((select app.is_operator())
              or (tenant_id = app.current_tenant() and (select app.has_permission('member.invite'))));
-- Alterar papel e revogar vínculo compartilham a política; o caso de uso
-- distingue qual permissão exige. A RLS é defesa em profundidade, não o único controle.
create policy memberships_update on core.memberships for update
  using ((select app.is_operator())
         or (tenant_id = app.current_tenant()
             and ((select app.has_permission('member.role.change')) or (select app.has_permission('member.remove')))))
  with check ((select app.is_operator())
         or (tenant_id = app.current_tenant()
             and ((select app.has_permission('member.role.change')) or (select app.has_permission('member.remove')))));

-- -------------------------------------------------------------- invitations
create policy invitations_select on core.invitations for select
  using (tenant_id = app.current_tenant() and (select app.tenant_is_authorized())
         and (select app.has_permission('member.read')));
create policy invitations_insert on core.invitations for insert
  with check (tenant_id = app.current_tenant() and (select app.has_permission('member.invite')));
create policy invitations_update on core.invitations for update
  using (tenant_id = app.current_tenant() and (select app.has_permission('member.invite')))
  with check (tenant_id = app.current_tenant() and (select app.has_permission('member.invite')));

-- ---------------------------------------------------------------- audit_log
-- Somente leitura e inserção. Sem política de update/delete: negado a todos.
create policy audit_select on core.audit_log for select
  using (tenant_id = app.current_tenant() and (select app.tenant_is_authorized())
         and (select app.has_permission('tenant.read')));
create policy audit_insert on core.audit_log for insert
  with check ((select app.is_operator())
              or (tenant_id = app.current_tenant() and (select app.tenant_is_authorized())));

-- ------------------------------------------------------------- entitlements
create policy entitlements_select on core.tenant_entitlements for select
  using (tenant_id = app.current_tenant() and (select app.tenant_is_authorized())
         and (select app.has_permission('entitlement.read')));
create policy entitlements_write on core.tenant_entitlements for all
  using ((select app.is_operator())) with check ((select app.is_operator()));

-- ------------------------------------------------------------- privilégios
-- Papéis de LOGIN continuam sem nada: quem recebe é o papel de execução.
grant select                         on core.tenants             to authenticated, oplyra_worker_exec;
grant select, insert, update         on core.memberships         to authenticated;
grant select                         on core.memberships         to oplyra_worker_exec;
grant select, insert, update         on core.invitations         to authenticated;
grant select, insert                 on core.audit_log           to authenticated, oplyra_worker_exec;
grant select                         on core.tenant_entitlements to authenticated, oplyra_worker_exec;
grant select, insert, update         on core.tenants, core.memberships, core.invitations,
                                        core.tenant_entitlements to oplyra_ops_exec;
grant select, insert                 on core.audit_log           to oplyra_ops_exec;

-- ------------------------------------------------- aceite de convite
-- O token é a autorização: quem aceita ainda não tem vínculo, então o insert
-- não pode depender de permissão por vínculo. Função de escopo mínimo:
-- só age sobre o convite cujo hash foi apresentado, e só se estiver válido.
create or replace function core.accept_invitation(p_token_hash text, p_user_id uuid, p_email text)
returns table (tenant_id uuid, membership_id uuid)
language plpgsql security definer set search_path = core, app, pg_temp as $$
declare inv core.invitations; new_id uuid;
begin
  select * into inv from core.invitations i
   where i.token_hash = p_token_hash and i.status = 'pending'
   for update;

  if not found then raise exception 'convite inexistente ou já utilizado' using errcode = 'no_data_found'; end if;
  if inv.expires_at <= now() then raise exception 'convite expirado' using errcode = 'check_violation'; end if;
  if lower(inv.email) <> lower(p_email) then raise exception 'convite emitido para outro e-mail' using errcode = 'check_violation'; end if;
  if exists (select 1 from core.memberships m
              where m.tenant_id = inv.tenant_id and m.user_id = p_user_id and m.status = 'active') then
    raise exception 'já existe vínculo ativo' using errcode = 'unique_violation';
  end if;

  insert into core.memberships (tenant_id, user_id, role_key)
    values (inv.tenant_id, p_user_id, inv.role_key)
    returning id into new_id;

  update core.invitations set status = 'accepted', accepted_by = p_user_id, accepted_at = now()
   where invitations.tenant_id = inv.tenant_id and invitations.id = inv.id;

  insert into core.audit_log (tenant_id, actor_type, actor_id, action, target, after, reason)
    values (inv.tenant_id, 'user', p_user_id, 'membership.accept_invitation',
            new_id::text, jsonb_build_object('role_key', inv.role_key), 'aceite de convite');

  return query select inv.tenant_id, new_id;
end
$$;
revoke all on function core.accept_invitation(text, uuid, text) from public;
grant execute on function core.accept_invitation(text, uuid, text) to authenticated;
