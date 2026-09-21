import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ConflictVersion,
  ReferenceNotFound,
  createContentReferenceResolver,
} from "@oplyra/core";
import type { TenantId } from "@oplyra/core";
import { criarUnitOfWork } from "../src/db.ts";
import { criarContentReferenceRepository } from "../src/content-reference-repository.ts";

const ADMIN = "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const WORKER = "postgresql://oplyra_worker_login:local-worker-2026@127.0.0.1:54422/postgres";
const TA = "11111111-1111-4111-8111-111111111111" as TenantId;
const TB = "22222222-2222-4222-8222-222222222222" as TenantId;
const DRAFT_A = "cr009-copy-draft-a";
const DRAFT_B = "cr009-copy-draft-b";

const admin = criarUnitOfWork({ connectionString: ADMIN });
const worker = criarUnitOfWork({ connectionString: WORKER });
const repository = criarContentReferenceRepository(worker);
const resolver = createContentReferenceResolver({
  repository,
  authorization: { canRead: async () => true },
  clock: { now: () => new Date("2026-09-21T15:00:00Z") },
});

function input(tenantId: TenantId, draftRef: string, variantRefs: string[], expectedVersion = 3) {
  return {
    tenantId,
    requesterAgent: "design-agent" as const,
    requiredPermission: "read" as const,
    repository: "contentRepository" as const,
    draftRef,
    expectedVersion,
    variantRefs,
  };
}

beforeAll(async () => {
  await admin.pool.query(
    `insert into content.copy_drafts (tenant_id, draft_ref, version, source_action)
     values ($1, $2, 3, 'create_copy_variants'), ($3, $4, 3, 'create_copy_variants')`,
    [TA, DRAFT_A, TB, DRAFT_B],
  );
  await admin.pool.query(
    `insert into content.copy_variants
       (tenant_id, draft_ref, variant_ref, position, headline, primary_text, cta, role, version)
     values
       ($1, $2, 'cr009-var-a', 0, 'Headline A', 'Primary A', 'request_demo', 'reference', 1),
       ($1, $2, 'cr009-var-b', 1, 'Headline B', 'Primary B', 'request_demo', 'challenger', 1),
       ($3, $4, 'cr009-var-foreign', 0, 'Headline B', 'Primary B', 'request_demo', 'reference', 1)`,
    [TA, DRAFT_A, TB, DRAFT_B],
  );
});

afterAll(async () => {
  await admin.pool.query(
    `delete from content.copy_drafts
      where (tenant_id = $1 and draft_ref = $2) or (tenant_id = $3 and draft_ref = $4)`,
    [TA, DRAFT_A, TB, DRAFT_B],
  );
  await Promise.all([admin.encerrar(), worker.encerrar()]);
});

describe("content reference repository PostgreSQL", () => {
  it("resolve somente a variante solicitada no tenant ativo", async () => {
    const output = await resolver.resolve(input(TA, DRAFT_A, ["cr009-var-b"]));
    expect(output.tenantId).toBe(TA);
    expect(output.content.variants.map((variant) => variant.id)).toEqual(["cr009-var-b"]);
  });

  it("preserva a ordem persistida ao resolver o conjunto completo", async () => {
    const output = await resolver.resolve(input(TA, DRAFT_A, ["cr009-var-b", "cr009-var-a"]));
    expect(output.content.variants.map((variant) => variant.id)).toEqual(["cr009-var-a", "cr009-var-b"]);
  });

  it("mapeia draft inexistente para REFERENCE_NOT_FOUND", async () => {
    await expect(resolver.resolve(input(TA, "cr009-missing", ["cr009-var-a"])))
      .rejects.toBeInstanceOf(ReferenceNotFound);
  });

  it("não revela draft de outro tenant", async () => {
    await expect(resolver.resolve(input(TA, DRAFT_B, ["cr009-var-foreign"])))
      .rejects.toBeInstanceOf(ReferenceNotFound);
  });

  it("mantém o controle otimista de versão no core", async () => {
    await expect(resolver.resolve(input(TA, DRAFT_A, ["cr009-var-a"], 2)))
      .rejects.toBeInstanceOf(ConflictVersion);
  });

  it("não produz sucesso parcial quando uma variante não existe", async () => {
    await expect(resolver.resolve(input(TA, DRAFT_A, ["cr009-var-a", "cr009-var-missing"])))
      .rejects.toBeInstanceOf(ReferenceNotFound);
  });
});

