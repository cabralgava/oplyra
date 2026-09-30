// Contract Registry Release 2.18 (CR-028) — verificação do manifest CONGELADO.
// Desde a Release 2.19 este teste não depende do conteúdo mutável do worktree
// nem de objetos Git: fixa o SHA-256 do manifest, do aggregate digest, do
// relatório e da base 2.17, e valida classificação, cadeia e propriedades do
// próprio manifest. O conteúdo corrente dos documentos e artefatos é validado
// pelo teste da Release 2.19.
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONTRACTS_DIR } from "./cross-registry-validation.ts";

type Artefato = { path: string; category: string; sizeBytes: number; sha256: string; source: string };
type Manifest = Record<string, any> & { artifacts: Artefato[] };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const ler = (p: string): Record<string, any> => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const sha = (p: string) => createHash("sha256").update(readFileSync(join(ROOT, p))).digest("hex");
/** Precedente das Releases 1.x–2.17: linhas `path:sha256` em ordem localeCompare, unidas por \n. */
const agregado = (artefatos: { path: string; sha256: string }[]) =>
  createHash("sha256").update([...artefatos].sort((a, b) => a.path.localeCompare(b.path)).map((a) => `${a.path}:${a.sha256}`).join("\n")).digest("hex");

// Valores congelados da Release 2.18.
const MANIFEST_SHA256 = "2fca9e53d241430005cf5091fd98be063d5de4e98031d84701ec3dfab3bcd7b2";
const AGGREGATE_DIGEST = "fbfbb06a65a8915ac64e184eb47ff6b604359076e4a2e6a978c4fffd34d04a01";
const REPORT_SHA256 = "686ee7e880f33646fda1e447b732927ad6b02191c7a76b8d3dab4bb9e68914eb";
const BASE_MANIFEST_SHA256 = "0870c3afaea6d0ba40c0185883f8b7ebae7b90789efd58de36fc284eaa983076";
const BASE_AGGREGATE_DIGEST = "1d7bdc7c0c6b75268accad353dac4b72a8d7a335ef8808f0506db5a885f0b7d5";
const MIGRATION_000015_SHA256 = "0884972aa649dc6629cb3538b5f1203c0d5ab3aa67cf87ec805a0eed3e8cc342";

const relatorio = ler(`${CONTRACTS_DIR}/cross-registry-validation-v2.18.json`);
const m = ler(`${CONTRACTS_DIR}/contract-registry-manifest-v2.18.json`) as Manifest;
const base = ler(`${CONTRACTS_DIR}/contract-registry-manifest-v2.17.json`) as Manifest;
const FONTE = "cr_028";

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

describe("Release 2.18 congelada: manifest, relatório e cadeia para a base 2.17", () => {
  it("manifest, relatório e base 2.17 têm os SHA-256 fixados", () => {
    expect(sha(`${CONTRACTS_DIR}/contract-registry-manifest-v2.18.json`)).toBe(MANIFEST_SHA256);
    expect(sha(`${CONTRACTS_DIR}/cross-registry-validation-v2.18.json`)).toBe(REPORT_SHA256);
    expect(sha(`${CONTRACTS_DIR}/contract-registry-manifest-v2.17.json`)).toBe(BASE_MANIFEST_SHA256);
  });

  it("o aggregate digest fixado é o recalculado a partir do manifest, e o da base 2.17 também", () => {
    expect(m.artifactSummary.aggregateDigest).toBe(AGGREGATE_DIGEST);
    expect(agregado(m.artifacts)).toBe(AGGREGATE_DIGEST);
    expect(base.artifactSummary.aggregateDigest).toBe(BASE_AGGREGATE_DIGEST);
    expect(agregado(base.artifacts)).toBe(BASE_AGGREGATE_DIGEST);
  });

  it("o relatório congelado registra 78 checks aprovados para a Release 2.18", () => {
    expect(relatorio).toMatchObject({ status: "passed", releaseVersion: "2.18", changeSet: "CR-028", validation: { checksFailed: 0, checksRun: 78, checksPassed: 78 } });
    expect(relatorio.validation.checks).toHaveLength(78);
    expect(relatorio.validation.checks.filter((c: { status: string }) => c.status !== "passed")).toEqual([]);
  });

  it("a validação do Freeze v1 permanece intacta", () => {
    const freeze = readFileSync(join(ROOT, `${CONTRACTS_DIR}/CONTRACT-REGISTRY-FREEZE-v1.md`), "utf8");
    const citado = freeze.match(/`([0-9a-f]{64})`/)![1];
    expect(sha(`${CONTRACTS_DIR}/cross-registry-validation.json`)).toBe(citado);
  });
});

describe("manifest v2.18 como mudança lógica sobre a 2.17", () => {
  const c = classificar(m, base);

  it("todo artefato é herdado sem mudança, modificado pelo CR-028 ou adicionado pelo CR-028", () => {
    expect(c.violacoes).toEqual([]);
    expect(c.herdados.length + c.modificados.length + c.adicionados.length).toBe(m.artifacts.length);
    expect(m.artifactClassification).toEqual({
      inheritedUnchanged: c.herdados.length, modifiedByCr028: c.modificados.length, addedByCr028: c.adicionados.length, unclassified: 0,
    });
    expect(m.artifactClassification).toEqual({ inheritedUnchanged: 420, modifiedByCr028: 6, addedByCr028: 14, unclassified: 0 });
  });

  it("a release só é ativa com todos os artefatos classificados", () => {
    expect(m.status).toBe("active");
    expect(m.artifactClassification.unclassified).toBe(0);
  });

  it("o change set autorizado é exatamente o conjunto de artefatos cr_028", () => {
    const cr = m.artifacts.filter((a) => a.source === FONTE).map((a) => a.path).sort();
    expect([...c.modificados, ...c.adicionados].sort()).toEqual(cr);
    expect([...m.changeSet.modifiedArtifacts, ...m.changeSet.addedArtifacts].sort()).toEqual(cr);
  });

  it("guarda: hash diferente da base fora do change set, novo não autorizado, herdado ausente ou alteração externa são violações", () => {
    const adulterado = structuredClone(m);
    adulterado.artifacts.find((a) => a.path === "package.json")!.sha256 = "0".repeat(64);
    expect(classificar(adulterado, base).violacoes).toContain("package.json: difere da base 2.17 fora do change set autorizado");

    const intruso = structuredClone(m);
    intruso.artifacts.push({ path: "docs/product/marketing-ops/13-ai-model-routing-finops.md", category: "contract_documentation", sizeBytes: 1, sha256: "1".repeat(64), source: FONTE });
    expect(classificar(intruso, base).violacoes).toContain("docs/product/marketing-ops/13-ai-model-routing-finops.md: novo sem pertencer ao change set autorizado");

    const fora = structuredClone(m);
    fora.artifacts.find((a) => a.path === "pnpm-lock.yaml")!.source = "worktree_change_outside_cr";
    expect(classificar(fora, base).violacoes.some((v) => v.startsWith("pnpm-lock.yaml"))).toBe(true);

    const faltando = structuredClone(m);
    faltando.artifacts = faltando.artifacts.filter((a) => a.path !== "docs/decisions/README.md");
    expect(classificar(faltando, base).violacoes).toContain("docs/decisions/README.md: herdado ausente");

    const migracao = structuredClone(m);
    migracao.artifacts.find((a) => a.path.endsWith("20260929000014_finops_ledger_functions.sql"))!.sha256 = "2".repeat(64);
    expect(classificar(migracao, base).violacoes.some((v) => v.includes("20260929000014_finops_ledger_functions.sql"))).toBe(true);
  });

  it("edições pendentes do proprietário ficam herdadas com a entrada da 2.17; documentos operacionais fora do manifest", () => {
    const b = new Map(base.artifacts.map((a) => [a.path, a]));
    for (const p of [
      "docs/decisions/README.md", "docs/product/marketing-ops/16-environments-release.md", "docs/product/marketing-ops/17-risks-costs.md",
      "docs/product/marketing-ops/18-technical-experiments.md", "package.json", "pnpm-lock.yaml",
      "packages/infra/test/design-agent-copy-draft-consumer.integration.test.ts", "packages/infra/test/outbox-dispatcher-cycle.integration.test.ts",
    ]) {
      expect(m.artifacts.find((a) => a.path === p), p).toEqual(b.get(p));
    }
    for (const fora of ["docs/product/marketing-ops/13-ai-model-routing-finops.md", "docs/harness/ESTADO.md", "docs/harness/PREPARACAO-I01.md", "docs/harness/VERIFICACOES.md"]) {
      expect(m.artifacts.some((a) => a.path === fora), fora).toBe(false);
    }
  });

  it("migrations 000001–000014 herdadas ou fora do registry sem mudança; 000015, testes e configuração adicionados pelo CR-028", () => {
    for (const mig of ["supabase/migrations/20260929000013_finops_ledger_schema.sql", "supabase/migrations/20260929000014_finops_ledger_functions.sql",
      "supabase/migrations/20260921000009_content_repository.sql", "supabase/migrations/20260921000012_outbox_dispatcher_functions.sql"]) {
      expect(c.herdados).toContain(mig);
    }
    for (const novo of ["supabase/migrations/20260929000015_tenant_deletion_owner_guard.sql", "supabase/tests/tenant_deletion_owner_guard.test.sql",
      "packages/infra/src/config.ts", "packages/infra/test/config-environment.test.ts", "packages/infra/test/tenant-deletion-cascade.integration.test.ts",
      `${CONTRACTS_DIR}/changes/CR-028-production-readiness-hardening.md`]) {
      expect(c.adicionados).toContain(novo);
    }
    expect(m.artifacts.find((a) => a.path === "supabase/migrations/20260929000015_tenant_deletion_owner_guard.sql")!.sha256).toBe(MIGRATION_000015_SHA256);
    expect(c.modificados).toEqual(expect.arrayContaining([".github/workflows/ci.yml", "test/contracts/cross-registry-validation.ts"]));
    // Registries e schemas não mudam no CR-028.
    for (const a of m.artifacts.filter((x) => x.category === "registry" || x.category === "schema")) expect(c.herdados).toContain(a.path);
  });

  it("release ativa não carrega exceção de digest e o doc 16 fica herdado com a entrada da 2.17", () => {
    expect(Object.keys(m.changeSet).filter((k) => /excluded/i.test(k))).toEqual([]);
    expect(JSON.stringify(m)).not.toMatch(/excludedFromDigest/);
    expect(c.herdados).toContain("docs/product/marketing-ops/16-environments-release.md");
  });

  it("o teste comportamental do CR-027 é modificado pelo CR-028 (entrada congelada no manifest)", () => {
    expect(c.modificados).toContain("supabase/tests/finops_ledger_behavior.test.sql");
    expect(m.artifacts.find((a) => a.path === "supabase/tests/finops_ledger_behavior.test.sql")).toMatchObject({ source: FONTE, category: "database_test" });
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
      manifest: "oplyra-contract-registry-release", manifestVersion: "2.18", schemaVersion: "1.0", releaseVersion: "2.18",
      changeSet: { id: "CR-028", path: `${CONTRACTS_DIR}/changes/CR-028-production-readiness-hardening.md` },
    });
    expect(m.registryVersions).toEqual({
      agents: "1.0", permissions: "1.0", tools: "1.0", actions: "2.0", events: "1.2", errors: "1.5", handoffs: "1.0", qualityGates: "1.0", modelProfiles: "1.1",
    });
    expect(m.baseRelease).toEqual({
      version: "2.17", manifestPath: `${CONTRACTS_DIR}/contract-registry-manifest-v2.17.json`,
      manifestSha256: BASE_MANIFEST_SHA256, aggregateDigest: BASE_AGGREGATE_DIGEST,
    });
    expect(m.baseFreeze).toEqual(base.baseFreeze);
  });

  it("exclui o próprio manifest e os anteriores do hash", () => {
    for (const v of ["2.15", "2.16", "2.17", "2.18"]) {
      expect(m.exclusions).toContainEqual({ path: `${CONTRACTS_DIR}/contract-registry-manifest-v${v}.json`, reason: "manifest_self_reference_is_not_hashed" });
      expect(m.artifacts.some((a) => a.path.endsWith(`contract-registry-manifest-v${v}.json`))).toBe(false);
    }
  });

  it("autoriza somente correções locais: sem projeto remoto, migration remota, credencial real, publicação ou runtime produtivo", () => {
    expect(m.implementationBoundary).toMatchObject({
      realProviderEnabled: false, visualCapabilityEnabled: false, productiveFingerprintKeyLoaded: false,
      costLedgerPersisted: true, costLedgerEnvironment: "local_supabase_only",
      productionRuntimeEnabled: false, approvedDeploymentProviders: 0, allowRemoteFlagSupported: false,
    });
    expect(m.changeSet).toMatchObject({
      migrationsAdded: 1, databaseChanged: true, remoteResourcesCreated: false, externalCallsPerformed: false, realKeysUsed: false, realDataUsed: false,
      publicationPerformed: false, remoteMigrationsApplied: false,
    });
  });
});
