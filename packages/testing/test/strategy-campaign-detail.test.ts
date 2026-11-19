// Complementos do contrato já consumido pelo detalhe oficial de campanha.
// Fakes verificam os casos de uso; não substituem banco, sessão ou aceite hospedado.
import { describe, expect, it, vi } from "vitest";
import { criarStrategyDeps, contextoDeEstrategia } from "../src/strategy.ts";
import {
  activateCampaign, cancelCampaign, completeCampaign, createCampaignDraft,
  getCampaign, pauseCampaign, resumeCampaign,
} from "../../core/src/application/use-cases/strategy.ts";
import { createObjective } from "../../core/src/application/use-cases/strategy-objectives.ts";
import type { CampaignContent } from "../../core/src/domain/strategy.ts";
import type { ProductKey, TenantId } from "@oplyra/core";

const tenantId = "11111111-1111-4111-8111-111111111111" as TenantId;
const owner = contextoDeEstrategia({ tenantId, roleKey: "owner" });
const productKey = "c0000001-0000-4000-8000-000000000001" as ProductKey;
const conteudo = (over: Partial<CampaignContent> = {}): CampaignContent => ({
  name: "Campanha com operação rastreável", objectiveId: null, productKey: null,
  trackingKey: "campanha-detalhe",
  method: { situation: "S", pain: "D", consequence: "C", desire: "E", mechanism: "M", proof: "P", offer: "O" },
  ...over,
});

async function ativar(deps: ReturnType<typeof criarStrategyDeps>, content = conteudo()) {
  const draft = await createCampaignDraft(deps, { ctx: owner, content });
  return activateCampaign(deps, { ctx: owner, campaignId: draft.id, expectedRevision: draft.revision });
}

describe("detalhe da campanha — retomada e referências vigentes", () => {
  it("retomar reconfere o objetivo e preserva estado, revisão e auditoria quando ele deixou de existir", async () => {
    const deps = criarStrategyDeps();
    const objective = await createObjective(deps, {
      ctx: owner, content: {
        name: "Gerar demanda", description: "", periodStart: "2026-11-01", periodEnd: "2026-12-31",
        kpis: [{ key: "reunioes", name: "Reuniões", metric: "reuniões marcadas", unit: "reuniões", target: 20 }],
      },
    });
    const active = await ativar(deps, conteudo({ objectiveId: objective.id }));
    const paused = await pauseCampaign(deps, { ctx: owner, campaignId: active.id, expectedRevision: active.revision });
    const auditBefore = [...deps.estado.auditoria];
    const transition = vi.spyOn(deps.campaigns, "transition");
    deps.estado.objetivos = []; // Somente a referência sintética desta fixture deixa de existir.

    await expect(resumeCampaign(deps, { ctx: owner, campaignId: paused.id, expectedRevision: paused.revision }))
      .rejects.toMatchObject({ code: "REFERENCE_NOT_FOUND" });
    expect(transition).not.toHaveBeenCalled();
    expect(await getCampaign(deps, owner, paused.id)).toEqual(paused);
    expect(deps.estado.auditoria).toEqual(auditBefore);
  });

  it("retomar reconfere o produto na marca agora vigente, não a marca da ativação anterior", async () => {
    const deps = criarStrategyDeps();
    deps.estado.marcas.set(tenantId, { products: [{ productKey, name: "Produto inicial", description: "", availability: "available" }] });
    const active = await ativar(deps, conteudo({ productKey }));
    const paused = await pauseCampaign(deps, { ctx: owner, campaignId: active.id, expectedRevision: active.revision });
    const auditBefore = [...deps.estado.auditoria];
    const transition = vi.spyOn(deps.campaigns, "transition");
    deps.estado.marcas.set(tenantId, { products: [] }); // A nova marca não contém o produto.

    await expect(resumeCampaign(deps, { ctx: owner, campaignId: paused.id, expectedRevision: paused.revision }))
      .rejects.toMatchObject({ code: "REFERENCE_NOT_FOUND" });
    expect(transition).not.toHaveBeenCalled();
    expect(await getCampaign(deps, owner, paused.id)).toEqual(paused);
    expect(deps.estado.auditoria).toEqual(auditBefore);
  });
});

describe("detalhe da campanha — formulário de uma revisão anterior", () => {
  it.each([
    { name: "pausar", action: pauseCampaign },
    { name: "concluir", action: completeCampaign },
    { name: "cancelar", action: cancelCampaign },
  ])("$name com revisão antiga mantém a leitura atual e não registra sucesso", async ({ action }) => {
    const deps = criarStrategyDeps();
    const active = await ativar(deps);
    const auditBefore = [...deps.estado.auditoria];

    await expect(action(deps, { ctx: owner, campaignId: active.id, expectedRevision: active.revision - 1 }))
      .rejects.toMatchObject({ code: "CONFLICT_VERSION" });
    expect(await getCampaign(deps, owner, active.id)).toEqual(active);
    expect(deps.estado.auditoria).toEqual(auditBefore);
  });
});

describe("detalhe da campanha — data da primeira ativação", () => {
  it("pausa e retomada posteriores não trocam a primeira ativação pela data de retomada", async () => {
    const deps = criarStrategyDeps();
    const firstActivationAt = new Date("2026-11-11T12:00:00Z");
    deps.estado.agora = firstActivationAt;
    const active = await ativar(deps);
    deps.estado.agora = new Date("2026-11-12T12:00:00Z");
    const paused = await pauseCampaign(deps, { ctx: owner, campaignId: active.id, expectedRevision: active.revision });
    deps.estado.agora = new Date("2026-11-13T12:00:00Z");
    const resumed = await resumeCampaign(deps, { ctx: owner, campaignId: paused.id, expectedRevision: paused.revision });

    const read = await getCampaign(deps, owner, resumed.id);
    expect(read).toMatchObject({
      status: "active", revision: paused.revision + 1, activatedAt: firstActivationAt,
      createdAt: active.createdAt, trackingKey: active.trackingKey, method: active.method,
    });
    expect(read.activatedAt).not.toEqual(deps.estado.agora);
    expect(deps.estado.auditoria.at(-1)).toMatchObject({
      tenantId, actorId: owner.userId, action: "campaign.resume", target: active.id,
      before: { status: "paused" }, after: { status: "active" },
    });
  });
});
