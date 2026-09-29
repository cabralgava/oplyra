// Fronteiras do harness: concorrência por tentativa, validação em runtime do
// pedido e da resposta do adapter, semântica de imagens e propagação de trace.
import { describe, expect, it } from "vitest";
import { invokeModel } from "@oplyra/core";
import type { ModelInvocationRequest, ModelProviderPort, ProviderCall, ProviderCallResult } from "@oplyra/core";
import { InMemoryBudgetGuard, ScriptedModelProvider, scripted } from "@oplyra/testing";
import { TA, TRACE_MINIMO, modelo, montar, pedido, perfil } from "./ai-model-harness-fixtures.ts";
import { COPY1, FP, aquisicao, fechamentoPara, imagemModelo, perfilImagem } from "./ai-model-harness-fixtures.ts";

const INVALIDOS: [string, unknown][] = [
  ["negativo", -1], ["decimal", 1.5], ["NaN", Number.NaN], ["infinito", Number.POSITIVE_INFINITY],
  ["-infinito", Number.NEGATIVE_INFINITY], ["acima do inteiro seguro", Number.MAX_SAFE_INTEGER + 1], ["texto", "10"], ["null", null],
];

/** Sem chamada, sem registro e sem reserva: a validação vem antes de tudo. */
async function semEfeitos(extra: Record<string, unknown>, profiles = [perfil()]) {
  const ctx = montar({ profiles, models: [modelo("m-a"), modelo("m-b", "lab-b"), imagemModelo] });
  const r = await invokeModel(ctx.deps, { ...pedido(), ...extra } as unknown as ModelInvocationRequest);
  expect((ctx.provider as ScriptedModelProvider).calls).toHaveLength(0);
  expect(ctx.recorder.records).toHaveLength(0);
  expect(ctx.budget.reservations(TA)).toHaveLength(0);
  return r;
}

describe("concorrência por tentativa", () => {
  it("duas execuções simultâneas do mesmo invocationId#attempt resultam em exatamente uma chamada", async () => {
    let liberar!: () => void;
    const portao = new Promise<void>((r) => { liberar = r; });
    const chamadas: string[] = [];
    const lento: ModelProviderPort = {
      adapterKey: "test",
      async invoke(call) {
        chamadas.push(call.callId);
        await portao;
        return scripted.success()(call);
      },
    };
    const { deps, recorder, budget } = montar({ provider: lento });
    const execucoes = [invokeModel(deps, pedido()), invokeModel(deps, pedido())];
    // A execução que não adquiriu termina sozinha, sem esperar o provider.
    const primeiraAEncerrar = await Promise.race(execucoes);
    expect(!primeiraAEncerrar.ok && primeiraAEncerrar.failure.kind).toBe("attempt_in_progress");
    liberar();
    const resultados = await Promise.all(execucoes);
    expect(chamadas).toEqual([COPY1]);
    expect(resultados.filter((r) => r.ok)).toHaveLength(1);
    expect(resultados.filter((r) => !r.ok && r.failure.kind === "attempt_in_progress")).toHaveLength(1);
    expect(recorder.records).toHaveLength(1);
    expect(budget.reservations(TA)).toMatchObject([{ status: "settled" }]);
  });

  it("depois de encerrada, a tentativa não é repetida", async () => {
    const { deps, provider } = montar();
    await invokeModel(deps, pedido());
    const r = await invokeModel(deps, pedido());
    expect(!r.ok && r.failure.kind).toBe("attempt_already_executed");
    expect((provider as ScriptedModelProvider).calls).toHaveLength(1);
  });

  it("dez execuções simultâneas: uma chamada, nove em andamento", async () => {
    let liberar!: () => void;
    const portao = new Promise<void>((r) => { liberar = r; });
    let n = 0;
    const lento: ModelProviderPort = { adapterKey: "test", async invoke(call) { n++; await portao; return scripted.success()(call); } };
    const { deps } = montar({ provider: lento });
    const execucoes = Array.from({ length: 10 }, () => invokeModel(deps, pedido()));
    await Promise.race(execucoes);
    liberar();
    const rs = await Promise.all(execucoes);
    expect(n).toBe(1);
    expect(rs.filter((r) => !r.ok && r.failure.kind === "attempt_in_progress")).toHaveLength(9);
  });
});

describe("validação do pedido em runtime", () => {
  it.each(INVALIDOS)("inputTokensHint %s é rejeitado", async (_n, valor) => {
    const r = await semEfeitos({ inputTokensHint: valor });
    expect(!r.ok && r.failure).toMatchObject({ kind: "invalid_request", contract: { registered: true, code: "MODEL_INVOCATION_INVALID" } });
    expect(!r.ok && r.failure.issues).toContain("inputTokensHint: inteiro seguro >= 0");
  });

  it.each(INVALIDOS.filter(([n]) => n !== "null"))("requestedImages %s é rejeitado", async (_n, valor) => {
    const r = await semEfeitos({ requestedImages: valor });
    expect(!r.ok && r.failure.issues).toContain("requestedImages: inteiro seguro >= 0");
  });

  const casos: [string, Record<string, unknown>, string][] = [
    ["invocationId vazio", { invocationId: "" }, "invocationId: texto não vazio"],
    ["workflowKey em branco", { workflowKey: "   " }, "workflowKey: texto não vazio"],
    ["agentKey ausente", { agentKey: undefined }, "agentKey: texto não vazio"],
    ["actionKey numérico", { actionKey: 7 }, "actionKey: texto não vazio"],
    ["sem trace", { trace: undefined }, "trace: objeto obrigatório"],
    ["correlationId vazio", { trace: { ...TRACE_MINIMO, correlationId: "" } }, "trace.correlationId: texto não vazio"],
    ["taskId vazio", { trace: { ...TRACE_MINIMO, taskId: "" } }, "trace.taskId: null ou texto não vazio"],
    ["runId ausente", { trace: { ...TRACE_MINIMO, runId: undefined } }, "trace.runId: null ou texto não vazio"],
    ["classificação declarada desconhecida", { classification: { sources: [], declared: "public" } }, "classification.declared: null ou valor conhecido"],
    ["sem mensagens", { messages: [] }, "messages: ao menos uma mensagem"],
    ["papel desconhecido", { messages: [{ role: "tool", content: "x" }] }, "messages[0].role: valor desconhecido"],
    ["conteúdo vazio", { messages: [{ role: "user", content: "" }] }, "messages[0].content: texto não vazio e Unicode bem formado"],
    ["mensagem não objeto", { messages: ["oi"] }, "messages[0]: objeto"],
    ["sem modalidades", { inputModalities: [] }, "inputModalities: ao menos uma modalidade"],
    ["modalidade desconhecida", { inputModalities: ["text", "smell"] }, "inputModalities: valor desconhecido"],
    ["modalidade repetida", { inputModalities: ["text", "text"] }, "inputModalities: valor repetido"],
    ["mensagens sem text", { inputModalities: ["image"] }, "inputModalities: mensagens exigem text"],
  ];
  it.each(casos)("%s", async (_n, extra, problema) => {
    const r = await semEfeitos(extra);
    expect(!r.ok && r.failure.kind).toBe("invalid_request");
    expect(!r.ok && r.failure.issues).toContain(problema);
  });

  it("tenantId que não é texto é TENANT_REQUIRED", async () => {
    const r = await semEfeitos({ tenantId: 42 });
    expect(!r.ok && r.failure.contract).toEqual({ registered: true, code: "TENANT_REQUIRED" });
  });

  it("problemas citam caminhos, nunca o conteúdo recebido", async () => {
    const r = await semEfeitos({ messages: [{ role: "tool", content: "segredo-do-pedido" }], inputTokensHint: -99 });
    expect(JSON.stringify(r)).not.toContain("segredo-do-pedido");
    expect(JSON.stringify(r)).not.toContain("-99");
  });
});

describe("validação da resposta do adapter antes da liquidação", () => {
  const sucesso = (sobre: Record<string, unknown>, uso: Record<string, unknown> = {}) => (call: ProviderCall) => {
    const base = scripted.success()(call) as Extract<ProviderCallResult, { ok: true }>;
    return { ...base, usage: { ...base.usage, ...uso }, ...sobre } as unknown as ProviderCallResult;
  };
  const cobranca = (reportedCostMicroUsd: unknown) => sucesso({ billing: { kind: "charged", reportedCostMicroUsd } });

  const respostas: [string, (call: ProviderCall) => ProviderCallResult, string][] = [
    ["inputTokens negativo", sucesso({}, { inputTokens: -1 }), "usage.inputTokens: inteiro seguro >= 0"],
    ["outputTokens decimal", sucesso({}, { outputTokens: 1.5 }), "usage.outputTokens: inteiro seguro >= 0"],
    ["images NaN", sucesso({}, { images: Number.NaN }), "usage.images: inteiro seguro >= 0"],
    ["inputTokens infinito", sucesso({}, { inputTokens: Number.POSITIVE_INFINITY }), "usage.inputTokens: inteiro seguro >= 0"],
    ["outputTokens acima do limite pedido", sucesso({}, { outputTokens: 5_000 }), "usage.outputTokens: acima do limite pedido"],
    ["usage ausente", sucesso({ usage: null }), "usage: objeto obrigatório"],
    ["custo negativo", cobranca(-500), "billing.reportedCostMicroUsd: null ou inteiro seguro >= 0"],
    ["custo NaN", cobranca(Number.NaN), "billing.reportedCostMicroUsd: null ou inteiro seguro >= 0"],
    ["custo decimal", cobranca(0.5), "billing.reportedCostMicroUsd: null ou inteiro seguro >= 0"],
    ["custo infinito", cobranca(Number.POSITIVE_INFINITY), "billing.reportedCostMicroUsd: null ou inteiro seguro >= 0"],
    ["tipo de cobrança desconhecido", sucesso({ billing: { kind: "free" } }), "billing.kind: valor desconhecido"],
    ["modelo resolvido vazio", sucesso({ resolvedProviderModelId: "" }), "resolvedProviderModelId: texto não vazio"],
    ["parâmetros ignorados não é lista", sucesso({ ignoredParameters: "temperature" }), "ignoredParameters: lista de textos"],
    ["request id numérico", sucesso({ externalRequestId: 42 }), "externalRequestId: null ou texto não vazio"],
    ["saída não textual", sucesso({ output: { modality: "text", text: { a: 1 } } }), "output.text: texto"],
    ["modalidade visual em rota de texto", sucesso({ output: { modality: "visual", assets: [] } }), "output.modality: rota textual exige text"],
    ["imagem cobrada em rota de texto", sucesso({}, { images: 1 }), "usage.images: rota sem imagem"],
    ["erro desconhecido", () => ({ ok: false, errorKind: "exploded", externalRequestId: null, billing: { kind: "none" } }) as unknown as ProviderCallResult, "errorKind: valor desconhecido"],
    ["resultado sem ok", () => ({ outputText: "x" }) as unknown as ProviderCallResult, "resultado: objeto com ok booleano"],
  ];

  it.each(respostas)("%s: não liquida, não aumenta saldo e fica pendente", async (_n, roteiro, problema) => {
    const provider = new ScriptedModelProvider("test", { "lab-a/m-a": roteiro });
    const { deps, recorder, budget } = montar({ provider });
    const r = await invokeModel(deps, pedido());
    expect(!r.ok && r.failure).toMatchObject({ kind: "provider_response_invalid", contract: { registered: true, code: "MODEL_PROVIDER_RESPONSE_INVALID" }, attempts: 1 });
    expect(!r.ok && r.failure.issues).toContain(problema);
    expect(provider.calls).toHaveLength(1);
    expect(budget.reservations(TA)).toMatchObject([{ status: "held", amount: 2_500 }]);
    expect((await budget.remaining({ tenantId: TA, workflowKey: "copy-review" })).remainingMicroUsd).toBe(1_000_000 - 2_500);
    expect(recorder.records[0]).toMatchObject({ costMicroUsd: null, costStatus: "pending_reconciliation", usage: null, outcome: "failed" });
  });

  it("guarda de orçamento recusa liquidação inválida mesmo se chamada diretamente", async () => {
    const budget = new InMemoryBudgetGuard({ tenants: { [TA]: 10_000 } });
    const pedidoA = aquisicao({ attempt: { actionKey: "create_ad_copy", invocationId: "k", number: 1 } });
    const a = await budget.acquireAttempt(pedidoA);
    if (a.status !== "acquired") throw new Error("esperado acquired");
    for (const v of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(await budget.closeAttempt(fechamentoPara(pedidoA, a.fencingToken, v))).toEqual({ status: "rejected" });
    }
    await expect(budget.acquireAttempt(aquisicao({ attempt: { actionKey: "create_ad_copy", invocationId: "k", number: 2 }, amountMicroUsd: -5 }))).rejects.toThrow("reserva inválido");
    expect((await budget.remaining({ tenantId: TA, workflowKey: "w" })).remainingMicroUsd).toBe(9_000);
    expect(budget.recorder.records).toHaveLength(0);
  });
});

describe("semântica de requestedImages", () => {

  it.each([["ausente", undefined], ["zero", 0]])("rota visual com quantidade %s é rejeitada", async (_n, qtd) => {
    const r = await semEfeitos(qtd === undefined ? { agentKey: "design-agent", actionKey: "create_static_variation" } :
      { agentKey: "design-agent", actionKey: "create_static_variation", requestedImages: qtd }, [perfil(), perfilImagem]);
    expect(!r.ok && r.failure).toMatchObject({ kind: "invalid_request", issues: ["requestedImages: rota visual exige inteiro >= 1"] });
  });

  it("rota de texto não aceita imagens pedidas", async () => {
    const r = await semEfeitos({ requestedImages: 1 });
    expect(!r.ok && r.failure).toMatchObject({ kind: "invalid_request", issues: ["requestedImages: rota sem imagem não aceita imagens"] });
  });

});

describe("propagação de TraceContext", () => {
  const TRACE_COMPLETO = {
    correlationId: "corr-campaign-123", transactionId: "txn-copy-01", causationId: "txn-orchestrator-01",
    parentTransactionId: "txn-parent-01", workflowId: "wf-campaign-01", taskId: "task-998", runId: "run-copy-01",
  };

  it("todos os campos chegam intactos a cada ModelCallRecord, inclusive em retry e fallback", async () => {
    const provider = new ScriptedModelProvider("test", { "lab-a/m-a": scripted.failure("unavailable") });
    const { deps, recorder } = montar({ provider });
    const r = await invokeModel(deps, pedido({ trace: TRACE_COMPLETO }));
    expect(r.ok).toBe(true);
    expect(recorder.records).toHaveLength(3);
    for (const registro of recorder.records) expect(registro.trace).toEqual(TRACE_COMPLETO);
  });

  it("campos ausentes permanecem null, não viram texto vazio nem somem", async () => {
    const { deps, recorder } = montar();
    await invokeModel(deps, pedido({ trace: TRACE_MINIMO }));
    expect(recorder.records[0]!.trace).toEqual(TRACE_MINIMO);
    expect(Object.keys(recorder.records[0]!.trace).sort()).toEqual(Object.keys(TRACE_COMPLETO).sort());
  });

  it("o registro guarda uma cópia: alterar o pedido depois não altera o trace registrado", async () => {
    const { deps, recorder } = montar();
    const trace = { ...TRACE_COMPLETO };
    await invokeModel(deps, pedido({ trace }));
    (trace as { taskId: string }).taskId = "adulterado";
    expect(recorder.records[0]!.trace.taskId).toBe("task-998");
  });

  it("o trace não é enviado ao fornecedor", async () => {
    const vistos: ProviderCall[] = [];
    const espiao: ModelProviderPort = { adapterKey: "test", async invoke(call) { vistos.push(call); return scripted.success()(call); } };
    const { deps } = montar({ provider: espiao });
    await invokeModel(deps, pedido({ trace: TRACE_COMPLETO }));
    expect(JSON.stringify(vistos)).not.toMatch(/corr-campaign|txn-|wf-campaign|task-998|run-copy/);
  });
});
