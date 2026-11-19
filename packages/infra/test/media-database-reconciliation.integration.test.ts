// CR068: prova do schema reconciliado, sem SDK/provedor e sem estado persistente nas fixtures.
import {afterAll,describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {PoolClient} from 'pg';
import {criarUnitOfWork} from '../src/db.ts';
const admin=criarUnitOfWork({connectionString:'postgresql://postgres:postgres@127.0.0.1:54422/postgres',max:1});
const worker=criarUnitOfWork({connectionString:'postgresql://oplyra_worker_login:local-worker-2026@127.0.0.1:54422/postgres',max:1});
afterAll(()=>Promise.all([admin.encerrar(),worker.encerrar()]));
async function isolated(run:(c:PoolClient,f:{a:string;b:string;ua:string;ub:string;viewer:string})=>Promise<void>) {
 const c=await admin.pool.connect();
 try {
  await c.query('begin');
  const f={a:randomUUID(),b:randomUUID(),ua:randomUUID(),ub:randomUUID(),viewer:randomUUID()};
  await c.query("insert into core.tenants(id,name,slug,plan_key) values($1,'CR068 A',$2,'performance'),($3,'CR068 B',$4,'growth')",[f.a,'cr068-a-'+f.a,f.b,'cr068-b-'+f.b]);
  await c.query("insert into core.memberships(tenant_id,user_id,role_key) values($1,$2,'owner'),($3,$4,'owner'),($1,$5,'viewer')",[f.a,f.ua,f.b,f.ub,f.viewer]);
  await run(c,f);
 }finally {try{await c.query('rollback');}finally{c.release();}}
}
async function asUser(c:PoolClient,tenant:string,user:string) {
 await c.query('set local role authenticated');
 await c.query("select set_config('app.tenant_id',$1,true),set_config('request.jwt.claim.sub',$2,true)",[tenant,user]);
 expect((await c.query("select current_user as role,(select rolsuper or rolbypassrls from pg_roles where rolname=current_user) as bypass")).rows[0]).toEqual({role:'authenticated',bypass:false});
}
async function refused(c:PoolClient,action:()=>Promise<unknown>) {
 await c.query('savepoint expected_refusal');
 try {await expect(action()).rejects.toMatchObject({code:'42501'});}
 finally {await c.query('rollback to savepoint expected_refusal');await c.query('release savepoint expected_refusal');}
}
const command=(c:PoolClient,tenant:string,operation:string,p={})=>c.query('select app.media_command($1,$2,$3::jsonb) as value',[tenant,operation,JSON.stringify(p)]);
describe('CR068: mídia em PostgreSQL isolado, com papéis reais',()=>{
 it('Owner usa a fronteira humana; replay não duplica intenção nem auditoria e B não lê A',()=>isolated(async(c,f)=>{
  await asUser(c,f.a,f.ua);
  expect((await command(c,f.a,'connections.list')).rows[0].value).toEqual([]);
  const p={plataforma:'googleAds',idempotencyKey:'cr068-disconnect'};
  const once=(await command(c,f.a,'disconnect',p)).rows[0].value;
  expect((await command(c,f.a,'disconnect',p)).rows[0].value).toEqual(once);
  const own=(await command(c,f.a,'connections.list')).rows[0].value;
  expect(own).toHaveLength(1);expect(own[0]).toMatchObject({plataforma:'googleAds',estado:'disconnected'});
  expect(own[0]).not.toHaveProperty('credential');expect(own[0]).not.toHaveProperty('envelope');
  await refused(c,()=>command(c,f.b,'connections.list'));
  await asUser(c,f.b,f.ub);expect((await command(c,f.b,'connections.list')).rows[0].value).toEqual([]);
  await refused(c,()=>command(c,f.a,'connections.list'));
  await c.query('reset role');
  expect((await c.query('select count(*)::int as n from media.intents where tenant_id=$1',[f.a])).rows[0].n).toBe(1);
  expect((await c.query("select count(*)::int as n from core.audit_log where tenant_id=$1 and action='media.disconnect'",[f.a])).rows[0].n).toBe(1);
 }));
 it('Viewer não gerencia conexão nem lê credenciais; pessoa não usa a fronteira worker',()=>isolated(async(c,f)=>{
  await asUser(c,f.a,f.viewer);expect((await command(c,f.a,'connections.list')).rows[0].value).toEqual([]);
  await refused(c,()=>command(c,f.a,'disconnect',{plataforma:'metaAds',idempotencyKey:'cr068-viewer'}));
  await refused(c,()=>c.query('select * from media.credentials'));
  await refused(c,()=>c.query("select app.media_worker($1,'claim')",[f.a]));
  await c.query('reset role');
  expect((await c.query('select count(*)::int as n from media.connections where tenant_id=$1',[f.a])).rows[0].n).toBe(0);
 }));
 it('login worker assume seu próprio papel; tabela de credenciais e fronteira humana são recusadas',async()=>{
  const c=await worker.pool.connect();
  try {
   await c.query('begin');await c.query('set local role oplyra_worker_exec');
   expect((await c.query("select session_user as login,current_user as role,(select rolsuper or rolbypassrls from pg_roles where rolname=current_user) as bypass")).rows[0])
    .toEqual({login:'oplyra_worker_login',role:'oplyra_worker_exec',bypass:false});
   await refused(c,()=>c.query('select * from media.credentials'));
   await refused(c,()=>command(c,randomUUID(),'connections.list'));
  }finally{try{await c.query('rollback');}finally{c.release();}}
 });
 it('índices das três FKs existem; CI exige hardening prévio e local valida sob rollback',()=>isolated(async(c)=>{
  const indexes=(await c.query("select count(*)::int as n from pg_class x join pg_namespace n on n.oid=x.relnamespace join pg_index i on i.indexrelid=x.oid where n.nspname='media' and x.relname=any($1::text[]) and i.indisvalid",[['media_account_claims_tenant_platform','media_campaign_links_campaign','media_sync_jobs_account']])).rows[0].n;
  expect(indexes).toBe(3);
  // Na CI nenhuma preparação ocorre aqui: a asserção deve detectar um bootstrap omitido.
  // Fora do runner, o teste continua reproduzível após db:reset, sem alterar o banco ao terminar.
  if(process.env.GITHUB_ACTIONS!=='true') {
   for(const name of ['20261116202506_harden_application_function_search_paths.sql','20261116211348_harden_domain_validator_search_paths.sql'])
    await c.query(readFileSync(new URL('../../../deploy/develop/supabase/migrations/'+name,import.meta.url),'utf8'));
  }
  const signatures=['app.current_user_id()','app.current_tenant()','app.is_worker()','app.is_operator()','app.tenant_is_authorized()','app.forbid_tenant_change()',
   'brand.evidence_valid(jsonb)','strategy.kpis_valid(jsonb)','strategy.method_valid(jsonb)','strategy.method_complete(jsonb)','strategy.variants_valid(jsonb)'];
  const rows=(await c.query('select proconfig from pg_proc where oid=any($1::regprocedure[])',[signatures])).rows;
  expect(rows).toHaveLength(11);for(const row of rows)expect(row.proconfig).toEqual(['search_path=pg_catalog, pg_temp']);
 }));
});
