-- I-01 — papéis, contexto de transação e predicado de autorização.
-- Desenho validado pelo EXP-01 (ver docs/decisions/ADR-0003).
-- Regra central: o tenant ATIVO tem escopo de transação e toda política
-- compara por igualdade com ele. Nada de papel ou empresa vindo do token.

create schema if not exists app;    -- funções de contexto e autorização
create schema if not exists core;   -- tabelas de domínio

-- Fora da Data API: o PostgREST expõe apenas public e graphql_public.
revoke all on schema app, core from public;

-- ------------------------------------------------------------------ papéis
do $$
begin
  -- Papéis de LOGIN: sem posse de tabela, sem privilégio direto, sem bypass.
  -- A senha é definida localmente por scripts/local-db-roles.sh e nunca versionada.
  if not exists (select 1 from pg_roles where rolname = 'oplyra_web_login') then
    create role oplyra_web_login login noinherit nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'oplyra_worker_login') then
    create role oplyra_worker_login login noinherit nobypassrls;
  end if;
  -- Papel de EXECUÇÃO do worker: assumido só dentro da transação.
  if not exists (select 1 from pg_roles where rolname = 'oplyra_worker_exec') then
    create role oplyra_worker_exec nologin nobypassrls;
  end if;
end
$$;

-- Cada login só alcança o próprio papel de execução.
grant authenticated to oplyra_web_login;
grant oplyra_worker_exec to oplyra_worker_login;
grant usage on schema app, core to authenticated, oplyra_worker_exec;

-- --------------------------------------------------------------- contexto
-- Identidade do solicitante, derivada de um JWT já verificado na aplicação.
create or replace function app.current_user_id() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- Empresa ativa da transação. Sem ela, nenhuma linha é visível.
create or replace function app.current_tenant() returns uuid
language sql stable as $$
  select nullif(current_setting('app.tenant_id', true), '')::uuid
$$;

create or replace function app.is_worker() returns boolean
language sql stable as $$
  select current_user = 'oplyra_worker_exec'
$$;

-- Impede trocar a empresa de um registro já existente, em qualquer caminho.
create or replace function app.forbid_tenant_change() returns trigger
language plpgsql as $$
begin
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'tenant_id é imutável (tabela %)', tg_table_name
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

grant execute on function app.current_user_id(), app.current_tenant(), app.is_worker()
  to authenticated, oplyra_worker_exec;
