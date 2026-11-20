import type {AccessContext,UnitOfWork} from "@oplyra/core";
import plan from "./i04-ssr-plan.json";
export function permitirProvaSsr(x:{env:Record<string,string|undefined>;marker:string|null;origin:string|null;fetchSite:string|null;ctx:AccessContext;supplied:UnitOfWork;actual:UnitOfWork;objectiveIds:string[];campaignIds:string[];now?:number}):boolean {
 const e=x.env,n=x.now??Date.now(),f=plan.tenants[0]!;
 return e.OPLYRA_ENV==="develop"&&e.SITE_ID==="45056cd1-6732-40b3-b341-8b9fecca8345"&&e.SITE_NAME==="oplyra-develop"&&e.URL==="https://oplyra-develop.netlify.app"
 &&x.marker===plan.id&&(!x.origin||x.origin===e.URL)&&x.fetchSite!=="cross-site"&&Number.isFinite(n)&&n<Date.parse(plan.expiresAt)
 &&x.supplied===x.actual&&x.ctx.userId===plan.requester&&x.ctx.tenantId===f.tenantId&&x.ctx.roleKey==="owner"
 &&x.ctx.permissions.has("strategy.read")&&x.ctx.permissions.has("strategy.write")
 &&x.objectiveIds.length===1&&x.objectiveIds[0]===f.objectId&&x.campaignIds.length===1&&x.campaignIds[0]===f.objectId;
}
const reasons=new Set(["I04_SSR_ASSERTION","I04_SSR_OWN_BASELINE","I04_SSR_OTHER_MEMBER_WRITE","I04_SSR_FOREIGN_WRITE","I04_SSR_OWN_WRITE","I04_SSR_OWN_CHANGE","I04_SSR_INVALID_CONTEXT_WRITE","I04_SSR_BARRIER"]);
export function motivoSeguro(e:unknown):string{return e instanceof Error&&reasons.has(e.message)?e.message:"UNCLASSIFIED";}
