// Prova temporária: utiliza o UnitOfWork fornecido pela página SSR, sem criar ou encerrar conexões.
import {randomUUID} from "node:crypto";
import type {AccessContext,UnitOfWork} from "@oplyra/core";
import {comoCliente} from "./db.ts";
type Fixture={tenantId:string;objectId:string};
const tables=["objectives","campaigns","experiments","tasks"] as const;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const instances=new WeakMap<UnitOfWork,string>();
function check(v:unknown):asserts v{if(!v)throw Error("I04_SSR_ASSERTION");}
export async function provarPoolSsr(uow:UnitOfWork,contexts:[AccessContext,AccessContext],fixtures:[Fixture,Fixture,Fixture]){
 for(const f of fixtures)check(uuid.test(f.tenantId)&&uuid.test(f.objectId));
 check(new Set(fixtures.map(f=>f.tenantId)).size===3&&new Set(fixtures.map(f=>f.objectId)).size===3);
 check(contexts.every((c,i)=>c.tenantId===fixtures[i]!.tenantId&&c.userId===contexts[0].userId));
 if(!instances.has(uow))instances.set(uow,randomUUID());
 const instanceId=instances.get(uow)!;
 const clients=new WeakMap<object,number>(),hits=new Map<number,number>();let counter=0,cleanChecks=0;
 function observe(tx:object){if(!clients.has(tx))clients.set(tx,++counter);const n=clients.get(tx)!;hits.set(n,(hits.get(n)??0)+1);return n;}
 async function context(tx:object,ctx:AccessContext){
  observe(tx);const c=comoCliente(tx);
  const r=(await c.query(`select session_user as login,current_user as role,app.current_tenant() as tenant,app.current_user_id() as actor,pg_backend_pid() as pid,(select rolsuper or rolbypassrls from pg_roles where rolname=current_user) as bypass`)).rows[0];
  check(r.login==="oplyra_web_login"&&r.role==="authenticated"&&!r.bypass&&r.tenant===(ctx.tenantId||null)&&r.actor===ctx.userId);
  check((c as unknown as {connection:{stream:{encrypted:boolean}}}).connection.stream.encrypted===true);
  return r.pid as number;
 }
 async function clean(){
  await uow.withIdentityTransaction(contexts[0].userId,async tx=>{
   observe(tx);const r=(await comoCliente(tx).query("select session_user as login,current_user as role,app.current_tenant() as tenant")).rows[0];
   check(r.login==="oplyra_web_login"&&r.role==="authenticated"&&r.tenant===null);cleanChecks++;
  });
 }
 const rollback=Symbol("fixture rollback");
 async function reverted(ctx:AccessContext,sql:string){
  let did=false;
  try{await uow.withUserTransaction(ctx,async tx=>{
   await context(tx,ctx);const c=comoCliente(tx);
   await c.query("set local lock_timeout='1s'; set local statement_timeout='8s'");
   await c.query(sql);throw rollback;
  });}catch(e){if(e!==rollback)throw e;did=true;}check(did);
 }
 // Somente UUIDs de fixtures validados e identificadores de uma lista fechada entram no bloco.
 for(let i=0;i<2;i++){
  const own=fixtures[i]!,other=fixtures[1-i]!,foreign=fixtures[2];
  await reverted(contexts[i]!,`do $probe$ declare t text;n integer;r integer;begin
   foreach t in array array['objectives','campaigns','experiments','tasks'] loop
    execute format('select revision from strategy.%I where id=$1',t) into r using '${own.objectId}'::uuid;
    if r is distinct from 1 then raise exception 'I04_SSR_OWN_BASELINE';end if;
    execute format('update strategy.%I set revision=2 where id=$1',t) using '${other.objectId}'::uuid;
    get diagnostics n=row_count;if n<>0 then raise exception 'I04_SSR_OTHER_MEMBER_WRITE';end if;
    execute format('update strategy.%I set revision=2 where id=$1',t) using '${foreign.objectId}'::uuid;
    get diagnostics n=row_count;if n<>0 then raise exception 'I04_SSR_FOREIGN_WRITE';end if;
    execute format('update strategy.%I set revision=2 where id=$1',t) using '${own.objectId}'::uuid;
    get diagnostics n=row_count;if n<>1 then raise exception 'I04_SSR_OWN_WRITE';end if;
    execute format('select revision from strategy.%I where id=$1',t) into r using '${own.objectId}'::uuid;
    if r is distinct from 2 then raise exception 'I04_SSR_OWN_CHANGE';end if;
   end loop;end $probe$;`);
  await uow.withUserTransaction(contexts[i]!,async tx=>{
   await context(tx,contexts[i]!);
   for(const t of tables)check((await comoCliente(tx).query(`select revision from strategy.${t} where id=$1`,[own.objectId])).rows[0]?.revision===1);
  });await clean();
 }
 for(const tenant of [fixtures[2].tenantId,""]){
  await reverted({...contexts[0],tenantId:tenant as AccessContext["tenantId"]},`do $probe$ declare t text;n integer;begin
   foreach t in array array['objectives','campaigns','experiments','tasks'] loop
    execute format('update strategy.%I set revision=2 where id=any($1)',t)
     using array['${fixtures[0].objectId}'::uuid,'${fixtures[1].objectId}'::uuid,'${fixtures[2].objectId}'::uuid];
    get diagnostics n=row_count;if n<>0 then raise exception 'I04_SSR_INVALID_CONTEXT_WRITE';end if;
   end loop;end $probe$;`);await clean();
 }
 let sqlError=false,rlsOff=false;
 try{await uow.withUserTransaction(contexts[0],async tx=>{observe(tx);await comoCliente(tx).query("select 1/0");});}
 catch(e){sqlError=(e as {code?:string}).code==="22012";}check(sqlError);await clean();
 try{await uow.withUserTransaction(contexts[1],async tx=>{
  await context(tx,contexts[1]);await comoCliente(tx).query("set local row_security=off");
  await comoCliente(tx).query("select id from strategy.campaigns where id=$1",[fixtures[1].objectId]);
 });}catch(e){rlsOff=(e as {code?:string}).code==="42501";}check(rlsOff);await clean();
 const reusedClientObserved=[...hits.values()].some(n=>n>1);check(reusedClientObserved&&cleanChecks===6);
 const concurrent=new Set<number>(),backends=new Set<number>();
 let arrived=0,release!:()=>void,reject!:(e:Error)=>void;
 const together=new Promise<void>((yes,no)=>{release=yes;reject=no;});
 const timer=setTimeout(()=>reject(Error("I04_SSR_BARRIER")),8000);timer.unref();
 const settled=await Promise.allSettled(contexts.map((ctx,i)=>uow.withUserTransaction(ctx,async tx=>{
  concurrent.add(observe(tx));backends.add(await context(tx,ctx));
  if(++arrived===2){clearTimeout(timer);release();}await together;
  for(const t of tables){
   const c=comoCliente(tx);
   check((await c.query(`select count(*)::int as n from strategy.${t} where id=$1`,[fixtures[i]!.objectId])).rows[0].n===1);
   check((await c.query(`select count(*)::int as n from strategy.${t} where id=any($1::uuid[])`,[[fixtures[1-i]!.objectId,fixtures[2].objectId]])).rows[0].n===0);
  }
 })));
 clearTimeout(timer);check(settled.every(s=>s.status==="fulfilled")&&concurrent.size===2&&backends.size===2);
 return {code:"I04_SSR_OK" as const,instanceId,sessionUser:"oplyra_web_login",effectiveRole:"authenticated",tls:true,
  writeCases:32,ownWritesRolledBack:8,otherTenantRowsAffected:0,identityTenantCleanChecks:cleanChecks,
  reusedClientObserved,observedClients:counter,concurrentClients:2,concurrentBackends:2,
  sqlErrorReset:true,rowSecurityOffDenied:true,verifiedActorCount:1,authorizedFixtureTenants:2};
}
