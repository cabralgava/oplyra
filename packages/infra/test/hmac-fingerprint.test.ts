// Fingerprint protegido com HMAC-SHA-256 da plataforma. Somente chaves
// sintéticas explícitas; nenhuma chave real ou variável de ambiente.
import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { attemptCallId } from "@oplyra/core";
import { EXTERNAL_IDEMPOTENCY_KEY_PATTERN, HmacExternalIdempotencyKeys, HmacRequestFingerprinter } from "../src/ai-model-harness/hmac-fingerprint.ts";
import { TestModelProviderAdapter } from "../src/ai-model-harness/test-model-provider.ts";

const bytes = (t: string) => new TextEncoder().encode(t);
const K1 = { keyId: "synthetic-test-v1", secret: bytes("oplyra-synthetic-fingerprint-key-v1-not-a-secret") };
const K1_OUTRO_SEGREDO = { keyId: "synthetic-test-v1", secret: bytes("oplyra-synthetic-fingerprint-key-v1-other-bytes!!") };
const K2 = { keyId: "synthetic-test-v2", secret: bytes("oplyra-synthetic-fingerprint-key-v2-not-a-secret") };
const MATERIAL = JSON.stringify(["oplyra.model-invocation.v1", "tenant-a", "prompt sintético sigiloso"]);

describe("HmacRequestFingerprinter", () => {
  it("determinístico com a mesma chave, inclusive entre instâncias", async () => {
    const a = await new HmacRequestFingerprinter({ active: K1 }).fingerprint(MATERIAL);
    const b = await new HmacRequestFingerprinter({ active: K1 }).fingerprint(MATERIAL);
    expect(a).toEqual(b);
    expect(a.primary).toMatch(/^hmac-sha256:v1:synthetic-test-v1:[0-9a-f]{64}$/);
    expect(a.accepted).toEqual([a.primary]);
  });

  it("é o HMAC-SHA-256 da plataforma sobre o material em UTF-8", async () => {
    const { primary } = await new HmacRequestFingerprinter({ active: K1 }).fingerprint(MATERIAL);
    expect(primary.split(":")[3]).toBe(createHmac("sha256", K1.secret).update(MATERIAL, "utf8").digest("hex"));
  });

  it("digest diferente com outro segredo, mesmo keyId", async () => {
    const a = await new HmacRequestFingerprinter({ active: K1 }).fingerprint(MATERIAL);
    const b = await new HmacRequestFingerprinter({ active: K1_OUTRO_SEGREDO }).fingerprint(MATERIAL);
    expect(a.primary).not.toBe(b.primary);
  });

  it("digest e identificador diferentes com outra chave/versão", async () => {
    const a = await new HmacRequestFingerprinter({ active: K1 }).fingerprint(MATERIAL);
    const b = await new HmacRequestFingerprinter({ active: K2 }).fingerprint(MATERIAL);
    expect(b.primary.startsWith("hmac-sha256:v1:synthetic-test-v2:")).toBe(true);
    expect(b.primary.split(":")[3]).not.toBe(a.primary.split(":")[3]);
  });

  it("rotação: primary na chave ativa, aceitos incluem as anteriores do keyring", async () => {
    const girado = await new HmacRequestFingerprinter({ active: K2, previous: [K1] }).fingerprint(MATERIAL);
    const antigo = await new HmacRequestFingerprinter({ active: K1 }).fingerprint(MATERIAL);
    const novo = await new HmacRequestFingerprinter({ active: K2 }).fingerprint(MATERIAL);
    expect(girado.primary).toBe(novo.primary);
    expect(girado.accepted).toEqual([novo.primary, antigo.primary]);
  });

  it("recusa chave curta, keyId inválido ou repetido", () => {
    expect(() => new HmacRequestFingerprinter({ active: { keyId: "curta", secret: bytes("16-bytes-apenas!") } })).toThrow("menos de 32 bytes");
    expect(() => new HmacRequestFingerprinter({ active: { ...K1, keyId: "Com:Separador" } })).toThrow("keyId");
    expect(() => new HmacRequestFingerprinter({ active: K1, previous: [K1_OUTRO_SEGREDO] })).toThrow("repetido");
  });

  it("alterar o buffer do chamador depois não muda a chave em uso", async () => {
    const segredo = bytes("oplyra-synthetic-fingerprint-key-mutable-buffer!!");
    const f = new HmacRequestFingerprinter({ active: { keyId: "synthetic-mut-v1", secret: segredo } });
    const antes = await f.fingerprint(MATERIAL);
    segredo.fill(0);
    expect(await f.fingerprint(MATERIAL)).toEqual(antes);
  });

  it("a saída não contém o material nem o segredo", async () => {
    const r = JSON.stringify(await new HmacRequestFingerprinter({ active: K1, previous: [K2] }).fingerprint(MATERIAL));
    expect(r).not.toContain("sigiloso");
    expect(r).not.toContain("not-a-secret");
  });
});

describe("chave de idempotência externa", () => {
  const callId = attemptCallId("tenant-alfa-sintetico", "create_ad_copy", "inv-externa-1", 1);

  it("é opaca: não contém callId, tenant, action nem invocationId", () => {
    const chave = new HmacExternalIdempotencyKeys(K1).forCall(callId);
    expect(chave).toMatch(EXTERNAL_IDEMPOTENCY_KEY_PATTERN);
    for (const cru of [callId, callId.slice(5), "tenant-alfa", "create_ad_copy", "inv-externa"]) expect(chave).not.toContain(cru);
  });

  it("determinística por tentativa e diferente entre tentativas, tenants e chaves", () => {
    const k = new HmacExternalIdempotencyKeys(K1);
    expect(k.forCall(callId)).toBe(new HmacExternalIdempotencyKeys(K1).forCall(callId));
    expect(k.forCall(attemptCallId("tenant-beta-sintetico", "create_ad_copy", "inv-externa-1", 1))).not.toBe(k.forCall(callId));
    expect(k.forCall(attemptCallId("tenant-alfa-sintetico", "create_ad_copy", "inv-externa-1", 2))).not.toBe(k.forCall(callId));
    expect(new HmacExternalIdempotencyKeys(K2).forCall(callId)).not.toBe(k.forCall(callId));
  });

  it("separação de domínio: nunca coincide com o fingerprint da mesma chave", async () => {
    const fp = await new HmacRequestFingerprinter({ active: K1 }).fingerprint(callId);
    expect(new HmacExternalIdempotencyKeys(K1).forCall(callId).slice(5)).not.toBe(fp.primary.split(":")[3]);
  });

  it("o Test Adapter não devolve identificador interno cru como id externo", async () => {
    const r = await new TestModelProviderAdapter().invoke({
      callId, providerModelId: "oplyra-test/text-economy", messages: [{ role: "user", content: "x" }], inputModalities: ["text"],
      parameters: { maxOutputTokens: 16 }, responseFormat: "text", requestedImages: 0, timeoutMs: 1_000, dataClassification: "synthetic",
    });
    const serializado = JSON.stringify(r);
    for (const cru of [callId, "tenant-alfa", "create_ad_copy", "inv-externa"]) expect(serializado).not.toContain(cru);
  });
});
