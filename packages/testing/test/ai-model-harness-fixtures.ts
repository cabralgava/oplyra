// Fixtures compartilhados dos testes do caso de uso invokeModel.
import { attemptCallId, buildModelHarnessConfig, canonicalRequestMaterial } from "@oplyra/core";
import { HmacRequestFingerprinter } from "../../infra/src/ai-model-harness/hmac-fingerprint.ts";
import type {
  ModelDescriptor, ModelInvocationDeps, ModelInvocationRequest, ModelProfile, ModelProviderPort, RequestFingerprintPort, TokenEstimatorPort,
} from "@oplyra/core";
import {
  FixedAvailability, InMemoryBudgetGuard, InMemoryDataClassifier, InMemoryGeneratedAssets, InMemoryModelCallRecorder, InMemoryTenantAiPolicies, ManualDeadline, ScriptedModelProvider,
  SetAiEntitlements, inMemoryAgentActionCatalog, steppingClock,
} from "@oplyra/testing";

export const TA = "tenant-a";
export const TB = "tenant-b";

// Tarifa sintética: 1 USD/M entrada, 2 USD/M saída. Uso roteirizado: 100 in + 50 out = 200 micro-USD.
export const modelo = (id: string, provider = "lab-a", extra: Partial<ModelDescriptor> = {}): ModelDescriptor => ({
  modelId: id, provider, adapterKey: "test", providerModelId: `${provider}/${id}`, status: "active",
  capabilities: ["generation"], inputModalities: ["text"], supportedParameters: ["temperature"],
  structuredOutput: true, toolCalling: false, contextWindowTokens: 32_000, maxOutputTokens: 4_096,
  tariff: { tariffVersion: "t1", currency: "USD", effectiveFrom: "2026-09-29", inputMicroUsdPerMillionTokens: 1_000_000, outputMicroUsdPerMillionTokens: 2_000_000 },
  dataPolicy: { allowedDataClassifications: ["synthetic", "internal"], zeroDataRetention: false, evidenceRef: "fixture" },
  qualityEvidence: [], evidenceDate: "2026-09-29", ...extra,
});

export const perfil = (extra: Partial<ModelProfile> = {}): ModelProfile => ({
  profileId: "fixture.copy", version: 3, status: "active", agentKey: "copywriting-agent", actionKey: "create_ad_copy",
  requirements: { capability: "generation", inputModalities: ["text"], structuredOutput: false, toolCalling: false, minContextTokens: 1_000 },
  routing: { policy: "ordered_preference", candidates: ["m-a", "m-b"], forbiddenModels: [], allowedProviders: [], qualityThreshold: null, allowExperimental: false },
  sampling: { temperature: 0.4 },
  maxOutputTokens: 1_000,
  limits: { maxCostMicroUsdPerCall: 10_000, maxAttempts: 4, maxRetriesPerModel: 1, timeoutMs: 2_000 },
  requiredEntitlement: null,
  dataPolicy: { requireZeroDataRetention: false },
  ...extra,
});

export const catalogo = inMemoryAgentActionCatalog({
  "copywriting-agent": ["create_ad_copy", "revise_copy"],
  "design-agent": ["create_static_variation"],
});

export function montar(opts: {
  provider?: ModelProviderPort; profiles?: ModelProfile[]; models?: ModelDescriptor[];
  classifier?: InMemoryDataClassifier; fingerprints?: RequestFingerprintPort; tokenEstimator?: TokenEstimatorPort; generatedAssets?: InMemoryGeneratedAssets;
  deadline?: ManualDeadline; budget?: InMemoryBudgetGuard; policies?: InMemoryTenantAiPolicies; entitlements?: SetAiEntitlements; availability?: FixedAvailability;
} = {}) {
  const built = buildModelHarnessConfig({
    registry: { registryVersion: "fixture-7", models: opts.models ?? [modelo("m-a"), modelo("m-b", "lab-b")] },
    profiles: opts.profiles ?? [perfil()],
    catalog: catalogo,
  });
  if (!built.ok) throw new Error(JSON.stringify(built.issues));
  const provider = opts.provider ?? new ScriptedModelProvider("test");
  const recorder = new InMemoryModelCallRecorder();
  const budget = opts.budget ?? new InMemoryBudgetGuard({ tenants: { [TA]: 1_000_000, [TB]: 1_000_000 } });
  const deps: ModelInvocationDeps = {
    config: built.config,
    providers: new Map([[provider.adapterKey, provider]]),
    budget, recorder,
    tenantPolicies: opts.policies ?? new InMemoryTenantAiPolicies(),
    entitlements: opts.entitlements ?? new SetAiEntitlements(),
    availability: opts.availability ?? new FixedAvailability(),
    clock: steppingClock(),
    deadline: opts.deadline ?? new ManualDeadline(),
    classifier: opts.classifier ?? classificadorPadrao(),
    fingerprints: opts.fingerprints ?? FINGERPRINTER_SINTETICO,
    ...(opts.tokenEstimator ? { tokenEstimator: opts.tokenEstimator } : {}),
    ...(opts.generatedAssets ? { generatedAssets: opts.generatedAssets } : {}),
  };
  return { deps, recorder, budget, provider };
}

/** Fonte de classificação sintética registrada nos dois tenants. */
export const FONTE_CTX = { kind: "context_package", ref: "ctx-sintetico-1" } as const;
export const classificadorPadrao = () =>
  new InMemoryDataClassifier().register(TA, FONTE_CTX, "synthetic").register(TB, FONTE_CTX, "synthetic");

export const SEGREDO = "conteúdo sintético confidencial da empresa A";
export const TRACE_MINIMO = {
  correlationId: "corr-1", transactionId: null, causationId: null, parentTransactionId: null, workflowId: null, taskId: null, runId: null,
};
export const pedido = (extra: Partial<ModelInvocationRequest> = {}): ModelInvocationRequest => ({
  invocationId: "inv-1", tenantId: TA, workflowKey: "copy-review", agentKey: "copywriting-agent", actionKey: "create_ad_copy",
  trace: TRACE_MINIMO, classification: { sources: [FONTE_CTX], declared: null },
  // Dica de 500 tokens: acima da cota da mensagem curta, mantém a estimativa conhecida (2.500 micro-USD).
  messages: [{ role: "user", content: SEGREDO }], inputModalities: ["text"], inputTokensHint: 500, ...extra,
});


/**
 * Chaves sintéticas explícitas, somente para teste. Não são segredos e não
 * vêm de variável de ambiente nem de cofre.
 */
export const CHAVE_SINTETICA_V1 = { keyId: "synthetic-test-v1", secret: new TextEncoder().encode("oplyra-synthetic-fingerprint-key-v1-not-a-secret") };
export const CHAVE_SINTETICA_V2 = { keyId: "synthetic-test-v2", secret: new TextEncoder().encode("oplyra-synthetic-fingerprint-key-v2-not-a-secret") };
export const FINGERPRINTER_SINTETICO = new HmacRequestFingerprinter({ active: CHAVE_SINTETICA_V1 });

/** Fingerprint que o harness calcula para `pedido()` com o perfil padrão. */
export const fingerprintDe = async (r: ModelInvocationRequest, profileRef = "fixture.copy@3") =>
  (await FINGERPRINTER_SINTETICO.fingerprint(canonicalRequestMaterial({
    tenantId: r.tenantId, workflowKey: r.workflowKey, agentKey: r.agentKey, actionKey: r.actionKey, profileRef,
    effectiveClassification: "synthetic", declaredClassification: r.classification.declared,
    classificationSources: r.classification.sources, inputModalities: r.inputModalities,
    requestedImages: r.requestedImages ?? 0, messages: r.messages,
  }))).primary;
/** Fingerprint arbitrário no formato protegido, para testes diretos do fake de orçamento. */
export const FP = `hmac-sha256:v1:synthetic-test-v1:${"a".repeat(64)}`;

/** Segunda action do mesmo agent, para o escopo de idempotência por action. */
export const perfilRevisao = perfil({ profileId: "fixture.revise", actionKey: "revise_copy" });

/** Rota visual sintética: design-agent/create_static_variation com tarifa por imagem. */
export const imagemModelo = modelo("img", "lab-a", {
  capabilities: ["image_generation"], supportedParameters: ["seed"],
  tariff: { ...modelo("x").tariff!, microUsdPerImage: 40_000 },
});
export const perfilImagem = perfil({
  profileId: "fixture.image", agentKey: "design-agent", actionKey: "create_static_variation",
  requirements: { ...perfil().requirements, capability: "image_generation" },
  routing: { ...perfil().routing, candidates: ["img"] },
  sampling: {},
  limits: { ...perfil().limits, maxCostMicroUsdPerCall: 500_000 },
});
export const pedidoImagem = (extra: Partial<ModelInvocationRequest> = {}) =>
  pedido({ agentKey: "design-agent", actionKey: "create_static_variation", ...extra });


/** `callId` interno das tentativas usadas nos testes (escopo completo). */
export const COPY1 = attemptCallId(TA, "create_ad_copy", "inv-1", 1);
export const REV1 = attemptCallId(TA, "revise_copy", "inv-1", 1);
export const IMG1 = attemptCallId(TA, "create_static_variation", "inv-1", 1);
