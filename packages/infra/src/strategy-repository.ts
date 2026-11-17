// Adapter Postgres do contexto Strategy (I-04). Toda leitura e escrita passa pela transação do
// tenant ativo, portanto pela RLS; os triggers do banco repetem as regras do domínio e este
// adapter traduz as recusas do banco para erros de domínio.
//
// Sem entrada pública no package.json (arquivo governado): consumidores usam o caminho relativo
// até a evolução governada de `@oplyra/infra/strategy`.
import { comoCliente } from "./db.ts";
import type { Tx, TenantId, UserId, CampaignId, ObjectiveId, ExperimentId, TaskId, ProductKey } from "@oplyra/core";
import { ConflictVersion, InvalidStateTransition, ReferenceNotFound } from "@oplyra/core";
import type {
  CampaignRepository, ObjectiveRepository, ExperimentRepository, TaskRepository, AgentCapabilityPort,
} from "../../core/src/application/strategy-ports.ts";
import type {
  Campaign, CampaignStatus, Experiment, ExperimentStatus, Kpi, Objective, Task, TaskAssignee, TaskStatus,
} from "../../core/src/domain/strategy.ts";
import {
  CampaignNotFound, CampaignTrackingKeyImmutable, CampaignTrackingKeyTaken, ExperimentNotFound, ObjectiveNotFound,
  TaskDependencyCycle, TaskNotFound,
} from "../../core/src/domain/strategy-errors.ts";

const codigoPg = (e: unknown): string | undefined => (e as { code?: string } | null)?.code;
const restricao = (e: unknown): string | undefined => (e as { constraint?: string } | null)?.constraint;

/** Traduz recusas do banco para erros de domínio; o que não é reconhecido segue como está. */
function traduzir(e: unknown): never {
  const msg = (e as Error | null)?.message ?? "";
  switch (codigoPg(e)) {
    case "23505":
      if (restricao(e) === "campaigns_chave_unica") throw new CampaignTrackingKeyTaken();
      break;
    case "23503": throw new ReferenceNotFound();
    case "23514":
      if (msg.includes("ciclo")) throw new TaskDependencyCycle();
      // Casa a frase exata da guarda: "chave de rastreamento" também aparece na recusa de ativação incompleta.
      if (msg.includes("a chave de rastreamento não muda depois da ativação")) throw new CampaignTrackingKeyImmutable();
      throw new InvalidStateTransition(msg);
  }
  throw e;
}

async function tentar<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); } catch (e) { return traduzir(e); }
}

/**
 * Explica por que um update condicional não afetou linha: inexistente, estado diferente do
 * esperado ou revisão desatualizada. `ausente` é o erro de "não encontrado" do recurso.
 */
async function explicarFalha(
  tx: Tx, tabela: string, tenantId: string, id: string, estadoEsperado: string | null, ausente: () => Error,
): Promise<never> {
  const { rows } = await comoCliente(tx).query(
    `select status from strategy.${tabela} where tenant_id = $1 and id = $2`, [tenantId, id]);
  const atual = rows[0] as { status: string } | undefined;
  if (!atual) throw ausente();
  if (estadoEsperado !== null && atual.status !== estadoEsperado) throw new InvalidStateTransition();
  throw new ConflictVersion();
}

// ───────────────────────── campanhas ─────────────────────────

type LinhaCampanha = {
  id: string; tenantId: string; name: string; objectiveId: string | null; productKey: string | null;
  method: Campaign["method"]; trackingKey: string; status: CampaignStatus; revision: number;
  createdBy: string; createdAt: Date; activatedAt: Date | null;
};
const COLUNAS_CAMPANHA = `id, tenant_id as "tenantId", name, objective_id as "objectiveId", product_key as "productKey",
  method, tracking_key as "trackingKey", status, revision, created_by as "createdBy", created_at as "createdAt",
  activated_at as "activatedAt"`;

const campanha = (l: LinhaCampanha): Campaign => ({
  id: l.id as CampaignId, tenantId: l.tenantId as TenantId, name: l.name,
  objectiveId: l.objectiveId as ObjectiveId | null, productKey: l.productKey as ProductKey | null,
  method: l.method, trackingKey: l.trackingKey, status: l.status, revision: l.revision,
  createdBy: l.createdBy as UserId, createdAt: l.createdAt, activatedAt: l.activatedAt,
});

export const campaignRepository: CampaignRepository = {
  async list(tx, tenantId) {
    const { rows } = await comoCliente(tx).query(
      `select ${COLUNAS_CAMPANHA} from strategy.campaigns where tenant_id = $1 order by created_at, id`, [tenantId]);
    return (rows as LinhaCampanha[]).map(campanha);
  },
  async findById(tx, tenantId, id) {
    const { rows } = await comoCliente(tx).query(
      `select ${COLUNAS_CAMPANHA} from strategy.campaigns where tenant_id = $1 and id = $2`, [tenantId, id]);
    return rows[0] ? campanha(rows[0] as LinhaCampanha) : null;
  },
  create: (tx, e) => tentar(async () => {
    const { rows } = await comoCliente(tx).query(
      `insert into strategy.campaigns (tenant_id, name, objective_id, product_key, method, tracking_key, created_by)
       values ($1,$2,$3,$4,$5::jsonb,$6,$7) returning ${COLUNAS_CAMPANHA}`,
      [e.tenantId, e.content.name, e.content.objectiveId, e.content.productKey, JSON.stringify(e.content.method), e.content.trackingKey, e.createdBy]);
    return campanha(rows[0] as LinhaCampanha);
  }),
  replaceDraftContent: (tx, e) => tentar(async () => {
    const { rows } = await comoCliente(tx).query(
      `update strategy.campaigns set name = $3, objective_id = $4, product_key = $5, method = $6::jsonb,
              tracking_key = $7, revision = revision + 1
        where tenant_id = $1 and id = $2 and status = 'draft' and revision = $8 returning ${COLUNAS_CAMPANHA}`,
      [e.tenantId, e.id, e.content.name, e.content.objectiveId, e.content.productKey, JSON.stringify(e.content.method), e.content.trackingKey, e.expectedRevision]);
    if (!rows[0]) await explicarFalha(tx, "campaigns", e.tenantId, e.id, "draft", () => new CampaignNotFound());
    return campanha(rows[0] as LinhaCampanha);
  }),
  transition: (tx, e) => tentar(async () => {
    const { rows } = await comoCliente(tx).query(
      `update strategy.campaigns set status = $3, revision = revision + 1,
              activated_at = case when $3 = 'active' and activated_at is null then $4::timestamptz else activated_at end
        where tenant_id = $1 and id = $2 and status = $5 and revision = $6 returning ${COLUNAS_CAMPANHA}`,
      [e.tenantId, e.id, e.to, e.at, e.from, e.expectedRevision]);
    if (!rows[0]) await explicarFalha(tx, "campaigns", e.tenantId, e.id, e.from, () => new CampaignNotFound());
    return campanha(rows[0] as LinhaCampanha);
  }),
};

// ───────────────────────── objetivos ─────────────────────────

type LinhaObjetivo = {
  id: string; tenantId: string; name: string; description: string; periodStart: string; periodEnd: string;
  kpis: Kpi[]; status: Objective["status"]; primary: boolean; revision: number; createdBy: string; createdAt: Date;
};
const COLUNAS_OBJETIVO = `id, tenant_id as "tenantId", name, description,
  to_char(period_start, 'YYYY-MM-DD') as "periodStart", to_char(period_end, 'YYYY-MM-DD') as "periodEnd",
  kpis, status, is_primary as "primary", revision, created_by as "createdBy", created_at as "createdAt"`;

const objetivo = (l: LinhaObjetivo): Objective => ({
  id: l.id as ObjectiveId, tenantId: l.tenantId as TenantId, name: l.name, description: l.description,
  periodStart: l.periodStart, periodEnd: l.periodEnd, kpis: l.kpis, status: l.status, primary: l.primary,
  revision: l.revision, createdBy: l.createdBy as UserId, createdAt: l.createdAt,
});

export const objectiveRepository: ObjectiveRepository = {
  async list(tx, tenantId) {
    const { rows } = await comoCliente(tx).query(
      `select ${COLUNAS_OBJETIVO} from strategy.objectives where tenant_id = $1 order by created_at, id`, [tenantId]);
    return (rows as LinhaObjetivo[]).map(objetivo);
  },
  async findById(tx, tenantId, id) {
    const { rows } = await comoCliente(tx).query(
      `select ${COLUNAS_OBJETIVO} from strategy.objectives where tenant_id = $1 and id = $2`, [tenantId, id]);
    return rows[0] ? objetivo(rows[0] as LinhaObjetivo) : null;
  },
  async exists(tx, tenantId, id) {
    const { rows } = await comoCliente(tx).query(
      `select 1 from strategy.objectives where tenant_id = $1 and id = $2`, [tenantId, id]);
    return rows.length > 0;
  },
  create: (tx, e) => tentar(async () => {
    const { rows } = await comoCliente(tx).query(
      `insert into strategy.objectives (tenant_id, name, description, period_start, period_end, kpis, created_by)
       values ($1,$2,$3,$4::date,$5::date,$6::jsonb,$7) returning ${COLUNAS_OBJETIVO}`,
      [e.tenantId, e.content.name, e.content.description, e.content.periodStart, e.content.periodEnd, JSON.stringify(e.content.kpis), e.createdBy]);
    return objetivo(rows[0] as LinhaObjetivo);
  }),
  replaceContent: (tx, e) => tentar(async () => {
    const { rows } = await comoCliente(tx).query(
      `update strategy.objectives set name = $3, description = $4, period_start = $5::date, period_end = $6::date,
              kpis = $7::jsonb, revision = revision + 1
        where tenant_id = $1 and id = $2 and status = 'active' and revision = $8 returning ${COLUNAS_OBJETIVO}`,
      [e.tenantId, e.id, e.content.name, e.content.description, e.content.periodStart, e.content.periodEnd, JSON.stringify(e.content.kpis), e.expectedRevision]);
    if (!rows[0]) await explicarFalha(tx, "objectives", e.tenantId, e.id, "active", () => new ObjectiveNotFound());
    return objetivo(rows[0] as LinhaObjetivo);
  }),
  setPrimary: (tx, e) => tentar(async () => {
    const db = comoCliente(tx);
    // Confere o alvo ANTES de mexer no principal atual: falha de revisão não deve deixar a empresa sem principal.
    const alvo = await db.query(
      `select 1 from strategy.objectives where tenant_id = $1 and id = $2 and status = 'active' and revision = $3 for update`,
      [e.tenantId, e.id, e.expectedRevision]);
    if (!alvo.rows[0]) await explicarFalha(tx, "objectives", e.tenantId, e.id, "active", () => new ObjectiveNotFound());
    await db.query(
      `update strategy.objectives set is_primary = false, revision = revision + 1
        where tenant_id = $1 and is_primary and id <> $2`, [e.tenantId, e.id]);
    const { rows } = await db.query(
      `update strategy.objectives set is_primary = true, revision = revision + 1
        where tenant_id = $1 and id = $2 returning ${COLUNAS_OBJETIVO}`, [e.tenantId, e.id]);
    return objetivo(rows[0] as LinhaObjetivo);
  }),
  archive: (tx, e) => tentar(async () => {
    const { rows } = await comoCliente(tx).query(
      `update strategy.objectives set status = 'archived', is_primary = false, revision = revision + 1
        where tenant_id = $1 and id = $2 and status = 'active' and revision = $3 returning ${COLUNAS_OBJETIVO}`,
      [e.tenantId, e.id, e.expectedRevision]);
    if (!rows[0]) await explicarFalha(tx, "objectives", e.tenantId, e.id, "active", () => new ObjectiveNotFound());
    return objetivo(rows[0] as LinhaObjetivo);
  }),
};

// ───────────────────────── testes (experimentos) ─────────────────────────

type LinhaTeste = {
  id: string; tenantId: string; campaignId: string; hypothesis: string; dimension: Experiment["plan"]["dimension"];
  dimensionNote: string; variants: string[]; decisionMetric: string; minimumSample: number; status: ExperimentStatus;
  result: Experiment["result"]; learning: Experiment["learning"]; revision: number; createdBy: string;
  createdAt: Date; startedAt: Date | null; concludedAt: Date | null;
};
const COLUNAS_TESTE = `id, tenant_id as "tenantId", campaign_id as "campaignId", hypothesis, dimension,
  dimension_note as "dimensionNote", variants, decision_metric as "decisionMetric", minimum_sample as "minimumSample",
  status, result, learning, revision, created_by as "createdBy", created_at as "createdAt",
  started_at as "startedAt", concluded_at as "concludedAt"`;

const teste = (l: LinhaTeste): Experiment => ({
  id: l.id as ExperimentId, tenantId: l.tenantId as TenantId, campaignId: l.campaignId as CampaignId,
  plan: {
    hypothesis: l.hypothesis, dimension: l.dimension, dimensionNote: l.dimensionNote, variants: l.variants,
    decisionMetric: l.decisionMetric, minimumSample: l.minimumSample,
  },
  status: l.status, result: l.result, learning: l.learning, revision: l.revision, createdBy: l.createdBy as UserId,
  createdAt: l.createdAt, startedAt: l.startedAt, concludedAt: l.concludedAt,
});

export const experimentRepository: ExperimentRepository = {
  async listByCampaign(tx, tenantId, campaignId) {
    const { rows } = await comoCliente(tx).query(
      `select ${COLUNAS_TESTE} from strategy.experiments where tenant_id = $1 and campaign_id = $2 order by created_at, id`,
      [tenantId, campaignId]);
    return (rows as LinhaTeste[]).map(teste);
  },
  async findById(tx, tenantId, id) {
    const { rows } = await comoCliente(tx).query(
      `select ${COLUNAS_TESTE} from strategy.experiments where tenant_id = $1 and id = $2`, [tenantId, id]);
    return rows[0] ? teste(rows[0] as LinhaTeste) : null;
  },
  create: (tx, e) => tentar(async () => {
    const { rows } = await comoCliente(tx).query(
      `insert into strategy.experiments (tenant_id, campaign_id, hypothesis, dimension, dimension_note, variants,
                                         decision_metric, minimum_sample, created_by)
       values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9) returning ${COLUNAS_TESTE}`,
      [e.tenantId, e.campaignId, e.plan.hypothesis, e.plan.dimension, e.plan.dimensionNote, JSON.stringify(e.plan.variants),
        e.plan.decisionMetric, e.plan.minimumSample, e.createdBy]);
    return teste(rows[0] as LinhaTeste);
  }),
  transition: (tx, e) => tentar(async () => {
    // `greatest`: o relógio da aplicação pode estar alguns ms atrás do relógio do banco que carimbou created_at.
    const { rows } = await comoCliente(tx).query(
      `update strategy.experiments set status = $3, revision = revision + 1,
              started_at = case when $3 = 'running' then greatest($4::timestamptz, created_at) else started_at end,
              concluded_at = case when $3 = 'concluded' then greatest($4::timestamptz, coalesce(started_at, created_at)) else concluded_at end,
              result = coalesce($7::jsonb, result),
              learning = case when $8::boolean then $9::jsonb else learning end
        where tenant_id = $1 and id = $2 and status = $5 and revision = $6 returning ${COLUNAS_TESTE}`,
      [e.tenantId, e.id, e.to, e.at, e.from, e.expectedRevision,
        e.result ? JSON.stringify(e.result) : null, e.learning !== undefined, e.learning ? JSON.stringify(e.learning) : null]);
    if (!rows[0]) await explicarFalha(tx, "experiments", e.tenantId, e.id, e.from, () => new ExperimentNotFound());
    return teste(rows[0] as LinhaTeste);
  }),
};

// ───────────────────────── tarefas ─────────────────────────

type LinhaTarefa = {
  id: string; tenantId: string; title: string; description: string; campaignId: string | null; dueDate: string | null;
  assigneeKind: "user" | "agent" | null; assigneeRef: string | null; status: TaskStatus; revision: number;
  createdBy: string; createdAt: Date;
};
const COLUNAS_TAREFA = `id, tenant_id as "tenantId", title, description, campaign_id as "campaignId",
  to_char(due_date, 'YYYY-MM-DD') as "dueDate", assignee_kind as "assigneeKind", assignee_ref as "assigneeRef",
  status, revision, created_by as "createdBy", created_at as "createdAt"`;

const responsavel = (l: LinhaTarefa): TaskAssignee | null =>
  l.assigneeKind === null || l.assigneeRef === null ? null
    : l.assigneeKind === "agent" ? { kind: "agent", agentKey: l.assigneeRef } : { kind: "user", userId: l.assigneeRef };
const paraColunas = (a: TaskAssignee | null): [string | null, string | null] =>
  a === null ? [null, null] : a.kind === "agent" ? ["agent", a.agentKey] : ["user", a.userId];

async function tarefas(tx: Tx, linhas: LinhaTarefa[]): Promise<Task[]> {
  if (!linhas.length) return [];
  const { rows } = await comoCliente(tx).query(
    `select task_id as "taskId", depends_on_id as "dependsOn" from strategy.task_dependencies
      where tenant_id = $1 and task_id = any($2::uuid[]) order by depends_on_id`,
    [linhas[0]!.tenantId, linhas.map((l) => l.id)]);
  const deps = new Map<string, TaskId[]>();
  for (const r of rows as { taskId: string; dependsOn: string }[]) deps.set(r.taskId, [...(deps.get(r.taskId) ?? []), r.dependsOn as TaskId]);
  return linhas.map((l) => ({
    id: l.id as TaskId, tenantId: l.tenantId as TenantId, title: l.title, description: l.description,
    campaignId: l.campaignId as CampaignId | null, dueDate: l.dueDate, assignee: responsavel(l),
    dependsOn: deps.get(l.id) ?? [], status: l.status, revision: l.revision, createdBy: l.createdBy as UserId, createdAt: l.createdAt,
  }));
}

async function gravarDependencias(tx: Tx, tenantId: TenantId, id: string, dependsOn: readonly TaskId[]): Promise<void> {
  const db = comoCliente(tx);
  await db.query(`delete from strategy.task_dependencies where tenant_id = $1 and task_id = $2`, [tenantId, id]);
  for (const d of dependsOn) {
    await db.query(`insert into strategy.task_dependencies (tenant_id, task_id, depends_on_id) values ($1,$2,$3)`, [tenantId, id, d]);
  }
}

export const taskRepository: TaskRepository = {
  async list(tx, tenantId) {
    const { rows } = await comoCliente(tx).query(
      `select ${COLUNAS_TAREFA} from strategy.tasks where tenant_id = $1 order by created_at, id`, [tenantId]);
    return tarefas(tx, rows as LinhaTarefa[]);
  },
  async findById(tx, tenantId, id) {
    const { rows } = await comoCliente(tx).query(
      `select ${COLUNAS_TAREFA} from strategy.tasks where tenant_id = $1 and id = $2`, [tenantId, id]);
    return (await tarefas(tx, rows as LinhaTarefa[]))[0] ?? null;
  },
  async existing(tx, tenantId, ids) {
    if (!ids.length) return new Set();
    const { rows } = await comoCliente(tx).query(
      `select id from strategy.tasks where tenant_id = $1 and id = any($2::uuid[])`, [tenantId, ids]);
    return new Set((rows as { id: string }[]).map((r) => r.id as TaskId));
  },
  async dependencyGraph(tx, tenantId) {
    const { rows } = await comoCliente(tx).query(
      `select task_id as "taskId", depends_on_id as "dependsOn" from strategy.task_dependencies where tenant_id = $1`, [tenantId]);
    const grafo = new Map<TaskId, TaskId[]>();
    for (const r of rows as { taskId: string; dependsOn: string }[]) {
      const k = r.taskId as TaskId;
      grafo.set(k, [...(grafo.get(k) ?? []), r.dependsOn as TaskId]);
    }
    return grafo;
  },
  create: (tx, e) => tentar(async () => {
    const [kind, ref] = paraColunas(e.content.assignee);
    const { rows } = await comoCliente(tx).query(
      `insert into strategy.tasks (tenant_id, title, description, campaign_id, due_date, assignee_kind, assignee_ref, created_by)
       values ($1,$2,$3,$4,$5::date,$6,$7,$8) returning ${COLUNAS_TAREFA}`,
      [e.tenantId, e.content.title, e.content.description, e.content.campaignId, e.content.dueDate, kind, ref, e.createdBy]);
    const linha = rows[0] as LinhaTarefa;
    await gravarDependencias(tx, e.tenantId, linha.id, e.content.dependsOn);
    return (await tarefas(tx, [linha]))[0]!;
  }),
  replaceContent: (tx, e) => tentar(async () => {
    const [kind, ref] = paraColunas(e.content.assignee);
    const { rows } = await comoCliente(tx).query(
      `update strategy.tasks set title = $3, description = $4, campaign_id = $5, due_date = $6::date,
              assignee_kind = $7, assignee_ref = $8, revision = revision + 1
        where tenant_id = $1 and id = $2 and status <> 'cancelled' and revision = $9 returning ${COLUNAS_TAREFA}`,
      [e.tenantId, e.id, e.content.title, e.content.description, e.content.campaignId, e.content.dueDate, kind, ref, e.expectedRevision]);
    if (!rows[0]) await explicarFalha(tx, "tasks", e.tenantId, e.id, null, () => new TaskNotFound());
    await gravarDependencias(tx, e.tenantId, e.id, e.content.dependsOn);
    return (await tarefas(tx, rows as LinhaTarefa[]))[0]!;
  }),
  transition: (tx, e) => tentar(async () => {
    const { rows } = await comoCliente(tx).query(
      `update strategy.tasks set status = $3, revision = revision + 1
        where tenant_id = $1 and id = $2 and status = $4 and revision = $5 returning ${COLUNAS_TAREFA}`,
      [e.tenantId, e.id, e.to, e.from, e.expectedRevision]);
    if (!rows[0]) await explicarFalha(tx, "tasks", e.tenantId, e.id, e.from, () => new TaskNotFound());
    return (await tarefas(tx, rows as LinhaTarefa[]))[0]!;
  }),
};

/**
 * Agentes habilitados por empresa. Ainda não existe fonte real de entitlement para agentes (08 define
 * a franquia, mas não há tabela nem serviço): FALHA FECHADO, nenhum agente é habilitável. Quando o
 * serviço de entitlements cobrir agentes, este adapter passa a consultá-lo; o domínio não muda.
 */
export const agentCapabilities: AgentCapabilityPort = {
  async enabledAgents() { return new Set<string>(); },
};
