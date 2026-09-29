// Caso de uso: executar uma chamada de modelo para `agent + action`.
//
// O chamador informa quem pede, o quê e de onde vêm os dados; nunca modelo,
// fornecedor, parâmetros de amostragem, classificação autoritativa ou
// estimativa autoritativa de tokens. Cada tentativa, inclusive retry e
// fallback, passa de novo pelo Router com orçamento e disponibilidade
// atualizados, adquire a tentativa (com fingerprint) junto com a reserva de
// orçamento, valida a resposta do adapter antes de liquidar e deixa registro.
import { harnessFailure } from "./outcomes.ts";
import type { HarnessFailure, HarnessFailureKind } from "./outcomes.ts";
import { DATA_CLASSIFICATIONS, estimateWorstCaseMicroUsd, IMAGE_CAPABILITIES } from "./model-registry.ts";
import type { DataClassification, InputModality, ModelDescriptor } from "./model-registry.ts";
import { profileRef } from "./model-profile.ts";
import type { ModelHarnessConfig, ModelProfile } from "./model-profile.ts";
import { routeModelCall } from "./router.ts";
import {
  attemptCallId, canonicalRequestMaterial, classificationRank, conservativeInputTokenBound, isQuantity, moreSensitive,
  REQUEST_FINGERPRINT_PATTERN, validateImageRequest, validateInvocationRequest, validateProviderResult,
} from "./invocation-validation.ts";
import type { TraceContext } from "./invocation-validation.ts";
import type {
  AiEntitlementPort, BudgetGuardPort, BudgetScope, ClassificationProvenance, ClassificationSourceRef,
  DataClassificationPort, DeadlinePort, GeneratedAssetDescriptor, GeneratedAssetPort, InputTokensEstimateMethod,
  ModelAvailabilityPort, ModelCallCostStatus, ModelCallRecord, ModelCallRecorderPort, ModelMessage,
  ModelProviderPort, ProviderCallResult, ProviderErrorKind, ProviderUsage, ProviderVisualAsset, RequestFingerprint,
  RequestFingerprintPort, TenantAiPolicy, TenantAiPolicyPort, TokenEstimatorPort,
} from "./ports.ts";
import type { Clock } from "../application/ports.ts";

export type ModelInvocationRequest = {
  /** Escopo de idempotência (com o tenant): a mesma chave exige a mesma requisição material. */
  readonly invocationId: string;
  readonly tenantId: string;
  readonly workflowKey: string;
  readonly agentKey: string;
  readonly actionKey: string;
  readonly trace: TraceContext;
  /**
   * Proveniência da classificação. As fontes são resolvidas por uma porta
   * confiável; `declared` só pode elevar a classificação verificada, nunca
   * rebaixá-la. Sem fontes, vale o default conservador `personal_data`.
   */
  readonly classification: {
    readonly sources: readonly ClassificationSourceRef[];
    readonly declared: DataClassification | null;
  };
  readonly messages: readonly ModelMessage[];
  readonly inputModalities: readonly InputModality[];
  /** Dica não autoritativa: só pode aumentar a estimativa usada na reserva. */
  readonly inputTokensHint?: number;
  /** Obrigatório (>= 1) em rota visual; ausente ou 0 nas demais. */
  readonly requestedImages?: number;
};

/**
 * Saída pública por modalidade. Rota visual devolve só `{assetId, mediaType}`:
 * tenant e proveniência ficam no descriptor interno do `GeneratedAssetPort`.
 */
export type ModelInvocationOutput =
  | { readonly modality: "text"; readonly text: string; readonly json?: Readonly<Record<string, unknown>> }
  | { readonly modality: "visual"; readonly assets: readonly ProviderVisualAsset[] };

export type ModelInvocationSuccess = {
  readonly ok: true;
  readonly output: ModelInvocationOutput;
  readonly modelId: string;
  readonly provider: string;
  readonly profileRef: string;
  readonly attempts: number;
  readonly fallbackOccurred: boolean;
  readonly usage: ProviderUsage;
  readonly costMicroUsd: number | null;
};

export type ModelInvocationResult = ModelInvocationSuccess | { readonly ok: false; readonly failure: HarnessFailure };

export type ModelInvocationDeps = {
  readonly config: ModelHarnessConfig;
  /** Somente os adapters presentes aqui estão habilitados neste ambiente. */
  readonly providers: ReadonlyMap<string, ModelProviderPort>;
  readonly budget: BudgetGuardPort;
  readonly recorder: ModelCallRecorderPort;
  readonly tenantPolicies: TenantAiPolicyPort;
  readonly entitlements: AiEntitlementPort;
  readonly availability: ModelAvailabilityPort;
  readonly clock: Clock;
  readonly deadline: DeadlinePort;
  readonly classifier: DataClassificationPort;
  /** Resumo protegido da requisição material (HMAC com chave identificada). */
  readonly fingerprints: RequestFingerprintPort;
  /** Sem estimador, toda estimativa usa a cota conservadora. */
  readonly tokenEstimator?: TokenEstimatorPort;
  /** Sem esta porta a capability visual fica bloqueada. */
  readonly generatedAssets?: GeneratedAssetPort;
};

const ERRO_PROVIDER: Record<ProviderErrorKind, HarnessFailureKind> = {
  timeout: "provider_timeout",
  rate_limited: "provider_rate_limited",
  unavailable: "provider_unavailable",
  rejected_request: "provider_rejected_request",
};
const RETRYABLE: ReadonlySet<HarnessFailureKind> = new Set(["provider_timeout", "provider_rate_limited", "provider_unavailable"]);
/** Falhas que tornam o adapter não confiável nesta invocação: sem fallback. */
const TERMINAIS: ReadonlySet<HarnessFailureKind> = new Set(["resolution_mismatch", "provider_response_invalid", "tenant_mismatch"]);

const falha = (kind: HarnessFailureKind, message: string, extra: Parameters<typeof harnessFailure>[2] = {}): ModelInvocationResult =>
  ({ ok: false, failure: harnessFailure(kind, message, extra) });

function objetoJson(texto: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(texto);
    return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * O prazo do perfil vale mesmo que o adapter não o respeite. Resposta que
 * chegue depois é descartada; a cobrança fica incerta, nunca zero.
 */
async function comPrazo(deadline: DeadlinePort, chamar: () => Promise<ProviderCallResult>, ms: number): Promise<unknown> {
  const prazo = deadline.expireAfter(ms);
  const expirou = prazo.expired.then((): ProviderCallResult =>
    ({ ok: false, errorKind: "timeout", externalRequestId: null, billing: { kind: "unknown" } }));
  try {
    return await Promise.race([Promise.resolve().then(chamar), expirou]);
  } finally {
    prazo.cancel();
  }
}

type Classificacao = { readonly effective: DataClassification; readonly provenance: readonly ClassificationProvenance[] };

/** Classificação efetiva a partir de fontes verificadas; o chamador só pode elevá-la. */
async function classificar(deps: ModelInvocationDeps, req: ModelInvocationRequest): Promise<Classificacao | ModelInvocationResult> {
  const { sources, declared } = req.classification;
  let effective: DataClassification;
  let provenance: readonly ClassificationProvenance[];
  if (sources.length === 0) {
    effective = "personal_data";
    provenance = [{ kind: "conservative_default", ref: null, tenantId: req.tenantId, classification: effective }];
  } else {
    const r = await deps.classifier.resolve({ tenantId: req.tenantId, sources });
    if (!r.ok) return falha("classification_source_not_found", "fonte de classificação não encontrada no escopo do tenant");
    if (r.provenance.some((p) => p.tenantId !== req.tenantId)) return falha("tenant_mismatch", "classificação resolvida em outro tenant");
    const validas = (c: unknown): c is DataClassification => (DATA_CLASSIFICATIONS as readonly unknown[]).includes(c);
    const cobertas = sources.every((s) => r.provenance.some((p) => p.kind === s.kind && p.ref === s.ref && validas(p.classification)));
    if (!validas(r.classification) || !cobertas) {
      return falha("classification_source_not_found", "fonte de classificação sem classificação verificada");
    }
    effective = r.provenance.reduce((c, p) => moreSensitive(c, p.classification), r.classification);
    provenance = r.provenance;
  }
  if (declared !== null) {
    if (classificationRank(declared) < classificationRank(effective)) {
      return falha("invalid_request", "classificação declarada abaixo da verificada", {
        issues: ["classification.declared: abaixo da classificação verificada; downgrade proibido"],
      });
    }
    effective = declared;
  }
  return { effective, provenance };
}

export async function invokeModel(deps: ModelInvocationDeps, req: ModelInvocationRequest): Promise<ModelInvocationResult> {
  const bruto = req as unknown as Record<string, unknown> | null;
  if (typeof bruto?.tenantId !== "string" || bruto.tenantId.trim() === "") {
    return falha("tenant_required", "chamada de modelo sem tenantId");
  }
  const estrutura = validateInvocationRequest(req);
  if (estrutura.length > 0) return falha("invalid_request", "pedido de invocação inválido", { issues: estrutura });

  const { catalog } = deps.config;
  if (!catalog.hasAgent(req.agentKey)) return falha("agent_not_found", `agent não registrado: ${req.agentKey}`);
  if (!catalog.hasAction(req.actionKey)) return falha("action_not_found", `action não registrada: ${req.actionKey}`);
  if (!catalog.canAgentCallAction(req.agentKey, req.actionKey)) {
    return falha("action_not_callable_by_agent", `${req.agentKey} não pode executar ${req.actionKey}`);
  }

  const profile = deps.config.activeProfile(req.agentKey, req.actionKey);
  if (!profile) return falha("profile_not_found", `sem Model Profile ativo para ${req.agentKey}/${req.actionKey}`);

  const imageRoute = IMAGE_CAPABILITIES.has(profile.requirements.capability);
  const imagens = validateImageRequest(imageRoute, req.requestedImages);
  if (imagens.length > 0) return falha("invalid_request", "quantidade de imagens incompatível com a rota", { issues: imagens });
  if (imageRoute && !deps.generatedAssets) {
    return falha("visual_capability_blocked", "saída visual bloqueada até existir contrato canônico de asset (CR-026)");
  }

  if (profile.requiredEntitlement !== null && !(await deps.entitlements.can(req.tenantId, profile.requiredEntitlement))) {
    return falha("entitlement_required", `entitlement ausente: ${profile.requiredEntitlement}`);
  }

  const tenantPolicy = await deps.tenantPolicies.forTenant(req.tenantId);
  if (tenantPolicy.tenantId !== req.tenantId) return falha("tenant_mismatch", "política de IA pertence a outro tenant");

  const classificacao = await classificar(deps, req);
  if ("ok" in classificacao) return classificacao;

  const fingerprint = await deps.fingerprints.fingerprint(canonicalRequestMaterial({
    tenantId: req.tenantId, workflowKey: req.workflowKey, agentKey: req.agentKey, actionKey: req.actionKey,
    profileRef: profileRef(profile), effectiveClassification: classificacao.effective,
    declaredClassification: req.classification.declared, classificationSources: req.classification.sources,
    inputModalities: req.inputModalities, requestedImages: req.requestedImages ?? 0, messages: req.messages,
  }));
  // Porta fora do contrato é defeito de infraestrutura: nada é adquirido nem chamado.
  if (!REQUEST_FINGERPRINT_PATTERN.test(fingerprint.primary) || !fingerprint.accepted.includes(fingerprint.primary) ||
    fingerprint.accepted.some((f) => !REQUEST_FINGERPRINT_PATTERN.test(f))) {
    throw new Error("RequestFingerprintPort devolveu fingerprint fora do formato protegido");
  }

  return executarTentativas(deps, req, profile, tenantPolicy, { ...classificacao, fingerprint, imageRoute });
}

type Estimativa = { readonly tokens: number; readonly method: InputTokensEstimateMethod };

/**
 * Estimativa de entrada por candidato: contagem exata do modelo quando a
 * porta a fornece; senão, cota conservadora. A dica do chamador só eleva.
 */
function estimarPorModelo(deps: ModelInvocationDeps, req: ModelInvocationRequest, profile: ModelProfile): Map<string, Estimativa> {
  const cota = conservativeInputTokenBound(req.messages);
  const dica = req.inputTokensHint ?? 0;
  const mapa = new Map<string, Estimativa>();
  for (const id of profile.routing.candidates) {
    const model = deps.config.model(id);
    if (!model) continue;
    const exata = deps.tokenEstimator?.estimateInputTokens(model, req.messages) ?? null;
    const base: Estimativa = exata && exata.method === "exact" && isQuantity(exata.tokens)
      ? { tokens: exata.tokens, method: "model_exact" }
      : { tokens: cota, method: "conservative_bound" };
    mapa.set(id, dica > base.tokens ? { tokens: dica, method: "caller_hint" } : base);
  }
  return mapa;
}

type Liquidacao = { readonly costMicroUsd: number | null; readonly costStatus: ModelCallCostStatus };

/** Liquida somente valores validados; o resto fica pendente de conciliação. */
async function liquidar(
  deps: ModelInvocationDeps, scope: BudgetScope, reservationId: string, model: ModelDescriptor,
  resultado: ProviderCallResult | null,
): Promise<Liquidacao> {
  const pendente = async (): Promise<Liquidacao> => {
    await deps.budget.holdForReconciliation(scope, reservationId);
    return { costMicroUsd: null, costStatus: "pending_reconciliation" };
  };
  if (!resultado) return pendente();
  const billing = resultado.billing;
  if (billing.kind === "none") {
    await deps.budget.release(scope, reservationId);
    return { costMicroUsd: 0, costStatus: "not_charged" };
  }
  if (billing.kind === "unknown") return pendente();
  const custo = billing.reportedCostMicroUsd
    ?? (resultado.ok && model.tariff ? estimateWorstCaseMicroUsd(model.tariff, resultado.usage) : null);
  // Estouro aritmético ou custo não calculável não é liquidado.
  if (custo === null || !isQuantity(custo)) return pendente();
  await deps.budget.settle(scope, reservationId, custo);
  return { costMicroUsd: custo, costStatus: "settled" };
}

type VerificacaoVisual = { readonly issues: string[]; readonly tenantMismatch: boolean; readonly assets: GeneratedAssetDescriptor[] };

/** Cada asset devolvido precisa existir no tenant, ter o formato declarado e ter sido produzido por esta tentativa. */
async function verificarAssets(
  port: GeneratedAssetPort, tenantId: string, callId: string, entregues: readonly { assetId: string; mediaType: string }[],
): Promise<VerificacaoVisual> {
  const descritos = await port.describe(tenantId, entregues.map((a) => a.assetId));
  const issues: string[] = [];
  let tenantMismatch = false;
  const assets: GeneratedAssetDescriptor[] = [];
  entregues.forEach((a, i) => {
    const d = descritos[i];
    if (!d || d.assetId !== a.assetId) { issues.push(`output.assets[${i}]: asset não encontrado no tenant`); return; }
    if (d.tenantId !== tenantId) { tenantMismatch = true; return; }
    if (d.producedByCallId !== callId) issues.push(`output.assets[${i}]: produzido por outra tentativa`);
    if (d.mediaType !== a.mediaType) issues.push(`output.assets[${i}].mediaType: diverge do asset gravado`);
    assets.push(d);
  });
  if (descritos.length !== entregues.length) issues.push("output.assets: verificação incompleta");
  return { issues, tenantMismatch, assets };
}

type Contexto = Classificacao & { readonly fingerprint: RequestFingerprint; readonly imageRoute: boolean };

async function executarTentativas(
  deps: ModelInvocationDeps, req: ModelInvocationRequest, profile: ModelProfile, tenantPolicy: TenantAiPolicy, ctx: Contexto,
): Promise<ModelInvocationResult> {
  const scope: BudgetScope = { tenantId: req.tenantId, workflowKey: req.workflowKey };
  const excluidos: string[] = [];
  const retries = new Map<string, number>();
  const enabledAdapters = [...deps.providers.keys()];
  const requestedImages = req.requestedImages ?? 0;
  const { imageRoute } = ctx;
  const trace: TraceContext = { ...req.trace };
  const estimativas = estimarPorModelo(deps, req, profile);
  const inputTokensByModel = new Map([...estimativas].map(([id, e]) => [id, e.tokens] as const));
  let ultimoModelo: string | null = null;
  let ultimaFalha: HarnessFailureKind | null = null;

  for (let attempt = 1; attempt <= profile.limits.maxAttempts; attempt++) {
    const [{ remainingMicroUsd }, availability] = await Promise.all([deps.budget.remaining(scope), deps.availability.snapshot()]);
    const decisao = routeModelCall(
      {
        tenantId: req.tenantId, dataClassification: ctx.effective, inputModalities: req.inputModalities,
        estimatedInputTokens: conservativeInputTokenBound(req.messages), inputTokensByModel,
        requestedImages, excludedModelIds: excluidos,
      },
      {
        profile, lookupModel: deps.config.model, enabledAdapters, tenantPolicy, availability,
        remainingBudgetMicroUsd: remainingMicroUsd,
      },
    );

    if (!decisao.ok) {
      const tentativas = attempt - 1;
      if (decisao.failure === "tenant_mismatch") return falha("tenant_mismatch", "política de IA pertence a outro tenant");
      if (decisao.failure === "budget_exceeded") {
        return falha("budget_exceeded", "nenhum candidato compatível cabe no orçamento", { rejections: decisao.rejections, attempts: tentativas });
      }
      if (tentativas > 0 && ultimaFalha) {
        return falha("attempts_exhausted", "candidatos compatíveis esgotados", {
          rejections: decisao.rejections, attempts: tentativas, lastAttemptKind: ultimaFalha,
        });
      }
      return falha("no_eligible_model", "nenhum modelo compatível com o perfil e as políticas", { rejections: decisao.rejections, attempts: 0 });
    }

    const { model, estimatedCostMicroUsd } = decisao.selected;
    const estimativa = estimativas.get(model.modelId)!;
    const provider = deps.providers.get(model.adapterKey);
    if (!provider) return falha("no_eligible_model", `adapter não habilitado: ${model.adapterKey}`, { attempts: attempt - 1 });

    // Aquisição atômica no escopo tenant + action + invocationId + tentativa, com fingerprint.
    const callId = attemptCallId(req.tenantId, req.actionKey, req.invocationId, attempt);
    const aquisicao = await deps.budget.acquireAttempt({
      ...scope, attempt: { actionKey: req.actionKey, invocationId: req.invocationId, number: attempt },
      requestFingerprint: ctx.fingerprint.primary, acceptedFingerprints: ctx.fingerprint.accepted,
      amountMicroUsd: estimatedCostMicroUsd,
    });
    switch (aquisicao.status) {
      case "acquired": break;
      case "conflict":
        return falha("idempotency_conflict", `${req.invocationId} já foi usado em ${req.actionKey} para uma requisição materialmente diferente`, { attempts: attempt - 1 });
      case "in_progress":
        return falha("attempt_in_progress", `tentativa ${callId} em andamento em outra execução`, { attempts: attempt - 1 });
      case "closed":
        return falha("attempt_already_executed", `tentativa ${callId} já foi executada`, { attempts: attempt - 1 });
      case "insufficient":
        return falha("budget_exceeded", "reserva de orçamento negada", { attempts: attempt - 1 });
    }
    const { reservationId } = aquisicao;

    const routingReason = ultimoModelo === model.modelId ? "retry" : decisao.reason;
    ultimoModelo = model.modelId;
    const inicio = deps.clock.now();
    let bruto: unknown;
    try {
      bruto = await comPrazo(deps.deadline, () => provider.invoke({
        callId,
        providerModelId: model.providerModelId,
        messages: req.messages,
        inputModalities: req.inputModalities,
        parameters: { ...profile.sampling, maxOutputTokens: profile.maxOutputTokens },
        responseFormat: !imageRoute && profile.requirements.structuredOutput ? "json" : "text",
        requestedImages,
        timeoutMs: profile.limits.timeoutMs,
        dataClassification: ctx.effective,
        ...(imageRoute ? { visualOutputScope: { tenantId: req.tenantId, callId } } : {}),
      }), profile.limits.timeoutMs);
    } catch {
      // Adapter que lança não prova ausência de cobrança.
      bruto = { ok: false, errorKind: "unavailable", externalRequestId: null, billing: { kind: "unknown" } };
    }
    const latencyMs = Math.max(0, deps.clock.now().getTime() - inicio.getTime());

    // Resposta validada (estrutura e, em rota visual, assets no tenant) antes de qualquer liquidação.
    const problemas = validateProviderResult(bruto, { maxOutputTokens: profile.maxOutputTokens, requestedImages, imageRoute });
    let visual: VerificacaoVisual | null = null;
    const estruturado = problemas.length === 0 ? (bruto as ProviderCallResult) : null;
    if (estruturado?.ok && estruturado.output.modality === "visual" && deps.generatedAssets) {
      visual = await verificarAssets(deps.generatedAssets, req.tenantId, callId, estruturado.output.assets);
      problemas.push(...visual.issues);
    }
    const resultado = problemas.length === 0 && !visual?.tenantMismatch ? estruturado : null;
    const { costMicroUsd, costStatus } = await liquidar(deps, scope, reservationId, model, resultado);

    // Verificações pós-chamada: contrato do adapter, modelo efetivo, parâmetros, formato.
    let failureKind: HarnessFailureKind | null = null;
    let outputJson: Record<string, unknown> | null = null;
    if (visual?.tenantMismatch) {
      failureKind = "tenant_mismatch";
    } else if (!resultado) {
      failureKind = "provider_response_invalid";
    } else if (!resultado.ok) {
      failureKind = ERRO_PROVIDER[resultado.errorKind];
    } else if (resultado.resolvedProviderModelId !== model.providerModelId || resultado.resolvedProvider !== model.provider) {
      failureKind = "resolution_mismatch";
    } else if (resultado.ignoredParameters.length > 0) {
      failureKind = "parameter_not_applied";
    } else if (resultado.output.modality === "text" && profile.requirements.structuredOutput) {
      outputJson = objetoJson(resultado.output.text);
      if (!outputJson) failureKind = "output_invalid";
    }

    const sucesso = resultado?.ok ? resultado : null;
    // Somente assets aceitos: qualquer falha ou descarte registra null, para
    // que id de outro tenant ou de outra tentativa nunca entre no registro.
    const aceitos: readonly ProviderVisualAsset[] | null = failureKind === null && visual
      ? visual.assets.map((d) => ({ assetId: d.assetId, mediaType: d.mediaType }))
      : null;
    const registro: ModelCallRecord = {
      invocationId: req.invocationId, attempt, callId, tenantId: req.tenantId, workflowKey: req.workflowKey,
      agentKey: req.agentKey, actionKey: req.actionKey, trace,
      requestFingerprint: ctx.fingerprint.primary, dataClassification: ctx.effective, classificationProvenance: ctx.provenance,
      inputTokensEstimate: estimativa.tokens, inputTokensEstimateMethod: estimativa.method,
      profileRef: profileRef(profile), registryVersion: deps.config.registryVersion,
      modelId: model.modelId, provider: model.provider, adapterKey: model.adapterKey, providerModelId: model.providerModelId,
      tariffVersion: model.tariff?.tariffVersion ?? "none",
      routingReason, fallbackOccurred: excluidos.length > 0 || decisao.reason === "fallback",
      resolvedProvider: sucesso?.resolvedProvider ?? null,
      resolvedProviderModelId: sucesso?.resolvedProviderModelId ?? null,
      externalRequestId: estruturado?.externalRequestId ?? null,
      outcome: failureKind === null ? "succeeded" : "failed",
      failureKind, usage: sucesso?.usage ?? null, outputAssetIds: aceitos ? aceitos.map((a) => a.assetId) : null,
      estimatedCostMicroUsd, costMicroUsd, costStatus,
      startedAt: inicio.toISOString(), latencyMs,
    };
    await deps.recorder.record(registro);

    if (failureKind === null && sucesso) {
      const output: ModelInvocationOutput = sucesso.output.modality === "visual"
        ? { modality: "visual", assets: aceitos ?? [] }
        : { modality: "text", text: sucesso.output.text, ...(outputJson ? { json: outputJson } : {}) };
      return {
        ok: true, output,
        modelId: model.modelId, provider: model.provider, profileRef: registro.profileRef,
        attempts: attempt, fallbackOccurred: registro.fallbackOccurred, usage: sucesso.usage, costMicroUsd,
      };
    }

    ultimaFalha = failureKind;
    if (failureKind !== null && TERMINAIS.has(failureKind)) {
      const mensagens: Partial<Record<HarnessFailureKind, string>> = {
        provider_response_invalid: `resposta do adapter fora do contrato: ${model.modelId}`,
        resolution_mismatch: `adapter devolveu modelo diferente do roteado: ${model.modelId}`,
        tenant_mismatch: "asset visual pertence a outro tenant",
      };
      return falha(failureKind, mensagens[failureKind] ?? failureKind, { attempts: attempt, ...(problemas.length > 0 ? { issues: problemas } : {}) });
    }
    const usados = retries.get(model.modelId) ?? 0;
    if (failureKind !== null && RETRYABLE.has(failureKind) && usados < profile.limits.maxRetriesPerModel) {
      retries.set(model.modelId, usados + 1);
    } else {
      excluidos.push(model.modelId);
    }
  }

  return falha("attempts_exhausted", "limite de tentativas do perfil atingido", {
    attempts: profile.limits.maxAttempts, ...(ultimaFalha ? { lastAttemptKind: ultimaFalha } : {}),
  });
}
