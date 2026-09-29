// Lacunas contratuais do slice 1: idempotência por fingerprint, classificação
// com proveniência verificável, estimativa de tokens não autoritativa do
// chamador e saída visual por referência a asset.
import { describe, expect, it } from "vitest";
import { ATTEMPT_CALL_ID_PATTERN, IDENTIFIER_LIMITS, attemptCallId, canonicalRequestMaterial, conservativeInputTokenBound, invokeModel } from "@oplyra/core";
import type { DataClassificationPort, FingerprintMaterial, ModelInvocationRequest, ModelProviderPort, ProviderCall, ProviderCallResult, TokenEstimatorPort } from "@oplyra/core";
import { vi } from "vitest";
import { HmacRequestFingerprinter } from "../../infra/src/ai-model-harness/hmac-fingerprint.ts";
import {
  FixedTokenEstimator, InMemoryDataClassifier, InMemoryGeneratedAssets, ScriptedModelProvider, scripted,
} from "@oplyra/testing";
import {
  CHAVE_SINTETICA_V1, CHAVE_SINTETICA_V2, COPY1, FINGERPRINTER_SINTETICO, IMG1, REV1, FONTE_CTX, SEGREDO, TA, TB, fingerprintDe, imagemModelo,
  modelo, montar, pedido, pedidoImagem, perfil, perfilImagem, perfilRevisao,
} from "./ai-model-harness-fixtures.ts";

const semProvider = (ctx: ReturnType<typeof montar>) => {
  expect((ctx.provider as ScriptedModelProvider).calls).toHaveLength(0);
  expect(ctx.recorder.records).toHaveLength(0);
  expect(ctx.budget.reservations(TA)).toHaveLength(0);
};

describe("idempotência: material canônico, fingerprint protegido e escopo tenant + action + chave", () => {
  const base: FingerprintMaterial = {
    tenantId: TA, workflowKey: "copy-review", agentKey: "copywriting-agent", actionKey: "create_ad_copy",
    profileRef: "fixture.copy@3", effectiveClassification: "synthetic", declaredClassification: null,
    classificationSources: [{ kind: "context_package", ref: "c1" }, { kind: "asset", ref: "a1" }],
    inputModalities: ["text", "image"], requestedImages: 0,
    messages: [{ role: "system", content: "s" }, { role: "user", content: SEGREDO }],
  };
  const fp = async (m: FingerprintMaterial) => (await FINGERPRINTER_SINTETICO.fingerprint(canonicalRequestMaterial(m))).primary;

  it("fingerprint no formato protegido, determinístico e sem o prompt", async () => {
    const a = await fp(base);
    expect(a).toMatch(/^hmac-sha256:v1:synthetic-test-v1:[0-9a-f]{64}$/);
    expect(await fp({ ...base })).toBe(a);
    for (const pedaco of SEGREDO.split(" ").filter((p) => p.length >= 4)) expect(a).not.toContain(pedaco);
  });

  it.each<[string, Partial<FingerprintMaterial>]>([
    ["tenant", { tenantId: TB }],
    ["workflow", { workflowKey: "outro" }],
    ["agent", { agentKey: "design-agent" }],
    ["action", { actionKey: "revise_copy" }],
    ["perfil (versão)", { profileRef: "fixture.copy@4" }],
    ["classificação efetiva", { effectiveClassification: "internal" }],
    ["classificação declarada", { declaredClassification: "internal" }],
    ["fontes", { classificationSources: [{ kind: "context_package", ref: "c2" }] }],
    ["modalidades", { inputModalities: ["text"] }],
    ["imagens pedidas", { requestedImages: 1 }],
    ["conteúdo", { messages: [{ role: "system", content: "s" }, { role: "user", content: `${SEGREDO}.` }] }],
    ["papel", { messages: [{ role: "system", content: "s" }, { role: "assistant", content: SEGREDO }] }],
    ["ordem das mensagens", { messages: [{ role: "user", content: SEGREDO }, { role: "system", content: "s" }] }],
  ])("muda com %s", async (_n, variacao) => {
    expect(canonicalRequestMaterial({ ...base, ...variacao })).not.toBe(canonicalRequestMaterial(base));
    expect(await fp({ ...base, ...variacao })).not.toBe(await fp(base));
  });

  it("não depende da ordem de fontes e modalidades (conjuntos)", () => {
    expect(canonicalRequestMaterial({
      ...base, classificationSources: [...base.classificationSources].reverse(), inputModalities: ["image", "text"],
    })).toBe(canonicalRequestMaterial(base));
  });

  it("callId cobre o escopo completo: tenant, action, invocation e tentativa", () => {
    const base = attemptCallId(TA, "create_ad_copy", "inv-1", 1);
    expect(base).toMatch(ATTEMPT_CALL_ID_PATTERN);
    expect(attemptCallId(TB, "create_ad_copy", "inv-1", 1)).not.toBe(base);
    expect(attemptCallId(TA, "revise_copy", "inv-1", 1)).not.toBe(base);
    expect(attemptCallId(TA, "create_ad_copy", "inv-2", 1)).not.toBe(base);
    expect(attemptCallId(TA, "create_ad_copy", "inv-1", 2)).not.toBe(base);
    expect(attemptCallId(TA, "create_ad_copy", "inv-1", 1)).toBe(base);
  });

  it("/, #, % e Unicode válido não colidem nem aparecem crus", () => {
    const casos: [string, string, string, number][] = [
      ["t", "a", "b/c", 1], ["t", "a/b", "c", 1], ["t/a", "b", "c", 1],
      ["t", "a", "b#2", 1], ["t", "a", "b", 2], ["t", "a#", "b", 1],
      ["t", "a", "%2F", 1], ["t", "a", "/", 1], ["t", "a", "%", 1], ["t", "a", "%25", 1],
      ["t", "a", "ação", 1], ["t", "a", "acao", 1], ["t", "a", "🚀", 1], ["t", "a", "\"", 1], ["t", "a", "\",\"", 1],
      ["t\",\"a", "b", "c", 1], ["t", "a\",\"b", "c", 1],
    ];
    const ids = casos.map(([t, a, i, n]) => attemptCallId(t, a, i, n));
    expect(new Set(ids).size).toBe(casos.length);
    for (const id of ids) {
      expect(id).toMatch(ATTEMPT_CALL_ID_PATTERN);
      expect(id).not.toMatch(/[/#%"]/);
    }
  });

  it("callId é limitado pelos limites de identificador", () => {
    const maior = attemptCallId("t".repeat(IDENTIFIER_LIMITS.tenantId), "a".repeat(IDENTIFIER_LIMITS.actionKey), "🚀".repeat(Math.floor(IDENTIFIER_LIMITS.invocationId / 2)), 5);
    // Pior caso: 4 bytes UTF-8 por par de sub-rogados, base64url 4/3, mais o prefixo.
    expect(maior.length).toBeLessThanOrEqual(1024);
  });

  it("o adapter recebe o callId interno do escopo completo", async () => {
    const ctx = montar();
    await invokeModel(ctx.deps, pedido());
    await invokeModel(ctx.deps, pedido({ tenantId: TB }));
    expect((ctx.provider as ScriptedModelProvider).calls.map((c) => c.callId)).toEqual([
      attemptCallId(TA, "create_ad_copy", "inv-1", 1), attemptCallId(TB, "create_ad_copy", "inv-1", 1),
    ]);
    expect(ctx.recorder.records.map((r) => r.callId)).toEqual([COPY1, attemptCallId(TB, "create_ad_copy", "inv-1", 1)]);
  });

  it("mesma action e invocation em tenants diferentes geram callIds diferentes", async () => {
    const ctx = montar();
    await invokeModel(ctx.deps, pedido());
    await invokeModel(ctx.deps, pedido({ tenantId: TB }));
    const [a, b] = (ctx.provider as ScriptedModelProvider).calls.map((c) => c.callId);
    expect(a).not.toBe(b);
  });

  it.each<[string, Record<string, unknown>, string]>([
    ["invocationId", { invocationId: "inv-\ud800" }, "invocationId: texto não vazio"],
    ["tenantId", { tenantId: "tenant-\udc00-a" }, "tenantId: texto não vazio"],
    ["workflowKey", { workflowKey: "wf\ud83d" }, "workflowKey: texto não vazio"],
    ["trace", { trace: { ...pedido().trace, taskId: "task-\ud800" } }, "trace.taskId: null ou texto não vazio"],
    ["mensagem", { messages: [{ role: "user", content: "texto \udfff solto" }] }, "messages[0].content: texto não vazio e Unicode bem formado"],
    ["fonte de classificação", { classification: { sources: [{ kind: "context_package", ref: "ctx-\ud800" }], declared: null } }, "classification.sources[0].ref: texto não vazio até 256"],
  ])("surrogate isolado em %s é MODEL_INVOCATION_INVALID sem efeitos", async (_n, extra, problema) => {
    const espiao = { fingerprint: vi.fn(FINGERPRINTER_SINTETICO.fingerprint.bind(FINGERPRINTER_SINTETICO)) };
    const ctx = montar({ fingerprints: espiao });
    const r = await invokeModel(ctx.deps, { ...pedido(), ...extra } as ModelInvocationRequest);
    expect(!r.ok && r.failure).toMatchObject({ kind: "invalid_request", contract: { registered: true, code: "MODEL_INVOCATION_INVALID" } });
    expect(!r.ok && r.failure.issues).toContain(problema);
    expect(espiao.fingerprint).not.toHaveBeenCalled();
    semProvider(ctx);
  });

  it.each<[string, Record<string, unknown>, string]>([
    ["invocationId acima de 255", { invocationId: "i".repeat(256) }, "invocationId: até 255 caracteres"],
    ["tenantId acima de 128", { tenantId: "t".repeat(129) }, "tenantId: até 128 caracteres"],
    ["actionKey fora do padrão canônico", { actionKey: "Create-Ad" }, "actionKey: padrão ^[a-z][a-z0-9_]*$"],
    ["agentKey fora do padrão canônico", { agentKey: "copywriter" }, "agentKey: padrão ^[a-z][a-z0-9-]*-agent$"],
  ])("limite de identificador: %s", async (_n, extra, problema) => {
    const ctx = montar();
    const r = await invokeModel(ctx.deps, pedido(extra as Partial<ModelInvocationRequest>));
    expect(!r.ok && r.failure.issues).toContain(problema);
    semProvider(ctx);
  });

  it("mesma chave e mesma requisição: uma única chamada; trace e dica diferentes não são materiais", async () => {
    const ctx = montar();
    expect((await invokeModel(ctx.deps, pedido())).ok).toBe(true);
    const repetida = await invokeModel(ctx.deps, pedido({ trace: { ...pedido().trace, correlationId: "corr-reentrega" }, inputTokensHint: 900 }));
    expect(!repetida.ok && repetida.failure.kind).toBe("attempt_already_executed");
    expect((ctx.provider as ScriptedModelProvider).calls).toHaveLength(1);
  });

  it("conflito dentro da mesma action: IDEMPOTENCY_CONFLICT, sem provider, sem reserva nova", async () => {
    const ctx = montar();
    await invokeModel(ctx.deps, pedido());
    const r = await invokeModel(ctx.deps, pedido({ messages: [{ role: "user", content: "outro briefing sintético" }] }));
    expect(!r.ok && r.failure).toMatchObject({ kind: "idempotency_conflict", contract: { registered: true, code: "IDEMPOTENCY_CONFLICT" }, retryable: false });
    expect((ctx.provider as ScriptedModelProvider).calls).toHaveLength(1);
    expect(ctx.budget.reservations(TA)).toHaveLength(1);
    expect(ctx.recorder.records).toHaveLength(1);
  });

  it("mesma invocation em actions diferentes não conflita e usa callIds distintos", async () => {
    const ctx = montar({ profiles: [perfil(), perfilRevisao] });
    const a = await invokeModel(ctx.deps, pedido());
    const b = await invokeModel(ctx.deps, pedido({ actionKey: "revise_copy", messages: [{ role: "user", content: "revisão sintética" }] }));
    expect(a.ok && b.ok).toBe(true);
    const chamadas = (ctx.provider as ScriptedModelProvider).calls.map((c) => c.callId);
    expect(chamadas).toEqual([COPY1, REV1]);
    expect(ctx.recorder.records.map((r) => [r.actionKey, r.callId])).toEqual([
      ["create_ad_copy", COPY1], ["revise_copy", REV1],
    ]);
    expect(ctx.budget.reservations(TA)).toHaveLength(2);
  });

  it("mesma invocation e mesma requisição em outra action também é outra tentativa", async () => {
    const ctx = montar({ profiles: [perfil(), perfilRevisao] });
    await invokeModel(ctx.deps, pedido());
    const r = await invokeModel(ctx.deps, pedido({ actionKey: "revise_copy" }));
    expect(r.ok).toBe(true);
    expect((ctx.provider as ScriptedModelProvider).calls).toHaveLength(2);
  });

  it("conflito é detectado mesmo com a tentativa original ainda em andamento", async () => {
    let liberar!: () => void;
    const portao = new Promise<void>((r) => { liberar = r; });
    const chamadas: string[] = [];
    const lento: ModelProviderPort = { adapterKey: "test", async invoke(call) { chamadas.push(call.callId); await portao; return scripted.success()(call); } };
    const { deps } = montar({ provider: lento });
    const original = invokeModel(deps, pedido());
    const diferente = await invokeModel(deps, pedido({ messages: [{ role: "user", content: "pedido diferente" }] }));
    expect(!diferente.ok && diferente.failure.kind).toBe("idempotency_conflict");
    liberar();
    expect((await original).ok).toBe(true);
    expect(chamadas).toEqual([COPY1]);
  });

  it("o escopo é por tenant: mesmo invocationId e action em outro tenant não conflita", async () => {
    const ctx = montar();
    await invokeModel(ctx.deps, pedido());
    const b = await invokeModel(ctx.deps, pedido({ tenantId: TB, messages: [{ role: "user", content: "outro tenant" }] }));
    expect(b.ok).toBe(true);
  });

  it("rotação: chave anterior no keyring aceita a reentrega; chave retirada vira conflito sem chamada", async () => {
    const ctx = montar();
    await invokeModel(ctx.deps, pedido());
    const girado = new HmacRequestFingerprinter({ active: CHAVE_SINTETICA_V2, previous: [CHAVE_SINTETICA_V1] });
    const reentrega = await invokeModel({ ...ctx.deps, fingerprints: girado }, pedido());
    expect(!reentrega.ok && reentrega.failure.kind).toBe("attempt_already_executed");
    const semAnterior = new HmacRequestFingerprinter({ active: CHAVE_SINTETICA_V2 });
    const apos = await invokeModel({ ...ctx.deps, fingerprints: semAnterior }, pedido());
    expect(!apos.ok && apos.failure.kind).toBe("idempotency_conflict");
    expect((ctx.provider as ScriptedModelProvider).calls).toHaveLength(1);
  });

  it("porta de fingerprint fora do formato protegido impede a aquisição", async () => {
    const ctx = montar({ fingerprints: { fingerprint: async () => ({ primary: "sha256:v1:abc", accepted: ["sha256:v1:abc"] }) } });
    await expect(invokeModel(ctx.deps, pedido())).rejects.toThrow("formato protegido");
    semProvider(ctx);
  });

  it("fingerprint registrado e reservado é o HMAC da requisição material", async () => {
    const ctx = montar();
    await invokeModel(ctx.deps, pedido());
    const esperado = await fingerprintDe(pedido());
    expect(ctx.recorder.records[0]!.requestFingerprint).toBe(esperado);
    expect(ctx.budget.reservations(TA)[0]!.fingerprint).toBe(esperado);
  });

  it("nenhum registro, reserva ou log guarda o prompt em texto puro", async () => {
    const espioes = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    try {
      const ctx = montar();
      await invokeModel(ctx.deps, pedido());
      await invokeModel(ctx.deps, pedido({ messages: [{ role: "user", content: SEGREDO + " variante" }] }));
      const persistido = JSON.stringify([ctx.recorder.records, ctx.budget.reservations(TA)]);
      expect(persistido).not.toContain(SEGREDO);
      expect(persistido).not.toContain("confidencial");
      const logado = JSON.stringify(espioes.flatMap((e) => e.mock.calls));
      expect(logado).not.toContain("confidencial");
    } finally {
      for (const e of espioes) e.mockRestore();
    }
  });
});

describe("classificação com proveniência verificável", () => {
  it("downgrade pelo chamador é rejeitado antes de qualquer efeito", async () => {
    const classifier = new InMemoryDataClassifier().register(TA, FONTE_CTX, "tenant_confidential");
    const ctx = montar({ classifier });
    const r = await invokeModel(ctx.deps, pedido({ classification: { sources: [FONTE_CTX], declared: "synthetic" } }));
    expect(!r.ok && r.failure).toMatchObject({
      kind: "invalid_request", issues: ["classification.declared: abaixo da classificação verificada; downgrade proibido"],
    });
    semProvider(ctx);
  });

  it("sem fonte vale o default conservador e declarar menos é downgrade", async () => {
    const ctx = montar();
    const semFonte = await invokeModel(ctx.deps, pedido({ classification: { sources: [], declared: null } }));
    expect(!semFonte.ok && semFonte.failure.kind).toBe("no_eligible_model");
    expect(!semFonte.ok && semFonte.failure.rejections?.every((x) => x.reasons.includes("data_policy_incompatible"))).toBe(true);
    const declarada = await invokeModel(ctx.deps, pedido({ classification: { sources: [], declared: "synthetic" } }));
    expect(!declarada.ok && declarada.failure.kind).toBe("invalid_request");
    semProvider(ctx);
  });

  it("o chamador pode elevar a classificação verificada", async () => {
    const ctx = montar();
    const r = await invokeModel(ctx.deps, pedido({ classification: { sources: [FONTE_CTX], declared: "internal" } }));
    expect(r.ok).toBe(true);
    expect(ctx.recorder.records[0]).toMatchObject({
      dataClassification: "internal",
      classificationProvenance: [{ kind: "context_package", ref: FONTE_CTX.ref, tenantId: TA, classification: "synthetic" }],
    });
  });

  it("a fonte mais sensível prevalece", async () => {
    const outra = { kind: "asset", ref: "asset-sintetico-9" } as const;
    const classifier = new InMemoryDataClassifier().register(TA, FONTE_CTX, "synthetic").register(TA, outra, "tenant_confidential");
    const ctx = montar({ classifier });
    const r = await invokeModel(ctx.deps, pedido({ classification: { sources: [FONTE_CTX, outra], declared: null } }));
    expect(!r.ok && r.failure.kind).toBe("no_eligible_model");
  });

  it("fonte de outro tenant responde como inexistente: REFERENCE_NOT_FOUND", async () => {
    const classifier = new InMemoryDataClassifier().register(TB, FONTE_CTX, "synthetic");
    const ctx = montar({ classifier });
    const r = await invokeModel(ctx.deps, pedido());
    expect(!r.ok && r.failure.contract).toEqual({ registered: true, code: "REFERENCE_NOT_FOUND" });
    semProvider(ctx);
  });

  it("porta que devolve proveniência de outro tenant é recusada: TENANT_MISMATCH", async () => {
    const classifier: DataClassificationPort = {
      resolve: async () => ({ ok: true, classification: "synthetic", provenance: [{ ...FONTE_CTX, tenantId: TB, classification: "synthetic" }] }),
    };
    const ctx = montar({ classifier: classifier as InMemoryDataClassifier });
    const r = await invokeModel(ctx.deps, pedido());
    expect(!r.ok && r.failure.contract).toEqual({ registered: true, code: "TENANT_MISMATCH" });
    semProvider(ctx);
  });

  it("porta que não cobre todas as fontes não verifica a classificação", async () => {
    const classifier: DataClassificationPort = { resolve: async () => ({ ok: true, classification: "synthetic", provenance: [] }) };
    const ctx = montar({ classifier: classifier as InMemoryDataClassifier });
    const r = await invokeModel(ctx.deps, pedido());
    expect(!r.ok && r.failure.kind).toBe("classification_source_not_found");
    semProvider(ctx);
  });
});

describe("estimativa de tokens e reserva", () => {
  const grande = "x".repeat(6_000);

  it("mensagem grande com dica zero reserva pela cota conservadora, não pela dica", async () => {
    const ctx = montar();
    await invokeModel(ctx.deps, pedido({ messages: [{ role: "user", content: grande }], inputTokensHint: 0 }));
    // Cota: 6.000 bytes + 16 por mensagem + 32 por pedido = 6.048 tokens × 1 + 1.000 de saída × 2.
    expect(conservativeInputTokenBound([{ role: "user", content: grande }])).toBe(6_048);
    expect(ctx.budget.reservations(TA)[0]!.amount).toBe(8_048);
    expect(ctx.recorder.records[0]).toMatchObject({ inputTokensEstimate: 6_048, inputTokensEstimateMethod: "conservative_bound", estimatedCostMicroUsd: 8_048 });
  });

  it("dica subestimada não reduz a reserva: acima do teto, a chamada nem acontece", async () => {
    const ctx = montar();
    const r = await invokeModel(ctx.deps, pedido({ messages: [{ role: "user", content: "x".repeat(9_000) }], inputTokensHint: 1 }));
    expect(!r.ok && r.failure.kind).toBe("budget_exceeded");
    semProvider(ctx);
  });

  it("a cota conta bytes UTF-8, não caracteres", () => {
    expect(conservativeInputTokenBound([{ role: "user", content: "🚀".repeat(1_000) }])).toBe(4_000 + 16 + 32);
  });

  it("dica maior que a estimativa só aumenta a reserva", async () => {
    const ctx = montar();
    await invokeModel(ctx.deps, pedido({ inputTokensHint: 7_000 }));
    expect(ctx.recorder.records[0]).toMatchObject({ inputTokensEstimate: 7_000, inputTokensEstimateMethod: "caller_hint", estimatedCostMicroUsd: 9_000 });
  });

  it("contagem exata do estimador do modelo substitui a cota", async () => {
    const ctx = montar({ tokenEstimator: new FixedTokenEstimator({ "m-a": 100 }) });
    await invokeModel(ctx.deps, pedido({ messages: [{ role: "user", content: grande }], inputTokensHint: 0 }));
    expect(ctx.recorder.records[0]).toMatchObject({ inputTokensEstimate: 100, inputTokensEstimateMethod: "model_exact", estimatedCostMicroUsd: 2_100 });
  });

  it("estimador com valor inválido é ignorado: volta à cota conservadora", async () => {
    const quebrado: TokenEstimatorPort = { estimateInputTokens: () => ({ tokens: Number.NaN, method: "exact" }) };
    const ctx = montar({ tokenEstimator: quebrado });
    await invokeModel(ctx.deps, pedido({ messages: [{ role: "user", content: grande }], inputTokensHint: 0 }));
    expect(ctx.recorder.records[0]).toMatchObject({ inputTokensEstimateMethod: "conservative_bound", inputTokensEstimate: 6_048 });
  });

  it.each([
    ["mais de 64 mensagens", Array.from({ length: 65 }, () => ({ role: "user", content: "x" })), "messages: no máximo 64"],
    ["mensagem acima de 256 KiB", [{ role: "user", content: "x".repeat(256 * 1024 + 1) }], "messages[0].content: acima de 262144 bytes"],
    ["total acima de 1 MiB", Array.from({ length: 5 }, () => ({ role: "user", content: "é".repeat(110_000) })), "messages: total acima de 1048576 bytes"],
  ])("limite: %s", async (_n, messages, problema) => {
    const ctx = montar();
    const r = await invokeModel(ctx.deps, pedido({ messages: messages as never }));
    expect(!r.ok && r.failure.kind).toBe("invalid_request");
    expect(!r.ok && r.failure.issues).toContain(problema);
    semProvider(ctx);
  });
});

describe("saída visual por referência a asset", () => {
  const visual = (provider: ModelProviderPort, generatedAssets?: InMemoryGeneratedAssets) =>
    montar({ provider, profiles: [perfil(), perfilImagem], models: [modelo("m-a"), modelo("m-b", "lab-b"), imagemModelo], ...(generatedAssets ? { generatedAssets } : {}) });

  it("sem porta de assets a capability visual fica bloqueada", async () => {
    const ctx = visual(new ScriptedModelProvider("test"));
    const r = await invokeModel(ctx.deps, pedidoImagem({ requestedImages: 1 }));
    expect(!r.ok && r.failure).toMatchObject({ kind: "visual_capability_blocked", contract: { registered: true, code: "MODEL_CAPABILITY_BLOCKED" } });
    semProvider(ctx);
  });

  it("asset refs válidos: sucesso visual com referências do tenant, rastreáveis à tentativa", async () => {
    const assets = new InMemoryGeneratedAssets();
    const provider = new ScriptedModelProvider("test", { "lab-a/img": scripted.visual(assets, 2) });
    const ctx = visual(provider, assets);
    const r = await invokeModel(ctx.deps, pedidoImagem({ requestedImages: 2 }));
    // Saída pública: só referência e formato; tenant e proveniência ficam no descriptor interno.
    expect(r.ok && r.output).toEqual({
      modality: "visual",
      assets: [
        { assetId: `${IMG1}/img-1`, mediaType: "image/png" },
        { assetId: `${IMG1}/img-2`, mediaType: "image/png" },
      ],
    });
    expect(JSON.stringify(r)).not.toMatch(/tenantId|producedByCallId/);
    expect(await assets.describe(TA, [`${IMG1}/img-1`])).toEqual([
      { assetId: `${IMG1}/img-1`, tenantId: TA, mediaType: "image/png", producedByCallId: IMG1 },
    ]);
    // Reserva: 500 de entrada + 1.000 × 2 de saída + 2 × 40.000. Liquidação: 100 de entrada + 2 × 40.000.
    expect(ctx.recorder.records[0]).toMatchObject({ outputAssetIds: [`${IMG1}/img-1`, `${IMG1}/img-2`], estimatedCostMicroUsd: 82_500, costMicroUsd: 80_100 });
  });

  it("menos imagens que o pedido é aceito e liquidado pelo entregue", async () => {
    const assets = new InMemoryGeneratedAssets();
    const ctx = visual(new ScriptedModelProvider("test", { "lab-a/img": scripted.visual(assets, 1) }), assets);
    const r = await invokeModel(ctx.deps, pedidoImagem({ requestedImages: 2 }));
    expect(r.ok && r.output.modality === "visual" && r.output.assets).toHaveLength(1);
    expect(ctx.budget.reservations(TA)).toMatchObject([{ status: "settled", actual: 40_100 }]);
  });

  type Roteiro = (call: ProviderCall) => ProviderCallResult | Promise<ProviderCallResult>;
  const invalidos: [string, (assets: InMemoryGeneratedAssets) => Roteiro, string][] = [
    ["zero outputs", (a) => scripted.visual(a, 0), "output.assets: ao menos um asset visual"],
    ["quantidade acima do pedido", (a) => scripted.visual(a, 3), "output.assets: acima do pedido"],
    ["binário inline", () => (call) => ({ ...scripted.success()(call), output: { modality: "visual", assets: [{ assetId: "x", mediaType: "image/png", base64: "AAAA" }] }, usage: { inputTokens: 1, outputTokens: 0, images: 1 } }) as unknown as ProviderCallResult, "output.assets[0]: somente assetId e mediaType; binário inline proibido"],
    ["data URL como referência", () => (call) => ({ ...scripted.success()(call), output: { modality: "visual", assets: [{ assetId: "data:image/png;base64,AAAA", mediaType: "image/png" }] }, usage: { inputTokens: 1, outputTokens: 0, images: 1 } }) as unknown as ProviderCallResult, "output.assets[0].assetId: referência não vazia, sem data URL"],
    ["asset inexistente no tenant", () => (call) => ({ ...scripted.success()(call), output: { modality: "visual", assets: [{ assetId: "fantasma", mediaType: "image/png" }] }, usage: { inputTokens: 1, outputTokens: 0, images: 1 } }) as ProviderCallResult, "output.assets[0]: asset não encontrado no tenant"],
    ["asset de outra tentativa", (a) => (call) => { a.store(TA, "outra#1", "velho", "image/png"); return { ...scripted.success()(call), output: { modality: "visual", assets: [{ assetId: "velho", mediaType: "image/png" }] }, usage: { inputTokens: 1, outputTokens: 0, images: 1 } } as ProviderCallResult; }, "output.assets[0]: produzido por outra tentativa"],
    ["cobrança visual diferente do entregue", (a) => scripted.visual(a, 1, { usage: { inputTokens: 1, outputTokens: 0, images: 2 } }), "usage.images: diferente dos assets entregues"],
    ["saída textual em rota visual", () => (call) => scripted.success("texto")(call), "output.modality: rota visual exige visual"],
  ];
  it.each(invalidos)("%s: resposta inválida, nada liquidado", async (_n, roteiro, problema) => {
    const assets = new InMemoryGeneratedAssets();
    const ctx = visual(new ScriptedModelProvider("test", { "lab-a/img": roteiro(assets) }), assets);
    const r = await invokeModel(ctx.deps, pedidoImagem({ requestedImages: 2 }));
    expect(!r.ok && r.failure).toMatchObject({ kind: "provider_response_invalid", attempts: 1 });
    expect(!r.ok && r.failure.issues).toContain(problema);
    expect(ctx.budget.reservations(TA)).toMatchObject([{ status: "held", amount: 82_500 }]);
    expect(ctx.recorder.records[0]).toMatchObject({ costStatus: "pending_reconciliation", costMicroUsd: null, outcome: "failed", outputAssetIds: null });
  });

  it.each<[string, (a: InMemoryGeneratedAssets) => (call: ProviderCall) => ProviderCallResult, string]>([
    ["media type divergente", (a) => (call) => {
      a.store(TA, call.callId, "m1", "image/jpeg");
      return { ...scripted.success()(call), output: { modality: "visual", assets: [{ assetId: "m1", mediaType: "image/png" }] }, usage: { inputTokens: 1, outputTokens: 0, images: 1 } } as ProviderCallResult;
    }, "provider_response_invalid"],
    ["resolution mismatch com assets válidos", (a) => (call) => ({ ...scripted.visual(a, 1)(call) as Extract<ProviderCallResult, { ok: true }>, resolvedProviderModelId: "lab-z/outro", resolvedProvider: "lab-z" }), "resolution_mismatch"],
    ["parâmetro ignorado com assets válidos", (a) => (call) => ({ ...scripted.visual(a, 1)(call) as Extract<ProviderCallResult, { ok: true }>, ignoredParameters: ["seed"] }), "parameter_not_applied"],
  ])("%s: saída descartada registra outputAssetIds null", async (_n, roteiro, kind) => {
    const assets = new InMemoryGeneratedAssets();
    const ctx = visual(new ScriptedModelProvider("test", { "lab-a/img": roteiro(assets) }), assets);
    const r = await invokeModel(ctx.deps, pedidoImagem({ requestedImages: 1 }));
    expect(r.ok).toBe(false);
    expect(ctx.recorder.records[0]).toMatchObject({ failureKind: kind, outputAssetIds: null });
  });

  it("asset gravado em outro tenant: TENANT_MISMATCH, nada liquidado", async () => {
    const assets = new InMemoryGeneratedAssets();
    const roteiro = (call: ProviderCall) => {
      assets.store(TB, call.callId, "de-outro-tenant", "image/png");
      return { ...scripted.success()(call), output: { modality: "visual", assets: [{ assetId: "de-outro-tenant", mediaType: "image/png" }] }, usage: { inputTokens: 1, outputTokens: 0, images: 1 } } as ProviderCallResult;
    };
    const ctx = visual(new ScriptedModelProvider("test", { "lab-a/img": roteiro }), assets);
    const r = await invokeModel(ctx.deps, pedidoImagem({ requestedImages: 1 }));
    expect(!r.ok && r.failure.contract).toEqual({ registered: true, code: "TENANT_MISMATCH" });
    expect(ctx.budget.reservations(TA)).toMatchObject([{ status: "held" }]);
    // O id do outro tenant nunca entra no registro do tenant chamador.
    expect(ctx.recorder.ofTenant(TA)[0]).toMatchObject({ outputAssetIds: null, failureKind: "tenant_mismatch" });
    expect(JSON.stringify(ctx.recorder.records)).not.toContain("de-outro-tenant");
  });

  it("quantidade pedida acima do teto da rota é recusada pelo orçamento, não subestimada", async () => {
    const assets = new InMemoryGeneratedAssets();
    const ctx = visual(new ScriptedModelProvider("test"), assets);
    const r = await invokeModel(ctx.deps, pedidoImagem({ requestedImages: 20 }));
    expect(!r.ok && r.failure.kind).toBe("budget_exceeded");
    semProvider(ctx);
  });

  it("o adapter recebe o escopo de saída do tenant e da tentativa; rota de texto não recebe", async () => {
    const vistos: ProviderCall[] = [];
    const assets = new InMemoryGeneratedAssets();
    const espiao: ModelProviderPort = { adapterKey: "test", async invoke(call) { vistos.push(call); return call.visualOutputScope ? scripted.visual(assets, 1)(call) : scripted.success()(call); } };
    const ctx = visual(espiao, assets);
    await invokeModel(ctx.deps, pedidoImagem({ requestedImages: 1 }));
    await invokeModel(ctx.deps, pedido({ invocationId: "inv-texto" }));
    expect(vistos[0]!.visualOutputScope).toEqual({ tenantId: TA, callId: IMG1 });
    expect(vistos[1]!.visualOutputScope).toBeUndefined();
  });
});
