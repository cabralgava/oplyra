-- I-03 — Brand OS: RLS, papéis, imutabilidade, regras de publicação e isolamento entre empresas.
-- Roda com `supabase test db`. Usa empresas próprias (T3/T4), criadas e descartadas na transação.
begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

\set T3 '33333333-3333-4333-8333-333333333333'
\set T4 '44444444-4444-4444-8444-444444444444'

insert into core.tenants (id, name, slug) values
  ('33333333-3333-4333-8333-333333333333', 'Gama Brand (pgTAP)', 'gama-brand-pgtap'),
  ('44444444-4444-4444-8444-444444444444', 'Delta Brand (pgTAP)', 'delta-brand-pgtap');
insert into core.memberships (tenant_id, user_id, role_key) values
  ('33333333-3333-4333-8333-333333333333', 'a0000001-0000-4000-8000-000000000001', 'owner'),
  ('33333333-3333-4333-8333-333333333333', 'a0000002-0000-4000-8000-000000000002', 'marketing_manager'),
  ('33333333-3333-4333-8333-333333333333', 'a0000003-0000-4000-8000-000000000003', 'viewer'),
  ('44444444-4444-4444-8444-444444444444', 'b0000006-0000-4000-8000-000000000006', 'owner');

-- ------------------------------------------------------- estrutura e privilégios
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'brand' and c.relkind = 'r' and c.relname in ('versions','products','claims')
      and c.relrowsecurity and c.relforcerowsecurity),
  3, 'RLS habilitada E forçada nas três tabelas da marca');
select is((select count(*)::int from information_schema.table_privileges
            where table_schema = 'brand' and grantee in ('oplyra_web_login','oplyra_worker_login','oplyra_ops_login','oplyra_worker_exec','oplyra_ops_exec')),
          0, 'logins, worker e operador não têm privilégio nas tabelas da marca');
select is(has_schema_privilege('public', 'brand', 'USAGE'), false, 'public não tem USAGE no schema brand');
select is(has_schema_privilege('anon', 'brand', 'USAGE'), false, 'anon não tem USAGE no schema brand');
select is((select array_agg(role_key order by role_key) from core.role_permissions where permission_key = 'brand.publish'),
          array['admin','owner'], 'só Owner e Admin publicam a marca');
select is((select array_agg(role_key order by role_key) from core.role_permissions where permission_key = 'brand.write'),
          array['admin','marketing_manager','owner'], 'Owner, Admin e Gestor editam o rascunho');
select is((select array_agg(role_key order by role_key) from core.role_permissions where permission_key = 'brand.read'),
          array['admin','marketing_manager','owner','viewer'], 'todos os papéis leem a marca');

-- ---------------------------------------------------------- contexto: Owner de T3
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000001-0000-4000-8000-000000000001', true);
select set_config('app.tenant_id', :'T3', true);

select lives_ok($$insert into brand.versions (tenant_id, id, number, created_by)
                  values ('33333333-3333-4333-8333-333333333333','f1000000-0000-4000-8000-000000000001',1,'a0000001-0000-4000-8000-000000000001')$$,
                'Owner abre o rascunho da própria empresa');
select throws_ok($$insert into brand.versions (tenant_id, id, number, created_by)
                   values ('33333333-3333-4333-8333-333333333333','f1000000-0000-4000-8000-000000000002',2,'a0000001-0000-4000-8000-000000000001')$$,
                 '23505', null, 'no máximo um rascunho por empresa');
select throws_ok($$insert into brand.versions (tenant_id, id, number, created_by)
                   values ('44444444-4444-4444-8444-444444444444','f1000000-0000-4000-8000-000000000003',1,'a0000001-0000-4000-8000-000000000001')$$,
                 '42501', null, 'Owner de T3 não abre rascunho em T4');
select throws_ok($$insert into brand.versions (tenant_id, id, number, status, created_by, published_by, published_at)
                   values ('33333333-3333-4333-8333-333333333333','f1000000-0000-4000-8000-000000000004',9,'published','a0000001-0000-4000-8000-000000000001','a0000001-0000-4000-8000-000000000001',now())$$,
                 '42501', null, 'versão nasce rascunho: inserir já publicada é negado pela política');
select lives_ok($$insert into brand.products (tenant_id, version_id, product_key, name, availability)
                  values ('33333333-3333-4333-8333-333333333333','f1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','Produto Atual','available'),
                         ('33333333-3333-4333-8333-333333333333','f1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','Módulo Futuro','future')$$,
                'produtos entram no rascunho');

-- Regra: afirmação de disponibilidade PERMITIDA sobre produto futuro é inválida; proibida é válida.
select throws_ok($$insert into brand.claims (tenant_id, version_id, product_key, kind, polarity, text, usage_rule, evidence)
                   values ('33333333-3333-4333-8333-333333333333','f1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002',
                           'availability','allowed','Já disponível','regra','[{"kind":"text","value":"x"}]')$$,
                 '23514', 'produto futuro não pode ter afirmação de disponibilidade permitida',
                 'produto future bloqueia afirmação de disponibilidade permitida');
select lives_ok($$insert into brand.claims (tenant_id, version_id, product_key, kind, polarity, text, usage_rule)
                  values ('33333333-3333-4333-8333-333333333333','f1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002',
                          'availability','forbidden','Já disponível','Não prometer antes do lançamento.')$$,
                'a mesma afirmação PROIBIDA sobre produto futuro é aceita');
select lives_ok($$insert into brand.claims (tenant_id, id, version_id, product_key, kind, polarity, text, usage_rule, evidence)
                  values ('33333333-3333-4333-8333-333333333333','c1000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
                          'availability','allowed','Disponível hoje','Citar com a página de preços.','[{"kind":"url","value":"https://exemplo.test/precos"}]')$$,
                'afirmação de disponibilidade sobre produto disponível é aceita');
select throws_ok($$update brand.products set availability = 'future'
                    where tenant_id = '33333333-3333-4333-8333-333333333333' and product_key = 'a1000000-0000-4000-8000-000000000001'$$,
                 '23514', 'produto futuro não pode ter afirmação de disponibilidade permitida',
                 'tornar futuro um produto com afirmação de disponibilidade permitida é negado');
select throws_ok($$insert into brand.claims (tenant_id, version_id, kind, polarity, text, usage_rule, evidence)
                   values ('33333333-3333-4333-8333-333333333333','f1000000-0000-4000-8000-000000000001','benefit','allowed','x','r','[{"kind":"url","value":"ftp://x.test"}]')$$,
                 '23514', null, 'evidência com URL fora de http/https é recusada');
select throws_ok($$insert into brand.claims (tenant_id, version_id, kind, polarity, text, usage_rule)
                   values ('33333333-3333-4333-8333-333333333333','f1000000-0000-4000-8000-000000000001','availability','allowed','x','r')$$,
                 '23514', null, 'afirmação de disponibilidade sem produto é recusada');
select throws_ok($$insert into brand.claims (tenant_id, version_id, product_key, kind, polarity, text, usage_rule)
                   values ('33333333-3333-4333-8333-333333333333','f1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-0000000000ff','benefit','forbidden','x','r')$$,
                 '23503', null, 'afirmação não referencia produto inexistente na versão (FK composta)');

-- --------------------------------------------------- publicação: regras mínimas
select throws_ok($$update brand.versions set status = 'published', published_by = 'a0000001-0000-4000-8000-000000000001', published_at = now()
                    where tenant_id = '33333333-3333-4333-8333-333333333333' and id = 'f1000000-0000-4000-8000-000000000001'$$,
                 '23514', 'não é possível publicar: o posicionamento é obrigatório',
                 'publicar sem posicionamento é recusado pelo banco');
select lives_ok($$update brand.versions set positioning = 'Posicionamento', tone = 'Tom direto', revision = revision + 1
                   where tenant_id = '33333333-3333-4333-8333-333333333333' and id = 'f1000000-0000-4000-8000-000000000001'$$,
                'o rascunho é editável pelo Owner');

-- Gestor edita, mas não publica.
select set_config('request.jwt.claim.sub', 'a0000002-0000-4000-8000-000000000002', true);
select lives_ok($$update brand.versions set tone = 'Tom do gestor', revision = revision + 1
                   where tenant_id = '33333333-3333-4333-8333-333333333333' and id = 'f1000000-0000-4000-8000-000000000001'$$,
                'Gestor edita o rascunho');
select throws_ok($$update brand.versions set status = 'published', published_by = 'a0000002-0000-4000-8000-000000000002', published_at = now()
                    where tenant_id = '33333333-3333-4333-8333-333333333333' and id = 'f1000000-0000-4000-8000-000000000001'$$,
                 '42501', null, 'Gestor não publica');

-- Leitor lê, não escreve.
select set_config('request.jwt.claim.sub', 'a0000003-0000-4000-8000-000000000003', true);
select is((select count(*)::int from brand.versions), 1, 'Leitor enxerga a versão da própria empresa');
select is((select count(*)::int from brand.claims), 2, 'Leitor enxerga as afirmações');
select throws_ok($$insert into brand.products (tenant_id, version_id, product_key, name, availability)
                   values ('33333333-3333-4333-8333-333333333333','f1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000003','X','available')$$,
                 '42501', null, 'Leitor não cadastra produto');
with u as (update brand.versions set tone = 'invasão' where tenant_id = '33333333-3333-4333-8333-333333333333' returning 1)
select is(count(*)::int, 0, 'Leitor não altera o rascunho (nenhuma linha afetada)') from u;

-- Owner publica o rascunho completo.
select set_config('request.jwt.claim.sub', 'a0000001-0000-4000-8000-000000000001', true);
select lives_ok($$update brand.versions set status = 'published', published_by = 'a0000001-0000-4000-8000-000000000001', published_at = now()
                   where tenant_id = '33333333-3333-4333-8333-333333333333' and id = 'f1000000-0000-4000-8000-000000000001'$$,
                'Owner publica o rascunho completo');

-- ---------------------------------------------------------- imutabilidade
with u as (update brand.versions set tone = 'depois de publicada' where tenant_id = '33333333-3333-4333-8333-333333333333' and status = 'published' returning 1)
select is(count(*)::int, 0, 'versão publicada não é atualizável pela aplicação (RLS)') from u;
select throws_ok($$delete from brand.products where tenant_id = '33333333-3333-4333-8333-333333333333'$$,
                 '23514', 'versão publicada da marca é imutável', 'produtos da versão publicada não são removidos nem pela aplicação');
select lives_ok($$insert into brand.versions (tenant_id, id, number, derived_from_id, created_by)
                  values ('33333333-3333-4333-8333-333333333333','f1000000-0000-4000-8000-000000000002',2,'f1000000-0000-4000-8000-000000000001','a0000001-0000-4000-8000-000000000001')$$,
                'depois de publicada, um novo rascunho derivado é aceito');
select throws_ok($$insert into brand.claims (tenant_id, version_id, product_key, kind, polarity, text, usage_rule)
                   values ('33333333-3333-4333-8333-333333333333','f1000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','benefit','forbidden','x','r')$$,
                 '23503', null, 'afirmação do novo rascunho não referencia produto da versão anterior');

-- O dono do banco (RLS ignorada) também não altera a publicada: a imutabilidade é do banco.
reset role;
select throws_ok($$update brand.versions set tone = 'x' where tenant_id = '33333333-3333-4333-8333-333333333333' and id = 'f1000000-0000-4000-8000-000000000001'$$,
                 '23514', 'versão publicada da marca é imutável', 'trigger: versão publicada é imutável');
select throws_ok($$insert into brand.products (tenant_id, version_id, product_key, name, availability)
                   values ('33333333-3333-4333-8333-333333333333','f1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000009','X','available')$$,
                 '23514', 'versão publicada da marca é imutável', 'trigger: produto não entra em versão publicada');
select throws_ok($$delete from brand.versions where tenant_id = '33333333-3333-4333-8333-333333333333' and id = 'f1000000-0000-4000-8000-000000000001'$$,
                 '23514', 'versão publicada da marca é imutável', 'trigger: versão publicada não é excluída');
select throws_ok($$update brand.versions set number = 7 where tenant_id = '33333333-3333-4333-8333-333333333333' and id = 'f1000000-0000-4000-8000-000000000002'$$,
                 '23514', 'identidade da versão da marca é imutável', 'trigger: o número da versão não muda');

-- ---------------------------------------------------------- isolamento entre empresas
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000006-0000-4000-8000-000000000006', true);
select set_config('app.tenant_id', :'T4', true);
select is((select count(*)::int from brand.versions) + (select count(*)::int from brand.products) + (select count(*)::int from brand.claims),
          0, 'Owner de T4 não enxerga nada da marca de T3');
select set_config('app.tenant_id', :'T3', true);
select is((select count(*)::int from brand.versions), 0, 'com T3 forjada como ativa, quem não é membro não enxerga nada');

-- Anônimo não alcança o schema.
reset role;
set local role anon;
select throws_ok($$select count(*) from brand.versions$$, '42501', null, 'anon não acessa a marca');

-- ------------------------------------------- exclusão da empresa (cascata real)
reset role;
select lives_ok($$delete from core.tenants where id = '33333333-3333-4333-8333-333333333333'$$,
                'a exclusão da empresa remove a marca publicada em cascata');
select is((select count(*)::int from brand.versions where tenant_id = '33333333-3333-4333-8333-333333333333'), 0,
          'nenhuma versão da empresa excluída permanece');

select * from finish();
rollback;
