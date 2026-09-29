// Portas internas do Product AI Model Harness. Adapters de gateway, provider
// direto ou teste as implementam na borda; nenhum DTO, SDK ou erro de
// fornecedor atravessa estas interfaces.
import type { DataClassification, InputModality } from "./model-registry.ts";
import type { SamplingSettings } from "./model-profile.ts";
import type { TraceContext } from "./invocation-validation.ts";

export type ModelMessage = {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
};

/** Formatos de imagem aceitos como saída visual. */
export const VISUAL_MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type VisualMediaType = (typeof VISUAL_MEDIA_TYPES)[number];

/**
 * Destino das saídas visuais de uma tentativa. Existe só em rota visual e só
 * para o adapter gravar assets no tenant certo; o adapter não o repassa ao
 * fornecedor externo.
 */
export type VisualOutputScope = { readonly tenantId: string; readonly callId: string };

export type ProviderCall = {
  /**
   * Identificador interno da tentativa (`attemptCallId`). O adapter o usa só
   * internamente (logs locais, proveniência de assets) e **não** o encaminha
   * ao fornecedor; chave de idempotência externa deve ser derivada de forma
   * opaca na infraestrutura.
   */
  readonly callId: string;
  readonly providerModelId: string;
  readonly messages: readonly ModelMessage[];
  readonly inputModalities: readonly InputModality[];
  /** Somente parâmetros do Model Profile que o Registry declara suportados. */
  readonly parameters: SamplingSettings & { readonly maxOutputTokens: number };
  readonly responseFormat: "text" | "json";
  readonly requestedImages: number;
  readonly timeoutMs: number;
  readonly dataClassification: DataClassification;
  readonly visualOutputScope?: VisualOutputScope;
};

export type ProviderUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly images: number;
};

/**
 * `unknown` significa que o fornecedor pode ter cobrado: a reserva não é
 * liberada e o custo fica pendente de conciliação, nunca vira zero.
 */
export type ProviderBilling =
  | { readonly kind: "charged"; readonly reportedCostMicroUsd: number | null }
  | { readonly kind: "none" }
  | { readonly kind: "unknown" };

/**
 * Saída visual: referência a asset já gravado pelo adapter no tenant do
 * escopo. Nunca binário, base64 ou data URL inline.
 */
export type ProviderVisualAsset = { readonly assetId: string; readonly mediaType: VisualMediaType };

/** Sucesso por modalidade: texto em rota textual, assets em rota visual. */
export type ProviderOutput =
  | { readonly modality: "text"; readonly text: string }
  | { readonly modality: "visual"; readonly assets: readonly ProviderVisualAsset[] };

export type ProviderSuccess = {
  readonly ok: true;
  readonly output: ProviderOutput;
  readonly usage: ProviderUsage;
  /** Modelo e fornecedor efetivamente usados, como devolvidos pelo adapter. */
  readonly resolvedProvider: string;
  readonly resolvedProviderModelId: string;
  /** Parâmetros pedidos que o fornecedor não aplicou. Qualquer item invalida a resposta. */
  readonly ignoredParameters: readonly string[];
  readonly externalRequestId: string | null;
  readonly billing: ProviderBilling;
};

export type ProviderErrorKind = "timeout" | "rate_limited" | "unavailable" | "rejected_request";

export type ProviderFailure = {
  readonly ok: false;
  readonly errorKind: ProviderErrorKind;
  readonly externalRequestId: string | null;
  readonly billing: ProviderBilling;
};

export type ProviderCallResult = ProviderSuccess | ProviderFailure;

export interface ModelProviderPort {
  readonly adapterKey: string;
  invoke(call: ProviderCall): Promise<ProviderCallResult>;
}

export type BudgetScope = { readonly tenantId: string; readonly workflowKey: string };

/**
 * Tentativa no escopo de idempotência do Error Registry (`IDEMPOTENCY_CONFLICT`:
 * mesmo tenant, mesma action, mesma chave). A chave completa é
 * `(tenantId, actionKey, invocationId, number)`.
 */
export type AttemptRef = { readonly actionKey: string; readonly invocationId: string; readonly number: number };

/**
 * Resumo protegido da requisição material. `primary` usa a chave ativa;
 * `accepted` inclui `primary` e os resumos sob chaves anteriores ainda no
 * keyring, para que uma reentrega depois da rotação não vire conflito.
 */
export type RequestFingerprint = { readonly primary: string; readonly accepted: readonly string[] };

/**
 * Porta de fingerprint. Recebe o material canônico (que contém o prompt) e
 * devolve só resumos com chave; nunca guarda nem registra o material.
 */
export interface RequestFingerprintPort {
  fingerprint(canonicalMaterial: string): Promise<RequestFingerprint>;
}

/**
 * Resultado da aquisição de uma tentativa (`AttemptRef`):
 * - `acquired`: esta execução é dona da tentativa e da reserva; só ela chama o provider;
 * - `in_progress`: outra execução adquiriu a tentativa e ainda não a encerrou;
 * - `closed`: a tentativa já foi liquidada, liberada ou retida para conciliação;
 * - `conflict`: a chave já existe com outro fingerprint (requisição materialmente diferente);
 * - `insufficient`: saldo não cobre a estimativa.
 */
export type AttemptAcquisition =
  | { readonly status: "acquired"; readonly reservationId: string }
  | { readonly status: "conflict" }
  | { readonly status: "in_progress" }
  | { readonly status: "closed" }
  | { readonly status: "insufficient"; readonly remainingMicroUsd: number };

/**
 * Reserva atômica por tenant e workflow. `remaining` é consultivo para o
 * roteamento; a aquisição é a barreira efetiva contra corrida.
 */
export interface BudgetGuardPort {
  remaining(scope: BudgetScope): Promise<{ readonly remainingMicroUsd: number }>;
  /**
   * Verificar e gravar numa única operação atômica: no máximo uma execução
   * recebe `acquired` por tenant, action, invocationId e tentativa, para sempre. A comparação do
   * fingerprint faz parte da mesma operação e vem antes do estado: chave
   * existente com fingerprint diferente é sempre `conflict`.
   */
  acquireAttempt(scope: BudgetScope & {
    readonly attempt: AttemptRef;
    /** Gravado na aquisição. */
    readonly requestFingerprint: string;
    /** Chave existente com fingerprint fora desta lista é `conflict`. */
    readonly acceptedFingerprints: readonly string[];
    readonly amountMicroUsd: number;
  }): Promise<AttemptAcquisition>;
  /** Liquida pelo valor apurado e devolve a diferença. */
  settle(scope: BudgetScope, reservationId: string, actualMicroUsd: number): Promise<void>;
  /** Garantia de que não houve cobrança: devolve tudo. */
  release(scope: BudgetScope, reservationId: string): Promise<void>;
  /** Custo incerto: mantém a reserva inteira até conciliação. */
  holdForReconciliation(scope: BudgetScope, reservationId: string): Promise<void>;
}

export type ModelCallCostStatus = "settled" | "not_charged" | "pending_reconciliation" | "not_reserved";

/** Uma linha por tentativa, inclusive falhas. Sem prompt, resposta ou PII. */
export type ModelCallRecord = {
  readonly invocationId: string;
  readonly attempt: number;
  /** `attemptCallId(action, invocationId, attempt)`: o id entregue ao adapter. */
  readonly callId: string;
  readonly tenantId: string;
  readonly workflowKey: string;
  readonly agentKey: string;
  readonly actionKey: string;
  readonly trace: TraceContext;
  /** Resumo HMAC da requisição material (`hmac-sha256:v1:<keyId>:<hex>`); nunca o conteúdo. */
  readonly requestFingerprint: string;
  readonly dataClassification: DataClassification;
  readonly classificationProvenance: readonly ClassificationProvenance[];
  readonly inputTokensEstimate: number;
  readonly inputTokensEstimateMethod: InputTokensEstimateMethod;
  readonly profileRef: string;
  readonly registryVersion: string;
  readonly modelId: string;
  readonly provider: string;
  readonly adapterKey: string;
  readonly providerModelId: string;
  readonly tariffVersion: string;
  readonly routingReason: "preferred" | "lowest_cost_above_threshold" | "fallback" | "retry";
  readonly fallbackOccurred: boolean;
  readonly resolvedProvider: string | null;
  readonly resolvedProviderModelId: string | null;
  readonly externalRequestId: string | null;
  readonly outcome: "succeeded" | "failed";
  readonly failureKind: string | null;
  readonly usage: ProviderUsage | null;
  /** Somente assets aceitos; `null` em qualquer saída descartada ou falha. */
  readonly outputAssetIds: readonly string[] | null;
  readonly estimatedCostMicroUsd: number;
  readonly costMicroUsd: number | null;
  readonly costStatus: ModelCallCostStatus;
  readonly startedAt: string;
  readonly latencyMs: number;
};

export interface ModelCallRecorderPort {
  record(entry: ModelCallRecord): Promise<void>;
}

/** Restrições do tenant. Nunca mais permissivas que o perfil. */
export type TenantAiPolicy = {
  readonly tenantId: string;
  readonly deniedProviders: readonly string[];
  readonly deniedModels: readonly string[];
  /** null significa "sem allowlist própria do tenant". */
  readonly allowedProviders: readonly string[] | null;
};

export interface TenantAiPolicyPort {
  forTenant(tenantId: string): Promise<TenantAiPolicy>;
}

export interface AiEntitlementPort {
  can(tenantId: string, entitlementKey: string): Promise<boolean>;
}

/** Disponibilidade em tempo de execução e kill switches operacionais. */
export type AvailabilitySnapshot = {
  readonly killSwitchedModels: readonly string[];
  readonly killSwitchedProviders: readonly string[];
  readonly killSwitchedAdapters: readonly string[];
  readonly unavailableModels: readonly string[];
};

export interface ModelAvailabilityPort {
  snapshot(): Promise<AvailabilitySnapshot>;
}

/** Prazo de uma chamada. O host implementa; o núcleo não conhece timers. */
export interface DeadlinePort {
  expireAfter(ms: number): { readonly expired: Promise<void>; cancel(): void };
}

/** Fonte verificável da classificação de dados de uma invocação. */
export const CLASSIFICATION_SOURCE_KINDS = ["context_package", "asset"] as const;
export type ClassificationSourceKind = (typeof CLASSIFICATION_SOURCE_KINDS)[number];
export type ClassificationSourceRef = { readonly kind: ClassificationSourceKind; readonly ref: string };

/** Como a classificação efetiva foi obtida. `conservative_default` quando não há fonte. */
export type ClassificationProvenance = {
  readonly kind: ClassificationSourceKind | "conservative_default";
  readonly ref: string | null;
  readonly tenantId: string;
  readonly classification: DataClassification;
};

export type ClassificationResolution =
  | { readonly ok: true; readonly classification: DataClassification; readonly provenance: readonly ClassificationProvenance[] }
  /** Inexistente ou de outro tenant: mesma resposta, sem revelar existência. */
  | { readonly ok: false; readonly reason: "source_not_found" };

/**
 * Porta confiável de classificação: lê a classificação registrada nas fontes
 * do próprio tenant (Context Package, metadados do asset). O chamador não é
 * autoridade sobre a classificação.
 */
export interface DataClassificationPort {
  resolve(input: { readonly tenantId: string; readonly sources: readonly ClassificationSourceRef[] }): Promise<ClassificationResolution>;
}

export type InputTokensEstimateMethod = "model_exact" | "conservative_bound" | "caller_hint";

/**
 * Estimador específico do modelo. Devolve `null` quando não há contagem
 * exata; o harness então usa a cota conservadora.
 */
export interface TokenEstimatorPort {
  estimateInputTokens(model: { readonly modelId: string; readonly adapterKey: string; readonly providerModelId: string },
    messages: readonly ModelMessage[]): { readonly tokens: number; readonly method: "exact" } | null;
}

/** Metadados de um asset gerado, lidos do armazenamento do tenant. */
export type GeneratedAssetDescriptor = {
  readonly assetId: string;
  readonly tenantId: string;
  readonly mediaType: VisualMediaType;
  readonly producedByCallId: string;
};

/**
 * Verificação dos assets visuais devolvidos pelo adapter. Sem esta porta a
 * capability visual fica bloqueada: não existe schema canônico de asset
 * (dependência declarada no CR-026).
 */
export interface GeneratedAssetPort {
  describe(tenantId: string, assetIds: readonly string[]): Promise<readonly (GeneratedAssetDescriptor | null)[]>;
}
