// Integração de Estratégia (I-04) com o Supabase LOCAL e papéis reais. Exige `pnpm db:start`,
// migrations, `pnpm db:roles` e seeds. Cada execução cria empresas próprias e as remove no fim
// (o que também exercita a cascata da exclusão da empresa com objetivos, campanhas, testes e tarefas).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { criarUnitOfWork, comoCliente } from "../src/db.ts";
import { auditLog, relogio } from "../src/repositories.ts";
import { brandRepository, geradorDeIds } from "../src/brand-repository.ts";
import { criarAccessContextResolver } from "../src/auth.ts";
import {
  campaignRepository, objectiveRepository, experimentRepository, taskRepository, agentCapabilities,
} from "../src/strategy-repository.ts";
import type { StrategyDeps } from "../../core/src/application/strategy-ports.ts";
import {
  createCampaignDraft, saveCampaignDraft, activateCampaign, pauseCampaign, completeCampaign, getCampaign, listCampaigns,
} from "../../core/src/application/use-cases/strategy.ts";
import { createObjective, setPrimaryObjective, listObjectives, saveObjective } from "../../core/src/application/use-cases/strategy-objectives.ts";
import { planExperiment, startExperiment, concludeExperiment, listExperiments } from "../../core/src/application/use-cases/strategy-experiments.ts";
import { createTask, saveTask, listTasks, changeTaskStatus } from "../../core/src/application/use-cases/strategy-tasks.ts";
import type { CampaignContent, ObjectiveContent, TaskContent, ExperimentPlan } from "../../core/src/domain/strategy.ts";
import type { AccessContext, TenantId, UserId, ProductKey } from "@oplyra/core";

const WEB = "postgresql://oplyra_web_login:local-web-2026@127.0.0.1:54422/postgres";
const ADMIN = "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const OWNER = randomUUID() as UserId;
const GESTOR = randomUUID() as UserId;
const LEITOR = randomUUID() as UserId;
const OWNER_B = randomUUID() as UserId;

const uow = criarUnitOfWork({ connectionString: WEB });
const admin = criarUnitOfWork({ connectionString: ADMIN });
const resolver = criarAccessContextResolver(uow);
const deps: StrategyDeps = {
  uow, campaigns: campaignRepository, objectives: objectiveRepository, experiments: experimentRepository,
  tasks: taskRepository, agents: agentCapabilities, brand: brandRepository, audit: auditLog, clock: relogio, ids: geradorDeIds,
};
const TA = randomUUID() as TenantId;
const TB = randomUUID() as TenantId;
const ctx = (u: UserId, t: TenantId): Promise<AccessContext> => resolver.resolve({ userId: u, email: "" }, t);

const metodo = { situation: "S", pain: "D", consequence: "C", desire: "E", mechanism: "M", proof: "P", offer: "O" };
const campanha = (over: Partial<CampaignContent> = {}): CampaignContent => ({
  name: "Lançamento", objectiveId: null, productKey: null, method: metodo, trackingKey: `k-${randomUUID().slice(0, 8)}`, ...over,
});
const objetivo = (over: Partial<ObjectiveContent> = {}): ObjectiveContent => ({
  name: "Gerar demanda", description: "", periodStart: "2026-10-01", periodEnd: "2026-12-31",
  kpis: [{ key: "reunioes", name: "Reuniões", metric: "reuniões marcadas", unit: "reuniões", target: 20.5 }], ...over,
});
const plano = (over: Partial<ExperimentPlan> = {}): ExperimentPlan => ({
  hypothesis: "Abrir pela dor aumenta reuniões.", dimension: "hook", dimensionNote: "",
  variants: ["Gancho pela dor", "Gancho pelo ganho"], decisionMetric: "reuniões marcadas", minimumSample: 30, ...over,
});
const tarefa = (over: Partial<TaskContent> = {}): TaskContent => ({
  title: "Tarefa", description: "", campaignId: null, dueDate: null, assignee: null, dependsOn: [], ...over,
});

beforeAll(async () => {
  for (const [id, slug] of [[TA, "estrategia-it-a"], [TB, "estrategia-it-b"]] as const) {
    await admin.pool.query(`insert into core.tenants (id, name, slug) values ($1, $2, $3)`, [id, `Estratégia IT ${slug}`, `${slug}-${id.slice(0, 8)}`]);
  }
  await admin.pool.query(
    `insert into core.memberships (tenant_id, user_id, role_key) values
       ($1,$2,'owner'), ($1,$3,'marketing_manager'), ($1,$4,'viewer'), ($5,$6,'owner')`,
    [TA, OWNER, GESTOR, LEITOR, TB, OWNER_B]);
});

afterAll(async () => {
  // Cascata real da exclusão da empresa, com todos os tipos de linha de estratégia.
  await admin.pool.query(`delete from core.tenants where id = any($1::uuid[])`, [[TA, TB]]);
  await uow.encerrar();
  await admin.encerrar();
});

describe("Estratégia com sessões reais", () => {
  it("fluxo completo: objetivo, campanha, teste e tarefas", async () => {
    const dono = await ctx(OWNER, TA);
    const gestor = await ctx(GESTOR, TA);

    const obj = await createObjective(deps, { ctx: gestor, content: objetivo() });
    // datas civis e números atravessam o banco sem deslocamento de fuso nem arredondamento
    expect(obj).toMatchObject({ periodStart: "2026-10-01", periodEnd: "2026-12-31", primary: false, revision: 1 });
    expect(obj.kpis[0]!.target).toBe(20.5);
    const principal = await setPrimaryObjective(deps, { ctx: gestor, objectiveId: obj.id, expectedRevision: 1 });
    expect(principal.primary).toBe(true);

    const rascunho = await createCampaignDraft(deps, { ctx: gestor, content: campanha({ objectiveId: obj.id }) });
    const salvo = await saveCampaignDraft(deps, {
      ctx: gestor, campaignId: rascunho.id, expectedRevision: 1, content: campanha({ objectiveId: obj.id, name: "Lançamento v2", trackingKey: rascunho.trackingKey }),
    });
    expect(salvo).toMatchObject({ name: "Lançamento v2", revision: 2, status: "draft", activatedAt: null });
    const ativa = await activateCampaign(deps, { ctx: gestor, campaignId: rascunho.id, expectedRevision: 2 });
    expect(ativa).toMatchObject({ status: "active", revision: 3 });
    expect(ativa.activatedAt).toBeInstanceOf(Date);

    const t = await planExperiment(deps, { ctx: gestor, campaignId: ativa.id, plan: plano() });
    const rodando = await startExperiment(deps, { ctx: gestor, experimentId: t.id, expectedRevision: 1 });
    expect(rodando.startedAt!.getTime()).toBeGreaterThanOrEqual(rodando.createdAt.getTime());
    const fim = await concludeExperiment(deps, {
      ctx: gestor, experimentId: t.id, expectedRevision: rodando.revision,
      result: { outcome: "supported", observedSample: 31, limitations: "" },
      learning: { summary: "A dor converte mais.", evidence: ["https://exemplo.test/r"], campaignVersion: 1 },
    });
    expect(fim).toMatchObject({ status: "concluded", result: { outcome: "supported", observedSample: 31 }, learning: { campaignVersion: 1 } });
    expect((await listExperiments(deps, dono, ativa.id))[0]).toMatchObject({ plan: { variants: ["Gancho pela dor", "Gancho pelo ganho"] } });

    const a = await createTask(deps, { ctx: gestor, content: tarefa({ title: "A", campaignId: ativa.id, dueDate: "2026-11-30" }) });
    const b = await createTask(deps, { ctx: gestor, content: tarefa({ title: "B", dependsOn: [a.id] }) });
    expect(a.dueDate).toBe("2026-11-30");
    expect((await listTasks(deps, dono)).find((x) => x.id === b.id)!.dependsOn).toEqual([a.id]);
    const andamento = await changeTaskStatus(deps, { ctx: gestor, taskId: b.id, expectedRevision: 1, to: "in_progress" });
    expect(andamento.status).toBe("in_progress");

    const pausada = await pauseCampaign(deps, { ctx: gestor, campaignId: ativa.id, expectedRevision: 3 });
    await expect(startExperiment(deps, { ctx: gestor, experimentId: t.id, expectedRevision: fim.revision })).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    const concluida = await completeCampaign(deps, { ctx: gestor, campaignId: ativa.id, expectedRevision: pausada.revision });
    expect(concluida.status).toBe("completed");
    expect((await listObjectives(deps, dono))[0]).toMatchObject({ id: obj.id, primary: true });
    await expect(saveObjective(deps, { ctx: gestor, objectiveId: obj.id, expectedRevision: 99, content: objetivo() })).rejects.toMatchObject({ code: "CONFLICT_VERSION" });
  });

  it("permissões vêm do banco: leitor lê, não escreve", async () => {
    const leitor = await ctx(LEITOR, TA);
    await expect(listCampaigns(deps, leitor)).resolves.toBeDefined();
    await expect(createCampaignDraft(deps, { ctx: leitor, content: campanha() })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    await expect(createTask(deps, { ctx: leitor, content: tarefa() })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });
});

describe("recusas do banco traduzidas", () => {
  it("chave de rastreamento duplicada: na empresa colide, em outra empresa não; corrida concorrente deixa uma só", async () => {
    const gestor = await ctx(GESTOR, TA);
    const dono = await ctx(OWNER_B, TB);
    const chave = `dup-${randomUUID().slice(0, 8)}`;
    await createCampaignDraft(deps, { ctx: gestor, content: campanha({ trackingKey: chave }) });
    await expect(createCampaignDraft(deps, { ctx: gestor, content: campanha({ trackingKey: chave }) })).rejects.toMatchObject({ code: "CAMPAIGN_TRACKING_KEY_TAKEN" });
    await expect(createCampaignDraft(deps, { ctx: dono, content: campanha({ trackingKey: chave }) })).resolves.toMatchObject({ tenantId: TB });

    const corrida = `corrida-${randomUUID().slice(0, 8)}`;
    const r = await Promise.allSettled([
      createCampaignDraft(deps, { ctx: gestor, content: campanha({ trackingKey: corrida }) }),
      createCampaignDraft(deps, { ctx: gestor, content: campanha({ trackingKey: corrida }) }),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const rejeitada = r.find((x) => x.status === "rejected") as PromiseRejectedResult;
    expect(rejeitada.reason).toMatchObject({ code: "CAMPAIGN_TRACKING_KEY_TAKEN" });
  });

  it("concorrência otimista: duas gravações com a mesma revisão, uma vence", async () => {
    const gestor = await ctx(GESTOR, TA);
    const c = await createCampaignDraft(deps, { ctx: gestor, content: campanha() });
    const r = await Promise.allSettled([
      saveCampaignDraft(deps, { ctx: gestor, campaignId: c.id, expectedRevision: 1, content: campanha({ trackingKey: c.trackingKey, name: "X" }) }),
      saveCampaignDraft(deps, { ctx: gestor, campaignId: c.id, expectedRevision: 1, content: campanha({ trackingKey: c.trackingKey, name: "Y" }) }),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((r.find((x) => x.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "CONFLICT_VERSION" });
    expect((await getCampaign(deps, gestor, c.id)).revision).toBe(2);
  });

  it("a guarda do banco barra o que o domínio deixasse passar (chamada direta ao repositório)", async () => {
    const gestor = await ctx(GESTOR, TA);
    const c = await createCampaignDraft(deps, { ctx: gestor, content: campanha() });
    // ativar campanha incompleta, pulando o caso de uso
    const vazia = await createCampaignDraft(deps, { ctx: gestor, content: campanha({ method: { ...metodo, offer: "" } }) });
    await expect(uow.withUserTransaction(gestor, (tx) => campaignRepository.transition(tx, {
      tenantId: TA, id: vazia.id, expectedRevision: 1, from: "draft", to: "active", at: new Date(),
    }))).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    // chave de campanha ativa: troca direta
    const ativa = await activateCampaign(deps, { ctx: gestor, campaignId: c.id, expectedRevision: 1 });
    await expect(uow.withUserTransaction(gestor, (tx) => comoCliente(tx).query(
      `update strategy.campaigns set tracking_key = 'burla-direta' where tenant_id = $1 and id = $2`, [TA, ativa.id],
    ))).rejects.toMatchObject({ code: "23514" });
    // sucesso com amostra insuficiente, pulando o domínio
    const t = await planExperiment(deps, { ctx: gestor, campaignId: ativa.id, plan: plano() });
    const rodando = await startExperiment(deps, { ctx: gestor, experimentId: t.id, expectedRevision: 1 });
    await expect(uow.withUserTransaction(gestor, (tx) => experimentRepository.transition(tx, {
      tenantId: TA, id: t.id, expectedRevision: rodando.revision, from: "running", to: "concluded", at: new Date(),
      result: { outcome: "supported", observedSample: 1, limitations: "" },
    }))).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  });

  it("dependência cíclica: o banco recusa mesmo sem o domínio, e arestas opostas concorrentes não fecham ciclo", async () => {
    const gestor = await ctx(GESTOR, TA);
    const a = await createTask(deps, { ctx: gestor, content: tarefa({ title: "A" }) });
    const b = await createTask(deps, { ctx: gestor, content: tarefa({ title: "B", dependsOn: [a.id] }) });
    await expect(uow.withUserTransaction(gestor, (tx) => taskRepository.replaceContent(tx, {
      tenantId: TA, id: a.id, expectedRevision: 1, content: tarefa({ title: "A", dependsOn: [b.id] }),
    }))).rejects.toMatchObject({ code: "TASK_DEPENDENCY_CYCLE" });

    const c = await createTask(deps, { ctx: gestor, content: tarefa({ title: "C" }) });
    const d = await createTask(deps, { ctx: gestor, content: tarefa({ title: "D" }) });
    const r = await Promise.allSettled([
      saveTask(deps, { ctx: gestor, taskId: c.id, expectedRevision: 1, content: tarefa({ title: "C", dependsOn: [d.id] }) }),
      saveTask(deps, { ctx: gestor, taskId: d.id, expectedRevision: 1, content: tarefa({ title: "D", dependsOn: [c.id] }) }),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((r.find((x) => x.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "TASK_DEPENDENCY_CYCLE" });
    const todas = await listTasks(deps, gestor);
    const arestas = todas.filter((x) => [c.id, d.id].includes(x.id)).flatMap((x) => x.dependsOn);
    expect(arestas).toHaveLength(1);
  });

  it("produto fora da marca vigente e agente não habilitado são recusados (fail-closed)", async () => {
    const gestor = await ctx(GESTOR, TA);
    await expect(createCampaignDraft(deps, { ctx: gestor, content: campanha({ productKey: randomUUID() as ProductKey }) })).rejects.toMatchObject({ code: "REFERENCE_NOT_FOUND" });
    await expect(createTask(deps, { ctx: gestor, content: tarefa({ assignee: { kind: "agent", agentKey: "copywriting" } }) })).rejects.toMatchObject({ code: "TASK_ASSIGNEE_INVALID" });
  });
});

describe("isolamento entre empresas com sessão real", () => {
  it("a empresa B não enxerga nem altera dados de A pelos casos de uso", async () => {
    const gestor = await ctx(GESTOR, TA);
    const donoB = await ctx(OWNER_B, TB);
    const c = await createCampaignDraft(deps, { ctx: gestor, content: campanha() });
    const o = await createObjective(deps, { ctx: gestor, content: objetivo({ name: "só de A" }) });
    const t = await createTask(deps, { ctx: gestor, content: tarefa({ title: "só de A" }) });

    expect((await listCampaigns(deps, donoB)).some((x) => x.id === c.id)).toBe(false);
    expect((await listObjectives(deps, donoB)).some((x) => x.id === o.id)).toBe(false);
    expect((await listTasks(deps, donoB)).some((x) => x.id === t.id)).toBe(false);
    await expect(getCampaign(deps, donoB, c.id)).rejects.toMatchObject({ code: "CAMPAIGN_NOT_FOUND" });
    await expect(activateCampaign(deps, { ctx: donoB, campaignId: c.id, expectedRevision: 1 })).rejects.toMatchObject({ code: "CAMPAIGN_NOT_FOUND" });
    await expect(setPrimaryObjective(deps, { ctx: donoB, objectiveId: o.id, expectedRevision: 1 })).rejects.toMatchObject({ code: "OBJECTIVE_NOT_FOUND" });
    await expect(changeTaskStatus(deps, { ctx: donoB, taskId: t.id, expectedRevision: 1, to: "cancelled" })).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
    await expect(createCampaignDraft(deps, { ctx: donoB, content: campanha({ objectiveId: o.id }) })).rejects.toMatchObject({ code: "REFERENCE_NOT_FOUND" });
    await expect(createTask(deps, { ctx: donoB, content: tarefa({ dependsOn: [t.id] }) })).rejects.toMatchObject({ code: "REFERENCE_NOT_FOUND" });
    await expect(planExperiment(deps, { ctx: donoB, campaignId: c.id, plan: plano() })).rejects.toMatchObject({ code: "CAMPAIGN_NOT_FOUND" });
  });

  it("SQL direto como B: leitura vazia; UPDATE/INSERT/DELETE sobre A não afetam nada e são negados", async () => {
    const gestor = await ctx(GESTOR, TA);
    const donoB = await ctx(OWNER_B, TB);
    const c = await createCampaignDraft(deps, { ctx: gestor, content: campanha({ name: "intacta" }) });
    const o = await createObjective(deps, { ctx: gestor, content: objetivo({ name: "intacto" }) });
    const t = await createTask(deps, { ctx: gestor, content: tarefa({ title: "intacta" }) });

    const sonda = await uow.withUserTransaction(donoB, async (tx) => {
      const db = comoCliente(tx);
      const papel = await db.query(
        `select current_user as usuario, (select rolsuper or rolbypassrls from pg_roles where rolname = current_user) as "ignoraRls",
                app.current_tenant() as tenant`);
      const lidas = await db.query(
        `select (select count(*) from strategy.campaigns where tenant_id = $1)
              + (select count(*) from strategy.objectives where tenant_id = $1)
              + (select count(*) from strategy.tasks where tenant_id = $1) as n`, [TA]);
      const upd = [
        (await db.query(`update strategy.campaigns set name = 'invadida' where tenant_id = $1`, [TA])).rowCount,
        (await db.query(`update strategy.objectives set name = 'invadido' where tenant_id = $1`, [TA])).rowCount,
        (await db.query(`update strategy.tasks set title = 'invadida' where tenant_id = $1`, [TA])).rowCount,
        (await db.query(`update strategy.campaigns set name = 'invadida' where id = $1`, [c.id])).rowCount,
      ];
      const del = await db.query(`delete from strategy.task_dependencies where tenant_id = $1`, [TA]);
      return { papel: papel.rows[0], lidas: Number((lidas.rows[0] as { n: string }).n), upd, del: del.rowCount };
    });
    expect(sonda.papel).toMatchObject({ usuario: "authenticated", ignoraRls: false, tenant: TB });
    expect(sonda.lidas).toBe(0);
    expect(sonda.upd).toEqual([0, 0, 0, 0]);
    expect(sonda.del).toBe(0);

    // INSERT com tenant de A: negado pela política; o banco devolve 42501.
    await expect(uow.withUserTransaction(donoB, (tx) => comoCliente(tx).query(
      `insert into strategy.tasks (tenant_id, title, created_by) values ($1, 'x', $2)`, [TA, OWNER_B],
    ))).rejects.toMatchObject({ code: "42501" });
    // Trocar o tenant de uma linha própria para A: negado.
    const propria = await createTask(deps, { ctx: donoB, content: tarefa({ title: "de B" }) });
    await expect(uow.withUserTransaction(donoB, (tx) => comoCliente(tx).query(
      `update strategy.tasks set tenant_id = $1 where tenant_id = $2 and id = $3`, [TA, TB, propria.id],
    ))).rejects.toBeDefined();

    // Nada mudou em A.
    expect((await getCampaign(deps, gestor, c.id)).name).toBe("intacta");
    expect((await listObjectives(deps, gestor)).find((x) => x.id === o.id)!.name).toBe("intacto");
    expect((await listTasks(deps, gestor)).find((x) => x.id === t.id)!.title).toBe("intacta");
  });

  it("sem sessão de empresa o papel de login não enxerga nada: contexto de B não vê A mesmo apontando o tenant de A", async () => {
    const gestor = await ctx(GESTOR, TA);
    const c = await createCampaignDraft(deps, { ctx: gestor, content: campanha() });
    // Contexto forjado: usuário de B com tenantId de A. A transação do tenant exige membership válida.
    const donoB = await ctx(OWNER_B, TB);
    const forjado: AccessContext = { ...donoB, tenantId: TA };
    const vistas = await uow.withUserTransaction(forjado, (tx) => campaignRepository.list(tx, TA)).catch((e: unknown) => e);
    // Ou a transação recusa o contexto, ou a RLS devolve vazio; nunca a campanha de A.
    if (Array.isArray(vistas)) expect(vistas.some((x) => x.id === c.id)).toBe(false);
    else expect(vistas).toBeInstanceOf(Error);
  });
});
