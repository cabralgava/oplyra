// Casos de uso de teste por hipótese (I-04, I-HYP, DEC-017). A hipótese e a dimensão são
// registradas ANTES da execução: o plano nasce em `planned` e só então pode ir a `running`.
import type { StrategyDeps } from "../strategy-ports.ts";
import type { AccessContext } from "../../domain/access-context.ts";
import { exigirPermissao } from "../../domain/access-context.ts";
import type { CampaignId, ExperimentId } from "../../domain/ids.ts";
import {
  type Experiment, type ExperimentPlan, type ExperimentResult, type ExperimentStatus, type Learning,
  exigirHipoteseValida, exigirResultadoCoerente, problemasDoAprendizado, transicaoDoTestePermitida,
} from "../../domain/strategy.ts";
import { CampaignNotFound, ExperimentNotFound, LearningInvalid } from "../../domain/strategy-errors.ts";
import { InvalidStateTransition } from "../../domain/errors.ts";

export async function listExperiments(deps: StrategyDeps, ctx: AccessContext, campaignId: CampaignId): Promise<Experiment[]> {
  exigirPermissao(ctx, "strategy.read");
  return deps.uow.withUserTransaction(ctx, async (tx) => {
    if (!(await deps.campaigns.findById(tx, ctx.tenantId, campaignId))) throw new CampaignNotFound();
    return deps.experiments.listByCampaign(tx, ctx.tenantId, campaignId);
  });
}

/** Registra a hipótese de uma campanha da empresa. Campanha concluída ou cancelada não recebe testes. */
export async function planExperiment(
  deps: StrategyDeps, { ctx, campaignId, plan }: { ctx: AccessContext; campaignId: CampaignId; plan: ExperimentPlan },
): Promise<Experiment> {
  exigirPermissao(ctx, "strategy.write");
  exigirHipoteseValida(plan);
  return deps.uow.withUserTransaction(ctx, async (tx) => {
    const campanha = await deps.campaigns.findById(tx, ctx.tenantId, campaignId);
    if (!campanha) throw new CampaignNotFound();
    if (campanha.status === "completed" || campanha.status === "cancelled") {
      throw new InvalidStateTransition("a campanha está encerrada");
    }
    const criado = await deps.experiments.create(tx, { tenantId: ctx.tenantId, campaignId, plan, createdBy: ctx.userId });
    await deps.audit.record(tx, {
      tenantId: ctx.tenantId, actorType: "user", actorId: ctx.userId, action: "experiment.plan",
      target: criado.id, after: { campaignId, dimension: plan.dimension },
    });
    return criado;
  });
}

async function mudar(
  deps: StrategyDeps,
  { ctx, experimentId, expectedRevision, para, acao, exigeCampanhaAtiva, resultado }: {
    ctx: AccessContext; experimentId: ExperimentId; expectedRevision: number; para: ExperimentStatus; acao: string;
    exigeCampanhaAtiva: boolean; resultado?: { result: ExperimentResult; learning: Learning | null };
  },
): Promise<Experiment> {
  exigirPermissao(ctx, "strategy.write");
  return deps.uow.withUserTransaction(ctx, async (tx) => {
    const atual = await deps.experiments.findById(tx, ctx.tenantId, experimentId);
    if (!atual) throw new ExperimentNotFound();
    if (!transicaoDoTestePermitida(atual.status, para)) throw new InvalidStateTransition();
    if (exigeCampanhaAtiva) {
      const campanha = await deps.campaigns.findById(tx, ctx.tenantId, atual.campaignId);
      if (!campanha) throw new CampaignNotFound();
      if (campanha.status !== "active") throw new InvalidStateTransition("o teste só roda com a campanha ativa");
    }
    if (resultado) {
      exigirResultadoCoerente(atual.plan, resultado.result);
      if (resultado.learning) {
        const problemas = problemasDoAprendizado(resultado.learning);
        if (problemas.length) throw new LearningInvalid(problemas);
      }
    }
    const novo = await deps.experiments.transition(tx, {
      tenantId: ctx.tenantId, id: experimentId, expectedRevision, from: atual.status, to: para, at: deps.clock.now(),
      ...(resultado ? { result: resultado.result, learning: resultado.learning } : {}),
    });
    await deps.audit.record(tx, {
      tenantId: ctx.tenantId, actorType: "user", actorId: ctx.userId, action: acao, target: experimentId,
      before: { status: atual.status },
      after: { status: novo.status, ...(novo.result ? { outcome: novo.result.outcome } : {}) },
    });
    return novo;
  });
}

type Mudanca = { ctx: AccessContext; experimentId: ExperimentId; expectedRevision: number };

export const startExperiment = (deps: StrategyDeps, e: Mudanca): Promise<Experiment> =>
  mudar(deps, { ...e, para: "running", acao: "experiment.start", exigeCampanhaAtiva: true });

/**
 * Conclui com resultado coerente com a amostra mínima do plano (inconclusivo quando insuficiente).
 * O aprendizado é opcional, mas, se vier, exige evidência e versão.
 */
export const concludeExperiment = (
  deps: StrategyDeps, e: Mudanca & { result: ExperimentResult; learning?: Learning | null },
): Promise<Experiment> =>
  mudar(deps, {
    ctx: e.ctx, experimentId: e.experimentId, expectedRevision: e.expectedRevision, para: "concluded",
    acao: "experiment.conclude", exigeCampanhaAtiva: false, resultado: { result: e.result, learning: e.learning ?? null },
  });

export const cancelExperiment = (deps: StrategyDeps, e: Mudanca): Promise<Experiment> =>
  mudar(deps, { ...e, para: "cancelled", acao: "experiment.cancel", exigeCampanhaAtiva: false });
