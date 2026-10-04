// Casos de uso do Brand OS (I-03). Autorização no backend (permissão do AccessContext),
// transação do tenant ativo, auditoria na mesma transação. Regras de marca ficam no domínio.
import type { BrandDeps } from "../brand-ports.ts";
import type { AccessContext } from "../../domain/access-context.ts";
import { exigirPermissao } from "../../domain/access-context.ts";
import type { BrandVersionId, ClaimId, ProductKey } from "../../domain/ids.ts";
import {
  type BrandClaim, type BrandContent, type BrandProduct, type BrandVersion, type BrandVersionSummary,
  conteudoDe, conteudoVazio, exigirConteudoValido, exigirPublicavel, exigirRascunho,
} from "../../domain/brand.ts";
import { BrandVersionNotFound, BrandDraftAlreadyExists } from "../../domain/brand-errors.ts";

/** Entrada da fronteira: chaves de produto e de afirmação podem faltar e são geradas aqui. */
export type BrandContentInput = {
  readonly positioning: string;
  readonly tone: string;
  readonly products: readonly (Omit<BrandProduct, "productKey"> & { productKey?: ProductKey })[];
  readonly claims: readonly (Omit<BrandClaim, "id" | "productKey"> & { id?: ClaimId; productKey?: ProductKey | null })[];
};

function completarIds(deps: BrandDeps, c: BrandContentInput): BrandContent {
  return {
    positioning: c.positioning,
    tone: c.tone,
    products: c.products.map((p) => ({ ...p, productKey: p.productKey ?? (deps.ids.uuid() as ProductKey) })),
    claims: c.claims.map((a) => ({ ...a, id: a.id ?? (deps.ids.uuid() as ClaimId), productKey: a.productKey ?? null })),
  };
}

export type BrandOverview = { readonly current: BrandVersion | null; readonly draft: BrandVersion | null };

export async function getBrandOverview(deps: BrandDeps, ctx: AccessContext): Promise<BrandOverview> {
  exigirPermissao(ctx, "brand.read");
  return deps.uow.withUserTransaction(ctx, async (tx) => ({
    current: await deps.brand.findCurrent(tx, ctx.tenantId),
    draft: await deps.brand.findDraft(tx, ctx.tenantId),
  }));
}

export async function listBrandVersions(deps: BrandDeps, ctx: AccessContext): Promise<BrandVersionSummary[]> {
  exigirPermissao(ctx, "brand.read");
  return deps.uow.withUserTransaction(ctx, (tx) => deps.brand.listSummaries(tx, ctx.tenantId));
}

/**
 * Abre o rascunho. Com versão vigente, o rascunho nasce como cópia dela (a publicada nunca muda);
 * sem vigente, nasce vazio. No máximo um rascunho por empresa.
 */
export async function startBrandDraft(deps: BrandDeps, { ctx }: { ctx: AccessContext }): Promise<BrandVersion> {
  exigirPermissao(ctx, "brand.write");
  return deps.uow.withUserTransaction(ctx, async (tx) => {
    if (await deps.brand.findDraft(tx, ctx.tenantId)) throw new BrandDraftAlreadyExists();
    const vigente = await deps.brand.findCurrent(tx, ctx.tenantId);
    // Produtos mantêm a chave (identidade entre versões); afirmações ganham ids novos.
    const conteudo: BrandContent = vigente
      ? { ...conteudoDe(vigente), claims: vigente.claims.map((a) => ({ ...a, id: deps.ids.uuid() as ClaimId })) }
      : conteudoVazio();
    const criado = await deps.brand.createDraft(tx, {
      tenantId: ctx.tenantId, content: conteudo, derivedFromId: vigente?.id ?? null, createdBy: ctx.userId,
    });
    await deps.audit.record(tx, {
      tenantId: ctx.tenantId, actorType: "user", actorId: ctx.userId, action: "brand.draft.create",
      target: criado.id, after: { number: criado.number, derivedFromId: vigente?.id ?? null },
    });
    return criado;
  });
}

export async function saveBrandDraft(
  deps: BrandDeps,
  { ctx, versionId, expectedRevision, content }: {
    ctx: AccessContext; versionId: BrandVersionId; expectedRevision: number; content: BrandContentInput;
  },
): Promise<BrandVersion> {
  exigirPermissao(ctx, "brand.write");
  const completo = completarIds(deps, content);
  exigirConteudoValido(completo);
  return deps.uow.withUserTransaction(ctx, async (tx) => {
    const atual = await deps.brand.findById(tx, ctx.tenantId, versionId);
    if (!atual) throw new BrandVersionNotFound();
    exigirRascunho(atual);
    const salvo = await deps.brand.replaceDraftContent(tx, { tenantId: ctx.tenantId, id: versionId, expectedRevision, content: completo });
    await deps.audit.record(tx, {
      tenantId: ctx.tenantId, actorType: "user", actorId: ctx.userId, action: "brand.draft.save",
      target: versionId, after: { revision: salvo.revision, products: salvo.products.length, claims: salvo.claims.length },
    });
    return salvo;
  });
}

export async function publishBrandVersion(
  deps: BrandDeps,
  { ctx, versionId, expectedRevision }: { ctx: AccessContext; versionId: BrandVersionId; expectedRevision: number },
): Promise<BrandVersion> {
  exigirPermissao(ctx, "brand.publish");
  return deps.uow.withUserTransaction(ctx, async (tx) => {
    const atual = await deps.brand.findById(tx, ctx.tenantId, versionId);
    if (!atual) throw new BrandVersionNotFound();
    exigirRascunho(atual);
    exigirPublicavel(atual);
    const publicada = await deps.brand.publish(tx, {
      tenantId: ctx.tenantId, id: versionId, expectedRevision, publishedBy: ctx.userId, publishedAt: deps.clock.now(),
    });
    await deps.audit.record(tx, {
      tenantId: ctx.tenantId, actorType: "user", actorId: ctx.userId, action: "brand.publish",
      target: versionId, before: { status: "draft" }, after: { status: "published", number: publicada.number },
    });
    return publicada;
  });
}
