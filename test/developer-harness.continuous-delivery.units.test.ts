// @ts-nocheck — módulos .mjs do control plane, sem declarações de tipos.
// Política de 04/10/2026 (desenvolvimento e entrega contínuos): classificação de risco, CODEOWNERS, autorização contínua, gates,
// adaptador GitHub da integração e ajuste administrativo do ruleset. Offline: sem rede, sem chave real, sem `gh`.
import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { classifyChange, classifyPath, ownersOf, parseCodeowners, runGate, uncoveredElevated } from "../scripts/claude-risk.mjs";
import {
  STANDING_CEILINGS, STANDING_CONFIRMATION, STANDING_PHRASE, StandingError, buildStanding, deriveMissionRecord, loadStanding, revokeStanding, standingConfirmation, validateMission, validateStanding, writeStanding,
} from "../scripts/claude-standing.mjs";
import { validateRecord } from "../scripts/claude-delivery-record.mjs";
import { HOLD_LABEL, MAX_BRANCH_UPDATES, REQUIRED_CHECKS, assessRuleset, decide, updateEvidence } from "../scripts/claude-gates.mjs";
import { IntegrateError, READY_MUTATION, createIntegrator, integrateEndpointAllowed } from "../scripts/claude-integrate.mjs";
import { EXPECTED_PERMISSIONS } from "../scripts/claude-git.mjs";
import { APPLY_PHRASE, ROLLBACK_PHRASE, planRuleset, run as admin } from "../scripts/claude-admin.mjs";

const RAIZ = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const codeOf = (fn) => {
  try {
    fn();
  } catch (e) {
    return e.code ?? `INESPERADO:${e.message}`;
  }
  return "OK";
};
const tmpdir = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "oplyra-cd-")));

/* ============================================================== risco e CODEOWNERS */

describe("classificação de risco", () => {
  it("mudança de produto, teste e documentação comum é rotineira", () => {
    for (const p of ["apps/web/src/app/page.tsx", "packages/core/src/x.ts", "test/foo.test.ts", "docs/product/marketing-ops/14-ux-flows.md", "docs/backlog/missions.json", ".env.example", "README.md"]) {
      expect(classifyPath(p).risk, p).toBe("routine");
    }
    expect(classifyChange(["apps/web/a.ts", "test/a.test.ts"]).risk).toBe("routine");
  });

  it("control plane, CI, banco, dependências, ferramentas, scripts, contratos, harness, decisões e configuração de teste são elevados", () => {
    // alguns caminhos pertencem a mais de um motivo (a primeira regra vence): o que importa é o risco; o motivo é só diagnóstico
    const casos = {
      "control-plane": ".claude/settings.json", banco: "supabase/migrations/000016_x.sql", dependencias: "apps/web/package.json", ferramentas: "tools/contract-release/lib.mjs",
      scripts: "scripts/db-guard.sh", contratos: "docs/product/marketing-ops/contracts/x.md", decisoes: "docs/decisions/0010-x.md", "config-de-teste-ou-build": "apps/web/vitest.config.ts",
      segredo: "apps/web/.env.local", "referencia-protegida": "sources/a.md",
    };
    for (const [motivo, p] of Object.entries(casos)) expect(classifyPath(p), p).toMatchObject({ risk: "elevated", reason: motivo });
    for (const p of [".github/workflows/ci.yml", "docs/harness/ESTADO.md", "tools/developer-harness/package.json", "scripts/claude-git.mjs"]) expect(classifyPath(p).risk, p).toBe("elevated");
    expect(classifyPath("pnpm-lock.yaml").risk).toBe("elevated");
    expect(classifyPath("apps/web/tsconfig.json").risk).toBe("elevated");
  });

  it("remover teste é elevado; modificar ou adicionar teste é rotineiro; renomear toca os dois caminhos", () => {
    expect(classifyPath({ path: "test/a.test.ts", status: "removed" })).toMatchObject({ risk: "elevated", reason: "remocao-de-teste" });
    expect(classifyPath({ path: "test/a.test.ts", status: "modified" }).risk).toBe("routine");
    expect(classifyPath({ path: "test/a.test.ts", status: "added" }).risk).toBe("routine");
    expect(classifyChange([{ path: "apps/web/b.ts", status: "added" }, { path: "test/a.test.ts", status: "removed" }]).risk).toBe("elevated");
  });

  it("conjunto vazio, caminho absoluto e travessia nunca são rotineiros", () => {
    expect(classifyChange([]).risk).toBe("elevated");
    expect(classifyChange(undefined).risk).toBe("elevated");
    for (const p of ["/etc/passwd", "../fora", "a/../../b", ""]) expect(classifyPath(p).risk, p).toBe("elevated");
  });

  it("o risco do conjunto é o do pior arquivo", () => {
    const r = classifyChange(["apps/web/a.ts", ".github/workflows/ci.yml", "supabase/seed.sql"]);
    expect(r.risk).toBe("elevated");
    expect(r.elevated.map((e) => e.path)).toEqual([".github/workflows/ci.yml", "supabase/seed.sql"]);
    expect(r.routine).toEqual(["apps/web/a.ts"]);
  });
});

describe("CODEOWNERS", () => {
  const real = parseCodeowners(fs.readFileSync(path.join(RAIZ, ".github/CODEOWNERS"), "utf8"));

  it("o CODEOWNERS real cobre TODO caminho elevado de cada motivo (o risk-gate da CI depende disso)", () => {
    const elevados = [
      "AGENTS.md", "apps/web/AGENTS.md", ".agents/skills/x/SKILL.md", ".codex/config.toml", ".claude/settings.json", ".claude/delegated-delivery.json", ".mcp.json", "CLAUDE.md", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "apps/web/package.json", "packages/core/package.json",
      "tools/developer-harness/package.json", "tools/contract-release/lib.mjs", "scripts/claude-git.mjs", "scripts/db-guard.sh", "scripts/anything.mjs", ".github/workflows/ci.yml", ".github/CODEOWNERS",
      ".github/pull_request_template.md", "supabase/migrations/000001_x.sql", "supabase/seed.sql", "supabase/config.toml", "supabase/tests/a.sql", "docs/harness/ESTADO.md", "docs/harness/AUTONOMOUS-BUILD.md",
      "docs/decisions/0001-a.md", "docs/product/marketing-ops/contracts/changes/CR-034-x.md", "test/contracts/a.test.ts", "sources/a.md", "docs/product/marketing-ops/00-documento-transicao.md",
      "apps/web/vitest.config.ts", "playwright.config.ts", "apps/web/next.config.mjs", "apps/web/tsconfig.json", "tsconfig.base.json", "packages/x/contracts/y.ts", ".npmrc", "apps/web/.npmrc", "vitest.config.mjs",
    ];
    for (const p of elevados) {
      expect(classifyPath(p).risk, `classificador: ${p}`).toBe("elevated");
      expect(ownersOf(real, p), `CODEOWNERS: ${p}`).not.toBeNull();
    }
    expect(uncoveredElevated(elevados, real)).toEqual([]);
  });

  it("caminho rotineiro NÃO tem dono: do contrário todo PR exigiria o proprietário e a integração automática nunca ocorreria", () => {
    for (const p of ["apps/web/src/app/page.tsx", "apps/ops-cli/src/main.ts", "packages/core/src/domain/x.ts", "packages/infra/src/y.ts", "test/foo.test.ts", "docs/backlog/missions.json", "docs/product/marketing-ops/14-ux-flows.md", "e2e/a.spec.ts", "README.md", ".env.example"]) {
      expect(classifyPath(p).risk, p).toBe("routine");
      expect(ownersOf(real, p), `não deveria ter dono: ${p}`).toBeNull();
    }
  });

  it("sintaxe fora do subconjunto é recusada (falha fechada) e o último padrão vence", () => {
    for (const linha of ["/a/ !@x", "[ab]/ @x", "a?b @x", "/a/ ", "/a/ x", "/a\\b/ @x"]) expect(() => parseCodeowners(linha), linha).toThrow();
    const rules = parseCodeowners("/docs/ @a\n/docs/livre/ @b\n");
    expect(ownersOf(rules, "docs/x.md")).toEqual(["@a"]);
    expect(ownersOf(rules, "docs/livre/x.md")).toEqual(["@b"]);
    expect(ownersOf(rules, "apps/x.ts")).toBeNull();
    expect(ownersOf(parseCodeowners("**/package.json @a"), "a/b/package.json")).toEqual(["@a"]);
    expect(ownersOf(parseCodeowners("**/package.json @a"), "package.json")).toEqual(["@a"]);
    expect(ownersOf(parseCodeowners("/scripts/claude-* @a"), "scripts/claude-git.mjs")).toEqual(["@a"]);
    expect(ownersOf(parseCodeowners("/scripts/claude-* @a"), "scripts/other.mjs")).toBeNull();
  });

  it("risk-gate: reprova quando um caminho elevado fica sem dono e aprova quando todos têm", () => {
    const dir = tmpdir();
    fs.mkdirSync(path.join(dir, ".github"));
    fs.writeFileSync(path.join(dir, ".github/CODEOWNERS"), "/.github/ @dono\n");
    const out: string[] = [];
    const write = (s: string) => out.push(s);
    expect(runGate({ cwd: dir, write, changes: [{ path: ".github/workflows/ci.yml", status: "modified" }] })).toBe(0);
    expect(runGate({ cwd: dir, write, changes: [{ path: "supabase/migrations/1.sql", status: "added" }] })).toBe(1);
    expect(out.join("")).toContain("SEM DONO: supabase/migrations/1.sql");
    expect(runGate({ cwd: dir, write, changes: [{ path: "apps/web/a.ts", status: "modified" }] })).toBe(0);
    fs.rmSync(dir, { recursive: true });
  });
});

/* =============================================================== autorização contínua */

const STANDING_INPUT = { paths: ["docs/feature/", "docs/backlog/"], missionBudgets: { wallClockSeconds: 3600, iterations: 5, logReads: 10 }, confirmation: STANDING_PHRASE };
const MISSION = { id: "ms-001", type: "docs", title: "Registrar nota um", goal: "Registrar a primeira nota de teste.", paths: ["docs/feature/"], dependsOn: [], acceptance: ["a nota existe"] };

describe("autorização contínua (standing)", () => {
  it("cria com limites sob os tetos, escopo rotineiro e validade ≤ 30 dias", () => {
    const s = buildStanding(STANDING_INPUT);
    expect(s.scope.riskClasses).toEqual(["routine"]);
    expect(s.limits.maxMissions).toBeLessThanOrEqual(STANDING_CEILINGS.maxMissions);
    expect(() => validateStanding(s)).not.toThrow();
    for (const over of [{ maxMissions: STANDING_CEILINGS.maxMissions + 1 }, { mergesPerRun: 0 }, { wallClockSeconds: STANDING_CEILINGS.wallClockSeconds + 1 }, { maxAgentSessionsPerMission: 9 }]) {
      expect(codeOf(() => buildStanding({ ...STANDING_INPUT, limits: over })), JSON.stringify(over)).toBe("ST-LIMITS");
    }
    expect(codeOf(() => buildStanding({ ...STANDING_INPUT, expiresInDays: 31 }))).toBe("ST-INVALID");
    expect(codeOf(() => buildStanding({ ...STANDING_INPUT, missionBudgets: { commits: 999 } }))).toBe("ST-LIMITS");
  });

  it("o escopo permanente recusa curinga, raiz, control plane e QUALQUER caminho de risco elevado", () => {
    for (const p of ["*", "apps/", "docs/", "scripts/claude-x.mjs", ".github/workflows/", "docs/harness/", "../x/y"]) {
      expect(codeOf(() => buildStanding({ ...STANDING_INPUT, paths: [p] })), p).toBe("ST-INVALID");
    }
    for (const p of ["supabase/migrations/", "docs/decisions/", "apps/web/package.json", "apps/web/vitest.config.ts"]) {
      expect(codeOf(() => buildStanding({ ...STANDING_INPUT, paths: [p] })), p).toBe("ST-RISK");
    }
  });

  it("grava 0600/0700 sem sobrescrever, recarrega, fixa o hash e recusa symlink, modo inseguro e dono errado", () => {
    const dir = path.join(tmpdir(), "standing");
    const s = buildStanding(STANDING_INPUT);
    const { sha256, file } = writeStanding(s, { dir });
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
    expect(loadStanding({ dir, killFile: path.join(dir, "KILL"), expectedSha256: sha256 }).sha256).toBe(sha256);
    expect(codeOf(() => writeStanding(s, { dir }))).toBe("ST-INVALID");
    expect(codeOf(() => loadStanding({ dir, killFile: path.join(dir, "KILL"), expectedSha256: "0".repeat(64) }))).toBe("ST-HASH");
    fs.chmodSync(file, 0o660);
    expect(codeOf(() => loadStanding({ dir, killFile: path.join(dir, "KILL") }))).toBe("ST-MODE");
    fs.chmodSync(file, 0o600);
    expect(codeOf(() => loadStanding({ dir, killFile: path.join(dir, "KILL"), uid: process.getuid() + 1 }))).toBe("ST-MODE");
    // ampliar o escopo no meio da execução, mesmo com conteúdo válido, muda o hash e é recusado
    fs.writeFileSync(file, `${JSON.stringify({ ...s, scope: { paths: [...s.scope.paths, "docs/outro/"], riskClasses: ["routine"] } }, null, 2)}\n`);
    expect(codeOf(() => loadStanding({ dir, killFile: path.join(dir, "KILL"), expectedSha256: sha256 }))).toBe("ST-HASH");
    const other = path.join(tmpdir(), "x");
    fs.mkdirSync(other, { mode: 0o700 });
    fs.symlinkSync(dir, path.join(other, "standing"));
    expect(codeOf(() => loadStanding({ dir: path.join(other, "standing"), killFile: path.join(other, "KILL") }))).toBe("ST-MODE");
    expect(codeOf(() => loadStanding({ dir: path.join(tmpdir(), "nada"), killFile: path.join(other, "KILL") }))).toBe("ST-MISSING");
  });

  it("revogação (REVOKED, kill switch) e expiração interrompem a autorização", () => {
    const dir = path.join(tmpdir(), "standing");
    const kill = path.join(path.dirname(dir), "KILL-DELIVERY");
    const s = buildStanding(STANDING_INPUT);
    writeStanding(s, { dir });
    expect(() => loadStanding({ dir, killFile: kill })).not.toThrow();
    fs.writeFileSync(kill, "x");
    expect(codeOf(() => loadStanding({ dir, killFile: kill }))).toBe("ST-REVOKED");
    fs.rmSync(kill);
    revokeStanding({ dir });
    expect(codeOf(() => loadStanding({ dir, killFile: kill }))).toBe("ST-REVOKED");
    fs.rmSync(path.join(dir, "REVOKED"));
    expect(codeOf(() => loadStanding({ dir, killFile: kill, now: new Date(Date.now() + 31 * 86_400_000) }))).toBe("ST-EXPIRED");
  });

  it("deriva o registro de UMA missão: esquema do CR-033, vínculo por hash, validade ≤ a da autorização; recusa escopo fora e missão inválida", () => {
    const s = buildStanding(STANDING_INPUT);
    const sha = "c".repeat(64);
    const record = deriveMissionRecord({ standing: s, standingSha256: sha, mission: MISSION, baseSha: SHA_A });
    expect(() => validateRecord(record)).not.toThrow();
    expect(record.ref).toBe("ms-001");
    expect(record.branch).toMatch(/^agent\/docs\/ms-001(-[a-z0-9]+){1,3}$/);
    expect(record.confirmation).toBe(standingConfirmation(sha));
    expect(STANDING_CONFIRMATION.test(record.confirmation)).toBe(true);
    expect(record.paths).toEqual(["docs/feature/"]);
    expect(Date.parse(record.expiresAt)).toBeLessThanOrEqual(Date.parse(s.expiresAt));
    expect(codeOf(() => deriveMissionRecord({ standing: s, standingSha256: sha, mission: { ...MISSION, paths: ["docs/outro/"] }, baseSha: SHA_A }))).toBe("ST-SCOPE");
    expect(codeOf(() => deriveMissionRecord({ standing: s, standingSha256: sha, mission: { ...MISSION, paths: ["docs/feature/", "apps/web/"] }, baseSha: SHA_A }))).toBe("ST-SCOPE");
    expect(codeOf(() => deriveMissionRecord({ standing: s, standingSha256: sha, mission: { ...MISSION, paths: ["docs/harness/"] }, baseSha: SHA_A }))).toBe("ST-SCOPE");
    expect(codeOf(() => deriveMissionRecord({ standing: s, standingSha256: sha, mission: MISSION, baseSha: "main" }))).toBe("ST-MISSION");
    for (const bad of [{ ...MISSION, id: "cr-033" }, { ...MISSION, type: "release" }, { ...MISSION, title: "x" }, { ...MISSION, extra: 1 }, { ...MISSION, dependsOn: ["ms-001"] }, { ...MISSION, acceptance: [] }]) {
      expect(codeOf(() => validateMission(bad)), JSON.stringify(bad).slice(0, 60)).toBe("ST-MISSION");
    }
  });
});

/* ======================================================================= gates puros */

const GOOD_PR_RULE = { type: "pull_request", parameters: { required_approving_review_count: 0, require_code_owner_review: true, dismiss_stale_reviews_on_push: true, allowed_merge_methods: ["squash"] } };
const GOOD_RULES = [
  GOOD_PR_RULE, { type: "non_fast_forward" }, { type: "deletion" }, { type: "required_linear_history" },
  { type: "required_status_checks", parameters: { strict_required_status_checks_policy: true, required_status_checks: [{ context: "validate", integration_id: 15368 }, { context: "risk-gate", integration_id: 15368 }] } },
];
// estado administrativo registrado em AUTONOMOUS-BUILD §1.2: 1 aprovação, check validate, sem risk-gate
const TODAY_RULES = [
  { type: "pull_request", parameters: { required_approving_review_count: 1, dismiss_stale_reviews_on_push: true, allowed_merge_methods: ["squash"] } }, { type: "non_fast_forward" }, { type: "deletion" }, { type: "required_linear_history" },
  { type: "required_status_checks", parameters: { strict_required_status_checks_policy: true, required_status_checks: [{ context: "validate", integration_id: 15368 }] } },
];
const withRule = (rules, type, patch) => rules.map((r) => (r.type === type ? { ...r, parameters: { ...r.parameters, ...patch } } : r));
const without = (rules, type) => rules.filter((r) => r.type !== type);

describe("ruleset efetivo", () => {
  it("estado atual (1 aprovação) = review-required; a política nova = routine-capable", () => {
    expect(assessRuleset(TODAY_RULES)).toMatchObject({ mode: "review-required", approvals: 1 });
    expect(assessRuleset(GOOD_RULES)).toMatchObject({ mode: "routine-capable", approvals: 0 });
  });

  it("0 aprovações sem revisão do dono do código, sem risk-gate, sem squash exclusivo ou sem check estrito é UNSAFE", () => {
    const casos = [
      withRule(GOOD_RULES, "pull_request", { require_code_owner_review: false }),
      withRule(GOOD_RULES, "pull_request", { require_code_owner_review: undefined }),
      withRule(GOOD_RULES, "pull_request", { dismiss_stale_reviews_on_push: false }),
      withRule(GOOD_RULES, "pull_request", { allowed_merge_methods: ["squash", "merge"] }),
      withRule(GOOD_RULES, "pull_request", { allowed_merge_methods: undefined }),
      withRule(GOOD_RULES, "required_status_checks", { required_status_checks: [{ context: "validate" }] }),
      withRule(GOOD_RULES, "required_status_checks", { strict_required_status_checks_policy: false }),
      withRule(GOOD_RULES, "pull_request", { required_approving_review_count: -1 }),
      withRule(GOOD_RULES, "pull_request", { required_approving_review_count: "0" }),
      without(GOOD_RULES, "required_linear_history"), without(GOOD_RULES, "non_fast_forward"), without(GOOD_RULES, "deletion"), without(GOOD_RULES, "pull_request"), without(GOOD_RULES, "required_status_checks"),
    ];
    for (const [i, rules] of casos.entries()) expect(assessRuleset(rules).mode, `caso ${i}`).toBe("unsafe");
    expect(assessRuleset(null).mode).toBe("unsafe");
    expect(assessRuleset({}).mode).toBe("unsafe");
  });
});

const CHECKS_OK = [{ name: "validate", status: "completed", conclusion: "success" }, { name: "risk-gate", status: "completed", conclusion: "success" }];
const recordFor = (paths = ["docs/feature/"]) => ({ paths, budgets: { fixAttempts: 3 } });
const prOf = (over = {}) => ({
  number: 7, node_id: "PR_node_1234", state: "open", draft: false, merged: false, merge_commit_sha: null, title: "docs(feature): nota", labels: [], mergeable_state: "clean",
  head: { sha: SHA_A, ref: "agent/docs/ms-001-x-y", repo: { full_name: "cabralgava/oplyra" } }, base: { ref: "main" }, ...over,
});
const obsOf = (over = {}) => ({ pr: prOf(), checks: CHECKS_OK, files: [{ path: "docs/feature/a.md", status: "added" }], reviews: [], ruleset: { mode: "routine-capable", problems: [] }, ...over });
const ctxOf = (over = {}) => ({ record: recordFor(), branch: "agent/docs/ms-001-x-y", evidence: null, failures: {}, branchUpdates: 0, ...over });

describe("evidência de CI vale só para o SHA e some com falha ou mudança de SHA", () => {
  it("cria evidência só quando todos os obrigatórios estão success e nada está pendente", () => {
    expect(updateEvidence({ headSha: SHA_A, checks: CHECKS_OK }).evidence).toEqual({ sha: SHA_A, checks: { validate: "success", "risk-gate": "success" } });
    expect(updateEvidence({ headSha: SHA_A, checks: [CHECKS_OK[0]] }).evidence).toBeNull();
    expect(updateEvidence({ headSha: SHA_A, checks: [...CHECKS_OK, { name: "extra", status: "in_progress", conclusion: null }] }).evidence).toBeNull();
    expect(updateEvidence({ headSha: SHA_A, checks: [] }).evidence).toBeNull();
  });
  it("mudança de SHA invalida a evidência anterior (mesmo com tudo verde no novo SHA a evidência é nova)", () => {
    const first = updateEvidence({ headSha: SHA_A, checks: CHECKS_OK });
    const moved = updateEvidence({ evidence: first.evidence, headSha: SHA_B, checks: [{ name: "validate", status: "in_progress", conclusion: null }] });
    expect(moved.evidence).toBeNull();
    expect(moved.invalidated).toEqual({ reason: "sha-changed", was: SHA_A });
    const again = updateEvidence({ evidence: first.evidence, headSha: SHA_B, checks: CHECKS_OK });
    expect(again.evidence.sha).toBe(SHA_B);
    expect(again.invalidated.reason).toBe("sha-changed");
  });
  it("falha no mesmo SHA invalida a evidência e é contada por check e SHA", () => {
    const first = updateEvidence({ headSha: SHA_A, checks: CHECKS_OK });
    const failed = updateEvidence({ evidence: first.evidence, headSha: SHA_A, checks: [{ name: "validate", status: "completed", conclusion: "failure" }, CHECKS_OK[1]] });
    expect(failed.evidence).toBeNull();
    expect(failed.invalidated.reason).toBe("check-failed");
    expect(failed.failures).toEqual({ validate: [SHA_A] });
    const repeated = updateEvidence({ failures: failed.failures, headSha: SHA_A, checks: [{ name: "validate", status: "completed", conclusion: "failure" }] });
    expect(repeated.failures.validate).toEqual([SHA_A]);
    expect(updateEvidence({ failures: failed.failures, headSha: SHA_B, checks: [{ name: "validate", status: "completed", conclusion: "timed_out" }] }).failures.validate).toEqual([SHA_A, SHA_B]);
  });
});

describe("decisão de integração", () => {
  const d = (obs = obsOf(), ctx = ctxOf()) => decide(obs, ctx);

  it("tudo verde no SHA atual: merge com esse SHA", () => {
    const r = d();
    expect(r).toMatchObject({ action: "merge", sha: SHA_A });
    expect(r.evidenceUpdate.evidence.sha).toBe(SHA_A);
  });
  it("draft verde vira ready; ainda não merge", () => {
    expect(d(obsOf({ pr: prOf({ draft: true, mergeable_state: "draft" }) })).action).toBe("ready");
  });
  it("PR já integrado, fechado, de outra origem ou sem PR", () => {
    expect(d(obsOf({ pr: prOf({ merged: true, state: "closed", merge_commit_sha: SHA_B }) }))).toMatchObject({ action: "integrated", mergeSha: SHA_B });
    expect(d(obsOf({ pr: prOf({ state: "closed" }) }))).toMatchObject({ action: "blocked", code: "pr-closed" });
    expect(d(obsOf({ pr: prOf({ head: { sha: SHA_A, ref: "agent/docs/ms-001-x-y", repo: { full_name: "fork/oplyra" } } }) }))).toMatchObject({ code: "pr-identity" });
    expect(d(obsOf({ pr: prOf({ base: { ref: "release" } }) }))).toMatchObject({ code: "pr-identity" });
    expect(d(obsOf({ pr: prOf({ head: { sha: SHA_A, ref: "agent/docs/outra", repo: { full_name: "cabralgava/oplyra" } } }) }))).toMatchObject({ code: "pr-identity" });
    expect(d({ pr: null })).toMatchObject({ action: "blocked", code: "pr-missing" });
  });
  it("ruleset vigente aguarda revisão; ruleset inseguro bloqueia", () => {
    expect(d(obsOf({ ruleset: { mode: "review-required", approvals: 1, problems: [] } }))).toMatchObject({ action: "owner", code: "review-required" });
    expect(d(obsOf({ ruleset: { mode: "unsafe", problems: ["x"] } }))).toMatchObject({ code: "ruleset-unsafe" });
  });
  it("risco elevado, arquivo fora do escopo, rótulo hold e pedido de alterações vão ao proprietário ou bloqueiam", () => {
    expect(d(obsOf({ files: [{ path: "docs/feature/a.md", status: "added" }, { path: ".github/workflows/ci.yml", status: "modified" }] }))).toMatchObject({ action: "owner", code: "elevated" });
    expect(d(obsOf({ files: [{ path: "supabase/migrations/1.sql", status: "added" }] }))).toMatchObject({ action: "owner", code: "elevated" });
    expect(d(obsOf({ files: [{ path: "docs/feature/a.md", status: "added" }, { path: "test/a.test.ts", status: "removed" }] }))).toMatchObject({ action: "owner", code: "elevated" });
    expect(d(obsOf({ files: [{ path: "docs/outro/a.md", status: "added" }] }))).toMatchObject({ action: "blocked", code: "scope" });
    expect(d(obsOf({ files: [] }))).toMatchObject({ action: "blocked", code: "files-empty" });
    expect(d(obsOf({ pr: prOf({ labels: [HOLD_LABEL] }) }))).toMatchObject({ action: "owner", code: "hold" });
    expect(d(obsOf({ reviews: [{ state: "CHANGES_REQUESTED", user: "dono", submitted_at: "2026-10-04T10:00:00Z" }] }))).toMatchObject({ action: "owner", code: "changes-requested" });
    // o mesmo revisor aprovou depois: o pedido de alterações deixa de valer
    expect(d(obsOf({ reviews: [{ state: "CHANGES_REQUESTED", user: "dono", submitted_at: "2026-10-04T10:00:00Z" }, { state: "APPROVED", user: "dono", submitted_at: "2026-10-04T11:00:00Z" }] })).action).toBe("merge");
    expect(d(obsOf({ files: Array.from({ length: 301 }, (_, i) => ({ path: `docs/feature/${i}.md`, status: "added" })) }))).toMatchObject({ action: "owner" });
  });
  it("CI: pendente espera; check obrigatório ausente espera; falha pede correção; orçamento de correção esgotado bloqueia", () => {
    expect(d(obsOf({ checks: [CHECKS_OK[0], { name: "risk-gate", status: "in_progress", conclusion: null }] })).action).toBe("wait");
    expect(d(obsOf({ checks: [CHECKS_OK[0]] })).action).toBe("wait");
    expect(d(obsOf({ checks: [] })).action).toBe("wait");
    for (const conclusion of ["failure", "cancelled", "timed_out", "action_required", "startup_failure"]) {
      expect(d(obsOf({ checks: [{ name: "validate", status: "completed", conclusion }, CHECKS_OK[1]] })), conclusion).toMatchObject({ action: "fix", checks: ["validate"] });
    }
    // check neutro/skipped de outro job não impede, mas os obrigatórios precisam estar success
    expect(d(obsOf({ checks: [...CHECKS_OK, { name: "docs", status: "completed", conclusion: "skipped" }] })).action).toBe("merge");
    expect(d(obsOf({ checks: [{ name: "validate", status: "completed", conclusion: "neutral" }, CHECKS_OK[1]] })).action).toBe("wait");
    const shas = ["1", "2", "3", "4"].map((c) => c.repeat(40));
    // fixAttempts = 3: três SHAs com falha ainda permitem correção; a quarta falha distinta bloqueia
    const failing = obsOf({ checks: [{ name: "validate", status: "completed", conclusion: "failure" }, CHECKS_OK[1]] });
    expect(d(failing, ctxOf({ failures: { validate: shas.slice(0, 2) } }))).toMatchObject({ action: "fix" });
    expect(d(failing, ctxOf({ failures: { validate: shas.slice(0, 3) } }))).toMatchObject({ action: "blocked", code: "fix-budget" });
  });
  it("mergeabilidade: behind atualiza (com limite), dirty bloqueia, unknown espera, blocked bloqueia", () => {
    expect(d(obsOf({ pr: prOf({ mergeable_state: "behind" }) })).action).toBe("update-branch");
    expect(d(obsOf({ pr: prOf({ mergeable_state: "behind" }) }), ctxOf({ branchUpdates: MAX_BRANCH_UPDATES }))).toMatchObject({ action: "blocked", code: "update-budget" });
    expect(d(obsOf({ pr: prOf({ mergeable_state: "dirty" }) }))).toMatchObject({ action: "blocked", code: "conflict" });
    expect(d(obsOf({ pr: prOf({ mergeable_state: "unknown" }) })).action).toBe("wait");
    expect(d(obsOf({ pr: prOf({ mergeable_state: "blocked" }) }))).toMatchObject({ action: "blocked", code: "protected-blocked" });
    expect(d(obsOf({ pr: prOf({ mergeable_state: "mystery" }) }))).toMatchObject({ action: "blocked", code: "mergeable-state" });
  });
  it("evidência de um SHA antigo nunca autoriza o merge de outro: o merge exige evidência do head ATUAL", () => {
    const old = { sha: SHA_B, checks: { validate: "success", "risk-gate": "success" } };
    const r = d(obsOf(), ctxOf({ evidence: old }));
    expect(r).toMatchObject({ action: "merge", sha: SHA_A });
    expect(r.evidenceUpdate.invalidated).toEqual({ reason: "sha-changed", was: SHA_B });
    // CI do novo SHA ainda pendente: espera, sem herdar a evidência do SHA anterior
    const pending = d(obsOf({ checks: [{ name: "validate", status: "in_progress", conclusion: null }] }), ctxOf({ evidence: old }));
    expect(pending.action).toBe("wait");
    expect(pending.evidenceUpdate.evidence).toBeNull();
  });
  it("os checks obrigatórios são exatamente validate e risk-gate", () => {
    expect([...REQUIRED_CHECKS]).toEqual(["validate", "risk-gate"]);
  });
});

/* ============================================================ adaptador GitHub (integração) */

const { privateKey: PEM } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const KEYS = () => ({ appId: "1", installationId: "2", botLogin: "oplyra-agent[bot]", botId: "3", privateKey: PEM });
const TOKEN = `ghs_${"Z".repeat(36)}`;

function recordingHttp(handler) {
  const calls = [];
  const fn = async (req) => {
    calls.push(req);
    expect(integrateEndpointAllowed(req.method, req.path), `${req.method} ${req.path}`).toBe(true);
    if (req.method === "POST" && /access_tokens$/.test(req.path)) return { status: 201, json: { token: TOKEN, permissions: { ...EXPECTED_PERMISSIONS }, repository_selection: "selected", repositories: [{ full_name: "cabralgava/oplyra" }] } };
    return handler(req);
  };
  fn.calls = calls;
  return fn;
}

describe("adaptador GitHub da integração", () => {
  it("lista fechada de endpoints: sem delete de branch, sem close, sem rerun, sem merge de outro método", () => {
    const R = "/repos/cabralgava/oplyra";
    for (const [m, p] of [["PUT", `${R}/pulls/7/merge`], ["PUT", `${R}/pulls/7/update-branch`], ["POST", "/graphql"], ["GET", `${R}/pulls/7`], ["GET", `${R}/pulls/7/files?per_page=100&page=2`], ["GET", `${R}/rules/branches/main`]]) {
      expect(integrateEndpointAllowed(m, p), `${m} ${p}`).toBe(true);
    }
    for (const [m, p] of [["DELETE", `${R}/git/refs/heads/agent/x`], ["PATCH", `${R}/pulls/7`], ["POST", `${R}/actions/runs/1/rerun`], ["PUT", `${R}/pulls/7/merge/x`], ["GET", `${R}/pulls/7/files?per_page=100&page=9`], ["PUT", "/repos/outro/repo/pulls/7/merge"], ["POST", `${R}/pulls/7/reviews`], ["PUT", `${R}/rulesets/1`], ["DELETE", `${R}/pulls/7/merge`]]) {
      expect(integrateEndpointAllowed(m, p), `${m} ${p}`).toBe(false);
    }
  });

  it("merge: sempre squash com o SHA esperado; 409 = head mudou; 405 = não integrável; falha de rede é distinta de recusa", async () => {
    const http = recordingHttp((req) => ({ status: 200, json: { merged: true, sha: SHA_B } }));
    const gh = createIntegrator({ http, keys: KEYS });
    expect(await gh.merge(7, { sha: SHA_A, title: "docs(feature): nota", message: "m" })).toEqual({ merged: true, sha: SHA_B });
    const put = http.calls.find((c) => c.method === "PUT");
    expect(put.body).toMatchObject({ merge_method: "squash", sha: SHA_A, commit_title: "docs(feature): nota (#7)" });
    expect(Object.keys(put.body).sort()).toEqual(["commit_message", "commit_title", "merge_method", "sha"]);
    const mk = (status, json) => createIntegrator({ http: recordingHttp(() => ({ status, json })), keys: KEYS });
    const reject = async (g, args) => g.merge(7, args).then(() => "OK", (e) => (e instanceof IntegrateError ? e.code : `INESPERADO:${e.message}`));
    expect(await reject(mk(409, { message: "Head branch was modified" }), { sha: SHA_A, title: "docs(feature): nota", message: "m" })).toBe("head-moved");
    expect(await reject(mk(405, { message: "Pull Request is not mergeable" }), { sha: SHA_A, title: "docs(feature): nota", message: "m" })).toBe("not-mergeable");
    expect(await reject(mk(500, null), { sha: SHA_A, title: "docs(feature): nota", message: "m" })).toBe("http");
    expect(await reject(createIntegrator({ http: recordingHttp(() => { throw new Error("ETIMEDOUT"); }), keys: KEYS }), { sha: SHA_A, title: "docs(feature): nota", message: "m" })).toBe("network");
    // argumentos inválidos nunca chegam à rede
    expect(await reject(mk(200, { merged: true }), { sha: "main", title: "docs(feature): nota", message: "m" })).toBe("merge-args");
    expect(await reject(mk(200, { merged: true }), { sha: SHA_A, title: "título sem tipo", message: "m" })).toBe("merge-args");
  });

  it("ready-for-review: mutação GraphQL fixa e confirmação de isDraft=false", async () => {
    const http = recordingHttp(() => ({ status: 200, json: { data: { markPullRequestReadyForReview: { pullRequest: { number: 7, isDraft: false } } } } }));
    const gh = createIntegrator({ http, keys: KEYS });
    expect(await gh.markReady("PR_node_1234")).toBe(true);
    const call = http.calls.find((c) => c.path === "/graphql");
    expect(call.body).toEqual({ query: READY_MUTATION, variables: { id: "PR_node_1234" } });
    expect(READY_MUTATION).not.toMatch(/merge|close|delete/i);
    const bad = (json) => createIntegrator({ http: recordingHttp(() => ({ status: 200, json })), keys: KEYS }).markReady("PR_node_1234").then(() => "OK", (e) => e.code);
    expect(await bad({ errors: [{ message: "x" }] })).toBe("ready");
    expect(await bad({ data: { markPullRequestReadyForReview: { pullRequest: { number: 7, isDraft: true } } } })).toBe("ready");
    expect(await createIntegrator({ http, keys: KEYS }).markReady("x y; drop").then(() => "OK", (e) => e.code)).toBe("node-id");
  });

  it("token: exatamente as permissões e o repositório esperados; qualquer excesso recusa antes de usar", async () => {
    const mkTok = (over) => createIntegrator({
      http: async () => ({ status: 201, json: { token: TOKEN, permissions: { ...EXPECTED_PERMISSIONS }, repository_selection: "selected", repositories: [{ full_name: "cabralgava/oplyra" }], ...over } }),
      keys: KEYS,
    }).readRules().then(() => "OK", (e) => e.code);
    expect(await mkTok({ permissions: { ...EXPECTED_PERMISSIONS, administration: "write" } })).toBe("permissions");
    expect(await mkTok({ permissions: { ...EXPECTED_PERMISSIONS, contents: "read" } })).toBe("permissions");
    expect(await mkTok({ repository_selection: "all" })).toBe("permissions");
    expect(await mkTok({ repositories: [{ full_name: "cabralgava/outro" }] })).toBe("permissions");
  });

  it("busca por branch recusa nome inválido e mais de um PR; arquivos renomeados contam os dois caminhos", async () => {
    const dup = createIntegrator({ http: recordingHttp(() => ({ status: 200, json: [{ number: 1 }, { number: 2 }] })), keys: KEYS });
    expect(await dup.findPrByBranch("agent/docs/ms-001-x-y").then(() => "OK", (e) => e.code)).toBe("duplicate-pr");
    expect(await dup.findPrByBranch("main").then(() => "OK", (e) => e.code)).toBe("branch");
    expect(await dup.findPrByBranch("agent/../x?y").then(() => "OK", (e) => e.code)).toBe("branch");
    const files = createIntegrator({ http: recordingHttp(() => ({ status: 200, json: [{ filename: "docs/b.md", status: "renamed", previous_filename: "test/a.test.ts" }] })), keys: KEYS });
    expect(await files.readFiles(7)).toEqual([{ path: "docs/b.md", status: "renamed" }, { path: "test/a.test.ts", status: "removed" }]);
    expect(classifyChange(await files.readFiles(7)).risk).toBe("elevated");
  });

  it("o token nunca aparece em segredos impressos: fica no conjunto de redação e não no resultado", async () => {
    const gh = createIntegrator({ http: recordingHttp(() => ({ status: 200, json: [] })), keys: KEYS });
    await gh.readRules().catch(() => {});
    expect([...gh.secrets]).toContain(TOKEN);
    const auth = await gh.gitAuth();
    expect(auth.GIT_CONFIG_KEY_0).toBe("http.https://github.com/.extraheader");
    expect(JSON.stringify(Object.keys(auth))).not.toContain(TOKEN);
  });
});

/* ============================================================ ajuste administrativo (owner) */

const CURRENT = {
  id: 24384328, name: "main-protection", target: "branch", enforcement: "active", source_type: "Repository", created_at: "x",
  conditions: { ref_name: { include: ["~DEFAULT_BRANCH"], exclude: [] } }, bypass_actors: [],
  rules: [
    { type: "pull_request", parameters: { required_approving_review_count: 1, dismiss_stale_reviews_on_push: true, require_code_owner_review: false, require_last_push_approval: false, required_review_thread_resolution: true, allowed_merge_methods: ["squash"] } },
    { type: "non_fast_forward" }, { type: "deletion" }, { type: "required_linear_history" },
    { type: "required_status_checks", parameters: { strict_required_status_checks_policy: true, do_not_enforce_on_create: false, required_status_checks: [{ context: "validate", integration_id: 15368 }] } },
  ],
};

describe("ajuste administrativo do ruleset", () => {
  it("o plano muda o mínimo, preserva o resto, não adiciona bypass e resulta em routine-capable", () => {
    const plan = planRuleset(CURRENT);
    expect(plan.before.mode).toBe("review-required");
    expect(plan.assessment.mode).toBe("routine-capable");
    const pr = plan.next.rules.find((r) => r.type === "pull_request").parameters;
    expect(pr).toMatchObject({ required_approving_review_count: 0, require_code_owner_review: true, dismiss_stale_reviews_on_push: true, allowed_merge_methods: ["squash"], required_review_thread_resolution: true, require_last_push_approval: false });
    const checks = plan.next.rules.find((r) => r.type === "required_status_checks").parameters;
    expect(checks.required_status_checks).toEqual([{ context: "validate", integration_id: 15368 }, { context: "risk-gate", integration_id: 15368 }]);
    expect(checks.strict_required_status_checks_policy).toBe(true);
    expect(checks.do_not_enforce_on_create).toBe(false);
    expect(plan.next.bypass_actors).toEqual([]);
    expect(Object.keys(plan.next).sort()).toEqual(["bypass_actors", "conditions", "enforcement", "name", "rules", "target"]);
    expect(plan.next.rules.map((r) => r.type)).toEqual(CURRENT.rules.map((r) => r.type));
    // não muta a entrada
    expect(CURRENT.rules[0].parameters.required_approving_review_count).toBe(1);
  });
  it("recusa ruleset inativo, sem validate ou ilegível", () => {
    expect(() => planRuleset({ ...CURRENT, enforcement: "evaluate" })).toThrow();
    expect(() => planRuleset({ ...CURRENT, rules: CURRENT.rules.filter((r) => r.type !== "required_status_checks") })).toThrow();
    expect(() => planRuleset(null)).toThrow();
  });

  function ghFake({ riskGateOk = true, current = CURRENT } = {}) {
    const calls = [];
    const gh = (args, input) => {
      calls.push({ args, input });
      const url = args.find((a) => a.startsWith("repos/"));
      const ok = (json) => ({ status: 0, stdout: JSON.stringify(json), stderr: "" });
      if (args.includes("PUT")) return { status: 0, stdout: "{}", stderr: "" };
      if (url.endsWith("/rulesets")) return ok([{ id: current.id, name: current.name, target: "branch" }]);
      if (url.endsWith(`/rulesets/${current.id}`)) return ok(current);
      if (url.endsWith("/commits/main")) return ok({ sha: SHA_A });
      if (url.includes("/check-runs")) return ok({ check_runs: riskGateOk ? [{ name: "risk-gate", status: "completed", conclusion: "success" }] : [] });
      return { status: 1, stdout: "", stderr: "" };
    };
    gh.calls = calls;
    return gh;
  }
  const io = (over = {}) => {
    const out: string[] = [];
    return { out, write: (s) => out.push(s), isTTY: true, env: {}, backupDir: path.join(tmpdir(), "admin"), now: new Date("2026-10-04T12:00:00Z"), ...over };
  };

  it("plan é somente leitura (nenhum PUT)", async () => {
    const gh = ghFake();
    const o = io();
    expect(await admin({ ...o, gh, argv: ["ruleset-plan"] })).toBe(0);
    expect(gh.calls.some((c) => c.args.includes("PUT"))).toBe(false);
    expect(o.out.join("")).toContain("modo=routine-capable");
  });
  it("apply: exige terminal, frase digitada e risk-gate já verde em main; grava backup ANTES do PUT e permite desfazer", async () => {
    const o = io();
    expect(await admin({ ...o, gh: ghFake(), isTTY: false, argv: ["ruleset-apply"], confirm: async () => APPLY_PHRASE })).toBe(2);
    expect(await admin({ ...o, gh: ghFake(), argv: ["ruleset-apply"], confirm: async () => "sim" })).toBe(2);
    const noGate = ghFake({ riskGateOk: false });
    expect(await admin({ ...o, gh: noGate, argv: ["ruleset-apply"], confirm: async () => APPLY_PHRASE })).toBe(2);
    expect(noGate.calls.some((c) => c.args.includes("PUT"))).toBe(false);
    expect(o.out.join("")).toContain("risk-gate ainda não passou");
    const gh = ghFake();
    expect(await admin({ ...o, gh, argv: ["ruleset-apply"], confirm: async () => APPLY_PHRASE })).toBe(0);
    const put = gh.calls.find((c) => c.args.includes("PUT"));
    expect(put.args).toContain("repos/cabralgava/oplyra/rulesets/24384328");
    expect(JSON.parse(put.input).rules.find((r) => r.type === "pull_request").parameters.required_approving_review_count).toBe(0);
    const backups = fs.readdirSync(o.backupDir);
    expect(backups).toHaveLength(1);
    expect(fs.statSync(path.join(o.backupDir, backups[0])).mode & 0o777).toBe(0o600);
    expect(JSON.parse(fs.readFileSync(path.join(o.backupDir, backups[0]), "utf8")).ruleset.rules[0].parameters.required_approving_review_count).toBe(1);
    // desfazer: devolve exatamente o conteúdo salvo
    const undo = ghFake();
    expect(await admin({ ...o, gh: undo, argv: ["ruleset-rollback", path.join(o.backupDir, backups[0])], confirm: async () => ROLLBACK_PHRASE })).toBe(0);
    const restored = JSON.parse(undo.calls.find((c) => c.args.includes("PUT")).input);
    expect(restored.rules[0].parameters.required_approving_review_count).toBe(1);
    expect(restored.rules.find((r) => r.type === "required_status_checks").parameters.required_status_checks).toEqual([{ context: "validate", integration_id: 15368 }]);
    expect(await admin({ ...o, gh: undo, argv: ["ruleset-rollback", "/tmp/qualquer.json"], confirm: async () => ROLLBACK_PHRASE })).toBe(2);
  });
  it("nunca roda dentro de uma sessão de agente nem com argumentos fora da gramática", async () => {
    expect(await admin({ ...io(), gh: ghFake(), env: { CLAUDECODE: "1" }, argv: ["ruleset-plan"] })).toBe(2);
    expect(await admin({ ...io(), gh: ghFake(), argv: ["ruleset-plan", "--force"] })).toBe(2);
    expect(await admin({ ...io(), gh: ghFake(), argv: ["delete-ruleset"] })).toBe(2);
    expect(await admin({ ...io(), gh: ghFake(), argv: [] })).toBe(2);
  });
});
