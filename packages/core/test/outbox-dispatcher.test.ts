import { describe, expect, it } from "vitest";
import {
  TenantMismatch,
  TransactionSchemaInvalid,
  validateOutboxClaimBatch,
  validateOutboxClaimRequest,
  validateOutboxSettlementRequest,
  validateOutboxSettlementResult,
} from "../src/index.ts";
import type { OutboxClaimRequest, OutboxSettlementRequest } from "../src/index.ts";

const claimRequest = (): OutboxClaimRequest => ({
  tenantId: "11111111-1111-4111-8111-111111111111",
  dispatcherId: "dispatcher-01",
  batchSize: 10,
  leaseDurationSeconds: 120,
  requestedAt: "2026-09-21T18:00:00Z",
});

const claimBatch = () => ({
  tenantId: claimRequest().tenantId,
  dispatcherId: "dispatcher-01",
  claimedAt: "2026-09-21T18:00:00Z",
  claims: [{
    eventTransactionId: "txn_event_01",
    eventKey: "copy.draft_created",
    schemaVersion: "1.0",
    producerAgent: "copywriting-agent",
    consumerAgent: "design-agent",
    payload: {
      draftRef: "draft-01",
      version: 1,
      sourceAction: "create_copy_variants",
      variantRefs: ["variant-01"],
    },
    trace: { correlationId: "corr-01" },
    context: {},
    attempt: 1,
    fencingToken: "fence-01",
    leaseExpiresAt: "2026-09-21T18:02:00Z",
  }],
});

const settlement = (outcome: OutboxSettlementRequest["outcome"] = "dispatched"): OutboxSettlementRequest => ({
  tenantId: claimRequest().tenantId,
  dispatcherId: "dispatcher-01",
  eventTransactionId: "txn_event_01",
  consumerAgent: "design-agent",
  attempt: 1,
  fencingToken: "fence-01",
  outcome,
  settledAt: "2026-09-21T18:00:05Z",
  ...(outcome === "retryable_failure" ? {
    nextAvailableAt: "2026-09-21T18:01:05Z",
    error: { code: "PROVIDER_TIMEOUT" as const, message: "timeout", retryable: true },
  } : {}),
  ...(outcome === "terminal_failure" ? {
    error: { code: "EVENT_NOT_REGISTERED" as const, message: "desconhecido", retryable: false },
  } : {}),
});

describe("outbox dispatcher core contract", () => {
  it("aceita claim request válido", () => {
    expect(() => validateOutboxClaimRequest(claimRequest())).not.toThrow();
  });

  it("rejeita batch ou lease não positivos", () => {
    expect(() => validateOutboxClaimRequest({ ...claimRequest(), batchSize: 0 })).toThrow(TransactionSchemaInvalid);
    expect(() => validateOutboxClaimRequest({ ...claimRequest(), leaseDurationSeconds: 0 })).toThrow(TransactionSchemaInvalid);
  });

  it("aceita lote vazio e lote canônico", () => {
    expect(() => validateOutboxClaimBatch(claimRequest(), { ...claimBatch(), claims: [] })).not.toThrow();
    expect(() => validateOutboxClaimBatch(claimRequest(), claimBatch())).not.toThrow();
  });

  it("rejeita resultado de outro tenant", () => {
    expect(() => validateOutboxClaimBatch(claimRequest(), { ...claimBatch(), tenantId: "tenant-other" }))
      .toThrow(TenantMismatch);
  });

  it("rejeita payload, event key ou attempt fora do contrato", () => {
    const base = claimBatch();
    expect(() => validateOutboxClaimBatch(claimRequest(), {
      ...base,
      claims: [{ ...base.claims[0], eventKey: "copy.unknown", attempt: 0 }],
    })).toThrow(TransactionSchemaInvalid);
  });

  it("aceita os três outcomes de settlement", () => {
    for (const outcome of ["dispatched", "retryable_failure", "terminal_failure"] as const) {
      expect(() => validateOutboxSettlementRequest(settlement(outcome))).not.toThrow();
    }
  });

  it("rejeita dispatched com erro", () => {
    expect(() => validateOutboxSettlementRequest({
      ...settlement(),
      error: { code: "PROVIDER_TIMEOUT", message: "timeout", retryable: true },
    })).toThrow(TransactionSchemaInvalid);
  });

  it("rejeita retry no passado e código não retryable", () => {
    const request = settlement("retryable_failure");
    expect(() => validateOutboxSettlementRequest({ ...request, nextAvailableAt: "2026-09-21T17:00:00Z" }))
      .toThrow(TransactionSchemaInvalid);
    expect(() => validateOutboxSettlementRequest({
      ...request,
      error: { code: "EVENT_NOT_REGISTERED", message: "não retryable", retryable: false },
    })).toThrow(TransactionSchemaInvalid);
  });

  it("rejeita falha terminal com código retryable", () => {
    expect(() => validateOutboxSettlementRequest({
      ...settlement("terminal_failure"),
      error: { code: "PROVIDER_TIMEOUT", message: "timeout", retryable: true },
    })).toThrow(TransactionSchemaInvalid);
  });

  it("valida resultado e preserva tenant, evento e consumidor", () => {
    const request = settlement();
    expect(() => validateOutboxSettlementResult(request, {
      tenantId: request.tenantId,
      eventTransactionId: request.eventTransactionId,
      consumerAgent: request.consumerAgent,
      status: "dispatched",
      attempt: 1,
      settledAt: request.settledAt,
    })).not.toThrow();
    expect(() => validateOutboxSettlementResult(request, {
      tenantId: "tenant-other",
      eventTransactionId: request.eventTransactionId,
      consumerAgent: request.consumerAgent,
      status: "dispatched",
      attempt: 1,
      settledAt: request.settledAt,
    })).toThrow(TenantMismatch);
  });
});
