// Portas do contexto Brand (I-03). A infraestrutura as implementa; o domínio e os
// casos de uso nunca importam SDK, HTTP ou SQL.
import type { BrandVersionId, TenantId, UserId } from "../domain/ids.ts";
import type { BrandContent, BrandVersion, BrandVersionSummary } from "../domain/brand.ts";
import type { AuditLogPort, Clock, Tx, UnitOfWork } from "./ports.ts";

export interface BrandRepository {
  listSummaries(tx: Tx, tenantId: TenantId): Promise<BrandVersionSummary[]>;
  findById(tx: Tx, tenantId: TenantId, id: BrandVersionId): Promise<BrandVersion | null>;
  findDraft(tx: Tx, tenantId: TenantId): Promise<BrandVersion | null>;
  /** A vigente: a publicada de maior número. */
  findCurrent(tx: Tx, tenantId: TenantId): Promise<BrandVersion | null>;
  /**
   * Cria o rascunho com o próximo número da empresa, de forma atômica.
   * Lança BrandDraftAlreadyExists se já houver rascunho (no máximo um por empresa).
   */
  createDraft(tx: Tx, e: {
    tenantId: TenantId; content: BrandContent; derivedFromId: BrandVersionId | null; createdBy: UserId;
  }): Promise<BrandVersion>;
  /** Substitui o conteúdo do rascunho. ConflictVersion se a revisão esperada divergir; BrandVersionImmutable se não for rascunho. */
  replaceDraftContent(tx: Tx, e: {
    tenantId: TenantId; id: BrandVersionId; expectedRevision: number; content: BrandContent;
  }): Promise<BrandVersion>;
  /** Publica o rascunho. Mesmas recusas de replaceDraftContent; o banco revalida os requisitos mínimos. */
  publish(tx: Tx, e: {
    tenantId: TenantId; id: BrandVersionId; expectedRevision: number; publishedBy: UserId; publishedAt: Date;
  }): Promise<BrandVersion>;
}

export interface IdGenerator { uuid(): string }

export type BrandDeps = {
  uow: UnitOfWork; brand: BrandRepository; audit: AuditLogPort; clock: Clock; ids: IdGenerator;
};
