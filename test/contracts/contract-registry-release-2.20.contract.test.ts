// Contract Registry Release 2.20 (CR-030) — verificação do manifest CONGELADO.
// Desde a Release 2.21 este teste não depende do conteúdo mutável do worktree
// nem de objetos Git: fixa o SHA-256 do manifest, do aggregate digest, do
// relatório e da base 2.19, e valida classificação, cadeia e propriedades do
// próprio manifest. O conteúdo corrente dos documentos e artefatos é validado
// pelo teste da Release 2.21.
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONTRACTS_DIR } from "./cross-registry-validation.ts";

const CR030_DOCS = [
  "docs/decisions/ADR-0006-runtime-de-agentes.md", "docs/decisions/ADR-0007-entitlements-e-billing.md", "docs/decisions/README.md",
  ...["01-product-requirements", "02-discovery", "03-domain-model", "04-architecture", "05-data-model", "06-integrations", "07-security-lgpd",
    "08-billing-entitlements", "09-agentic-architecture", "10-agent-catalog", "11-agent-governance", "12-roadmap", "13-ai-model-routing-finops",
    "17-risks-costs", "18-technical-experiments", "ATUALIZACOES", "README"].map((n) => `docs/product/marketing-ops/${n}.md`),
] as const;


type Artefato = { path: string; category: string; sizeBytes: number; sha256: string; source: string };
type Manifest = Record<string, any> & { artifacts: Artefato[] };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const ler = (p: string): Record<string, any> => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const sha = (p: string) => createHash("sha256").update(readFileSync(join(ROOT, p))).digest("hex");
const agregado = (artefatos: { path: string; sha256: string }[]) =>
  createHash("sha256").update([...artefatos].sort((a, b) => a.path.localeCompare(b.path)).map((a) => `${a.path}:${a.sha256}`).join("\n")).digest("hex");

// Valores congelados da Release 2.20.
const MANIFEST_SHA256 = "04933b7deded99000ce2f9dcae926fa50608650123dcfbe3ba4f44d1414b28c6";
const AGGREGATE_DIGEST = "60344effb0632b78b777500b8faacfcbf332ae3a3ebfccbcf59a564f2ebc8d61";
const REPORT_SHA256 = "28399aba1930e2c4ecbda949b4410d8a06bd2afc55aaec0e72e15b26d987b34a";
const BASE_MANIFEST_SHA256 = "fb509e10f1561f0ffbcae277bc9b14281b0a72d794f377e7c4f5050404b67858";
const BASE_AGGREGATE_DIGEST = "a15b086e9c6fb2209a8a950e94974a00a76ae67980effab6b4d34ae478660c38";

const relatorio = ler(`${CONTRACTS_DIR}/cross-registry-validation-v2.20.json`);
const m = ler(`${CONTRACTS_DIR}/contract-registry-manifest-v2.20.json`) as Manifest;
const base = ler(`${CONTRACTS_DIR}/contract-registry-manifest-v2.19.json`) as Manifest;
const FONTE = "cr_030";
const DOC16 = "docs/product/marketing-ops/16-environments-release.md";
const PLANO = "docs/product/marketing-ops/15-test-plan.md";
const PSP = "docs/harness/PREPARACAO-SUPABASE-PRODUCAO.md";
const FORA_DO_ESCOPO = [
  "CLAUDE.md", "README.md", ".claude/settings.json", ".mcp.json", "pnpm-workspace.yaml", "scripts/claude-local-first-guard.mjs", "scripts/claude-local-first-guard.test.mjs",
  "docs/harness/AUTONOMOUS-BUILD.md", "docs/harness/SYSTEM-TEST-USERS.md", "docs/harness/DESENVOLVIMENTO.md",
];
const OPERACIONAIS = ["docs/harness/PREPARACAO-I01.md", "docs/harness/VERIFICACOES.md", "docs/harness/DEVELOPMENT-TOOLS.md", "docs/harness/ESTADO.md"];

/** Classifica cada artefato da release; qualquer caso fora das três classes é violação. */
export function classificar(release: Manifest, anterior: Manifest, fonte = FONTE) {
  const b = new Map(anterior.artifacts.map((a) => [a.path, a]));
  const modificaveis = new Set<string>(release.changeSet.modifiedArtifacts ?? []);
  const adicionaveis = new Set<string>(release.changeSet.addedArtifacts ?? []);
  const herdados: string[] = [], modificados: string[] = [], adicionados: string[] = [], violacoes: string[] = [];
  const presentes = new Set(release.artifacts.map((a) => a.path));
  for (const a of release.artifacts) {
    const o = b.get(a.path);
    if (o) {
      const identico = JSON.stringify([o.path, o.category, o.sizeBytes, o.sha256, o.source]) === JSON.stringify([a.path, a.category, a.sizeBytes, a.sha256, a.source]);
      if (identico && !modificaveis.has(a.path)) herdados.push(a.path);
      else if (!identico && modificaveis.has(a.path) && a.source === fonte && a.category === o.category) modificados.push(a.path);
      else violacoes.push(`${a.path}: difere da base ${anterior.releaseVersion} fora do change set autorizado`);
    } else if (adicionaveis.has(a.path) && a.source === fonte) adicionados.push(a.path);
    else violacoes.push(`${a.path}: novo sem pertencer ao change set autorizado`);
  }
  for (const p of b.keys()) if (!presentes.has(p)) violacoes.push(`${p}: herdado ausente`);
  for (const p of [...modificaveis, ...adicionaveis]) if (!presentes.has(p)) violacoes.push(`${p}: autorizado mas ausente`);
  for (const a of release.artifacts) if (a.source === "worktree_change_outside_cr") violacoes.push(`${a.path}: alteração fora de CR no digest`);
  return { herdados, modificados, adicionados, violacoes };
}

describe("Release 2.20 congelada: manifest, relatório e cadeia para a base 2.19", () => {
  it("manifest, relatório e base 2.19 têm os SHA-256 fixados", () => {
    expect(sha(`${CONTRACTS_DIR}/contract-registry-manifest-v2.20.json`)).toBe(MANIFEST_SHA256);
    expect(sha(`${CONTRACTS_DIR}/cross-registry-validation-v2.20.json`)).toBe(REPORT_SHA256);
    expect(sha(`${CONTRACTS_DIR}/contract-registry-manifest-v2.19.json`)).toBe(BASE_MANIFEST_SHA256);
  });

  it("o aggregate digest fixado é o recalculado a partir do manifest, e o da base 2.19 também", () => {
    expect(m.artifactSummary.aggregateDigest).toBe(AGGREGATE_DIGEST);
    expect(agregado(m.artifacts)).toBe(AGGREGATE_DIGEST);
    expect(base.artifactSummary.aggregateDigest).toBe(BASE_AGGREGATE_DIGEST);
    expect(agregado(base.artifacts)).toBe(BASE_AGGREGATE_DIGEST);
  });

  it("o relatório congelado registra 82 checks aprovados para a Release 2.20", () => {
    expect(relatorio).toMatchObject({ status: "passed", releaseVersion: "2.20", changeSet: "CR-030", validation: { checksFailed: 0, checksRun: 82, checksPassed: 82 } });
    expect(relatorio.validation.checks).toHaveLength(82);
    expect(relatorio.validation.checks.filter((c: { status: string }) => c.status !== "passed")).toEqual([]);
  });

  it("a validação do Freeze v1 permanece intacta", () => {
    const freeze = readFileSync(join(ROOT, `${CONTRACTS_DIR}/CONTRACT-REGISTRY-FREEZE-v1.md`), "utf8");
    const citado = freeze.match(/`([0-9a-f]{64})`/)![1];
    expect(sha(`${CONTRACTS_DIR}/cross-registry-validation.json`)).toBe(citado);
  });
});

describe("manifest v2.20 como mudança lógica sobre a 2.19", () => {
  const c = classificar(m, base);

  it("todo artefato é herdado sem mudança, modificado pelo CR-030 ou adicionado pelo CR-030", () => {
    expect(c.violacoes).toEqual([]);
    expect(c.herdados.length + c.modificados.length + c.adicionados.length).toBe(m.artifacts.length);
    expect(m.artifactClassification).toEqual({
      inheritedUnchanged: c.herdados.length, modifiedByCr030: c.modificados.length, addedByCr030: c.adicionados.length, unclassified: 0,
    });
  });

  it("a release só é ativa com todos os artefatos classificados", () => {
    expect(m.status).toBe("active");
    expect(m.artifactClassification.unclassified).toBe(0);
  });

  it("o change set autorizado é exatamente o conjunto de artefatos cr_030", () => {
    const cr = m.artifacts.filter((a) => a.source === FONTE).map((a) => a.path).sort();
    expect([...c.modificados, ...c.adicionados].sort()).toEqual(cr);
    expect([...m.changeSet.modifiedArtifacts, ...m.changeSet.addedArtifacts].sort()).toEqual(cr);
  });

  it("registries, schemas, fixtures, código e migrations são herdados sem mudança", () => {
    for (const a of m.artifacts.filter((x) => ["registry", "schema", "fixture", "database_migration", "runtime_component", "database_seed"].includes(x.category))) {
      expect(c.herdados, a.path).toContain(a.path);
    }
    expect(m.changeSet).toMatchObject({ registriesModified: [], registriesAdded: [], schemasAdded: 0, schemasUpdated: 0, productCodeChanged: false, migrationsAdded: 0, databaseChanged: false });
  });

  it("guarda: hash diferente da base fora do change set, novo não autorizado, herdado ausente ou alteração externa são violações", () => {
    const adulterado = structuredClone(m);
    adulterado.artifacts.find((a) => a.path === "package.json")!.sha256 = "0".repeat(64);
    expect(classificar(adulterado, base).violacoes).toContain("package.json: difere da base 2.19 fora do change set autorizado");

    for (const operacional of [...OPERACIONAIS, ...FORA_DO_ESCOPO]) {
      const intruso = structuredClone(m);
      intruso.artifacts.push({ path: operacional, category: "environment_plan", sizeBytes: 1, sha256: "1".repeat(64), source: FONTE });
      expect(classificar(intruso, base).violacoes, operacional).toContain(`${operacional}: novo sem pertencer ao change set autorizado`);
    }

    const fora = structuredClone(m);
    fora.artifacts.find((a) => a.path === "pnpm-lock.yaml")!.source = "worktree_change_outside_cr";
    expect(classificar(fora, base).violacoes.some((v) => v.startsWith("pnpm-lock.yaml"))).toBe(true);

    const faltando = structuredClone(m);
    faltando.artifacts = faltando.artifacts.filter((a) => a.path !== "docs/decisions/README.md");
    expect(classificar(faltando, base).violacoes).toContain("docs/decisions/README.md: herdado ausente");

    const migracao = structuredClone(m);
    migracao.artifacts.find((a) => a.path.endsWith("20260929000015_tenant_deletion_owner_guard.sql"))!.sha256 = "2".repeat(64);
    expect(classificar(migracao, base).violacoes.some((v) => v.includes("20260929000015_tenant_deletion_owner_guard.sql"))).toBe(true);
  });

  it("classificação: 439 herdados, 5 modificados (3 documentos governados, runner e teste da 2.19), 20 adicionados, 464 no total", () => {
    expect(m.artifactClassification).toEqual({ inheritedUnchanged: 439, modifiedByCr030: 5, addedByCr030: 20, unclassified: 0 });
    expect(m.artifactSummary.total).toBe(464);
    expect(c.modificados.sort()).toEqual([
      "docs/decisions/README.md", "docs/product/marketing-ops/17-risks-costs.md", "docs/product/marketing-ops/18-technical-experiments.md",
      "test/contracts/contract-registry-release-2.19.contract.test.ts", "test/contracts/cross-registry-validation.ts",
    ]);
    const governadosAntes = base.artifacts.filter((x) => (CR030_DOCS as readonly string[]).includes(x.path)).map((x) => x.path).sort();
    expect(governadosAntes).toEqual(["docs/decisions/README.md", "docs/product/marketing-ops/17-risks-costs.md", "docs/product/marketing-ops/18-technical-experiments.md"]);
    const novos = (CR030_DOCS as readonly string[]).filter((p) => !governadosAntes.includes(p)).sort();
    expect(novos).toHaveLength(17);
    for (const p of novos) expect(m.artifacts.find((x) => x.path === p), p).toMatchObject({ source: FONTE, category: p.startsWith("docs/decisions/ADR-") ? "contract_decision" : "contract_documentation" });
    expect(c.adicionados.sort()).toEqual([
      ...novos, `${CONTRACTS_DIR}/changes/CR-030-product-ai-documentation-baseline-reconciliation.md`, `${CONTRACTS_DIR}/cross-registry-validation-v2.20.json`,
      "test/contracts/contract-registry-release-2.20.contract.test.ts",
    ].sort());
  });

  it("os 20 arquivos do CR-030 são exatamente o conjunto de documentos de produto/decisão do change set; nada fora do escopo entra", () => {
    expect((CR030_DOCS as readonly string[])).toHaveLength(20);
    const docs = m.artifacts.filter((x) => x.source === FONTE && /^docs\/(decisions|product\/marketing-ops)\/[^/]+\.md$/.test(x.path)).map((x) => x.path).sort();
    expect(docs).toEqual([...(CR030_DOCS as readonly string[])].sort());
    for (const p of FORA_DO_ESCOPO) expect(m.artifacts.some((x) => x.path === p), p).toBe(false);
  });

  it("documentos operacionais ficam fora do manifest, do digest e das exclusões de hash, e são registrados como atualizados fora do conjunto", () => {
    for (const p of OPERACIONAIS) expect(m.artifacts.some((a) => a.path === p), p).toBe(false);
    expect(JSON.stringify(m.artifacts)).not.toMatch(/PREPARACAO-I01|VERIFICACOES|DEVELOPMENT-TOOLS|ESTADO\.md/);
    expect(m.changeSet.operationalDocumentsUpdatedOutsideRelease).toEqual([]);
    expect(m.changeSet.developerHarnessDeferredToCr031).toEqual(expect.arrayContaining(["CLAUDE.md", "README.md", ".claude/settings.json", ".mcp.json", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "docs/harness/DEVELOPMENT-TOOLS.md"]));
  });

  it("aggregateDigest, resumo por categoria e ordenação recalculados conferem", () => {
    expect(agregado(m.artifacts)).toBe(m.artifactSummary.aggregateDigest);
    const porCategoria: Record<string, number> = {};
    for (const a of m.artifacts) porCategoria[a.category] = (porCategoria[a.category] ?? 0) + 1;
    expect(m.artifactSummary.byCategory).toEqual(porCategoria);
    expect(m.artifactSummary.total).toBe(m.artifacts.length);
    const caminhos = m.artifacts.map((a) => a.path);
    expect(new Set(caminhos).size).toBe(caminhos.length);
    expect(caminhos).toEqual([...caminhos].sort((a, b) => a.localeCompare(b)));
  });

  it("envelope, versões e base seguem o precedente", () => {
    expect(m).toMatchObject({
      manifest: "oplyra-contract-registry-release", manifestVersion: "2.20", schemaVersion: "1.0", releaseVersion: "2.20",
      changeSet: { id: "CR-030", path: `${CONTRACTS_DIR}/changes/CR-030-product-ai-documentation-baseline-reconciliation.md` },
    });
    expect(m.registryVersions).toEqual(base.registryVersions);
    expect(m.baseRelease).toEqual({
      version: "2.19", manifestPath: `${CONTRACTS_DIR}/contract-registry-manifest-v2.19.json`,
      manifestSha256: BASE_MANIFEST_SHA256, aggregateDigest: BASE_AGGREGATE_DIGEST,
    });
    expect(m.baseFreeze).toEqual(base.baseFreeze);
    expect(agregado(base.artifacts)).toBe(base.artifactSummary.aggregateDigest);
  });

  it("exclui o próprio manifest e os anteriores do hash", () => {
    for (const v of ["2.15", "2.16", "2.17", "2.18", "2.19", "2.20"]) {
      expect(m.exclusions).toContainEqual({ path: `${CONTRACTS_DIR}/contract-registry-manifest-v${v}.json`, reason: "manifest_self_reference_is_not_hashed" });
      expect(m.artifacts.some((a) => a.path.endsWith(`contract-registry-manifest-v${v}.json`))).toBe(false);
    }
  });

  it("não autoriza nada além de documentação: sem recurso remoto, migration, credencial, publicação ou runtime produtivo", () => {
    expect(m.implementationBoundary).toEqual(base.implementationBoundary);
    expect(m.changeSet).toMatchObject({
      remoteResourcesCreated: false, remoteMigrationsApplied: false, publicationPerformed: false, externalCallsPerformed: false, realKeysUsed: false, realDataUsed: false,
    });
  });
});
