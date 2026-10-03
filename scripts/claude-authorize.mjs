#!/usr/bin/env node
// Criação do registro de autorização da entrega delegada (CR-033 §6.0). Control plane.
//
// Roda SOMENTE em um terminal normal do proprietário (TTY + frase digitada), nunca dentro de uma
// sessão do Claude Code: não está na allowlist do guard e recusa quando o ambiente indica uma sessão
// de agente. Não aceita segredos. Imprime o hash do registro para o proprietário comparar com a
// proveniência registrada no PR e no ESTADO.
//
// Uso:
//   node scripts/claude-authorize.mjs --ref=cr-033 --branch=agent/feat/cr-033-nome --base-sha=<40 hex> \
//     --paths=a/b.ts,docs/x/ [--max-wall-clock-seconds=<n ≤ 28800>] [--max-iterations=<n ≤ 10>] [--max-log-reads=<n ≤ 20>] \
//   (sem esses três, o script propõe 14400 s, 6 iterações e 10 leituras de log e exige a confirmação digitada; o registro grava valores explícitos)
//     [--contracts-cr=cr-033 --contracts-scope=<arquivo explícito sob contracts>,…] [--expires-days=3] [--max-commits=10] [--max-pushes=5]
//   `--ref` é o INCREMENTO; `--contracts-cr` é o CR autorizado a ser tocado (podem diferir) e só vale junto com `--contracts-scope`.
//   node scripts/claude-authorize.mjs --clear-undiagnosed=<ref>   # libera o bloqueio de diagnóstico (N-2), depois de fornecer os logs
//   node scripts/claude-authorize.mjs --enable-rehearsal=ops-<n> [--log-hosts=host.exato,outro.exato]   # concessão temporária do ensaio (D-25)

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { pathToFileURL } from "node:url";

import {
  CEILINGS, GRANT_PHRASE, GRANT_REF_PATTERN, OWNER_BUDGETS, OWNER_CEILINGS, OWNER_DEFAULTS, REF_PATTERN, RECORD_MESSAGES, RecordError, buildGrant, buildRecord, defaultRecordDir, grantFile, loadGrant, selectRecord, writeGrant, writeRecord,
} from "./claude-delivery-record.mjs";

export const AUTHORIZE_PHRASE = "AUTORIZAR-ENTREGA-DELEGADA";
export const CLEAR_PHRASE = "LIBERAR-DIAGNOSTICO";
export { GRANT_PHRASE };
const FLAGS = new Set([
  "ref", "branch", "base-sha", "paths", "contracts-cr", "contracts-scope", "expires-days", "max-commits", "max-pushes", "max-fix-attempts", "max-ci-wait",
  "max-wall-clock-seconds", "max-iterations", "max-log-reads", "clear-undiagnosed", "enable-rehearsal", "log-hosts",
]);

export const AUTH_MESSAGES = Object.freeze({
  "DA-ARGS": "argumentos inválidos (veja o cabeçalho do script)",
  "DA-AGENT": "este script não roda dentro de uma sessão de agente",
  "DA-TTY": "exige terminal interativo",
  "DA-CONFIRM": "confirmação não recebida",
  "DA-STATE": "estado da entrega ausente ou ilegível para essa referência",
  "DA-NOTHING": "não há verificação aguardando diagnóstico para essa referência",
});

export function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    const m = /^--([a-z-]+)=(.*)$/.exec(arg);
    if (!m || !FLAGS.has(m[1]) || Object.prototype.hasOwnProperty.call(out, m[1])) return null;
    out[m[1]] = m[2];
  }
  return out;
}

const toInt = (v) => (v === undefined ? undefined : /^\d{1,7}$/.test(v) ? Number(v) : Number.NaN);

export function inputFromArgs(args) {
  const budgets = {};
  // `max-wall-clock-seconds` e `max-iterations` não têm padrão: o proprietário os informa em todo registro (CR-033 N-6)
  const map = {
    "max-commits": "commits", "max-pushes": "pushes", "max-fix-attempts": "fixAttempts", "max-ci-wait": "ciWaitSeconds",
    "max-wall-clock-seconds": "wallClockSeconds", "max-iterations": "iterations", "max-log-reads": "logReads",
  };
  for (const [flag, key] of Object.entries(map)) if (args[flag] !== undefined) budgets[key] = toInt(args[flag]);
  return {
    ref: args.ref,
    branch: args.branch,
    baseSha: args["base-sha"],
    paths: String(args.paths ?? "").split(",").filter(Boolean),
    contractsCr: args["contracts-cr"] || undefined,
    contractsScope: args["contracts-scope"] ? args["contracts-scope"].split(",").filter(Boolean) : undefined,
    expiresInDays: args["expires-days"] === undefined ? undefined : toInt(args["expires-days"]),
    budgets,
  };
}

async function confirmTyped(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question(prompt, resolve));
  rl.close();
  return answer;
}

/**
 * Ação do proprietário: libera o bloqueio de diagnóstico (CR-033 N-2) depois de ele ter lido os logs do job e fornecido o
 * diagnóstico à sessão. Só limpa `undiagnosed`; contadores, relógio e orçamentos não são tocados. Fica no log de auditoria.
 */
async function clearUndiagnosed({ args, homeDir, now, confirm, write, stateDir, refuseWith }) {
  const ref = args["clear-undiagnosed"];
  if (Object.keys(args).length !== 1 || !REF_PATTERN.test(ref)) return refuseWith("DA-ARGS", AUTH_MESSAGES["DA-ARGS"]);
  const dir = stateDir ?? path.join(homeDir, ".oplyra", "delivery-state");
  const file = path.join(dir, `${ref}.json`);
  let state;
  try {
    state = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return refuseWith("DA-STATE", AUTH_MESSAGES["DA-STATE"]);
  }
  // bloqueios por falta de evidência (`undiagnosed`) e por falta de diagnóstico estruturado (`unresolved`)
  const names = [...new Set([...Object.keys(state?.undiagnosed ?? {}), ...Object.keys(state?.unresolved ?? {})])];
  if (!names.length) return refuseWith("DA-NOTHING", AUTH_MESSAGES["DA-NOTHING"]);
  write(`Verificações sem diagnóstico para ${ref}: ${names.join(", ")}\nLiberar permite que o agente volte a escrever correções SEM diagnóstico estruturado (o caminho normal é o agente registrar um com gh:ci-diagnose). Faça isso só depois de fornecer os logs do job à sessão.\n`);
  if ((await confirm(`Digite ${CLEAR_PHRASE} para liberar: `)) !== CLEAR_PHRASE) return refuseWith("DA-CONFIRM", AUTH_MESSAGES["DA-CONFIRM"]);
  const next = { ...state, undiagnosed: {}, unresolved: {} };
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next), { mode: 0o600 });
  fs.renameSync(tmp, file);
  fs.appendFileSync(path.join(dir, "audit.jsonl"), `${JSON.stringify({ ts: now.toISOString(), verb: "owner-clear-undiagnosed", outcome: "ok", refusal: null, ref, cleared: names })}\n`, { mode: 0o600 });
  write(`Liberado: ${names.join(", ")}\n`);
  return 0;
}

/**
 * D-25: concessão temporária de habilitação para o ensaio, vinculada ao SHA-256 do registro `ops-<n>` e fora do repositório. Só `ops-*`,
 * validade ≤ 24 h e ≤ a do registro. `--log-hosts` (opcional) lista hostnames EXATOS que o proprietário observou e aprovou para `gh:ci-log`;
 * pode ser acrescentado depois regravando a concessão, que PRESERVA a janela original (sem renovar). Revogar = apagar o arquivo.
 */
async function enableRehearsal({ args, homeDir, now, confirm, write, recordDir, refuseWith }) {
  const ref = args["enable-rehearsal"];
  if (!Object.keys(args).every((k) => k === "enable-rehearsal" || k === "log-hosts") || !GRANT_REF_PATTERN.test(ref)) return refuseWith("DA-ARGS", AUTH_MESSAGES["DA-ARGS"]);
  const dir = recordDir ?? defaultRecordDir(homeDir);
  const logHosts = args["log-hosts"] === undefined ? undefined : args["log-hosts"].split(",").filter(Boolean);
  let loaded;
  let grant;
  let preserved = false;
  try {
    loaded = selectRecord({ ref, recordDir: dir, now });
    // regravar NÃO renova a janela: se já existe uma concessão, ela precisa estar válida e a nova herda issuedAt/expiresAt. Concessão
    // existente expirada, adulterada ou insegura recusa: o proprietário a apaga explicitamente antes de emitir outra (nunca renovação silenciosa)
    let window;
    let exists = true;
    try {
      fs.lstatSync(grantFile(dir, ref));
    } catch {
      exists = false;
    }
    if (exists) {
      const previous = loadGrant({ record: loaded.record, recordSha256: loaded.sha256, recordDir: dir, now });
      window = { issuedAt: previous.grant.issuedAt, expiresAt: previous.grant.expiresAt };
      preserved = true;
    }
    grant = buildGrant({ record: loaded.record, recordSha256: loaded.sha256, logHosts, confirmation: GRANT_PHRASE, window }, { now });
  } catch (e) {
    if (e instanceof RecordError) return refuseWith(e.code, `${RECORD_MESSAGES[e.code]}${e.detail ? ` [${e.detail}]` : ""}`);
    throw e;
  }
  write(`Concessão de ENSAIO para ${ref}\nRegistro: ${loaded.file}\nSHA-256 do registro: ${loaded.sha256}\nBranch única: ${loaded.record.branch}\nCaminhos permitidos:\n${loaded.record.paths.map((p) => `  - ${p}`).join("\n")}\n`);
  write(`Hosts de log aprovados: ${logHosts?.length ? logHosts.join(", ") : "nenhum (gh:ci-log continua fechado)"}\n`);
  write(`Vale até: ${grant.expiresAt} (máximo 24 h e nunca além do registro)${preserved ? "; regravação: a janela original foi PRESERVADA, não renovada; estado, relógio e contadores da entrega não são tocados" : ""}\n`);
  write("Habilita, SÓ para este registro e enquanto a concessão existir, os wrappers com delegatedDelivery=false no repositório. Não é a habilitação definitiva. O kill switch prevalece; para revogar, apague o arquivo da concessão.\n");
  if ((await confirm(`Digite ${GRANT_PHRASE} para gravar a concessão: `)) !== GRANT_PHRASE) return refuseWith("DA-CONFIRM", AUTH_MESSAGES["DA-CONFIRM"]);
  const { file, sha256 } = writeGrant(grant, { recordDir: dir });
  write(`Concessão gravada em ${file}\nSHA-256 da concessão: ${sha256}\nInicie a sessão com: pnpm claude:local --increment=${ref}\n`);
  return 0;
}

/** Ponto de entrada testável: todas as dependências externas são injetáveis. */
export async function run({
  argv = process.argv.slice(2), env = process.env, isTTY = Boolean(process.stdin.isTTY && process.stdout.isTTY),
  homeDir = os.homedir(), now = new Date(), confirm = confirmTyped, write = (s) => process.stdout.write(s), recordDir, stateDir,
} = {}) {
  const refuseWith = (code, text) => {
    write(`Oplyra authorize: ${code} (${text})\n`);
    return 2;
  };
  if (env.CLAUDECODE || env.CLAUDE_PROJECT_DIR || env.CLAUDE_CODE_ENTRYPOINT) return refuseWith("DA-AGENT", AUTH_MESSAGES["DA-AGENT"]);
  if (!isTTY) return refuseWith("DA-TTY", AUTH_MESSAGES["DA-TTY"]);
  const args = parseArgs(argv);
  if (!args) return refuseWith("DA-ARGS", AUTH_MESSAGES["DA-ARGS"]);
  if (args["clear-undiagnosed"] !== undefined) {
    return clearUndiagnosed({ args, homeDir, now, confirm, write, stateDir, refuseWith });
  }
  if (args["enable-rehearsal"] !== undefined) {
    return enableRehearsal({ args, homeDir, now, confirm, write, recordDir, refuseWith });
  }
  if (args["log-hosts"] !== undefined) return refuseWith("DA-ARGS", AUTH_MESSAGES["DA-ARGS"]);
  // padrões de duração e iterações (D-23): o script os APRESENTA e a confirmação digitada os aceita; o registro grava valores explícitos
  const input = inputFromArgs(args);
  const defaulted = OWNER_BUDGETS.filter((key) => input.budgets[key] === undefined);
  for (const key of defaulted) input.budgets[key] = OWNER_DEFAULTS[key];
  let record;
  try {
    record = buildRecord({ ...input, confirmation: AUTHORIZE_PHRASE }, { now });
  } catch (e) {
    if (e instanceof RecordError) return refuseWith(e.code, RECORD_MESSAGES[e.code]);
    throw e;
  }
  write(`Repositório: ${record.repository}\nBranch única: ${record.branch}\nBase: ${record.baseRef}@${record.baseSha}\nCaminhos permitidos:\n${record.paths.map((p) => `  - ${p}`).join("\n")}\n`);
  write(`Orçamentos (tetos: ${JSON.stringify({ ...CEILINGS, ...OWNER_CEILINGS })}): ${JSON.stringify(record.budgets)}\n`);
  const label = (key) => (defaulted.includes(key) ? "PADRÃO proposto pelo script" : "informado por você");
  write(`Duração máxima da entrega: ${record.budgets.wallClockSeconds} s (${label("wallClockSeconds")}; teto ${OWNER_CEILINGS.wallClockSeconds}; inclui espera de CI e interrupções)\n`);
  write(`Iterações (ciclos stage→push) máximas: ${record.budgets.iterations} (${label("iterations")}; teto ${OWNER_CEILINGS.iterations})\n`);
  write(`Leituras de log de CI (gh:ci-log) máximas: ${record.budgets.logReads} (${label("logReads")}; teto ${OWNER_CEILINGS.logReads})\n`);
  write("Estes valores, inclusive os padrões, serão gravados de forma explícita no registro; os limites de commits, pushes, correções e espera de CI valem em conjunto.\n");
  write(`Expira em: ${record.expiresAt}\n`);
  write("Autoriza: criar a branch, preparar arquivos, commit, push sem force e PR draft. Não autoriza merge, aprovação, rerun, force push nem mudança de control plane.\n");
  if ((await confirm(`Digite ${AUTHORIZE_PHRASE} para gravar o registro: `)) !== AUTHORIZE_PHRASE) return refuseWith("DA-CONFIRM", AUTH_MESSAGES["DA-CONFIRM"]);
  try {
    const { file, sha256 } = writeRecord(record, { recordDir: recordDir ?? defaultRecordDir(homeDir) });
    write(`Registro gravado em ${file}\nSHA-256: ${sha256}\nInicie a sessão com: pnpm claude:local --increment=${record.ref}\n`);
    return 0;
  } catch (e) {
    if (e instanceof RecordError) return refuseWith(e.code, RECORD_MESSAGES[e.code]);
    throw e;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = await run();
}
