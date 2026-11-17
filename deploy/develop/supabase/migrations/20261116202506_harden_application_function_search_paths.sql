-- CR-058: overlay de segurança do DEVELOP; não integra as 18 migrations frozen.
-- Fixar resolução de nomes sem trocar corpo, owner, SECURITY INVOKER/DEFINER ou GRANT.
-- Se aplicada depois das 18, a função legada removida pela 000015 é ignorada.
alter function app.current_user_id() set search_path = pg_catalog, pg_temp;
alter function app.current_tenant() set search_path = pg_catalog, pg_temp;
alter function app.is_worker() set search_path = pg_catalog, pg_temp;
alter function app.is_operator() set search_path = pg_catalog, pg_temp;
alter function app.tenant_is_authorized() set search_path = pg_catalog, pg_temp;
alter function app.forbid_tenant_change() set search_path = pg_catalog, pg_temp;
do $hardening$
begin
  if pg_catalog.to_regprocedure('app.ensure_tenant_keeps_owner()') is not null then
    alter function app.ensure_tenant_keeps_owner() set search_path = pg_catalog, pg_temp;
  end if;
end
$hardening$;
