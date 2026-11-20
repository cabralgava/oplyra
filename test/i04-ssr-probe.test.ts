import {describe,it,expect} from "vitest";
import type {AccessContext,UnitOfWork} from "@oplyra/core";
import {permitirProvaSsr,motivoSeguro} from "../apps/web/src/lib/i04-ssr-guard";
import plan from "../apps/web/src/lib/i04-ssr-plan.json";
import {readFileSync} from "node:fs";
const uow={} as UnitOfWork;
const input=()=>({env:{OPLYRA_ENV:"develop",SITE_ID:"45056cd1-6732-40b3-b341-8b9fecca8345",SITE_NAME:"oplyra-develop",URL:"https://oplyra-develop.netlify.app"},marker:plan.id,origin:null as string|null,fetchSite:"same-origin" as string|null,
 ctx:{userId:plan.requester,tenantId:plan.tenants[0]!.tenantId,roleKey:"owner",permissions:new Set(["strategy.read","strategy.write"])} as unknown as AccessContext,
 supplied:uow,actual:uow,objectiveIds:[plan.tenants[0]!.objectId],campaignIds:[plan.tenants[0]!.objectId],now:Date.parse(plan.expiresAt)-1000});
describe("restrições da prova SSR I04",()=>{
 it("exige objeto real de dependências e contexto próprio verificado",()=>expect(permitirProvaSsr(input())).toBe(true));
 it.each([{OPLYRA_ENV:"production"},{OPLYRA_ENV:"local"},{SITE_ID:"other"},{SITE_NAME:"other"},{URL:"https://app.oplyra.io"}])("recusa destino divergente %j",patch=>{const i=input();expect(permitirProvaSsr({...i,env:{...i.env,...patch}})).toBe(false);});
 it.each([null,"wrong",""])("não aciona sem marcador exato %s",marker=>expect(permitirProvaSsr({...input(),marker})).toBe(false));
 it("recusa outro UoW, origem externa e cross-site",()=>{
  expect(permitirProvaSsr({...input(),supplied:{} as UnitOfWork})).toBe(false);
  expect(permitirProvaSsr({...input(),origin:"https://example.com"})).toBe(false);
  expect(permitirProvaSsr({...input(),fetchSite:"cross-site"})).toBe(false);
 });
 it("recusa expiração e relógio inválido",()=>{
  expect(permitirProvaSsr({...input(),now:Date.parse(plan.expiresAt)})).toBe(false);
  expect(permitirProvaSsr({...input(),now:NaN})).toBe(false);
 });
 it.each([{roleKey:"viewer"},{userId:"other"},{tenantId:plan.tenants[1]!.tenantId}])("recusa identidade/escopo divergente %j",patch=>{const i=input();expect(permitirProvaSsr({...i,ctx:{...i.ctx,...patch} as AccessContext})).toBe(false);});
 it("requer permissão atual e linhas confirmadas pela leitura oficial",()=>{
  const i=input();
  expect(permitirProvaSsr({...i,ctx:{...i.ctx,permissions:new Set(["strategy.read"])}})).toBe(false);
  expect(permitirProvaSsr({...i,objectiveIds:[]})).toBe(false);
  expect(permitirProvaSsr({...i,campaignIds:[plan.tenants[2]!.objectId]})).toBe(false);
  expect(permitirProvaSsr({...i,objectiveIds:[...i.objectiveIds,"extra"]})).toBe(false);
 });
 it("não cria nem encerra o pool pertencente à aplicação",()=>{
  const text=readFileSync(new URL("../packages/infra/src/i04-ssr-isolation-probe.ts",import.meta.url),"utf8");
  expect(text).not.toMatch(/new (?:pg\.)?Pool\s*\(|criarUnitOfWork\s*\(|\.encerrar\s*\(|\.end\s*\(/);
 });
 it("não propaga mensagem privada do driver",()=>{
  expect(motivoSeguro(Error("I04_SSR_FOREIGN_WRITE"))).toBe("I04_SSR_FOREIGN_WRITE");
  expect(motivoSeguro(Error("CANARY_PRIVATE_URL"))).toBe("UNCLASSIFIED");
  expect(motivoSeguro({message:"I04_SSR_FOREIGN_WRITE"})).toBe("UNCLASSIFIED");
 });
});
