// PostgreSQL e papéis reais no banco descartável da CI. Identidades são fixtures SQL,
// não prova de JWT hospedado. URLs fixas de loopback, IDs/slugs exclusivos por suíte.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { AccessContext, CampaignId, TenantId, UserId } from "@oplyra/core";
import { criarUnitOfWork } from "../src/db.ts";
import { criarAccessContextResolver } from "../src/auth.ts";
import { auditLog, relogio } from "../src/repositories.ts";
import { brandRepository, geradorDeIds } from "../src/brand-repository.ts";
import { taskRepository, campaignRepository, objectiveRepository, experimentRepository, agentCapabilities } from "../src/strategy-repository.ts";
import type { StrategyDeps } from "../../core/src/application/strategy-ports.ts";
import type { TaskContent } from "../../core/src/domain/strategy.ts";
import { createCampaignDraft } from "../../core/src/application/use-cases/strategy.ts";
import { createTask, changeTaskStatus } from "../../core/src/application/use-cases/strategy-tasks.ts";

import { getTaskDetails } from "../../core/src/application/use-cases/strategy-task-details.ts";

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
  name: "Campanha de filtro", trackingKey: "", objectiveId: null, productKey: null,
  method: { situation: "", pain: "", consequence: "", desire: "", mechanism: "", proof: "", offer: "" },
} });
const content = (campaignId: CampaignId | null, over: Partial<TaskContent> = {}): TaskContent => ({
  title: "Tarefa do filtro", description: "Conteúdo da fixture", campaignId, dueDate: "2028-02-29",
  assignee: { kind: "user", userId: OWNER }, dependsOn: [], ...over,
});
const auditCount = async () => Number((await admin.pool.query("select count(*)::int as n from core.audit_log where tenant_id=any($1::uuid[])", [[TA, TB]])).rows[0]!.n);

beforeAll(async () => {
  // Prefixo6 + UUID36 =42caracteres; a constraint permite até50.
  await admin.pool.query("insert into core.tenants(id,name,slug) values($1,$2,$3),($4,$5,$6)", [TA, "Task detail A", `tdr-a-${TA}`, TB, "Task detail B", `tdr-b-${TB}`]);
  await admin.pool.query("insert into core.memberships(tenant_id,user_id,role_key) values($1,$2,'owner'),($1,$3,'viewer'),($4,$5,'owner')", [TA, OWNER, VIEWER, TB, OTHER]);
  own = await resolver.resolve({ userId: OWNER, email: "" }, TA);
  other = await resolver.resolve({ userId: OTHER, email: "" }, TB);
  viewer = await resolver.resolve({ userId: VIEWER, email: "" }, TA);
});
afterAll(async () => {
  try { await admin.pool.query("delete from core.tenants where id=any($1::uuid[])", [[TA, TB]]); }
  finally { await Promise.all([uow.encerrar(), admin.encerrar()]); }
});

describe("Detalhe oficial da tarefa — leitura real autorizada", () => {
  it("Owner e Leitor recebem tarefa completa, campanha e dependências próprias em ordem", async () => {
    const selected = await campaign(own), outside = await campaign(own);
    const first = await createTask(deps, { ctx: own, content: content(outside.id, { title: "Primeira dependência" }) });
    const second = await createTask(deps, { ctx: own, content: content(null, { title: "Segunda dependência" }) });
    const task = await createTask(deps, { ctx: own, content: content(selected.id, { dependsOn: [second.id, first.id] }) });
    const foreign = await createTask(deps, { ctx: other, content: content(null, { assignee: null }) });
    const before = await auditCount();
    const result = await getTaskDetails(deps, viewer, task.id);
    const byId = new Map([first, second].map(dependency => [dependency.id, dependency]));
    const expectedDependencies = task.dependsOn.map(id => byId.get(id)!);
    expect(result).toEqual({ task, campaign: selected, dependencies: expectedDependencies, unavailableDependencyCount: 0 });
    expect(result.dependencies.some(t => t.id === foreign.id)).toBe(false);
    expect(await getTaskDetails(deps, own, task.id)).toEqual(result);
    expect(viewer.permissions.has("strategy.write")).toBe(false);
    const snapshot = structuredClone(result);
    expect(await getTaskDetails(deps, viewer, task.id)).toEqual(snapshot);
    expect(await auditCount()).toBe(before);
  });
  it("task alheia/ausente/UUID inválido recebem TASK_NOT_FOUND uniforme", async () => {
    const foreign = await createTask(deps, { ctx: other, content: content(null, { assignee: null }) });
    const before = await auditCount();
    for (const id of [foreign.id, randomUUID(), "inválido"]) {
      await expect(getTaskDetails(deps, viewer, id as typeof foreign.id)).rejects.toMatchObject({ code: "TASK_NOT_FOUND", message: "tarefa não encontrada" });
    }
    expect((await getTaskDetails(deps, other, foreign.id)).task).toEqual(foreign);
    expect(await auditCount()).toBe(before);
  });
  it("avulsa e estados terminais são legíveis com valores civis/revisões originais", async () => {
    const loose = await createTask(deps, { ctx: own, content: content(null, { dueDate: null }) });
    expect(await getTaskDetails(deps, viewer, loose.id)).toEqual({ task: loose, campaign: null, dependencies: [], unavailableDependencyCount: 0 });
    const selected = await campaign(own);
    let done = await createTask(deps, { ctx: own, content: content(selected.id, { dependsOn: [loose.id] }) });
    done = await changeTaskStatus(deps, { ctx: own, taskId: done.id, expectedRevision: 1, to: "in_progress" });
    done = await changeTaskStatus(deps, { ctx: own, taskId: done.id, expectedRevision: 2, to: "done" });
    let cancelled = await createTask(deps, { ctx: own, content: content(null) });
    cancelled = await changeTaskStatus(deps, { ctx: own, taskId: cancelled.id, expectedRevision: 1, to: "cancelled" });
    const before = await auditCount();
    expect(await getTaskDetails(deps, viewer, done.id)).toEqual({ task: done, campaign: selected, dependencies: [loose], unavailableDependencyCount: 0 });
    expect(await getTaskDetails(deps, viewer, cancelled.id)).toEqual({ task: cancelled, campaign: null, dependencies: [], unavailableDependencyCount: 0 });
    expect(await auditCount()).toBe(before);
  });
  it("read e vínculo real continuam exigidos, mesmo com contexto em memória ou tenant forjado", async () => {
    const task = await createTask(deps, { ctx: own, content: content(null) });
    const foreign = await createTask(deps, { ctx: other, content: content(null, { assignee: null }) });
    await expect(getTaskDetails(deps, { ...viewer, permissions: new Set() }, task.id)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    await expect(getTaskDetails(deps, { ...viewer, tenantId: TB }, foreign.id)).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
    const before = await auditCount();
    await admin.pool.query("update core.memberships set status='revoked', revoked_at=now() where tenant_id=$1 and user_id=$2 and status='active'", [TA, VIEWER]);
    try {
      await expect(getTaskDetails(deps, viewer, task.id)).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
      await expect(resolver.resolve({ userId: VIEWER, email: "" }, TA)).rejects.toMatchObject({ code: "MEMBERSHIP_NOT_FOUND" });
    } finally {
      await admin.pool.query("update core.memberships set status='active', revoked_at=null where tenant_id=$1 and user_id=$2", [TA, VIEWER]);
    }
    expect(await auditCount()).toBe(before);
  });
});
