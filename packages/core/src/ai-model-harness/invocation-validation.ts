// Validação em tempo de execução das fronteiras do harness: o pedido que
// chega do workflow e a resposta que volta do adapter. Tipos do TypeScript
// não protegem dados vindos de fora do processo nem adapters defeituosos.
// Mensagens de problema citam caminhos, nunca valores ou conteúdo.
import { DATA_CLASSIFICATIONS, INPUT_MODALITIES } from "./model-registry.ts";
import type { DataClassification } from "./model-registry.ts";
import { base64Url, isWellFormedUnicode, utf8Bytes, utf8Length } from "./utf8.ts";
import { CLASSIFICATION_SOURCE_KINDS, VISUAL_MEDIA_TYPES } from "./ports.ts";
import type { ClassificationSourceRef, ModelMessage } from "./ports.ts";

/** Quantidade ou valor monetário: inteiro seguro e não negativo. Recusa NaN, infinito e decimal. */
export const isQuantity = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

/** Comprimento em code points, como `maxLength` do JSON Schema (common-definitions identifierLimits). */
const codePoints = (v: string): number => [...v].length;

/** Texto não vazio e Unicode bem formado: surrogate isolado nunca chega a fingerprint, `callId` ou provider. */
const textoNaoVazio = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && isWellFormedUnicode(v);
const objeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Limites estruturais do pedido. Protegem memória, orçamento e a cota de
 * tokens; não substituem os limites por workflow de 13 §15.
 */
export const INVOCATION_LIMITS = {
  maxMessages: 64,
  maxMessageBytes: 256 * 1024,
  maxTotalMessageBytes: 1024 * 1024,
  maxClassificationSources: 32,
  maxRefLength: 256,
} as const;

/**
 * Identificadores que compõem o escopo da tentativa e o `callId`.
 * `invocationId` reutiliza o limite canônico de `idempotency.key` do envelope
 * de transação (1–255); `actionKey` e `agentKey` reutilizam os padrões de
 * `common-definitions`. Todos estão canônicos em
 * `common-definitions/1.1#/$defs/identifierLimits` (Release 2.16, CR-026) e são
 * contados em code points.
 */
export const IDENTIFIER_LIMITS = {
  tenantId: 128,
  workflowKey: 128,
  agentKey: 64,
  actionKey: 64,
  invocationId: 255,
  traceField: 255,
} as const;
const ACTION_KEY = /^[a-z][a-z0-9_]*$/;
const AGENT_KEY = /^[a-z][a-z0-9-]*-agent$/;

/**
 * Rastreamento propagado do envelope de transação (20 §6) e do Agent Run
 * (13 §12.1, §14). `correlationId` é obrigatório; os demais são `null`
 * quando não se aplicam, nunca string vazia.
 */
export type TraceContext = {
  readonly correlationId: string;
  readonly transactionId: string | null;
  readonly causationId: string | null;
  readonly parentTransactionId: string | null;
  readonly workflowId: string | null;
  readonly taskId: string | null;
  readonly runId: string | null;
};

export const TRACE_NULLABLE_FIELDS = ["transactionId", "causationId", "parentTransactionId", "workflowId", "taskId", "runId"] as const;

const ROLES = ["system", "user", "assistant"];

export function validateTraceContext(trace: unknown, path = "trace"): string[] {
  if (!objeto(trace)) return [`${path}: objeto obrigatório`];
  const issues: string[] = [];
  if (!textoNaoVazio(trace.correlationId)) issues.push(`${path}.correlationId: texto não vazio`);
  else if (codePoints(trace.correlationId) > IDENTIFIER_LIMITS.traceField) issues.push(`${path}.correlationId: até ${IDENTIFIER_LIMITS.traceField} caracteres`);
  for (const campo of TRACE_NULLABLE_FIELDS) {
    const v = trace[campo];
    if (v !== null && !textoNaoVazio(v)) issues.push(`${path}.${campo}: null ou texto não vazio`);
    else if (typeof v === "string" && codePoints(v) > IDENTIFIER_LIMITS.traceField) issues.push(`${path}.${campo}: até ${IDENTIFIER_LIMITS.traceField} caracteres`);
  }
  return issues;
}

/** Ordem de sensibilidade: índice maior é mais sensível. */
export const classificationRank = (c: DataClassification): number => DATA_CLASSIFICATIONS.indexOf(c);
export const moreSensitive = (a: DataClassification, b: DataClassification): DataClassification =>
  classificationRank(a) >= classificationRank(b) ? a : b;

function validarClassificacao(c: unknown, issues: string[]): void {
  if (!objeto(c)) { issues.push("classification: objeto obrigatório"); return; }
  if (c.declared !== null && !(DATA_CLASSIFICATIONS as readonly unknown[]).includes(c.declared)) {
    issues.push("classification.declared: null ou valor conhecido");
  }
  const fontes = c.sources;
  if (!Array.isArray(fontes)) { issues.push("classification.sources: lista"); return; }
  if (fontes.length > INVOCATION_LIMITS.maxClassificationSources) issues.push("classification.sources: acima do limite");
  const vistas = new Set<string>();
  fontes.forEach((f: unknown, i) => {
    if (!objeto(f)) { issues.push(`classification.sources[${i}]: objeto`); return; }
    if (!(CLASSIFICATION_SOURCE_KINDS as readonly unknown[]).includes(f.kind)) issues.push(`classification.sources[${i}].kind: valor desconhecido`);
    if (!textoNaoVazio(f.ref) || codePoints(f.ref) > INVOCATION_LIMITS.maxRefLength) issues.push(`classification.sources[${i}].ref: texto não vazio até ${INVOCATION_LIMITS.maxRefLength}`);
    const chave = `${String(f.kind)}:${String(f.ref)}`;
    if (vistas.has(chave)) issues.push(`classification.sources[${i}]: fonte repetida`);
    vistas.add(chave);
  });
}

/** Validação estrutural, antes de consultar catálogo, perfil ou orçamento. */
export function validateInvocationRequest(req: unknown): string[] {
  if (!objeto(req)) return ["pedido: objeto obrigatório"];
  const issues: string[] = [];
  for (const campo of ["invocationId", "tenantId", "workflowKey", "agentKey", "actionKey"] as const) {
    const v = req[campo];
    if (!textoNaoVazio(v)) issues.push(`${campo}: texto não vazio`);
    else if (codePoints(v) > IDENTIFIER_LIMITS[campo]) issues.push(`${campo}: até ${IDENTIFIER_LIMITS[campo]} caracteres`);
  }
  if (typeof req.actionKey === "string" && textoNaoVazio(req.actionKey) && !ACTION_KEY.test(req.actionKey)) issues.push("actionKey: padrão ^[a-z][a-z0-9_]*$");
  if (typeof req.agentKey === "string" && textoNaoVazio(req.agentKey) && !AGENT_KEY.test(req.agentKey)) issues.push("agentKey: padrão ^[a-z][a-z0-9-]*-agent$");
  issues.push(...validateTraceContext(req.trace));
  validarClassificacao(req.classification, issues);

  const msgs = req.messages;
  if (!Array.isArray(msgs) || msgs.length === 0) issues.push("messages: ao menos uma mensagem");
  else {
    if (msgs.length > INVOCATION_LIMITS.maxMessages) issues.push(`messages: no máximo ${INVOCATION_LIMITS.maxMessages}`);
    let total = 0;
    msgs.forEach((m: unknown, i) => {
      if (!objeto(m)) { issues.push(`messages[${i}]: objeto`); return; }
      if (!ROLES.includes(m.role as string)) issues.push(`messages[${i}].role: valor desconhecido`);
      if (!textoNaoVazio(m.content)) { issues.push(`messages[${i}].content: texto não vazio e Unicode bem formado`); return; }
      const bytes = utf8Length(m.content);
      total += bytes;
      if (bytes > INVOCATION_LIMITS.maxMessageBytes) issues.push(`messages[${i}].content: acima de ${INVOCATION_LIMITS.maxMessageBytes} bytes`);
    });
    if (total > INVOCATION_LIMITS.maxTotalMessageBytes) issues.push(`messages: total acima de ${INVOCATION_LIMITS.maxTotalMessageBytes} bytes`);
  }

  const mods = req.inputModalities;
  if (!Array.isArray(mods) || mods.length === 0) issues.push("inputModalities: ao menos uma modalidade");
  else {
    if (mods.some((m) => !(INPUT_MODALITIES as readonly unknown[]).includes(m))) issues.push("inputModalities: valor desconhecido");
    if (new Set(mods).size !== mods.length) issues.push("inputModalities: valor repetido");
    if (!mods.includes("text")) issues.push("inputModalities: mensagens exigem text");
  }

  if (req.inputTokensHint !== undefined && !isQuantity(req.inputTokensHint)) issues.push("inputTokensHint: inteiro seguro >= 0");
  if (req.requestedImages !== undefined && !isQuantity(req.requestedImages)) issues.push("requestedImages: inteiro seguro >= 0");
  return issues;
}

/**
 * Semântica de `requestedImages` por rota. Rota visual declara quantas
 * imagens pede (>= 1): o orçamento reserva por essa quantidade e a resposta
 * não pode trazer mais. Rota sem imagem não pede nem é cobrada por imagem.
 */
export function validateImageRequest(imageRoute: boolean, requestedImages: number | undefined): string[] {
  if (imageRoute) {
    return requestedImages !== undefined && requestedImages >= 1 ? [] : ["requestedImages: rota visual exige inteiro >= 1"];
  }
  return (requestedImages ?? 0) === 0 ? [] : ["requestedImages: rota sem imagem não aceita imagens"];
}

/**
 * Cota superior conservadora de tokens de entrada: bytes UTF-8 mais uma
 * margem por mensagem para tokens de controle. Vale para tokenizers de nível
 * de byte (cada token cobre ao menos um byte). Usada sempre que não há
 * contagem exata do modelo.
 */
export const TOKEN_BOUND_OVERHEAD = { perMessage: 16, perRequest: 32 } as const;
export function conservativeInputTokenBound(messages: readonly ModelMessage[]): number {
  return messages.reduce<number>((t, m) => t + utf8Length(m.content) + TOKEN_BOUND_OVERHEAD.perMessage, TOKEN_BOUND_OVERHEAD.perRequest);
}

/**
 * Material canônico da requisição, versão 1. Componentes, nesta ordem,
 * serializados como array JSON (sem ambiguidade de concatenação):
 *  0. marcador de versão "oplyra.model-invocation.v1";
 *  1. tenantId; 2. workflowKey; 3. agentKey; 4. actionKey;
 *  5. profileRef (`profileId@version` do perfil ativo resolvido);
 *  6. classificação efetiva; 7. classificação declarada ou null;
 *  8. fontes de classificação `kind:ref`, ordenadas;
 *  9. inputModalities ordenadas; 10. requestedImages normalizado (0 se ausente);
 *  11. mensagens em ordem, cada uma `[role, content]`.
 * Fora do material: invocationId e attempt (formam a chave), trace (muda
 * entre reentregas) e inputTokensHint (não é material; só aumenta a reserva).
 *
 * O núcleo só monta o material. O resumo protegido (HMAC com chave
 * identificada) é responsabilidade da `RequestFingerprintPort`; o material
 * contém o prompt e nunca é guardado, registrado nem devolvido.
 */
export type FingerprintMaterial = {
  readonly tenantId: string;
  readonly workflowKey: string;
  readonly agentKey: string;
  readonly actionKey: string;
  readonly profileRef: string;
  readonly effectiveClassification: DataClassification;
  readonly declaredClassification: DataClassification | null;
  readonly classificationSources: readonly ClassificationSourceRef[];
  readonly inputModalities: readonly string[];
  readonly requestedImages: number;
  readonly messages: readonly ModelMessage[];
};

export const FINGERPRINT_MATERIAL_VERSION = "oplyra.model-invocation.v1";

export function canonicalRequestMaterial(m: FingerprintMaterial): string {
  return JSON.stringify([
    FINGERPRINT_MATERIAL_VERSION,
    m.tenantId, m.workflowKey, m.agentKey, m.actionKey, m.profileRef,
    m.effectiveClassification, m.declaredClassification,
    m.classificationSources.map((f) => `${f.kind}:${f.ref}`).sort(),
    [...m.inputModalities].sort(),
    m.requestedImages,
    m.messages.map((x) => [x.role, x.content]),
  ]);
}

/**
 * Formato persistido: `hmac-sha256:v1:<keyId>:<64 hex>`. `v1` é a versão do
 * material; `keyId` identifica chave e versão, para rotação.
 */
export const REQUEST_FINGERPRINT_PATTERN = /^hmac-sha256:v1:[a-z0-9][a-z0-9._-]{0,63}:[0-9a-f]{64}$/;

/**
 * Identificador interno da tentativa, no escopo completo
 * `(tenantId, actionKey, invocationId, attempt)`: `att1.` seguido do base64url
 * (sem preenchimento) dos bytes UTF-8 de `JSON.stringify([tenantId,
 * actionKey, invocationId, attempt])`. O array JSON torna a codificação
 * inequívoca para qualquer conteúdo (inclusive `/`, `#`, `%` e Unicode), e os
 * limites de `IDENTIFIER_LIMITS` a mantêm limitada. É reversível, portanto
 * interno: o adapter não o encaminha ao fornecedor; chave de idempotência
 * externa, quando existir, é derivada de forma opaca na infraestrutura.
 * Exige identificadores já validados (Unicode bem formado).
 */
export function attemptCallId(tenantId: string, actionKey: string, invocationId: string, attempt: number): string {
  return `att1.${base64Url(utf8Bytes(JSON.stringify([tenantId, actionKey, invocationId, attempt])))}`;
}
export const ATTEMPT_CALL_ID_PATTERN = /^att1\.[A-Za-z0-9_-]+$/;

export type ProviderResultExpectation = {
  readonly maxOutputTokens: number;
  readonly requestedImages: number;
  readonly imageRoute: boolean;
};

const ERROR_KINDS = ["timeout", "rate_limited", "unavailable", "rejected_request"];
const CHAVES_ASSET = new Set(["assetId", "mediaType"]);

function validarCobranca(b: unknown, issues: string[]): void {
  if (!objeto(b)) { issues.push("billing: objeto obrigatório"); return; }
  if (b.kind === "charged") {
    if (b.reportedCostMicroUsd !== null && !isQuantity(b.reportedCostMicroUsd)) issues.push("billing.reportedCostMicroUsd: null ou inteiro seguro >= 0");
  } else if (b.kind !== "none" && b.kind !== "unknown") {
    issues.push("billing.kind: valor desconhecido");
  }
}

function validarSaida(o: unknown, esperado: ProviderResultExpectation, issues: string[]): number | null {
  if (!objeto(o)) { issues.push("output: objeto obrigatório"); return null; }
  if (!esperado.imageRoute) {
    if (o.modality !== "text") issues.push("output.modality: rota textual exige text");
    else if (typeof o.text !== "string") issues.push("output.text: texto");
    return 0;
  }
  if (o.modality !== "visual") { issues.push("output.modality: rota visual exige visual"); return null; }
  const assets = o.assets;
  if (!Array.isArray(assets)) { issues.push("output.assets: lista"); return null; }
  if (assets.length === 0) issues.push("output.assets: ao menos um asset visual");
  if (assets.length > esperado.requestedImages) issues.push("output.assets: acima do pedido");
  const ids = new Set<string>();
  assets.forEach((a: unknown, i) => {
    if (!objeto(a)) { issues.push(`output.assets[${i}]: objeto`); return; }
    // Somente referência tipada: qualquer outro campo (data, base64, bytes, url) é recusado.
    if (Object.keys(a).some((k) => !CHAVES_ASSET.has(k))) issues.push(`output.assets[${i}]: somente assetId e mediaType; binário inline proibido`);
    if (!textoNaoVazio(a.assetId) || a.assetId.length > INVOCATION_LIMITS.maxRefLength || /^data:/i.test(a.assetId)) {
      issues.push(`output.assets[${i}].assetId: referência não vazia, sem data URL`);
    } else if (ids.has(a.assetId)) issues.push(`output.assets[${i}].assetId: repetido`);
    else ids.add(a.assetId);
    if (!(VISUAL_MEDIA_TYPES as readonly unknown[]).includes(a.mediaType)) issues.push(`output.assets[${i}].mediaType: formato não aceito`);
  });
  return assets.length;
}

/**
 * Resposta do adapter antes de qualquer liquidação. Resposta inválida não é
 * liquidada: o custo fica pendente de conciliação e a saída é descartada.
 */
export function validateProviderResult(r: unknown, esperado: ProviderResultExpectation): string[] {
  if (!objeto(r) || typeof r.ok !== "boolean") return ["resultado: objeto com ok booleano"];
  const issues: string[] = [];
  if (r.externalRequestId !== null && !textoNaoVazio(r.externalRequestId)) issues.push("externalRequestId: null ou texto não vazio");
  validarCobranca(r.billing, issues);

  if (!r.ok) {
    if (!ERROR_KINDS.includes(r.errorKind as string)) issues.push("errorKind: valor desconhecido");
    return issues;
  }

  const entregues = validarSaida(r.output, esperado, issues);
  if (!textoNaoVazio(r.resolvedProvider)) issues.push("resolvedProvider: texto não vazio");
  if (!textoNaoVazio(r.resolvedProviderModelId)) issues.push("resolvedProviderModelId: texto não vazio");
  if (!Array.isArray(r.ignoredParameters) || r.ignoredParameters.some((p) => !textoNaoVazio(p))) {
    issues.push("ignoredParameters: lista de textos");
  }

  const u = r.usage;
  if (!objeto(u)) issues.push("usage: objeto obrigatório");
  else {
    for (const campo of ["inputTokens", "outputTokens", "images"]) {
      if (!isQuantity(u[campo])) issues.push(`usage.${campo}: inteiro seguro >= 0`);
    }
    if (isQuantity(u.outputTokens) && u.outputTokens > esperado.maxOutputTokens) issues.push("usage.outputTokens: acima do limite pedido");
    if (isQuantity(u.images)) {
      if (!esperado.imageRoute && u.images > 0) issues.push("usage.images: rota sem imagem");
      if (esperado.imageRoute && u.images > esperado.requestedImages) issues.push("usage.images: acima do pedido");
      // Cobrança visual coerente com os assets efetivamente entregues.
      if (esperado.imageRoute && entregues !== null && u.images !== entregues) issues.push("usage.images: diferente dos assets entregues");
    }
  }
  return issues;
}
