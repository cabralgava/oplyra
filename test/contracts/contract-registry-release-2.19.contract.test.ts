// Contract Registry Release 2.19 (CR-029): reconciliação documental. A
// cross-validation é reexecutada e o manifest é conferido como mudança lógica
// sobre a Release 2.18 (verificada congelada pelo seu próprio teste). Este
// teste valida o CONTEÚDO CORRENTE reconciliado: artefatos autorizados no
// changeSet e artefatos herdados do CR-028 conferem com o disco; documentos
// operacionais (PREPARACAO-I01, VERIFICACOES, DEVELOPMENT-TOOLS, ESTADO)
// ficam fora do manifest e do digest.
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONTRACTS_DIR, runCrossRegistryValidation } from "./cross-registry-validation.ts";

type Artefato = { path: string; category: string; sizeBytes: number; sha256: string; source: string };
type Manifest = Record<string, any> & { artifacts: Artefato[] };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const ler = (p: string): Record<string, any> => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const texto = (p: string) => readFileSync(join(ROOT, p), "utf8");
const sha = (p: string) => createHash("sha256").update(readFileSync(join(ROOT, p))).digest("hex");
const agregado = (artefatos: { path: string; sha256: string }[]) =>
  createHash("sha256").update([...artefatos].sort((a, b) => a.path.localeCompare(b.path)).map((a) => `${a.path}:${a.sha256}`).join("\n")).digest("hex");

const relatorio = ler(`${CONTRACTS_DIR}/cross-registry-validation-v2.19.json`);
const m = ler(`${CONTRACTS_DIR}/contract-registry-manifest-v2.19.json`) as Manifest;
const base = ler(`${CONTRACTS_DIR}/contract-registry-manifest-v2.18.json`) as Manifest;
const FONTE = "cr_029";
const DOC16 = "docs/product/marketing-ops/16-environments-release.md";
const PLANO = "docs/product/marketing-ops/15-test-plan.md";
const PSP = "docs/harness/PREPARACAO-SUPABASE-PRODUCAO.md";
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

describe("cross-validation da Release 2.19", () => {
  const atual = runCrossRegistryValidation(ROOT);

  it("todos os checks passam", () => {
    expect(atual.checks.filter((c) => c.status !== "passed")).toEqual([]);
    expect(atual.checks.length).toBe(80);
  });

  it("o relatório gravado é exatamente o resultado reexecutado", () => {
    expect(relatorio.validation.checks).toEqual(atual.checks);
    expect(relatorio.inputs).toEqual(atual.inputs);
    expect(relatorio.counts).toEqual(atual.counts);
    expect(relatorio).toMatchObject({ status: "passed", releaseVersion: "2.19", changeSet: "CR-029", validation: { checksFailed: 0, checksRun: 80 } });
  });

  it("a validação do Freeze v1 permanece intacta", () => {
    const freeze = texto(`${CONTRACTS_DIR}/CONTRACT-REGISTRY-FREEZE-v1.md`);
    const citado = freeze.match(/`([0-9a-f]{64})`/)![1];
    expect(sha(`${CONTRACTS_DIR}/cross-registry-validation.json`)).toBe(citado);
  });
});

describe("manifest v2.19 como mudança lógica sobre a 2.18", () => {
  const c = classificar(m, base);

  it("todo artefato é herdado sem mudança, modificado pelo CR-029 ou adicionado pelo CR-029", () => {
    expect(c.violacoes).toEqual([]);
    expect(c.herdados.length + c.modificados.length + c.adicionados.length).toBe(m.artifacts.length);
    expect(m.artifactClassification).toEqual({
      inheritedUnchanged: c.herdados.length, modifiedByCr029: c.modificados.length, addedByCr029: c.adicionados.length, unclassified: 0,
    });
  });

  it("a release só é ativa com todos os artefatos classificados", () => {
    expect(m.status).toBe("active");
    expect(m.artifactClassification.unclassified).toBe(0);
  });

  it("o change set autorizado é exatamente o conjunto de artefatos cr_029", () => {
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
    expect(classificar(adulterado, base).violacoes).toContain("package.json: difere da base 2.18 fora do change set autorizado");

    for (const operacional of OPERACIONAIS) {
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

  it("artefatos do CR-029 e os herdados do CR-028 conferem com o conteúdo atual em disco", () => {
    const divergentes = m.artifacts.filter((a) => a.source === FONTE || (a.source === "cr_028" && c.herdados.includes(a.path)))
      .filter((a) => !existsSync(join(ROOT, a.path)) || sha(a.path) !== a.sha256 || readFileSync(join(ROOT, a.path)).length !== a.sizeBytes);
    expect(divergentes.map((a) => a.path)).toEqual([]);
  });

  it("classificação dos documentos governados: doc 16 modificado, plano de testes adicionado como contract_documentation", () => {
    expect(c.modificados).toContain(DOC16);
    expect(m.artifacts.find((a) => a.path === DOC16)).toMatchObject({ source: FONTE, category: "contract_documentation" });
    expect(c.modificados).toContain(PSP);
    expect(m.artifacts.find((a) => a.path === PSP)).toMatchObject({ source: FONTE, category: "environment_plan" });
    expect(m.artifactClassification).toMatchObject({ inheritedUnchanged: 436, modifiedByCr029: 4, addedByCr029: 4, unclassified: 0 });
    expect(c.adicionados).toContain(PLANO);
    expect(m.artifacts.find((a) => a.path === PLANO)).toMatchObject({ source: FONTE, category: "contract_documentation" });
    expect(c.modificados).toEqual(expect.arrayContaining(["test/contracts/cross-registry-validation.ts", "test/contracts/contract-registry-release-2.18.contract.test.ts"]));
    expect(c.adicionados).toEqual(expect.arrayContaining([
      `${CONTRACTS_DIR}/changes/CR-029-production-documentation-reconciliation.md`, `${CONTRACTS_DIR}/cross-registry-validation-v2.19.json`,
      "test/contracts/contract-registry-release-2.19.contract.test.ts",
    ]));
  });

  it("documentos operacionais ficam fora do manifest, do digest e das exclusões de hash, e são registrados como atualizados fora do conjunto", () => {
    for (const p of OPERACIONAIS) expect(m.artifacts.some((a) => a.path === p), p).toBe(false);
    expect(JSON.stringify(m.artifacts)).not.toMatch(/PREPARACAO-I01|VERIFICACOES|DEVELOPMENT-TOOLS|ESTADO\.md/);
    expect(m.changeSet.operationalDocumentsUpdatedOutsideRelease).toEqual([
      "docs/harness/PREPARACAO-I01.md", "docs/harness/VERIFICACOES.md", "docs/harness/ESTADO.md",
    ]);
    expect(m.changeSet.operationalDocumentsDeferred).toEqual(["docs/harness/DEVELOPMENT-TOOLS.md"]);
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
      manifest: "oplyra-contract-registry-release", manifestVersion: "2.19", schemaVersion: "1.0", releaseVersion: "2.19",
      changeSet: { id: "CR-029", path: `${CONTRACTS_DIR}/changes/CR-029-production-documentation-reconciliation.md` },
    });
    expect(m.registryVersions).toEqual(base.registryVersions);
    expect(m.baseRelease).toEqual({
      version: "2.18", manifestPath: `${CONTRACTS_DIR}/contract-registry-manifest-v2.18.json`,
      manifestSha256: sha(`${CONTRACTS_DIR}/contract-registry-manifest-v2.18.json`), aggregateDigest: base.artifactSummary.aggregateDigest,
    });
    expect(m.baseFreeze).toEqual(base.baseFreeze);
    expect(agregado(base.artifacts)).toBe(base.artifactSummary.aggregateDigest);
  });

  it("exclui o próprio manifest e os anteriores do hash", () => {
    for (const v of ["2.15", "2.16", "2.17", "2.18", "2.19"]) {
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

describe("conteúdo corrente reconciliado (CR-029)", () => {
  it("doc 16 descreve o CR-028 e preserva o hunk aprovado do proprietário", () => {
    const d = texto(DOC16);
    for (const t of ["SUPABASE_PROJECT_REF", "OPLYRA_ENVIRONMENT_FINGERPRINT", "TrustedDeploymentContext", "<origem>/auth/v1", "/auth/v1/.well-known/jwks.json", "CR-028"]) expect(d, t).toContain(t);
    expect(d).not.toMatch(/^\|\s*`OPLYRA_ALLOW_REMOTE`/m);
    expect(d).not.toContain("sem `OPLYRA_ALLOW_REMOTE=true`");
    // H16-1, aprovado sem alteração
    expect(d).toContain("| `OPENROUTER_API_KEY` | Não | Worker | Credencial do gateway inicial;");
    expect(d).toContain("Somente adapters diretos explicitamente habilitados; não são obrigatórias para o caminho inicial via OpenRouter");
  });

  it("PREPARACAO-SUPABASE-PRODUCAO registra a reconciliação como concluída e não a apresenta mais como adiada", () => {
    const p = texto(PSP);
    expect(p).not.toContain("Reconciliação documental adiada");
    expect(p).toContain("**Reconciliação documental concluída (CR-029, Release 2.19, 30/09/2026).**");
    expect(p).toContain("O `DEVELOPMENT-TOOLS.md` permanece como pendência operacional separada");
    expect(p).toContain("nenhuma autorização de produção foi criada");
    // restante do arquivo preservado: o parágrafo do CR-028 sobre o parsing e o requisito B-4 continuam
    expect(p).toContain("Endurecimento do parsing (CR-028, Release 2.18)");
    expect(p).toContain("Requisitos do bloqueio B-4 (atendidos pelo CR-028)");
  });

  it("TST-19 afirma recusa de qualquer endpoint remoto e da flag, sem sugerir opt-in", () => {
    const l = texto(PLANO).split("\n").find((x) => x.startsWith("| TST-19 |"))!;
    expect(l).toMatch(/`local`\/`ci` com qualquer endpoint remoto/);
    expect(l).toMatch(/presença de `OPLYRA_ALLOW_REMOTE`, com qualquer valor, também falha/);
    expect(l).not.toMatch(/opt-in|sem flag explícita|com flag/);
  });

  it("PREPARACAO-I01 preserva o aceite histórico e marca item 2 e A14 como superados", () => {
    const p = texto("docs/harness/PREPARACAO-I01.md");
    const a14 = p.split("\n").find((l) => l.startsWith("| A14 |"))!;
    expect(a14).toContain("Configuração apontando para host remoto sem flag explícita falha na inicialização");
    expect(a14).toMatch(/superado pelo CR-028/);
    expect(p).toContain("validação de configuração que falha se apontar para host remoto sem `OPLYRA_ALLOW_REMOTE=true`. *Superado pelo CR-028");
    expect(p).toContain("**Registro histórico de 15/09/2026.**"); // HP-1
  });

  it("VERIFICACOES usa a barreira Local First vigente, estados sem excesso e ponteiro para o ESTADO no lugar de contagens", () => {
    const v = texto("docs/harness/VERIFICACOES.md");
    expect(v).toContain("| Local First | Nenhum remoto como fallback; `local`/`ci` recusam qualquer endpoint remoto e a presença de `OPLYRA_ALLOW_REMOTE` falha (CR-028) |");
    expect(v).toContain("Fronteira por portas implementada no slice 1 do I-02; adapter real pendente");
    expect(v).toContain("Contratos e registry implementados desde a Release 2.16; vínculos produtivos dependem do EXP-05");
    expect(v).toContain("Implementado no harness local para allowlist, capabilities, privacidade e orçamento; integração completa ao runtime produtivo pendente");
    expect(v).toContain("Implementado e testado no harness local; provider real pendente");
    expect(v).toContain("Cost Ledger persistente implementado no Supabase local pelo CR-027; integração produtiva pendente");
    expect(v).not.toMatch(/\b(12 migrations|212 testes|87 assertions)\b|manifest v2\.15/);
    expect(v).not.toMatch(/opt-in autorizado|sem `OPLYRA_ALLOW_REMOTE=true`/);
    expect(v.match(/\]\(ESTADO\.md\)/g)?.length).toBeGreaterThanOrEqual(3);
    // HV-1 e HV-6, aprovados sem alteração
    expect(v).toContain("A fundação I-01 e seus checks locais existem;");
    expect(v).toContain("| Guard Local First do Claude | `pnpm test:harness` | Implementado; 4 cenários em 29/09/2026 |");
  });
});
