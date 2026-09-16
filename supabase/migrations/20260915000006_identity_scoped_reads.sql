-- I-01 — operações que acontecem ANTES de existir empresa ativa.
-- Listar as próprias empresas e aceitar um convite não podem exigir
-- app.current_tenant(), porque é justamente isso que ainda não existe.
-- As duas funções derivam a identidade da claim verificada, nunca de parâmetro,
-- e têm escopo mínimo: devolvem apenas o que pertence a quem chamou.

create or replace function core.my_tenants()
returns table (tenant_id uuid, name text, role_key text)
language sql stable security definer set search_path = core, app, pg_temp as $$
  select t.id, t.name, m.role_key
    from core.memberships m
    join core.tenants t on t.id = m.tenant_id
   where m.user_id = app.current_user_id()
     and m.status = 'active'
   order by t.name
$$;
revoke all on function core.my_tenants() from public;
grant execute on function core.my_tenants() to authenticated;

-- Substitui a versão que recebia o user_id por parâmetro: agora ele vem da
-- claim verificada, para que ninguém aceite convite em nome de outra pessoa.
drop function if exists core.accept_invitation(text, uuid, text);

create or replace function core.accept_invitation(p_token_hash text, p_email text)
returns table (tenant_id uuid, membership_id uuid)
language plpgsql security definer set search_path = core, app, pg_temp as $$
declare inv core.invitations; new_id uuid; quem uuid;
begin
  quem := app.current_user_id();
  if quem is null then raise exception 'sem identidade verificada' using errcode = 'invalid_authorization_specification'; end if;

  select * into inv from core.invitations i
   where i.token_hash = p_token_hash and i.status = 'pending'
   for update;

  if not found then raise exception 'convite inexistente ou já utilizado' using errcode = 'no_data_found'; end if;
  if inv.expires_at <= now() then raise exception 'convite expirado' using errcode = 'check_violation'; end if;
  if lower(inv.email) <> lower(p_email) then raise exception 'convite emitido para outro e-mail' using errcode = 'check_violation'; end if;
  if exists (select 1 from core.memberships m
              where m.tenant_id = inv.tenant_id and m.user_id = quem and m.status = 'active') then
    raise exception 'já existe vínculo ativo' using errcode = 'unique_violation';
  end if;

  insert into core.memberships (tenant_id, user_id, role_key)
    values (inv.tenant_id, quem, inv.role_key) returning id into new_id;

  update core.invitations set status = 'accepted', accepted_by = quem, accepted_at = now()
   where invitations.tenant_id = inv.tenant_id and invitations.id = inv.id;

  insert into core.audit_log (tenant_id, actor_type, actor_id, action, target, after, reason)
    values (inv.tenant_id, 'user', quem, 'membership.accept_invitation',
            new_id::text, jsonb_build_object('role_key', inv.role_key), 'aceite de convite');

  return query select inv.tenant_id, new_id;
end
$$;
revoke all on function core.accept_invitation(text, text) from public;
grant execute on function core.accept_invitation(text, text) to authenticated;
