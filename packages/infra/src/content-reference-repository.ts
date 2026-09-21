import { comoCliente } from "./db.ts";
import type {
  ContentDraftSnapshot,
  ContentReferenceRepositoryPort,
  CopyVariantSnapshot,
  TenantId,
  Tx,
  UnitOfWork,
} from "@oplyra/core";

type ContentReferenceUnitOfWork = Pick<UnitOfWork, "withWorkerTransaction">;

type DraftRow = {
  tenantId: string;
  draftRef: string;
  version: number;
  sourceAction: "create_copy_variants";
};

type VariantRow = {
  id: string;
  headline: string;
  primaryText: string;
  cta: string;
  role: "reference" | "challenger" | null;
  angle: string | null;
  changedElements: string[] | null;
  constantElements: string[] | null;
  version: number | null;
  extensions: Record<string, unknown> | null;
};

function mapVariant(row: VariantRow): CopyVariantSnapshot {
  return {
    id: row.id,
    headline: row.headline,
    primaryText: row.primaryText,
    cta: row.cta,
    ...(row.role === null ? {} : { role: row.role }),
    ...(row.angle === null ? {} : { angle: row.angle }),
    ...(row.changedElements === null ? {} : { changedElements: row.changedElements }),
    ...(row.constantElements === null ? {} : { constantElements: row.constantElements }),
    ...(row.version === null ? {} : { version: row.version }),
    ...(row.extensions === null ? {} : { extensions: row.extensions }),
  };
}

async function lookupInTransaction(
  tx: Tx,
  tenantId: string,
  draftRef: string,
  variantRefs: readonly string[],
): Promise<ContentDraftSnapshot | null> {
  const client = comoCliente(tx);
  const draftResult = await client.query<DraftRow>(
    `select tenant_id::text as "tenantId", draft_ref as "draftRef", version,
            source_action as "sourceAction"
       from content.copy_drafts
      where tenant_id = $1::uuid and draft_ref = $2`,
    [tenantId, draftRef],
  );
  const draft = draftResult.rows[0];
  if (draft === undefined) return null;

  const variantResult = await client.query<VariantRow>(
    `select variant_ref as id, headline, primary_text as "primaryText", cta,
            role, angle, changed_elements as "changedElements",
            constant_elements as "constantElements", version, extensions
       from content.copy_variants
      where tenant_id = $1::uuid
        and draft_ref = $2
        and variant_ref = any($3::text[])
      order by position, variant_ref`,
    [tenantId, draftRef, [...variantRefs]],
  );

  return { ...draft, variants: variantResult.rows.map(mapVariant) };
}

/**
 * Adapter PostgreSQL do contentRepository. A consulta combina filtro explícito
 * por tenant com RLS forçada; referências de outro tenant são indistinguíveis
 * de referências inexistentes neste boundary.
 */
export function criarContentReferenceRepository(
  uow: ContentReferenceUnitOfWork,
): ContentReferenceRepositoryPort {
  return {
    async lookup(input) {
      const draft = await uow.withWorkerTransaction(
        input.tenantId as TenantId,
        `content-reference-resolver:${input.draftRef}`,
        (tx) => lookupInTransaction(tx, input.tenantId, input.draftRef, input.variantRefs),
      );
      return draft === null ? { status: "not_found" } : { status: "found", draft };
    },
  };
}

