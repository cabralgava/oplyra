// Aplicação com portas fake. Não comprova RLS, snapshot SQL ou JWT hospedado.
import { describe, expect, it, vi } from "vitest";
import type { AccessContext, CampaignId, TenantId } from "@oplyra/core";
import { criarStrategyDeps, contextoDeEstrategia } from "../src/strategy.ts";
import { createCampaignDraft } from "../../core/src/application/use-cases/strategy.ts";
import { createTask, changeTaskStatus, getOperationTasks, type OperationTaskFilter } from "../../core/src/application/use-cases/strategy-tasks.ts";
import type { TaskContent } from "../../core/src/domain/strategy.ts";

const A = "6d57216a-ec52-4d26-bfc8-d673376f4eb1" as TenantId;
const B = "6d57216a-ec52-4d26-bfc8-d673376f4eb2" as TenantId;
const owner = contextoDeEstrategia({ tenantId: A, roleKey: "owner" });
const other = contextoDeEstrategia({ tenantId: B, roleKey: "owner" });
const viewer = contextoDeEstrategia({ tenantId: A, roleKey: "viewer" });
const content = (campaignId: CampaignId | null, over: Partial<TaskContent> = {}): TaskContent => ({
  title: "Tarefa filtrada", description: "Conteúdo preservado", campaignId, dueDate: "2028-02-29",
  assignee: { kind: "user", userId: owner.userId }, dependsOn: [], ...over,
});
const campaign = (deps: ReturnType<typeof criarStrategyDeps>, ctx = owner) => createCampaignDraft(deps, { ctx, content: {
  name: "Campanha do filtro", trackingKey: "", objectiveId: null, productKey: null,
  method: { situation: "", pain: "", consequence: "", desire: "", mechanism: "", proof: "", offer: "" },
} });
async function setup() {
  const deps = criarStrategyDeps();
  const first = await campaign(deps), second = await campaign(deps), foreign = await campaign(deps, other);
  const loose = await createTask(deps, { ctx: owner, content: content(null, { title: "Avulsa" }) });
  let secondTask = await createTask(deps, { ctx: owner, content: content(second.id, { title: "Outra campanha" }) });
  secondTask = await changeTaskStatus(deps, { ctx: owner, taskId: secondTask.id, expectedRevision: 1, to: "cancelled" });
  let linked = await createTask(deps, { ctx: owner, content: content(first.id, { dependsOn: [loose.id, secondTask.id] }) });
  linked = await changeTaskStatus(deps, { ctx: owner, taskId: linked.id, expectedRevision: 1, to: "in_progress" });
  const foreignTask = await createTask(deps, { ctx: other, content: content(foreign.id, { assignee: null }) });
  return { deps, first, second, foreign, loose, secondTask, linked, foreignTask };
}

describe("Operação — filtro e referências de leitura", () => {
  it("todas retorna tarefas/campanhas próprias, incluindo avulsas e canceladas", async () => {
    const { deps, first, second, loose, secondTask, linked } = await setup();
    const result = await getOperationTasks(deps, owner, { kind: "all" });
    expect(result.tasks).toEqual([loose, secondTask, linked]);
    expect(result.references).toEqual(result.tasks);
    expect(result.campaigns).toEqual([first, second]);
  });

  it("avulsas retorna só campaignId null, mantendo referências completas", async () => {
    const { deps, loose, secondTask, linked } = await setup();
    const result = await getOperationTasks(deps, owner, { kind: "unlinked" });
    expect(result.tasks).toEqual([loose]);
    expect(result.references).toEqual([loose, secondTask, linked]);
  });

  it("campanha filtra cartões sem amputar dependências, responsável, estado ou revisão", async () => {
    const { deps, first, second, loose, secondTask, linked } = await setup();
    const before = [...deps.estado.tarefas];
    const result = await getOperationTasks(deps, owner, { kind: "campaign", campaignId: first.id });
    expect(result.tasks).toEqual([linked]);
    expect(result.references).toEqual([loose, secondTask, linked]);
    expect(result.campaigns).toEqual([first, second]);
    expect(result.tasks[0]).toMatchObject({ dependsOn: [loose.id, secondTask.id], assignee: linked.assignee, status: "in_progress", revision: 2 });
    expect(deps.estado.tarefas).toEqual(before);
  });

  it("Leitor recebe a mesma leitura autorizada sem exigir escrita", async () => {
    const { deps, first, linked } = await setup();
    expect(viewer.permissions.has("strategy.write")).toBe(false);
    expect((await getOperationTasks(deps, viewer, { kind: "campaign", campaignId: first.id })).tasks).toEqual([linked]);
  });

  it("permissão removida recusa antes de consultar ou abrir UOW", async () => {
    const { deps, first } = await setup();
    const denied: AccessContext = { ...owner, permissions: new Set() };
    const tx = vi.spyOn(deps.uow, "withUserTransaction"), campaigns = vi.spyOn(deps.campaigns, "list"), tasks = vi.spyOn(deps.tasks, "list");
    await expect(getOperationTasks(deps, denied, { kind: "campaign", campaignId: first.id })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(tx).not.toHaveBeenCalled(); expect(campaigns).not.toHaveBeenCalled(); expect(tasks).not.toHaveBeenCalled();
  });

  it("campanha alheia e inexistente recusam sem listar tarefas ou cair em todas", async () => {
    const { deps, foreign } = await setup();
    const tasks = vi.spyOn(deps.tasks, "list");
    for (const campaignId of [foreign.id, "52a075b6-3003-4d99-a9a8-5d62cbbebbd6" as CampaignId]) {
      await expect(getOperationTasks(deps, owner, { kind: "campaign", campaignId })).rejects.toMatchObject({ code: "CAMPAIGN_NOT_FOUND", message: "campanha não encontrada" });
    }
    expect(tasks).not.toHaveBeenCalled();
  });

  it("kind desconhecido ou ausente é recusado antes de consultar, sem fallback", async () => {
    const deps = criarStrategyDeps();
    const tx = vi.spyOn(deps.uow, "withUserTransaction");
    for (const filter of [{ kind: "unexpected" }, {}, null, undefined]) {
      await expect(getOperationTasks(deps, owner, filter as unknown as OperationTaskFilter)).rejects.toMatchObject({ code: "REFERENCE_NOT_FOUND" });
    }
    expect(tx).not.toHaveBeenCalled();
  });

  it("usa uma UOW e uma consulta por porta sem duplicar findById/auditoria", async () => {
    const { deps, first } = await setup();
    const before = [...deps.estado.auditoria];
    const tx = vi.spyOn(deps.uow, "withUserTransaction"), campaigns = vi.spyOn(deps.campaigns, "list"), tasks = vi.spyOn(deps.tasks, "list"), find = vi.spyOn(deps.campaigns, "findById");
    await getOperationTasks(deps, owner, { kind: "campaign", campaignId: first.id });
    expect(tx).toHaveBeenCalledTimes(1); expect(campaigns).toHaveBeenCalledTimes(1); expect(tasks).toHaveBeenCalledTimes(1); expect(find).not.toHaveBeenCalled();
    const transaction = campaigns.mock.calls[0]![0];
    expect(campaigns).toHaveBeenCalledWith(transaction, A); expect(tasks).toHaveBeenCalledWith(transaction, A);
    expect(campaigns.mock.invocationCallOrder[0]).toBeLessThan(tasks.mock.invocationCallOrder[0]!);
    expect(deps.estado.auditoria).toEqual(before);
  });

  it("filtra defensivamente tenant em ambas as portas, inclusive referências", async () => {
    const { deps, first, foreign, loose, linked, foreignTask } = await setup();
    vi.spyOn(deps.campaigns, "list").mockResolvedValue([first, foreign, { ...first, tenantId: B }]);
    vi.spyOn(deps.tasks, "list").mockResolvedValue([loose, linked, foreignTask, { ...linked, tenantId: B }]);
    const result = await getOperationTasks(deps, owner, { kind: "campaign", campaignId: first.id });
    expect(result.campaigns).toEqual([first]); expect(result.references).toEqual([loose, linked]); expect(result.tasks).toEqual([linked]);
    await expect(getOperationTasks(deps, owner, { kind: "campaign", campaignId: foreign.id })).rejects.toMatchObject({ code: "CAMPAIGN_NOT_FOUND" });
  });

  it("campanha cancelada e filtro vazio legítimo não inventam tarefas nem excluem referências", async () => {
    const deps = criarStrategyDeps();
    const selected = await campaign(deps);
    deps.estado.campanhas[0] = { ...selected, status: "cancelled" };
    const loose = await createTask(deps, { ctx: owner, content: content(null) });
    const result = await getOperationTasks(deps, owner, { kind: "campaign", campaignId: selected.id });
    expect(result.tasks).toEqual([]); expect(result.references).toEqual([loose]); expect(result.campaigns).toEqual([{ ...selected, status: "cancelled" }]);
  });
});
