// Conexões e RLS reais somente no banco descartável da CI. Identidades/memberships são
// fixtures SQL; não é prova de login JWT hospedado. Nenhuma URL externa é consumida.
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
import { createTask, listCampaignTasks, saveTaskDetails, changeTaskStatus } from "../../core/src/application/use-cases/strategy-tasks.ts";

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
const content = (campaignId: CampaignId | null, over: Partial<TaskContent> = {}): TaskContent => ({
  title: "Tarefa da campanha", description: "Conferência de vínculo", campaignId, dueDate: "2028-02-29",
  assignee: { kind: "user", userId: OWNER }, dependsOn: [], ...over,
});
const campaign = (ctx: AccessContext) => createCampaignDraft(deps, { ctx, content: {
  name: "Campanha de tarefas", trackingKey: "", objectiveId: null, productKey: null,
  method: { situation: "", pain: "", consequence: "", desire: "", mechanism: "", proof: "", offer: "" },
} });
const auditCount = async () => Number((await admin.pool.query("select count(*)::int as n from core.audit_log where tenant_id=any($1::uuid[])", [[TA, TB]])).rows[0]!.n);

beforeAll(async () => {
  // Prefixos curtos + UUID completo:41caracteres, dentro da constraint canônica (máximo50).
  await admin.pool.query("insert into core.tenants(id,name,slug) values($1,$2,$3),($4,$5,$6)",
    [TA, "Campaign tasks A", `ct-a-${TA}`, TB, "Campaign tasks B", `ct-b-${TB}`]);
  await admin.pool.query("insert into core.memberships(tenant_id,user_id,role_key) values($1,$2,'owner'),($1,$3,'viewer'),($4,$5,'owner')", [TA, OWNER, VIEWER, TB, OTHER]);
  own = await resolver.resolve({ userId: OWNER, email: "" }, TA);
  other = await resolver.resolve({ userId: OTHER, email: "" }, TB);
  viewer = await resolver.resolve({ userId: VIEWER, email: "" }, TA);
});
afterAll(async () => {
  try { await admin.pool.query("delete from core.tenants where id=any($1::uuid[])", [[TA, TB]]); }
  finally { await Promise.all([uow.encerrar(), admin.encerrar()]); }
});

describe("tarefas vinculadas — PostgreSQL, permissões e isolamento", () => {
  it("seleciona vínculo exato, exclui avulsas/outras campanhas/B e permite Leitor sem mutações", async () => {
    const selected = await campaign(own), alternative = await campaign(own), foreign = await campaign(other);
    const linked = await createTask(deps, { ctx: own, content: content(selected.id) });
    await createTask(deps, { ctx: own, content: content(null) });
    await createTask(deps, { ctx: own, content: content(alternative.id) });
    await createTask(deps, { ctx: other, content: content(foreign.id, { assignee: null }) });
    const before = await auditCount();
    expect(await listCampaignTasks(deps, own, selected.id)).toEqual([linked]);
    expect(viewer.permissions.has("strategy.write")).toBe(false);
    expect(await listCampaignTasks(deps, viewer, selected.id)).toEqual([linked]);
    expect(await auditCount()).toBe(before);
    expect(await listCampaignTasks(deps, own, alternative.id)).toHaveLength(1);
  });

  it("campanha de B e inexistente recebem a mesma recusa; falta de permissão também falha fechada", async () => {
    const foreign = await campaign(other), selected = await campaign(own);
    const foreignTask = await createTask(deps, { ctx: other, content: content(foreign.id, { assignee: null }) });
    const before = await auditCount();
    for (const id of [foreign.id, randomUUID() as CampaignId]) {
      await expect(listCampaignTasks(deps, own, id)).rejects.toMatchObject({ code: "CAMPAIGN_NOT_FOUND", message: "campanha não encontrada" });
    }
    await expect(listCampaignTasks(deps, { ...own, permissions: new Set() }, selected.id)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(await listCampaignTasks(deps, other, foreign.id)).toEqual([foreignTask]);
    expect(await auditCount()).toBe(before);
  });

  it("releitura acompanha troca de vínculo pelo caso de uso de edição, sem presença nas duas campanhas", async () => {
    const initial = await campaign(own), destination = await campaign(own);
    let task = await createTask(deps, { ctx: own, content: content(initial.id) });
    task = await changeTaskStatus(deps, { ctx: own, taskId: task.id, expectedRevision: 1, to: "in_progress" });
    expect(await listCampaignTasks(deps, own, initial.id)).toEqual([task]);
    const saved = await saveTaskDetails(deps, { ctx: own, taskId: task.id, expectedRevision: 2, content: {
      title: task.title, description: task.description, dueDate: task.dueDate, dependsOn: task.dependsOn, campaignId: destination.id,
    } });
    expect(saved).toMatchObject({ assignee: task.assignee, status: "in_progress", revision: 3 });
    const before = await auditCount();
    expect(await listCampaignTasks(deps, own, initial.id)).toEqual([]);
    expect(await listCampaignTasks(deps, viewer, destination.id)).toEqual([saved]);
    expect(await auditCount()).toBe(before);
  });

  it("campanha/tarefa canceladas continuam legíveis e o grafo/responsável não é amputado", async () => {
    const selected = await campaign(own);
    const loose = await createTask(deps, { ctx: own, content: content(null) });
    let task = await createTask(deps, { ctx: own, content: content(selected.id, { dependsOn: [loose.id] }) });
    task = await changeTaskStatus(deps, { ctx: own, taskId: task.id, expectedRevision: 1, to: "cancelled" });
    await cancelCampaign(deps, { ctx: own, campaignId: selected.id, expectedRevision: selected.revision });
    const before = await auditCount();
    expect(await listCampaignTasks(deps, viewer, selected.id)).toEqual([task]);
    expect(task.dependsOn).toEqual([loose.id]);
    expect(task.assignee).toEqual({ kind: "user", userId: OWNER });
    expect(await auditCount()).toBe(before);
  });
});
