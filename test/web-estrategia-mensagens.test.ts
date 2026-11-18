// Guarda de deriva: todo código de erro do domínio de Estratégia/Operação tem mensagem em português na web,
// para a tela nunca cair em texto técnico ou vazio. Sem Next, navegador ou banco.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MENSAGENS_ESTRATEGIA } from "../apps/web/src/lib/estrategia-form.ts";

const RAIZ = new URL("..", import.meta.url).pathname;
const erros = readFileSync(join(RAIZ, "packages/core/src/domain/strategy-errors.ts"), "utf8");
const CODIGOS = [...erros.matchAll(/super\(\s*"([A-Z][A-Z0-9_]+)"/g)].map((m) => m[1]!);

describe("mensagens de erro de Estratégia na web", () => {
  it("lê os códigos do domínio (guarda contra o regex quebrar em silêncio)", () => {
    expect(CODIGOS.length).toBeGreaterThanOrEqual(15);
    expect(new Set(CODIGOS).size).toBe(CODIGOS.length);
  });

  it.each(CODIGOS)("%s tem mensagem própria, em português, sem texto técnico", (codigo) => {
    const msg = MENSAGENS_ESTRATEGIA[codigo];
    expect(msg, codigo).toBeTypeOf("string");
    expect(msg!.trim().length, codigo).toBeGreaterThan(8);
    expect(msg, codigo).not.toMatch(/undefined|\[object|Error:|SQL|stack/i);
    expect(msg, codigo).toMatch(/[a-záéíóúâêôãõç]/i);
  });

  it("não há mensagem para código que o domínio não define, exceto os códigos de borda conhecidos", () => {
    const borda = new Set(["PERMISSION_DENIED", "FORMULARIO_INVALIDO", "CONFLICT_VERSION", "INVALID_STATE_TRANSITION", "REFERENCE_NOT_FOUND"]);
    const sobras = Object.keys(MENSAGENS_ESTRATEGIA).filter((c) => !CODIGOS.includes(c) && !borda.has(c));
    expect(sobras).toEqual([]);
  });
});
