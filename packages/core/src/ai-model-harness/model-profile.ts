// Model Profiles versionados por `agent + action`. O perfil declara requisitos,
// candidatos, parâmetros e limites; modelo, temperatura e fornecedor nunca
// ficam no domínio, nos casos de uso ou nos prompts dos agentes.
import {
  IMAGE_CAPABILITIES, MODEL_CAPABILITIES, INPUT_MODALITIES,
  validateModelRegistry,
} from "./model-registry.ts";
import type {
  ConfigIssue, InputModality, ModelCapability, ModelDescriptor, ModelRegistry,
} from "./model-registry.ts";

export const ROUTING_POLICIES = ["lowest_cost_above_threshold", "ordered_preference"] as const;
export type RoutingPolicy = (typeof ROUTING_POLICIES)[number];

export const PROFILE_STATUSES = ["draft", "active", "retired"] as const;
export type ProfileStatus = (typeof PROFILE_STATUSES)[number];

export type SamplingSettings = {
  readonly temperature?: number;
  readonly topP?: number;
  readonly seed?: number;
  readonly reasoningEffort?: "low" | "medium" | "high";
};

export type ModelProfile = {
  readonly profileId: string;
  readonly version: number;
  readonly status: ProfileStatus;
  readonly agentKey: string;
  readonly actionKey: string;
  readonly requirements: {
    readonly capability: ModelCapability;
    readonly inputModalities: readonly InputModality[];
    readonly structuredOutput: boolean;
    readonly toolCalling: boolean;
    readonly minContextTokens: number;
  };
  readonly routing: {
    readonly policy: RoutingPolicy;
    /** Ordem de preferência; os seguintes são fallback compatível. */
    readonly candidates: readonly string[];
    readonly forbiddenModels: readonly string[];
    /** Vazio significa "sem restrição adicional do perfil". */
    readonly allowedProviders: readonly string[];
    /** Obrigatório para `lowest_cost_above_threshold`. */
    readonly qualityThreshold: number | null;
    readonly allowExperimental: boolean;
  };
  readonly sampling: SamplingSettings;
  readonly maxOutputTokens: number;
  readonly limits: {
    readonly maxCostMicroUsdPerCall: number;
    /** Tentativas totais da invocação, somando retries e fallbacks. */
    readonly maxAttempts: number;
    readonly maxRetriesPerModel: number;
    readonly timeoutMs: number;
  };
  readonly requiredEntitlement: string | null;
  readonly dataPolicy: { readonly requireZeroDataRetention: boolean };
};

/**
 * Teto de `limits.timeoutMs` (Model Profile Schema 1.1, CR-027 §6.6): com 60 s
 * de folga, o lease derivado nunca passa de 900 s.
 */
export const MAX_PROFILE_TIMEOUT_MS = 840_000;
export const LEASE_GRACE_SECONDS = 60;
export const LEASE_SECONDS_RANGE = { min: 60, max: 900 } as const;

/**
 * Lease de uma tentativa derivado do prazo do perfil, nunca escolhido pelo
 * chamador: `max(60, ceil(timeoutMs / 1000) + 60)`. Fora de 1..840000 lança,
 * porque o perfil já deveria ter sido rejeitado na configuração.
 */
export function leaseSecondsFor(timeoutMs: number): number {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_PROFILE_TIMEOUT_MS) {
    throw new RangeError(`timeoutMs fora de 1..${MAX_PROFILE_TIMEOUT_MS}`);
  }
  return Math.max(LEASE_SECONDS_RANGE.min, Math.ceil(timeoutMs / 1000) + LEASE_GRACE_SECONDS);
}

export const profileRef = (p: Pick<ModelProfile, "profileId" | "version">): string => `${p.profileId}@${p.version}`;

/** Visão somente leitura dos registries congelados de agents e actions. */
export interface AgentActionCatalog {
  readonly source: string;
  hasAgent(agentKey: string): boolean;
  hasAction(actionKey: string): boolean;
  canAgentCallAction(agentKey: string, actionKey: string): boolean;
}

// Limites estruturais do harness. Protegem contra configuração absurda; os
// valores operacionais por workflow continuam em 13 §15 (proposta DP-32).
const MAX_ATTEMPTS = 5;
const MAX_RETRIES_PER_MODEL = 2;

const pertence = <T extends string>(lista: readonly T[], v: string): v is T => (lista as readonly string[]).includes(v);

export function validateModelProfiles(
  profiles: readonly ModelProfile[],
  registry: ModelRegistry,
  catalog: AgentActionCatalog,
): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  const add = (path: string, problem: string) => issues.push({ path, problem });
  const modelos = new Map(registry.models.map((m) => [m.modelId, m] as const));
  const versoes = new Set<string>();
  const ativos = new Map<string, string>();

  profiles.forEach((pf, i) => {
    const p = `profiles[${i}]`;
    if (pf.profileId.trim() === "") add(`${p}.profileId`, "obrigatório");
    if (!Number.isSafeInteger(pf.version) || pf.version < 1) add(`${p}.version`, "inteiro >= 1");
    const ref = profileRef(pf);
    if (versoes.has(ref)) add(`${p}`, `versão duplicada: ${ref}`);
    versoes.add(ref);
    if (!pertence(PROFILE_STATUSES, pf.status)) add(`${p}.status`, `desconhecido: ${pf.status}`);

    if (!catalog.hasAgent(pf.agentKey)) add(`${p}.agentKey`, `agent não registrado: ${pf.agentKey}`);
    if (!catalog.hasAction(pf.actionKey)) add(`${p}.actionKey`, `action não registrada: ${pf.actionKey}`);
    else if (catalog.hasAgent(pf.agentKey) && !catalog.canAgentCallAction(pf.agentKey, pf.actionKey)) {
      add(`${p}.actionKey`, `${pf.agentKey} não pode executar ${pf.actionKey}`);
    }

    if (pf.status === "active") {
      const chave = `${pf.agentKey}::${pf.actionKey}`;
      const outro = ativos.get(chave);
      if (outro) add(`${p}`, `mais de um perfil ativo para ${chave}: ${outro} e ${ref}`);
      ativos.set(chave, ref);
    }

    const r = pf.requirements;
    if (!pertence(MODEL_CAPABILITIES, r.capability)) add(`${p}.requirements.capability`, `desconhecida: ${r.capability}`);
    if (r.inputModalities.length === 0) add(`${p}.requirements.inputModalities`, "ao menos uma modalidade");
    for (const m of r.inputModalities) if (!pertence(INPUT_MODALITIES, m)) add(`${p}.requirements.inputModalities`, `desconhecida: ${m}`);
    if (!Number.isSafeInteger(r.minContextTokens) || r.minContextTokens < 1) add(`${p}.requirements.minContextTokens`, "inteiro positivo");

    const rt = pf.routing;
    if (!pertence(ROUTING_POLICIES, rt.policy)) add(`${p}.routing.policy`, `desconhecida: ${rt.policy}`);
    if (rt.candidates.length === 0) add(`${p}.routing.candidates`, "ao menos um candidato");
    if (new Set(rt.candidates).size !== rt.candidates.length) add(`${p}.routing.candidates`, "candidato repetido");
    if (rt.policy === "lowest_cost_above_threshold" && rt.qualityThreshold === null) {
      add(`${p}.routing.qualityThreshold`, "obrigatório para lowest_cost_above_threshold");
    }
    if (rt.qualityThreshold !== null && !(rt.qualityThreshold >= 0 && rt.qualityThreshold <= 1)) {
      add(`${p}.routing.qualityThreshold`, "entre 0 e 1");
    }
    for (const id of rt.candidates) {
      const m = modelos.get(id);
      if (!m) { add(`${p}.routing.candidates`, `modelo fora do registry: ${id}`); continue; }
      if (rt.forbiddenModels.includes(id)) add(`${p}.routing.candidates`, `candidato também proibido: ${id}`);
      if (!m.capabilities.includes(r.capability)) add(`${p}.routing.candidates`, `${id} sem capacidade ${r.capability}`);
    }

    const s = pf.sampling;
    if (s.temperature !== undefined && !(s.temperature >= 0 && s.temperature <= 2)) add(`${p}.sampling.temperature`, "entre 0 e 2");
    if (s.topP !== undefined && !(s.topP > 0 && s.topP <= 1)) add(`${p}.sampling.topP`, "entre 0 (exclusivo) e 1");
    if (s.seed !== undefined && !Number.isSafeInteger(s.seed)) add(`${p}.sampling.seed`, "inteiro");
    if (!Number.isSafeInteger(pf.maxOutputTokens) || pf.maxOutputTokens < 1) add(`${p}.maxOutputTokens`, "inteiro positivo");

    const l = pf.limits;
    if (!Number.isSafeInteger(l.maxCostMicroUsdPerCall) || l.maxCostMicroUsdPerCall < 0) add(`${p}.limits.maxCostMicroUsdPerCall`, "inteiro >= 0");
    if (!Number.isSafeInteger(l.maxAttempts) || l.maxAttempts < 1 || l.maxAttempts > MAX_ATTEMPTS) add(`${p}.limits.maxAttempts`, `entre 1 e ${MAX_ATTEMPTS}`);
    if (!Number.isSafeInteger(l.maxRetriesPerModel) || l.maxRetriesPerModel < 0 || l.maxRetriesPerModel > MAX_RETRIES_PER_MODEL) {
      add(`${p}.limits.maxRetriesPerModel`, `entre 0 e ${MAX_RETRIES_PER_MODEL}`);
    }
    if (!Number.isSafeInteger(l.timeoutMs) || l.timeoutMs < 1 || l.timeoutMs > MAX_PROFILE_TIMEOUT_MS) {
      add(`${p}.limits.timeoutMs`, `entre 1 e ${MAX_PROFILE_TIMEOUT_MS}`);
    }
    if (pf.requiredEntitlement !== null && pf.requiredEntitlement.trim() === "") add(`${p}.requiredEntitlement`, "vazio; use null");
  });
  return issues;
}

export type ModelHarnessConfig = {
  readonly registryVersion: string;
  readonly catalog: AgentActionCatalog;
  model(modelId: string): ModelDescriptor | undefined;
  /** Único perfil ativo para a rota, ou undefined. */
  activeProfile(agentKey: string, actionKey: string): ModelProfile | undefined;
};

export type ModelHarnessConfigResult =
  | { readonly ok: true; readonly config: ModelHarnessConfig }
  | { readonly ok: false; readonly issues: readonly ConfigIssue[] };

/** Falha fechada: configuração inválida não produz harness utilizável. */
export function buildModelHarnessConfig(input: {
  readonly registry: ModelRegistry;
  readonly profiles: readonly ModelProfile[];
  readonly catalog: AgentActionCatalog;
}): ModelHarnessConfigResult {
  const issues = [
    ...validateModelRegistry(input.registry),
    ...validateModelProfiles(input.profiles, input.registry, input.catalog),
  ];
  if (issues.length > 0) return { ok: false, issues };

  const modelos = new Map(input.registry.models.map((m) => [m.modelId, m] as const));
  const ativos = new Map(
    input.profiles.filter((p) => p.status === "active").map((p) => [`${p.agentKey}::${p.actionKey}`, p] as const),
  );
  return {
    ok: true,
    config: {
      registryVersion: input.registry.registryVersion,
      catalog: input.catalog,
      model: (id) => modelos.get(id),
      activeProfile: (agentKey, actionKey) => ativos.get(`${agentKey}::${actionKey}`),
    },
  };
}

export const requiresImageTariff = (capability: ModelCapability): boolean => IMAGE_CAPABILITIES.has(capability);
