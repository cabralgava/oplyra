import { describe, it, expect } from "vitest";
import { criarStrategyDeps, contextoDeEstrategia as contexto, semearMarcaPublicada, planoBase, metodoCompleto } from "@oplyra/testing/strategy";
import {
  createObjective, archiveObjective, listObjectives, createPersona, archivePersona, listPersonas,
  createCampaign, updateCampaign, regenerateTrackingKey, changeCampaignStatus, listCampaigns, getCampaign,
  createExperiment, changeExperimentStatus,
  gerarChaveDeRastreamento, montarUtms, FORMATO_DA_CHAVE, transicaoDeCampanhaValida, problemasDeAtivacao, problemasDeObjetivo,
  problemasDeTeste, metodoVazio, CANAIS,
} from "@oplyra/core/strategy";
import type { ObjectiveContent, CampaignPlan } from "@oplyra/core/strategy";
import type { TenantId } from "@oplyra/core";

const TA = "11111111-1111-4111-8111-111111111111" as TenantId;
const TB = "22222222-2222-4222-8222-222222222222" as TenantId;
const dono = contexto({ tenantId: TA, roleKey: "owner" });
const gestor = contexto({ tenantId: TA, roleKey: "marketing_manager" });
const leitor = contexto({ tenantId: TA, roleKey: "viewer" });

const objetivo = (over: Partial<ObjectiveContent> = {}): ObjectiveContent => ({
  nome: "Gerar demanda qualificada", descricao: "", periodo: { inicio: "2026-11-01", fim: "2026-12-31" },
  kpis: [{ nome: "Leads qualificados", unidade: "leads", alvo: 120 }], ...over,
});

async function cenario(opcoes: Parameters<typeof semearMarcaPublicada>[2] = {}) {
  const deps = criarStrategyDeps();
  const marca = semearMarcaPublicada(deps, TA, opcoes);
  const obj = await createObjective(deps, { ctx: dono, content: objetivo() });
  return { deps, marca, obj, plano: (over: Partial<CampaignPlan> = {}) => planoBase(obj.id, marca.productKey, over) };
}

describe("permissões (D-6)", () => {
  it("leitor lê; só quem tem strategy.write cria; só quem tem campaign.activate muda o estado", async () => {
    const { deps, plano } = await cenario();
    await expect(createObjective(deps, { ctx: leitor, content: objetivo() })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    await expect(listObjectives(deps, leitor)).resolves.toHaveLength(1);
    const c = await createCampaign(deps, { ctx: gestor, plan: plano() });
    await expect(changeCampaignStatus(deps, { ctx: leitor, id: c.id, to: "active" })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    const semAtivar = { ...gestor, permissions: new Set(["strategy.read", "strategy.write"] as const) };
    await expect(changeCampaignStatus(deps, { ctx: semAtivar as never, id: c.id, to: "active" })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });
});

describe("objetivos e indicadores (S1)", () => {
  it("cria com indicadores, lista, arquiva e deixa de listar arquivados", async () => {
    const deps = criarStrategyDeps();
    const o = await createObjective(deps, { ctx: dono, content: objetivo() });
    expect(o).toMatchObject({ status: "active", kpis: [{ nome: "Leads qualificados", alvo: 120 }] });
    expect(deps.estado.objetivos).toHaveLength(1);
    await archiveObjective(deps, { ctx: dono, id: o.id });
    expect(await listObjectives(deps, dono)).toHaveLength(0);
    expect(await listObjectives(deps, dono, { includeArchived: true })).toHaveLength(1);
  });

  it("devolve todas as violações: nome, período invertido, indicador inválido", async () => {
    const deps = criarStrategyDeps();
    const falha = await createObjective(deps, {
      ctx: dono, content: objetivo({ nome: " ", periodo: { inicio: "2026-12-31", fim: "2026-11-01" }, kpis: [{ nome: "", unidade: "x", alvo: -1 }] }),
    }).catch((e) => e);
    expect(falha).toMatchObject({ code: "STRATEGY_CONTENT_INVALID" });
    expect(falha.issues.map((i: { code: string }) => i.code).sort()).toEqual(["KPI_NAME_REQUIRED", "KPI_TARGET_INVALID", "NAME_REQUIRED", "PERIOD_ORDER"]);
  });

  it("datas impossíveis e formatos errados são recusados", () => {
    const codigos = (p: { inicio: string; fim: string }) => problemasDeObjetivo(objetivo({ periodo: p })).map((i) => i.code);
    expect(codigos({ inicio: "2026-02-30", fim: "2026-03-01" })).toContain("PERIOD_START_INVALID");
    expect(codigos({ inicio: "01/11/2026", fim: "2026-12-31" })).toContain("PERIOD_START_INVALID");
    expect(codigos({ inicio: "2026-11-01", fim: "2026-11-01" })).toEqual([]);
  });

  it("objetivo de outra empresa não é encontrado", async () => {
    const { deps } = await cenario();
    const outro = contexto({ tenantId: TB, roleKey: "owner" });
    const alheio = await createObjective(deps, { ctx: outro, content: objetivo() });
    await expect(archiveObjective(deps, { ctx: dono, id: alheio.id })).rejects.toMatchObject({ code: "OBJECTIVE_NOT_FOUND" });
  });
});

describe("personas", () => {
  it("cria e arquiva; nome é obrigatório", async () => {
    const deps = criarStrategyDeps();
    await expect(createPersona(deps, { ctx: dono, content: { nome: "", descricao: "", dores: "", objecoes: "" } })).rejects.toMatchObject({ code: "STRATEGY_CONTENT_INVALID" });
    const p = await createPersona(deps, { ctx: dono, content: { nome: "Gerente de marketing", descricao: "SaaS B2B", dores: "Relatórios manuais", objecoes: "Custo" } });
    await archivePersona(deps, { ctx: dono, id: p.id });
    expect(await listPersonas(deps, dono)).toHaveLength(0);
  });
});

describe("campanhas (S2): referências, chave e método", () => {
  it("cria planejada com a chave gerada, a versão da marca fixada e auditoria", async () => {
    const { deps, marca, plano } = await cenario();
    const c = await createCampaign(deps, { ctx: gestor, plan: plano() });
    expect(c).toMatchObject({ status: "planned", brandVersionId: marca.brandVersionId, revision: 1, activatedAt: null });
    expect(c.chave).toMatch(FORMATO_DA_CHAVE);
    expect(c.chave.startsWith("cmp-lancamento-plataforma-pro-")).toBe(true);
    expect(deps.marca.estado.auditoria.at(-1)).toMatchObject({ action: "strategy.campaign.create", target: c.id });
  });

  it("exige marca publicada, produto da versão vigente, objetivo e persona ativos e da mesma empresa", async () => {
    const deps = criarStrategyDeps();
    const obj = await createObjective(deps, { ctx: dono, content: objetivo() });
    const semMarca = planoBase(obj.id, "c0000001-0000-4000-8000-000000000001" as never);
    await expect(createCampaign(deps, { ctx: dono, plan: semMarca })).rejects.toMatchObject({ code: "NO_PUBLISHED_BRAND" });

    const marca = semearMarcaPublicada(deps, TA);
    await expect(createCampaign(deps, { ctx: dono, plan: planoBase(obj.id, "c0000001-0000-4000-8000-0000000000ff" as never) })).rejects.toMatchObject({ code: "PRODUCT_NOT_IN_CURRENT_BRAND" });

    const alheio = await createObjective(deps, { ctx: contexto({ tenantId: TB, roleKey: "owner" }), content: objetivo() });
    await expect(createCampaign(deps, { ctx: dono, plan: planoBase(alheio.id, marca.productKey) })).rejects.toMatchObject({ code: "OBJECTIVE_NOT_FOUND" });

    await archiveObjective(deps, { ctx: dono, id: obj.id });
    await expect(createCampaign(deps, { ctx: dono, plan: planoBase(obj.id, marca.productKey) })).rejects.toMatchObject({ code: "OBJECTIVE_ARCHIVED" });

    const ativo = await createObjective(deps, { ctx: dono, content: objetivo() });
    const persona = await createPersona(deps, { ctx: dono, content: { nome: "P", descricao: "", dores: "", objecoes: "" } });
    await archivePersona(deps, { ctx: dono, id: persona.id });
    await expect(createCampaign(deps, { ctx: dono, plan: planoBase(ativo.id, marca.productKey, { personaId: persona.id }) })).rejects.toMatchObject({ code: "PERSONA_ARCHIVED" });
  });

  it("pode ser criada incompleta (método vazio), mas só ativa com o método completo (TST-30)", async () => {
    const { deps, plano } = await cenario();
    const c = await createCampaign(deps, { ctx: dono, plan: plano({ metodo: { ...metodoVazio(), situacao: "Só a situação" } }) });
    const falha = await changeCampaignStatus(deps, { ctx: dono, id: c.id, to: "active" }).catch((e) => e);
    expect(falha).toMatchObject({ code: "CAMPAIGN_NOT_ACTIVATABLE" });
    expect(falha.issues.map((i: { path: string }) => i.path).sort()).toEqual(
      ["metodo.consequencia", "metodo.desejo", "metodo.dor", "metodo.mecanismo", "metodo.oferta", "metodo.prova"]);
    expect((await getCampaign(deps, dono, c.id)).campaign.status).toBe("planned");
  });

  it("cada campo do método sozinho em branco impede a ativação", () => {
    const base = planoBase("o" as never, "p" as never);
    for (const campo of Object.keys(metodoCompleto()) as (keyof ReturnType<typeof metodoCompleto>)[]) {
      const p = { ...base, metodo: { ...base.metodo, [campo]: "   " } };
      expect(problemasDeAtivacao(p).map((i) => i.path), campo).toEqual([`metodo.${campo}`]);
    }
    expect(problemasDeAtivacao(base)).toEqual([]);
  });

  it("produto future bloqueia a ativação (D-7), mas não a criação do rascunho", async () => {
    const { deps, plano } = await cenario({ disponibilidade: "future" });
    const c = await createCampaign(deps, { ctx: dono, plan: plano() });
    await expect(changeCampaignStatus(deps, { ctx: dono, id: c.id, to: "active" }))
      .rejects.toMatchObject({ code: "CAMPAIGN_NOT_ACTIVATABLE", issues: [{ code: "PRODUCT_NOT_AVAILABLE" }] });
  });

  it("a chave é única por empresa e é regenerável enquanto a campanha nunca foi ativada", async () => {
    const { deps, plano } = await cenario();
    const c = await createCampaign(deps, { ctx: dono, plan: plano() });
    const nova = await regenerateTrackingKey(deps, { ctx: dono, id: c.id, expectedRevision: 1 });
    expect(nova.chave).not.toBe(c.chave);
    expect(nova.revision).toBe(2);
    await expect(regenerateTrackingKey(deps, { ctx: dono, id: c.id, expectedRevision: 1 })).rejects.toMatchObject({ code: "CONFLICT_VERSION" });
  });

  it("colisão de sufixo é refeita; se persistir, a falha é TRACKING_KEY_TAKEN", async () => {
    const { deps, plano } = await cenario();
    const fixar = (...sufixos: string[]) => {
      let i = 0;
      (deps as { ids: { uuid(): string } }).ids = { uuid: () => `00000000-0000-4000-8000-00000000${sufixos[Math.min(i++, sufixos.length - 1)]}` };
    };
    fixar("aaaa");
    const a = await createCampaign(deps, { ctx: dono, plan: plano() });
    expect(a.chave.endsWith("-aaaa")).toBe(true);
    fixar("aaaa", "bbbb");
    const b = await createCampaign(deps, { ctx: dono, plan: plano() });
    expect(b.chave.endsWith("-bbbb")).toBe(true);
    fixar("aaaa");
    await expect(createCampaign(deps, { ctx: dono, plan: plano() })).rejects.toMatchObject({ code: "TRACKING_KEY_TAKEN" });
    // a regeneração também refaz a tentativa
    fixar("aaaa", "cccc");
    expect((await regenerateTrackingKey(deps, { ctx: dono, id: b.id, expectedRevision: 1 })).chave.endsWith("-cccc")).toBe(true);
  });

  it("depois de ativada, a chave é imutável: nem pausar nem retomar a libera", async () => {
    const { deps, plano } = await cenario();
    const c = await createCampaign(deps, { ctx: dono, plan: plano() });
    const ativa = await changeCampaignStatus(deps, { ctx: dono, id: c.id, to: "active" });
    expect(ativa).toMatchObject({ status: "active", activatedAt: deps.marca.estado.agora, chave: c.chave });
    await changeCampaignStatus(deps, { ctx: dono, id: c.id, to: "paused" });
    await expect(regenerateTrackingKey(deps, { ctx: dono, id: c.id, expectedRevision: 1 })).rejects.toMatchObject({ code: "TRACKING_KEY_LOCKED" });
    deps.marca.estado.agora = new Date("2026-10-05T12:00:00Z"); // o relógio avança: a primeira ativação não pode ser reescrita
    const retomada = await changeCampaignStatus(deps, { ctx: dono, id: c.id, to: "active" });
    expect(retomada.chave).toBe(c.chave);
    expect(retomada.activatedAt).toEqual(ativa.activatedAt); // a primeira ativação não é reescrita
  });

  it("só campanha planejada é editável; a edição segue a revisão", async () => {
    const { deps, plano } = await cenario();
    const c = await createCampaign(deps, { ctx: dono, plan: plano() });
    const editada = await updateCampaign(deps, { ctx: dono, id: c.id, expectedRevision: 1, plan: plano({ mensagemChave: "Nova mensagem" }) });
    expect(editada).toMatchObject({ mensagemChave: "Nova mensagem", revision: 2, chave: c.chave });
    await expect(updateCampaign(deps, { ctx: dono, id: c.id, expectedRevision: 1, plan: plano() })).rejects.toMatchObject({ code: "CONFLICT_VERSION" });
    await changeCampaignStatus(deps, { ctx: dono, id: c.id, to: "active" });
    await expect(updateCampaign(deps, { ctx: dono, id: c.id, expectedRevision: 2, plan: plano() })).rejects.toMatchObject({ code: "CAMPAIGN_LOCKED" });
  });

  it("campanha de outra empresa não é encontrada", async () => {
    const { deps, plano } = await cenario();
    const c = await createCampaign(deps, { ctx: dono, plan: plano() });
    const outro = contexto({ tenantId: TB, roleKey: "owner" });
    await expect(getCampaign(deps, outro, c.id)).rejects.toMatchObject({ code: "CAMPAIGN_NOT_FOUND" });
    await expect(changeCampaignStatus(deps, { ctx: outro, id: c.id, to: "cancelled" })).rejects.toMatchObject({ code: "CAMPAIGN_NOT_FOUND" });
    expect(await listCampaigns(deps, outro)).toEqual([]);
  });

  it("validação estrutural: período, orçamento e limites", async () => {
    const { deps, plano } = await cenario();
    const falha = await createCampaign(deps, {
      ctx: dono, plan: plano({ periodo: { inicio: "2026-12-31", fim: "2026-11-01" }, orcamento: { centavos: -5, moeda: "BRL" }, mensagemChave: "x".repeat(501) }),
    }).catch((e) => e);
    expect(falha.issues.map((i: { code: string }) => i.code).sort()).toEqual(["BUDGET_INVALID", "PERIOD_ORDER", "TEXT_TOO_LONG"]);
  });
});

describe("estados da campanha (14 §5)", () => {
  it("matriz de transições", () => {
    const ok = [["planned", "active"], ["planned", "cancelled"], ["active", "paused"], ["active", "completed"], ["active", "cancelled"], ["paused", "active"], ["paused", "completed"], ["paused", "cancelled"]];
    const todos = ["planned", "active", "paused", "completed", "cancelled"] as const;
    for (const de of todos) for (const para of todos) {
      expect(transicaoDeCampanhaValida(de, para), `${de}->${para}`).toBe(ok.some(([a, b]) => a === de && b === para));
    }
  });

  it("concluída e cancelada são finais", async () => {
    const { deps, plano } = await cenario();
    const c = await createCampaign(deps, { ctx: dono, plan: plano() });
    await changeCampaignStatus(deps, { ctx: dono, id: c.id, to: "cancelled" });
    await expect(changeCampaignStatus(deps, { ctx: dono, id: c.id, to: "active" })).rejects.toMatchObject({ code: "INVALID_CAMPAIGN_TRANSITION" });
  });

  it("planejada não pode ser pausada nem concluída", async () => {
    const { deps, plano } = await cenario();
    const c = await createCampaign(deps, { ctx: dono, plan: plano() });
    for (const to of ["paused", "completed"] as const) {
      await expect(changeCampaignStatus(deps, { ctx: dono, id: c.id, to })).rejects.toMatchObject({ code: "INVALID_CAMPAIGN_TRANSITION" });
    }
  });
});

describe("chave de rastreamento e UTMs (D-3, D-4)", () => {
  it("gera slug sem acentos e sem PII, com sufixo hexadecimal", () => {
    expect(gerarChaveDeRastreamento("Lançamento: Plataforma Pro!", "a1b2")).toBe("cmp-lancamento-plataforma-pro-a1b2");
    expect(gerarChaveDeRastreamento("!!!", "0000")).toBe("cmp-campanha-0000");
    expect(gerarChaveDeRastreamento("x".repeat(100), "ffff").length).toBeLessThanOrEqual(60);
    expect(() => gerarChaveDeRastreamento("a", "xyz1")).toThrow(TypeError);
    expect(gerarChaveDeRastreamento("Ação de maio", "1234")).toMatch(FORMATO_DA_CHAVE);
  });

  it("monta UTMs pela regra: campanha = chave; origem e meio do canal; conteúdo = versão da entrega", () => {
    const u = montarUtms("cmp-lancamento-a1b2", "meta", "V2 final");
    expect(u).toMatchObject({
      utm_campaign: "cmp-lancamento-a1b2", utm_source: "meta", utm_medium: "paid_social", utm_content: "v2-final",
      regra: "utm-rule/1", conteudoOriginal: "V2 final",
    });
    expect(u.query).toBe("utm_campaign=cmp-lancamento-a1b2&utm_source=meta&utm_medium=paid_social&utm_content=v2-final");
    expect(montarUtms("cmp-x-0000", "email").utm_content).toBe("v1");
    expect(montarUtms("cmp-x-0000", "google", "  ").utm_content).toBe("v1");
    expect(Object.keys(CANAIS).sort()).toEqual(["email", "google", "linkedin", "meta"]);
  });

  it("recusa chave fora do formato e conteúdo com PII ou símbolos vira texto neutro", () => {
    expect(() => montarUtms("qualquer coisa", "meta")).toThrow(TypeError);
    expect(montarUtms("cmp-x-0000", "meta", "a@b.com?x=1&y").utm_content).not.toMatch(/[@?&=]/);
  });
});

describe("testes e hipóteses (S3, I-HYP)", () => {
  it("declara hipótese e dimensão; vira execução e para; auditado", async () => {
    const { deps, plano } = await cenario();
    const c = await createCampaign(deps, { ctx: dono, plan: plano() });
    const t = await createExperiment(deps, { ctx: dono, campaignId: c.id, content: { hipotese: "Um gancho com número aumenta o clique.", dimensao: "hook", notaDaDimensao: "" } });
    expect(t).toMatchObject({ status: "planned", startedAt: null });
    const rodando = await changeExperimentStatus(deps, { ctx: dono, id: t.id, to: "running" });
    expect(rodando).toMatchObject({ status: "running", startedAt: deps.marca.estado.agora });
    await changeExperimentStatus(deps, { ctx: dono, id: t.id, to: "stopped" });
    await expect(changeExperimentStatus(deps, { ctx: dono, id: t.id, to: "running" })).rejects.toMatchObject({ code: "INVALID_EXPERIMENT_TRANSITION" });
    expect((await getCampaign(deps, leitor, c.id)).experiments).toHaveLength(1);
  });

  it("sem hipótese ou sem dimensão não existe; 'outra' exige dizer qual", async () => {
    const { deps, plano } = await cenario();
    const c = await createCampaign(deps, { ctx: dono, plan: plano() });
    const falha = (content: Parameters<typeof createExperiment>[1]["content"]) => createExperiment(deps, { ctx: dono, campaignId: c.id, content }).catch((e) => e);
    expect((await falha({ hipotese: "  ", dimensao: "hook", notaDaDimensao: "" })).issues.map((i: { code: string }) => i.code)).toEqual(["HYPOTHESIS_REQUIRED"]);
    expect((await falha({ hipotese: "H", dimensao: "nenhuma" as never, notaDaDimensao: "" })).issues.map((i: { code: string }) => i.code)).toEqual(["DIMENSION_REQUIRED"]);
    expect((await falha({ hipotese: "H", dimensao: "other", notaDaDimensao: "" })).issues.map((i: { code: string }) => i.code)).toEqual(["DIMENSION_NOTE_REQUIRED"]);
    expect(problemasDeTeste({ hipotese: "H", dimensao: "other", notaDaDimensao: "Preço exibido" })).toEqual([]);
  });

  it("campanha concluída ou cancelada não recebe testes nem inicia os existentes", async () => {
    const { deps, plano } = await cenario();
    const c = await createCampaign(deps, { ctx: dono, plan: plano() });
    const t = await createExperiment(deps, { ctx: dono, campaignId: c.id, content: { hipotese: "H", dimensao: "cta", notaDaDimensao: "" } });
    await changeCampaignStatus(deps, { ctx: dono, id: c.id, to: "cancelled" });
    await expect(createExperiment(deps, { ctx: dono, campaignId: c.id, content: { hipotese: "H2", dimensao: "cta", notaDaDimensao: "" } }))
      .rejects.toMatchObject({ code: "CAMPAIGN_NOT_OPEN_FOR_EXPERIMENTS" });
    await expect(changeExperimentStatus(deps, { ctx: dono, id: t.id, to: "running" })).rejects.toMatchObject({ code: "CAMPAIGN_NOT_OPEN_FOR_EXPERIMENTS" });
  });

  it("teste de outra empresa não é encontrado", async () => {
    const { deps, plano } = await cenario();
    const c = await createCampaign(deps, { ctx: dono, plan: plano() });
    const t = await createExperiment(deps, { ctx: dono, campaignId: c.id, content: { hipotese: "H", dimensao: "angle", notaDaDimensao: "" } });
    await expect(changeExperimentStatus(deps, { ctx: contexto({ tenantId: TB, roleKey: "owner" }), id: t.id, to: "running" })).rejects.toMatchObject({ code: "EXPERIMENT_NOT_FOUND" });
  });
});
