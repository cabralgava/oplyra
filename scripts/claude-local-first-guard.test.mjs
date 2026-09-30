import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  ALLOWED_PNPM_SCRIPTS, GIT_READONLY, PLAYWRIGHT_ALLOWED, PLAYWRIGHT_DENIED, REASONS, classifyBash, evaluate, isControlPlane,
} from "./claude-local-first-guard.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const root = "/workspace/oplyra";
const bash = (command, policy = "autonomous") => evaluate({ toolName: "Bash", toolInput: { command }, projectRoot: root, policy });
const write = (file, policy = "autonomous", toolName = "Write") => evaluate({ toolName, toolInput: { file_path: file }, projectRoot: root, policy });
const pw = (tool, input = {}) => evaluate({ toolName: `mcp__playwright__${tool}`, toolInput: input, projectRoot: root });

function assertAllowed(command, policy) {
  const r = bash(command, policy);
  assert.equal(r.allowed, true, `deveria permitir: ${command} (${r.code})`);
}
function assertDenied(command, code, policy) {
  const r = bash(command, policy);
  assert.equal(r.allowed, false, `deveria negar: ${command}`);
  if (code) assert.equal(r.code, code, command);
}

/* ------------------------------------------------------------------ escrita */

test("permite edição normal dentro do repositório", () => {
  for (const f of ["apps/web/page.tsx", "/workspace/oplyra/packages/core/src/x.ts", "docs/product/marketing-ops/13-ai-model-routing-finops.md", "test-results/x.txt"]) {
    assert.equal(write(f).allowed, true, f);
  }
  assert.equal(write("apps/web/page.tsx", "autonomous", "Edit").allowed, true);
  assert.equal(write("apps/web/page.tsx", "autonomous", "MultiEdit").allowed, true);
});

test("nega escrita fora do repositório, referência, secrets e sources", () => {
  const cases = [
    ["/workspace/outside.txt", "LF-WRITE-OUTSIDE"], ["../outside.txt", "LF-WRITE-OUTSIDE"], ["/etc/passwd", "LF-WRITE-OUTSIDE"],
    ["docs/product/marketing-ops/00-documento-transicao.md", "LF-WRITE-REFERENCE"], ["sources/a.md", "LF-WRITE-REFERENCE"],
    [".env", "LF-WRITE-SECRET"], [".env.local", "LF-WRITE-SECRET"], ["apps/web/.env.production", "LF-WRITE-SECRET"],
  ];
  for (const [f, code] of cases) {
    const r = write(f);
    assert.equal(r.allowed, false, f);
    assert.equal(r.code, code, f);
  }
  assert.equal(write(".env.example").allowed, true);
  assert.equal(evaluate({ toolName: "Write", toolInput: {}, projectRoot: root }).code, "LF-WRITE-NO-PATH");
});

test("control plane: protegido para o agente, editável somente na sessão de manutenção", () => {
  const plane = [
    ".claude/settings.json", ".claude/settings.local.json", ".claude/skills/x/SKILL.md", ".mcp.json", "CLAUDE.md", "package.json", "pnpm-lock.yaml",
    "pnpm-workspace.yaml", "tools/developer-harness/package.json", "tools/developer-harness/pnpm-lock.yaml", "scripts/claude-local-first-guard.mjs",
    "scripts/claude-launch.mjs", ".github/workflows/ci.yml", "docs/harness/DEVELOPMENT-TOOLS.md", "docs/harness/AUTONOMOUS-BUILD.md",
    "claude.MD", ".CLAUDE/settings.json", "./scripts/../CLAUDE.md",
  ];
  for (const f of plane) {
    assert.equal(write(f).code, "LF-WRITE-CONTROL-PLANE", f);
    assert.equal(write(f, "maintenance").allowed, true, `manutenção: ${f}`);
  }
  assert.equal(isControlPlane("scripts/claude-x.mjs"), true);
  assert.equal(isControlPlane("scripts/db-guard.sh"), false);
  // não é control plane: manifests de pacotes do produto e scripts comuns
  for (const f of ["apps/web/package.json", "packages/core/package.json", "scripts/db-guard.sh", "docs/harness/ESTADO.md"]) assert.equal(write(f).allowed, true, f);
  // a referência protegida e os secrets continuam protegidos na manutenção
  assert.equal(write("docs/product/marketing-ops/00-documento-transicao.md", "maintenance").allowed, false);
  assert.equal(write(".env", "maintenance").allowed, false);
});

test("symlink para fora do repositório não contorna a barreira", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "oplyra-guard-"));
  const repo = path.join(tmp, "repo");
  const outside = path.join(tmp, "outside");
  fs.mkdirSync(repo);
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(repo, "link"));
  fs.writeFileSync(path.join(repo, "CLAUDE.md"), "x");
  fs.symlinkSync(path.join(repo, "CLAUDE.md"), path.join(repo, "alias.md"));
  const at = (f) => evaluate({ toolName: "Write", toolInput: { file_path: f }, projectRoot: repo });
  assert.equal(at("link/x.txt").code, "LF-WRITE-OUTSIDE");
  assert.equal(at("alias.md").code, "LF-WRITE-CONTROL-PLANE");
  assert.equal(at("normal.txt").allowed, true);
});

/* --------------------------------------------------------------------- Bash */

test("permite os scripts pnpm enumerados e utilitários somente leitura", () => {
  for (const s of ALLOWED_PNPM_SCRIPTS) assertAllowed(`pnpm ${s}`);
  for (const c of [
    "pnpm test test/contracts", "pnpm test packages/infra/test/config-environment.test.ts --reporter=dot", "pnpm test --silent",
    "git status", "git status --short", "git diff --check", "git diff --cached --name-only", "git show HEAD:package.json", "git log --oneline -3",
    "git rev-parse HEAD", "git ls-files docs", "git ls-tree -r HEAD", "git cat-file -p HEAD", "git --no-pager log -1",
    "rg -n \"docker|curl|eval\" docs", "rg --files -g '*.md' docs", "sed -n '1,40p' README.md", "sed -n '$p' README.md",
    "shasum -a 256 package.json", "shasum package.json README.md", "wc -l README.md", "head -n 20 README.md", "tail -n 5 README.md", "head -5 README.md",
    "ls -la docs", "pwd", "find . -name '*.md' -maxdepth 2", "find docs -type f",
    "git diff | head -20", "git status && git diff --check", "git log -1 ; pwd", "pnpm test:harness 2>&1 | tail -5", "pnpm verificar > test-results/verificar.log 2>&1",
  ]) assertAllowed(c);
});

test("nega comandos fora da allowlist, mesmo inofensivos", () => {
  for (const c of ["cat README.md", "echo oi", "cd docs", "python3 x.py", "node x.mjs", "make", "touch a", "cp a b", "mv a b", "rm a", "mkdir x", "chmod +x a", "true", "test -f a"]) {
    assertDenied(c, null);
  }
  assertDenied("", "LF-CMD-EMPTY");
  assertDenied("   ", "LF-CMD-EMPTY");
});

test("git: somente leitura; mutáveis e remotos negados, também com opções antes do subcomando", () => {
  for (const sub of ["push", "pull", "fetch", "add", "commit", "checkout", "switch", "reset", "restore", "clean", "merge", "rebase", "tag", "branch", "stash", "clone", "remote"]) {
    assertDenied(`git ${sub}`, "LF-GIT-MUTATION");
    assertDenied(`git -C /tmp ${sub}`, "LF-GIT-MUTATION");
    assertDenied(`git -c core.x=y ${sub}`, "LF-GIT-MUTATION");
    assertDenied(`git --git-dir=.git ${sub}`, "LF-GIT-MUTATION");
  }
  for (const c of [
    "git -C . push origin main", "git -C ../outro status", "git -c color.ui=always diff", "git --git-dir=x --work-tree=y log", "git --work-tree=. status",
    "git --namespace=n log", "git --exec-path=/x status", "git commit -m x", "git add -A", "git checkout -- .", "git reset --hard", "git push --force",
    "git diff --output=out.txt", "git log --output out.txt", "git show --textconv HEAD:x", "git diff --ext-diff",
  ]) assertDenied(c, null);
  assert.ok(GIT_READONLY.every((s) => !["push", "add", "commit"].includes(s)));
});

test("rm e wrappers: variantes de opções, wrappers e comandos que escondem o executável", () => {
  for (const c of [
    "rm -rf x", "rm -fr x", "rm -Rf x", "rm -r -f x", "rm -f -r x", "rm --recursive --force x", "rm -r x", "rm -f x", "rm x", "rm --no-preserve-root -rf /",
    "env rm x", "command git status", "sudo ls", "nohup ls", "time ls", "nice ls", "xargs ls", "exec ls", "builtin pwd", "watch ls", "timeout 5 ls",
    "eval ls", "source x.sh", ". x.sh", "alias ll='ls'", "bash -c 'ls'", "sh -c ls", "zsh -c ls", "dash -c ls", "bash script.sh", "bash < script.sh",
    "FOO=bar ls", "PATH=x ls", "./scripts/x.sh", "/bin/ls", "'ls' -la", "\"git\" status",
    "python -c 'print(1)'", "python3 - <<'PY'\nprint(1)\nPY", "node -e '1'", "node -p 1", "perl -e 1", "ruby -e 1",
  ]) assertDenied(c, null);
});

test("wrappers e construções que escondem o executável recebem o código próprio de wrapper", () => {
  for (const c of ["env ls", "command git status", "sudo ls", "nohup ls", "time ls", "nice ls", "xargs ls", "exec ls", "builtin pwd", "watch ls", "timeout 5 ls",
    "eval ls", "source x.sh", ". x.sh", "alias ll='ls'", "bash -c 'ls'", "sh -c ls", "zsh -c ls", "bash script.sh", "FOO=bar ls", "./scripts/x.sh", "/bin/ls", "'ls' -la"]) {
    assertDenied(c, "LF-CMD-WRAPPER");
  }
  // find: as ações perigosas são negadas pela regra do próprio find (não por ambiguidade léxica)
  for (const c of ["find . -exec ls \\;", "find . -execdir ls \\;", "find . -ok ls \\;", "find . -delete", "find . -fprint saida.txt", "find . -fls saida.txt"]) {
    assertDenied(c, "LF-CMD-NOT-ALLOWED");
  }
});

test("substituição, expansão, aliases, subshell, segundo plano e construções ambíguas são negados", () => {
  for (const c of [
    "ls $(pwd)", "ls `pwd`", "ls \"$(pwd)\"", "ls \"`pwd`\"", "ls $HOME", "ls ${HOME}", "ls \"$HOME\"", "rg x <(ls)", "ls > >(cat)", "(ls)", "ls & pwd", "ls &",
    "{ ls; }", "ls # comentário", "ls \\\n docs", "ls 'aberta", "ls \"aberta", "git log $'x'", "ls ~/*$X",
  ]) assertDenied(c, null);
});

test("falsos positivos: palavras em argumentos, textos e here-documents não são executáveis", () => {
  for (const c of [
    "rg -n docker docs", "rg 'curl https://exemplo' docs", "rg \"eval\" packages", "rg 'rm -rf' docs", "rg 'git push' docs", "git log --grep=docker",
    "git log --grep 'wget|ssh'", "rg 'bash -c' .", "find . -name 'docker*'", "ls docker-compose.yml", "rg -n 'x' README.md | head -3",
    "wc -l <<'EOF'\ndocker run x\ncurl y\nEOF", "wc -l <<EOF\nrm -rf /\nEOF", "wc -l <<-EOF\n\tbash -c x\n\tEOF", "head -n 1 <<< texto",
  ]) assertAllowed(c);
  // os executáveis em si continuam negados
  for (const c of ["docker ps", "docker-compose up", "curl https://x", "wget https://x", "ssh host", "scp a b", "sftp h", "gh pr create", "npm install", "npx x", "corepack pnpm install", "supabase db push", "supabase start"]) {
    assertDenied(c, null);
  }
});

test("pnpm: scripts fora da lista, exec, dlx, add, install e opções são negados", () => {
  for (const c of [
    "pnpm exec vitest", "pnpm dlx x", "pnpm add x", "pnpm install", "pnpm i", "pnpm update", "pnpm remove x", "pnpm run test", "pnpm -r test", "pnpm --filter x test",
    "pnpm --dir tools/developer-harness install", "pnpm claude:local", "pnpm claude:maintenance", "pnpm harness:install", "pnpm harness:mcp", "pnpm vitest run",
    "pnpm test --config x.ts", "pnpm test ../fora", "pnpm test /abs", "pnpm test a;b", "pnpm verificar --x", "pnpm publish", "pnpm", "pnpm -v",
  ]) assertDenied(c, null);
  assertAllowed("pnpm harness:install", "maintenance");
});

test("utilitários: opções perigosas de find, sed, head/tail, rg e shasum são negadas", () => {
  for (const c of [
    "find . -delete", "find . -exec rm {} ;", "find . -execdir ls ;", "find . -ok ls ;", "find . -fprint x", "find . -fls x",
    "sed -i s/a/b/ x", "sed -n 'w out' x", "sed -n 's/a/b/w out' x", "sed s/a/b/ x", "sed -f s.sed x", "sed -n '1e ls' x",
    "tail -f x", "tail -F x", "tail --follow x", "head --pid=1 x", "rg --pre ls x", "rg --pre=ls x", "rg -z x", "rg --hostname-bin ls x",
    "shasum -c sums", "shasum -a 9 x", "wc -x", "ls --sort=x -Z=", "pwd -x",
  ]) assertDenied(c, null);
});

test("redirecionamentos: só para caminhos permitidos; /dev/null e descritores são aceitos", () => {
  assertAllowed("git status > test-results/status.txt");
  assertAllowed("git status 2>/dev/null");
  assertAllowed("pnpm verificar > test-results/v.log 2>&1");
  assertAllowed("wc -l < README.md");
  for (const f of ["CLAUDE.md", ".mcp.json", ".claude/settings.json", "package.json", "scripts/claude-launch.mjs", ".github/workflows/ci.yml", "tools/developer-harness/x", "pnpm-lock.yaml"]) {
    assertDenied(`git status > ${f}`, "LF-REDIRECT");
    assertDenied(`git status >> ${f}`, "LF-REDIRECT");
    assertDenied(`git status &> ${f}`, "LF-REDIRECT");
    assertAllowed(`git status > ${f}`, "maintenance");
  }
  for (const c of ["git status > /tmp/x", "git status > ../fora", "git status > /etc/x", "git status > .env", "git status > docs/product/marketing-ops/00-documento-transicao.md", "git status > sources/a"]) {
    assertDenied(c, "LF-REDIRECT");
    assertDenied(c.replace("git status", "git status").replace(">", ">>"), "LF-REDIRECT");
  }
  assertDenied("wc -l < /etc/passwd", "LF-REDIRECT");
  assertDenied("git status >& x", "LF-CMD-AMBIGUOUS");
});

test("comandos compostos: cada segmento precisa ser permitido", () => {
  assertAllowed("git status; git diff --check; pwd");
  assertDenied("git status; rm x", null);
  assertDenied("git status && curl x", null);
  assertDenied("git status || bash -c x", null);
  assertDenied("git status | tee x", null);
  assertDenied("pnpm test:harness\nrm x", null);
  assertDenied("git status ;; pwd", null);
  assertDenied("git status &&", null);
  assertDenied("&& git status", null);
  assertDenied("git status | | head", null);
  assertDenied("; pwd", null);
});

test("recusas: só código e texto estático; nunca comando, argumento, URL ou segredo", () => {
  const marker = "SEGREDO-hunter2-7f3a";
  const results = [
    bash(`curl https://${marker}.example/x?token=${marker}`),
    bash(`git -C /${marker} push`),
    bash(`rm -rf /${marker}`),
    bash(`git status > /${marker}/x`),
    bash(`FOO=${marker} ls`),
    write(`/${marker}/x`),
    write(`.env.${marker}`),
    pw("browser_navigate", { url: `https://${marker}.example/?k=${marker}` }),
    pw("browser_evaluate", { function: marker }),
  ];
  for (const r of results) {
    assert.equal(r.allowed, false);
    assert.ok(r.code in REASONS, r.code);
    assert.equal(r.reason, REASONS[r.code]);
    assert.ok(!JSON.stringify(r).includes(marker), JSON.stringify(r));
  }
});

/* ---------------------------------------------------------------- Playwright */

test("Playwright: os cinco tools negados, os demais só nos origins locais", () => {
  for (const t of PLAYWRIGHT_DENIED) assert.equal(pw(t, { url: "http://localhost:3100" }).code, "LF-PW-TOOL", t);
  assert.deepEqual([...PLAYWRIGHT_DENIED].sort(), ["browser_drag", "browser_drop", "browser_evaluate", "browser_file_upload", "browser_run_code_unsafe"]);
  assert.equal(pw("browser_desconhecido").code, "LF-PW-TOOL");
  for (const t of PLAYWRIGHT_ALLOWED) assert.equal(pw(t, {}).allowed, true, t);
  for (const u of ["http://localhost:3100", "http://127.0.0.1:3100/entrar", "http://localhost:54421", "http://127.0.0.1:54424", "about:blank", "http://[::1]:3100"]) {
    assert.equal(pw("browser_navigate", { url: u }).allowed, true, u);
  }
  for (const u of ["https://app.oplyra.io", "http://localhost", "http://localhost:80", "http://localhost:9999", "file:///etc/passwd", "javascript:alert(1)", "ftp://localhost:3100", "http://localhost.evil.example:3100", "não é url", "http://user@evil.example:3100"]) {
    assert.equal(pw("browser_navigate", { url: u }).code, "LF-PW-URL", u);
  }
});

test("ferramentas de rede do Claude são negadas; as demais ferramentas passam para as regras de permissão", () => {
  assert.equal(evaluate({ toolName: "WebFetch", toolInput: { url: "http://localhost" }, projectRoot: root }).code, "LF-NETWORK-TOOL");
  assert.equal(evaluate({ toolName: "WebSearch", toolInput: {}, projectRoot: root }).code, "LF-NETWORK-TOOL");
  assert.equal(evaluate({ toolName: "TodoWrite", toolInput: {}, projectRoot: root }).allowed, true);
  // Read deixou de passar sem exame: um caminho fora do repositório é recusado
  assert.equal(evaluate({ toolName: "Read", toolInput: { file_path: "/x" }, projectRoot: root }).code, "LF-READ-OUTSIDE");
});

/* ----------------------------------------- leituras fechadas e Context7 (CR-031 auditoria) */

/** Repositório temporário real (com symlinks) para as barreiras de leitura. */
function readFixture() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "oplyra-read-")));
  const repo = path.join(tmp, "repo");
  const outside = path.join(tmp, "outside");
  const put = (rel, text = "x\n", base = repo) => {
    fs.mkdirSync(path.dirname(path.join(base, rel)), { recursive: true });
    fs.writeFileSync(path.join(base, rel), text);
  };
  for (const f of ["README.md", "docs/a.md", "sources/ref.md", ".env", ".env.local", ".env.example", ".npmrc", ".netrc", "apps/web/.env.production", "keys/server.pem",
    "keys/id_rsa", "certs/ca.crt", "config/credentials.json", ".aws/config", ".git/config"]) put(f);
  put("secret.txt", "fora\n", outside);
  fs.symlinkSync(outside, path.join(repo, "link"));
  fs.symlinkSync(path.join(outside, "secret.txt"), path.join(repo, "linkfile"));
  fs.symlinkSync(path.join(repo, ".env"), path.join(repo, "envalias"));
  fs.symlinkSync(path.join(repo, "README.md"), path.join(repo, ".env.backup"));
  fs.symlinkSync(path.join(repo, "docs"), path.join(repo, "inlink"));
  return { repo, outside };
}

const row = (id, toolName, toolInput, allowed, code, extra = {}) => ({ id, toolName, toolInput, allowed, code, ...extra });
const b = (id, command, allowed, code, extra) => row(id, "Bash", { command }, allowed, code, extra);

/** Matriz das barreiras: permitido/negado e código. A mesma matriz valida o guard real e mata as mutações. */
function matrix(fx) {
  const rd = (id, file_path, allowed, code) => row(id, "Read", { file_path }, allowed, code);
  const OUT = "LF-READ-OUTSIDE", SEC = "LF-READ-SECRET", PAT = "LF-READ-PATTERN", RGO = "LF-RG-OPTION", NA = "LF-CMD-NOT-ALLOWED";
  return [
    rd("read-ok-readme", "README.md", true), rd("read-ok-sources", "sources/ref.md", true), rd("read-ok-env-example", ".env.example", true),
    rd("read-ok-inner-link", "inlink/a.md", true), rd("read-ok-absolute", path.join(fx.repo, "docs/a.md"), true),
    rd("read-etc-passwd", "/etc/passwd", false, OUT), rd("read-parent", "../fora", false, OUT), rd("read-parent-real", "../outside/secret.txt", false, OUT),
    rd("read-symlink-dir", "link/secret.txt", false, OUT), rd("read-symlink-file", "linkfile", false, OUT), rd("read-tilde", "~/notes.txt", false, OUT),
    rd("read-env", ".env", false, SEC), rd("read-env-local", ".env.local", false, SEC), rd("read-env-nested", "apps/web/.env.production", false, SEC),
    rd("read-env-upper", ".ENV", false, SEC), rd("read-npmrc", ".npmrc", false, SEC), rd("read-netrc", ".netrc", false, SEC), rd("read-pem", "keys/server.pem", false, SEC),
    rd("read-rsa", "keys/id_rsa", false, SEC), rd("read-crt", "certs/ca.crt", false, SEC), rd("read-credentials", "config/credentials.json", false, SEC),
    rd("read-aws", ".aws/config", false, SEC), rd("read-git-config", ".git/config", false, SEC), rd("read-alias-to-secret", "envalias", false, SEC),
    rd("read-literal-secret-name", ".env.backup", false, SEC), row("read-nopath", "Read", {}, false, "LF-READ-NO-PATH"),
    row("glob-ok-md", "Glob", { pattern: "**/*.md" }, true), row("glob-ok-path", "Glob", { pattern: "*.md", path: "docs" }, true),
    row("glob-ok-hidden-dir", "Glob", { pattern: ".github/**" }, true), row("glob-ok-env-example", "Glob", { pattern: "**/.env.example" }, true),
    row("glob-parent", "Glob", { pattern: "../*" }, false, PAT), row("glob-abs", "Glob", { pattern: "/etc/*" }, false, PAT),
    row("glob-env", "Glob", { pattern: "**/.env*" }, false, SEC), row("glob-npmrc", "Glob", { pattern: "**/.npmrc" }, false, SEC),
    row("glob-pem", "Glob", { pattern: "**/*.pem" }, false, SEC), row("glob-brace", "Glob", { pattern: "**/*.{pem,key}" }, false, SEC),
    row("glob-credentials", "Glob", { pattern: "**/credentials*" }, false, SEC), row("glob-dotstar", "Glob", { pattern: ".*" }, false, PAT),
    row("glob-path-outside", "Glob", { pattern: "*", path: "/etc" }, false, OUT), row("glob-path-link", "Glob", { pattern: "*", path: "link" }, false, OUT),
    row("glob-nopattern", "Glob", {}, false, PAT),
    row("grep-ok", "Grep", { pattern: "foo" }, true), row("grep-ok-glob", "Grep", { pattern: "foo", glob: "*.md", path: "docs" }, true),
    row("grep-path-etc", "Grep", { pattern: "root", path: "/etc" }, false, OUT), row("grep-path-link", "Grep", { pattern: "x", path: "link" }, false, OUT),
    row("grep-path-env", "Grep", { pattern: "x", path: ".env" }, false, SEC), row("grep-glob-env", "Grep", { pattern: "x", glob: ".env*" }, false, SEC),
    row("grep-glob-parent", "Grep", { pattern: "x", glob: "../**" }, false, PAT), row("grep-glob-pem", "Grep", { pattern: "x", glob: "*.pem" }, false, SEC),

    b("b-ok-rg", "rg -n foo docs", true), b("b-ok-rg-files", "rg --files -g '*.md' docs", true), b("b-ok-rg-e", "rg -e foo -i -C 2 docs", true),
    b("b-ok-rg-ctx", "rg -A3 --color=never --no-heading foo docs", true), b("b-ok-rg-sources", "rg foo sources", true), b("b-ok-head", "head -n 3 README.md", true),
    b("b-ok-tail", "tail -n 2 docs/a.md", true), b("b-ok-sed", "sed -n '1,2p' docs/a.md", true), b("b-ok-shasum", "shasum -a 256 README.md", true),
    b("b-ok-wc", "wc -l README.md docs/a.md", true), b("b-ok-wc-example", "wc -l .env.example", true), b("b-ok-ls", "ls -la docs", true), b("b-ok-ls-bare", "ls", true),
    b("b-ok-find", "find . -name '*.md' -maxdepth 2", true), b("b-ok-find-docs", "find docs -type f", true), b("b-ok-sources", "head -5 sources/ref.md", true),
    b("b-head-passwd", "head /etc/passwd", false, OUT), b("b-head-n-passwd", "head -n 1 /etc/passwd", false, OUT), b("b-tail-outside", "tail -n 1 ../outside/secret.txt", false, OUT),
    b("b-sed-passwd", "sed -n '1p' /etc/passwd", false, OUT), b("b-shasum-passwd", "shasum /etc/passwd", false, OUT), b("b-wc-passwd", "wc -l /etc/passwd", false, OUT),
    b("b-ls-root", "ls /", false, OUT), b("b-ls-parent", "ls ..", false, OUT), b("b-ls-link", "ls link", false, OUT), b("b-ls-home", "ls ~", false, OUT),
    b("b-rg-etc", "rg x /etc", false, OUT), b("b-rg-parent", "rg x ..", false, OUT), b("b-rg-files-root", "rg --files /", false, OUT), b("b-rg-dashdash", "rg -- x /etc", false, OUT),
    b("b-rg-link", "rg x link", false, OUT), b("b-find-root", "find /", false, OUT), b("b-find-root-name", "find / -name x", false, OUT), b("b-find-parent", "find .. -name x", false, OUT),
    b("b-find-link", "find link", false, OUT), b("b-head-linkfile", "head linkfile", false, OUT), b("b-sed-tilde", "sed -n '1p' ~/.ssh/id_rsa", false, OUT),
    b("b-redirect-passwd", "wc -l < /etc/passwd", false, "LF-REDIRECT"), b("b-redirect-tilde", "wc -l < ~/x", false, "LF-REDIRECT"),
    b("b-git-no-index", "git diff --no-index /etc/passwd /etc/hosts", false, NA),
    b("b-head-env", "head .env", false, SEC), b("b-head-env-local", "head -n 1 .env.local", false, SEC), b("b-sed-npmrc", "sed -n '1p' .npmrc", false, SEC),
    b("b-shasum-netrc", "shasum .netrc", false, SEC), b("b-wc-env", "wc -l .env", false, SEC), b("b-tail-pem", "tail keys/server.pem", false, SEC),
    b("b-rg-env", "rg x .env", false, SEC), b("b-rg-rsa", "rg x keys/id_rsa", false, SEC), b("b-ls-ssh", "ls .ssh", false, SEC), b("b-find-aws", "find .aws", false, SEC),
    b("b-head-alias", "head envalias", false, SEC), b("b-redirect-env", "wc -l < .env", false, SEC),
    b("b-glob-env", "head .env*", false, PAT), b("b-glob-bracket", "wc -l .e[n]v", false, PAT), b("b-glob-question", "ls .en?", false, PAT),
    b("b-rg-hidden", "rg --hidden x", false, RGO), b("b-rg-no-ignore", "rg --no-ignore x", false, RGO), b("b-rg-hidden-no-ignore", "rg --hidden --no-ignore x", false, RGO),
    b("b-rg-uuu", "rg -uuu x", false, RGO), b("b-rg-u", "rg -u x", false, RGO), b("b-rg-dot", "rg -. x", false, RGO), b("b-rg-follow-short", "rg -L x", false, RGO),
    b("b-rg-follow", "rg --follow x", false, RGO), b("b-rg-no-ignore-vcs", "rg --no-ignore-vcs x", false, RGO), b("b-rg-no-ignore-dot", "rg --no-ignore-dot x", false, RGO),
    b("b-rg-ignore-file", "rg --ignore-file .env x", false, RGO), b("b-rg-unrestricted", "rg --unrestricted x", false, RGO), b("b-rg-pre", "rg --pre cat x", false, RGO),
    b("b-rg-zip", "rg -z x", false, RGO), b("b-rg-f", "rg -f .env x", false, RGO), b("b-rg-max-nonnum", "rg -m x x", false, RGO), b("b-rg-depth-nonnum", "rg --max-depth abc x", false, RGO),
    b("b-rg-sort", "rg --sort path x", false, RGO),
    b("b-rg-glob-env", "rg -g '.env*' x", false, SEC), b("b-rg-glob-hidden", "rg -g '.secret/**' x", false, PAT), b("b-rg-glob-git", "rg --glob=.git/** x", false, PAT),
    b("b-rg-glob-parent", "rg -g '../x' x", false, PAT), b("b-rg-glob-abs", "rg -g '/etc/*' x", false, PAT), b("b-rg-iglob-pem", "rg --iglob '*.pem' x", false, SEC),
    b("b-find-follow-L", "find -L . -name x", false, NA), b("b-find-follow", "find . -follow -name x", false, NA), b("b-find-newer", "find . -newer /etc/passwd", false, NA),
    b("b-ls-deref", "ls -LR", false, NA), b("b-ls-deref-H", "ls -H docs", false, NA),

    row("mcp-ctx7-auto-query", "mcp__context7__query-docs", { libraryId: "/x" }, false, "LF-MCP-CONTEXT7", { policy: "autonomous", permissionMode: "dontAsk" }),
    row("mcp-ctx7-auto-resolve", "mcp__context7__resolve-library-id", {}, false, "LF-MCP-CONTEXT7", { policy: "autonomous", permissionMode: "dontAsk" }),
    row("mcp-ctx7-auto-default-mode", "mcp__context7__query-docs", {}, false, "LF-MCP-CONTEXT7", { policy: "autonomous", permissionMode: "default" }),
    row("mcp-ctx7-auto-nomode", "mcp__context7__query-docs", {}, false, "LF-MCP-CONTEXT7", { policy: "autonomous" }),
    row("mcp-ctx7-maint-manual-query", "mcp__context7__query-docs", {}, true, undefined, { policy: "maintenance", permissionMode: "default" }),
    row("mcp-ctx7-maint-manual-resolve", "mcp__context7__resolve-library-id", {}, true, undefined, { policy: "maintenance", permissionMode: "default" }),
    ...["dontAsk", "acceptEdits", "bypassPermissions", "auto", "plan", "", undefined].map((m) =>
      row(`mcp-ctx7-maint-mode-${m === undefined ? "absent" : m || "empty"}`, "mcp__context7__query-docs", {}, false, "LF-MCP-CONTEXT7", { policy: "maintenance", permissionMode: m })),
    row("mcp-ctx7-maint-unknown-tool", "mcp__context7__delete-everything", {}, false, "LF-MCP-UNKNOWN", { policy: "maintenance", permissionMode: "default" }),
    row("mcp-unknown-server", "mcp__evil__run", {}, false, "LF-MCP-UNKNOWN", { policy: "maintenance", permissionMode: "default" }),
    row("mcp-lookalike-server", "mcp__context7-fake__query-docs", {}, false, "LF-MCP-UNKNOWN", { policy: "maintenance", permissionMode: "default" }),
    row("mcp-uppercase", "MCP__context7__query-docs", {}, false, "LF-MCP-UNKNOWN", { policy: "maintenance", permissionMode: "default" }),
    row("mcp-ok-playwright", "mcp__playwright__browser_snapshot", {}, true),
  ];
}

function runMatrix(mod, fx, rows = matrix(fx)) {
  const failed = [];
  for (const r of rows) {
    let v;
    try {
      v = mod.evaluate({ toolName: r.toolName, toolInput: r.toolInput, projectRoot: fx.repo, policy: r.policy ?? "autonomous", permissionMode: r.permissionMode });
    } catch {
      failed.push(r.id); // uma exceção também é um comportamento diferente do esperado
      continue;
    }
    const wrong = v.allowed !== r.allowed || (!r.allowed && r.code !== undefined && v.code !== r.code);
    if (wrong) failed.push(r.id);
  }
  return failed;
}

test("leituras: Read, Glob e Grep só dentro do repositório, sem symlink externo nem segredos (matriz completa)", () => {
  const fx = readFixture();
  const rows = matrix(fx);
  assert.equal(rows.length, 151, "tamanho da matriz: novas linhas exigem nova barreira ou nova mutação correspondente");
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length, "ids únicos");
  assert.deepEqual(runMatrix({ evaluate }, fx, rows), []);
  // as duas políticas se comportam igual nas leituras
  for (const r of rows.filter((x) => ["Read", "Glob", "Grep", "Bash"].includes(x.toolName))) {
    const v = evaluate({ toolName: r.toolName, toolInput: r.toolInput, projectRoot: fx.repo, policy: "maintenance" });
    assert.equal(v.allowed, r.allowed, `manutenção: ${r.id}`);
  }
});

test("leituras: casos nomeados pela auditoria", () => {
  const fx = readFixture();
  const at = (toolName, toolInput, extra = {}) => evaluate({ toolName, toolInput, projectRoot: fx.repo, ...extra });
  assert.equal(at("Read", { file_path: "/etc/passwd" }).code, "LF-READ-OUTSIDE");
  assert.equal(at("Read", { file_path: "../fora" }).code, "LF-READ-OUTSIDE");
  assert.equal(at("Read", { file_path: ".env" }).code, "LF-READ-SECRET");
  assert.equal(at("Read", { file_path: ".npmrc" }).code, "LF-READ-SECRET");
  assert.equal(at("Read", { file_path: "link/secret.txt" }).code, "LF-READ-OUTSIDE");
  assert.equal(at("Bash", { command: "rg --hidden --no-ignore x" }).code, "LF-RG-OPTION");
  assert.equal(at("Bash", { command: "find /" }).code, "LF-READ-OUTSIDE");
  assert.equal(at("Bash", { command: "head /etc/passwd" }).code, "LF-READ-OUTSIDE");
  assert.equal(at("mcp__context7__query-docs", {}, { policy: "autonomous", permissionMode: "dontAsk" }).code, "LF-MCP-CONTEXT7");
  // sources/ continua legível e não gravável
  assert.equal(at("Read", { file_path: "sources/ref.md" }).allowed, true);
  assert.equal(at("Bash", { command: "head -n 1 sources/ref.md" }).allowed, true);
  for (const policy of ["autonomous", "maintenance"]) {
    assert.equal(at("Write", { file_path: "sources/ref.md" }, { policy }).code, "LF-WRITE-REFERENCE");
    assert.equal(at("Bash", { command: "git status > sources/out.txt" }, { policy }).code, "LF-REDIRECT");
  }
});

test("leituras e MCP: recusas não expõem caminho, padrão, comando nem conteúdo", () => {
  const fx = readFixture();
  const marker = "SEGREDO-leitura-hunter2-5e1b";
  const cases = [
    ["Read", { file_path: `/${marker}/passwd` }], ["Read", { file_path: `${marker}/../../x` }], ["Read", { file_path: `.env.${marker}` }],
    ["Read", { file_path: `${marker}.pem` }], ["Glob", { pattern: `**/${marker}/../*` }], ["Glob", { pattern: `${marker}.pem` }],
    ["Grep", { pattern: marker, path: `/${marker}` }], ["Grep", { pattern: "x", glob: `.env.${marker}` }],
    ["Bash", { command: `head /${marker}/x` }], ["Bash", { command: `rg --hidden ${marker}` }], ["Bash", { command: `rg -g '.${marker}' x` }],
    ["Bash", { command: `find /${marker}` }], ["Bash", { command: `wc -l < /${marker}` }], ["Bash", { command: `ls link/${marker}` }],
    ["mcp__context7__query-docs", { libraryId: marker, query: marker }], [`mcp__${marker}__x`, { a: marker }],
  ];
  for (const [toolName, toolInput] of cases) {
    const r = evaluate({ toolName, toolInput, projectRoot: fx.repo, policy: "autonomous", permissionMode: "dontAsk" });
    assert.equal(r.allowed, false, `${toolName} ${JSON.stringify(toolInput)}`);
    assert.ok(r.code in REASONS, r.code);
    assert.equal(r.reason, REASONS[r.code]);
    assert.ok(!JSON.stringify(r).includes(marker), JSON.stringify(r));
    assert.ok(!JSON.stringify(r).includes(fx.repo) && !JSON.stringify(r).includes("passwd"), "sem caminhos");
  }
});

test("hook como processo: Read de /etc/passwd e Context7 autônomo saem com 2; manutenção só com modo manual", () => {
  const fx = readFixture();
  const run = (input, args = []) => spawnSync(process.execPath, [path.join(here, "claude-local-first-guard.mjs"), ...args], {
    input: JSON.stringify(input), encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: fx.repo },
  });
  const passwd = run({ tool_name: "Read", tool_input: { file_path: "/etc/passwd" }, permission_mode: "dontAsk" });
  assert.equal(passwd.status, 2);
  assert.match(passwd.stderr, /LF-READ-OUTSIDE/);
  assert.ok(!passwd.stderr.includes("passwd") && !passwd.stderr.includes(fx.repo));
  assert.equal(run({ tool_name: "Read", tool_input: { file_path: "README.md" }, permission_mode: "dontAsk" }).status, 0);
  assert.equal(run({ tool_name: "Bash", tool_input: { command: "rg --hidden --no-ignore x" } }).status, 2);
  const ctx = { tool_name: "mcp__context7__query-docs", tool_input: { libraryId: "/x" } };
  assert.equal(run({ ...ctx, permission_mode: "default" }).status, 2, "autônoma nega até em modo manual");
  assert.equal(run({ ...ctx, permission_mode: "dontAsk" }).status, 2);
  assert.equal(run(ctx, ["--policy=autonomous"]).status, 2);
  assert.equal(run({ ...ctx, permission_mode: "default" }, ["--policy=maintenance"]).status, 0);
  assert.equal(run({ ...ctx, permission_mode: "dontAsk" }, ["--policy=maintenance"]).status, 2);
  assert.equal(run(ctx, ["--policy=maintenance"]).status, 2, "sem permission_mode falha fechado");
  assert.equal(run({ tool_name: "mcp__desconhecido__x", tool_input: {}, permission_mode: "default" }, ["--policy=maintenance"]).status, 2);
});

/* ---------------------------------------------------------------- mutações do guard */

async function guardMutant(from, to, nth = 1) {
  const src = fs.readFileSync(path.join(here, "claude-local-first-guard.mjs"), "utf8");
  let idx = -1;
  for (let k = 0; k < nth; k += 1) {
    idx = src.indexOf(from, idx + 1);
    assert.notEqual(idx, -1, `âncora de mutação ausente: ${from.slice(0, 70)}`);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oplyra-guard-mut-"));
  const file = path.join(dir, "claude-local-first-guard.mjs");
  fs.writeFileSync(file, src.slice(0, idx) + to + src.slice(idx + from.length));
  return import(pathToFileURL(file).href);
}

test("mutações das novas barreiras de leitura e de Context7: todas detectadas pela matriz", async () => {
  const fx = readFixture();
  const rows = matrix(fx);
  const MUTATIONS = [
    // [id, âncora, substituição, nth, ids que DEVEM falhar]
    ["G1-leitura-fora-do-repo-liberada", 'if (!where.inside) return deny("LF-READ-OUTSIDE");', "", 1, ["read-etc-passwd", "read-parent", "b-head-passwd", "b-find-root"]],
    ["G2-segredos-liberados", 'if (isSensitiveRel(where.rel) || (where.literal !== null && isSensitiveRel(where.literal))) return deny("LF-READ-SECRET");', "", 1, ["read-env", "read-npmrc", "b-head-env"]],
    ["G3-env-example-invertido", 'return base !== ".env.example";', "return true;", 1, ["read-ok-env-example", "b-ok-wc-example"]],
    ["G4-npmrc-fora-da-lista", 'new Set([".npmrc", ".netrc",', 'new Set([".netrc",', 1, ["read-npmrc", "b-sed-npmrc"]],
    ["G5-til-aceito", 'if (text.startsWith("~")) return deny("LF-READ-OUTSIDE");', "", 1, ["read-tilde", "b-ls-home"]],
    ["G6-symlinks-nao-resolvidos", "const resolved = realish(absolute);", "const resolved = absolute;", 1, ["read-symlink-dir", "read-symlink-file", "b-ls-link", "glob-path-link"]],
    ["G7-ferramentas-de-leitura-sem-exame", "if (READ_TOOLS.has(name)) return validateReadTool(name, input, projectRoot);", "if (false) return validateReadTool(name, input, projectRoot);", 1, ["read-etc-passwd", "glob-parent", "grep-path-etc"]],
    ["G8-glob-com-dois-pontos", 'if (segs.includes("..")) return deny("LF-READ-PATTERN");', "", 1, ["glob-parent"]],
    ["G9-padrao-sensivel-liberado", 'if (variants.some((v) => SENSITIVE_TOKEN.test(v))) return deny("LF-READ-SECRET");', "", 1, ["glob-npmrc", "glob-pem", "glob-credentials", "grep-glob-pem", "glob-brace"]],
    ["G9b-chaves-de-chaves-nao-expandidas", "const variants = expandBraces(body.toLowerCase());", "const variants = [body.toLowerCase()];", 1, ["glob-brace"]],
    ["G10-rg-opcao-longa-desconhecida", 'if (!RG_VALUE_LONG.has(name)) return deny("LF-RG-OPTION");', "if (!RG_VALUE_LONG.has(name)) continue;", 1, ["b-rg-hidden", "b-rg-no-ignore", "b-rg-follow", "b-rg-pre"]],
    ["G11-rg-opcao-curta-desconhecida", 'if (!RG_VALUE_SHORT.has(ch)) return deny("LF-RG-OPTION");', "if (!RG_VALUE_SHORT.has(ch)) continue;", 1, ["b-rg-uuu", "b-rg-u", "b-rg-dot", "b-rg-follow-short", "b-rg-zip"]],
    ["G12-rg-glob-sem-exame", "if (RG_GLOB_OPTS.has(name)) {", "if (false) {", 1, ["b-rg-glob-env", "b-rg-glob-parent", "b-rg-iglob-pem"]],
    ["G13-rg-caminhos-sem-exame", "return checkPathArgs(paths, ctx);", "return allow();", 1, ["b-rg-etc", "b-rg-env", "b-rg-link"]],
    ["G14-find-ponto-de-partida-sem-exame", "return checkPathArgs(starts, ctx);", "return allow();", 1, ["b-find-root", "b-find-parent", "b-find-link"]],
    ["G15-find-L-liberado", 'if (FIND_START_BLOCKED.has(a)) return deny("LF-CMD-NOT-ALLOWED");', "", 1, ["b-find-follow-L"]],
    ["G16-find-follow-liberado", 'const FIND_EXPR_BLOCKED = new Set(["-follow", "-newer",', 'const FIND_EXPR_BLOCKED = new Set(["-x-follow", "-x-newer",', 1, ["b-find-follow", "b-find-newer"]],
    ["G17-sed-sem-exame", "? checkPathArgs(files, ctx)", "? allow()", 1, ["b-sed-passwd", "b-sed-npmrc"]],
    ["G18-shasum-sem-exame", "? checkPathArgs(files, ctx)", "? allow()", 2, ["b-shasum-passwd", "b-shasum-netrc"]],
    ["G19-wc-sem-exame", 'return checkPathArgs(args.filter((a) => !a.startsWith("-")), ctx);', "return allow();", 1, ["b-wc-passwd", "b-wc-env"]],
    ["G20-ls-sem-exame", 'return checkPathArgs(args.filter((a) => !a.startsWith("-")), ctx);', "return allow();", 2, ["b-ls-root", "b-ls-parent", "b-ls-ssh"]],
    ["G21-head-tail-sem-exame", "return checkPathArgs(files, ctx);", "return allow();", 1, ["b-head-passwd", "b-tail-outside", "b-tail-pem", "b-head-alias"]],
    ["G22-curingas-em-caminhos", 'if (/[*?[]/.test(p)) return deny("LF-READ-PATTERN");', "", 1, ["b-glob-bracket", "b-glob-question"]],
    ["G23-ls-dereferencia", "&& !/[LH]/.test(a)", "", 1, ["b-ls-deref", "b-ls-deref-H"]],
    ["G24-git-no-index", 'if (a === "--no-index") return deny("LF-CMD-NOT-ALLOWED");', "", 1, ["b-git-no-index"]],
    ["G25-redirecao-de-segredo", 'if (r.kind === "read" && (isSensitiveRel(where.rel) || (where.literal !== null && isSensitiveRel(where.literal)))) return deny("LF-READ-SECRET");', "", 1, ["b-redirect-env"]],
    ["G26-redirecao-til-e-curinga", 'if (r.target.startsWith("~") || /[*?[]/.test(r.target)) return deny("LF-REDIRECT");', "", 1, ["b-redirect-tilde"]],
    ["G27-context7-autonomo", 'policy !== "maintenance" || ', "", 1, ["mcp-ctx7-auto-default-mode"]],
    ["G28-context7-sem-modo-manual", "|| permissionMode !== MANUAL_HOOK_MODE", "", 1, ["mcp-ctx7-maint-mode-dontAsk", "mcp-ctx7-maint-mode-absent", "mcp-ctx7-maint-mode-bypassPermissions"]],
    ["G29-mcp-desconhecido-liberado", 'if (name.toLowerCase().startsWith("mcp__")) return deny("LF-MCP-UNKNOWN");', "", 1, ["mcp-unknown-server", "mcp-lookalike-server", "mcp-uppercase"]],
    ["G30-context7-ferramenta-desconhecida", 'return CONTEXT7_TOOLS.includes(tool) ? allow() : deny("LF-MCP-UNKNOWN");', "return allow();", 1, ["mcp-ctx7-maint-unknown-tool"]],
    ["G31-context7-sem-ramo-proprio", "if (name.startsWith(CONTEXT7_PREFIX)) return", "if (false) return", 1, ["mcp-ctx7-maint-manual-query", "mcp-ctx7-auto-query"]],
    ["G32-grep-path-sem-exame", "if (base !== undefined && base !== null) {", "if (false) {", 1, ["grep-path-etc", "grep-path-link", "grep-path-env", "glob-path-outside"]],
    ["G33-grep-glob-sem-exame", "if (input.glob !== undefined && input.glob !== null) {", "if (false) {", 1, ["grep-glob-env", "grep-glob-parent", "grep-glob-pem"]],
    ["G34-alvo-literal-do-alias-ignorado", "(where.literal !== null && isSensitiveRel(where.literal))", "false", 1, ["read-literal-secret-name"]],
    ["G35-rg-glob-oculto-liberado", "if (strictHidden && ", "if (false && ", 1, ["b-rg-glob-hidden", "b-rg-glob-git"]],
    ["G36-leitura-sem-caminho", 'if (!text || text.includes("\\0")) return deny("LF-READ-NO-PATH");', "", 1, ["read-nopath"]],
  ];
  assert.deepEqual(runMatrix({ evaluate }, fx, rows), [], "sanidade: sem mutação a matriz inteira passa");
  for (const [id, from, to, nth, mustFail] of MUTATIONS) {
    const mod = await guardMutant(from, to, nth);
    const failed = runMatrix(mod, fx, rows);
    assert.ok(failed.length > 0, `mutação NÃO detectada: ${id}`);
    for (const need of mustFail) assert.ok(failed.includes(need), `${id}: a matriz deveria reprovar ${need}; reprovou ${failed.slice(0, 6).join(", ")}`);
  }
  assert.equal(MUTATIONS.length, 37);
});

test("política desconhecida falha fechada", () => {
  assert.equal(evaluate({ toolName: "Bash", toolInput: { command: "pwd" }, projectRoot: root, policy: "livre" }).code, "LF-POLICY");
  assert.equal(classifyBash("pwd", { projectRoot: root, policy: "" }).code, "LF-POLICY");
});

/* ---------------------------------------------------------- hook como processo */

function hook(input, args = []) {
  return spawnSync(process.execPath, [path.join(here, "claude-local-first-guard.mjs"), ...args], {
    input: JSON.stringify(input), encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
}

test("hook: exit 2 e mensagem sem o valor recebido; exit 0 quando permitido; política padrão é a autônoma", () => {
  const ok = hook({ tool_name: "Bash", tool_input: { command: "pnpm test:harness" } });
  assert.equal(ok.status, 0);
  const denied = hook({ tool_name: "Bash", tool_input: { command: "curl https://SEGREDO.example" } });
  assert.equal(denied.status, 2);
  assert.match(denied.stderr, /Oplyra Local First: LF-CMD-NOT-ALLOWED/);
  assert.ok(!denied.stderr.includes("SEGREDO") && !denied.stderr.includes("curl"));
  assert.equal(hook({ tool_name: "Write", tool_input: { file_path: "CLAUDE.md" } }).status, 2);
  assert.equal(hook({ tool_name: "Write", tool_input: { file_path: "CLAUDE.md" } }, ["--policy=maintenance"]).status, 0);
  assert.equal(hook({ tool_name: "Write", tool_input: { file_path: "CLAUDE.md" } }, ["--policy=livre"]).status, 2);
  const bad = spawnSync(process.execPath, [path.join(here, "claude-local-first-guard.mjs")], { input: "não é json", encoding: "utf8" });
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /LF-INPUT/);
});

/* ---------------------------------------------- consistência com o settings.json */

test("`.claude/settings.json` espelha o guard: hook autônomo, allowlist e denies", () => {
  const settingsPath = path.join(repoRoot, ".claude", "settings.json");
  if (!fs.existsSync(settingsPath)) return; // fixture ausente fora do repositório
  const s = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  const cmd = s.hooks.PreToolUse[0].hooks[0].command;
  assert.match(cmd, /claude-local-first-guard\.mjs" --policy=autonomous$/);
  assert.match(s.hooks.PreToolUse[0].matcher, /Bash/);
  const tokens = s.hooks.PreToolUse[0].matcher.split("|");
  for (const t of ["Bash", "Read", "Glob", "Grep", "Write", "Edit", "MultiEdit", "NotebookEdit", "WebFetch", "WebSearch", "mcp__.*"]) assert.ok(tokens.includes(t), t);
  // Context7 faz egress: nunca no allow; negado pelas regras da sessão autônoma
  assert.ok(!s.permissions.allow.some((a) => a.startsWith("mcp__context7")), "Context7 fora do allow");
  for (const t of ["resolve-library-id", "query-docs"]) assert.ok(s.permissions.deny.includes(`mcp__context7__${t}`), t);
  for (const a of s.permissions.allow) assert.ok(!a.startsWith("mcp__") || a.startsWith("mcp__playwright__"), a);
  for (const d of ["Read(./.env)", "Read(./.npmrc)", "Read(./.netrc)", "Read(./**/*.pem)", "Read(./**/*.key)"]) assert.ok(s.permissions.deny.includes(d), d);
  assert.equal(s.disableAllHooks, undefined);
  assert.equal(s.permissions.defaultMode, undefined);
  for (const script of ALLOWED_PNPM_SCRIPTS) assert.ok(s.permissions.allow.includes(`Bash(pnpm ${script})`), script);
  for (const t of PLAYWRIGHT_DENIED) assert.ok(s.permissions.deny.includes(`mcp__playwright__${t}`), t);
  for (const t of PLAYWRIGHT_ALLOWED) assert.ok(s.permissions.allow.includes(`mcp__playwright__${t}`), t);
  for (const d of ["WebFetch", "WebSearch"]) assert.ok(s.permissions.deny.includes(d), d);
  for (const sub of ["push", "pull", "fetch", "add", "commit", "checkout", "switch", "reset", "restore", "clean", "merge", "rebase", "tag"]) {
    assert.ok(s.permissions.deny.includes(`Bash(git ${sub}:*)`) || s.permissions.deny.includes(`Bash(git ${sub} *)`), sub);
  }
  for (const sub of GIT_READONLY) assert.ok(s.permissions.allow.some((a) => a.startsWith(`Bash(git ${sub}`)), sub);
  for (const a of s.permissions.allow) assert.ok(!/^Bash\((bash|sh|zsh|python3?|node|npx|npm|curl|wget|docker|docker-compose|supabase|gh|corepack|git (add|commit|push))[ )]/.test(a), a);
});
