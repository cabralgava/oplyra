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

  it("mostra o estado indisponível acessível, nesta página, com as três áreas prometidas", () => {
    expect(codigo).toContain('role="status"');
    expect(codigo).toContain("Ainda não disponível");
    expect(codigo).toContain("Nenhum dado é simulado aqui");
    expect(codigo).toMatch(/<h1>Produção<\/h1>/);
    for (const rotulo of ["Entregas", "Ativos", "Imagens"]) expect(codigo).toContain(`rotulo: "${rotulo}"`);
    expect(codigo).not.toMatch(/Exemplo|Dados sintéticos/);
  });

  it("só importa módulos presentes na base (o pedido contém apenas página e teste)", () => {
    const imports = [...codigo.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(imports).toEqual(["../../../../lib/session"]);
  });

  it("continua exigindo o contexto autenticado da empresa", () => {
    expect(codigo).toContain("await contextoDaEmpresa(tenantId)");
  });
});
