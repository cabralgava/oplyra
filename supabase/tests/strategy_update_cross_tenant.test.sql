-- I-04 — UPDATE/DELETE SEM predicado entre empresas. Complementa strategy.test.sql (arquivo coberto pelo inventário governado da
-- preparação 2.23, por isso não foi alterado).
--
-- LACUNA ACHADA POR MUTAÇÃO: com a política de UPDATE sem a checagem de empresa (using/with check sem `tenant_id = app.current_tenant()`),
-- o pgTAP existente continuava passando, porque o seu UPDATE cross-tenant usa `where tenant_id = T5`: esse predicado referencia coluna e
-- aciona a política de SELECT, que filtra a empresa. SEM predicado, a RLS de SELECT não entra e só a política de UPDATE/DELETE separa as
-- empresas. Aqui o T6 roda UPDATE/DELETE sem `where` e nada de T5 pode mudar.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into core.tenants (id, name, slug) values
  ('57575757-5757-4757-8757-575757575757', 'Eta UPDATE (pgTAP)', 'eta-update-pgtap'),
  ('68686868-6868-4868-8868-686868686868', 'Teta UPDATE (pgTAP)', 'teta-update-pgtap');
insert into core.memberships (tenant_id, user_id, role_key) values
  ('57575757-5757-4757-8757-575757575757', 'a2000001-0000-4000-8000-000000000001', 'owner'),
  ('68686868-6868-4868-8868-686868686868', 'b2000006-0000-4000-8000-000000000006', 'owner');

-- Dados de T7 (57…): criados pelo Owner de T7 com o papel da aplicação.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000001-0000-4000-8000-000000000001', true);
select set_config('app.tenant_id', '57575757-5757-4757-8757-575757575757', true);
insert into strategy.objectives (tenant_id, id, name, period_start, period_end, kpis, created_by)
  values ('57575757-5757-4757-8757-575757575757','02000000-0000-4000-8000-000000000001','Objetivo T7','2026-10-01','2026-12-31',
          '[{"key":"a","name":"A","metric":"m","unit":"u","target":1}]','a2000001-0000-4000-8000-000000000001');
insert into strategy.campaigns (tenant_id, id, name, method, tracking_key, created_by)
  values ('57575757-5757-4757-8757-575757575757','c2000000-0000-4000-8000-000000000001','Campanha T7',
          '{"situation":"","pain":"","consequence":"","desire":"","mechanism":"","proof":"","offer":""}','camp-t7','a2000001-0000-4000-8000-000000000001');
insert into strategy.tasks (tenant_id, id, title, created_by) values
  ('57575757-5757-4757-8757-575757575757','72000000-0000-4000-8000-000000000001','Tarefa 1 de T7','a2000001-0000-4000-8000-000000000001'),
  ('57575757-5757-4757-8757-575757575757','72000000-0000-4000-8000-000000000002','Tarefa 2 de T7','a2000001-0000-4000-8000-000000000001');
insert into strategy.task_dependencies (tenant_id, task_id, depends_on_id)
  values ('57575757-5757-4757-8757-575757575757','72000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000001');

-- Contexto de T8 (68…): empresa vizinha, com uma campanha própria.
select set_config('request.jwt.claim.sub', 'b2000006-0000-4000-8000-000000000006', true);
select set_config('app.tenant_id', '68686868-6868-4868-8868-686868686868', true);
insert into strategy.campaigns (tenant_id, id, name, method, tracking_key, created_by)
  values ('68686868-6868-4868-8868-686868686868','c2000000-0000-4000-8000-000000000002','Campanha T8',
          '{"situation":"","pain":"","consequence":"","desire":"","mechanism":"","proof":"","offer":""}','camp-t8','b2000006-0000-4000-8000-000000000006');

select is(current_user::text, 'authenticated', 'as tentativas rodam com o papel authenticated');
select is((select rolsuper or rolbypassrls from pg_roles where rolname = current_user), false, 'o papel não é superuser nem BYPASSRLS');
select is(current_setting('app.tenant_id'), '68686868-6868-4868-8868-686868686868', 'o tenant ativo é T8');

with u as (update strategy.objectives set name = 'invasão' returning 1)
select is((select count(*)::int from u), 0, 'UPDATE sem where de T8 não altera objetivos de T7');
with u as (update strategy.tasks set title = 'invasão' returning 1)
select is((select count(*)::int from u), 0, 'UPDATE sem where de T8 não altera tarefas de T7');
-- `returning 1` de propósito: coluna no RETURNING aciona a política de SELECT e mascararia a de UPDATE.
with u as (update strategy.campaigns set name = 'invasão' returning 1)
select is((select count(*)::int from u), 1, 'UPDATE sem where de T8 alcança só a campanha da própria empresa (1 linha, não 2)');
with d as (delete from strategy.task_dependencies returning 1)
select is((select count(*)::int from d), 0, 'DELETE sem where de T8 não remove dependências de T7');

-- Conferência pelo dono do banco: nada de T7 foi tocado.
reset role;
select is((select count(*)::int from strategy.objectives where tenant_id = '57575757-5757-4757-8757-575757575757' and name = 'invasão'), 0, 'objetivos de T7 intactos');
select is((select count(*)::int from strategy.tasks where tenant_id = '57575757-5757-4757-8757-575757575757' and title = 'invasão'), 0, 'tarefas de T7 intactas');
select is((select count(*)::int from strategy.campaigns where tenant_id = '57575757-5757-4757-8757-575757575757' and name = 'invasão'), 0, 'campanhas de T7 intactas');
select is((select count(*)::int from strategy.task_dependencies where tenant_id = '57575757-5757-4757-8757-575757575757'), 1, 'a dependência de T7 continua existindo');

select * from finish();
rollback;
