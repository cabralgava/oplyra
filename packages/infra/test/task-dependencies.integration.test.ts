// Apenas PostgreSQL descartável da CI; papéis SQL reais, não JWT hospedado.
// IDs/slugs exclusivos; leitura derivada não grava, não muda estados nem impede transições.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { AccessContext, CampaignId, TaskId, TenantId, UserId } from "@oplyra/core";
import { criarUnitOfWork } from "../src/db.ts";
import { criarAccessContextResolver } from "../src/auth.ts";
import { auditLog, relogio } from "../src/repositories.ts";
import { brandRepository, geradorDeIds } from "../src/brand-repository.ts";
import { taskRepository, campaignRepository, objectiveRepository, experimentRepository, agentCapabilities } from "../src/strategy-repository.ts";
import type { StrategyDeps } from "../../core/src/application/strategy-ports.ts";
import type { TaskContent } from "../../core/src/domain/strategy.ts";
import { summarizeTaskDependencies } from "../../core/src/domain/task-dependencies.ts";
import { createCampaignDraft } from "../../core/src/application/use-cases/strategy.ts";
import { createTask, changeTaskStatus, getOperationTasks } from "../../core/src/application/use-cases/strategy-tasks.ts";

const TA = randomUUID() as TenantId, TB = randomUUID() as TenantId;
const OWNER = randomUUID() as UserId, OTHER = randomUUID() as UserId, VIEWER = randomUUID() as UserId;
const uow = criarUnitOfWork({ connectionString: "postgresql://oplyra_web_login:local-web-2026@127.0.0.1:54422/postgres" });
const admin = criarUnitOfWork({ connectionString: "postgresql://postgres:postgres@127.0.0.1:54422/postgres" });
const resolver = criarAccessContextResolver(uow);
const deps: StrategyDeps = {
  uow, tasks: taskRepository, campaigns: campaignRepository, objectives: objectiveRepository,
  experiments: experimentRepository, agents: agentCapabilities, brand: brandRepository,
  audit: auditLog, clock: relogio, ids: geradorDeIds,
};
let own: AccessContext, other: AccessContext, viewer: AccessContext;
const campaign = (ctx: AccessContext) => createCampaignDraft(deps, { ctx, content: {
  name: "Campanha de dependências", trackingKey: "", objectiveId: null, productKey: null,
  method: { situation: "", pain: "", consequence: "", desire: "", mechanism: "", proof: "", offer: "" },
} });
const content = (campaignId: CampaignId | null, dependsOn: readonly TaskId[] = []): TaskContent => ({
  title: "Tarefa de dependências", description: "Fixture exclusiva", campaignId, dueDate: null,
  assignee: null, dependsOn,
});
const auditCount = async () => Number((await admin.pool.query("select count(*)::int as n from core.audit_log where tenant_id=any($1::uuid[])", [[TA, TB]])).rows[0]!.n);
beforeAll(async () => {
  await admin.pool.query("insert into core.tenants(id,name,slug) values($1,$2,$3),($4,$5,$6)", [TA, "Task dependencies A", `td-a-${TA}`, TB, "Task dependencies B", `td-b-${TB}`]);
  await admin.pool.query("insert into core.memberships(tenant_id,user_id,role_key) values($1,$2,'owner'),($1,$3,'viewer'),($4,$5,'owner')", [TA, OWNER, VIEWER, TB, OTHER]);
  own = await resolver.resolve({ userId: OWNER, email: "" }, TA);
  other = await resolver.resolve({ userId: OTHER, email: "" }, TB);
  viewer = await resolver.resolve({ userId: VIEWER, email: "" }, TA);
});
afterAll(async () => {
  try { await admin.pool.query("delete from core.tenants where id=any($1::uuid[])", [[TA, TB]]); }
  finally { await Promise.all([uow.encerrar(), admin.encerrar()]); }
});

describe("Dependências — sinal derivado da leitura autorizada real", () => {
  it("Leitor recebe dependências fora do filtro sem escrita de estado/revisão/auditoria", async () => {
    const first = await campaign(own), second = await campaign(own);
    const outside = await createTask(deps, { ctx: own, content: content(second.id) });
    const linked = await createTask(deps, { ctx: own, content: content(first.id, [outside.id]) });
    const before = await auditCount();
    const read = await getOperationTasks(deps, viewer, { kind: "campaign", campaignId: first.id });
    expect(read.tasks).toEqual([linked]); expect(read.references).toContainEqual(outside);
    expect(summarizeTaskDependencies(read.tasks[0]!, read.references)).toEqual({ total: 1, completed: 0, pending: 1, cancelled: 0, unavailable: 0, attentionRequired: true });
    const after = await getOperationTasks(deps, own, { kind: "campaign", campaignId: first.id });
    expect(after.tasks).toEqual([linked]); expect(after.references).toContainEqual(outside);
    expect(viewer.permissions.has("strategy.write")).toBe(false); expect(await auditCount()).toBe(before);
  });
  it("releitura acompanha conclusão e cancelamento sem tratar cancelada como satisfeita", async () => {
    const selected = await campaign(own);
    let completed = await createTask(deps, { ctx: own, content: content(null) });
    let cancelled = await createTask(deps, { ctx: own, content: content(null) });
    const linked = await createTask(deps, { ctx: own, content: content(selected.id, [completed.id, cancelled.id]) });
    completed = await changeTaskStatus(deps, { ctx: own, taskId: completed.id, expectedRevision: completed.revision, to: "in_progress" });
    completed = await changeTaskStatus(deps, { ctx: own, taskId: completed.id, expectedRevision: completed.revision, to: "done" });
    cancelled = await changeTaskStatus(deps, { ctx: own, taskId: cancelled.id, expectedRevision: cancelled.revision, to: "cancelled" });
    const before = await auditCount();
    const read = await getOperationTasks(deps, viewer, { kind: "campaign", campaignId: selected.id });
    expect(read.tasks).toEqual([linked]);
    expect(summarizeTaskDependencies(linked, read.references)).toEqual({ total: 2, completed: 1, pending: 0, cancelled: 1, unavailable: 0, attentionRequired: true });
    expect(await auditCount()).toBe(before);
  });
  it("foreign e ausente são indistinguíveis; RLS e permissão não se ampliam pelo sinal", async () => {
    const foreign = await createTask(deps, { ctx: other, content: content(null) });
    const local = await createTask(deps, { ctx: own, content: content(null) });
    const read = await getOperationTasks(deps, viewer, { kind: "all" });
    expect(read.references.some(t => t.id === foreign.id)).toBe(false);
    // Conteúdo malformado só em memória para defesa do helper; nenhuma violação é inserida em SQL.
    const synthetic = { ...local, dependsOn: [foreign.id] };
    const result = summarizeTaskDependencies(synthetic, [...read.references, foreign]);
    expect(result).toEqual(summarizeTaskDependencies({ ...synthetic, dependsOn: [randomUUID() as TaskId] }, read.references));
    expect(result.unavailable).toBe(1); expect(JSON.stringify(result)).not.toContain(foreign.id);
    const denied = { ...own, permissions: new Set<string>() } as AccessContext;
    await expect(getOperationTasks(deps, denied, { kind: "all" })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    const forged = await getOperationTasks(deps, { ...own, tenantId: TB }, { kind: "all" });
    expect(forged.tasks).toEqual([]); expect(forged.references).toEqual([]);
  });
  it("sinal não introduz gate de transição e termina sem alerta em done/cancelled", async () => {
    const selected = await campaign(own);
    const pending = await createTask(deps, { ctx: own, content: content(null) });
    let linked = await createTask(deps, { ctx: own, content: content(selected.id, [pending.id]) });
    let cancelled = await createTask(deps, { ctx: own, content: content(selected.id, [pending.id]) });
    linked = await changeTaskStatus(deps, { ctx: own, taskId: linked.id, expectedRevision: linked.revision, to: "in_progress" });
    linked = await changeTaskStatus(deps, { ctx: own, taskId: linked.id, expectedRevision: linked.revision, to: "done" });
    cancelled = await changeTaskStatus(deps, { ctx: own, taskId: cancelled.id, expectedRevision: cancelled.revision, to: "cancelled" });
    const before = await auditCount();
    const read = await getOperationTasks(deps, viewer, { kind: "campaign", campaignId: selected.id });
    for (const expected of [linked, cancelled]) {
      expect(read.tasks).toContainEqual(expected);
      expect(summarizeTaskDependencies(expected, read.references)).toEqual({ total: 1, completed: 0, pending: 1, cancelled: 0, unavailable: 0, attentionRequired: false });
    }
    expect(await auditCount()).toBe(before);
  });
});
