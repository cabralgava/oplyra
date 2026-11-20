// Helper puro: não comprova SQL/RLS nem uma política de bloqueio de execução.
import { describe, expect, it } from "vitest";
import type { Task } from "../../core/src/domain/strategy.ts";
import type { TaskId, TenantId, UserId } from "@oplyra/core";
import { summarizeTaskDependencies } from "../../core/src/domain/task-dependencies.ts";

const A = "b51d4739-b7ef-463c-b336-6aaeb9d4cc91" as TenantId;
const B = "b51d4739-b7ef-463c-b336-6aaeb9d4cc92" as TenantId;
const task = (id: string, over: Partial<Task> = {}): Task => ({
  id: id as TaskId, tenantId: A, title: `Tarefa ${id}`, description: "Conteúdo privado",
  campaignId: null, dueDate: null, assignee: { kind: "user", userId: "responsável" }, dependsOn: [],
  status: "todo", revision: 7, createdBy: "autor" as UserId, createdAt: new Date("2026-11-20T12:00:00Z"), ...over,
});
const summary = (over = {}) => ({ total: 0, completed: 0, pending: 0, cancelled: 0, unavailable: 0, attentionRequired: false, ...over });

describe("Sinalização das dependências diretas de tarefas", () => {
  it("sem dependências não pede atenção", () => {
    expect(summarizeTaskDependencies(task("root"), [])).toEqual(summary());
  });
  it("só done satisfaz; todo e in_progress permanecem pendentes", () => {
    const done = task("done", { status: "done" }), todo = task("todo"), progress = task("progress", { status: "in_progress" });
    expect(summarizeTaskDependencies(task("root", { dependsOn: [done.id, todo.id, progress.id] }), [progress, done, todo]))
      .toEqual(summary({ total: 3, completed: 1, pending: 2, attentionRequired: true }));
    expect(summarizeTaskDependencies(task("root", { dependsOn: [done.id] }), [done]))
      .toEqual(summary({ total: 1, completed: 1 }));
  });
  it("cancelada e indisponível são distintas de pendente e de concluída", () => {
    const cancelled = task("cancelled", { status: "cancelled" });
    expect(summarizeTaskDependencies(task("root", { dependsOn: [cancelled.id, "missing" as TaskId] }), [cancelled]))
      .toEqual(summary({ total: 2, cancelled: 1, unavailable: 1, attentionRequired: true }));
  });
  it("referência alheia e ausente têm saída idêntica sem identidade/conteúdo", () => {
    const foreign = task("private", { tenantId: B, status: "done", title: "SEGREDO" });
    const root = task("root", { dependsOn: [foreign.id] });
    const result = summarizeTaskDependencies(root, [foreign]);
    expect(result).toEqual(summarizeTaskDependencies(root, []));
    expect(result).toEqual(summary({ total: 1, unavailable: 1, attentionRequired: true }));
    expect(JSON.stringify(result)).not.toMatch(/private|SEGREDO|responsável/);
  });
  it("filtra tenant antes do lookup mesmo se referência alheia colidir com ID próprio", () => {
    const own = task("same", { status: "todo" }), foreign = task("same", { tenantId: B, status: "done" });
    expect(summarizeTaskDependencies(task("root", { dependsOn: [own.id] }), [own, foreign]))
      .toEqual(summary({ total: 1, pending: 1, attentionRequired: true }));
  });
  it.each(["done", "cancelled"] as const)("tarefa %s conserva histórico sem sinal ativo", status => {
    const dependency = task("dep");
    expect(summarizeTaskDependencies(task("root", { status, dependsOn: [dependency.id] }), [dependency]))
      .toEqual(summary({ total: 1, pending: 1 }));
  });
  it("tarefa em andamento também recebe sinal sem alterar seu estado", () => {
    const root = task("root", { status: "in_progress", dependsOn: ["missing" as TaskId] });
    expect(summarizeTaskDependencies(root, []).attentionRequired).toBe(true);
    expect(root.status).toBe("in_progress"); expect(root.revision).toBe(7);
  });
  it("não infere bloqueio transitivo nem recorre em ciclos", () => {
    const root = task("root", { dependsOn: ["done" as TaskId] });
    const done = task("done", { status: "done", dependsOn: [root.id, "missing" as TaskId] });
    expect(summarizeTaskDependencies(root, [root, done])).toEqual(summary({ total: 1, completed: 1 }));
    expect(summarizeTaskDependencies(task("self", { dependsOn: ["self" as TaskId] }), [task("self")]))
      .toEqual(summary({ total: 1, pending: 1, attentionRequired: true }));
  });
  it("usa referências completas fora do filtro e preserva ordem, estados e revisões", () => {
    const outside = task("outside", { campaignId: "outra-campanha" as Task["campaignId"] });
    const root = task("root", { dependsOn: [outside.id] });
    const references = Object.freeze([Object.freeze(outside), Object.freeze(root)]);
    const before = structuredClone(references);
    expect(summarizeTaskDependencies(Object.freeze(root), references)).toEqual(summary({ total: 1, pending: 1, attentionRequired: true }));
    expect(references).toEqual(before); expect(root.dependsOn).toEqual([outside.id]);
  });
});
