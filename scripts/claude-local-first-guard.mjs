#!/usr/bin/env node
// Oplyra Local First guard (Developer Harness, CR-031).
//
// DEFESA EM PROFUNDIDADE, NÃO É SANDBOX NEM FRONTEIRA ABSOLUTA DE SEGURANÇA.
// Não é um parser de shell completo: reconhece um conjunto pequeno e fechado de
// formas simples e NEGA todo o resto (falha fechada). Só vale dentro de uma
// sessão do Claude Code que carregue o hook do projeto; invocar `claude`
// diretamente, fora do launcher oficial, não é coberto.
//
// Recusas emitem apenas um código fixo: nunca o comando, argumentos, URLs,
// cabeçalhos ou caminhos recebidos.
//
// Cobertura: escritas (Write/Edit/MultiEdit/NotebookEdit), leituras (Read/Glob/Grep
// e os utilitários Bash de leitura), Bash, WebFetch/WebSearch, Playwright MCP,
// Context7 (somente na manutenção, em modo manual) e qualquer outro MCP (negado).

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const POLICIES = Object.freeze(["autonomous", "maintenance"]);

/** Scripts pnpm permitidos na execução autônoma (lista fechada). */
export const ALLOWED_PNPM_SCRIPTS = Object.freeze([
  "typecheck", "test", "test:db", "test:e2e", "test:harness", "scan:secrets", "build", "verificar",
  "db:start", "db:stop", "db:status", "db:reset", "db:roles", "harness:tools",
]);
/** Scripts pnpm que só a sessão de manutenção pode chamar. */
export const MAINTENANCE_PNPM_SCRIPTS = Object.freeze(["harness:install"]);
/** Scripts que aceitam argumentos de caminho (filtros de teste). */
const SCRIPTS_WITH_PATH_ARGS = new Set(["test"]);
/**
 * Entrega delegada (CR-033): wrappers tipados de Git/GitHub. Só a sessão autônoma os chama (a manutenção nunca),
 * cada um com gramática de argumentos fechada. Git mutável cru e `gh` continuam negados.
 */
export const DELIVERY_PNPM_SCRIPTS = Object.freeze([
  "git:branch", "git:stage", "git:commit", "git:push", "gh:pr-create", "gh:pr-update", "gh:ci-status", "gh:ci-log", "gh:ci-diagnose", "gh:doctor",
]);
/** `gh:ci-log --check <nome>`: só um NOME de verificação; ids numéricos e URLs nunca vêm do agente (o wrapper resolve o job pela API). */
const checkNameArg = (a) => SAFE_TEXT_ARG.test(a) && !/^\d+$/.test(a) && !a.includes("://") && !a.startsWith("/");
const SAFE_TEXT_ARG = /^[A-Za-z0-9 _.,:()/#+'-]{1,120}$/;
const deliveryPathArg = (a) =>
  /^[A-Za-z0-9_@%+=:.,/-]+$/.test(a) && !a.startsWith("-") && a !== "." && !a.split("/").includes("..") && !path.isAbsolute(a);
/** Gramática de argumentos por script de entrega. `flags`: nome → validador; `min`: quantos pares são obrigatórios. */
const DELIVERY_FLAGS = Object.freeze({
  "git:commit": { flags: { "--message-file": deliveryPathArg }, required: ["--message-file"] },
  "gh:pr-create": { flags: { "--title": (a) => SAFE_TEXT_ARG.test(a), "--body-file": deliveryPathArg }, required: ["--title", "--body-file"] },
  "gh:pr-update": { flags: { "--title": (a) => SAFE_TEXT_ARG.test(a), "--body-file": deliveryPathArg, "--comment-file": deliveryPathArg }, required: [], atLeastOne: true },
  "gh:ci-log": { flags: { "--check": (a) => checkNameArg(a) }, required: ["--check"] },
  "gh:ci-diagnose": { flags: { "--diagnosis-file": deliveryPathArg }, required: ["--diagnosis-file"] },
  "gh:ci-status": { flags: { "--wait": (a) => /^\d{1,4}$/.test(a) && Number(a) >= 1 && Number(a) <= 1200 }, required: [] },
});
function deliveryArgsOk(script, extra) {
  if (script === "git:stage") return extra.length >= 1 && extra.length <= 50 && extra.every(deliveryPathArg);
  const grammar = DELIVERY_FLAGS[script];
  if (!grammar) return extra.length === 0; // git:branch, git:push, gh:doctor
  const seen = new Set();
  for (let k = 0; k < extra.length; k += 2) {
    const validator = Object.prototype.hasOwnProperty.call(grammar.flags, extra[k]) ? grammar.flags[extra[k]] : null;
    if (!validator || seen.has(extra[k]) || extra[k + 1] === undefined || !validator(extra[k + 1])) return false;
    seen.add(extra[k]);
  }
  if (grammar.atLeastOne && !seen.size) return false;
  return grammar.required.every((f) => seen.has(f));
}

export const GIT_READONLY = Object.freeze(["status", "diff", "show", "log", "rev-parse", "ls-files", "ls-tree", "cat-file"]);
const GIT_MUTATING = new Set([
  "push", "pull", "fetch", "add", "commit", "checkout", "switch", "reset", "restore", "clean", "merge", "rebase", "tag",
  "branch", "stash", "cherry-pick", "revert", "am", "apply", "rm", "mv", "init", "clone", "remote", "config", "gc", "prune",
  "worktree", "submodule", "update-ref", "symbolic-ref", "filter-branch",
]);

export const PLAYWRIGHT_DENIED = Object.freeze([
  "browser_run_code_unsafe", "browser_evaluate", "browser_file_upload", "browser_drag", "browser_drop",
]);
export const PLAYWRIGHT_ALLOWED = Object.freeze([
  "browser_navigate", "browser_navigate_back", "browser_snapshot", "browser_take_screenshot", "browser_console_messages",
  "browser_network_requests", "browser_network_request", "browser_tabs", "browser_wait_for", "browser_resize", "browser_close",
  "browser_find", "browser_click", "browser_hover", "browser_type", "browser_fill_form", "browser_press_key",
  "browser_select_option", "browser_handle_dialog", "browser_emulate_media",
]);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const LOCAL_PORTS = new Set(["3100", "54421", "54424"]);

const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
const READ_TOOLS = new Set(["Read", "Glob", "Grep"]);
export const CONTEXT7_PREFIX = "mcp__context7__";
export const CONTEXT7_TOOLS = Object.freeze(["resolve-library-id", "query-docs"]);
/** Valor de `permission_mode` que o hook recebe quando o launcher usa `--permission-mode manual`. */
export const MANUAL_HOOK_MODE = "default";

/** Mensagens estáticas por código (sem valores recebidos). */
export const REASONS = Object.freeze({
  "LF-POLICY": "política do guard inválida",
  "LF-INPUT": "entrada do hook inválida",
  "LF-WRITE-NO-PATH": "escrita sem caminho explícito",
  "LF-WRITE-OUTSIDE": "escrita fora do repositório local",
  "LF-WRITE-REFERENCE": "referência somente leitura",
  "LF-WRITE-SECRET": "arquivo local de segredo",
  "LF-WRITE-CONTROL-PLANE": "control plane do harness: exige sessão de manutenção iniciada pelo proprietário",
  "LF-NETWORK-TOOL": "ferramenta de rede não permitida",
  "LF-CMD-EMPTY": "comando vazio",
  "LF-CMD-AMBIGUOUS": "comando ambíguo ou fora das formas reconhecidas",
  "LF-CMD-WRAPPER": "wrapper, atribuição de ambiente ou executável não determinável",
  "LF-CMD-NOT-ALLOWED": "comando fora da allowlist",
  "LF-GIT-MUTATION": "operação Git mutável ou remota",
  "LF-REDIRECT": "redirecionamento para caminho não permitido",
  "LF-PW-TOOL": "ferramenta Playwright não permitida",
  "LF-PW-URL": "navegação Playwright fora dos origins locais",
  "LF-READ-NO-PATH": "leitura sem caminho explícito",
  "LF-READ-OUTSIDE": "leitura fora do repositório local",
  "LF-READ-SECRET": "leitura de segredo, credencial, chave privada ou certificado",
  "LF-READ-PATTERN": "padrão ou caminho de leitura não permitido",
  "LF-RG-OPTION": "opção do rg que contorna ignorados, pesquisa ocultos, segue symlinks ou é desconhecida",
  "LF-MCP-CONTEXT7": "Context7 só é permitido na sessão de manutenção em modo manual",
  "LF-MCP-UNKNOWN": "servidor ou ferramenta MCP não permitido",
});

const allow = () => ({ allowed: true });
const deny = (code) => ({ allowed: false, code, reason: REASONS[code] });

function isMain() {
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
}

export function evaluate({ toolName, toolInput, projectRoot, policy = "autonomous", permissionMode }) {
  if (!POLICIES.includes(policy)) return deny("LF-POLICY");
  const name = String(toolName ?? "");
  const input = toolInput && typeof toolInput === "object" ? toolInput : {};

  if (WRITE_TOOLS.has(name)) {
    return validateWritePath(input.file_path ?? input.notebook_path ?? input.path, projectRoot, policy);
  }
  if (READ_TOOLS.has(name)) return validateReadTool(name, input, projectRoot);
  if (name === "Bash") return classifyBash(String(input.command ?? ""), { projectRoot, policy });
  if (name === "WebFetch" || name === "WebSearch") return deny("LF-NETWORK-TOOL");
  if (name.startsWith("mcp__playwright__")) return validatePlaywright(name.slice("mcp__playwright__".length), input);
  if (name.startsWith(CONTEXT7_PREFIX)) return validateContext7(name.slice(CONTEXT7_PREFIX.length), policy, permissionMode);
  if (name.toLowerCase().startsWith("mcp__")) return deny("LF-MCP-UNKNOWN");
  return allow();
}

/** Context7 faz egress para um serviço externo: só na manutenção, em modo manual, e só as duas ferramentas conhecidas. */
function validateContext7(tool, policy, permissionMode) {
  if (policy !== "maintenance" || permissionMode !== MANUAL_HOOK_MODE) return deny("LF-MCP-CONTEXT7");
  return CONTEXT7_TOOLS.includes(tool) ? allow() : deny("LF-MCP-UNKNOWN");
}

/* ------------------------------------------------------------------ caminhos */

/** Resolve o caminho real do maior prefixo existente (segue symlinks) e recompõe o restante. */
function realish(p) {
  let cur = path.resolve(p);
  const rest = [];
  for (;;) {
    try {
      const real = fs.realpathSync(cur);
      return path.join(real, ...rest.reverse());
    } catch {
      const parent = path.dirname(cur);
      if (parent === cur) return path.resolve(p);
      rest.push(path.basename(cur));
      cur = parent;
    }
  }
}

function locate(candidate, projectRoot) {
  const root = realish(projectRoot);
  const absolute = path.resolve(projectRoot, String(candidate));
  const resolved = realish(absolute);
  const relative = path.relative(root, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return { inside: false };
  // `literal`: o mesmo caminho sem resolver symlinks (um alias inofensivo para um segredo e um nome de segredo para um alvo inofensivo são ambos tratados)
  const lit = path.relative(path.resolve(projectRoot), absolute);
  const literal = lit === ".." || lit.startsWith(`..${path.sep}`) || path.isAbsolute(lit) ? null : lit.split(path.sep).join("/").toLowerCase();
  return { inside: true, rel: relative.split(path.sep).join("/").toLowerCase(), literal };
}

/* ------------------------------------------------------------------- leituras */

const SECRET_DIRS = new Set([".ssh", ".aws", ".gnupg", ".kube", ".docker"]);
const SECRET_BASENAMES = new Set([".npmrc", ".netrc", "_netrc", ".pgpass", ".pypirc", ".git-credentials", ".htpasswd"]);
const SECRET_EXT = /\.(pem|key|p12|pfx|jks|keystore|crt|cer|der|csr|p7b|p7c|gpg|asc)$/;

/** `rel`: caminho relativo ao repositório, em minúsculas e com `/`. Retorna true para segredos, credenciais, chaves privadas e certificados. */
export function isSensitiveRel(rel) {
  if (rel === ".git/config") return true;
  const segs = rel.split("/");
  const base = segs[segs.length - 1] ?? "";
  if (segs.some((s) => SECRET_DIRS.has(s))) return true;
  if (base.startsWith(".env")) return base !== ".env.example";
  if (SECRET_BASENAMES.has(base) || SECRET_EXT.test(base)) return true;
  if (/^id_(rsa|dsa|ecdsa|ed25519)(?!.*\.pub$)/.test(base)) return true;
  if (/^\.?credentials?(\..+)?$/.test(base) || /[-_.]credentials?\.(json|ya?ml|txt|ini|toml)$/.test(base) || /^service[-_]account.*\.json$/.test(base)) return true;
  return false;
}

/** Nomes sensíveis citados em um padrão/glob (Glob, Grep e `rg -g`). */
const SENSITIVE_TOKEN = /(^|[^a-z0-9])(\.env(?!\.example(?![a-z0-9]))|\.npmrc|\.netrc|\.pgpass|\.pypirc|\.htpasswd|\.git-credentials|\.ssh|\.aws|\.gnupg|\.kube|\.docker|credentials?|service[-_]account|id_(rsa|dsa|ecdsa|ed25519))|\.(pem|key|p12|pfx|jks|keystore|crt|cer|der|csr|p7b|p7c|gpg|asc)(?![a-z0-9])|\.git\/config/;

/** Expande `{a,b}` (aninhado ou em sequência) para que `*.{pem,key}` seja examinado como `*.pem` e `*.key`. null se a expansão passar do limite. */
function expandBraces(text, budget = { left: 64 }) {
  const m = /\{([^{}]*)\}/.exec(text);
  if (!m) return [text];
  const out = [];
  for (const alt of m[1].split(",")) {
    budget.left -= 1;
    if (budget.left < 0) return null;
    const inner = expandBraces(text.slice(0, m.index) + alt + text.slice(m.index + m[0].length), budget);
    if (!inner) return null;
    out.push(...inner);
  }
  return out;
}

function screenGlob(pattern, { strictHidden }) {
  if (typeof pattern !== "string" || !pattern || pattern.includes("\0")) return deny("LF-READ-PATTERN");
  const body = pattern.replace(/^!+/, "");
  if (body.startsWith("/") || body.startsWith("~") || /^[A-Za-z]:/.test(body) || body.includes("\\")) return deny("LF-READ-PATTERN");
  const segs = body.split("/");
  if (segs.includes("..")) return deny("LF-READ-PATTERN");
  // `{a,b}` pode esconder `..` ou nomes: um segmento de alternativa também é examinado
  if (/\{[^}]*\.\.[^}]*\}/.test(body)) return deny("LF-READ-PATTERN");
  const variants = expandBraces(body.toLowerCase());
  if (!variants) return deny("LF-READ-PATTERN");
  if (variants.some((v) => SENSITIVE_TOKEN.test(v))) return deny("LF-READ-SECRET");
  // `--glob` do rg sobrepõe a regra de ocultos e de ignorados: qualquer segmento oculto é recusado
  if (strictHidden && segs.some((s) => s.startsWith(".") && s !== ".")) return deny("LF-READ-PATTERN");
  // `.*`, `.e*`, `.?` etc. alcançariam arquivos ocultos por curinga
  if (segs.some((s) => /^\.[^/]*[*?[{]/.test(s))) return deny("LF-READ-PATTERN");
  return allow();
}

/** Caminho lido por ferramenta ou por utilitário Bash: dentro do repositório (após symlinks), sem segredos. */
function checkReadPath(candidate, projectRoot) {
  const text = typeof candidate === "string" ? candidate : "";
  if (!text || text.includes("\0")) return deny("LF-READ-NO-PATH");
  if (text.startsWith("~")) return deny("LF-READ-OUTSIDE");
  const where = locate(text, projectRoot);
  if (!where.inside) return deny("LF-READ-OUTSIDE");
  if (isSensitiveRel(where.rel) || (where.literal !== null && isSensitiveRel(where.literal))) return deny("LF-READ-SECRET");
  return allow();
}

function validateReadTool(name, input, projectRoot) {
  if (name === "Read") {
    return checkReadPath(input.file_path ?? input.path, projectRoot);
  }
  const base = input.path;
  if (base !== undefined && base !== null) {
    const r = checkReadPath(base, projectRoot);
    if (!r.allowed) return r;
  }
  if (name === "Glob") {
    const p = screenGlob(input.pattern, { strictHidden: false });
    if (!p.allowed) return p;
    // o padrão também é tratado como caminho relativo quando não há curingas
    return allow();
  }
  // Grep: `pattern` é uma regex de conteúdo; `glob` restringe arquivos e sobrepõe ignorados
  if (input.glob !== undefined && input.glob !== null) {
    const g = screenGlob(input.glob, { strictHidden: true });
    if (!g.allowed) return g;
  }
  return allow();
}

const ALWAYS_PROTECTED_EXACT = new Set(["docs/product/marketing-ops/00-documento-transicao.md"]);
const CONTROL_PLANE_EXACT = new Set([
  ".mcp.json", "claude.md", "agents.md", ".agents", ".codex", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml",
  "docs/harness/development-tools.md", "docs/harness/autonomous-build.md", ".claude", ".git",
]);
// `.git/` (CR-033): hooks, `config` (filter, diff, alias, core.*) e atributos executam código quando o wrapper roda `git`; o agente nunca os escreve
const CONTROL_PLANE_PREFIX = [".claude/", ".agents/", ".codex/", "tools/developer-harness/", "scripts/claude-", "scripts/codex-", ".github/", ".git/"];

export function isControlPlane(rel) {
  return CONTROL_PLANE_EXACT.has(rel) || CONTROL_PLANE_PREFIX.some((p) => rel.startsWith(p)) || /(^|\/)(agents|claude)\.md$/.test(rel) || /(^|\/)\.(agents|codex|claude)(\/|$)/.test(rel);
}
/** `sources/` e a referência protegida: nunca entram em uma entrega delegada. `rel`: relativo, minúsculo, com `/`. */
export function isProtectedReference(rel) {
  return rel === "sources" || rel.startsWith("sources/") || ALWAYS_PROTECTED_EXACT.has(rel);
}
function isSecretFile(rel) {
  const base = rel.split("/").pop() ?? "";
  return base === ".env" || (base.startsWith(".env.") && !base.endsWith(".example"));
}

function validateWritePath(candidate, projectRoot, policy) {
  if (!candidate) return deny("LF-WRITE-NO-PATH");
  const where = locate(candidate, projectRoot);
  if (!where.inside) return deny("LF-WRITE-OUTSIDE");
  const rel = where.rel;
  if (rel === "sources" || rel.startsWith("sources/") || ALWAYS_PROTECTED_EXACT.has(rel)) return deny("LF-WRITE-REFERENCE");
  if (isSecretFile(rel)) return deny("LF-WRITE-SECRET");
  if (policy !== "maintenance" && isControlPlane(rel)) return deny("LF-WRITE-CONTROL-PLANE");
  return allow();
}

/* --------------------------------------------------------------------- Bash */

const SAFE_PATH_ARG = /^[A-Za-z0-9_@%+=:.,/-]+$/;

/**
 * Léxico mínimo. Não interpreta o shell: reconhece palavras, aspas simples e
 * duplas, os operadores ; && || | \n, redirecionamentos e here-documents, e
 * recusa (null) tudo o que não consegue classificar com certeza.
 */
function lex(command) {
  const segments = [];
  let seg = { words: [], redirs: [] };
  const flush = () => {
    if (seg.words.length || seg.redirs.length) segments.push(seg);
    seg = { words: [], redirs: [] };
  };
  const heredocs = [];
  let pendingOperator = false;
  // operador entre comandos: exige um comando à esquerda (recusa ';;', '&& &&', '| |' e afins)
  const operator = () => {
    if (!seg.words.length && !seg.redirs.length) return false;
    flush();
    pendingOperator = true;
    return true;
  };
  let i = 0;
  const n = command.length;

  const readWord = () => {
    // lê uma palavra a partir de i; retorna {text, quoted} ou null (ambíguo)
    let text = "";
    let quoted = false;
    let started = false;
    while (i < n) {
      const c = command[i];
      if (c === "'") {
        const j = command.indexOf("'", i + 1);
        if (j < 0) return null;
        text += command.slice(i + 1, j);
        i = j + 1;
        quoted = true;
        started = true;
      } else if (c === '"') {
        let j = i + 1;
        let buf = "";
        for (;;) {
          if (j >= n) return null;
          const d = command[j];
          if (d === '"') break;
          if (d === "\\") {
            const e = command[j + 1];
            if (e === undefined || e === "\n") return null;
            if ('"\\$`'.includes(e)) buf += e;
            else buf += d + e;
            j += 2;
            continue;
          }
          if (d === "`" || d === "$") return null; // substituição/expansão dentro de aspas duplas
          buf += d;
          j += 1;
        }
        text += buf;
        i = j + 1;
        quoted = true;
        started = true;
      } else if (c === "\\") {
        const e = command[i + 1];
        if (e === undefined || e === "\n") return null;
        text += e;
        i += 2;
        started = true;
      } else if (c === "`" || c === "$") {
        return null;
      } else if (/\s/.test(c) || ";&|<>()".includes(c)) {
        break;
      } else if (c === "{" || c === "}") {
        return null;
      } else {
        text += c;
        i += 1;
        started = true;
      }
    }
    return started ? { text, quoted } : null;
  };

  while (i < n) {
    const c = command[i];
    if (c === "\n") {
      flush();
      i += 1;
      // corpo de here-document: pulado por inteiro, nunca analisado como comando
      while (heredocs.length) {
        const h = heredocs.shift();
        for (;;) {
          if (i >= n) return null; // here-document sem terminador
          let j = command.indexOf("\n", i);
          if (j < 0) j = n;
          let line = command.slice(i, j);
          i = Math.min(j + 1, n);
          if (h.dash) line = line.replace(/^\t+/, "");
          if (line === h.delim) break;
        }
      }
      continue;
    }
    if (c === " " || c === "\t" || c === "\r") {
      i += 1;
      continue;
    }
    if (c === ";") {
      if (!operator()) return null;
      i += 1;
      continue;
    }
    if (c === "&") {
      if (command[i + 1] === "&") {
        if (!operator()) return null;
        i += 2;
        continue;
      }
      if (command[i + 1] === ">") {
        // &> arquivo
        i += 2;
        if (command[i] === ">") i += 1;
        while (command[i] === " ") i += 1;
        const w = readWord();
        if (!w) return null;
        seg.redirs.push({ kind: "write", target: w.text });
        continue;
      }
      return null; // segundo plano
    }
    if (c === "|") {
      if (!operator()) return null;
      i += command[i + 1] === "|" || command[i + 1] === "&" ? 2 : 1;
      continue;
    }
    if (c === "(" || c === ")") return null;
    if (c === "#") return null;
    if (c === "<" || c === ">") {
      const op = command.slice(i, i + 3);
      if (op === "<<<") {
        i += 3;
        while (command[i] === " ") i += 1;
        if (!readWord()) return null;
        continue;
      }
      if (op.startsWith("<<")) {
        i += 2;
        let dash = false;
        if (command[i] === "-") {
          dash = true;
          i += 1;
        }
        while (command[i] === " ") i += 1;
        const w = readWord();
        if (!w || !w.text) return null;
        heredocs.push({ delim: w.text, dash });
        continue;
      }
      if (op.startsWith("<(") || op.startsWith(">(")) return null;
      if (op.startsWith(">&") || op.startsWith("<&")) {
        i += 2;
        const w = readWord();
        if (!w || !/^(\d+|-)$/.test(w.text)) return null;
        continue;
      }
      const write = c === ">";
      i += op.startsWith(">>") ? 2 : 1;
      while (command[i] === " ") i += 1;
      const w = readWord();
      if (!w) return null;
      seg.redirs.push({ kind: write ? "write" : "read", target: w.text });
      continue;
    }
    // descritor numérico colado a um redirecionamento (2>, 1>>, 0<)
    const fd = /^(\d+)([<>])/.exec(command.slice(i, i + 4));
    if (fd && seg.words.length >= 0 && (i === 0 || /[\s;&|]/.test(command[i - 1]))) {
      i += fd[1].length;
      continue;
    }
    const w = readWord();
    if (!w) return null;
    seg.words.push(w);
    pendingOperator = false;
  }
  if (heredocs.length || pendingOperator) return null; // here-document sem corpo ou operador sem comando à direita
  flush();
  return segments;
}

function fileArgsOk(args) {
  return args.every((a) => a === "--" || !a.startsWith("-") || a === "-");
}

/**
 * Caminhos que um utilitário lerá. O shell expandiria `~` e curingas, o que o guard não
 * consegue prever: caminhos com curinga são recusados. `-` (stdin) é aceito.
 */
function checkPathArgs(paths, ctx) {
  for (const p of paths) {
    if (p === "-" || p === "--") continue;
    if (/[*?[]/.test(p)) return deny("LF-READ-PATTERN");
    const r = checkReadPath(p, ctx.projectRoot);
    if (!r.allowed) return r;
  }
  return allow();
}

/* rg: lista fechada de opções. Toda opção fora dela (ocultos, --no-ignore*, -u, seguir symlinks, --pre, -z, arquivos de ignore…) é recusada. */
const RG_FLAG_LONG = new Set([
  "files", "files-with-matches", "files-without-match", "count", "count-matches", "line-number", "no-line-number", "ignore-case", "smart-case",
  "case-sensitive", "word-regexp", "line-regexp", "fixed-strings", "invert-match", "no-heading", "heading", "with-filename", "no-filename",
  "no-messages", "quiet", "only-matching", "column", "no-column", "multiline", "vimgrep", "trim",
]);
const RG_VALUE_LONG = new Set(["glob", "iglob", "type", "type-not", "regexp", "max-count", "after-context", "before-context", "context", "max-depth"]);
const RG_FLAG_SHORT = new Set(["n", "N", "i", "S", "s", "w", "x", "l", "c", "v", "F", "H", "I", "o", "q", "U"]);
const RG_VALUE_SHORT = new Set(["g", "t", "T", "e", "m", "A", "B", "C", "d"]);
const RG_GLOB_OPTS = new Set(["glob", "iglob", "g"]);

function classifyRg(args, ctx) {
  const values = [];
  const positionals = [];
  let explicitPattern = false;
  let filesMode = false;
  const optionValue = (name, value) => {
    if (RG_GLOB_OPTS.has(name)) {
      const r = screenGlob(value, { strictHidden: true });
      if (!r.allowed) return r;
    }
    if (name === "e" || name === "regexp") explicitPattern = true;
    if (/^(m|A|B|C|d|max-count|after-context|before-context|context|max-depth)$/.test(name) && !/^\d+$/.test(value)) return deny("LF-RG-OPTION");
    values.push(value);
    return null;
  };
  for (let k = 0; k < args.length; k += 1) {
    const a = args[k];
    if (a === "--") {
      positionals.push(...args.slice(k + 1));
      break;
    }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      const name = a.slice(2, eq < 0 ? undefined : eq);
      if (name === "color" && eq >= 0 && a.slice(eq + 1) === "never") continue;
      if (RG_FLAG_LONG.has(name) && eq < 0) {
        if (name === "files") filesMode = true;
        continue;
      }
      if (!RG_VALUE_LONG.has(name)) return deny("LF-RG-OPTION");
      const value = eq >= 0 ? a.slice(eq + 1) : args[(k += 1)];
      if (value === undefined) return deny("LF-RG-OPTION");
      const bad = optionValue(name, value);
      if (bad) return bad;
      continue;
    }
    if (a.startsWith("-") && a !== "-") {
      for (let c = 1; c < a.length; c += 1) {
        const ch = a[c];
        if (RG_FLAG_SHORT.has(ch)) continue;
        if (!RG_VALUE_SHORT.has(ch)) return deny("LF-RG-OPTION");
        const rest = a.slice(c + 1);
        const value = rest || args[(k += 1)];
        if (value === undefined) return deny("LF-RG-OPTION");
        const bad = optionValue(ch, value);
        if (bad) return bad;
        break;
      }
      continue;
    }
    positionals.push(a);
  }
  // sem -e/--regexp nem --files, o primeiro posicional é o padrão; os demais são caminhos
  const paths = explicitPattern || filesMode ? positionals : positionals.slice(1);
  return checkPathArgs(paths, ctx);
}

const FIND_START_BLOCKED = new Set(["-L", "-H", "-P"]);
const FIND_EXPR_BLOCKED = new Set(["-follow", "-newer", "-anewer", "-cnewer", "-samefile", "-files0-from", "-fprint", "-fprint0", "-fprintf", "-fls"]);

function classifyFind(args, ctx) {
  const banned = new Set(["-delete", "-exec", "-execdir", "-ok", "-okdir", "-fprint", "-fprint0", "-fprintf", "-fls"]);
  if (args.some((a) => banned.has(a))) return deny("LF-CMD-NOT-ALLOWED");
  const starts = [];
  let k = 0;
  for (; k < args.length; k += 1) {
    const a = args[k];
    if (FIND_START_BLOCKED.has(a)) return deny("LF-CMD-NOT-ALLOWED"); // -L/-H seguem symlinks
    if (a.startsWith("-") || a === "!") break;
    starts.push(a);
  }
  if (args.slice(k).some((a) => FIND_EXPR_BLOCKED.has(a))) return deny("LF-CMD-NOT-ALLOWED");
  return checkPathArgs(starts, ctx);
}

const RULES = {
  pnpm(args, ctx) {
    const script = args[0];
    if (!script || script.startsWith("-")) return deny("LF-CMD-NOT-ALLOWED");
    if (DELIVERY_PNPM_SCRIPTS.includes(script)) {
      return ctx.policy === "autonomous" && deliveryArgsOk(script, args.slice(1)) ? allow() : deny("LF-CMD-NOT-ALLOWED");
    }
    const permitted = ALLOWED_PNPM_SCRIPTS.includes(script) || (ctx.policy === "maintenance" && MAINTENANCE_PNPM_SCRIPTS.includes(script));
    if (!permitted) return deny("LF-CMD-NOT-ALLOWED");
    const extra = args.slice(1);
    if (!extra.length) return allow();
    if (!SCRIPTS_WITH_PATH_ARGS.has(script)) return deny("LF-CMD-NOT-ALLOWED");
    for (const a of extra) {
      if (/^--reporter=(default|verbose|dot|json)$/.test(a) || a === "--silent") continue;
      if (a.startsWith("-") || !SAFE_PATH_ARG.test(a) || a.split("/").includes("..") || path.isAbsolute(a)) return deny("LF-CMD-NOT-ALLOWED");
    }
    return allow();
  },
  git(args) {
    let k = 0;
    while (args[k] === "--no-pager") k += 1;
    const sub = args[k];
    if (!sub) return deny("LF-CMD-NOT-ALLOWED");
    if (sub.startsWith("-")) return deny("LF-GIT-MUTATION"); // -C, -c, --git-dir, --work-tree, --namespace, --exec-path…
    if (GIT_MUTATING.has(sub)) return deny("LF-GIT-MUTATION");
    if (!GIT_READONLY.includes(sub)) return deny("LF-CMD-NOT-ALLOWED");
    for (const a of args.slice(k + 1)) {
      // --no-index compara arquivos arbitrários do disco, fora do repositório
      if (/^--output(=|$)/.test(a) || a === "--ext-diff" || a === "--textconv" || /^--exec-path/.test(a)) return deny("LF-GIT-MUTATION");
      if (a === "--no-index") return deny("LF-CMD-NOT-ALLOWED");
    }
    return allow();
  },
  rg(args, ctx) {
    return classifyRg(args, ctx);
  },
  sed(args, ctx) {
    if (args[0] !== "-n") return deny("LF-CMD-NOT-ALLOWED");
    if (!/^(\d+(,(\d+|\$))?|\$)p$/.test(args[1] ?? "")) return deny("LF-CMD-NOT-ALLOWED");
    const files = args.slice(2);
    return fileArgsOk(files) ? checkPathArgs(files, ctx) : deny("LF-CMD-NOT-ALLOWED");
  },
  shasum(args, ctx) {
    let k = 0;
    if (args[0] === "-a") {
      if (!/^(1|224|256|384|512)$/.test(args[1] ?? "")) return deny("LF-CMD-NOT-ALLOWED");
      k = 2;
    }
    const files = args.slice(k);
    return fileArgsOk(files) ? checkPathArgs(files, ctx) : deny("LF-CMD-NOT-ALLOWED");
  },
  wc(args, ctx) {
    if (!args.every((a) => /^-[lwcmL]+$/.test(a) || !a.startsWith("-"))) return deny("LF-CMD-NOT-ALLOWED");
    return checkPathArgs(args.filter((a) => !a.startsWith("-")), ctx);
  },
  head(args, ctx) {
    return headTail(args, ctx);
  },
  tail(args, ctx) {
    return headTail(args, ctx);
  },
  ls(args, ctx) {
    // -L/-H desreferenciam symlinks na listagem
    if (!args.every((a) => (/^-[A-Za-z1]+$/.test(a) && !/[LH]/.test(a)) || a === "--color=never" || !a.startsWith("-"))) return deny("LF-CMD-NOT-ALLOWED");
    return checkPathArgs(args.filter((a) => !a.startsWith("-")), ctx);
  },
  pwd(args) {
    return args.every((a) => a === "-L" || a === "-P") ? allow() : deny("LF-CMD-NOT-ALLOWED");
  },
  find(args, ctx) {
    return classifyFind(args, ctx);
  },
};

function headTail(args, ctx) {
  const files = [];
  for (let k = 0; k < args.length; k += 1) {
    const a = args[k];
    if (!a.startsWith("-") || a === "-") {
      files.push(a);
      continue;
    }
    if (a === "-n" || a === "-c") {
      if (!/^\+?\d+$/.test(args[k + 1] ?? "")) return deny("LF-CMD-NOT-ALLOWED");
      k += 1;
      continue;
    }
    if (/^-\d+$/.test(a) || /^-[nc]\+?\d+$/.test(a) || /^-[qv]+$/.test(a) || /^--(lines|bytes)=\+?\d+$/.test(a)) continue;
    return deny("LF-CMD-NOT-ALLOWED"); // inclui -f, -F, --follow, --pid, --retry
  }
  return checkPathArgs(files, ctx);
}

const WRAPPERS = new Set([
  "env", "command", "builtin", "sudo", "nohup", "time", "nice", "xargs", "exec", "eval", "source", ".", "alias", "unalias",
  "sh", "bash", "zsh", "dash", "ksh", "fish", "csh", "tcsh", "watch", "timeout", "setsid", "stdbuf", "script", "chroot",
]);

export function classifyBash(command, { projectRoot, policy = "autonomous" } = {}) {
  if (!POLICIES.includes(policy)) return deny("LF-POLICY");
  if (typeof command !== "string" || !command.trim()) return deny("LF-CMD-EMPTY");
  const segments = lex(command);
  if (!segments || !segments.length) return deny("LF-CMD-AMBIGUOUS");

  for (const seg of segments) {
    if (!seg.words.length) return deny("LF-CMD-AMBIGUOUS");
    const [first, ...rest] = seg.words;
    if (first.quoted || first.text.includes("/")) return deny("LF-CMD-WRAPPER");
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(first.text)) return deny("LF-CMD-WRAPPER");
    if (WRAPPERS.has(first.text)) return deny("LF-CMD-WRAPPER");
    const rule = RULES[first.text];
    if (!rule) return deny("LF-CMD-NOT-ALLOWED");
    const verdict = rule(rest.map((w) => w.text), { policy, projectRoot });
    if (!verdict.allowed) return verdict;

    for (const r of seg.redirs) {
      if (r.target === "/dev/null") continue;
      if (r.target.startsWith("~") || /[*?[]/.test(r.target)) return deny("LF-REDIRECT");
      const where = locate(r.target, projectRoot);
      if (!where.inside) return deny("LF-REDIRECT");
      if (r.kind === "read" && (isSensitiveRel(where.rel) || (where.literal !== null && isSensitiveRel(where.literal)))) return deny("LF-READ-SECRET");
      if (r.kind === "write") {
        const rel = where.rel;
        if (rel === "sources" || rel.startsWith("sources/") || ALWAYS_PROTECTED_EXACT.has(rel) || isSecretFile(rel)) return deny("LF-REDIRECT");
        if (policy !== "maintenance" && isControlPlane(rel)) return deny("LF-REDIRECT");
      }
    }
  }
  return allow();
}

/* --------------------------------------------------------------- Playwright */

function validatePlaywright(tool, input) {
  if (PLAYWRIGHT_DENIED.includes(tool) || !PLAYWRIGHT_ALLOWED.includes(tool)) return deny("LF-PW-TOOL");
  for (const [key, value] of Object.entries(input)) {
    if (!/url/i.test(key) || typeof value !== "string") continue;
    if (value === "about:blank") continue;
    let url;
    try {
      url = new URL(value);
    } catch {
      return deny("LF-PW-URL");
    }
    if (!["http:", "https:"].includes(url.protocol) || !LOCAL_HOSTS.has(url.hostname) || !LOCAL_PORTS.has(url.port)) return deny("LF-PW-URL");
  }
  return allow();
}

async function readJsonFromStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    process.stderr.write("Oplyra Local First: LF-INPUT (entrada do hook inválida)\n");
    process.exit(2);
  }
}

if (isMain()) {
  const policyArg = process.argv.find((a) => a.startsWith("--policy="));
  const policy = policyArg ? policyArg.slice("--policy=".length) : "autonomous";
  const input = await readJsonFromStdin();
  const projectRoot = path.resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());
  const decision = evaluate({
    toolName: String(input.tool_name ?? ""),
    toolInput: input.tool_input ?? {},
    projectRoot,
    policy,
    permissionMode: typeof input.permission_mode === "string" ? input.permission_mode : undefined,
  });
  if (!decision.allowed) {
    process.stderr.write(`Oplyra Local First: ${decision.code} (${decision.reason})\n`);
    process.exit(2);
  }
}
