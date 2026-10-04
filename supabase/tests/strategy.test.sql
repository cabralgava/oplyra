-- I-04 — Estratégia: RLS, papéis, chave de rastreamento, método da campanha, referências entre empresas e testes.
-- Roda com `supabase test db`. Usa empresas próprias (T5/T6), criadas e descartadas na transação.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

\set T5 '55555555-5555-4555-8555-555555555555'
\set T6 '66666666-6666-4666-8666-666666666666'

insert into core.tenants (id, name, slug) values
  ('55555555-5555-4555-8555-555555555555', 'Épsilon Estratégia (pgTAP)', 'epsilon-estrategia-pgtap'),
  ('66666666-6666-4666-8666-666666666666', 'Zeta Estratégia (pgTAP)', 'zeta-estrategia-pgtap');
insert into core.memberships (tenant_id, user_id, role_key) values
  ('55555555-5555-4555-8555-555555555555', 'a0000001-0000-4000-8000-000000000001', 'owner'),
  ('55555555-5555-4555-8555-555555555555', 'a0000002-0000-4000-8000-000000000002', 'marketing_manager'),
  ('55555555-5555-4555-8555-555555555555', 'a0000003-0000-4000-8000-000000000003', 'viewer'),
  ('66666666-6666-4666-8666-666666666666', 'b0000006-0000-4000-8000-000000000006', 'owner');

-- Marcas publicadas (como dono do banco): T5 tem produto disponível e produto futuro, mais um RASCUNHO; T6 tem um produto.
insert into brand.versions (tenant_id, id, number, created_by) values
  ('55555555-5555-4555-8555-555555555555', 'f5000000-0000-4000-8000-000000000001', 1, 'a0000001-0000-4000-8000-000000000001'),
  ('66666666-6666-4666-8666-666666666666', 'f6000000-0000-4000-8000-000000000001', 1, 'b0000006-0000-4000-8000-000000000006');
insert into brand.products (tenant_id, version_id, product_key, name, availability) values
  ('55555555-5555-4555-8555-555555555555', 'f5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001', 'Produto Atual', 'available'),
  ('55555555-5555-4555-8555-555555555555', 'f5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000002', 'Módulo Futuro', 'future'),
  ('66666666-6666-4666-8666-666666666666', 'f6000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000001', 'Produto de Zeta', 'available');
update brand.versions set status = 'published', positioning = 'Posicionamento', tone = 'Tom',
       published_by = created_by, published_at = now() where id in ('f5000000-0000-4000-8000-000000000001', 'f6000000-0000-4000-8000-000000000001');
insert into brand.versions (tenant_id, id, number, created_by) values
  ('55555555-5555-4555-8555-555555555555', 'f5000000-0000-4000-8000-000000000002', 2, 'a0000001-0000-4000-8000-000000000001');
insert into brand.products (tenant_id, version_id, product_key, name, availability) values
  ('55555555-5555-4555-8555-555555555555', 'f5000000-0000-4000-8000-000000000002', 'a5000000-0000-4000-8000-0000000000d1', 'Produto do Rascunho', 'available');
insert into strategy.objectives (tenant_id, id, name, period_start, period_end, created_by) values
  ('66666666-6666-4666-8666-666666666666', '06000000-0000-4000-8000-000000000001', 'Objetivo de Zeta', '2026-11-01', '2026-12-31', 'b0000006-0000-4000-8000-000000000006');

-- ------------------------------------------------------- estrutura e privilégios
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'strategy' and c.relkind = 'r' and c.relname in ('objectives','kpis','personas','campaigns','experiments')
              and c.relrowsecurity and c.relforcerowsecurity),
          5, 'RLS habilitada E forçada nas cinco tabelas da estratégia');
select is((select count(*)::int from information_schema.table_privileges
            where table_schema = 'strategy' and grantee in ('oplyra_web_login','oplyra_worker_login','oplyra_ops_login','oplyra_worker_exec','oplyra_ops_exec')),
          0, 'logins, worker e operador não têm privilégio nas tabelas da estratégia');
select is((select count(*)::int from information_schema.table_privileges
            where table_schema = 'strategy' and grantee = 'authenticated' and privilege_type = 'DELETE'),
          0, 'ninguém exclui: objetivos, personas, campanhas e testes encerram por estado');
select is(has_schema_privilege('public', 'strategy', 'USAGE'), false, 'public não tem USAGE no schema strategy');
select is(has_schema_privilege('anon', 'strategy', 'USAGE'), false, 'anon não tem USAGE no schema strategy');
select is((select array_agg(role_key order by role_key) from core.role_permissions where permission_key = 'strategy.read'),
          array['admin','marketing_manager','owner','viewer'], 'todos os papéis leem a estratégia');
select is((select array_agg(role_key order by role_key) from core.role_permissions where permission_key = 'strategy.write'),
          array['admin','marketing_manager','owner'], 'Owner, Admin e Gestor editam');
select is((select array_agg(role_key order by role_key) from core.role_permissions where permission_key = 'campaign.activate'),
          array['admin','marketing_manager','owner'], 'Owner, Admin e Gestor ativam campanhas');

-- ---------------------------------------------------------- contexto: Owner de T5
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000001-0000-4000-8000-000000000001', true);
select set_config('app.tenant_id', :'T5', true);

select lives_ok($$insert into strategy.objectives (tenant_id, id, name, period_start, period_end, created_by)
                  values ('55555555-5555-4555-8555-555555555555','05000000-0000-4000-8000-000000000001','Gerar demanda','2026-11-01','2026-12-31','a0000001-0000-4000-8000-000000000001')$$,
                'Owner cria objetivo na própria empresa');
select lives_ok($$insert into strategy.kpis (tenant_id, objective_id, name, unit, target)
                  values ('55555555-5555-4555-8555-555555555555','05000000-0000-4000-8000-000000000001','Leads qualificados','leads',120)$$,
                'indicador entra no objetivo');
select throws_ok($$update strategy.kpis set target = 1 where tenant_id = '55555555-5555-4555-8555-555555555555'$$,
                 '42501', null, 'indicador não é atualizável');
select throws_ok($$insert into strategy.objectives (tenant_id, name, period_start, period_end, created_by)
                   values ('66666666-6666-4666-8666-666666666666','Invasão','2026-11-01','2026-12-31','a0000001-0000-4000-8000-000000000001')$$,
                 '42501', null, 'Owner de T5 não cria objetivo em T6');
select throws_ok($$insert into strategy.objectives (tenant_id, name, period_start, period_end, created_by)
                   values ('55555555-5555-4555-8555-555555555555','Período invertido','2026-12-31','2026-11-01','a0000001-0000-4000-8000-000000000001')$$,
                 '23514', null, 'período invertido é recusado');
select lives_ok($$insert into strategy.personas (tenant_id, id, name, created_by)
                  values ('55555555-5555-4555-8555-555555555555','05100000-0000-4000-8000-000000000001','Gerente de marketing','a0000001-0000-4000-8000-000000000001')$$,
                'Owner cria persona');

-- --------------------------------------------------------------- campanha: criação
select lives_ok($$insert into strategy.campaigns (tenant_id, id, name, objective_id, brand_version_id, product_key, persona_id, tracking_key, situation, period_start, period_end, created_by)
                  values ('55555555-5555-4555-8555-555555555555','05200000-0000-4000-8000-000000000001','Lançamento','05000000-0000-4000-8000-000000000001',
                          'f5000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001','05100000-0000-4000-8000-000000000001',
                          'cmp-lancamento-a1b2','Só a situação','2026-11-01','2026-12-31','a0000001-0000-4000-8000-000000000001')$$,
                'campanha planejada (incompleta) é criada');
select throws_ok($$insert into strategy.campaigns (tenant_id, name, objective_id, brand_version_id, product_key, tracking_key, period_start, period_end, created_by)
                   values ('55555555-5555-4555-8555-555555555555','Outra','05000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001',
                           'a5000000-0000-4000-8000-000000000001','cmp-lancamento-a1b2','2026-11-01','2026-12-31','a0000001-0000-4000-8000-000000000001')$$,
                 '23505', null, 'a chave de rastreamento é única por empresa');
select throws_ok($$insert into strategy.campaigns (tenant_id, name, objective_id, brand_version_id, product_key, tracking_key, period_start, period_end, created_by)
                   values ('55555555-5555-4555-8555-555555555555','Chave ruim','05000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001',
                           'a5000000-0000-4000-8000-000000000001','Chave Ruim!','2026-11-01','2026-12-31','a0000001-0000-4000-8000-000000000001')$$,
                 '23514', null, 'a chave fora do formato é recusada');
select throws_ok($$insert into strategy.campaigns (tenant_id, name, status, objective_id, brand_version_id, product_key, tracking_key, activated_at, period_start, period_end, created_by)
                   values ('55555555-5555-4555-8555-555555555555','Nasce ativa','active','05000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001',
                           'a5000000-0000-4000-8000-000000000001','cmp-nasce-ativa-0001',now(),'2026-11-01','2026-12-31','a0000001-0000-4000-8000-000000000001')$$,
                 '23514', 'a campanha nasce planejada', 'a campanha não nasce ativa (trigger; a política também a recusaria)');
select throws_ok($$insert into strategy.campaigns (tenant_id, name, objective_id, brand_version_id, product_key, tracking_key, period_start, period_end, created_by)
                   values ('55555555-5555-4555-8555-555555555555','Objetivo alheio','06000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001',
                           'a5000000-0000-4000-8000-000000000001','cmp-objetivo-alheio-0002','2026-11-01','2026-12-31','a0000001-0000-4000-8000-000000000001')$$,
                 '23503', null, 'campanha não referencia objetivo de outra empresa (FK composta)');
select throws_ok($$insert into strategy.campaigns (tenant_id, name, objective_id, brand_version_id, product_key, tracking_key, period_start, period_end, created_by)
                   values ('55555555-5555-4555-8555-555555555555','Produto alheio','05000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001',
                           'a6000000-0000-4000-8000-000000000001','cmp-produto-alheio-0003','2026-11-01','2026-12-31','a0000001-0000-4000-8000-000000000001')$$,
                 '23503', null, 'campanha não referencia produto de outra empresa (FK composta)');
select throws_ok($$insert into strategy.campaigns (tenant_id, name, objective_id, brand_version_id, product_key, tracking_key, period_start, period_end, created_by)
                   values ('55555555-5555-4555-8555-555555555555','Marca alheia','05000000-0000-4000-8000-000000000001','f6000000-0000-4000-8000-000000000001',
                           'a6000000-0000-4000-8000-000000000001','cmp-marca-alheia-0009','2026-11-01','2026-12-31','a0000001-0000-4000-8000-000000000001')$$,
                 '23514', 'a campanha só referencia versão publicada da marca', 'campanha não referencia versão da marca de outra empresa');
select throws_ok($$insert into strategy.campaigns (tenant_id, name, objective_id, brand_version_id, product_key, tracking_key, period_start, period_end, created_by)
                   values ('55555555-5555-4555-8555-555555555555','Marca em rascunho','05000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000002',
                           'a5000000-0000-4000-8000-0000000000d1','cmp-marca-rascunho-0004','2026-11-01','2026-12-31','a0000001-0000-4000-8000-000000000001')$$,
                 '23514', 'a campanha só referencia versão publicada da marca', 'campanha só referencia versão PUBLICADA da marca');

-- ----------------------------------------------------- ativação: método e produto
select throws_ok($$update strategy.campaigns set status = 'active', activated_at = now() where id = '05200000-0000-4000-8000-000000000001'$$,
                 '23514', 'não é possível ativar: o método da campanha está incompleto', 'TST-30: método incompleto não ativa');
select lives_ok($$update strategy.campaigns set situation = 's', pain = 'd', consequence = 'c', desire = 'e', mechanism = 'm', proof = 'p', offer = 'o', revision = revision + 1
                   where id = '05200000-0000-4000-8000-000000000001'$$,
                'campanha planejada é editável (método completo)');
select lives_ok($$insert into strategy.campaigns (tenant_id, id, name, objective_id, brand_version_id, product_key, tracking_key, situation, pain, consequence, desire, mechanism, proof, offer, period_start, period_end, created_by)
                  values ('55555555-5555-4555-8555-555555555555','05200000-0000-4000-8000-000000000002','Produto futuro','05000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001',
                          'a5000000-0000-4000-8000-000000000002','cmp-produto-futuro-0005','s','d','c','e','m','p','o','2026-11-01','2026-12-31','a0000001-0000-4000-8000-000000000001')$$,
                'rascunho de campanha com produto futuro é aceito');
select throws_ok($$update strategy.campaigns set status = 'active', activated_at = now() where id = '05200000-0000-4000-8000-000000000002'$$,
                 '23514', 'não é possível ativar: o produto ainda não está disponível', 'produto futuro não ativa (D-7)');
select lives_ok($$insert into strategy.objectives (tenant_id, id, name, period_start, period_end, created_by)
                  values ('55555555-5555-4555-8555-555555555555','05000000-0000-4000-8000-000000000003','Objetivo antigo','2026-01-01','2026-02-01','a0000001-0000-4000-8000-000000000001')$$,
                'segundo objetivo');
select lives_ok($$insert into strategy.campaigns (tenant_id, id, name, objective_id, brand_version_id, product_key, tracking_key, situation, pain, consequence, desire, mechanism, proof, offer, period_start, period_end, created_by)
                  values ('55555555-5555-4555-8555-555555555555','05200000-0000-4000-8000-000000000003','Objetivo antigo','05000000-0000-4000-8000-000000000003','f5000000-0000-4000-8000-000000000001',
                          'a5000000-0000-4000-8000-000000000001','cmp-objetivo-antigo-0006','s','d','c','e','m','p','o','2026-11-01','2026-12-31','a0000001-0000-4000-8000-000000000001')$$,
                'campanha de um objetivo que será arquivado');
select lives_ok($$update strategy.objectives set status = 'archived' where id = '05000000-0000-4000-8000-000000000003'$$, 'objetivo é arquivado');
select throws_ok($$update strategy.objectives set name = 'Renomeado' where id = '05000000-0000-4000-8000-000000000001'$$,
                 '23514', 'objectives só pode ser arquivado', 'objetivo só muda para arquivado');
select throws_ok($$update strategy.objectives set status = 'active' where id = '05000000-0000-4000-8000-000000000003'$$,
                 '23514', null, 'objetivo arquivado não volta a ativo');
select throws_ok($$update strategy.campaigns set status = 'active', activated_at = now() where id = '05200000-0000-4000-8000-000000000003'$$,
                 '23514', 'não é possível ativar: o objetivo está arquivado', 'objetivo arquivado não ativa campanha');

-- --------------------------------------------- ativação válida e chave imutável
select lives_ok($$update strategy.campaigns set status = 'active', activated_at = now() where id = '05200000-0000-4000-8000-000000000001'$$,
                'campanha completa, objetivo ativo e produto disponível: ativa');
select throws_ok($$update strategy.campaigns set tracking_key = 'cmp-outra-chave-ffff' where id = '05200000-0000-4000-8000-000000000001'$$,
                 '23514', 'a chave de rastreamento é fixa depois de ativada a campanha', 'a chave é imutável depois da ativação');
select throws_ok($$update strategy.campaigns set objective_id = '05000000-0000-4000-8000-000000000003' where id = '05200000-0000-4000-8000-000000000001'$$,
                 '23514', 'objetivo, produto e versão da marca são fixos depois de ativada a campanha', 'objetivo e produto são fixos depois da ativação');
select throws_ok($$update strategy.campaigns set pain = '' where id = '05200000-0000-4000-8000-000000000001'$$,
                 '23514', 'o método de uma campanha ativada não pode ficar incompleto', 'método de campanha ativa não volta a ficar incompleto');
select throws_ok($$update strategy.campaigns set activated_at = now() + interval '1 day' where id = '05200000-0000-4000-8000-000000000001'$$,
                 '23514', 'a data da primeira ativação não é reescrita', 'a primeira ativação não é reescrita');
select lives_ok($$update strategy.campaigns set status = 'paused' where id = '05200000-0000-4000-8000-000000000001'$$, 'pausa');
select throws_ok($$update strategy.campaigns set tracking_key = 'cmp-pausada-0007' where id = '05200000-0000-4000-8000-000000000001'$$,
                 '23514', 'a chave de rastreamento é fixa depois de ativada a campanha', 'pausar não libera a chave');
select lives_ok($$update strategy.campaigns set status = 'active' where id = '05200000-0000-4000-8000-000000000001'$$, 'retomada');
select throws_ok($$update strategy.campaigns set status = 'planned' where id = '05200000-0000-4000-8000-000000000001'$$,
                 '23514', 'transição de estado da campanha inválida', 'campanha ativa não volta a planejada');

-- Testes (hipótese e dimensão) sobre a campanha ativa.
select lives_ok($$insert into strategy.experiments (tenant_id, id, campaign_id, hypothesis, dimension, created_by)
                  values ('55555555-5555-4555-8555-555555555555','05300000-0000-4000-8000-000000000001','05200000-0000-4000-8000-000000000001',
                          'Gancho com número aumenta o clique.','hook','a0000001-0000-4000-8000-000000000001')$$,
                'teste com hipótese e dimensão é criado');
select throws_ok($$insert into strategy.experiments (tenant_id, campaign_id, hypothesis, dimension, created_by)
                   values ('55555555-5555-4555-8555-555555555555','05200000-0000-4000-8000-000000000001','   ','hook','a0000001-0000-4000-8000-000000000001')$$,
                 '23514', null, 'I-HYP: sem hipótese não existe teste');
select throws_ok($$insert into strategy.experiments (tenant_id, campaign_id, hypothesis, dimension, created_by)
                   values ('55555555-5555-4555-8555-555555555555','05200000-0000-4000-8000-000000000001','H','nenhuma','a0000001-0000-4000-8000-000000000001')$$,
                 '23514', null, 'I-HYP: dimensão fora da lista é recusada');
select throws_ok($$insert into strategy.experiments (tenant_id, campaign_id, hypothesis, dimension, created_by)
                   values ('55555555-5555-4555-8555-555555555555','05200000-0000-4000-8000-000000000001','H','other','a0000001-0000-4000-8000-000000000001')$$,
                 '23514', null, 'dimensão "outra" exige a nota');
select lives_ok($$update strategy.experiments set status = 'running', started_at = now() where id = '05300000-0000-4000-8000-000000000001'$$, 'teste passa a executar');
select throws_ok($$update strategy.experiments set hypothesis = 'trocada depois' where id = '05300000-0000-4000-8000-000000000001'$$,
                 '23514', 'hipótese e dimensão são declaradas antes da execução e não mudam', 'a hipótese não muda depois de declarada');
select lives_ok($$update strategy.experiments set status = 'stopped' where id = '05300000-0000-4000-8000-000000000001'$$, 'teste é interrompido');
select throws_ok($$update strategy.experiments set status = 'running', started_at = now() where id = '05300000-0000-4000-8000-000000000001'$$,
                 '23514', 'transição de estado do teste inválida', 'teste interrompido não volta a executar');
select throws_ok($$delete from strategy.experiments$$, '42501', null, 'testes não são excluídos pela aplicação');

select lives_ok($$update strategy.campaigns set status = 'completed' where id = '05200000-0000-4000-8000-000000000001'$$, 'campanha é concluída');
select throws_ok($$update strategy.campaigns set name = 'Depois de concluída' where id = '05200000-0000-4000-8000-000000000001'$$,
                 '23514', 'campanha encerrada não é alterada', 'campanha concluída é final');
select throws_ok($$insert into strategy.experiments (tenant_id, campaign_id, hypothesis, dimension, created_by)
                   values ('55555555-5555-4555-8555-555555555555','05200000-0000-4000-8000-000000000001','H','hook','a0000001-0000-4000-8000-000000000001')$$,
                 '23514', 'campanha concluída ou cancelada não recebe testes', 'campanha concluída não recebe testes');
select throws_ok($$delete from strategy.campaigns$$, '42501', null, 'campanhas não são excluídas pela aplicação');

-- ------------------------------------------------ papéis: Gestor, sem campaign.activate, e Leitor
reset role;
select lives_ok($$insert into strategy.campaigns (tenant_id, id, name, objective_id, brand_version_id, product_key, tracking_key, situation, pain, consequence, desire, mechanism, proof, offer, period_start, period_end, created_by)
                  values ('55555555-5555-4555-8555-555555555555','05200000-0000-4000-8000-000000000004','Do gestor','05000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001',
                          'a5000000-0000-4000-8000-000000000001','cmp-do-gestor-0008','s','d','c','e','m','p','o','2026-11-01','2026-12-31','a0000002-0000-4000-8000-000000000002')$$,
                'preparo (dono do banco): campanha completa para o Gestor');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000002-0000-4000-8000-000000000002', true);
select set_config('app.tenant_id', :'T5', true);
select lives_ok($$update strategy.campaigns set status = 'active', activated_at = now() where id = '05200000-0000-4000-8000-000000000004'$$,
                'Gestor ativa campanha (tem campaign.activate)');
reset role;
delete from core.role_permissions where role_key = 'marketing_manager' and permission_key = 'campaign.activate';
insert into strategy.campaigns (tenant_id, id, name, objective_id, brand_version_id, product_key, tracking_key, situation, pain, consequence, desire, mechanism, proof, offer, period_start, period_end, created_by)
  values ('55555555-5555-4555-8555-555555555555','05200000-0000-4000-8000-000000000005','Outra do gestor','05000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001',
          'a5000000-0000-4000-8000-000000000001','cmp-outra-do-gestor-0010','s','d','c','e','m','p','o','2026-11-01','2026-12-31','a0000002-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000002-0000-4000-8000-000000000002', true);
select set_config('app.tenant_id', :'T5', true);
select lives_ok($$update strategy.campaigns set key_message = 'editar planejada só exige strategy.write', revision = revision + 1 where id = '05200000-0000-4000-8000-000000000005'$$,
                'sem campaign.activate, o Gestor ainda edita a campanha planejada');
select throws_ok($$update strategy.campaigns set status = 'active', activated_at = now() where id = '05200000-0000-4000-8000-000000000005'$$,
                 '42501', null, 'sem campaign.activate, ativar é negado pela política');

select set_config('request.jwt.claim.sub', 'a0000003-0000-4000-8000-000000000003', true);
select is((select count(*)::int from strategy.campaigns), 5, 'Leitor enxerga as campanhas da empresa');
select is((select count(*)::int from strategy.objectives) + (select count(*)::int from strategy.personas) + (select count(*)::int from strategy.experiments),
          4, 'Leitor enxerga objetivos, personas e testes');
select throws_ok($$insert into strategy.objectives (tenant_id, name, period_start, period_end, created_by)
                   values ('55555555-5555-4555-8555-555555555555','Do leitor','2026-11-01','2026-12-31','a0000003-0000-4000-8000-000000000003')$$,
                 '42501', null, 'Leitor não cria objetivo');
with u as (update strategy.campaigns set key_message = 'invasão' where tenant_id = '55555555-5555-4555-8555-555555555555' returning 1)
select is(count(*)::int, 0, 'Leitor não altera campanha (nenhuma linha afetada)') from u;

-- ---------------------------------------------------------- isolamento entre empresas
select set_config('request.jwt.claim.sub', 'b0000006-0000-4000-8000-000000000006', true);
select set_config('app.tenant_id', :'T6', true);
select is((select count(*)::int from strategy.objectives where tenant_id = :'T5'::uuid)
        + (select count(*)::int from strategy.campaigns) + (select count(*)::int from strategy.experiments) + (select count(*)::int from strategy.personas)
        + (select count(*)::int from strategy.kpis), 0, 'Owner de T6 não enxerga nada da estratégia de T5');
select is((select count(*)::int from strategy.objectives), 1, 'Owner de T6 enxerga só o próprio objetivo');
select set_config('app.tenant_id', :'T5', true);
select is((select count(*)::int from strategy.campaigns), 0, 'com T5 forjada como ativa, quem não é membro não enxerga nada');

reset role;
set local role anon;
select throws_ok($$select count(*) from strategy.campaigns$$, '42501', null, 'anon não acessa a estratégia');

-- ----------------------------------- dono do banco (RLS ignorada): a regra é do banco
reset role;
select throws_ok($$delete from strategy.campaigns where id = '05200000-0000-4000-8000-000000000004'$$,
                 '23514', 'campanha não é excluída: cancele-a', 'trigger: campanha não é excluída');
select throws_ok($$delete from strategy.objectives where id = '05000000-0000-4000-8000-000000000001'$$,
                 '23514', 'objectives não é excluído: arquive-o', 'trigger: objetivo não é excluído');
select throws_ok($$update strategy.kpis set target = 2$$, '23514', 'indicador não é alterado', 'trigger: indicador não é alterado');

-- ------------------------------------------- exclusão da empresa (cascata real)
select lives_ok($$delete from core.tenants where id = '55555555-5555-4555-8555-555555555555'$$,
                'a exclusão da empresa remove a estratégia em cascata');
select is((select count(*)::int from strategy.campaigns where tenant_id = '55555555-5555-4555-8555-555555555555')
        + (select count(*)::int from strategy.experiments where tenant_id = '55555555-5555-4555-8555-555555555555')
        + (select count(*)::int from strategy.objectives where tenant_id = '55555555-5555-4555-8555-555555555555'), 0,
          'nada da empresa excluída permanece');

select * from finish();
rollback;
