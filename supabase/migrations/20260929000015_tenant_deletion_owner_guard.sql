-- CR-028 — guarda do último Owner compatível com a exclusão da empresa (B-3)
-- e proteções de exclusão do FinOps sem pg_trigger_depth() (D-18).
--
-- Regra única: uma exclusão só é tratada como cascata autorizada quando
-- core.tenants já não contém o tenant da própria linha avaliada. Nenhum pai
-- intermediário, profundidade de trigger ou visibilidade sob RLS participa da
-- decisão: as funções rodam como dono (postgres) para enxergar as linhas reais.
-- As migrations 000001–000014 não são editadas.

-- ------------------------------------------------ guarda do último Owner
create or replace function app.tenant_owner_guard() returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_tenant uuid := coalesce(old.tenant_id, new.tenant_id);
  v_owners integer;
begin
  -- Empresa já removida nesta transação: é a cascata real de core.tenants.
  if not exists (select 1 from core.tenants t where t.id = v_tenant) then
    return null;
  end if;
  select pg_catalog.count(*) into v_owners
    from core.memberships m
   where m.tenant_id = v_tenant and m.role_key = 'owner' and m.status = 'active';
  if v_owners = 0 then
    raise exception 'a empresa ficaria sem Owner ativo'
      using errcode = 'check_violation', hint = 'promova outra pessoa a Owner antes';
  end if;
  return null;
end
$$;

alter function app.tenant_owner_guard() owner to postgres;

drop trigger memberships_preserva_owner on core.memberships;
create constraint trigger memberships_preserva_owner
  after update or delete on core.memberships
  deferrable initially immediate
  for each row execute function app.tenant_owner_guard();

-- Nenhum trigger referencia mais a função antiga; drop sem cascade falha se referenciada.
drop function app.ensure_tenant_keeps_owner();

-- ------------------------------------------------ FinOps (D-18)
create or replace function finops.forbid_record_mutation() returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  -- Única prova de cascata autorizada: a empresa da própria linha já não existe.
  if tg_op = 'DELETE' and not exists (select 1 from core.tenants t where t.id = old.tenant_id) then
    return old;
  end if;
  raise exception 'model_call_records é imutável' using errcode = 'check_violation';
end
$$;

create or replace function finops.forbid_entry_mutation() returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from core.tenants t where t.id = old.tenant_id) then
    return old;
  end if;
  raise exception 'cost_ledger_entries é append-only' using errcode = 'check_violation';
end
$$;

create or replace function finops.forbid_direct_delete() returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if not exists (select 1 from core.tenants t where t.id = old.tenant_id) then
    return old;
  end if;
  raise exception '% só é removido pela exclusão do tenant', tg_table_name using errcode = 'check_violation';
end
$$;

alter function finops.forbid_record_mutation() owner to postgres;
alter function finops.forbid_entry_mutation() owner to postgres;
alter function finops.forbid_direct_delete() owner to postgres;

-- ------------------------------------------------ privilégios
-- Funções de trigger não precisam de EXECUTE de quem dispara a operação.
do $$
declare
  v_fn text;
  v_role text;
begin
  foreach v_fn in array array[
    'app.tenant_owner_guard()', 'finops.forbid_record_mutation()',
    'finops.forbid_entry_mutation()', 'finops.forbid_direct_delete()'
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

comment on function app.tenant_owner_guard() is
  'CR-028: impede zero Owners ativos enquanto core.tenants contiver a empresa; permite a cascata real da exclusão da empresa.';
comment on function finops.forbid_direct_delete() is
  'CR-028 (D-18): delete só quando core.tenants já não contém old.tenant_id; sem pg_trigger_depth().';
