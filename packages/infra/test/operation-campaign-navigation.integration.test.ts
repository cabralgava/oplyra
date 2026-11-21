// Casos de uso existentes com papéis SQL no banco descartável da CI.
// Contexto de navegação não é autorização; não usa credenciais/JWT hospedados.
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
import { createCampaignDraft, getCampaign } from "../../core/src/application/use-cases/strategy.ts";
import { createTask, changeTaskStatus, getOperationTasks, saveTaskDetails, listCampaignTasks } from "../../core/src/application/use-cases/strategy-tasks.ts";

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
  await admin.pool.query("insert into core.tenants(id,name,slug) values($1,$2,$3),($4,$5,$6)", [TA, "Campaign navigation A", `nc-a-${TA}`, TB, "Campaign navigation B", `nc-b-${TB}`]);
  await admin.pool.query("insert into core.memberships(tenant_id,user_id,role_key) values($1,$2,'owner'),($1,$3,'viewer'),($4,$5,'owner')", [TA, OWNER, VIEWER, TB, OTHER]);
  own = await resolver.resolve({ userId: OWNER, email: "" }, TA);
  other = await resolver.resolve({ userId: OTHER, email: "" }, TB);
  viewer = await resolver.resolve({ userId: VIEWER, email: "" }, TA);
});
afterAll(async () => {
  try { await admin.pool.query("delete from core.tenants where id=any($1::uuid[])", [[TA, TB]]); }
  finally { await Promise.all([uow.encerrar(), admin.encerrar()]); }
});

describe("Operação → campanha — autorização e vínculos existentes", () => {
  it("Leitor resolve campanha e somente suas tarefas, sem perder referências de edição", async () => {
    const selected = await campaign(own), outside = await campaign(own);
    const dependency = await createTask(deps, { ctx: own, content: content(outside.id) });
    const linked = await createTask(deps, { ctx: own, content: content(selected.id, { dependsOn: [dependency.id] }) });
    const before = await auditCount();
    expect(await getCampaign(deps, viewer, selected.id)).toEqual(selected);
    expect(await listCampaignTasks(deps, viewer, selected.id)).toEqual([linked]);
    const operation = await getOperationTasks(deps, viewer, { kind: "campaign", campaignId: selected.id });
    expect(operation.tasks).toEqual([linked]); expect(operation.references).toContainEqual(dependency);
    expect(operation.tasks[0]).toMatchObject({ dependsOn: [dependency.id], revision: 1, status: "todo", assignee: linked.assignee });
    expect(viewer.permissions.has("strategy.write")).toBe(false); expect(await auditCount()).toBe(before);
  });
  it("campanha alheia e inexistente têm a mesma recusa e não revelam tarefas", async () => {
    const foreign = await campaign(other);
    const task = await createTask(deps, { ctx: other, content: content(foreign.id, { assignee: null }) });
    const before = await auditCount();
    for (const campaignId of [foreign.id, randomUUID() as CampaignId]) {
      await expect(getCampaign(deps, viewer, campaignId)).rejects.toMatchObject({ code: "CAMPAIGN_NOT_FOUND", message: "campanha não encontrada" });
      await expect(listCampaignTasks(deps, viewer, campaignId)).rejects.toMatchObject({ code: "CAMPAIGN_NOT_FOUND", message: "campanha não encontrada" });
    }
    expect((await getOperationTasks(deps, viewer, { kind: "all" })).references.some(t => t.id === task.id)).toBe(false);
    expect(await listCampaignTasks(deps, other, foreign.id)).toEqual([task]);
    expect(await auditCount()).toBe(before);
  });
  it("mudança de vínculo invalida a antiga lista da campanha sem alterar tarefa por leitura", async () => {
    const selected = await campaign(own), destination = await campaign(own);
    const linked = await createTask(deps, { ctx: own, content: content(selected.id) });
    expect(await listCampaignTasks(deps, viewer, selected.id)).toEqual([linked]);
    const moved = await saveTaskDetails(deps, { ctx: own, taskId: linked.id, expectedRevision: linked.revision, content: {
      title: linked.title, description: linked.description, campaignId: destination.id, dueDate: linked.dueDate, dependsOn: linked.dependsOn,
    } });
    const before = await auditCount();
    expect(await listCampaignTasks(deps, viewer, selected.id)).toEqual([]);
    expect(await listCampaignTasks(deps, viewer, destination.id)).toEqual([moved]);
    expect((await getOperationTasks(deps, viewer, { kind: "campaign", campaignId: destination.id })).tasks).toEqual([moved]);
    expect(moved).toMatchObject({ revision: 2, assignee: linked.assignee, status: linked.status });
    expect(await auditCount()).toBe(before);
  });
  it("parâmetros de navegação não substituem permissão nem vínculo ativo no banco", async () => {
    const selected = await campaign(own);
    await createTask(deps, { ctx: own, content: content(selected.id) });
    const denied = { ...viewer, permissions: new Set<string>() } as AccessContext;
    await expect(getCampaign(deps, denied, selected.id)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    await expect(listCampaignTasks(deps, denied, selected.id)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    const before = await auditCount();
    await admin.pool.query("update core.memberships set status='revoked', revoked_at=now() where tenant_id=$1 and user_id=$2 and status='active'", [TA, VIEWER]);
    try {
      await expect(getCampaign(deps, viewer, selected.id)).rejects.toMatchObject({ code: "CAMPAIGN_NOT_FOUND" });
      await expect(listCampaignTasks(deps, viewer, selected.id)).rejects.toMatchObject({ code: "CAMPAIGN_NOT_FOUND" });
      await expect(resolver.resolve({ userId: VIEWER, email: "" }, TA)).rejects.toMatchObject({ code: "MEMBERSHIP_NOT_FOUND" });
    } finally {
      await admin.pool.query("update core.memberships set status='active', revoked_at=null where tenant_id=$1 and user_id=$2", [TA, VIEWER]);
    }
    expect(await auditCount()).toBe(before);
  });
});
