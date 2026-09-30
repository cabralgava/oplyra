import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  ALLOWED_PERMISSION_MODES, FORBIDDEN_ENV, FORBIDDEN_FLAGS, HARNESS_PACKAGES, HOOK_MATCHER, MAINTENANCE_PHRASE, MESSAGES, PERMISSION_MODE, buildSessionArgs, classifyArgv,
  PROBE_EVIDENCE, decidePermissionMode, inspectEnv, inspectExternalSettings, inspectProjectSettings, inspectToolingBinding, preflight, resolvePermissionMode, run,
} from "./claude-launch.mjs";
import { SCENARIO, evaluateProofs } from "./claude-permission-probe.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const SEGREDO = "SEGREDO-launcher-hunter2-9c1d";

const PROJECT_SETTINGS = {
  hooks: { PreToolUse: [{ matcher: HOOK_MATCHER, hooks: [{
    type: "command", command: 'node "$CLAUDE_PROJECT_DIR/scripts/claude-local-first-guard.mjs" --policy=autonomous', timeout: 10 }] }] },
  permissions: { allow: ["Read"], deny: ["WebFetch", "mcp__context7__query-docs", "mcp__context7__resolve-library-id"] },
};

const PKGS = Object.values(HARNESS_PACKAGES);
const VERSIONS = { "@anthropic-ai/claude-code": PROBE_EVIDENCE.cli, "@upstash/context7-mcp": "4.1.1", "@playwright/mcp": "0.0.83" };

/**
 * `declared`: versões do manifest isolado (null = arquivo ausente; string = conteúdo bruto). `installed`: versões dos manifests instalados
 * (chave ausente/null = pacote não instalado). `link`: pacotes instalados como symlink para dentro (estilo pnpm) ou para fora do harness.
 */
function fixture({ project = PROJECT_SETTINGS, installed = true, userSettings, localSettings, declared = VERSIONS, present = VERSIONS, link = {}, binLink = false, installedName = {}, binVersion = PROBE_EVIDENCE.cli } = {}) {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "oplyra-launch-")));
  const repo = path.join(tmp, "repo");
  const home = path.join(tmp, "home");
  fs.mkdirSync(path.join(repo, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(repo, ".claude"), { recursive: true });
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(repo, "package.json"), JSON.stringify({ name: "oplyra" }));
  fs.writeFileSync(path.join(repo, "scripts", "claude-launch.mjs"), "");
  if (project !== null) fs.writeFileSync(path.join(repo, ".claude", "settings.json"), typeof project === "string" ? project : JSON.stringify(project));
  if (installed) {
    const harness = path.join(repo, "tools", "developer-harness");
    const bin = path.join(harness, "node_modules", ".bin");
    fs.mkdirSync(bin, { recursive: true });
    if (declared !== null) fs.writeFileSync(path.join(harness, "package.json"), typeof declared === "string" ? declared : JSON.stringify({ name: "@oplyra/developer-harness", devDependencies: declared }));
    const outside = path.join(tmp, "outside");
    for (const pkg of PKGS) {
      if (!present?.[pkg]) continue;
      const manifest = JSON.stringify({ name: installedName[pkg] ?? pkg, version: present[pkg] });
      const direct = path.join(harness, "node_modules", ...pkg.split("/"));
      if (link[pkg]) {
        const store = link[pkg] === "outside" ? path.join(outside, pkg) : path.join(harness, "node_modules", ".pnpm", pkg.replace("/", "+"), "node_modules", pkg);
        fs.mkdirSync(store, { recursive: true });
        fs.writeFileSync(path.join(store, "package.json"), manifest);
        fs.mkdirSync(path.dirname(direct), { recursive: true });
        fs.symlinkSync(store, direct);
      } else {
        fs.mkdirSync(direct, { recursive: true });
        fs.writeFileSync(path.join(direct, "package.json"), manifest);
      }
    }
    for (const b of ["claude", "context7-mcp", "playwright-mcp"]) {
      // o "binário" do claude declara a versão em --version, como o real ("2.1.284 (Claude Code)"); null = ilegível
      const script = b === "claude" ? (binVersion === null ? "#!/bin/sh\nexit 1\n" : `#!/bin/sh\necho "${binVersion}"\n`) : "#!/bin/sh\n";
      if (binLink && b === "claude") {
        fs.mkdirSync(outside, { recursive: true });
        fs.writeFileSync(path.join(outside, "claude"), script, { mode: 0o755 });
        fs.symlinkSync(path.join(outside, "claude"), path.join(bin, b));
      } else fs.writeFileSync(path.join(bin, b), script, { mode: 0o755 });
    }
  }
  if (userSettings !== undefined) fs.writeFileSync(path.join(home, ".claude", "settings.json"), typeof userSettings === "string" ? userSettings : JSON.stringify(userSettings));
  if (localSettings !== undefined) fs.writeFileSync(path.join(repo, ".claude", "settings.local.json"), typeof localSettings === "string" ? localSettings : JSON.stringify(localSettings));
  return { repo, home };
}

function pre(fx, over = {}) {
  return () => preflight({ repoRoot: fx.repo, homeDir: fx.home, env: {}, argv: [], runSelfTests: () => true, isTTY: true, ...over });
}
const codeOf = (fn) => {
  try {
    fn();
  } catch (e) {
    return e.code;
  }
  return "OK";
};

/* --------------------------------------------------------- decisão do modo */

test("decisão do permission mode: dontAsk só com as seis provas inequivocamente verdadeiras; senão manual", () => {
  const all = { P1: true, P2: true, P3: true, P4: true, P5: true, P6: true };
  assert.equal(decidePermissionMode(all), "dontAsk");
  for (const id of Object.keys(all)) {
    assert.equal(decidePermissionMode({ ...all, [id]: false }), "manual", `${id}=false`);
    assert.equal(decidePermissionMode({ ...all, [id]: undefined }), "manual", `${id}=undefined`);
    assert.equal(decidePermissionMode({ ...all, [id]: "ambiguous" }), "manual", `${id}=ambiguous`);
    assert.equal(decidePermissionMode({ ...all, [id]: 1 }), "manual", `${id}=1`);
    const { [id]: _omitida, ...semUma } = all;
    assert.equal(decidePermissionMode(semUma), "manual", `sem ${id}`);
  }
  for (const bad of [undefined, null, {}, [], "P1", 0, false]) assert.equal(decidePermissionMode(bad), "manual");
});

test("o modo do launcher é dontAsk ou manual; auto, acceptEdits, bypassPermissions e plan não existem", () => {
  assert.deepEqual([...ALLOWED_PERMISSION_MODES], ["dontAsk", "manual"]);
  assert.ok(ALLOWED_PERMISSION_MODES.includes(PERMISSION_MODE));
  for (const m of ["auto", "acceptEdits", "bypassPermissions", "plan", "default"]) {
    assert.ok(!ALLOWED_PERMISSION_MODES.includes(m), m);
    assert.throws(() => buildSessionArgs({ kind: "session", mode: m }), (e) => e.code === "LA-MODE");
  }
  const src = fs.readFileSync(path.join(here, "claude-launch.mjs"), "utf8");
  assert.ok(!/--permission-mode",\s*"(auto|acceptEdits|bypassPermissions)"/.test(src));
});

/* ---------------------------------------------------------------- argumentos */

test("argumentos: somente as quatro formas exatas; nenhum repasse; flags perigosas recusadas", () => {
  assert.equal(classifyArgv([]), "session");
  assert.equal(classifyArgv(["--maintenance"]), "maintenance");
  assert.equal(classifyArgv(["--versions"]), "versions");
  assert.equal(classifyArgv(["--mcp-list"]), "mcp-list");
  for (const bad of [["--bare"], ["--safe-mode"], ["--dangerously-skip-permissions"], ["--allow-dangerously-skip-permissions"], ["--permission-mode=auto"], ["--permission-mode", "bypassPermissions"],
    ["--settings", "{}"], ["--setting-sources=user"], ["--mcp-config", "x.json"], ["--maintenance", "--bare"], ["--print"], ["x"], ["--tools=Bash"], ["--restricted"]]) {
    assert.equal(classifyArgv(bad), null, bad.join(" "));
  }
  for (const f of ["--bare", "--safe-mode", "--dangerously-skip-permissions", "--allow-dangerously-skip-permissions"]) assert.ok(FORBIDDEN_FLAGS.includes(f), f);
});

/* ---------------------------------------------------------------- ambiente */

test("ambiente: chave real, endpoint alternativo e origem de settings são recusados; só o nome é reportado", () => {
  assert.equal(inspectEnv({}), null);
  assert.equal(inspectEnv({ ANTHROPIC_API_KEY: "" }), null);
  for (const name of FORBIDDEN_ENV) assert.equal(inspectEnv({ [name]: SEGREDO }), name);
  const fx = fixture();
  for (const name of ["ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "OPENROUTER_API_KEY"]) {
    assert.equal(codeOf(pre(fx, { env: { [name]: SEGREDO } })), "LA-ENV");
  }
});

/* ------------------------------------------------------------------ settings */

test("settings externas: desativação de hooks, hooks alternativos, env, apiKeyHelper e modos permissivos são recusados", () => {
  for (const bad of [{ disableAllHooks: true }, { hooks: {} }, { allowManagedHooksOnly: false }, { env: { A: "b" } }, { apiKeyHelper: "x" },
    { permissions: { defaultMode: "auto" } }, { permissions: { defaultMode: "bypassPermissions" } }, { permissions: { additionalDirectories: ["/"] } }, [], "x", null]) {
    assert.ok(inspectExternalSettings(bad), JSON.stringify(bad));
  }
  assert.equal(inspectExternalSettings({ enabledMcpjsonServers: ["context7"] }), null);
  assert.equal(inspectExternalSettings({ permissions: { allow: ["Read"] } }), null);
  assert.equal(inspectExternalSettings({}), null);
});

test("preflight: cada fonte de settings é validada (usuário, local do usuário e local do projeto)", () => {
  assert.equal(codeOf(pre(fixture())), "OK");
  assert.equal(codeOf(pre(fixture({ localSettings: { enabledMcpjsonServers: ["context7", "playwright"] } }))), "OK");
  for (const [k, v] of [["userSettings", { disableAllHooks: true }], ["localSettings", { disableAllHooks: true }], ["localSettings", { hooks: { PreToolUse: [] } }],
    ["userSettings", { permissions: { defaultMode: "auto" } }], ["localSettings", { permissions: { defaultMode: "acceptEdits" } }], ["userSettings", { env: { X: "1" } }]]) {
    assert.equal(codeOf(pre(fixture({ [k]: v }))), "LA-SETTINGS-FORBIDDEN", `${k} ${JSON.stringify(v)}`);
  }
  assert.equal(codeOf(pre(fixture({ localSettings: "{ inválido" }))), "LA-SETTINGS-INVALID");
  assert.equal(codeOf(pre(fixture({ userSettings: "não é json" }))), "LA-SETTINGS-INVALID");
});

test("preflight: settings do projeto precisam do hook autônomo e de nenhuma configuração alternativa", () => {
  assert.equal(inspectProjectSettings(PROJECT_SETTINGS), null);
  const semPolitica = structuredClone(PROJECT_SETTINGS);
  semPolitica.hooks.PreToolUse[0].hooks[0].command = 'node "$CLAUDE_PROJECT_DIR/scripts/claude-local-first-guard.mjs"';
  const manutencao = structuredClone(PROJECT_SETTINGS);
  manutencao.hooks.PreToolUse[0].hooks[0].command = 'node "$CLAUDE_PROJECT_DIR/scripts/claude-local-first-guard.mjs" --policy=maintenance';
  const dois = structuredClone(PROJECT_SETTINGS);
  dois.hooks.PreToolUse.push(structuredClone(dois.hooks.PreToolUse[0]));
  for (const bad of [semPolitica, manutencao, dois, { ...PROJECT_SETTINGS, disableAllHooks: true }, { ...PROJECT_SETTINGS, permissions: { defaultMode: "auto" } }, {}, { hooks: {} }]) {
    assert.ok(inspectProjectSettings(bad), JSON.stringify(bad).slice(0, 60));
  }
  assert.equal(codeOf(pre(fixture({ project: semPolitica }))), "LA-PROJECT-SETTINGS");
  assert.equal(codeOf(pre(fixture({ project: null }))), "LA-SETTINGS-INVALID");
});

test("preflight: projeto de tooling ausente, diretório errado, autotestes falhos e argumentos recusados", () => {
  assert.equal(codeOf(pre(fixture({ installed: false }))), "LA-NOT-INSTALLED");
  const wrong = fixture();
  fs.writeFileSync(path.join(wrong.repo, "package.json"), JSON.stringify({ name: "outro" }));
  assert.equal(codeOf(pre(wrong)), "LA-CWD");
  assert.equal(codeOf(pre(fixture(), { runSelfTests: () => false })), "LA-SELFTEST");
  assert.equal(codeOf(pre(fixture(), { argv: ["--bare"] })), "LA-ARGS");
  assert.equal(codeOf(pre(fixture(), { argv: ["--maintenance"], isTTY: false })), "LA-TTY");
  assert.equal(codeOf(pre(fixture(), { argv: ["--maintenance"], isTTY: true })), "OK");
});

/* -------------------------------------------------------------------- CLI args */

test("argumentos do CLI: sessão normal usa só a fonte project; manutenção usa manual, hook de manutenção por --settings e não carrega project", () => {
  const session = buildSessionArgs({ kind: "session", projectSettings: PROJECT_SETTINGS });
  assert.deepEqual(session.slice(0, 5), ["--strict-mcp-config", "--mcp-config", ".mcp.json", "--permission-mode", PERMISSION_MODE]);
  assert.deepEqual(session.slice(5), ["--setting-sources", "project"]);
  const maint = buildSessionArgs({ kind: "maintenance", projectSettings: PROJECT_SETTINGS });
  assert.equal(maint[maint.indexOf("--permission-mode") + 1], "manual");
  assert.equal(maint[maint.indexOf("--setting-sources") + 1], "user");
  const inline = JSON.parse(maint[maint.indexOf("--settings") + 1]);
  assert.match(inline.hooks.PreToolUse[0].hooks[0].command, /--policy=maintenance$/);
  assert.deepEqual(inline.permissions.deny, ["WebFetch"], "na manutenção o deny de Context7 é removido (o guard exige modo manual)");
  assert.equal(inline.hooks.PreToolUse[0].matcher, HOOK_MATCHER);
  assert.match(inline.hooks.PreToolUse[0].matcher, /Read\|Glob\|Grep/);
  assert.ok(inline.hooks.PreToolUse[0].matcher.endsWith("mcp__.*"));
  assert.ok(session.includes("project") && !session.includes("user"), "a sessão autônoma não carrega settings de usuário");
  for (const args of [session, maint]) {
    for (const bad of ["--bare", "--safe-mode", "--dangerously-skip-permissions", "--allow-dangerously-skip-permissions", "auto", "acceptEdits", "bypassPermissions"]) assert.ok(!args.includes(bad), bad);
  }
});

/* -------------------------------------------------------------------- execução */

function fakeSpawn(calls) {
  return (bin, args, opts) => {
    calls.push({ bin, args, opts });
    return { then(resolve) { resolve(0); } };
  };
}

test("run: inicia o CLI do projeto isolado com os argumentos decididos; o processo é simulado (o CLI nunca é executado)", async () => {
  const fx = fixture();
  const calls = [];
  const out = [];
  const code = await run({ argv: [], repoRoot: fx.repo, homeDir: fx.home, env: {}, isTTY: true, runSelfTests: () => true, spawn: fakeSpawn(calls), write: (s) => out.push(s) });
  assert.equal(code, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].bin, path.join(fx.repo, "tools", "developer-harness", "node_modules", ".bin", "claude"));
  assert.equal(calls[0].args[calls[0].args.indexOf("--permission-mode") + 1], PERMISSION_MODE);
  assert.equal(calls[0].opts.cwd, fx.repo);
  assert.deepEqual(out, []);
});

test("run: recusas não imprimem valores; só código, mensagem estática e o nome da variável/chave", async () => {
  const fx = fixture({ localSettings: { disableAllHooks: SEGREDO } });
  for (const over of [{ env: { ANTHROPIC_API_KEY: SEGREDO } }, { argv: [`--settings=${SEGREDO}`] }, {}]) {
    const out = [];
    const calls = [];
    const code = await run({ argv: [], repoRoot: fx.repo, homeDir: fx.home, env: {}, isTTY: true, runSelfTests: () => true, spawn: fakeSpawn(calls), write: (s) => out.push(s), ...over });
    assert.equal(code, 2);
    assert.equal(calls.length, 0);
    const text = out.join("");
    assert.match(text, /Oplyra launcher: LA-/);
    assert.ok(!text.includes(SEGREDO), text);
    assert.ok(!text.includes(fx.repo) && !text.includes(fx.home), "sem caminhos");
  }
  for (const code of Object.keys(MESSAGES)) assert.ok(MESSAGES[code].length > 0);
});

test("run: a manutenção exige TTY e a confirmação digitada; sem elas nada é iniciado", async () => {
  const fx = fixture();
  const base = { argv: ["--maintenance"], repoRoot: fx.repo, homeDir: fx.home, env: {}, runSelfTests: () => true, write: () => {} };
  const semTty = [];
  assert.equal(await run({ ...base, isTTY: false, spawn: fakeSpawn(semTty), confirm: async () => true }), 2);
  assert.equal(semTty.length, 0);
  const negada = [];
  assert.equal(await run({ ...base, isTTY: true, spawn: fakeSpawn(negada), confirm: async () => false }), 2);
  assert.equal(negada.length, 0);
  const ok = [];
  assert.equal(await run({ ...base, isTTY: true, spawn: fakeSpawn(ok), confirm: async (p) => p.includes(MAINTENANCE_PHRASE) }), 0);
  assert.equal(ok.length, 1);
  assert.equal(ok[0].args[ok[0].args.indexOf("--permission-mode") + 1], "manual");
});

test("run: não roda dentro dos próprios autotestes (sem recursão) e recusa se o ambiente pedir", async () => {
  const fx = fixture();
  const calls = [];
  const out = [];
  const code = await run({ argv: [], repoRoot: fx.repo, homeDir: fx.home, env: { OPLYRA_LAUNCH_SELFTEST: "1" }, isTTY: true, runSelfTests: () => true, spawn: fakeSpawn(calls), write: (s) => out.push(s) });
  assert.equal(code, 2);
  assert.equal(calls.length, 0);
});

/* --------------------------------------------------- consistência com o repositório */

test("o launcher não é importado por código do produto e nada nele referencia serviços do produto", () => {
  const src = fs.readFileSync(path.join(here, "claude-launch.mjs"), "utf8");
  assert.ok(!/from "\.\.\/(packages|apps)/.test(src));
  assert.ok(!/(openrouter\.ai|api\.anthropic\.com|supabase\.co)/i.test(src));
});

/* ------------------------------------------------------------ sonda de permissões */

const okOut = (text = "") => ({ seen: true, isError: false, text });
const autoDenied = () => ({ seen: true, isError: true, text: "Permission to use Bash has been denied because Claude Code is running in don't ask mode." });
const denyRule = () => ({ seen: true, isError: true, text: "Permission to use Bash with command x has been denied." });
const baseOutcomes = () => ({
  S1: okOut("conteudo"), S2: okOut("/tmp/x"), S3: okOut("allowed-ok"), S4: denyRule(), S5: autoDenied(), S6: autoDenied(), S7: okOut("pong"), S8: autoDenied(),
});
const clean = { write: false, bash: false, blocked: false };
const controlOk = { promptSeen: true, noSideEffects: true };

test("sonda: o roteiro tem oito passos e a avaliação exige cada prova (mutações da própria sonda)", () => {
  assert.equal(SCENARIO.length, 8);
  const all = evaluateProofs(baseOutcomes(), clean, controlOk);
  assert.deepEqual(all, { P1: true, P2: true, P3: true, P4: true, P5: true, P6: true });
  assert.equal(decidePermissionMode(all), "dontAsk");

  const mut = (fn) => {
    const o = baseOutcomes();
    const m = { ...clean };
    let c = { ...controlOk };
    const r = fn(o, m, c);
    return evaluateProofs(o, r?.markers ?? m, r?.control ?? c);
  };
  // ferramenta permitida bloqueada, ausente ou ambígua
  assert.equal(mut((o) => { o.S2 = autoDenied(); }).P1, false);
  assert.equal(mut((o) => { delete o.S1; }).P1, false);
  assert.equal(mut((o) => { o.S3 = okOut("outro"); }).P1, false);
  // ferramenta fora da allowlist executada (efeito colateral) ou aprovada por prompt
  assert.equal(mut((o) => { o.S6 = okOut(); }).P2, false);
  assert.equal(mut((o, m) => ({ markers: { ...m, write: true } })).P2, false);
  assert.equal(mut((o) => { o.S6 = { seen: true, isError: true, text: "Claude requested permissions to write, but you haven't granted it yet." }; }).P2, false);
  // deny não prevalece sobre allow
  assert.equal(mut((o) => { o.S4 = okOut("denied-x"); }).P3, false);
  assert.equal(mut((o) => { o.S3 = autoDenied(); }).P3, false);
  // Bash fora dos formatos permitidos executado ou pedindo aprovação
  assert.equal(mut((o) => { o.S5 = okOut(); }).P4, false);
  assert.equal(mut((o, m) => ({ markers: { ...m, bash: true } })).P4, false);
  assert.equal(mut((o) => { o.S5 = { seen: true, isError: true, text: "touch needs approval" }; }).P4, false);
  // MCP não permitido executado ou permitido negado
  assert.equal(mut((o) => { o.S8 = okOut(); }).P5, false);
  assert.equal(mut((o, m) => ({ markers: { ...m, blocked: true } })).P5, false);
  assert.equal(mut((o) => { o.S7 = autoDenied(); }).P5, false);
  // fallback silencioso: qualquer recusa que peça aprovação, efeito colateral, ou controle inválido
  assert.equal(mut((o) => { o.S8 = { seen: true, isError: true, text: "you haven't granted it yet" }; }).P6, false);
  assert.equal(mut((o, m) => ({ markers: { ...m, write: true } })).P6, false);
  assert.equal(mut(() => ({ control: { promptSeen: false, noSideEffects: true } })).P6, false);
  assert.equal(evaluateProofs(baseOutcomes(), clean, undefined).P6, false);
  assert.equal(evaluateProofs({}, clean, controlOk).P1, false);
  // qualquer prova falsa leva ao modo manual
  for (const id of Object.keys(all)) assert.equal(decidePermissionMode({ ...all, [id]: false }), "manual");
});

test("a evidência registrada no launcher decide o modo: seis provas verdadeiras => dontAsk", () => {
  assert.deepEqual(Object.keys(PROBE_EVIDENCE.proofs), ["P1", "P2", "P3", "P4", "P5", "P6"]);
  assert.ok(Object.isFrozen(PROBE_EVIDENCE) && Object.isFrozen(PROBE_EVIDENCE.proofs));
  assert.equal(PERMISSION_MODE, decidePermissionMode(PROBE_EVIDENCE.proofs));
  assert.equal(PERMISSION_MODE, "dontAsk");
  assert.match(PROBE_EVIDENCE.cli, /^2\.1\.284$/);
});

/* ------------------------------------------ vínculo do dontAsk à versão instalada (CR-031) */

const MODE = (fx, over = {}) => preflight({ repoRoot: fx.repo, homeDir: fx.home, env: {}, argv: [], runSelfTests: () => true, isTTY: true, ...over });
const BASE = { "@anthropic-ai/claude-code": PROBE_EVIDENCE.cli, "@upstash/context7-mcp": "4.1.1", "@playwright/mcp": "0.0.83" };

test("vínculo: versões instaladas idênticas ao manifest isolado e à sonda resultam em dontAsk", () => {
  const fx = fixture();
  assert.deepEqual(inspectToolingBinding(fx.repo), { cliProven: true });
  assert.deepEqual(MODE(fx), { kind: "session", mode: "dontAsk", cliProven: true });
  // o layout real do pnpm: node_modules/<pkg> é symlink para dentro do próprio projeto de tooling
  const pnpm = fixture({ link: Object.fromEntries(PKGS.map((p) => [p, "inside"])) });
  assert.equal(MODE(pnpm).mode, "dontAsk");
});

test("vínculo: Claude Code instalado diferente da versão provada (mesmo igual ao manifest) cai para manual, sem recusar", () => {
  const v = { ...BASE, "@anthropic-ai/claude-code": "2.1.285" };
  const fx = fixture({ declared: v, present: v });
  assert.deepEqual(inspectToolingBinding(fx.repo), { cliProven: false });
  assert.deepEqual(MODE(fx), { kind: "session", mode: "manual", cliProven: false });
  assert.equal(resolvePermissionMode({ cliProven: false }), "manual");
  assert.equal(resolvePermissionMode({ cliProven: true }), "dontAsk");
  for (const bad of [undefined, null, {}, { cliProven: "true" }, { cliProven: 1 }, { refusal: "LA-TOOLING-MISMATCH" }]) assert.equal(resolvePermissionMode(bad), "manual");
  assert.equal(resolvePermissionMode({ cliProven: true }, { ...PROBE_EVIDENCE.proofs, P3: false }), "manual");
});

test("vínculo: o binário efetivo também conta — package.json correto com executável divergente (auto-update), ilegível ou ambíguo cai para manual", async () => {
  for (const binVersion of ["2.1.285", "2.1.283", "3.0.0", null, "", "lixo", "v2.1.284", "Claude Code 2.1.284"]) {
    const fx = fixture({ binVersion });
    assert.deepEqual(inspectToolingBinding(fx.repo), { cliProven: false }, String(binVersion));
    assert.deepEqual(MODE(fx), { kind: "session", mode: "manual", cliProven: false }, String(binVersion));
  }
  // formato real do CLI
  assert.equal(MODE(fixture({ binVersion: "2.1.284 (Claude Code)" })).mode, "dontAsk");
  // sem depender do executável real: a leitura é injetável e a versão do package.json sozinha nunca basta
  const fx = fixture();
  assert.deepEqual(inspectToolingBinding(fx.repo, PROBE_EVIDENCE.cli, () => "2.1.999"), { cliProven: false });
  assert.deepEqual(inspectToolingBinding(fx.repo, PROBE_EVIDENCE.cli, () => null), { cliProven: false });
  // o aviso estático é emitido e nenhuma versão aparece
  const out = [];
  const calls = [];
  const d = fixture({ binVersion: "2.1.285" });
  assert.equal(await run({ argv: [], repoRoot: d.repo, homeDir: d.home, env: {}, isTTY: true, runSelfTests: () => true, spawn: fakeSpawn(calls), write: (s) => out.push(s) }), 0);
  assert.equal(calls[0].args[calls[0].args.indexOf("--permission-mode") + 1], "manual");
  assert.match(out.join(""), /LA-CLI-UNPROVEN/);
  assert.ok(!out.join("").includes("2.1.285") && !out.join("").includes("2.1.284"));
  // a manutenção continua sempre manual
  assert.equal(MODE(fixture({ binVersion: "2.1.285" }), { argv: ["--maintenance"] }).mode, "manual");
});

test("vínculo: versão instalada diferente do manifest isolado é recusada em qualquer um dos três pacotes", () => {
  for (const pkg of PKGS) {
    const fx = fixture({ present: { ...BASE, [pkg]: "9.9.9" } });
    assert.equal(codeOf(() => MODE(fx)), "LA-TOOLING-MISMATCH", pkg);
  }
  // manifest isolado diverge do instalado para o Claude Code (inclusive quando o instalado seria o provado)
  const fx = fixture({ declared: { ...BASE, "@anthropic-ai/claude-code": "2.1.285" } });
  assert.equal(codeOf(() => MODE(fx)), "LA-TOOLING-MISMATCH");
});

test("vínculo: manifest isolado ausente, inválido ou sem versões exatas é recusado", () => {
  const cases = [null, "{ não é json", JSON.stringify({ name: "x" }), JSON.stringify({ devDependencies: [] }), JSON.stringify({ devDependencies: "x" }),
    JSON.stringify({ devDependencies: { ...BASE, "@playwright/mcp": "^0.0.83" } }), JSON.stringify({ devDependencies: { ...BASE, "@upstash/context7-mcp": "latest" } }),
    JSON.stringify({ devDependencies: { ...BASE, "@anthropic-ai/claude-code": "~2.1.284" } }), JSON.stringify({ devDependencies: { "@playwright/mcp": "0.0.83" } })];
  for (const declared of cases) {
    assert.equal(codeOf(() => MODE(fixture({ declared }))), "LA-TOOLING-INVALID", String(declared).slice(0, 40));
  }
});

test("vínculo: manifest instalado ausente, ilegível, com outro nome ou sem versão exata é recusado", () => {
  for (const pkg of PKGS) {
    assert.equal(codeOf(() => MODE(fixture({ present: { ...BASE, [pkg]: undefined } }))), "LA-TOOLING-MISSING", `ausente ${pkg}`);
    assert.equal(codeOf(() => MODE(fixture({ installedName: { [pkg]: "outro-pacote" } }))), "LA-TOOLING-MISSING", `nome ${pkg}`);
    assert.equal(codeOf(() => MODE(fixture({ declared: { ...BASE, [pkg]: "1.0.0" }, present: { ...BASE, [pkg]: "1.0.0-beta.1" } }))), "LA-TOOLING-MISSING", `versão não exata ${pkg}`);
  }
  const fx = fixture();
  fs.writeFileSync(path.join(fx.repo, "tools", "developer-harness", "node_modules", "@playwright", "mcp", "package.json"), "{ quebrado");
  assert.equal(codeOf(() => MODE(fx)), "LA-TOOLING-MISSING");
});

test("vínculo: manifest ou executável que resolve para fora de tools/developer-harness (symlink externo) é recusado", () => {
  for (const pkg of PKGS) assert.equal(codeOf(() => MODE(fixture({ link: { [pkg]: "outside" } }))), "LA-TOOLING-ESCAPE", pkg);
  assert.equal(codeOf(() => MODE(fixture({ binLink: true }))), "LA-TOOLING-ESCAPE");
  assert.equal(codeOf(() => MODE(fixture({ installed: false }))), "LA-NOT-INSTALLED");
});

test("vínculo: nenhuma falha do vínculo jamais resulta em dontAsk, e recusas não expõem versões, caminhos nem valores", async () => {
  const falhas = [
    fixture({ present: { ...BASE, "@playwright/mcp": "7.7.7" } }), fixture({ declared: "{" }), fixture({ present: { ...BASE, "@upstash/context7-mcp": undefined } }),
    fixture({ link: { "@anthropic-ai/claude-code": "outside" } }), fixture({ binLink: true }),
  ];
  for (const fx of falhas) {
    const out = [];
    const calls = [];
    const code = await run({ argv: [], repoRoot: fx.repo, homeDir: fx.home, env: {}, isTTY: true, runSelfTests: () => true, spawn: fakeSpawn(calls), write: (s) => out.push(s) });
    assert.equal(code, 2);
    assert.equal(calls.length, 0, "nada é iniciado");
    const text = out.join("");
    assert.match(text, /Oplyra launcher: LA-TOOLING-|Oplyra launcher: LA-NOT-INSTALLED/);
    for (const leak of ["7.7.7", "4.1.1", "0.0.83", PROBE_EVIDENCE.cli, fx.repo, fx.home, "outside"]) assert.ok(!text.includes(leak), `vazou ${leak}`);
  }
  for (const c of ["LA-TOOLING-INVALID", "LA-TOOLING-MISSING", "LA-TOOLING-ESCAPE", "LA-TOOLING-MISMATCH", "LA-CLI-UNPROVEN"]) assert.ok(MESSAGES[c]?.length > 0, c);
});

test("run: Claude Code sem prova vigente inicia em manual com aviso estático; a manutenção é sempre manual", async () => {
  const v = { ...BASE, "@anthropic-ai/claude-code": "2.1.285" };
  const fx = fixture({ declared: v, present: v });
  const calls = [];
  const out = [];
  assert.equal(await run({ argv: [], repoRoot: fx.repo, homeDir: fx.home, env: {}, isTTY: true, runSelfTests: () => true, spawn: fakeSpawn(calls), write: (s) => out.push(s) }), 0);
  assert.equal(calls[0].args[calls[0].args.indexOf("--permission-mode") + 1], "manual");
  assert.match(out.join(""), /LA-CLI-UNPROVEN/);
  assert.ok(!out.join("").includes("2.1.285"));
  const ok = [];
  await run({ argv: ["--maintenance"], repoRoot: fixture().repo, homeDir: fixture().home, env: {}, isTTY: true, runSelfTests: () => true, spawn: fakeSpawn(ok), confirm: async () => true, write: () => {} });
  assert.equal(ok[0]?.args[ok[0].args.indexOf("--permission-mode") + 1], "manual");
});

test("settings do projeto: o hook precisa interceptar Read, Glob, Grep e todo MCP, e Context7 nunca pode estar no allow", () => {
  assert.equal(inspectProjectSettings(PROJECT_SETTINGS), null);
  for (const token of ["Read", "Glob", "Grep", "Bash", "Write", "WebFetch", "mcp__.*"]) {
    const s = structuredClone(PROJECT_SETTINGS);
    s.hooks.PreToolUse[0].matcher = HOOK_MATCHER.split("|").filter((t) => t !== token).join("|");
    assert.equal(inspectProjectSettings(s), "hooks.PreToolUse.matcher", `sem ${token}`);
    assert.equal(codeOf(pre(fixture({ project: s }))), "LA-PROJECT-SETTINGS", `preflight sem ${token}`);
  }
  const limitado = structuredClone(PROJECT_SETTINGS);
  limitado.hooks.PreToolUse[0].matcher = "Bash|mcp__playwright__.*";
  assert.ok(inspectProjectSettings(limitado));
  for (const rule of ["mcp__context7__query-docs", "mcp__context7__resolve-library-id", "mcp__context7__*", "mcp__context7"]) {
    const s = structuredClone(PROJECT_SETTINGS);
    s.permissions.allow.push(rule);
    assert.equal(inspectProjectSettings(s), "permissions.allow", rule);
  }
  const naoString = structuredClone(PROJECT_SETTINGS);
  naoString.permissions.allow.push({ tool: "x" });
  assert.equal(inspectProjectSettings(naoString), "permissions.allow");
});

/* ---------------------------------------------------------- mutações do launcher */

/** Gera uma cópia do launcher com UMA alteração e a importa; a âncora precisa existir, senão a mutação seria vácua. */
async function mutant(from, to, nth = 1) {
  const src = fs.readFileSync(path.join(here, "claude-launch.mjs"), "utf8");
  let idx = -1;
  for (let k = 0; k < nth; k += 1) {
    idx = src.indexOf(from, idx + 1);
    assert.notEqual(idx, -1, `âncora de mutação ausente: ${from.slice(0, 60)}`);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oplyra-launch-mut-"));
  const file = path.join(dir, "claude-launch.mjs");
  fs.writeFileSync(file, src.slice(0, idx) + to + src.slice(idx + from.length));
  return import(pathToFileURL(file).href);
}

const pre2 = (mod, fx, over = {}) => () => mod.preflight({ repoRoot: fx.repo, homeDir: fx.home, env: {}, argv: [], runSelfTests: () => true, isTTY: true, ...over });
const modeOf = (mod, fx) => {
  try {
    return pre2(mod, fx)().mode;
  } catch (e) {
    return e.code ?? "TypeError";
  }
};
const ctx7Mismatch = () => fixture({ present: { ...BASE, "@upstash/context7-mcp": "9.9.9" } });
const claudeDiverge = () => { const v = { ...BASE, "@anthropic-ai/claude-code": "2.1.285" }; return fixture({ declared: v, present: v }); };

test("mutações do vínculo e dos bloqueios do launcher: todas detectadas pelos cenários acima", async () => {
  const baseline = await import(pathToFileURL(path.join(here, "claude-launch.mjs")).href);
  // sanidade: sem mutação os cenários dão o resultado esperado
  assert.equal(modeOf(baseline, claudeDiverge()), "manual");
  assert.equal(modeOf(baseline, ctx7Mismatch()), "LA-TOOLING-MISMATCH");

  const kills = [];
  const expectKill = (id, killed) => { kills.push(id); assert.ok(killed, `mutação NÃO detectada: ${id}`); };

  // L1: comparação com o manifest isolado removida
  let m = await mutant("if (installed.version !== declared[pkg]) return", "if (false) return");
  expectKill("L1-sem-comparacao-com-manifest", modeOf(m, ctx7Mismatch()) !== "LA-TOOLING-MISMATCH");
  // L2: contenção em tools/developer-harness removida (symlink externo aceito)
  m = await mutant("return real === harness || real.startsWith(harness + path.sep) ? real : null;", "return real;");
  expectKill("L2-sem-contencao-de-symlink", modeOf(m, fixture({ link: { "@playwright/mcp": "outside" } })) !== "LA-TOOLING-ESCAPE");
  expectKill("L2b-sem-contencao-do-binario", modeOf(m, fixture({ binLink: true })) !== "LA-TOOLING-ESCAPE");
  // L3: comparação do Claude Code com PROBE_EVIDENCE.cli removida
  m = await mutant("claudeVersion === probedCli", "true");
  expectKill("L3-sem-comparacao-com-a-sonda", modeOf(m, claudeDiverge()) === "dontAsk");
  // L4: resolvePermissionMode ignora cliProven
  m = await mutant("binding && binding.cliProven === true && decidePermissionMode", "binding && decidePermissionMode");
  expectKill("L4-modo-ignora-cliProven", modeOf(m, claudeDiverge()) === "dontAsk");
  // L5: manifest isolado ausente não é tratado
  m = await mutant('if (!declared || typeof declared !== "object" || Array.isArray(declared)) return { refusal: "LA-TOOLING-INVALID", name: "package.json" };', "");
  expectKill("L5-manifest-ausente-aceito", modeOf(m, fixture({ declared: null })) !== "LA-TOOLING-INVALID");
  // L6: versão exata do manifest deixa de ser exigida
  m = await mutant("!EXACT_VERSION.test(declared[pkg])", "false");
  expectKill("L6-intervalo-aceito", modeOf(m, fixture({ declared: { ...BASE, "@playwright/mcp": "^0.0.83" } })) !== "LA-TOOLING-INVALID");
  // L7: recusa do vínculo ignorada pelo preflight
  m = await mutant("if (binding.refusal) refuse(binding.refusal, binding.name);", "");
  expectKill("L7-recusa-ignorada", modeOf(m, ctx7Mismatch()) !== "LA-TOOLING-MISMATCH");
  // L8: nome do pacote instalado não conferido
  m = await mutant("installed.name !== pkg ||", "");
  expectKill("L8-nome-nao-conferido", modeOf(m, fixture({ installedName: { "@upstash/context7-mcp": "outro" } })) !== "LA-TOOLING-MISSING");
  // L9: manifest instalado ausente não recusa
  m = await mutant('if (!fs.existsSync(file)) return { refusal: "LA-TOOLING-MISSING", name: pkg };', "");
  expectKill("L9-manifest-instalado-ausente", modeOf(m, fixture({ present: { ...BASE, "@playwright/mcp": undefined } })) !== "LA-TOOLING-MISSING");
  // L10: executáveis não são confinados
  m = await mutant('if (!inside(path.join(harness, "node_modules", ".bin", bin))) return', "if (false) return");
  expectKill("L10-binario-fora-do-harness", modeOf(m, fixture({ binLink: true })) !== "LA-TOOLING-ESCAPE");
  // L11: matcher do hook não conferido
  m = await mutant("if (!REQUIRED_MATCHER_TOKENS.every((t) => tokens.includes(t))) return", "if (false) return");
  const semRead = structuredClone(PROJECT_SETTINGS);
  semRead.hooks.PreToolUse[0].matcher = "Bash|Write";
  expectKill("L11-matcher-nao-conferido", m.inspectProjectSettings(semRead) === null);
  // L12: Context7 no allow aceito
  m = await mutant('if (allow.some((r) => typeof r !== "string" || /^mcp__context7/.test(r))) return "permissions.allow";', "");
  const comCtx = structuredClone(PROJECT_SETTINGS);
  comCtx.permissions.allow.push("mcp__context7__query-docs");
  expectKill("L12-context7-no-allow", m.inspectProjectSettings(comCtx) === null);
  // L13: a manutenção herda o deny de Context7 (ficaria inutilizável em modo manual)
  m = await mutant('.filter((r) => !String(r).startsWith("mcp__context7__"))', "");
  const args = m.buildSessionArgs({ kind: "maintenance", projectSettings: PROJECT_SETTINGS });
  expectKill("L13-deny-context7-na-manutencao", JSON.parse(args[args.indexOf("--settings") + 1]).permissions.deny.some((r) => r.startsWith("mcp__context7__")));
  // L14: o modo decidido não chega ao CLI
  m = await mutant("buildSessionArgs({ kind, mode, projectSettings: project })", "buildSessionArgs({ kind, projectSettings: project })");
  {
    const calls = [];
    const fx = claudeDiverge();
    await m.run({ argv: [], repoRoot: fx.repo, homeDir: fx.home, env: {}, isTTY: true, runSelfTests: () => true, spawn: fakeSpawn(calls), write: () => {} });
    expectKill("L14-modo-nao-repassado", calls[0].args[calls[0].args.indexOf("--permission-mode") + 1] === "dontAsk");
  }
  // L15: a manutenção deixa de forçar manual
  m = await mutant('mode: kind === "maintenance" ? "manual" : resolvePermissionMode(binding)', "mode: resolvePermissionMode(binding)");
  expectKill("L15-manutencao-sem-manual", m.preflight({ repoRoot: fixture().repo, homeDir: fixture().home, env: {}, argv: ["--maintenance"], runSelfTests: () => true, isTTY: true }).mode === "dontAsk");
  // L17: a versão efetiva do binário deixa de ser comparada (só o package.json)
  m = await mutant("&& effective === probedCli", "");
  expectKill("L17-binario-efetivo-ignorado", modeOf(m, fixture({ binVersion: "2.1.285" })) === "dontAsk");
  // L18: binário ilegível é tratado como provado
  m = await mutant("effective === probedCli", "(effective ?? probedCli) === probedCli");
  expectKill("L18-binario-ilegivel-aceito", modeOf(m, fixture({ binVersion: null })) === "dontAsk");
  assert.equal(kills.length, 18);
});
