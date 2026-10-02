// Gate runner das releases do Contract Registry (CR-033 §8). Executa os gates da receita na ordem declarada,
// cada um em seu próprio processo, com filtros de teste definidos AQUI (a partir da receita, nunca por argumentos
// do agente), lê contagens de relatórios legíveis por máquina quando existem e escreve a evidência sozinho.
// Nunca reutiliza resultado de outro HEAD ou de outra árvore. Sem rede própria; só roda comandos da receita.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ReleaseError, assertGateOrder, exportSnapshot, defaultCrossValidate, gitRead, pretty, stateDirFor } from "./lib.mjs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const must = (cond, code, detail) => {
  if (!cond) throw new ReleaseError(code, detail);
};
const PNPM_SCRIPTS = new Set(["test", "test:harness", "db:reset", "db:roles", "verificar", "scan:secrets"]);
const TOKEN = /^[\p{L}\p{N}_:./=-]+$/u;
const ENV_ALLOW = ["PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "DOCKER_HOST", "COREPACK_HOME", "CI"];

/** `cmd` da receita -> argv sem shell, em gramática fechada. */
export function parseGateCommand(cmd) {
  must(typeof cmd === "string" && cmd.trim() === cmd && cmd.length > 0, "CR-GATE-COMMAND");
  const tokens = cmd.split(" ");
  must(tokens.every((t) => t.length > 0 && TOKEN.test(t) && !t.startsWith("/") && !t.split("/").includes("..")), "CR-GATE-COMMAND");
  if (tokens[0] === "git") {
    must(tokens.length === 3 && tokens[1] === "diff" && tokens[2] === "--check", "CR-GATE-COMMAND");
    return tokens;
  }
  must(tokens[0] === "pnpm" && PNPM_SCRIPTS.has(tokens[1]), "CR-GATE-COMMAND");
  for (const t of tokens.slice(2)) must(!t.startsWith("-") || t === "-t", "CR-GATE-COMMAND");
  return tokens;
}

/** Playwright só roda dentro de `pnpm verificar`: nunca como gate avulso entre as fases. */
export function assertNoStandalonePlaywright(gates) {
  for (const [id, g] of Object.entries(gates)) {
    if (id !== "verificar") must(!/playwright|test:e2e/.test(g.cmd), "CR-GATE-PLAYWRIGHT", id);
  }
}

/* --------------------------------------------------------------------------- contagens */

export function countsFromVitestJson(json, { mutationGate = false } = {}) {
  must(json && Number.isSafeInteger(json.numTotalTests) && Number.isSafeInteger(json.numPassedTests) && Array.isArray(json.testResults), "CR-GATE-COUNTS", "relatório vitest");
  const c = { files: json.testResults.length, run: json.numTotalTests, passed: json.numPassedTests };
  if (mutationGate) c.detected = json.numPassedTests;
  return c;
}

export function countsFromNodeTest(text) {
  const grab = (k) => {
    const m = new RegExp(`^(?:#|ℹ) ${k} (\\d+)\\s*$`, "m").exec(text);
    return m ? Number(m[1]) : null;
  };
  const run = grab("tests");
  const passed = grab("pass");
  must(run !== null && passed !== null, "CR-GATE-COUNTS", "relatório node:test");
  return { run, passed };
}

export function countsFromVerificar(text) {
  const num = (re) => {
    const m = re.exec(text);
    return m ? Number(m[1]) : null;
  };
  const pg = /Files=(\d+), Tests=(\d+)/.exec(text);
  const c = {
    vitestFiles: num(/Test Files\s+(\d+) passed/), vitestRun: num(/^\s*Tests\s+(\d+) passed/m), vitestPassed: num(/^\s*Tests\s+(\d+) passed/m),
    pgFiles: pg ? Number(pg[1]) : null, pgRun: pg ? Number(pg[2]) : null, pgPassed: pg ? Number(pg[2]) : null,
    e2eRun: num(/^\s*(\d+) passed/m), e2ePassed: num(/^\s*(\d+) passed/m),
  };
  must(Object.values(c).every((v) => Number.isSafeInteger(v)), "CR-GATE-COUNTS", "saída de pnpm verificar");
  return c;
}

/* ------------------------------------------------------------------------------ execução */

export function defaultRun(argv, { cwd }) {
  const env = Object.fromEntries(ENV_ALLOW.filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]]));
  const r = spawnSync(argv[0], argv.slice(1), { cwd, env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, shell: false });
  return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function measureChecks(repoRoot, recipe) {
  const tmp = mkdtempSync(join(tmpdir(), "oplyra-gates-"));
  try {
    exportSnapshot({ repoRoot, commit: recipe.snapshot.commit, paths: recipe.snapshot.exportPaths, destDir: join(tmp, "snapshot") });
    return defaultCrossValidate(join(tmp, "snapshot")).checks.length;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * Executa os gates da receita (release NÃO congelada) e escreve `.oplyra/release/<versão>/evidence.json`.
 * Portas injetáveis: `git(args)`, `run(argv, {cwd})`, `countChecks()`.
 */
export function runGates({ repoRoot, recipe, git = (a) => gitRead(repoRoot, a), run = defaultRun, countChecks = () => measureChecks(repoRoot, recipe) }) {
  must(recipe.frozen === false, "CR-FROZEN", "release congelada não executa gates");
  const dir = stateDirFor(repoRoot, recipe.release);
  must(!resolve(dir).startsWith(`${resolve(repoRoot, "test-results")}/`), "CR-STATE-DIR", "o estado não pode ficar em test-results/");
  assertGateOrder(Object.keys(recipe.gates));
  assertNoStandalonePlaywright(recipe.gates);
  for (const g of Object.values(recipe.gates)) parseGateCommand(g.cmd);

  const statePath = join(dir, "state.json");
  must(existsSync(statePath), "CR-PHASE", "execute a fase inicial antes dos gates");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  must(state.phase === "intermediate", "CR-PHASE", "os gates rodam entre a fase inicial e a final");
  const head = String(git(["rev-parse", "HEAD"])).trim();
  const tree = String(git(["rev-parse", "HEAD^{tree}"])).trim();
  must(head === recipe.snapshot.commit && state.snapshot === head, "CR-GATE-HEAD", "o HEAD não é o snapshot da receita");
  // a própria receita fica fora do commit-snapshot (ela contém o hash do snapshot): é a única entrada além das saídas tolerada como não commitada
  const outputs = new Set([recipe.changeSet.reportPath, recipe.changeSet.manifestPath, `tools/contract-release/recipes/${recipe.release}.json`]);
  for (const e of String(git(["status", "--porcelain=v1", "-z", "--untracked-files=all"])).split("\0").filter(Boolean)) {
    must(e[0] === " " || e[0] === "?", "CR-GATE-DIRTY", "alteração em staging");
    must(outputs.has(e.slice(3)), "CR-GATE-DIRTY", e.slice(3));
  }

  mkdirSync(dir, { recursive: true });
  const resultsPath = join(dir, "gates.json");
  let prior = existsSync(resultsPath) ? JSON.parse(readFileSync(resultsPath, "utf8")) : { results: [] };
  // resultado de outro HEAD/árvore nunca é reaproveitado
  prior = prior.results.filter((r) => r.head === head && r.tree === tree && r.status === "passed");
  const results = [];
  for (const [id, spec] of Object.entries(recipe.gates)) {
    const cached = prior.find((r) => r.id === id);
    if (cached) {
      results.push(cached);
      continue;
    }
    const argv = parseGateCommand(spec.cmd);
    const jsonFile = join(dir, `${id}.vitest.json`);
    const finalArgv = spec.kind === "vitest-json" ? [...argv, "--reporter=json", `--outputFile=${jsonFile}`] : argv;
    const r = run(finalArgv, { cwd: repoRoot });
    let counts = {};
    let status = r.status === 0 ? "passed" : "failed";
    if (status === "passed" && spec.kind !== "none") {
      try {
        if (spec.kind === "vitest-json") counts = countsFromVitestJson(JSON.parse(readFileSync(jsonFile, "utf8")), { mutationGate: Object.hasOwn(spec.counts, "detected") });
        else if (spec.kind === "node-test") counts = countsFromNodeTest(`${r.stdout}\n${r.stderr}`);
        else if (spec.kind === "verificar") counts = countsFromVerificar(`${r.stdout}\n${r.stderr}`);
        if (Object.hasOwn(spec.counts, "checks")) counts = { checks: countChecks(), ...counts };
      } catch {
        status = "failed";
      }
    }
    const ordered = Object.fromEntries(Object.keys(spec.counts).map((k) => [k, counts[k]]).filter(([, v]) => v !== undefined));
    results.push({ id, command: spec.cmd, exitCode: r.status, status, counts: ordered, head, tree });
    writeFileSync(resultsPath, pretty({ results }));
    if (status !== "passed") throw new ReleaseError("CR-GATE-FAILED", id);
  }
  writeFileSync(resultsPath, pretty({ results }));
  const evidence = {
    schema: recipe.evidence.schema, baseCommit: head, reportSha256: state.reportSha, intermediateManifestSha256: state.intermediateManifestSha, aggregateDigest: state.aggregateDigest,
    gates: results.map(({ id, command, exitCode, status, counts }) => ({ id, command, exitCode, status, counts })),
  };
  writeFileSync(join(dir, "evidence.json"), pretty(evidence));
  return { gates: results.length, evidence: join(dir, "evidence.json") };
}
