// Contract Registry Release 2.16 (CR-026), agora referência histórica: o
// relatório gravado e o manifest são conferidos pela própria cadeia de hashes.
// A cross-validation executável corrente é a da Release 2.17 (CR-027); os
// artefatos do CR-026 que o CR-027 modificou são conferidos pelo manifest
// v2.17, e os demais continuam idênticos ao disco.
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONTRACTS_DIR } from "./cross-registry-validation.ts";

type Artefato = { path: string; category: string; sizeBytes: number; sha256: string; source: string };
type Manifest = Record<string, any> & { artifacts: Artefato[] };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const ler = (p: string): Record<string, any> => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const sha = (p: string) => createHash("sha256").update(readFileSync(join(ROOT, p))).digest("hex");
/** Precedente das Releases 1.x–2.15: linhas `path:sha256` em ordem localeCompare, unidas por \n. */
const agregado = (artefatos: { path: string; sha256: string }[]) =>
  createHash("sha256").update([...artefatos].sort((a, b) => a.path.localeCompare(b.path)).map((a) => `${a.path}:${a.sha256}`).join("\n")).digest("hex");

const relatorio = ler(`${CONTRACTS_DIR}/cross-registry-validation-v2.16.json`);
const m = ler(`${CONTRACTS_DIR}/contract-registry-manifest-v2.16.json`) as Manifest;
const base = ler(`${CONTRACTS_DIR}/contract-registry-manifest-v2.15.json`) as Manifest;
const v217 = ler(`${CONTRACTS_DIR}/contract-registry-manifest-v2.17.json`) as Manifest;

/** Classifica cada artefato da release; qualquer caso fora das três classes é violação. */
export function classificar(release: Manifest, anterior: Manifest) {
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
      else if (!identico && modificaveis.has(a.path) && a.source === "cr_026" && a.category === o.category) modificados.push(a.path);
      else violacoes.push(`${a.path}: difere da base 2.15 fora do change set autorizado`);
    } else if (adicionaveis.has(a.path) && a.source === "cr_026") adicionados.push(a.path);
    else violacoes.push(`${a.path}: novo sem pertencer ao change set autorizado`);
  }
  for (const p of b.keys()) if (!presentes.has(p)) violacoes.push(`${p}: herdado ausente`);
  for (const p of [...modificaveis, ...adicionaveis]) if (!presentes.has(p)) violacoes.push(`${p}: autorizado mas ausente`);
  for (const a of release.artifacts) if (a.source === "worktree_change_outside_cr") violacoes.push(`${a.path}: alteração fora de CR no digest`);
  return { herdados, modificados, adicionados, violacoes };
}

describe("cross-registry validation da Release 2.16 (histórico)", () => {
  it("o relatório gravado registra 62 checks aprovados", () => {
    expect(relatorio.validation.checks).toHaveLength(62);
    expect(relatorio.validation.checks.filter((c: { status: string }) => c.status !== "passed")).toEqual([]);
    expect(relatorio).toMatchObject({ status: "passed", releaseVersion: "2.16", changeSet: "CR-026", validation: { checksFailed: 0 } });
  });

  it("o relatório gravado é íntegro: hash igual ao do manifest v2.16 e herdado sem mudança na 2.17", () => {
    const caminho = `${CONTRACTS_DIR}/cross-registry-validation-v2.16.json`;
    const entrada = m.artifacts.find((a) => a.path === caminho)!;
    expect(sha(caminho)).toBe(entrada.sha256);
    expect(v217.artifacts.find((a) => a.path === caminho)).toEqual(entrada);
  });

  it("a validação do Freeze v1 permanece intacta", () => {
    const freeze = readFileSync(join(ROOT, `${CONTRACTS_DIR}/CONTRACT-REGISTRY-FREEZE-v1.md`), "utf8");
    const citado = freeze.match(/`([0-9a-f]{64})`/)![1];
    expect(sha(`${CONTRACTS_DIR}/cross-registry-validation.json`)).toBe(citado);
  });
});

describe("manifest v2.16 como mudança lógica sobre a 2.15", () => {
  const c = classificar(m, base);

  it("todo artefato é herdado sem mudança, modificado pelo CR-026 ou adicionado pelo CR-026", () => {
    expect(c.violacoes).toEqual([]);
    expect(c.herdados.length + c.modificados.length + c.adicionados.length).toBe(m.artifacts.length);
    expect(m.artifactClassification).toEqual({
      inheritedUnchanged: c.herdados.length, modifiedByCr026: c.modificados.length, addedByCr026: c.adicionados.length, unclassified: 0,
    });
  });

  it("a release só é ativa com todos os artefatos classificados", () => {
    expect(m.status).toBe("active");
    expect(m.artifactClassification.unclassified).toBe(0);
  });

  it("o change set autorizado é exatamente o conjunto de artefatos cr_026", () => {
    const cr = m.artifacts.filter((a) => a.source === "cr_026").map((a) => a.path).sort();
    expect([...c.modificados, ...c.adicionados].sort()).toEqual(cr);
    expect([...m.changeSet.modifiedArtifacts, ...m.changeSet.addedArtifacts].sort()).toEqual(cr);
  });

  it("guarda: hash diferente da base fora do change set, novo não autorizado ou herdado ausente são violações", () => {
    const adulterado = structuredClone(m);
    const herdado = adulterado.artifacts.find((a) => a.path === "package.json")!;
    herdado.sha256 = "0".repeat(64);
    expect(classificar(adulterado, base).violacoes).toContain("package.json: difere da base 2.15 fora do change set autorizado");

    const intruso = structuredClone(m);
    intruso.artifacts.push({ path: "docs/product/marketing-ops/13-ai-model-routing-finops.md", category: "contract_documentation", sizeBytes: 1, sha256: "1".repeat(64), source: "cr_026" });
    expect(classificar(intruso, base).violacoes).toContain("docs/product/marketing-ops/13-ai-model-routing-finops.md: novo sem pertencer ao change set autorizado");

    const fora = structuredClone(m);
    fora.artifacts.find((a) => a.path === "pnpm-lock.yaml")!.source = "worktree_change_outside_cr";
    expect(classificar(fora, base).violacoes.some((v) => v.startsWith("pnpm-lock.yaml"))).toBe(true);

    const faltando = structuredClone(m);
    faltando.artifacts = faltando.artifacts.filter((a) => a.path !== "docs/decisions/README.md");
    expect(classificar(faltando, base).violacoes).toContain("docs/decisions/README.md: herdado ausente");
  });

  it("artefatos do CR-026 conferem com o disco, salvo os modificados pelo CR-027 na Release 2.17", () => {
    const modificadosCr027 = new Set<string>(v217.changeSet.modifiedArtifacts);
    const divergentes = m.artifacts.filter((a) => a.source === "cr_026" && !modificadosCr027.has(a.path))
      .filter((a) => !existsSync(join(ROOT, a.path)) || sha(a.path) !== a.sha256 || readFileSync(join(ROOT, a.path)).length !== a.sizeBytes);
    expect(divergentes.map((a) => a.path)).toEqual([]);
    for (const p of modificadosCr027) {
      const atual = v217.artifacts.find((a) => a.path === p)!;
      expect(atual.source, p).toBe("cr_027");
    }
  });

  it("edições pendentes do worktree fora do CR ficam na release com a entrada da 2.15", () => {
    const b = new Map(base.artifacts.map((a) => [a.path, a]));
    for (const p of [
      "docs/decisions/README.md", "docs/product/marketing-ops/16-environments-release.md", "docs/product/marketing-ops/17-risks-costs.md",
      "docs/product/marketing-ops/18-technical-experiments.md", "package.json", "pnpm-lock.yaml",
      "packages/infra/test/design-agent-copy-draft-consumer.integration.test.ts", "packages/infra/test/outbox-dispatcher-cycle.integration.test.ts",
    ]) {
      expect(m.artifacts.find((a) => a.path === p), p).toEqual(b.get(p));
    }
    expect(m.artifacts.some((a) => a.path === "docs/product/marketing-ops/13-ai-model-routing-finops.md")).toBe(false);
  });

  it("common-definitions 1.0 é herdado sem mudança e 1.1 é adicionado pelo CR-026", () => {
    expect(c.herdados).toContain(`${CONTRACTS_DIR}/schemas/common-definitions.schema.json`);
    expect(c.adicionados).toContain(`${CONTRACTS_DIR}/schemas/common-definitions-1.1.schema.json`);
    expect(m.compatibility.commonDefinitions).toMatchObject({ from: "1.0", to: "1.1" });
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
      manifest: "oplyra-contract-registry-release", manifestVersion: "2.16", schemaVersion: "1.0", releaseVersion: "2.16",
      changeSet: { id: "CR-026", path: `${CONTRACTS_DIR}/changes/CR-026-product-ai-model-harness-contracts.md` },
    });
    expect(m.registryVersions).toEqual({
      agents: "1.0", permissions: "1.0", tools: "1.0", actions: "2.0", events: "1.2", errors: "1.4", handoffs: "1.0", qualityGates: "1.0", modelProfiles: "1.0",
    });
    expect(m.baseRelease).toEqual({
      version: "2.15", manifestPath: `${CONTRACTS_DIR}/contract-registry-manifest-v2.15.json`,
      manifestSha256: sha(`${CONTRACTS_DIR}/contract-registry-manifest-v2.15.json`), aggregateDigest: base.artifactSummary.aggregateDigest,
    });
    expect(m.baseFreeze).toEqual(base.baseFreeze);
    expect(agregado(base.artifacts)).toBe(base.artifactSummary.aggregateDigest);
  });

  it("exclui o próprio manifest e os anteriores do hash", () => {
    for (const v of ["2.15", "2.16"]) {
      expect(m.exclusions).toContainEqual({ path: `${CONTRACTS_DIR}/contract-registry-manifest-v${v}.json`, reason: "manifest_self_reference_is_not_hashed" });
      expect(m.artifacts.some((a) => a.path.endsWith(`contract-registry-manifest-v${v}.json`))).toBe(false);
    }
  });

  it("não autoriza runtime, provider real, saída visual nem mudança de banco", () => {
    expect(m.implementationBoundary).toMatchObject({
      realProviderEnabled: false, visualCapabilityEnabled: false, productiveFingerprintKeyLoaded: false, costLedgerPersisted: false,
    });
    expect(m.changeSet).toMatchObject({ migrationsAdded: 0, databaseChanged: false, remoteResourcesCreated: false });
  });
});
