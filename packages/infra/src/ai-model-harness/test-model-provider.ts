// Test Adapter determinístico: padrão de desenvolvimento local e de CI.
// Executa no próprio processo, sem rede, sem chave e sem custo. Mesma
// chamada, mesma resposta; comportamentos de falha são roteirizados por modelo.
import type { ModelMessage, ModelProviderPort, ProviderCall, ProviderCallResult, TokenEstimatorPort } from "@oplyra/core";

export const TEST_ADAPTER_KEY = "test";

export type TestBehavior =
  | "success"
  | "timeout"
  | "rate_limited"
  | "unavailable"
  | "rejected_request"
  | "invalid_json"
  | "ignore_parameters"
  | "billing_unknown"
  | { readonly resolveAs: string };

/** FNV-1a 32 bits: resumo estável e sem dependência de criptografia. */
function fnv1a(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Convenção do adapter: `fornecedor/modelo`. O fornecedor é o prefixo. */
export const testProviderOf = (providerModelId: string): string => providerModelId.split("/")[0] ?? providerModelId;

/** Contagem de entrada usada pelo Test Adapter: exata por construção. */
const tokensDeEntrada = (messages: readonly ModelMessage[]): number =>
  messages.reduce((t, m) => t + Math.ceil(m.content.length / 4), 0);

/** Estimador exato para os modelos do Test Adapter; para os demais, sem contagem exata. */
export const testModelTokenEstimator: TokenEstimatorPort = {
  estimateInputTokens: (model, messages) =>
    model.adapterKey === TEST_ADAPTER_KEY ? { tokens: tokensDeEntrada(messages), method: "exact" } : null,
};

/**
 * Rota visual: o Test Adapter não grava assets (não existe contrato canônico
 * de asset) e devolve saída visual vazia, que o harness recusa. A capability
 * visual permanece bloqueada na composição local.
 */
export class TestModelProviderAdapter implements ModelProviderPort {
  readonly adapterKey = TEST_ADAPTER_KEY;
  /** Metadados das chamadas, sem conteúdo de mensagens. */
  readonly calls: { readonly callId: string; readonly providerModelId: string }[] = [];
  readonly #roteiros: Map<string, readonly TestBehavior[]>;
  readonly #contagem = new Map<string, number>();
  readonly #outputTokens: number;

  constructor(opts: { behaviors?: Record<string, TestBehavior | readonly TestBehavior[]>; outputTokens?: number } = {}) {
    this.#roteiros = new Map(Object.entries(opts.behaviors ?? {}).map(([k, v]) => [k, typeof v === "string" || !Array.isArray(v) ? [v as TestBehavior] : v]));
    this.#outputTokens = opts.outputTokens ?? 64;
  }

  #proximo(providerModelId: string): TestBehavior {
    const lista = this.#roteiros.get(providerModelId);
    const n = this.#contagem.get(providerModelId) ?? 0;
    this.#contagem.set(providerModelId, n + 1);
    return lista?.[Math.min(n, lista.length - 1)] ?? "success";
  }

  async invoke(call: ProviderCall): Promise<ProviderCallResult> {
    this.calls.push({ callId: call.callId, providerModelId: call.providerModelId });
    const comportamento = this.#proximo(call.providerModelId);
    const externalRequestId = `test-${fnv1a(call.callId)}`;

    switch (comportamento) {
      case "timeout": return { ok: false, errorKind: "timeout", externalRequestId, billing: { kind: "unknown" } };
      case "rate_limited": return { ok: false, errorKind: "rate_limited", externalRequestId, billing: { kind: "none" } };
      case "unavailable": return { ok: false, errorKind: "unavailable", externalRequestId, billing: { kind: "none" } };
      case "rejected_request": return { ok: false, errorKind: "rejected_request", externalRequestId, billing: { kind: "none" } };
      default: break;
    }

    // O resumo depende somente desta chamada: nada de estado entre chamadas ou tenants.
    const digest = fnv1a(JSON.stringify({
      m: call.providerModelId, msgs: call.messages, p: call.parameters, f: call.responseFormat, i: call.requestedImages,
    }));
    const texto = comportamento === "invalid_json"
      ? `test-output ${digest}`
      : call.responseFormat === "json"
        ? JSON.stringify({ testOutput: true, providerModelId: call.providerModelId, digest })
        : `test-output ${call.providerModelId} ${digest}`;

    const pedidos = Object.keys(call.parameters).filter((k) => k !== "maxOutputTokens");
    const resolvedProviderModelId = typeof comportamento === "object" ? comportamento.resolveAs : call.providerModelId;
    return {
      ok: true,
      output: call.visualOutputScope ? { modality: "visual", assets: [] } : { modality: "text", text: texto },
      usage: {
        inputTokens: tokensDeEntrada(call.messages),
        outputTokens: Math.min(call.parameters.maxOutputTokens, this.#outputTokens),
        images: 0,
      },
      resolvedProvider: testProviderOf(resolvedProviderModelId),
      resolvedProviderModelId,
      ignoredParameters: comportamento === "ignore_parameters" ? (pedidos.length > 0 ? pedidos : ["maxOutputTokens"]) : [],
      externalRequestId,
      billing: comportamento === "billing_unknown" ? { kind: "unknown" } : { kind: "charged", reportedCostMicroUsd: null },
    };
  }
}
