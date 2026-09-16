-- I-01 — montagem do contexto de acesso.
-- O resolver não pode ler core.memberships sob RLS, porque a política exige
-- empresa ativa e é exatamente ela que ainda está sendo resolvida.
-- Escopo mínimo: devolve apenas o vínculo de quem chamou, na empresa pedida.
create or replace function core.resolve_access_context(p_tenant uuid)
returns table (membership_id uuid, role_key text, permissions text[])
language sql stable security definer set search_path = core, app, pg_temp as $$
  select m.id, m.role_key, array_agg(rp.permission_key order by rp.permission_key)
    from core.memberships m
    join core.role_permissions rp on rp.role_key = m.role_key
   where m.user_id = app.current_user_id()
     and m.tenant_id = p_tenant
     and m.status = 'active'
   group by m.id, m.role_key
$$;
revoke all on function core.resolve_access_context(uuid) from public;
grant execute on function core.resolve_access_context(uuid) to authenticated;
