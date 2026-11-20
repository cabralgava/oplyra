// Casos de uso com portas fake; não comprova RLS, transações SQL nem JWT hospedado.
import { describe, expect, it, vi } from "vitest";
import type { AccessContext, CampaignId, TenantId } from "@oplyra/core";
import { criarStrategyDeps, contextoDeEstrategia } from "../src/strategy.ts";
import { createCampaignDraft } from "../../core/src/application/use-cases/strategy.ts";
import { createTask, listCampaignTasks, changeTaskStatus } from "../../core/src/application/use-cases/strategy-tasks.ts";
import type { CampaignStatus, TaskContent } from "../../core/src/domain/strategy.ts";

const A = "64d1b7ae-8007-4b74-854c-36c8741cae31" as TenantId;
const B = "64d1b7ae-8007-4b74-854c-36c8741cae32" as TenantId;
const owner = contextoDeEstrategia({ tenantId: A, roleKey: "owner" });
const other = contextoDeEstrategia({ tenantId: B, roleKey: "owner" });
const viewer = contextoDeEstrategia({ tenantId: A, roleKey: "viewer" });
const content = (campaignId: CampaignId | null, over: Partial<TaskContent> = {}): TaskContent => ({
  title: "Conferir briefing", description: "Evidência local", campaignId, dueDate: "2028-02-29", assignee: null, dependsOn: [], ...over,
});
async function campaign(deps: ReturnType<typeof criarStrategyDeps>, ctx = owner, name = "Campanha vinculada") {
  return createCampaignDraft(deps, { ctx, content: {
    name, trackingKey: "", objectiveId: null, productKey: null,
    method: { situation: "", pain: "", consequence: "", desire: "", mechanism: "", proof: "", offer: "" },
  } });
}

describe("tarefas da campanha — leitura autorizada e vínculo exato", () => {
  it("retorna só tarefas do tenant e da campanha, sem tarefas avulsas ou de outra campanha", async () => {
    const deps = criarStrategyDeps();
    const selected = await campaign(deps);
    const alternative = await campaign(deps, owner, "Outra campanha");
    const foreign = await campaign(deps, other, "Campanha B");
    const linked = await createTask(deps, { ctx: owner, content: content(selected.id) });
    await createTask(deps, { ctx: owner, content: content(null) });
    await createTask(deps, { ctx: owner, content: content(alternative.id) });
    await createTask(deps, { ctx: other, content: content(foreign.id) });
    expect(await listCampaignTasks(deps, owner, selected.id)).toEqual([linked]);
  });

  it("Leitor consulta sem receber permissão de escrita", async () => {
    const deps = criarStrategyDeps();
    const selected = await campaign(deps);
    const linked = await createTask(deps, { ctx: owner, content: content(selected.id) });
    expect(viewer.permissions.has("strategy.write")).toBe(false);
    expect(await listCampaignTasks(deps, viewer, selected.id)).toEqual([linked]);
  });

  it("recusa ausência de strategy.read antes de abrir transação ou consultar existência", async () => {
    const deps = criarStrategyDeps();
    const denied: AccessContext = { ...owner, permissions: new Set() };
    const tx = vi.spyOn(deps.uow, "withUserTransaction");
    const readCampaign = vi.spyOn(deps.campaigns, "findById");
    const readTasks = vi.spyOn(deps.tasks, "list");
    await expect(listCampaignTasks(deps, denied, "47aba4f0-44ea-48d5-85f4-a9935615d57a" as CampaignId)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(tx).not.toHaveBeenCalled(); expect(readCampaign).not.toHaveBeenCalled(); expect(readTasks).not.toHaveBeenCalled();
  });

  it("campanha alheia e inexistente têm mesma recusa antes de listar tarefas", async () => {
    const deps = criarStrategyDeps();
    const foreign = await campaign(deps, other);
    const readTasks = vi.spyOn(deps.tasks, "list");
    const errors = [];
    for (const id of [foreign.id, "47aba4f0-44ea-48d5-85f4-a9935615d57a" as CampaignId]) {
      try { await listCampaignTasks(deps, owner, id); throw new Error("não recusou"); }
      catch (error) { errors.push(error); }
    }
    expect(errors).toEqual([expect.objectContaining({ code: "CAMPAIGN_NOT_FOUND", message: "campanha não encontrada" }), expect.objectContaining({ code: "CAMPAIGN_NOT_FOUND", message: "campanha não encontrada" })]);
    expect(readTasks).not.toHaveBeenCalled();
  });

  it("recusa retorno incoerente da porta da campanha e filtra retorno incoerente de tarefas", async () => {
    const deps = criarStrategyDeps();
    const selected = await campaign(deps);
    const linked = await createTask(deps, { ctx: owner, content: content(selected.id) });
    const readTasks = vi.spyOn(deps.tasks, "list");
    const readCampaign = vi.spyOn(deps.campaigns, "findById");
    for (const invalid of [{ ...selected, tenantId: B }, { ...selected, id: "47aba4f0-44ea-48d5-85f4-a9935615d57a" as CampaignId }]) {
      readCampaign.mockResolvedValueOnce(invalid);
      await expect(listCampaignTasks(deps, owner, selected.id)).rejects.toMatchObject({ code: "CAMPAIGN_NOT_FOUND" });
    }
    expect(readTasks).not.toHaveBeenCalled();
    readTasks.mockResolvedValueOnce([linked, { ...linked, tenantId: B }, { ...linked, campaignId: null }]);
    expect(await listCampaignTasks(deps, owner, selected.id)).toEqual([linked]);
  });

  it("valida campanha primeiro e lê tarefas na mesma transação, sem gravação/auditoria", async () => {
    const deps = criarStrategyDeps();
    const selected = await campaign(deps);
    const before = [...deps.estado.auditoria];
    const tx = vi.spyOn(deps.uow, "withUserTransaction");
    const readCampaign = vi.spyOn(deps.campaigns, "findById");
    const readTasks = vi.spyOn(deps.tasks, "list");
    expect(await listCampaignTasks(deps, owner, selected.id)).toEqual([]);
    expect(tx).toHaveBeenCalledTimes(1);
    const transaction = readCampaign.mock.calls[0]![0];
    expect(readCampaign).toHaveBeenCalledWith(transaction, A, selected.id);
    expect(readTasks).toHaveBeenCalledWith(transaction, A);
    expect(readCampaign.mock.invocationCallOrder[0]).toBeLessThan(readTasks.mock.invocationCallOrder[0]!);
    expect(deps.estado.auditoria).toEqual(before);
  });

  it("mantém todos os estados de tarefa, inclusive canceladas", async () => {
    const deps = criarStrategyDeps();
    const selected = await campaign(deps);
    const tasks = [];
    for (const state of ["todo", "in_progress", "done", "cancelled"] as const) {
      let task = await createTask(deps, { ctx: owner, content: content(selected.id) });
      if (state === "in_progress" || state === "done") task = await changeTaskStatus(deps, { ctx: owner, taskId: task.id, expectedRevision: task.revision, to: "in_progress" });
      if (state === "done" || state === "cancelled") task = await changeTaskStatus(deps, { ctx: owner, taskId: task.id, expectedRevision: task.revision, to: state });
      tasks.push(task);
    }
    expect(await listCampaignTasks(deps, owner, selected.id)).toEqual(tasks);
  });

  it("não exige campanha ativa nem altera o grafo/atribuição do modelo retornado", async () => {
    const deps = criarStrategyDeps();
    const selected = await campaign(deps);
    const separate = await createTask(deps, { ctx: owner, content: content(null) });
    const linked = await createTask(deps, { ctx: owner, content: content(selected.id, {
      dependsOn: [separate.id], assignee: { kind: "user", userId: owner.userId },
    }) });
    for (const status of ["draft", "active", "paused", "completed", "cancelled"] as CampaignStatus[]) {
      deps.estado.campanhas[0] = { ...selected, status };
      expect(await listCampaignTasks(deps, owner, selected.id)).toEqual([linked]);
    }
    expect(linked.dependsOn).toEqual([separate.id]);
    expect(linked.assignee).toEqual({ kind: "user", userId: owner.userId });
  });
});
