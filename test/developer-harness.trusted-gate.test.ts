// @ts-nocheck — control plane (.mjs sem tipos).
// CENÁRIO 4 — controle confiável e evidência do commit correto (INTEGRACAO-PR11-E-PERFIS §3, §10).
// Componentes REAIS: runStructuralGate/loadTrustedControl (Git local real em repositório SINTÉTICO num diretório temporário), decide e
// updateEvidence. SIMULADOS: a observação do GitHub (PR, check-runs) e a decisão de merge — nenhum merge remoto, nenhuma chamada de rede.
// LIMITE: `decide` devolver `merge` é uma decisão simulada; não comprova integração no GitHub nem proteção do ruleset/CODEOWNERS.
// O gate roda Git com ambiente mínimo: nenhuma credencial chega ao processo nem ao código avaliado.
import { afterAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { RAIZ, evidencia, importarReal, observacao, verificarMutacao, verdes, type Mutacao, type Propriedades } from "./developer-harness.mutacao";

const CONTROL = ["claude-structural.mjs", "claude-risk.mjs", "claude-local-first-guard.mjs", "claude-delivery-record.mjs"];
const DOC = "docs/product/marketing-ops/contracts/changes/CR-040-escopo-sintetico.md";
const DOC_TXT = "Escopo S6b sintético aprovado: core.assets por tenant, export ./assets.\n";
const MIG = "supabase/migrations/20261101000020_assets_sinteticos.sql";
const PGTAP = "supabase/tests/assets_sinteticos.test.sql";
const PKG = "packages/core/package.json";
const PROGRESSO = "docs/progresso/ms-201.md";
const BRANCH = "agent/feat/ms-201-ativos-estruturais";
const BASE_PKG = { name: "@oplyra/core", version: "0.1.0", private: true, type: "module", exports: { ".": "./src/index.ts" }, scripts: { test: "vitest run" } };
const SQL_OK = `create table core.assets (id uuid primary key, tenant_id uuid not null);
alter table core.assets enable row level security;
alter table core.assets force row level security;
create policy assets_tenant_isolation on core.assets for all to authenticated
  using (tenant_id = app.current_tenant()) with check (tenant_id = app.current_tenant());
grant select on core.assets to authenticated;
`;
const ESCOPO = {
  schema: "oplyra-structural-scope/1", id: "sc-sintetico-s6b",
  approvedDocument: { path: DOC, sha256: crypto.createHash("sha256").update(DOC_TXT).digest("hex") },
  packageExports: [{ file: PKG, add: { "./assets": "./src/assets.ts" } }],
  migrations: [{ file: MIG, tables: [{ name: "core.assets", tenantOwned: true, forceRls: true }], policies: [{ name: "assets_tenant_isolation", table: "core.assets" }], grants: [{ table: "core.assets", to: "authenticated", privileges: ["select"] }], indexes: [], functions: [] }],
  tests: [PGTAP],
};
const MARCA = "__oplyraCandidatoExecutado";

/* --------------------------------------------- base confiável e candidatas (Git local) */

const ENV_FIXTURE = (dir) => ({ PATH: process.env.PATH, HOME: dir, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_AUTHOR_NAME: "fixture", GIT_AUTHOR_EMAIL: "fixture@example.test", GIT_COMMITTER_NAME: "fixture", GIT_COMMITTER_EMAIL: "fixture@example.test" });
function montarRepositorio() {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "oplyra-trusted-gate-")));
  const git = (...args) => {
    const r = spawnSync("git", args, { cwd: repo, encoding: "utf8", env: ENV_FIXTURE(repo) });
    if (r.status !== 0) throw new Error(`git ${args[0]}: ${r.stderr}`);
    return r.stdout.trim();
  };
  const escrever = (rel, txt) => {
    fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
    fs.writeFileSync(path.join(repo, rel), txt);
  };
  const commit = (msg) => {
    git("add", "-A");
    git("commit", "-q", "-m", msg);
    return git("rev-parse", "HEAD");
  };
  git("init", "-q", "-b", "main");
  escrever("README.md", "repositório sintético\n");
  const ROOT = commit("raiz sem controle");
  for (const m of CONTROL) escrever(`scripts/${m}`, fs.readFileSync(path.join(RAIZ, "scripts", m), "utf8"));
  escrever(DOC, DOC_TXT);
  escrever(PKG, `${JSON.stringify(BASE_PKG, null, 2)}\n`);
  escrever("supabase/migrations/20260929000015_existente.sql", "select 1;\n");
  escrever("docs/harness/AUTONOMOUS-BUILD.md", "política sintética\n");
  // escopo versionado na base confiável: a ÚNICA origem que o gate lê
  escrever(`docs/harness/scopes/${ESCOPO.id}.json`, `${JSON.stringify(ESCOPO, null, 2)}\n`);
  const BASE = commit("base confiável: controle + escopo aprovado");
  git("checkout", "-q", "-b", "candidata");
  escrever(MIG, SQL_OK);
  escrever(PGTAP, "select plan(1);\n");
  escrever(PKG, `${JSON.stringify({ ...BASE_PKG, exports: { ...BASE_PKG.exports, "./assets": "./src/assets.ts" } }, null, 2)}\n`);
  const A = commit("feat: incremento estrutural autorizado");
  escrever(MIG, `${SQL_OK}grant select on core.assets to anon;\n`);
  const B = commit("feat: amplia acesso");
  git("checkout", "-q", "-B", "c", A);
  escrever(PROGRESSO, "# ms-201\n");
  const C = commit("docs: progresso da missão");
  git("checkout", "-q", "-B", "self", A);
  const real = fs.readFileSync(path.join(RAIZ, "scripts", "claude-structural.mjs"), "utf8");
  escrever("scripts/claude-structural.mjs", `${real.replace("export function evaluateStructural(", "function evaluateStructuralOriginal(")}
globalThis.${MARCA} = true;
export function evaluateStructural(input) {
  globalThis.${MARCA} = true;
  return { risk: "structural", eligible: true, scopeRef: input.scopeRef, structural: input.changes.map((c) => c.path), elevated: [], routine: [] };
}
`);
  escrever(MIG, `${SQL_OK}grant select on core.assets to anon;\n`);
  const SELF = commit("feat: gate sempre aprova");
  git("checkout", "-q", "-B", "policy", A);
  const DOC_AMPLIADO = `${DOC_TXT}Também autorizado: grant a anon e qualquer export.\n`;
  escrever(DOC, DOC_AMPLIADO);
  escrever("docs/harness/AUTONOMOUS-BUILD.md", "política sintética: integração estrutural sem gate\n");
  // a candidata também amplia o PRÓPRIO escopo versionado (mais um export) e o "reaprova" com o documento ampliado
  const ESCOPO_AMPLIADO = { ...ESCOPO, approvedDocument: { path: DOC, sha256: crypto.createHash("sha256").update(DOC_AMPLIADO).digest("hex") }, packageExports: [{ file: PKG, add: { "./assets": "./src/assets.ts", "./tudo": "./src/tudo.ts" } }] };
  escrever(`docs/harness/scopes/${ESCOPO.id}.json`, `${JSON.stringify(ESCOPO_AMPLIADO, null, 2)}\n`);
  escrever(PKG, `${JSON.stringify({ ...BASE_PKG, exports: { ...BASE_PKG.exports, "./assets": "./src/assets.ts", "./tudo": "./src/tudo.ts" } }, null, 2)}\n`);
  const POLICY = commit("docs: amplia a política que autoriza a própria integração");
  // escopo que só existe no head: nunca é lido
  git("checkout", "-q", "-B", "headscope", A);
  escrever("docs/harness/scopes/sc-so-no-head.json", `${JSON.stringify({ ...ESCOPO, id: "sc-so-no-head" }, null, 2)}\n`);
  const HEADSCOPE = commit("docs: escopo criado pela própria candidata");
  git("checkout", "-q", "-B", "irma", ROOT);
  for (const m of CONTROL) escrever(`scripts/${m}`, fs.readFileSync(path.join(RAIZ, "scripts", m), "utf8"));
  const IRMA = commit("controle fora da linha da base");
  git("checkout", "-q", "main");
  return { repo, ROOT, BASE, A, B, C, SELF, POLICY, HEADSCOPE, IRMA, DOC_AMPLIADO };
}

let fixture;
const R = () => (fixture ??= montarRepositorio());
/** O gate não recebe escopo do chamador: lê `docs/harness/scopes/<scopeRef>.json` do commit base. */
const gate = (imp, baseSha, headSha, over = {}) => imp("claude-structural.mjs").then((S) => S.runStructuralGate({ repoRoot: R().repo, baseSha, headSha, scopeRef: ESCOPO.id, ...over }));

async function contexto(imp, structural, extra = {}) {
  const { buildRecord } = await imp("claude-delivery-record.mjs");
  const record = buildRecord({ ref: "ms-201", branch: BRANCH, baseSha: R().BASE, paths: [MIG, PGTAP, PKG, PROGRESSO], scopeRef: ESCOPO.id, confirmation: "standing:0123456789abcdef", budgets: { wallClockSeconds: 3600, iterations: 5, logReads: 10 } });
  return { record, branch: BRANCH, evidence: null, failures: {}, structural, ...extra };
}
const decidir = async (imp, { sha, g, checks, ctxExtra }) => {
  const { decide } = await imp("claude-gates.mjs");
  return decide(observacao({ branch: BRANCH, sha, files: g.files, checks: checks ?? verdes(sha) }), await contexto(imp, g, ctxExtra));
};
const esperadoControlSha = () => {
  const h = crypto.createHash("sha256");
  for (const m of CONTROL) h.update(m).update("\0").update(fs.readFileSync(path.join(RAIZ, "scripts", m))).update("\0");
  return h.digest("hex");
};

const PROPS: Propriedades = {
  async permitido(imp) {
    delete globalThis[MARCA];
    const { BASE, A } = R();
    const g = await gate(imp, BASE, A);
    expect(g).toMatchObject({ schema: "oplyra-structural-gate/1", sha: A, baseSha: BASE, scopeRef: ESCOPO.id, risk: "structural", eligible: true, conclusion: "success", elevated: [] });
    expect([...g.structural].sort()).toEqual([PKG, PGTAP, MIG].sort());
    expect(g.controlSha256).toBe(esperadoControlSha());
    expect(await decidir(imp, { sha: A, g })).toMatchObject({ action: "merge", sha: A });
    expect(globalThis[MARCA]).toBeUndefined();
  },
  async "candidato-altera-gate"(imp) {
    delete globalThis[MARCA];
    const { BASE, SELF } = R();
    const g = await gate(imp, BASE, SELF);
    expect(globalThis[MARCA], "o código do gate candidato não pode ser executado").toBeUndefined();
    expect(g).toMatchObject({ eligible: false, conclusion: "failure", risk: "elevated", sha: SELF, controlSha256: esperadoControlSha() });
    expect(g.elevated).toContainEqual({ path: "scripts/claude-structural.mjs", reason: "control-plane" });
    expect(g.elevated).toContainEqual({ path: MIG, reason: "grant-anon-ou-public" });
    expect((await decidir(imp, { sha: SELF, g })).action).toBe("owner");
  },
  async "candidato-altera-politica"(imp) {
    const { BASE, POLICY, DOC_AMPLIADO } = R();
    const g = await gate(imp, BASE, POLICY);
    expect(g).toMatchObject({ eligible: false, conclusion: "failure" });
    expect(g.elevated).toContainEqual({ path: DOC, reason: "politica-do-escopo" });
    expect(g.elevated).toContainEqual({ path: "docs/harness/AUTONOMOUS-BUILD.md", reason: "control-plane" });
    expect((await decidir(imp, { sha: POLICY, g })).action).toBe("owner");
    // o escopo ampliado no head é IGNORADO (o gate usa o da base) e alterá-lo é, por si, elevado; o export extra fica fora do escopo
    expect(g.elevated).toContainEqual({ path: `docs/harness/scopes/${ESCOPO.id}.json`, reason: "escopo-estrutural" });
    expect(g.elevated).toContainEqual({ path: PKG, reason: "exports-fora-do-autorizado" });
    expect(g.approvedDocumentSha256).toBe(ESCOPO.approvedDocument.sha256);
    expect(g.approvedDocumentSha256).not.toBe(crypto.createHash("sha256").update(DOC_AMPLIADO).digest("hex"));
    expect(g.scopeSha256).toBe(crypto.createHash("sha256").update(`${JSON.stringify(ESCOPO, null, 2)}\n`).digest("hex"));
  },
  async "escopo-so-no-head"(imp) {
    const { BASE, HEADSCOPE } = R();
    const g = await gate(imp, BASE, HEADSCOPE, { scopeRef: "sc-so-no-head" });
    expect(g).toMatchObject({ refused: "SC-SCOPE", detail: "escopo-ausente-na-base", eligible: false, conclusion: "failure" });
  },
  async "evidencia-de-outro-commit"(imp) {
    const { BASE, A, B } = R();
    const gA = await gate(imp, BASE, A);
    // resultado do gate e evidência colhidos em A; o head agora é B (que acrescenta grant a anon)
    const d = await decidir(imp, { sha: B, g: gA, ctxExtra: { evidence: { sha: A, checks: { validate: "success", "risk-gate": "success", "structural-gate": "success" } } } });
    expect(d).toMatchObject({ action: "wait", reason: "structural-gate-stale" });
    const { updateEvidence } = await imp("claude-gates.mjs");
    const ev = updateEvidence({ evidence: { sha: A, checks: {} }, headSha: B, checks: [{ name: "validate", status: "in_progress", head_sha: B }], required: ["validate", "risk-gate", "structural-gate"] });
    expect(ev.evidence).toBeNull();
    expect(ev.invalidated).toEqual({ reason: "sha-changed", was: A });
    // o gate de B, por sua vez, recusa
    expect((await decidir(imp, { sha: B, g: await gate(imp, BASE, B) })).action).toBe("owner");
  },
  async "checks-de-outro-commit"(imp) {
    const { BASE, A, C } = R();
    const gC = await gate(imp, BASE, C);
    expect(gC).toMatchObject({ eligible: true, sha: C });
    // check-runs verdes, mas do commit A: não contam para o head C
    expect(await decidir(imp, { sha: C, g: gC, checks: verdes(A) })).toMatchObject({ action: "wait", reason: "ci-pending" });
    expect(await decidir(imp, { sha: C, g: gC })).toMatchObject({ action: "merge", sha: C });
  },
  async "structural-gate-ausente-pendente-falho"(imp) {
    const { BASE, A, B } = R();
    const g = await gate(imp, BASE, A);
    expect(await decidir(imp, { sha: A, g, checks: verdes(A, ["validate", "risk-gate"]) })).toMatchObject({ action: "wait", reason: "ci-pending" });
    expect(await decidir(imp, { sha: A, g, checks: [...verdes(A, ["validate", "risk-gate"]), { name: "structural-gate", status: "in_progress", head_sha: A }] })).toMatchObject({ action: "wait" });
    expect((await decidir(imp, { sha: A, g, checks: [...verdes(A, ["validate", "risk-gate"]), { name: "structural-gate", status: "completed", conclusion: "failure", head_sha: A }] })).action).toBe("fix");
    const { decide } = await imp("claude-gates.mjs");
    const semResultado = decide(observacao({ branch: BRANCH, sha: A, files: g.files, checks: verdes(A) }), await contexto(imp, undefined));
    expect(semResultado).toMatchObject({ action: "wait", reason: "structural-gate-pending" });
    const gB = await gate(imp, BASE, B);
    expect(gB.conclusion).toBe("failure");
    expect((await decidir(imp, { sha: B, g: gB })).action).toBe("owner");
  },
  async "controle-nao-identificado"(imp) {
    const { ROOT, A, IRMA } = R();
    for (const [base, detalhe] of [["f".repeat(40), "base-commit"], ["nao-e-sha", "base-sha"], [ROOT, "ausente:claude-structural.mjs"], [IRMA, "base-nao-ancestral"]]) {
      const g = await gate(imp, base, A);
      expect(g, detalhe).toMatchObject({ refused: "SG-CONTROL", detail: detalhe, eligible: false, conclusion: "failure", controlSha256: null });
      expect((await decidir(imp, { sha: A, g: { ...g, files: [{ path: MIG, status: "added" }] } })).action, detalhe).toBe("owner");
    }
  },
  async "sem-credenciais"(imp) {
    const { BASE, A } = R();
    const ambientes = [];
    const antes = process.env.GH_TOKEN;
    process.env.GH_TOKEN = "sintetico-nao-usar";
    try {
      await gate(imp, BASE, A, { spawn: (cmd, args, opts) => { ambientes.push(opts.env); return spawnSync(cmd, args, opts); } });
    } finally {
      if (antes === undefined) delete process.env.GH_TOKEN;
      else process.env.GH_TOKEN = antes;
    }
    expect(ambientes.length).toBeGreaterThan(3);
    for (const env of ambientes) {
      expect(Object.keys(env).sort()).toEqual(["GIT_CONFIG_GLOBAL", "GIT_CONFIG_NOSYSTEM", "GIT_TERMINAL_PROMPT", "HOME", "LANG", "PATH"]);
      expect(JSON.stringify(env)).not.toContain("sintetico-nao-usar");
      expect(env.HOME).toBe(os.tmpdir());
    }
  },
};

const MUTACOES: Mutacao[] = [
  {
    nome: "M4.1 carrega o gate da versão candidata em vez da base confiável", controle: "runStructuralGate → loadTrustedControl(baseSha)", arquivo: "claude-structural.mjs",
    trocas: [{ de: "await loadTrustedControl({ git, baseSha });", para: "await loadTrustedControl({ git, baseSha: headSha });" }],
    detectadaPor: ["candidato-altera-gate"], preservadas: ["permitido", "evidencia-de-outro-commit"],
  },
  {
    nome: "M4.5 lê o escopo estrutural do head em vez da base", controle: "runStructuralGate: git show <base>:docs/harness/scopes/<ref>.json", arquivo: "claude-structural.mjs",
    trocas: [{ de: "git([\"show\", `${baseSha}:${scopeFileOf(scopeRef)}`]", para: "git([\"show\", `${headSha}:${scopeFileOf(scopeRef)}`]" }],
    detectadaPor: ["escopo-so-no-head", "candidato-altera-politica"], preservadas: ["permitido"],
  },
  {
    nome: "M4.6 lê o documento aprovado do head em vez da base", controle: "runStructuralGate: git show <base>:<documento aprovado>", arquivo: "claude-structural.mjs",
    trocas: [{ de: "git([\"show\", `${baseSha}:${docPath}`]", para: "git([\"show\", `${headSha}:${docPath}`]" }],
    detectadaPor: ["candidato-altera-politica"], preservadas: ["permitido"],
  },
  {
    nome: "M4.2a remove a comparação entre o SHA da evidência e o head (updateEvidence)", controle: "updateEvidence: evidence.sha !== headSha", arquivo: "claude-gates.mjs",
    trocas: [{ de: "  if (next.evidence && next.evidence.sha !== headSha) {", para: "  if (false) {" }],
    detectadaPor: ["evidencia-de-outro-commit"], preservadas: ["permitido"],
    redundancia: "no decide a evidência antiga não leva a merge: a verificação final `ev.evidence.sha !== pr.head.sha` devolve wait(evidence-missing). A suíte detecta a mutação pela asserção direta sobre updateEvidence.",
  },
  {
    nome: "M4.2b remove a comparação entre o SHA do resultado do structural-gate e o head", controle: "structuralHold: s.sha !== headSha", arquivo: "claude-gates.mjs",
    trocas: [{ de: '  if (s.sha !== headSha) return wait("structural-gate-stale");\n', para: "" }],
    detectadaPor: ["evidencia-de-outro-commit"], preservadas: ["permitido", "checks-de-outro-commit"],
  },
  {
    nome: "M4.2c aceita check-runs de outro commit como se fossem do head", controle: "decide: filtro head_sha dos checks", arquivo: "claude-gates.mjs",
    trocas: [{ de: "(obs.checks ?? []).filter((c) => c?.head_sha === undefined || c.head_sha === pr.head.sha)", para: "(obs.checks ?? [])" }],
    detectadaPor: ["checks-de-outro-commit"], preservadas: ["permitido"],
  },
  {
    nome: "M4.3 aceita sucesso antigo após mudança do head", controle: "updateEvidence: invalidação por sha-changed", arquivo: "claude-gates.mjs",
    trocas: [{ de: '    next.invalidated = { reason: "sha-changed", was: next.evidence.sha };\n    next.evidence = null;\n', para: '    next.invalidated = { reason: "sha-changed", was: next.evidence.sha };\n    next.evidence = { ...next.evidence, sha: headSha };\n' }],
    detectadaPor: ["evidencia-de-outro-commit"], preservadas: ["permitido"],
    redundancia: "no decide, com o CI do novo head pendente, a decisão continua wait(ci-pending); a evidência reetiquetada só é detectada pela asserção direta sobre updateEvidence.",
  },
  {
    nome: "M4.4a trata check obrigatório ausente como aprovado", controle: "requiredSatisfied (usado por decide e updateEvidence)", arquivo: "claude-gates.mjs",
    trocas: [{ de: '  return required.every((n) => byName.get(n)?.status === "completed" && OK_CONCLUSIONS.has(byName.get(n)?.conclusion));', para: '  return required.every((n) => byName.get(n) === undefined || (byName.get(n)?.status === "completed" && OK_CONCLUSIONS.has(byName.get(n)?.conclusion)));' }],
    detectadaPor: ["structural-gate-ausente-pendente-falho", "checks-de-outro-commit"], preservadas: ["permitido"],
  },
  {
    nome: "M4.4b deixa de exigir o structural-gate em missão estrutural", controle: "requiredChecksFor(ctx)", arquivo: "claude-gates.mjs",
    trocas: [{ de: "(ctx?.record?.scopeRef ? Object.freeze([...REQUIRED_CHECKS, STRUCTURAL_CHECK]) : REQUIRED_CHECKS)", para: "(REQUIRED_CHECKS)" }],
    detectadaPor: ["structural-gate-ausente-pendente-falho"], preservadas: ["permitido"],
  },
];

describe("cenário 4 — controle da base confiável e evidência do SHA exato", () => {
  it("implementação original: candidata não se autoriza, evidência não é reutilizada, nada decide merge com condição pendente", async () => {
    const { avaliar } = await import("./developer-harness.mutacao");
    const { BASE, A, B, C, SELF, POLICY } = R();
    console.log(`\nCOMMITS SINTÉTICOS — base confiável ${BASE}; A (permitida) ${A}; B (A + grant anon) ${B}; C (A + progresso) ${C}; SELF (gate próprio) ${SELF}; POLICY (política) ${POLICY}\n`);
    expect(await avaliar(PROPS, importarReal)).toEqual(Object.fromEntries(Object.keys(PROPS).map((k) => [k, null])));
  });
  for (const m of MUTACOES) it(`mutação — ${m.nome}`, () => verificarMutacao("cenário 4", PROPS, m));
  afterAll(() => console.log(`\nEVIDÊNCIA DE MUTAÇÕES — cenário 4\n${evidencia.filter((e) => e.startsWith("[cenário 4]")).join("\n")}\n`));
});
