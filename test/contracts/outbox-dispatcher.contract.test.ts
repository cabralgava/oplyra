import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSchemaRegistry, unsupportedKeywords, validateSchema } from "./json-schema-subset.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const readJson = (relativePath: string): Record<string, any> =>
  JSON.parse(readFileSync(join(ROOT, relativePath), "utf8"));

const common = readJson("docs/product/marketing-ops/contracts/schemas/common-definitions.schema.json");
const eventPayload = readJson("docs/product/marketing-ops/contracts/schemas/events/copywriting/copy-draft-created.payload.schema.json");
const claimInput = readJson("docs/product/marketing-ops/contracts/schemas/runtime/outbox-dispatcher-claim.input.schema.json");
const claimOutput = readJson("docs/product/marketing-ops/contracts/schemas/runtime/outbox-dispatcher-claim.output.schema.json");
const settlementInput = readJson("docs/product/marketing-ops/contracts/schemas/runtime/outbox-dispatcher-settlement.input.schema.json");
const settlementOutput = readJson("docs/product/marketing-ops/contracts/schemas/runtime/outbox-dispatcher-settlement.output.schema.json");
const registry = createSchemaRegistry([common, eventPayload, claimInput, claimOutput, settlementInput, settlementOutput]);
const policy = readJson("docs/product/marketing-ops/contracts/fixtures/valid/outbox-dispatcher-policy.json");

describe("outbox dispatcher contract", () => {
  it("usa somente keywords suportadas pelo validador executável", () => {
    for (const schema of [claimInput, claimOutput, settlementInput, settlementOutput]) {
      expect(unsupportedKeywords(schema)).toEqual([]);
    }
  });

  it("aceita claim e settlement válidos", () => {
    const pairs = [
      [claimInput, "docs/product/marketing-ops/contracts/fixtures/valid/outbox-dispatcher-claim-input.json"],
      [claimOutput, "docs/product/marketing-ops/contracts/fixtures/valid/outbox-dispatcher-claim-output.json"],
      [settlementInput, "docs/product/marketing-ops/contracts/fixtures/valid/outbox-dispatcher-settlement-input-dispatched.json"],
      [settlementOutput, "docs/product/marketing-ops/contracts/fixtures/valid/outbox-dispatcher-settlement-output.json"]
    ] as const;
    for (const [schema, path] of pairs) expect(validateSchema(schema, readJson(path), registry)).toEqual([]);
  });

  it("rejeita batchSize e attempt menores que um", () => {
    const badInput = readJson("docs/product/marketing-ops/contracts/fixtures/invalid/outbox-dispatcher-claim-input-batch-zero.json");
    const badOutput = readJson("docs/product/marketing-ops/contracts/fixtures/invalid/outbox-dispatcher-claim-output-attempt-zero.json");
    expect(validateSchema(claimInput, badInput, registry)).toContainEqual(expect.objectContaining({ path: "$.batchSize", keyword: "minimum" }));
    expect(validateSchema(claimOutput, badOutput, registry)).toContainEqual(expect.objectContaining({ path: "$.claims[0].attempt", keyword: "minimum" }));
  });

  it("mantém cada claim restrito a um tenant", () => {
    expect(policy.tenantIsolation).toEqual({ claimScope: "tenantId", crossTenantBatchAllowed: false });
    expect(claimOutput.$defs.claim.properties).not.toHaveProperty("tenantId");
  });

  it("vincula o lote inicial ao evento executável e ao payload canônico", () => {
    const events = readJson("docs/product/marketing-ops/contracts/registries/events.json");
    const registered = events.entries.find((entry: Record<string, unknown>) => entry.event === "copy.draft_created");
    expect(registered).toBeDefined();
    expect(claimOutput.$defs.claim.properties.eventKey.enum).toEqual(["copy.draft_created"]);
    expect(claimOutput.$defs.claim.properties.payload.$ref).toBe(eventPayload.$id);
  });

  it("exige lease, attempt e fencing token e rejeita settlement obsoleto", () => {
    const required = claimOutput.$defs.claim.required;
    expect(required).toEqual(expect.arrayContaining(["attempt", "fencingToken", "leaseExpiresAt"]));
    const stale = readJson("docs/product/marketing-ops/contracts/fixtures/invalid/outbox-dispatcher-stale-settlement-business-invariant.json");
    expect(stale.settlement.attempt).not.toBe(stale.currentClaim.attempt);
    expect(stale.settlement.fencingToken).not.toBe(stale.currentClaim.fencingToken);
    expect(stale.expectedErrorCode).toBe(policy.settlement.staleSettlementErrorCode);
  });

  it("define transições terminais e recuperação somente após lease expirado", () => {
    expect(policy.claim.activeLeaseReclaimAllowed).toBe(false);
    expect(policy.claim.expiredLeaseReclaim).toEqual({ required: true, incrementAttempt: true, rotateFencingToken: true });
    expect(policy.stateMachine.dispatched).toEqual([]);
    expect(policy.stateMachine.dead_lettered).toEqual([]);
  });

  it("não repete falha determinística e envia exaustão para dead letter", () => {
    expect(policy.retry.deterministicFailureRetryAllowed).toBe(false);
    expect(policy.retry.retryableFailureRequiresNextAvailableAt).toBe(true);
    expect(policy.retry.attemptsExhaustedOutcome).toBe("dead_lettered");
    expect(policy.retry.maximumDeliveryAttempts).toBe(5);
    expect(policy.retry.backoffSecondsByFailedAttempt).toEqual([1, 2, 4, 8]);
    expect(policy.retry.attemptsExhaustedErrorCode).toBe("RETRY_ATTEMPTS_EXHAUSTED");
    expect(policy.retry.hardcodedScheduleAllowed).toBe(false);
  });

  it("referencia somente erros canônicos registrados", () => {
    const errors = readJson("docs/product/marketing-ops/contracts/registries/errors.json");
    const codes = new Set(errors.entries.map((entry: Record<string, unknown>) => entry.code));
    const referenced = [
      policy.settlement.staleSettlementErrorCode,
      ...policy.retry.retryableErrorCodes,
      ...policy.retry.terminalErrorCodes,
      policy.retry.attemptsExhaustedErrorCode
    ];
    expect(referenced.every((code: string) => codes.has(code))).toBe(true);
  });

  it("exige deduplicação persistente antes de side effects", () => {
    expect(policy.deliveryGuarantee).toBe("at_least_once");
    expect(policy.consumerDeduplication.scope).toEqual(["tenantId", "eventTransactionId", "consumerAgent"]);
    expect(policy.consumerDeduplication.persistentClaimRequiredBeforeSideEffect).toBe(true);
    expect(policy.consumerDeduplication.completedDuplicateMayRepeatSideEffect).toBe(false);
    expect(policy.consumerDeduplication.settlementRequiresCurrentFencingToken).toBe(true);
  });

  it("registra transporte decidido sem autorizar ativação", () => {
    const validation = readJson("docs/product/marketing-ops/contracts/schemas/runtime/outbox-dispatcher.validation.json");
    expect(policy.transport).toEqual({
      selected: true,
      queue: "pgmq",
      scheduler: "pg_cron",
      decision: "ADR-0004",
      activationAllowed: false,
    });
    expect(validation.status).toBe("passed_with_notes");
    expect(validation.unvalidatedImplementationReferences.length).toBeGreaterThan(0);
    expect(validation.runtimeDispatchEnabled).toBe(false);
    expect(validation.databaseChanged).toBe(false);
  });
});
