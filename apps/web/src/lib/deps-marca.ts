// Composição do Brand OS (I-03). Arquivo próprio: `deps.ts` pertence ao conjunto governado pelos manifests
// de contrato e não é alterado por este incremento. Reutiliza o mesmo pool e a mesma auditoria.
import { auditLog, relogio } from "@oplyra/infra";
import { brandRepository, geradorDeIds, activationFactsReader } from "@oplyra/infra/brand";
import type { BrandDeps, ActivationDeps } from "@oplyra/core/brand";
import { deps } from "./deps";

export const brandDeps: BrandDeps = { uow: deps.uow, brand: brandRepository, audit: auditLog, clock: relogio, ids: geradorDeIds };
export const activationDeps: ActivationDeps = { uow: deps.uow, facts: activationFactsReader };
