// Brand OS (I-03) — verdade de produto, voz e afirmações da marca de uma empresa.
// Linguagem ubíqua: *versão da marca* (rascunho ou publicada), *produto*, *afirmação*
// (claim) e *evidência*. Domínio puro: sem SDK, banco ou framework.
//
// Invariantes protegidas aqui (e repetidas no banco como defesa em profundidade):
//  - versão publicada é imutável; a vigente é a publicada de maior número;
//  - publicar exige posicionamento, tom e ao menos um produto (D-2);
//  - afirmação permitida exige evidência e regra de uso; proibida exige regra de uso;
//  - afirmação de disponibilidade PERMITIDA nunca recai sobre produto `future`;
//  - toda afirmação referencia um produto da mesma versão.
import type { BrandVersionId, ClaimId, ProductKey, TenantId, UserId } from "./ids.ts";
import {
  BrandContentInvalid, BrandNotPublishable, BrandVersionImmutable, type BrandIssue,
} from "./brand-errors.ts";

export const DISPONIBILIDADES = ["available", "future"] as const;
export type ProductAvailability = (typeof DISPONIBILIDADES)[number];

export const TIPOS_DE_AFIRMACAO = ["availability", "benefit", "proof", "differentiator"] as const;
export type ClaimKind = (typeof TIPOS_DE_AFIRMACAO)[number];

export const POLARIDADES = ["allowed", "forbidden"] as const;
export type ClaimPolarity = (typeof POLARIDADES)[number];

export type Evidence = { readonly kind: "text" | "url"; readonly value: string };

export type BrandProduct = {
  readonly productKey: ProductKey;
  readonly name: string;
  readonly description: string;
  readonly availability: ProductAvailability;
};

export type BrandClaim = {
  readonly id: ClaimId;
  /** Produto da MESMA versão a que a afirmação se refere; nulo para afirmações gerais da marca. */
  readonly productKey: ProductKey | null;
  readonly kind: ClaimKind;
  readonly polarity: ClaimPolarity;
  readonly text: string;
  readonly usageRule: string;
  readonly evidence: readonly Evidence[];
};

/** O que o usuário edita: tudo menos identidade, número e estado. */
export type BrandContent = {
  readonly positioning: string;
  readonly tone: string;
  readonly products: readonly BrandProduct[];
  readonly claims: readonly BrandClaim[];
};

export type BrandVersionStatus = "draft" | "published";

export type BrandVersion = BrandContent & {
  readonly id: BrandVersionId;
  readonly tenantId: TenantId;
  /** Sequencial por empresa, a partir de 1. */
  readonly number: number;
  readonly status: BrandVersionStatus;
  /** Contador de gravações do rascunho; controle de concorrência otimista. */
  readonly revision: number;
  readonly derivedFromId: BrandVersionId | null;
  readonly createdBy: UserId;
  readonly createdAt: Date;
  readonly publishedBy: UserId | null;
  readonly publishedAt: Date | null;
};

export type BrandVersionSummary = Pick<BrandVersion, "id" | "number" | "status" | "publishedAt" | "createdAt">;

export const LIMITES = Object.freeze({
  positioning: 2000, tone: 1000, productName: 120, productDescription: 1000,
  claimText: 500, usageRule: 500, evidenceValue: 1000,
  products: 50, claims: 200, evidencePerClaim: 10,
});

const issue = (code: string, path: string, message: string): BrandIssue => ({ code, path, message });
const vazio = (s: string): boolean => s.trim().length === 0;

// Mesma forma que o banco aceita (brand.evidence_valid): http(s) e nenhum espaço.
const URL_HTTP = /^https?:\/\/[^\s]+$/i;
const urlHttp = (valor: string): boolean => URL_HTTP.test(valor);

/**
 * Regras estruturais, válidas para qualquer gravação de rascunho (mesmo incompleto).
 * Devolve todas as violações, não só a primeira.
 */
export function problemasEstruturais(c: BrandContent): BrandIssue[] {
  const out: BrandIssue[] = [];
  if (c.positioning.length > LIMITES.positioning) out.push(issue("TEXT_TOO_LONG", "positioning", `máximo de ${LIMITES.positioning} caracteres`));
  if (c.tone.length > LIMITES.tone) out.push(issue("TEXT_TOO_LONG", "tone", `máximo de ${LIMITES.tone} caracteres`));
  if (c.products.length > LIMITES.products) out.push(issue("LIMIT_EXCEEDED", "products", `máximo de ${LIMITES.products} produtos`));
  if (c.claims.length > LIMITES.claims) out.push(issue("LIMIT_EXCEEDED", "claims", `máximo de ${LIMITES.claims} afirmações`));

  const porChave = new Map<string, BrandProduct>();
  c.products.forEach((p, i) => {
    const base = `products[${i}]`;
    if (porChave.has(p.productKey)) out.push(issue("PRODUCT_DUPLICATE_KEY", base, "produto repetido"));
    porChave.set(p.productKey, p);
    if (p.name.length > LIMITES.productName) out.push(issue("TEXT_TOO_LONG", `${base}.name`, `máximo de ${LIMITES.productName} caracteres`));
    if (p.description.length > LIMITES.productDescription) out.push(issue("TEXT_TOO_LONG", `${base}.description`, `máximo de ${LIMITES.productDescription} caracteres`));
    if (!(DISPONIBILIDADES as readonly string[]).includes(p.availability)) out.push(issue("PRODUCT_AVAILABILITY_INVALID", `${base}.availability`, "disponibilidade desconhecida"));
  });

  const ids = new Set<string>();
  c.claims.forEach((a, i) => {
    const base = `claims[${i}]`;
    if (ids.has(a.id)) out.push(issue("CLAIM_DUPLICATE_ID", base, "afirmação repetida"));
    ids.add(a.id);
    if (!(TIPOS_DE_AFIRMACAO as readonly string[]).includes(a.kind)) out.push(issue("CLAIM_KIND_INVALID", `${base}.kind`, "tipo de afirmação desconhecido"));
    if (!(POLARIDADES as readonly string[]).includes(a.polarity)) out.push(issue("CLAIM_POLARITY_INVALID", `${base}.polarity`, "polaridade desconhecida"));
    if (a.text.length > LIMITES.claimText) out.push(issue("TEXT_TOO_LONG", `${base}.text`, `máximo de ${LIMITES.claimText} caracteres`));
    if (a.usageRule.length > LIMITES.usageRule) out.push(issue("TEXT_TOO_LONG", `${base}.usageRule`, `máximo de ${LIMITES.usageRule} caracteres`));
    if (a.evidence.length > LIMITES.evidencePerClaim) out.push(issue("LIMIT_EXCEEDED", `${base}.evidence`, `máximo de ${LIMITES.evidencePerClaim} evidências`));
    a.evidence.forEach((e, j) => {
      const ep = `${base}.evidence[${j}]`;
      if (e.kind !== "text" && e.kind !== "url") out.push(issue("CLAIM_EVIDENCE_INVALID", ep, "tipo de evidência desconhecido"));
      else if (vazio(e.value)) out.push(issue("CLAIM_EVIDENCE_INVALID", ep, "evidência vazia"));
      else if (e.value.length > LIMITES.evidenceValue) out.push(issue("TEXT_TOO_LONG", ep, `máximo de ${LIMITES.evidenceValue} caracteres`));
      else if (e.kind === "url" && !urlHttp(e.value)) out.push(issue("CLAIM_EVIDENCE_INVALID", ep, "a URL deve ser http ou https"));
    });

    const produto = a.productKey === null ? undefined : porChave.get(a.productKey);
    if (a.productKey !== null && !produto) out.push(issue("CLAIM_PRODUCT_UNKNOWN", `${base}.productKey`, "produto não pertence a esta versão"));
    if (a.kind === "availability") {
      if (a.productKey === null) out.push(issue("CLAIM_AVAILABILITY_PRODUCT_REQUIRED", `${base}.productKey`, "afirmação de disponibilidade exige um produto"));
      // Só a afirmação PERMITIDA é bloqueada: registrar como proibida a promessa de um produto futuro é o uso correto.
      else if (a.polarity === "allowed" && produto?.availability === "future") out.push(issue("CLAIM_AVAILABILITY_FUTURE_PRODUCT", `${base}.kind`, "produto futuro não pode ter afirmação de disponibilidade permitida"));
    }
  });
  return out;
}

/** Requisitos para PUBLICAR, além dos estruturais (D-2 e regras de afirmação). */
export function problemasDePublicacao(c: BrandContent): BrandIssue[] {
  const out = problemasEstruturais(c);
  if (vazio(c.positioning)) out.push(issue("POSITIONING_REQUIRED", "positioning", "informe o posicionamento"));
  if (vazio(c.tone)) out.push(issue("TONE_REQUIRED", "tone", "informe o tom de voz"));
  if (c.products.length === 0) out.push(issue("PRODUCT_REQUIRED", "products", "cadastre ao menos um produto"));
  c.products.forEach((p, i) => {
    if (vazio(p.name)) out.push(issue("PRODUCT_NAME_REQUIRED", `products[${i}].name`, "informe o nome do produto"));
  });
  c.claims.forEach((a, i) => {
    const base = `claims[${i}]`;
    if (vazio(a.text)) out.push(issue("CLAIM_TEXT_REQUIRED", `${base}.text`, "informe o texto da afirmação"));
    if (vazio(a.usageRule)) out.push(issue("CLAIM_USAGE_RULE_REQUIRED", `${base}.usageRule`, "informe a regra de uso"));
    if (a.polarity === "allowed" && a.evidence.length === 0) out.push(issue("CLAIM_EVIDENCE_REQUIRED", `${base}.evidence`, "afirmação permitida exige evidência"));
  });
  return out;
}

export function exigirConteudoValido(c: BrandContent): void {
  const problemas = problemasEstruturais(c);
  if (problemas.length) throw new BrandContentInvalid(problemas);
}

export function exigirPublicavel(c: BrandContent): void {
  const problemas = problemasDePublicacao(c);
  if (problemas.length) throw new BrandNotPublishable(problemas);
}

/** Publicada não muda: a alteração acontece num novo rascunho derivado dela. */
export function exigirRascunho(v: Pick<BrandVersion, "status">): void {
  if (v.status !== "draft") throw new BrandVersionImmutable();
}

/** A versão vigente é a publicada de maior número; não há ponteiro a manter. */
export function versaoVigente<T extends { status: BrandVersionStatus; number: number }>(versoes: readonly T[]): T | null {
  const publicadas = versoes.filter((v) => v.status === "published");
  if (!publicadas.length) return null;
  return publicadas.reduce((a, b) => (b.number > a.number ? b : a));
}

export const conteudoVazio = (): BrandContent => ({ positioning: "", tone: "", products: [], claims: [] });

export function conteudoDe(v: BrandContent): BrandContent {
  return { positioning: v.positioning, tone: v.tone, products: v.products, claims: v.claims };
}
