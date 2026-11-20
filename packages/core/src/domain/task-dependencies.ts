import type { Task } from "./strategy.ts";

/** Sinal de leitura das dependências diretas; não muda estado nem autoriza transições. */
export type TaskDependencySummary = {
  readonly total: number;
  readonly completed: number;
  readonly pending: number;
  readonly cancelled: number;
  readonly unavailable: number;
  readonly attentionRequired: boolean;
};

/**
 * Só referências da própria empresa podem satisfazer uma dependência. Ausente e alheia
 * são indistinguíveis; a saída contém apenas contagens, sem identidades ou conteúdo.
 * Cancelada não equivale a concluída. Não percorre o grafo nem propaga bloqueios.
 */
export function summarizeTaskDependencies(task: Task, references: readonly Task[]): TaskDependencySummary {
  const own = new Map(references.filter(reference => reference.tenantId === task.tenantId).map(reference => [reference.id, reference]));
  let completed = 0, pending = 0, cancelled = 0, unavailable = 0;
  for (const id of task.dependsOn) {
    const reference = own.get(id);
    if (!reference) unavailable++;
    else if (reference.status === "done") completed++;
    else if (reference.status === "cancelled") cancelled++;
    else pending++;
  }
  return {
    total: task.dependsOn.length, completed, pending, cancelled, unavailable,
    attentionRequired: (task.status === "todo" || task.status === "in_progress") && pending + cancelled + unavailable > 0,
  };
}
