// Portas fake: não comprova RLS, JWT hospedado ou snapshot serializável.
import { describe, expect, it, vi } from "vitest";
import type { CampaignId, TaskId, TenantId } from "@oplyra/core";
import { criarStrategyDeps, contextoDeEstrategia } from "../src/strategy.ts";
import { createTask, changeTaskStatus } from "../../core/src/application/use-cases/strategy-tasks.ts";
import { createCampaignDraft } from "../../core/src/application/use-cases/strategy.ts";
import { getTaskDetails } from "../../core/src/application/use-cases/strategy-task-details.ts";
import type { TaskContent } from "../../core/src/domain/strategy.ts";
const A="e41e225e-491c-4358-b235-a74ae29a72b1" as TenantId,B="e41e225e-491c-4358-b235-a74ae29a72b2" as TenantId;
const ctx=contextoDeEstrategia({tenantId:A,roleKey:"owner"}),other=contextoDeEstrategia({tenantId:B,roleKey:"owner"}),viewer=contextoDeEstrategia({tenantId:A,roleKey:"viewer"});
const content=(over:Partial<TaskContent>={}):TaskContent=>({title:"Tarefa oficial",description:"Descrição preservada",campaignId:null,dueDate:"2028-02-29",assignee:{kind:"user",userId:ctx.userId},dependsOn:[],...over});
const campaign=(deps:ReturnType<typeof criarStrategyDeps>,context=ctx)=>createCampaignDraft(deps,{ctx:context,content:{name:"Campanha do detalhe",trackingKey:"",objectiveId:null,productKey:null,method:{situation:"",pain:"",consequence:"",desire:"",mechanism:"",proof:"",offer:""}}});
async function setup(){const deps=criarStrategyDeps(),ownCampaign=await campaign(deps),foreignCampaign=await campaign(deps,other);const first=await createTask(deps,{ctx,content:content()}),second=await createTask(deps,{ctx,content:content()});const linked=await createTask(deps,{ctx,content:content({campaignId:ownCampaign.id,dependsOn:[second.id,first.id]})});const foreign=await createTask(deps,{ctx:other,content:content({campaignId:foreignCampaign.id,assignee:null})});return{deps,ownCampaign,foreignCampaign,first,second,linked,foreign};}

describe("Detalhe de tarefa — leitura autorizada",()=>{
  it("preserva tarefa completa e ordena dependências diretas como dependsOn, não como lista",async()=>{
    const{deps,ownCampaign,first,second,linked}=await setup();const result=await getTaskDetails(deps,ctx,linked.id);
    expect(result).toEqual({task:linked,campaign:ownCampaign,dependencies:[second,first],unavailableDependencyCount:0});expect(result.task).toBe(linked);
  });
  it("Leitor consulta tarefa concluída/cancelada sem exigir escrita ou campanha ativa",async()=>{
    const{deps,linked}=await setup();let task=await changeTaskStatus(deps,{ctx,taskId:linked.id,expectedRevision:1,to:"in_progress"});task=await changeTaskStatus(deps,{ctx,taskId:task.id,expectedRevision:2,to:"done"});
    expect((await getTaskDetails(deps,viewer,task.id)).task).toEqual(task);expect(viewer.permissions.has("strategy.write")).toBe(false);
    const cancelled=await createTask(deps,{ctx,content:content()});const saved=await changeTaskStatus(deps,{ctx,taskId:cancelled.id,expectedRevision:1,to:"cancelled"});expect((await getTaskDetails(deps,viewer,saved.id)).task).toEqual(saved);
  });
  it("sem permissão recusa antes de validar ID, abrir UOW ou consultar",async()=>{
    const deps=criarStrategyDeps(),tx=vi.spyOn(deps.uow,"withUserTransaction"),find=vi.spyOn(deps.tasks,"findById");
    await expect(getTaskDetails(deps,{...ctx,permissions:new Set()},"ruim" as TaskId)).rejects.toMatchObject({code:"PERMISSION_DENIED"});expect(tx).not.toHaveBeenCalled();expect(find).not.toHaveBeenCalled();
  });
  it("IDs inválidos recusam como ausente antes do banco; UUID maiúsculo é normalizado",async()=>{
    const{deps,linked}=await setup();const tx=vi.spyOn(deps.uow,"withUserTransaction");
    for(const value of[""," ","../",null,undefined,[linked.id],0,`${linked.id} `])await expect(getTaskDetails(deps,ctx,value as TaskId)).rejects.toMatchObject({code:"TASK_NOT_FOUND",message:"tarefa não encontrada"});expect(tx).not.toHaveBeenCalled();
    expect((await getTaskDetails(deps,ctx,linked.id.toUpperCase() as TaskId)).task).toEqual(linked);
  });
  it("tarefa alheia/inexistente e resposta de porta com id/tenant adulterado são indistinguíveis",async()=>{
    const{deps,linked,foreign}=await setup();const list=vi.spyOn(deps.tasks,"list"),findCampaign=vi.spyOn(deps.campaigns,"findById");
    for(const id of[foreign.id,"bc7944a5-37cc-4384-b1f5-13ce30a757ee" as TaskId])await expect(getTaskDetails(deps,ctx,id)).rejects.toMatchObject({code:"TASK_NOT_FOUND"});
    const find=vi.spyOn(deps.tasks,"findById");find.mockResolvedValueOnce({...linked,tenantId:B}).mockResolvedValueOnce({...linked,id:foreign.id});
    await expect(getTaskDetails(deps,ctx,linked.id)).rejects.toMatchObject({code:"TASK_NOT_FOUND"});await expect(getTaskDetails(deps,ctx,linked.id)).rejects.toMatchObject({code:"TASK_NOT_FOUND"});expect(list).not.toHaveBeenCalled();expect(findCampaign).not.toHaveBeenCalled();
  });
  it("referência alheia ou ausente não é devolvida, nem buscada por ID fora do tenant",async()=>{
    const{deps,linked,first,foreign}=await setup();const modified={...linked,dependsOn:[first.id,foreign.id,"d33bdc17-e9fa-4733-985b-424789e29a56" as TaskId]};
    vi.spyOn(deps.tasks,"findById").mockResolvedValueOnce(modified);vi.spyOn(deps.tasks,"list").mockResolvedValueOnce([first,foreign]);
    const result=await getTaskDetails(deps,ctx,linked.id);expect(result.dependencies).toEqual([first]);expect(result.unavailableDependencyCount).toBe(2);expect(JSON.stringify(result.dependencies)).not.toContain(foreign.id);
    expect(deps.tasks.findById).toHaveBeenCalledTimes(1);
  });
  it("campanha ausente/tenant alheio/id divergente vira null sem expor metadados",async()=>{
    const{deps,linked,ownCampaign,foreignCampaign}=await setup();const find=vi.spyOn(deps.campaigns,"findById");
    for(const value of[null,foreignCampaign,{...ownCampaign,tenantId:B}]){find.mockResolvedValueOnce(value);expect((await getTaskDetails(deps,ctx,linked.id)).campaign).toBeNull();}
    find.mockResolvedValueOnce({...ownCampaign,id:foreignCampaign.id as CampaignId});expect((await getTaskDetails(deps,ctx,linked.id)).campaign).toBeNull();
  });
  it("usa uma UOW e no máximo uma consulta por necessidade, sem query extra para avulsa",async()=>{
    const{deps,linked,first,ownCampaign}=await setup();const tx=vi.spyOn(deps.uow,"withUserTransaction"),find=vi.spyOn(deps.tasks,"findById"),list=vi.spyOn(deps.tasks,"list"),campaignFind=vi.spyOn(deps.campaigns,"findById");
    await getTaskDetails(deps,ctx,linked.id);expect(tx).toHaveBeenCalledTimes(1);expect(find).toHaveBeenCalledTimes(1);expect(list).toHaveBeenCalledTimes(1);expect(campaignFind).toHaveBeenCalledTimes(1);
    const handle=find.mock.calls[0]![0];expect(campaignFind).toHaveBeenCalledWith(handle,A,ownCampaign.id);expect(list).toHaveBeenCalledWith(handle,A);
    vi.clearAllMocks();expect(await getTaskDetails(deps,ctx,first.id)).toEqual({task:first,campaign:null,dependencies:[],unavailableDependencyCount:0});expect(find).toHaveBeenCalledTimes(1);expect(list).not.toHaveBeenCalled();expect(campaignFind).not.toHaveBeenCalled();
  });
  it("leitura não muda dependências, responsável, revisão, ordem ou auditoria",async()=>{
    const{deps,linked}=await setup();const before=structuredClone(deps.estado);
    await getTaskDetails(deps,ctx,linked.id);expect(deps.estado).toEqual(before);
  });
  it("falha inesperada da porta propaga sem mascarar como campanha ausente",async()=>{
    const{deps,linked}=await setup();vi.spyOn(deps.campaigns,"findById").mockRejectedValueOnce(new Error("indisponível"));await expect(getTaskDetails(deps,ctx,linked.id)).rejects.toThrow("indisponível");
  });
});
