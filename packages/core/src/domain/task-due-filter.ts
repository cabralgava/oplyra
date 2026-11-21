import type { Task } from "./strategy.ts";
import type { TenantId } from "./ids.ts";
import { ReferenceNotFound } from "./errors.ts";
import { classifyTaskDueDate, isValidCivilDate } from "./task-due-dates.ts";

export type TaskDueDateFilter = "all" | "overdue" | "today" | "upcoming" | "undated" | "unclassified";
export type TaskDueDateFilterResult = { readonly tasks: readonly Task[]; readonly available: boolean };

/**
 * Filtro visual sobre a lista já autorizada da campanha; nunca sobre suas referências.
 * Preserva ordem e objetos. Somente all inclui terminais; as categorias descrevem abertas.
 */
export function filterTasksByDueDate(tasks: readonly Task[], today: string | null, tenantId: TenantId, filter: TaskDueDateFilter): TaskDueDateFilterResult {
  if (filter !== "all" && filter !== "overdue" && filter !== "today" && filter !== "upcoming" && filter !== "undated" && filter !== "unclassified") throw new ReferenceNotFound();
  if ((filter === "overdue" || filter === "today" || filter === "upcoming") && !isValidCivilDate(today)) return { tasks: [], available: false };
  return {
    tasks: tasks.filter(task => task.tenantId === tenantId && (filter === "all" || ((task.status === "todo" || task.status === "in_progress") && classifyTaskDueDate(task, today) === filter))),
    available: true,
  };
}
