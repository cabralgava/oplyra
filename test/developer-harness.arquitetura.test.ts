// CR-031 — o Developer Harness é ferramenta externa de desenvolvimento e não faz
// parte do produto. Núcleo, aplicação, infraestrutura, apps e testes do produto
// não dependem de Claude Code, MCP, Context7, Playwright MCP nem dos scripts do
// harness; nenhuma ferramenta do harness é capability do produto.
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = new URL("..", import.meta.url).pathname;
const lerTexto = (p: string) => readFileSync(join(RAIZ, p), "utf8");
const lerJson = (p: string) => JSON.parse(lerTexto(p)) as Record<string, any>;

function arquivos(dir: string, extensoes: RegExp, saida: string[] = []): string[] {
  if (!existsSync(join(RAIZ, dir))) return saida;
  for (const nome of readdirSync(join(RAIZ, dir))) {
    if (nome === "node_modules" || nome === ".next" || nome === "test-results") continue;
    const caminho = join(dir, nome);
    if (statSync(join(RAIZ, caminho)).isDirectory()) arquivos(caminho, extensoes, saida);
    else if (extensoes.test(nome)) saida.push(caminho);
  }
  return saida;
}

const FERRAMENTAS_DO_HARNESS = /@anthropic-ai\/claude-code|@playwright\/mcp|@upstash\/context7|context7-mcp|playwright-mcp|claude-local-first-guard|claude-launch|claude-permission-probe|tools\/developer-harness|\.mcp\.json/i;
const PACOTES_DO_HARNESS = ["@anthropic-ai/claude-code", "@playwright/mcp", "@upstash/context7-mcp"];

describe("Developer Harness fora do produto (CR-031)", () => {
  const fontesDoProduto = ["packages/core/src", "packages/infra/src", "packages/testing/src", "apps/web/src", "apps/ops-cli/src"]
    .flatMap((d) => arquivos(d, /\.(tsx?|mjs|cjs|js|json)$/));

  it("há código de produto a verificar", () => {
    expect(fontesDoProduto.length).toBeGreaterThan(20);
  });

  it("núcleo, aplicação, infraestrutura, apps e testing não referenciam as ferramentas do harness", () => {
    const achados = fontesDoProduto.filter((f) => FERRAMENTAS_DO_HARNESS.test(lerTexto(f)));
    expect(achados).toEqual([]);
  });

  it("packages/core não conhece nenhuma ferramenta de desenvolvimento nem process.env do harness", () => {
    const core = arquivos("packages/core/src", /\.ts$/).map((f) => lerTexto(f)).join("\n");
    expect(core).not.toMatch(/claude|mcp|context7|playwright|developer-harness/i);
  });

  it("testes do produto não importam scripts nem o projeto do harness", () => {
    const testes = [...arquivos("packages", /\.test\.ts$/), ...arquivos("test", /\.ts$/)]
      .filter((f) => !relative(RAIZ, join(RAIZ, f)).startsWith("test/developer-harness.") && !f.startsWith("test/contracts/"));
    const importam = testes.filter((f) => /(from\s+|import\(|require\()\s*["'][^"']*(scripts\/claude-|tools\/developer-harness|\.mcp\.json)/.test(lerTexto(f)));
    expect(importam).toEqual([]);
  });

  it("nenhum manifesto do produto declara dependência do harness, e o workspace não inclui tools/", () => {
    const manifestos = ["package.json", ...["apps", "packages", "experiments"].flatMap((d) =>
      readdirSync(join(RAIZ, d)).map((n) => `${d}/${n}/package.json`).filter((p) => existsSync(join(RAIZ, p))))];
    expect(manifestos.length).toBeGreaterThanOrEqual(7);
    for (const m of manifestos) {
      const j = lerJson(m);
      for (const secao of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
        for (const p of PACOTES_DO_HARNESS) expect(Object.keys(j[secao] ?? {}), `${m}:${secao}`).not.toContain(p);
      }
    }
    const workspace = lerTexto("pnpm-workspace.yaml");
    expect(workspace).not.toMatch(/tools/);
    expect(workspace).not.toMatch(/developer-harness/);
  });

  it("os scripts de build, teste e verificação do produto não dependem do harness", () => {
    const scripts = lerJson("package.json").scripts as Record<string, string>;
    for (const nome of ["build", "typecheck", "test", "test:db", "test:e2e", "scan:secrets", "verificar", "db:start", "db:stop", "db:status", "db:reset", "db:roles"]) {
      expect(scripts[nome], nome).toBeDefined();
      expect(scripts[nome], nome).not.toMatch(/harness|claude|developer-harness|mcp/i);
    }
    // `pnpm verificar` encadeia só scripts do produto
    expect(scripts.verificar).toBe("pnpm typecheck && pnpm test && pnpm test:db && pnpm test:e2e && pnpm scan:secrets && pnpm build");
    expect(scripts["harness:install"]).toContain("--dir tools/developer-harness");
  });

  it("o Tool Registry do produto não contém ferramentas de desenvolvimento", () => {
    const tools = lerJson("docs/product/marketing-ops/contracts/registries/tools.json").entries as { key: string; name: string; category: string }[];
    expect(tools.length).toBeGreaterThan(10);
    const proibido = /context7|playwright|claude|\bmcp\b|\bgit\b|shell|pnpm|developer[-_ ]harness|filesystem/i;
    expect(tools.filter((t) => proibido.test(`${t.key} ${t.name} ${t.category}`)).map((t) => t.key)).toEqual([]);
  });

  it(".mcp.json e o launcher só são lidos pela sessão de desenvolvimento: nada em apps/ e packages/ os cita", () => {
    const citam = [...arquivos("apps", /\.(tsx?|json|mjs)$/), ...arquivos("packages", /\.(tsx?|json|mjs)$/)].filter((f) => /\.mcp\.json|claude-launch/.test(lerTexto(f)));
    expect(citam).toEqual([]);
  });

  it("o harness é removível: nenhum arquivo do produto lê o projeto tools/developer-harness", () => {
    expect(existsSync(join(RAIZ, "tools/developer-harness/package.json"))).toBe(true);
    const leem = ["playwright.config.ts", "vitest.config.ts", "tsconfig.json", ...arquivos("apps", /\.(tsx?|mjs|json)$/), ...arquivos("packages", /\.(tsx?|json)$/)]
      .filter((f) => existsSync(join(RAIZ, f)) && /developer-harness/.test(lerTexto(f)));
    expect(leem).toEqual([]);
  });
});
