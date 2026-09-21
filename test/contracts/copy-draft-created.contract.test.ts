import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createSchemaRegistry, unsupportedKeywords, validateSchema } from "./json-schema-subset.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const readJson = (relativePath: string): Record<string, any> =>
  JSON.parse(readFileSync(join(ROOT, relativePath), "utf8"));

const common = readJson("docs/product/marketing-ops/contracts/schemas/common-definitions.schema.json");
const payloadSchema = readJson(
  "docs/product/marketing-ops/contracts/schemas/events/copywriting/copy-draft-created.payload.schema.json"
);
const schemaRegistry = createSchemaRegistry([common, payloadSchema]);
const validPayload = readJson(
  "docs/product/marketing-ops/contracts/fixtures/valid/copy-draft-created-payload.json"
);

describe("copy.draft_created contract", () => {
  it("usa apenas keywords suportadas pelo validador executável", () => {
    expect(unsupportedKeywords(payloadSchema)).toEqual([]);
    expect(unsupportedKeywords(common)).toEqual([]);
  });

  it("resolve o evento para o payload schema versionado", () => {
    const events = readJson("docs/product/marketing-ops/contracts/registries/events.json");
    const event = events.entries.find((entry: Record<string, unknown>) => entry.event === "copy.draft_created");
    expect(events.registryVersion).toBe("1.2");
    expect(event).toMatchObject({
      payloadSchemaStatus: "bound",
      payloadSchema: "../schemas/events/copywriting/copy-draft-created.payload.schema.json"
    });
  });

  it("preserva producer e consumer canônicos", () => {
    const events = readJson("docs/product/marketing-ops/contracts/registries/events.json");
    const event = events.entries.find((entry: Record<string, unknown>) => entry.event === "copy.draft_created");
    expect(event).toMatchObject({
      producer: { type: "agent", id: "copywriting-agent" },
      consumers: ["design-agent"]
    });
  });

  it("vincula sourceAction a uma action canônica e contratada", () => {
    const actions = readJson("docs/product/marketing-ops/contracts/registries/actions.json");
    const action = actions.entries.find((entry: Record<string, unknown>) => entry.action === validPayload.sourceAction);
    expect(action).toMatchObject({
      action: "create_copy_variants",
      ownerAgent: "copywriting-agent",
      schemaStatus: "bound"
    });
  });

  it("aceita o payload válido baseado em referências", () => {
    expect(validateSchema(payloadSchema, validPayload, schemaRegistry)).toEqual([]);
  });

  it("rejeita payload sem draftRef", () => {
    const fixture = readJson(
      "docs/product/marketing-ops/contracts/fixtures/invalid/copy-draft-created-payload-missing-draft-ref.json"
    );
    expect(validateSchema(payloadSchema, fixture, schemaRegistry)).toContainEqual(
      expect.objectContaining({ keyword: "required", message: expect.stringContaining("draftRef") })
    );
  });

  it("rejeita version menor que um", () => {
    const fixture = readJson(
      "docs/product/marketing-ops/contracts/fixtures/invalid/copy-draft-created-payload-version-zero.json"
    );
    expect(validateSchema(payloadSchema, fixture, schemaRegistry)).toContainEqual(
      expect.objectContaining({ path: "$.version", keyword: "minimum" })
    );
  });

  it("rejeita sourceAction ainda não aprovado", () => {
    const fixture = readJson(
      "docs/product/marketing-ops/contracts/fixtures/invalid/copy-draft-created-payload-unsupported-source-action.json"
    );
    expect(validateSchema(payloadSchema, fixture, schemaRegistry)).toContainEqual(
      expect.objectContaining({ path: "$.sourceAction", keyword: "enum" })
    );
  });

  it("rejeita variantRefs vazio", () => {
    const fixture = readJson(
      "docs/product/marketing-ops/contracts/fixtures/invalid/copy-draft-created-payload-empty-variant-refs.json"
    );
    expect(validateSchema(payloadSchema, fixture, schemaRegistry)).toContainEqual(
      expect.objectContaining({ path: "$.variantRefs", keyword: "minItems" })
    );
  });

  it("rejeita variantRefs duplicados", () => {
    const fixture = readJson(
      "docs/product/marketing-ops/contracts/fixtures/invalid/copy-draft-created-payload-duplicate-variant-refs.json"
    );
    expect(validateSchema(payloadSchema, fixture, schemaRegistry)).toContainEqual(
      expect.objectContaining({ path: "$.variantRefs", keyword: "uniqueItems" })
    );
  });

  it("rejeita conteúdo inline não declarado", () => {
    const fixture = readJson(
      "docs/product/marketing-ops/contracts/fixtures/invalid/copy-draft-created-payload-additional-property.json"
    );
    expect(validateSchema(payloadSchema, fixture, schemaRegistry)).toContainEqual(
      expect.objectContaining({ path: "$.inlineCopy", keyword: "additionalProperties" })
    );
  });
});
