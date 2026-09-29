// Fingerprint protegido da requisição material: HMAC-SHA-256 com a primitiva
// da plataforma (`node:crypto`) e chave identificada, para rotação.
//
// Formato persistido: `hmac-sha256:v1:<keyId>:<64 hex>`. A chave ativa gera o
// fingerprint gravado; as anteriores ainda no keyring geram os aceitos na
// comparação, até saírem do keyring depois da janela de retenção das tentativas.
//
// Este slice não carrega segredo de nenhum cofre: o chamador fornece as
// chaves. Testes usam somente chave sintética explícita. O carregamento
// produtivo de segredo permanece bloqueado até o runtime.
import { createHmac } from "node:crypto";
import { REQUEST_FINGERPRINT_PATTERN } from "@oplyra/core";
import type { RequestFingerprint, RequestFingerprintPort } from "@oplyra/core";

export type FingerprintKey = { readonly keyId: string; readonly secret: Uint8Array };

const KEY_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
/** Chave HMAC-SHA-256 com ao menos o tamanho do bloco de saída. */
export const MIN_FINGERPRINT_KEY_BYTES = 32;

type Chave = { readonly keyId: string; readonly secret: Uint8Array };

/** Valida e copia o keyring: alterar o buffer do chamador depois não muda a chave em uso. */
function prepararChaves(todas: readonly FingerprintKey[]): readonly Chave[] {
  const ids = new Set<string>();
  for (const k of todas) {
    if (!KEY_ID.test(k.keyId)) throw new Error("keyId de fingerprint inválido");
    if (ids.has(k.keyId)) throw new Error("keyId de fingerprint repetido");
    if (k.secret.byteLength < MIN_FINGERPRINT_KEY_BYTES) throw new Error(`chave de fingerprint com menos de ${MIN_FINGERPRINT_KEY_BYTES} bytes`);
    ids.add(k.keyId);
  }
  return todas.map((k) => ({ keyId: k.keyId, secret: Uint8Array.from(k.secret) }));
}

export class HmacRequestFingerprinter implements RequestFingerprintPort {
  readonly #chaves: readonly Chave[];

  constructor(keyring: { readonly active: FingerprintKey; readonly previous?: readonly FingerprintKey[] }) {
    this.#chaves = prepararChaves([keyring.active, ...(keyring.previous ?? [])]);
  }

  async fingerprint(canonicalMaterial: string): Promise<RequestFingerprint> {
    const resumos = this.#chaves.map((k) =>
      `hmac-sha256:v1:${k.keyId}:${createHmac("sha256", k.secret).update(canonicalMaterial, "utf8").digest("hex")}`);
    if (!resumos.every((r) => REQUEST_FINGERPRINT_PATTERN.test(r))) throw new Error("fingerprint fora do formato");
    return { primary: resumos[0]!, accepted: resumos };
  }
}

/** Separação de domínio: a mesma chave nunca produz o mesmo MAC para fingerprint e chave externa. */
const DOMINIO_CHAVE_EXTERNA = "oplyra.external-idempotency-key.v1\u0000";
export const EXTERNAL_IDEMPOTENCY_KEY_PATTERN = /^oik1-[0-9a-f]{64}$/;

/**
 * Chave de idempotência para um fornecedor que a suporte, derivada do
 * `callId` interno por HMAC-SHA-256 com separação de domínio. Opaca: não
 * revela tenant, action, invocationId nem o `callId`. Ainda não usada por
 * nenhum adapter real; existe para que nenhum adapter futuro encaminhe o
 * identificador interno cru.
 */
export class HmacExternalIdempotencyKeys {
  readonly #chave: Chave;
  constructor(active: FingerprintKey) { this.#chave = prepararChaves([active])[0]!; }
  forCall(callId: string): string {
    return `oik1-${createHmac("sha256", this.#chave.secret).update(DOMINIO_CHAVE_EXTERNA + callId, "utf8").digest("hex")}`;
  }
}
