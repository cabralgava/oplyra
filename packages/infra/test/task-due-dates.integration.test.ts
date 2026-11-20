// Somente banco descartável da CI; nenhuma conexão hospedada. Papéis SQL reais, não JWT.
// IDs/slugs próprios; classificação/ordenação de leitura não gravam dados nem auditoria.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { AccessContext, CampaignId, TaskId, TenantId, UserId } from "@oplyra/core";
import { criarUnitOfWork } from "../src/db.ts";
import { criarAccessContextResolver } from "../src/auth.ts";
import { auditLog, relogio, tenantRepository } from "../src/repositories.ts";
import { brandRepository, geradorDeIds } from "../src/brand-repository.ts";
import { taskRepository, campaignRepository, objectiveRepository, experimentRepository, agentCapabilities } from "../src/strategy-repository.ts";
import type { StrategyDeps } from "../../core/src/application/strategy-ports.ts";
import type { TaskContent } from "../../core/src/domain/strategy.ts";
import { civilDateInTimeZone, classifyTaskDueDate, sortTasksByDueDate } from "../../core/src/domain/task-due-dates.ts";
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
  name: "Campanha de prazos", trackingKey: "", objectiveId: null, productKey: null,
  method: { situation: "", pain: "", consequence: "", desire: "", mechanism: "", proof: "", offer: "" },
} });
const content = (campaignId: CampaignId | null, dueDate: string | null, dependsOn: readonly TaskId[] = []): TaskContent => ({
  title: "Tarefa de prazos", description: "Fixture exclusiva", campaignId, dueDate,
  assignee: null, dependsOn,
});
const auditCount = async () => Number((await admin.pool.query("select count(*)::int as n from core.audit_log where tenant_id=any($1::uuid[])", [[TA, TB]])).rows[0]!.n);
beforeAll(async () => {
  await admin.pool.query("insert into core.tenants(id,name,slug) values($1,$2,$3),($4,$5,$6)", [TA, "Task due dates A", `dd-a-${TA}`, TB, "Task due dates B", `dd-b-${TB}`]);
  await admin.pool.query("insert into core.memberships(tenant_id,user_id,role_key) values($1,$2,'owner'),($1,$3,'viewer'),($4,$5,'owner')", [TA, OWNER, VIEWER, TB, OTHER]);
  own = await resolver.resolve({ userId: OWNER, email: "" }, TA);
  other = await resolver.resolve({ userId: OTHER, email: "" }, TB);
  viewer = await resolver.resolve({ userId: VIEWER, email: "" }, TA);
});
afterAll(async () => {
  try { await admin.pool.query("delete from core.tenants where id=any($1::uuid[])", [[TA, TB]]); }
  finally { await Promise.all([uow.encerrar(), admin.encerrar()]); }
});

describe("Prazos — persistência civil, fuso e leitura autorizada", () => {
  it("repositório entrega fuso real da empresa, sem usar o de outra empresa", async () => {
    await admin.pool.query("update core.tenants set timezone=case when id=$1 then 'America/Sao_Paulo' else 'Pacific/Kiritimati' end where id=any($2::uuid[])", [TA, [TA, TB]]);
    const before = await auditCount();
    const companyA = await uow.withUserTransaction(viewer, tx => tenantRepository.findById(tx, TA));
    const companyB = await uow.withUserTransaction(other, tx => tenantRepository.findById(tx, TB));
    expect(companyA?.id).toBe(TA); expect(companyB?.id).toBe(TB);
    const now = new Date("2027-01-01T01:00:00Z");
    expect(civilDateInTimeZone(now, companyA!.timezone)).toBe("2026-12-31");
    expect(civilDateInTimeZone(now, companyB!.timezone)).toBe("2027-01-01");
    expect(await uow.withUserTransaction(viewer, tx => tenantRepository.findById(tx, TB))).toBeNull();
    expect(await auditCount()).toBe(before);
  });
  it("datas ISO/null sobrevivem ao roundtrip e ordenação não altera revisões/refs fora do filtro", async () => {
    const selected = await campaign(own), outside = await campaign(own);
    const dependency = await createTask(deps, { ctx: own, content: content(outside.id, "2028-03-01") });
    const none = await createTask(deps, { ctx: own, content: content(selected.id, null) });
    const later = await createTask(deps, { ctx: own, content: content(selected.id, "2028-03-01", [dependency.id]) });
    const first = await createTask(deps, { ctx: own, content: content(selected.id, "2028-02-29") });
    const tie = await createTask(deps, { ctx: own, content: content(selected.id, "2028-02-29") });
    const before = await auditCount();
    const read = await getOperationTasks(deps, viewer, { kind: "campaign", campaignId: selected.id });
    for (const expected of [none, later, first, tie]) expect(read.tasks).toContainEqual(expected);
    const snapshot = structuredClone(read), sorted = sortTasksByDueDate(read.tasks);
    expect(sorted.map(t => t.dueDate)).toEqual(["2028-02-29", "2028-02-29", "2028-03-01", null]);
    expect(sorted.filter(t => t.dueDate === "2028-02-29").map(t => t.id)).toEqual(read.tasks.filter(t => t.dueDate === "2028-02-29").map(t => t.id));
    expect(read.references).toContainEqual(dependency); expect(read).toEqual(snapshot);
    expect(classifyTaskDueDate(sorted[0]!, "2028-02-29")).toBe("today");
    expect(classifyTaskDueDate(later, "2028-02-29")).toBe("upcoming");
    expect(classifyTaskDueDate(none, "2028-02-29")).toBe("undated");
    expect(await auditCount()).toBe(before);
  });
  it("concluída/cancelada não ganham atraso ativo e prazo não impede transições existentes", async () => {
    const selected = await campaign(own);
    let done = await createTask(deps, { ctx: own, content: content(selected.id, "2020-01-01") });
    let cancelled = await createTask(deps, { ctx: own, content: content(selected.id, "2020-01-02") });
    done = await changeTaskStatus(deps, { ctx: own, taskId: done.id, expectedRevision: done.revision, to: "in_progress" });
    done = await changeTaskStatus(deps, { ctx: own, taskId: done.id, expectedRevision: done.revision, to: "done" });
    cancelled = await changeTaskStatus(deps, { ctx: own, taskId: cancelled.id, expectedRevision: cancelled.revision, to: "cancelled" });
    const before = await auditCount();
    const read = await getOperationTasks(deps, viewer, { kind: "campaign", campaignId: selected.id });
    for (const expected of [done, cancelled]) {
      expect(read.tasks).toContainEqual(expected);
      expect(classifyTaskDueDate(expected, "2026-11-20")).toBe("historical");
    }
    expect(await auditCount()).toBe(before);
  });
  it("prazos alheios não entram na leitura e permissões/vínculos continuam exigidos", async () => {
    const selected = await campaign(other);
    const foreign = await createTask(deps, { ctx: other, content: content(selected.id, "2020-01-01") });
    const read = await getOperationTasks(deps, viewer, { kind: "all" });
    expect(sortTasksByDueDate(read.tasks).some(t => t.id === foreign.id)).toBe(false);
    expect(read.references.some(t => t.id === foreign.id)).toBe(false);
    await expect(getOperationTasks(deps, viewer, { kind: "campaign", campaignId: selected.id })).rejects.toMatchObject({ code: "CAMPAIGN_NOT_FOUND" });
    await expect(getOperationTasks(deps, { ...own, permissions: new Set() }, { kind: "all" })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    const before = await auditCount();
    await admin.pool.query("update core.memberships set status='revoked', revoked_at=now() where tenant_id=$1 and user_id=$2 and status='active'", [TA, VIEWER]);
    try {
      expect((await getOperationTasks(deps, viewer, { kind: "all" })).tasks).toEqual([]);
      expect(await uow.withUserTransaction(viewer, tx => tenantRepository.findById(tx, TA))).toBeNull();
    } finally {
      await admin.pool.query("update core.memberships set status='active', revoked_at=null where tenant_id=$1 and user_id=$2", [TA, VIEWER]);
    }
    expect(await auditCount()).toBe(before);
  });
});
