// Composição de Estratégia (I-04). Arquivo próprio: `deps.ts` pertence ao conjunto governado pelos manifests de
// contrato. Reutiliza o mesmo pool, a mesma auditoria e o repositório da marca (leitura da marca vigente).
import { auditLog, relogio } from "@oplyra/infra";
import { brandRepository, geradorDeIds } from "@oplyra/infra/brand";
import {
  campaignRepository, objectiveRepository, experimentRepository, taskRepository, agentCapabilities,
} from "../../../../packages/infra/src/strategy-repository.ts";
import type { StrategyDeps } from "./estrategia";
import { deps } from "./deps";

export const strategyDeps: StrategyDeps = {
  uow: deps.uow, campaigns: campaignRepository, objectives: objectiveRepository, experiments: experimentRepository,
  tasks: taskRepository, agents: agentCapabilities, brand: brandRepository, audit: auditLog, clock: relogio, ids: geradorDeIds,
};
