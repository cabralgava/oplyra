// CR-058: validação LOCAL, em transações revertidas. Sem aplicação persistente ou remoto.
import { afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { criarUnitOfWork } from "../src/db.ts";

const admin=criarUnitOfWork({connectionString:"postgresql://postgres:postgres@127.0.0.1:54422/postgres",max:1});
const sql=readFileSync(new URL("../../../deploy/develop/supabase/migrations/20261116202506_harden_application_function_search_paths.sql",import.meta.url),"utf8");
const names=["current_user_id","current_tenant","is_worker","is_operator","tenant_is_authorized","forbid_tenant_change"];
const metadata=`select p.oid::regprocedure::text as signature,p.prosrc,p.proowner,p.proacl,p.prosecdef,p.proconfig
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app'
  and p.proname=any($1::text[]) order by p.proname`;
async function isolated(fn:(client:PoolClient)=>Promise<void>){
  const before=(await admin.pool.query(metadata,[names])).rows;
  expect(before).toHaveLength(6);
  const client=await admin.pool.connect();
  try {await client.query("begin");await fn(client);}
  finally {
    try {await client.query("rollback");} finally {client.release();}
    expect((await admin.pool.query(metadata,[names])).rows).toEqual(before);
  }
}
async function seed(client:PoolClient){
  const a=randomUUID(),b=randomUUID(),ua=randomUUID(),ub=randomUUID();
  for(const [tenant,user] of [[a,ua],[b,ub]]){
    await client.query("insert into core.tenants(id,name,slug) values($1,'CR058 local',$2)",[tenant,`cr058-${tenant}`]);
    await client.query("insert into core.memberships(tenant_id,user_id,role_key) values($1,$2,'owner')",[tenant,user]);
  }
  return {a,b,ua,ub};
}
async function asUser(client:PoolClient,tenant:string,user:string){
  await client.query("set local role authenticated");
  await client.query("select set_config('app.tenant_id',$1,true),set_config('request.jwt.claim.sub',$2,true)",[tenant,user]);
  expect((await client.query("select current_user::text as role,(select rolsuper or rolbypassrls from pg_roles where rolname=current_user) as bypass")).rows[0]).toEqual({role:"authenticated",bypass:false});
}
afterAll(()=>admin.encerrar());

describe("CR-058: search_path fixo, direitos e isolamento preservados",()=>{
  it("altera só proconfig das seis funções atuais, sem corpo/owner/ACL/SECURITY",()=>isolated(async client=>{
    const before=(await client.query(metadata,[names])).rows;
    await client.query(sql);
    const after=(await client.query(metadata,[names])).rows;
    for(let i=0;i<after.length;i++){
      expect(after[i].proconfig).toEqual(["search_path=pg_catalog, pg_temp"]);
      expect({...after[i],proconfig:before[i].proconfig}).toEqual(before[i]);
    }
  }));
  it("pode repetir sem ampliar privilégios ou mudar o resultado",()=>isolated(async client=>{
    await client.query(sql);const once=(await client.query(metadata,[names])).rows;
    await client.query(sql);expect((await client.query(metadata,[names])).rows).toEqual(once);
  }));
  it("aceita a ausência da função legada removida na 000015",()=>isolated(async client=>{
    expect((await client.query("select to_regprocedure('app.ensure_tenant_keeps_owner()') as legacy")).rows[0].legacy).toBeNull();
    await client.query(sql);
    expect((await client.query("select to_regprocedure('app.ensure_tenant_keeps_owner()') as legacy")).rows[0].legacy).toBeNull();
  }));
  it("fixa também a função legada quando ainda presente, sem recriá-la no SQL de hardening",()=>isolated(async client=>{
    const original=readFileSync(new URL("../../../supabase/migrations/20260915000005_last_owner_guard.sql",import.meta.url),"utf8");
    // Fixture histórica isolada, só a definição da função original, sem trocar o trigger atual.
    await client.query(original.split("create constraint trigger")[0]!);
    await client.query(sql);
    expect((await client.query("select proconfig from pg_proc where oid='app.ensure_tenant_keeps_owner()'::regprocedure")).rows[0].proconfig).toEqual(["search_path=pg_catalog, pg_temp"]);
  }));
  it("resolve current_setting pelo catálogo mesmo sob search_path hostil",()=>isolated(async client=>{
    const f=await seed(client),schema=`cr058_${randomUUID().replaceAll("-","")}`;
    await client.query(`create schema ${schema}`);
    await client.query(`create function ${schema}.current_setting(text,boolean) returns text language sql as 'select ''${f.a}''::text'`);
    await client.query(`grant usage on schema ${schema} to authenticated`);
    await client.query(sql);await asUser(client,f.b,f.ub);
    await client.query(`set local search_path=${schema},pg_catalog,pg_temp`);
    expect((await client.query("select current_setting('app.tenant_id',true) as shadow")).rows[0].shadow).toBe(f.a);
    expect((await client.query("select app.current_tenant() as tenant,app.current_user_id() as subject,app.tenant_is_authorized() as allowed")).rows[0]).toEqual({tenant:f.b,subject:f.ub,allowed:true});
  }));
  it("leitura e UPDATE continuam restritos ao tenant com papel authenticated",()=>isolated(async client=>{
    const f=await seed(client);await client.query(sql);await asUser(client,f.b,f.ub);
    expect((await client.query("select id from core.tenants")).rows).toEqual([{id:f.b}]);
    expect((await client.query("update core.memberships set role_key='owner' where tenant_id=$1 returning 1",[f.a])).rowCount).toBe(0);
    expect((await client.query("update core.memberships set role_key='owner' returning 1")).rowCount).toBe(1);
  }));
  it("INSERT em empresa alheia continua recusado",async()=>{
    await expect(isolated(async client=>{
      const f=await seed(client);await client.query(sql);await asUser(client,f.b,f.ub);
      await client.query("insert into core.memberships(tenant_id,user_id,role_key) values($1,$2,'viewer')",[f.a,randomUUID()]);
    })).rejects.toMatchObject({code:"42501"});
  });
  it("tenant ausente recusa autorização e não revela empresas",()=>isolated(async client=>{
    const f=await seed(client);await client.query(sql);await asUser(client,f.b,f.ub);
    await client.query("select set_config('app.tenant_id','',true)");
    expect((await client.query("select app.current_tenant() as tenant,app.tenant_is_authorized() as allowed")).rows[0]).toEqual({tenant:null,allowed:false});
    expect((await client.query("select id from core.tenants")).rows).toEqual([]);
  }));
  it("a proteção do último Owner continua ativa",async()=>{
    await expect(isolated(async client=>{
      const f=await seed(client);await client.query(sql);await asUser(client,f.b,f.ub);
      await client.query("update core.memberships set status='revoked',revoked_at=now() where tenant_id=$1",[f.b]);
    })).rejects.toMatchObject({code:"23514"});
  });
});


const domainSql=readFileSync(new URL("../../../deploy/develop/supabase/migrations/20261116211348_harden_domain_validator_search_paths.sql",import.meta.url),"utf8");
const domainSignatures=["brand.evidence_valid(jsonb)","strategy.kpis_valid(jsonb)","strategy.method_valid(jsonb)","strategy.method_complete(jsonb)","strategy.variants_valid(jsonb)"];
const domainMetadata=`select p.oid::regprocedure::text as signature,p.prosrc,p.proowner,p.proacl,p.prosecdef,p.provolatile,p.proconfig
  from pg_proc p where p.oid=any($1::regprocedure[]) order by p.oid`;
const method={situation:"S",pain:"P",consequence:"C",desire:"D",mechanism:"M",proof:"P",offer:"O"};
describe("CR-058: validadores de Brand e Estratégia",()=>{
  it("preserva corpos, ACL, owner, segurança e volatilidade dos cinco validadores",()=>isolated(async client=>{
    const before=(await client.query(domainMetadata,[domainSignatures])).rows;
    expect(before).toHaveLength(5);
    await client.query(domainSql);
    const after=(await client.query(domainMetadata,[domainSignatures])).rows;
    for(let i=0;i<after.length;i++){
      expect(after[i].proconfig).toEqual(["search_path=pg_catalog, pg_temp"]);
      expect({...after[i],proconfig:before[i].proconfig}).toEqual(before[i]);
    }
  }));
  it.each([
    ["brand.evidence_valid",[],true],["brand.evidence_valid",{},false],
    ["strategy.kpis_valid",[{key:"leads",name:"Leads",metric:"leads",unit:"un",target:1}],true],["strategy.kpis_valid",[{}],false],
    ["strategy.method_valid",method,true],["strategy.method_valid",{...method,offer:undefined},false],
    ["strategy.method_complete",method,true],["strategy.method_complete",{...method,offer:""},false],
    ["strategy.variants_valid",["A","B"],true],["strategy.variants_valid",["a"," A "],false],
  ])("%s mantém a resposta %s",(fn,input,expected)=>isolated(async client=>{
    await client.query(domainSql);await client.query("set local role authenticated");
    expect((await client.query(`select ${fn}($1::jsonb) as valid`,[JSON.stringify(input)])).rows[0].valid).toBe(expected);
  }));
  it("method_complete ignora função btrim de um search_path hostil",()=>isolated(async client=>{
    const schema=`cr058_${randomUUID().replaceAll("-","")}`;
    await client.query(`create schema ${schema}`);
    await client.query(`create function ${schema}.btrim(text) returns text language sql immutable as 'select ''ATAQUE''::text'`);
    await client.query(`grant usage on schema ${schema} to authenticated`);
    await client.query(domainSql);await client.query("set local role authenticated");
    await client.query(`set local search_path=${schema},pg_catalog,pg_temp`);
    expect((await client.query("select btrim('') as shadow")).rows[0].shadow).toBe("ATAQUE");
    expect((await client.query("select strategy.method_complete($1::jsonb) as valid",[JSON.stringify({...method,offer:""})])).rows[0].valid).toBe(false);
  }));
});
