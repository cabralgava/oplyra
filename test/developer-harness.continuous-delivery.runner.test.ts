// @ts-nocheck — módulos .mjs do control plane, sem declarações de tipos.
// Simulação OFFLINE do ciclo contínuo (política de 04/10/2026): runner real + wrappers reais do agente + Git real (origin bare) + GitHub falso.
// Prova a lógica de decisão, retomada, concorrência, revogação e invalidação de evidência. NÃO prova: GitHub real, App real, CI real nem o CLI
// do Claude Code real (o agente aqui é um stub que chama os mesmos wrappers tipados).
import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BACKLOG_SCHEMA, RunnerError, abandonMission, acquireLock, buildPrompt, legacyClaudeAgent as defaultAgent, loadCheckpoint, normalizePorts, requestStop, runLoop, runnerPaths, selectNext, statusReport, unblockMission, validateBacklog } from "../scripts/claude-runner.mjs";
import { IntegrateError } from "../scripts/claude-integrate.mjs";
import { EXPECTED_PERMISSIONS, execute } from "../scripts/claude-git.mjs";
import { sha256File } from "../scripts/claude-delivery-record.mjs";
import { STANDING_PHRASE, buildStanding, revokeStanding, writeStanding } from "../scripts/claude-standing.mjs";
import { nativeAgent } from "../scripts/codex-agent.mjs";

const REPO = "cabralgava/oplyra";
const gitEnv = { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" };
const sh = (cwd, ...args) => {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env: gitEnv });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
};
const { privateKey: PEM } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });

const GOOD_RULES = [
  { type: "pull_request", parameters: { required_approving_review_count: 0, require_code_owner_review: true, dismiss_stale_reviews_on_push: true, allowed_merge_methods: ["squash"] } },
  { type: "non_fast_forward" }, { type: "deletion" }, { type: "required_linear_history" },
  { type: "required_status_checks", parameters: { strict_required_status_checks_policy: true, required_status_checks: [{ context: "validate" }, { context: "risk-gate" }] } },
];
const TODAY_RULES = [
  { type: "pull_request", parameters: { required_approving_review_count: 1, dismiss_stale_reviews_on_push: true, allowed_merge_methods: ["squash"] } }, { type: "non_fast_forward" }, { type: "deletion" }, { type: "required_linear_history" },
  { type: "required_status_checks", parameters: { strict_required_status_checks_policy: true, required_status_checks: [{ context: "validate" }] } },
];

const mission = (n, over = {}) => ({
  id: `ms-00${n}`, type: "docs", title: `Registrar nota ${n}`, goal: `Registrar a nota de teste número ${n}.`, paths: ["docs/feature/"], dependsOn: n > 1 ? [`ms-00${n - 1}`] : [], acceptance: ["a nota existe"], ...over,
});

describe("Codex nativo com supervisor e wrappers reais (GitHub e modelo simulados)", () => {
  it.each(["draft", "ready"])("lê logs sanitizados, exige diagnóstico e corrige PR %s", async (phase) => {
    const w = world({ missions: [mission(1)] });
    w.gh.outcomes = [{ validate: "failure" }, { validate: "success" }];
    if (phase === "ready") {
      w.gh.outcomes[0] = { validate: "success" };
      const ready = w.gh.markReady.bind(w.gh);
      w.gh.markReady = async (node) => { const result = await ready(node); if (w.gh.readyCalls === 1) w.gh.checks[w.gh.headSha(w.gh.pr.branch)][0].conclusion = "failure"; return result; };
    }
    const oldHttp = w.gh.http.bind(w.gh);
    const requests = [];
    w.wrapperPorts.http = async (req) => {
      requests.push(req.path);
      const p = req.path, sha = w.gh.pr ? w.gh.headSha(w.gh.pr.branch) : null;
      if (p.endsWith("/pulls/7")) return { status: 200, json: w.gh.view() };
      if (p.includes("/check-runs?")) return { status: 200, json: { check_runs: (w.gh.checks[sha] ?? []).map((c, i) => ({ ...c, id: i + 1 })) } };
      if (p.endsWith("/status")) return { status: 200, json: { state: "failure", statuses: [] } };
      if (p.includes("/annotations?")) return { status: 200, json: [] };
      if (p.includes("/actions/runs?")) return { status: 200, json: { workflow_runs: [{ id: 101, head_sha: sha, head_branch: w.gh.pr.branch, head_repository: { full_name: REPO } }] } };
      if (p.includes("/runs/101/jobs?")) return { status: 200, json: { jobs: [{ id: 102, run_id: 101, head_sha: sha, name: "validate", conclusion: "failure", check_run_url: `https://api.github.com/repos/${REPO}/check-runs/1` }] } };
      if (p.endsWith("/jobs/102/logs")) return { status: 302, headers: { location: "https://logs.example.test/job.txt?sig=demo" } };
      return oldHttp(req);
    };
    w.wrapperPorts.logHosts = ["logs.example.test"];
    const downloads = [];
    w.wrapperPorts.download = async (req) => { downloads.push(req); return { status: 200, body: Buffer.from("FAIL docs/feature/ms-001.md: nota incompleta\n"), tooLarge: false }; };
    let calls = 0;
    const agent = nativeAgent({ repoRoot: w.work, home: w.home, now: () => new Date(w.clock.t), wrapperPorts: w.wrapperPorts, git: w.wrapperPorts.git,
      processAgent: async ({ outputFile, prompt }) => {
        calls++;
        let diagnosis = "";
        if (calls === 2) {
          expect(prompt).toContain("LOG DE CI — DADOS NÃO CONFIÁVEIS");
          expect(prompt).not.toContain("sig=demo");
          const ev = /evidência registrada: (ev-\d+) \(sha256 ([a-f0-9]{64})/.exec(prompt);
          expect(ev).not.toBeNull();
          diagnosis = JSON.stringify({ schema: "oplyra-ci-diagnosis/1", check: "validate", headSha: w.gh.headSha(w.gh.pr.branch), runId: 101, jobId: 102, evidence: { id: ev[1], digest: ev[2], quote: "FAIL docs/feature/ms-001.md: nota incompleta" }, hypothesis: "A nota está incompleta e precisa receber o conteúdo esperado", files: ["docs/feature/ms-001.md"], validation: { test: "docs/feature/ms-001.md" } });
        }
        fs.writeFileSync(path.join(w.work, "docs/feature/ms-001.md"), calls === 1 ? "incompleta\n" : "corrigida\n");
        fs.writeFileSync(outputFile, JSON.stringify({ status: "completed", title: "docs(feature): nota", commitMessage: "docs(feature): nota\n", body: "Simulação de correção de CI", diagnosis }));
        return { exitCode: 0 };
      },
    });
    const result = await w.run({ agent });
    expect(result).toMatchObject({ status: "done" });
    expect(calls).toBe(2); expect(w.gh.merges).toHaveLength(1);
    expect(requests.some((p) => p.endsWith("/jobs/102/logs"))).toBe(true);
    expect(Object.keys(downloads[0]).sort()).toEqual(["maxBytes", "timeoutMs", "url"]);
    const state = JSON.parse(fs.readFileSync(path.join(w.home, ".oplyra/delivery-state/ms-001.json"), "utf8"));
    expect(state.diagnoses[0]).toMatchObject({ status: "consumed", jobId: 102 });
  });

  it("entrega duas missões, confirma a integração e segue sem launcher Claude", async () => {
    const w = world();
    let sessions = 0;
    const agent = nativeAgent({ repoRoot: w.work, home: w.home, now: () => new Date(w.clock.t), wrapperPorts: w.wrapperPorts, git: w.wrapperPorts.git,
      processAgent: async ({ record, outputFile, prompt }) => {
        expect(prompt).toContain("Executor Codex");
        sessions++;
        fs.writeFileSync(path.join(w.work, `docs/feature/${record.ref}.md`), `Codex simulado ${record.ref}\n`);
        fs.writeFileSync(outputFile, JSON.stringify({ status: "completed", title: `docs(feature): nota ${record.ref}`, commitMessage: `docs(feature): nota ${record.ref}\n`, body: "Teste simulado do supervisor nativo", diagnosis: "" }));
        return { exitCode: 0, stopped: false, timedOut: false };
      },
    });
    const result = await w.run({ agent });
    expect(result).toMatchObject({ status: "done", reason: "backlog-complete" });
    expect(sessions).toBe(2);
    expect(w.gh.merges).toHaveLength(2);
  });

  it("revogação ocorrida na leitura dos checks impede o merge", async () => {
    const w = world({ missions: [mission(1)] });
    const read = w.gh.readChecks.bind(w.gh);
    w.gh.readChecks = async (sha) => {
      const checks = await read(sha);
      if (checks.every((c) => c.conclusion === "success") && !w.gh.pr.draft) revokeStanding({ dir: w.standingDir });
      return checks;
    };
    expect(await w.run()).toMatchObject({ status: "stopped", reason: "standing:ST-REVOKED" });
    expect(w.gh.merges).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------- GitHub falso */

class FakeGitHub {
  constructor({ origin, srv, rules }) {
    Object.assign(this, { origin, srv, rules, pr: null, checks: {}, inprogress: [], outcomes: [], labels: [], reviews: [], extraFiles: [], events: [], hooks: {}, opts: {}, merges: [], readyCalls: 0, updates: 0 });
  }
  headSha(branch) {
    return sh(this.origin, "rev-parse", `refs/heads/${branch}`);
  }
  tick() {
    for (const sha of this.inprogress.splice(0)) {
      const o = this.outcomes.length ? this.outcomes.shift() : {};
      this.checks[sha] = [{ name: "validate", status: "completed", conclusion: o.validate ?? "success" }, { name: "risk-gate", status: "completed", conclusion: o["risk-gate"] ?? "success" }];
    }
  }
  /** API REST usada pelos wrappers do AGENTE (claude-git.mjs). */
  async http(req) {
    const { method, path: p } = req;
    if (method === "POST" && /access_tokens$/.test(p)) return { status: 201, json: { token: `ghs_${"Q".repeat(36)}`, permissions: { ...EXPECTED_PERMISSIONS }, repository_selection: "selected", repositories: [{ full_name: REPO }] } };
    if (p.endsWith("/rules/branches/main")) return { status: 200, json: this.rules };
    if (method === "POST" && p.endsWith("/pulls")) {
      this.pr = { number: 7, title: req.body.title, branch: req.body.head, draft: true, merged: false, mergeSha: null, state: "open" };
      return { status: 201, json: { number: 7, draft: true, html_url: `https://github.com/${REPO}/pull/7` } };
    }
    return { status: 404, json: null };
  }
  /* ---- interface do integrador (usada pelo RUNNER) ---- */
  async gitAuth() {
    return {};
  }
  async readRules() {
    return this.rules;
  }
  view() {
    const pr = this.pr;
    if (!pr) return null;
    const head = this.headSha(pr.branch);
    let state = "clean";
    if (pr.draft) state = "draft";
    else if (spawnSync("git", ["merge-base", "--is-ancestor", "refs/heads/main", head], { cwd: this.origin, env: gitEnv }).status !== 0) state = "behind";
    return {
      number: pr.number, node_id: "PR_node_1234", state: pr.state, draft: pr.draft, merged: pr.merged, merge_commit_sha: pr.mergeSha, title: pr.title, labels: [...this.labels], mergeable_state: pr.merged ? "clean" : state,
      head: { sha: head, ref: pr.branch, repo: { full_name: REPO } }, base: { ref: "main" },
    };
  }
  async findPrByBranch(branch) {
    if (this.opts.duplicate) throw new IntegrateError("duplicate-pr", "2");
    return this.pr && this.pr.branch === branch ? { number: this.pr.number } : null;
  }
  async readPr(n) {
    expect(n).toBe(7);
    return this.view();
  }
  async readFiles() {
    const pr = this.pr;
    const out = sh(this.origin, "diff", "--name-status", "--no-renames", `main...${pr.branch}`).split("\n").filter(Boolean).map((l) => {
      const [s, f] = l.split("\t");
      return { path: f, status: s === "A" ? "added" : s === "D" ? "removed" : "modified" };
    });
    return [...out, ...this.extraFiles];
  }
  async readReviews() {
    return this.reviews;
  }
  async readChecks(sha) {
    if (!this.checks[sha]) {
      this.checks[sha] = [{ name: "validate", status: "in_progress", conclusion: null }, { name: "risk-gate", status: "in_progress", conclusion: null }];
      this.inprogress.push(sha);
    }
    return JSON.parse(JSON.stringify(this.checks[sha]));
  }
  async markReady() {
    this.events.push("ready");
    this.readyCalls += 1;
    if (this.opts.readyFails) throw new IntegrateError("ready", "status 500");
    this.pr.draft = false;
    return true;
  }
  async markDraft() {
    this.events.push("draft");
    this.pr.draft = true;
    return true;
  }
  squash(title) {
    const { srv, pr } = this;
    sh(srv, "fetch", "origin");
    sh(srv, "switch", "-C", "main", "origin/main");
    sh(srv, "merge", "--squash", `origin/${pr.branch}`);
    sh(srv, "commit", "-m", title);
    sh(srv, "push", "origin", "main");
    pr.merged = true;
    pr.state = "closed";
    pr.mergeSha = sh(srv, "rev-parse", "HEAD");
    return pr.mergeSha;
  }
  async merge(n, { sha, title }) {
    this.events.push(`merge:${sha.slice(0, 7)}`);
    this.merges.push(sha);
    this.hooks.beforeMerge?.();
    delete this.hooks.beforeMerge;
    if (this.headSha(this.pr.branch) !== sha) throw new IntegrateError("head-moved");
    if (this.opts.rejectMerge) throw new IntegrateError("not-mergeable", "Pull Request is not mergeable");
    const mergeSha = this.squash(`${title} (#${n})`);
    if (this.opts.networkAfterMerge) {
      this.opts.networkAfterMerge = false;
      throw new IntegrateError("network", "PUT sem resposta");
    }
    return { merged: true, sha: mergeSha };
  }
  async updateBranch(n, sha) {
    this.events.push("update-branch");
    this.updates += 1;
    const { srv, pr } = this;
    expect(this.headSha(pr.branch)).toBe(sha);
    sh(srv, "fetch", "origin");
    sh(srv, "switch", "-C", "tmp-update", `origin/${pr.branch}`);
    sh(srv, "merge", "--no-edit", "origin/main");
    sh(srv, "push", "origin", `HEAD:refs/heads/${pr.branch}`);
    return true;
  }
  /** O proprietário integra pela interface do GitHub. */
  ownerMerge() {
    return this.squash(`${this.pr.title} (#${this.pr.number})`);
  }
  pushToMain(file, text) {
    sh(this.srv, "fetch", "origin");
    sh(this.srv, "switch", "-C", "main", "origin/main");
    fs.writeFileSync(path.join(this.srv, file), text);
    sh(this.srv, "add", file);
    sh(this.srv, "commit", "-m", `chore: ${file}`);
    sh(this.srv, "push", "origin", "main");
  }
  pushToBranch(file) {
    const { srv, pr } = this;
    sh(srv, "fetch", "origin");
    sh(srv, "switch", "-C", "tmp-branch", `origin/${pr.branch}`);
    fs.writeFileSync(path.join(srv, file), "outro\n");
    sh(srv, "add", file);
    sh(srv, "commit", "-m", `docs: ${file}`);
    sh(srv, "push", "origin", `HEAD:refs/heads/${pr.branch}`);
  }
}

/* ------------------------------------------------------------------------ mundo */

const MSG = "docs(feature): adicionar nota\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>\n";

function world({ missions = [mission(1), mission(2)], rules = GOOD_RULES, limits = {}, agent, logs = false } = {}) {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "oplyra-runner-")));
  const origin = path.join(tmp, "origin.git");
  const work = path.join(tmp, "work");
  const srv = path.join(tmp, "srv");
  const home = path.join(tmp, "home");
  fs.mkdirSync(origin);
  sh(origin, "init", "--bare", "-b", "main");
  fs.mkdirSync(work);
  sh(work, "init", "-b", "main");
  fs.mkdirSync(path.join(work, ".claude"));
  fs.mkdirSync(path.join(work, "docs", "feature"), { recursive: true });
  fs.mkdirSync(path.join(work, "docs", "backlog"), { recursive: true });
  // o repositório de teste mantém delegatedDelivery=false: só a autorização contínua habilita o agente
  fs.writeFileSync(path.join(work, ".claude", "delegated-delivery.json"), JSON.stringify({ schema: "oplyra-delegated-delivery/1", delegatedDelivery: false }));
  fs.writeFileSync(path.join(work, ".gitignore"), "*.log\n.oplyra/\n");
  fs.writeFileSync(path.join(work, "README.md"), "base\n");
  fs.writeFileSync(path.join(work, "docs", "feature", ".gitkeep"), "");
  fs.writeFileSync(path.join(work, "docs", "backlog", "missions.json"), JSON.stringify({ schema: BACKLOG_SCHEMA, missions }));
  sh(work, "add", "-A");
  sh(work, "commit", "-m", "chore: base");
  sh(work, "remote", "add", "origin", origin);
  sh(work, "push", "origin", "main");
  sh(tmp, "clone", origin, srv);
  const standingDir = path.join(home, ".oplyra", "standing");
  const standing = buildStanding({
    paths: ["docs/feature/", "docs/backlog/"], limits, missionBudgets: { wallClockSeconds: 3600, iterations: 5, logReads: 10 }, confirmation: STANDING_PHRASE,
  });
  const written = writeStanding(standing, { dir: standingDir });
  const gh = new FakeGitHub({ origin, srv, rules });
  const clock = { t: Date.now() };
  const events = gh.events;
  const kill = path.join(home, ".oplyra", "KILL-DELIVERY");
  const recordDir = path.join(home, ".oplyra", "delivery");
  const wrapperGit = (args, opts) => {
    // o wrapper valida `origin` como github.com/cabralgava/oplyra; aqui o origin é um diretório local
    const sub = [...args];
    while (sub[0] === "-c") sub.splice(0, 2);
    if (sub[0] === "remote" && sub[1] === "get-url") return { status: 0, stdout: `https://github.com/${REPO}.git\n`, stderr: "" };
    const r = spawnSync("git", args, { cwd: work, env: opts.env, input: opts.input, encoding: "utf8" });
    return { status: r.status ?? 1, stdout: String(r.stdout ?? ""), stderr: String(r.stderr ?? "") };
  };
  const wrapperPorts = {
    repoRoot: work, home, now: () => new Date(clock.t), sleep: async () => {}, git: wrapperGit, http: (req) => gh.http(req),
    keys: () => ({ appId: "1", installationId: "2", botLogin: "oplyra-agent[bot]", botId: "3", privateKey: PEM }),
    recordDir, stateDir: path.join(home, ".oplyra", "delivery-state"), killFile: kill, standingDir,
  };
  const w = { tmp, origin, work, srv, home, gh, clock, events, kill, recordDir, standingDir, standing, standingSha: written.sha256, wrapperPorts, agentCalls: [], refusals: [], runs: 0 };
  const agentEnv = (ref) => {
    const file = path.join(recordDir, `${ref}.json`);
    return { PATH: process.env.PATH, OPLYRA_DELIVERY_REF: ref, OPLYRA_DELIVERY_RECORD: file, OPLYRA_DELIVERY_RECORD_SHA256: sha256File(fs.readFileSync(file)) };
  };
  const verb = async (ref, name, ...args) => {
    const r = await execute(name, args, { ...wrapperPorts, env: agentEnv(ref) });
    if (r.code !== 0) {
      w.refusals.push(`${name}:${r.refusal}`);
      throw new Error(`${name}: ${r.out}`);
    }
    return r;
  };
  w.verb = verb;
  /** Agente padrão: a MESMA sequência que o prompt manda, pelos wrappers tipados reais. */
  const defaultBehavior = async ({ ref, kind }) => {
    const rec = JSON.parse(fs.readFileSync(path.join(recordDir, `${ref}.json`), "utf8"));
    const local = spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${rec.branch}`], { cwd: work }).status === 0;
    try {
      if (!local) await verb(ref, "branch");
      const file = `docs/feature/${ref}${kind === "fix" ? "-fix" : ""}.md`;
      fs.writeFileSync(path.join(work, file), `nota ${ref} ${kind}\n`);
      fs.writeFileSync(path.join(work, "msg.txt"), MSG);
      await verb(ref, "stage", file);
      await verb(ref, "commit", "--message-file", "msg.txt");
      await verb(ref, "push");
      if (kind !== "fix") {
        fs.writeFileSync(path.join(work, "body.md"), `Missão ${ref}\n`);
        await verb(ref, "pr-create", "--title", `docs(feature): nota ${ref}`, "--body-file", "body.md");
        fs.rmSync(path.join(work, "body.md"));
      }
      fs.rmSync(path.join(work, "msg.txt"));
      return { exitCode: 0 };
    } catch {
      return { exitCode: 1 };
    }
  };
  w.defaultAgent = defaultBehavior;
  const agentPort = async (call) => {
    w.agentCalls.push({ ref: call.ref, kind: call.kind });
    events.push(`agent:${call.ref}:${call.kind}`);
    const custom = agent ? await agent({ w, ...call }) : undefined;
    if (custom) return custom;
    return defaultBehavior(call);
  };
  w.ports = (over = {}) => ({
    repoRoot: work, home, git: async (args) => {
      const r = spawnSync("git", args, { cwd: work, env: gitEnv, encoding: "utf8" });
      return { status: r.status ?? 1, stdout: String(r.stdout ?? ""), stderr: String(r.stderr ?? "") };
    },
    github: gh, agent: agentPort, now: () => new Date(clock.t), sleep: async (ms) => {
      clock.t += Math.max(Number(ms) || 0, 1000);
      gh.tick();
    }, isAlive: () => false, pollSeconds: 0, log: logs ? (l) => process.stdout.write(`${l}\n`) : () => {}, ...over,
  });
  w.run = (over) => runLoop(w.ports(over));
  w.cp = () => JSON.parse(fs.readFileSync(runnerPaths(home).checkpoint, "utf8"));
  w.mainLog = () => sh(origin, "log", "--format=%s", "main").split("\n");
  w.audit = () => {
    const f = path.join(home, ".oplyra", "delivery-state", "audit.jsonl");
    return fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : [];
  };
  return w;
}

/* ================================================================== ciclo completo */

describe("ciclo contínuo: implementar → PR → CI → ready → squash → confirmar → próxima missão", () => {
  it("integra a missão 1 e SÓ DEPOIS começa a 2, sobre o main já integrado, sem nenhuma operação do proprietário", async () => {
    const w = world();
    const r = await w.run();
    expect(r).toMatchObject({ status: "done", reason: "backlog-complete" });
    const cp = w.cp();
    expect(cp.missions["ms-001"].phase).toBe("integrated");
    expect(cp.missions["ms-002"].phase).toBe("integrated");
    expect(cp.counters.merges).toBe(2);
    // dependência real: a base da missão 2 é o commit de squash da missão 1
    expect(cp.missions["ms-002"].baseSha).toBe(cp.missions["ms-001"].mergedSha);
    // ordem dos efeitos: ready antes do merge, merge antes de o agente da missão 2 ser chamado
    const ev = w.events;
    expect(ev.indexOf("agent:ms-001:implement")).toBeLessThan(ev.indexOf("ready"));
    expect(ev.indexOf("ready")).toBeLessThan(ev.findIndex((e) => e.startsWith("merge:")));
    expect(ev.findIndex((e) => e.startsWith("merge:"))).toBeLessThan(ev.indexOf("agent:ms-002:implement"));
    // main: um commit de squash por missão, histórico linear, nenhuma branch tocada em main pelo agente
    expect(w.mainLog()).toEqual(["docs(feature): nota ms-002 (#7)", "docs(feature): nota ms-001 (#7)", "chore: base"]);
    expect(sh(w.origin, "rev-list", "--merges", "main")).toBe("");
    // o agente usou só wrappers: nenhuma recusa, e a habilitação foi SEMPRE a autorização contínua (delegatedDelivery=false no repositório)
    expect(w.refusals).toEqual([]);
    const audit = w.audit();
    expect(audit.length).toBeGreaterThan(8);
    expect(new Set(audit.map((a) => a.enabledBy))).toEqual(new Set(["standing-authorization"]));
    expect(audit.every((a) => a.outcome === "ok")).toBe(true);
    // checkpoint e lock: 0600, lock liberado, base destacada no origin/main, sem alterar main local
    expect(fs.statSync(runnerPaths(w.home).checkpoint).mode & 0o777).toBe(0o600);
    expect(fs.existsSync(runnerPaths(w.home).lock)).toBe(false);
    expect(sh(w.work, "rev-parse", "--abbrev-ref", "HEAD")).toBe("HEAD");
    expect(sh(w.work, "rev-parse", "refs/heads/main")).toBe(cp.missions["ms-001"].baseSha);
    expect(sh(w.work, "rev-parse", "HEAD")).toBe(sh(w.origin, "rev-parse", "main"));
    expect(fs.readFileSync(path.join(w.work, "docs/feature/ms-002.md"), "utf8")).toContain("ms-002");
  });

  it("o merge leva o SHA validado e a evidência fica registrada para esse SHA", async () => {
    const w = world({ missions: [mission(1)] });
    await w.run();
    const m = w.cp().missions["ms-001"];
    expect(m.evidence.sha).toBe(m.headSha);
    expect(m.evidenceHistory.some((h) => h.event === "validated" && h.sha === m.headSha)).toBe(true);
    expect(w.gh.merges).toEqual([m.headSha]);
    expect(m.postMerge).toMatchObject({ sha: m.mergedSha, validate: "success" });
  });
});

describe("falha de CI e mudança de SHA invalidam a evidência anterior", () => {
  it("validate falha: o runner NÃO integra, pede UMA correção ao agente e integra só o SHA novo", async () => {
    const w = world({ missions: [mission(1)] });
    w.gh.outcomes = [{ validate: "failure" }];
    const r = await w.run();
    expect(r).toMatchObject({ status: "done" });
    expect(w.agentCalls.map((c) => c.kind)).toEqual(["implement", "fix"]);
    const m = w.cp().missions["ms-001"];
    expect(m.failures.validate).toHaveLength(1);
    expect(m.failures.validate[0]).not.toBe(m.headSha);
    expect(w.gh.merges).toEqual([m.headSha]);
    expect(w.gh.merges[0]).not.toBe(m.failures.validate[0]);
    expect(m.fixedFor[m.failures.validate[0]]).toBe(true);
  });

  it("falha persistente: um SHA recebe UMA sessão de correção; sem push novo o runner bloqueia (nenhuma repetição cega)", async () => {
    const w = world({ missions: [mission(1)], agent: async ({ w: world_, kind }) => (kind === "fix" ? { exitCode: 0 } : undefined) });
    w.gh.outcomes = [{ validate: "failure" }];
    const r = await w.run();
    expect(r).toMatchObject({ status: "stopped", reason: "agent-no-progress" });
    expect(w.agentCalls.map((c) => c.kind)).toEqual(["implement", "fix"]);
    expect(w.gh.merges).toEqual([]);
    expect(w.cp().missions["ms-001"].phase).toBe("blocked");
    // continua bloqueada em novas partidas até o proprietário agir
    expect(await w.run()).toMatchObject({ status: "stopped", reason: "blocked:agent-no-progress" });
    expect(w.agentCalls).toHaveLength(2);
  });

  it("o head muda DEPOIS do verde e ANTES do merge: o merge é recusado (409), a evidência do SHA antigo é descartada e só o SHA novo, revalidado, integra", async () => {
    const w = world({ missions: [mission(1)] });
    w.gh.hooks.beforeMerge = () => w.gh.pushToBranch("docs/feature/extra.md");
    const r = await w.run();
    expect(r).toMatchObject({ status: "done" });
    expect(w.gh.merges).toHaveLength(2);
    expect(w.gh.merges[0]).not.toBe(w.gh.merges[1]);
    const m = w.cp().missions["ms-001"];
    expect(m.evidenceHistory.some((h) => h.event === "invalidated" && h.reason === "head-moved-at-merge" && h.sha === w.gh.merges[0])).toBe(true);
    expect(m.evidence.sha).toBe(w.gh.merges[1]);
    expect(m.mergedSha).toBe(sh(w.origin, "rev-parse", "main"));
    expect(fs.existsSync(path.join(w.srv, "docs/feature/extra.md")) || sh(w.origin, "show", "main:docs/feature/extra.md")).toBeTruthy();
  });

  it("main avançou (PR behind): atualiza a branch, a CI recomeça no SHA novo e a evidência anterior não vale", async () => {
    const w = world({ missions: [mission(1)] });
    // main avança assim que a sessão do agente termina (o PR já existe)
    const r = await w.run({
      agent: async (c) => {
        const out = await w.defaultAgent(c);
        w.gh.pushToMain("README.md", "main avançou\n");
        return out;
      },
    });
    expect(r).toMatchObject({ status: "done" });
    expect(w.gh.updates).toBe(1);
    const m = w.cp().missions["ms-001"];
    expect(m.branchUpdates).toBe(1);
    expect(w.gh.merges).toHaveLength(1);
    expect(w.gh.merges[0]).toBe(m.headSha);
    expect(m.evidenceHistory.some((h) => h.event === "validated")).toBe(true);
    expect(sh(w.origin, "show", "main:README.md")).toBe("main avançou");
  });
});

describe("mudança de risco elevado, freios humanos e proteção do ruleset", () => {
  it("arquivo elevado no PR: NÃO integra, não faz ready, para com `awaiting-owner` e nem começa a missão 2; depois que o proprietário integra, retoma sozinho", async () => {
    const w = world();
    w.gh.extraFiles = [{ path: ".github/workflows/ci.yml", status: "modified" }];
    const first = await w.run();
    expect(first).toMatchObject({ status: "stopped", reason: "awaiting-owner:elevated" });
    expect(w.events.some((e) => e === "ready" || e.startsWith("merge:"))).toBe(false);
    expect(w.cp().missions["ms-001"].phase).toBe("awaiting-owner");
    expect(w.cp().missions["ms-002"]).toBeUndefined();
    // ainda aguardando: nova partida não faz nada nem chama o agente
    const again = await w.run();
    expect(again.reason).toBe("awaiting-owner:elevated");
    expect(w.agentCalls).toHaveLength(1);
    // o proprietário integra pela interface do GitHub; o runner reconcilia o estado real e segue para a missão 2
    w.gh.ownerMerge();
    w.gh.extraFiles = [];
    const resumed = await w.run();
    expect(resumed).toMatchObject({ status: "done", reason: "backlog-complete" });
    expect(w.cp().missions["ms-001"].phase).toBe("integrated");
    expect(w.cp().missions["ms-002"].baseSha).toBe(w.cp().missions["ms-001"].mergedSha);
    expect(w.gh.merges).toHaveLength(1); // só a missão 2 foi integrada pelo runner
  });

  it.each([
    ["rótulo hold", (w) => { w.gh.labels = ["hold"]; }, "hold"],
    ["pedido de alterações", (w) => { w.gh.reviews = [{ state: "CHANGES_REQUESTED", user: "dono", submitted_at: "2026-10-04T10:00:00Z" }]; }, "changes-requested"],
  ])("%s interrompe a integração automática; removido, o runner retoma", async (_nome, apply, code) => {
    const w = world({ missions: [mission(1)] });
    apply(w);
    expect(await w.run()).toMatchObject({ status: "stopped", reason: `awaiting-owner:${code}` });
    expect(w.gh.merges).toEqual([]);
    w.gh.labels = [];
    w.gh.reviews = [];
    expect(await w.run()).toMatchObject({ status: "done" });
    expect(w.gh.merges).toHaveLength(1);
  });

  it("ruleset atual permite implementar e aguarda revisão; inseguro impede iniciar", async () => {
    const w = world({ rules: TODAY_RULES });
    expect(await w.run()).toMatchObject({ status: "stopped", reason: "awaiting-owner:review-required" });
    expect(w.agentCalls).toHaveLength(1);
    expect(w.gh.merges).toHaveLength(0);
    expect(fs.existsSync(path.join(w.recordDir, "ms-001.json"))).toBe(true);
    const unsafe = world({ rules: GOOD_RULES.map((r) => (r.type === "pull_request" ? { ...r, parameters: { ...r.parameters, require_code_owner_review: false } } : r)) });
    expect(await unsafe.run()).toMatchObject({ status: "stopped", reason: "ruleset-unsafe" });
    expect(unsafe.agentCalls).toEqual([]);
  });

  it("merge recusado pelo GitHub (405): bloqueia sem repetir; só `unblock` do proprietário reabre", async () => {
    const w = world({ missions: [mission(1)] });
    w.gh.opts.rejectMerge = true;
    expect(await w.run()).toMatchObject({ status: "stopped", reason: "merge-rejected" });
    expect(w.gh.merges).toHaveLength(1);
    expect(await w.run()).toMatchObject({ reason: "blocked:merge-rejected" });
    expect(w.gh.merges).toHaveLength(1);
    w.gh.opts.rejectMerge = false;
    unblockMission(normalizePorts({ home: w.home, github: w.gh, git: () => {} }), "ms-001");
    expect(await w.run()).toMatchObject({ status: "done" });
    expect(w.gh.merges).toHaveLength(2);
  });

  it("duas PRs na mesma branch: bloqueia (nunca escolhe uma)", async () => {
    const w = world({ missions: [mission(1)], agent: async ({ w: world_ }) => { world_.gh.opts.duplicate = true; return undefined; } });
    expect(await w.run()).toMatchObject({ status: "stopped", reason: "duplicate-pr" });
    expect(w.gh.merges).toEqual([]);
  });
});

/* ====================================================== retomada, concorrência e parada */

describe("retomada idempotente", () => {
  it("queda no meio da missão: o checkpoint e o registro são reaproveitados; sem segundo registro, PR ou merge duplicados", async () => {
    let crashed = false;
    const w = world({ missions: [mission(1)], agent: async () => { if (!crashed) { crashed = true; throw new Error("queda do processo"); } return undefined; } });
    await expect(w.run()).rejects.toThrow("queda do processo");
    expect(fs.existsSync(runnerPaths(w.home).lock)).toBe(false); // o finally liberou
    const before = w.cp().missions["ms-001"];
    expect(before).toMatchObject({ phase: "record-issued", sessions: 1 });
    const recordSha = sha256File(fs.readFileSync(path.join(w.recordDir, "ms-001.json")));
    expect(before.recordSha256).toBe(recordSha);
    const r = await w.run();
    expect(r).toMatchObject({ status: "done" });
    expect(w.agentCalls.map((c) => c.kind)).toEqual(["implement", "continue"]);
    expect(sha256File(fs.readFileSync(path.join(w.recordDir, "ms-001.json")))).toBe(recordSha);
    expect(fs.readdirSync(w.recordDir)).toEqual(["ms-001.json"]);
    expect(w.gh.merges).toHaveLength(1);
    expect(w.cp().counters.missionsStarted).toBe(1);
  });

  it("timeout de rede NO merge (que ocorreu no servidor): relê o PR, vê `merged` e NÃO repete a escrita", async () => {
    const w = world({ missions: [mission(1)] });
    w.gh.opts.networkAfterMerge = true;
    expect(await w.run()).toMatchObject({ status: "done" });
    expect(w.gh.merges).toHaveLength(1);
    expect(w.cp().missions["ms-001"].phase).toBe("integrated");
    expect(w.cp().missions["ms-001"].mergeAttempts).toBe(1);
  });

  it("falha transitória no ready: relê o estado antes de qualquer nova tentativa e termina integrando", async () => {
    const w = world({ missions: [mission(1)] });
    w.gh.opts.readyFails = true;
    // a primeira tentativa falha; depois o GitHub volta
    const original = w.gh.markReady.bind(w.gh);
    let n = 0;
    w.gh.markReady = async (...a) => { n += 1; if (n > 1) w.gh.opts.readyFails = false; return original(...a); };
    expect(await w.run()).toMatchObject({ status: "done" });
    expect(w.gh.readyCalls).toBe(2);
    expect(w.gh.merges).toHaveLength(1);
  });

  it("checkpoint corrompido: falha fechada, sem agente nem escrita remota", async () => {
    const w = world({ missions: [mission(1)] });
    const p = runnerPaths(w.home);
    fs.mkdirSync(p.dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(p.checkpoint, "{ não é json");
    expect(await w.run()).toMatchObject({ status: "stopped", reason: "checkpoint-invalid" });
    fs.writeFileSync(p.checkpoint, JSON.stringify({ schema: "x" }));
    expect(await w.run()).toMatchObject({ status: "stopped", reason: "checkpoint-invalid" });
    expect(w.agentCalls).toEqual([]);
  });
});

describe("concorrência: um runner por vez", () => {
  it("lock vivo recusa mesmo com heartbeat velho; apenas processo morto é assumido", async () => {
    const w = world({ missions: [mission(1)] });
    const p = runnerPaths(w.home);
    fs.mkdirSync(p.dir, { recursive: true, mode: 0o700 });
    const lock = (pid, ageMs) => fs.writeFileSync(p.lock, JSON.stringify({ pid, host: "h", startedAt: new Date(w.clock.t - ageMs).toISOString(), heartbeatAt: new Date(w.clock.t - ageMs).toISOString() }), { mode: 0o600 });
    lock(4242, 1000);
    await expect(w.run({ isAlive: () => true })).rejects.toMatchObject({ code: "locked" });
    expect(fs.existsSync(p.lock)).toBe(true); // o lock de outro processo não é tocado
    expect(w.agentCalls).toEqual([]);
    // processo morto: assume
    lock(4242, 1000);
    expect(await w.run({ isAlive: () => false })).toMatchObject({ status: "done" });
    // processo "vivo" mas sem heartbeat há mais que o limite: assume
    const w2 = world({ missions: [mission(1)] });
    const p2 = runnerPaths(w2.home);
    fs.mkdirSync(p2.dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(p2.lock, JSON.stringify({ pid: 4242, host: "h", startedAt: "2020-01-01T00:00:00Z", heartbeatAt: "2020-01-01T00:00:00Z" }), { mode: 0o600 });
    await expect(w2.run({ isAlive: () => true })).rejects.toMatchObject({ code: "locked" });
  });

  it("dois runners no mesmo estado: o segundo é recusado enquanto o primeiro está no meio da missão", async () => {
    let inner;
    const w = world({ missions: [mission(1)], agent: async ({ w: world_ }) => { inner = await world_.run({ isAlive: () => true }).then(() => "rodou", (e) => e.code); return undefined; } });
    // o runner interno (concorrente) enxerga o lock do externo, vivo e com heartbeat recente
    expect(await w.run({ isAlive: () => true })).toMatchObject({ status: "done" });
    expect(inner).toBe("locked");
    expect(w.gh.merges).toHaveLength(1);
  });
});

describe("kill switch, STOP, revogação e validade", () => {
  it("kill switch ativo antes da partida: nada é feito", async () => {
    const w = world();
    fs.mkdirSync(path.dirname(w.kill), { recursive: true });
    fs.writeFileSync(w.kill, "x");
    expect(await w.run()).toMatchObject({ status: "stopped", reason: "kill-switch" });
    expect(w.agentCalls).toEqual([]);
  });

  it("kill switch DURANTE a sessão do agente: a sessão é interrompida, nada é integrado e a retomada continua a mesma missão", async () => {
    const w = world({ missions: [mission(1)], agent: async ({ w: world_ }) => { fs.mkdirSync(path.dirname(world_.kill), { recursive: true }); fs.writeFileSync(world_.kill, "x"); return { exitCode: null, stopped: true }; } });
    expect(await w.run()).toMatchObject({ status: "stopped", reason: "agent-stopped" });
    expect(w.gh.merges).toEqual([]);
    expect(w.cp().missions["ms-001"].sessions).toBe(1);
    fs.rmSync(w.kill);
    // sem o hook, o agente padrão retoma a MESMA missão
    const resumed = await w.run({ agent: async (c) => { w.agentCalls.push({ ref: c.ref, kind: c.kind }); return w.defaultAgent(c); } });
    expect(resumed).toMatchObject({ status: "done" });
    expect(w.agentCalls.map((c) => c.kind)).toEqual(["implement", "continue"]);
  });

  it("STOP do proprietário: para no próximo passo; a partida seguinte consome o STOP antigo e continua", async () => {
    const w = world({ missions: [mission(1)], agent: async ({ w: world_ }) => { requestStop(normalizePorts({ home: world_.home, github: world_.gh, git: () => {} })); return undefined; } });
    expect(await w.run()).toMatchObject({ status: "stopped", reason: "stop-file" });
    expect(w.gh.merges).toEqual([]);
    expect(fs.existsSync(runnerPaths(w.home).stop)).toBe(true);
    expect(statusReport(normalizePorts({ home: w.home, github: w.gh, git: () => {} }))).toContain("STOP: sim");
    expect(await w.run({ agent: async (c) => w.defaultAgent(c) })).toMatchObject({ status: "done" });
    expect(fs.existsSync(runnerPaths(w.home).stop)).toBe(false);
  });

  it("revogação da autorização no meio da missão: o runner para e os verbos do AGENTE passam a recusar (DD-DISABLED)", async () => {
    const w = world({ missions: [mission(1)], agent: async ({ w: world_ }) => { revokeStanding({ dir: world_.standingDir }); return { exitCode: 0 }; } });
    expect(await w.run()).toMatchObject({ status: "stopped", reason: "standing:ST-REVOKED" });
    expect(w.gh.merges).toEqual([]);
    const r = await execute("branch", [], { ...w.wrapperPorts, env: { PATH: process.env.PATH, OPLYRA_DELIVERY_REF: "ms-001", OPLYRA_DELIVERY_RECORD: path.join(w.recordDir, "ms-001.json"), OPLYRA_DELIVERY_RECORD_SHA256: sha256File(fs.readFileSync(path.join(w.recordDir, "ms-001.json"))) } });
    expect(r.refusal).toBe("DD-DISABLED");
    expect(r.out).toContain("ST-REVOKED");
  });

  it("ampliar o escopo da autorização no meio da execução (JSON válido) é recusado nos DOIS lados: runner (ST-HASH) e wrappers do agente (DD-DISABLED)", async () => {
    const w = world({
      missions: [mission(1)], limits: { maxAgentSessionsPerMission: 1 },
      agent: async ({ w: world_ }) => {
        const file = path.join(world_.standingDir, "authorization.json");
        const s = JSON.parse(fs.readFileSync(file, "utf8"));
        fs.writeFileSync(file, `${JSON.stringify({ ...s, scope: { ...s.scope, paths: [...s.scope.paths, "docs/outro/"] } }, null, 2)}\n`);
        return { exitCode: 0 };
      },
    });
    expect(await w.run()).toMatchObject({ status: "stopped", reason: "standing:ST-HASH" });
    expect(w.gh.merges).toEqual([]);
    const env = { PATH: process.env.PATH, OPLYRA_DELIVERY_REF: "ms-001", OPLYRA_DELIVERY_RECORD: path.join(w.recordDir, "ms-001.json"), OPLYRA_DELIVERY_RECORD_SHA256: sha256File(fs.readFileSync(path.join(w.recordDir, "ms-001.json"))) };
    const r = await execute("branch", [], { ...w.wrapperPorts, env });
    expect(r.refusal).toBe("DD-DISABLED");
    expect(r.out).toContain("ST-HASH");
  });

  it("com delegatedDelivery=true no repositório a revogação AINDA derruba o agente: o registro derivado da autorização só vale enquanto ela vale", async () => {
    const w = world({ missions: [mission(1)], agent: async () => ({ exitCode: 0 }), limits: { maxAgentSessionsPerMission: 1 } });
    fs.writeFileSync(path.join(w.work, ".claude", "delegated-delivery.json"), JSON.stringify({ schema: "oplyra-delegated-delivery/1", delegatedDelivery: true }));
    sh(w.work, "add", "-A");
    sh(w.work, "commit", "-m", "chore: habilitacao definitiva");
    sh(w.work, "push", "origin", "main");
    await w.run(); // emite o registro da missão (o agente stub não faz nada)
    const env = { PATH: process.env.PATH, OPLYRA_DELIVERY_REF: "ms-001", OPLYRA_DELIVERY_RECORD: path.join(w.recordDir, "ms-001.json"), OPLYRA_DELIVERY_RECORD_SHA256: sha256File(fs.readFileSync(path.join(w.recordDir, "ms-001.json"))) };
    expect((await execute("doctor", [], { ...w.wrapperPorts, env })).refusal).toBeNull();
    revokeStanding({ dir: w.standingDir });
    const refused = await execute("doctor", [], { ...w.wrapperPorts, env });
    expect(refused.refusal).toBe("DD-DISABLED");
    expect(refused.out).toContain("ST-REVOKED");
    // outra autorização (hash diferente): o registro antigo também deixa de valer
    fs.rmSync(path.join(w.standingDir, "REVOKED"));
    fs.rmSync(path.join(w.standingDir, "authorization.json"));
    writeStanding(buildStanding({ paths: ["docs/feature/"], missionBudgets: { wallClockSeconds: 3600, iterations: 5, logReads: 10 }, confirmation: STANDING_PHRASE }), { dir: w.standingDir });
    expect((await execute("doctor", [], { ...w.wrapperPorts, env })).refusal).toBe("DD-DISABLED");
  });

  it("autorização expirada ou alterada: não inicia; autorização substituída com missão em andamento: para", async () => {
    const w = world({ missions: [mission(1)] });
    expect(await w.run({ now: () => new Date(w.clock.t + 31 * 86_400_000) })).toMatchObject({ status: "stopped", reason: "standing:ST-EXPIRED" });
    expect(w.agentCalls).toEqual([]);
    // missão em andamento (sessões consumidas), autorização substituída por outra: o registro derivado deixa de valer
    const s = world({ missions: [mission(1)], agent: async () => ({ exitCode: 0 }), limits: { maxAgentSessionsPerMission: 2 } });
    await s.run();
    expect(s.cp().missions["ms-001"].phase).toBe("blocked");
    unblockMission(normalizePorts({ home: s.home, github: s.gh, git: () => {} }), "ms-001");
    fs.rmSync(path.join(s.standingDir, "authorization.json"));
    writeStanding(buildStanding({ paths: ["docs/feature/"], missionBudgets: { wallClockSeconds: 3600, iterations: 5, logReads: 10 }, confirmation: STANDING_PHRASE }), { dir: s.standingDir });
    expect(await s.run()).toMatchObject({ status: "stopped", reason: "standing-changed" });
  });
});

describe("limites da execução", () => {
  it("maxMissions: não inicia além do limite da autorização", async () => {
    const w = world({ limits: { maxMissions: 1 } });
    expect(await w.run()).toMatchObject({ status: "done", reason: "max-missions" });
    expect(w.agentCalls.map((c) => c.ref)).toEqual(["ms-001"]);
  });
  it("mergesPerRun: para depois do limite de integrações da execução", async () => {
    const w = world({ limits: { mergesPerRun: 1 } });
    expect(await w.run()).toMatchObject({ status: "stopped", reason: "max-merges" });
    expect(w.cp().counters.merges).toBe(1);
  });
  it("duração total da execução: para quando o relógio da autorização se esgota", async () => {
    const w = world({ limits: { wallClockSeconds: 60 }, agent: async ({ w: world_ }) => { world_.clock.t += 120_000; return undefined; } });
    expect(await w.run()).toMatchObject({ status: "stopped", reason: "run-deadline" });
    expect(w.gh.merges).toEqual([]);
  });
  it("sessões do agente por missão: sem PR depois do limite, bloqueia e NÃO inicia a missão dependente; `unblock` não zera o orçamento", async () => {
    const w = world({ limits: { maxAgentSessionsPerMission: 2 }, agent: async () => ({ exitCode: 0 }) });
    expect(await w.run()).toMatchObject({ status: "stopped", reason: "agent-no-pr" });
    expect(w.agentCalls.map((c) => `${c.ref}:${c.kind}`)).toEqual(["ms-001:implement", "ms-001:continue"]);
    expect(w.cp().missions["ms-002"]).toBeUndefined();
    unblockMission(normalizePorts({ home: w.home, github: w.gh, git: () => {} }), "ms-001");
    expect(await w.run()).toMatchObject({ status: "stopped", reason: "agent-no-pr" });
    expect(w.agentCalls).toHaveLength(2);
  });
  it("tempo de espera de CI esgotado: bloqueia com `ci-timeout`", async () => {
    const w = world({ missions: [mission(1)] });
    // o CI nunca termina: o fake deixa de completar os checks
    w.gh.tick = () => {};
    expect(await w.run({ sleep: async () => { w.clock.t += 300_000; } })).toMatchObject({ status: "stopped", reason: "ci-timeout" });
    expect(w.gh.merges).toEqual([]);
  });
  it("estado do repositório inseguro (arquivo não rastreado, operação Git em andamento) para sem descartar nada", async () => {
    const w = world({ missions: [mission(1)], agent: async ({ w: world_ }) => { fs.writeFileSync(path.join(world_.work, "lixo.tmp"), "x"); return { exitCode: 0 }; } });
    const r = await w.run();
    expect(r).toMatchObject({ status: "stopped", reason: "repo-state" });
    expect(fs.existsSync(path.join(w.work, "lixo.tmp"))).toBe(true);
  });
});

/* ========================================================== seleção e backlog (puro) */

describe("seleção de missões e backlog", () => {
  const bl = (ms) => ({ schema: BACKLOG_SCHEMA, missions: ms });
  const cpOf = (phases) => ({ missions: Object.fromEntries(Object.entries(phases).map(([k, v]) => [k, { ref: k, phase: v }])) });
  it("só inicia missão com dependências INTEGRADAS; em andamento vem antes; terminais são ignorados", () => {
    const b = bl([mission(1), mission(2), mission(3, { dependsOn: [] })]);
    expect(selectNext(b, cpOf({}))).toMatchObject({ mission: { id: "ms-001" }, resume: false });
    expect(selectNext(b, cpOf({ "ms-001": "observing" }))).toMatchObject({ mission: { id: "ms-001" }, resume: true });
    expect(selectNext(b, cpOf({ "ms-001": "integrated" }))).toMatchObject({ mission: { id: "ms-002" } });
    // ms-002 depende de ms-001 ainda não integrada (aguardando o proprietário): impede e NÃO pula para a independente
    expect(selectNext(b, cpOf({ "ms-001": "awaiting-owner" }))).toMatchObject({ mission: { id: "ms-001" }, resume: true });
    expect(selectNext(b, cpOf({ "ms-001": "integrated", "ms-002": "integrated", "ms-003": "integrated" }))).toEqual({ none: "backlog-complete" });
    expect(selectNext(bl([mission(1), mission(2)]), cpOf({ "ms-001": "abandoned" }))).toEqual({ none: "dependencies-blocked" });
  });
  it("backlog inválido: esquema, duplicado, dependência inexistente, ciclo, missão malformada", () => {
    const bad = [
      { schema: "x", missions: [] }, bl([mission(1), mission(1)]), bl([mission(2)]), bl([mission(1, { dependsOn: ["ms-002"] }), mission(2, { dependsOn: ["ms-001"] })]),
      bl([mission(1, { paths: [] })]), bl([mission(1, { id: "cr-033" })]),
    ];
    for (const b of bad) expect(() => validateBacklog(b), JSON.stringify(b).slice(0, 80)).toThrow(RunnerError);
    expect(() => validateBacklog(bl([mission(1), mission(2)]))).not.toThrow();
  });
  it("abandonar uma missão a torna terminal sem integrá-la; dependentes ficam bloqueados", async () => {
    const w = world({ limits: { maxAgentSessionsPerMission: 1 }, agent: async () => ({ exitCode: 0 }) });
    await w.run();
    abandonMission(normalizePorts({ home: w.home, github: w.gh, git: () => {} }), "ms-001");
    expect(await w.run()).toMatchObject({ status: "done", reason: "dependencies-blocked" });
    expect(w.cp().missions["ms-002"]).toBeUndefined();
  });
});

describe("prompt do agente", () => {
  const m = mission(1);
  it("manda entregar só pelos verbos tipados, NÃO fazer ready/merge, e rotula o conteúdo da missão como dados", () => {
    const p = buildPrompt({ mission: m, kind: "implement", branch: "agent/docs/ms-001-x-y" });
    expect(p).toContain("agent/docs/ms-001-x-y");
    expect(p).toContain("supervisor opera os wrappers tipados");
    expect(p).toMatch(/NÃO faça ready-for-review nem merge/);
    expect(p).toContain("DADOS da missão");
    expect(p).not.toMatch(/--force|git push origin|gh pr merge/);
    const fix = buildPrompt({ mission: m, kind: "fix", branch: "b", headSha: "a".repeat(40), failing: ["validate"] });
    expect(fix).toContain("validate");
    expect(fix).toContain("diagnóstico estruturado");
    expect(buildPrompt({ mission: m, kind: "continue", branch: "b" })).toContain("não repita efeitos já executados");
  });
});

/* =============================================================== sessão do agente (spawn) */

describe("sessão do agente pelo launcher", () => {
  function fakeSpawn(behavior) {
    const calls = [];
    const spawn = (cmd, args, opts) => {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.killed = [];
      child.kill = (sig) => { child.killed.push(sig); if (behavior.dieOn === sig) setImmediate(() => child.emit("exit", null)); };
      calls.push({ cmd, args, opts, child });
      behavior.start?.(child);
      return child;
    };
    spawn.calls = calls;
    return spawn;
  }
  const env = (tmp) => ({ repoRoot: tmp, fsImpl: fs, logsDir: path.join(tmp, "logs"), pollMs: 1, killGraceMs: 5 });

  it("chama o launcher oficial só com --increment e --prompt-file, sem repassar segredos como argumento", async () => {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "oplyra-agent-")));
    const spawn = fakeSpawn({ start: (c) => setImmediate(() => { c.stdout.emit("data", Buffer.from("ok\n")); c.emit("exit", 0); }) });
    const agent = defaultAgent({ ...env(tmp), spawn });
    const r = await agent({ ref: "ms-001", promptFile: "/x/ms-001-1.md", timeoutSeconds: 60, shouldStop: () => false });
    expect(r).toEqual({ exitCode: 0, stopped: false, timedOut: false });
    expect(spawn.calls[0].args.slice(1)).toEqual(["--increment=ms-001", "--prompt-file=/x/ms-001-1.md"]);
    expect(spawn.calls[0].args[0]).toMatch(/scripts\/claude-launch\.mjs$/);
    expect(fs.statSync(path.join(tmp, "logs", "ms-001.log")).mode & 0o777).toBe(0o600);
  });
  it("mata a sessão ao parar (SIGTERM) e no tempo limite; escala para SIGKILL se ela não sair", async () => {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "oplyra-agent-")));
    let stop = false;
    const s1 = fakeSpawn({ dieOn: "SIGTERM", start: () => setTimeout(() => { stop = true; }, 5) });
    const r1 = await defaultAgent({ ...env(tmp), spawn: s1 })({ ref: "ms-001", promptFile: "p", timeoutSeconds: 60, shouldStop: () => stop });
    expect(r1).toMatchObject({ stopped: true, timedOut: false });
    expect(s1.calls[0].child.killed).toEqual(["SIGTERM"]);
    const s2 = fakeSpawn({ dieOn: "SIGKILL" });
    let t = 0;
    const r2 = await defaultAgent({ ...env(tmp), spawn: s2, now: () => new Date((t += 2000)) })({ ref: "ms-001", promptFile: "p", timeoutSeconds: 1, shouldStop: () => false });
    expect(r2).toMatchObject({ timedOut: true, stopped: false });
    expect(s2.calls[0].child.killed).toEqual(["SIGTERM", "SIGKILL"]);
  });
});
