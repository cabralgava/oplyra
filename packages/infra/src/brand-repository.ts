// Adapter Supabase/Postgres do contexto Brand (I-03). Toda leitura e escrita passa pela
// transação do tenant ativo, portanto pela RLS; os triggers do banco repetem as regras do domínio.
import { comoCliente } from "./db.ts";
import type { Tx, BrandVersionId, ClaimId, ProductKey, TenantId, UserId } from "@oplyra/core";
import type {
  BrandRepository, BrandVersion, BrandVersionSummary, BrandContent, BrandProduct, BrandClaim, Evidence, IdGenerator,
  ActivationFactsReader,
} from "@oplyra/core/brand";
import {
  BrandDraftAlreadyExists, BrandNotPublishable, BrandVersionImmutable, BrandVersionNotFound, ConflictVersion,
} from "@oplyra/core/brand";
import { randomUUID } from "node:crypto";

type LinhaVersao = {
  id: string; tenantId: string; number: number; status: "draft" | "published"; revision: number;
  positioning: string; tone: string; derivedFromId: string | null; createdBy: string; createdAt: Date;
  publishedBy: string | null; publishedAt: Date | null;
};

const COLUNAS_VERSAO = `id, tenant_id as "tenantId", number, status, revision, positioning, tone,
  derived_from_id as "derivedFromId", created_by as "createdBy", created_at as "createdAt",
  published_by as "publishedBy", published_at as "publishedAt"`;

async function carregar(tx: Tx, linha: LinhaVersao): Promise<BrandVersion> {
  const db = comoCliente(tx);
  const produtos = await db.query(
    `select product_key as "productKey", name, description, availability
       from brand.products where tenant_id = $1 and version_id = $2 order by position, name`, [linha.tenantId, linha.id]);
  const afirmacoes = await db.query(
    `select id, product_key as "productKey", kind, polarity, text, usage_rule as "usageRule", evidence
       from brand.claims where tenant_id = $1 and version_id = $2 order by position, id`, [linha.tenantId, linha.id]);
  return {
    id: linha.id as BrandVersionId, tenantId: linha.tenantId as TenantId, number: linha.number, status: linha.status,
    revision: linha.revision, positioning: linha.positioning, tone: linha.tone,
    derivedFromId: linha.derivedFromId as BrandVersionId | null, createdBy: linha.createdBy as UserId, createdAt: linha.createdAt,
    publishedBy: linha.publishedBy as UserId | null, publishedAt: linha.publishedAt,
    products: produtos.rows as BrandProduct[],
    claims: (afirmacoes.rows as (Omit<BrandClaim, "evidence"> & { evidence: Evidence[] })[]).map((a) => ({
      ...a, id: a.id as ClaimId, productKey: a.productKey as ProductKey | null,
    })),
  };
}

async function gravarConteudo(tx: Tx, tenantId: TenantId, versionId: string, c: BrandContent): Promise<void> {
  const db = comoCliente(tx);
  for (const [i, p] of c.products.entries()) {
    await db.query(
      `insert into brand.products (tenant_id, version_id, product_key, position, name, description, availability)
       values ($1,$2,$3,$4,$5,$6,$7)`, [tenantId, versionId, p.productKey, i, p.name, p.description, p.availability]);
  }
  for (const [i, a] of c.claims.entries()) {
    await db.query(
      `insert into brand.claims (tenant_id, id, version_id, product_key, position, kind, polarity, text, usage_rule, evidence)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
      [tenantId, a.id, versionId, a.productKey, i, a.kind, a.polarity, a.text, a.usageRule, JSON.stringify(a.evidence)]);
  }
}

const codigoPg = (e: unknown): string | undefined => (e as { code?: string } | null)?.code;
const restricao = (e: unknown): string | undefined => (e as { constraint?: string } | null)?.constraint;

/** Explica por que um update condicional não afetou linha: inexistente, publicada ou revisão desatualizada. */
async function explicarFalha(tx: Tx, tenantId: TenantId, id: BrandVersionId): Promise<never> {
  const { rows } = await comoCliente(tx).query(
    `select status from brand.versions where tenant_id = $1 and id = $2`, [tenantId, id]);
  const atual = rows[0] as { status: string } | undefined;
  if (!atual) throw new BrandVersionNotFound();
  if (atual.status !== "draft") throw new BrandVersionImmutable();
  throw new ConflictVersion();
}

export const brandRepository: BrandRepository = {
  async listSummaries(tx, tenantId) {
    const { rows } = await comoCliente(tx).query(
      `select id, number, status, published_at as "publishedAt", created_at as "createdAt"
         from brand.versions where tenant_id = $1 order by number desc`, [tenantId]);
    return rows as BrandVersionSummary[];
  },

  async findById(tx, tenantId, id) {
    const { rows } = await comoCliente(tx).query(
      `select ${COLUNAS_VERSAO} from brand.versions where tenant_id = $1 and id = $2`, [tenantId, id]);
    return rows[0] ? carregar(tx, rows[0] as LinhaVersao) : null;
  },

  async findDraft(tx, tenantId) {
    const { rows } = await comoCliente(tx).query(
      `select ${COLUNAS_VERSAO} from brand.versions where tenant_id = $1 and status = 'draft'`, [tenantId]);
    return rows[0] ? carregar(tx, rows[0] as LinhaVersao) : null;
  },

  async findCurrent(tx, tenantId) {
    const { rows } = await comoCliente(tx).query(
      `select ${COLUNAS_VERSAO} from brand.versions where tenant_id = $1 and status = 'published'
        order by number desc limit 1`, [tenantId]);
    return rows[0] ? carregar(tx, rows[0] as LinhaVersao) : null;
  },

  async createDraft(tx, e) {
    const db = comoCliente(tx);
    // Savepoint: um conflito de unicidade não pode abortar a transação inteira do chamador.
    await db.query("savepoint criar_rascunho");
    let id: string;
    try {
      const { rows } = await db.query(
        `insert into brand.versions (tenant_id, number, positioning, tone, derived_from_id, created_by)
         select $1, coalesce(max(number), 0) + 1, $2, $3, $4, $5 from brand.versions where tenant_id = $1
         returning id`, [e.tenantId, e.content.positioning, e.content.tone, e.derivedFromId, e.createdBy]);
      id = (rows[0] as { id: string }).id;
    } catch (erro) {
      await db.query("rollback to savepoint criar_rascunho");
      // Rascunho concorrente: o índice parcial (ou o número) acusa a corrida.
      if (codigoPg(erro) === "23505" && /versions_um_rascunho|versions_tenant_id_number_key/.test(restricao(erro) ?? "")) {
        throw new BrandDraftAlreadyExists();
      }
      throw erro;
    }
    await gravarConteudo(tx, e.tenantId, id, e.content);
    const criado = await brandRepository.findById(tx, e.tenantId, id as BrandVersionId);
    return criado!;
  },

  async replaceDraftContent(tx, e) {
    const db = comoCliente(tx);
    const { rowCount } = await db.query(
      `update brand.versions set positioning = $3, tone = $4, revision = revision + 1
        where tenant_id = $1 and id = $2 and status = 'draft' and revision = $5`,
      [e.tenantId, e.id, e.content.positioning, e.content.tone, e.expectedRevision]);
    if (!rowCount) await explicarFalha(tx, e.tenantId, e.id);
    // Afirmações antes dos produtos: a FK composta aponta de afirmação para produto.
    await db.query(`delete from brand.claims where tenant_id = $1 and version_id = $2`, [e.tenantId, e.id]);
    await db.query(`delete from brand.products where tenant_id = $1 and version_id = $2`, [e.tenantId, e.id]);
    await gravarConteudo(tx, e.tenantId, e.id, e.content);
    return (await brandRepository.findById(tx, e.tenantId, e.id))!;
  },

  async publish(tx, e) {
    const db = comoCliente(tx);
    await db.query("savepoint publicar");
    let afetadas: number | null;
    try {
      ({ rowCount: afetadas } = await db.query(
        `update brand.versions set status = 'published', published_by = $3, published_at = $4
          where tenant_id = $1 and id = $2 and status = 'draft' and revision = $5`,
        [e.tenantId, e.id, e.publishedBy, e.publishedAt, e.expectedRevision]));
    } catch (erro) {
      await db.query("rollback to savepoint publicar");
      // A regra de publicação do banco recusou: o domínio deveria ter barrado antes; o motivo vem do banco.
      if (codigoPg(erro) === "23514") {
        throw new BrandNotPublishable([{ code: "DB_PUBLISH_RULE", path: "", message: (erro as Error).message }]);
      }
      throw erro;
    }
    if (!afetadas) await explicarFalha(tx, e.tenantId, e.id);
    return (await brandRepository.findById(tx, e.tenantId, e.id))!;
  },
};

export const geradorDeIds: IdGenerator = { uuid: () => randomUUID() };

/** Fatos do checklist de ativação, lidos sob a RLS do tenant ativo (marca e equipe). */
export const activationFactsReader: ActivationFactsReader = {
  async read(tx, tenantId) {
    const { rows } = await comoCliente(tx).query(
      `select exists (select 1 from brand.versions where tenant_id = $1 and status = 'published') as "brandPublished",
              (exists (select 1 from core.invitations where tenant_id = $1)
               or (select count(*) from core.memberships where tenant_id = $1 and status = 'active') > 1) as "teamInvited",
              exists (select 1 from strategy.objectives where tenant_id = $1) as "objectiveDefined",
              exists (select 1 from strategy.campaigns where tenant_id = $1) as "campaignCreated"`,
      [tenantId]);
    return rows[0] as { brandPublished: boolean; teamInvited: boolean; objectiveDefined: boolean; campaignCreated: boolean };
  },
};
