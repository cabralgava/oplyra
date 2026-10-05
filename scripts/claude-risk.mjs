#!/usr/bin/env node
// Classificação de risco de mudanças e verificação de cobertura do CODEOWNERS (política de 04/10/2026). Control plane.
//
// Mecanismo de controle que torna segura a integração rotineira sem clique do proprietário:
//   - `routine`: mudança de produto/testes/docs comuns dentro do escopo; pode ser integrada pelo runner quando todos os gates passam;
//   - `elevated`: control plane, CI, banco/RLS, dependências, contratos, harness, ferramentas, ADRs, configuração de testes e
//     remoção de testes; NUNCA é integrada automaticamente — exige revisão do dono do código (CODEOWNERS), imposta pelo GitHub.
// O job `risk-gate` da CI falha se algum caminho `elevated` alterado não tiver um dono no CODEOWNERS. Assim a regra "elevado
// exige o proprietário" não depende de o classificador e o CODEOWNERS concordarem por acaso: a divergência bloqueia o PR.
//
// Uso (CI): node scripts/claude-risk.mjs gate --base <ref> [--head HEAD] [--codeowners .github/CODEOWNERS]
//           node scripts/claude-risk.mjs classify <caminho>...

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { isControlPlane, isProtectedReference, isSensitiveRel } from "./claude-local-first-guard.mjs";

export const RISK = Object.freeze({ routine: "routine", elevated: "elevated" });

const TEST_FILE = /(^|\/)(test|tests|__tests__|e2e)\/|\.(test|spec)\.[cm]?[jt]sx?$|\.test\.mjs$|(^|\/)supabase\/tests\//;
const CONFIG_FILE = /(^|\/)(vitest|playwright|next)\.config\.[cm]?[jt]s$|(^|\/)tsconfig[^/]*\.json$/;
const DEPENDENCY_FILE = /(^|\/)(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|package-lock\.json|yarn\.lock|\.npmrc)$/;

/** Regras na ordem; a primeira que casa define o motivo. Entrada: caminho relativo, minúsculo, com `/`. */
const ELEVATED_RULES = Object.freeze([
  ["control-plane", (r) => isControlPlane(r) || isControlPlane(`${r}/`)],
  ["segredo", (r) => isSensitiveRel(r)],
  ["referencia-protegida", (r) => isProtectedReference(r)],
  ["ci", (r) => r === ".github" || r.startsWith(".github/")],
  ["banco", (r) => r === "supabase" || r.startsWith("supabase/")],
  ["dependencias", (r) => DEPENDENCY_FILE.test(r)],
  ["ferramentas", (r) => r === "tools" || r.startsWith("tools/")],
  ["scripts", (r) => r === "scripts" || r.startsWith("scripts/")],
  ["contratos", (r) => /(^|\/)contracts(\/|$)/.test(r) || r.startsWith("test/contracts/")],
  ["harness", (r) => r === "docs/harness" || r.startsWith("docs/harness/") || /^test\/developer-harness\./.test(r)],
  ["decisoes", (r) => r === "docs/decisions" || r.startsWith("docs/decisions/")],
  ["config-de-teste-ou-build", (r) => CONFIG_FILE.test(r)],
]);

/** Uma mudança é um caminho (string) ou `{ path, status }`; `status` `removed` de um teste é sempre elevado (nunca apagar testes sem o dono). */
export function classifyPath(change) {
  const entry = typeof change === "string" ? { path: change, status: "modified" } : change;
  const rel = String(entry.path ?? "").replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
  if (!rel || rel.startsWith("/") || rel.split("/").includes("..")) return { path: entry.path, risk: RISK.elevated, reason: "caminho-invalido" };
  for (const [reason, test] of ELEVATED_RULES) if (test(rel)) return { path: entry.path, risk: RISK.elevated, reason };
  if (entry.status === "removed" && TEST_FILE.test(rel)) return { path: entry.path, risk: RISK.elevated, reason: "remocao-de-teste" };
  return { path: entry.path, risk: RISK.routine, reason: null };
}

/** Risco do conjunto: elevado se QUALQUER caminho for elevado; conjunto vazio é elevado (nada a integrar com segurança). */
export function classifyChange(changes) {
  if (!Array.isArray(changes) || !changes.length) return { risk: RISK.elevated, elevated: [{ path: null, reason: "mudanca-vazia" }], routine: [] };
  const results = changes.map(classifyPath);
  const elevated = results.filter((r) => r.risk === RISK.elevated).map(({ path: p, reason }) => ({ path: p, reason }));
  return { risk: elevated.length ? RISK.elevated : RISK.routine, elevated, routine: results.filter((r) => r.risk === RISK.routine).map((r) => r.path) };
}

/* ------------------------------------------------------------------- CODEOWNERS */

/**
 * Subconjunto fechado da sintaxe do CODEOWNERS: `/dir/`, `/arquivo`, `/prefixo*`, `**` + `/nome` e `nome` (basename em qualquer lugar).
 * Qualquer outra construção (`!`, `[`, `?`, `\`, `#` no meio, dono vazio) é recusada: falha fechada, nunca uma regra interpretada errado.
 */
export function parseCodeowners(text) {
  const rules = [];
  const lines = String(text).split(/\r?\n/);
  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const parts = line.split(/\s+/);
    const [pattern, ...owners] = parts;
    if (/[!\[\]?\\]/.test(pattern) || !owners.length || owners.some((o) => !/^@[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)?$/.test(o))) {
      throw new Error(`CODEOWNERS linha ${index + 1}: sintaxe não suportada`);
    }
    rules.push({ pattern, owners, regex: patternToRegex(pattern) });
  });
  return rules;
}

function patternToRegex(pattern) {
  const anchored = pattern.startsWith("/");
  const dir = pattern.endsWith("/");
  let body = pattern.replace(/^\//, "").replace(/\/$/, "");
  body = body.split("**/").map((seg) => seg.replace(/[.+^${}()|]/g, "\\$&").replace(/\*/g, "[^/]*")).join("(?:.*/)?");
  const head = anchored || body.includes("/") ? "^" : "^(?:.*/)?";
  return new RegExp(`${head}${body}${dir ? "/.*" : "(?:/.*)?"}$`);
}

/** O último padrão que casa vence (semântica do GitHub). Devolve os donos ou `null` se nenhum casa. */
export function ownersOf(rules, rel) {
  const target = String(rel).replace(/^\.\//, "");
  let found = null;
  for (const rule of rules) if (rule.regex.test(target)) found = rule.owners;
  return found;
}

/** Caminhos elevados sem dono: cada um é uma divergência entre o classificador e o CODEOWNERS (o job `risk-gate` falha). */
export function uncoveredElevated(changes, rules) {
  const { elevated } = classifyChange(changes);
  return elevated.filter((e) => e.path !== null && !ownersOf(rules, e.path));
}

/* ------------------------------------------------------------------------ CLI */

function gitNames(base, head, cwd) {
  const r = spawnSync("git", ["diff", "--name-status", "--no-renames", "-z", `${base}...${head}`], { cwd, encoding: "utf8", shell: false });
  if (r.status !== 0) throw new Error("git diff falhou");
  const parts = String(r.stdout).split("\0").filter(Boolean);
  const out = [];
  for (let k = 0; k + 1 < parts.length; k += 2) out.push({ path: parts[k + 1], status: parts[k].startsWith("D") ? "removed" : parts[k].startsWith("A") ? "added" : "modified" });
  return out;
}

export function runGate({ base, head = "HEAD", codeowners = ".github/CODEOWNERS", cwd = process.cwd(), write = (s) => process.stdout.write(s), changes } = {}) {
  const rules = parseCodeowners(fs.readFileSync(path.join(cwd, codeowners), "utf8"));
  const list = changes ?? gitNames(base, head, cwd);
  const verdict = classifyChange(list);
  const missing = uncoveredElevated(list, rules);
  write(`risk-gate: risco=${verdict.risk}; arquivos=${list.length}; elevados=${verdict.elevated.length}; sem dono no CODEOWNERS=${missing.length}\n`);
  for (const e of verdict.elevated.slice(0, 50)) write(`  elevado: ${e.path} (${e.reason})\n`);
  for (const m of missing) write(`  SEM DONO: ${m.path} (${m.reason})\n`);
  if (verdict.risk === RISK.elevated) write("Este PR é de risco elevado: exige revisão do dono do código e NÃO é integrado automaticamente.\n");
  return missing.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [cmd, ...rest] = process.argv.slice(2);
  const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  try {
    if (cmd === "gate") {
      const opt = (name, fallback) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : fallback);
      const base = opt("--base");
      if (!base) throw new Error("--base obrigatório");
      process.exitCode = runGate({ base, head: opt("--head", "HEAD"), codeowners: opt("--codeowners", ".github/CODEOWNERS"), cwd: here });
    } else if (cmd === "classify") {
      const verdict = classifyChange(rest);
      process.stdout.write(`${JSON.stringify(verdict)}\n`);
    } else {
      process.stderr.write("uso: claude-risk.mjs gate --base <ref> | classify <caminho>...\n");
      process.exitCode = 2;
    }
  } catch (e) {
    process.stderr.write(`risk-gate: ${e.message}\n`);
    process.exitCode = 2;
  }
}
