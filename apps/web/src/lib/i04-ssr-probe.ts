import {randomUUID} from "node:crypto";
import {deps,resolverContexto} from "./deps";
import {exigirClaims} from "./session";
import type {AccessContext,UnitOfWork,TenantId} from "@oplyra/core";
import {provarPoolSsr} from "../../../../packages/infra/src/i04-ssr-isolation-probe.ts";
import {permitirProvaSsr,motivoSeguro} from "./i04-ssr-guard";
import plan from "./i04-ssr-plan.json";
const once=new WeakMap<UnitOfWork,ReturnType<typeof provarPoolSsr>>();
export async function provaSsrSeSolicitada(uow:UnitOfWork,ctx:AccessContext,normal:{objectiveIds:string[];campaignIds:string[]},h:{get(name:string):string|null}){
 if(!permitirProvaSsr({env:process.env,ctx,...normal,marker:h.get("x-oplyra-i04-probe"),origin:h.get("origin"),fetchSite:h.get("sec-fetch-site"),supplied:uow,actual:deps.uow}))return null;
 const requestId=randomUUID();
 try{
  const claims=await exigirClaims();
  const other=await resolverContexto.resolve(claims,plan.tenants[1]!.tenantId as TenantId);
  if(other.userId!==ctx.userId||other.roleKey!=="owner"||!other.permissions.has("strategy.write"))throw Error();
  const cacheHit=once.has(uow);
  if(!cacheHit)once.set(uow,provarPoolSsr(uow,[ctx,other],plan.tenants as [typeof plan.tenants[0],typeof plan.tenants[0],typeof plan.tenants[0]]));
  const result=await once.get(uow)!;
  return {schema:"oplyra-i04-ssr/1",planId:plan.id,requestId,cacheHit,entry:"official-strategy-server-component",
   sameSsrDependencyObject:true,normalStrategyReadPassed:true,authenticatedRequest:true,...result};
 }catch(error){return {schema:"oplyra-i04-ssr/1",code:"I04_SSR_FAILED",reason:motivoSeguro(error),planId:plan.id,requestId};}
}
