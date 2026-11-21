// Conexões/papéis SQL reais somente no banco descartável da CI; não comprova JWT hospedado.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { AccessContext, CampaignId, TaskId, TenantId, UserId } from "@oplyra/core";
import { criarUnitOfWork } from "../src/db.ts";
import { criarAccessContextResolver } from "../src/auth.ts";
import { auditLog, relogio } from "../src/repositories.ts";
import { brandRepository, geradorDeIds } from "../src/brand-repository.ts";
import { taskRepository, campaignRepository, objectiveRepository, experimentRepository, agentCapabilities } from "../src/strategy-repository.ts";
import type { StrategyDeps } from "../../core/src/application/strategy-ports.ts";
import type { TaskContent } from "../../core/src/domain/strategy.ts";
import { createCampaignDraft } from "../../core/src/application/use-cases/strategy.ts";
import { createTask, changeTaskStatus } from "../../core/src/application/use-cases/strategy-tasks.ts";
import { getTaskDependencyDetails } from "../../core/src/application/use-cases/strategy-task-details.ts";

const TA=randomUUID() as TenantId,TB=randomUUID() as TenantId,OWNER=randomUUID() as UserId,OTHER=randomUUID() as UserId,VIEWER=randomUUID() as UserId;
const uow=criarUnitOfWork({connectionString:"postgresql://oplyra_web_login:local-web-2026@127.0.0.1:54422/postgres"});
const admin=criarUnitOfWork({connectionString:"postgresql://postgres:postgres@127.0.0.1:54422/postgres"});
const resolver=criarAccessContextResolver(uow);
const deps:StrategyDeps={uow,tasks:taskRepository,campaigns:campaignRepository,objectives:objectiveRepository,experiments:experimentRepository,agents:agentCapabilities,brand:brandRepository,audit:auditLog,clock:relogio,ids:geradorDeIds};
let own:AccessContext,other:AccessContext,viewer:AccessContext;
const campaign=()=>createCampaignDraft(deps,{ctx:own,content:{name:"Campanha de dependências",trackingKey:"",objectiveId:null,productKey:null,method:{situation:"",pain:"",consequence:"",desire:"",mechanism:"",proof:"",offer:""}}});
const content=(campaignId:CampaignId|null,over:Partial<TaskContent>={}):TaskContent=>({title:"Navegação de dependências",description:"Conteúdo exclusivo da suíte",campaignId,dueDate:"2099-12-01",assignee:null,dependsOn:[],...over});
const auditCount=async()=>Number((await admin.pool.query("select count(*)::int as n from core.audit_log where tenant_id=any($1::uuid[])",[[TA,TB]])).rows[0]!.n);
async function graph(){const selected=await campaign(),outside=await campaign();const leaf=await createTask(deps,{ctx:own,content:content(null)});const middle=await createTask(deps,{ctx:own,content:content(outside.id,{dependsOn:[leaf.id]})});const origin=await createTask(deps,{ctx:own,content:content(selected.id,{dependsOn:[middle.id]})});const unrelated=await createTask(deps,{ctx:own,content:content(null)});const foreign=await createTask(deps,{ctx:other,content:content(null)});return{selected,outside,leaf,middle,origin,unrelated,foreign};}

beforeAll(async()=>{
  // Prefixo6+UUID36 =42, dentro da constraint de50; IDs exclusivos, sem compartilhar fixtures.
  await admin.pool.query("insert into core.tenants(id,name,slug) values($1,$2,$3),($4,$5,$6)",[TA,"Dependency navigation A",`tdn-a-${TA}`,TB,"Dependency navigation B",`tdn-b-${TB}`]);
  await admin.pool.query("insert into core.memberships(tenant_id,user_id,role_key) values($1,$2,'owner'),($1,$3,'viewer'),($4,$5,'owner')",[TA,OWNER,VIEWER,TB,OTHER]);
  own=await resolver.resolve({userId:OWNER,email:""},TA);other=await resolver.resolve({userId:OTHER,email:""},TB);viewer=await resolver.resolve({userId:VIEWER,email:""},TA);
});
afterAll(async()=>{try{await admin.pool.query("delete from core.tenants where id=any($1::uuid[])",[[TA,TB]]);}finally{await Promise.all([uow.encerrar(),admin.encerrar()]);}});

describe("Navegação autorizada entre dependências — banco real",()=>{
  it("Leitor atravessa campanhas e chega à avulsa em vários saltos, preservando origem e auditoria",async()=>{
    const{outside,origin,middle,leaf}=await graph();const before=await auditCount();
    expect(await getTaskDependencyDetails(deps,viewer,origin.id,middle.id)).toEqual({task:middle,campaign:outside,dependencies:[leaf],unavailableDependencyCount:0,originTask:origin});
    expect(await getTaskDependencyDetails(deps,viewer,origin.id,leaf.id)).toEqual({task:leaf,campaign:null,dependencies:[],unavailableDependencyCount:0,originTask:origin});
    expect(await getTaskDependencyDetails(deps,own,origin.id.toUpperCase() as TaskId,leaf.id.toUpperCase() as TaskId)).toEqual({task:leaf,campaign:null,dependencies:[],unavailableDependencyCount:0,originTask:origin});
    expect(viewer.permissions.has("strategy.write")).toBe(false);expect(await auditCount()).toBe(before);
  });
  it("origem/alvo alheio, ausente, desconectado, inverso, igual ou malformado recebem a mesma recusa",async()=>{
    const{origin,leaf,foreign,unrelated}=await graph();const absent=randomUUID() as TaskId;const before=await auditCount();
    for(const[from,to]of[[foreign.id,leaf.id],[absent,leaf.id],[origin.id,foreign.id],[origin.id,absent],[origin.id,unrelated.id],[leaf.id,origin.id],[origin.id,origin.id],["inválido",leaf.id],[origin.id,"inválido"]]){
      await expect(getTaskDependencyDetails(deps,viewer,from as TaskId,to as TaskId)).rejects.toMatchObject({code:"TASK_NOT_FOUND",message:"tarefa não encontrada"});
    }
    expect(await auditCount()).toBe(before);
  });
  it("estado terminal, conteúdo e revisão da tarefa de destino não mudam com a leitura",async()=>{
    const{origin,middle,outside,leaf}=await graph();const cancelled=await changeTaskStatus(deps,{ctx:own,taskId:middle.id,expectedRevision:1,to:"cancelled"});const before=await auditCount();
    const expected={task:cancelled,campaign:outside,dependencies:[leaf],unavailableDependencyCount:0,originTask:origin};
    expect(await getTaskDependencyDetails(deps,viewer,origin.id,middle.id)).toEqual(expected);expect(await getTaskDependencyDetails(deps,viewer,origin.id,middle.id)).toEqual(expected);expect(await auditCount()).toBe(before);
  });
  it("read e vínculo real são exigidos; tenant forjado e contexto de membro revogado não passam",async()=>{
    const{origin,middle,foreign}=await graph();await expect(getTaskDependencyDetails(deps,{...viewer,permissions:new Set()},origin.id,middle.id)).rejects.toMatchObject({code:"PERMISSION_DENIED"});
    await expect(getTaskDependencyDetails(deps,{...viewer,tenantId:TB},foreign.id,middle.id)).rejects.toMatchObject({code:"TASK_NOT_FOUND"});const before=await auditCount();
    await admin.pool.query("update core.memberships set status='revoked',revoked_at=now() where tenant_id=$1 and user_id=$2 and status='active'",[TA,VIEWER]);
    try{await expect(getTaskDependencyDetails(deps,viewer,origin.id,middle.id)).rejects.toMatchObject({code:"TASK_NOT_FOUND"});await expect(resolver.resolve({userId:VIEWER,email:""},TA)).rejects.toMatchObject({code:"MEMBERSHIP_NOT_FOUND"});}
    finally{await admin.pool.query("update core.memberships set status='active',revoked_at=null where tenant_id=$1 and user_id=$2",[TA,VIEWER]);}
    expect(await auditCount()).toBe(before);
  });
});
