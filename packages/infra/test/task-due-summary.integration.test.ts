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
import { civilDateInTimeZone } from "../../core/src/domain/task-due-dates.ts";
import { summarizeOpenTaskDueDates } from "../../core/src/domain/task-due-summary.ts";
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
  await admin.pool.query("insert into core.tenants(id,name,slug) values($1,$2,$3),($4,$5,$6)", [TA, "Task due summary A", `ds-a-${TA}`, TB, "Task due summary B", `ds-b-${TB}`]);
  await admin.pool.query("insert into core.memberships(tenant_id,user_id,role_key) values($1,$2,'owner'),($1,$3,'viewer'),($4,$5,'owner')", [TA, OWNER, VIEWER, TB, OTHER]);
  own = await resolver.resolve({ userId: OWNER, email: "" }, TA);
  other = await resolver.resolve({ userId: OTHER, email: "" }, TB);
  viewer = await resolver.resolve({ userId: VIEWER, email: "" }, TA);
});
afterAll(async () => {
  try { await admin.pool.query("delete from core.tenants where id=any($1::uuid[])", [[TA, TB]]); }
  finally { await Promise.all([uow.encerrar(), admin.encerrar()]); }
});

const instant = new Date("2026-11-21T01:00:00Z");
async function ownDay(ctx: AccessContext) {
  const company = await uow.withUserTransaction(ctx, tx => tenantRepository.findById(tx, ctx.tenantId));
  expect(company?.id).toBe(ctx.tenantId);
  const date = civilDateInTimeZone(instant, company!.timezone);
  const sql = await admin.pool.query("select ($1::timestamptz at time zone timezone)::date::text as day from core.tenants where id=$2", [instant.toISOString(), ctx.tenantId]);
  expect(date).toBe(sql.rows[0]!.day);
  return date;
}
const sum = (over = {}) => ({ totalOpen: 0, overdue: 0, dueToday: 0, upcoming: 0, undated: 0, unclassified: 0, relativeDatesAvailable: true, ...over });

describe("Resumo dos prazos — leitura autorizada, filtros e integridade", () => {
  it("Leitor conta só abertas filtradas; referências e terminais não inflam o resumo", async () => {
    await admin.pool.query("update core.tenants set timezone='America/Sao_Paulo' where id=$1", [TA]);
    const today = await ownDay(viewer); expect(today).toBe("2026-11-20");
    const selected = await campaign(own), outside = await campaign(own);
    const dependency = await createTask(deps, { ctx: own, content: content(outside.id, "2020-01-01") });
    const past = await createTask(deps, { ctx: own, content: content(selected.id, "2026-11-19", [dependency.id]) });
    let due = await createTask(deps, { ctx: own, content: content(selected.id, today) });
    due = await changeTaskStatus(deps, { ctx: own, taskId: due.id, expectedRevision: 1, to: "in_progress" });
    const future = await createTask(deps, { ctx: own, content: content(selected.id, "2026-11-21") });
    const none = await createTask(deps, { ctx: own, content: content(selected.id, null) });
    let done = await createTask(deps, { ctx: own, content: content(selected.id, "2020-01-01") });
    done = await changeTaskStatus(deps, { ctx: own, taskId: done.id, expectedRevision: done.revision, to: "in_progress" });
    done = await changeTaskStatus(deps, { ctx: own, taskId: done.id, expectedRevision: done.revision, to: "done" });
    let cancelled = await createTask(deps, { ctx: own, content: content(selected.id, null) });
    cancelled = await changeTaskStatus(deps, { ctx: own, taskId: cancelled.id, expectedRevision: 1, to: "cancelled" });
    const before = await auditCount();
    const read = await getOperationTasks(deps, viewer, { kind: "campaign", campaignId: selected.id });
    expect(read.references).toContainEqual(dependency); expect(read.tasks).not.toContainEqual(dependency);
    for (const task of [past, due, future, none, done, cancelled]) expect(read.tasks).toContainEqual(task);
    const snapshot = structuredClone(read);
    expect(summarizeOpenTaskDueDates(read.tasks, today, TA)).toEqual(sum({ totalOpen: 4, overdue: 1, dueToday: 1, upcoming: 1, undated: 1 }));
    expect(read).toEqual(snapshot);
    expect((await getOperationTasks(deps, own, { kind: "campaign", campaignId: selected.id })).tasks).toEqual(read.tasks);
    expect(await auditCount()).toBe(before); expect(viewer.permissions.has("strategy.write")).toBe(false);
  });
  it("dia indisponível mantém dated sem classificação, null separado e terminais excluídas", async () => {
    const selected = await campaign(own);
    await createTask(deps, { ctx: own, content: content(selected.id, "2020-01-01") });
    await createTask(deps, { ctx: own, content: content(selected.id, "2040-01-01") });
    await createTask(deps, { ctx: own, content: content(selected.id, null) });
    const before = await auditCount();
    const read = await getOperationTasks(deps, viewer, { kind: "campaign", campaignId: selected.id });
    expect(summarizeOpenTaskDueDates(read.tasks, null, TA)).toEqual(sum({ totalOpen: 3, undated: 1, unclassified: 2, relativeDatesAvailable: false }));
    expect(summarizeOpenTaskDueDates(read.tasks, "2026-02-30", TA)).toEqual(summarizeOpenTaskDueDates(read.tasks, null, TA));
    expect(await auditCount()).toBe(before);
  });
  it("campanha sem abertas retorna zero, independentemente de referências e terminais", async () => {
    const selected = await campaign(own);
    let done = await createTask(deps, { ctx: own, content: content(selected.id, "2020-01-01") });
    done = await changeTaskStatus(deps, { ctx: own, taskId: done.id, expectedRevision: done.revision, to: "in_progress" });
    done = await changeTaskStatus(deps, { ctx: own, taskId: done.id, expectedRevision: done.revision, to: "done" });
    const read = await getOperationTasks(deps, viewer, { kind: "campaign", campaignId: selected.id });
    expect(read.tasks).toEqual([done]);
    expect(summarizeOpenTaskDueDates(read.tasks, "2026-11-20", TA)).toEqual(sum());
    expect(summarizeOpenTaskDueDates(read.tasks, null, TA)).toEqual(sum({ relativeDatesAvailable: false }));
    const none = await getOperationTasks(deps, viewer, { kind: "unlinked" });
    expect(summarizeOpenTaskDueDates(none.tasks, "2026-11-20", TA)).toEqual(sum());
  });
  it("RLS, guarda de tenant e revogação impedem contagens alheias", async () => {
    const selected = await campaign(other);
    const foreign = await createTask(deps, { ctx: other, content: content(selected.id, "2020-01-01") });
    const read = await getOperationTasks(deps, viewer, { kind: "all" });
    expect(read.tasks.some(t => t.id === foreign.id)).toBe(false);
    expect(summarizeOpenTaskDueDates([foreign], "2026-11-20", TA)).toEqual(sum());
    await expect(getOperationTasks(deps, viewer, { kind: "campaign", campaignId: selected.id })).rejects.toMatchObject({ code: "CAMPAIGN_NOT_FOUND" });
    await expect(getOperationTasks(deps, { ...own, permissions: new Set() }, { kind: "all" })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    const before = await auditCount();
    await admin.pool.query("update core.memberships set status='revoked', revoked_at=now() where tenant_id=$1 and user_id=$2 and status='active'", [TA, VIEWER]);
    try {
      const revoked = await getOperationTasks(deps, viewer, { kind: "all" });
      expect(revoked.tasks).toEqual([]); expect(summarizeOpenTaskDueDates(revoked.tasks, "2026-11-20", TA)).toEqual(sum());
      expect(await uow.withUserTransaction(viewer, tx => tenantRepository.findById(tx, TA))).toBeNull();
    } finally {
      await admin.pool.query("update core.memberships set status='active', revoked_at=null where tenant_id=$1 and user_id=$2", [TA, VIEWER]);
    }
    expect(await auditCount()).toBe(before);
  });
});
