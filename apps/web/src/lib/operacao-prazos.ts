import { exigirPermissao, type AccessContext, type Deps } from "@oplyra/core";
import { deps } from "./deps";
import { civilDateInTimeZone } from "./estrategia";

type PrazosDeps = Pick<Deps, "uow" | "tenants" | "clock">;
/** Dia civil da empresa lida sob a identidade atual; nunca usa o fuso do navegador. */
export async function hojeDaOperacao(ctx: AccessContext, dependencies: PrazosDeps = deps): Promise<string | null> {
  exigirPermissao(ctx, "strategy.read");
  const empresa = await dependencies.uow.withUserTransaction(ctx, tx => dependencies.tenants.findById(tx, ctx.tenantId));
  if (!empresa || empresa.id !== ctx.tenantId) return null;
  return civilDateInTimeZone(dependencies.clock.now(), empresa.timezone);
}
