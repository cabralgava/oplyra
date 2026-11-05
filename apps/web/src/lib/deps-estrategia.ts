// Composição da Estratégia (I-04). Arquivo próprio: `deps.ts` é governado e não muda neste incremento.
import { auditLog, relogio } from "@oplyra/infra";
import { brandRepository, geradorDeIds } from "@oplyra/infra/brand";
import { strategyRepository } from "@oplyra/infra/strategy";
import type { StrategyDeps } from "@oplyra/core/strategy";
import { deps } from "./deps";

export const strategyDeps: StrategyDeps = {
  uow: deps.uow, strategy: strategyRepository, brand: brandRepository, audit: auditLog, clock: relogio, ids: geradorDeIds,
};
