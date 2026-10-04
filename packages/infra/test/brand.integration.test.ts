// Integração do Brand OS com o Supabase LOCAL e papéis reais (I-03). Exige `pnpm db:start`,
// migrations, `pnpm db:roles` e seeds. Cada execução cria empresas próprias e as remove no fim
// (o que também exercita a cascata da exclusão da empresa com versões publicadas).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { criarUnitOfWork } from "../src/db.ts";
import { auditLog, relogio } from "../src/repositories.ts";
import { brandRepository, geradorDeIds, activationFactsReader } from "../src/brand-repository.ts";
import { tenantRepository, membershipRepository, invitationRepository, geradorDeToken, criarEntitlements } from "../src/repositories.ts";
import { criarAccessContextResolver } from "../src/auth.ts";
import {
  startBrandDraft, saveBrandDraft, publishBrandVersion, getBrandOverview, listBrandVersions, getActivationChecklist,
} from "@oplyra/core/brand";
import type { BrandDeps, BrandContentInput } from "@oplyra/core/brand";
import { inviteMember } from "@oplyra/core";
import type { AccessContext, Deps, TenantId, UserId } from "@oplyra/core";

const WEB = "postgresql://oplyra_web_login:local-web-2026@127.0.0.1:54422/postgres";
const ADMIN = "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
// Identidades próprias da execução: os vínculos só existem em empresas criadas aqui, então este
// arquivo não interfere nos totais semeados que os outros testes de integração conferem em paralelo.
const OWNER = randomUUID() as UserId;
const GESTOR = randomUUID() as UserId;
const LEITOR = randomUUID() as UserId;
const OWNER_B = randomUUID() as UserId;

const uow = criarUnitOfWork({ connectionString: WEB });
const admin = criarUnitOfWork({ connectionString: ADMIN });
const resolver = criarAccessContextResolver(uow);
const deps: BrandDeps = { uow, brand: brandRepository, audit: auditLog, clock: relogio, ids: geradorDeIds };

const coreDeps: Deps = {
  uow, tenants: tenantRepository, memberships: membershipRepository, invitations: invitationRepository, audit: auditLog,
  clock: relogio, tokens: geradorDeToken, entitlements: criarEntitlements(uow),
};
const TX = randomUUID() as TenantId; // empresa com a marca
const TY = randomUUID() as TenantId; // outra empresa (isolamento)
const TZ = randomUUID() as TenantId; // empresa do checklist de ativação
const OWNER_Z = randomUUID() as UserId;
const LEITOR_Z = randomUUID() as UserId;
const ctx = (u: UserId, t: TenantId): Promise<AccessContext> => resolver.resolve({ userId: u, email: "" }, t);

const conteudo = (extra: Partial<BrandContentInput> = {}): BrandContentInput => ({
  positioning: "Operações de marketing para SaaS B2B.",
  tone: "Direto e técnico.",
  products: [{ name: "Performance", description: "Mídia e relatórios.", availability: "available" }],
  claims: [],
  ...extra,
});

beforeAll(async () => {
  for (const [id, slug] of [[TX, "brand-it-x"], [TY, "brand-it-y"], [TZ, "brand-it-z"]] as const) {
    await admin.pool.query(`insert into core.tenants (id, name, slug) values ($1, $2, $3)`, [id, `Marca IT ${slug}`, `${slug}-${id.slice(0, 8)}`]);
  }
  await admin.pool.query(
    `insert into core.memberships (tenant_id, user_id, role_key) values
       ($1,$2,'owner'), ($1,$3,'marketing_manager'), ($1,$4,'viewer'), ($5,$6,'owner'), ($7,$8,'owner')`,
    [TX, OWNER, GESTOR, LEITOR, TY, OWNER_B, TZ, OWNER_Z]);
});

afterAll(async () => {
  // Cascata real da exclusão da empresa, inclusive com versão publicada.
  await admin.pool.query(`delete from core.tenants where id = any($1::uuid[])`, [[TX, TY, TZ]]);
  await uow.encerrar();
  await admin.encerrar();
});

describe("Brand OS com sessões reais", () => {
  it("fluxo completo: rascunho, edição, publicação, nova versão derivada", async () => {
    const dono = await ctx(OWNER, TX);
    const gestor = await ctx(GESTOR, TX);

    const r1 = await startBrandDraft(deps, { ctx: gestor });
    expect(r1).toMatchObject({ number: 1, status: "draft", revision: 1 });

    const salvo = await saveBrandDraft(deps, {
      ctx: gestor, versionId: r1.id, expectedRevision: 1,
      content: conteudo({
        claims: [{ productKey: null, kind: "benefit", polarity: "allowed", text: "Menos tempo em relatórios.", usageRule: "Citar com o estudo de caso.", evidence: [{ kind: "url", value: "https://exemplo.test/estudo" }] }],
      }),
    });
    expect(salvo.revision).toBe(2);
    expect(salvo.products).toHaveLength(1);
    expect(salvo.claims[0]).toMatchObject({ polarity: "allowed", evidence: [{ kind: "url" }] });

    // Gestor edita, mas a política e o caso de uso negam a publicação.
    await expect(publishBrandVersion(deps, { ctx: gestor, versionId: r1.id, expectedRevision: 2 })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });

    const v1 = await publishBrandVersion(deps, { ctx: dono, versionId: r1.id, expectedRevision: 2 });
    expect(v1).toMatchObject({ status: "published", publishedBy: OWNER });

    // Publicada é imutável, inclusive por uma gravação que contorne o caso de uso.
    await expect(saveBrandDraft(deps, { ctx: dono, versionId: v1.id, expectedRevision: 2, content: conteudo() })).rejects.toMatchObject({ code: "BRAND_VERSION_IMMUTABLE" });
    await expect(uow.withUserTransaction(dono, (tx) => brandRepository.replaceDraftContent(tx, { tenantId: TX, id: v1.id, expectedRevision: 2, content: { ...v1 } })))
      .rejects.toMatchObject({ code: "BRAND_VERSION_IMMUTABLE" });

    // Nova versão: cópia da vigente; produto conserva a chave.
    const r2 = await startBrandDraft(deps, { ctx: dono });
    expect(r2).toMatchObject({ number: 2, derivedFromId: v1.id });
    expect(r2.products[0]!.productKey).toBe(v1.products[0]!.productKey);
    expect(r2.claims[0]!.id).not.toBe(v1.claims[0]!.id);

    const geral = await getBrandOverview(deps, await ctx(LEITOR, TX));
    expect(geral.current?.id).toBe(v1.id);
    expect(geral.draft?.id).toBe(r2.id);
    expect((await listBrandVersions(deps, await ctx(LEITOR, TX))).map((v) => v.number)).toEqual([2, 1]);

    const v2 = await publishBrandVersion(deps, { ctx: dono, versionId: r2.id, expectedRevision: 1 });
    expect((await getBrandOverview(deps, dono)).current?.id).toBe(v2.id);
    expect((await getBrandOverview(deps, dono)).draft).toBeNull();
  });

  it("auditoria é gravada na mesma transação, sem o conteúdo da marca", async () => {
    const { rows } = await admin.pool.query(
      `select action, after from core.audit_log where tenant_id = $1 and action like 'brand.%' order by created_at`, [TX]);
    expect(rows.map((r: { action: string }) => r.action)).toEqual(["brand.draft.create", "brand.draft.save", "brand.publish", "brand.draft.create", "brand.publish"]);
    expect(JSON.stringify(rows)).not.toContain("Operações de marketing");
  });

  it("concorrência: duas gravações da mesma revisão — uma vence, a outra recebe conflito", async () => {
    const dono = await ctx(OWNER, TX);
    const rascunho = await startBrandDraft(deps, { ctx: dono });
    const resultados = await Promise.allSettled([
      saveBrandDraft(deps, { ctx: dono, versionId: rascunho.id, expectedRevision: 1, content: conteudo({ tone: "A" }) }),
      saveBrandDraft(deps, { ctx: dono, versionId: rascunho.id, expectedRevision: 1, content: conteudo({ tone: "B" }) }),
    ]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const falha = resultados.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(falha.reason).toMatchObject({ code: "CONFLICT_VERSION" });
  });

  it("concorrência: dois rascunhos simultâneos — um só nasce", async () => {
    const dono = await ctx(OWNER, TX);
    // limpa o rascunho do teste anterior publicando-o, para que a corrida comece sem rascunho
    const aberto = (await getBrandOverview(deps, dono)).draft!;
    await saveBrandDraft(deps, { ctx: dono, versionId: aberto.id, expectedRevision: aberto.revision, content: conteudo() });
    await publishBrandVersion(deps, { ctx: dono, versionId: aberto.id, expectedRevision: aberto.revision + 1 });
    const resultados = await Promise.allSettled([startBrandDraft(deps, { ctx: dono }), startBrandDraft(deps, { ctx: dono })]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((resultados.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "BRAND_DRAFT_ALREADY_EXISTS" });
  });

  it("isolamento: a marca de uma empresa não aparece para outra, nem por id", async () => {
    const donoY = await ctx(OWNER_B, TY);
    expect(await getBrandOverview(deps, donoY)).toEqual({ current: null, draft: null });
    const daX = (await getBrandOverview(deps, await ctx(OWNER, TX))).current!;
    await expect(saveBrandDraft(deps, { ctx: donoY, versionId: daX.id, expectedRevision: 1, content: conteudo() })).rejects.toMatchObject({ code: "BRAND_VERSION_NOT_FOUND" });
    // Contexto forjado: o dono de X com a empresa Y ativa não tem vínculo e nem chega a ter contexto.
    await expect(ctx(OWNER, TY)).rejects.toMatchObject({ code: "MEMBERSHIP_NOT_FOUND" });
    // Mesmo com uma transação que force o tenant de Y, as linhas de X não aparecem.
    const visiveis = await uow.withUserTransaction(donoY, async (tx) =>
      (tx as unknown as { query: (q: string, p: unknown[]) => Promise<{ rows: unknown[] }> })
        .query(`select id from brand.versions where tenant_id = $1`, [TX]));
    expect(visiveis.rows).toEqual([]);
  });

  it("leitor lê e não escreve; vínculo revogado deixa de ter acesso na requisição seguinte", async () => {
    const leitor = await ctx(LEITOR, TX);
    await expect(startBrandDraft(deps, { ctx: leitor })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    await admin.pool.query(`update core.memberships set status = 'revoked', revoked_at = now() where tenant_id = $1 and user_id = $2`, [TX, LEITOR]);
    await expect(ctx(LEITOR, TX)).rejects.toMatchObject({ code: "MEMBERSHIP_NOT_FOUND" });
  });

  it("regras do domínio e do banco coincidem: afirmação permitida sem evidência não publica", async () => {
    const dono = await ctx(OWNER, TX);
    const aberto = (await getBrandOverview(deps, dono)).draft!;
    const salvo = await saveBrandDraft(deps, {
      ctx: dono, versionId: aberto.id, expectedRevision: aberto.revision,
      content: conteudo({ claims: [{ productKey: null, kind: "benefit", polarity: "allowed", text: "Sem prova.", usageRule: "n/a", evidence: [] }] }),
    });
    await expect(publishBrandVersion(deps, { ctx: dono, versionId: salvo.id, expectedRevision: salvo.revision }))
      .rejects.toMatchObject({ code: "BRAND_NOT_PUBLISHABLE", issues: [{ code: "CLAIM_EVIDENCE_REQUIRED" }] });
  });
});

describe("checklist de ativação com eventos reais", () => {
  const checklist = async (u: UserId) => getActivationChecklist({ uow, facts: activationFactsReader }, await ctx(u, TZ));

  it("empresa nova: nada feito, próximo passo é publicar a marca", async () => {
    const c = await checklist(OWNER_Z);
    expect(c).toMatchObject({ done: 0, total: 4, complete: false, next: { key: "brand_published" } });
  });

  it("rascunho não conta: só a marca PUBLICADA conclui o passo", async () => {
    const dono = await ctx(OWNER_Z, TZ);
    const r = await startBrandDraft(deps, { ctx: dono });
    const salvo = await saveBrandDraft(deps, { ctx: dono, versionId: r.id, expectedRevision: 1, content: conteudo() });
    expect((await checklist(OWNER_Z)).steps.find((s) => s.key === "brand_published")!.state).toBe("pending");
    await publishBrandVersion(deps, { ctx: dono, versionId: salvo.id, expectedRevision: salvo.revision });
    const c = await checklist(OWNER_Z);
    expect(c.steps.find((s) => s.key === "brand_published")!.state).toBe("done");
    expect(c).toMatchObject({ done: 1, next: { key: "objective_defined" } });
  });

  it("o convite real conclui o passo da equipe e completa o checklist", async () => {
    const dono = await ctx(OWNER_Z, TZ);
    await inviteMember(coreDeps, { ctx: dono, email: `checklist-${Date.now()}@local.test`, roleKey: "viewer" });
    const c = await checklist(OWNER_Z);
    // Marca e equipe feitas; objetivo e campanha seguem pendentes (a estratégia tem seu próprio teste de integração).
    expect(c).toMatchObject({ done: 2, total: 4, complete: false, next: { key: "objective_defined" } });
  });

  it("mais de uma pessoa ativa também conta como equipe, e o leitor vê o checklist", async () => {
    // Empresa nova (TY, só o dono): entra a segunda pessoa, sem convite.
    await admin.pool.query(`insert into core.memberships (tenant_id, user_id, role_key) values ($1,$2,'viewer')`, [TY, LEITOR_Z]);
    expect((await getActivationChecklist({ uow, facts: activationFactsReader }, await ctx(LEITOR_Z, TY))).steps.find((s) => s.key === "team_invited")!.state).toBe("done");
    await admin.pool.query(`delete from core.memberships where tenant_id = $1 and user_id = $2`, [TY, LEITOR_Z]);
  });

  it("não vaza fatos de outra empresa: a empresa isolada continua em zero", async () => {
    const c = await getActivationChecklist({ uow, facts: activationFactsReader }, await ctx(OWNER_B, TY));
    expect(c).toMatchObject({ done: 0, complete: false });
  });
});
