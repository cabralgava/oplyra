// @ts-nocheck — control plane (.mjs sem tipos).
// CENÁRIO 8f — CLI do structural-gate, job de CI e aceitação estrutural no risk-gate (INTEGRACAO-PR11-E-PERFIS §3, §12).
// REAL: o CLI `node scripts/claude-structural.mjs gate` executado como processo contra um repositório Git SINTÉTICO (temporário), runGate do
// risk-gate e o texto do workflow `.github/workflows/ci.yml` (verificação estática). NÃO executado: o workflow no GitHub Actions, rulesets
// e CODEOWNERS remotos. O escopo vindo do head/PR precisa ser ignorado ou recusado.
import { afterAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { RAIZ, evidencia, importarReal, scriptsDe, verificarMutacao, type Mutacao, type Propriedades } from "./developer-harness.mutacao";

const CONTROL = ["claude-structural.mjs", "claude-risk.mjs", "claude-local-first-guard.mjs", "claude-delivery-record.mjs"];
const DOC = "docs/product/marketing-ops/contracts/changes/CR-040-escopo-sintetico.md";
const DOC_TXT = "Escopo sintético aprovado: export ./assets.\n";
const PKG = "packages/core/package.json";
const BASE_PKG = { name: "@oplyra/core", version: "0.1.0", private: true, type: "module", exports: { ".": "./src/index.ts" } };
const ESCOPO = {
  schema: "oplyra-structural-scope/1", id: "sc-sintetico-cli", approvedDocument: { path: DOC, sha256: crypto.createHash("sha256").update(DOC_TXT).digest("hex") },
  packageExports: [{ file: PKG, add: { "./assets": "./src/assets.ts" } }], migrations: [], tests: [],
};
const ESCOPO_FILE = `docs/harness/scopes/${ESCOPO.id}.json`;

function repositorio() {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "oplyra-cli-")));
  const env = { PATH: process.env.PATH, HOME: repo, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_AUTHOR_NAME: "f", GIT_AUTHOR_EMAIL: "f@example.test", GIT_COMMITTER_NAME: "f", GIT_COMMITTER_EMAIL: "f@example.test" };
  const git = (...a) => {
    const r = spawnSync("git", a, { cwd: repo, encoding: "utf8", env });
    if (r.status !== 0) throw new Error(`git ${a[0]}: ${r.stderr}`);
    return r.stdout.trim();
  };
  const w = (rel, txt) => {
    fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
    fs.writeFileSync(path.join(repo, rel), txt);
  };
  const commit = (m) => { git("add", "-A"); git("commit", "-q", "-m", m); return git("rev-parse", "HEAD"); };
  git("init", "-q", "-b", "main");
  for (const m of CONTROL) w(`scripts/${m}`, fs.readFileSync(path.join(RAIZ, "scripts", m), "utf8"));
  w(DOC, DOC_TXT);
  w(PKG, `${JSON.stringify(BASE_PKG, null, 2)}\n`);
  w(ESCOPO_FILE, `${JSON.stringify(ESCOPO, null, 2)}\n`);
  w("packages/core/src/application/base.ts", "export {};\n");
  const BASE = commit("base confiável");
  const exportsOk = `${JSON.stringify({ ...BASE_PKG, exports: { ...BASE_PKG.exports, "./assets": "./src/assets.ts" } }, null, 2)}\n`;
  git("checkout", "-q", "-b", "ok");
  w(PKG, exportsOk);
  const OK = commit("feat: export autorizado");
  git("checkout", "-q", "-B", "amplia", BASE);
  w(ESCOPO_FILE, `${JSON.stringify({ ...ESCOPO, packageExports: [{ file: PKG, add: { "./assets": "./src/assets.ts", "./tudo": "./src/tudo.ts" } }] }, null, 2)}\n`);
  w(PKG, `${JSON.stringify({ ...BASE_PKG, exports: { ...BASE_PKG.exports, "./assets": "./src/assets.ts", "./tudo": "./src/tudo.ts" } }, null, 2)}\n`);
  const AMPLIA = commit("feat: amplia o próprio escopo");
  git("checkout", "-q", "-B", "novo", BASE);
  w("docs/harness/scopes/sc-do-head.json", `${JSON.stringify({ ...ESCOPO, id: "sc-do-head" }, null, 2)}\n`);
  w(PKG, exportsOk);
  const NOVO = commit("feat: escopo criado no head");
  git("checkout", "-q", "-B", "conteudo", BASE);
  w("packages/core/src/application/oferta.ts", "export const moeda = (locale: string) => (locale === 'pt-BR' ? 'BRL' : 'USD');\n");
  const CONTEUDO = commit("feat: moeda pelo idioma");
  git("checkout", "-q", "-B", "rotina", BASE);
  w("packages/core/src/application/saudacao.ts", "export const saudacao = (nome: string) => `Olá, ${nome}`;\n");
  const ROTINA = commit("feat: saudação");
  git("checkout", "-q", "main");
  return { repo, BASE, OK, AMPLIA, NOVO, CONTEUDO, ROTINA };
}
let fx;
const R = () => (fx ??= repositorio());
/** Executa o CLI da versão sob teste (real ou mutante) como processo, com o clone sintético em `--repo`. */
const cli = (imp, args) => {
  const r = spawnSync(process.execPath, [path.join(scriptsDe(imp), "claude-structural.mjs"), ...args], { encoding: "utf8", env: { PATH: process.env.PATH } });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { json = null; }
  return { status: r.status, json };
};
const gate = (imp, head, extra = []) => cli(imp, ["gate", "--repo", R().repo, "--base", R().BASE, "--head", head, ...extra]);

const PROPS: Propriedades = {
  async "cli-permitido"(imp) {
    const r = gate(imp, R().OK, ["--scope-ref", ESCOPO.id]);
    expect(r.status).toBe(0);
    expect(r.json).toMatchObject({ sha: R().OK, baseSha: R().BASE, scopeRef: ESCOPO.id, conclusion: "success", eligible: true, mode: "structural" });
    expect(r.json.controlSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(r.json.scopeSha256).toBe(crypto.createHash("sha256").update(`${JSON.stringify(ESCOPO, null, 2)}\n`).digest("hex"));
  },
  async "cli-escopo-do-head-ignorado"(imp) {
    const r = gate(imp, R().AMPLIA, ["--scope-ref", ESCOPO.id]);
    expect(r.status).toBe(1);
    expect(r.json).toMatchObject({ conclusion: "failure", eligible: false });
    expect(r.json.elevated).toContainEqual({ path: ESCOPO_FILE, reason: "escopo-estrutural" });
    expect(r.json.elevated).toContainEqual({ path: PKG, reason: "exports-fora-do-autorizado" });
    const novo = gate(imp, R().NOVO, ["--scope-ref", "sc-do-head"]);
    expect(novo.status).toBe(1);
    expect(novo.json).toMatchObject({ refused: "SC-SCOPE", detail: "escopo-ausente-na-base", conclusion: "failure" });
  },
  async "cli-conteudo"(imp) {
    const ruim = gate(imp, R().CONTEUDO);
    expect(ruim.status).toBe(1);
    expect(ruim.json).toMatchObject({ mode: "content", conclusion: "failure" });
    expect(ruim.json.contentViolations).toContainEqual({ path: "packages/core/src/application/oferta.ts", reason: "locale-define-termo-comercial" });
    const bom = gate(imp, R().ROTINA);
    expect(bom.status).toBe(0);
    expect(bom.json).toMatchObject({ mode: "content", conclusion: "success", contentViolations: [] });
    // sem scopeRef, caminho elevado por caminho segue para o dono (risk-gate/CODEOWNERS); o gate não o aprova nem o reprova
    expect(gate(imp, R().OK).json).toMatchObject({ mode: "content", eligible: false, risk: "elevated", contentViolations: [] });
  },
  async "cli-uso"(imp) {
    for (const args of [[], ["gate"], ["gate", "--base", R().BASE], ["gate", "--base", R().BASE, "--head", R().OK, "--scope", "x"], ["outro"]]) expect(cli(imp, args).status, args.join(" ")).toBe(2);
    expect(gate(imp, R().OK, ["--scope-ref", "../../etc"]).json).toMatchObject({ refused: "SG-SCOPE-REF", conclusion: "failure" });
  },
  async "risk-gate-estrutural"(imp) {
    const { runGate } = await imp("claude-risk.mjs");
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "oplyra-codeowners-")));
    fs.mkdirSync(path.join(dir, ".github"));
    // CODEOWNERS da proposta D-E1 (A): sem dono para migrations; scripts continuam com dono
    fs.writeFileSync(path.join(dir, ".github/CODEOWNERS"), "/scripts/ @dono\n");
    const MIG = "supabase/migrations/20261101000020_x.sql";
    const H = "a".repeat(40);
    const ok = { sha: H, conclusion: "success", eligible: true, structural: [MIG] };
    const roda = (structural, headSha = H, changes = [{ path: MIG, status: "added" }]) => runGate({ cwd: dir, write: () => {}, changes, structural, headSha });
    expect(roda(ok)).toBe(0);
    expect(roda(null)).toBe(1);
    expect(roda({ ...ok, sha: "b".repeat(40) })).toBe(1);
    expect(roda(ok, "b".repeat(40))).toBe(1);
    expect(roda({ ...ok, conclusion: "failure" })).toBe(1);
    expect(roda({ ...ok, eligible: false })).toBe(1);
    expect(roda({ ...ok, structural: [] })).toBe(1);
    // nunca cobre caminho elevado que não seja banco/dependências, mesmo se listado
    expect(roda({ ...ok, structural: [MIG, "docs/harness/ESTADO.md"] }, H, [{ path: "docs/harness/ESTADO.md", status: "modified" }])).toBe(1);
  },
  async "job-ci"() {
    const yml = fs.readFileSync(path.join(RAIZ, ".github/workflows/ci.yml"), "utf8");
    const job = /\n  structural-gate:\n([\s\S]*?)\n  [a-z-]+:\n/.exec(yml)?.[1] ?? "";
    expect(job).toContain("name: structural-gate");
    expect(job).toContain("persist-credentials: false");
    expect(job).toContain('TRUSTED="$(git merge-base "$BASE_SHA" "$HEAD_SHA")"');
    expect(job).toContain('git worktree add --detach "$RUNNER_TEMP/trusted" "$TRUSTED"');
    expect(job).toContain('node "$RUNNER_TEMP/trusted/scripts/claude-structural.mjs"');
    // o código do PR nunca é executado: nada de scripts do workspace, instalação de dependências nem segredos
    expect(job).not.toMatch(/node scripts\/|pnpm |npm |secrets\./);
    const risk = /\n  risk-gate:\n([\s\S]*?)\n  [a-z-]+:\n/.exec(yml)?.[1] ?? "";
    expect(risk).toContain("needs: structural-gate");
    expect(risk).toContain("if: always()");
    expect(risk).toContain('--structural "$RUNNER_TEMP/structural.json" --head-sha "$HEAD_SHA"');
  },
};

const MUTACOES: Mutacao[] = [
  { nome: "M8f.1 CLI lê o escopo do head", controle: "runStructuralGate: escopo de <base>", arquivo: "claude-structural.mjs",
    trocas: [{ de: "git([\"show\", `${baseSha}:${scopeFileOf(scopeRef)}`]", para: "git([\"show\", `${headSha}:${scopeFileOf(scopeRef)}`]" }],
    detectadaPor: ["cli-escopo-do-head-ignorado"], preservadas: ["cli-permitido", "cli-conteudo"] },
  { nome: "M8f.2 modo conteúdo sempre aprova", controle: "runStructuralGate: conclusão do modo conteúdo", arquivo: "claude-structural.mjs",
    trocas: [{ de: 'conclusion: verdict.contentViolations.length ? "failure" : "success"', para: 'conclusion: "success"' }],
    detectadaPor: ["cli-conteudo"], preservadas: ["cli-permitido"] },
  { nome: "M8f.3 CLI sai com 0 mesmo em falha", controle: "cli: código de saída", arquivo: "claude-structural.mjs",
    trocas: [{ de: 'return result.conclusion === "success" ? 0 : 1;', para: "return 0;" }],
    detectadaPor: ["cli-escopo-do-head-ignorado", "cli-conteudo"], preservadas: ["cli-permitido"] },
  { nome: "M8f.4 risk-gate aceita resultado de outro head", controle: "structurallyCovered: structural.sha === headSha", arquivo: "claude-risk.mjs",
    trocas: [{ de: "&& structural.sha === headSha", para: "" }], detectadaPor: ["risk-gate-estrutural"], preservadas: ["cli-permitido"] },
  { nome: "M8f.5 risk-gate aceita qualquer motivo elevado listado", controle: "structurallyCovered: só banco/dependências", arquivo: "claude-risk.mjs",
    trocas: [{ de: ' && ["banco", "dependencias"].includes(entry.reason)', para: "" }], detectadaPor: ["risk-gate-estrutural"], preservadas: ["cli-permitido"] },
  { nome: "M8f.6 risk-gate ignora a conclusão do structural-gate", controle: "structurallyCovered: conclusion/eligible", arquivo: "claude-risk.mjs",
    trocas: [{ de: '    && structural.conclusion === "success" && structural.eligible === true && Array.isArray(structural.structural)', para: "    && Array.isArray(structural.structural)" }],
    detectadaPor: ["risk-gate-estrutural"], preservadas: ["cli-permitido"] },
];

describe("cenário 8f — CLI e job do structural-gate; escopo do head ignorado", () => {
  it("implementação original", async () => {
    const { avaliar } = await import("./developer-harness.mutacao");
    expect(await avaliar(PROPS, importarReal)).toEqual(Object.fromEntries(Object.keys(PROPS).map((k) => [k, null])));
  });
  for (const m of MUTACOES) it(`mutação — ${m.nome}`, () => verificarMutacao("cenário 8f", PROPS, m));
  afterAll(() => console.log(`\nEVIDÊNCIA DE MUTAÇÕES — cenário 8f\n${evidencia.filter((e) => e.startsWith("[cenário 8f]")).join("\n")}\n`));
});
