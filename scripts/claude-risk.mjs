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

/**
 * Billing, webhooks do Stripe, entitlements e preços em CÓDIGO (`apps/`, `packages/`): elevados, com precedência sobre os diretórios do
 * perfil de produto, até existir política específica aprovada (INTEGRACAO-PR11-E-PERFIS §8, §9). Documentos em `docs/` não são afetados.
 */
const BILLING_CODE = /^(apps|packages)\/.*(billing|stripe|entitlement|pricing|subscription|webhook)/;
/**
 * Candidatos a catálogo de tradução em código. O formato e o caminho dos catálogos NÃO estão definidos pela frente de idiomas
 * (docs/product/marketing-ops/i18n/I18N-SPEC.md: "Não escolher nova biblioteca neste pacote; confirmar stack e versão"): até lá, todo
 * candidato é elevado (lacuna registrada). `I18N_CATALOG_PATTERN` é o padrão aprovado; null = indefinido.
 */
export const I18N_CANDIDATE = /^(apps|packages)\/(.*\/)?(locales?|messages|i18n|translations?|lang)\//;
export const I18N_CATALOG_PATTERN = null;

/** Regras na ordem; a primeira que casa define o motivo. Entrada: caminho relativo, minúsculo, com `/`. */
const ELEVATED_RULES = Object.freeze([
  ["billing", (r) => BILLING_CODE.test(r)],
  ["i18n-catalogo", (r) => I18N_CANDIDATE.test(r)],
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

/* ------------------------------------------------------------------ conteúdo */

const COMMERCIAL_WORDS = /\b(pre[cç]os?|prices?|pricing|valor(es)?|planos?|plans?|assinaturas?|subscriptions?|mensalidades?|monthly|mensal|anual|annual|yearly|renova\w*|renew\w*|cancel\w*|reembols\w*|refunds?|trial|desconto\w*|discounts?|cobran[cç]a\w*|billing|faturas?|invoices?|gr[aá]tis|free|limites?|limits?|prazos?|dias|days|meses|months?)\b/i;
const CURRENCY = /(R\$|US\$|[$€£¥]|\b(BRL|USD|EUR|GBP|JPY)\b)/;
const PLACEHOLDER = /\{([^{}]*)\}/g;
const PLACEHOLDER_NAME = /^[a-z][a-zA-Z0-9_]*$/;
const COMMERCIAL_PLACEHOLDER = /(price|preco|amount|valor|currency|moeda|plan|plano|limit|limite|trial|renew|renova|cancel)/i;

/**
 * Catálogo de tradução: rotina SOMENTE se for JSON de chaves de texto cujos valores tenham apenas texto e placeholders de apresentação
 * (`{nome}`, `{count}`). Número, moeda, preço, plano/limite, prazo ou renovação/cancelamento → `{ ok: false, reason }`.
 */
export function analyzeTranslationCatalog(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: "catalogo-ilegivel" };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, reason: "catalogo-ilegivel" };
  const stack = [data];
  while (stack.length) {
    const node = stack.pop();
    for (const [key, value] of Object.entries(node)) {
      if (!/^[A-Za-z0-9_.-]+$/.test(key)) return { ok: false, reason: "chave-invalida" };
      if (value && typeof value === "object" && !Array.isArray(value)) {
        stack.push(value);
        continue;
      }
      if (typeof value !== "string") return { ok: false, reason: "valor-nao-textual" };
      for (const [, name] of value.matchAll(PLACEHOLDER)) {
        if (!PLACEHOLDER_NAME.test(name)) return { ok: false, reason: "placeholder-nao-permitido" };
        if (COMMERCIAL_PLACEHOLDER.test(name)) return { ok: false, reason: "placeholder-comercial" };
      }
      const prose = value.replace(PLACEHOLDER, " ");
      if (/[{}]/.test(prose)) return { ok: false, reason: "placeholder-nao-permitido" };
      if (/\d/.test(prose)) return { ok: false, reason: "numero-em-traducao" };
      if (CURRENCY.test(prose)) return { ok: false, reason: "moeda-em-traducao" };
      if (COMMERCIAL_WORDS.test(prose.normalize("NFC"))) return { ok: false, reason: "termo-comercial-em-traducao" };
    }
  }
  return { ok: true };
}

const LOCALE_WORD = "(?:locale|uiLocale|preferredLocale|tenantLocale|outputLocale|lang|language|navigator\\.language)";
const COMMERCIAL_WORD = "(?:currency|billingCurrency|price|priceId|prices|amount|plan|planId|plans)";
const LOCALE_TAG = "['\"`](?:pt-BR|pt-br|en-US|en-us|pt|en)['\"`]";
const MONEY_CODE = "['\"`](?:BRL|USD|EUR)['\"`]";
/** Derivação de termo comercial a partir do idioma (formatar um valor JÁ definido com `Intl` e o locale não é derivação). */
const LOCALE_DERIVES = [
  new RegExp(`\\b${COMMERCIAL_WORD}(?:Code|Codes)?\\s*[:=]\\s*[^;,\\n]*\\b${LOCALE_WORD}\\b`, "i"),
  new RegExp(`\\b${LOCALE_WORD}\\b\\s*[!=]==?\\s*${LOCALE_TAG}\\s*\\?\\s*(?:${MONEY_CODE}|[^:;\\n]*\\b${COMMERCIAL_WORD})`, "i"),
  new RegExp(`${LOCALE_TAG}\\s*:\\s*${MONEY_CODE}`),
  new RegExp(`\\bcase\\s+${LOCALE_TAG}\\s*:\\s*return\\s+${MONEY_CODE}`),
];
const STRIPE_ACCESS = /\b(sk|pk|rk)_(test|live)_[A-Za-z0-9]|\bwhsec_[A-Za-z0-9]|api\.stripe\.com|js\.stripe\.com|from\s+['"]stripe['"]|require\(\s*['"]stripe['"]\s*\)|import\(\s*['"]stripe['"]\s*\)|from\s+['"]@stripe\//;
const CODE_FILE = /\.([cm]?[jt]sx?|json)$/;

/**
 * Regras de conteúdo do código (§8 critérios 1 e 4). Heurística conservadora: na dúvida, eleva.
 *  - `locale-define-termo-comercial`: locale/idioma e moeda/preço/plano na mesma instrução ou mapa locale→moeda;
 *  - `stripe-acesso-externo`: SDK, endpoint ou chave do Stripe (inclusive modo de teste): nenhuma classe autoriza acesso externo.
 */
export function contentFindings(rel, text) {
  if (typeof text !== "string" || !CODE_FILE.test(rel)) return [];
  const out = [];
  if (STRIPE_ACCESS.test(text)) out.push("stripe-acesso-externo");
  if (LOCALE_DERIVES.some((re) => re.test(text))) out.push("locale-define-termo-comercial");
  return out;
}

/**
 * Classificação com conteúdo: `changes` `{ path, status, content? }` (conteúdo do HEAD). Um caminho rotineiro com achado de conteúdo vira
 * elevado; um catálogo de tradução só pode ser rotina se o padrão de catálogo estiver APROVADO (`i18nCatalog`, hoje indefinido) e o
 * conteúdo passar em `analyzeTranslationCatalog`. Conteúdo ausente em arquivo que exige leitura → elevado (nunca aprovado por omissão).
 */
export function classifyChangeWithContent(changes, { i18nCatalog = I18N_CATALOG_PATTERN } = {}) {
  if (!Array.isArray(changes) || !changes.length) return classifyChange(changes);
  const results = changes.map((c) => {
    const base = classifyPath(c);
    const rel = String(c.path ?? "").toLowerCase();
    if (base.reason === "i18n-catalogo") {
      if (!(i18nCatalog instanceof RegExp) || !i18nCatalog.test(rel)) return { ...base, reason: "i18n-catalogo-indefinido" };
      if (c.status === "removed") return base;
      if (typeof c.content !== "string") return { ...base, reason: "i18n-conteudo-ausente" };
      const v = analyzeTranslationCatalog(c.content);
      return v.ok ? { path: c.path, risk: RISK.routine, reason: null } : { ...base, reason: `i18n:${v.reason}` };
    }
    if (base.risk !== RISK.routine || c.status === "removed") return base;
    if (CODE_FILE.test(rel) && typeof c.content !== "string") return { path: c.path, risk: RISK.elevated, reason: "conteudo-ausente" };
    const found = contentFindings(rel, c.content);
    return found.length ? { path: c.path, risk: RISK.elevated, reason: found[0] } : base;
  });
  const elevated = results.filter((r) => r.risk === RISK.elevated).map(({ path: p, reason }) => ({ path: p, reason }));
  return { risk: elevated.length ? RISK.elevated : RISK.routine, elevated, routine: results.filter((r) => r.risk === RISK.routine).map((r) => r.path) };
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

/**
 * Um caminho elevado SEM dono só é aceito quando o resultado do `structural-gate` é deste head (`headSha`), `success`, elegível, o lista
 * em `structural` e o motivo é banco/dependências. Qualquer outro caso continua exigindo dono no CODEOWNERS (falha do risk-gate).
 */
export function structurallyCovered(structural, headSha, entry) {
  return Boolean(structural) && typeof headSha === "string" && /^[0-9a-f]{40}$/.test(headSha) && structural.sha === headSha
    && structural.conclusion === "success" && structural.eligible === true && Array.isArray(structural.structural)
    && structural.structural.includes(entry.path) && ["banco", "dependencias"].includes(entry.reason);
}

export function runGate({ base, head = "HEAD", codeowners = ".github/CODEOWNERS", cwd = process.cwd(), write = (s) => process.stdout.write(s), changes, structural = null, headSha } = {}) {
  const rules = parseCodeowners(fs.readFileSync(path.join(cwd, codeowners), "utf8"));
  const list = changes ?? gitNames(base, head, cwd);
  const verdict = classifyChange(list);
  const missing = uncoveredElevated(list, rules).filter((m) => !structurallyCovered(structural, headSha, m));
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
      // `--structural <arquivo>`: saída JSON do structural-gate (pode estar vazia); `--head-sha`: head do PR ao qual ela precisa pertencer
      const file = opt("--structural");
      let structural = null;
      if (file) {
        try {
          structural = JSON.parse(fs.readFileSync(file, "utf8") || "null");
        } catch {
          structural = null;
        }
      }
      process.exitCode = runGate({ base, head: opt("--head", "HEAD"), codeowners: opt("--codeowners", ".github/CODEOWNERS"), cwd: here, structural, headSha: opt("--head-sha") });
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
