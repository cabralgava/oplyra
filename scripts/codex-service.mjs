#!/usr/bin/env node
// Preparação explícita do serviço do usuário. `prepare` não instala nem inicia processos.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { loadStanding, defaultStandingDir, defaultKillFile } from "./claude-standing.mjs";
import { defaultRunnerGit } from "./claude-runner.mjs";
import { createIntegrator } from "./claude-integrate.mjs";
import { defaultKeys } from "./claude-git.mjs";

export const SERVICE_LABEL = "com.oplyra.codex-development";
const xml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

export function servicePlist({ repoRoot, nodeBinary = process.execPath, home = os.homedir() }) {
  if (![repoRoot, nodeBinary, home].every((p) => path.isAbsolute(p) && !/[\r\n\0]/.test(p))) throw new Error("service-path");
  const logs = path.join(home, ".oplyra/runner");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${SERVICE_LABEL}</string>
<key>ProgramArguments</key><array><string>${xml(nodeBinary)}</string><string>${xml(path.join(repoRoot, "scripts/codex-supervise.mjs"))}</string></array>
<key>WorkingDirectory</key><string>${xml(repoRoot)}</string>
<key>RunAtLoad</key><true/>
<key>StartInterval</key><integer>300</integer>
<key>StandardOutPath</key><string>${xml(path.join(logs, "supervisor.log"))}</string>
<key>StandardErrorPath</key><string>${xml(path.join(logs, "supervisor-error.log"))}</string>
</dict></plist>
`;
}

export function prepareService({ repoRoot, home = os.homedir(), nodeBinary = process.execPath }) {
  const dir = path.join(repoRoot, ".oplyra/launchd");
  for (const p of [path.join(repoRoot, ".oplyra"), dir]) if (fs.existsSync(p) && fs.lstatSync(p).isSymbolicLink()) throw new Error("service-symlink");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `${SERVICE_LABEL}.plist`);
  fs.writeFileSync(file, servicePlist({ repoRoot, home, nodeBinary }), { mode: 0o600 });
  return file;
}

export async function installService({ repoRoot, home = os.homedir(), nodeBinary = process.execPath }) {
  if (process.platform !== "darwin") throw new Error("service-platform");
  // Emissão pelo proprietário deve existir antes de instalar qualquer execução persistente.
  const standing = () => loadStanding({ dir: defaultStandingDir(home), killFile: defaultKillFile(home) });
  const authorized = standing();
  const beforeEffect = () => { if (standing().sha256 !== authorized.sha256) throw new Error("service-authorization-changed"); };
  const github = createIntegrator({ keys: defaultKeys(home), beforeEffect });
  const runGit = defaultRunnerGit({ repoRoot, github, beforeEffect });
  const dirty = await runGit(["status", "--porcelain=v1", "--untracked-files=all"]);
  if (dirty.status !== 0 || dirty.stdout.trim()) throw new Error("service-dirty");
  const fetch = await runGit(["fetch", "--no-tags", "origin", "refs/heads/main:refs/remotes/origin/main"], { net: true });
  if (fetch.status !== 0) throw new Error("service-main-unavailable");
  const same = await runGit(["diff", "--quiet", "refs/remotes/origin/main", "--", "scripts", ".github", "docs/backlog/missions.json", "AGENTS.md"]);
  if (same.status !== 0) throw new Error("service-bootstrap-not-integrated");
  const source = prepareService({ repoRoot, home, nodeBinary });
  beforeEffect();
  const dir = path.join(home, "Library/LaunchAgents");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${SERVICE_LABEL}.plist`);
  // Não sobrescreve serviço existente nem usa bootout como recuperação genérica.
  fs.writeFileSync(file, fs.readFileSync(source), { flag: "wx", mode: 0o600 });
  const loaded = spawnSync("/bin/launchctl", ["bootstrap", `gui/${process.getuid()}`, file], { encoding: "utf8", timeout: 15_000 });
  if (loaded.status !== 0) throw new Error("service-bootstrap-unknown");
  const check = spawnSync("/bin/launchctl", ["print", `gui/${process.getuid()}/${SERVICE_LABEL}`], { encoding: "utf8", timeout: 10_000 });
  if (check.status !== 0) throw new Error("service-not-confirmed");
  return { file, registered: true }; // registro no SO não comprova missão, CI ou merge
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const repoRoot = process.cwd();
  try {
    if (process.argv[2] === "prepare") console.log(`Serviço preparado; não instalado: ${prepareService({ repoRoot })}`);
    else if (process.argv[2] === "install") console.log(`Serviço registrado: ${(await installService({ repoRoot })).file}. Confira runner:status e o PID antes de declarar execução ativa.`);
    else throw new Error("service-command");
  } catch (e) {
    // Somente códigos controlados: nunca saída bruta de Git/launchctl ou arquivos de autorização.
    console.error(`Codex service: ${/^(service-[a-z-]+|ST-[A-Z-]+)$/.test(e.code ?? e.message) ? e.code ?? e.message : "service-failed"}`);
    process.exitCode = 2;
  }
}
