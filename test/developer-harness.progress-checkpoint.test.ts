// @ts-nocheck — control plane (.mjs sem tipos).
// CENÁRIO 3 — checkpoint rotineiro sem alterar documentos de política (INTEGRACAO-PR11-E-PERFIS §1, §10).
// Componentes REAIS: deriveMissionRecord (autorização derivada), pathAllowedByRecord (usado pelo wrapper git:stage e pelo decide),
// codexConfig e nativeAgent (worker Codex), buildPrompt e decide. SIMULADOS: o processo Codex (escreve arquivos num repositório Git
// sintético em diretório temporário), os wrappers de entrega (registram as chamadas, sem Git remoto nem GitHub) e a observação do PR.
// Autorizações e registros são gravados só em diretórios temporários; nada em ~/.oplyra.
import { afterAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { evidencia, importarReal, observacao, verificarMutacao, verdes, type Mutacao, type Propriedades } from "./developer-harness.mutacao";

const BASE_SHA = "b".repeat(40);
const HEAD_SHA = "d".repeat(40);
const PROPRIO = "docs/progresso/ms-101.md";
const OUTRO = "docs/progresso/ms-102.md";
const POLITICA = ["docs/harness/ESTADO.md", "docs/harness/AUTONOMOUS-BUILD.md", "docs/decisions/ADR-0099-sintetico.md"];
const MISSAO = { id: "ms-101", type: "test", title: "Cobrir caso de borda", goal: "Acrescentar um teste de borda sintético.", paths: ["packages/core/test/"], dependsOn: [], acceptance: ["o teste passa"] };
const ORCAMENTO = { wallClockSeconds: 3600, iterations: 5, logReads: 10 };

async function derivar(imp, { escopo = ["packages/core/test/"], missao = MISSAO } = {}) {
  const { buildStanding, deriveMissionRecord } = await imp("claude-standing.mjs");
  const standing = buildStanding({ paths: escopo, missionBudgets: ORCAMENTO, confirmation: "AUTORIZAR-DESENVOLVIMENTO-CONTINUO" });
  return deriveMissionRecord({ standing, standingSha256: "e".repeat(64), mission: missao, baseSha: BASE_SHA });
}

/* ------------------------------------------------------- repositório sintético */

const git = (cwd, args) => {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env: { PATH: process.env.PATH, HOME: cwd, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_AUTHOR_NAME: "fixture", GIT_AUTHOR_EMAIL: "fixture@example.test", GIT_COMMITTER_NAME: "fixture", GIT_COMMITTER_EMAIL: "fixture@example.test" } });
  if (r.status !== 0) throw new Error(`git ${args[0]}: ${r.stderr}`);
  return r;
};
const hash = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

function repositorio() {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "oplyra-checkpoint-")));
  const escrever = (rel, txt) => {
    fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
    fs.writeFileSync(path.join(repo, rel), txt);
  };
  escrever(".gitignore", ".oplyra/\n");
  escrever("docs/progresso/README.md", "um arquivo por missão\n");
  escrever("packages/core/test/base.test.ts", "// base\n");
  for (const p of POLITICA) escrever(p, `política sintética: ${p}\n`);
  git(repo, ["init", "-q", "-b", "main"]);
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "-q", "-m", "base sintética"]);
  return { repo, escrever };
}

/**
 * Executa o worker REAL (nativeAgent) com um processo Codex SIMULADO que aplica `acao(repo)`. Devolve o resultado do worker, as chamadas
 * aos wrappers de entrega (simulados) e os hashes dos documentos de política antes/depois.
 */
async function rodarWorker(imp, acao) {
  const { repo, escrever } = repositorio();
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "oplyra-home-")));
  const recordDir = path.join(home, ".oplyra", "delivery");
  const record = await derivar(imp);
  const { writeRecord } = await imp("claude-delivery-record.mjs");
  writeRecord(record, { recordDir });
  const { nativeAgent } = await imp("codex-agent.mjs");
  const antes = Object.fromEntries(POLITICA.map((p) => [p, hash(path.join(repo, p))]));
  const chamadas = [];
  let prompt = "";
  const agent = nativeAgent({
    repoRoot: repo, home, recordDir,
    git: (args) => spawnSync("git", args, { cwd: repo, encoding: "utf8" }),
    wrapper: async (verb, args) => {
      chamadas.push([verb, args]);
      return { code: 0, out: "" };
    },
    processAgent: async (input) => {
      prompt = input.prompt;
      acao({ repo, escrever });
      fs.writeFileSync(input.outputFile, JSON.stringify({ status: "completed", title: "test: cobrir caso de borda", commitMessage: "test: cobrir caso de borda", body: "Resultado registrado no progresso da missão.", diagnosis: "" }));
      return { exitCode: 0, stopped: false, timedOut: false };
    },
  });
  const promptFile = path.join(home, "prompt.md");
  fs.writeFileSync(promptFile, "missão sintética\n");
  const res = await agent({ ref: MISSAO.id, kind: "implement", promptFile, timeoutSeconds: 60, shouldStop: () => false });
  const depois = Object.fromEntries(POLITICA.map((p) => [p, fs.existsSync(path.join(repo, p)) && !fs.lstatSync(path.join(repo, p)).isSymbolicLink() ? hash(path.join(repo, p)) : null]));
  return { res, chamadas, antes, depois, prompt, record, repo };
}
const staged = (chamadas) => chamadas.filter(([v]) => v === "stage").flatMap(([, a]) => a).sort();
const recusadoPeloWorker = (r) => {
  expect(r.res.exitCode).toBe(2);
  expect(r.res.refusal).toBe("codex-adapter-blocked");
  expect(staged(r.chamadas)).toEqual([]);
  expect(r.chamadas.map(([v]) => v)).not.toContain("push");
};

const PROPS: Propriedades = {
  async "derivacao-permitida"(imp) {
    const record = await derivar(imp);
    expect(record.paths).toEqual(["packages/core/test/", PROPRIO]);
    const { pathAllowedByRecord, validateRecord } = await imp("claude-delivery-record.mjs");
    expect(() => validateRecord(record)).not.toThrow();
    expect(pathAllowedByRecord(PROPRIO, record)).toBe(true);
    for (const p of [OUTRO, ...POLITICA, "docs/progresso/README.md"]) expect(pathAllowedByRecord(p, record), p).toBe(false);
    const { classifyChange } = await imp("claude-risk.mjs");
    expect(classifyChange([PROPRIO, "packages/core/test/borda.test.ts"]).risk).toBe("routine");
  },
  async "derivacao-recusa-progresso-alheio"(imp) {
    // mesmo com o diretório docs/progresso/ na autorização contínua, a missão só recebe o próprio arquivo; o escopo não é ampliado
    const amplo = ["packages/core/test/", "docs/progresso/"];
    for (const paths of [["packages/core/test/", OUTRO], ["packages/core/test/", "docs/progresso/"]]) {
      const code = await derivar(imp, { escopo: amplo, missao: { ...MISSAO, paths } }).then(() => "OK", (e) => e.code);
      expect(code, paths.join(",")).toBe("ST-SCOPE");
    }
    for (const p of POLITICA) {
      const code = await derivar(imp, { missao: { ...MISSAO, paths: ["packages/core/test/", p] } }).then(() => "OK", (e) => e.code);
      expect(["ST-SCOPE", "ST-RISK"], p).toContain(code);
    }
    // a missão que declara o próprio arquivo não o duplica nem precisa de escopo extra
    const proprio = await derivar(imp, { missao: { ...MISSAO, paths: ["packages/core/test/", PROPRIO] } });
    expect(proprio.paths).toEqual(["packages/core/test/", PROPRIO]);
  },
  async "registro-vinculo-progresso"(imp) {
    const { buildRecord, pathAllowedByRecord } = await imp("claude-delivery-record.mjs");
    // registro emitido com o DIRETÓRIO docs/progresso/: ainda assim só o arquivo da própria referência
    const amplo = buildRecord({ ref: "ms-101", branch: "agent/test/ms-101-borda", baseSha: BASE_SHA, paths: ["docs/progresso/", "packages/core/test/"], confirmation: "standing:0123456789abcdef", budgets: ORCAMENTO });
    expect(pathAllowedByRecord(PROPRIO, amplo)).toBe(true);
    expect(pathAllowedByRecord(OUTRO, amplo)).toBe(false);
    expect(pathAllowedByRecord("docs/progresso/README.md", amplo)).toBe(false);
  },
  async "registro-travessia"(imp) {
    const { pathAllowedByRecord } = await imp("claude-delivery-record.mjs");
    const record = await derivar(imp);
    for (const p of ["packages/core/test/../../../docs/harness/ESTADO.md", `${PROPRIO}/../../harness/ESTADO.md`, `./${PROPRIO}`, `/${PROPRIO}`, "packages/core/test/./x.test.ts", "packages/core/test//x.test.ts"]) {
      expect(pathAllowedByRecord(p, record), p).toBe(false);
    }
  },
  async "codex-config"(imp) {
    const { codexConfig } = await imp("codex-agent.mjs");
    const { repo } = repositorio();
    const cfg = codexConfig(repo, await derivar(imp)).join("\n");
    expect(cfg).toContain(`"${repo}/${PROPRIO}"="write"`);
    expect(cfg).not.toContain(`"${repo}/docs/progresso/"="write"`);
    expect(cfg).not.toContain(`"${repo}/${OUTRO}"="write"`);
    expect(cfg).toContain(`"${repo}/docs/harness"="read"`);
  },
  async "worker-permitido"(imp) {
    const r = await rodarWorker(imp, ({ escrever }) => {
      escrever("packages/core/test/borda.test.ts", "// novo teste\n");
      escrever(PROPRIO, "# ms-101\n\n- pnpm test packages/core/test: verde (simulado)\n");
    });
    expect(r.res).toMatchObject({ exitCode: 0 });
    expect(staged(r.chamadas)).toEqual([PROPRIO, "packages/core/test/borda.test.ts"]);
    expect(r.chamadas.map(([v]) => v)).toEqual(expect.arrayContaining(["stage", "commit", "push", "pr-create"]));
    expect(r.depois).toEqual(r.antes); // ESTADO.md e demais documentos de política idênticos à base
    expect(r.prompt).toContain(PROPRIO);
    expect(r.prompt).toContain("não escreva em docs/harness/ESTADO.md");
  },
  async "worker-progresso-alheio"(imp) {
    recusadoPeloWorker(await rodarWorker(imp, ({ escrever }) => escrever(OUTRO, "# outra missão\n")));
  },
  async "worker-estado-e-politica"(imp) {
    for (const p of POLITICA) recusadoPeloWorker(await rodarWorker(imp, ({ escrever }) => escrever(p, "alterado pelo worker\n")));
  },
  async "worker-symlink"(imp) {
    // o arquivo autorizado vira um symlink para ESTADO.md: o texto do caminho é permitido, o caminho RESOLVIDO não
    const r = await rodarWorker(imp, ({ repo }) => fs.symlinkSync("../harness/ESTADO.md", path.join(repo, PROPRIO)));
    recusadoPeloWorker(r);
    expect(r.depois).toEqual(r.antes);
  },
  async "entrega-pelo-runner"(imp) {
    const { decide } = await imp("claude-gates.mjs");
    const record = await derivar(imp);
    const ctx = { record, branch: record.branch, evidence: null, failures: {} };
    const obs = (files) => observacao({ branch: record.branch, sha: HEAD_SHA, files: files.map((p) => ({ path: p, status: "added" })), checks: verdes(HEAD_SHA, ["validate", "risk-gate"]) });
    expect(decide(obs(["packages/core/test/borda.test.ts", PROPRIO]), ctx)).toMatchObject({ action: "merge", sha: HEAD_SHA });
    expect(decide(obs(["packages/core/test/borda.test.ts", OUTRO]), ctx)).toMatchObject({ action: "blocked", code: "scope" });
    expect(decide(obs([PROPRIO, "docs/harness/ESTADO.md"]), ctx)).toMatchObject({ action: "owner", code: "elevated" });
  },
  async prompt(imp) {
    const { buildPrompt } = await imp("claude-runner.mjs");
    const texto = buildPrompt({ mission: MISSAO, kind: "implement", branch: "agent/test/ms-101-borda" });
    expect(texto).toContain(`Arquivo de progresso desta missão: ${PROPRIO}`);
    expect(texto).toContain("Não escreva em docs/harness/ESTADO.md");
  },
};

const MUTACOES: Mutacao[] = [
  {
    nome: "M3.1a troca o arquivo exato pelo prefixo amplo docs/", controle: "deriveMissionRecord: arquivo de progresso exato", arquivo: "claude-standing.mjs",
    trocas: [{ de: "const recordPaths = [...paths.filter((p) => p !== progress), progress];", para: 'const recordPaths = [...paths.filter((p) => p !== progress), "docs/"];' }],
    detectadaPor: ["derivacao-permitida"],
    redundancia: "validatePaths recusa diretório de um nível (docs/): a derivação falha inteira (DR-PATHS), o que também derruba o caso permitido; o prefixo amplo nunca chega a um registro válido.",
  },
  {
    nome: "M3.1b troca o arquivo exato pelo prefixo docs/progresso/", controle: "deriveMissionRecord: arquivo de progresso exato", arquivo: "claude-standing.mjs",
    trocas: [{ de: "const recordPaths = [...paths.filter((p) => p !== progress), progress];", para: "const recordPaths = [...paths.filter((p) => p !== progress), PROGRESS_DIR];" }],
    detectadaPor: ["derivacao-permitida"], preservadas: ["worker-permitido", "worker-progresso-alheio", "entrega-pelo-runner"],
    redundancia: "o registro passa a listar o diretório, mas pathAllowedByRecord continua aceitando só docs/progresso/<ref>.md: worker e runner ainda recusam o progresso de outra missão.",
  },
  {
    nome: "M3.2a remove a vinculação progresso↔missão na derivação", controle: "deriveMissionRecord: docs/progresso/ só o arquivo da missão", arquivo: "claude-standing.mjs",
    trocas: [{ de: '      if (p !== progress) fail("ST-SCOPE", p);\n', para: "" }],
    detectadaPor: ["derivacao-recusa-progresso-alheio"], preservadas: ["derivacao-permitida", "worker-permitido"],
  },
  {
    nome: "M3.2b remove a vinculação progresso↔referência no uso do registro", controle: "pathAllowedByRecord: docs/progresso/ só <ref>.md", arquivo: "claude-delivery-record.mjs",
    trocas: [{ de: "  if (p.toLowerCase().startsWith(PROGRESS_DIR) && p !== progressFileOf(record.ref)) return false;\n", para: "" }],
    detectadaPor: ["registro-vinculo-progresso"], preservadas: ["derivacao-permitida", "worker-permitido", "entrega-pelo-runner"],
  },
  {
    nome: "M3.2c desvincula o nome do arquivo da missão", controle: "progressFileOf(ref)", arquivo: "claude-delivery-record.mjs",
    trocas: [{ de: "export const progressFileOf = (ref) => `${PROGRESS_DIR}${ref}.md`;", para: "export const progressFileOf = (ref) => `${PROGRESS_DIR}progresso.md`;" }],
    detectadaPor: ["derivacao-permitida", "worker-permitido"],
  },
  {
    nome: "M3.3a remove a checagem de caminho normalizado no registro", controle: "pathAllowedByRecord: travessia e caminho não normalizado", arquivo: "claude-delivery-record.mjs",
    trocas: [{ de: '  if (typeof p !== "string" || !p || p.includes("\\0") || p.includes("\\\\") || p.startsWith("/") || path.posix.normalize(p) !== p || p.split("/").includes("..")) return false;\n', para: "" }],
    detectadaPor: ["registro-travessia"], preservadas: ["derivacao-permitida", "worker-permitido"],
  },
  {
    nome: "M3.3b remove a checagem do caminho resolvido no worker", controle: "nativeAgent: resolvedInside (symlink)", arquivo: "codex-agent.mjs",
    trocas: [{ de: " || !resolvedInside(root, f, fsImpl)", para: "" }],
    detectadaPor: ["worker-symlink"], preservadas: ["worker-permitido"],
  },
];

describe("cenário 3 — checkpoint rotineiro no arquivo da própria missão", () => {
  it("implementação original: autorização derivada, worker e entrega aceitam só o progresso da missão", async () => {
    const { avaliar } = await import("./developer-harness.mutacao");
    expect(await avaliar(PROPS, importarReal)).toEqual(Object.fromEntries(Object.keys(PROPS).map((k) => [k, null])));
  });
  for (const m of MUTACOES) it(`mutação — ${m.nome}`, () => verificarMutacao("cenário 3", PROPS, m));
  afterAll(() => console.log(`\nEVIDÊNCIA DE MUTAÇÕES — cenário 3\n${evidencia.filter((e) => e.startsWith("[cenário 3]")).join("\n")}\n`));
});
