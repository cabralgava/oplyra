import { describe, it, expect } from "vitest";
import { criarBrandDeps, contextoDeMarca as contexto } from "@oplyra/testing/brand";
import {
  getBrandOverview, listBrandVersions, startBrandDraft, saveBrandDraft, publishBrandVersion,
  problemasDePublicacao, problemasEstruturais, versaoVigente, conteudoVazio, exigirRascunho,
} from "@oplyra/core/brand";
import type { BrandContentInput, BrandContent, BrandVersion } from "@oplyra/core/brand";
import type { TenantId, ProductKey, ClaimId } from "@oplyra/core";

const TA = "11111111-1111-4111-8111-111111111111" as TenantId;
const TB = "22222222-2222-4222-8222-222222222222" as TenantId;
const PK = "c0000001-0000-4000-8000-000000000001" as ProductKey;
const AFIRMACAO = "d0000001-0000-4000-8000-000000000001" as ClaimId;

const minimo = (): BrandContentInput => ({
  positioning: "Plataforma de operações de marketing para SaaS B2B.",
  tone: "Direto, técnico e sem exageros.",
  products: [{ productKey: PK, name: "Oplyra Performance", description: "Mídia, conteúdo e relatórios.", availability: "available" }],
  claims: [],
});
const comAfirmacao = (over: Partial<BrandContentInput["claims"][number]> = {}): BrandContentInput => ({
  ...minimo(),
  claims: [{
    id: AFIRMACAO, productKey: PK, kind: "benefit", polarity: "allowed", text: "Reduz o tempo de relatório.",
    usageRule: "Citar apenas com o estudo de caso vigente.", evidence: [{ kind: "url", value: "https://exemplo.test/estudo" }], ...over,
  }],
});

const gestor = contexto({ tenantId: TA, roleKey: "marketing_manager" });
const dono = contexto({ tenantId: TA, roleKey: "owner" });
const leitor = contexto({ tenantId: TA, roleKey: "viewer" });

async function publicada(deps: ReturnType<typeof criarBrandDeps>, conteudo: BrandContentInput = minimo()) {
  const rascunho = await startBrandDraft(deps, { ctx: dono });
  const salvo = await saveBrandDraft(deps, { ctx: dono, versionId: rascunho.id, expectedRevision: rascunho.revision, content: conteudo });
  return publishBrandVersion(deps, { ctx: dono, versionId: salvo.id, expectedRevision: salvo.revision });
}

describe("permissões (D-4)", () => {
  it("leitura exige brand.read; edição exige brand.write; publicação exige brand.publish", async () => {
    const deps = criarBrandDeps();
    await expect(startBrandDraft(deps, { ctx: leitor })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    const rascunho = await startBrandDraft(deps, { ctx: gestor });
    await expect(publishBrandVersion(deps, { ctx: gestor, versionId: rascunho.id, expectedRevision: 1 }))
      .rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    await expect(saveBrandDraft(deps, { ctx: leitor, versionId: rascunho.id, expectedRevision: 1, content: minimo() }))
      .rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    await expect(getBrandOverview(deps, leitor)).resolves.toMatchObject({ current: null, draft: { id: rascunho.id } }); // leitor lê
  });

  it("sem brand.read nada é lido", async () => {
    const deps = criarBrandDeps();
    const semLeitura = { ...leitor, permissions: new Set<never>() };
    await expect(getBrandOverview(deps, semLeitura)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    await expect(listBrandVersions(deps, semLeitura)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });
});

describe("rascunho", () => {
  it("nasce vazio, numerado e auditado", async () => {
    const deps = criarBrandDeps();
    const r = await startBrandDraft(deps, { ctx: gestor });
    expect(r).toMatchObject({ number: 1, status: "draft", revision: 1, derivedFromId: null, products: [], claims: [] });
    expect(deps.estado.auditoria.at(-1)).toMatchObject({ action: "brand.draft.create", target: r.id });
  });

  it("no máximo um rascunho por empresa", async () => {
    const deps = criarBrandDeps();
    await startBrandDraft(deps, { ctx: gestor });
    await expect(startBrandDraft(deps, { ctx: dono })).rejects.toMatchObject({ code: "BRAND_DRAFT_ALREADY_EXISTS" });
  });

  it("salva conteúdo incompleto, mas estruturalmente válido, e avança a revisão", async () => {
    const deps = criarBrandDeps();
    const r = await startBrandDraft(deps, { ctx: gestor });
    const s = await saveBrandDraft(deps, { ctx: gestor, versionId: r.id, expectedRevision: 1, content: { positioning: "só isto", tone: "", products: [], claims: [] } });
    expect(s.revision).toBe(2);
    expect(s.positioning).toBe("só isto");
  });

  it("gera chaves ausentes de produto e de afirmação", async () => {
    const deps = criarBrandDeps();
    const r = await startBrandDraft(deps, { ctx: gestor });
    const s = await saveBrandDraft(deps, {
      ctx: gestor, versionId: r.id, expectedRevision: 1,
      content: { ...minimo(), products: [{ name: "Sem chave", description: "", availability: "available" }], claims: [{ productKey: null, kind: "benefit", polarity: "forbidden", text: "Garantimos resultado.", usageRule: "Nunca prometer resultado.", evidence: [] }] },
    });
    expect(s.products[0]!.productKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(s.claims[0]!.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("recusa gravação com revisão desatualizada (concorrência otimista)", async () => {
    const deps = criarBrandDeps();
    const r = await startBrandDraft(deps, { ctx: gestor });
    await saveBrandDraft(deps, { ctx: gestor, versionId: r.id, expectedRevision: 1, content: minimo() });
    await expect(saveBrandDraft(deps, { ctx: dono, versionId: r.id, expectedRevision: 1, content: minimo() }))
      .rejects.toMatchObject({ code: "CONFLICT_VERSION" });
  });

  it("devolve todas as violações estruturais de uma vez", async () => {
    const deps = criarBrandDeps();
    const r = await startBrandDraft(deps, { ctx: gestor });
    const falha = await saveBrandDraft(deps, {
      ctx: gestor, versionId: r.id, expectedRevision: 1,
      content: { ...comAfirmacao({ productKey: "e0000001-0000-4000-8000-000000000009" as ProductKey, evidence: [{ kind: "url", value: "ftp://x" }] }), positioning: "x".repeat(2001) },
    }).catch((e) => e);
    expect(falha).toMatchObject({ code: "BRAND_CONTENT_INVALID" });
    expect(falha.issues.map((i: { code: string }) => i.code).sort()).toEqual(["CLAIM_EVIDENCE_INVALID", "CLAIM_PRODUCT_UNKNOWN", "TEXT_TOO_LONG"]);
  });

  it("versão inexistente ou de outra empresa é não encontrada, sem revelar a existência", async () => {
    const deps = criarBrandDeps();
    const r = await startBrandDraft(deps, { ctx: contexto({ tenantId: TB, roleKey: "owner" }) });
    await expect(saveBrandDraft(deps, { ctx: dono, versionId: r.id, expectedRevision: 1, content: minimo() }))
      .rejects.toMatchObject({ code: "BRAND_VERSION_NOT_FOUND" });
  });
});

describe("publicação (D-2)", () => {
  it("exige posicionamento, tom e ao menos um produto, listando o que falta", async () => {
    const deps = criarBrandDeps();
    const r = await startBrandDraft(deps, { ctx: dono });
    const falha = await publishBrandVersion(deps, { ctx: dono, versionId: r.id, expectedRevision: 1 }).catch((e) => e);
    expect(falha).toMatchObject({ code: "BRAND_NOT_PUBLISHABLE" });
    expect(falha.issues.map((i: { code: string }) => i.code).sort()).toEqual(["POSITIONING_REQUIRED", "PRODUCT_REQUIRED", "TONE_REQUIRED"]);
  });

  it("publica, preenche autoria e data, e audita", async () => {
    const deps = criarBrandDeps();
    const v = await publicada(deps);
    expect(v).toMatchObject({ status: "published", number: 1, publishedBy: dono.userId, publishedAt: deps.estado.agora });
    expect(deps.estado.auditoria.at(-1)).toMatchObject({ action: "brand.publish", target: v.id });
  });

  it("versão publicada é imutável: não salva nem publica de novo", async () => {
    const deps = criarBrandDeps();
    const v = await publicada(deps);
    await expect(saveBrandDraft(deps, { ctx: dono, versionId: v.id, expectedRevision: v.revision, content: minimo() }))
      .rejects.toMatchObject({ code: "BRAND_VERSION_IMMUTABLE" });
    await expect(publishBrandVersion(deps, { ctx: dono, versionId: v.id, expectedRevision: v.revision }))
      .rejects.toMatchObject({ code: "BRAND_VERSION_IMMUTABLE" });
  });

  it("uma vigente: a nova publicação vira vigente e a anterior fica preservada", async () => {
    const deps = criarBrandDeps();
    const v1 = await publicada(deps);
    const rascunho = await startBrandDraft(deps, { ctx: dono });
    expect(rascunho).toMatchObject({ number: 2, derivedFromId: v1.id, positioning: v1.positioning });
    expect(rascunho.products[0]!.productKey).toBe(PK); // identidade do produto entre versões
    const salvo = await saveBrandDraft(deps, { ctx: dono, versionId: rascunho.id, expectedRevision: 1, content: { ...minimo(), tone: "Novo tom." } });
    const v2 = await publishBrandVersion(deps, { ctx: dono, versionId: salvo.id, expectedRevision: salvo.revision });
    const geral = await getBrandOverview(deps, leitor);
    expect(geral.current?.id).toBe(v2.id);
    expect(geral.draft).toBeNull();
    const antiga = deps.estado.versoes.find((v) => v.id === v1.id)!;
    expect(antiga).toMatchObject({ status: "published", tone: "Direto, técnico e sem exageros." });
    expect((await listBrandVersions(deps, leitor)).map((v) => v.number)).toEqual([2, 1]);
  });
});

describe("afirmações (claims)", () => {
  const rascunhoCom = async (conteudo: BrandContentInput) => {
    const deps = criarBrandDeps();
    const r = await startBrandDraft(deps, { ctx: dono });
    return { deps, r, tentar: () => saveBrandDraft(deps, { ctx: dono, versionId: r.id, expectedRevision: 1, content: conteudo }) };
  };

  it("afirmação permitida válida é aceita e publicada", async () => {
    const deps = criarBrandDeps();
    const v = await publicada(deps, comAfirmacao());
    expect(v.claims).toHaveLength(1);
  });

  it("afirmação permitida sem evidência não publica; proibida sem evidência publica", async () => {
    const { deps, r, tentar } = await rascunhoCom(comAfirmacao({ evidence: [] }));
    const salvo = await tentar(); // estruturalmente válida: a evidência é exigida na publicação
    const falha = await publishBrandVersion(deps, { ctx: dono, versionId: r.id, expectedRevision: salvo.revision }).catch((e) => e);
    expect(falha.issues.map((i: { code: string }) => i.code)).toEqual(["CLAIM_EVIDENCE_REQUIRED"]);
    const salvo2 = await saveBrandDraft(deps, { ctx: dono, versionId: r.id, expectedRevision: salvo.revision, content: comAfirmacao({ polarity: "forbidden", evidence: [] }) });
    await expect(publishBrandVersion(deps, { ctx: dono, versionId: r.id, expectedRevision: salvo2.revision })).resolves.toMatchObject({ status: "published" });
  });

  it("toda afirmação publicada tem regra de uso", async () => {
    const { deps, r, tentar } = await rascunhoCom(comAfirmacao({ usageRule: "   " }));
    const salvo = await tentar();
    const falha = await publishBrandVersion(deps, { ctx: dono, versionId: r.id, expectedRevision: salvo.revision }).catch((e) => e);
    expect(falha.issues.map((i: { code: string }) => i.code)).toEqual(["CLAIM_USAGE_RULE_REQUIRED"]);
  });

  it("produto future bloqueia afirmação de disponibilidade permitida", async () => {
    const futuro: BrandContentInput = {
      ...comAfirmacao({ kind: "availability", text: "Já está disponível." }),
      products: [{ productKey: PK, name: "Módulo novo", description: "", availability: "future" }],
    };
    const { tentar } = await rascunhoCom(futuro);
    await expect(tentar()).rejects.toMatchObject({ code: "BRAND_CONTENT_INVALID", issues: [{ code: "CLAIM_AVAILABILITY_FUTURE_PRODUCT" }] });
  });

  it("produto future admite a afirmação de disponibilidade PROIBIDA e outras afirmações permitidas", async () => {
    const futuro: BrandContentInput = {
      ...minimo(),
      products: [{ productKey: PK, name: "Módulo novo", description: "", availability: "future" }],
      claims: [
        { id: AFIRMACAO, productKey: PK, kind: "availability", polarity: "forbidden", text: "Já está disponível.", usageRule: "Não prometer antes do lançamento.", evidence: [] },
        { id: "d0000002-0000-4000-8000-000000000002" as ClaimId, productKey: PK, kind: "differentiator", polarity: "allowed", text: "Em desenvolvimento.", usageRule: "Dizer apenas que está em desenvolvimento.", evidence: [{ kind: "text", value: "Roadmap interno 2026." }] },
      ],
    };
    const { tentar } = await rascunhoCom(futuro);
    await expect(tentar()).resolves.toMatchObject({ revision: 2 });
  });

  it("afirmação de disponibilidade exige produto", async () => {
    const { tentar } = await rascunhoCom(comAfirmacao({ kind: "availability", productKey: null }));
    await expect(tentar()).rejects.toMatchObject({ issues: [{ code: "CLAIM_AVAILABILITY_PRODUCT_REQUIRED" }] });
  });

  it("evidência: texto vazio e URL fora de http/https são recusados", async () => {
    const { tentar } = await rascunhoCom(comAfirmacao({ evidence: [{ kind: "text", value: "  " }, { kind: "url", value: "javascript:alert(1)" }] }));
    await expect(tentar()).rejects.toMatchObject({ issues: [{ code: "CLAIM_EVIDENCE_INVALID" }, { code: "CLAIM_EVIDENCE_INVALID" }] });
  });
});

describe("regras puras do domínio", () => {
  const base = (): BrandContent => ({ ...conteudoVazio() });

  it("versaoVigente escolhe a publicada de maior número e ignora rascunhos", () => {
    const v = (number: number, status: "draft" | "published") => ({ number, status });
    expect(versaoVigente([v(1, "published"), v(3, "draft"), v(2, "published")])).toEqual(v(2, "published"));
    expect(versaoVigente([v(1, "draft")])).toBeNull();
    expect(versaoVigente([])).toBeNull();
  });

  it("exigirRascunho recusa versão publicada e aceita rascunho (regra do domínio, sem depender do repositório)", () => {
    expect(() => exigirRascunho({ status: "published" })).toThrow(expect.objectContaining({ code: "BRAND_VERSION_IMMUTABLE" }));
    expect(() => exigirRascunho({ status: "draft" })).not.toThrow();
  });

  it("conteúdo vazio é estruturalmente válido e não publicável", () => {
    expect(problemasEstruturais(base())).toEqual([]);
    expect(problemasDePublicacao(base()).map((p) => p.code).sort()).toEqual(["POSITIONING_REQUIRED", "PRODUCT_REQUIRED", "TONE_REQUIRED"]);
  });

  it("recusa produtos repetidos e disponibilidade desconhecida", () => {
    const p = { productKey: PK, name: "A", description: "", availability: "available" as const };
    const c = { ...base(), products: [p, { ...p, availability: "beta" as never }] };
    expect(problemasEstruturais(c).map((x) => x.code).sort()).toEqual(["PRODUCT_AVAILABILITY_INVALID", "PRODUCT_DUPLICATE_KEY"]);
  });

  it("limites: produtos e afirmações em excesso", () => {
    const p = (i: number) => ({ productKey: `c${String(i).padStart(7, "0")}-0000-4000-8000-000000000001` as ProductKey, name: "P", description: "", availability: "available" as const });
    const c = { ...base(), products: Array.from({ length: 51 }, (_, i) => p(i)) };
    expect(problemasEstruturais(c).map((x) => x.code)).toContain("LIMIT_EXCEEDED");
  });

  it("o domínio não retém referência mutável: publicar não altera o conteúdo salvo", async () => {
    const deps = criarBrandDeps();
    const v: BrandVersion = await publicada(deps);
    const antes = JSON.stringify(v.products);
    await startBrandDraft(deps, { ctx: dono });
    expect(JSON.stringify(deps.estado.versoes.find((x) => x.id === v.id)!.products)).toBe(antes);
  });
});
