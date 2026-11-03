#!/usr/bin/env node
// Launcher oficial do Developer Harness (CR-031). É a ÚNICA entrada suportada
// para iniciar o Claude Code neste repositório (`pnpm claude:local`,
// `pnpm claude:maintenance`). Falha fechada e nunca imprime valores de variáveis
// de ambiente, URLs, comandos ou segredos: só um código fixo e, quando útil, o
// NOME da variável ou chave que motivou a recusa.
//
// A invocação direta de `claude` fora deste launcher NÃO tem garantia alguma.
// O guard continua sendo defesa em profundidade, não sandbox.
//
// O Developer Harness não faz parte do produto: este arquivo não é importado
// por nenhum código do produto.

import { spawn as nodeSpawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";

import { DELIVERY_ENV, REF_PATTERN, RecordError, selectRecord } from "./claude-delivery-record.mjs";

export const PROOF_IDS = Object.freeze(["P1", "P2", "P3", "P4", "P5", "P6"]);

/** Algoritmo determinístico: `dontAsk` somente se as seis provas forem inequivocamente `true`. */
export function decidePermissionMode(proofs) {
  if (!proofs || typeof proofs !== "object") return "manual";
  return PROOF_IDS.every((id) => proofs[id] === true) ? "dontAsk" : "manual";
}

/**
 * Evidência da sonda offline (`scripts/claude-permission-probe.mjs`, CR-031 §5.2),
 * executada em 30/09/2026 com o CLI 2.1.284 do projeto isolado, dentro de um perfil
 * de sandbox sem rede (exceto loopback) e contra um stub local. Só booleanos.
 */
export const PROBE_EVIDENCE = Object.freeze({
  date: "2026-09-30",
  cli: "2.1.284",
  proofs: Object.freeze({ P1: true, P2: true, P3: true, P4: true, P5: true, P6: true }),
});

/**
 * Permission mode decidido pelo algoritmo do CR-031 §5.2 a partir da evidência
 * acima: `dontAsk` se as seis provas passaram; `manual` em qualquer outro caso.
 */
export const PERMISSION_MODE = decidePermissionMode(PROBE_EVIDENCE.proofs);
export const ALLOWED_PERMISSION_MODES = Object.freeze(["dontAsk", "manual"]);

const ALLOWED_ARGVS = Object.freeze({
  "": "session",
  "--maintenance": "maintenance",
  "--versions": "versions",
  "--mcp-list": "mcp-list",
});

export const FORBIDDEN_FLAGS = Object.freeze([
  "--bare", "--safe-mode", "--dangerously-skip-permissions", "--allow-dangerously-skip-permissions", "--permission-mode", "--settings",
  "--setting-sources", "--mcp-config", "--strict-mcp-config", "--add-dir", "--allowedTools", "--allowed-tools", "--disallowedTools",
  "--disallowed-tools", "--tools", "--plugin-dir", "--restricted", "--permission-prompts",
]);

/** Variáveis de ambiente que trocariam credencial, endpoint ou origem das configurações. */
export const FORBIDDEN_ENV = Object.freeze([
  "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX",
  "CLAUDE_CODE_USE_FOUNDRY", "OPENROUTER_API_KEY", "CLAUDE_CODE_SIMPLE", "CLAUDE_CODE_SAFE_MODE", "CLAUDE_CONFIG_DIR",
  // CR-033: credenciais pessoais do proprietário e a chave do GitHub App nunca chegam à sessão; só o wrapper lê a chave, de um arquivo
  "GH_TOKEN", "GITHUB_TOKEN", "GH_ENTERPRISE_TOKEN", "GH_HOST", "GIT_ASKPASS",
  "OPLYRA_GITHUB_APP_ID", "OPLYRA_GITHUB_APP_INSTALLATION_ID", "OPLYRA_GITHUB_APP_PRIVATE_KEY", "OPLYRA_GITHUB_APP_KEY_FILE",
  // só o launcher define estas (a partir do registro verificado); herdadas do ambiente seriam forjadas
  "OPLYRA_DELIVERY_REF", "OPLYRA_DELIVERY_RECORD", "OPLYRA_DELIVERY_RECORD_SHA256",
]);

/** Chaves proibidas nas fontes de settings que não sejam a do projeto. */
export const FORBIDDEN_SETTINGS_KEYS = Object.freeze(["disableAllHooks", "hooks", "allowManagedHooksOnly", "env", "apiKeyHelper"]);
export const FORBIDDEN_PERMISSION_KEYS = Object.freeze(["defaultMode", "additionalDirectories"]);

export const HARNESS_DIR = "tools/developer-harness";
export const HARNESS_BINS = Object.freeze({ claude: "claude", context7: "context7-mcp", playwright: "playwright-mcp" });
export const HARNESS_PACKAGES = Object.freeze({ claude: "@anthropic-ai/claude-code", context7: "@upstash/context7-mcp", playwright: "@playwright/mcp" });
export const MAINTENANCE_PHRASE = "MANUTENCAO-CONTROL-PLANE";
const EXACT_VERSION = /^\d+\.\d+\.\d+$/;
/** Ferramentas que o hook precisa interceptar; o matcher das settings é conferido contra esta lista. */
export const REQUIRED_MATCHER_TOKENS = Object.freeze(["Bash", "Read", "Glob", "Grep", "Write", "Edit", "MultiEdit", "NotebookEdit", "WebFetch", "WebSearch", "mcp__.*"]);
export const HOOK_MATCHER = REQUIRED_MATCHER_TOKENS.join("|");

export const MESSAGES = Object.freeze({
  "LA-ARGS": "argumentos não permitidos: o launcher não aceita repasse de opções",
  "LA-ENV": "variável de ambiente não permitida no launcher oficial",
  "LA-SETTINGS-INVALID": "arquivo de settings ilegível ou inválido",
  "LA-SETTINGS-FORBIDDEN": "settings com chave não permitida",
  "LA-PROJECT-SETTINGS": "settings do projeto sem o hook Local First autônomo ou com configuração não permitida",
  "LA-NOT-INSTALLED": "projeto de tooling não instalado: execute `pnpm harness:install` (manutenção explícita)",
  "LA-SELFTEST": "autotestes do guard/launcher falharam",
  "LA-TTY": "a sessão de manutenção exige terminal interativo",
  "LA-CONFIRM": "confirmação de manutenção não recebida",
  "LA-MODE": "permission mode inválido",
  "LA-CWD": "execute a partir do repositório Oplyra",
  "LA-TOOLING-INVALID": "manifest do projeto de tooling ausente, ilegível ou sem versões exatas",
  "LA-TOOLING-MISSING": "manifest instalado de um pacote do tooling ausente ou ilegível",
  "LA-TOOLING-ESCAPE": "manifest ou executável do tooling resolve para fora de tools/developer-harness",
  "LA-TOOLING-MISMATCH": "versão instalada diverge do manifest isolado",
  "LA-CLI-UNPROVEN": "Claude Code sem prova de permissões vigente para esta versão: modo manual",
  "LA-INCREMENT": "registro de autorização da entrega delegada ausente, inválido, expirado ou inseguro (o código DR-* indica o motivo)",
  "LA-PROMPT": "arquivo de prompt da sessão não interativa fora do diretório do runner, inseguro, grande demais ou inexistente",
});

class Refusal extends Error {
  constructor(code, name) {
    super(code);
    this.code = code;
    this.name_ = name;
  }
}
const refuse = (code, name) => {
  throw new Refusal(code, name);
};

/** `--increment=<ref>` (CR-033): única forma com valor; só SELECIONA o registro de autorização da entrega delegada. */
export function parseIncrement(argv) {
  if (argv.length !== 1) return null;
  const m = /^--increment=(.+)$/.exec(argv[0]);
  return m && REF_PATTERN.test(m[1]) ? m[1] : null;
}

/**
 * Sessão não interativa do runner de desenvolvimento contínuo (política de 04/10/2026): `--increment=<ref> --prompt-file=<arquivo>`, nesta
 * ordem. O arquivo é lido pelo launcher (nunca repassado como argumento ao CLI) e só vale dentro do diretório de prompts do runner.
 */
export function parseHeadless(argv) {
  if (argv.length !== 2) return null;
  const inc = /^--increment=(.+)$/.exec(argv[0]);
  const file = /^--prompt-file=(.+)$/.exec(argv[1]);
  return inc && file && REF_PATTERN.test(inc[1]) ? { ref: inc[1], promptFile: file[1] } : null;
}
export const PROMPT_MAX_BYTES = 32 * 1024;

/** O prompt é um arquivo do proprietário em `~/.oplyra/runner/prompts/<ref>-<n>.md` (0600, dono atual, regular, sem symlink, ≤ 32 KiB). */
export function inspectPromptFile({ homeDir, ref, file, uid = typeof process.getuid === "function" ? process.getuid() : undefined, fsImpl = fs }) {
  const dir = path.join(homeDir, ".oplyra", "runner", "prompts");
  const resolved = path.resolve(file);
  if (path.dirname(resolved) !== dir || !new RegExp(`^${ref}-[0-9]{1,3}\\.md$`).test(path.basename(resolved))) refuse("LA-PROMPT");
  let st;
  let dirSt;
  try {
    dirSt = fsImpl.lstatSync(dir);
    st = fsImpl.lstatSync(resolved);
  } catch {
    refuse("LA-PROMPT");
  }
  if (dirSt.isSymbolicLink() || !dirSt.isDirectory() || st.isSymbolicLink() || !st.isFile() || st.size > PROMPT_MAX_BYTES || (st.mode & 0o077) !== 0 || (uid !== undefined && (st.uid !== uid || dirSt.uid !== uid))) refuse("LA-PROMPT");
  return fsImpl.readFileSync(resolved, "utf8");
}

export function classifyArgv(argv) {
  const key = argv.join(" ");
  if (argv.some((a) => FORBIDDEN_FLAGS.some((f) => a === f || a.startsWith(`${f}=`)))) return null;
  if (parseHeadless(argv)) return "headless";
  if (parseIncrement(argv)) return "session";
  return Object.prototype.hasOwnProperty.call(ALLOWED_ARGVS, key) ? ALLOWED_ARGVS[key] : null;
}

export function inspectEnv(env) {
  for (const name of FORBIDDEN_ENV) if (env[name] !== undefined && env[name] !== "") return name;
  return null;
}

/** Retorna o nome da primeira chave proibida em uma fonte de settings que não seja a do projeto. */
export function inspectExternalSettings(settings) {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return "<raiz>";
  for (const k of FORBIDDEN_SETTINGS_KEYS) if (Object.prototype.hasOwnProperty.call(settings, k)) return k;
  const perms = settings.permissions;
  if (perms !== undefined) {
    if (!perms || typeof perms !== "object" || Array.isArray(perms)) return "permissions";
    for (const k of FORBIDDEN_PERMISSION_KEYS) if (Object.prototype.hasOwnProperty.call(perms, k)) return `permissions.${k}`;
  }
  return null;
}

/** As settings do projeto precisam carregar o hook autônomo e nenhuma chave de desativação. */
export function inspectProjectSettings(settings) {
  if (!settings || typeof settings !== "object") return "<raiz>";
  for (const k of ["disableAllHooks", "allowManagedHooksOnly", "env", "apiKeyHelper"]) if (Object.prototype.hasOwnProperty.call(settings, k)) return k;
  const perms = settings.permissions ?? {};
  for (const k of FORBIDDEN_PERMISSION_KEYS) if (Object.prototype.hasOwnProperty.call(perms, k)) return `permissions.${k}`;
  const entries = settings.hooks?.PreToolUse;
  if (!Array.isArray(entries) || entries.length !== 1) return "hooks.PreToolUse";
  const hooks = entries[0]?.hooks;
  if (!Array.isArray(hooks) || hooks.length !== 1) return "hooks.PreToolUse";
  const cmd = String(hooks[0]?.command ?? "");
  if (hooks[0]?.type !== "command" || !/claude-local-first-guard\.mjs" --policy=autonomous$/.test(cmd)) return "hooks.PreToolUse";
  // o hook precisa interceptar leituras e todo MCP: sem isso Read/Glob/Grep e Context7 passariam sem o guard
  const tokens = String(entries[0]?.matcher ?? "").split("|");
  if (!REQUIRED_MATCHER_TOKENS.every((t) => tokens.includes(t))) return "hooks.PreToolUse.matcher";
  // Context7 faz egress: nunca permitido por settings na sessão autônoma
  const allow = Array.isArray(perms.allow) ? perms.allow : [];
  if (allow.some((r) => typeof r !== "string" || /^mcp__context7/.test(r))) return "permissions.allow";
  return null;
}

/**
 * Vincula o modo `dontAsk` à versão REALMENTE instalada. Lê os manifests instalados dos três pacotes,
 * exige que (com symlinks resolvidos) fiquem dentro de tools/developer-harness e compara as versões
 * com o manifest isolado e, no caso do Claude Code, com a versão da sonda (`PROBE_EVIDENCE.cli`).
 * Retorna `{ refusal, name }` para ausência/divergência/escape (o launcher recusa) e `{ cliProven }`
 * quando o tooling é consistente; só `cliProven === true` pode resultar em `dontAsk`.
 */
export function inspectToolingBinding(repoRoot, probedCli = PROBE_EVIDENCE.cli, readVersion = readBinaryVersion) {
  let harness;
  try {
    harness = fs.realpathSync(path.join(repoRoot, HARNESS_DIR));
  } catch {
    return { refusal: "LA-NOT-INSTALLED" };
  }
  const inside = (p) => {
    try {
      const real = fs.realpathSync(p);
      return real === harness || real.startsWith(harness + path.sep) ? real : null;
    } catch {
      return null;
    }
  };
  const manifestPath = inside(path.join(harness, "package.json"));
  const declared = manifestPath ? readJson(manifestPath)?.devDependencies : undefined;
  if (!declared || typeof declared !== "object" || Array.isArray(declared)) return { refusal: "LA-TOOLING-INVALID", name: "package.json" };
  let claudeVersion;
  for (const [key, pkg] of Object.entries(HARNESS_PACKAGES)) {
    if (typeof declared[pkg] !== "string" || !EXACT_VERSION.test(declared[pkg])) return { refusal: "LA-TOOLING-INVALID", name: pkg };
    const file = path.join(harness, "node_modules", ...pkg.split("/"), "package.json");
    if (!fs.existsSync(file)) return { refusal: "LA-TOOLING-MISSING", name: pkg };
    const real = inside(file);
    if (!real) return { refusal: "LA-TOOLING-ESCAPE", name: pkg };
    const installed = readJson(real);
    if (!installed || installed.name !== pkg || typeof installed.version !== "string" || !EXACT_VERSION.test(installed.version)) return { refusal: "LA-TOOLING-MISSING", name: pkg };
    if (installed.version !== declared[pkg]) return { refusal: "LA-TOOLING-MISMATCH", name: pkg };
    if (key === "claude") claudeVersion = installed.version;
  }
  for (const bin of Object.values(HARNESS_BINS)) {
    if (!inside(path.join(harness, "node_modules", ".bin", bin))) return { refusal: "LA-TOOLING-ESCAPE", name: bin };
  }
  // Conferir só o package.json não protege contra um auto-update do executável: a versão EFETIVA do binário também precisa ser a provada.
  const effective = readVersion(inside(path.join(harness, "node_modules", ".bin", HARNESS_BINS.claude)));
  return { cliProven: typeof probedCli === "string" && EXACT_VERSION.test(probedCli) && claudeVersion === probedCli && effective === probedCli };
}

/** Versão que o binário local declara em `--version` (primeira linha, `X.Y.Z…`); null se ilegível. Desliga o auto-update nesta chamada. */
export function readBinaryVersion(bin) {
  if (!bin) return null;
  try {
    const r = spawnSync(bin, ["--version"], { encoding: "utf8", timeout: 15000, env: { ...process.env, DISABLE_AUTOUPDATER: "1" } });
    const m = r.status === 0 ? /^(\d+\.\d+\.\d+)(?:\s|$)/.exec(String(r.stdout ?? "").trim().split("\n")[0]) : null;
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** Modo efetivo: `dontAsk` só se as provas o decidem E o Claude Code instalado é exatamente a versão provada. */
export function resolvePermissionMode(binding, proofs = PROBE_EVIDENCE.proofs) {
  return binding && binding.cliProven === true && decidePermissionMode(proofs) === "dontAsk" ? "dontAsk" : "manual";
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

/** Valida tudo o que precisa ser verdade antes de iniciar o CLI. Lança Refusal; nunca imprime. */
export function preflight({ repoRoot, homeDir, env, argv, runSelfTests, isTTY = false, recordDir, now }) {
  const kind = classifyArgv(argv);
  if (!kind) refuse("LA-ARGS");
  if (!["dontAsk", "manual"].includes(PERMISSION_MODE) || !ALLOWED_PERMISSION_MODES.includes(PERMISSION_MODE)) refuse("LA-MODE");
  const pkg = readJson(path.join(repoRoot, "package.json"));
  if (!pkg || pkg.name !== "oplyra" || !fs.existsSync(path.join(repoRoot, "scripts", "claude-launch.mjs"))) refuse("LA-CWD");
  const badEnv = inspectEnv(env);
  if (badEnv) refuse("LA-ENV", badEnv);

  const project = readJson(path.join(repoRoot, ".claude", "settings.json"));
  if (project === undefined) refuse("LA-SETTINGS-INVALID", "project");
  const badProject = inspectProjectSettings(project);
  if (badProject) refuse("LA-PROJECT-SETTINGS", badProject);

  const sources = [
    ["user", path.join(homeDir, ".claude", "settings.json")],
    ["user-local", path.join(homeDir, ".claude", "settings.local.json")],
    ["project-local", path.join(repoRoot, ".claude", "settings.local.json")],
  ];
  for (const [label, file] of sources) {
    if (!fs.existsSync(file)) continue;
    const parsed = readJson(file);
    if (parsed === undefined) refuse("LA-SETTINGS-INVALID", label);
    const bad = inspectExternalSettings(parsed);
    if (bad) refuse("LA-SETTINGS-FORBIDDEN", `${label}:${bad}`);
  }

  for (const bin of Object.values(HARNESS_BINS)) {
    if (!fs.existsSync(path.join(repoRoot, HARNESS_DIR, "node_modules", ".bin", bin))) refuse("LA-NOT-INSTALLED");
  }
  // o modo `dontAsk` vale para a versão realmente instalada: ausência, divergência ou escape recusam; versão sem prova vira `manual`
  const binding = inspectToolingBinding(repoRoot);
  if (binding.refusal) refuse(binding.refusal, binding.name);
  if (kind === "maintenance" && !isTTY) refuse("LA-TTY");
  if (runSelfTests && !runSelfTests()) refuse("LA-SELFTEST");
  // entrega delegada (CR-033): `--increment=<ref>` carrega e fixa o registro aprovado; a manutenção nunca chega aqui com incremento
  let delivery = null;
  const headless = parseHeadless(argv);
  const increment = headless ? headless.ref : parseIncrement(argv);
  if (increment) {
    try {
      delivery = selectRecord({ ref: increment, recordDir, now });
    } catch (e) {
      if (e instanceof RecordError) refuse("LA-INCREMENT", e.code);
      throw e;
    }
  }
  const prompt = headless ? inspectPromptFile({ homeDir, ref: headless.ref, file: headless.promptFile }) : undefined;
  return { kind, mode: kind === "maintenance" ? "manual" : resolvePermissionMode(binding), cliProven: binding.cliProven === true, ...(delivery ? { delivery } : {}), ...(prompt !== undefined ? { prompt } : {}) };
}

/** Ambiente do filho: sem herdar variáveis de entrega; só o registro verificado as define (e só na sessão com incremento). */
export function buildChildEnv(env, delivery) {
  const out = { ...env };
  for (const name of Object.values(DELIVERY_ENV)) delete out[name];
  if (delivery) {
    out[DELIVERY_ENV.ref] = delivery.record.ref;
    out[DELIVERY_ENV.file] = delivery.file;
    out[DELIVERY_ENV.sha256] = delivery.sha256;
  }
  return out;
}

export function harnessBin(repoRoot, name) {
  return path.join(repoRoot, HARNESS_DIR, "node_modules", ".bin", name);
}

/** Argumentos do CLI. A manutenção NÃO carrega a fonte `project`: o hook vem só do `--settings` desta chamada. */
export function buildSessionArgs({ kind, mode = PERMISSION_MODE, projectSettings }) {
  if (!ALLOWED_PERMISSION_MODES.includes(mode)) throw new Refusal("LA-MODE");
  const common = ["--strict-mcp-config", "--mcp-config", ".mcp.json", "--permission-mode", kind === "maintenance" ? "manual" : mode];
  if (kind === "maintenance") {
    const settings = {
      hooks: {
        PreToolUse: [{
          matcher: HOOK_MATCHER,
          hooks: [{ type: "command", command: 'node "$CLAUDE_PROJECT_DIR/scripts/claude-local-first-guard.mjs" --policy=maintenance', timeout: 10 }],
        }],
      },
      // o deny de Context7 vale só para a sessão autônoma: na manutenção ele é permitido em modo manual (o guard confere o modo)
      permissions: { deny: (projectSettings?.permissions?.deny ?? []).filter((r) => !String(r).startsWith("mcp__context7__")) },
    };
    return [...common, "--setting-sources", "user", "--settings", JSON.stringify(settings)];
  }
  // sessão não interativa (runner): mesmo modo e mesmas fontes de settings; o prompt entra pela entrada padrão, nunca como argumento
  if (kind === "headless") return [...common, "--setting-sources", "project", "-p"];
  return [...common, "--setting-sources", "project"];
}

function defaultSelfTests(repoRoot) {
  return () => {
    const r = spawnSync(process.execPath, [
      "--test", path.join(repoRoot, "scripts", "claude-local-first-guard.test.mjs"), path.join(repoRoot, "scripts", "claude-launch.test.mjs"),
    ], { cwd: repoRoot, stdio: "ignore", env: { ...process.env, OPLYRA_LAUNCH_SELFTEST: "1" } });
    return r.status === 0;
  };
}

async function confirmTyped(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question(prompt, resolve));
  rl.close();
  return answer === MAINTENANCE_PHRASE;
}

/** Ponto de entrada testável: todas as dependências externas são injetáveis. */
export async function run({
  argv = process.argv.slice(2), repoRoot, homeDir = os.homedir(), env = process.env, isTTY = Boolean(process.stdin.isTTY && process.stdout.isTTY),
  runSelfTests, spawn = nodeSpawn, confirm = confirmTyped, write = (s) => process.stderr.write(s), recordDir, now,
} = {}) {
  const root = repoRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  try {
    if (env.OPLYRA_LAUNCH_SELFTEST) refuse("LA-SELFTEST"); // o launcher não roda dentro dos próprios autotestes
    const { kind, mode, cliProven, delivery, prompt } = preflight({
      repoRoot: root, homeDir, env, argv, isTTY, recordDir, now,
      runSelfTests: runSelfTests ?? defaultSelfTests(root),
    });
    if ((kind === "session" || kind === "headless") && !cliProven && PERMISSION_MODE === "dontAsk") write(`Oplyra launcher: LA-CLI-UNPROVEN (${MESSAGES["LA-CLI-UNPROVEN"]})\n`);
    if (kind === "maintenance") {
      write("Sessão de manutenção do control plane do harness: modo manual; o proprietário aprova cada ação. Não autoriza staging, commit nem ação remota.\n");
      if (!(await confirm(`Digite ${MAINTENANCE_PHRASE} para continuar: `))) refuse("LA-CONFIRM");
    }
    const project = readJson(path.join(root, ".claude", "settings.json"));
    let bin = harnessBin(root, HARNESS_BINS.claude);
    let args;
    if (kind === "versions") {
      const out = [];
      for (const b of Object.values(HARNESS_BINS)) {
        const r = spawn(harnessBin(root, b), ["--version"], { cwd: root, stdio: "inherit" });
        out.push(await waitExit(r));
      }
      return out.every((c) => c === 0) ? 0 : 1;
    }
    if (kind === "mcp-list") args = ["mcp", "list"];
    else args = buildSessionArgs({ kind, mode, projectSettings: project });
    if (delivery) write(`Entrega delegada: registro ${delivery.record.ref} (SHA-256 ${delivery.sha256}) carregado. A chave delegatedDelivery decide se as escritas são executadas.\n`);
    if (kind === "headless") {
      const child = spawn(bin, args, { cwd: root, stdio: ["pipe", "inherit", "inherit"], env: buildChildEnv(env, delivery) });
      child?.stdin?.end?.(prompt);
      return await waitExit(child);
    }
    const child = spawn(bin, args, { cwd: root, stdio: "inherit", env: buildChildEnv(env, delivery) });
    return await waitExit(child);
  } catch (e) {
    if (e instanceof Refusal) {
      write(`Oplyra launcher: ${e.code}${e.name_ ? ` [${e.name_}]` : ""} (${MESSAGES[e.code]})\n`);
      return 2;
    }
    write("Oplyra launcher: falha inesperada (sem detalhes por segurança)\n");
    return 2;
  }
}

function waitExit(child) {
  return new Promise((resolve) => {
    if (child && typeof child.then === "function") {
      child.then(resolve);
      return;
    }
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = await run();
}
