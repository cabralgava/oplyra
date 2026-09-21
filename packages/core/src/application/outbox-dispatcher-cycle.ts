import { TransactionSchemaInvalid } from "../domain/errors.ts";
import type { Clock } from "./ports.ts";
import {
  validateOutboxClaimRequest,
  validateOutboxSettlementRequest,
} from "./outbox-dispatcher.ts";
import type {
  OutboxDeliveryError,
  OutboxDispatcherPort,
  OutboxEventClaim,
  OutboxSettlementRequest,
  OutboxSettlementResult,
} from "./outbox-dispatcher.ts";

export type ConsumerDeliveryOutcome =
  | { readonly outcome: "delivered" }
  | {
      readonly outcome: "retryable_failure";
      readonly nextAvailableAt: string;
      readonly error: OutboxDeliveryError;
    }
  | {
      readonly outcome: "terminal_failure";
      readonly error: OutboxDeliveryError;
    };

export type ConsumerDeliveryRequest = {
  readonly tenantId: string;
  readonly dispatcherId: string;
  readonly event: OutboxEventClaim;
};

export interface ConsumerDeliveryPort {
  deliver(request: ConsumerDeliveryRequest): Promise<ConsumerDeliveryOutcome>;
}

export interface DeliveryFailurePolicyPort {
  classify(error: unknown, request: ConsumerDeliveryRequest, failedAt: string): Promise<Exclude<ConsumerDeliveryOutcome, { outcome: "delivered" }>>;
}

export type RunOutboxDispatcherCycleCommand = {
  readonly tenantId: string;
  readonly dispatcherId: string;
  readonly batchSize: number;
  readonly leaseDurationSeconds: number;
};

export type OutboxDispatcherCycleItem = {
  readonly eventTransactionId: string;
  readonly attempt: number;
  readonly deliveryOutcome: ConsumerDeliveryOutcome["outcome"];
  readonly status: "settled" | "settlement_failed";
  readonly settlement?: OutboxSettlementResult;
};

export type OutboxDispatcherCycleResult = {
  readonly tenantId: string;
  readonly dispatcherId: string;
  readonly startedAt: string;
  readonly claimed: number;
  readonly settlementAttempts: number;
  readonly settled: number;
  readonly settlementFailures: number;
  readonly items: readonly OutboxDispatcherCycleItem[];
};

export interface OutboxDispatcherCyclePort {
  run(command: RunOutboxDispatcherCycleCommand): Promise<OutboxDispatcherCycleResult>;
}

export type OutboxDispatcherCycleDependencies = {
  readonly dispatcher: OutboxDispatcherPort;
  readonly delivery: ConsumerDeliveryPort;
  readonly failurePolicy: DeliveryFailurePolicyPort;
  readonly clock: Clock;
};

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function positiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1;
}

function settlementRequest(
  command: RunOutboxDispatcherCycleCommand,
  claim: OutboxEventClaim,
  outcome: ConsumerDeliveryOutcome,
  settledAt: string,
): OutboxSettlementRequest {
  const base = {
    tenantId: command.tenantId,
    dispatcherId: command.dispatcherId,
    eventTransactionId: claim.eventTransactionId,
    consumerAgent: claim.consumerAgent,
    attempt: claim.attempt,
    fencingToken: claim.fencingToken,
    settledAt,
  } as const;

  if (outcome.outcome === "delivered") return { ...base, outcome: "dispatched" };
  if (outcome.outcome === "retryable_failure") {
    return {
      ...base,
      outcome: "retryable_failure",
      nextAvailableAt: outcome.nextAvailableAt,
      error: outcome.error,
    };
  }
  return { ...base, outcome: "terminal_failure", error: outcome.error };
}

export function createOutboxDispatcherCycle(
  dependencies: OutboxDispatcherCycleDependencies,
): OutboxDispatcherCyclePort {
  return {
    async run(command) {
      if (!nonEmpty(command.tenantId) || !nonEmpty(command.dispatcherId)
          || !positiveInteger(command.batchSize) || !positiveInteger(command.leaseDurationSeconds)) {
        throw new TransactionSchemaInvalid("comando do ciclo do dispatcher inválido");
      }

      const startedAt = dependencies.clock.now().toISOString();
      const claimRequest = { ...command, requestedAt: startedAt };
      validateOutboxClaimRequest(claimRequest);
      const batch = await dependencies.dispatcher.claim(claimRequest);
      const items: OutboxDispatcherCycleItem[] = [];

      for (const event of batch.claims) {
        const deliveryRequest: ConsumerDeliveryRequest = {
          tenantId: command.tenantId,
          dispatcherId: command.dispatcherId,
          event,
        };
        let deliveryOutcome: ConsumerDeliveryOutcome;
        try {
          deliveryOutcome = await dependencies.delivery.deliver(deliveryRequest);
        } catch (error) {
          deliveryOutcome = await dependencies.failurePolicy.classify(
            error,
            deliveryRequest,
            dependencies.clock.now().toISOString(),
          );
        }

        const request = settlementRequest(
          command,
          event,
          deliveryOutcome,
          dependencies.clock.now().toISOString(),
        );
        validateOutboxSettlementRequest(request);

        try {
          const settlement = await dependencies.dispatcher.settle(request);
          items.push({
            eventTransactionId: event.eventTransactionId,
            attempt: event.attempt,
            deliveryOutcome: deliveryOutcome.outcome,
            status: "settled",
            settlement,
          });
        } catch {
          // A entrega pode ter ocorrido. Não tentamos repetir nem reclassificar
          // settlement aqui; o lease/fencing persistente governa a recuperação.
          items.push({
            eventTransactionId: event.eventTransactionId,
            attempt: event.attempt,
            deliveryOutcome: deliveryOutcome.outcome,
            status: "settlement_failed",
          });
        }
      }

      const settled = items.filter((item) => item.status === "settled").length;
      return {
        tenantId: command.tenantId,
        dispatcherId: command.dispatcherId,
        startedAt,
        claimed: batch.claims.length,
        settlementAttempts: batch.claims.length,
        settled,
        settlementFailures: batch.claims.length - settled,
        items,
      };
    },
  };
}
