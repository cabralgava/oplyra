import type { StrategyDeps } from "../strategy-ports.ts";
import type { AccessContext } from "../../domain/access-context.ts";
import { exigirPermissao } from "../../domain/access-context.ts";
import type { TaskId } from "../../domain/ids.ts";
import type { Campaign, Task } from "../../domain/strategy.ts";
import { TaskNotFound } from "../../domain/strategy-errors.ts";

export type TaskDetailsView = {
  readonly task: Task;
  readonly campaign: Campaign | null;
  readonly dependencies: readonly Task[];
  readonly unavailableDependencyCount: number;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Leitura na mesma UOW, sem alterar tarefa nem inferir novas regras de execução. */
export async function getTaskDetails(deps: StrategyDeps, ctx: AccessContext, taskId: TaskId): Promise<TaskDetailsView> {
  exigirPermissao(ctx, "strategy.read");
  if (typeof taskId !== "string" || !UUID.test(taskId)) throw new TaskNotFound();
  const id = taskId.toLowerCase() as TaskId;
  return deps.uow.withUserTransaction(ctx, async tx => {
    const task = await deps.tasks.findById(tx, ctx.tenantId, id);
    if (!task || task.id !== id || task.tenantId !== ctx.tenantId) throw new TaskNotFound();
    let campaign: Campaign | null = null;
    if (task.campaignId !== null) {
      const found = await deps.campaigns.findById(tx, ctx.tenantId, task.campaignId);
      if (found && found.id === task.campaignId && found.tenantId === ctx.tenantId) campaign = found;
    }
    const references = task.dependsOn.length ? await deps.tasks.list(tx, ctx.tenantId) : [];
    const own = new Map(references.filter(reference => reference.tenantId === ctx.tenantId).map(reference => [reference.id, reference]));
    const dependencies: Task[] = [];
    let unavailableDependencyCount = 0;
    for (const dependencyId of task.dependsOn) {
      const dependency = own.get(dependencyId);
      if (dependency) dependencies.push(dependency);
      else unavailableDependencyCount++;
    }
    return { task, campaign, dependencies, unavailableDependencyCount };
  });
}
