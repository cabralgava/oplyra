// Casos de uso de tarefa (I-04): dependências sem ciclo, responsável agente só se habilitado,
// campanha da mesma empresa.
import type { StrategyDeps } from "../strategy-ports.ts";
import type { AccessContext } from "../../domain/access-context.ts";
import { exigirPermissao } from "../../domain/access-context.ts";
import type { CampaignId, TaskId } from "../../domain/ids.ts";
import {
  type Campaign, type Task, type TaskContent, type TaskStatus,
  exigirResponsavelValido, exigirSemCiclo, exigirTarefaValida, transicaoDaTarefaPermitida,
} from "../../domain/strategy.ts";
import { CampaignNotFound, TaskNotFound } from "../../domain/strategy-errors.ts";
import { InvalidStateTransition, ReferenceNotFound } from "../../domain/errors.ts";
import type { Tx } from "../ports.ts";

export async function listTasks(deps: StrategyDeps, ctx: AccessContext): Promise<Task[]> {
  exigirPermissao(ctx, "strategy.read");
  return deps.uow.withUserTransaction(ctx, (tx) => deps.tasks.list(tx, ctx.tenantId));
}

/**
 * Leitura das tarefas vinculadas após conferir a campanha no mesmo tenant/transação.
 * A porta atual lista o tenant no servidor; o filtro nunca é delegado ao navegador.
 * Sem mudar os objetos/grafo: a apresentação escolhe os campos da seção da campanha.
 */
export async function listCampaignTasks(deps: StrategyDeps, ctx: AccessContext, campaignId: CampaignId): Promise<Task[]> {
  exigirPermissao(ctx, "strategy.read");
  return deps.uow.withUserTransaction(ctx, async (tx) => {
    const campaign = await deps.campaigns.findById(tx, ctx.tenantId, campaignId);
    if (!campaign || campaign.id !== campaignId || campaign.tenantId !== ctx.tenantId) throw new CampaignNotFound();
    const tasks = await deps.tasks.list(tx, ctx.tenantId);
    return tasks.filter((task) => task.tenantId === ctx.tenantId && task.campaignId === campaignId);
  });
}

/** Filtro da leitura da Operação; não altera o escopo das referências de edição. */
export type OperationTaskFilter =
  | { readonly kind: "all" }
  | { readonly kind: "unlinked" }
  | { readonly kind: "campaign"; readonly campaignId: CampaignId };

export type OperationTasks = {
  readonly tasks: readonly Task[];
  readonly references: readonly Task[];
  readonly campaigns: readonly Campaign[];
};

/**
 * Lê a Operação em uma transação, uma vez por porta. As referências continuam completas
 * dentro da empresa para que filtrar cartões não apague dependências ao editar.
 * A porta atual carrega o tenant no servidor; nenhum filtro é delegado ao navegador.
 */
export async function getOperationTasks(
  deps: StrategyDeps, ctx: AccessContext, filter: OperationTaskFilter,
): Promise<OperationTasks> {
  exigirPermissao(ctx, "strategy.read");
  if (!filter || (filter.kind !== "all" && filter.kind !== "unlinked" && filter.kind !== "campaign")) throw new ReferenceNotFound();
  return deps.uow.withUserTransaction(ctx, async (tx) => {
    const campaigns = (await deps.campaigns.list(tx, ctx.tenantId)).filter(campaign => campaign.tenantId === ctx.tenantId);
    // A lista já necessária ao seletor valida o filtro sem uma segunda consulta de campanha.
    if (filter.kind === "campaign" && !campaigns.some(campaign => campaign.id === filter.campaignId)) throw new CampaignNotFound();
    const references = (await deps.tasks.list(tx, ctx.tenantId)).filter(task => task.tenantId === ctx.tenantId);
    const tasks = filter.kind === "all" ? references
      : filter.kind === "unlinked" ? references.filter(task => task.campaignId === null)
      : references.filter(task => task.campaignId === filter.campaignId);
    return { tasks, references, campaigns };
  });
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

type TaskEditTarget = { ctx: AccessContext; taskId: TaskId; expectedRevision: number };

/** Campos editáveis pela tela; responsável e estado são autoridade da tarefa persistida. */
export type TaskDetails = Omit<TaskContent, "assignee">;

async function salvarConteudo(
  deps: StrategyDeps,
  { ctx, taskId, expectedRevision }: TaskEditTarget,
  resolverConteudo: (atual: Task) => TaskContent,
): Promise<Task> {
  return deps.uow.withUserTransaction(ctx, async (tx) => {
    const atual = await deps.tasks.findById(tx, ctx.tenantId, taskId);
    if (!atual) throw new TaskNotFound();
    if (atual.status === "cancelled") throw new InvalidStateTransition("tarefa cancelada não é editável");
    const content = resolverConteudo(atual);
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

export async function saveTask(
  deps: StrategyDeps,
  input: TaskEditTarget & { content: TaskContent },
): Promise<Task> {
  exigirPermissao(input.ctx, "strategy.write");
  exigirTarefaValida(input.content);
  return salvarConteudo(deps, input, () => input.content);
}

/**
 * Edita detalhes sem atribuir responsável nem mudar estado. Mesmo entradas com campos extras
 * não substituem a identidade persistida. O responsável é relido na mesma transação da escrita;
 * expectedRevision recusa alterações concorrentes, inclusive de responsável, sem sobrescrevê-las.
 * A regra de agente habilitado continua valendo: não se apaga um responsável para contorná-la.
 */
export async function saveTaskDetails(
  deps: StrategyDeps,
  input: TaskEditTarget & { content: TaskDetails },
): Promise<Task> {
  exigirPermissao(input.ctx, "strategy.write");
  const details: TaskContent = {
    title: input.content.title,
    description: input.content.description,
    campaignId: input.content.campaignId,
    dueDate: input.content.dueDate,
    dependsOn: input.content.dependsOn,
    assignee: null,
  };
  exigirTarefaValida(details);
  return salvarConteudo(deps, input, (atual) => ({ ...details, assignee: atual.assignee }));
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
