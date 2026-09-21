import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const readJson = (relativePath: string): Record<string, any> =>
  JSON.parse(readFileSync(join(ROOT, relativePath), "utf8"));

describe("idempotency conflict contract", () => {
  it("mantém IDEMPOTENCY_CONFLICT no Errors Registry 1.3", () => {
    const registry = readJson("docs/product/marketing-ops/contracts/registries/errors.json");
    const entry = registry.entries.find((item: Record<string, unknown>) => item.code === "IDEMPOTENCY_CONFLICT");
    expect(registry.registryVersion).toBe("1.3");
    expect(entry).toEqual({
      code: "IDEMPOTENCY_CONFLICT",
      category: "idempotency",
      severity: "high",
      retryable: false,
      defaultNextAction: "resolve_conflict",
      description: expect.any(String),
    });
  });

  it("mantém todos os códigos únicos", () => {
    const registry = readJson("docs/product/marketing-ops/contracts/registries/errors.json");
    const codes = registry.entries.map((item: Record<string, unknown>) => item.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("usa categoria e next action já suportadas pelo schema canônico", () => {
    const schema = readJson("docs/product/marketing-ops/contracts/schemas/error.schema.json");
    expect(schema.$defs.errorCategory.enum).toContain("idempotency");
    expect(schema.$defs.nextAction.properties.action.enum).toContain("resolve_conflict");
  });

  it("distingue replay idêntico de reutilização conflitante", () => {
    const policy = readJson("docs/product/marketing-ops/contracts/fixtures/valid/create-copy-variants-idempotency-policy.json");
    const byCondition = new Map(policy.cases.map((item: Record<string, unknown>) => [item.condition, item]));
    expect(byCondition.get("same_scoped_key_same_fingerprint")).toMatchObject({
      result: "return_canonical_stored_result",
      errorCode: null,
      writeAllowed: false,
    });
    expect(byCondition.get("same_scoped_key_different_fingerprint")).toMatchObject({
      result: "error",
      errorCode: "IDEMPOTENCY_CONFLICT",
      writeAllowed: false,
    });
  });
});
