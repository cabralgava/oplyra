import type { Task } from "./strategy.ts";
import type { TenantId } from "./ids.ts";
import { classifyTaskDueDate, isValidCivilDate } from "./task-due-dates.ts";

export type OpenTaskDueDateSummary = {
  readonly totalOpen: number;
  readonly overdue: number;
  readonly dueToday: number;
  readonly upcoming: number;
  readonly undated: number;
  readonly unclassified: number;
  /** Validade do dia civil informado, não garantia de validade de cada prazo. */
  readonly relativeDatesAvailable: boolean;
};

/**
 * Resumo de leitura das tarefas abertas recebidas, nunca do grafo de referências.
 * A tela fornece a lista do filtro atual e o dia civil da empresa já autorizado.
 * Sem dia válido, zero atrasadas é só contagem não classificável, não ausência de atraso.
 */
export function summarizeOpenTaskDueDates(tasks: readonly Task[], today: string | null, tenantId: TenantId): OpenTaskDueDateSummary {
  let totalOpen = 0, overdue = 0, dueToday = 0, upcoming = 0, undated = 0, unclassified = 0;
  for (const task of tasks) {
    if (task.tenantId !== tenantId || (task.status !== "todo" && task.status !== "in_progress")) continue;
    totalOpen++;
    switch (classifyTaskDueDate(task, today)) {
      case "overdue": overdue++; break;
      case "today": dueToday++; break;
      case "upcoming": upcoming++; break;
      case "undated": undated++; break;
      default: unclassified++; break;
    }
  }
  return { totalOpen, overdue, dueToday, upcoming, undated, unclassified, relativeDatesAvailable: isValidCivilDate(today) };
}
