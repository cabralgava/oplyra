-- Seeds sintéticos do ambiente LOCAL. Duas empresas e os atores de teste de
-- 15 §2. Nenhum dado real de cliente. Não usar em produção.

-- Usuários do Supabase Auth com ids fixos, para que os testes de integração
-- possam autenticar de verdade. Senha local: "oplyra-local-2026".
-- As colunas de token ficam como string vazia, não NULL: o GoTrue as lê em
-- campos de texto não anuláveis e falha com "Database error querying schema".
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at, confirmation_token, recovery_token,
                        email_change_token_new, email_change, email_change_token_current,
                        reauthentication_token)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
       crypt('oplyra-local-2026', gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
       '', '', '', '', '', ''
from (values
  ('a0000001-0000-4000-8000-000000000001'::uuid, 'a-owner@local.test'),
  ('a0000002-0000-4000-8000-000000000002'::uuid, 'a-manager@local.test'),
  ('a0000003-0000-4000-8000-000000000003'::uuid, 'a-viewer@local.test'),
  ('a0000004-0000-4000-8000-000000000004'::uuid, 'a-removido@local.test'),
  ('ab000005-0000-4000-8000-000000000005'::uuid, 'ab-duas-empresas@local.test'),
  ('b0000006-0000-4000-8000-000000000006'::uuid, 'b-owner@local.test'),
  -- Sem nenhum vínculo: exercita o estado vazio da tela de empresas.
  ('e0000007-0000-4000-8000-000000000007'::uuid, 'sem-empresa@local.test')
) as u(id, email)
on conflict (id) do nothing;

insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
select u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now()
from auth.users u where u.email like '%@local.test'
on conflict (provider, provider_id) do nothing;

insert into core.tenants (id, name, slug, plan_key) values
  ('11111111-1111-4111-8111-111111111111', 'Alfa Software (fictícia)', 'alfa-software', 'performance'),
  ('22222222-2222-4222-8222-222222222222', 'Beta Cloud (fictícia)',    'beta-cloud',    'performance')
on conflict (id) do nothing;

insert into core.memberships (tenant_id, user_id, role_key, status, revoked_at) values
  ('11111111-1111-4111-8111-111111111111','a0000001-0000-4000-8000-000000000001','owner','active',null),
  ('11111111-1111-4111-8111-111111111111','a0000002-0000-4000-8000-000000000002','marketing_manager','active',null),
  ('11111111-1111-4111-8111-111111111111','a0000003-0000-4000-8000-000000000003','viewer','active',null),
  ('11111111-1111-4111-8111-111111111111','a0000004-0000-4000-8000-000000000004','admin','revoked',now()),
  ('11111111-1111-4111-8111-111111111111','ab000005-0000-4000-8000-000000000005','marketing_manager','active',null),
  ('22222222-2222-4222-8222-222222222222','ab000005-0000-4000-8000-000000000005','viewer','active',null),
  ('22222222-2222-4222-8222-222222222222','b0000006-0000-4000-8000-000000000006','owner','active',null)
on conflict do nothing;

insert into core.tenant_entitlements (tenant_id, capability_key, value, source) values
  ('11111111-1111-4111-8111-111111111111','team.invite','true','plan'),
  ('11111111-1111-4111-8111-111111111111','assets.library','true','plan'),
  ('22222222-2222-4222-8222-222222222222','team.invite','true','plan')
on conflict do nothing;
