// Fakes em memória das portas do Product AI Model Harness. Voláteis e
// determinísticos; servem a testes unitários e nunca como persistência. O
// Cost Ledger persistido (CR-027) vive no Supabase local, em
// `@oplyra/infra/ai-model-harness`.
import type {
  AgentActionCatalog, AiEntitlementPort, AttemptAcquisition, AttemptAcquisitionRequest, AttemptCloseCommand,
  AttemptCloseResult, AvailabilitySnapshot, BudgetGuardPort,
  ClassificationProvenance, ClassificationResolution, ClassificationSourceRef, DataClassification, DataClassificationPort,
  GeneratedAssetDescriptor, GeneratedAssetPort, TokenEstimatorPort,
  BudgetScope, Clock, DeadlinePort, ModelAvailabilityPort, ModelCallRecord, ModelProviderPort,
  ProviderCall, ProviderCallResult, TenantAiPolicy, TenantAiPolicyPort,
} from "@oplyra/core";
import { ATTEMPT_CALL_ID_PATTERN, isQuantity, leaseSecondsFor, REQUEST_FINGERPRINT_PATTERN } from "@oplyra/core";

type Reserva = {
  readonly id: string;
  readonly tenantId: string;
  readonly workflowKey: string;
  readonly callId: string;
  readonly amount: number;
  status: "reserved" | "held" | "settled" | "released";
  actual: number;
  /** Resumo da requisição material; o conteúdo nunca chega aqui. */
  readonly fingerprint: string;
  readonly fencingToken: string;
  /** Derivado do prazo do perfil, como no adapter persistente. */
  readonly leaseSeconds: number;
  /** Comando de fechamento normalizado, para reconhecer replay exato. */
  fechamento: string | null;
};

/** Registros gravados pelo fechamento do fake; não é porta. */
export class InMemoryModelCallRecorder {
  readonly records: ModelCallRecord[] = [];
  ofTenant(tenantId: string) { return this.records.filter((r) => r.tenantId === tenantId); }
}

/**
 * Teto por tenant e, opcionalmente, por `tenant::workflow`. Tenant sem teto
 * configurado não tem período: tentativa nova é `budget_not_configured`.
 * O fechamento grava o registro no `recorder` junto com a transição.
 */
export class InMemoryBudgetGuard implements BudgetGuardPort {
  readonly #tenantLimits: ReadonlyMap<string, number>;
  readonly #workflowLimits: ReadonlyMap<string, number>;
  readonly #reservas = new Map<string, Reserva>();
  /** `[tenant, action, invocationId, tentativa]` → id: cada tentativa é adquirida no máximo uma vez. */
  readonly #porChave = new Map<string, string>();
  readonly recorder: InMemoryModelCallRecorder;
  #seq = 0;

  constructor(limits: { tenants: Record<string, number>; workflows?: Record<string, number> }, recorder = new InMemoryModelCallRecorder()) {
    this.#tenantLimits = new Map(Object.entries(limits.tenants));
    this.#workflowLimits = new Map(Object.entries(limits.workflows ?? {}));
    this.recorder = recorder;
  }

  #consumo(filtro: (r: Reserva) => boolean): number {
    let total = 0;
    for (const r of this.#reservas.values()) {
      if (!filtro(r)) continue;
      total += r.status === "released" ? 0 : r.status === "settled" ? r.actual : r.amount;
    }
    return total;
  }

  #saldo(scope: BudgetScope): number | null {
    const limiteTenant = this.#tenantLimits.get(scope.tenantId);
    if (limiteTenant === undefined) return null;
    const tenant = limiteTenant - this.#consumo((r) => r.tenantId === scope.tenantId);
    const chave = `${scope.tenantId}::${scope.workflowKey}`;
    const limite = this.#workflowLimits.get(chave);
    if (limite === undefined) return tenant;
    const wf = limite - this.#consumo((r) => r.tenantId === scope.tenantId && r.workflowKey === scope.workflowKey);
    return Math.min(tenant, wf);
  }

  async remaining(scope: BudgetScope) { return { remainingMicroUsd: this.#saldo(scope) }; }

  static #chave(tenantId: string, a: { actionKey: string; invocationId: string; number: number }) {
    // Array JSON: sem ambiguidade entre componentes, qualquer que seja o conteúdo.
    return JSON.stringify([tenantId, a.actionKey, a.invocationId, a.number]);
  }

  // Sem `await` entre verificar e gravar: no event loop, a aquisição é atômica.
  async acquireAttempt(pedido: AttemptAcquisitionRequest): Promise<AttemptAcquisition> {
    if (!isQuantity(pedido.amountMicroUsd)) throw new Error("valor de reserva inválido");
    if (!REQUEST_FINGERPRINT_PATTERN.test(pedido.requestFingerprint) || !pedido.acceptedFingerprints.includes(pedido.requestFingerprint)) {
      throw new Error("fingerprint inválido");
    }
    if (!ATTEMPT_CALL_ID_PATTERN.test(pedido.callId)) return { status: "invalid" };
    let leaseSeconds: number;
    try { leaseSeconds = leaseSecondsFor(pedido.profileTimeoutMs); } catch { return { status: "invalid" }; }
    const chave = InMemoryBudgetGuard.#chave(pedido.tenantId, pedido.attempt);
    const existente = this.#porChave.get(chave);
    if (existente) {
      const r = this.#reservas.get(existente)!;
      // Fingerprint antes do estado: requisição diferente é conflito mesmo com a tentativa aberta.
      if (!pedido.acceptedFingerprints.includes(r.fingerprint)) return { status: "conflict" };
      return r.status === "reserved" ? { status: "in_progress" } : { status: "closed" };
    }
    const saldo = this.#saldo(pedido);
    if (saldo === null) return { status: "budget_not_configured" };
    if (pedido.amountMicroUsd > saldo) return { status: "insufficient", remainingMicroUsd: Math.max(0, saldo) };
    const id = `res-${++this.#seq}`;
    const fencingToken = `fence-${this.#seq}`;
    this.#porChave.set(chave, id);
    this.#reservas.set(id, {
      id, tenantId: pedido.tenantId, workflowKey: pedido.workflowKey, callId: pedido.callId, amount: pedido.amountMicroUsd,
      status: "reserved", actual: 0, fingerprint: pedido.requestFingerprint, fencingToken, leaseSeconds, fechamento: null,
    });
    return { status: "acquired", fencingToken, leaseExpiresAt: `lease+${leaseSeconds}s` };
  }

  /** Mesmas regras do Ledger persistente: token atual, comando coerente, registro da própria tentativa, replay só exato. */
  async closeAttempt(c: AttemptCloseCommand): Promise<AttemptCloseResult> {
    const id = this.#porChave.get(InMemoryBudgetGuard.#chave(c.tenantId, c.attempt));
    const r = id ? this.#reservas.get(id) : undefined;
    if (!r || r.tenantId !== c.tenantId) return { status: "rejected" };
    const normalizado = JSON.stringify([c.fencingToken, c.outcome, c.actualMicroUsd, c.pendingReason, c.record]);
    if (r.status !== "reserved") return { status: r.fechamento === normalizado ? "duplicate" : "rejected" };
    if (c.fencingToken !== r.fencingToken) return { status: "rejected" };
    const coerente =
      (c.outcome === "charged" && isQuantity(c.actualMicroUsd) && c.pendingReason === null && c.record.costStatus === "settled") ||
      (c.outcome === "not_charged" && c.actualMicroUsd === 0 && c.pendingReason === null && c.record.costStatus === "not_charged") ||
      (c.outcome === "unknown" && c.actualMicroUsd === null && c.pendingReason !== null && c.record.costStatus === "pending_reconciliation");
    const doRegistro = c.record.tenantId === r.tenantId && c.record.callId === r.callId && c.record.requestFingerprint === r.fingerprint &&
      c.record.costMicroUsd === c.actualMicroUsd && c.record.classificationProvenance.every((p) => p.tenantId === r.tenantId);
    if (!coerente || !doRegistro) return { status: "rejected" };
    r.status = c.outcome === "charged" ? "settled" : c.outcome === "not_charged" ? "released" : "held";
    r.actual = c.actualMicroUsd ?? 0;
    r.fechamento = normalizado;
    this.recorder.records.push(c.record);
    return { status: "closed" };
  }

  reservations(tenantId: string): readonly Readonly<Reserva>[] {
    return [...this.#reservas.values()].filter((r) => r.tenantId === tenantId);
  }
}

export function inMemoryAgentActionCatalog(
  bindings: Record<string, readonly string[]>, source = "in-memory",
): AgentActionCatalog {
  const acoes = new Set(Object.values(bindings).flat());
  return {
    source,
    hasAgent: (a) => a in bindings,
    hasAction: (x) => acoes.has(x),
    canAgentCallAction: (a, x) => bindings[a]?.includes(x) ?? false,
  };
}

export class InMemoryTenantAiPolicies implements TenantAiPolicyPort {
  readonly #porTenant: Map<string, Omit<TenantAiPolicy, "tenantId">>;
  constructor(porTenant: Record<string, Partial<Omit<TenantAiPolicy, "tenantId">>> = {}) {
    this.#porTenant = new Map(Object.entries(porTenant).map(([t, p]) => [t, {
      deniedProviders: p.deniedProviders ?? [], deniedModels: p.deniedModels ?? [], allowedProviders: p.allowedProviders ?? null,
    }]));
  }
  async forTenant(tenantId: string): Promise<TenantAiPolicy> {
    return { tenantId, ...(this.#porTenant.get(tenantId) ?? { deniedProviders: [], deniedModels: [], allowedProviders: null }) };
  }
}

export class SetAiEntitlements implements AiEntitlementPort {
  readonly #concedidos: Set<string>;
  constructor(concedidos: readonly `${string}::${string}`[] = []) { this.#concedidos = new Set(concedidos); }
  async can(tenantId: string, key: string) { return this.#concedidos.has(`${tenantId}::${key}`); }
}

export class FixedAvailability implements ModelAvailabilityPort {
  snapshotValue: AvailabilitySnapshot;
  constructor(parcial: Partial<AvailabilitySnapshot> = {}) {
    this.snapshotValue = {
      killSwitchedModels: [], killSwitchedProviders: [], killSwitchedAdapters: [], unavailableModels: [], ...parcial,
    };
  }
  async snapshot() { return this.snapshotValue; }
}

/** Relógio que avança um passo fixo a cada leitura: latência determinística. */
export function steppingClock(inicio = "2026-09-29T12:00:00.000Z", passoMs = 5): Clock {
  let t = new Date(inicio).getTime();
  return { now: () => { const d = new Date(t); t += passoMs; return d; } };
}

type Roteiro = (call: ProviderCall) => ProviderCallResult | Promise<ProviderCallResult>;

/** Provider roteirizado por modelo; registra chamadas sem guardar o conteúdo. */
export class ScriptedModelProvider implements ModelProviderPort {
  readonly adapterKey: string;
  readonly calls: { callId: string; providerModelId: string; parameters: ProviderCall["parameters"]; responseFormat: string }[] = [];
  readonly #roteiros: Map<string, Roteiro[]>;
  readonly #contagem = new Map<string, number>();

  constructor(adapterKey: string, roteiros: Record<string, Roteiro | readonly Roteiro[]> = {}) {
    this.adapterKey = adapterKey;
    this.#roteiros = new Map(Object.entries(roteiros).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v as Roteiro]]));
  }

  async invoke(call: ProviderCall): Promise<ProviderCallResult> {
    this.calls.push({ callId: call.callId, providerModelId: call.providerModelId, parameters: call.parameters, responseFormat: call.responseFormat });
    const lista = this.#roteiros.get(call.providerModelId);
    const n = this.#contagem.get(call.providerModelId) ?? 0;
    this.#contagem.set(call.providerModelId, n + 1);
    const roteiro = lista?.[Math.min(n, lista.length - 1)];
    return roteiro ? roteiro(call) : scripted.success()(call);
  }
}

const provedorDe = (providerModelId: string): string => providerModelId.split("/")[0] ?? providerModelId;

export const scripted = {
  success: (texto?: string, extra: Partial<Extract<ProviderCallResult, { ok: true }>> = {}): Roteiro => (call) => ({
    ok: true,
    output: { modality: "text", text: texto ?? (call.responseFormat === "json" ? JSON.stringify({ ok: true }) : "ok") },
    usage: { inputTokens: 100, outputTokens: 50, images: 0 },
    resolvedProvider: provedorDe(call.providerModelId),
    resolvedProviderModelId: call.providerModelId,
    ignoredParameters: [],
    externalRequestId: `ext-${call.callId}`,
    billing: { kind: "charged", reportedCostMicroUsd: null },
    ...extra,
  }),
  /**
   * Sucesso visual: grava `quantidade` assets no fake de assets, no tenant e
   * na tentativa do escopo, e devolve só as referências.
   */
  visual: (assets: InMemoryGeneratedAssets, quantidade?: number, extra: Partial<Extract<ProviderCallResult, { ok: true }>> = {}): Roteiro => (call) => {
    const escopo = call.visualOutputScope;
    if (!escopo) throw new Error("rota visual sem escopo de saída");
    const n = quantidade ?? call.requestedImages;
    const refs = Array.from({ length: n }, (_, i) => assets.store(escopo.tenantId, escopo.callId, `${escopo.callId}/img-${i + 1}`, "image/png"));
    return {
      ok: true,
      output: { modality: "visual", assets: refs.map((r) => ({ assetId: r.assetId, mediaType: r.mediaType })) },
      usage: { inputTokens: 100, outputTokens: 0, images: n },
      resolvedProvider: provedorDe(call.providerModelId),
      resolvedProviderModelId: call.providerModelId,
      ignoredParameters: [],
      externalRequestId: `ext-${call.callId}`,
      billing: { kind: "charged", reportedCostMicroUsd: null },
      ...extra,
    };
  },
  failure: (errorKind: Extract<ProviderCallResult, { ok: false }>["errorKind"], billing: ProviderCallResult["billing"] = { kind: "none" }): Roteiro =>
    () => ({ ok: false, errorKind, externalRequestId: null, billing }),
  throws: (): Roteiro => () => { throw new Error("falha do adapter"); },
};

/**
 * Prazo manual: nada expira sozinho. `expireAll()` faz expirar os prazos
 * pendentes, sem depender de tempo real.
 */
export class ManualDeadline implements DeadlinePort {
  readonly #pendentes = new Set<() => void>();
  expireAfter(_ms: number) {
    let disparar!: () => void;
    const expired = new Promise<void>((resolve) => { disparar = resolve; });
    this.#pendentes.add(disparar);
    return { expired, cancel: () => { this.#pendentes.delete(disparar); } };
  }
  get pending() { return this.#pendentes.size; }
  expireAll() { for (const d of this.#pendentes) d(); this.#pendentes.clear(); }
}

/**
 * Classificação registrada por fonte e tenant, como leria do Context Package
 * ou dos metadados do asset. Fonte de outro tenant responde como inexistente.
 */
export class InMemoryDataClassifier implements DataClassificationPort {
  readonly #fontes = new Map<string, { tenantId: string; classification: DataClassification }>();
  readonly consultas: { tenantId: string; sources: readonly ClassificationSourceRef[] }[] = [];
  register(tenantId: string, source: ClassificationSourceRef, classification: DataClassification): this {
    this.#fontes.set(`${tenantId}|${source.kind}:${source.ref}`, { tenantId, classification });
    return this;
  }
  async resolve(input: { tenantId: string; sources: readonly ClassificationSourceRef[] }): Promise<ClassificationResolution> {
    this.consultas.push(input);
    const provenance: ClassificationProvenance[] = [];
    for (const s of input.sources) {
      const f = this.#fontes.get(`${input.tenantId}|${s.kind}:${s.ref}`);
      if (!f) return { ok: false, reason: "source_not_found" };
      provenance.push({ kind: s.kind, ref: s.ref, tenantId: f.tenantId, classification: f.classification });
    }
    const ordem: DataClassification[] = ["synthetic", "internal", "tenant_confidential", "personal_data"];
    const classification = provenance.reduce<DataClassification>((c, p) => (ordem.indexOf(p.classification) > ordem.indexOf(c) ? p.classification : c), "synthetic");
    return { ok: true, classification, provenance };
  }
}

/** Assets gerados por tenant, com a tentativa que os produziu. */
export class InMemoryGeneratedAssets implements GeneratedAssetPort {
  readonly #porId = new Map<string, GeneratedAssetDescriptor>();
  store(tenantId: string, producedByCallId: string, assetId: string, mediaType: GeneratedAssetDescriptor["mediaType"]): GeneratedAssetDescriptor {
    const d = { assetId, tenantId, mediaType, producedByCallId };
    this.#porId.set(assetId, d);
    return d;
  }
  /** Devolve metadados de qualquer tenant: o harness é quem recusa o cruzamento. */
  async describe(_tenantId: string, assetIds: readonly string[]) {
    return assetIds.map((id) => this.#porId.get(id) ?? null);
  }
}

/** Estimador "exato" roteirizado por modelo, para exercitar a porta. */
export class FixedTokenEstimator implements TokenEstimatorPort {
  readonly #porModelo: ReadonlyMap<string, number>;
  constructor(porModelo: Record<string, number>) { this.#porModelo = new Map(Object.entries(porModelo)); }
  estimateInputTokens(model: { modelId: string }) {
    const t = this.#porModelo.get(model.modelId);
    return t === undefined ? null : { tokens: t, method: "exact" as const };
  }
}
