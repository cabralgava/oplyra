import { describe, expect, it } from "vitest";
import type { ProviderCall } from "@oplyra/core";
import { TestModelProviderAdapter } from "../src/ai-model-harness/test-model-provider.ts";

const chamada = (extra: Partial<ProviderCall> = {}): ProviderCall => ({
  callId: "inv-1#1", providerModelId: "oplyra-test/text-economy",
  messages: [{ role: "user", content: "briefing sintético" }], inputModalities: ["text"],
  parameters: { temperature: 0.7, maxOutputTokens: 256 }, responseFormat: "text",
  requestedImages: 0, timeoutMs: 1_000, dataClassification: "synthetic", ...extra,
});

describe("Test Adapter determinístico", () => {
  it("mesma chamada produz a mesma resposta, em instâncias diferentes", async () => {
    const a = await new TestModelProviderAdapter().invoke(chamada());
    const b = await new TestModelProviderAdapter().invoke(chamada());
    expect(a).toEqual(b);
    expect(a).toMatchObject({
      ok: true, resolvedProvider: "oplyra-test", resolvedProviderModelId: "oplyra-test/text-economy",
      ignoredParameters: [], billing: { kind: "charged", reportedCostMicroUsd: null },
      usage: { inputTokens: 5, outputTokens: 64, images: 0 },
    });
  });

  it("a saída depende só da própria chamada e não ecoa o conteúdo", async () => {
    const adapter = new TestModelProviderAdapter();
    const a = await adapter.invoke(chamada({ messages: [{ role: "user", content: "segredo do tenant A" }] }));
    const b = await adapter.invoke(chamada({ messages: [{ role: "user", content: "pedido do tenant B" }] }));
    const a2 = await adapter.invoke(chamada({ messages: [{ role: "user", content: "segredo do tenant A" }] }));
    expect(a.ok && b.ok && JSON.stringify(a.output) !== JSON.stringify(b.output)).toBe(true);
    expect(a).toEqual(a2);
    expect(JSON.stringify(b)).not.toContain("segredo");
    expect(JSON.stringify(adapter.calls)).not.toContain("segredo");
  });

  it("formato JSON devolve objeto válido", async () => {
    const r = await new TestModelProviderAdapter().invoke(chamada({ responseFormat: "json" }));
    expect(r.ok && r.output.modality === "text" && JSON.parse(r.output.text)).toMatchObject({ testOutput: true, providerModelId: "oplyra-test/text-economy" });
  });

  it("roteiro de falhas por modelo, consumido em ordem e repetindo o último", async () => {
    const adapter = new TestModelProviderAdapter({ behaviors: { "oplyra-test/text-economy": ["timeout", "rate_limited", "success"] } });
    const kinds = [];
    for (let i = 0; i < 4; i++) {
      const r = await adapter.invoke(chamada());
      kinds.push(r.ok ? "ok" : `${r.errorKind}/${r.billing.kind}`);
    }
    expect(kinds).toEqual(["timeout/unknown", "rate_limited/none", "ok", "ok"]);
    expect((await adapter.invoke(chamada({ providerModelId: "oplyra-test/outro" }))).ok).toBe(true);
  });

  it("simula parâmetro ignorado, JSON inválido, cobrança incerta e modelo trocado", async () => {
    const adapter = new TestModelProviderAdapter({
      behaviors: {
        "p/ignora": "ignore_parameters", "p/json": "invalid_json", "p/incerto": "billing_unknown", "p/troca": { resolveAs: "q/outro" },
      },
    });
    const ignora = await adapter.invoke(chamada({ providerModelId: "p/ignora" }));
    expect(ignora.ok && ignora.ignoredParameters).toEqual(["temperature"]);
    const json = await adapter.invoke(chamada({ providerModelId: "p/json", responseFormat: "json" }));
    expect(json.ok && json.output.modality === "text" && (() => { try { JSON.parse(json.output.text); return true; } catch { return false; } })()).toBe(false);
    expect((await adapter.invoke(chamada({ providerModelId: "p/incerto" }))).billing).toEqual({ kind: "unknown" });
    const troca = await adapter.invoke(chamada({ providerModelId: "p/troca" }));
    expect(troca.ok && [troca.resolvedProvider, troca.resolvedProviderModelId]).toEqual(["q", "q/outro"]);
  });
});
