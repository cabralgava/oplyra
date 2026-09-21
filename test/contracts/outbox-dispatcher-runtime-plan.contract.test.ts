import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSchemaRegistry, unsupportedKeywords, validateSchema } from "./json-schema-subset.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const readJson = (path: string): Record<string, any> => JSON.parse(readFileSync(join(ROOT, path), "utf8"));
const readText = (path: string): string => readFileSync(join(ROOT, path), "utf8");
const schema = readJson("docs/product/marketing-ops/contracts/schemas/runtime/outbox-dispatcher-runtime-plan.schema.json");
const plan = readJson("docs/product/marketing-ops/contracts/fixtures/valid/outbox-dispatcher-runtime-plan-v1.json");
const registry = createSchemaRegistry([schema]);

describe("outbox dispatcher polling and composition-root plan", () => {
  it("usa keywords suportadas e aceita o plano canônico", () => {
    expect(unsupportedKeywords(schema)).toEqual([]);
    expect(validateSchema(schema, plan, registry)).toEqual([]);
  });

  it("mantém ativação negada e exige kill switch antes de cada claim", () => {
    expect(plan.activation).toEqual({
      enabled: false,
      explicitChangeRequired: true,
      killSwitchRequired: true,
      checkBeforeEachClaim: true,
    });
    const enabled = readJson("docs/product/marketing-ops/contracts/fixtures/invalid/outbox-dispatcher-runtime-plan-activation-enabled.json");
    expect(validateSchema(schema, enabled, registry)).toContainEqual(expect.objectContaining({ path: "$.activation.enabled", keyword: "const" }));
    const noKillSwitch = readJson("docs/product/marketing-ops/contracts/fixtures/invalid/outbox-dispatcher-runtime-plan-no-kill-switch.json");
    expect(validateSchema(schema, noKillSwitch, registry)).toContainEqual(expect.objectContaining({ path: "$.activation.killSwitchRequired", keyword: "const" }));
  });

  it("preserva isolamento tenant-scoped e um worker sequencial", () => {
    expect(plan.topology).toMatchObject({
      workerCountPerQueue: 1,
      processingMode: "sequential_single_cycle",
      tenantScheduling: "round_robin",
      crossTenantBatchAllowed: false,
    });
    const invalid = readJson("docs/product/marketing-ops/contracts/fixtures/invalid/outbox-dispatcher-runtime-plan-cross-tenant.json");
    expect(validateSchema(schema, invalid, registry)).toContainEqual(expect.objectContaining({ path: "$.topology.crossTenantBatchAllowed", keyword: "const" }));
  });

  it("fixa defaults conservadores e limita lote a 500", () => {
    const claimFixture = readJson("docs/product/marketing-ops/contracts/fixtures/valid/outbox-dispatcher-claim-input.json");
    expect(plan.polling).toMatchObject({
      defaultBatchSize: 25,
      maximumBatchSize: 500,
      leaseDurationSeconds: 120,
      idleIntervalMilliseconds: 1000,
      failureIntervalMilliseconds: 5000,
      emptyCycleConsumesAttempt: false,
    });
    expect(claimFixture.batchSize).toBe(plan.polling.defaultBatchSize);
    expect(claimFixture.leaseDurationSeconds).toBe(plan.polling.leaseDurationSeconds);
    const invalid = readJson("docs/product/marketing-ops/contracts/fixtures/invalid/outbox-dispatcher-runtime-plan-batch-501.json");
    expect(validateSchema(schema, invalid, registry)).toContainEqual(expect.objectContaining({ path: "$.polling.defaultBatchSize", keyword: "maximum" }));
  });

  it("separa outbox, pgmq e pg_cron sem segunda fonte de verdade", () => {
    const dispatcher = readJson("docs/product/marketing-ops/contracts/fixtures/valid/outbox-dispatcher-policy.json");
    expect(plan.transport).toEqual({
      jobQueue: "pgmq",
      eventOutboxSourceOfTruth: "content.event_outbox",
      eventOutboxClaimBoundary: "app.claim_outbox_events",
      scheduler: "pg_cron",
      pgmqIsEventSourceOfTruth: false,
      pgCronMayDeliverEvents: false,
    });
    expect(dispatcher.transport).toMatchObject({ selected: true, queue: "pgmq", scheduler: "pg_cron", activationAllowed: false });
    const invalid = readJson("docs/product/marketing-ops/contracts/fixtures/invalid/outbox-dispatcher-runtime-plan-cron-delivers.json");
    expect(validateSchema(schema, invalid, registry)).toContainEqual(expect.objectContaining({ path: "$.transport.pgCronMayDeliverEvents", keyword: "const" }));
  });

  it("restringe o scheduler a ocorrências UTC idempotentes", () => {
    expect(plan.scheduler).toEqual({
      timezone: "UTC",
      role: "materialize_and_enqueue_only",
      overlapAllowed: false,
      misfirePolicy: "catch_up_once",
      occurrenceIdempotencyScope: ["tenantId", "scheduleRef", "occurrenceAt"],
    });
  });

  it("define todas as dependências explícitas do composition root", () => {
    expect(new Set(plan.compositionRoot.requiredDependencies)).toEqual(new Set([
      "activationGate",
      "tenantSchedule",
      "outboxDispatcher",
      "consumerRegistry",
      "deliveryFailurePolicy",
      "deadLetterPublisher",
      "clock",
      "telemetry",
    ]));
    expect(plan.compositionRoot.startupWithActivationDisabled).toBe("healthy_idle_no_claim");
  });

  it("faz shutdown sem redelivery e delega recuperação ao lease/fencing", () => {
    expect(plan.shutdown).toEqual({
      stopClaimsFirst: true,
      inFlightPolicy: "attempt_settlement_without_redelivery",
      unsettledRecovery: "lease_expiry_and_fencing",
      drainTimeoutSeconds: 30,
    });
  });

  it("não expõe tenant nem payload em labels de métricas", () => {
    expect(plan.observability.tenantLabelsAllowed).toBe(false);
    expect(plan.observability.payloadContentInMetricsAllowed).toBe(false);
    expect(plan.observability.requiredMetrics).toEqual(expect.arrayContaining(["queue_lag", "retry_count", "dead_letter_count", "settlement_failure_count"]));
  });

  it("proíbe scale-out sem mudança explícita e repetição experimental", () => {
    expect(plan.scaling.automaticScaleOutAllowed).toBe(false);
    expect(new Set(plan.scaling.workerOrBatchIncreaseRequires)).toEqual(new Set(["explicit_change", "E2-01_retest", "E2-09_retest"]));
    expect(plan.scaling.stagingRevalidationRequired).toBe(true);
  });

  it("está alinhado às decisões sem declarar implementação", () => {
    const adr = readText("docs/decisions/ADR-0004-filas-scheduler-postgres.md");
    const experiment = readText("experiments/exp-02/RESULTADO.md");
    const validation = readJson("docs/product/marketing-ops/contracts/schemas/runtime/outbox-dispatcher-runtime-plan.validation.json");
    expect(adr).toContain("Worker Node.js de longa duração");
    expect(experiment).toContain("um worker por fila e lote máximo de 500");
    expect(validation.status).toBe("passed_with_implementation_dependencies");
    expect(validation.runtimeDispatchEnabled).toBe(false);
    expect(validation.databaseChanged).toBe(false);
    expect(validation.unvalidatedImplementationReferences.length).toBeGreaterThan(0);
  });
});
