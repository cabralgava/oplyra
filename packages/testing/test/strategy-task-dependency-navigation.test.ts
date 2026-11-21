// Fakes de portas: concorrência/RLS e sessão real são critérios separados da CI/hospedagem.
import { describe, expect, it, vi } from "vitest";
import type { TaskId, TenantId } from "@oplyra/core";
import { criarStrategyDeps, contextoDeEstrategia } from "../src/strategy.ts";
import { createTask, changeTaskStatus } from "../../core/src/application/use-cases/strategy-tasks.ts";
import { createCampaignDraft } from "../../core/src/application/use-cases/strategy.ts";
import { getTaskDependencyDetails } from "../../core/src/application/use-cases/strategy-task-details.ts";
import type { TaskContent } from "../../core/src/domain/strategy.ts";

const A="c5394801-15f6-473e-bfc6-f3e46e75bda1" as TenantId,B="c5394801-15f6-473e-bfc6-f3e46e75bda2" as TenantId;
const ctx=contextoDeEstrategia({tenantId:A,roleKey:"owner"}),viewer=contextoDeEstrategia({tenantId:A,roleKey:"viewer"}),other=contextoDeEstrategia({tenantId:B,roleKey:"owner"});
const absent="78cda637-4e25-4116-9c65-c636924ad019" as TaskId;
const content=(over:Partial<TaskContent>={}):TaskContent=>({title:"Dependência navegável",description:"Preservada",campaignId:null,dueDate:"2099-12-01",assignee:null,dependsOn:[],...over});
async function setup(){
  const deps=criarStrategyDeps();
  const campaign=()=>createCampaignDraft(deps,{ctx,content:{name:"Campanha da navegação",trackingKey:"",objectiveId:null,productKey:null,method:{situation:"",pain:"",consequence:"",desire:"",mechanism:"",proof:"",offer:""}}});
  const selected=await campaign(),outside=await campaign();
  const leaf=await createTask(deps,{ctx,content:content({title:"Folha avulsa"})});
  const middle=await createTask(deps,{ctx,content:content({title:"Outra campanha",campaignId:outside.id,dependsOn:[leaf.id]})});
  const origin=await createTask(deps,{ctx,content:content({title:"Origem",campaignId:selected.id,dependsOn:[middle.id]})});
  const unrelated=await createTask(deps,{ctx,content:content()});
  const foreign=await createTask(deps,{ctx:other,content:content({title:"Nome confidencial"})});
  return{deps,selected,outside,origin,middle,leaf,unrelated,foreign};
}
describe("Navegação no grafo próprio de dependências",()=>{
  it("Leitor abre dependência direta de outra campanha e conserva a origem sem modificar os campos",async()=>{
    const{deps,origin,middle,leaf,outside}=await setup();const before=structuredClone(deps.estado);
    expect(await getTaskDependencyDetails(deps,viewer,origin.id,middle.id)).toEqual({task:middle,campaign:outside,dependencies:[leaf],unavailableDependencyCount:0,originTask:origin});
    expect(viewer.permissions.has("strategy.write")).toBe(false);expect(deps.estado).toEqual(before);
  });
  it("abre vários saltos até a avulsa, com uma UOW e uma lista, sem executar consultas por aresta",async()=>{
    const{deps,origin,leaf}=await setup();const tx=vi.spyOn(deps.uow,"withUserTransaction"),list=vi.spyOn(deps.tasks,"list"),find=vi.spyOn(deps.tasks,"findById"),campaign=vi.spyOn(deps.campaigns,"findById");
    expect(await getTaskDependencyDetails(deps,ctx,origin.id,leaf.id)).toEqual({task:leaf,campaign:null,dependencies:[],unavailableDependencyCount:0,originTask:origin});
    expect(tx).toHaveBeenCalledTimes(1);expect(list).toHaveBeenCalledTimes(1);expect(find).toHaveBeenCalledTimes(2);expect(campaign).not.toHaveBeenCalled();expect(list).toHaveBeenCalledWith(find.mock.calls[0]![0],A);
  });
  it("recusa falta de read antes de ID, UOW e consultas",async()=>{
    const deps=criarStrategyDeps(),tx=vi.spyOn(deps.uow,"withUserTransaction"),list=vi.spyOn(deps.tasks,"list");
    await expect(getTaskDependencyDetails(deps,{...ctx,permissions:new Set()},"ruim" as TaskId,"ruim" as TaskId)).rejects.toMatchObject({code:"PERMISSION_DENIED"});expect(tx).not.toHaveBeenCalled();expect(list).not.toHaveBeenCalled();
  });
  it("recusa IDs malformados e auto-origem antes do banco; normaliza maiúsculas",async()=>{
    const{deps,origin,leaf}=await setup();const tx=vi.spyOn(deps.uow,"withUserTransaction");
    for(const id of["",null,undefined,0,[],"../",`${origin.id} `,`${origin.id}\n`,`${origin.id}\r`,`${origin.id}\r\n`]){
      await expect(getTaskDependencyDetails(deps,ctx,id as TaskId,leaf.id)).rejects.toMatchObject({code:"TASK_NOT_FOUND"});
      await expect(getTaskDependencyDetails(deps,ctx,origin.id,id as TaskId)).rejects.toMatchObject({code:"TASK_NOT_FOUND"});
    }
    await expect(getTaskDependencyDetails(deps,ctx,origin.id,origin.id)).rejects.toMatchObject({code:"TASK_NOT_FOUND"});expect(tx).not.toHaveBeenCalled();
    expect((await getTaskDependencyDetails(deps,ctx,origin.id.toUpperCase() as TaskId,leaf.id.toUpperCase() as TaskId)).task).toEqual(leaf);
  });
  it("recusa origem ou alvo alheio/ausente e alvo próprio desconectado com o mesmo código e mensagem",async()=>{
    const{deps,origin,leaf,unrelated,foreign}=await setup();
    for(const[from,to]of[[foreign.id,leaf.id],[absent,leaf.id],[origin.id,foreign.id],[origin.id,absent],[origin.id,unrelated.id],[leaf.id,origin.id]])await expect(getTaskDependencyDetails(deps,ctx,from!,to!)).rejects.toMatchObject({code:"TASK_NOT_FOUND",message:"tarefa não encontrada"});
  });
  it("reconfere id e tenant nas duas respostas findById, mesmo se a porta devolver objeto adulterado",async()=>{
    const{deps,origin,leaf}=await setup();const find=vi.spyOn(deps.tasks,"findById");
    for(const bad of[{...origin,tenantId:B},{...origin,id:absent}]){find.mockResolvedValueOnce(bad);await expect(getTaskDependencyDetails(deps,ctx,origin.id,leaf.id)).rejects.toMatchObject({code:"TASK_NOT_FOUND"});}
    for(const bad of[{...leaf,tenantId:B},{...leaf,id:absent}]){find.mockResolvedValueOnce(origin).mockResolvedValueOnce(bad);await expect(getTaskDependencyDetails(deps,ctx,origin.id,leaf.id)).rejects.toMatchObject({code:"TASK_NOT_FOUND"});}
  });
  it("uma referência alheia devolvida na list não vira ponte até um alvo próprio",async()=>{
    const{deps,origin,leaf,foreign}=await setup();
    vi.spyOn(deps.tasks,"findById").mockResolvedValueOnce({...origin,dependsOn:[foreign.id]}).mockResolvedValueOnce(leaf);
    vi.spyOn(deps.tasks,"list").mockResolvedValueOnce([{...foreign,dependsOn:[leaf.id]},leaf]);
    await expect(getTaskDependencyDetails(deps,ctx,origin.id,leaf.id)).rejects.toMatchObject({code:"TASK_NOT_FOUND"});
  });
  it("referência ausente não é atravessada e o caminho inverso não é autorizado",async()=>{
    const{deps,origin,leaf}=await setup();vi.spyOn(deps.tasks,"findById").mockResolvedValueOnce({...origin,dependsOn:[absent]}).mockResolvedValueOnce(leaf);
    await expect(getTaskDependencyDetails(deps,ctx,origin.id,leaf.id)).rejects.toMatchObject({code:"TASK_NOT_FOUND"});
    await expect(getTaskDependencyDetails(deps,ctx,leaf.id,origin.id)).rejects.toMatchObject({code:"TASK_NOT_FOUND"});
  });
  it("ciclo malformado não trava nem libera tarefa desconectada",async()=>{
    const{deps,origin,middle,leaf,unrelated}=await setup();vi.spyOn(deps.tasks,"list").mockResolvedValue([{...middle,dependsOn:[origin.id]},leaf,unrelated]);
    await expect(getTaskDependencyDetails(deps,ctx,origin.id,unrelated.id)).rejects.toMatchObject({code:"TASK_NOT_FOUND"});
    expect((await getTaskDependencyDetails(deps,ctx,origin.id,middle.id)).task).toEqual(middle);
  });
  it("alvo terminal continua consultável e referências indisponíveis não expõem seu conteúdo",async()=>{
    const{deps,origin,middle,leaf,foreign}=await setup();const cancelled=await changeTaskStatus(deps,{ctx,taskId:middle.id,expectedRevision:1,to:"cancelled"});
    vi.spyOn(deps.tasks,"findById").mockResolvedValueOnce(origin).mockResolvedValueOnce({...cancelled,dependsOn:[leaf.id,foreign.id,absent]});
    const result=await getTaskDependencyDetails(deps,viewer,origin.id,middle.id);expect(result.task.status).toBe("cancelled");expect(result.dependencies).toEqual([leaf]);expect(result.unavailableDependencyCount).toBe(2);expect(JSON.stringify(result)).not.toContain(foreign.title);
  });
  it("campanha de alvo ausente ou alheia é ocultada, sem fabricar campanha da origem",async()=>{
    const{deps,origin,middle,selected}=await setup();const find=vi.spyOn(deps.campaigns,"findById");
    for(const bad of[null,{...selected,tenantId:B},selected]){find.mockResolvedValueOnce(bad);expect((await getTaskDependencyDetails(deps,ctx,origin.id,middle.id)).campaign).toBeNull();}
  });
  it("falha inesperada de list propaga; nenhuma resposta de sucesso é inventada",async()=>{
    const{deps,origin,leaf}=await setup();vi.spyOn(deps.tasks,"list").mockRejectedValueOnce(new Error("lista indisponível"));await expect(getTaskDependencyDetails(deps,ctx,origin.id,leaf.id)).rejects.toThrow("lista indisponível");
  });
});
