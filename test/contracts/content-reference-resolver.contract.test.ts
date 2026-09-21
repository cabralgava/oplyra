import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createSchemaRegistry, unsupportedKeywords, validateSchema } from "./json-schema-subset.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const readJson = (relativePath: string): Record<string, any> =>
  JSON.parse(readFileSync(join(ROOT, relativePath), "utf8"));
const sorted = (values: string[]): string[] => [...values].sort();

const common = readJson("docs/product/marketing-ops/contracts/schemas/common-definitions.schema.json");
const copyOutput = readJson("docs/product/marketing-ops/contracts/schemas/copywriting/create-copy-variants.output.schema.json");
const inputSchema = readJson("docs/product/marketing-ops/contracts/schemas/runtime/content-reference-resolver.input.schema.json");
const outputSchema = readJson("docs/product/marketing-ops/contracts/schemas/runtime/content-reference-resolver.output.schema.json");
const schemaRegistry = createSchemaRegistry([common, copyOutput, inputSchema, outputSchema]);
const validInput = readJson("docs/product/marketing-ops/contracts/fixtures/valid/content-reference-resolver-input.json");
const validOutput = readJson("docs/product/marketing-ops/contracts/fixtures/valid/content-reference-resolver-output.json");

describe("content reference resolver contract", () => {
  it("usa apenas keywords suportadas pelo validador executável", () => {
    expect(unsupportedKeywords(inputSchema)).toEqual([]);
    expect(unsupportedKeywords(outputSchema)).toEqual([]);
  });

  it("aceita os payloads válidos", () => {
    expect(validateSchema(inputSchema, validInput, schemaRegistry)).toEqual([]);
    expect(validateSchema(outputSchema, validOutput, schemaRegistry)).toEqual([]);
  });

  it("rejeita input sem tenantId", () => {
    const fixture = readJson("docs/product/marketing-ops/contracts/fixtures/invalid/content-reference-resolver-input-missing-tenant.json");
    expect(validateSchema(inputSchema, fixture, schemaRegistry)).toContainEqual(
      expect.objectContaining({ keyword: "required", message: expect.stringContaining("tenantId") })
    );
  });

  it("rejeita permission diferente de read", () => {
    const fixture = readJson("docs/product/marketing-ops/contracts/fixtures/invalid/content-reference-resolver-input-write-permission.json");
    expect(validateSchema(inputSchema, fixture, schemaRegistry)).toContainEqual(
      expect.objectContaining({ path: "$.requiredPermission", keyword: "enum" })
    );
  });

  it("rejeita expectedVersion menor que um", () => {
    const fixture = readJson("docs/product/marketing-ops/contracts/fixtures/invalid/content-reference-resolver-input-version-zero.json");
    expect(validateSchema(inputSchema, fixture, schemaRegistry)).toContainEqual(
      expect.objectContaining({ path: "$.expectedVersion", keyword: "minimum" })
    );
  });

  it("rejeita variantRefs duplicados", () => {
    const fixture = readJson("docs/product/marketing-ops/contracts/fixtures/invalid/content-reference-resolver-input-duplicate-variant-refs.json");
    expect(validateSchema(inputSchema, fixture, schemaRegistry)).toContainEqual(
      expect.objectContaining({ path: "$.variantRefs", keyword: "uniqueItems" })
    );
  });

  it("exige igualdade de tenant entre input e output", () => {
    expect(validOutput.tenantId).toBe(validInput.tenantId);
    const mismatch = readJson("docs/product/marketing-ops/contracts/fixtures/invalid/content-reference-resolver-tenant-mismatch-business-invariant.json");
    expect(mismatch.output.tenantId).not.toBe(mismatch.input.tenantId);
  });

  it("exige igualdade de draft e versão", () => {
    expect(validOutput.draftRef).toBe(validInput.draftRef);
    expect(validOutput.version).toBe(validInput.expectedVersion);
    const mismatch = readJson("docs/product/marketing-ops/contracts/fixtures/invalid/content-reference-resolver-draft-version-mismatch-business-invariant.json");
    expect(mismatch.output.draftRef).not.toBe(mismatch.input.draftRef);
    expect(mismatch.output.version).not.toBe(mismatch.input.expectedVersion);
  });

  it("exige conjunto exato de variant refs", () => {
    expect(sorted(validOutput.content.variants.map((variant: Record<string, unknown>) => variant.id as string)))
      .toEqual(sorted(validInput.variantRefs));
    const mismatch = readJson("docs/product/marketing-ops/contracts/fixtures/invalid/content-reference-resolver-variant-set-mismatch-business-invariant.json");
    expect(sorted(mismatch.output.content.variants.map((variant: Record<string, unknown>) => variant.id as string)))
      .not.toEqual(sorted(mismatch.input.variantRefs));
  });

  it("resolve tool e permissões canônicas", () => {
    const tools = readJson("docs/product/marketing-ops/contracts/registries/tools.json");
    const tool = tools.entries.find((entry: Record<string, unknown>) => entry.key === validInput.repository);
    expect(tool).toMatchObject({ key: "contentRepository", status: "active" });
    expect(tool.allowedPermissions).toContain("read");
    expect(tool.referencedByAgents).toContain("design");
  });

  it("mapeia todas as falhas para erros canônicos", () => {
    const policy = readJson("docs/product/marketing-ops/contracts/fixtures/valid/content-reference-resolver-failure-policy.json");
    const errors = readJson("docs/product/marketing-ops/contracts/registries/errors.json");
    const registered = new Set(errors.entries.map((entry: Record<string, unknown>) => entry.code));
    expect(policy.cases.map((item: Record<string, unknown>) => item.errorCode)).toEqual([
      "TENANT_REQUIRED",
      "TENANT_MISMATCH",
      "PERMISSION_DENIED",
      "REFERENCE_NOT_FOUND",
      "CONFLICT_VERSION",
      "TRANSACTION_SCHEMA_INVALID"
    ]);
    expect(policy.cases.every((item: Record<string, unknown>) => registered.has(item.errorCode))).toBe(true);
  });

  it("proíbe resultado parcial em qualquer falha", () => {
    const policy = readJson("docs/product/marketing-ops/contracts/fixtures/valid/content-reference-resolver-failure-policy.json");
    expect(policy.cases.every((item: Record<string, unknown>) => item.result === null)).toBe(true);
    expect(policy.cases.some((item: Record<string, unknown>) => "content" in item || "partialResult" in item)).toBe(false);
  });
});
