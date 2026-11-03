// Classe `structural` (docs/harness/INTEGRACAO-PR11-E-PERFIS.md §3 e §4). Control plane.
//
// Uma mudança `structural` executa um incremento cujo escopo o proprietário aprovou UMA vez (`scopeRef`, documento aprovado com
// `sha256`). Só caminhos que o classificador marca como `banco` ou `dependencias` podem ser reclassificados, e só pelo CONTEÚDO:
//   - `packages/{core,infra,testing}/package.json`: somente a adição EXATA das entradas `exports` do escopo; todo o resto igual à base;
//   - `supabase/migrations/<ts>_x.sql` NOVA, posterior à última da base, cujas instruções estejam TODAS cobertas pelo escopo e que
//     cumpra os requisitos de RLS, FORCE, políticas por tenant, concessões e SECURITY DEFINER definidos para cada tabela/função;
//   - `supabase/tests/<x>.test.sql` NOVO e listado no escopo.
// Qualquer outra coisa (instrução não classificável, campo fora do escopo, escopo ausente/inválido) NÃO é aprovada por omissão:
// o conjunto vira `elevated` (ou a autorização é recusada). Isto não dispensa CI, evidência do SHA exato nem os demais gates; a
// análise do diff não prova isolamento real entre tenants (isso é do pgTAP com o banco local) e integrar no Git não autoriza produção.
//
// O `structural-gate` carrega ESTE módulo (e o que ele importa) do commit base confiável, nunca da versão candidata: o candidato não
// consegue alterar o próprio gate. O carregamento usa Git com ambiente mínimo, sem credenciais.

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { SCOPE_REF_PATTERN } from "./claude-delivery-record.mjs";
import { RISK, classifyChangeWithContent, classifyPath } from "./claude-risk.mjs";

export const STRUCTURAL = "structural";
export const SCOPE_SCHEMA = "oplyra-structural-scope/1";
export const GATE_SCHEMA = "oplyra-structural-gate/1";
export const STRUCTURAL_CHECK = "structural-gate";
/** Motivos do classificador por caminho que o conteúdo pode rebaixar para `structural`. Todos os demais continuam elevados. */
export const STRUCTURAL_REASONS = Object.freeze(["banco", "dependencias"]);
/** `search_path` seguro exigido de toda função SECURITY DEFINER (convenção das migrations existentes). */
export const SAFE_SEARCH_PATH = "pg_catalog, pg_temp";
/** Módulos do controle carregados do commit base confiável (o gate e tudo o que ele importa). */
export const CONTROL_MODULES = Object.freeze(["claude-structural.mjs", "claude-risk.mjs", "claude-local-first-guard.mjs", "claude-delivery-record.mjs"]);
/**
 * Escopos estruturais aprovados ficam VERSIONADOS em `docs/harness/scopes/<scopeRef>.json` (classe elevada, dono do código). O gate os lê
 * SOMENTE do commit base (`git show <base>:<arquivo>`); a versão do head/PR nunca é lida, e alterá-la no diff torna a mudança elevada.
 */
export const SCOPES_DIR = "docs/harness/scopes/";
export const scopeFileOf = (scopeRef) => `${SCOPES_DIR}${scopeRef}.json`;
/** Motivos de conteúdo que a classificação só por caminho não vê: num arquivo rotineiro por caminho, reprovam o `structural-gate`. */
export const CONTENT_REASONS = Object.freeze(["stripe-acesso-externo", "locale-define-termo-comercial", "conteudo-ausente"]);

const EXPORT_PACKAGE = /^packages\/(core|infra|testing)\/package\.json$/;
const EXPORT_KEY = /^\.\/[a-z0-9]+(-[a-z0-9]+)*$/;
const EXPORT_TARGET = /^\.\/src\/[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*\.ts$/;
const MIGRATION_FILE = /^supabase\/migrations\/(\d{14})_[a-z0-9_]+\.sql$/;
const PGTAP_FILE = /^supabase\/tests\/[a-z0-9_-]+\.test\.sql$/;
const NAME = "[a-z_][a-z0-9_]*";
const QUALIFIED = `${NAME}\\.${NAME}`;
const QUALIFIED_RE = new RegExp(`^${QUALIFIED}$`);
const NAME_RE = new RegExp(`^${NAME}$`);
const PRIVILEGES = Object.freeze(["select", "insert", "update", "delete"]);
/** Único destinatário de GRANT que um escopo estrutural pode listar; `anon` e `public` nunca. */
const GRANTEES = Object.freeze(["authenticated"]);

export class StructuralError extends Error {
  constructor(code, detail) {
    super(code);
    this.code = code;
    this.detail = detail;
  }
}
const fail = (code, detail) => {
  throw new StructuralError(code, detail);
};

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const closed = (o, keys) => isObj(o) && Object.keys(o).every((k) => keys.includes(k)) && keys.every((k) => k in o);
/** JSON canônico (chaves ordenadas): compara valores sem depender da ordem das chaves. */
export function canon(v) {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (isObj(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}

/* ------------------------------------------------------------------- escopo */

/** Valida o escopo estrutural aprovado (esquema fechado). Lança StructuralError("SC-SCOPE", motivo). */
export function validateStructuralScope(scope) {
  if (!closed(scope, ["schema", "id", "approvedDocument", "packageExports", "migrations", "tests"])) fail("SC-SCOPE", "campos");
  if (scope.schema !== SCOPE_SCHEMA) fail("SC-SCOPE", "schema");
  if (typeof scope.id !== "string" || !SCOPE_REF_PATTERN.test(scope.id)) fail("SC-SCOPE", "id");
  const doc = scope.approvedDocument;
  if (!closed(doc, ["path", "sha256"]) || typeof doc.path !== "string" || !doc.path || path.posix.normalize(doc.path) !== doc.path || doc.path.startsWith("/") || doc.path.split("/").includes("..")) fail("SC-SCOPE", "documento");
  if (typeof doc.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(doc.sha256)) fail("SC-SCOPE", "documento-sha256");
  if (!Array.isArray(scope.packageExports) || !Array.isArray(scope.migrations) || !Array.isArray(scope.tests)) fail("SC-SCOPE", "listas");
  if (!scope.packageExports.length && !scope.migrations.length) fail("SC-SCOPE", "vazio");
  const files = [];
  for (const e of scope.packageExports) {
    if (!closed(e, ["file", "add"]) || !EXPORT_PACKAGE.test(e.file) || !isObj(e.add) || !Object.keys(e.add).length) fail("SC-SCOPE", "exports");
    for (const [k, v] of Object.entries(e.add)) if (!EXPORT_KEY.test(k) || typeof v !== "string" || !EXPORT_TARGET.test(v)) fail("SC-SCOPE", `exports:${k}`);
    files.push(e.file);
  }
  for (const m of scope.migrations) {
    if (!closed(m, ["file", "tables", "policies", "grants", "indexes", "functions"]) || !MIGRATION_FILE.test(m.file)) fail("SC-SCOPE", "migration");
    for (const list of ["tables", "policies", "grants", "indexes", "functions"]) if (!Array.isArray(m[list])) fail("SC-SCOPE", list);
    const tables = new Set();
    for (const t of m.tables) {
      if (!closed(t, ["name", "tenantOwned", "forceRls"]) || !QUALIFIED_RE.test(t.name) || typeof t.tenantOwned !== "boolean" || typeof t.forceRls !== "boolean") fail("SC-SCOPE", "tabela");
      if (tables.has(t.name)) fail("SC-SCOPE", "tabela-duplicada");
      tables.add(t.name);
    }
    for (const p of m.policies) if (!closed(p, ["name", "table"]) || !NAME_RE.test(p.name) || !tables.has(p.table)) fail("SC-SCOPE", "politica");
    // tabela de tenant sem política de isolamento no escopo não pode ser aprovada
    for (const t of m.tables) if (t.tenantOwned && !m.policies.some((p) => p.table === t.name)) fail("SC-SCOPE", `sem-politica:${t.name}`);
    for (const g of m.grants) {
      if (!closed(g, ["table", "to", "privileges"]) || !tables.has(g.table) || !GRANTEES.includes(g.to)) fail("SC-SCOPE", "grant");
      if (!Array.isArray(g.privileges) || !g.privileges.length || g.privileges.some((p) => !PRIVILEGES.includes(p))) fail("SC-SCOPE", "grant-privilegios");
    }
    for (const i of m.indexes) if (!closed(i, ["name", "table"]) || !NAME_RE.test(i.name) || !tables.has(i.table)) fail("SC-SCOPE", "indice");
    for (const f of m.functions) if (!closed(f, ["name", "securityDefiner"]) || !QUALIFIED_RE.test(f.name) || typeof f.securityDefiner !== "boolean") fail("SC-SCOPE", "funcao");
    files.push(m.file);
  }
  for (const t of scope.tests) {
    if (typeof t !== "string" || !PGTAP_FILE.test(t)) fail("SC-SCOPE", "teste");
    files.push(t);
  }
  if (new Set(files).size !== files.length) fail("SC-SCOPE", "arquivo-duplicado");
  return scope;
}

/** Arquivos que um escopo estrutural (já validado) permite tocar. */
export function structuralFiles(scope) {
  return [...scope.packageExports.map((e) => e.file), ...scope.migrations.map((m) => m.file), ...scope.tests];
}

/* ------------------------------------------------------------- package.json */

const yes = () => ({ ok: true });
const no = (reason) => ({ ok: false, reason });

/** Só a adição EXATA das entradas `exports` do escopo; qualquer outro campo diferente da base torna a mudança elevada. */
export function analyzePackageJson(change, entry) {
  if (!entry) return no("fora-do-escopo");
  if (change.status !== "modified") return no("package-json-status");
  let b;
  let h;
  try {
    b = JSON.parse(change.base);
    h = JSON.parse(change.head);
  } catch {
    return no("package-json-ilegivel");
  }
  if (!isObj(b) || !isObj(h)) return no("package-json-ilegivel");
  const otherKeys = [...new Set([...Object.keys(b), ...Object.keys(h)])].filter((k) => k !== "exports");
  for (const key of otherKeys) if (canon(b[key]) !== canon(h[key])) return no(`campo-nao-autorizado:${key}`);
  const be = b.exports === undefined ? {} : b.exports;
  const he = h.exports;
  if (!isObj(be) || !isObj(he)) return no("exports-formato");
  for (const k of Object.keys(be)) if (canon(be[k]) !== canon(he[k])) return no(`exports-existente-alterado:${k}`);
  const added = Object.keys(he).filter((k) => !(k in be));
  const wanted = Object.keys(entry.add);
  if (added.length !== wanted.length || wanted.some((k) => k in be || he[k] !== entry.add[k])) return no("exports-fora-do-autorizado");
  return yes();
}

/* -------------------------------------------------------------------- SQL */

/**
 * Divide a SQL em instruções, removendo comentários e preservando literais e corpos `$tag$…$tag$`. Identificador entre aspas duplas,
 * literal ou comentário não terminado devolvem null (não classificável → nunca aprovado).
 */
export function splitSql(text) {
  const out = [];
  let cur = "";
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === "-" && text[i + 1] === "-") {
      const j = text.indexOf("\n", i);
      i = j < 0 ? n : j + 1;
      cur += " ";
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      const j = text.indexOf("*/", i + 2);
      if (j < 0) return null;
      i = j + 2;
      cur += " ";
      continue;
    }
    if (c === '"') return null;
    if (c === "'") {
      let j = i + 1;
      for (;;) {
        if (j >= n) return null;
        if (text[j] === "'") {
          if (text[j + 1] === "'") {
            j += 2;
            continue;
          }
          break;
        }
        j += 1;
      }
      cur += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === "$") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(i));
      if (m) {
        const j = text.indexOf(m[0], i + m[0].length);
        if (j < 0) return null;
        cur += text.slice(i, j + m[0].length);
        i = j + m[0].length;
        continue;
      }
    }
    if (c === ";") {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      i += 1;
      continue;
    }
    cur += c;
    i += 1;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Instrução com literais e corpos substituídos (`''`, `$body$`), minúscula e com espaços colapsados; e os corpos à parte. */
function outerOf(stmt) {
  const bodies = [];
  const outer = stmt
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*)?\$[\s\S]*?\$\1\$/g, (m) => {
      bodies.push(m.toLowerCase());
      return " $body$ ";
    })
    .replace(/'(?:[^']|'')*'/g, "''")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*([(),=])\s*/g, "$1")
    .trim();
  return { outer, bodies };
}

/** Proibições explícitas (motivo legível); independentemente delas, toda instrução não reconhecida já é recusada. */
const FORBIDDEN_SQL = Object.freeze([
  ["rls-desabilitado", /\b(disable|no force) row level security\b/],
  ["grant-anon-ou-public", /^grant\b.*\bto\b[a-z_, ]*\b(anon|public)\b/],
  ["bypassrls", /\bbypassrls\b/],
  ["drop-ou-truncate", /^(drop|truncate)\b/],
  ["papel-ou-extensao", /^(create|alter|drop) (role|user|extension)\b/],
  ["revoke", /^revoke\b/],
]);

const STATEMENTS = Object.freeze([
  ["create-table", new RegExp(`^create table (?:if not exists )?(${QUALIFIED})\\(`)],
  ["enable-rls", new RegExp(`^alter table (?:only )?(${QUALIFIED}) enable row level security$`)],
  ["force-rls", new RegExp(`^alter table (?:only )?(${QUALIFIED}) force row level security$`)],
  ["create-policy", new RegExp(`^create policy (${NAME}) on (${QUALIFIED})(?: as (?:permissive|restrictive))?(?: for (?:all|select|insert|update|delete))?(?: to authenticated)? (?:using|with check)\\(`)],
  ["grant", new RegExp(`^grant ([a-z, ]+) on (?:table )?(${QUALIFIED}) to (${NAME})$`)],
  ["create-index", new RegExp(`^create (?:unique )?index (?:if not exists )?(${NAME}) on (?:only )?(${QUALIFIED})(?: using [a-z]+)?\\(`)],
  ["create-function", new RegExp(`^create (?:or replace )?function (${QUALIFIED})\\(`)],
  ["comment", new RegExp(`^comment on table (${QUALIFIED}) is ''$`)],
]);

/** Corpo de função: nada de SQL dinâmico, concessões, troca de papel, DDL destrutiva ou desligamento de RLS. */
const FORBIDDEN_BODY = /\b(execute|grant|revoke|drop|truncate|bypassrls|set role|set_config|alter (role|table)|create (role|user|extension)|disable row level security)\b/;
const SEARCH_PATH_RE = /\bset search_path(?:=| to )([a-z_, ]+?)(?= as | language |\$body\$| security | stable| volatile| immutable| returns |$)/;

function checkGrant(match, m) {
  const privileges = match[1].split(",").map((s) => s.trim());
  const [, , table, grantee] = match;
  if (grantee === "anon" || grantee === "public") return "grant-anon-ou-public";
  const allowed = m.grants.find((g) => g.table === table && g.to === grantee);
  if (!allowed || privileges.some((p) => !allowed.privileges.includes(p))) return "grant-fora-do-escopo";
  return null;
}

function checkFunction(outer, bodies, fn) {
  if (!fn) return "funcao-fora-do-escopo";
  const definer = /\bsecurity definer\b/.test(outer);
  if (definer && !fn.securityDefiner) return "security-definer-nao-autorizado";
  const sp = SEARCH_PATH_RE.exec(outer);
  if (definer && (!sp || sp[1].replace(/\s+/g, "") !== SAFE_SEARCH_PATH.replace(/\s+/g, ""))) return "security-definer-sem-search-path-seguro";
  if (bodies.some((b) => FORBIDDEN_BODY.test(b))) return "corpo-de-funcao-proibido";
  return null;
}

/**
 * Migration NOVA, posterior à última da base e listada no escopo; TODAS as instruções reconhecidas e cobertas; requisitos de cada
 * tabela cumpridos (RLS, FORCE quando o escopo o exige, política com `app.current_tenant()`, concessões só as listadas).
 */
export function analyzeMigration(change, m, { baseMigrations } = {}) {
  if (!m) return no("fora-do-escopo");
  if (change.status !== "added") return no("migration-existente-alterada");
  const ts = MIGRATION_FILE.exec(change.path)?.[1];
  if (!Array.isArray(baseMigrations)) return no("timestamp-nao-verificavel");
  const latest = baseMigrations.map((f) => /^(\d{14})_/.exec(path.posix.basename(f))?.[1]).filter(Boolean).sort().pop();
  if (!ts || (latest && ts <= latest)) return no("timestamp-nao-posterior");
  const statements = typeof change.head === "string" ? splitSql(change.head) : null;
  if (!statements || !statements.length) return no("sql-nao-classificavel");
  const tables = new Map(m.tables.map((t) => [t.name, t]));
  const seen = { created: new Set(), rls: new Set(), forced: new Set(), policies: new Set() };
  for (const stmt of statements) {
    const { outer, bodies } = outerOf(stmt);
    for (const [code, re] of FORBIDDEN_SQL) if (re.test(outer)) return no(code);
    const hit = STATEMENTS.map(([kind, re]) => [kind, re.exec(outer)]).find(([, r]) => r);
    if (!hit) return no("instrucao-nao-coberta");
    const [kind, r] = hit;
    if (kind === "create-table") {
      if (!tables.has(r[1]) || seen.created.has(r[1])) return no("tabela-fora-do-escopo");
      seen.created.add(r[1]);
    } else if (kind === "enable-rls") {
      if (!tables.has(r[1])) return no("tabela-fora-do-escopo");
      seen.rls.add(r[1]);
    } else if (kind === "force-rls") {
      if (!tables.has(r[1])) return no("tabela-fora-do-escopo");
      seen.forced.add(r[1]);
    } else if (kind === "create-policy") {
      if (!m.policies.some((p) => p.name === r[1] && p.table === r[2])) return no("politica-fora-do-escopo");
      if (!/\bapp\.current_tenant\(\)/.test(outer)) return no("politica-sem-tenant");
      seen.policies.add(r[1]);
    } else if (kind === "grant") {
      const problem = checkGrant(r, m);
      if (problem) return no(problem);
    } else if (kind === "create-index") {
      if (!m.indexes.some((i) => i.name === r[1] && i.table === r[2])) return no("indice-fora-do-escopo");
    } else if (kind === "create-function") {
      const problem = checkFunction(outer, bodies, m.functions.find((f) => f.name === r[1]));
      if (problem) return no(problem);
    } else if (kind === "comment") {
      if (!tables.has(r[1])) return no("tabela-fora-do-escopo");
    }
  }
  for (const t of m.tables) {
    if (!seen.created.has(t.name)) return no(`tabela-ausente:${t.name}`);
    if (t.tenantOwned && !seen.rls.has(t.name)) return no(`rls-ausente:${t.name}`);
    if (t.forceRls && !seen.forced.has(t.name)) return no(`force-rls-ausente:${t.name}`);
  }
  for (const p of m.policies) if (!seen.policies.has(p.name)) return no(`politica-ausente:${p.name}`);
  return yes();
}

/* ---------------------------------------------------------------- avaliação */

const refused = (detail) => ({ risk: RISK.elevated, eligible: false, refused: "SC-SCOPE", detail, structural: [], elevated: [], routine: [] });

/**
 * Avalia o conjunto de mudanças contra UM escopo estrutural aprovado. `changes`: `{ path, status, base?, head? }` com o conteúdo de base e
 * head dos arquivos de banco/dependências. `approvedDocumentSha256`: hash do documento aprovado lido no commit base confiável.
 * Resultado: `risk` `routine` | `structural` | `elevated`; `eligible` só para `structural`. Escopo ausente, inválido, de outro `scopeRef`
 * ou com documento divergente é RECUSADO (`refused: "SC-SCOPE"`).
 */
export function evaluateStructural({ changes, scope, scopeRef, approvedDocumentSha256, baseMigrations } = {}) {
  let s;
  try {
    s = validateStructuralScope(scope);
  } catch (e) {
    if (e instanceof StructuralError) return refused(e.detail);
    throw e;
  }
  if (typeof scopeRef !== "string" || s.id !== scopeRef) return refused("scope-ref");
  if (approvedDocumentSha256 !== s.approvedDocument.sha256) return refused("documento-aprovado");
  if (!Array.isArray(changes) || !changes.length) return { risk: RISK.elevated, eligible: false, scopeRef: s.id, structural: [], elevated: [{ path: null, reason: "mudanca-vazia" }], routine: [] };
  const out = { risk: RISK.routine, eligible: false, scopeRef: s.id, structural: [], elevated: [], routine: [] };
  for (const ch of changes) {
    const rel = String(ch?.path ?? "");
    // a missão não altera o que autoriza a própria integração: documento aprovado e escopos versionados
    if (rel.toLowerCase() === s.approvedDocument.path.toLowerCase()) {
      out.elevated.push({ path: rel, reason: "politica-do-escopo" });
      continue;
    }
    if (rel.toLowerCase().startsWith(SCOPES_DIR)) {
      out.elevated.push({ path: rel, reason: "escopo-estrutural" });
      continue;
    }
    const byPath = classifyPath({ path: rel, status: ch.status });
    if (byPath.risk === RISK.routine) {
      // rotineiro pelo caminho ainda passa pelas regras de conteúdo (Stripe, locale → moeda/preço)
      const byContent = classifyChangeWithContent([{ path: rel, status: ch.status, content: ch.head ?? undefined }]);
      if (byContent.risk === RISK.routine) out.routine.push(rel);
      else out.elevated.push(...byContent.elevated);
      continue;
    }
    if (!STRUCTURAL_REASONS.includes(byPath.reason)) {
      out.elevated.push({ path: rel, reason: byPath.reason });
      continue;
    }
    let verdict;
    if (EXPORT_PACKAGE.test(rel)) verdict = analyzePackageJson(ch, s.packageExports.find((e) => e.file === rel));
    else if (MIGRATION_FILE.test(rel)) verdict = analyzeMigration(ch, s.migrations.find((e) => e.file === rel), { baseMigrations });
    else if (PGTAP_FILE.test(rel) && s.tests.includes(rel)) verdict = ch.status === "added" ? yes() : no("teste-existente-alterado");
    else verdict = no("fora-do-escopo");
    if (verdict.ok) out.structural.push(rel);
    else out.elevated.push({ path: rel, reason: verdict.reason });
  }
  out.risk = out.elevated.length ? RISK.elevated : out.structural.length ? STRUCTURAL : RISK.routine;
  out.eligible = out.risk === STRUCTURAL;
  return out;
}

/**
 * Modo sem `scopeRef` (PR comum): só as regras de CONTEÚDO. Mudança elevada pelo caminho segue para o dono (risk-gate/CODEOWNERS); o
 * gate só reprova o que o caminho não revela (`contentViolations`): Stripe, locale definindo moeda/preço/plano, conteúdo ausente.
 */
export function evaluateContentOnly({ changes } = {}) {
  if (!Array.isArray(changes) || !changes.length) return { risk: RISK.elevated, eligible: false, structural: [], elevated: [{ path: null, reason: "mudanca-vazia" }], routine: [], contentViolations: [] };
  const v = classifyChangeWithContent(changes.map((c) => ({ path: c.path, status: c.status, content: c.head ?? undefined })));
  const contentViolations = v.elevated.filter((e) => CONTENT_REASONS.includes(e.reason));
  return { risk: v.risk, eligible: false, structural: [], elevated: v.elevated, routine: v.routine, contentViolations };
}

/* --------------------------------------------------- structural-gate (base confiável) */

/** Ambiente mínimo do Git do gate: nenhum token, chave ou configuração do usuário chega ao processo. */
export function gateEnv(env = process.env) {
  return { PATH: env.PATH ?? "/usr/bin:/bin", HOME: os.tmpdir(), LANG: "C", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0" };
}

function gitIn(repoRoot, spawn) {
  return (args, { allowFail = false, buffer = false } = {}) => {
    const r = spawn("git", ["--no-pager", ...args], { cwd: repoRoot, env: gateEnv(), encoding: buffer ? "buffer" : "utf8", shell: false, maxBuffer: 16 * 1024 * 1024 });
    if (r.status !== 0 && !allowFail) throw new StructuralError("SG-GIT", args[0]);
    return r;
  };
}

/**
 * Carrega o controle do commit `baseSha` (nunca do head candidato) para um diretório temporário privado e o importa. Devolve o módulo e o
 * hash do controle. Commit ausente, não identificável ou sem algum módulo do controle → StructuralError("SG-CONTROL").
 */
export async function loadTrustedControl({ git, baseSha }) {
  if (typeof baseSha !== "string" || !/^[0-9a-f]{40}$/.test(baseSha)) throw new StructuralError("SG-CONTROL", "base-sha");
  const kind = git(["cat-file", "-t", baseSha], { allowFail: true });
  if (kind.status !== 0 || String(kind.stdout).trim() !== "commit") throw new StructuralError("SG-CONTROL", "base-commit");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oplyra-structural-gate-"));
  fs.chmodSync(dir, 0o700);
  const hash = crypto.createHash("sha256");
  for (const name of CONTROL_MODULES) {
    const r = git(["show", `${baseSha}:scripts/${name}`], { allowFail: true, buffer: true });
    if (r.status !== 0) throw new StructuralError("SG-CONTROL", `ausente:${name}`);
    hash.update(name).update("\0").update(r.stdout).update("\0");
    fs.writeFileSync(path.join(dir, name), r.stdout, { mode: 0o600 });
  }
  const mod = await import(pathToFileURL(path.join(dir, "claude-structural.mjs")).href);
  return { control: mod, controlSha256: hash.digest("hex") };
}

const sha256Of = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

/**
 * `structural-gate`: compara `baseSha` → `headSha` com o controle, o ESCOPO (`docs/harness/scopes/<scopeRef>.json`) e o documento aprovado
 * lidos do commit BASE confiável. Nunca lê o escopo do head, nunca importa nem executa código do head, não recebe escopo do chamador.
 * Sem `scopeRef`: só as regras de conteúdo (evaluateContentOnly). Saída vinculada ao SHA exato (`sha`), ao controle (`controlSha256`), ao
 * escopo (`scopeSha256`) e ao documento (`approvedDocumentSha256`). O resultado não autoriza merge sozinho: `decide` exige o check
 * `structural-gate` verde no mesmo SHA e o runner confere o documento com a autorização contínua.
 */
export async function runStructuralGate({ repoRoot, baseSha, headSha, scopeRef, spawn = spawnSync }) {
  const git = gitIn(repoRoot, spawn);
  const mode = scopeRef === undefined || scopeRef === null ? "content" : STRUCTURAL;
  const base = { schema: GATE_SCHEMA, mode, sha: headSha, baseSha, scopeRef: scopeRef ?? null, scopeSha256: null, approvedDocumentSha256: null };
  try {
    if (typeof headSha !== "string" || !/^[0-9a-f]{40}$/.test(headSha) || headSha === baseSha) throw new StructuralError("SG-HEAD");
    if (mode === STRUCTURAL && (typeof scopeRef !== "string" || !SCOPE_REF_PATTERN.test(scopeRef))) throw new StructuralError("SG-SCOPE-REF");
    const { control, controlSha256 } = await loadTrustedControl({ git, baseSha });
    if (git(["merge-base", "--is-ancestor", baseSha, headSha], { allowFail: true }).status !== 0) throw new StructuralError("SG-CONTROL", "base-nao-ancestral");
    const parts = String(git(["diff", "--name-status", "--no-renames", "-z", baseSha, headSha]).stdout).split("\0").filter(Boolean);
    const changes = [];
    for (let k = 0; k + 1 < parts.length; k += 2) {
      const status = parts[k].startsWith("D") ? "removed" : parts[k].startsWith("A") ? "added" : "modified";
      const p = parts[k + 1];
      const read = (sha) => {
        const r = git(["show", `${sha}:${p}`], { allowFail: true });
        return r.status === 0 ? r.stdout : null;
      };
      changes.push({ path: p, status, base: status !== "added" && /\.(json|sql)$/.test(p) ? read(baseSha) : null, head: status !== "removed" ? read(headSha) : null });
    }
    const files = changes.map((c) => ({ path: c.path, status: c.status }));
    if (mode === "content") {
      if (typeof control.evaluateContentOnly !== "function") throw new StructuralError("SG-CONTROL", "versao-sem-modo-conteudo");
      const verdict = control.evaluateContentOnly({ changes });
      return { ...base, controlSha256, ...verdict, files, conclusion: verdict.contentViolations.length ? "failure" : "success" };
    }
    // escopo e documento aprovado: SOMENTE do commit base
    const rawScope = git(["show", `${baseSha}:${scopeFileOf(scopeRef)}`], { allowFail: true, buffer: true });
    if (rawScope.status !== 0) return { ...base, controlSha256, risk: RISK.elevated, eligible: false, refused: "SC-SCOPE", detail: "escopo-ausente-na-base", structural: [], elevated: [], routine: [], files, conclusion: "failure" };
    let scope;
    try {
      scope = JSON.parse(Buffer.from(rawScope.stdout).toString("utf8"));
    } catch {
      scope = null;
    }
    const docPath = scope?.approvedDocument?.path;
    const doc = typeof docPath === "string" ? git(["show", `${baseSha}:${docPath}`], { allowFail: true, buffer: true }) : null;
    const approvedDocumentSha256 = doc && doc.status === 0 ? sha256Of(doc.stdout) : null;
    const baseMigrations = String(git(["ls-tree", "--name-only", baseSha, "supabase/migrations/"]).stdout).split("\n").filter(Boolean);
    const verdict = control.evaluateStructural({ changes, scope, scopeRef, approvedDocumentSha256, baseMigrations });
    return { ...base, scopeSha256: sha256Of(rawScope.stdout), approvedDocumentSha256, controlSha256, ...verdict, files, conclusion: verdict.risk === RISK.elevated ? "failure" : "success" };
  } catch (e) {
    if (!(e instanceof StructuralError)) throw e;
    return { ...base, controlSha256: null, risk: RISK.elevated, eligible: false, refused: e.code, detail: e.detail ?? null, structural: [], elevated: [], routine: [], files: [], conclusion: "failure" };
  }
}

/* ------------------------------------------------------------------------ CLI */

/**
 * `node scripts/claude-structural.mjs gate --base <sha> --head <sha> [--scope-ref <ref>] [--repo <dir>]`: imprime o resultado em JSON e sai
 * com 0 (`success`), 1 (`failure`) ou 2 (uso). Na CI, este arquivo roda a partir de um worktree do commit BASE; `--repo` aponta o clone.
 */
export async function cli(argv, { write = (s) => process.stdout.write(s), cwd = process.cwd(), spawn = spawnSync } = {}) {
  const [cmd, ...rest] = argv;
  const opts = {};
  for (let k = 0; k < rest.length; k += 2) {
    const [name, value] = [rest[k], rest[k + 1]];
    if (!["--base", "--head", "--scope-ref", "--repo"].includes(name) || value === undefined || name in opts) {
      write(`${JSON.stringify({ error: "uso" })}\n`);
      return 2;
    }
    opts[name] = value;
  }
  if (cmd !== "gate" || !opts["--base"] || !opts["--head"]) {
    write(`${JSON.stringify({ error: "uso: gate --base <sha> --head <sha> [--scope-ref <ref>] [--repo <dir>]" })}\n`);
    return 2;
  }
  const result = await runStructuralGate({ repoRoot: path.resolve(cwd, opts["--repo"] ?? "."), baseSha: opts["--base"], headSha: opts["--head"], scopeRef: opts["--scope-ref"], spawn });
  write(`${JSON.stringify(result)}\n`);
  return result.conclusion === "success" ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = await cli(process.argv.slice(2));
