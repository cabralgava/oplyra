import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createSchemaRegistry, unsupportedKeywords, validateSchema } from "./json-schema-subset.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const CONTRACTS = join(ROOT, "docs/product/marketing-ops/contracts");
const readJson = (relativePath: string): Record<string, any> =>
  JSON.parse(readFileSync(join(ROOT, relativePath), "utf8"));

const common = readJson("docs/product/marketing-ops/contracts/schemas/common-definitions.schema.json");
const inputSchema = readJson("docs/product/marketing-ops/contracts/schemas/copywriting/create-copy-variants.input.schema.json");
const outputSchema = readJson("docs/product/marketing-ops/contracts/schemas/copywriting/create-copy-variants.output.schema.json");
const schemaRegistry = createSchemaRegistry([common, inputSchema, outputSchema]);

const validInput = readJson("docs/product/marketing-ops/contracts/fixtures/valid/create-copy-variants-input.json");
const validOutput = readJson("docs/product/marketing-ops/contracts/fixtures/valid/create-copy-variants-output.json");
const validTransaction = readJson("docs/product/marketing-ops/contracts/fixtures/valid/transaction-command-create-copy-variants.json");
const transactionWithoutIdempotency = readJson(
  "docs/product/marketing-ops/contracts/fixtures/invalid/transaction-command-create-copy-variants-without-idempotency.json",
);

describe("create_copy_variants contract", () => {
  it("usa apenas keywords suportadas pelo validador executável", () => {
    expect(unsupportedKeywords(inputSchema)).toEqual([]);
    expect(unsupportedKeywords(outputSchema)).toEqual([]);
    expect(unsupportedKeywords(common)).toEqual([]);
  });

  it("resolve a action para os dois schemas versionados", () => {
    const actions = readJson("docs/product/marketing-ops/contracts/registries/actions.json");
    const action = actions.entries.find((entry: Record<string, unknown>) => entry.action === "create_copy_variants");
    expect(actions.registryVersion).toBe("2.0");
    expect(action).toMatchObject({
      ownerAgent: "copywriting-agent",
      type: "command",
      sideEffect: true,
      sideEffectType: "internal",
      requiresIdempotency: true,
      schemaStatus: "bound",
      inputSchema: "../schemas/copywriting/create-copy-variants.input.schema.json",
      outputSchema: "../schemas/copywriting/create-copy-variants.output.schema.json"
    });
  });

  it("exige idempotency.key antes do futuro side effect interno", () => {
    expect(validTransaction.idempotency).toMatchObject({
      key: "task_copy_01-create-copy-variants-v1",
    });
    expect(transactionWithoutIdempotency.idempotency).toBeUndefined();
  });

  it("aceita fixtures válidas", () => {
    expect(validateSchema(inputSchema, validInput, schemaRegistry)).toEqual([]);
    expect(validateSchema(outputSchema, validOutput, schemaRegistry)).toEqual([]);
  });

  it("rejeita input sem objective", () => {
    const fixture = readJson("docs/product/marketing-ops/contracts/fixtures/invalid/create-copy-variants-input-missing-objective.json");
    expect(validateSchema(inputSchema, fixture, schemaRegistry)).toContainEqual(
      expect.objectContaining({ keyword: "required", message: expect.stringContaining("objective") })
    );
  });

  it("rejeita quantity menor que um", () => {
    const fixture = readJson("docs/product/marketing-ops/contracts/fixtures/invalid/create-copy-variants-input-quantity-zero.json");
    expect(validateSchema(inputSchema, fixture, schemaRegistry)).toContainEqual(
      expect.objectContaining({ path: "$.quantity", keyword: "minimum" })
    );
  });

  it("rejeita output sem variants", () => {
    const fixture = readJson("docs/product/marketing-ops/contracts/fixtures/invalid/create-copy-variants-output-empty-variants.json");
    expect(validateSchema(outputSchema, fixture, schemaRegistry)).toContainEqual(
      expect.objectContaining({ path: "$.variants", keyword: "minItems" })
    );
  });

  it("rejeita variant sem CTA", () => {
    const fixture = readJson("docs/product/marketing-ops/contracts/fixtures/invalid/create-copy-variants-output-missing-cta.json");
    expect(validateSchema(outputSchema, fixture, schemaRegistry)).toContainEqual(
      expect.objectContaining({ path: "$.variants[0]", keyword: "required", message: expect.stringContaining("cta") })
    );
  });

  it("aplica a invariante quantity = variants.length", () => {
    expect(validOutput.variants).toHaveLength(validInput.quantity);

    const mismatch = readJson("docs/product/marketing-ops/contracts/fixtures/invalid/create-copy-variants-quantity-mismatch-business-invariant.json");
    expect(mismatch.result.variants).not.toHaveLength(mismatch.input.quantity);
  });

  it("mantém schemas e fixtures dentro do Contract Registry", () => {
    expect(CONTRACTS.endsWith("docs/product/marketing-ops/contracts")).toBe(true);
  });
});
