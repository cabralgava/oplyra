// Leitura somente leitura do registry canônico de Model Profiles
// (contracts/registries/model-profiles.json, Release 2.16). A validação
// semântica completa — vínculo agent + action, unicidade de perfil ativo e
// candidatos no catálogo operacional — acontece em buildModelHarnessConfig,
// com falha fechada.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ModelProfile } from "@oplyra/core";

const REGISTRY_PADRAO = join(dirname(fileURLToPath(import.meta.url)), "../../../../docs/product/marketing-ops/contracts/registries/model-profiles.json");

export type ModelProfileRegistry = {
  readonly registry: "oplyra-model-profiles";
  readonly registryVersion: string;
  readonly entries: readonly ModelProfile[];
};

export function loadModelProfileRegistry(caminho: string = REGISTRY_PADRAO): ModelProfileRegistry {
  const bruto: unknown = JSON.parse(readFileSync(caminho, "utf8"));
  const r = bruto as { registry?: unknown; registryVersion?: unknown; status?: unknown; entries?: unknown };
  if (r.registry !== "oplyra-model-profiles" || typeof r.registryVersion !== "string" || r.status !== "active" || !Array.isArray(r.entries)) {
    throw new Error("registry de Model Profiles fora do formato canônico");
  }
  return { registry: "oplyra-model-profiles", registryVersion: r.registryVersion, entries: r.entries as ModelProfile[] };
}
