// @ts-nocheck — control plane. Testes simulados de portas e processos, sem CLI de modelo ou GitHub reais.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { spawnSync } from "node:child_process";
import { codexConfig, codexProcess, CODEX_BINARY, CODEX_VERSION } from "../scripts/codex-agent.mjs";
import { serve } from "../scripts/codex-supervise.mjs";
import { validateCheckpoint, defaultRunnerGit } from "../scripts/claude-runner.mjs";
import { prepareService, servicePlist } from "../scripts/codex-service.mjs";
import { validateCommitMessage } from "../scripts/claude-git.mjs";

describe("adaptador Codex", () => {
  const root = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "codex-unit-")));
  it("gera perfil restrito por missão, protege controles e nega leitura de segredos", () => {
    const dir = root(); fs.mkdirSync(path.join(dir, "docs")); fs.writeFileSync(path.join(dir, "AGENTS.md"), "instruções");
    const cfg = codexConfig(dir, { paths: ["docs/"] }).join("\n");
    expect(cfg).toContain('approval_policy="never"'); expect(cfg).toContain("network.enabled=false");
    expect(cfg).toContain(`"${dir}/docs/"="write"`); expect(cfg).toContain(`"${dir}/AGENTS.md"="read"`);
    expect(cfg).toContain('**/.env"="deny"'); expect(cfg).not.toContain('":root"="read"');
    expect(cfg).toContain('**/*.pem"="deny"'); expect(cfg).toContain('**/credentials*"="deny"');
    expect(cfg).toContain(`"${dir}/.git/config"="deny"`);
    fs.symlinkSync(os.tmpdir(), path.join(dir, "outside"));
    expect(() => codexConfig(dir, { paths: ["outside/"] })).toThrow("codex-symlink");
    for (const p of ["AGENTS.md", ".codex/", ".agents/", "scripts/", "../outside/"]) expect(() => codexConfig(dir, { paths: [p] })).toThrow();
  });
  it("invoca Codex direto, não herda tokens e não persiste saída bruta", async () => {
    const dir = root(); let invocation;
    const spawn = (bin, args, opts) => {
      invocation = { bin, args, opts };
      const child = new EventEmitter(); child.stdin = { end: () => setImmediate(() => child.emit("exit", 0)) }; return child;
    };
    const run = codexProcess({ repoRoot: dir, spawn, version: () => CODEX_VERSION, env: { HOME: os.homedir(), GH_TOKEN: "synthetic-only", OPENAI_API_KEY: "synthetic-only" } });
    expect(await run({ prompt: "probe", record: { paths: ["docs/"] }, schemaFile: "schema", outputFile: "out", timeoutSeconds: 10, shouldStop: () => false })).toMatchObject({ exitCode: 0 });
    expect(invocation.bin).toBe(CODEX_BINARY); expect(invocation.args).toContain("--strict-config"); expect(invocation.args).not.toContain("claude-launch.mjs");
    expect(invocation.opts.env.GH_TOKEN).toBeUndefined(); expect(invocation.opts.env.OPENAI_API_KEY).toBeUndefined();
    expect(invocation.opts.stdio).toEqual(["pipe", "ignore", "ignore"]); expect(invocation.opts.detached).toBe(true);
  });
  it("uma versão não auditada não inicia o agente", async () => {
    const run = codexProcess({ repoRoot: root(), version: () => "0.0.0", spawn: () => { throw new Error("não iniciar"); } });
    expect(await run({})).toMatchObject({ exitCode: 2, refusal: "codex-version" });
  });
  it("origem não autorizada é recusada antes de obter credencial", async () => {
    const dir = root(); spawnSync("/usr/bin/git", ["init", "-q"], { cwd: dir });
    spawnSync("/usr/bin/git", ["remote", "add", "origin", "https://example.test/other.git"], { cwd: dir });
    let tokens = 0;
    const git = defaultRunnerGit({ repoRoot: dir, github: { gitAuth: async () => { tokens++; return {}; } } });
    await expect(git(["fetch", "origin"], { net: true })).rejects.toMatchObject({ code: "DD-REMOTE" });
    expect(tokens).toBe(0);
  });
  it("revogação durante obtenção de credencial impede o comando de rede", async () => {
    const dir = root(); spawnSync("/usr/bin/git", ["init", "-q"], { cwd: dir });
    spawnSync("/usr/bin/git", ["remote", "add", "origin", "https://github.com/cabralgava/oplyra.git"], { cwd: dir });
    let revoked = false;
    const git = defaultRunnerGit({ repoRoot: dir, beforeEffect: () => { if (revoked) throw new Error("revoked"); }, github: { gitAuth: async () => { revoked = true; return {}; } } });
    await expect(git(["fetch", "origin"], { net: true })).rejects.toThrow("revoked");
  });
  it("interrupção encerra o grupo, inclusive descendentes após a saída do pai", async () => {
    const child = new EventEmitter(); child.pid = 4242; child.stdin = { end: () => {} }; const signals = [];
    const run = codexProcess({ repoRoot: root(), version: () => CODEX_VERSION, spawn: () => child, pollMs: 1, killGraceMs: 1,
      killGroup: (pid, signal) => { signals.push([pid, signal]); if (signal === "SIGTERM") setImmediate(() => child.emit("exit", null)); },
    });
    expect(await run({ prompt: "probe", record: { paths: ["docs/"] }, schemaFile: "s", outputFile: "o", timeoutSeconds: 10, shouldStop: () => true })).toMatchObject({ stopped: true });
    expect(signals).toEqual([[4242, "SIGTERM"], [4242, "SIGKILL"]]);
  });
  it("checkpoint recusa contadores negativos, merges impossíveis e ordem sem missão", () => {
    const cp = { schema: "oplyra-runner-checkpoint/1", rev: 0, counters: { standingSha256: null, missionsStarted: 0, merges: 0 }, order: [], missions: {} };
    expect(() => validateCheckpoint(cp)).not.toThrow();
    for (const over of [{ missionsStarted: -1 }, { merges: 1 }, { merges: -1 }]) expect(() => validateCheckpoint({ ...cp, counters: { ...cp.counters, ...over } })).toThrow("checkpoint-invalid");
    expect(() => validateCheckpoint({ ...cp, order: ["ms-001"] })).toThrow("checkpoint-invalid");
  });
  it("registra proveniência Codex sem inventar aprovação ou revisão", () => {
    expect(validateCommitMessage("test: validar caso\n\nCo-Authored-By: Codex <noreply@openai.com>\n")).toContain("Codex");
    expect(() => validateCommitMessage("test: validar caso\n\nReviewed-by: proprietário\n")).toThrow();
  });
  it("prepara serviço restrito sem instalá-lo nem colocar credenciais no plist", () => {
    const dir = root();
    const file = prepareService({ repoRoot: dir, home: path.join(dir, "home") });
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    const text = fs.readFileSync(file, "utf8");
    expect(text).toContain("scripts/codex-supervise.mjs"); expect(text).not.toMatch(/claude-launch|EnvironmentVariables|Token|KeyFile/);
    expect(text).not.toContain("KeepAlive"); expect(text).toContain("<integer>300</integer>");
    expect(servicePlist({ repoRoot: `${dir}/a & b`, home: dir })).toContain("a &amp; b");
    fs.unlinkSync(file); fs.rmdirSync(path.dirname(file)); fs.symlinkSync(os.tmpdir(), path.dirname(file));
    expect(() => prepareService({ repoRoot: dir })).toThrow("service-symlink");
  });
});

describe("supervisor persistente", () => {
  it("reobserva revisão pendente e retoma sem pedir nova missão", async () => {
    const reasons = ["awaiting-owner:review-required", "awaiting-owner:review-required", "backlog-complete"];
    let waits = 0;
    const result = await serve({ run: async () => ({ status: "done", reason: reasons.shift() }), sleep: async (ms) => { expect(ms).toBeLessThanOrEqual(30_000); waits++; } });
    expect(result.reason).toBe("backlog-complete"); expect(waits).toBe(2);
  });
  it("revogação, limites ou falha não criam reinício infinito", async () => {
    for (const reason of ["ST-REVOKED", "run-deadline", "blocked:agent-no-progress"]) {
      let calls = 0;
      expect((await serve({ run: async () => { calls++; return { status: "stopped", reason }; }, sleep: async () => { throw new Error("não esperar"); } })).reason).toBe(reason);
      expect(calls).toBe(1);
    }
  });
});
