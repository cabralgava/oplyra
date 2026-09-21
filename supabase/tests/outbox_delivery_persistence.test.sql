-- CR-014 — estrutura e invariantes da persistência de entrega.
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

select has_table('content', 'event_consumer_deduplication',
                 'tabela persistente de deduplicação existe');
select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'content' and table_name = 'event_outbox'
      and column_name in ('lease_owner', 'fencing_token', 'lease_expires_at', 'dead_lettered_at')),
  4, 'outbox possui os quatro campos de lease, fencing e dead-letter');
select is(
  (select count(*)::int from pg_constraint
    where connamespace = 'content'::regnamespace
      and conname in ('event_outbox_delivery_state_shape', 'event_consumer_deduplication_state_shape')),
  2, 'outbox e deduplicação possuem constraints de estado');
select is(
  (select count(*)::int from pg_indexes
    where schemaname = 'content'
      and indexname in ('event_outbox_dispatch_eligible', 'event_outbox_expired_lease',
                        'event_consumer_deduplication_expired_lease')),
  3, 'índices de elegibilidade e recuperação de lease existem');
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'content' and c.relname = 'event_consumer_deduplication'
      and c.relrowsecurity and c.relforcerowsecurity),
  1, 'RLS está habilitada e forçada na deduplicação');
select is(
  (select count(*)::int from information_schema.triggers
    where event_object_schema = 'content'
      and event_object_table = 'event_consumer_deduplication'
      and trigger_name = 'event_consumer_deduplication_tenant_imutavel'),
  1, 'tenant da deduplicação é imutável');
select is(
  (select count(*)::int from information_schema.table_constraints
    where constraint_schema = 'content' and table_name = 'event_consumer_deduplication'
      and constraint_type = 'FOREIGN KEY'),
  2, 'deduplicação referencia tenant e identidade composta da outbox');

select is(has_table_privilege('oplyra_worker_exec', 'content.event_outbox', 'SELECT'), false,
          'writer continua sem leitura da outbox');
select is(has_table_privilege('oplyra_worker_exec', 'content.event_outbox', 'UPDATE'), false,
          'writer continua sem update da outbox');
select is(has_table_privilege('oplyra_worker_exec', 'content.event_consumer_deduplication', 'SELECT'), false,
          'worker não recebeu leitura da deduplicação');
select is(has_table_privilege('oplyra_worker_exec', 'content.event_consumer_deduplication', 'INSERT'), false,
          'worker não recebeu insert da deduplicação');
select is(has_table_privilege('oplyra_worker_exec', 'content.event_consumer_deduplication', 'UPDATE'), false,
          'worker não recebeu update da deduplicação');
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'content' and tablename = 'event_consumer_deduplication'),
  0, 'nenhuma policy runtime foi aberta prematuramente');

insert into content.copy_drafts (tenant_id, draft_ref, version, source_action)
values ('11111111-1111-4111-8111-111111111111', 'pgtap-cr014-draft', 1, 'create_copy_variants');

insert into content.event_outbox (
  tenant_id, event_transaction_id, event_key, consumer_agent, draft_ref,
  aggregate_version, source_transaction_id, correlation_id, payload
) values (
  '11111111-1111-4111-8111-111111111111', 'txn_pgtap_cr014', 'copy.draft_created',
  'design-agent', 'pgtap-cr014-draft', 1, 'txn_pgtap_cr014_source', 'corr_pgtap_cr014',
  '{"draftRef":"pgtap-cr014-draft","version":1,"sourceAction":"create_copy_variants","variantRefs":["variant-1"]}'::jsonb
);

select lives_ok(
  $$update content.event_outbox
       set status = 'dispatching', dispatch_attempts = 1,
           lease_owner = 'dispatcher-01', fencing_token = 'fence-01',
           lease_expires_at = now() + interval '2 minutes'
     where tenant_id = '11111111-1111-4111-8111-111111111111'
       and event_transaction_id = 'txn_pgtap_cr014'$$,
  'outbox aceita claim completo');

select throws_ok(
  $$update content.event_outbox
       set fencing_token = null
     where tenant_id = '11111111-1111-4111-8111-111111111111'
       and event_transaction_id = 'txn_pgtap_cr014'$$,
  '23514', null, 'dispatching sem fencing token é rejeitado');

select lives_ok(
  $$insert into content.event_consumer_deduplication (
       tenant_id, event_transaction_id, consumer_agent, status, attempt,
       lease_owner, fencing_token, lease_expires_at
     ) values (
       '11111111-1111-4111-8111-111111111111', 'txn_pgtap_cr014', 'design-agent',
       'processing', 1, 'consumer-01', 'consumer-fence-01', now() + interval '2 minutes'
     )$$,
  'deduplicação aceita claim completo do consumidor canônico');

select throws_ok(
  $$insert into content.event_consumer_deduplication (
       tenant_id, event_transaction_id, consumer_agent, status, attempt,
       lease_owner, fencing_token, lease_expires_at
     ) values (
       '11111111-1111-4111-8111-111111111111', 'txn_pgtap_cr014', 'reporting-checkins-agent',
       'processing', 1, 'consumer-02', 'consumer-fence-02', now() + interval '2 minutes'
     )$$,
  '23503', null, 'deduplicação rejeita consumidor diferente do registrado na outbox');

select throws_ok(
  $$update content.event_consumer_deduplication
       set status = 'completed', lease_owner = null, fencing_token = null,
           lease_expires_at = null, completed_at = null
     where tenant_id = '11111111-1111-4111-8111-111111111111'
       and event_transaction_id = 'txn_pgtap_cr014' and consumer_agent = 'design-agent'$$,
  '23514', null, 'completed sem completed_at é rejeitado');

select lives_ok(
  $$update content.event_consumer_deduplication
       set status = 'completed', lease_owner = null, fencing_token = null,
           lease_expires_at = null, completed_at = now(), updated_at = now()
     where tenant_id = '11111111-1111-4111-8111-111111111111'
       and event_transaction_id = 'txn_pgtap_cr014' and consumer_agent = 'design-agent'$$,
  'deduplicação aceita conclusão terminal completa');

select lives_ok(
  $$update content.event_outbox
       set status = 'dead_lettered', lease_owner = null, fencing_token = null,
           lease_expires_at = null, dead_lettered_at = now(),
           last_error = '{"code":"EVENT_NOT_REGISTERED"}'::jsonb
     where tenant_id = '11111111-1111-4111-8111-111111111111'
       and event_transaction_id = 'txn_pgtap_cr014'$$,
  'outbox aceita dead-letter terminal com erro');

select throws_ok(
  $$update content.event_outbox
       set last_error = null
     where tenant_id = '11111111-1111-4111-8111-111111111111'
       and event_transaction_id = 'txn_pgtap_cr014'$$,
  '23514', null, 'dead-letter sem erro é rejeitado');

select * from finish();
rollback;
