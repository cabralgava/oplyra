import { describe, expect, it } from "vitest";
import { invokeModel } from "@oplyra/core";
import type { ModelInvocationRequest, ModelProviderPort } from "@oplyra/core";
import {
  FixedAvailability, InMemoryBudgetGuard, InMemoryDataClassifier, InMemoryTenantAiPolicies, ManualDeadline, ScriptedModelProvider, SetAiEntitlements, scripted,
} from "@oplyra/testing";
import { FONTE_CTX, SEGREDO, TA, TB, modelo, montar, pedido, perfil } from "./ai-model-harness-fixtures.ts";
import { FP, aquisicao, fechamentoPara, fingerprintDe } from "./ai-model-harness-fixtures.ts";

describe("invokeModel — caminho feliz", () => {
  it("resolve pelo perfil, aplica parâmetros do perfil e registra a tentativa com custo liquidado", async () => {
    const { deps, recorder, budget, provider } = montar();
    const r = await invokeModel(deps, pedido());
    expect(r).toMatchObject({ ok: true, modelId: "m-a", provider: "lab-a", profileRef: "fixture.copy@3", attempts: 1, fallbackOccurred: false, costMicroUsd: 200 });
    const chamada = (provider as ScriptedModelProvider).calls[0]!;
    expect(chamada.parameters).toEqual({ temperature: 0.4, maxOutputTokens: 1_000 });
    expect(chamada.responseFormat).toBe("text");
    expect(recorder.records).toHaveLength(1);
    expect(recorder.records[0]).toMatchObject({
      tenantId: TA, attempt: 1, profileRef: "fixture.copy@3", registryVersion: "fixture-7", modelId: "m-a",
      routingReason: "preferred", outcome: "succeeded", costStatus: "settled", costMicroUsd: 200, tariffVersion: "t1",
      estimatedCostMicroUsd: 2_500, resolvedProviderModelId: "lab-a/m-a", latencyMs: 5,
    });
    expect(budget.reservations(TA)).toMatchObject([{ status: "settled", actual: 200 }]);
  });

  it("saída estruturada exige objeto JSON e devolve o objeto", async () => {
    const provider = new ScriptedModelProvider("test", { "lab-a/m-a": scripted.success('{"headline":"x"}') });
    const { deps } = montar({ provider, profiles: [perfil({ requirements: { ...perfil().requirements, structuredOutput: true } })] });
    const r = await invokeModel(deps, pedido());
    expect(r.ok && r.output.modality === "text" && r.output.json).toEqual({ headline: "x" });
    expect(provider.calls[0]!.responseFormat).toBe("json");
  });

  it("registro de chamada não contém prompt nem resposta", async () => {
    const provider = new ScriptedModelProvider("test", { "lab-a/m-a": scripted.success("resposta sintética secreta") });
    const { deps, recorder } = montar({ provider });
    await invokeModel(deps, pedido());
    const serializado = JSON.stringify(recorder.records);
    expect(serializado).not.toContain(SEGREDO);
    expect(serializado).not.toContain("resposta sintética secreta");
  });
});

describe("invokeModel — retry e fallback revalidados", () => {
  it("retry técnico no mesmo modelo até o limite e depois fallback para o próximo compatível", async () => {
    const provider = new ScriptedModelProvider("test", { "lab-a/m-a": scripted.failure("unavailable") });
    const { deps, recorder } = montar({ provider });
    const r = await invokeModel(deps, pedido());
    expect(r).toMatchObject({ ok: true, modelId: "m-b", attempts: 3, fallbackOccurred: true });
    expect(recorder.records.map((x) => [x.modelId, x.routingReason, x.outcome, x.failureKind])).toEqual([
      ["m-a", "preferred", "failed", "provider_unavailable"],
      ["m-a", "retry", "failed", "provider_unavailable"],
      ["m-b", "fallback", "succeeded", null],
    ]);
  });

  it("fallback revalida orçamento: candidato seguinte caro demais não é usado", async () => {
    const caro = modelo("m-b", "lab-b", { tariff: { ...modelo("x").tariff!, inputMicroUsdPerMillionTokens: 30_000_000 } });
    const provider = new ScriptedModelProvider("test", { "lab-a/m-a": scripted.failure("rejected_request") });
    const { deps, recorder } = montar({ provider, models: [modelo("m-a"), caro] });
    const r = await invokeModel(deps, pedido());
    expect(r.ok).toBe(false);
    expect(!r.ok && r.failure).toMatchObject({ kind: "budget_exceeded", contract: { registered: true, code: "BUDGET_LIMIT_EXCEEDED" }, attempts: 1 });
    expect(recorder.records).toHaveLength(1);
  });

  it("fallback revalida kill switch acionado entre tentativas", async () => {
    const availability = new FixedAvailability();
    const provider = new ScriptedModelProvider("test", {
      "lab-a/m-a": () => { availability.snapshotValue = { ...availability.snapshotValue, killSwitchedProviders: ["lab-b"] }; return scripted.failure("rejected_request")(null as never); },
    });
    const { deps } = montar({ provider, availability });
    const r = await invokeModel(deps, pedido());
    expect(!r.ok && r.failure.kind).toBe("attempts_exhausted");
    expect(!r.ok && r.failure.lastAttemptKind).toBe("provider_rejected_request");
    expect(!r.ok && r.failure.rejections?.find((x) => x.modelId === "m-b")?.reasons).toContain("kill_switch");
    expect(provider.calls.map((c) => c.providerModelId)).toEqual(["lab-a/m-a"]);
  });

  it("para no limite total de tentativas do perfil", async () => {
    const provider = new ScriptedModelProvider("test", { "lab-a/m-a": scripted.failure("timeout", { kind: "none" }), "lab-b/m-b": scripted.failure("timeout", { kind: "none" }) });
    const { deps, recorder } = montar({ provider, profiles: [perfil({ limits: { ...perfil().limits, maxAttempts: 3 } })] });
    const r = await invokeModel(deps, pedido());
    expect(!r.ok && r.failure).toMatchObject({ kind: "attempts_exhausted", attempts: 3, lastAttemptKind: "provider_timeout", contract: { registered: true, code: "MODEL_ATTEMPTS_EXHAUSTED" } });
    expect(recorder.records).toHaveLength(3);
  });

  it("saída inválida não é devolvida e aciona o próximo candidato", async () => {
    const provider = new ScriptedModelProvider("test", { "lab-a/m-a": scripted.success("não é json") });
    const { deps, recorder } = montar({ provider, profiles: [perfil({ requirements: { ...perfil().requirements, structuredOutput: true } })] });
    const r = await invokeModel(deps, pedido());
    expect(r).toMatchObject({ ok: true, modelId: "m-b", fallbackOccurred: true });
    expect(recorder.records[0]).toMatchObject({ failureKind: "output_invalid", costStatus: "settled" });
  });

  it("parâmetro ignorado pelo fornecedor é falha de compatibilidade, não sucesso", async () => {
    const provider = new ScriptedModelProvider("test", {
      "lab-a/m-a": scripted.success("ok", { ignoredParameters: ["temperature"] }),
      "lab-b/m-b": scripted.success("ok", { ignoredParameters: ["temperature"] }),
    });
    const { deps } = montar({ provider });
    const r = await invokeModel(deps, pedido());
    expect(!r.ok && r.failure).toMatchObject({ kind: "attempts_exhausted", lastAttemptKind: "parameter_not_applied" });
  });

  it("modelo efetivo diferente do roteado encerra sem devolver saída e sem novo fallback", async () => {
    const provider = new ScriptedModelProvider("test", { "lab-a/m-a": scripted.success("saída", { resolvedProviderModelId: "lab-z/outro", resolvedProvider: "lab-z" }) });
    const { deps, recorder, budget } = montar({ provider });
    const r = await invokeModel(deps, pedido());
    expect(r.ok).toBe(false);
    expect(!r.ok && r.failure).toMatchObject({ kind: "resolution_mismatch", contract: { registered: true, code: "MODEL_RESOLUTION_MISMATCH" }, retryable: false });
    expect(provider.calls).toHaveLength(1);
    expect(recorder.records[0]).toMatchObject({ resolvedProviderModelId: "lab-z/outro", outcome: "failed", costStatus: "settled" });
    expect(budget.reservations(TA)[0]).toMatchObject({ status: "settled", actual: 200 });
  });
});

describe("invokeModel — liquidação de custo", () => {
  it("custo incerto mantém a reserva inteira e nunca vira zero", async () => {
    const provider = new ScriptedModelProvider("test", { "lab-a/m-a": scripted.failure("timeout", { kind: "unknown" }) });
    const { deps, recorder, budget } = montar({ provider, profiles: [perfil({ routing: { ...perfil().routing, candidates: ["m-a"] }, limits: { ...perfil().limits, maxRetriesPerModel: 0 } })] });
    await invokeModel(deps, pedido());
    expect(recorder.records[0]).toMatchObject({ costMicroUsd: null, costStatus: "pending_reconciliation" });
    expect(budget.reservations(TA)).toMatchObject([{ status: "held", amount: 2_500 }]);
    expect((await budget.remaining({ tenantId: TA, workflowKey: "copy-review" })).remainingMicroUsd).toBe(1_000_000 - 2_500);
  });

  it("sem cobrança garantida devolve a reserva", async () => {
    const provider = new ScriptedModelProvider("test", { "lab-a/m-a": scripted.failure("rate_limited", { kind: "none" }) });
    const { deps, budget } = montar({ provider });
    await invokeModel(deps, pedido());
    expect(budget.reservations(TA).map((x) => x.status)).toEqual(["released", "released", "settled"]);
  });

  it("adapter que lança é tratado como indisponível com custo incerto", async () => {
    const provider = new ScriptedModelProvider("test", { "lab-a/m-a": scripted.throws() });
    const { deps, recorder } = montar({ provider });
    const r = await invokeModel(deps, pedido());
    expect(r.ok && r.modelId).toBe("m-b");
    expect(recorder.records[0]).toMatchObject({ failureKind: "provider_unavailable", costStatus: "pending_reconciliation" });
  });

  it("reserva negada por corrida encerra como BUDGET_LIMIT_EXCEEDED antes da chamada", async () => {
    const budget = new InMemoryBudgetGuard({ tenants: { [TA]: 1_000_000 } });
    budget.acquireAttempt = async () => ({ status: "insufficient", remainingMicroUsd: 0 });
    const { deps, provider } = montar({ budget });
    const r = await invokeModel(deps, pedido());
    expect(!r.ok && r.failure.contract).toEqual({ registered: true, code: "BUDGET_LIMIT_EXCEEDED" });
    expect((provider as ScriptedModelProvider).calls).toHaveLength(0);
  });
});

describe("invokeModel — prazo e repetição", () => {
  it("prazo do perfil vale mesmo se o adapter travar; custo fica incerto", async () => {
    const deadline = new ManualDeadline();
    const travado: ModelProviderPort = {
      adapterKey: "test",
      invoke: () => { void Promise.resolve().then(() => deadline.expireAll()); return new Promise(() => {}); },
    };
    const profiles = [perfil({ routing: { ...perfil().routing, candidates: ["m-a"] }, limits: { ...perfil().limits, maxRetriesPerModel: 0 } })];
    const { deps, recorder, budget } = montar({ provider: travado, profiles, deadline });
    const r = await invokeModel(deps, pedido());
    expect(deadline.pending).toBe(0);
    expect(!r.ok && r.failure).toMatchObject({ kind: "attempts_exhausted", lastAttemptKind: "provider_timeout" });
    expect(recorder.records[0]).toMatchObject({ failureKind: "provider_timeout", costStatus: "pending_reconciliation", costMicroUsd: null });
    expect(budget.reservations(TA)[0]!.status).toBe("held");
  });

  it("reinvocar o mesmo invocationId não chama o provider de novo nem gasta fora de reserva", async () => {
    const { deps, provider, budget } = montar();
    expect((await invokeModel(deps, pedido())).ok).toBe(true);
    const repetida = await invokeModel(deps, pedido());
    expect(!repetida.ok && repetida.failure).toMatchObject({ kind: "attempt_already_executed", contract: { registered: true, code: "MODEL_ATTEMPT_ALREADY_EXECUTED" } });
    expect((provider as ScriptedModelProvider).calls).toHaveLength(1);
    expect(budget.reservations(TA)).toHaveLength(1);
  });

  it("tentativa ainda aberta em outra execução não é chamada de novo", async () => {
    const budget = new InMemoryBudgetGuard({ tenants: { [TA]: 1_000_000 } });
    const fp = await fingerprintDe(pedido());
    await budget.acquireAttempt(aquisicao({ workflowKey: "copy-review", attempt: { actionKey: "create_ad_copy", invocationId: "inv-1", number: 1 }, requestFingerprint: fp, acceptedFingerprints: [fp], amountMicroUsd: 2_500 }));
    const { deps, provider } = montar({ budget });
    const r = await invokeModel(deps, pedido());
    expect(!r.ok && r.failure).toMatchObject({ kind: "attempt_in_progress", contract: { registered: true, code: "MODEL_ATTEMPT_IN_PROGRESS" } });
    expect((provider as ScriptedModelProvider).calls).toHaveLength(0);
  });
});

describe("invokeModel — pré-condições e contrato de erro", () => {
  const casos: [string, Partial<ModelInvocationRequest>, object][] = [
    ["sem tenant", { tenantId: " " }, { kind: "tenant_required", contract: { registered: true, code: "TENANT_REQUIRED" } }],
    ["agent desconhecido", { agentKey: "ghost-agent" }, { kind: "agent_not_found", contract: { registered: true, code: "AGENT_NOT_FOUND" } }],
    ["action desconhecida", { actionKey: "ghost_action" }, { kind: "action_not_found", contract: { registered: true, code: "ACTION_NOT_FOUND" } }],
    ["action de outro agent", { actionKey: "create_static_variation" }, { kind: "action_not_callable_by_agent", contract: { registered: true, code: "PERMISSION_DENIED" } }],
    ["rota sem perfil", { actionKey: "revise_copy" }, { kind: "profile_not_found", contract: { registered: true, code: "MODEL_PROFILE_NOT_FOUND" }, retryable: false }],
  ];
  it.each(casos)("%s", async (_n, extra, esperado) => {
    const { deps, provider, recorder } = montar();
    const r = await invokeModel(deps, pedido(extra));
    expect(!r.ok && r.failure).toMatchObject(esperado);
    expect((provider as ScriptedModelProvider).calls).toHaveLength(0);
    expect(recorder.records).toHaveLength(0);
  });

  it("entitlement exigido pelo perfil é verificado no backend antes de qualquer chamada", async () => {
    const profiles = [perfil({ requiredEntitlement: "fixture.ai_copy" })];
    const negado = montar({ profiles });
    const r = await invokeModel(negado.deps, pedido());
    expect(!r.ok && r.failure.contract).toEqual({ registered: true, code: "ENTITLEMENT_REQUIRED" });
    expect((negado.provider as ScriptedModelProvider).calls).toHaveLength(0);
    const concedido = montar({ profiles, entitlements: new SetAiEntitlements([`${TA}::fixture.ai_copy`]) });
    expect((await invokeModel(concedido.deps, pedido())).ok).toBe(true);
  });

  it("nenhum candidato compatível produz falha estruturada com os motivos", async () => {
    const { deps } = montar();
    const r = await invokeModel(deps, pedido({ classification: { sources: [FONTE_CTX], declared: "personal_data" } }));
    expect(!r.ok && r.failure).toMatchObject({ kind: "no_eligible_model", attempts: 0, contract: { registered: true, code: "MODEL_ROUTE_UNAVAILABLE" } });
    expect(!r.ok && r.failure.rejections?.every((x) => x.reasons.includes("data_policy_incompatible"))).toBe(true);
  });

  it("política de tenant devolvida para outro tenant é recusada", async () => {
    const { deps } = montar();
    const r = await invokeModel({ ...deps, tenantPolicies: { forTenant: async () => ({ tenantId: TB, deniedProviders: [], deniedModels: [], allowedProviders: null }) } }, pedido());
    expect(!r.ok && r.failure.contract).toEqual({ registered: true, code: "TENANT_MISMATCH" });
  });
});

describe("isolamento entre tenants", () => {
  it("orçamento esgotado de A não bloqueia B, e B não consome saldo de A", async () => {
    const budget = new InMemoryBudgetGuard({ tenants: { [TA]: 1_000, [TB]: 1_000_000 } });
    const { deps } = montar({ budget });
    const a = await invokeModel(deps, pedido());
    const b = await invokeModel(deps, pedido({ tenantId: TB, invocationId: "inv-b" }));
    expect(!a.ok && a.failure.kind).toBe("budget_exceeded");
    expect(b.ok).toBe(true);
    expect(budget.reservations(TA)).toHaveLength(0);
    expect((await budget.remaining({ tenantId: TA, workflowKey: "copy-review" })).remainingMicroUsd).toBe(1_000);
  });

  it("tenant sem teto configurado não chama modelo (falha fechada, BUDGET_NOT_CONFIGURED — CR-027 D-2)", async () => {
    const classifier = new InMemoryDataClassifier().register("tenant-sem-teto", FONTE_CTX, "synthetic");
    const { deps } = montar({ budget: new InMemoryBudgetGuard({ tenants: { [TA]: 1_000_000 } }), classifier });
    const r = await invokeModel(deps, pedido({ tenantId: "tenant-sem-teto" }));
    expect(!r.ok && r.failure.kind).toBe("budget_not_configured");
  });

  it("restrição de fornecedor de A não afeta B", async () => {
    const policies = new InMemoryTenantAiPolicies({ [TA]: { deniedProviders: ["lab-a"] } });
    const { deps } = montar({ policies });
    const a = await invokeModel(deps, pedido());
    const b = await invokeModel(deps, pedido({ tenantId: TB, invocationId: "inv-b" }));
    expect(a.ok && a.modelId).toBe("m-b");
    expect(b.ok && b.modelId).toBe("m-a");
  });

  it("registros e reservas ficam marcados com o tenant da chamada", async () => {
    const { deps, recorder, budget } = montar();
    await invokeModel(deps, pedido());
    await invokeModel(deps, pedido({ tenantId: TB, invocationId: "inv-b" }));
    expect(recorder.ofTenant(TA).map((r) => r.invocationId)).toEqual(["inv-1"]);
    expect(recorder.ofTenant(TB).map((r) => r.invocationId)).toEqual(["inv-b"]);
    expect(budget.reservations(TB)).toHaveLength(1);
    // O token de A não fecha tentativa de B com a mesma chave lógica.
    const deA = budget.reservations(TA)[0]!;
    const deB = aquisicao({ tenantId: TB, workflowKey: "copy-review", attempt: { actionKey: "create_ad_copy", invocationId: "inv-b", number: 1 } });
    expect(await budget.closeAttempt(fechamentoPara(deB, deA.fencingToken))).toEqual({ status: "rejected" });
  });

  it("aquisição distingue adquirida, em andamento e encerrada, por tenant", async () => {
    const budget = new InMemoryBudgetGuard({ tenants: { [TA]: 10_000, [TB]: 10_000 } });
    const pedidoA = aquisicao({ amountMicroUsd: 6_000 });
    const [a1, a2] = await Promise.all([budget.acquireAttempt(pedidoA), budget.acquireAttempt(pedidoA)]);
    expect([a1.status, a2.status]).toEqual(["acquired", "in_progress"]);
    const b1 = await budget.acquireAttempt(aquisicao({ tenantId: TB, amountMicroUsd: 6_000 }));
    expect(b1.status).toBe("acquired");
    expect((await budget.remaining({ tenantId: TA, workflowKey: "w" })).remainingMicroUsd).toBe(4_000);
    if (a1.status !== "acquired") throw new Error("esperado acquired");
    const fechamento = fechamentoPara(pedidoA, a1.fencingToken, 5_000);
    expect(await budget.closeAttempt(fechamento)).toEqual({ status: "closed" });
    expect((await budget.acquireAttempt(pedidoA)).status).toBe("closed");
    // Replay exato é duplicata; qualquer divergência é rejeitada sem efeito.
    expect(await budget.closeAttempt(fechamento)).toEqual({ status: "duplicate" });
    expect(await budget.closeAttempt(fechamentoPara(pedidoA, a1.fencingToken, 1))).toEqual({ status: "rejected" });
    expect(budget.recorder.ofTenant(TA)).toHaveLength(1);
  });

  it("tenant sem período configurado: tentativa nova é budget_not_configured e nada é chamado", async () => {
    const budget = new InMemoryBudgetGuard({ tenants: { [TB]: 10_000 } });
    const { deps, provider } = montar({ budget });
    const r = await invokeModel(deps, pedido());
    expect(!r.ok && r.failure).toMatchObject({ kind: "budget_not_configured", contract: { registered: true, code: "BUDGET_NOT_CONFIGURED" }, retryable: false });
    expect((provider as ScriptedModelProvider).calls).toHaveLength(0);
    expect(budget.reservations(TA)).toHaveLength(0);
  });

  it("teto por workflow limita dentro do tenant", async () => {
    const budget = new InMemoryBudgetGuard({ tenants: { [TA]: 1_000_000 }, workflows: { [`${TA}::copy-review`]: 2_000 } });
    const { deps } = montar({ budget });
    const r = await invokeModel(deps, pedido());
    expect(!r.ok && r.failure.kind).toBe("budget_exceeded");
    expect((await budget.remaining({ tenantId: TA, workflowKey: "outro" })).remainingMicroUsd).toBe(1_000_000);
  });
});
