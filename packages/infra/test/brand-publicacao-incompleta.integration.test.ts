// Regressão (I-03): publicação incompleta pelo adaptador real devolve todos os pontos faltantes e preserva o que foi salvo.
// Nome herdado de uma reprodução de depuração; renomear para brand-publicacao-incompleta.integration.test.ts quando possível.
import { it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { criarUnitOfWork } from "../src/db.ts";
import { auditLog, relogio } from "../src/repositories.ts";
import { brandRepository, geradorDeIds } from "../src/brand-repository.ts";
import { criarAccessContextResolver } from "../src/auth.ts";
import { startBrandDraft, saveBrandDraft, publishBrandVersion, getBrandOverview } from "@oplyra/core/brand";
import type { TenantId, UserId } from "@oplyra/core";

const uow = criarUnitOfWork({ connectionString: "postgresql://oplyra_web_login:local-web-2026@127.0.0.1:54422/postgres" });
const admin = criarUnitOfWork({ connectionString: "postgresql://postgres:postgres@127.0.0.1:54422/postgres" });
const deps = { uow, brand: brandRepository, audit: auditLog, clock: relogio, ids: geradorDeIds };
const T = randomUUID() as TenantId;
const U = randomUUID() as UserId;

afterAll(async () => {
  await admin.pool.query("delete from core.tenants where id = $1", [T]);
  await uow.encerrar();
  await admin.encerrar();
});

it("publicação incompleta lista tom e produto faltantes e o posicionamento salvo permanece", async () => {
  await admin.pool.query("insert into core.tenants (id, name, slug) values ($1, 'Regressão marca', $2)", [T, `regressao-${T.slice(0, 8)}`]);
  await admin.pool.query("insert into core.memberships (tenant_id, user_id, role_key) values ($1, $2, 'owner')", [T, U]);
  const ctx = await criarAccessContextResolver(uow).resolve({ userId: U, email: "" }, T);

  const rascunho = await startBrandDraft(deps, { ctx });
  const salvo = await saveBrandDraft(deps, {
    ctx, versionId: rascunho.id, expectedRevision: 1, content: { positioning: "x", tone: "", products: [], claims: [] },
  });
  await expect(publishBrandVersion(deps, { ctx, versionId: salvo.id, expectedRevision: salvo.revision })).rejects.toMatchObject({
    code: "BRAND_NOT_PUBLISHABLE",
    issues: [{ code: "TONE_REQUIRED", path: "tone" }, { code: "PRODUCT_REQUIRED", path: "products" }],
  });
  expect((await getBrandOverview(deps, ctx)).draft).toMatchObject({ positioning: "x", status: "draft" });
});
