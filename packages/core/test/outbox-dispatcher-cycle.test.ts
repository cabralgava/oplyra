import { describe, expect, it, vi } from "vitest";
import { TransactionSchemaInvalid, createOutboxDispatcherCycle } from "../src/index.ts";
import type {
  ConsumerDeliveryPort,
  DeliveryFailurePolicyPort,
  OutboxDispatcherPort,
  OutboxEventClaim,
  OutboxSettlementResult,
} from "../src/index.ts";

const NOW = "2026-09-21T20:00:00.000Z";
const command = { tenantId: "tenant-a", dispatcherId: "dispatcher-01", batchSize: 10, leaseDurationSeconds: 120 };

function event(id = "txn_event_01"): OutboxEventClaim {
  return {
    eventTransactionId: id,
    eventKey: "copy.draft_created",
    schemaVersion: "1.0",
    producerAgent: "copywriting-agent",
    consumerAgent: "design-agent",
    payload: { draftRef: `draft-${id}`, version: 1, sourceAction: "create_copy_variants", variantRefs: [`variant-${id}`] },
    trace: { correlationId: `corr-${id}` },
    context: {},
    attempt: 1,
    fencingToken: `fence-${id}`,
    leaseExpiresAt: "2026-09-21T20:02:00Z",
  };
}

function dispatcher(claims: OutboxEventClaim[] = [event()]): OutboxDispatcherPort {
  return {
    claim: vi.fn(async (request) => ({
      tenantId: request.tenantId,
      dispatcherId: request.dispatcherId,
      claimedAt: request.requestedAt,
      claims,
    })),
    settle: vi.fn(async (request): Promise<OutboxSettlementResult> => {
      const status: OutboxSettlementResult["status"] = request.outcome === "dispatched"
        ? "dispatched"
        : request.outcome === "retryable_failure" ? "failed" : "dead_lettered";
      return {
        tenantId: request.tenantId,
        eventTransactionId: request.eventTransactionId,
        consumerAgent: request.consumerAgent,
        status,
        attempt: request.attempt,
        settledAt: request.settledAt,
        ...(request.nextAvailableAt ? { nextAvailableAt: request.nextAvailableAt } : {}),
      };
    }),
  };
}

const clock = { now: () => new Date(NOW) };
const unusedFailurePolicy: DeliveryFailurePolicyPort = {
  classify: vi.fn(async () => {
    throw new Error("failure policy não deveria ser chamada");
  }),
};

describe("single-cycle outbox dispatcher", () => {
  it("rejeita comando inválido antes do claim", async () => {
    const db = dispatcher();
    const cycle = createOutboxDispatcherCycle({
      dispatcher: db,
      delivery: { deliver: vi.fn(async () => ({ outcome: "delivered" as const })) },
      failurePolicy: unusedFailurePolicy,
      clock,
    });
    await expect(cycle.run({ ...command, batchSize: 0 })).rejects.toBeInstanceOf(TransactionSchemaInvalid);
    expect(db.claim).not.toHaveBeenCalled();
  });

  it("retorna ciclo vazio sem chamar delivery ou settlement", async () => {
    const db = dispatcher([]);
    const delivery: ConsumerDeliveryPort = { deliver: vi.fn() };
    const cycle = createOutboxDispatcherCycle({ dispatcher: db, delivery, failurePolicy: unusedFailurePolicy, clock });
    await expect(cycle.run(command)).resolves.toMatchObject({ claimed: 0, settled: 0, settlementFailures: 0, items: [] });
    expect(delivery.deliver).not.toHaveBeenCalled();
    expect(db.settle).not.toHaveBeenCalled();
  });

  it("entrega e confirma sucesso com o fencing atual", async () => {
    const db = dispatcher();
    const cycle = createOutboxDispatcherCycle({
      dispatcher: db,
      delivery: { deliver: vi.fn(async () => ({ outcome: "delivered" as const })) },
      failurePolicy: unusedFailurePolicy,
      clock,
    });
    const result = await cycle.run(command);
    expect(db.settle).toHaveBeenCalledWith(expect.objectContaining({
      eventTransactionId: "txn_event_01",
      attempt: 1,
      fencingToken: "fence-txn_event_01",
      outcome: "dispatched",
      settledAt: NOW,
    }));
    expect(result).toMatchObject({ claimed: 1, settlementAttempts: 1, settled: 1, settlementFailures: 0 });
  });

  it("propaga outcome retryable sem calcular backoff", async () => {
    const db = dispatcher();
    const cycle = createOutboxDispatcherCycle({
      dispatcher: db,
      delivery: { deliver: vi.fn(async () => ({
        outcome: "retryable_failure" as const,
        nextAvailableAt: "2026-09-21T20:01:00Z",
        error: { code: "PROVIDER_TIMEOUT" as const, message: "timeout", retryable: true },
      })) },
      failurePolicy: unusedFailurePolicy,
      clock,
    });
    await cycle.run(command);
    expect(db.settle).toHaveBeenCalledWith(expect.objectContaining({
      outcome: "retryable_failure",
      nextAvailableAt: "2026-09-21T20:01:00Z",
      error: expect.objectContaining({ code: "PROVIDER_TIMEOUT", retryable: true }),
    }));
  });

  it("propaga falha terminal para dead-letter settlement", async () => {
    const db = dispatcher();
    const cycle = createOutboxDispatcherCycle({
      dispatcher: db,
      delivery: { deliver: vi.fn(async () => ({
        outcome: "terminal_failure" as const,
        error: { code: "EVENT_NOT_REGISTERED" as const, message: "evento", retryable: false },
      })) },
      failurePolicy: unusedFailurePolicy,
      clock,
    });
    await cycle.run(command);
    expect(db.settle).toHaveBeenCalledWith(expect.objectContaining({ outcome: "terminal_failure" }));
  });

  it("classifica exceção do consumer por política injetada", async () => {
    const db = dispatcher();
    const thrown = new Error("upstream caiu");
    const failurePolicy: DeliveryFailurePolicyPort = {
      classify: vi.fn(async () => ({
        outcome: "retryable_failure" as const,
        nextAvailableAt: "2026-09-21T20:02:00Z",
        error: { code: "UPSTREAM_SERVICE_UNAVAILABLE" as const, message: "upstream", retryable: true },
      })),
    };
    const cycle = createOutboxDispatcherCycle({
      dispatcher: db,
      delivery: { deliver: vi.fn(async () => { throw thrown; }) },
      failurePolicy,
      clock,
    });
    await cycle.run(command);
    expect(failurePolicy.classify).toHaveBeenCalledWith(thrown, expect.objectContaining({
      tenantId: "tenant-a",
      dispatcherId: "dispatcher-01",
      event: expect.objectContaining({ eventTransactionId: "txn_event_01" }),
    }), NOW);
    expect(db.settle).toHaveBeenCalledWith(expect.objectContaining({ outcome: "retryable_failure" }));
  });

  it("rejeita classificação inválida antes do settlement", async () => {
    const db = dispatcher();
    const cycle = createOutboxDispatcherCycle({
      dispatcher: db,
      delivery: { deliver: vi.fn(async () => { throw new Error("falha"); }) },
      failurePolicy: {
        classify: vi.fn(async () => ({
          outcome: "retryable_failure" as const,
          nextAvailableAt: "2026-09-21T19:00:00Z",
          error: { code: "PROVIDER_TIMEOUT" as const, message: "timeout", retryable: true },
        })),
      },
      clock,
    });
    await expect(cycle.run(command)).rejects.toBeInstanceOf(TransactionSchemaInvalid);
    expect(db.settle).not.toHaveBeenCalled();
  });

  it("continua o lote após falha de settlement e a registra explicitamente", async () => {
    const db = dispatcher([event("txn_a"), event("txn_b")]);
    const settle = vi.mocked(db.settle);
    settle.mockRejectedValueOnce(new Error("settlement indisponível"));
    const cycle = createOutboxDispatcherCycle({
      dispatcher: db,
      delivery: { deliver: vi.fn(async () => ({ outcome: "delivered" as const })) },
      failurePolicy: unusedFailurePolicy,
      clock,
    });
    const result = await cycle.run(command);
    expect(settle).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ claimed: 2, settlementAttempts: 2, settled: 1, settlementFailures: 1 });
    expect(result.items.map((item) => item.status)).toEqual(["settlement_failed", "settled"]);
  });

  it("propaga falha de claim sem executar consumer", async () => {
    const db = dispatcher();
    vi.mocked(db.claim).mockRejectedValueOnce(new Error("claim indisponível"));
    const delivery = { deliver: vi.fn(async () => ({ outcome: "delivered" as const })) };
    const cycle = createOutboxDispatcherCycle({ dispatcher: db, delivery, failurePolicy: unusedFailurePolicy, clock });
    await expect(cycle.run(command)).rejects.toThrow("claim indisponível");
    expect(delivery.deliver).not.toHaveBeenCalled();
  });
});
