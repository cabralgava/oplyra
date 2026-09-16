// Leituras de tela. Passam pelas portas e pelos wrappers: a web não fala SQL.
import { deps } from "./deps";
import type { AccessContext, Tenant, Membership } from "@oplyra/core";

export async function lerEquipe(ctx: AccessContext): Promise<{ empresa: Tenant | null; membros: Membership[] }> {
  return deps.uow.withUserTransaction(ctx, async (tx) => ({
    empresa: await deps.tenants.findById(tx, ctx.tenantId),
    membros: await deps.memberships.listByTenant(tx, ctx.tenantId),
  }));
}
