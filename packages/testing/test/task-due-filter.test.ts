// Helper puro: não comprova Auth, RLS nem persistência SQL/hospedada.
import { describe, expect, it } from "vitest";
import type { Task } from "../../core/src/domain/strategy.ts";
import type { TaskId, TenantId, UserId } from "@oplyra/core";
import { filterTasksByDueDate, type TaskDueDateFilter } from "../../core/src/domain/task-due-filter.ts";
const A = "812224ad-9868-4a4e-b9f8-b78913c00321" as TenantId, B = "812224ad-9868-4a4e-b9f8-b78913c00322" as TenantId;
const today = "2026-11-20";
const task = (id: string, dueDate: string | null, over: Partial<Task> = {}): Task => ({
  id: id as TaskId, tenantId: A, title: "Tarefa privada", description: "Conteúdo privado", campaignId: null,
  dueDate, assignee: { kind: "user", userId: "responsável" }, dependsOn: [], status: "todo", revision: 7,
  createdBy: "autor" as UserId, createdAt: new Date("2026-11-20T12:00:00Z"), ...over,
});
const overdue = task("past", "2026-11-19"), due = task("today", today, { status: "in_progress" }), upcoming = task("future", "2026-11-21"), undated = task("none", null), invalid = task("invalid", "2026-02-30");
const done = task("done", "2020-01-01", { status: "done" }), cancelled = task("cancelled", null, { status: "cancelled" });
const tasks = [upcoming, done, overdue, undated, due, cancelled, invalid];

describe("Filtro visual de tarefas por situação do prazo", () => {
  it("all faz cópia com todos os estados próprios, sem ordenar/mutar", () => {
    const result = filterTasksByDueDate(tasks, today, A, "all");
    expect(result).toEqual({ tasks, available: true }); expect(result.tasks).not.toBe(tasks); expect(result.tasks[0]).toBe(upcoming);
  });
  it.each([["overdue", overdue], ["today", due], ["upcoming", upcoming], ["undated", undated], ["unclassified", invalid]] as const)("%s seleciona só categoria das abertas", (filter, expected) => {
    expect(filterTasksByDueDate(tasks, today, A, filter)).toEqual({ tasks: [expected], available: true });
  });
  it("categorias disponíveis particionam abertas e nunca incluem terminais", () => {
    const filters: TaskDueDateFilter[] = ["overdue", "today", "upcoming", "undated", "unclassified"];
    const ids = filters.flatMap(filter => filterTasksByDueDate(tasks, today, A, filter).tasks.map(t => t.id));
    expect(ids).toHaveLength(5); expect(new Set(ids).size).toBe(5); expect(ids).not.toContain(done.id); expect(ids).not.toContain(cancelled.id);
  });
  it("tenant explícito exclui referências alheias em toda categoria, inclusive all", () => {
    const foreign = task("foreign", "2020-01-01", { tenantId: B, title: "SEGREDO" });
    for (const filter of ["all", "overdue", "today", "upcoming", "undated", "unclassified"] as const) {
      const result = filterTasksByDueDate([foreign], today, A, filter);
      expect(result.tasks).toEqual([]); expect(JSON.stringify(result)).not.toMatch(/foreign|SEGREDO/);
    }
  });
  it("dia inválido torna filtros relativos indisponíveis, inclusive sem tarefas", () => {
    for (const date of [null, "", "2026-02-30", undefined]) for (const filter of ["overdue", "today", "upcoming"] as const) {
      expect(filterTasksByDueDate(tasks, date as string | null, A, filter)).toEqual({ tasks: [], available: false });
      expect(filterTasksByDueDate([], date as string | null, A, filter)).toEqual({ tasks: [], available: false });
    }
  });
  it("all/undated/unclassified continuam disponíveis sem dia e null não vira indisponível", () => {
    expect(filterTasksByDueDate(tasks, null, A, "all")).toEqual({ tasks, available: true });
    expect(filterTasksByDueDate(tasks, null, A, "undated")).toEqual({ tasks: [undated], available: true });
    expect(filterTasksByDueDate(tasks, null, A, "unclassified")).toEqual({ tasks: [upcoming, overdue, due, invalid], available: true });
  });
  it("filtro desconhecido ou de outro tipo é recusado sem fallback all", () => {
    for (const value of ["", " ", "ALL", "historical", "constructor", undefined, null, 0, true, {}, ["all"]]) {
      expect(() => filterTasksByDueDate(tasks, today, A, value as TaskDueDateFilter)).toThrow(expect.objectContaining({ code: "REFERENCE_NOT_FOUND" }));
    }
  });
  it("preserva referências, revisão, estado, responsável e ordem original", () => {
    const frozen = Object.freeze(tasks.map(t => Object.freeze({ ...t, dependsOn: Object.freeze([overdue.id]) }))), before = structuredClone(frozen);
    for (const filter of ["all", "overdue", "unclassified"] as const) filterTasksByDueDate(frozen, today, A, filter);
    expect(frozen).toEqual(before); expect(filterTasksByDueDate(frozen, today, A, "all").tasks[0]).toBe(frozen[0]);
  });
  it("recebe lista do filtro de campanha sem buscar tarefas em references", () => {
    const read = { tasks: [due], references: [due, overdue] };
    expect(filterTasksByDueDate(read.tasks, today, A, "overdue")).toEqual({ tasks: [], available: true });
    expect(read.references).toEqual([due, overdue]);
  });
});
