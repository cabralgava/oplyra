// AI Model Router: resolução declarativa e determinística. Mesma entrada,
// mesma decisão. Budget, allowlists, privacidade, capability e kill switch
// são regras de código; nada é delegado a um LLM.
import { BUDGET_REJECTIONS } from "./outcomes.ts";
import type { CandidateRejection, CandidateRejectionReason } from "./outcomes.ts";
import { estimateWorstCaseMicroUsd, IMAGE_CAPABILITIES } from "./model-registry.ts";
import type { DataClassification, InputModality, ModelDescriptor, SamplingParameter } from "./model-registry.ts";
import type { ModelProfile, SamplingSettings } from "./model-profile.ts";
import type { AvailabilitySnapshot, TenantAiPolicy } from "./ports.ts";

export type RoutingRequest = {
  readonly tenantId: string;
  readonly dataClassification: DataClassification;
  readonly inputModalities: readonly InputModality[];
  /** Estimativa usada quando o modelo não tem valor próprio em `inputTokensByModel`. */
  readonly estimatedInputTokens: number;
  /** Estimativa por modelo candidato (contagem exata do modelo ou cota conservadora). */
  readonly inputTokensByModel?: ReadonlyMap<string, number>;
  readonly requestedImages: number;
  /** Modelos já esgotados nesta invocação; fallback nunca os repete. */
  readonly excludedModelIds: readonly string[];
};

export type RoutingContext = {
  readonly profile: ModelProfile;
  readonly lookupModel: (modelId: string) => ModelDescriptor | undefined;
  readonly enabledAdapters: readonly string[];
  readonly tenantPolicy: TenantAiPolicy;
  readonly availability: AvailabilitySnapshot;
  readonly remainingBudgetMicroUsd: number;
};

export type RoutedCandidate = {
  readonly model: ModelDescriptor;
  readonly estimatedCostMicroUsd: number;
};

export type RoutingDecision =
  | {
      readonly ok: true;
      readonly selected: RoutedCandidate;
      readonly reason: "preferred" | "lowest_cost_above_threshold" | "fallback";
      /** Demais elegíveis, na ordem em que seriam usados. */
      readonly alternatives: readonly string[];
      readonly rejections: readonly CandidateRejection[];
    }
  | {
      readonly ok: false;
      readonly failure: "no_eligible_model" | "budget_exceeded" | "tenant_mismatch";
      readonly rejections: readonly CandidateRejection[];
    };

const PARAMETRO: Record<keyof SamplingSettings, SamplingParameter> = {
  temperature: "temperature",
  topP: "top_p",
  seed: "seed",
  reasoningEffort: "reasoning_effort",
};

export function requestedParameters(sampling: SamplingSettings): SamplingParameter[] {
  return (Object.keys(PARAMETRO) as (keyof SamplingSettings)[])
    .filter((k) => sampling[k] !== undefined)
    .map((k) => PARAMETRO[k]);
}

function qualidade(model: ModelDescriptor, profile: ModelProfile): number | undefined {
  return model.qualityEvidence.find((q) => q.agentKey === profile.agentKey && q.actionKey === profile.actionKey)?.score;
}

function avaliar(
  model: ModelDescriptor, req: RoutingRequest, ctx: RoutingContext,
): { reasons: CandidateRejectionReason[]; estimated: number } {
  const { profile, tenantPolicy: tp, availability: av } = ctx;
  const req_ = profile.requirements;
  const reasons: CandidateRejectionReason[] = [];
  const r = (cond: boolean, reason: CandidateRejectionReason) => { if (cond) reasons.push(reason); };
  const tokensEntrada = req.inputTokensByModel?.get(model.modelId) ?? req.estimatedInputTokens;

  // Allowlists e bloqueios: perfil, depois tenant. Tenant só restringe.
  r(profile.routing.forbiddenModels.includes(model.modelId), "forbidden_by_profile");
  r(profile.routing.allowedProviders.length > 0 && !profile.routing.allowedProviders.includes(model.provider), "provider_not_allowed_by_profile");
  r(tp.deniedModels.includes(model.modelId), "forbidden_by_tenant");
  r(tp.deniedProviders.includes(model.provider) || (tp.allowedProviders !== null && !tp.allowedProviders.includes(model.provider)), "provider_not_allowed_by_tenant");

  // Ciclo de vida, ambiente e kill switch.
  r(model.status === "disabled", "status_disabled");
  r(model.status === "experimental" && !profile.routing.allowExperimental, "experimental_not_allowed");
  r(!ctx.enabledAdapters.includes(model.adapterKey), "adapter_not_enabled");
  r(av.killSwitchedModels.includes(model.modelId) || av.killSwitchedProviders.includes(model.provider) || av.killSwitchedAdapters.includes(model.adapterKey), "kill_switch");
  r(av.unavailableModels.includes(model.modelId), "unavailable");

  // Capacidade técnica.
  r(!model.capabilities.includes(req_.capability), "capability_missing");
  const modalidades = new Set<InputModality>([...req_.inputModalities, ...req.inputModalities]);
  r([...modalidades].some((m) => !model.inputModalities.includes(m)), "modality_missing");
  r(req_.structuredOutput && !model.structuredOutput, "structured_output_missing");
  r(req_.toolCalling && !model.toolCalling, "tool_calling_missing");
  r(model.contextWindowTokens < Math.max(req_.minContextTokens, tokensEntrada + profile.maxOutputTokens), "context_window_too_small");
  r(model.maxOutputTokens < profile.maxOutputTokens, "output_limit_too_small");
  r(requestedParameters(profile.sampling).some((p) => !model.supportedParameters.includes(p)), "parameter_unsupported");

  // Privacidade.
  r(!model.dataPolicy.allowedDataClassifications.includes(req.dataClassification), "data_policy_incompatible");
  r(profile.dataPolicy.requireZeroDataRetention && !model.dataPolicy.zeroDataRetention, "zero_data_retention_required");

  // Qualidade exigida pelo perfil.
  const limiar = profile.routing.qualityThreshold;
  if (limiar !== null) {
    const q = qualidade(model, profile);
    r(q === undefined, "quality_evidence_missing");
    r(q !== undefined && q < limiar, "quality_below_threshold");
  }

  // Tarifa e orçamento: sem tarifa válida não há chamada.
  const imagem = IMAGE_CAPABILITIES.has(req_.capability);
  const tarifa = model.tariff;
  if (!tarifa || (imagem && tarifa.microUsdPerImage === undefined)) {
    reasons.push("tariff_missing");
    return { reasons, estimated: 0 };
  }
  const estimated = estimateWorstCaseMicroUsd(tarifa, {
    inputTokens: tokensEntrada,
    outputTokens: profile.maxOutputTokens,
    images: req.requestedImages,
  });
  r(estimated > profile.limits.maxCostMicroUsdPerCall, "exceeds_call_cost_limit");
  r(estimated > ctx.remainingBudgetMicroUsd, "exceeds_remaining_budget");
  return { reasons, estimated };
}

export function routeModelCall(req: RoutingRequest, ctx: RoutingContext): RoutingDecision {
  if (ctx.tenantPolicy.tenantId !== req.tenantId) {
    return { ok: false, failure: "tenant_mismatch", rejections: [] };
  }
  const rejections: CandidateRejection[] = [];
  const elegiveis: RoutedCandidate[] = [];

  for (const modelId of ctx.profile.routing.candidates) {
    if (req.excludedModelIds.includes(modelId)) {
      rejections.push({ modelId, reasons: ["already_attempted"] });
      continue;
    }
    const model = ctx.lookupModel(modelId);
    if (!model) { rejections.push({ modelId, reasons: ["not_in_registry"] }); continue; }
    const { reasons, estimated } = avaliar(model, req, ctx);
    if (reasons.length > 0) rejections.push({ modelId, reasons });
    else elegiveis.push({ model, estimatedCostMicroUsd: estimated });
  }

  if (elegiveis.length === 0) {
    // Orçamento é a causa somente se algum candidato falhou apenas por ele.
    const soOrcamento = rejections.some((x) => x.reasons.length > 0 && x.reasons.every((y) => BUDGET_REJECTIONS.has(y)));
    return { ok: false, failure: soOrcamento ? "budget_exceeded" : "no_eligible_model", rejections };
  }

  const houveExclusao = req.excludedModelIds.length > 0;
  if (ctx.profile.routing.policy === "lowest_cost_above_threshold") {
    // Ordenação estável: empate de custo preserva a ordem do perfil.
    const ordenados = [...elegiveis].sort((a, b) => a.estimatedCostMicroUsd - b.estimatedCostMicroUsd);
    const [selected, ...resto] = ordenados as [RoutedCandidate, ...RoutedCandidate[]];
    return {
      ok: true, selected, rejections,
      reason: houveExclusao ? "fallback" : "lowest_cost_above_threshold",
      alternatives: resto.map((c) => c.model.modelId),
    };
  }

  const [selected, ...resto] = elegiveis as [RoutedCandidate, ...RoutedCandidate[]];
  const primeiro = ctx.profile.routing.candidates[0];
  return {
    ok: true, selected, rejections,
    reason: !houveExclusao && selected.model.modelId === primeiro ? "preferred" : "fallback",
    alternatives: resto.map((c) => c.model.modelId),
  };
}
