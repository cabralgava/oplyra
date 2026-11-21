import type { StrategyDeps } from "../strategy-ports.ts";
import type { AccessContext } from "../../domain/access-context.ts";
import { exigirPermissao } from "../../domain/access-context.ts";
import type { TaskId } from "../../domain/ids.ts";
import type { Campaign, Task } from "../../domain/strategy.ts";
import { TaskNotFound } from "../../domain/strategy-errors.ts";
import type { Tx } from "../ports.ts";

export type TaskDetailsView = {
  readonly task: Task;
  readonly campaign: Campaign | null;
  readonly dependencies: readonly Task[];
  readonly unavailableDependencyCount: number;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizedId(value: TaskId): TaskId {
  if (typeof value !== "string" || !UUID.test(value)) throw new TaskNotFound();
  return value.toLowerCase() as TaskId;
}

async function ownTask(deps: StrategyDeps, tx: Tx, ctx: AccessContext, id: TaskId): Promise<Task> {
  const task = await deps.tasks.findById(tx, ctx.tenantId, id);
  if (!task || task.id !== id || task.tenantId !== ctx.tenantId) throw new TaskNotFound();
  return task;
}

async function details(deps: StrategyDeps, tx: Tx, ctx: AccessContext, task: Task, references?: readonly Task[]): Promise<TaskDetailsView> {
  let campaign: Campaign | null = null;
  if (task.campaignId !== null) {
    const found = await deps.campaigns.findById(tx, ctx.tenantId, task.campaignId);
    if (found && found.id === task.campaignId && found.tenantId === ctx.tenantId) campaign = found;
  }
  const candidates = references ?? (task.dependsOn.length ? await deps.tasks.list(tx, ctx.tenantId) : []);
  const own = new Map(candidates.filter(reference => reference.tenantId === ctx.tenantId).map(reference => [reference.id, reference]));
  const dependencies: Task[] = [];
  let unavailableDependencyCount = 0;
  for (const dependencyId of task.dependsOn) {
    const dependency = own.get(dependencyId);
    if (dependency) dependencies.push(dependency);
    else unavailableDependencyCount++;
  }
  return { task, campaign, dependencies, unavailableDependencyCount };
}

/** Leitura na mesma UOW, sem alterar tarefa nem inferir novas regras de execução. */
export async function getTaskDetails(deps: StrategyDeps, ctx: AccessContext, taskId: TaskId): Promise<TaskDetailsView> {
  exigirPermissao(ctx, "strategy.read");
  const id = normalizedId(taskId);
  return deps.uow.withUserTransaction(ctx, async tx => {
    const task = await ownTask(deps, tx, ctx, id);
    return details(deps, tx, ctx, task);
  });
}

export type TaskDependencyDetailsView = TaskDetailsView & { readonly originTask: Task };

/** Navega somente no grafo próprio alcançável da origem, sem tratar filtros como autorização. */
export async function getTaskDependencyDetails(deps: StrategyDeps, ctx: AccessContext, originTaskId: TaskId, dependencyTaskId: TaskId): Promise<TaskDependencyDetailsView> {
  exigirPermissao(ctx, "strategy.read");
  const originId = normalizedId(originTaskId), targetId = normalizedId(dependencyTaskId);
  if (originId === targetId) throw new TaskNotFound();
  return deps.uow.withUserTransaction(ctx, async tx => {
    const originTask = await ownTask(deps, tx, ctx, originId);
    const task = await ownTask(deps, tx, ctx, targetId);
    const references = await deps.tasks.list(tx, ctx.tenantId);
    const own = new Map(references.filter(reference => reference.tenantId === ctx.tenantId).map(reference => [reference.id, reference]));
    own.set(originId, originTask);
    own.set(targetId, task);
    const pending = [originId], visited = new Set<TaskId>();
    let reachable = false;
    while (pending.length && !reachable) {
      const currentId = pending.pop()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      const current = own.get(currentId);
      if (!current) continue;
      for (const nextId of current.dependsOn) {
        // Uma referência ausente ou alheia não serve como ponte para outra tarefa.
        if (!own.has(nextId)) continue;
        if (nextId === targetId) { reachable = true; break; }
        if (!visited.has(nextId)) pending.push(nextId);
      }
    }
    if (!reachable) throw new TaskNotFound();
    return { ...await details(deps, tx, ctx, task, [...own.values()]), originTask };
  });
}
