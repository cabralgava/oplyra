// Contagens puras; não comprova relógio, SQL/RLS ou sessão hospedada.
import { describe, expect, it } from "vitest";
import type { Task } from "../../core/src/domain/strategy.ts";
import type { TaskId, TenantId, UserId } from "@oplyra/core";
import { summarizeOpenTaskDueDates, type OpenTaskDueDateSummary } from "../../core/src/domain/task-due-summary.ts";
const A = "7cb400b8-a6c2-4dab-8eda-43c7da1326e1" as TenantId, B = "7cb400b8-a6c2-4dab-8eda-43c7da1326e2" as TenantId;
const today = "2026-11-20";
const task = (id: string, dueDate: string | null, over: Partial<Task> = {}): Task => ({
  id: id as TaskId, tenantId: A, title: "Tarefa privada", description: "Conteúdo privado", campaignId: null,
  dueDate, assignee: { kind: "user", userId: "responsável" }, dependsOn: [], status: "todo", revision: 7,
  createdBy: "autor" as UserId, createdAt: new Date("2026-11-20T12:00:00Z"), ...over,
});
const empty = (over = {}) => ({ totalOpen: 0, overdue: 0, dueToday: 0, upcoming: 0, undated: 0, unclassified: 0, relativeDatesAvailable: true, ...over });
const partition = (result: OpenTaskDueDateSummary) => expect(result.overdue + result.dueToday + result.upcoming + result.undated + result.unclassified).toBe(result.totalOpen);

describe("Resumo dos prazos das tarefas abertas", () => {
  it("vazio com dia válido tem zero real e classificação disponível", () => {
    expect(summarizeOpenTaskDueDates([], today, A)).toEqual(empty());
  });
  it("particiona atrasada/hoje/futura/sem prazo/inválida sem duplicar", () => {
    const tasks = [task("a", "2026-11-19"), task("b", today, { status: "in_progress" }), task("c", "2026-11-21"), task("d", null), task("e", "2026-02-30")];
    const result = summarizeOpenTaskDueDates(tasks, today, A);
    expect(result).toEqual(empty({ totalOpen: 5, overdue: 1, dueToday: 1, upcoming: 1, undated: 1, unclassified: 1 })); partition(result);
  });
  it("ignora concluídas/canceladas mesmo com prazos passados ou ausentes", () => {
    const result = summarizeOpenTaskDueDates([task("a", "2020-01-01", { status: "done" }), task("b", "2020-01-01", { status: "cancelled" }), task("c", null, { status: "done" }), task("d", null, { status: "cancelled" })], today, A);
    expect(result).toEqual(empty()); partition(result);
  });
  it("guarda tenant explícito antes de agregar, sem expor qualquer identidade", () => {
    const result = summarizeOpenTaskDueDates([task("own", null), task("foreign", "2020-01-01", { tenantId: B, title: "SEGREDO" })], today, A);
    expect(result).toEqual(empty({ totalOpen: 1, undated: 1 }));
    expect(JSON.stringify(result)).not.toMatch(/foreign|SEGREDO|responsável/);
  });
  it("dia ausente ou malformado não presume que zero atrasadas prove ausência de atraso", () => {
    const tasks = [task("a", "2020-01-01"), task("b", today), task("c", "2040-01-01"), task("d", null), task("e", "2026-02-30")];
    for (const invalid of [null, "", "2026-02-30", "20/11/2026", undefined]) {
      const result = summarizeOpenTaskDueDates(tasks, invalid as string | null, A);
      expect(result).toEqual(empty({ totalOpen: 5, undated: 1, unclassified: 4, relativeDatesAvailable: false })); partition(result);
    }
  });
  it("vazio/terminais também declaram indisponibilidade se não há dia válido", () => {
    expect(summarizeOpenTaskDueDates([], null, A)).toEqual(empty({ relativeDatesAvailable: false }));
    expect(summarizeOpenTaskDueDates([task("a", today, { status: "done" })], null, A)).toEqual(empty({ relativeDatesAvailable: false }));
  });
  it("zero atrasadas com hoje válido não inventa pendência", () => {
    expect(summarizeOpenTaskDueDates([task("a", today), task("b", "2026-11-21")], today, A)).toEqual(empty({ totalOpen: 2, dueToday: 1, upcoming: 1 }));
  });
  it("o escopo é só a lista filtrada, não referências fora do filtro", () => {
    const visible = task("visible", today), outside = task("outside", "2020-01-01");
    const read = { tasks: [visible], references: [visible, outside] };
    expect(summarizeOpenTaskDueDates(read.tasks, today, A)).toEqual(empty({ totalOpen: 1, dueToday: 1 }));
    expect(summarizeOpenTaskDueDates([], today, A).totalOpen).toBe(0);
  });
  it("preserva ordem, revisão, responsável, dependências e objetos congelados", () => {
    const a = task("a", today, { dependsOn: ["b" as TaskId] }), b = task("b", null);
    const tasks = Object.freeze([Object.freeze(a), Object.freeze(b)]), before = structuredClone(tasks);
    summarizeOpenTaskDueDates(tasks, today, A);
    expect(tasks).toEqual(before); expect(tasks[0]).toBe(a); expect(tasks[1]).toBe(b);
  });
  it("reutiliza limites gregorianos e não normaliza datas impossíveis", () => {
    const result = summarizeOpenTaskDueDates([task("leap", "2028-02-29"), task("not-leap", "2100-02-29"), task("rollover", "2026-04-31")], "2028-02-29", A);
    expect(result).toEqual(empty({ totalOpen: 3, dueToday: 1, unclassified: 2 })); partition(result);
  });
});
