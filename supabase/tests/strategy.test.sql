-- I-04 — Estratégia e operação: RLS, papéis, ciclo de vida, chave de rastreamento, I-HYP, tarefas e isolamento.
-- Roda com `supabase test db`. Usa empresas próprias (T5/T6), criadas e descartadas na transação.
begin;
create extension if not exists pgtap with schema extensions;
select plan(79);

\set T5 '55555555-5555-4555-8555-555555555555'
\set T6 '66666666-6666-4666-8666-666666666666'

insert into core.tenants (id, name, slug) values
  ('55555555-5555-4555-8555-555555555555', 'Épsilon Estratégia (pgTAP)', 'epsilon-estrategia-pgtap'),
  ('66666666-6666-4666-8666-666666666666', 'Zeta Estratégia (pgTAP)', 'zeta-estrategia-pgtap');
insert into core.memberships (tenant_id, user_id, role_key) values
  ('55555555-5555-4555-8555-555555555555', 'a1000001-0000-4000-8000-000000000001', 'owner'),
  ('55555555-5555-4555-8555-555555555555', 'a1000002-0000-4000-8000-000000000002', 'marketing_manager'),
  ('55555555-5555-4555-8555-555555555555', 'a1000003-0000-4000-8000-000000000003', 'viewer'),
  ('66666666-6666-4666-8666-666666666666', 'b1000006-0000-4000-8000-000000000006', 'owner');

-- ------------------------------------------------------- estrutura e privilégios
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'strategy' and c.relkind = 'r'
      and c.relname in ('objectives','campaigns','experiments','tasks','task_dependencies')
      and c.relrowsecurity and c.relforcerowsecurity),
  5, 'RLS habilitada E forçada nas cinco tabelas de estratégia');
select is((select count(*)::int from information_schema.table_privileges
            where table_schema = 'strategy' and grantee in ('oplyra_web_login','oplyra_worker_login','oplyra_ops_login','oplyra_worker_exec','oplyra_ops_exec')),
          0, 'logins, worker e operador não têm privilégio nas tabelas de estratégia');
select is(has_schema_privilege('public', 'strategy', 'USAGE'), false, 'public não tem USAGE no schema strategy');
select is(has_schema_privilege('anon', 'strategy', 'USAGE'), false, 'anon não tem USAGE no schema strategy');
select is((select count(*)::int from information_schema.table_privileges
            where table_schema = 'strategy' and grantee = 'anon'), 0, 'anon não tem privilégio nas tabelas');
select is((select array_agg(role_key order by role_key) from core.role_permissions where permission_key = 'strategy.write'),
          array['admin','marketing_manager','owner'], 'Owner, Admin e Gestor operam a estratégia');
select is((select array_agg(role_key order by role_key) from core.role_permissions where permission_key = 'strategy.read'),
          array['admin','marketing_manager','owner','viewer'], 'todos os papéis leem a estratégia');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'strategy' and p.proname like 'guard\_%'
              and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('public', p.oid, 'EXECUTE'))),
          0, 'funções de guarda não são executáveis por authenticated nem public');

-- Campos JSON ausentes não podem passar como SQL NULL nos CHECKs.
select is(strategy.kpis_valid('[{}]'::jsonb), false, 'KPI vazio não atende aos campos obrigatórios');
select is((select bool_and(strategy.kpis_valid(jsonb_build_array(
  '{"key":"a","name":"A","metric":"m","unit":"u","target":1}'::jsonb - campo)) is false)
  from unnest(array['key','name','metric','unit','target']) as campo), true,
  'cada campo obrigatório do KPI é validado quando ausente');
select is(strategy.method_valid('{"situation":"S","pain":"P","consequence":"C","desire":"D","mechanism":"M","proof":"P","extra":"X"}'::jsonb),
  false, 'sete chaves não substituem os sete elementos canônicos');
select is(strategy.method_complete('{"situation":"S","pain":"P","consequence":"C","desire":"D","mechanism":"M","proof":"P"}'::jsonb),
  false, 'elemento ausente não é ignorado ao verificar método completo');

-- ---------------------------------------------------------- contexto: Owner de T5
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000001-0000-4000-8000-000000000001', true);
select set_config('app.tenant_id', :'T5', true);

-- Objetivo e indicadores
select lives_ok($$insert into strategy.objectives (tenant_id, id, name, period_start, period_end, kpis, created_by)
  values ('55555555-5555-4555-8555-555555555555','01000000-0000-4000-8000-000000000001','Gerar demanda','2026-10-01','2026-12-31',
          '[{"key":"reunioes","name":"Reuniões","metric":"reuniões marcadas","unit":"reuniões","target":20}]','a1000001-0000-4000-8000-000000000001')$$,
  'Owner cria objetivo com indicador');
select throws_ok($$insert into strategy.objectives (tenant_id, name, period_start, period_end, kpis, created_by)
  values ('55555555-5555-4555-8555-555555555555','X','2026-10-01','2026-12-31','[]','a1000001-0000-4000-8000-000000000001')$$,
  '23514', null, 'objetivo sem indicador é recusado');
select throws_ok($$insert into strategy.objectives (tenant_id, name, period_start, period_end, kpis, created_by)
  values ('55555555-5555-4555-8555-555555555555','X','2026-10-01','2026-12-31','[{"key":"a","name":"A","metric":"m","unit":"u","target":0}]','a1000001-0000-4000-8000-000000000001')$$,
  '23514', null, 'indicador com alvo zero é recusado');
select throws_ok($$insert into strategy.objectives (tenant_id, name, period_start, period_end, kpis, created_by)
  values ('55555555-5555-4555-8555-555555555555','X','2026-12-31','2026-10-01','[{"key":"a","name":"A","metric":"m","unit":"u","target":1}]','a1000001-0000-4000-8000-000000000001')$$,
  '23514', null, 'período com fim anterior ao início é recusado');
select throws_ok($$insert into strategy.objectives (tenant_id, name, period_start, period_end, kpis, created_by)
  values ('55555555-5555-4555-8555-555555555555','X','2026-10-01','2026-12-31',
          '[{"key":"a","name":"A","metric":"m","unit":"u","target":1},{"key":"a","name":"B","metric":"m","unit":"u","target":1}]','a1000001-0000-4000-8000-000000000001')$$,
  '23514', null, 'chaves de indicador repetidas são recusadas');
select throws_ok($$insert into strategy.objectives (tenant_id, name, period_start, period_end, kpis, created_by)
  values ('66666666-6666-4666-8666-666666666666','X','2026-10-01','2026-12-31','[{"key":"a","name":"A","metric":"m","unit":"u","target":1}]','a1000001-0000-4000-8000-000000000001')$$,
  '42501', null, 'Owner de T5 não cria objetivo em T6');
select lives_ok($$update strategy.objectives set is_primary = true, revision = revision + 1
  where tenant_id = '55555555-5555-4555-8555-555555555555' and id = '01000000-0000-4000-8000-000000000001'$$, 'objetivo principal definido');
select lives_ok($$insert into strategy.objectives (tenant_id, id, name, period_start, period_end, kpis, created_by)
  values ('55555555-5555-4555-8555-555555555555','01000000-0000-4000-8000-000000000002','Segundo','2026-10-01','2026-12-31',
          '[{"key":"a","name":"A","metric":"m","unit":"u","target":1}]','a1000001-0000-4000-8000-000000000001')$$, 'segundo objetivo (não principal)');
select throws_ok($$update strategy.objectives set is_primary = true
  where tenant_id = '55555555-5555-4555-8555-555555555555' and id = '01000000-0000-4000-8000-000000000002'$$,
  '23505', null, 'no máximo um objetivo principal por empresa');

-- Campanha: método, chave, FK composta
select lives_ok($$insert into strategy.campaigns (tenant_id, id, name, objective_id, method, tracking_key, created_by)
  values ('55555555-5555-4555-8555-555555555555','c1000000-0000-4000-8000-000000000001','Lançamento','01000000-0000-4000-8000-000000000001',
          '{"situation":"S","pain":"D","consequence":"C","desire":"E","mechanism":"M","proof":"P","offer":"O"}','lancamento','a1000001-0000-4000-8000-000000000001')$$,
  'Owner cria campanha planejada com método e chave');
select throws_ok($$insert into strategy.campaigns (tenant_id, method, tracking_key, created_by)
  values ('55555555-5555-4555-8555-555555555555','{"situation":"S"}','','a1000001-0000-4000-8000-000000000001')$$,
  '23514', null, 'método com elementos faltando é malformado');
select throws_ok($$insert into strategy.campaigns (tenant_id, method, tracking_key, created_by)
  values ('55555555-5555-4555-8555-555555555555','{"situation":"","pain":"","consequence":"","desire":"","mechanism":"","proof":"","offer":""}','Chave Ruim','a1000001-0000-4000-8000-000000000001')$$,
  '23514', null, 'chave de rastreamento fora do formato é recusada');
select throws_ok($$insert into strategy.campaigns (tenant_id, method, tracking_key, created_by)
  values ('55555555-5555-4555-8555-555555555555','{"situation":"","pain":"","consequence":"","desire":"","mechanism":"","proof":"","offer":""}','lancamento','a1000001-0000-4000-8000-000000000001')$$,
  '23505', null, 'chave de rastreamento é única por empresa');
select lives_ok($$insert into strategy.campaigns (tenant_id, id, method, created_by)
  values ('55555555-5555-4555-8555-555555555555','c1000000-0000-4000-8000-000000000002',
          '{"situation":"","pain":"","consequence":"","desire":"","mechanism":"","proof":"","offer":""}','a1000001-0000-4000-8000-000000000001')$$,
  'rascunhos sem chave não colidem');
select throws_ok($$insert into strategy.campaigns (tenant_id, method, status, created_by)
  values ('55555555-5555-4555-8555-555555555555','{"situation":"","pain":"","consequence":"","desire":"","mechanism":"","proof":"","offer":""}','active','a1000001-0000-4000-8000-000000000001')$$,
  '23514', 'campanha nasce planejada', 'campanha não nasce ativa');
select throws_ok($$insert into strategy.campaigns (tenant_id, objective_id, method, created_by)
  values ('55555555-5555-4555-8555-555555555555','01000000-0000-4000-8000-0000000000ff',
          '{"situation":"","pain":"","consequence":"","desire":"","mechanism":"","proof":"","offer":""}','a1000001-0000-4000-8000-000000000001')$$,
  '23503', null, 'campanha não referencia objetivo inexistente (FK composta)');

-- Ativação exige método completo
select throws_ok($$update strategy.campaigns set status = 'active', activated_at = now(), revision = revision + 1
  where tenant_id = '55555555-5555-4555-8555-555555555555' and id = 'c1000000-0000-4000-8000-000000000002'$$,
  '23514', 'não é possível ativar: nome, método completo e chave de rastreamento são obrigatórios', 'ativar sem método/nome/chave é recusado pelo banco');
select throws_ok($$update strategy.campaigns set status = 'paused', activated_at = now()
  where tenant_id = '55555555-5555-4555-8555-555555555555' and id = 'c1000000-0000-4000-8000-000000000001'$$,
  '23514', 'transição de estado da campanha inválida: draft -> paused', 'planejada não pausa');
select lives_ok($$update strategy.campaigns set status = 'active', activated_at = now(), revision = revision + 1
  where tenant_id = '55555555-5555-4555-8555-555555555555' and id = 'c1000000-0000-4000-8000-000000000001'$$, 'campanha completa é ativada');
select throws_ok($$update strategy.campaigns set tracking_key = 'outra-chave' where tenant_id = '55555555-5555-4555-8555-555555555555' and id = 'c1000000-0000-4000-8000-000000000001'$$,
  '23514', 'a chave de rastreamento não muda depois da ativação', 'chave fixa depois da ativação');
select throws_ok($$update strategy.campaigns set name = 'Outro nome' where tenant_id = '55555555-5555-4555-8555-555555555555' and id = 'c1000000-0000-4000-8000-000000000001'$$,
  '23514', 'campanha ativa não tem o conteúdo editado', 'conteúdo da campanha ativa não é editado');
select lives_ok($$update strategy.campaigns set status = 'paused', revision = revision + 1 where tenant_id = '55555555-5555-4555-8555-555555555555' and id = 'c1000000-0000-4000-8000-000000000001'$$, 'ativa pausa');
select throws_ok($$update strategy.campaigns set tracking_key = 'outra-chave' where tenant_id = '55555555-5555-4555-8555-555555555555' and id = 'c1000000-0000-4000-8000-000000000001'$$,
  '23514', 'a chave de rastreamento não muda depois da ativação', 'chave também fixa na campanha pausada');
select lives_ok($$update strategy.campaigns set status = 'active', revision = revision + 1 where tenant_id = '55555555-5555-4555-8555-555555555555' and id = 'c1000000-0000-4000-8000-000000000001'$$, 'pausada é retomada');

-- Teste por hipótese
select lives_ok($$insert into strategy.experiments (tenant_id, id, campaign_id, hypothesis, dimension, variants, decision_metric, minimum_sample, created_by)
  values ('55555555-5555-4555-8555-555555555555','e1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','Abrir pela dor aumenta reuniões.','hook',
          '["Gancho pela dor","Gancho pelo ganho"]','reuniões marcadas',30,'a1000001-0000-4000-8000-000000000001')$$, 'teste planejado com hipótese');
select throws_ok($$insert into strategy.experiments (tenant_id, campaign_id, hypothesis, dimension, variants, decision_metric, minimum_sample, created_by)
  values ('55555555-5555-4555-8555-555555555555','c1000000-0000-4000-8000-000000000001','H','hook','["única"]','m',30,'a1000001-0000-4000-8000-000000000001')$$,
  '23514', null, 'teste com uma só variante não é teste');
select throws_ok($$insert into strategy.experiments (tenant_id, campaign_id, hypothesis, dimension, variants, decision_metric, minimum_sample, created_by)
  values ('55555555-5555-4555-8555-555555555555','c1000000-0000-4000-8000-000000000001','H','hook','["Igual"," igual "]','m',30,'a1000001-0000-4000-8000-000000000001')$$,
  '23514', null, 'variantes repetidas (ignorando caixa e espaços) são recusadas');
select throws_ok($$insert into strategy.experiments (tenant_id, campaign_id, hypothesis, dimension, variants, decision_metric, minimum_sample, created_by)
  values ('55555555-5555-4555-8555-555555555555','c1000000-0000-4000-8000-000000000001','','hook','["A","B"]','m',30,'a1000001-0000-4000-8000-000000000001')$$,
  '23514', null, 'teste sem hipótese é recusado');
select throws_ok($$insert into strategy.experiments (tenant_id, campaign_id, hypothesis, dimension, variants, decision_metric, minimum_sample, created_by)
  values ('55555555-5555-4555-8555-555555555555','c1000000-0000-4000-8000-000000000001','H','other','["A","B"]','m',30,'a1000001-0000-4000-8000-000000000001')$$,
  '23514', null, 'dimensão `other` exige descrição');
select throws_ok($$insert into strategy.experiments (tenant_id, campaign_id, hypothesis, dimension, variants, decision_metric, minimum_sample, status, started_at, created_by)
  values ('55555555-5555-4555-8555-555555555555','c1000000-0000-4000-8000-000000000001','H','hook','["A","B"]','m',30,'running',now(),'a1000001-0000-4000-8000-000000000001')$$,
  '23514', 'teste nasce planejado: a hipótese é registrada antes da execução', 'teste não nasce em execução (hipótese antes)');
select throws_ok($$update strategy.experiments set hypothesis = 'trocada' where tenant_id = '55555555-5555-4555-8555-555555555555' and id = 'e1000000-0000-4000-8000-000000000001'$$,
  '23514', 'o plano do teste é imutável depois de registrado', 'hipótese não muda depois de registrada');
select throws_ok($$update strategy.experiments set status = 'concluded', started_at = now(), concluded_at = now(),
  result = '{"outcome":"supported","observedSample":40,"limitations":""}' where tenant_id = '55555555-5555-4555-8555-555555555555' and id = 'e1000000-0000-4000-8000-000000000001'$$,
  '23514', 'transição de estado do teste inválida: planned -> concluded', 'planejado não conclui sem executar');
select lives_ok($$update strategy.experiments set status = 'running', started_at = now(), revision = revision + 1
  where tenant_id = '55555555-5555-4555-8555-555555555555' and id = 'e1000000-0000-4000-8000-000000000001'$$, 'teste inicia com a campanha ativa');
select throws_ok($$update strategy.experiments set status = 'concluded', concluded_at = now(),
  result = '{"outcome":"supported","limitations":""}' where tenant_id = '55555555-5555-4555-8555-555555555555' and id = 'e1000000-0000-4000-8000-000000000001'$$,
  '23514', 'resultado do teste inválido', 'amostra ausente não autoriza concluir o teste');
select throws_ok($$update strategy.experiments set status = 'concluded', concluded_at = now(),
  result = '{"outcome":"supported","observedSample":30,"limitations":""}', learning = '{"summary":"X","campaignVersion":1}'
  where tenant_id = '55555555-5555-4555-8555-555555555555' and id = 'e1000000-0000-4000-8000-000000000001'$$,
  '23514', 'aprendizado exige resumo, evidência e versão', 'evidência ausente no aprendizado é recusada');
select throws_ok($$update strategy.experiments set status = 'concluded', concluded_at = now(),
  result = '{"outcome":"supported","observedSample":12,"limitations":""}' where tenant_id = '55555555-5555-4555-8555-555555555555' and id = 'e1000000-0000-4000-8000-000000000001'$$,
  '23514', 'amostra insuficiente: registre como inconclusivo', 'sucesso com amostra insuficiente é recusado');
select throws_ok($$update strategy.experiments set status = 'concluded', concluded_at = now(),
  result = '{"outcome":"inconclusive","observedSample":12,"limitations":""}' where tenant_id = '55555555-5555-4555-8555-555555555555' and id = 'e1000000-0000-4000-8000-000000000001'$$,
  '23514', 'resultado inconclusivo exige a limitação', 'inconclusivo sem limitação é recusado');
select lives_ok($$update strategy.experiments set status = 'concluded', concluded_at = now(), revision = revision + 1,
  result = '{"outcome":"inconclusive","observedSample":12,"limitations":"Janela curta."}' where tenant_id = '55555555-5555-4555-8555-555555555555' and id = 'e1000000-0000-4000-8000-000000000001'$$,
  'insuficiente conclui como inconclusivo, com a limitação');
select throws_ok($$update strategy.experiments set result = '{"outcome":"supported","observedSample":99,"limitations":""}' where tenant_id = '55555555-5555-4555-8555-555555555555' and id = 'e1000000-0000-4000-8000-000000000001'$$,
  '23514', 'teste encerrado é imutável', 'teste concluído é imutável');

-- Tarefas e dependências
select lives_ok($$insert into strategy.tasks (tenant_id, id, title, campaign_id, created_by) values
  ('55555555-5555-4555-8555-555555555555','71000000-0000-4000-8000-000000000001','A','c1000000-0000-4000-8000-000000000001','a1000001-0000-4000-8000-000000000001'),
  ('55555555-5555-4555-8555-555555555555','71000000-0000-4000-8000-000000000002','B',null,'a1000001-0000-4000-8000-000000000001'),
  ('55555555-5555-4555-8555-555555555555','71000000-0000-4000-8000-000000000003','C',null,'a1000001-0000-4000-8000-000000000001')$$, 'tarefas criadas');
select lives_ok($$insert into strategy.task_dependencies (tenant_id, task_id, depends_on_id) values
  ('55555555-5555-4555-8555-555555555555','71000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000001'),
  ('55555555-5555-4555-8555-555555555555','71000000-0000-4000-8000-000000000003','71000000-0000-4000-8000-000000000002')$$, 'dependências A←B←C aceitas');
select throws_ok($$insert into strategy.task_dependencies (tenant_id, task_id, depends_on_id)
  values ('55555555-5555-4555-8555-555555555555','71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000003')$$,
  '23514', 'a dependência criaria um ciclo entre tarefas', 'ciclo transitivo é recusado pelo banco');
select throws_ok($$insert into strategy.task_dependencies (tenant_id, task_id, depends_on_id)
  values ('55555555-5555-4555-8555-555555555555','71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001')$$,
  '23514', null, 'auto-dependência é recusada');
select throws_ok($$insert into strategy.tasks (tenant_id, title, campaign_id, created_by)
  values ('55555555-5555-4555-8555-555555555555','Z','c1000000-0000-4000-8000-0000000000ff','a1000001-0000-4000-8000-000000000001')$$,
  '23503', null, 'tarefa não referencia campanha inexistente (FK composta)');
select throws_ok($$insert into strategy.tasks (tenant_id, title, assignee_kind, created_by)
  values ('55555555-5555-4555-8555-555555555555','Z','agent','a1000001-0000-4000-8000-000000000001')$$,
  '23514', null, 'responsável incompleto é recusado');
select throws_ok($$delete from strategy.tasks where tenant_id = '55555555-5555-4555-8555-555555555555' and id = '71000000-0000-4000-8000-000000000003'$$,
  '42501', null, 'a aplicação não tem privilégio de excluir tarefa');

-- --------------------------------------------------------------- Gestor e Leitor
select set_config('request.jwt.claim.sub', 'a1000002-0000-4000-8000-000000000002', true);
select lives_ok($$insert into strategy.tasks (tenant_id, title, created_by)
  values ('55555555-5555-4555-8555-555555555555','Tarefa do gestor','a1000002-0000-4000-8000-000000000002')$$, 'Gestor cria tarefa');

select set_config('request.jwt.claim.sub', 'a1000003-0000-4000-8000-000000000003', true);
select is((select count(*)::int from strategy.campaigns), 2, 'Leitor enxerga as campanhas da empresa');
select is((select count(*)::int from strategy.tasks), 4, 'Leitor enxerga as tarefas');
select throws_ok($$insert into strategy.tasks (tenant_id, title, created_by)
  values ('55555555-5555-4555-8555-555555555555','invasão','a1000003-0000-4000-8000-000000000003')$$, '42501', null, 'Leitor não cria tarefa');
with u as (update strategy.campaigns set status = 'cancelled', activated_at = activated_at where tenant_id = '55555555-5555-4555-8555-555555555555' returning 1)
select is(count(*)::int, 0, 'Leitor não altera campanha (nenhuma linha afetada)') from u;
select throws_ok($$insert into strategy.task_dependencies (tenant_id, task_id, depends_on_id)
  values ('55555555-5555-4555-8555-555555555555','71000000-0000-4000-8000-000000000003','71000000-0000-4000-8000-000000000001')$$, '42501', null, 'Leitor não cria dependência');

-- O dono do banco (RLS ignorada) também respeita as guardas.
reset role;
select throws_ok($$delete from strategy.campaigns where tenant_id = '55555555-5555-4555-8555-555555555555' and id = 'c1000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'trigger: campanha não é excluída');
select throws_ok($$update strategy.campaigns set tracking_key = 'burla' where tenant_id = '55555555-5555-4555-8555-555555555555' and id = 'c1000000-0000-4000-8000-000000000001'$$,
  '23514', 'a chave de rastreamento não muda depois da ativação', 'trigger: chave fixa também para o dono do banco');

-- ---------------------------------------------------------- isolamento entre empresas
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000006-0000-4000-8000-000000000006', true);
select set_config('app.tenant_id', :'T6', true);
select is((select count(*)::int from strategy.objectives) + (select count(*)::int from strategy.campaigns) + (select count(*)::int from strategy.experiments)
          + (select count(*)::int from strategy.tasks) + (select count(*)::int from strategy.task_dependencies),
          0, 'Owner de T6 não enxerga nada da estratégia de T5');
select throws_ok($$insert into strategy.campaigns (tenant_id, objective_id, method, created_by)
  values ('66666666-6666-4666-8666-666666666666','01000000-0000-4000-8000-000000000001',
          '{"situation":"","pain":"","consequence":"","desire":"","mechanism":"","proof":"","offer":""}','b1000006-0000-4000-8000-000000000006')$$,
  '23503', null, 'campanha de T6 não referencia objetivo de T5 (FK composta)');
select throws_ok($$insert into strategy.tasks (tenant_id, title, campaign_id, created_by)
  values ('66666666-6666-4666-8666-666666666666','X','c1000000-0000-4000-8000-000000000001','b1000006-0000-4000-8000-000000000006')$$,
  '23503', null, 'tarefa de T6 não referencia campanha de T5 (FK composta)');
select lives_ok($$insert into strategy.campaigns (tenant_id, method, tracking_key, created_by)
  values ('66666666-6666-4666-8666-666666666666',
          '{"situation":"","pain":"","consequence":"","desire":"","mechanism":"","proof":"","offer":""}','lancamento','b1000006-0000-4000-8000-000000000006')$$,
  'a mesma chave de rastreamento é livre em outra empresa');
select throws_ok($$insert into strategy.task_dependencies (tenant_id, task_id, depends_on_id)
  values ('66666666-6666-4666-8666-666666666666','71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002')$$,
  '23503', null, 'dependência de T6 não referencia tarefas de T5');
-- Sem oráculo entre empresas: a mesma aresta que fecharia ciclo em T5 é negada por RLS (42501), não por ciclo.
select throws_ok($$insert into strategy.task_dependencies (tenant_id, task_id, depends_on_id)
  values ('55555555-5555-4555-8555-555555555555','71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000003')$$,
  '42501', null, 'T6 não descobre ciclos de T5: a negação é da RLS');
select throws_ok($$insert into strategy.experiments (tenant_id, campaign_id, hypothesis, dimension, variants, decision_metric, minimum_sample, created_by)
  values ('55555555-5555-4555-8555-555555555555','c1000000-0000-4000-8000-000000000001','H','hook','["A","B"]','m',30,'b1000006-0000-4000-8000-000000000006')$$,
  null, null, 'T6 não cria teste em campanha de T5');
-- Fixar o contexto do teste: nenhum UPDATE cross-tenant pode ser atribuído ao superusuário da fixture.
select is(current_user::text, 'authenticated', 'UPDATE cross-tenant usa o papel authenticated');
select is((select rolsuper or rolbypassrls from pg_roles where rolname = current_user), false,
  'papel do UPDATE cross-tenant não é superuser nem BYPASSRLS');
select is(current_setting('app.tenant_id'), :'T6', 'UPDATE cross-tenant fixa explicitamente o tenant T6');
with u as (update strategy.campaigns set name = 'invasão' where tenant_id = '55555555-5555-4555-8555-555555555555' returning tenant_id::text as t)
select is((select string_agg(t, ',') from u), null, 'Owner de T6 não altera campanha de T5') ;select throws_ok($$update strategy.campaigns set tenant_id = '55555555-5555-4555-8555-555555555555' where tenant_id = '66666666-6666-4666-8666-666666666666'$$,
  null, null, 'campanha não troca de empresa');

-- Sem sessão (anon): nada.
reset role;
set local role anon;
select throws_ok($$select count(*) from strategy.campaigns$$, '42501', null, 'anon não acessa a estratégia');

select * from finish();
rollback;
