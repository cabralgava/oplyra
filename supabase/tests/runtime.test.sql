-- I-02 (local) — Product Agent Runtime: fronteira por papel, lease/fencing, idempotência, checkpoint,
-- kill switch, guardas e isolamento entre empresas. Roda com `supabase test db`.
-- Usa empresas próprias (T7/T8), criadas e descartadas na transação. O tempo é controlado pelos
-- parâmetros `p_now` das funções, não pelo relógio do banco.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- A sessão de teste precisa poder assumir o papel do worker. A concessão vale só nesta transação (rollback ao fim).
grant oplyra_worker_exec to current_user;
-- O worker precisa enxergar as funções do pgTAP para o teste rodar sob o papel; vale só nesta transação.
grant usage on schema extensions to oplyra_worker_exec;

\set T7 '77777777-7777-4777-8777-777777777777'
\set T8 '88888888-8888-4888-8888-888888888888'

insert into core.tenants (id, name, slug) values
  ('77777777-7777-4777-8777-777777777777', 'Eta Runtime (pgTAP)', 'eta-runtime-pgtap'),
  ('88888888-8888-4888-8888-888888888888', 'Theta Runtime (pgTAP)', 'theta-runtime-pgtap');
insert into core.memberships (tenant_id, user_id, role_key) values
  ('77777777-7777-4777-8777-777777777777', 'a2000001-0000-4000-8000-000000000001', 'owner'),
  ('77777777-7777-4777-8777-777777777777', 'a2000002-0000-4000-8000-000000000002', 'marketing_manager'),
  ('77777777-7777-4777-8777-777777777777', 'a2000003-0000-4000-8000-000000000003', 'viewer'),
  ('88888888-8888-4888-8888-888888888888', 'b2000006-0000-4000-8000-000000000006', 'owner');

-- ------------------------------------------------------- estrutura e privilégios
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'runtime' and c.relkind = 'r' and c.relname in ('agent_runs','run_steps','kill_switches')
              and c.relrowsecurity and c.relforcerowsecurity), 3, 'RLS habilitada E forçada nas três tabelas do runtime');
select is((select count(*)::int from information_schema.table_privileges
            where table_schema = 'runtime' and grantee in ('anon','authenticated','public','oplyra_web_login','oplyra_worker_login','oplyra_worker_exec','oplyra_ops_exec','oplyra_dispatcher_exec')),
          0, 'nenhum papel tem privilégio de tabela no runtime');
select is(has_schema_privilege('public', 'runtime', 'USAGE') or has_schema_privilege('authenticated', 'runtime', 'USAGE')
          or has_schema_privilege('oplyra_worker_exec', 'runtime', 'USAGE') or has_schema_privilege('anon', 'runtime', 'USAGE'),
          false, 'ninguém tem USAGE no schema runtime');
select is((select array_agg(role_key order by role_key) from core.role_permissions where permission_key = 'runtime.operate'),
          array['admin','marketing_manager','owner'], 'Owner, Admin e Gestor operam o runtime');
select is((select array_agg(role_key order by role_key) from core.role_permissions where permission_key = 'runtime.read'),
          array['admin','marketing_manager','owner','viewer'], 'todos os papéis leem o runtime');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('app','runtime') and (p.proname in ('runtime_caller','runtime_lock_lease','runtime_run_json','runtime_step_json') or p.proname like 'guard\_run' or p.proname like 'guard\_step')
              and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('oplyra_worker_exec', p.oid, 'EXECUTE') or has_function_privilege('public', p.oid, 'EXECUTE'))),
          0, 'helpers e guardas não são executáveis por nenhum papel');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app' and p.proname in ('runtime_claim','runtime_heartbeat','runtime_begin_step','runtime_abort_step','runtime_complete_step','runtime_settle')
              and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('public', p.oid, 'EXECUTE'))),
          0, 'funções do worker não são executáveis por pessoa');

-- O dono do banco, fora de uma transação com papel, também é recusado.
select throws_ok($$select app.runtime_list('77777777-7777-4777-8777-777777777777', 10)$$, '42501', null, 'sem papel de aplicação a fronteira recusa');

-- ----------------------------------------------------------- Leitor de T7 (pessoa)
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000003-0000-4000-8000-000000000003', true);
select set_config('app.tenant_id', :'T7', true);
select is(app.runtime_list(:'T7', 10), '[]'::jsonb, 'leitor lê a lista (vazia)');
select throws_ok($$select app.runtime_enqueue('77777777-7777-4777-8777-777777777777', '{}'::jsonb, 'user', null, now())$$, '42501', null, 'leitor não submete');
select throws_ok($$select app.runtime_kill_activate('77777777-7777-4777-8777-777777777777', 'x', now())$$, '42501', null, 'leitor não aciona a interrupção');
select throws_ok($$select app.runtime_cancel('77777777-7777-4777-8777-777777777777', gen_random_uuid(), 'x', now())$$, '42501', null, 'leitor não cancela');
select throws_ok($$select count(*) from runtime.agent_runs$$, '42501', null, 'pessoa não lê a tabela diretamente');
select throws_ok($$select app.runtime_claim('77777777-7777-4777-8777-777777777777', 'w', now(), 30)$$, '42501', null, 'pessoa não toma lease (função do worker)');

-- ---------------------------------------------------------- Gestor de T7 (pessoa)
select set_config('request.jwt.claim.sub', 'a2000002-0000-4000-8000-000000000002', true);
select lives_ok($$select set_config('t.run1', (app.runtime_enqueue('77777777-7777-4777-8777-777777777777',
  '{"agentKey":"copywriting-agent","actionKey":"create_copy_variants","trigger":"user","autonomy":"draft","correlationId":"corr-1","idempotencyKey":"idem-1","input":{},"availableAt":"2026-11-11T12:00:00Z","limits":{"maxCostMicroUsd":1000,"maxToolCalls":2,"maxTurns":3,"maxAttempts":2,"timeoutMs":60000}}'::jsonb,
  'system', 'tentando-forjar', '2026-11-11T12:00:00Z')->'run'->>'id'), true)$$, 'Gestor submete uma execução');
select is((app.runtime_enqueue('77777777-7777-4777-8777-777777777777',
  '{"agentKey":"copywriting-agent","actionKey":"create_copy_variants","trigger":"user","autonomy":"draft","correlationId":"corr-1","idempotencyKey":"idem-1","input":{},"availableAt":"2026-11-11T12:00:00Z","limits":{"maxCostMicroUsd":1000,"maxToolCalls":2,"maxTurns":3,"maxAttempts":2,"timeoutMs":60000}}'::jsonb,
  'user', null, '2026-11-11T12:00:01Z'))->>'duplicate', 'true', 'a mesma mensagem entregue de novo é duplicata');
select is((app.runtime_enqueue('77777777-7777-4777-8777-777777777777',
  '{"agentKey":"copywriting-agent","actionKey":"create_copy_variants","trigger":"user","autonomy":"draft","correlationId":"corr-1","idempotencyKey":"idem-1","input":{},"availableAt":"2026-11-11T12:00:00Z","limits":{"maxCostMicroUsd":1000,"maxToolCalls":2,"maxTurns":3,"maxAttempts":2,"timeoutMs":60000}}'::jsonb,
  'user', null, '2026-11-11T12:00:01Z'))->'run'->>'id', current_setting('t.run1'), 'a duplicata devolve a MESMA execução');
select throws_ok($$select app.runtime_enqueue('77777777-7777-4777-8777-777777777777',
  '{"agentKey":"copywriting-agent","actionKey":"create_copy_variants","trigger":"user","autonomy":"draft","correlationId":"c","idempotencyKey":"idem-sem-limite","input":{},"availableAt":"2026-11-11T12:00:00Z","limits":{"maxCostMicroUsd":0,"maxToolCalls":2,"maxTurns":3,"maxAttempts":2,"timeoutMs":60000}}'::jsonb,
  'user', null, now())$$, '23514', null, 'limite zero é recusado pelo banco (sem limite não há execução)');
select throws_ok($$select app.runtime_enqueue('77777777-7777-4777-8777-777777777777',
  '{"agentKey":"Agente Ruim","actionKey":"create_copy_variants","trigger":"user","autonomy":"draft","correlationId":"c","idempotencyKey":"idem-agente","input":{},"availableAt":"2026-11-11T12:00:00Z","limits":{"maxCostMicroUsd":1,"maxToolCalls":1,"maxTurns":1,"maxAttempts":1,"timeoutMs":1}}'::jsonb,
  'user', null, now())$$, '23514', null, 'agente com chave fora do formato é recusado');
select throws_ok($$select app.runtime_enqueue('77777777-7777-4777-8777-777777777777',
  '{"agentKey":"copywriting-agent","actionKey":"create_copy_variants","trigger":"user","autonomy":"super","correlationId":"c","idempotencyKey":"idem-autonomia","input":{},"availableAt":"2026-11-11T12:00:00Z","limits":{"maxCostMicroUsd":1,"maxToolCalls":1,"maxTurns":1,"maxAttempts":1,"timeoutMs":1}}'::jsonb,
  'user', null, now())$$, '23514', null, 'autonomia fora do conjunto canônico é recusada');
select is((app.runtime_get(:'T7', current_setting('t.run1')::uuid))->>'status', 'queued', 'Gestor lê a execução na fila');
select lives_ok($$select app.runtime_kill_activate('77777777-7777-4777-8777-777777777777', 'incidente de custo', '2026-11-11T12:00:02Z')$$, 'Gestor aciona a interrupção da empresa');
select is(app.runtime_kill_effective(:'T7')->>'reason', 'incidente de custo', 'a interrupção carrega o motivo');
select throws_ok($$select app.runtime_kill_activate('77777777-7777-4777-8777-777777777777', '  ', now())$$, '22023', null, 'motivo em branco é recusado');
select lives_ok($$select app.runtime_kill_release('77777777-7777-4777-8777-777777777777', '2026-11-11T12:00:03Z')$$, 'Gestor libera a interrupção');
select is(app.runtime_kill_effective(:'T7'), null, 'sem interrupção ativa o estado efetivo é nulo');

-- Tenant ativo diferente do pedido: recusado mesmo com permissão no ativo.
select throws_ok($$select app.runtime_list('88888888-8888-4888-8888-888888888888', 10)$$, '42501', null, 'tenant pedido diferente do ativo é recusado');

-- --------------------------------------------------------------------- Worker de T7
reset role;
set local role oplyra_worker_exec;
select set_config('app.tenant_id', :'T7', true);
select set_config('app.job_ref', 'pgtap', true);
select throws_ok($$select app.runtime_cancel('77777777-7777-4777-8777-777777777777', gen_random_uuid(), 'x', now())$$, '42501', null, 'worker não cancela (decisão humana)');
select throws_ok($$select app.runtime_kill_activate('77777777-7777-4777-8777-777777777777', 'x', now())$$, '42501', null, 'worker não aciona a interrupção');
select throws_ok($$select count(*) from runtime.agent_runs$$, '42501', null, 'worker não lê a tabela diretamente');
select throws_ok($$select app.runtime_claim('88888888-8888-4888-8888-888888888888', 'w1', now(), 30)$$, '42501', null, 'worker com tenant ativo T7 não toma lease de T8');
select lives_ok($$select set_config('t.claim1', app.runtime_claim('77777777-7777-4777-8777-777777777777', 'w1', '2026-11-11T12:00:10Z', 30)::text, true)$$, 'worker toma o lease');
select is(current_setting('t.claim1')::jsonb #>> '{lease,attempt}', '1', 'primeira tentativa');
select is(current_setting('t.claim1')::jsonb #>> '{run,status}', 'running', 'a execução passa a rodar');
select is(current_setting('t.claim1')::jsonb #>> '{run,deadlineAt}' is not null, true, 'o prazo é fixado na primeira tomada');
select is(app.runtime_claim(:'T7', 'w2', '2026-11-11T12:00:11Z', 30), null, 'com o lease válido ninguém mais toma a execução');
select lives_ok($$select app.runtime_heartbeat('77777777-7777-4777-8777-777777777777', (current_setting('t.claim1')::jsonb #>> '{lease,runId}')::uuid, 1, current_setting('t.claim1')::jsonb #>> '{lease,fencingToken}', '2026-11-11T12:00:12Z', 30)$$, 'heartbeat do dono do lease');
select lives_ok($$select app.runtime_begin_step('77777777-7777-4777-8777-777777777777', (current_setting('t.claim1')::jsonb #>> '{lease,runId}')::uuid, 1, current_setting('t.claim1')::jsonb #>> '{lease,fencingToken}', 'a', false, '2026-11-11T12:00:13Z')$$, 'passo iniciado');
select is((app.runtime_complete_step('77777777-7777-4777-8777-777777777777', (current_setting('t.claim1')::jsonb #>> '{lease,runId}')::uuid, 1, current_setting('t.claim1')::jsonb #>> '{lease,fencingToken}', 'a', '{"k":"a"}'::jsonb, 100, 0, 1, '2026-11-11T12:00:14Z'))->>'replayed', 'false', 'checkpoint gravado');
select is((app.runtime_complete_step('77777777-7777-4777-8777-777777777777', (current_setting('t.claim1')::jsonb #>> '{lease,runId}')::uuid, 1, current_setting('t.claim1')::jsonb #>> '{lease,fencingToken}', 'a', '{"k":"a"}'::jsonb, 100, 0, 1, '2026-11-11T12:00:15Z'))#>>'{run,usage,costMicroUsd}', '100', 'repetir o checkpoint NÃO soma o uso de novo');
select is((app.runtime_complete_step('77777777-7777-4777-8777-777777777777', (current_setting('t.claim1')::jsonb #>> '{lease,runId}')::uuid, 1, current_setting('t.claim1')::jsonb #>> '{lease,fencingToken}', 'a', '{"k":"a"}'::jsonb, 100, 0, 1, '2026-11-11T12:00:16Z'))->>'replayed', 'true', 'a repetição é reconhecida');
select throws_ok($$select app.runtime_complete_step('77777777-7777-4777-8777-777777777777', (current_setting('t.claim1')::jsonb #>> '{lease,runId}')::uuid, 1, current_setting('t.claim1')::jsonb #>> '{lease,fencingToken}', 'nao-iniciado', '1'::jsonb, 0, 0, 0, now())$$, '55000', null, 'checkpoint de passo não iniciado é recusado');
-- Efeito iniciado e nunca concluído (a queda do processo): fica registrado como passo sem checkpoint.
select lives_ok($$select app.runtime_begin_step('77777777-7777-4777-8777-777777777777', (current_setting('t.claim1')::jsonb #>> '{lease,runId}')::uuid, 1, current_setting('t.claim1')::jsonb #>> '{lease,fencingToken}', 'envio', true, '2026-11-11T12:00:17Z')$$, 'passo com efeito iniciado e nunca concluído');

-- Lease vence (12:00:12 + 30s); outro worker retoma.
select lives_ok($$select set_config('t.claim2', app.runtime_claim('77777777-7777-4777-8777-777777777777', 'w2', '2026-11-11T12:01:00Z', 30)::text, true)$$, 'lease vencido é retomado por outro worker');
select is(current_setting('t.claim2')::jsonb #>> '{lease,attempt}', '2', 'a tentativa sobe');
select isnt(current_setting('t.claim2')::jsonb #>> '{lease,fencingToken}', current_setting('t.claim1')::jsonb #>> '{lease,fencingToken}', 'o fencing token é rotacionado');
select is(jsonb_array_length(current_setting('t.claim2')::jsonb -> 'steps'), 2, 'a retomada entrega os passos já registrados');
select is((select count(*)::int from jsonb_array_elements(current_setting('t.claim2')::jsonb -> 'steps') s where s->>'stepKey' = 'envio' and s->'checkpoint' = 'null'::jsonb and (s->>'effectful')::boolean), 1, 'o passo com efeito sem checkpoint chega marcado, para escalonar');
-- O worker obsoleto (tentativa 1, token antigo) tenta gravar.
select throws_ok($$select app.runtime_heartbeat('77777777-7777-4777-8777-777777777777', (current_setting('t.claim1')::jsonb #>> '{lease,runId}')::uuid, 1, current_setting('t.claim1')::jsonb #>> '{lease,fencingToken}', now(), 30)$$, '55000', 'RUN_ATTEMPT_STALE: tentativa ou fencing token obsoleto', 'heartbeat obsoleto é rejeitado');
select throws_ok($$select app.runtime_begin_step('77777777-7777-4777-8777-777777777777', (current_setting('t.claim1')::jsonb #>> '{lease,runId}')::uuid, 1, current_setting('t.claim1')::jsonb #>> '{lease,fencingToken}', 'b', false, now())$$, '55000', null, 'passo obsoleto é rejeitado');
select throws_ok($$select app.runtime_complete_step('77777777-7777-4777-8777-777777777777', (current_setting('t.claim1')::jsonb #>> '{lease,runId}')::uuid, 1, current_setting('t.claim1')::jsonb #>> '{lease,fencingToken}', 'envio', '1'::jsonb, 0, 0, 0, now())$$, '55000', null, 'checkpoint obsoleto é rejeitado');
select throws_ok($$select app.runtime_settle('77777777-7777-4777-8777-777777777777', (current_setting('t.claim1')::jsonb #>> '{lease,runId}')::uuid, 1, current_setting('t.claim1')::jsonb #>> '{lease,fencingToken}', 'completed', null, null, false, now())$$, '55000', null, 'settlement obsoleto é rejeitado');
-- Mesma tentativa, token adulterado.
select throws_ok($$select app.runtime_settle('77777777-7777-4777-8777-777777777777', (current_setting('t.claim2')::jsonb #>> '{lease,runId}')::uuid, 2, 'token-adulterado', 'completed', null, null, false, now())$$, '55000', null, 'token adulterado na tentativa atual é rejeitado');
-- Validações do settlement.
select throws_ok($$select app.runtime_settle('77777777-7777-4777-8777-777777777777', (current_setting('t.claim2')::jsonb #>> '{lease,runId}')::uuid, 2, current_setting('t.claim2')::jsonb #>> '{lease,fencingToken}', 'failed', null, null, false, now())$$, '22023', null, 'falha exige erro estruturado');
select throws_ok($$select app.runtime_settle('77777777-7777-4777-8777-777777777777', (current_setting('t.claim2')::jsonb #>> '{lease,runId}')::uuid, 2, current_setting('t.claim2')::jsonb #>> '{lease,fencingToken}', 'retry', '{"code":"X"}'::jsonb, '2026-11-11T12:00:00Z', false, '2026-11-11T12:01:01Z')$$, '22023', null, 'retentativa exige disponibilidade futura');
-- Efeito incerto escalado pela aplicação: falha com needsHuman.
select is((app.runtime_settle('77777777-7777-4777-8777-777777777777', (current_setting('t.claim2')::jsonb #>> '{lease,runId}')::uuid, 2, current_setting('t.claim2')::jsonb #>> '{lease,fencingToken}', 'failed',
  '{"code":"EFFECT_UNCERTAIN","category":"system","retryable":false,"message":"x"}'::jsonb, null, true, '2026-11-11T12:01:02Z'))->>'needsHuman', 'true', 'efeito incerto encerra com escalonamento humano');
select is(app.runtime_claim(:'T7', 'w3', '2026-11-11T12:10:00Z', 30), null, 'execução em dead-letter não é entregue de novo');

-- Retentativa com espera e esgotamento de tentativas.
select lives_ok($$select app.runtime_enqueue('77777777-7777-4777-8777-777777777777',
  '{"agentKey":"copywriting-agent","actionKey":"create_copy_variants","trigger":"schedule","autonomy":"draft","correlationId":"corr-2","idempotencyKey":"idem-retry","input":{},"availableAt":"2026-11-11T13:00:00Z","limits":{"maxCostMicroUsd":1000,"maxToolCalls":2,"maxTurns":3,"maxAttempts":2,"timeoutMs":600000}}'::jsonb,
  'schedule', 'sch-1', '2026-11-11T12:30:00Z')$$, 'worker submete como agendamento');
select is(app.runtime_claim(:'T7', 'w1', '2026-11-11T12:59:59Z', 30), null, 'não elegível antes de availableAt');
select lives_ok($$select set_config('t.claim3', app.runtime_claim('77777777-7777-4777-8777-777777777777', 'w1', '2026-11-11T13:00:00Z', 30)::text, true)$$, 'elegível no horário');
select lives_ok($$select app.runtime_settle('77777777-7777-4777-8777-777777777777', (current_setting('t.claim3')::jsonb #>> '{lease,runId}')::uuid, 1, current_setting('t.claim3')::jsonb #>> '{lease,fencingToken}', 'retry',
  '{"code":"PROVIDER_TIMEOUT","category":"timeout","retryable":true,"message":"x"}'::jsonb, '2026-11-11T13:00:05Z', false, '2026-11-11T13:00:01Z')$$, 'retentativa volta à fila com espera');
select is(app.runtime_claim(:'T7', 'w1', '2026-11-11T13:00:04Z', 30), null, 'durante a espera nada é entregue');
select lives_ok($$select set_config('t.claim4', app.runtime_claim('77777777-7777-4777-8777-777777777777', 'w1', '2026-11-11T13:00:05Z', 30)::text, true)$$, 'depois da espera, segunda tentativa');
select is(current_setting('t.claim4')::jsonb #>> '{lease,attempt}', '2', 'a tentativa é a 2');
-- Falha CONHECIDA de um passo com efeito: abortar o tira do estado incerto, sem apagar a trilha.
select lives_ok($$select app.runtime_begin_step('77777777-7777-4777-8777-777777777777', (current_setting('t.claim4')::jsonb #>> '{lease,runId}')::uuid, 2, current_setting('t.claim4')::jsonb #>> '{lease,fencingToken}', 'pago', true, '2026-11-11T13:00:06Z')$$, 'passo pago iniciado');
select lives_ok($$select app.runtime_abort_step('77777777-7777-4777-8777-777777777777', (current_setting('t.claim4')::jsonb #>> '{lease,runId}')::uuid, 2, current_setting('t.claim4')::jsonb #>> '{lease,fencingToken}', 'pago', '2026-11-11T13:00:07Z')$$, 'falha conhecida aborta o passo');
select is((select (s->>'abortedAt') is not null from jsonb_array_elements(app.runtime_steps(:'T7', (current_setting('t.claim4')::jsonb #>> '{lease,runId}')::uuid)) s where s->>'stepKey' = 'pago'), true, 'o aborto fica registrado na trilha');
select throws_ok($$select app.runtime_complete_step('77777777-7777-4777-8777-777777777777', (current_setting('t.claim4')::jsonb #>> '{lease,runId}')::uuid, 2, current_setting('t.claim4')::jsonb #>> '{lease,fencingToken}', 'pago', '1'::jsonb, 0, 0, 0, now())$$, '55000', 'INVALID_STATE_TRANSITION: passo abortado; inicie-o de novo', 'passo abortado não recebe checkpoint sem ser reiniciado');
select throws_ok($$select app.runtime_abort_step('77777777-7777-4777-8777-777777777777', (current_setting('t.claim4')::jsonb #>> '{lease,runId}')::uuid, 2, current_setting('t.claim4')::jsonb #>> '{lease,fencingToken}', 'nao-existe', now())$$, '55000', null, 'abortar passo inexistente é recusado');
select throws_ok($$select app.runtime_abort_step('77777777-7777-4777-8777-777777777777', (current_setting('t.claim4')::jsonb #>> '{lease,runId}')::uuid, 1, 'token-antigo', 'pago', now())$$, '55000', null, 'abortar com tentativa/token obsoletos é recusado');
select lives_ok($$select app.runtime_begin_step('77777777-7777-4777-8777-777777777777', (current_setting('t.claim4')::jsonb #>> '{lease,runId}')::uuid, 2, current_setting('t.claim4')::jsonb #>> '{lease,fencingToken}', 'pago', true, '2026-11-11T13:00:08Z')$$, 'reiniciar o passo abortado limpa o aborto');
select is((select (s->>'abortedAt') is null from jsonb_array_elements(app.runtime_steps(:'T7', (current_setting('t.claim4')::jsonb #>> '{lease,runId}')::uuid)) s where s->>'stepKey' = 'pago'), true, 'passo reiniciado volta a "em andamento"');
-- Cai de novo: o lease vence com maxAttempts=2 → dead-letter na próxima tomada.
select is(app.runtime_claim(:'T7', 'w9', '2026-11-11T13:05:00Z', 30), null, 'abandonada com as tentativas esgotadas não é entregue');

-- ------------------------------------------------------------- Isolamento: T8
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2000006-0000-4000-8000-000000000006', true);
select set_config('app.tenant_id', :'T8', true);
select is(app.runtime_list(:'T8', 10), '[]'::jsonb, 'Owner de T8 não enxerga execuções de T7');
select is(app.runtime_get(:'T8', current_setting('t.run1')::uuid), null, 'get por id de T7, sob T8, não revela existência');
select throws_ok($$select app.runtime_cancel('88888888-8888-4888-8888-888888888888', current_setting('t.run1')::uuid, 'invasão', now())$$, 'P0002', null, 'cancelar execução de T7 sob T8 = não encontrada');
select is(app.runtime_steps(:'T8', current_setting('t.run1')::uuid), '[]'::jsonb, 'passos de T7 não aparecem sob T8');
select throws_ok($$select app.runtime_get('77777777-7777-4777-8777-777777777777', current_setting('t.run1')::uuid)$$, '42501', null, 'pedir T7 com tenant ativo T8 é recusado');
select is((app.runtime_enqueue(:'T8', '{"agentKey":"copywriting-agent","actionKey":"create_copy_variants","trigger":"user","autonomy":"draft","correlationId":"c","idempotencyKey":"idem-1","input":{},"availableAt":"2026-11-11T12:00:00Z","limits":{"maxCostMicroUsd":1,"maxToolCalls":1,"maxTurns":1,"maxAttempts":1,"timeoutMs":1000}}'::jsonb, 'user', null, now()))->>'duplicate',
          'false', 'a mesma chave de idempotência em outra empresa é outra execução');
select is(app.runtime_kill_effective(:'T8'), null, 'a interrupção de T7 não vaza para T8');

-- Interrupção global: escrita só pelo dono do banco; vale para todas as empresas.
reset role;
insert into runtime.kill_switches (tenant_id, scope, active, reason) values (null, 'global', true, 'parada geral (pgTAP)');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2000006-0000-4000-8000-000000000006', true);
select set_config('app.tenant_id', :'T8', true);
select is(app.runtime_kill_effective(:'T8')->>'scope', 'global', 'a interrupção global é vista por qualquer empresa');
select lives_ok($$select app.runtime_kill_activate('88888888-8888-4888-8888-888888888888', 'da empresa T8', now())$$, 'a empresa pode ter a sua além da global');
select is(app.runtime_kill_effective(:'T8')->>'scope', 'global', 'a global prevalece sobre a da empresa');
select lives_ok($$select app.runtime_kill_release('88888888-8888-4888-8888-888888888888', now())$$, 'liberar a da empresa não libera a global');
select is(app.runtime_kill_effective(:'T8')->>'scope', 'global', 'a global continua ativa');

-- ------------------------------------------- Guardas (dono do banco, RLS ignorada)
reset role;
select throws_ok($$update runtime.agent_runs set attempt = 0 where tenant_id = '77777777-7777-4777-8777-777777777777' and status = 'failed'$$, '23514', 'execução encerrada é imutável', 'execução encerrada é imutável');
select throws_ok($$delete from runtime.agent_runs where tenant_id = '77777777-7777-4777-8777-777777777777'$$, '23514', 'execução não é removida', 'execução não é removida diretamente');
select throws_ok($$update runtime.agent_runs set max_cost_micro_usd = 999999 where tenant_id = '88888888-8888-4888-8888-888888888888'$$, '23514', 'identidade e limites da execução são imutáveis', 'limites são imutáveis');
select throws_ok($$update runtime.agent_runs set idempotency_key = 'outra' where tenant_id = '88888888-8888-4888-8888-888888888888'$$, '23514', 'identidade e limites da execução são imutáveis', 'a chave de idempotência é imutável');
select throws_ok($$update runtime.agent_runs set tenant_id = '77777777-7777-4777-8777-777777777777' where tenant_id = '88888888-8888-4888-8888-888888888888'$$, null, null, 'a execução não troca de empresa');
select throws_ok($$update runtime.agent_runs set status = 'completed' where tenant_id = '88888888-8888-4888-8888-888888888888' and status = 'queued'$$, '23514', null, 'fila → concluída direto é inválido (sem lease)');
select throws_ok($$update runtime.agent_runs set cost_micro_usd = cost_micro_usd - 1 where tenant_id = '77777777-7777-4777-8777-777777777777' and cost_micro_usd > 0$$, '23514', null, 'o uso não retrocede');
select throws_ok($$update runtime.run_steps set result = '2'::jsonb where completed_at is not null$$, '23514', 'passo com checkpoint é imutável', 'passo com checkpoint é imutável');
select throws_ok($$delete from runtime.run_steps$$, '23514', 'passo não é removido', 'passo não é removido diretamente');
select throws_ok($$insert into runtime.agent_runs (tenant_id, agent_key, action_key, trigger_kind, autonomy, status, correlation_id, idempotency_key, max_cost_micro_usd, max_tool_calls, max_turns, max_attempts, timeout_ms, available_at, requested_by_type)
  values ('88888888-8888-4888-8888-888888888888','copywriting-agent','create_copy_variants','user','draft','running','c','k-run',1,1,1,1,1,now(),'user')$$, '23514', null, 'execução não nasce rodando (nem sem lease coerente)');
select throws_ok($$insert into runtime.agent_runs (tenant_id, agent_key, action_key, trigger_kind, autonomy, correlation_id, idempotency_key, max_cost_micro_usd, max_tool_calls, max_turns, max_attempts, timeout_ms, available_at, requested_by_type, tool_calls)
  values ('88888888-8888-4888-8888-888888888888','copywriting-agent','create_copy_variants','user','draft','c','k-tools',1,1,1,1,1,now(),'user', 2)$$, '23514', null, 'chamadas de ferramenta acima do limite são recusadas');
select throws_ok($$insert into runtime.kill_switches (tenant_id, scope, active, reason) values (null, 'global', true, 'segunda global')$$, '23505', null, 'no máximo uma interrupção global');
select throws_ok($$insert into runtime.kill_switches (tenant_id, scope, active, reason) values ('88888888-8888-4888-8888-888888888888', 'global', true, 'x')$$, '23514', null, 'escopo global exige tenant nulo');

-- ------------------------------------------------------ Exclusão em cascata da empresa
select lives_ok($$delete from core.tenants where id = '77777777-7777-4777-8777-777777777777'$$, 'excluir a empresa remove execuções, passos e interrupção em cascata');
select is((select count(*)::int from runtime.agent_runs where tenant_id = '77777777-7777-4777-8777-777777777777')
        + (select count(*)::int from runtime.run_steps where tenant_id = '77777777-7777-4777-8777-777777777777')
        + (select count(*)::int from runtime.kill_switches where tenant_id = '77777777-7777-4777-8777-777777777777'), 0, 'nada de T7 sobrou');

select * from finish();
rollback;
