// Costura formulário web → casos de uso reais. Fakes somente nas portas de persistência;
// estes testes não representam evidência de RLS ou do percurso hospedado.
import { describe, expect, it } from "vitest";
import { criarStrategyDeps, contextoDeEstrategia } from "../packages/testing/src/strategy.ts";
import { createTask, listTasks, changeTaskStatus, createCampaignDraft, metodoVazio } from "../apps/web/src/lib/estrategia.ts";
import { lerTarefa, lerRevisao, destinoDeErro } from "../apps/web/src/lib/estrategia-form.ts";
import type { TenantId, TaskId } from "@oplyra/core";

const tenantA = "11111111-1111-4111-8111-111111111111" as TenantId;
const tenantB = "22222222-2222-4222-8222-222222222222" as TenantId;
const owner = contextoDeEstrategia({ tenantId: tenantA, roleKey: "owner" });
const reader = contextoDeEstrategia({ tenantId: tenantA, roleKey: "viewer" });
const other = contextoDeEstrategia({ tenantId: tenantB, roleKey: "owner" });
const form = (fields: Record<string, string | string[]> = {}) => {
  const data = new FormData();
  for (const [key, values] of Object.entries({ title: "Revisar proposta", ...fields })) {
    for (const value of Array.isArray(values) ? values : [values]) data.append(key, value);
  }
  return data;
};

describe("Operação oficial: contrato do formulário com a aplicação", () => {
  it("preserva data civil e referência; a releitura não inventa responsável", async () => {
    const deps = criarStrategyDeps();
    const campaign = await createCampaignDraft(deps, { ctx: owner, content: {
      name: "Campanha real do teste", objectiveId: null, productKey: null, method: metodoVazio(), trackingKey: "",
    } });
    const task = await createTask(deps, { ctx: owner, content: lerTarefa(form({
      campaignId: campaign.id, dueDate: "2028-02-29", description: "Confirmar oferta", assignee: "agent:copywriting-agent",
    })) });
    expect((await listTasks(deps, reader)).find((entry) => entry.id === task.id)).toMatchObject({
      campaignId: campaign.id, dueDate: "2028-02-29", description: "Confirmar oferta", assignee: null, status: "todo",
    });
  });

  it.each(["2026-02-29", "2026-04-31", "20/11/2026", "2026-11-20T00:00:00Z"])("recusa prazo civil inválido %s antes de persistir", async (date) => {
    const deps = criarStrategyDeps();
    await expect(createTask(deps, { ctx: owner, content: lerTarefa(form({ dueDate: date })) })).rejects.toMatchObject({ code: "TASK_INVALID" });
    expect(await listTasks(deps, owner)).toEqual([]);
  });

  it("mantém dependência e permite iniciar sem inventar bloqueio de execução", async () => {
    const deps = criarStrategyDeps();
    const first = await createTask(deps, { ctx: owner, content: lerTarefa(form({ dueDate: " " })) });
    const second = await createTask(deps, { ctx: owner, content: lerTarefa(form({ title: "Publicar proposta", dep: first.id })) });
    await changeTaskStatus(deps, { ctx: owner, taskId: second.id, expectedRevision: second.revision, to: "in_progress" });
    const tasks = await listTasks(deps, owner);
    expect(tasks.find((entry) => entry.id === first.id)).toMatchObject({ status: "todo", dueDate: null });
    expect(tasks.find((entry) => entry.id === second.id)).toMatchObject({ status: "in_progress", dependsOn: [first.id] });
  });

  it("revisão antiga não sobrescreve estado persistido e o erro é apresentável", async () => {
    const deps = criarStrategyDeps();
    const task = await createTask(deps, { ctx: owner, content: lerTarefa(form()) });
    await changeTaskStatus(deps, { ctx: owner, taskId: task.id, expectedRevision: 1, to: "in_progress" });
    try {
      await changeTaskStatus(deps, { ctx: owner, taskId: task.id, expectedRevision: lerRevisao(form({ revisao: "1" })), to: "cancelled" });
      expect.fail("A revisão obsoleta deveria ser recusada");
    } catch (error) {
      expect(error).toMatchObject({ code: "CONFLICT_VERSION" });
      expect(destinoDeErro("/operacao", error)).toContain("erro=CONFLICT_VERSION");
    }
    expect((await listTasks(deps, owner))[0]).toMatchObject({ status: "in_progress", revision: 2 });
  });

  it("leitor consulta, mas não cria ou muda estado", async () => {
    const deps = criarStrategyDeps();
    const task = await createTask(deps, { ctx: owner, content: lerTarefa(form()) });
    await expect(createTask(deps, { ctx: reader, content: lerTarefa(form()) })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    await expect(changeTaskStatus(deps, { ctx: reader, taskId: task.id, expectedRevision: 1, to: "cancelled" })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(await listTasks(deps, reader)).toEqual([task]);
  });

  it("IDs alheios e ausentes são indistinguíveis, sem revelar a tarefa", async () => {
    const deps = criarStrategyDeps();
    const task = await createTask(deps, { ctx: owner, content: lerTarefa(form()) });
    for (const id of [task.id, "ffffffff-ffff-4fff-8fff-ffffffffffff" as TaskId]) {
      await expect(changeTaskStatus(deps, { ctx: other, taskId: id, expectedRevision: 1, to: "cancelled" })).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
      await expect(createTask(deps, { ctx: other, content: lerTarefa(form({ dep: id })) })).rejects.toMatchObject({ code: "REFERENCE_NOT_FOUND" });
    }
    expect(await listTasks(deps, other)).toEqual([]);
    expect(await listTasks(deps, owner)).toEqual([task]);
  });
});
