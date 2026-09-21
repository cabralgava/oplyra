import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSchemaRegistry, unsupportedKeywords, validateSchema } from "./json-schema-subset.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const readJson = (path: string): Record<string, any> => JSON.parse(readFileSync(join(ROOT, path), "utf8"));
const common = readJson("docs/product/marketing-ops/contracts/schemas/common-definitions.schema.json");
const schema = readJson("docs/product/marketing-ops/contracts/schemas/events/runtime/runtime-dead-lettered.payload.schema.json");
const payload = readJson("docs/product/marketing-ops/contracts/fixtures/valid/runtime-dead-lettered-payload.json");
const schemaRegistry = createSchemaRegistry([common, schema]);

describe("runtime.dead_lettered contract", () => {
  it("usa keywords suportadas e aceita o payload canônico", () => {
    expect(unsupportedKeywords(schema)).toEqual([]);
    expect(validateSchema(schema, payload, schemaRegistry)).toEqual([]);
  });

  it("registra identidade, producer, consumer e payload sem colisão", () => {
    const events = readJson("docs/product/marketing-ops/contracts/registries/events.json");
    const matches = events.entries.filter((entry: Record<string, unknown>) => entry.event === "runtime.dead_lettered");
    expect(events.registryVersion).toBe("1.2");
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      producer: { type: "runtime", id: "event-runtime" },
      consumers: ["orchestrator-agent"],
      category: "runtime",
      durability: "durable",
      payloadSchemaStatus: "bound",
      payloadSchema: "../schemas/events/runtime/runtime-dead-lettered.payload.schema.json",
    });
  });

  it("referencia evento fonte, consumer e erros registrados", () => {
    const events = readJson("docs/product/marketing-ops/contracts/registries/events.json");
    const agents = readJson("docs/product/marketing-ops/contracts/registries/agents.json");
    const errors = readJson("docs/product/marketing-ops/contracts/registries/errors.json");
    expect(events.entries.some((entry: Record<string, unknown>) => entry.event === payload.sourceEventKey)).toBe(true);
    expect(agents.entries.some((entry: Record<string, unknown>) => entry.key === payload.consumerAgent)).toBe(true);
    expect(errors.entries.some((entry: Record<string, unknown>) => entry.code === payload.terminalErrorCode)).toBe(true);
    expect(errors.entries.some((entry: Record<string, unknown>) => entry.code === payload.rootCause.code)).toBe(true);
  });

  it("preserva provenance sem duplicar tenant e trace do envelope", () => {
    expect(payload.sourceEventTransactionId).toBeTruthy();
    expect(payload.deadLetterRef).toBeTruthy();
    expect(payload.evidenceRefs.length).toBeGreaterThan(0);
    expect(payload).not.toHaveProperty("tenantId");
    expect(payload).not.toHaveProperty("workflowId");
    expect(payload).not.toHaveProperty("correlationId");
  });

  it("vincula exaustão à política canônica de cinco entregas", () => {
    const policy = readJson("docs/product/marketing-ops/contracts/fixtures/valid/outbox-retry-policy-v1.json");
    expect(payload.terminalReason).toBe("retry_exhausted");
    expect(payload.attempt).toBe(policy.maximumDeliveryAttempts);
    expect(payload.terminalErrorCode).toBe(policy.exhaustion.errorCode);
    expect(payload.rootCause.retryable).toBe(true);
  });

  it("rejeita ausência da transação fonte", () => {
    const invalid = readJson("docs/product/marketing-ops/contracts/fixtures/invalid/runtime-dead-lettered-missing-source-transaction.json");
    expect(validateSchema(schema, invalid, schemaRegistry)).toContainEqual(expect.objectContaining({
      keyword: "required",
      message: expect.stringContaining("sourceEventTransactionId"),
    }));
  });

  it("rejeita attempt menor que um", () => {
    const invalid = readJson("docs/product/marketing-ops/contracts/fixtures/invalid/runtime-dead-lettered-attempt-zero.json");
    expect(validateSchema(schema, invalid, schemaRegistry)).toContainEqual(expect.objectContaining({
      path: "$.attempt",
      keyword: "minimum",
    }));
  });

  it("proíbe reprocessamento automático", () => {
    const invalid = readJson("docs/product/marketing-ops/contracts/fixtures/invalid/runtime-dead-lettered-auto-reprocessing.json");
    expect(validateSchema(schema, invalid, schemaRegistry)).toContainEqual(expect.objectContaining({
      path: "$.reprocessing.automaticAllowed",
      keyword: "const",
    }));
    expect(payload.reprocessing).toEqual({
      automaticAllowed: false,
      authorizationRevalidationRequired: true,
      preservesSourceLink: true,
    });
  });

  it("detecta root cause não registrado como invariante cross-registry", () => {
    const invalid = readJson("docs/product/marketing-ops/contracts/fixtures/invalid/runtime-dead-lettered-unregistered-root-cause-business-invariant.json");
    const errors = readJson("docs/product/marketing-ops/contracts/registries/errors.json");
    expect(validateSchema(schema, invalid, schemaRegistry)).toEqual([]);
    expect(errors.entries.some((entry: Record<string, unknown>) => entry.code === invalid.rootCause.code)).toBe(false);
  });

  it("detecta inconsistência entre motivo de exaustão, attempt e erro terminal", () => {
    const invalid = readJson("docs/product/marketing-ops/contracts/fixtures/invalid/runtime-dead-lettered-exhaustion-mismatch-business-invariant.json");
    const policy = readJson("docs/product/marketing-ops/contracts/fixtures/valid/outbox-retry-policy-v1.json");
    expect(validateSchema(schema, invalid, schemaRegistry)).toEqual([]);
    expect(invalid.attempt).not.toBe(policy.maximumDeliveryAttempts);
    expect(invalid.terminalErrorCode).not.toBe(policy.exhaustion.errorCode);
  });

  it("mantém emissão e runtime desativados", () => {
    const validation = readJson("docs/product/marketing-ops/contracts/schemas/runtime/outbox-dispatcher.validation.json");
    expect(validation.runtimeDispatchEnabled).toBe(false);
    expect(validation.databaseChanged).toBe(false);
  });
});
