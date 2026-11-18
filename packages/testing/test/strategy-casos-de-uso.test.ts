// I-04 S2 — casos de uso de campanha com fakes. Persistência, RLS e FK composta ficam para a S3 (banco local).
import { describe, it, expect } from "vitest";
import { criarStrategyDeps, contextoDeEstrategia as contexto } from "../src/strategy.ts";
import {
  listCampaigns, getCampaign, createCampaignDraft, saveCampaignDraft, activateCampaign, cancelCampaign,
  pauseCampaign, resumeCampaign, completeCampaign, campanhaVazia,
} from "../../core/src/application/use-cases/strategy.ts";
import type { CampaignContent, Objective } from "../../core/src/domain/strategy.ts";
import type { TenantId, ObjectiveId, ProductKey, UserId } from "@oplyra/core";

const objetivo = (tenantId: TenantId, id: ObjectiveId): Objective => ({
  id, tenantId, name: "Gerar demanda", description: "", periodStart: "2026-11-01", periodEnd: "2026-12-31",
  kpis: [{ key: "reunioes", name: "Reuniões", metric: "reuniões marcadas", unit: "reuniões", target: 20 }],
  status: "active", primary: false, revision: 1, createdBy: "u0000001-0000-4000-8000-000000000001" as UserId,
  createdAt: new Date("2026-11-01T00:00:00Z"),
});

const TA = "11111111-1111-4111-8111-111111111111" as TenantId;
const TB = "22222222-2222-4222-8222-222222222222" as TenantId;
const OBJ_A = "f0000001-0000-4000-8000-000000000001" as ObjectiveId;
const OBJ_B = "f0000002-0000-4000-8000-000000000002" as ObjectiveId;
const PK = "c0000001-0000-4000-8000-000000000001" as ProductKey;

const gestor = contexto({ tenantId: TA, roleKey: "marketing_manager" });
const leitor = contexto({ tenantId: TA, roleKey: "viewer" });
const gestorB = contexto({ tenantId: TB, roleKey: "marketing_manager" });

const completa = (over: Partial<CampaignContent> = {}): CampaignContent => ({
  name: "Lançamento do módulo de relatórios", objectiveId: null, productKey: null,
  method: {
    situation: "S", pain: "D", consequence: "C", desire: "E", mechanism: "M", proof: "P", offer: "O",
  },
  trackingKey: "lancamento-relatorios", ...over,
});

function ambiente() {
  const deps = criarStrategyDeps();
  deps.estado.objetivos.push(objetivo(TA, OBJ_A), objetivo(TB, OBJ_B));
  deps.estado.marcas.set(TA, { products: [{ productKey: PK, name: "P", description: "", availability: "available" }] });
  return deps;
}

describe("permissões", () => {
  it("leitura exige strategy.read; escrita exige strategy.write", async () => {
    const deps = ambiente();
    await expect(createCampaignDraft(deps, { ctx: leitor, content: completa() })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    const criada = await createCampaignDraft(deps, { ctx: gestor, content: completa() });
    await expect(listCampaigns(deps, leitor)).resolves.toHaveLength(1);
    await expect(getCampaign(deps, leitor, criada.id)).resolves.toMatchObject({ id: criada.id });
    for (const f of [
      () => saveCampaignDraft(deps, { ctx: leitor, campaignId: criada.id, expectedRevision: 1, content: completa() }),
      () => activateCampaign(deps, { ctx: leitor, campaignId: criada.id, expectedRevision: 1 }),
      () => cancelCampaign(deps, { ctx: leitor, campaignId: criada.id, expectedRevision: 1 }),
      () => pauseCampaign(deps, { ctx: leitor, campaignId: criada.id, expectedRevision: 1 }),
      () => resumeCampaign(deps, { ctx: leitor, campaignId: criada.id, expectedRevision: 1 }),
      () => completeCampaign(deps, { ctx: leitor, campaignId: criada.id, expectedRevision: 1 }),
    ]) await expect(f()).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    const semLeitura = { ...leitor, permissions: new Set<never>() };
    await expect(listCampaigns(deps, semLeitura)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    await expect(getCampaign(deps, semLeitura, criada.id)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });
});

describe("rascunho e ativação (TST-30)", () => {
  it("rascunho incompleto é gravado; ativá-lo é recusado listando o que falta", async () => {
    const deps = ambiente();
    const c = await createCampaignDraft(deps, { ctx: gestor, content: { ...campanhaVazia(), name: "Em construção" } });
    expect(c).toMatchObject({ status: "draft", revision: 1 });
    await expect(activateCampaign(deps, { ctx: gestor, campaignId: c.id, expectedRevision: 1 })).rejects.toMatchObject({
      code: "CAMPAIGN_NOT_ACTIVATABLE",
      issues: expect.arrayContaining([expect.objectContaining({ code: "METHOD_ELEMENT_REQUIRED", path: "method.pain" })]),
    });
    expect((await getCampaign(deps, gestor, c.id)).status).toBe("draft");
  });

  it("completa, ativa com data e auditoria; não publica nada", async () => {
    const deps = ambiente();
    const c = await createCampaignDraft(deps, { ctx: gestor, content: completa() });
    const ativa = await activateCampaign(deps, { ctx: gestor, campaignId: c.id, expectedRevision: 1 });
    expect(ativa).toMatchObject({ status: "active", revision: 2, activatedAt: deps.estado.agora });
    expect(deps.estado.auditoria.map((a) => a.action)).toEqual(["campaign.create", "campaign.activate"]);
    expect(deps.estado.auditoria[1]).toMatchObject({ tenantId: TA, actorId: gestor.userId, before: { status: "draft" }, after: { status: "active" } });
  });

  it("campanha ativa é imutável; a chave nunca muda depois da ativação", async () => {
    const deps = ambiente();
    const c = await createCampaignDraft(deps, { ctx: gestor, content: completa() });
    const ativa = await activateCampaign(deps, { ctx: gestor, campaignId: c.id, expectedRevision: 1 });
    await expect(saveCampaignDraft(deps, { ctx: gestor, campaignId: c.id, expectedRevision: ativa.revision, content: completa({ trackingKey: "outra-chave" }) }))
      .rejects.toMatchObject({ code: "CAMPAIGN_TRACKING_KEY_IMMUTABLE" });
    await expect(saveCampaignDraft(deps, { ctx: gestor, campaignId: c.id, expectedRevision: ativa.revision, content: completa({ name: "Outro nome" }) }))
      .rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    expect((await getCampaign(deps, gestor, c.id)).trackingKey).toBe("lancamento-relatorios");
  });

  it("a chave muda livremente enquanto é rascunho", async () => {
    const deps = ambiente();
    const c = await createCampaignDraft(deps, { ctx: gestor, content: completa() });
    const salva = await saveCampaignDraft(deps, { ctx: gestor, campaignId: c.id, expectedRevision: 1, content: completa({ trackingKey: "nova-chave" }) });
    expect(salva).toMatchObject({ trackingKey: "nova-chave", revision: 2 });
  });

  it("concorrência otimista: revisão desatualizada é recusada", async () => {
    const deps = ambiente();
    const c = await createCampaignDraft(deps, { ctx: gestor, content: completa() });
    await saveCampaignDraft(deps, { ctx: gestor, campaignId: c.id, expectedRevision: 1, content: completa() });
    await expect(saveCampaignDraft(deps, { ctx: gestor, campaignId: c.id, expectedRevision: 1, content: completa() }))
      .rejects.toMatchObject({ code: "CONFLICT_VERSION" });
    await expect(activateCampaign(deps, { ctx: gestor, campaignId: c.id, expectedRevision: 1 })).rejects.toMatchObject({ code: "CONFLICT_VERSION" });
  });

  it("conteúdo estruturalmente inválido não chega ao repositório", async () => {
    const deps = ambiente();
    await expect(createCampaignDraft(deps, { ctx: gestor, content: completa({ trackingKey: "Chave Inválida" }) }))
      .rejects.toMatchObject({ code: "CAMPAIGN_CONTENT_INVALID" });
    expect(deps.estado.campanhas).toHaveLength(0);
    expect(deps.estado.auditoria).toHaveLength(0);
  });
});

describe("ciclo de vida (14 §5: Planejada · Ativa · Pausada · Concluída · Cancelada)", () => {
  it("rascunho pode ser cancelado; ativa pausa, retoma e conclui; terminais não voltam", async () => {
    const deps = ambiente();
    const a = await createCampaignDraft(deps, { ctx: gestor, content: completa() });
    const b = await createCampaignDraft(deps, { ctx: gestor, content: completa({ trackingKey: "segunda" }) });
    await expect(cancelCampaign(deps, { ctx: gestor, campaignId: a.id, expectedRevision: 1 })).resolves.toMatchObject({ status: "cancelled" });
    let c = await activateCampaign(deps, { ctx: gestor, campaignId: b.id, expectedRevision: 1 });
    c = await pauseCampaign(deps, { ctx: gestor, campaignId: b.id, expectedRevision: c.revision });
    expect(c.status).toBe("paused");
    c = await resumeCampaign(deps, { ctx: gestor, campaignId: b.id, expectedRevision: c.revision });
    expect(c).toMatchObject({ status: "active", activatedAt: deps.estado.agora });
    c = await completeCampaign(deps, { ctx: gestor, campaignId: b.id, expectedRevision: c.revision });
    expect(c.status).toBe("completed");
    for (const f of [
      () => activateCampaign(deps, { ctx: gestor, campaignId: b.id, expectedRevision: c.revision }),
      () => pauseCampaign(deps, { ctx: gestor, campaignId: b.id, expectedRevision: c.revision }),
      () => cancelCampaign(deps, { ctx: gestor, campaignId: b.id, expectedRevision: c.revision }),
    ]) await expect(f()).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  });

  it("transições fora do ciclo são recusadas (planejada não pausa nem conclui; pausada não pausa)", async () => {
    const deps = ambiente();
    const a = await createCampaignDraft(deps, { ctx: gestor, content: completa() });
    for (const f of [pauseCampaign, completeCampaign]) {
      await expect(f(deps, { ctx: gestor, campaignId: a.id, expectedRevision: 1 })).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    }
    const ativa = await activateCampaign(deps, { ctx: gestor, campaignId: a.id, expectedRevision: 1 });
    const pausada = await pauseCampaign(deps, { ctx: gestor, campaignId: a.id, expectedRevision: ativa.revision });
    await expect(pauseCampaign(deps, { ctx: gestor, campaignId: a.id, expectedRevision: pausada.revision })).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  });

  it("pausada continua com a chave fixa e imutável", async () => {
    const deps = ambiente();
    const a = await createCampaignDraft(deps, { ctx: gestor, content: completa() });
    const ativa = await activateCampaign(deps, { ctx: gestor, campaignId: a.id, expectedRevision: 1 });
    const pausada = await pauseCampaign(deps, { ctx: gestor, campaignId: a.id, expectedRevision: ativa.revision });
    await expect(saveCampaignDraft(deps, { ctx: gestor, campaignId: a.id, expectedRevision: pausada.revision, content: completa({ trackingKey: "outra" }) }))
      .rejects.toMatchObject({ code: "CAMPAIGN_TRACKING_KEY_IMMUTABLE" });
  });

  it("a chave de uma campanha cancelada continua reservada", async () => {
    const deps = ambiente();
    const a = await createCampaignDraft(deps, { ctx: gestor, content: completa() });
    await cancelCampaign(deps, { ctx: gestor, campaignId: a.id, expectedRevision: 1 });
    await expect(createCampaignDraft(deps, { ctx: gestor, content: completa() })).rejects.toMatchObject({ code: "CAMPAIGN_TRACKING_KEY_TAKEN" });
  });
});

describe("chave de rastreamento única por empresa (I-CMP)", () => {
  it("colide dentro da empresa, mas não entre empresas", async () => {
    const deps = ambiente();
    await createCampaignDraft(deps, { ctx: gestor, content: completa() });
    await expect(createCampaignDraft(deps, { ctx: gestor, content: completa() })).rejects.toMatchObject({ code: "CAMPAIGN_TRACKING_KEY_TAKEN" });
    await expect(createCampaignDraft(deps, { ctx: gestorB, content: completa() })).resolves.toMatchObject({ tenantId: TB });
  });

  it("rascunhos sem chave não colidem entre si", async () => {
    const deps = ambiente();
    await createCampaignDraft(deps, { ctx: gestor, content: completa({ trackingKey: "" }) });
    await expect(createCampaignDraft(deps, { ctx: gestor, content: completa({ trackingKey: "" }) })).resolves.toBeDefined();
  });

  it("salvar com a chave de outra campanha da empresa é recusado", async () => {
    const deps = ambiente();
    await createCampaignDraft(deps, { ctx: gestor, content: completa({ trackingKey: "primeira" }) });
    const b = await createCampaignDraft(deps, { ctx: gestor, content: completa({ trackingKey: "segunda" }) });
    await expect(saveCampaignDraft(deps, { ctx: gestor, campaignId: b.id, expectedRevision: 1, content: completa({ trackingKey: "primeira" }) }))
      .rejects.toMatchObject({ code: "CAMPAIGN_TRACKING_KEY_TAKEN" });
  });
});

describe("referências da mesma empresa (I-CMP, I-TEN)", () => {
  it("aceita objetivo e produto da própria empresa", async () => {
    const deps = ambiente();
    await expect(createCampaignDraft(deps, { ctx: gestor, content: completa({ objectiveId: OBJ_A, productKey: PK }) })).resolves.toBeDefined();
  });

  it("recusa objetivo de outra empresa com a mesma resposta de objetivo inexistente", async () => {
    const deps = ambiente();
    const deOutra = createCampaignDraft(deps, { ctx: gestor, content: completa({ objectiveId: OBJ_B }) });
    const inexistente = createCampaignDraft(deps, { ctx: gestor, content: completa({ objectiveId: "f0000009-0000-4000-8000-000000000009" as ObjectiveId }) });
    await expect(deOutra).rejects.toMatchObject({ code: "REFERENCE_NOT_FOUND" });
    await expect(inexistente).rejects.toMatchObject({ code: "REFERENCE_NOT_FOUND" });
    expect(deps.estado.campanhas).toHaveLength(0);
  });

  it("recusa produto que não está na marca vigente (inclui empresa sem marca)", async () => {
    const deps = ambiente();
    await expect(createCampaignDraft(deps, { ctx: gestorB, content: completa({ productKey: PK }) })).rejects.toMatchObject({ code: "REFERENCE_NOT_FOUND" });
    await expect(createCampaignDraft(deps, { ctx: gestor, content: completa({ productKey: "c0000009-0000-4000-8000-000000000009" as ProductKey }) }))
      .rejects.toMatchObject({ code: "REFERENCE_NOT_FOUND" });
  });

  it("salvar também confere as referências, e a ativação as reconfere", async () => {
    const deps = ambiente();
    const c = await createCampaignDraft(deps, { ctx: gestor, content: completa({ objectiveId: OBJ_A }) });
    await expect(saveCampaignDraft(deps, { ctx: gestor, campaignId: c.id, expectedRevision: 1, content: completa({ objectiveId: OBJ_B }) }))
      .rejects.toMatchObject({ code: "REFERENCE_NOT_FOUND" });
    deps.estado.objetivos.length = 0; // o objetivo deixou de existir depois do rascunho
    await expect(activateCampaign(deps, { ctx: gestor, campaignId: c.id, expectedRevision: 1 })).rejects.toMatchObject({ code: "REFERENCE_NOT_FOUND" });
  });
});

describe("isolamento entre empresas", () => {
  it("empresa B não lê nem altera campanha de A; não existente e de outra empresa respondem igual", async () => {
    const deps = ambiente();
    const c = await createCampaignDraft(deps, { ctx: gestor, content: completa() });
    await expect(listCampaigns(deps, gestorB)).resolves.toEqual([]);
    await expect(getCampaign(deps, gestorB, c.id)).rejects.toMatchObject({ code: "CAMPAIGN_NOT_FOUND" });
    await expect(saveCampaignDraft(deps, { ctx: gestorB, campaignId: c.id, expectedRevision: 1, content: completa({ trackingKey: "x-y-z" }) }))
      .rejects.toMatchObject({ code: "CAMPAIGN_NOT_FOUND" });
    await expect(activateCampaign(deps, { ctx: gestorB, campaignId: c.id, expectedRevision: 1 })).rejects.toMatchObject({ code: "CAMPAIGN_NOT_FOUND" });
    for (const f of [cancelCampaign, pauseCampaign, completeCampaign, resumeCampaign]) {
      await expect(f(deps, { ctx: gestorB, campaignId: c.id, expectedRevision: 1 })).rejects.toMatchObject({ code: "CAMPAIGN_NOT_FOUND" });
    }
    expect((await getCampaign(deps, gestor, c.id)).status).toBe("draft");
  });
});
