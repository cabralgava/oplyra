// Integração local do Product AI Model Harness: composition root real, Test
// Adapter, catálogo lido dos registries congelados e catálogo local sintético.
// Sem rede, sem chave, sem custo e sem banco.
import { describe, expect, it } from "vitest";
import type { ModelInvocationRequest } from "../packages/core/src/index.ts";
import {
  InMemoryBudgetGuard, InMemoryDataClassifier, SetAiEntitlements, steppingClock,
} from "../packages/testing/src/index.ts";
import {
  createLocalModelHarness, ModelHarnessConfigurationError, StaticModelAvailability, StaticTenantAiPolicies,
} from "../packages/infra/src/ai-model-harness/local-composition.ts";
import { loadFrozenAgentActionCatalog } from "../packages/infra/src/ai-model-harness/frozen-registry-catalog.ts";
import { LOCAL_TEST_MODEL_REGISTRY } from "../packages/infra/src/ai-model-harness/local-test-catalog.ts";
import { loadModelProfileRegistry } from "../packages/infra/src/ai-model-harness/model-profile-registry.ts";

// Perfis canônicos do registry versionado (Model Profile Registry 1.1, Release 2.17).
const LOCAL_TEST_MODEL_PROFILES = loadModelProfileRegistry().entries;
import { TestModelProviderAdapter } from "../packages/infra/src/ai-model-harness/test-model-provider.ts";
import { HmacRequestFingerprinter } from "../packages/infra/src/ai-model-harness/hmac-fingerprint.ts";

// Chave sintética explícita, somente para teste local.
const fingerprints = new HmacRequestFingerprinter({
  active: { keyId: "synthetic-local-v1", secret: new TextEncoder().encode("oplyra-synthetic-local-fingerprint-key-not-a-secret") },
});

const TA = "11111111-1111-4111-8111-111111111111";
const TB = "22222222-2222-4222-8222-222222222222";
const FONTE = { kind: "context_package", ref: "ctx-local-1" } as const;

function harness(extra: Partial<Parameters<typeof createLocalModelHarness>[0]> = {}) {
  const budget = new InMemoryBudgetGuard({ tenants: { [TA]: 50_000, [TB]: 50_000 } });
  const recorder = budget.recorder;
  const classifier = new InMemoryDataClassifier().register(TA, FONTE, "synthetic").register(TB, FONTE, "synthetic");
  const h = createLocalModelHarness({ budget, entitlements: new SetAiEntitlements(), classifier, fingerprints, clock: steppingClock(), ...extra });
  return { h, budget, recorder };
}

const pedido = (extra: Partial<ModelInvocationRequest> = {}): ModelInvocationRequest => ({
  invocationId: "inv-local-1", tenantId: TA, workflowKey: "copy-review", agentKey: "copywriting-agent",
  actionKey: "create_ad_copy", classification: { sources: [FONTE], declared: null },
  trace: {
    correlationId: "corr-local-1", transactionId: "txn-local-1", causationId: "txn-local-0", parentTransactionId: null,
    workflowId: "wf-local-1", taskId: "task-local-1", runId: "run-local-1",
  },
  messages: [{ role: "system", content: "Brand OS sintético" }, { role: "user", content: "Gerar anúncio para teste" }],
  inputModalities: ["text"], ...extra,
});

describe("catálogo dos registries congelados", () => {
  const catalogo = loadFrozenAgentActionCatalog();

  it("lê as versões congeladas e respeita ownership/callable", () => {
    expect(catalogo.source).toBe("agents.json@1.0 + actions.json@2.0");
    expect(catalogo.hasAgent("copywriting-agent")).toBe(true);
    expect(catalogo.canAgentCallAction("copywriting-agent", "create_ad_copy")).toBe(true);
    expect(catalogo.canAgentCallAction("strategy-quality-agent", "review_copy")).toBe(true);
    expect(catalogo.canAgentCallAction("copywriting-agent", "review_copy")).toBe(false);
    expect(catalogo.hasAgent("ghost-agent")).toBe(false);
  });
});

describe("composition root local", () => {
  it("habilita somente o Test Adapter e só contém modelos do Test Adapter com custo zero", () => {
    const { h } = harness();
    expect(h.enabledAdapters).toEqual(["test"]);
    expect(LOCAL_TEST_MODEL_REGISTRY.models.every((m) => m.adapterKey === "test" && m.tariff !== null)).toBe(true);
    expect(LOCAL_TEST_MODEL_REGISTRY.models.every((m) => m.tariff!.inputMicroUsdPerMillionTokens === 0 && m.tariff!.outputMicroUsdPerMillionTokens === 0)).toBe(true);
    expect(LOCAL_TEST_MODEL_PROFILES.every((p) => p.limits.maxCostMicroUsdPerCall === 0)).toBe(true);
  });

  it("perfis locais são válidos contra os registries congelados", () => {
    const { h } = harness();
    for (const p of LOCAL_TEST_MODEL_PROFILES) expect(h.config.activeProfile(p.agentKey, p.actionKey)).toEqual(p);
  });

  it("configuração inválida impede a criação do harness", () => {
    const invalido = [{ ...LOCAL_TEST_MODEL_PROFILES[0]!, agentKey: "ghost-agent" }];
    expect(() => harness({ profiles: invalido })).toThrow(ModelHarnessConfigurationError);
  });

  it("modelo de gateway real acrescentado ao catálogo local nunca é roteado", async () => {
    const gateway = { ...LOCAL_TEST_MODEL_REGISTRY.models[0]!, modelId: "gateway-candidate", adapterKey: "gateway", providerModelId: "lab-x/model", provider: "lab-x" };
    const perfil = { ...LOCAL_TEST_MODEL_PROFILES[0]!, routing: { ...LOCAL_TEST_MODEL_PROFILES[0]!.routing, candidates: ["gateway-candidate"], allowedProviders: [] } };
    const { h, recorder } = harness({
      registry: { ...LOCAL_TEST_MODEL_REGISTRY, models: [...LOCAL_TEST_MODEL_REGISTRY.models, gateway] },
      profiles: [perfil],
    });
    const r = await h.invoke(pedido());
    expect(!r.ok && r.failure.kind).toBe("no_eligible_model");
    expect(!r.ok && r.failure.rejections?.[0]?.reasons).toContain("adapter_not_enabled");
    expect(recorder.records).toHaveLength(0);
  });
});

describe("fluxo ponta a ponta com Test Adapter", () => {
  it("copy estruturada: perfil local, JSON válido, custo zero liquidado e registro completo", async () => {
    const { h, recorder, budget } = harness();
    const r = await h.invoke(pedido());
    expect(r).toMatchObject({ ok: true, modelId: "local-test-text-economy", provider: "oplyra-test", profileRef: "local-test.copywriting-agent.create_ad_copy@1", costMicroUsd: 0 });
    expect(r.ok && r.output.modality === "text" && r.output.json).toMatchObject({ testOutput: true });
    expect(recorder.records[0]).toMatchObject({ registryVersion: "local-test-1", adapterKey: "test", tariffVersion: "local-test-0", costStatus: "settled", outcome: "succeeded" });
    expect(recorder.records[0]!.trace).toEqual(pedido().trace);
    expect(budget.reservations(TA)).toMatchObject([{ status: "settled", actual: 0 }]);
  });

  it("é reprodutível: duas execuções independentes geram a mesma saída", async () => {
    const a = await harness().h.invoke(pedido());
    const b = await harness().h.invoke(pedido());
    expect(a.ok && b.ok && JSON.stringify(a.output) === JSON.stringify(b.output)).toBe(true);
  });

  it("revisão da Estratégia e Qualidade usa o próprio perfil", async () => {
    const { h, recorder } = harness();
    const r = await h.invoke(pedido({ agentKey: "strategy-quality-agent", actionKey: "review_copy", invocationId: "inv-review" }));
    expect(r.ok && r.profileRef).toBe("local-test.strategy-quality-agent.review_copy@1");
    expect(recorder.records[0]!.agentKey).toBe("strategy-quality-agent");
  });

  it("falhas roteirizadas: retry técnico, depois fallback para o modelo estendido", async () => {
    const testAdapter = new TestModelProviderAdapter({ behaviors: { "oplyra-test/text-economy": "unavailable" } });
    const { h, recorder } = harness({ testAdapter });
    const r = await h.invoke(pedido());
    expect(r).toMatchObject({ ok: true, modelId: "local-test-text-extended", attempts: 3, fallbackOccurred: true });
    expect(recorder.records.map((x) => x.routingReason)).toEqual(["preferred", "retry", "fallback"]);
  });

  it("kill switch do adapter de teste bloqueia tudo com falha estruturada", async () => {
    const { h } = harness({ availability: new StaticModelAvailability({ killSwitchedAdapters: ["test"] }) });
    const r = await h.invoke(pedido());
    expect(!r.ok && r.failure).toMatchObject({ kind: "no_eligible_model", contract: { registered: true, code: "MODEL_ROUTE_UNAVAILABLE" } });
  });

  it("concorrência real no Test Adapter: mesma tentativa, uma única chamada", async () => {
    const { h } = harness();
    const rs = await Promise.all([h.invoke(pedido()), h.invoke(pedido()), h.invoke(pedido())]);
    expect(h.testAdapter.calls).toHaveLength(1);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
  });

  it("rota sem perfil ativo não chama modelo", async () => {
    const { h } = harness();
    const r = await h.invoke(pedido({ actionKey: "create_email_copy" }));
    expect(!r.ok && r.failure.kind).toBe("profile_not_found");
    expect(h.testAdapter.calls).toHaveLength(0);
  });

  it("isolamento: política de A não afeta B, saída de B não contém conteúdo de A", async () => {
    const tenantPolicies = new StaticTenantAiPolicies({ [TA]: { deniedProviders: ["oplyra-test"], deniedModels: [], allowedProviders: null } });
    const { h, recorder } = harness({ tenantPolicies });
    const a = await h.invoke(pedido({ messages: [{ role: "user", content: "segredo sintético da empresa A" }] }));
    const b = await h.invoke(pedido({ tenantId: TB, invocationId: "inv-b" }));
    expect(!a.ok && a.failure.kind).toBe("no_eligible_model");
    expect(b.ok).toBe(true);
    expect(JSON.stringify(b)).not.toContain("segredo");
    expect(recorder.ofTenant(TA)).toHaveLength(0);
    expect(recorder.ofTenant(TB)).toHaveLength(1);
  });
});
