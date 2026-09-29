// Composition root local/CI do Product AI Model Harness. Habilita somente o
// Test Adapter; não lê variáveis de ambiente, não conhece chave de gateway e
// não tem caminho para adapter real. Ativar um adapter real exige outra
// composição, conta, chave, budget e autorização próprios.
import { buildModelHarnessConfig, invokeModel } from "@oplyra/core";
import type {
  AgentActionCatalog, AiEntitlementPort, AvailabilitySnapshot, BudgetGuardPort, Clock, DataClassificationPort, DeadlinePort,
  RequestFingerprintPort,
  ModelAvailabilityPort, ModelHarnessConfig, ModelInvocationRequest,
  ModelInvocationResult, ModelProfile, ModelProviderPort, ModelRegistry, TenantAiPolicy, TenantAiPolicyPort,
} from "@oplyra/core";
import { loadFrozenAgentActionCatalog } from "./frozen-registry-catalog.ts";
import { LOCAL_TEST_MODEL_REGISTRY } from "./local-test-catalog.ts";
import { loadModelProfileRegistry } from "./model-profile-registry.ts";
import { TestModelProviderAdapter, testModelTokenEstimator } from "./test-model-provider.ts";

export class ModelHarnessConfigurationError extends Error {
  readonly issues: readonly { path: string; problem: string }[];
  constructor(issues: readonly { path: string; problem: string }[]) {
    super(`configuração do AI Model Harness inválida: ${issues.map((i) => `${i.path}: ${i.problem}`).join("; ")}`);
    this.name = "ModelHarnessConfigurationError";
    this.issues = issues;
  }
}

/** Políticas por tenant em configuração; tenant sem entrada recebe a padrão. */
export class StaticTenantAiPolicies implements TenantAiPolicyPort {
  readonly #porTenant: ReadonlyMap<string, Omit<TenantAiPolicy, "tenantId">>;
  constructor(porTenant: Record<string, Omit<TenantAiPolicy, "tenantId">> = {}) {
    this.#porTenant = new Map(Object.entries(porTenant));
  }
  async forTenant(tenantId: string): Promise<TenantAiPolicy> {
    const p = this.#porTenant.get(tenantId) ?? { deniedProviders: [], deniedModels: [], allowedProviders: null };
    return { tenantId, ...p };
  }
}

/** Kill switches por configuração. Sem entrada, tudo disponível. */
export class StaticModelAvailability implements ModelAvailabilityPort {
  readonly #snapshot: AvailabilitySnapshot;
  constructor(parcial: Partial<AvailabilitySnapshot> = {}) {
    this.#snapshot = { killSwitchedModels: [], killSwitchedProviders: [], killSwitchedAdapters: [], unavailableModels: [], ...parcial };
  }
  async snapshot() { return this.#snapshot; }
}

/** Prazo com o timer do processo. */
export const hostDeadline: DeadlinePort = {
  expireAfter(ms) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<void>((resolve) => { timer = setTimeout(resolve, ms); });
    return { expired, cancel: () => clearTimeout(timer) };
  },
};

export type LocalModelHarness = {
  readonly config: ModelHarnessConfig;
  readonly enabledAdapters: readonly string[];
  readonly testAdapter: TestModelProviderAdapter;
  invoke(req: ModelInvocationRequest): Promise<ModelInvocationResult>;
};

export function createLocalModelHarness(opts: {
  /**
   * Cost Ledger: `PersistentCostLedger` (Supabase local, CR-027) ou fake em
   * memória nos testes unitários. Fecha a tentativa e grava o registro juntos.
   */
  readonly budget: BudgetGuardPort;
  readonly entitlements: AiEntitlementPort;
  /** Classificação verificável ainda não tem armazenamento canônico: o chamador fornece a porta. */
  readonly classifier: DataClassificationPort;
  /**
   * Fingerprint protegido. Sem carregamento de segredo neste slice: o
   * chamador fornece um `HmacRequestFingerprinter` (em teste, chave sintética).
   */
  readonly fingerprints: RequestFingerprintPort;
  readonly tenantPolicies?: TenantAiPolicyPort;
  readonly availability?: ModelAvailabilityPort;
  readonly clock?: Clock;
  readonly deadline?: DeadlinePort;
  readonly catalog?: AgentActionCatalog;
  readonly registry?: ModelRegistry;
  readonly profiles?: readonly ModelProfile[];
  readonly testAdapter?: TestModelProviderAdapter;
}): LocalModelHarness {
  const built = buildModelHarnessConfig({
    registry: opts.registry ?? LOCAL_TEST_MODEL_REGISTRY,
    profiles: opts.profiles ?? loadModelProfileRegistry().entries,
    catalog: opts.catalog ?? loadFrozenAgentActionCatalog(),
  });
  if (!built.ok) throw new ModelHarnessConfigurationError(built.issues);

  const testAdapter = opts.testAdapter ?? new TestModelProviderAdapter();
  const providers = new Map<string, ModelProviderPort>([[testAdapter.adapterKey, testAdapter]]);
  const deps = {
    config: built.config,
    providers,
    budget: opts.budget,
    entitlements: opts.entitlements,
    tenantPolicies: opts.tenantPolicies ?? new StaticTenantAiPolicies(),
    availability: opts.availability ?? new StaticModelAvailability(),
    clock: opts.clock ?? { now: () => new Date() },
    deadline: opts.deadline ?? hostDeadline,
    classifier: opts.classifier,
    fingerprints: opts.fingerprints,
    tokenEstimator: testModelTokenEstimator,
    // Sem porta de assets gerados: rotas visuais ficam bloqueadas (CR-026).
  };
  return {
    config: built.config,
    enabledAdapters: [...providers.keys()],
    testAdapter,
    invoke: (req) => invokeModel(deps, req),
  };
}
