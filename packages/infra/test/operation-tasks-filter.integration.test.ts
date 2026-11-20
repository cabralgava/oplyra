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
import { createCampaignDraft, cancelCampaign } from "../../core/src/application/use-cases/strategy.ts";
import { createTask, changeTaskStatus, getOperationTasks, saveTaskDetails } from "../../core/src/application/use-cases/strategy-tasks.ts";

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
  // Prefixo5 + UUID36 =41caracteres; a constraint permite até50.
  await admin.pool.query("insert into core.tenants(id,name,slug) values($1,$2,$3),($4,$5,$6)", [TA, "Operation filter A", `of-a-${TA}`, TB, "Operation filter B", `of-b-${TB}`]);
  await admin.pool.query("insert into core.memberships(tenant_id,user_id,role_key) values($1,$2,'owner'),($1,$3,'viewer'),($4,$5,'owner')", [TA, OWNER, VIEWER, TB, OTHER]);
  own = await resolver.resolve({ userId: OWNER, email: "" }, TA);
  other = await resolver.resolve({ userId: OTHER, email: "" }, TB);
  viewer = await resolver.resolve({ userId: VIEWER, email: "" }, TA);
});
afterAll(async () => {
  try { await admin.pool.query("delete from core.tenants where id=any($1::uuid[])", [[TA, TB]]); }
  finally { await Promise.all([uow.encerrar(), admin.encerrar()]); }
});

describe("Operação filtrada — referências, permissões e isolamento reais", () => {
  it("all/unlinked/campaign mantêm referências completas próprias e Leitor pode consultar", async () => {
    const first = await campaign(own), second = await campaign(own), foreign = await campaign(other);
    const loose = await createTask(deps, { ctx: own, content: content(null) });
    let outside = await createTask(deps, { ctx: own, content: content(second.id) });
    outside = await changeTaskStatus(deps, { ctx: own, taskId: outside.id, expectedRevision: 1, to: "cancelled" });
    let linked = await createTask(deps, { ctx: own, content: content(first.id, { dependsOn: [loose.id, outside.id] }) });
    linked = await changeTaskStatus(deps, { ctx: own, taskId: linked.id, expectedRevision: 1, to: "in_progress" });
    const foreignTask = await createTask(deps, { ctx: other, content: content(foreign.id, { assignee: null }) });
    const before = await auditCount();
    const all = await getOperationTasks(deps, own, { kind: "all" });
    expect(all.tasks).toEqual(all.references);
    for (const task of [loose, outside, linked]) expect(all.references).toContainEqual(task);
    expect(all.references.some(task => task.id === foreignTask.id)).toBe(false);
    expect(all.campaigns.some(c => c.id === foreign.id)).toBe(false);
    const unlinked = await getOperationTasks(deps, own, { kind: "unlinked" });
    expect(unlinked.tasks.every(task => task.campaignId === null)).toBe(true);
    expect(unlinked.tasks).toContainEqual(loose);
    const filtered = await getOperationTasks(deps, viewer, { kind: "campaign", campaignId: first.id });
    expect(filtered.tasks).toEqual([linked]);
    expect(filtered.references).toContainEqual(loose);
    expect(filtered.references).toContainEqual(outside);
    expect(filtered.references.find(task => task.id === linked.id)).toEqual(linked);
    expect(filtered.campaigns).toContainEqual(second);
    expect(viewer.permissions.has("strategy.write")).toBe(false);
    expect(await auditCount()).toBe(before);
  });

  it("campanha de B/inexistente recusam igualmente, sem fallback; falta de read também recusa", async () => {
    const foreign = await campaign(other), selected = await campaign(own);
    const foreignTask = await createTask(deps, { ctx: other, content: content(foreign.id, { assignee: null }) });
    const before = await auditCount();
    for (const campaignId of [foreign.id, randomUUID() as CampaignId]) {
      await expect(getOperationTasks(deps, own, { kind: "campaign", campaignId })).rejects.toMatchObject({ code: "CAMPAIGN_NOT_FOUND", message: "campanha não encontrada" });
    }
    await expect(getOperationTasks(deps, { ...own, permissions: new Set() }, { kind: "campaign", campaignId: selected.id })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect((await getOperationTasks(deps, other, { kind: "campaign", campaignId: foreign.id })).tasks).toEqual([foreignTask]);
    // Mesmo um contexto forjado não faz a RLS conceder o vínculo de B ao usuário de A.
    expect(await getOperationTasks(deps, { ...own, tenantId: TB }, { kind: "all" })).toEqual({ tasks: [], references: [], campaigns: [] });
    expect(await auditCount()).toBe(before);
  });

  it("edição conserva dependências fora do filtro e releitura acompanha troca de vínculo", async () => {
    const first = await campaign(own), second = await campaign(own);
    const outside = await createTask(deps, { ctx: own, content: content(second.id) });
    let linked = await createTask(deps, { ctx: own, content: content(first.id, { dependsOn: [outside.id] }) });
    linked = await changeTaskStatus(deps, { ctx: own, taskId: linked.id, expectedRevision: 1, to: "in_progress" });
    const before = await getOperationTasks(deps, own, { kind: "campaign", campaignId: first.id });
    const reference = before.references.find(task => task.id === linked.id)!;
    expect(reference.dependsOn).toEqual([outside.id]);
    expect(before.tasks.some(task => task.id === outside.id)).toBe(false);
    const saved = await saveTaskDetails(deps, { ctx: own, taskId: linked.id, expectedRevision: reference.revision, content: {
      title: "Edição com vínculo novo", description: reference.description, dueDate: reference.dueDate,
      dependsOn: reference.dependsOn, campaignId: second.id,
    } });
    expect(saved).toMatchObject({ dependsOn: [outside.id], assignee: linked.assignee, status: "in_progress", revision: 3 });
    const auditBeforeRead = await auditCount();
    expect((await getOperationTasks(deps, own, { kind: "campaign", campaignId: first.id })).tasks).toEqual([]);
    const destination = await getOperationTasks(deps, own, { kind: "campaign", campaignId: second.id });
    expect(destination.tasks).toContainEqual(saved);
    expect(destination.tasks).toContainEqual(outside);
    expect(destination.references).toContainEqual(saved);
    expect(await auditCount()).toBe(auditBeforeRead);
  });

  it("vínculo revogado não conserva dados mesmo com permissões antigas em memória", async () => {
    const selected = await campaign(own);
    await createTask(deps, { ctx: own, content: content(selected.id) });
    const before = await auditCount();
    await admin.pool.query("update core.memberships set status='revoked', revoked_at=now() where tenant_id=$1 and user_id=$2 and status='active'", [TA, VIEWER]);
    try {
      expect(await getOperationTasks(deps, viewer, { kind: "all" })).toEqual({ tasks: [], references: [], campaigns: [] });
      await expect(getOperationTasks(deps, viewer, { kind: "campaign", campaignId: selected.id })).rejects.toMatchObject({ code: "CAMPAIGN_NOT_FOUND" });
      await expect(resolver.resolve({ userId: VIEWER, email: "" }, TA)).rejects.toMatchObject({ code: "MEMBERSHIP_NOT_FOUND" });
    } finally {
      await admin.pool.query("update core.memberships set status='active', revoked_at=null where tenant_id=$1 and user_id=$2", [TA, VIEWER]);
    }
    expect(await auditCount()).toBe(before);
  });

  it("campanha/tarefa canceladas permanecem legíveis e não mudam na leitura", async () => {
    const selected = await campaign(own);
    let linked = await createTask(deps, { ctx: own, content: content(selected.id) });
    linked = await changeTaskStatus(deps, { ctx: own, taskId: linked.id, expectedRevision: 1, to: "cancelled" });
    const cancelledCampaign = await cancelCampaign(deps, { ctx: own, campaignId: selected.id, expectedRevision: 1 });
    const before = await auditCount();
    const result = await getOperationTasks(deps, viewer, { kind: "campaign", campaignId: selected.id });
    expect(result.tasks).toEqual([linked]);
    expect(result.references).toContainEqual(linked);
    expect(result.campaigns).toContainEqual(cancelledCampaign);
    expect(await auditCount()).toBe(before);
  });
});
