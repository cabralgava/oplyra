// Leitura somente leitura dos registries congelados de agents e actions.
// O harness valida perfis contra eles; nunca os altera nem cria entradas.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentActionCatalog } from "@oplyra/core";

// Caminho montado em tempo de execução: bundlers não o tratam como asset.
const REGISTRIES_PADRAO = join(dirname(fileURLToPath(import.meta.url)), "../../../../docs/product/marketing-ops/contracts/registries");

type AgentEntry = { key: string; status: string };
type ActionEntry = { action: string; ownerAgent: string; callableByAgents?: string[] };

export function loadFrozenAgentActionCatalog(registriesDir: string = REGISTRIES_PADRAO): AgentActionCatalog {
  const ler = <T>(nome: string): { registryVersion: string; entries: T[] } =>
    JSON.parse(readFileSync(join(registriesDir, nome), "utf8"));
  const agents = ler<AgentEntry>("agents.json");
  const actions = ler<ActionEntry>("actions.json");

  const ativos = new Set(agents.entries.filter((a) => a.status === "active").map((a) => a.key));
  const porAcao = new Map(actions.entries.map((a) => [a.action, new Set([a.ownerAgent, ...(a.callableByAgents ?? [])])] as const));

  return {
    source: `agents.json@${agents.registryVersion} + actions.json@${actions.registryVersion}`,
    hasAgent: (agentKey) => ativos.has(agentKey),
    hasAction: (actionKey) => porAcao.has(actionKey),
    canAgentCallAction: (agentKey, actionKey) => ativos.has(agentKey) && (porAcao.get(actionKey)?.has(agentKey) ?? false),
  };
}
