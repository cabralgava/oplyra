import type { Task } from "./strategy.ts";

export type TaskDueDateClassification = "undated" | "overdue" | "today" | "upcoming" | "historical" | "unclassified";

/** Comparação civil estrita, sem transformar prazo em instante nem aceitar rollover. */
export function isValidCivilDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  // Alinha a faixa 0100–9999 já aceita por dataCivilValida em strategy.ts.
  if (year < 100 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
}

/** Relógio e fuso são entradas explícitas; sem fallback para o fuso do servidor/UTC. */
export function civilDateInTimeZone(now: Date, timezone: string): string | null {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || typeof timezone !== "string" || !timezone.trim()) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone, calendar: "gregory", numberingSystem: "latn",
      year: "numeric", month: "2-digit", day: "2-digit", era: "short",
    }).formatToParts(now);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value;
    if (part("era") !== "AD") return null;
    const year = part("year"), month = part("month"), day = part("day");
    if (!year || !month || !day) return null;
    const result = `${year.padStart(4, "0")}-${month}-${day}`;
    return isValidCivilDate(result) ? result : null;
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

/** Sinal visual, sem SLA, alteração de estado ou efeito nas transições. */
export function classifyTaskDueDate(task: Pick<Task, "dueDate" | "status">, today: string | null): TaskDueDateClassification {
  if (task.dueDate === null) return "undated";
  if (!isValidCivilDate(task.dueDate)) return "unclassified";
  if (task.status === "done" || task.status === "cancelled") return "historical";
  if (!isValidCivilDate(today)) return "unclassified";
  return task.dueDate < today ? "overdue" : task.dueDate === today ? "today" : "upcoming";
}

/**
 * Cópia estável: datas válidas crescentes, depois grupo sem data ordenável (null/inválida).
 * Empates preservam a ordem recebida. A tela decide em quais colunas aplicar a ordenação.
 */
export function sortTasksByDueDate<T extends Pick<Task, "dueDate">>(tasks: readonly T[]): T[] {
  const rank = (due: unknown) => isValidCivilDate(due) ? 0 : 1;
  return tasks.map((task, index) => ({ task, index })).sort((a, b) => {
    const first = rank(a.task.dueDate), second = rank(b.task.dueDate);
    if (first !== second) return first - second;
    if (first === 0 && a.task.dueDate !== b.task.dueDate) return a.task.dueDate! < b.task.dueDate! ? -1 : 1;
    return a.index - b.index;
  }).map(entry => entry.task);
}
