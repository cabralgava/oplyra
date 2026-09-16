// Fronteiras verificadas por teste, não por convenção (critério A12 / TST-02).
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = new URL("..", import.meta.url).pathname;
const IGNORAR = new Set(["node_modules", ".git", "dist", ".next", "supabase", "docs", "experiments"]);

function fontes(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (IGNORAR.has(nome)) continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) fontes(caminho, saida);
    else if (/\.tsx?$/.test(nome)) saida.push(caminho);
  }
  return saida;
}

const arquivos = fontes(RAIZ).map((f) => ({ caminho: relative(RAIZ, f), texto: readFileSync(f, "utf8") }));
const importes = (texto: string): string[] =>
  [...texto.matchAll(/(?:from|import)\s+["']([^"']+)["']/g)].map((m) => m[1]!);

describe("regra de dependência", () => {
  it("o domínio e a aplicação não importam SDK de infraestrutura", () => {
    const proibidos = /^(pg|jose|@supabase\/|next|react)/;
    const violacoes = arquivos
      .filter((a) => a.caminho.startsWith("packages/core/src"))
      .flatMap((a) => importes(a.texto).filter((i) => proibidos.test(i)).map((i) => `${a.caminho} → ${i}`));
    expect(violacoes).toEqual([]);
  });

  it("o núcleo não conhece a infraestrutura", () => {
    const violacoes = arquivos
      .filter((a) => a.caminho.startsWith("packages/core/"))
      .flatMap((a) => importes(a.texto).filter((i) => i.includes("@oplyra/infra")).map((i) => `${a.caminho} → ${i}`));
    expect(violacoes).toEqual([]);
  });

  it("apenas o adapter de banco alcança o pool de conexões", () => {
    const violacoes = arquivos
      .filter((a) => a.caminho !== "packages/infra/src/db.ts" && !a.caminho.startsWith("packages/infra/test"))
      .filter((a) => /new pg\.Pool|new Pool\(/.test(a.texto))
      .map((a) => a.caminho);
    expect(violacoes).toEqual([]);
  });

  it("nenhuma aplicação importa o driver do banco diretamente", () => {
    const violacoes = arquivos
      .filter((a) => a.caminho.startsWith("apps/"))
      .flatMap((a) => importes(a.texto).filter((i) => i === "pg" || i.startsWith("@supabase/")).map((i) => `${a.caminho} → ${i}`));
    expect(violacoes).toEqual([]);
  });
});

describe("superfície de acesso", () => {
  it("toda transação passa por um dos quatro wrappers", () => {
    const wrappers = /with(User|Worker|Identity|Operator)Transaction/;
    const suspeitos = arquivos
      .filter((a) => a.caminho.startsWith("packages/infra/src") && a.caminho !== "packages/infra/src/db.ts")
      .filter((a) => /\bbegin\b|\bcommit\b/i.test(a.texto) && !wrappers.test(a.texto))
      .map((a) => a.caminho);
    expect(suspeitos).toEqual([]);
  });
});
