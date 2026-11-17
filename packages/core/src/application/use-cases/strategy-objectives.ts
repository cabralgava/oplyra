// Casos de uso de objetivo e indicadores (I-04). Modelo mínimo PROPOSTO (ver domain/strategy.ts).
import type { StrategyDeps } from "../strategy-ports.ts";
import type { AccessContext } from "../../domain/access-context.ts";
import { exigirPermissao } from "../../domain/access-context.ts";
import type { ObjectiveId } from "../../domain/ids.ts";
import { type Objective, type ObjectiveContent, exigirObjetivoValido } from "../../domain/strategy.ts";
import { ObjectiveNotFound } from "../../domain/strategy-errors.ts";
import { InvalidStateTransition } from "../../domain/errors.ts";

export async function listObjectives(deps: StrategyDeps, ctx: AccessContext): Promise<Objective[]> {
  exigirPermissao(ctx, "strategy.read");
  return deps.uow.withUserTransaction(ctx, (tx) => deps.objectives.list(tx, ctx.tenantId));
}

export async function createObjective(
  deps: StrategyDeps, { ctx, content }: { ctx: AccessContext; content: ObjectiveContent },
): Promise<Objective> {
  exigirPermissao(ctx, "strategy.write");
  exigirObjetivoValido(content);
  return deps.uow.withUserTransaction(ctx, async (tx) => {
    const criado = await deps.objectives.create(tx, { tenantId: ctx.tenantId, content, createdBy: ctx.userId });
    await deps.audit.record(tx, {
      tenantId: ctx.tenantId, actorType: "user", actorId: ctx.userId, action: "objective.create",
      target: criado.id, after: { kpis: criado.kpis.length },
    });
    return criado;
  });
}

async function obterAtivo(deps: StrategyDeps, tx: Parameters<StrategyDeps["objectives"]["findById"]>[0], ctx: AccessContext, id: ObjectiveId): Promise<Objective> {
  const o = await deps.objectives.findById(tx, ctx.tenantId, id);
  if (!o) throw new ObjectiveNotFound();
  if (o.status !== "active") throw new InvalidStateTransition("o objetivo está arquivado");
  return o;
}

export async function saveObjective(
  deps: StrategyDeps,
  { ctx, objectiveId, expectedRevision, content }: {
    ctx: AccessContext; objectiveId: ObjectiveId; expectedRevision: number; content: ObjectiveContent;
  },
): Promise<Objective> {
  exigirPermissao(ctx, "strategy.write");
  exigirObjetivoValido(content);
  return deps.uow.withUserTransaction(ctx, async (tx) => {
    await obterAtivo(deps, tx, ctx, objectiveId);
    const salvo = await deps.objectives.replaceContent(tx, { tenantId: ctx.tenantId, id: objectiveId, expectedRevision, content });
    await deps.audit.record(tx, {
      tenantId: ctx.tenantId, actorType: "user", actorId: ctx.userId, action: "objective.save",
      target: objectiveId, after: { revision: salvo.revision, kpis: salvo.kpis.length },
    });
    return salvo;
  });
}

/** Define o objetivo principal (14 §3): no máximo um por empresa, e só entre os ativos. */
export async function setPrimaryObjective(
  deps: StrategyDeps, { ctx, objectiveId, expectedRevision }: { ctx: AccessContext; objectiveId: ObjectiveId; expectedRevision: number },
): Promise<Objective> {
  exigirPermissao(ctx, "strategy.write");
  return deps.uow.withUserTransaction(ctx, async (tx) => {
    await obterAtivo(deps, tx, ctx, objectiveId);
    const o = await deps.objectives.setPrimary(tx, { tenantId: ctx.tenantId, id: objectiveId, expectedRevision });
    await deps.audit.record(tx, {
      tenantId: ctx.tenantId, actorType: "user", actorId: ctx.userId, action: "objective.set_primary", target: objectiveId,
    });
    return o;
  });
}

export async function archiveObjective(
  deps: StrategyDeps, { ctx, objectiveId, expectedRevision }: { ctx: AccessContext; objectiveId: ObjectiveId; expectedRevision: number },
): Promise<Objective> {
  exigirPermissao(ctx, "strategy.write");
  return deps.uow.withUserTransaction(ctx, async (tx) => {
    await obterAtivo(deps, tx, ctx, objectiveId);
    const o = await deps.objectives.archive(tx, { tenantId: ctx.tenantId, id: objectiveId, expectedRevision });
    await deps.audit.record(tx, {
      tenantId: ctx.tenantId, actorType: "user", actorId: ctx.userId, action: "objective.archive", target: objectiveId,
    });
    return o;
  });
}
