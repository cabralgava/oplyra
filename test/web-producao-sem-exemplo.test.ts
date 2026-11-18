// A tela oficial de Produção não exibe entrega de exemplo: sem dados reais ela mostra só o estado honesto
// "Ainda não disponível" (CLAUDE.md: sem sucesso fictício nas telas oficiais). Sem navegador/banco.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PAGINA = join(new URL("..", import.meta.url).pathname, "apps/web/src/app/e/[tenantId]/producao/page.tsx");
const semComentarios = (t: string): string => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("tela oficial de Produção", () => {
  const codigo = semComentarios(readFileSync(PAGINA, "utf8"));

  it("não importa nem renderiza o exemplo estático", () => {
    expect(codigo).not.toMatch(/ProducaoExemplo|producao-exemplo/);
  });

  it("mantém o módulo indisponível com as três áreas prometidas, sem filhos simulados", () => {
    expect(codigo).toContain("<ModuloIndisponivel");
    for (const rotulo of ["Entregas", "Ativos", "Imagens"]) expect(codigo).toContain(`rotulo: "${rotulo}"`);
    expect(codigo).not.toMatch(/<\/ModuloIndisponivel>/);
  });

  it("continua exigindo o contexto autenticado da empresa", () => {
    expect(codigo).toContain("await contextoDaEmpresa(tenantId)");
  });
});
