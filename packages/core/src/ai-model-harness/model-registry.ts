// AI Model Registry: catálogo versionado de modelos elegíveis. Capacidade,
// limites, tarifa, política de dados e evidência de qualidade são dados de
// configuração; nada aqui escolhe um modelo concreto.

export const MODEL_CAPABILITIES = [
  "classification", "generation", "analysis", "strategy", "quality_gate",
  "image_generation", "image_edit", "asset_analysis", "other",
] as const;
export type ModelCapability = (typeof MODEL_CAPABILITIES)[number];

export const MODEL_STATUSES = ["active", "degraded", "disabled", "experimental"] as const;
export type ModelStatus = (typeof MODEL_STATUSES)[number];

/** Da menos à mais sensível. */
export const DATA_CLASSIFICATIONS = ["synthetic", "internal", "tenant_confidential", "personal_data"] as const;
export type DataClassification = (typeof DATA_CLASSIFICATIONS)[number];

export const INPUT_MODALITIES = ["text", "image", "audio", "video"] as const;
export type InputModality = (typeof INPUT_MODALITIES)[number];

export const SAMPLING_PARAMETERS = ["temperature", "top_p", "seed", "reasoning_effort"] as const;
export type SamplingParameter = (typeof SAMPLING_PARAMETERS)[number];

export const IMAGE_CAPABILITIES: ReadonlySet<ModelCapability> = new Set(["image_generation", "image_edit"]);

/** Valores monetários em micro-USD inteiros: sem ponto flutuante no orçamento. */
export type ModelTariff = {
  readonly tariffVersion: string;
  readonly currency: "USD";
  readonly effectiveFrom: string;
  readonly inputMicroUsdPerMillionTokens: number;
  readonly outputMicroUsdPerMillionTokens: number;
  readonly microUsdPerImage?: number;
};

export type ModelDataPolicy = {
  readonly allowedDataClassifications: readonly DataClassification[];
  readonly zeroDataRetention: boolean;
  /** Onde a política foi verificada e quando. Sem evidência não há elegibilidade. */
  readonly evidenceRef: string;
};

/** Resultado do Eval Engine para uma rota `agent + action`. */
export type QualityEvidence = {
  readonly agentKey: string;
  readonly actionKey: string;
  readonly score: number;
  readonly evalRef: string;
  readonly measuredAt: string;
};

export type ModelDescriptor = {
  /** Identificador interno da Oplyra; estável entre adapters. */
  readonly modelId: string;
  /** Laboratório/fornecedor de origem do modelo. */
  readonly provider: string;
  /** Adapter que executa a chamada (gateway, direto ou teste). */
  readonly adapterKey: string;
  /** Identificador do modelo no adapter. */
  readonly providerModelId: string;
  readonly status: ModelStatus;
  readonly capabilities: readonly ModelCapability[];
  readonly inputModalities: readonly InputModality[];
  readonly supportedParameters: readonly SamplingParameter[];
  readonly structuredOutput: boolean;
  readonly toolCalling: boolean;
  readonly contextWindowTokens: number;
  readonly maxOutputTokens: number;
  /** Sem tarifa válida o modelo não recebe chamadas. */
  readonly tariff: ModelTariff | null;
  readonly dataPolicy: ModelDataPolicy;
  readonly qualityEvidence: readonly QualityEvidence[];
  /** Data da evidência de capacidade/disponibilidade/termos. */
  readonly evidenceDate: string;
};

export type ModelRegistry = {
  readonly registryVersion: string;
  readonly models: readonly ModelDescriptor[];
};

export type ConfigIssue = { readonly path: string; readonly problem: string };

const naoVazio = (v: string): boolean => v.trim().length > 0;
const inteiroNaoNegativo = (v: number): boolean => Number.isSafeInteger(v) && v >= 0;
const inteiroPositivo = (v: number): boolean => Number.isSafeInteger(v) && v > 0;
const pertence = <T extends string>(lista: readonly T[], v: string): v is T => (lista as readonly string[]).includes(v);

export function validateModelRegistry(registry: ModelRegistry): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  const add = (path: string, problem: string) => issues.push({ path, problem });
  if (!naoVazio(registry.registryVersion)) add("registryVersion", "obrigatório");

  const ids = new Set<string>();
  const rotas = new Set<string>();
  registry.models.forEach((m, i) => {
    const p = `models[${i}]`;
    if (!naoVazio(m.modelId)) add(`${p}.modelId`, "obrigatório");
    if (ids.has(m.modelId)) add(`${p}.modelId`, `duplicado: ${m.modelId}`);
    ids.add(m.modelId);
    const rota = `${m.adapterKey}::${m.providerModelId}`;
    if (rotas.has(rota)) add(`${p}.providerModelId`, `duplicado no adapter: ${rota}`);
    rotas.add(rota);
    if (!naoVazio(m.provider)) add(`${p}.provider`, "obrigatório");
    if (!naoVazio(m.adapterKey)) add(`${p}.adapterKey`, "obrigatório");
    if (!naoVazio(m.providerModelId)) add(`${p}.providerModelId`, "obrigatório");
    if (!pertence(MODEL_STATUSES, m.status)) add(`${p}.status`, `desconhecido: ${m.status}`);
    if (m.capabilities.length === 0) add(`${p}.capabilities`, "ao menos uma capacidade");
    for (const c of m.capabilities) if (!pertence(MODEL_CAPABILITIES, c)) add(`${p}.capabilities`, `desconhecida: ${c}`);
    if (m.inputModalities.length === 0) add(`${p}.inputModalities`, "ao menos uma modalidade");
    for (const c of m.inputModalities) if (!pertence(INPUT_MODALITIES, c)) add(`${p}.inputModalities`, `desconhecida: ${c}`);
    for (const c of m.supportedParameters) if (!pertence(SAMPLING_PARAMETERS, c)) add(`${p}.supportedParameters`, `desconhecido: ${c}`);
    if (!inteiroPositivo(m.contextWindowTokens)) add(`${p}.contextWindowTokens`, "inteiro positivo");
    if (!inteiroPositivo(m.maxOutputTokens)) add(`${p}.maxOutputTokens`, "inteiro positivo");
    if (m.maxOutputTokens > m.contextWindowTokens) add(`${p}.maxOutputTokens`, "maior que a janela de contexto");
    if (!naoVazio(m.evidenceDate)) add(`${p}.evidenceDate`, "obrigatório");

    if (m.tariff) {
      const t = m.tariff;
      if (!naoVazio(t.tariffVersion)) add(`${p}.tariff.tariffVersion`, "obrigatório");
      if (t.currency !== "USD") add(`${p}.tariff.currency`, "somente USD nesta versão");
      if (!naoVazio(t.effectiveFrom)) add(`${p}.tariff.effectiveFrom`, "obrigatório");
      if (!inteiroNaoNegativo(t.inputMicroUsdPerMillionTokens)) add(`${p}.tariff.inputMicroUsdPerMillionTokens`, "inteiro >= 0");
      if (!inteiroNaoNegativo(t.outputMicroUsdPerMillionTokens)) add(`${p}.tariff.outputMicroUsdPerMillionTokens`, "inteiro >= 0");
      if (t.microUsdPerImage !== undefined && !inteiroNaoNegativo(t.microUsdPerImage)) add(`${p}.tariff.microUsdPerImage`, "inteiro >= 0");
    }

    const dp = m.dataPolicy;
    if (!naoVazio(dp.evidenceRef)) add(`${p}.dataPolicy.evidenceRef`, "obrigatório");
    for (const c of dp.allowedDataClassifications) if (!pertence(DATA_CLASSIFICATIONS, c)) add(`${p}.dataPolicy`, `classificação desconhecida: ${c}`);
    // Modelo experimental (inclusive gratuito) nunca recebe dado que não seja sintético.
    if (m.status === "experimental" && dp.allowedDataClassifications.some((c) => c !== "synthetic")) {
      add(`${p}.dataPolicy`, "modelo experimental aceita somente dados sintéticos");
    }

    m.qualityEvidence.forEach((q, j) => {
      if (!(q.score >= 0 && q.score <= 1)) add(`${p}.qualityEvidence[${j}].score`, "entre 0 e 1");
      if (!naoVazio(q.evalRef)) add(`${p}.qualityEvidence[${j}].evalRef`, "obrigatório");
    });
  });
  return issues;
}

/** Estimativa de pior caso em micro-USD, arredondada para cima. */
export function estimateWorstCaseMicroUsd(
  tariff: ModelTariff,
  usage: { readonly inputTokens: number; readonly outputTokens: number; readonly images: number },
): number {
  const tokens = usage.inputTokens * tariff.inputMicroUsdPerMillionTokens
    + usage.outputTokens * tariff.outputMicroUsdPerMillionTokens;
  return Math.ceil(tokens / 1_000_000) + usage.images * (tariff.microUsdPerImage ?? 0);
}
