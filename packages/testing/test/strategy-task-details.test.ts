// Aplicação com portas fake: não comprova atomicidade SQL, RLS nem sessões hospedadas.
import { describe, expect, it, vi } from "vitest";
import type { TaskId, TenantId, Tx } from "@oplyra/core";
import { criarStrategyDeps, contextoDeEstrategia } from "../src/strategy.ts";
import {
  createTask, saveTask, saveTaskDetails, changeTaskStatus, type TaskDetails,
} from "../../core/src/application/use-cases/strategy-tasks.ts";
import { createCampaignDraft } from "../../core/src/application/use-cases/strategy.ts";
import type { TaskContent } from "../../core/src/domain/strategy.ts";

const A = "f36a30fe-97d2-4112-8b36-0d91ab034d18" as TenantId;
const B = "f36a30fe-97d2-4112-8b36-0d91ab034d19" as TenantId;
const ctx = contextoDeEstrategia({ tenantId: A, roleKey: "owner" });
const outro = contextoDeEstrategia({ tenantId: B, roleKey: "owner" });
const leitor = contextoDeEstrategia({ tenantId: A, roleKey: "viewer" });
const details = (over: Partial<TaskDetails> = {}): TaskDetails => ({
  title: "Revisar conteúdo", description: "Conferir evidência", campaignId: null,
  dueDate: "2028-02-29", dependsOn: [], ...over,
});
const content = (over: Partial<TaskContent> = {}): TaskContent => ({ ...details(), assignee: null, ...over });

describe("edição de detalhes sem autoridade sobre responsável/estado", () => {
  it.each([null, { kind: "user" as const, userId: ctx.userId }])("preserva responsável %j e incrementa uma revisão", async (assignee) => {
    const deps = criarStrategyDeps();
    const created = await createTask(deps, { ctx, content: content({ assignee }) });
    const saved = await saveTaskDetails(deps, { ctx, taskId: created.id, expectedRevision: 1, content: details({ title: "Editado" }) });
    expect(saved).toMatchObject({ title: "Editado", assignee, status: "todo", revision: 2, createdBy: created.createdBy, createdAt: created.createdAt });
    expect(deps.estado.auditoria.at(-1)).toMatchObject({ action: "task.save", target: created.id, after: { revision: 2, dependencies: 0 } });
  });

  it.each(["in_progress", "done"] as const)("preserva estado %s ao editar", async (status) => {
    const deps = criarStrategyDeps();
    let current = await createTask(deps, { ctx, content: content() });
    current = await changeTaskStatus(deps, { ctx, taskId: current.id, expectedRevision: current.revision, to: "in_progress" });
    if (status === "done") current = await changeTaskStatus(deps, { ctx, taskId: current.id, expectedRevision: current.revision, to: "done" });
    const saved = await saveTaskDetails(deps, { ctx, taskId: current.id, expectedRevision: current.revision, content: details() });
    expect(saved.status).toBe(status);
    expect(saved.revision).toBe(current.revision + 1);
  });

  it("ignora campos extras, inclusive um getter de responsável, vindos do chamador", async () => {
    const deps = criarStrategyDeps();
    const assigned = { kind: "user" as const, userId: ctx.userId };
    const created = await createTask(deps, { ctx, content: content({ assignee: assigned }) });
    const supplied = { ...details(), status: "cancelled", revision: 900, tenantId: B, createdBy: "forjado" };
    Object.defineProperty(supplied, "assignee", { get() { throw new Error("campo não editável foi lido"); } });
    const saved = await saveTaskDetails(deps, { ctx, taskId: created.id, expectedRevision: 1, content: supplied });
    expect(saved).toMatchObject({ assignee: assigned, status: "todo", revision: 2, tenantId: A, createdBy: ctx.userId });
  });

  it("preserva agente habilitado e recusa edição se desabilitado, sem apagá-lo", async () => {
    const deps = criarStrategyDeps({ agentesHabilitados: new Map([[A, new Set(["copywriting-agent"])]]) });
    const assignee = { kind: "agent" as const, agentKey: "copywriting-agent" };
    const created = await createTask(deps, { ctx, content: content({ assignee }) });
    const saved = await saveTaskDetails(deps, { ctx, taskId: created.id, expectedRevision: 1, content: details() });
    expect(saved.assignee).toEqual(assignee);
    deps.estado.agentesHabilitados.get(A)!.clear();
    await expect(saveTaskDetails(deps, { ctx, taskId: created.id, expectedRevision: 2, content: details({ title: "Não salva" }) })).rejects.toMatchObject({ code: "TASK_ASSIGNEE_INVALID" });
    expect(deps.estado.tarefas[0]).toEqual(saved);
    expect(deps.estado.auditoria).toHaveLength(2);
  });

  it("API saveTask anterior continua permitindo a atribuição explícita", async () => {
    const deps = criarStrategyDeps();
    const created = await createTask(deps, { ctx, content: content() });
    const assigned = { kind: "user" as const, userId: ctx.userId };
    const saved = await saveTask(deps, { ctx, taskId: created.id, expectedRevision: 1, content: content({ assignee: assigned }) });
    expect(saved.assignee).toEqual(assigned);
  });

  it("Leitor é recusado antes da transação", async () => {
    const deps = criarStrategyDeps();
    const created = await createTask(deps, { ctx, content: content() });
    const transaction = vi.spyOn(deps.uow, "withUserTransaction");
    await expect(saveTaskDetails(deps, { ctx: leitor, taskId: created.id, expectedRevision: 1, content: details() })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(transaction).not.toHaveBeenCalled();
    expect(deps.estado.tarefas[0]).toEqual(created);
  });

  it("tarefa alheia e inexistente têm a mesma recusa", async () => {
    const deps = criarStrategyDeps();
    const created = await createTask(deps, { ctx: outro, content: content() });
    for (const taskId of [created.id, "e753d89d-e79d-4283-bd25-cf0b26d0b882" as TaskId]) {
      await expect(saveTaskDetails(deps, { ctx, taskId, expectedRevision: 1, content: details() })).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
    }
    expect(deps.estado.tarefas[0]).toEqual(created);
  });

  it("referências de campanha/dependência alheias não são aplicadas", async () => {
    const deps = criarStrategyDeps();
    const created = await createTask(deps, { ctx, content: content() });
    const foreignTask = await createTask(deps, { ctx: outro, content: content() });
    const foreignCampaign = await createCampaignDraft(deps, { ctx: outro, content: {
      name: "Campanha B", trackingKey: "campanha-b", objectiveId: null, productKey: null,
      method: { situation: "", pain: "", consequence: "", desire: "", mechanism: "", proof: "", offer: "" },
    } });
    for (const edited of [details({ campaignId: foreignCampaign.id }), details({ dependsOn: [foreignTask.id] })]) {
      await expect(saveTaskDetails(deps, { ctx, taskId: created.id, expectedRevision: 1, content: edited })).rejects.toMatchObject({ code: "REFERENCE_NOT_FOUND" });
    }
    expect(deps.estado.tarefas.find(t => t.id === created.id)).toEqual(created);
  });

  it("auto-dependência e ciclo são recusados", async () => {
    const deps = criarStrategyDeps();
    const first = await createTask(deps, { ctx, content: content() });
    const second = await createTask(deps, { ctx, content: content({ dependsOn: [first.id] }) });
    for (const id of [first.id, second.id]) {
      await expect(saveTaskDetails(deps, { ctx, taskId: first.id, expectedRevision: 1, content: details({ dependsOn: [id] }) })).rejects.toMatchObject({ code: "TASK_DEPENDENCY_CYCLE" });
    }
    expect(deps.estado.tarefas[0]).toEqual(first);
  });

  it("cancelada permanece terminal e revisão obsoleta não sobrescreve", async () => {
    const deps = criarStrategyDeps();
    const created = await createTask(deps, { ctx, content: content() });
    const saved = await saveTaskDetails(deps, { ctx, taskId: created.id, expectedRevision: 1, content: details({ title: "Atual" }) });
    await expect(saveTaskDetails(deps, { ctx, taskId: created.id, expectedRevision: 1, content: details({ title: "Antigo" }) })).rejects.toMatchObject({ code: "CONFLICT_VERSION" });
    const cancelled = await changeTaskStatus(deps, { ctx, taskId: created.id, expectedRevision: saved.revision, to: "cancelled" });
    await expect(saveTaskDetails(deps, { ctx, taskId: created.id, expectedRevision: cancelled.revision, content: details() })).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    expect(deps.estado.tarefas[0]).toEqual(cancelled);
  });

  it("campos inválidos são recusados sem escrita", async () => {
    const deps = criarStrategyDeps();
    const created = await createTask(deps, { ctx, content: content() });
    for (const edited of [details({ title: " " }), details({ dueDate: "2026-02-30" })]) {
      await expect(saveTaskDetails(deps, { ctx, taskId: created.id, expectedRevision: 1, content: edited })).rejects.toMatchObject({ code: "TASK_INVALID" });
    }
    expect(deps.estado.tarefas[0]).toEqual(created);
  });

  it("leitura, merge, escrita e auditoria usam uma única transação", async () => {
    const deps = criarStrategyDeps();
    const created = await createTask(deps, { ctx, content: content() });
    const currentTx: Tx = {};
    const original = { find: deps.tasks.findById, replace: deps.tasks.replaceContent, audit: deps.audit.record };
    const transaction = vi.spyOn(deps.uow, "withUserTransaction").mockImplementation(async (_ctx, fn) => fn(currentTx));
    deps.tasks.findById = async (tx, ...args) => { expect(tx).toBe(currentTx); return original.find(tx, ...args); };
    deps.tasks.replaceContent = async (tx, input) => { expect(tx).toBe(currentTx); return original.replace(tx, input); };
    deps.audit.record = async (tx, entry) => { expect(tx).toBe(currentTx); return original.audit(tx, entry); };
    await saveTaskDetails(deps, { ctx, taskId: created.id, expectedRevision: 1, content: details() });
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
