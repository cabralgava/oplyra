// Integração da Estratégia com o Supabase LOCAL e papéis reais (I-04). Exige `pnpm db:start`, migrations,
// `pnpm db:roles` e seeds. Cada execução cria empresas e identidades próprias e as remove no fim
// (o que também exercita a cascata da exclusão da empresa com marca publicada e campanha ativa).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { criarUnitOfWork } from "../src/db.ts";
import { auditLog, relogio } from "../src/repositories.ts";
import { brandRepository, geradorDeIds, activationFactsReader } from "../src/brand-repository.ts";
import { strategyRepository } from "../src/strategy-repository.ts";
import { criarAccessContextResolver } from "../src/auth.ts";
import { startBrandDraft, saveBrandDraft, publishBrandVersion, getActivationChecklist } from "@oplyra/core/brand";
import {
  createObjective, archiveObjective, listObjectives, createPersona, listPersonas, createCampaign, updateCampaign, regenerateTrackingKey,
  changeCampaignStatus, getCampaign, listCampaigns, createExperiment, changeExperimentStatus, metodoVazio,
} from "@oplyra/core/strategy";
import type { StrategyDeps, CampaignPlan, ObjectiveContent } from "@oplyra/core/strategy";
import type { BrandDeps } from "@oplyra/core/brand";
import type { AccessContext, TenantId, UserId, ProductKey } from "@oplyra/core";

const WEB = "postgresql://oplyra_web_login:local-web-2026@127.0.0.1:54422/postgres";
const ADMIN = "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const uow = criarUnitOfWork({ connectionString: WEB });
const admin = criarUnitOfWork({ connectionString: ADMIN });
const resolver = criarAccessContextResolver(uow);
const brandDeps: BrandDeps = { uow, brand: brandRepository, audit: auditLog, clock: relogio, ids: geradorDeIds };
const deps: StrategyDeps = { uow, strategy: strategyRepository, brand: brandRepository, audit: auditLog, clock: relogio, ids: geradorDeIds };

const TS = randomUUID() as TenantId; // empresa da estratégia
const TT = randomUUID() as TenantId; // outra empresa (isolamento)
const DONO = randomUUID() as UserId;
const GESTOR = randomUUID() as UserId;
const LEITOR = randomUUID() as UserId;
const DONO_T = randomUUID() as UserId;
const ctx = (u: UserId, t: TenantId): Promise<AccessContext> => resolver.resolve({ userId: u, email: "" }, t);

const objetivo = (): ObjectiveContent => ({
  nome: "Gerar demanda qualificada", descricao: "Pipeline do trimestre", periodo: { inicio: "2026-11-01", fim: "2026-12-31" },
  kpis: [{ nome: "Leads qualificados", unidade: "leads", alvo: 120 }, { nome: "Taxa de conversão", unidade: "%", alvo: 2.5 }],
});
let produtoAtual: ProductKey;
let produtoFuturo: ProductKey;
const plano = (objectiveId: CampaignPlan["objectiveId"], productKey: ProductKey, over: Partial<CampaignPlan> = {}): CampaignPlan => ({
  nome: "Lançamento Plataforma Pro", objectiveId, productKey, personaId: null,
  metodo: {
    situacao: "Equipe de marketing sem visão de receita.", dor: "Relatórios manuais.", consequencia: "Decisões atrasadas.",
    desejo: "Ver o retorno por campanha.", mecanismo: "Painel unificado.", prova: "Estudo de caso.", oferta: "Demonstração gratuita.",
  },
  periodo: { inicio: "2026-11-01", fim: "2026-12-31" }, orcamento: { centavos: 500000, moeda: "BRL" }, mensagemChave: "Veja o retorno de cada campanha.", ...over,
});

beforeAll(async () => {
  for (const [id, slug] of [[TS, "est-it-s"], [TT, "est-it-t"]] as const) {
    await admin.pool.query(`insert into core.tenants (id, name, slug) values ($1, $2, $3)`, [id, `Estratégia IT ${slug}`, `${slug}-${id.slice(0, 8)}`]);
  }
  await admin.pool.query(
    `insert into core.memberships (tenant_id, user_id, role_key) values ($1,$2,'owner'), ($1,$3,'marketing_manager'), ($1,$4,'viewer'), ($5,$6,'owner')`,
    [TS, DONO, GESTOR, LEITOR, TT, DONO_T]);

  // Marca publicada real, com um produto disponível e um futuro.
  const dono = await ctx(DONO, TS);
  const r = await startBrandDraft(brandDeps, { ctx: dono });
  const s = await saveBrandDraft(brandDeps, {
    ctx: dono, versionId: r.id, expectedRevision: 1,
    content: {
      positioning: "Operações de marketing para SaaS B2B.", tone: "Direto e técnico.", claims: [],
      products: [
        { name: "Plataforma Pro", description: "", availability: "available" },
        { name: "Módulo Novo", description: "", availability: "future" },
      ],
    },
  });
  const v1 = await publishBrandVersion(brandDeps, { ctx: dono, versionId: s.id, expectedRevision: s.revision });
  produtoAtual = v1.products.find((p) => p.name === "Plataforma Pro")!.productKey;
  produtoFuturo = v1.products.find((p) => p.name === "Módulo Novo")!.productKey;
});

afterAll(async () => {
  await admin.pool.query(`delete from core.tenants where id = any($1::uuid[])`, [[TS, TT]]);
  await uow.encerrar();
  await admin.encerrar();
});

describe("estratégia com sessões reais", () => {
  it("objetivo e indicadores: gravação, leitura, ordem e arquivamento", async () => {
    const dono = await ctx(DONO, TS);
    const o = await createObjective(deps, { ctx: dono, content: objetivo() });
    expect(o).toMatchObject({ nome: "Gerar demanda qualificada", status: "active", periodo: { inicio: "2026-11-01", fim: "2026-12-31" } });
    expect(o.kpis).toEqual([{ nome: "Leads qualificados", unidade: "leads", alvo: 120 }, { nome: "Taxa de conversão", unidade: "%", alvo: 2.5 }]);
    const arquivado = await createObjective(deps, { ctx: dono, content: { ...objetivo(), nome: "Objetivo antigo", kpis: [] } });
    await archiveObjective(deps, { ctx: dono, id: arquivado.id });
    expect((await listObjectives(deps, dono)).map((x) => x.nome)).toEqual(["Gerar demanda qualificada"]);
    expect(await listObjectives(deps, dono, { includeArchived: true })).toHaveLength(2);
    // Banco: o objetivo só muda de estado.
    await expect(uow.withUserTransaction(dono, (tx) =>
      (tx as unknown as { query(q: string, p: unknown[]): Promise<unknown> }).query(`update strategy.objectives set name = 'x' where id = $1`, [o.id])))
      .rejects.toMatchObject({ code: "23514" });
  });

  it("personas: criar, listar e arquivar", async () => {
    const dono = await ctx(DONO, TS);
    const p = await createPersona(deps, { ctx: dono, content: { nome: "Gerente de marketing", descricao: "SaaS B2B", dores: "Relatórios manuais", objecoes: "Custo" } });
    expect(await listPersonas(deps, dono)).toEqual([expect.objectContaining({ nome: "Gerente de marketing", dores: "Relatórios manuais", status: "active" })]);
    expect(p.status).toBe("active");
  });

  it("campanha: referências reais, valores gravados e chave no formato", async () => {
    const dono = await ctx(DONO, TS);
    const [obj] = await listObjectives(deps, dono);
    const [persona] = await listPersonas(deps, dono);
    const c = await createCampaign(deps, { ctx: dono, plan: plano(obj!.id, produtoAtual, { personaId: persona!.id }) });
    expect(c).toMatchObject({
      status: "planned", revision: 1, activatedAt: null, productKey: produtoAtual, personaId: persona!.id, nome: "Lançamento Plataforma Pro",
      periodo: { inicio: "2026-11-01", fim: "2026-12-31" }, orcamento: { centavos: 500000, moeda: "BRL" },
      metodo: { situacao: "Equipe de marketing sem visão de receita.", oferta: "Demonstração gratuita." },
    });
    expect(c.chave).toMatch(/^cmp-lancamento-plataforma-pro-[0-9a-f]{4}$/);
    expect((await getCampaign(deps, dono, c.id)).campaign.brandVersionId).toBe(c.brandVersionId);
    expect(await listCampaigns(deps, dono)).toHaveLength(1);
  });

  it("isolamento: outra empresa não vê objetivos, campanhas nem as referencia", async () => {
    const donoT = await ctx(DONO_T, TT);
    const dono = await ctx(DONO, TS);
    const [obj] = await listObjectives(deps, dono);
    const [c] = await listCampaigns(deps, dono);
    expect(await listObjectives(deps, donoT)).toEqual([]);
    expect(await listCampaigns(deps, donoT)).toEqual([]);
    await expect(getCampaign(deps, donoT, c!.id)).rejects.toMatchObject({ code: "CAMPAIGN_NOT_FOUND" });
    await expect(changeCampaignStatus(deps, { ctx: donoT, id: c!.id, to: "cancelled" })).rejects.toMatchObject({ code: "CAMPAIGN_NOT_FOUND" });
    // sem marca publicada na empresa T, a referência a produto alheio nem chega ao objetivo alheio
    await expect(createCampaign(deps, { ctx: donoT, plan: plano(obj!.id, produtoAtual) })).rejects.toMatchObject({ code: "OBJECTIVE_NOT_FOUND" });
  });

  it("permissões reais: leitor lê e não escreve; gestor escreve e ativa", async () => {
    const leitor = await ctx(LEITOR, TS);
    const gestor = await ctx(GESTOR, TS);
    expect(await listCampaigns(deps, leitor)).toHaveLength(1);
    await expect(createObjective(deps, { ctx: leitor, content: objetivo() })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    const [c] = await listCampaigns(deps, gestor);
    await expect(changeCampaignStatus(deps, { ctx: leitor, id: c!.id, to: "active" })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    const g = await createCampaign(deps, { ctx: gestor, plan: plano((await listObjectives(deps, gestor))[0]!.id, produtoAtual, { nome: "Do gestor" }) });
    expect(g.createdBy).toBe(GESTOR);
  });

  it("TST-30 e ativação: método incompleto não ativa; completo ativa e fixa a chave", async () => {
    const dono = await ctx(DONO, TS);
    const [obj] = await listObjectives(deps, dono);
    const rascunho = await createCampaign(deps, { ctx: dono, plan: plano(obj!.id, produtoAtual, { nome: "Incompleta", metodo: { ...metodoVazio(), situacao: "Só isto" } }) });
    await expect(changeCampaignStatus(deps, { ctx: dono, id: rascunho.id, to: "active" })).rejects.toMatchObject({ code: "CAMPAIGN_NOT_ACTIVATABLE" });

    const completa = await updateCampaign(deps, { ctx: dono, id: rascunho.id, expectedRevision: 1, plan: plano(obj!.id, produtoAtual, { nome: "Incompleta" }) });
    expect(completa.revision).toBe(2);
    const ativa = await changeCampaignStatus(deps, { ctx: dono, id: rascunho.id, to: "active" });
    expect(ativa).toMatchObject({ status: "active", chave: completa.chave });
    expect(ativa.activatedAt).toBeInstanceOf(Date);

    await expect(regenerateTrackingKey(deps, { ctx: dono, id: rascunho.id, expectedRevision: ativa.revision })).rejects.toMatchObject({ code: "TRACKING_KEY_LOCKED" });
    // Mesmo contornando o caso de uso, o banco recusa a troca da chave.
    await expect(uow.withUserTransaction(dono, (tx) =>
      strategyRepository.replaceTrackingKey(tx, { tenantId: TS, id: rascunho.id, expectedRevision: ativa.revision, chave: "cmp-outra-chave-ffff" })))
      .rejects.toMatchObject({ code: "TRACKING_KEY_LOCKED" });
    await expect(uow.withUserTransaction(dono, (tx) =>
      (tx as unknown as { query(q: string, p: unknown[]): Promise<unknown> }).query(`update strategy.campaigns set tracking_key = 'cmp-outra-chave-ffff' where id = $1`, [rascunho.id])))
      .rejects.toMatchObject({ code: "23514" });
    await changeCampaignStatus(deps, { ctx: dono, id: rascunho.id, to: "paused" });
    expect((await changeCampaignStatus(deps, { ctx: dono, id: rascunho.id, to: "active" })).chave).toBe(completa.chave);
  });

  it("chave regenerável enquanto planejada, com concorrência otimista", async () => {
    const dono = await ctx(DONO, TS);
    const [obj] = await listObjectives(deps, dono);
    const c = await createCampaign(deps, { ctx: dono, plan: plano(obj!.id, produtoAtual, { nome: "Regenerável" }) });
    const nova = await regenerateTrackingKey(deps, { ctx: dono, id: c.id, expectedRevision: 1 });
    expect(nova.chave).toMatch(/^cmp-regeneravel-[0-9a-f]{4}$/);
    const resultados = await Promise.allSettled([
      updateCampaign(deps, { ctx: dono, id: c.id, expectedRevision: 2, plan: plano(obj!.id, produtoAtual, { nome: "Regenerável", mensagemChave: "A" }) }),
      updateCampaign(deps, { ctx: dono, id: c.id, expectedRevision: 2, plan: plano(obj!.id, produtoAtual, { nome: "Regenerável", mensagemChave: "B" }) }),
    ]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((resultados.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "CONFLICT_VERSION" });
  });

  it("produto future: o rascunho existe, a ativação é recusada (D-7)", async () => {
    const dono = await ctx(DONO, TS);
    const [obj] = await listObjectives(deps, dono);
    const c = await createCampaign(deps, { ctx: dono, plan: plano(obj!.id, produtoFuturo, { nome: "Módulo novo" }) });
    await expect(changeCampaignStatus(deps, { ctx: dono, id: c.id, to: "active" }))
      .rejects.toMatchObject({ code: "CAMPAIGN_NOT_ACTIVATABLE", issues: [{ code: "PRODUCT_NOT_AVAILABLE" }] });
  });

  it("objetivo arquivado não ativa campanha nem recebe nova", async () => {
    const dono = await ctx(DONO, TS);
    const novo = await createObjective(deps, { ctx: dono, content: { ...objetivo(), nome: "Efêmero", kpis: [] } });
    const c = await createCampaign(deps, { ctx: dono, plan: plano(novo.id, produtoAtual, { nome: "Do efêmero" }) });
    await archiveObjective(deps, { ctx: dono, id: novo.id });
    await expect(changeCampaignStatus(deps, { ctx: dono, id: c.id, to: "active" })).rejects.toMatchObject({ code: "OBJECTIVE_ARCHIVED" });
    await expect(createCampaign(deps, { ctx: dono, plan: plano(novo.id, produtoAtual, { nome: "Outra" }) })).rejects.toMatchObject({ code: "OBJECTIVE_ARCHIVED" });
  });

  it("testes: hipótese e dimensão obrigatórias, execução e interrupção, auditoria", async () => {
    const dono = await ctx(DONO, TS);
    const ativa = (await listCampaigns(deps, dono)).find((c) => c.nome === "Incompleta")!;
    await expect(createExperiment(deps, { ctx: dono, campaignId: ativa.id, content: { hipotese: "", dimensao: "hook", notaDaDimensao: "" } }))
      .rejects.toMatchObject({ code: "STRATEGY_CONTENT_INVALID" });
    const t = await createExperiment(deps, { ctx: dono, campaignId: ativa.id, content: { hipotese: "Gancho com número aumenta o clique.", dimensao: "hook", notaDaDimensao: "" } });
    const rodando = await changeExperimentStatus(deps, { ctx: dono, id: t.id, to: "running" });
    expect(rodando.status).toBe("running");
    expect(rodando.startedAt).toBeInstanceOf(Date);
    await changeExperimentStatus(deps, { ctx: dono, id: t.id, to: "stopped" });
    await expect(changeExperimentStatus(deps, { ctx: dono, id: t.id, to: "running" })).rejects.toMatchObject({ code: "INVALID_EXPERIMENT_TRANSITION" });
    expect((await getCampaign(deps, dono, ativa.id)).experiments.map((x) => x.status)).toEqual(["stopped"]);

    await changeCampaignStatus(deps, { ctx: dono, id: ativa.id, to: "completed" });
    await expect(createExperiment(deps, { ctx: dono, campaignId: ativa.id, content: { hipotese: "H", dimensao: "cta", notaDaDimensao: "" } }))
      .rejects.toMatchObject({ code: "CAMPAIGN_NOT_OPEN_FOR_EXPERIMENTS" });
  });

  it("auditoria da estratégia grava ids e estados, sem o conteúdo da campanha", async () => {
    const { rows } = await admin.pool.query(`select action, before, after from core.audit_log where tenant_id = $1 and action like 'strategy.%'`, [TS]);
    const acoes = new Set(rows.map((r: { action: string }) => r.action));
    for (const a of ["strategy.objective.create", "strategy.objective.archive", "strategy.persona.create", "strategy.campaign.create", "strategy.campaign.active",
      "strategy.campaign.paused", "strategy.campaign.completed", "strategy.experiment.create", "strategy.experiment.running", "strategy.experiment.stopped"]) {
      expect(acoes, a).toContain(a);
    }
    expect(JSON.stringify(rows)).not.toContain("Equipe de marketing sem visão de receita");
  });

  it("checklist de ativação reflete objetivo e campanha reais", async () => {
    const c = await getActivationChecklist({ uow, facts: activationFactsReader }, await ctx(LEITOR, TS));
    const estado = (k: string) => c.steps.find((s) => s.key === k)!.state;
    expect(estado("brand_published")).toBe("done");
    expect(estado("objective_defined")).toBe("done");
    expect(estado("campaign_created")).toBe("done");
    expect(estado("team_invited")).toBe("done"); // há mais de uma pessoa ativa
    expect(c).toMatchObject({ done: 4, total: 4, complete: true, next: null });
    const vazio = await getActivationChecklist({ uow, facts: activationFactsReader }, await ctx(DONO_T, TT));
    expect(vazio).toMatchObject({ done: 0, complete: false });
  });
});
