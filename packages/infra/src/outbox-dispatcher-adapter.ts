import {
  IntegrationUnavailable,
  InvalidStateTransition,
  TenantMismatch,
  TransactionSchemaInvalid,
  validateOutboxClaimBatch,
  validateOutboxClaimRequest,
  validateOutboxSettlementRequest,
  validateOutboxSettlementResult,
} from "@oplyra/core";
import type {
  OutboxClaimBatch,
  OutboxClaimRequest,
  OutboxDispatcherPort,
  OutboxSettlementRequest,
  OutboxSettlementResult,
  TenantId,
  Tx,
  UnitOfWork,
} from "@oplyra/core";
import { comoCliente } from "./db.ts";

type DispatcherUnitOfWork = Pick<UnitOfWork, "withDispatcherTransaction">;
type PgFailure = Error & { code?: string };

function mapDatabaseFailure(error: unknown): never {
  const failure = error as PgFailure;
  if (failure.code === "55000" && failure.message.includes("INVALID_STATE_TRANSITION")) {
    throw new InvalidStateTransition();
  }
  if (failure.code === "42501") throw new TenantMismatch();
  if (failure.code === "22023") throw new TransactionSchemaInvalid(failure.message);
  if (failure.code?.startsWith("08") || failure.code === "57P01" || failure.code === "57P02" || failure.code === "57P03") {
    throw new IntegrationUnavailable();
  }
  throw error;
}

async function claimInTransaction(tx: Tx, request: OutboxClaimRequest): Promise<OutboxClaimBatch> {
  const { rows } = await comoCliente(tx).query<{ claim: unknown }>(
    `select app.claim_outbox_events($1::uuid, $2, $3, $4, $5::timestamptz) claim`,
    [request.tenantId, request.dispatcherId, request.batchSize, request.leaseDurationSeconds, request.requestedAt],
  );
  const result = rows[0]?.claim;
  validateOutboxClaimBatch(request, result);
  return result;
}

async function settleInTransaction(tx: Tx, request: OutboxSettlementRequest): Promise<OutboxSettlementResult> {
  const { rows } = await comoCliente(tx).query<{ settlement: unknown }>(
    `select app.settle_outbox_event(
       $1::uuid, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz, $10::jsonb
     ) settlement`,
    [
      request.tenantId,
      request.dispatcherId,
      request.eventTransactionId,
      request.consumerAgent,
      request.attempt,
      request.fencingToken,
      request.outcome,
      request.settledAt,
      request.nextAvailableAt ?? null,
      request.error === undefined ? null : JSON.stringify(request.error),
    ],
  );
  const result = rows[0]?.settlement;
  validateOutboxSettlementResult(request, result);
  return result;
}

export function criarOutboxDispatcherAdapter(uow: DispatcherUnitOfWork): OutboxDispatcherPort {
  return {
    async claim(request) {
      validateOutboxClaimRequest(request);
      try {
        return await uow.withDispatcherTransaction(
          request.tenantId as TenantId,
          request.dispatcherId,
          (tx) => claimInTransaction(tx, request),
        );
      } catch (error) {
        mapDatabaseFailure(error);
      }
    },

    async settle(request) {
      validateOutboxSettlementRequest(request);
      try {
        return await uow.withDispatcherTransaction(
          request.tenantId as TenantId,
          request.dispatcherId,
          (tx) => settleInTransaction(tx, request),
        );
      } catch (error) {
        mapDatabaseFailure(error);
      }
    },
  };
}
