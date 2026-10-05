// Codex implementa sob sandbox. O supervisor conserva autorização e entrega; nenhum launcher Claude é iniciado.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn as nodeSpawn, spawnSync } from "node:child_process";
import { DELIVERY_ENV, selectRecord, pathAllowedByRecord } from "./claude-delivery-record.mjs";
import { execute, defaultGit, childEnv } from "./claude-git.mjs";
import { classifyPath } from "./claude-risk.mjs";

export const CODEX_BINARY = "/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex";
export const CODEX_VERSION = "0.160.0";
export const RESULT_SCHEMA = { type: "object", additionalProperties: false, required: ["status", "title", "commitMessage", "body", "diagnosis"], properties: {
  status: { type: "string", enum: ["completed", "blocked"] }, title: { type: "string" }, commitMessage: { type: "string" }, body: { type: "string" }, diagnosis: { type: "string" },
} };

/** Política por missão. Sem rede de comandos, sem escrita em Git, controles, credenciais ou registros externos. */
export function codexConfig(repoRoot, record) {
  const root = fs.realpathSync(repoRoot);
  const entries = [[":minimal", "read"], [root, "read"]];
  entries.push([path.dirname(path.dirname(process.execPath)), "read"]);
  for (const rel of record.paths) {
    if (classifyPath(rel.replace(/\/$/, "")).risk !== "routine") throw new Error("codex-scope");
    // Recusa symlinks inclusive nos ancestrais: permissões não podem apontar para fora do workspace.
    let cur = root;
    for (const part of rel.split("/").filter(Boolean)) {
      cur = path.join(cur, part);
      if (fs.existsSync(cur) && fs.lstatSync(cur).isSymbolicLink()) throw new Error("codex-symlink");
    }
    entries.push([path.join(root, rel), "write"]);
  }
  for (const rel of [".git", ".claude", ".codex", ".agents", ".oplyra", ".github", "scripts", "tools", "supabase", "docs/harness", "docs/decisions", "sources", "test/contracts", "docs/product/marketing-ops/contracts", "docs/product/marketing-ops/00-documento-transicao.md"]) entries.push([path.join(root, rel), "read"]);
  for (const pattern of ["**/.env", "**/.env.*", "**/.npmrc", "**/*private*.pem", "**/auth.json", "**/credentials.json"]) entries.push([`${root}/${pattern}`, "deny"]);
  const controlName = /^(AGENTS\.md|CLAUDE\.md|package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|tsconfig.*\.json|(vitest|playwright|next)\.config\..*)$/;
  const scan = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", ".git", ".next", ".oplyra"].includes(ent.name) || ent.isSymbolicLink()) continue;
      const abs = path.join(dir, ent.name);
      if ([".agents", ".codex", ".claude"].includes(ent.name)) { entries.push([abs, "read"]); continue; }
      if (ent.isDirectory()) scan(abs);
      else if (controlName.test(ent.name)) entries.push([abs, "read"]);
    }
  };
  scan(root);
  // -c divide a chave por pontos; caminhos com pontos devem estar no VALOR TOML da tabela.
  const filesystem = `{${entries.map(([p, access]) => `${JSON.stringify(p)}=${JSON.stringify(access)}`).join(",")}}`;
  return ["default_permissions=\"mission\"", "approval_policy=\"never\"", "permissions.mission.network.enabled=false", `permissions.mission.filesystem=${filesystem}`];
}

/** Processo em grupo; saída bruta não é persistida nem exibida (inclusive segredos divididos entre chunks). */
export function codexProcess({ repoRoot, binary = CODEX_BINARY, spawn = nodeSpawn, version = () => {
  const r = spawnSync(binary, ["--version"], { encoding: "utf8", timeout: 10_000, env: childEnv(process.env) });
  return r.status === 0 ? /\b(\d+\.\d+\.\d+)\b/.exec(r.stdout)?.[1] : null;
}, now = () => new Date(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), env = process.env, killGroup = (pid, signal) => process.kill(-pid, signal), pollMs = 1000, killGraceMs = 5000 } = {}) {
  return async ({ prompt, schemaFile, outputFile, record, timeoutSeconds, shouldStop }) => {
    if (version() !== CODEX_VERSION) return { exitCode: 2, stopped: false, timedOut: false, refusal: "codex-version" };
    const args = ["exec", "--strict-config", "--ignore-user-config", "--ephemeral", "--json", "-C", repoRoot, "--output-schema", schemaFile, "-o", outputFile];
    for (const cfg of codexConfig(repoRoot, record)) args.push("-c", cfg);
    args.push("-");
    const cleanEnv = childEnv(env);
    cleanEnv.PATH = `${path.dirname(process.execPath)}:${cleanEnv.PATH}`;
    const child = spawn(binary, args, { cwd: repoRoot, env: cleanEnv, detached: true, stdio: ["pipe", "ignore", "ignore"] });
    child.stdin?.end(prompt);
    let exited = false, exitCode = null;
    const done = new Promise((resolve) => {
      child.on("exit", (code) => { exited = true; exitCode = code; resolve(); });
      child.on("error", () => { exited = true; exitCode = 1; resolve(); });
    });
    const deadline = now().getTime() + timeoutSeconds * 1000;
    let stopped = false, timedOut = false;
    const kill = (signal) => { try { killGroup(child.pid, signal); } catch { child.kill(signal); } };
    while (!exited) {
      await Promise.race([done, sleep(pollMs)]);
      if (exited) break;
      stopped = Boolean(shouldStop()); timedOut = now().getTime() >= deadline;
      if (stopped || timedOut) {
        kill("SIGTERM");
        await Promise.race([done, sleep(killGraceMs)]);
        // Mesmo se o pai sair, descendentes no grupo também precisam ser encerrados.
        kill("SIGKILL");
        await done;
      }
    }
    return { exitCode, stopped, timedOut };
  };
}

/** A seleção verificada do registro é feita pelo supervisor, nunca por variáveis fornecidas pelo agente. */
export function nativeAgent({ repoRoot, home = os.homedir(), recordDir = path.join(home, ".oplyra/delivery"), fsImpl = fs, now = () => new Date(), processAgent, wrapper = execute, wrapperPorts = {}, git = defaultGit(repoRoot) } = {}) {
  const worker = processAgent ?? codexProcess({ repoRoot, now });
  return async ({ ref, kind, promptFile, timeoutSeconds, shouldStop, failing = [] }) => {
    const selected = selectRecord({ ref, recordDir, now: now(), fsImpl });
    const { record, file, sha256 } = selected;
    const ports = { ...wrapperPorts, repoRoot, home, recordDir, now, env: { PATH: process.env.PATH, HOME: home, [DELIVERY_ENV.ref]: ref, [DELIVERY_ENV.file]: file, [DELIVERY_ENV.sha256]: sha256 } };
    const call = async (verb, args = []) => {
      if (shouldStop()) throw new Error("agent-stopped");
      const r = await wrapper(verb, args, ports);
      if (r.code !== 0) throw new Error(r.refusal ?? "delivery-refused");
      return r.out;
    };
    const out = (args) => {
      const r = git(args, { env: childEnv({ PATH: process.env.PATH, HOME: home }) });
      if (r.status !== 0) throw new Error("codex-git-read");
      return r.stdout;
    };
    try {
      if (out(["rev-parse", "--abbrev-ref", "HEAD"]).trim() !== record.branch) await call("branch");
      const scratch = path.join(repoRoot, ".oplyra/runner-artifacts", ref);
      let parent = repoRoot;
      for (const segment of [".oplyra", "runner-artifacts", ref]) {
        parent = path.join(parent, segment);
        if (fsImpl.existsSync(parent) && fsImpl.lstatSync(parent).isSymbolicLink()) throw new Error("codex-symlink");
      }
      fsImpl.mkdirSync(scratch, { recursive: true, mode: 0o700 });
      const schemaFile = path.join(scratch, "schema.json"), outputFile = path.join(scratch, "result.json");
      fsImpl.writeFileSync(schemaFile, JSON.stringify(RESULT_SCHEMA), { mode: 0o600 });
      // Nunca aceita o resultado antigo de uma sessão interrompida.
      if (fsImpl.existsSync(outputFile)) fsImpl.unlinkSync(outputFile);
      let evidence = "";
      if (kind === "fix") {
        evidence += await call("ci-status");
        for (const check of failing) evidence += `\n${await call("ci-log", ["--check", check])}`;
      }
      const prompt = `${fsImpl.readFileSync(promptFile, "utf8")}\n\nExecutor Codex: leia AGENTS.md e as skills pertinentes. Implemente apenas os caminhos ${JSON.stringify(record.paths)}. A entrega Git e GitHub é responsabilidade do supervisor. Termine após os checks locais aplicáveis. Devolva o JSON solicitado, sem segredos. commitMessage deve seguir Conventional Commits e não conter coautoria; o supervisor acrescentará a proveniência Codex. Se houver falha de CI, diagnosis deve conter JSON oplyra-ci-diagnosis/1 vinculado à evidência abaixo; não invente evidência. Se bloqueado, use status blocked.\n${evidence}`;
      const res = await worker({ prompt, record, schemaFile, outputFile, timeoutSeconds, shouldStop });
      if (res.exitCode !== 0 || res.stopped || res.timedOut || shouldStop()) return { ...res, stopped: res.stopped || shouldStop() };
      const stat = fsImpl.lstatSync(outputFile);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32_768) throw new Error("codex-result");
      const result = JSON.parse(fsImpl.readFileSync(outputFile, "utf8"));
      if (Object.keys(result).sort().join(",") !== "body,commitMessage,diagnosis,status,title" || !["completed", "blocked"].includes(result.status) || ["title", "commitMessage", "body", "diagnosis"].some((k) => typeof result[k] !== "string")) throw new Error("codex-result");
      if (result.status === "blocked") return { exitCode: 2, stopped: false, timedOut: false };
      const changed = [...out(["diff", "--name-only", "-z", "HEAD"]).split("\0"), ...out(["ls-files", "--others", "--exclude-standard", "-z"]).split("\0")].filter(Boolean);
      const files = [...new Set(changed)];
      if (files.some((f) => !pathAllowedByRecord(f, record) || classifyPath(f).risk !== "routine")) throw new Error("codex-scope");
      if (files.length) {
        if (kind === "fix") {
          const diagnosis = path.join(scratch, "diagnosis.json");
          fsImpl.writeFileSync(diagnosis, result.diagnosis, { mode: 0o600 });
          await call("ci-diagnose", ["--diagnosis-file", path.relative(repoRoot, diagnosis)]);
        }
        const message = path.join(scratch, "message.txt");
        if (/^co-authored-by:/im.test(result.commitMessage)) throw new Error("codex-result");
        fsImpl.writeFileSync(message, `${result.commitMessage.trimEnd()}\n\nCo-Authored-By: Codex <noreply@openai.com>\n`, { mode: 0o600 });
        await call("stage", files);
        await call("commit", ["--message-file", path.relative(repoRoot, message)]);
      }
      // Wrappers relêem orçamento, autorização, SHA, diagnóstico e proteção a cada efeito.
      await call("push");
      const body = path.join(scratch, "body.md");
      fsImpl.writeFileSync(body, result.body, { mode: 0o600 });
      await call(kind === "fix" ? "pr-update" : "pr-create", ["--title", result.title, "--body-file", path.relative(repoRoot, body)]);
      return res;
    } catch (e) {
      // Mensagem de exceção não entra em logs: pode conter conteúdo produzido pelo modelo ou por serviços.
      return { exitCode: 2, stopped: shouldStop(), timedOut: false, refusal: /^[A-Z][A-Z0-9-]+$/.test(e.message ?? "") ? e.message : "codex-adapter-blocked" };
    }
  };
}
