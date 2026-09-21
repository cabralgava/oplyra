import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSchemaRegistry, unsupportedKeywords, validateSchema } from "./json-schema-subset.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const readJson = (path: string): Record<string, any> => JSON.parse(readFileSync(join(ROOT, path), "utf8"));
const schema = readJson("docs/product/marketing-ops/contracts/schemas/runtime/outbox-retry-policy.schema.json");
const policy = readJson("docs/product/marketing-ops/contracts/fixtures/valid/outbox-retry-policy-v1.json");
const registry = createSchemaRegistry([schema]);

describe("outbox retry and failure policy contract", () => {
  it("usa somente keywords suportadas e aceita a política canônica", () => {
    expect(unsupportedKeywords(schema)).toEqual([]);
    expect(validateSchema(schema, policy, registry)).toEqual([]);
  });

  it("fixa cinco entregas e backoff exponencial 1/2/4/8 sem jitter", () => {
    expect(policy.maximumDeliveryAttempts).toBe(5);
    expect(policy.backoff).toEqual({
      strategy: "exponential",
      secondsByFailedAttempt: [1, 2, 4, 8],
      jitter: "none",
    });
  });

  it("rejeita máximo diferente de cinco", () => {
    const invalid = readJson("docs/product/marketing-ops/contracts/fixtures/invalid/outbox-retry-policy-max-attempts-zero.json");
    expect(validateSchema(schema, invalid, registry)).toContainEqual(expect.objectContaining({
      path: "$.maximumDeliveryAttempts",
      keyword: "const",
    }));
  });

  it("proíbe retry automático quando o efeito externo é incerto", () => {
    const invalid = readJson("docs/product/marketing-ops/contracts/fixtures/invalid/outbox-retry-policy-uncertain-auto-retry.json");
    expect(validateSchema(schema, invalid, registry)).toContainEqual(expect.objectContaining({
      path: "$.uncertainExternalEffect.automaticRetryAllowed",
      keyword: "const",
    }));
    expect(policy.uncertainExternalEffect).toEqual({
      automaticRetryAllowed: false,
      workflowState: "waiting_human",
      reconciliationRequired: true,
    });
  });

  it("usa conjuntos disjuntos de erros e somente códigos registrados", () => {
    const errors = readJson("docs/product/marketing-ops/contracts/registries/errors.json");
    const byCode = new Map(errors.entries.map((entry: Record<string, any>) => [entry.code, entry]));
    const retryable = new Set(policy.classification.retryableErrorCodes);
    const terminal = new Set(policy.classification.terminalErrorCodes);
    expect([...retryable].filter((code) => terminal.has(code))).toEqual([]);
    for (const code of retryable) expect(byCode.get(code)).toMatchObject({ retryable: true, defaultNextAction: "retry" });
    for (const code of terminal) expect(byCode.get(code)).toMatchObject({ retryable: false });
    const overlapping = readJson("docs/product/marketing-ops/contracts/fixtures/invalid/outbox-retry-policy-overlapping-codes-business-invariant.json");
    expect(validateSchema(schema, overlapping, registry)).toEqual([]);
    expect(overlapping.classification.retryableErrorCodes).toContain("PROVIDER_TIMEOUT");
    expect(overlapping.classification.terminalErrorCodes).toContain("PROVIDER_TIMEOUT");
  });

  it("fecha exaustão com erro terminal próprio e preserva a causa", () => {
    const errors = readJson("docs/product/marketing-ops/contracts/registries/errors.json");
    const exhausted = errors.entries.find((entry: Record<string, unknown>) => entry.code === "RETRY_ATTEMPTS_EXHAUSTED");
    expect(errors.registryVersion).toBe("1.3");
    expect(exhausted).toMatchObject({ category: "runtime", severity: "high", retryable: false, defaultNextAction: "escalate" });
    expect(policy.exhaustion).toEqual({ outcome: "dead_lettered", errorCode: "RETRY_ATTEMPTS_EXHAUSTED", preserveRootCause: true });
  });

  it("não repete delivery no mesmo ciclo após falha de settlement", () => {
    expect(policy.settlementFailure).toEqual({
      repeatDeliveryWithinSameCycle: false,
      recoveryAuthority: "persistent_lease_and_fencing",
    });
  });

  it("mantém o dispatcher alinhado à política sem permitir ativação", () => {
    const dispatcher = readJson("docs/product/marketing-ops/contracts/fixtures/valid/outbox-dispatcher-policy.json");
    expect(dispatcher.retry.maximumDeliveryAttempts).toBe(policy.maximumDeliveryAttempts);
    expect(dispatcher.retry.backoffSecondsByFailedAttempt).toEqual(policy.backoff.secondsByFailedAttempt);
    expect(dispatcher.retry.retryableErrorCodes).toEqual(policy.classification.retryableErrorCodes);
    expect(dispatcher.retry.terminalErrorCodes).toEqual(policy.classification.terminalErrorCodes);
    expect(dispatcher.transport.activationAllowed).toBe(false);
  });
});
