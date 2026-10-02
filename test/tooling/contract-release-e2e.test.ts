// CR-033 §8 — ciclo de release PONTA A PONTA com o código REAL de tools/contract-release/ (CLI, lib, gate runner).
// Tudo acontece em um mini repositório Git temporário (nunca no repositório de trabalho): release base sintética
// congelada, receita futura sintética, gates sintéticos e rápidos rodando como scripts pnpm reais, validador cruzado
// sintético exportado do snapshot. Sem rede, sem escrita fora do diretório temporário.
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-ignore módulo .mjs sem tipos
import { aggregate, pretty, sha256 } from "../../tools/contract-release/lib.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../..");
const TOOLS = join(REPO, "tools/contract-release");
const T = 180_000;
const GIT_ENV = {
  PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com",
};
const git = (cwd: string, ...args: string[]) => {
  const r = spawnSync("git", args, { cwd, env: GIT_ENV, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
};
/** Roda a CLI REAL copiada para dentro do mini repositório (ela resolve a raiz pelo próprio caminho). */
const cli = (dir: string, ...args: string[]) => {
  const r = spawnSync(process.execPath, ["tools/contract-release/release.mjs", ...args], {
    cwd: dir, encoding: "utf8", env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" },
  });
  return { status: r.status, out: r.stdout, err: r.stderr, json: r.status === 0 ? JSON.parse(r.stdout) : null };
};
const refusal = (r: { status: number | null; err: string }, code: string) => {
  expect(r.status, r.err).toBe(2);
  expect(r.err, r.err).toMatch(new RegExp(`^Oplyra contract-release: ${code}\\b`));
};
const read = (dir: string, p: string) => readFileSync(join(dir, p), "utf8");
const write = (dir: string, p: string, text: string) => {
  mkdirSync(dirname(join(dir, p)), { recursive: true });
  writeFileSync(join(dir, p), text);
};

const OUT_REPORT = "contracts/cross-registry-validation-v1.1.json";
const OUT_MANIFEST = "contracts/contract-registry-manifest-v1.1.json";
const BASE_MANIFEST = "contracts/contract-registry-manifest-v1.0.json";
const BASE_REPORT = "contracts/cross-registry-validation-v1.0.json";
const EXPORT = ["src", "docs", "test", "contracts", "package.json"];
const GATE_SCRIPT = `import { appendFileSync, existsSync, mkdirSync } from "node:fs";
const name = process.argv[2];
mkdirSync(".oplyra", { recursive: true });
appendFileSync(".oplyra/runs.log", name + "\\n");
if (existsSync(".oplyra/fail-" + name)) { console.error("falhou"); process.exit(1); }
const out = {
  harness: "ℹ tests 4\\nℹ pass 4\\n",
  verificar: " Test Files  3 passed (3)\\n      Tests  12 passed (12)\\nFiles=2, Tests=6, Result: PASS\\n  5 passed (3.1s)\\n",
}[name] ?? "";
process.stdout.write(out);
`;
const VALIDATOR = `import { readFileSync } from "node:fs";
import { join } from "node:path";
export function runCrossRegistryValidation(root) {
  const a = readFileSync(join(root, "src/a.txt"));
  return { checks: [{ id: "A", status: "passed" }, { id: "B", status: "passed" }], counts: { files: 2 }, inputs: { aBytes: a.length } };
}
`;
const GATES = {
  harness: { cmd: "pnpm test:harness", kind: "node-test", counts: { run: "pos", passed: "pos" }, eq: [["run", "passed"]] },
  "db-reset": { cmd: "pnpm db:reset", kind: "none", counts: {}, eq: [] },
  "db-roles": { cmd: "pnpm db:roles", kind: "none", counts: {}, eq: [] },
  verificar: {
    cmd: "pnpm verificar", kind: "verificar",
    counts: { vitestFiles: "pos", vitestRun: "pos", vitestPassed: "pos", pgFiles: "pos", pgRun: "pos", pgPassed: "pos", e2eRun: "pos", e2ePassed: "pos" },
    eq: [["vitestRun", "vitestPassed"], ["pgRun", "pgPassed"], ["e2eRun", "e2ePassed"]],
  },
};

const art = (path: string, text: string) => ({ path, category: "runtime_component", sizeBytes: Buffer.byteLength(text), sha256: sha256(Buffer.from(text)), source: "cr_800" });

type Repo = { dir: string; c0: string; c1: string; baseManifestText: string; baseReportText: string; recipe: any };

/** Mini repositório: C0 = release base 1.0 congelada; C1 = snapshot do change set (a.txt modificado, docs/new.md adicionado). */
function makeRepo(recipeOver: Record<string, unknown> = {}): Repo {
  const dir = mkdtempSync(join(tmpdir(), "oplyra-release-e2e-"));
  git(dir, "init", "-q", "-b", "main");
  // o pnpm cria node_modules/ e um lock vazio ao rodar os scripts dos gates; no repositório real o lock é versionado e não muda
  write(dir, ".gitignore", ".oplyra/\nnode_modules/\npnpm-lock.yaml\n");
  write(dir, "package.json", pretty({
    name: "mini", private: true, type: "module",
    scripts: { "test:harness": "node scripts/gate.mjs harness", "db:reset": "node scripts/gate.mjs db-reset", "db:roles": "node scripts/gate.mjs db-roles", verificar: "node scripts/gate.mjs verificar" },
  }));
  write(dir, "scripts/gate.mjs", GATE_SCRIPT);
  write(dir, "test/contracts/cross-registry-validation.ts", VALIDATOR);
  write(dir, "src/a.txt", "a1\n");
  write(dir, "src/b.txt", "b\n");
  const artifacts = [art("src/a.txt", "a1\n"), art("src/b.txt", "b\n")];
  const baseManifest = {
    manifest: "mini-registry", manifestVersion: "1.0", schemaVersion: "1.0", releaseVersion: "1.0", status: "active", baseFreeze: { id: "freeze" }, registryVersions: { r: "1" },
    artifacts, artifactSummary: { total: 2, byCategory: { runtime_component: 2 }, aggregateDigest: aggregate(artifacts) },
    exclusions: [{ path: BASE_MANIFEST, reason: "manifest_self_reference_is_not_hashed" }], implementationBoundary: { b: 1 }, explicitValidationLimits: ["limit-old: antigo", "limit-keep"],
  };
  const baseReport = { artifact: "mini-report", artifactVersion: "1.0", schemaVersion: "1.0", stage: "s", scope: { supportingArtifacts: [] }, evidencePolicy: { p: 1 }, summary: { s: 1 } };
  const baseManifestText = pretty(baseManifest);
  const baseReportText = pretty(baseReport);
  write(dir, BASE_MANIFEST, baseManifestText);
  write(dir, BASE_REPORT, baseReportText);
  cpSync(TOOLS, join(dir, "tools/contract-release"), { recursive: true, filter: (s) => !/\/(recipes|evidence)(\/|$)/.test(s.replace(TOOLS, "")) && !s.endsWith(".test.mjs") });
  const h = (c: string) => c.repeat(64);
  write(dir, "tools/contract-release/recipes/1.0.json", pretty({
    schema: "oplyra-contract-release-recipe/1", release: "1.0", frozen: true,
    base: { release: "0.9", manifestPath: "contracts/m0.json", manifestSha256: h("1"), reportPath: "contracts/r0.json", reportSha256: h("2"), artifactCount: 1, aggregateDigest: h("3") },
    snapshot: { commit: "0".repeat(40), exportPaths: EXPORT, informationalCommits: [] }, generatedAt: "2026-01-01T00:00:00Z",
    changeSet: { source: "cr_800", modified: [], added: [{ path: BASE_REPORT, category: "validation_report" }], reportPath: BASE_REPORT, manifestPath: BASE_MANIFEST },
    crossValidation: { expectedChecks: 2, requiredIds: ["A"] }, gates: {}, report: {}, manifest: {}, validationMap: {},
    evidence: { path: "tools/contract-release/evidence/x.json", sha256: h("4"), schema: "s", baseCommit: "0".repeat(40), retiredGeneratorSha256: null },
    expected: { reportSha256: sha256(Buffer.from(baseReportText)), manifestSha256: sha256(Buffer.from(baseManifestText)), intermediateManifestSha256: h("5"), aggregateDigest: aggregate(artifacts), artifactCount: 2, classification: {} },
  }));
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "C0 release base 1.0");
  const c0 = git(dir, "rev-parse", "HEAD");
  write(dir, "src/a.txt", "a2\n");
  write(dir, "docs/new.md", "novo\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "C1 change set");
  const c1 = git(dir, "rev-parse", "HEAD");
  const recipe = {
    schema: "oplyra-contract-release-recipe/1", release: "1.1", frozen: false,
    base: { release: "1.0", manifestPath: BASE_MANIFEST, manifestSha256: sha256(Buffer.from(baseManifestText)), reportPath: BASE_REPORT, reportSha256: sha256(Buffer.from(baseReportText)), artifactCount: 2, aggregateDigest: aggregate(artifacts) },
    snapshot: { commit: c1, exportPaths: EXPORT, informationalCommits: [] }, generatedAt: null,
    changeSet: { source: "cr_900", modified: ["src/a.txt"], added: [{ path: "docs/new.md", category: "documentation" }, { path: OUT_REPORT, category: "validation_report" }], reportPath: OUT_REPORT, manifestPath: OUT_MANIFEST },
    crossValidation: { expectedChecks: 2, requiredIds: ["A", "B"] }, gates: GATES,
    report: { changeSetId: "CR-900", appliedSlices: ["S1"], notAppliedSlices: [], supportingArtifacts: ["docs/new.md"], evidencePolicy: { note: "e2e" }, decision: "approved" },
    manifest: {
      changeSet: { id: "CR-900", crStatus: "approved" }, newLimit: "limit-new", replacedLimitPrefix: "limit-old", replacementLimit: "limit-replaced", pendingValidation: { status: "pending" },
      classificationKeys: { modified: "modifiedByCr900", added: "addedByCr900" }, compatibility: { c: 1 },
    },
    validationMap: { harnessRun: { $count: ["harness", "run"] }, vitestPassed: { $count: ["verificar", "vitestPassed"] }, greenSuite: { $eq: ["verificar", "vitestRun", 12] } },
    evidence: { path: null, sha256: null, schema: "oplyra-mini-evidence/1", baseCommit: null, retiredGeneratorSha256: null }, expected: null, ...recipeOver,
  };
  write(dir, "tools/contract-release/recipes/1.1.json", pretty(recipe));
  return { dir, c0, c1, baseManifestText, baseReportText, recipe };
}
const setRecipe = (r: Repo, over: Record<string, unknown>) => {
  r.recipe = { ...r.recipe, ...over };
  write(r.dir, "tools/contract-release/recipes/1.1.json", pretty(r.recipe));
};
const intermediate = (r: Repo) => {
  const x = cli(r.dir, "build", "1.1", "intermediate");
  expect(x.status, x.err).toBe(0);
  return x;
};
const runsLog = (dir: string) => (existsSync(join(dir, ".oplyra/runs.log")) ? read(dir, ".oplyra/runs.log").trim().split("\n") : []);
const evidencePath = ".oplyra/release/1.1/evidence.json";

describe("ciclo de release ponta a ponta (CLI real, mini repositório, gates sintéticos)", () => {
  it("intermediate → gates → final → congelamento → reprodução byte a byte; release congelada nunca é reescrita", { timeout: T }, () => {
    const r = makeRepo();
    const { dir } = r;

    // fase inicial: lê SÓ do snapshot C1, grava relatório + manifest intermediário e o estado em .oplyra/release (git-ignorado)
    const i1 = intermediate(r);
    const manifest1 = JSON.parse(read(dir, OUT_MANIFEST));
    expect(manifest1.validation).toEqual({ status: "pending" });
    expect(manifest1.artifacts.map((a: any) => a.path)).toEqual([OUT_REPORT, "docs/new.md", "src/a.txt", "src/b.txt"]);
    expect(manifest1.artifacts.find((a: any) => a.path === "src/a.txt").sha256).toBe(sha256(Buffer.from("a2\n")));
    expect(manifest1.artifactClassification).toEqual({ inheritedUnchanged: 1, modifiedByCr900: 1, addedByCr900: 2, unclassified: 0 });
    expect(manifest1.explicitValidationLimits).toEqual(["limit-new", "limit-replaced", "limit-keep"]);
    const state = JSON.parse(read(dir, ".oplyra/release/1.1/state.json"));
    expect(state).toMatchObject({ phase: "intermediate", snapshot: r.c1, reportSha: i1.json.reportSha256 });
    expect(git(dir, "check-ignore", ".oplyra/release/1.1/state.json")).toBe(".oplyra/release/1.1/state.json");
    expect(existsSync(join(dir, "test-results"))).toBe(false);
    // reexecutar a fase inicial é idempotente (mesmos bytes, mesmo generatedAt)
    const reportBytes = read(dir, OUT_REPORT);
    const manifestBytes = read(dir, OUT_MANIFEST);
    intermediate(r);
    expect(read(dir, OUT_REPORT)).toBe(reportBytes);
    expect(read(dir, OUT_MANIFEST)).toBe(manifestBytes);

    // gates sintéticos: ordem db-reset → db-roles → verificar, cada um em seu processo; evidência escrita pelo runner
    const g = cli(dir, "gates", "1.1");
    expect(g.status, g.err).toBe(0);
    expect(runsLog(dir)).toEqual(["harness", "db-reset", "db-roles", "verificar"]);
    const ev = JSON.parse(read(dir, evidencePath));
    expect(ev.baseCommit).toBe(r.c1);
    expect(ev.gates.map((x: any) => x.id)).toEqual(["harness", "db-reset", "db-roles", "verificar"]);
    expect(ev.gates[3].counts).toEqual({ vitestFiles: 3, vitestRun: 12, vitestPassed: 12, pgFiles: 2, pgRun: 6, pgPassed: 6, e2eRun: 5, e2ePassed: 5 });
    // a segunda execução reaproveita só resultados do MESMO HEAD e árvore: nada reroda
    expect(cli(dir, "gates", "1.1").status).toBe(0);
    expect(runsLog(dir)).toHaveLength(4);

    // fase final: valida a evidência, resolve a validação e troca o manifest
    const f = cli(dir, "build", "1.1", "final");
    expect(f.status, f.err).toBe(0);
    const manifest2 = JSON.parse(read(dir, OUT_MANIFEST));
    expect(manifest2.validation).toEqual({ harnessRun: 4, vitestPassed: 12, greenSuite: true });
    expect(read(dir, OUT_REPORT)).toBe(reportBytes);
    expect(manifest2.artifactSummary.aggregateDigest).toBe(manifest1.artifactSummary.aggregateDigest);
    expect(JSON.parse(read(dir, ".oplyra/release/1.1/state.json"))).toMatchObject({ phase: "final", finalManifestSha: f.json.manifestSha256 });
    expect(cli(dir, "build", "1.1", "intermediate").status).toBe(2); // a fase inicial não roda depois da final
    expect(existsSync(join(dir, "test-results"))).toBe(false);

    // congelamento: commit C2 publica relatório + manifest final; a receita passa a frozen com generatedAt e hashes esperados
    const evText = read(dir, evidencePath);
    write(dir, "tools/contract-release/evidence/gen-1.1-evidence.json", evText);
    git(dir, "add", OUT_REPORT, OUT_MANIFEST, "tools/contract-release/evidence");
    git(dir, "commit", "-q", "-m", "C2 publica a release 1.1");
    const c2 = git(dir, "rev-parse", "HEAD");
    const st = JSON.parse(read(dir, ".oplyra/release/1.1/state.json"));
    const frozen = {
      ...r.recipe, frozen: true, generatedAt: st.generatedAt, snapshot: { commit: c2, exportPaths: EXPORT, informationalCommits: [r.c1] },
      evidence: { path: "tools/contract-release/evidence/gen-1.1-evidence.json", sha256: sha256(Buffer.from(evText)), schema: r.recipe.evidence.schema, baseCommit: r.c1, retiredGeneratorSha256: null },
      expected: {
        reportSha256: st.reportSha, manifestSha256: st.finalManifestSha, intermediateManifestSha256: st.intermediateManifestSha, aggregateDigest: st.aggregateDigest,
        artifactCount: 4, classification: manifest2.artifactClassification,
      },
    };
    write(dir, "tools/contract-release/recipes/1.1.json", pretty(frozen));

    // reprodução independente: reconstrói do snapshot C2 e exige igualdade byte a byte com o publicado
    const rep = cli(dir, "reproduce", "1.1");
    expect(rep.status, rep.err).toBe(0);
    expect(rep.json).toEqual({ release: "1.1", reportSha256: sha256(Buffer.from(read(dir, OUT_REPORT))), manifestSha256: sha256(Buffer.from(read(dir, OUT_MANIFEST))), aggregateDigest: st.aggregateDigest, artifacts: 4 });
    // release congelada nunca é reescrita nem reexecuta gates
    refusal(cli(dir, "build", "1.1", "intermediate"), "CR-FROZEN");
    refusal(cli(dir, "build", "1.1", "final"), "CR-FROZEN");
    refusal(cli(dir, "gates", "1.1"), "CR-FROZEN");
    // adulterar a expectativa congelada ou apontar para um snapshot ausente falha com código fixo
    write(dir, "tools/contract-release/recipes/1.1.json", pretty({ ...frozen, expected: { ...frozen.expected, reportSha256: "9".repeat(64) } }));
    refusal(cli(dir, "reproduce", "1.1"), "CR-EXPECTED");
    write(dir, "tools/contract-release/recipes/1.1.json", pretty({ ...frozen, snapshot: { ...frozen.snapshot, commit: "7".repeat(40) } }));
    refusal(cli(dir, "reproduce", "1.1"), "CR-SNAPSHOT-MISSING");
    // um arquivo publicado que difere do snapshot recusa a reprodução
    write(dir, "tools/contract-release/recipes/1.1.json", pretty(frozen));
    write(dir, "contracts/cross-registry-validation-v1.1.json", `${read(dir, OUT_REPORT)} `);
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "C3 adultera o relatório publicado");
    write(dir, "tools/contract-release/recipes/1.1.json", pretty({ ...frozen, snapshot: { ...frozen.snapshot, commit: git(dir, "rev-parse", "HEAD") } }));
    refusal(cli(dir, "reproduce", "1.1"), "CR-EXPECTED");
  });

  it("arquivo alterado depois do snapshot não entra na release; gates recusam outro HEAD e árvore suja", { timeout: T }, () => {
    const r = makeRepo();
    const { dir } = r;
    intermediate(r);
    const before = { report: read(dir, OUT_REPORT), manifest: read(dir, OUT_MANIFEST) };
    // alteração NÃO commitada e commit posterior ao snapshot
    write(dir, "src/a.txt", "a3 depois do snapshot\n");
    write(dir, "docs/extra.md", "extra\n");
    intermediate(r);
    expect(read(dir, OUT_REPORT)).toBe(before.report);
    expect(read(dir, OUT_MANIFEST)).toBe(before.manifest);
    git(dir, "add", "src/a.txt", "docs/extra.md");
    git(dir, "commit", "-q", "-m", "C3 depois do snapshot");
    intermediate(r);
    const m = JSON.parse(read(dir, OUT_MANIFEST));
    expect(m.artifacts.find((a: any) => a.path === "src/a.txt").sha256).toBe(sha256(Buffer.from("a2\n")));
    expect(m.artifacts.some((a: any) => a.path === "docs/extra.md")).toBe(false);
    expect(read(dir, OUT_MANIFEST)).toBe(before.manifest);
    // gates: HEAD já não é o snapshot da receita
    refusal(cli(dir, "gates", "1.1"), "CR-GATE-HEAD");
    expect(runsLog(dir)).toEqual([]);

    // mesma proteção com HEAD correto e árvore suja: alteração rastreada fora das saídas recusa
    const s = makeRepo();
    intermediate(s);
    write(s.dir, "src/b.txt", "alterado\n");
    refusal(cli(s.dir, "gates", "1.1"), "CR-GATE-DIRTY");
    git(s.dir, "checkout", "-q", "--", "src/b.txt");
    write(s.dir, "scripts/intruso.mjs", "x\n");
    refusal(cli(s.dir, "gates", "1.1"), "CR-GATE-DIRTY");
    expect(runsLog(s.dir)).toEqual([]);
  });

  it("evidência de outro HEAD, adulterada, não canônica ou ausente é rejeitada na fase final", { timeout: T }, () => {
    const r = makeRepo();
    const { dir } = r;
    refusal(cli(dir, "build", "1.1", "final"), "CR-PHASE");
    refusal(cli(dir, "gates", "1.1"), "CR-PHASE");
    intermediate(r);
    refusal(cli(dir, "build", "1.1", "final"), "CR-EVIDENCE-MISSING");
    expect(cli(dir, "gates", "1.1").status).toBe(0);
    const good = read(dir, evidencePath);
    const ev = JSON.parse(good);
    const tryEvidence = (mutate: (e: any) => void, code: string, raw?: string) => {
      const e = structuredClone(ev);
      mutate(e);
      write(dir, evidencePath, raw ?? pretty(e));
      refusal(cli(dir, "build", "1.1", "final"), code);
    };
    tryEvidence((e) => { e.baseCommit = r.c0; }, "CR-EVIDENCE-HEAD");
    tryEvidence((e) => { e.reportSha256 = "0".repeat(64); }, "CR-EVIDENCE-STATE");
    tryEvidence((e) => { e.aggregateDigest = "0".repeat(64); }, "CR-EVIDENCE-STATE");
    tryEvidence((e) => { e.gates[3].counts.vitestRun = 0; }, "CR-EVIDENCE-COUNTS");
    tryEvidence((e) => { e.gates[3].counts.vitestPassed = 11; }, "CR-EVIDENCE-COUNTS");
    tryEvidence((e) => { e.gates[1].exitCode = 1; e.gates[1].status = "failed"; }, "CR-EVIDENCE-GATE");
    tryEvidence((e) => { e.gates.pop(); }, "CR-EVIDENCE-GATE");
    tryEvidence((e) => { e.gates[0].command = "pnpm test:e2e"; }, "CR-EVIDENCE-GATE");
    tryEvidence((e) => { [e.gates[1], e.gates[2]] = [e.gates[2], e.gates[1]]; }, "CR-GATE-ORDER");
    tryEvidence(() => {}, "CR-EVIDENCE-SCHEMA", JSON.stringify(ev));
    write(dir, evidencePath, "{ não é json");
    expect(cli(dir, "build", "1.1", "final").status).toBe(2);
    // restaurada, a mesma evidência passa: nada acima corrompeu o estado
    write(dir, evidencePath, good);
    const ok = cli(dir, "build", "1.1", "final");
    expect(ok.status, ok.err).toBe(0);
  });

  it("gate reprovado interrompe sem evidência e retoma sem reexecutar os gates já aprovados", { timeout: T }, () => {
    const r = makeRepo();
    const { dir } = r;
    intermediate(r);
    write(dir, ".oplyra/fail-verificar", "");
    refusal(cli(dir, "gates", "1.1"), "CR-GATE-FAILED verificar");
    expect(existsSync(join(dir, evidencePath))).toBe(false);
    expect(runsLog(dir)).toEqual(["harness", "db-reset", "db-roles", "verificar"]);
    refusal(cli(dir, "build", "1.1", "final"), "CR-EVIDENCE-MISSING");
    const results = JSON.parse(read(dir, ".oplyra/release/1.1/gates.json")).results;
    expect(results.map((x: any) => [x.id, x.status])).toEqual([["harness", "passed"], ["db-reset", "passed"], ["db-roles", "passed"], ["verificar", "failed"]]);
    // corrige e retoma: só `verificar` reroda
    rmSync(join(dir, ".oplyra/fail-verificar"));
    const retry = cli(dir, "gates", "1.1");
    expect(retry.status, retry.err).toBe(0);
    expect(runsLog(dir)).toEqual(["harness", "db-reset", "db-roles", "verificar", "verificar"]);
    expect(cli(dir, "build", "1.1", "final").status).toBe(0);
  });

  it("ordem dos gates, Playwright avulso e comandos fora da gramática são recusados antes de rodar qualquer coisa", { timeout: T }, () => {
    const order = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, GATES[id as keyof typeof GATES]]));
    for (const ids of [["verificar", "db-reset", "db-roles"], ["db-roles", "db-reset", "verificar"], ["db-reset", "verificar", "db-roles"], ["harness", "verificar"], ["db-reset", "db-roles"]]) {
      const r = makeRepo({ gates: order(ids) });
      intermediate(r);
      refusal(cli(r.dir, "gates", "1.1"), "CR-GATE-ORDER");
      expect(runsLog(r.dir), ids.join(",")).toEqual([]);
    }
    const ok = makeRepo({ gates: order(["db-reset", "db-roles", "verificar", "harness"]) });
    intermediate(ok);
    expect(cli(ok.dir, "gates", "1.1").status).toBe(0);
    expect(runsLog(ok.dir)).toEqual(["db-reset", "db-roles", "verificar", "harness"]);

    for (const cmd of ["pnpm test:e2e", "pnpm exec playwright test", "pnpm playwright test"]) {
      const g: Record<string, unknown> = { ...GATES, e2e: { cmd, kind: "none", counts: {}, eq: [] } };
      const r = makeRepo({ gates: { "db-reset": g["db-reset"], "db-roles": g["db-roles"], e2e: g.e2e, verificar: g.verificar } });
      intermediate(r);
      refusal(cli(r.dir, "gates", "1.1"), "CR-GATE-PLAYWRIGHT");
      expect(runsLog(r.dir)).toEqual([]);
    }
    for (const cmd of ["rm -rf /", "pnpm add left-pad", "pnpm test --reporter=json", "git push", "pnpm test ../x", "node scripts/gate.mjs harness"]) {
      const r = makeRepo({ gates: { ...GATES, harness: { ...GATES.harness, cmd } } });
      intermediate(r);
      refusal(cli(r.dir, "gates", "1.1"), "CR-GATE-COMMAND");
      expect(runsLog(r.dir)).toEqual([]);
    }
  });

  it("receita futura não referencia saídas de receita congelada, parte de base congelada e íntegra, e não troca a base", { timeout: T }, () => {
    // saída da release base congelada como saída da futura
    let r = makeRepo({ changeSet: { source: "cr_900", modified: [], added: [{ path: BASE_REPORT, category: "validation_report" }], reportPath: BASE_REPORT, manifestPath: OUT_MANIFEST } });
    refusal(cli(r.dir, "build", "1.1", "intermediate"), "CR-FROZEN-OUTPUT");
    r = makeRepo({ changeSet: { source: "cr_900", modified: [], added: [{ path: OUT_REPORT, category: "validation_report" }], reportPath: OUT_REPORT, manifestPath: BASE_MANIFEST } });
    refusal(cli(r.dir, "build", "1.1", "intermediate"), "CR-FROZEN-OUTPUT");
    refusal(cli(r.dir, "gates", "1.1"), "CR-FROZEN-OUTPUT");
    // base não congelada
    r = makeRepo();
    setRecipe(r, { base: { ...r.recipe.base, release: "0.8" } });
    refusal(cli(r.dir, "build", "1.1", "intermediate"), "CR-BASE-NOT-FROZEN");
    // hash da base diferente do manifest congelado
    r = makeRepo();
    setRecipe(r, { base: { ...r.recipe.base, manifestSha256: "f".repeat(64) } });
    refusal(cli(r.dir, "build", "1.1", "intermediate"), "CR-BASE-MISMATCH");
    // argumentos fora da gramática fechada e receita ausente
    r = makeRepo();
    refusal(cli(r.dir, "build", "9.9", "intermediate"), "CR-RECIPE-MISSING");
    refusal(cli(r.dir, "build", "1.1", "intermediate", "extra"), "CR-ARGS");
    refusal(cli(r.dir, "build", "1.1", "meio"), "CR-ARGS");
    refusal(cli(r.dir, "publish", "1.1"), "CR-ARGS");
    refusal(cli(r.dir, "gates", "1.1", "x"), "CR-ARGS");
    // receita fora do schema fechado
    setRecipe(r, { extra: true });
    refusal(cli(r.dir, "build", "1.1", "intermediate"), "CR-SCHEMA");
    // o snapshot define o conteúdo: base herdada divergente no snapshot recusa
    r = makeRepo();
    git(r.dir, "checkout", "-q", "-b", "outro", r.c0);
    write(r.dir, "src/b.txt", "b adulterado\n");
    write(r.dir, "src/a.txt", "a2\n");
    write(r.dir, "docs/new.md", "novo\n");
    git(r.dir, "add", "-A");
    git(r.dir, "commit", "-q", "-m", "C1b herdado alterado");
    setRecipe(r, { snapshot: { ...r.recipe.snapshot, commit: git(r.dir, "rev-parse", "HEAD") } });
    refusal(cli(r.dir, "build", "1.1", "intermediate"), "CR-HASH-MISMATCH");
  });

  it("estado e evidência ficam só em .oplyra/release/ (git-ignorado), nunca em test-results/, e nada vaza para o repositório de trabalho", { timeout: T }, () => {
    const r = makeRepo();
    expect(r.dir.startsWith(tmpdir()) || r.dir.startsWith(realpathSync(tmpdir()))).toBe(true);
    intermediate(r);
    expect(cli(r.dir, "gates", "1.1").status).toBe(0);
    expect(cli(r.dir, "build", "1.1", "final").status).toBe(0);
    expect(readdirSync(join(r.dir, ".oplyra/release/1.1")).sort()).toEqual(["evidence.json", "gates.json", "state.json"]);
    expect(existsSync(join(r.dir, "test-results"))).toBe(false);
    for (const f of ["state.json", "gates.json", "evidence.json"]) expect(git(r.dir, "check-ignore", `.oplyra/release/1.1/${f}`)).toContain(f);
    expect(git(r.dir, "status", "--porcelain=v1", "--untracked-files=all")).not.toMatch(/\.oplyra/);
    // as saídas ficaram no mini repositório; o repositório de trabalho nunca é o cwd da CLI deste teste
    expect(existsSync(join(REPO, "contracts/contract-registry-manifest-v1.1.json"))).toBe(false);
    expect(existsSync(join(REPO, ".oplyra/release/1.1"))).toBe(false);
  });
});
