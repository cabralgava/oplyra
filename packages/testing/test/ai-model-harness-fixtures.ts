// Fixtures compartilhados dos testes do caso de uso invokeModel.
import { attemptCallId, buildModelHarnessConfig, canonicalRequestMaterial } from "@oplyra/core";
import { HmacRequestFingerprinter } from "../../infra/src/ai-model-harness/hmac-fingerprint.ts";
import type {
  AttemptAcquisitionRequest, AttemptCloseCommand, ModelCallRecord, ModelDescriptor, ModelInvocationDeps, ModelInvocationRequest, ModelProfile, ModelProviderPort, RequestFingerprintPort, TokenEstimatorPort,
} from "@oplyra/core";
import {
  FixedAvailability, InMemoryBudgetGuard, InMemoryDataClassifier, InMemoryGeneratedAssets, InMemoryTenantAiPolicies, ManualDeadline, ScriptedModelProvider,
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
  const budget = opts.budget ?? new InMemoryBudgetGuard({ tenants: { [TA]: 1_000_000, [TB]: 1_000_000 } });
  // O Model Call Record é gravado pelo fechamento atômico do Ledger (CR-027).
  const recorder = budget.recorder;
  const deps: ModelInvocationDeps = {
    config: built.config,
    providers: new Map([[provider.adapterKey, provider]]),
    budget,
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

/** Pedido de aquisição completo para testes diretos do Ledger. */
export const aquisicao = (extra: Partial<AttemptAcquisitionRequest> & { tenantId?: string } = {}): AttemptAcquisitionRequest => {
  const tenantId = extra.tenantId ?? TA;
  const attempt = extra.attempt ?? { actionKey: "create_ad_copy", invocationId: "inv", number: 1 };
  return {
    tenantId, workflowKey: "w", attempt, callId: attemptCallId(tenantId, attempt.actionKey, attempt.invocationId, attempt.number),
    agentKey: "copywriting-agent", requestFingerprint: FP, acceptedFingerprints: [FP], amountMicroUsd: 1_000, profileTimeoutMs: 30_000,
    ...extra,
  };
};

/** Model Call Record sintético coerente com uma aquisição. */
export const registroPara = (a: AttemptAcquisitionRequest, extra: Partial<ModelCallRecord> = {}): ModelCallRecord => ({
  invocationId: a.attempt.invocationId, attempt: a.attempt.number, callId: a.callId, tenantId: a.tenantId,
  workflowKey: a.workflowKey, agentKey: a.agentKey, actionKey: a.attempt.actionKey, trace: TRACE_MINIMO,
  requestFingerprint: a.requestFingerprint, dataClassification: "personal_data",
  classificationProvenance: [{ kind: "conservative_default", ref: null, tenantId: a.tenantId, classification: "personal_data" }],
  inputTokensEstimate: 10, inputTokensEstimateMethod: "conservative_bound", profileRef: "fixture.copy@3", registryVersion: "fixture-7",
  modelId: "m-a", provider: "lab-a", adapterKey: "test", providerModelId: "lab-a/m-a", tariffVersion: "t1",
  routingReason: "preferred", fallbackOccurred: false, resolvedProvider: "lab-a", resolvedProviderModelId: "lab-a/m-a",
  externalRequestId: null, outcome: "succeeded", failureKind: null, usage: { inputTokens: 10, outputTokens: 5, images: 0 },
  outputAssetIds: null, estimatedCostMicroUsd: a.amountMicroUsd, costMicroUsd: 500, costStatus: "settled",
  startedAt: "2026-09-29T12:00:00.000Z", latencyMs: 5, ...extra,
});

/** Fechamento `charged` coerente com a aquisição. */
export const fechamentoPara = (a: AttemptAcquisitionRequest, fencingToken: string, actual = 500): AttemptCloseCommand => ({
  tenantId: a.tenantId, attempt: a.attempt, fencingToken, outcome: "charged", actualMicroUsd: actual, pendingReason: null,
  record: registroPara(a, { costMicroUsd: actual }),
});
