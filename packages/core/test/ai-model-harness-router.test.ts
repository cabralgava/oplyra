import { describe, expect, it } from "vitest";
import { buildModelHarnessConfig, routeModelCall, validateModelRegistry } from "../src/index.ts";
import type {
  AgentActionCatalog, AvailabilitySnapshot, ModelDescriptor, ModelProfile, RoutingContext, RoutingRequest, TenantAiPolicy,
} from "../src/index.ts";

// Modelos e perfis sintéticos: fornecedores fictícios, nenhum modelo real.
const modelo = (id: string, extra: Partial<ModelDescriptor> = {}): ModelDescriptor => ({
  modelId: id,
  provider: "lab-a",
  adapterKey: "test",
  providerModelId: `lab-a/${id}`,
  status: "active",
  capabilities: ["generation", "quality_gate"],
  inputModalities: ["text"],
  supportedParameters: ["temperature", "top_p", "seed"],
  structuredOutput: true,
  toolCalling: false,
  contextWindowTokens: 32_000,
  maxOutputTokens: 4_096,
  tariff: { tariffVersion: "t1", currency: "USD", effectiveFrom: "2026-09-29", inputMicroUsdPerMillionTokens: 1_000_000, outputMicroUsdPerMillionTokens: 2_000_000 },
  dataPolicy: { allowedDataClassifications: ["synthetic", "internal", "tenant_confidential"], zeroDataRetention: false, evidenceRef: "fixture" },
  qualityEvidence: [],
  evidenceDate: "2026-09-29",
  ...extra,
});

const perfil = (extra: Partial<ModelProfile> = {}, routing: Partial<ModelProfile["routing"]> = {}): ModelProfile => ({
  profileId: "fixture.copy",
  version: 1,
  status: "active",
  agentKey: "copywriting-agent",
  actionKey: "create_ad_copy",
  requirements: { capability: "generation", inputModalities: ["text"], structuredOutput: false, toolCalling: false, minContextTokens: 4_000 },
  routing: {
    policy: "ordered_preference", candidates: ["m-a", "m-b", "m-c"], forbiddenModels: [], allowedProviders: [],
    qualityThreshold: null, allowExperimental: false, ...routing,
  },
  sampling: { temperature: 0.5 },
  maxOutputTokens: 1_000,
  limits: { maxCostMicroUsdPerCall: 100_000, maxAttempts: 3, maxRetriesPerModel: 1, timeoutMs: 1_000 },
  requiredEntitlement: null,
  dataPolicy: { requireZeroDataRetention: false },
  ...extra,
});

const TENANT = "tenant-a";
const politica = (extra: Partial<TenantAiPolicy> = {}): TenantAiPolicy =>
  ({ tenantId: TENANT, deniedProviders: [], deniedModels: [], allowedProviders: null, ...extra });
const semRestricao: AvailabilitySnapshot = { killSwitchedModels: [], killSwitchedProviders: [], killSwitchedAdapters: [], unavailableModels: [] };

function rotear(
  modelos: ModelDescriptor[],
  opts: { profile?: ModelProfile; req?: Partial<RoutingRequest>; ctx?: Partial<Omit<RoutingContext, "lookupModel">> } = {},
) {
  const mapa = new Map(modelos.map((m) => [m.modelId, m]));
  return routeModelCall(
    { tenantId: TENANT, dataClassification: "synthetic", inputModalities: ["text"], estimatedInputTokens: 1_000, requestedImages: 0, excludedModelIds: [], ...opts.req },
    {
      profile: opts.profile ?? perfil(), lookupModel: (id) => mapa.get(id), enabledAdapters: ["test"],
      tenantPolicy: politica(), availability: semRestricao, remainingBudgetMicroUsd: 1_000_000, ...opts.ctx,
    },
  );
}

const motivos = (d: ReturnType<typeof rotear>, id: string) => d.rejections.find((r) => r.modelId === id)?.reasons ?? [];

describe("AI Model Router — seleção", () => {
  it("usa o primeiro candidato compatível do perfil como preferido", () => {
    const d = rotear([modelo("m-a"), modelo("m-b")]);
    expect(d.ok && d.selected.model.modelId).toBe("m-a");
    expect(d.ok && d.reason).toBe("preferred");
    expect(d.ok && d.alternatives).toEqual(["m-b"]);
  });

  it("é determinístico: mesma entrada, mesma decisão", () => {
    const ms = [modelo("m-a", { status: "disabled" }), modelo("m-b"), modelo("m-c")];
    expect(rotear(ms)).toEqual(rotear(ms));
  });

  it("cai para o próximo compatível e registra o motivo da recusa", () => {
    const d = rotear([modelo("m-a", { capabilities: ["classification"] }), modelo("m-b")]);
    expect(d.ok && d.selected.model.modelId).toBe("m-b");
    expect(d.ok && d.reason).toBe("fallback");
    expect(motivos(d, "m-a")).toEqual(["capability_missing"]);
    expect(motivos(d, "m-c")).toEqual(["not_in_registry"]);
  });

  it("não repete modelo já esgotado na invocação", () => {
    const d = rotear([modelo("m-a"), modelo("m-b")], { req: { excludedModelIds: ["m-a"] } });
    expect(d.ok && d.selected.model.modelId).toBe("m-b");
    expect(d.ok && d.reason).toBe("fallback");
    expect(motivos(d, "m-a")).toEqual(["already_attempted"]);
  });

  it("lowest_cost_above_threshold escolhe o mais barato que atinge o limiar", () => {
    const ev = (score: number) => [{ agentKey: "copywriting-agent", actionKey: "create_ad_copy", score, evalRef: "eval-x", measuredAt: "2026-09-29" }];
    const barato = { tariffVersion: "t0", currency: "USD" as const, effectiveFrom: "2026-09-29", inputMicroUsdPerMillionTokens: 10, outputMicroUsdPerMillionTokens: 10 };
    const d = rotear(
      [
        modelo("m-a", { qualityEvidence: ev(0.95) }),
        modelo("m-b", { qualityEvidence: ev(0.5), tariff: barato }),
        modelo("m-c", { qualityEvidence: ev(0.9), tariff: barato }),
      ],
      { profile: perfil({}, { policy: "lowest_cost_above_threshold", qualityThreshold: 0.8 }) },
    );
    expect(d.ok && d.selected.model.modelId).toBe("m-c");
    expect(d.ok && d.reason).toBe("lowest_cost_above_threshold");
    expect(motivos(d, "m-b")).toEqual(["quality_below_threshold"]);
  });

  it("sem evidência de qualidade o modelo não entra em rota com limiar", () => {
    const d = rotear([modelo("m-a")], { profile: perfil({}, { policy: "lowest_cost_above_threshold", qualityThreshold: 0.8, candidates: ["m-a"] }) });
    expect(d.ok).toBe(false);
    expect(motivos(d, "m-a")).toContain("quality_evidence_missing");
  });

  it("empate de custo preserva a ordem do perfil", () => {
    const ev = [{ agentKey: "copywriting-agent", actionKey: "create_ad_copy", score: 0.9, evalRef: "e", measuredAt: "2026-09-29" }];
    const d = rotear([modelo("m-a", { qualityEvidence: ev }), modelo("m-b", { qualityEvidence: ev })],
      { profile: perfil({}, { policy: "lowest_cost_above_threshold", qualityThreshold: 0.8 }) });
    expect(d.ok && d.selected.model.modelId).toBe("m-a");
  });
});

describe("AI Model Router — capability", () => {
  it.each([
    ["modality_missing", { inputModalities: ["text"] as const }, { req: { inputModalities: ["text", "image"] as ("text" | "image")[] } }],
    ["structured_output_missing", { structuredOutput: false }, { profile: perfil({ requirements: { ...perfil().requirements, structuredOutput: true } }) }],
    ["tool_calling_missing", {}, { profile: perfil({ requirements: { ...perfil().requirements, toolCalling: true } }) }],
    ["context_window_too_small", { contextWindowTokens: 1_500 }, {}],
    ["output_limit_too_small", { maxOutputTokens: 500 }, {}],
    ["parameter_unsupported", { supportedParameters: ["seed" as const] }, {}],
  ])("recusa %s", (motivo, extra, opts) => {
    const d = rotear([modelo("m-a", extra as Partial<ModelDescriptor>)], { ...(opts as object), profile: (opts as { profile?: ModelProfile }).profile ?? perfil({}, { candidates: ["m-a"] }) });
    expect(d.ok).toBe(false);
    expect(motivos(d, "m-a")).toContain(motivo);
  });
});

describe("AI Model Router — allowlists, ambiente e kill switch", () => {
  const um = (extra: Partial<ModelDescriptor>, opts: Parameters<typeof rotear>[1] = {}) =>
    rotear([modelo("m-a", extra)], { ...opts, profile: opts.profile ?? perfil({}, { candidates: ["m-a"] }) });

  it("respeita modelo proibido e allowlist de fornecedor do perfil", () => {
    expect(motivos(um({}, { profile: perfil({}, { candidates: ["m-a"], forbiddenModels: ["m-a"] }) }), "m-a")).toContain("forbidden_by_profile");
    expect(motivos(um({}, { profile: perfil({}, { candidates: ["m-a"], allowedProviders: ["lab-b"] }) }), "m-a")).toContain("provider_not_allowed_by_profile");
  });

  it("política do tenant só restringe", () => {
    expect(motivos(um({}, { ctx: { tenantPolicy: politica({ deniedModels: ["m-a"] }) } }), "m-a")).toContain("forbidden_by_tenant");
    expect(motivos(um({}, { ctx: { tenantPolicy: politica({ deniedProviders: ["lab-a"] }) } }), "m-a")).toContain("provider_not_allowed_by_tenant");
    expect(motivos(um({}, { ctx: { tenantPolicy: politica({ allowedProviders: ["lab-b"] }) } }), "m-a")).toContain("provider_not_allowed_by_tenant");
  });

  it("recusa política de outro tenant", () => {
    const d = um({}, { ctx: { tenantPolicy: { ...politica(), tenantId: "tenant-b" } } });
    expect(d).toEqual({ ok: false, failure: "tenant_mismatch", rejections: [] });
  });

  it("modelo com adapter não habilitado não é roteado (gateway real fora do ambiente local)", () => {
    expect(motivos(um({ adapterKey: "gateway-x" }), "m-a")).toContain("adapter_not_enabled");
  });

  it("disabled, experimental sem permissão, kill switch e indisponível", () => {
    expect(motivos(um({ status: "disabled" }), "m-a")).toContain("status_disabled");
    expect(motivos(um({ status: "experimental" }), "m-a")).toContain("experimental_not_allowed");
    for (const k of [{ killSwitchedModels: ["m-a"] }, { killSwitchedProviders: ["lab-a"] }, { killSwitchedAdapters: ["test"] }]) {
      expect(motivos(um({}, { ctx: { availability: { ...semRestricao, ...k } } }), "m-a")).toContain("kill_switch");
    }
    expect(motivos(um({}, { ctx: { availability: { ...semRestricao, unavailableModels: ["m-a"] } } }), "m-a")).toContain("unavailable");
  });
});

describe("AI Model Router — privacidade", () => {
  it("classificação de dado fora da política do modelo é recusada", () => {
    const d = rotear([modelo("m-a")], { req: { dataClassification: "personal_data" }, profile: perfil({}, { candidates: ["m-a"] }) });
    expect(motivos(d, "m-a")).toContain("data_policy_incompatible");
  });

  it("perfil que exige retenção zero recusa modelo sem ZDR", () => {
    const d = rotear([modelo("m-a")], { profile: perfil({ dataPolicy: { requireZeroDataRetention: true } }, { candidates: ["m-a"] }) });
    expect(motivos(d, "m-a")).toContain("zero_data_retention_required");
  });

  it("experimental permitido pelo perfil ainda recebe somente dado sintético", () => {
    const exp = modelo("m-a", { status: "experimental", dataPolicy: { allowedDataClassifications: ["synthetic"], zeroDataRetention: false, evidenceRef: "fixture" } });
    const p = perfil({}, { candidates: ["m-a"], allowExperimental: true });
    expect(rotear([exp], { profile: p }).ok).toBe(true);
    expect(motivos(rotear([exp], { profile: p, req: { dataClassification: "internal" } }), "m-a")).toContain("data_policy_incompatible");
  });
});

describe("AI Model Router — orçamento e tarifa", () => {
  // 1.000 tokens de entrada a 1 USD/M + 1.000 de saída a 2 USD/M = 3.000 micro-USD.
  it("estima o pior caso pela tarifa versionada", () => {
    const d = rotear([modelo("m-a")]);
    expect(d.ok && d.selected.estimatedCostMicroUsd).toBe(3_000);
  });

  it("falha como budget_exceeded quando algum candidato só falha por orçamento", () => {
    const d = rotear([modelo("m-a", { capabilities: ["classification"] }), modelo("m-b")], { ctx: { remainingBudgetMicroUsd: 2_999 } });
    expect(d.ok).toBe(false);
    expect(!d.ok && d.failure).toBe("budget_exceeded");
    expect(motivos(d, "m-b")).toEqual(["exceeds_remaining_budget"]);
  });

  it("teto por chamada do perfil também bloqueia", () => {
    const d = rotear([modelo("m-a")], { profile: perfil({ limits: { ...perfil().limits, maxCostMicroUsdPerCall: 2_000 } }, { candidates: ["m-a"] }) });
    expect(!d.ok && d.failure).toBe("budget_exceeded");
  });

  it("falha como no_eligible_model quando a causa não é orçamento", () => {
    const d = rotear([modelo("m-a", { capabilities: ["classification"] })], { ctx: { remainingBudgetMicroUsd: 0 }, profile: perfil({}, { candidates: ["m-a"] }) });
    expect(!d.ok && d.failure).toBe("no_eligible_model");
  });

  it("sem tarifa não há chamada; imagem exige tarifa por imagem", () => {
    expect(motivos(rotear([modelo("m-a", { tariff: null })], { profile: perfil({}, { candidates: ["m-a"] }) }), "m-a")).toContain("tariff_missing");
    const img = modelo("m-a", { capabilities: ["image_generation"] });
    const p = perfil({ requirements: { ...perfil().requirements, capability: "image_generation" } }, { candidates: ["m-a"] });
    expect(motivos(rotear([img], { profile: p, req: { requestedImages: 1 } }), "m-a")).toContain("tariff_missing");
    const comTarifa = modelo("m-a", { capabilities: ["image_generation"], tariff: { ...modelo("x").tariff!, microUsdPerImage: 40_000 } });
    const d = rotear([comTarifa], { profile: p, req: { requestedImages: 2 } });
    expect(d.ok && d.selected.estimatedCostMicroUsd).toBe(3_000 + 80_000);
  });
});

describe("configuração do harness", () => {
  const catalogo: AgentActionCatalog = {
    source: "fixture",
    hasAgent: (a) => ["copywriting-agent", "design-agent"].includes(a),
    hasAction: (x) => ["create_ad_copy", "create_static_variation"].includes(x),
    canAgentCallAction: (a, x) => (a === "copywriting-agent" && x === "create_ad_copy") || (a === "design-agent" && x === "create_static_variation"),
  };
  const registry = { registryVersion: "fixture-1", models: [modelo("m-a"), modelo("m-b")] };
  const problemas = (profiles: ModelProfile[], reg = registry) => {
    const r = buildModelHarnessConfig({ registry: reg, profiles, catalog: catalogo });
    return r.ok ? [] : r.issues.map((i) => i.problem);
  };

  it("configuração válida resolve o único perfil ativo por agent + action", () => {
    const r = buildModelHarnessConfig({ registry, profiles: [perfil({}, { candidates: ["m-a", "m-b"] }), perfil({ version: 2, status: "draft" }, { candidates: ["m-a"] })], catalog: catalogo });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.activeProfile("copywriting-agent", "create_ad_copy")?.version).toBe(1);
    expect(r.config.activeProfile("design-agent", "create_static_variation")).toBeUndefined();
  });

  it("falha fechada para agent, action ou vínculo fora dos registries", () => {
    expect(problemas([perfil({ agentKey: "ghost-agent" }, { candidates: ["m-a"] })])).toContain("agent não registrado: ghost-agent");
    expect(problemas([perfil({ actionKey: "ghost_action" }, { candidates: ["m-a"] })])).toContain("action não registrada: ghost_action");
    expect(problemas([perfil({ actionKey: "create_static_variation" }, { candidates: ["m-a"] })]))
      .toContain("copywriting-agent não pode executar create_static_variation");
  });

  it("recusa dois perfis ativos para a mesma rota e versão duplicada", () => {
    const p = problemas([perfil({}, { candidates: ["m-a"] }), perfil({ profileId: "outro" }, { candidates: ["m-a"] }), perfil({}, { candidates: ["m-a"] })]);
    expect(p.some((x) => x.startsWith("mais de um perfil ativo"))).toBe(true);
    expect(p).toContain("versão duplicada: fixture.copy@1");
  });

  it("recusa candidato fora do registry, sem capacidade ou também proibido", () => {
    const p = problemas([perfil({}, { candidates: ["m-a", "m-z"], forbiddenModels: ["m-a"] })]);
    expect(p).toContain("modelo fora do registry: m-z");
    expect(p).toContain("candidato também proibido: m-a");
    expect(problemas([perfil({ requirements: { ...perfil().requirements, capability: "image_edit" } }, { candidates: ["m-a"] })]))
      .toContain("m-a sem capacidade image_edit");
  });

  it("recusa parâmetros e limites fora da faixa", () => {
    const p = problemas([perfil({
      sampling: { temperature: 3, topP: 0 },
      limits: { maxCostMicroUsdPerCall: -1, maxAttempts: 9, maxRetriesPerModel: 5, timeoutMs: 0 },
    }, { policy: "lowest_cost_above_threshold", qualityThreshold: null, candidates: ["m-a"] })]);
    for (const esperado of ["entre 0 e 2", "entre 0 (exclusivo) e 1", "inteiro >= 0", "entre 1 e 5", "entre 0 e 2", "inteiro positivo", "obrigatório para lowest_cost_above_threshold"]) {
      expect(p).toContain(esperado);
    }
  });

  it("registry: ids únicos, tarifa inteira e experimental somente com dado sintético", () => {
    const issues = validateModelRegistry({
      registryVersion: "x",
      models: [
        modelo("m-a"), modelo("m-a", { providerModelId: "lab-a/outro" }),
        modelo("m-e", { status: "experimental" }),
        modelo("m-t", { tariff: { ...modelo("x").tariff!, inputMicroUsdPerMillionTokens: 0.5 } }),
      ],
    }).map((i) => i.problem);
    expect(issues).toContain("duplicado: m-a");
    expect(issues).toContain("modelo experimental aceita somente dados sintéticos");
    expect(issues).toContain("inteiro >= 0");
  });
});
