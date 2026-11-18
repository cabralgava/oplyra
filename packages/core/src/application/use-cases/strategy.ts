// Casos de uso de campanha (I-04). Autorização no backend (permissão do AccessContext), transação
// do tenant ativo, auditoria na mesma transação. As regras ficam no domínio.
import type { StrategyDeps } from "../strategy-ports.ts";
import type { AccessContext } from "../../domain/access-context.ts";
import { exigirPermissao } from "../../domain/access-context.ts";
import type { CampaignId } from "../../domain/ids.ts";
import {
  type Campaign, type CampaignContent, type CampaignStatus,
  exigirCampanhaAtivavel, exigirCampanhaValida, exigirChaveEstavel, metodoVazio, transicaoPermitida,
} from "../../domain/strategy.ts";
import { CampaignNotFound } from "../../domain/strategy-errors.ts";
import { InvalidStateTransition, ReferenceNotFound } from "../../domain/errors.ts";
import type { Tx } from "../ports.ts";

export const campanhaVazia = (): CampaignContent => ({
  name: "", objectiveId: null, productKey: null, method: metodoVazio(), trackingKey: "",
});

/**
 * I-CMP: a campanha só referencia objetivo e produto da MESMA empresa. O produto é conferido
 * contra a marca vigente; sem marca vigente, nenhuma campanha pode apontar produto.
 */
async function exigirReferenciasDaEmpresa(deps: StrategyDeps, tx: Tx, ctx: AccessContext, c: CampaignContent): Promise<void> {
  if (c.objectiveId !== null && !(await deps.objectives.exists(tx, ctx.tenantId, c.objectiveId))) throw new ReferenceNotFound();
  if (c.productKey !== null) {
    const marca = await deps.brand.findCurrent(tx, ctx.tenantId);
    if (!marca?.products.some((p) => p.productKey === c.productKey)) throw new ReferenceNotFound();
  }
}

export async function listCampaigns(deps: StrategyDeps, ctx: AccessContext): Promise<Campaign[]> {
  exigirPermissao(ctx, "strategy.read");
  return deps.uow.withUserTransaction(ctx, (tx) => deps.campaigns.list(tx, ctx.tenantId));
}

export async function getCampaign(deps: StrategyDeps, ctx: AccessContext, id: CampaignId): Promise<Campaign> {
  exigirPermissao(ctx, "strategy.read");
  return deps.uow.withUserTransaction(ctx, async (tx) => {
    const c = await deps.campaigns.findById(tx, ctx.tenantId, id);
    if (!c) throw new CampaignNotFound();
    return c;
  });
}

/** Cria a campanha como rascunho, possivelmente incompleto: o método só é cobrado na ativação. */
export async function createCampaignDraft(
  deps: StrategyDeps, { ctx, content }: { ctx: AccessContext; content: CampaignContent },
): Promise<Campaign> {
  exigirPermissao(ctx, "strategy.write");
  exigirCampanhaValida(content);
  return deps.uow.withUserTransaction(ctx, async (tx) => {
    await exigirReferenciasDaEmpresa(deps, tx, ctx, content);
    const criada = await deps.campaigns.create(tx, { tenantId: ctx.tenantId, content, createdBy: ctx.userId });
    await deps.audit.record(tx, {
      tenantId: ctx.tenantId, actorType: "user", actorId: ctx.userId, action: "campaign.create",
      target: criada.id, after: { status: criada.status, trackingKey: criada.trackingKey },
    });
    return criada;
  });
}

export async function saveCampaignDraft(
  deps: StrategyDeps,
  { ctx, campaignId, expectedRevision, content }: {
    ctx: AccessContext; campaignId: CampaignId; expectedRevision: number; content: CampaignContent;
  },
): Promise<Campaign> {
  exigirPermissao(ctx, "strategy.write");
  exigirCampanhaValida(content);
  return deps.uow.withUserTransaction(ctx, async (tx) => {
    const atual = await deps.campaigns.findById(tx, ctx.tenantId, campaignId);
    if (!atual) throw new CampaignNotFound();
    // Só o rascunho é editável. Reforça a imutabilidade da chave antes de qualquer gravação.
    exigirChaveEstavel(atual, content.trackingKey);
    if (atual.status !== "draft") throw new InvalidStateTransition("somente o rascunho da campanha pode ser editado");
    await exigirReferenciasDaEmpresa(deps, tx, ctx, content);
    const salva = await deps.campaigns.replaceDraftContent(tx, { tenantId: ctx.tenantId, id: campaignId, expectedRevision, content });
    await deps.audit.record(tx, {
      tenantId: ctx.tenantId, actorType: "user", actorId: ctx.userId, action: "campaign.save",
      target: campaignId, after: { revision: salva.revision },
    });
    return salva;
  });
}

async function mudarEstado(
  deps: StrategyDeps,
  { ctx, campaignId, expectedRevision, para, acao }: {
    ctx: AccessContext; campaignId: CampaignId; expectedRevision: number; para: CampaignStatus; acao: string;
  },
): Promise<Campaign> {
  exigirPermissao(ctx, "strategy.write");
  return deps.uow.withUserTransaction(ctx, async (tx) => {
    const atual = await deps.campaigns.findById(tx, ctx.tenantId, campaignId);
    if (!atual) throw new CampaignNotFound();
    if (!transicaoPermitida(atual.status, para)) throw new InvalidStateTransition();
    if (para === "active") {
      // Vale também para retomar uma campanha pausada: conferir de novo é barato e seguro.
      exigirCampanhaAtivavel(atual);
      // O produto/objetivo podem ter deixado de existir desde o rascunho: confere de novo.
      await exigirReferenciasDaEmpresa(deps, tx, ctx, atual);
    }
    const nova = await deps.campaigns.transition(tx, {
      tenantId: ctx.tenantId, id: campaignId, expectedRevision, from: atual.status, to: para, at: deps.clock.now(),
    });
    await deps.audit.record(tx, {
      tenantId: ctx.tenantId, actorType: "user", actorId: ctx.userId, action: acao,
      target: campaignId, before: { status: atual.status }, after: { status: nova.status },
    });
    return nova;
  });
}

/** Ativa a campanha: método completo e chave de rastreamento (TST-30). Não publica anúncio. */
export const activateCampaign = (
  deps: StrategyDeps, e: { ctx: AccessContext; campaignId: CampaignId; expectedRevision: number },
): Promise<Campaign> => mudarEstado(deps, { ...e, para: "active", acao: "campaign.activate" });

type MudancaDeCampanha = { ctx: AccessContext; campaignId: CampaignId; expectedRevision: number };

export const pauseCampaign = (deps: StrategyDeps, e: MudancaDeCampanha): Promise<Campaign> =>
  mudarEstado(deps, { ...e, para: "paused", acao: "campaign.pause" });
/** Retoma uma campanha pausada (paused → active). */
export const resumeCampaign = (deps: StrategyDeps, e: MudancaDeCampanha): Promise<Campaign> =>
  mudarEstado(deps, { ...e, para: "active", acao: "campaign.resume" });
export const completeCampaign = (deps: StrategyDeps, e: MudancaDeCampanha): Promise<Campaign> =>
  mudarEstado(deps, { ...e, para: "completed", acao: "campaign.complete" });
export const cancelCampaign = (deps: StrategyDeps, e: MudancaDeCampanha): Promise<Campaign> =>
  mudarEstado(deps, { ...e, para: "cancelled", acao: "campaign.cancel" });
