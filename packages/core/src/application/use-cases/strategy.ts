// Casos de uso da Estratégia (I-04). Autorização no backend (permissão do AccessContext), transação do
// tenant ativo, auditoria na mesma transação. As regras ficam no domínio.
import type { StrategyDeps } from "../strategy-ports.ts";
import type { Tx } from "../ports.ts";
import type { AccessContext } from "../../domain/access-context.ts";
import { exigirPermissao } from "../../domain/access-context.ts";
import type { CampaignId, ExperimentId, ObjectiveId, PersonaId } from "../../domain/ids.ts";
import {
  type Campaign, type CampaignPlan, type CampaignStatus, type Experiment, type ExperimentContent, type ExperimentStatus,
  type Objective, type ObjectiveContent, type Persona, type PersonaContent,
  exigirAtivavel, exigirConteudoDeObjetivo, exigirConteudoDePersona, exigirPlanoValido, exigirTesteValido,
  gerarChaveDeRastreamento, transicaoDeCampanhaValida, transicaoDeTesteValida,
} from "../../domain/strategy.ts";
import {
  CampaignNotFound, CampaignNotOpenForExperiments, ExperimentNotFound, InvalidCampaignTransition, InvalidExperimentTransition,
  NoPublishedBrand, ObjectiveArchived, ObjectiveNotFound, PersonaArchived, PersonaNotFound, ProductNotInCurrentBrand,
  TrackingKeyLocked, TrackingKeyTaken,
} from "../../domain/strategy-errors.ts";

/* ------------------------------------------------------------------ objetivos */

export async function listObjectives(deps: StrategyDeps, ctx: AccessContext, opts = { includeArchived: false }): Promise<Objective[]> {
  exigirPermissao(ctx, "strategy.read");
  return deps.uow.withUserTransaction(ctx, (tx) => deps.strategy.listObjectives(tx, ctx.tenantId, opts));
}

export async function createObjective(deps: StrategyDeps, { ctx, content }: { ctx: AccessContext; content: ObjectiveContent }): Promise<Objective> {
  exigirPermissao(ctx, "strategy.write");
  exigirConteudoDeObjetivo(content);
  return deps.uow.withUserTransaction(ctx, async (tx) => {
    const criado = await deps.strategy.insertObjective(tx, { tenantId: ctx.tenantId, content, createdBy: ctx.userId });
    await deps.audit.record(tx, {
      tenantId: ctx.tenantId, actorType: "user", actorId: ctx.userId, action: "strategy.objective.create",
      target: criado.id, after: { kpis: criado.kpis.length },
    });
    return criado;
  });
}

export async function archiveObjective(deps: StrategyDeps, { ctx, id }: { ctx: AccessContext; id: ObjectiveId }): Promise<void> {
  exigirPermissao(ctx, "strategy.write");
  await deps.uow.withUserTransaction(ctx, async (tx) => {
    if (!(await deps.strategy.findObjective(tx, ctx.tenantId, id))) throw new ObjectiveNotFound();
    await deps.strategy.archiveObjective(tx, ctx.tenantId, id);
    await deps.audit.record(tx, {
      tenantId: ctx.tenantId, actorType: "user", actorId: ctx.userId, action: "strategy.objective.archive",
      target: id, before: { status: "active" }, after: { status: "archived" },
    });
  });
}

/* ------------------------------------------------------------------- personas */

export async function listPersonas(deps: StrategyDeps, ctx: AccessContext, opts = { includeArchived: false }): Promise<Persona[]> {
  exigirPermissao(ctx, "strategy.read");
  return deps.uow.withUserTransaction(ctx, (tx) => deps.strategy.listPersonas(tx, ctx.tenantId, opts));
}

export async function createPersona(deps: StrategyDeps, { ctx, content }: { ctx: AccessContext; content: PersonaContent }): Promise<Persona> {
  exigirPermissao(ctx, "strategy.write");
  exigirConteudoDePersona(content);
  return deps.uow.withUserTransaction(ctx, async (tx) => {
    const criada = await deps.strategy.insertPersona(tx, { tenantId: ctx.tenantId, content, createdBy: ctx.userId });
    await deps.audit.record(tx, {
      tenantId: ctx.tenantId, actorType: "user", actorId: ctx.userId, action: "strategy.persona.create", target: criada.id,
    });
    return criada;
  });
}

export async function archivePersona(deps: StrategyDeps, { ctx, id }: { ctx: AccessContext; id: PersonaId }): Promise<void> {
  exigirPermissao(ctx, "strategy.write");
  await deps.uow.withUserTransaction(ctx, async (tx) => {
    if (!(await deps.strategy.findPersona(tx, ctx.tenantId, id))) throw new PersonaNotFound();
    await deps.strategy.archivePersona(tx, ctx.tenantId, id);
    await deps.audit.record(tx, {
      tenantId: ctx.tenantId, actorType: "user", actorId: ctx.userId, action: "strategy.persona.archive",
      target: id, before: { status: "active" }, after: { status: "archived" },
    });
  });
}

/* ------------------------------------------------------------------ campanhas */

export async function listCampaigns(deps: StrategyDeps, ctx: AccessContext): Promise<Campaign[]> {
  exigirPermissao(ctx, "strategy.read");
  return deps.uow.withUserTransaction(ctx, (tx) => deps.strategy.listCampaigns(tx, ctx.tenantId));
}

export type CampaignDetail = { readonly campaign: Campaign; readonly experiments: Experiment[] };

export async function getCampaign(deps: StrategyDeps, ctx: AccessContext, id: CampaignId): Promise<CampaignDetail> {
  exigirPermissao(ctx, "strategy.read");
  return deps.uow.withUserTransaction(ctx, async (tx) => {
    const campaign = await deps.strategy.findCampaign(tx, ctx.tenantId, id);
    if (!campaign) throw new CampaignNotFound();
    return { campaign, experiments: await deps.strategy.listExperiments(tx, ctx.tenantId, id) };
  });
}

/**
 * Resolve as referências do plano dentro da transação do tenant: objetivo e persona ativos, marca publicada
 * e produto da versão vigente. A campanha fixa a versão da marca de onde o produto veio.
 */
async function resolverReferencias(deps: StrategyDeps, ctx: AccessContext, tx: Tx, plan: CampaignPlan) {
  const objetivo = await deps.strategy.findObjective(tx, ctx.tenantId, plan.objectiveId);
  if (!objetivo) throw new ObjectiveNotFound();
  if (objetivo.status === "archived") throw new ObjectiveArchived();
  if (plan.personaId !== null) {
    const persona = await deps.strategy.findPersona(tx, ctx.tenantId, plan.personaId);
    if (!persona) throw new PersonaNotFound();
    if (persona.status === "archived") throw new PersonaArchived();
  }
  const marca = await deps.brand.findCurrent(tx, ctx.tenantId);
  if (!marca) throw new NoPublishedBrand();
  if (!marca.products.some((p) => p.productKey === plan.productKey)) throw new ProductNotInCurrentBrand();
  return marca.id;
}

const sufixo = (deps: StrategyDeps): string => deps.ids.uuid().replace(/-/g, "").slice(-4).toLowerCase();

/** Gera a chave a partir do nome; uma colisão de sufixo (improvável) é refeita algumas vezes antes de falhar. */
async function comNovaChave<T>(deps: StrategyDeps, nome: string, gravar: (chave: string) => Promise<T>): Promise<T> {
  let ultimo: unknown;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      return await gravar(gerarChaveDeRastreamento(nome, sufixo(deps)));
    } catch (e) {
      if (!(e instanceof TrackingKeyTaken)) throw e;
      ultimo = e;
    }
  }
  throw ultimo;
}

export async function createCampaign(deps: StrategyDeps, { ctx, plan }: { ctx: AccessContext; plan: CampaignPlan }): Promise<Campaign> {
  exigirPermissao(ctx, "strategy.write");
  exigirPlanoValido(plan);
  return deps.uow.withUserTransaction(ctx, async (tx) => {
    const brandVersionId = await resolverReferencias(deps, ctx, tx, plan);
    const criada = await comNovaChave(deps, plan.nome, (chave) =>
      deps.strategy.insertCampaign(tx, { tenantId: ctx.tenantId, plan, brandVersionId, chave, createdBy: ctx.userId }));
    await deps.audit.record(tx, {
      tenantId: ctx.tenantId, actorType: "user", actorId: ctx.userId, action: "strategy.campaign.create",
      target: criada.id, after: { status: criada.status, chave: criada.chave },
    });
    return criada;
  });
}

export async function updateCampaign(
  deps: StrategyDeps, { ctx, id, expectedRevision, plan }: { ctx: AccessContext; id: CampaignId; expectedRevision: number; plan: CampaignPlan },
): Promise<Campaign> {
  exigirPermissao(ctx, "strategy.write");
  exigirPlanoValido(plan);
  return deps.uow.withUserTransaction(ctx, async (tx) => {
    if (!(await deps.strategy.findCampaign(tx, ctx.tenantId, id))) throw new CampaignNotFound();
    const brandVersionId = await resolverReferencias(deps, ctx, tx, plan);
    const salva = await deps.strategy.updateCampaignPlan(tx, { tenantId: ctx.tenantId, id, expectedRevision, plan, brandVersionId });
    await deps.audit.record(tx, {
      tenantId: ctx.tenantId, actorType: "user", actorId: ctx.userId, action: "strategy.campaign.update",
      target: id, after: { revision: salva.revision },
    });
    return salva;
  });
}

export async function regenerateTrackingKey(
  deps: StrategyDeps, { ctx, id, expectedRevision }: { ctx: AccessContext; id: CampaignId; expectedRevision: number },
): Promise<Campaign> {
  exigirPermissao(ctx, "strategy.write");
  return deps.uow.withUserTransaction(ctx, async (tx) => {
    const atual = await deps.strategy.findCampaign(tx, ctx.tenantId, id);
    if (!atual) throw new CampaignNotFound();
    if (atual.activatedAt !== null) throw new TrackingKeyLocked();
    const nova = await comNovaChave(deps, atual.nome, (chave) =>
      deps.strategy.replaceTrackingKey(tx, { tenantId: ctx.tenantId, id, expectedRevision, chave }));
    await deps.audit.record(tx, {
      tenantId: ctx.tenantId, actorType: "user", actorId: ctx.userId, action: "strategy.campaign.key.regenerate",
      target: id, before: { chave: atual.chave }, after: { chave: nova.chave },
    });
    return nova;
  });
}

/**
 * Muda o estado da campanha (ativar, pausar, retomar, concluir, cancelar). Exige `campaign.activate`.
 * A PRIMEIRA ativação confere o método completo (TST-30), o produto disponível (D-7) e o objetivo ativo,
 * e a partir dela a chave de rastreamento fica fixa.
 */
export async function changeCampaignStatus(
  deps: StrategyDeps, { ctx, id, to }: { ctx: AccessContext; id: CampaignId; to: CampaignStatus },
): Promise<Campaign> {
  exigirPermissao(ctx, "campaign.activate");
  return deps.uow.withUserTransaction(ctx, async (tx) => {
    const atual = await deps.strategy.findCampaign(tx, ctx.tenantId, id);
    if (!atual) throw new CampaignNotFound();
    if (!transicaoDeCampanhaValida(atual.status, to)) throw new InvalidCampaignTransition();

    let ativadaEm = atual.activatedAt;
    if (to === "active" && atual.activatedAt === null) {
      const objetivo = await deps.strategy.findObjective(tx, ctx.tenantId, atual.objectiveId);
      if (!objetivo) throw new ObjectiveNotFound();
      if (objetivo.status === "archived") throw new ObjectiveArchived();
      const versao = await deps.brand.findById(tx, ctx.tenantId, atual.brandVersionId);
      const produto = versao?.products.find((p) => p.productKey === atual.productKey);
      if (!produto) throw new ProductNotInCurrentBrand();
      exigirAtivavel(atual, produto.availability);
      ativadaEm = deps.clock.now();
    }
    const nova = await deps.strategy.transitionCampaign(tx, { tenantId: ctx.tenantId, id, from: atual.status, to, activatedAt: ativadaEm });
    await deps.audit.record(tx, {
      tenantId: ctx.tenantId, actorType: "user", actorId: ctx.userId, action: `strategy.campaign.${to}`,
      target: id, before: { status: atual.status }, after: { status: nova.status },
    });
    return nova;
  });
}

/* -------------------------------------------------------------------- testes */

export async function createExperiment(
  deps: StrategyDeps, { ctx, campaignId, content }: { ctx: AccessContext; campaignId: CampaignId; content: ExperimentContent },
): Promise<Experiment> {
  exigirPermissao(ctx, "strategy.write");
  exigirTesteValido(content);
  return deps.uow.withUserTransaction(ctx, async (tx) => {
    const campanha = await deps.strategy.findCampaign(tx, ctx.tenantId, campaignId);
    if (!campanha) throw new CampaignNotFound();
    if (campanha.status === "completed" || campanha.status === "cancelled") throw new CampaignNotOpenForExperiments();
    const criado = await deps.strategy.insertExperiment(tx, { tenantId: ctx.tenantId, campaignId, content, createdBy: ctx.userId });
    await deps.audit.record(tx, {
      tenantId: ctx.tenantId, actorType: "user", actorId: ctx.userId, action: "strategy.experiment.create",
      target: criado.id, after: { campaignId, dimensao: criado.dimensao },
    });
    return criado;
  });
}

export async function changeExperimentStatus(
  deps: StrategyDeps, { ctx, id, to }: { ctx: AccessContext; id: ExperimentId; to: ExperimentStatus },
): Promise<Experiment> {
  exigirPermissao(ctx, "strategy.write");
  return deps.uow.withUserTransaction(ctx, async (tx) => {
    const atual = await deps.strategy.findExperiment(tx, ctx.tenantId, id);
    if (!atual) throw new ExperimentNotFound();
    if (!transicaoDeTesteValida(atual.status, to)) throw new InvalidExperimentTransition();
    if (to === "running") {
      exigirTesteValido(atual); // a execução só começa com hipótese e dimensão declaradas (I-HYP)
      const campanha = await deps.strategy.findCampaign(tx, ctx.tenantId, atual.campaignId);
      if (!campanha || campanha.status === "completed" || campanha.status === "cancelled") throw new CampaignNotOpenForExperiments();
    }
    const novo = await deps.strategy.transitionExperiment(tx, {
      tenantId: ctx.tenantId, id, from: atual.status, to, startedAt: to === "running" ? deps.clock.now() : atual.startedAt,
    });
    await deps.audit.record(tx, {
      tenantId: ctx.tenantId, actorType: "user", actorId: ctx.userId, action: `strategy.experiment.${to}`,
      target: id, before: { status: atual.status }, after: { status: novo.status },
    });
    return novo;
  });
}
