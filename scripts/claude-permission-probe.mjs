#!/usr/bin/env node
// Sonda offline dos permission modes (CR-031 §5.2). Evidência reproduzível para
// a decisão dontAsk × manual do launcher.
//
// Como funciona: inicia um stub LOCAL do endpoint de mensagens em 127.0.0.1, que
// devolve tool calls roteirizados; roda o CLI instalado no projeto isolado dentro
// de um perfil de sandbox do macOS que NEGA toda rede exceto loopback (com
// autoverificação antes), com HOME temporário e uma chave FALSA. Nenhum serviço
// remoto, modelo, conta ou chave real é usado. A saída não inclui prompts,
// caminhos, URLs nem conteúdo: apenas as seis provas booleanas e o modo decidido.
//
//   node scripts/claude-permission-probe.mjs        # roda a sonda (usa o CLI isolado)
//
// Se qualquer requisito falhar (plataforma, sandbox, CLI ausente, tempo esgotado,
// resposta ambígua), o resultado é `manual` — nunca `dontAsk` por omissão.

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { PROOF_IDS, decidePermissionMode, harnessBin } from "./claude-launch.mjs";

const SELF = fileURLToPath(import.meta.url);
const SANDBOX_PROFILE = '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))';
const TIMEOUT_MS = 120_000;

/** Roteiro fixo: uma chamada de ferramenta por turno. */
export const SCENARIO = Object.freeze([
  { id: "S1", tool: "Read", input: (ctx) => ({ file_path: path.join(ctx.proj, "fixture.txt") }), expect: "allowed" },
  { id: "S2", tool: "Bash", input: () => ({ command: "pwd" }), expect: "allowed" },
  { id: "S3", tool: "Bash", input: () => ({ command: "echo allowed-ok" }), expect: "allowed" },
  { id: "S4", tool: "Bash", input: () => ({ command: "echo denied-x" }), expect: "refused" },
  { id: "S5", tool: "Bash", input: () => ({ command: "touch marker-bash" }), expect: "refused" },
  { id: "S6", tool: "Write", input: (ctx) => ({ file_path: path.join(ctx.proj, "marker-write"), content: "x" }), expect: "refused" },
  { id: "S7", tool: "mcp__probe__ping", input: () => ({}), expect: "allowed" },
  { id: "S8", tool: "mcp__probe__blocked", input: () => ({}), expect: "refused" },
]);

const DONT_ASK_SIGNATURE = /don't ask mode/i; // recusa automática do dontAsk (CLI 2.1.284)
const PROMPT_SIGNATURE = /needs approval|haven't granted|requested permissions/i; // pedido de aprovação do modo manual

/**
 * Avalia o roteiro executado. Puro: testável sem o CLI. `control` é o mesmo roteiro
 * em modo manual, usado como controle negativo: prova que a assinatura de "pedido
 * de aprovação" realmente aparece quando há aprovação, tornando P6 significativo.
 */
export function evaluateProofs(outcomes, markers, control) {
  const ran = (id) => outcomes[id]?.seen === true && outcomes[id].isError === false;
  const refused = (id) => outcomes[id]?.seen === true && outcomes[id].isError === true;
  const autoDenied = (id) => refused(id) && DONT_ASK_SIGNATURE.test(outcomes[id].text ?? "") && !PROMPT_SIGNATURE.test(outcomes[id].text ?? "");
  const noSideEffects = markers.write === false && markers.bash === false && markers.blocked === false;
  const controlValid = control?.promptSeen === true && control.noSideEffects === true;
  return {
    P1: ran("S1") && ran("S2") && ran("S3") && ran("S7") && outcomes.S3.text?.includes("allowed-ok") === true,
    P2: autoDenied("S6") && markers.write === false,
    P3: ran("S3") && refused("S4") && !PROMPT_SIGNATURE.test(outcomes.S4.text ?? "") && !DONT_ASK_SIGNATURE.test(outcomes.S4.text ?? ""),
    P4: autoDenied("S5") && markers.bash === false,
    P5: autoDenied("S8") && markers.blocked === false && ran("S7"),
    P6: ["S4", "S5", "S6", "S8"].every(refused) && ["S5", "S6", "S8"].every(autoDenied) && noSideEffects && controlValid,
  };
}

function fail(reason) {
  return { mode: "manual", proofs: Object.fromEntries(PROOF_IDS.map((id) => [id, false])), inconclusive: reason };
}

async function selfCheckSandbox() {
  // dentro do perfil: loopback conecta e um IP externo NÃO conecta
  const server = net.createServer((s) => s.end()).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const port = server.address().port;
  const script = `
    import net from "node:net";
    const t = (h, p) => new Promise((res) => { const s = net.connect({ host: h, port: p, timeout: 1500 });
      s.on("connect", () => { s.destroy(); res(true); }); s.on("error", () => res(false)); s.on("timeout", () => { s.destroy(); res(false); }); });
    const local = await t("127.0.0.1", ${port});
    const remote = await t("1.1.1.1", 443);
    process.stdout.write(JSON.stringify({ local, remote }));`;
  const r = spawnSync("/usr/bin/sandbox-exec", ["-p", SANDBOX_PROFILE, process.execPath, "--input-type=module", "-e", script], { encoding: "utf8", timeout: 15_000 });
  server.close();
  try {
    const v = JSON.parse(r.stdout);
    return v.local === true && v.remote === false;
  } catch {
    return false;
  }
}

function sse(events) {
  return events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join("");
}
function toolTurn(step, id, tool, input) {
  return sse([
    ["message_start", { type: "message_start", message: { id: `msg_${step}`, type: "message", role: "assistant", model: "probe-model", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } }],
    ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "tool_use", id, name: tool, input: {} } }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(input) } }],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    ["message_delta", { type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 1 } }],
    ["message_stop", { type: "message_stop" }],
  ]);
}
function textTurn(step, text) {
  return sse([
    ["message_start", { type: "message_start", message: { id: `msg_${step}`, type: "message", role: "assistant", model: "probe-model", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } }],
    ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } }],
    ["message_stop", { type: "message_stop" }],
  ]);
}
const jsonMessage = (text) => ({ id: "msg_aux", type: "message", role: "assistant", model: "probe-model", content: [{ type: "text", text }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } });

function flattenResult(block) {
  const c = block.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((x) => (typeof x?.text === "string" ? x.text : "")).join("");
  return "";
}

/** Servidor stub: registra os tool_result recebidos e roteiriza os próximos tool calls. */
function startStub(ctx, outcomes, debug) {
  let step = 0;
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      let body = {};
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      } catch {
        /* corpo não JSON */
      }
      const url = req.url ?? "";
      if (debug) process.stderr.write(`[stub] ${req.method} ${url.split("?")[0]} stream=${body.stream === true} tools=${Array.isArray(body.tools) ? body.tools.length : 0}\n`);
      if (!url.startsWith("/v1/messages") || req.method !== "POST" || url.includes("count_tokens")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(url.includes("count_tokens") ? JSON.stringify({ input_tokens: 1 }) : "{}");
        return;
      }
      const messages = Array.isArray(body.messages) ? body.messages : [];
      // registra os tool_results de todo o histórico (o último item pode ser uma mensagem de sistema)
      for (const msg of messages) {
        const blocks = msg && Array.isArray(msg.content) ? msg.content : [];
        for (const b of blocks) {
          if (b?.type !== "tool_result") continue;
          const m = /^toolu_probe_(S\d)$/.exec(String(b.tool_use_id ?? ""));
          if (m && !outcomes[m[1]]) outcomes[m[1]] = { seen: true, isError: b.is_error === true, text: flattenResult(b) };
        }
      }
      const isMain = Array.isArray(body.tools) && body.tools.length > 0 && body.stream === true;
      if (!isMain) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(jsonMessage("ok")));
        return;
      }
      const next = SCENARIO[step];
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      if (next) {
        step += 1;
        res.end(toolTurn(step, `toolu_probe_${next.id}`, next.tool, next.input(ctx)));
      } else {
        res.end(textTurn(step + 1, "fim"));
      }
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

const MCP_FIXTURE = String.raw`
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
const dir = process.env.PROBE_DIR;
const rl = readline.createInterface({ input: process.stdin });
const send = (o) => process.stdout.write(JSON.stringify(o) + "\n");
rl.on("line", (line) => {
  let m; try { m = JSON.parse(line); } catch { return; }
  if (m.method === "initialize") send({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: m.params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "probe", version: "0.0.0" } } });
  else if (m.method === "tools/list") send({ jsonrpc: "2.0", id: m.id, result: { tools: [
    { name: "ping", description: "probe ping", inputSchema: { type: "object", properties: {} } },
    { name: "blocked", description: "probe blocked", inputSchema: { type: "object", properties: {} } } ] } });
  else if (m.method === "tools/call") {
    if (m.params?.name === "blocked") fs.writeFileSync(path.join(dir, "marker-blocked"), "x");
    send({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: "pong" }] } });
  } else if (m.id !== undefined) send({ jsonrpc: "2.0", id: m.id, result: {} });
});
`;

async function runOnce({ claude, mode, debug }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "oplyra-probe-"));
  const home = path.join(tmp, "home");
  const proj = path.join(tmp, "proj");
  fs.mkdirSync(path.join(proj, ".claude"), { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(path.join(proj, "fixture.txt"), "fixture-content-probe\n");
  fs.writeFileSync(path.join(proj, "mcp-fixture.mjs"), MCP_FIXTURE);
  fs.writeFileSync(path.join(home, ".claude.json"), JSON.stringify({ projects: { [fs.realpathSync(proj)]: { hasTrustDialogAccepted: true } } }));
  fs.writeFileSync(path.join(proj, ".mcp.json"), JSON.stringify({ mcpServers: { probe: { type: "stdio", command: process.execPath, args: [path.join(proj, "mcp-fixture.mjs")], env: { PROBE_DIR: proj } } } }));
  fs.writeFileSync(path.join(proj, ".claude", "settings.json"), JSON.stringify({
    permissions: { allow: ["Read", "Bash(pwd)", "Bash(echo *)", "mcp__probe__ping"], deny: ["Bash(echo denied*)"] },
  }));

  const outcomes = {};
  const server = await startStub({ proj }, outcomes, debug);
  const port = server.address().port;
  const env = {
    PATH: process.env.PATH ?? "", HOME: home, TMPDIR: os.tmpdir(), NO_COLOR: "1", CI: "1",
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`, ANTHROPIC_API_KEY: "sk-ant-probe-not-a-real-key",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", DISABLE_TELEMETRY: "1", DISABLE_AUTOUPDATER: "1", DISABLE_ERROR_REPORTING: "1", DISABLE_BUG_COMMAND: "1",
    PROBE_DIR: proj,
  };
  const args = ["-p", "probe", "--permission-mode", mode, "--model", "probe-model", "--strict-mcp-config", "--mcp-config", ".mcp.json", "--max-turns", "30", "--output-format", "json"];
  let timedOut = false;
  const exit = await new Promise((resolve) => {
    const child = spawn("/usr/bin/sandbox-exec", ["-p", SANDBOX_PROFILE, claude, ...args], { cwd: proj, env, stdio: debug ? ["ignore", "ignore", "inherit"] : "ignore" });
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, TIMEOUT_MS);
    child.on("exit", (code) => { clearTimeout(timer); resolve(code); });
    child.on("error", () => { clearTimeout(timer); resolve(-1); });
  });
  server.close();
  const markers = {
    write: fs.existsSync(path.join(proj, "marker-write")),
    bash: fs.existsSync(path.join(proj, "marker-bash")),
    blocked: fs.existsSync(path.join(proj, "marker-blocked")),
  };
  if (debug) for (const [id, o] of Object.entries(outcomes)) process.stderr.write(`[out ${mode}] ${id} err=${o.isError}\n`);
  return { outcomes, markers, timedOut, exit };
}

export async function runProbe({ repoRoot, debug = false } = {}) {
  const root = repoRoot ?? path.resolve(path.dirname(SELF), "..");
  if (process.platform !== "darwin" || !fs.existsSync("/usr/bin/sandbox-exec")) return fail("sandbox de rede indisponível nesta plataforma");
  const claude = harnessBin(root, "claude");
  if (!fs.existsSync(claude)) return fail("CLI do projeto isolado ausente");
  if (!(await selfCheckSandbox())) return fail("isolamento de rede não comprovado");

  const version = spawnSync(claude, ["--version"], { encoding: "utf8", timeout: 20_000 }).stdout?.trim() ?? "desconhecida";
  const main = await runOnce({ claude, mode: "dontAsk", debug });
  if (main.timedOut) return fail("tempo esgotado (dontAsk)");
  const manual = await runOnce({ claude, mode: "manual", debug });
  if (manual.timedOut) return fail("tempo esgotado (controle manual)");
  const control = {
    promptSeen: ["S5", "S6", "S8"].every((id) => manual.outcomes[id]?.isError === true && PROMPT_SIGNATURE.test(manual.outcomes[id].text ?? "")),
    noSideEffects: manual.markers.write === false && manual.markers.bash === false && manual.markers.blocked === false,
  };
  const proofs = evaluateProofs(main.outcomes, main.markers, control);
  // saída sem prompts, caminhos ou conteúdo: só booleanos e classes
  const observed = Object.fromEntries(SCENARIO.map((s) => [s.id, main.outcomes[s.id] ? (main.outcomes[s.id].isError ? "refused" : "ran") : "not-observed"]));
  return { mode: decidePermissionMode(proofs), cli: version, proofs, observed, control, exit: main.exit === 0 ? "ok" : "nonzero", markers: main.markers };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const result = await runProbe({ debug: process.env.PROBE_DEBUG === "1" });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.mode === "dontAsk" ? 0 : 1;
}
