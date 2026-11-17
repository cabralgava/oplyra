// Regressão da CI do PR #23 (run 44188774519): o NavEmpresa novo (`.sidebar`, sticky, 100vh, com `.sidebar-troca` no
// fim) só funciona dentro da moldura `.shell` do layout da empresa. Na moldura antiga (`.pilha`) a barra lateral ficava
// sobre o conteúdo e o link "Trocar de empresa" interceptava os cliques dos botões (i01:60 e i03:51). Sem navegador/banco.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const WEB = join(new URL("..", import.meta.url).pathname, "apps/web/src");
const ler = (rel: string): string => readFileSync(join(WEB, rel), "utf8");
const semComentarios = (t: string): string => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("moldura da empresa e barra lateral", () => {
  const layout = semComentarios(ler("app/e/[tenantId]/layout.tsx"));
  const nav = semComentarios(ler("components/nav-empresa.tsx"));
  const css = ler("app/globals.css");

  it("o NavEmpresa renderiza a barra `.sidebar` (com o link de troca de empresa)", () => {
    expect(nav).toMatch(/<aside[^>]*"sidebar/);
    expect(nav).toContain("sidebar-troca");
  });

  it("a barra é sticky de altura da janela: só é segura dentro de uma grade `.shell`", () => {
    expect(css).toMatch(/\.shell\s*\{[^}]*display:\s*grid[^}]*grid-template-columns/);
    expect(css).toMatch(/\.sidebar\s*\{[^}]*position:\s*sticky/);
  });

  it("o layout da empresa envolve o NavEmpresa em `.shell` e põe o conteúdo em `.shell-main`/`.shell-conteudo`", () => {
    expect(layout).toMatch(/className="shell"/);
    expect(layout).toMatch(/className="shell-main"/);
    expect(layout).toMatch(/className="[^"]*shell-conteudo[^"]*"/);
    const iShell = layout.indexOf('className="shell"');
    const iNav = layout.indexOf("<NavEmpresa");
    const iMain = layout.indexOf('className="shell-main"');
    expect(iShell).toBeGreaterThanOrEqual(0);
    expect(iNav).toBeGreaterThan(iShell);
    expect(iMain).toBeGreaterThan(iNav);
  });

  it("a moldura antiga `.pilha` não é mais o quadro externo do layout da empresa", () => {
    expect(layout).not.toMatch(/<div className="pilha">\s*<NavEmpresa/);
  });
});
