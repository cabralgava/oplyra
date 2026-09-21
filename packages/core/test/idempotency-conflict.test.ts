import { describe, expect, it } from "vitest";
import { DomainError, IdempotencyConflict } from "../src/index.ts";

describe("IdempotencyConflict", () => {
  it("expõe o código registrado", () => {
    const error = new IdempotencyConflict();
    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe("IDEMPOTENCY_CONFLICT");
    expect(error.message).toContain("idempotência");
  });

  it("aceita mensagem segura específica do boundary", () => {
    const error = new IdempotencyConflict("a chave não pode ser reutilizada para outro input");
    expect(error.code).toBe("IDEMPOTENCY_CONFLICT");
    expect(error.message).toBe("a chave não pode ser reutilizada para outro input");
  });
});

