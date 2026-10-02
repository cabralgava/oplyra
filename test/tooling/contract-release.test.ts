// CR-033 §8/§11 — ferramenta de release do Contract Registry: reprodução byte a byte da Release 2.22 a partir da
// receita, do snapshot e da evidência histórica; snapshot, hashes, ordem de gates, Playwright e HEAD antigo.
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
// @ts-expect-error módulo .mjs sem declarações
import * as lib from "../../tools/contract-release/lib.mjs";
// @ts-expect-error módulo .mjs sem declarações
import * as gates from "../../tools/contract-release/gates.mjs";
// @ts-expect-error módulo .mjs sem declarações
import { main as cli } from "../../tools/contract-release/release.mjs";

const RAIZ = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const sha = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");
const lerJson = (p: string) => JSON.parse(readFileSync(join(RAIZ, p), "utf8"));
const codigo = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code ?? `INESPERADO:${(e as Error).message}`;
  }
  return "OK";
};
const recipe222 = () => lib.loadRecipe(RAIZ, "2.22");

function snapshotDisponivel(): boolean {
  try {
    return execFileSync("git", ["cat-file", "-t", recipe222().snapshot.commit], { cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() === "commit";
  } catch {
    return false;
  }
}
const rasa = (() => {
  try {
    return execFileSync("git", ["rev-parse", "--is-shallow-repository"], { cwd: RAIZ, encoding: "utf8" }).trim() === "true";
  } catch {
    return false;
  }
})();

describe("reprodução da Release 2.22 (congelada)", () => {
  // Em clone raso (CI com fetch-depth 1) o commit do snapshot pode não existir; use fetch-depth: 0 para que o teste rode.
  const it2 = rasa && !snapshotDisponivel() ? it.skip : it;

  it2("a evidência histórica e o gerador aposentado têm os hashes registrados", () => {
    const r = recipe222();
    expect(sha(readFileSync(join(RAIZ, r.evidence.path)))).toBe(r.evidence.sha256);
    expect(r.evidence.sha256).toMatch(/^0f46329f.*7815$/);
    expect(r.evidence.retiredGeneratorSha256).toMatch(/^91ebd4c4.*ed52$/);
    expect(r.snapshot.informationalCommits.originalReleaseCommit).toBe("545d6ea");
  });

  it2("regenera o relatório e o manifest da 2.22 byte a byte, incluindo generatedAt, e não escreve no repositório", () => {
    const r = recipe222();
    const antes = [r.changeSet.reportPath, r.changeSet.manifestPath].map((p) => sha(readFileSync(join(RAIZ, p))));
    const out = lib.reproduceFrozen({ repoRoot: RAIZ, recipe: r });
    expect(out.reportSha256).toBe("66d0da802a86315a59d86bc10123b99cde9e9a4e032d2d98609da114c349a5fc");
    expect(out.manifestSha256).toBe("2d68a995ad57f657225b2f70860b5783a78a288d1a27a316e41108d975e8cdd6");
    expect(out.aggregateDigest).toBe("6267ff67dfb7427f177dbee13b7b1370d9a836a3888aaa5fbed143fc259a98c8");
    expect(out.artifacts).toBe(490);
    expect(r.generatedAt).toBe("2026-10-01T13:50:12Z");
    const depois = [r.changeSet.reportPath, r.changeSet.manifestPath].map((p) => sha(readFileSync(join(RAIZ, p))));
    expect(depois).toEqual(antes);
  }, 180_000);

  it2("um arquivo alterado depois do snapshot não entra na release congelada", () => {
    const r = recipe222();
    const adulterar = (tar: Buffer, dest: string) => {
      execFileSync("tar", ["-x", "-f", "-", "-C", dest], { input: tar });
      writeFileSync(join(dest, "docs/harness/DESENVOLVIMENTO.md"), "conteúdo posterior ao snapshot\n");
    };
    expect(codigo(() => lib.reproduceFrozen({ repoRoot: RAIZ, recipe: r, extract: adulterar }))).toMatch(/^CR-(HASH-MISMATCH|EXPECTED)$/);
  }, 120_000);

  it2("os manifests 2.16–2.22 e os relatórios publicados permanecem intactos (hash do manifest 2.22 conferido)", () => {
    for (const v of ["2.16", "2.17", "2.18", "2.19", "2.20", "2.21", "2.22"]) {
      expect(existsSync(join(RAIZ, `docs/product/marketing-ops/contracts/contract-registry-manifest-v${v}.json`)), v).toBe(true);
    }
    expect(sha(readFileSync(join(RAIZ, recipe222().changeSet.manifestPath)))).toBe(recipe222().expected.manifestSha256);
  });
});

describe("receitas, snapshot e hashes", () => {
  it("receita congelada exige generatedAt fixo, evidência e hashes esperados; o commit do snapshot é completo", () => {
    const base = recipe222();
    expect(codigo(() => lib.validateRecipe({ ...base, generatedAt: null }))).toBe("CR-SCHEMA");
    expect(codigo(() => lib.validateRecipe({ ...base, expected: null }))).toBe("CR-SCHEMA");
    expect(codigo(() => lib.validateRecipe({ ...base, evidence: null }))).toBe("CR-SCHEMA");
    expect(codigo(() => lib.validateRecipe({ ...base, snapshot: { ...base.snapshot, commit: "7107ade" } }))).toBe("CR-SNAPSHOT-REF");
    expect(codigo(() => lib.validateRecipe({ ...base, extra: 1 }))).toBe("CR-SCHEMA");
  });

  it("snapshot indisponível falha com código fixo; caminhos inseguros são recusados", () => {
    const naoExiste = () => {
      throw new Error("fatal: Not a valid object name");
    };
    const dest = mkdtempSync(join(tmpdir(), "oplyra-snap-"));
    try {
      expect(codigo(() => lib.exportSnapshot({ repoRoot: RAIZ, commit: "0".repeat(40), paths: ["docs"], destDir: dest, git: naoExiste }))).toBe("CR-SNAPSHOT-MISSING");
      expect(codigo(() => lib.exportSnapshot({ repoRoot: RAIZ, commit: "abc", paths: ["docs"], destDir: dest }))).toBe("CR-SNAPSHOT-REF");
      expect(codigo(() => lib.exportSnapshot({ repoRoot: RAIZ, commit: "0".repeat(40), paths: ["../fora"], destDir: dest }))).toBe("CR-SNAPSHOT-PATHS");
      expect(codigo(() => lib.gitRead(RAIZ, ["commit", "-m", "x"]))).toBe("CR-GIT-NOT-ALLOWED");
      expect(codigo(() => lib.gitRead(RAIZ, ["push"]))).toBe("CR-GIT-NOT-ALLOWED");
    } finally {
      rmSync(dest, { recursive: true, force: true });
    }
  });

  /* mini-release sintética: tudo em memória/temporário, sem Git e sem validador real */
  function mini(over: { snapshot?: Record<string, string> } = {}) {
    const dir = mkdtempSync(join(tmpdir(), "oplyra-mini-"));
    const put = (p: string, t: string) => {
      mkdirSync(dirname(join(dir, p)), { recursive: true });
      writeFileSync(join(dir, p), t);
    };
    const art = (p: string, t: string) => ({ path: p, category: "x", sizeBytes: Buffer.byteLength(t), sha256: sha(t), source: "base" });
    const baseArtifacts = [art("a.txt", "A"), art("b.txt", "B")];
    const baseManifest = {
      manifest: "m", manifestVersion: "1", schemaVersion: "1", releaseVersion: "1.0", status: "active", artifacts: baseArtifacts,
      artifactSummary: { total: 2, byCategory: { x: 2 }, aggregateDigest: lib.aggregate(baseArtifacts) },
      baseFreeze: {}, registryVersions: {}, exclusions: [], implementationBoundary: {}, explicitValidationLimits: [],
    };
    const baseReport = { artifact: "r", schemaVersion: "1", stage: "s", scope: { supportingArtifacts: [] }, evidencePolicy: {}, summary: {} };
    put("a.txt", "A2"); // modificado pelo change set
    put("b.txt", "B");
    put("c.txt", "C"); // adicionado
    put("base-manifest.json", lib.pretty(baseManifest));
    put("base-report.json", lib.pretty(baseReport));
    for (const [p, t] of Object.entries(over.snapshot ?? {})) put(p, t);
    const recipe = {
      schema: lib.RECIPE_SCHEMA, release: "1.1", frozen: false,
      base: { release: "1.0", manifestPath: "base-manifest.json", manifestSha256: sha(lib.pretty(baseManifest)), reportPath: "base-report.json", reportSha256: sha(lib.pretty(baseReport)), artifactCount: 2, aggregateDigest: lib.aggregate(baseArtifacts) },
      snapshot: { commit: "1".repeat(40), exportPaths: ["a.txt"], informationalCommits: {} },
      generatedAt: "2026-01-01T00:00:00Z",
      changeSet: { source: "cr_x", modified: ["a.txt"], added: [{ path: "r.json", category: "doc" }, { path: "c.txt", category: "doc" }], reportPath: "r.json", manifestPath: "m.json" },
      crossValidation: { expectedChecks: 1, requiredIds: ["X"] }, gates: {},
      report: { changeSetId: "CR-X", appliedSlices: [], notAppliedSlices: [], supportingArtifacts: [], evidencePolicy: {}, decision: { result: "passed" } },
      manifest: { changeSet: { id: "CR-X" }, classificationKeys: { modified: "mod", added: "add" }, newLimit: "novo", replacedLimitPrefix: "zzz", replacementLimit: "r", pendingValidation: { status: "pending" }, compatibility: {} },
      validationMap: {}, evidence: null, expected: null,
    };
    const cross = () => ({ checks: [{ id: "X", status: "passed", category: "c", details: {} }], counts: {}, inputs: [] });
    return { dir, recipe, cross, put, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
  }

  it("a release é construída dos bytes do snapshot (modificado e adicionado), com os hashes do snapshot", () => {
    const m = mini();
    try {
      const out = lib.buildFromSnapshot({ recipe: m.recipe, snapshotDir: m.dir, generatedAt: m.recipe.generatedAt, crossValidate: m.cross });
      const manifest = JSON.parse(out.intermediateText);
      const a = manifest.artifacts.find((x: { path: string }) => x.path === "a.txt");
      expect(a.sha256).toBe(sha("A2"));
      expect(manifest.artifacts.map((x: { path: string }) => x.path)).toEqual(["a.txt", "b.txt", "c.txt", "r.json"]);
      expect(manifest.generatedAt).toBe("2026-01-01T00:00:00Z");
    } finally {
      m.cleanup();
    }
  });

  it("hash divergente num herdado, validação cruzada incompleta ou reprovada falham com código fixo", () => {
    const m = mini({ snapshot: { "b.txt": "B-adulterado" } });
    try {
      expect(codigo(() => lib.buildFromSnapshot({ recipe: m.recipe, snapshotDir: m.dir, generatedAt: m.recipe.generatedAt, crossValidate: m.cross }))).toBe("CR-HASH-MISMATCH");
    } finally {
      m.cleanup();
    }
    const ok = mini();
    try {
      const falha = () => ({ checks: [{ id: "X", status: "failed", category: "c", details: {} }], counts: {}, inputs: [] });
      const faltando = () => ({ checks: [{ id: "Y", status: "passed", category: "c", details: {} }], counts: {}, inputs: [] });
      expect(codigo(() => lib.buildFromSnapshot({ recipe: ok.recipe, snapshotDir: ok.dir, generatedAt: "2026-01-01T00:00:00Z", crossValidate: falha }))).toBe("CR-CROSS-VALIDATION");
      expect(codigo(() => lib.buildFromSnapshot({ recipe: ok.recipe, snapshotDir: ok.dir, generatedAt: "2026-01-01T00:00:00Z", crossValidate: faltando }))).toBe("CR-CROSS-VALIDATION");
    } finally {
      ok.cleanup();
    }
  });

  it("release congelada nunca é reescrita por buildRelease", () => {
    expect(codigo(() => lib.buildRelease({ repoRoot: RAIZ, recipe: recipe222(), phase: "intermediate" }))).toBe("CR-FROZEN");
    expect(codigo(() => gates.runGates({ repoRoot: RAIZ, recipe: recipe222() }))).toBe("CR-FROZEN");
  });

  it("receita futura não referencia saídas de receita congelada e parte de uma base congelada intacta", () => {
    const congelada = recipe222();
    const futura = (over: Record<string, unknown>, cs: Record<string, unknown> = {}) => ({
      ...congelada, release: "2.23", frozen: false, expected: null, evidence: { schema: "x/1" }, generatedAt: null,
      base: { ...congelada.base, release: "2.22", manifestPath: congelada.changeSet.manifestPath, manifestSha256: congelada.expected.manifestSha256 },
      changeSet: { ...congelada.changeSet, modified: ["docs/harness/ESTADO.md"], added: [{ path: "x/novo.md", category: "doc" }, { path: "x/r.json", category: "doc" }], reportPath: "x/r.json", manifestPath: "x/m.json", ...cs }, ...over,
    });
    expect(lib.validateRecipeSet([congelada, futura({})])).toBe(true);
    expect(codigo(() => lib.validateRecipeSet([congelada, futura({}, { modified: [congelada.changeSet.manifestPath] })]))).toBe("CR-FROZEN-OUTPUT");
    expect(codigo(() => lib.validateRecipeSet([congelada, futura({}, { added: [{ path: congelada.changeSet.reportPath, category: "doc" }, { path: "x/r.json", category: "doc" }] })]))).toBe("CR-FROZEN-OUTPUT");
    expect(codigo(() => lib.validateRecipeSet([futura({})]))).toBe("CR-BASE-NOT-FROZEN");
    expect(codigo(() => lib.validateRecipeSet([congelada, futura({ base: { ...congelada.base, release: "2.22", manifestPath: congelada.changeSet.manifestPath, manifestSha256: "0".repeat(64) } })]))).toBe("CR-BASE-MISMATCH");
  });
});

describe("evidência e gates", () => {
  const evidencia = () => lib.loadEvidence(RAIZ, recipe222());
  const estado = () => ({ reportSha: evidencia().reportSha256, intermediateManifestSha: evidencia().intermediateManifestSha256 });
  const digest = () => evidencia().aggregateDigest;

  it("a evidência histórica passa no schema fechado da receita", () => {
    const c = lib.validateEvidence(evidencia(), recipe222(), estado(), digest());
    expect(c["contract-tests"]).toEqual({ files: 18, run: 300, passed: 300 });
  });

  it("evidência de outro HEAD, comando alterado, gate faltando ou contagem divergente é rejeitada", () => {
    const base = evidencia();
    expect(codigo(() => lib.validateEvidence({ ...base, baseCommit: "deadbee" }, recipe222(), estado(), digest()))).toBe("CR-EVIDENCE-HEAD");
    expect(codigo(() => lib.validateEvidence({ ...base, aggregateDigest: "0".repeat(64) }, recipe222(), estado(), digest()))).toBe("CR-EVIDENCE-STATE");
    const comGates = (f: (g: Record<string, any>[]) => Record<string, any>[]) => ({ ...base, gates: f(structuredClone(base.gates)) });
    expect(codigo(() => lib.validateEvidence(comGates((g) => g.slice(1)), recipe222(), estado(), digest()))).toBe("CR-EVIDENCE-GATE");
    expect(codigo(() => lib.validateEvidence(comGates((g) => { g[0].command = "pnpm test"; return g; }), recipe222(), estado(), digest()))).toBe("CR-EVIDENCE-GATE");
    expect(codigo(() => lib.validateEvidence(comGates((g) => { g[2].counts.passed = 1; return g; }), recipe222(), estado(), digest()))).toBe("CR-EVIDENCE-COUNTS");
    expect(codigo(() => lib.validateEvidence(comGates((g) => { g[0].status = "failed"; return g; }), recipe222(), estado(), digest()))).toBe("CR-EVIDENCE-GATE");
  });

  it("a ordem db-reset → db-roles → verificar é obrigatória", () => {
    expect(() => lib.assertGateOrder(["db-reset", "db-roles", "verificar"])).not.toThrow();
    for (const ordem of [["db-roles", "db-reset", "verificar"], ["verificar", "db-reset", "db-roles"], ["db-reset", "verificar"], ["db-roles", "verificar"]]) {
      expect(codigo(() => lib.assertGateOrder(ordem)), ordem.join()).toBe("CR-GATE-ORDER");
    }
    const base = evidencia();
    const troca = structuredClone(base);
    const i = troca.gates.findIndex((g: any) => g.id === "db-reset");
    const j = troca.gates.findIndex((g: any) => g.id === "db-roles");
    [troca.gates[i], troca.gates[j]] = [troca.gates[j], troca.gates[i]];
    expect(codigo(() => lib.validateEvidence(troca, recipe222(), estado(), digest()))).toBe("CR-GATE-ORDER");
  });

  it("o runner recusa Playwright avulso e comandos fora da gramática fechada", () => {
    expect(() => gates.assertNoStandalonePlaywright(recipe222().gates)).not.toThrow();
    expect(codigo(() => gates.assertNoStandalonePlaywright({ ...recipe222().gates, e2e: { cmd: "pnpm test:e2e" } }))).toBe("CR-GATE-PLAYWRIGHT");
    for (const cmd of ["pnpm exec playwright test", "pnpm test --update", "pnpm test ../fora", "npm test", "pnpm test; rm", "pnpm  test", "git push", "pnpm test $(x)"]) {
      expect(codigo(() => gates.parseGateCommand(cmd)), cmd).toBe("CR-GATE-COMMAND");
    }
    expect(gates.parseGateCommand("pnpm test test/x.test.ts -t mutações")).toEqual(["pnpm", "test", "test/x.test.ts", "-t", "mutações"]);
  });

  it("contagens vêm de relatórios legíveis por máquina ou de linhas fixas, e relatórios inválidos falham", () => {
    expect(gates.countsFromVitestJson({ numTotalTests: 4, numPassedTests: 4, testResults: [{}, {}] })).toEqual({ files: 2, run: 4, passed: 4 });
    expect(gates.countsFromVitestJson({ numTotalTests: 3, numPassedTests: 3, testResults: [{}] }, { mutationGate: true })).toEqual({ files: 1, run: 3, passed: 3, detected: 3 });
    expect(codigo(() => gates.countsFromVitestJson({}))).toBe("CR-GATE-COUNTS");
    expect(gates.countsFromNodeTest("# tests 53\n# pass 53\n# fail 0\n")).toEqual({ run: 53, passed: 53 });
    expect(gates.countsFromNodeTest("ℹ tests 7\nℹ pass 7\n")).toEqual({ run: 7, passed: 7 });
    expect(codigo(() => gates.countsFromNodeTest("nada"))).toBe("CR-GATE-COUNTS");
    const saida = "Test Files  51 passed (51)\n      Tests  835 passed (835)\nFiles=8, Tests=240\n  16 passed (40s)\n";
    expect(gates.countsFromVerificar(saida)).toMatchObject({ vitestFiles: 51, vitestRun: 835, pgFiles: 8, pgRun: 240, e2eRun: 16 });
    expect(codigo(() => gates.countsFromVerificar("sem contagens"))).toBe("CR-GATE-COUNTS");
  });

  describe("runner com portas falsas", () => {
    const HEAD = "a".repeat(40);
    function ambiente(over: { head?: string; status?: string; gates?: Record<string, unknown>; phase?: string } = {}) {
      const repo = mkdtempSync(join(tmpdir(), "oplyra-gates-"));
      const recipe = {
        ...recipe222(), release: "9.99", frozen: false, expected: null, generatedAt: null, evidence: { schema: "oplyra-gen-9.99-evidence/1" },
        snapshot: { ...recipe222().snapshot, commit: HEAD },
        gates: over.gates ?? {
          "db-reset": { cmd: "pnpm db:reset", kind: "none", counts: {}, eq: [] },
          "db-roles": { cmd: "pnpm db:roles", kind: "none", counts: {}, eq: [] },
          verificar: { cmd: "pnpm verificar", kind: "none", counts: {}, eq: [] },
          links: { cmd: "pnpm test test/x.test.ts -t links", kind: "vitest-json", counts: { run: "pos", passed: "pos" }, eq: [["run", "passed"]] },
        },
      };
      const dir = join(repo, ".oplyra/release/9.99");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "state.json"), lib.pretty({ phase: over.phase ?? "intermediate", snapshot: HEAD, reportSha: "1".repeat(64), intermediateManifestSha: "2".repeat(64), aggregateDigest: "3".repeat(64), finalManifestSha: null, generatedAt: "2026-01-01T00:00:00Z" }));
      const calls: string[][] = [];
      const git = (a: string[]) => (a[0] === "rev-parse" ? (a[1] === "HEAD" ? HEAD : "tree1") : (over.status ?? ""));
      const run = (argv: string[]) => {
        calls.push(argv);
        const out = argv.find((x) => x.startsWith("--outputFile="));
        if (out) writeFileSync(out.slice("--outputFile=".length), JSON.stringify({ numTotalTests: 1, numPassedTests: 1, testResults: [{}] }));
        return { status: 0, stdout: "", stderr: "" };
      };
      return { repo, recipe, git, run, calls, dir, limpar: () => rmSync(repo, { recursive: true, force: true }) };
    }

    it("executa na ordem da receita, define o filtro de teste, escreve a evidência e grava head/tree", () => {
      const e = ambiente();
      try {
        const out = gates.runGates({ repoRoot: e.repo, recipe: e.recipe, git: e.git, run: e.run, countChecks: () => 88 });
        expect(out.gates).toBe(4);
        expect(e.calls.map((c) => c.slice(0, 3).join(" "))).toEqual(["pnpm db:reset", "pnpm db:roles", "pnpm verificar", "pnpm test test/x.test.ts"]);
        expect(e.calls[3].slice(3, 5)).toEqual(["-t", "links"]);
        expect(e.calls[3].some((a) => a.startsWith("--reporter=json"))).toBe(true);
        const ev = JSON.parse(readFileSync(join(e.dir, "evidence.json"), "utf8"));
        expect(ev.baseCommit).toBe(HEAD);
        expect(ev.gates.map((g: any) => g.id)).toEqual(["db-reset", "db-roles", "verificar", "links"]);
        expect(ev.gates[3].counts).toEqual({ run: 1, passed: 1 });
        expect(JSON.parse(readFileSync(join(e.dir, "gates.json"), "utf8")).results[0]).toMatchObject({ head: HEAD, tree: "tree1" });
      } finally {
        e.limpar();
      }
    });

    it("não reaproveita resultado de outro HEAD ou de outra árvore", () => {
      const e = ambiente();
      try {
        const velho = (head: string, tree: string) => lib.pretty({ results: ["db-reset", "db-roles", "verificar", "links"].map((id) => ({ id, command: "x", exitCode: 0, status: "passed", counts: {}, head, tree })) });
        writeFileSync(join(e.dir, "gates.json"), velho("b".repeat(40), "tree1"));
        gates.runGates({ repoRoot: e.repo, recipe: e.recipe, git: e.git, run: e.run, countChecks: () => 88 });
        expect(e.calls.length).toBe(4);
        e.calls.length = 0;
        writeFileSync(join(e.dir, "gates.json"), velho(HEAD, "outra-arvore"));
        gates.runGates({ repoRoot: e.repo, recipe: e.recipe, git: e.git, run: e.run, countChecks: () => 88 });
        expect(e.calls.length).toBe(4);
      } finally {
        e.limpar();
      }
    });

    it("recusa HEAD diferente do snapshot, árvore suja, fase errada e Playwright avulso", () => {
      const a = ambiente();
      try {
        expect(codigo(() => gates.runGates({ repoRoot: a.repo, recipe: a.recipe, git: (x: string[]) => (x[0] === "rev-parse" ? "c".repeat(40) : ""), run: a.run, countChecks: () => 88 }))).toBe("CR-GATE-HEAD");
      } finally {
        a.limpar();
      }
      const b = ambiente({ status: " M src/arquivo.ts\0" });
      try {
        expect(codigo(() => gates.runGates({ repoRoot: b.repo, recipe: b.recipe, git: b.git, run: b.run, countChecks: () => 88 }))).toBe("CR-GATE-DIRTY");
        expect(b.calls).toEqual([]);
      } finally {
        b.limpar();
      }
      const c = ambiente({ phase: "final" });
      try {
        expect(codigo(() => gates.runGates({ repoRoot: c.repo, recipe: c.recipe, git: c.git, run: c.run, countChecks: () => 88 }))).toBe("CR-PHASE");
      } finally {
        c.limpar();
      }
      const d = ambiente({ gates: { "db-reset": { cmd: "pnpm db:reset", kind: "none", counts: {}, eq: [] }, "db-roles": { cmd: "pnpm db:roles", kind: "none", counts: {}, eq: [] }, verificar: { cmd: "pnpm verificar", kind: "none", counts: {}, eq: [] }, e2e: { cmd: "pnpm test:e2e", kind: "none", counts: {}, eq: [] } } });
      try {
        expect(codigo(() => gates.runGates({ repoRoot: d.repo, recipe: d.recipe, git: d.git, run: d.run, countChecks: () => 88 }))).toBe("CR-GATE-PLAYWRIGHT");
        expect(d.calls).toEqual([]);
      } finally {
        d.limpar();
      }
    });

    it("um gate reprovado interrompe a execução e não escreve evidência", () => {
      const e = ambiente();
      try {
        const run = (argv: string[]) => ({ status: argv[1] === "db:roles" ? 1 : 0, stdout: "", stderr: "" });
        expect(codigo(() => gates.runGates({ repoRoot: e.repo, recipe: e.recipe, git: e.git, run, countChecks: () => 88 }))).toBe("CR-GATE-FAILED");
        expect(existsSync(join(e.dir, "evidence.json"))).toBe(false);
      } finally {
        e.limpar();
      }
    });
  });
});

describe("CLI, Playwright e estado", () => {
  it("a CLI aceita só as formas fechadas", () => {
    for (const args of [["reproduce", "2.22", "x"], ["reproduce", "2.22", "intermediate"], ["build", "2.22"], ["build", "2.22", "other"], ["gates", "2.22", "x"], ["x", "2.22"], ["reproduce", "../2.22"], ["reproduce", "2.22", "intermediate", "extra"]]) {
      expect(codigo(() => cli(args, RAIZ)), args.join(" ")).toMatch(/^CR-(ARGS|RECIPE-MISSING)$/);
    }
  });

  it("a saída do Playwright e o estado das releases não ficam em test-results/", () => {
    const cfg = readFileSync(join(RAIZ, "playwright.config.ts"), "utf8");
    expect(cfg).toMatch(/outputDir:\s*"\.oplyra\/playwright"/);
    expect(cfg).not.toMatch(/outputDir:[^\n]*test-results/);
    expect(lib.EVIDENCE_STATE_DIR).toBe(".oplyra/release");
    const ignore = readFileSync(join(RAIZ, ".gitignore"), "utf8").split("\n");
    expect(ignore).toContain(".oplyra/");
    expect(lerJson("tools/contract-release/recipes/2.22.json").snapshot.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it("a ferramenta usa apenas módulos node:* e Git de leitura", () => {
    for (const f of ["lib.mjs", "gates.mjs", "release.mjs", "validator-runner.mjs"]) {
      const src = readFileSync(join(RAIZ, "tools/contract-release", f), "utf8");
      const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
      for (const i of imports) expect(i.startsWith("node:") || i.startsWith("./"), `${f}: ${i}`).toBe(true);
      expect(src).not.toMatch(/git(Read)?\([^)]*\[\s*"(push|commit|checkout|reset|fetch|pull|merge|rebase|tag|add|clean|restore|switch|stash)"/);
    }
  });
});
