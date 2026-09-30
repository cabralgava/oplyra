// CR-031 — cadeia de suprimentos do Developer Harness. As dependências das
// ferramentas ficam isoladas em `tools/developer-harness/` (projeto privado,
// fora do workspace do produto, com manifesto e lockfile próprios). O lockfile
// do produto não contém nada do harness e permanece o governado pela Release 2.20.
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = new URL("..", import.meta.url).pathname;
const ISOLADO = "tools/developer-harness";
const texto = (p: string) => readFileSync(join(RAIZ, p), "utf8");
const json = (p: string) => JSON.parse(texto(p)) as Record<string, any>;
const sha = (p: string) => createHash("sha256").update(readFileSync(join(RAIZ, p))).digest("hex");

const PINS = { "@anthropic-ai/claude-code": "2.1.284", "@playwright/mcp": "0.0.83", "@upstash/context7-mcp": "4.1.1" };
const ALPHA = "1.64.0-alpha-1790635538000";
const PACOTES_DO_HARNESS = /@anthropic-ai\/claude-code|@playwright\/mcp|@upstash\/context7-mcp|@modelcontextprotocol\//;

/** Linhas da tabela do registro de exceções de DEVELOPMENT-TOOLS.md (§4.1). */
function registro(): { entrada: string; tipo: string; versao: string }[] {
  const doc = texto("docs/harness/DEVELOPMENT-TOOLS.md");
  const secao = doc.slice(doc.indexOf("### 4.1 Registro de exceções"), doc.indexOf("## 5."));
  return secao.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Entrada") && !l.startsWith("| ---"))
    .map((l) => l.split("|").slice(1, -1).map((c) => c.trim().replace(/`/g, "")))
    .map(([entrada, tipo, versao]) => ({ entrada: entrada!, tipo: tipo!, versao: versao! }));
}

describe("projeto de tooling isolado (CR-031)", () => {
  it("tem exatamente três arquivos (fora de node_modules)", () => {
    const itens = readdirSync(join(RAIZ, ISOLADO)).filter((n) => n !== "node_modules").sort();
    expect(itens).toEqual(["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"]);
  });

  it("package.json: privado, mesmo gerenciador do produto, três devDependencies em versão exata e nenhum script de ciclo de vida", () => {
    const p = json(`${ISOLADO}/package.json`);
    expect(p.private).toBe(true);
    expect(p.packageManager).toBe(json("package.json").packageManager);
    expect(p.dependencies).toBeUndefined();
    expect(p.scripts).toBeUndefined();
    expect(p.devDependencies).toEqual(PINS);
    for (const v of Object.values(p.devDependencies as Record<string, string>)) expect(v).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("pnpm-workspace.yaml próprio (sem herdar do produto): só allowBuilds do Claude Code; nenhuma exceção de idade; sem `packages`", () => {
    const y = texto(`${ISOLADO}/pnpm-workspace.yaml`);
    expect(y).toBe("allowBuilds:\n  '@anthropic-ai/claude-code': true\n");
    expect(y).not.toMatch(/minimumReleaseAge|onlyBuiltDependencies|packages:/);
  });

  it("o lockfile isolado é coerente com o manifesto e o único pré-release é o registrado", () => {
    const lock = texto(`${ISOLADO}/pnpm-lock.yaml`);
    // o lockfile tem dois documentos YAML: o do próprio pnpm (`packageManagerDependencies`) e o do projeto
    const inicio = lock.lastIndexOf("\nimporters:");
    const importador = lock.slice(inicio, lock.indexOf("\npackages:", inicio));
    for (const [nome, versao] of Object.entries(PINS)) {
      expect(importador).toContain(`'${nome}':\n        specifier: ${versao}`);
    }
    const prereleases = new Set([...lock.matchAll(/^ {2}'?[@\w./-]+@(\d+\.\d+\.\d+-[\w.-]+)'?[:(]/gm)].map((m) => m[1]));
    expect([...prereleases]).toEqual([ALPHA]);
    expect(lock).not.toMatch(/@latest/);
  });

  it("registro de exceções de DEVELOPMENT-TOOLS.md igual ao pnpm-workspace.yaml isolado", () => {
    const linhas = registro();
    const builds = linhas.filter((l) => l.tipo === "allowBuilds").map((l) => l.entrada);
    const idade = linhas.filter((l) => l.tipo === "minimumReleaseAgeExclude" && l.entrada !== "—");
    expect(builds).toEqual(["@anthropic-ai/claude-code"]);
    expect(idade).toEqual([]); // nenhuma exclusão de idade: testado, desnecessária
    expect(linhas.some((l) => l.entrada.includes("playwright") && l.versao === ALPHA)).toBe(true);
    for (const l of linhas) expect(l.versao.length).toBeGreaterThan(0);
  });

  it("nenhuma configuração usa @latest ou faixas para as ferramentas", () => {
    for (const p of [".mcp.json", `${ISOLADO}/package.json`, "package.json"]) expect(texto(p)).not.toMatch(/@latest/);
    const mcp = json(".mcp.json");
    for (const [nome, srv] of Object.entries(mcp.mcpServers as Record<string, { command: string; args: string[] }>)) {
      expect(srv.command, nome).toBe("corepack");
      expect(srv.args.slice(0, 4), nome).toEqual(["pnpm", "--dir", "tools/developer-harness", "exec"]);
      expect(srv.args.join(" "), nome).not.toMatch(/npx|dlx|@latest/);
    }
  });
});

describe("produto sem o tooling (CR-031)", () => {
  it("package.json da raiz: nenhuma dependência do harness; apenas os scripts aprovados", () => {
    const p = json("package.json");
    for (const secao of ["dependencies", "devDependencies"]) for (const nome of Object.keys(p[secao] ?? {})) expect(nome).not.toMatch(PACOTES_DO_HARNESS);
    for (const s of ["test:harness", "harness:install", "harness:tools", "harness:mcp", "claude:local", "claude:maintenance"]) expect(p.scripts[s], s).toBeDefined();
    expect(p.scripts["claude:local"]).toBe("node scripts/claude-launch.mjs");
    expect(p.scripts["claude:maintenance"]).toBe("node scripts/claude-launch.mjs --maintenance");
    expect(p.scripts["test:harness"]).toBe("node --test scripts/claude-local-first-guard.test.mjs scripts/claude-launch.test.mjs");
    expect(p.scripts["harness:install"]).toBe("corepack pnpm --dir tools/developer-harness install --frozen-lockfile");
    for (const nome of ["claude:local", "claude:maintenance", "harness:tools", "harness:mcp"]) expect(p.scripts[nome], nome).not.toMatch(/--permission-mode|--dangerously|--bare/);
  });

  it("pnpm-lock.yaml da raiz: nada do harness, sem pré-release do Playwright e resolução de Next/Vitest como na Release 2.20", () => {
    const lock = texto("pnpm-lock.yaml");
    expect(lock).not.toMatch(PACOTES_DO_HARNESS);
    expect(lock).not.toContain(ALPHA);
    expect(lock).not.toMatch(/@opentelemetry\/api@/); // o par opcional dos pares de next/vitest voltou à resolução anterior
    const manifesto = json("docs/product/marketing-ops/contracts/contract-registry-manifest-v2.20.json");
    const entrada = (manifesto.artifacts as { path: string; sha256: string }[]).find((a) => a.path === "pnpm-lock.yaml")!;
    expect(sha("pnpm-lock.yaml")).toBe(entrada.sha256);
  });

  it("pnpm-workspace.yaml da raiz: apenas as três globs do produto, sem allowBuilds nem exceções de idade", () => {
    expect(texto("pnpm-workspace.yaml")).toBe('packages:\n  - "apps/*"\n  - "packages/*"\n  - "experiments/*"\n');
  });

  it("a CI instala o produto sem o tooling, garante a ausência e roda os testes do harness sem os pacotes externos", () => {
    const ci = texto(".github/workflows/ci.yml");
    expect(ci).toContain("run: pnpm install --frozen-lockfile");
    expect(ci).toContain("test ! -e tools/developer-harness/node_modules");
    expect(ci).toContain("run: pnpm test:harness");
    expect(ci).not.toMatch(/harness:install|--dir tools|developer-harness install|claude:local|claude:maintenance|context7|playwright-mcp|@anthropic-ai|claude --|npx/);
    expect(ci.indexOf("pnpm install --frozen-lockfile")).toBeLessThan(ci.indexOf("pnpm test:harness"));
  });

  it("nenhum arquivo rastreável do produto depende de node_modules do tooling (o diretório é ignorado pelo Git)", () => {
    expect(texto(".gitignore")).toMatch(/^node_modules\/$/m);
    expect(existsSync(join(RAIZ, ISOLADO, ".gitignore"))).toBe(false);
  });
});
