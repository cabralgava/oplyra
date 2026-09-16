-- I-01 — invariante I-MEM no banco: uma empresa nunca fica sem Owner ativo.
-- A regra também existe no caso de uso; aqui ela é defesa em profundidade,
-- válida inclusive para o operador da plataforma e para migrations de dados.
create or replace function app.ensure_tenant_keeps_owner() returns trigger
language plpgsql as $$
declare restantes int;
begin
  select count(*) into restantes
    from core.memberships m
   where m.tenant_id = coalesce(old.tenant_id, new.tenant_id)
     and m.role_key = 'owner' and m.status = 'active';

  if restantes = 0 then
    raise exception 'a empresa ficaria sem Owner ativo'
      using errcode = 'check_violation', hint = 'promova outra pessoa a Owner antes';
  end if;
  return null;
end
$$;

create constraint trigger memberships_preserva_owner
  after update or delete on core.memberships
  deferrable initially immediate
  for each row execute function app.ensure_tenant_keeps_owner();
