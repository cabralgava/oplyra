// Sem relógio global nem banco: classificação/ordenação são sinais de leitura.
import { describe, expect, it, vi } from "vitest";
import { civilDateInTimeZone, classifyTaskDueDate, sortTasksByDueDate, isValidCivilDate } from "../../core/src/domain/task-due-dates.ts";
import type { TaskStatus } from "../../core/src/domain/strategy.ts";
const task = (dueDate: string | null, status: TaskStatus = "todo") => ({ dueDate, status });
describe("Prazos civis das tarefas", () => {
  it("usa fuso explícito na virada de dia e ano, sem dia UTC implícito", () => {
    const instant = new Date("2027-01-01T01:00:00Z");
    expect(civilDateInTimeZone(instant, "America/Sao_Paulo")).toBe("2026-12-31");
    expect(civilDateInTimeZone(instant, "Pacific/Kiritimati")).toBe("2027-01-01");
    expect(civilDateInTimeZone(instant, "America/Los_Angeles")).toBe("2026-12-31");
  });
  it("mantém calendário gregoriano e dígitos ISO para ano bissexto", () => {
    expect(civilDateInTimeZone(new Date("2028-02-29T12:00:00Z"), "America/Sao_Paulo")).toBe("2028-02-29");
    expect(civilDateInTimeZone(new Date("2026-12-31T23:30:00Z"), "Asia/Tokyo")).toBe("2027-01-01");
  });
  it("respeita DST real sem somar offset fixo", () => {
    expect(civilDateInTimeZone(new Date("2026-03-08T04:30:00Z"), "America/New_York")).toBe("2026-03-07");
    expect(civilDateInTimeZone(new Date("2026-03-09T04:30:00Z"), "America/New_York")).toBe("2026-03-09");
    expect(civilDateInTimeZone(new Date("2026-11-01T05:30:00Z"), "America/New_York")).toBe("2026-11-01");
    expect(civilDateInTimeZone(new Date("2026-11-01T06:30:00Z"), "America/New_York")).toBe("2026-11-01");
  });
  it("clock/fuso inválidos não viram UTC ou fuso local", () => {
    const now = new Date("2026-11-20T12:00:00Z");
    for (const timezone of ["", " ", "Inválido/Fuso", undefined, null, 0]) expect(civilDateInTimeZone(now, timezone as string)).toBeNull();
    for (const invalid of [new Date(NaN), undefined, null, "2026-11-20"]) expect(civilDateInTimeZone(invalid as Date, "UTC")).toBeNull();
  });
  it("propaga falha inesperada do mecanismo de formatação", () => {
    const spy = vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => { throw new Error("indisponível"); });
    try {
      expect(() => civilDateInTimeZone(new Date("2026-11-20T12:00:00Z"), "America/Sao_Paulo")).toThrow("indisponível");
    } finally { spy.mockRestore(); }
    expect(civilDateInTimeZone(new Date("2026-11-20T12:00:00Z"), "Inválido/Fuso")).toBeNull();
  });
  it("preserva a faixa de anos 0100–9999 aceita pelo modelo existente", () => {
    for (const value of ["0001-01-01", "0099-12-31", "10000-01-01"]) expect(isValidCivilDate(value)).toBe(false);
    expect(isValidCivilDate("0100-01-01")).toBe(true); expect(isValidCivilDate("9999-12-31")).toBe(true);
  });
  it("distingue atrasada, hoje, próxima e sem prazo sem janela arbitrária", () => {
    expect(classifyTaskDueDate(task("2026-11-19"), "2026-11-20")).toBe("overdue");
    expect(classifyTaskDueDate(task("2026-11-20", "in_progress"), "2026-11-20")).toBe("today");
    expect(classifyTaskDueDate(task("2026-11-21"), "2026-11-20")).toBe("upcoming");
    expect(classifyTaskDueDate(task("2036-11-20"), "2026-11-20")).toBe("upcoming");
    expect(classifyTaskDueDate(task(null), null)).toBe("undated");
  });
  it.each(["done", "cancelled"] as const)("%s conserva prazo histórico sem atraso ativo", status => {
    expect(classifyTaskDueDate(task("2020-01-01", status), "2026-11-20")).toBe("historical");
    expect(classifyTaskDueDate(task("2020-01-01", status), null)).toBe("historical");
    expect(classifyTaskDueDate(task(null, status), "2026-11-20")).toBe("undated");
  });
  it("datas impossíveis e formatos ambíguos não recebem classe relativa", () => {
    for (const due of ["2026-02-29", "2100-02-29", "2028-02-30", "2026-04-31", "2026-00-20", "2026-13-01", "2026-11-00", "0000-01-01", "20/11/2026", "2026-1-01", "2026-11-20T00:00:00Z", ""]) {
      expect(classifyTaskDueDate(task(due), "2026-11-20")).toBe("unclassified");
      expect(classifyTaskDueDate(task(due, "done"), "2026-11-20")).toBe("unclassified");
    }
    expect(classifyTaskDueDate(task("2000-02-29"), "2026-11-20")).toBe("overdue");
    expect(classifyTaskDueDate(task("2028-02-29"), "2028-02-29")).toBe("today");
  });
  it("ausência ou invalidez de hoje preserva data absoluta sem classe relativa", () => {
    for (const today of [null, "", "2026-02-30", undefined]) expect(classifyTaskDueDate(task("2026-11-20"), today as string | null)).toBe("unclassified");
  });
  it("ordena cópia por data e grupo null/inválidas ao final; empates estáveis", () => {
    const entries = Object.freeze([
      Object.freeze({ id: "null-1", dueDate: null }), Object.freeze({ id: "late", dueDate: "2028-03-01" }),
      Object.freeze({ id: "same-1", dueDate: "2028-02-29" }), Object.freeze({ id: "invalid", dueDate: "2028-02-30" }),
      Object.freeze({ id: "same-2", dueDate: "2028-02-29" }), Object.freeze({ id: "null-2", dueDate: null }),
    ]);
    const original = [...entries], sorted = sortTasksByDueDate(entries);
    expect(sorted.map(t => t.id)).toEqual(["same-1", "same-2", "late", "null-1", "invalid", "null-2"]);
    expect(entries).toEqual(original); expect(sorted).not.toBe(entries); expect(sorted[0]).toBe(entries[2]);
  });
  it("não altera status, revisão, responsável, dependências nem conteúdo", () => {
    const entries = [{ id: "a", dueDate: "2026-11-20", status: "in_progress", revision: 9, assignee: { kind: "user", userId: "own" }, dependsOn: ["b"] }, { id: "b", dueDate: "2026-11-19", status: "todo", revision: 2, assignee: null, dependsOn: [] }];
    const before = structuredClone(entries); sortTasksByDueDate(entries); classifyTaskDueDate(task(entries[0]!.dueDate, "in_progress"), "2026-11-20");
    expect(entries).toEqual(before); expect(sortTasksByDueDate([])).toEqual([]);
  });
});
