// Casos de uso de tarefa (I-04): dependências sem ciclo, responsável agente só se habilitado,
// campanha da mesma empresa.
import type { StrategyDeps } from "../strategy-ports.ts";
import type { AccessContext } from "../../domain/access-context.ts";
import { exigirPermissao } from "../../domain/access-context.ts";
import type { TaskId } from "../../domain/ids.ts";
import {
  type Task, type TaskContent, type TaskStatus,
  exigirResponsavelValido, exigirSemCiclo, exigirTarefaValida, transicaoDaTarefaPermitida,
} from "../../domain/strategy.ts";
import { TaskNotFound } from "../../domain/strategy-errors.ts";
import { InvalidStateTransition, ReferenceNotFound } from "../../domain/errors.ts";
import type { Tx } from "../ports.ts";

export async function listTasks(deps: StrategyDeps, ctx: AccessContext): Promise<Task[]> {
  exigirPermissao(ctx, "strategy.read");
  return deps.uow.withUserTransaction(ctx, (tx) => deps.tasks.list(tx, ctx.tenantId));
}

async function exigirReferencias(deps: StrategyDeps, tx: Tx, ctx: AccessContext, c: TaskContent): Promise<void> {
  if (c.campaignId !== null && !(await deps.campaigns.findById(tx, ctx.tenantId, c.campaignId))) throw new ReferenceNotFound();
  if (c.dependsOn.length) {
    const existentes = await deps.tasks.existing(tx, ctx.tenantId, c.dependsOn);
    // Dependência de outra empresa e inexistente respondem igual.
    if (c.dependsOn.some((id) => !existentes.has(id))) throw new ReferenceNotFound();
  }
  exigirResponsavelValido(c.assignee, await deps.agents.enabledAgents(tx, ctx.tenantId));
}

export async function createTask(
  deps: StrategyDeps, { ctx, content }: { ctx: AccessContext; content: TaskContent },
): Promise<Task> {
  exigirPermissao(ctx, "strategy.write");
  exigirTarefaValida(content);
  return deps.uow.withUserTransaction(ctx, async (tx) => {
    await exigirReferencias(deps, tx, ctx, content);
    // Tarefa nova não pode estar em ciclo: nada depende dela ainda.
    const criada = await deps.tasks.create(tx, { tenantId: ctx.tenantId, content, createdBy: ctx.userId });
    await deps.audit.record(tx, {
      tenantId: ctx.tenantId, actorType: "user", actorId: ctx.userId, action: "task.create",
      target: criada.id, after: { campaignId: criada.campaignId, dependencies: criada.dependsOn.length, assignee: criada.assignee?.kind ?? null },
    });
    return criada;
  });
}

export async function saveTask(
  deps: StrategyDeps,
  { ctx, taskId, expectedRevision, content }: { ctx: AccessContext; taskId: TaskId; expectedRevision: number; content: TaskContent },
): Promise<Task> {
  exigirPermissao(ctx, "strategy.write");
  exigirTarefaValida(content);
  return deps.uow.withUserTransaction(ctx, async (tx) => {
    const atual = await deps.tasks.findById(tx, ctx.tenantId, taskId);
    if (!atual) throw new TaskNotFound();
    if (atual.status === "cancelled") throw new InvalidStateTransition("tarefa cancelada não é editável");
    await exigirReferencias(deps, tx, ctx, content);
    exigirSemCiclo(await deps.tasks.dependencyGraph(tx, ctx.tenantId), taskId, content.dependsOn);
    const salva = await deps.tasks.replaceContent(tx, { tenantId: ctx.tenantId, id: taskId, expectedRevision, content });
    await deps.audit.record(tx, {
      tenantId: ctx.tenantId, actorType: "user", actorId: ctx.userId, action: "task.save",
      target: taskId, after: { revision: salva.revision, dependencies: salva.dependsOn.length },
    });
    return salva;
  });
}

export async function changeTaskStatus(
  deps: StrategyDeps,
  { ctx, taskId, expectedRevision, to }: { ctx: AccessContext; taskId: TaskId; expectedRevision: number; to: TaskStatus },
): Promise<Task> {
  exigirPermissao(ctx, "strategy.write");
  return deps.uow.withUserTransaction(ctx, async (tx) => {
    const atual = await deps.tasks.findById(tx, ctx.tenantId, taskId);
    if (!atual) throw new TaskNotFound();
    if (!transicaoDaTarefaPermitida(atual.status, to)) throw new InvalidStateTransition();
    const nova = await deps.tasks.transition(tx, { tenantId: ctx.tenantId, id: taskId, expectedRevision, from: atual.status, to });
    await deps.audit.record(tx, {
      tenantId: ctx.tenantId, actorType: "user", actorId: ctx.userId, action: "task.status",
      target: taskId, before: { status: atual.status }, after: { status: nova.status },
    });
    return nova;
  });
}
