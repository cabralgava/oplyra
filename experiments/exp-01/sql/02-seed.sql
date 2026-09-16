-- EXP-01 — dados sintéticos. Duas empresas e os atores de teste de 15 §2.
begin;

truncate exp01.tasks, exp01.campaigns, exp01.memberships, exp01.tenants cascade;

insert into exp01.tenants (id, name) values
  ('11111111-1111-4111-8111-111111111111', 'Alfa Software (fictícia)'),
  ('22222222-2222-4222-8222-222222222222', 'Beta Cloud (fictícia)');

-- A_owner, A_readonly ativos em A; A_removed revogado em A;
-- AB_user ativo nas duas; B_owner ativo em B.
insert into exp01.memberships (tenant_id, user_id, role_key, status) values
  ('11111111-1111-4111-8111-111111111111', 'a0000001-0000-4000-8000-000000000001', 'owner',   'active'),
  ('11111111-1111-4111-8111-111111111111', 'a0000002-0000-4000-8000-000000000002', 'viewer',  'active'),
  ('11111111-1111-4111-8111-111111111111', 'a0000003-0000-4000-8000-000000000003', 'admin',   'revoked'),
  ('11111111-1111-4111-8111-111111111111', 'ab000004-0000-4000-8000-000000000004', 'marketing_manager', 'active'),
  ('22222222-2222-4222-8222-222222222222', 'ab000004-0000-4000-8000-000000000004', 'viewer',  'active'),
  ('22222222-2222-4222-8222-222222222222', 'b0000005-0000-4000-8000-000000000005', 'owner',   'active');

-- Campanha canário por empresa: nome distintivo, para detectar vazamento.
insert into exp01.campaigns (tenant_id, id, name) values
  ('11111111-1111-4111-8111-111111111111', 'c0000001-0000-4000-8000-000000000001', 'CANARIO-ALFA-lancamento'),
  ('22222222-2222-4222-8222-222222222222', 'c0000002-0000-4000-8000-000000000002', 'CANARIO-BETA-lancamento');

insert into exp01.tasks (tenant_id, campaign_id, title) values
  ('11111111-1111-4111-8111-111111111111', 'c0000001-0000-4000-8000-000000000001', 'Tarefa da Alfa'),
  ('22222222-2222-4222-8222-222222222222', 'c0000002-0000-4000-8000-000000000002', 'Tarefa da Beta');

-- Volume para E1-12: 50 mil campanhas por empresa.
insert into exp01.campaigns (tenant_id, name)
select '11111111-1111-4111-8111-111111111111', 'camp-alfa-' || g from generate_series(1, 50000) g;
insert into exp01.campaigns (tenant_id, name)
select '22222222-2222-4222-8222-222222222222', 'camp-beta-' || g from generate_series(1, 50000) g;

analyze exp01.campaigns;
analyze exp01.memberships;

commit;
