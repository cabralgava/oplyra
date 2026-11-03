import type { AccessContext } from "../../domain/access-context.ts";
import { exigirPermissao } from "../../domain/access-context.ts";
import type { TenantId } from "../../domain/ids.ts";
import { type ActivationChecklist, type ActivationFacts, montarChecklist } from "../../domain/activation.ts";
import type { Tx, UnitOfWork } from "../ports.ts";

/** Leitura dos fatos reais da empresa; a infraestrutura a implementa sob a RLS do tenant ativo. */
export interface ActivationFactsReader {
  read(tx: Tx, tenantId: TenantId): Promise<ActivationFacts>;
}

export type ActivationDeps = { uow: UnitOfWork; facts: ActivationFactsReader };

/** Os fatos vêm de marca e equipe; a leitura exige poder ver as duas. */
export async function getActivationChecklist(deps: ActivationDeps, ctx: AccessContext): Promise<ActivationChecklist> {
  exigirPermissao(ctx, "brand.read");
  exigirPermissao(ctx, "member.read");
  const fatos = await deps.uow.withUserTransaction(ctx, (tx) => deps.facts.read(tx, ctx.tenantId));
  return montarChecklist(fatos);
}
