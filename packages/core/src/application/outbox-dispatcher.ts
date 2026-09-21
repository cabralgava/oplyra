import { TenantMismatch, TransactionSchemaInvalid } from "../domain/errors.ts";

export type CopyDraftCreatedEventPayload = {
  readonly draftRef: string;
  readonly version: number;
  readonly sourceAction: "create_copy_variants";
  readonly variantRefs: readonly string[];
  readonly extensions?: Readonly<Record<string, unknown>>;
};

export type OutboxEventTrace = {
  readonly correlationId: string;
  readonly causationId?: string;
  readonly workflowId?: string;
  readonly taskId?: string;
};

export type OutboxEventClaim = {
  readonly eventTransactionId: string;
  readonly eventKey: "copy.draft_created";
  readonly schemaVersion: "1.0";
  readonly producerAgent: "copywriting-agent";
  readonly consumerAgent: "design-agent";
  readonly payload: CopyDraftCreatedEventPayload;
  readonly trace: OutboxEventTrace;
  readonly context: Readonly<Record<string, unknown>>;
  readonly attempt: number;
  readonly fencingToken: string;
  readonly leaseExpiresAt: string;
};

export type OutboxClaimRequest = {
  readonly tenantId: string;
  readonly dispatcherId: string;
  readonly batchSize: number;
  readonly leaseDurationSeconds: number;
  readonly requestedAt: string;
};

export type OutboxClaimBatch = {
  readonly tenantId: string;
  readonly dispatcherId: string;
  readonly claimedAt: string;
  readonly claims: readonly OutboxEventClaim[];
};

export type OutboxDeliveryError = {
  readonly code: "INTEGRATION_UNAVAILABLE" | "PROVIDER_TIMEOUT" | "UPSTREAM_SERVICE_UNAVAILABLE" |
    "EVENT_NOT_REGISTERED" | "INVALID_STATE_TRANSITION";
  readonly message: string;
  readonly retryable: boolean;
};

export type OutboxSettlementRequest = {
  readonly tenantId: string;
  readonly dispatcherId: string;
  readonly eventTransactionId: string;
  readonly consumerAgent: "design-agent";
  readonly attempt: number;
  readonly fencingToken: string;
  readonly outcome: "dispatched" | "retryable_failure" | "terminal_failure";
  readonly settledAt: string;
  readonly nextAvailableAt?: string;
  readonly error?: OutboxDeliveryError;
};

export type OutboxSettlementResult = {
  readonly tenantId: string;
  readonly eventTransactionId: string;
  readonly consumerAgent: "design-agent";
  readonly status: "dispatched" | "failed" | "dead_lettered" | "duplicate";
  readonly attempt: number;
  readonly settledAt: string;
  readonly nextAvailableAt?: string;
};

export interface OutboxDispatcherPort {
  claim(request: OutboxClaimRequest): Promise<OutboxClaimBatch>;
  settle(request: OutboxSettlementRequest): Promise<OutboxSettlementResult>;
}

const retryableCodes = new Set(["INTEGRATION_UNAVAILABLE", "PROVIDER_TIMEOUT", "UPSTREAM_SERVICE_UNAVAILABLE"]);
const terminalCodes = new Set(["EVENT_NOT_REGISTERED", "INVALID_STATE_TRANSITION"]);
const claimKeys = new Set([
  "eventTransactionId", "eventKey", "schemaVersion", "producerAgent", "consumerAgent", "payload",
  "trace", "context", "attempt", "fencingToken", "leaseExpiresAt",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function timestamp(value: unknown): value is string {
  return nonEmpty(value) && !Number.isNaN(Date.parse(value));
}

function positiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1;
}

function validatePayload(value: unknown): value is CopyDraftCreatedEventPayload {
  if (!isRecord(value)) return false;
  const allowed = new Set(["draftRef", "version", "sourceAction", "variantRefs", "extensions"]);
  return Object.keys(value).every((key) => allowed.has(key))
    && nonEmpty(value.draftRef)
    && positiveInteger(value.version)
    && value.sourceAction === "create_copy_variants"
    && Array.isArray(value.variantRefs)
    && value.variantRefs.length > 0
    && value.variantRefs.every(nonEmpty)
    && new Set(value.variantRefs).size === value.variantRefs.length
    && (value.extensions === undefined || isRecord(value.extensions));
}

function validateTrace(value: unknown): value is OutboxEventTrace {
  if (!isRecord(value)) return false;
  const allowed = new Set(["correlationId", "causationId", "workflowId", "taskId"]);
  return Object.keys(value).every((key) => allowed.has(key))
    && nonEmpty(value.correlationId)
    && [value.causationId, value.workflowId, value.taskId].every((item) => item === undefined || nonEmpty(item));
}

function validateClaim(value: unknown): value is OutboxEventClaim {
  if (!isRecord(value) || !Object.keys(value).every((key) => claimKeys.has(key))) return false;
  return nonEmpty(value.eventTransactionId)
    && value.eventKey === "copy.draft_created"
    && value.schemaVersion === "1.0"
    && value.producerAgent === "copywriting-agent"
    && value.consumerAgent === "design-agent"
    && validatePayload(value.payload)
    && validateTrace(value.trace)
    && isRecord(value.context)
    && positiveInteger(value.attempt)
    && nonEmpty(value.fencingToken)
    && timestamp(value.leaseExpiresAt);
}

export function validateOutboxClaimRequest(request: OutboxClaimRequest): void {
  if (!isRecord(request) || !nonEmpty(request.tenantId) || !nonEmpty(request.dispatcherId)
      || !positiveInteger(request.batchSize) || !positiveInteger(request.leaseDurationSeconds)
      || !timestamp(request.requestedAt)) {
    throw new TransactionSchemaInvalid("claim da outbox inválido");
  }
}

export function validateOutboxClaimBatch(request: OutboxClaimRequest, value: unknown): asserts value is OutboxClaimBatch {
  if (!isRecord(value) || value.tenantId !== request.tenantId) throw new TenantMismatch();
  if (value.dispatcherId !== request.dispatcherId || !timestamp(value.claimedAt)
      || !Array.isArray(value.claims) || !value.claims.every(validateClaim)) {
    throw new TransactionSchemaInvalid("resultado de claim da outbox inválido");
  }
}

export function validateOutboxSettlementRequest(request: OutboxSettlementRequest): void {
  const basic = isRecord(request) && nonEmpty(request.tenantId) && nonEmpty(request.dispatcherId)
    && nonEmpty(request.eventTransactionId) && request.consumerAgent === "design-agent"
    && positiveInteger(request.attempt) && nonEmpty(request.fencingToken) && timestamp(request.settledAt)
    && ["dispatched", "retryable_failure", "terminal_failure"].includes(request.outcome);
  if (!basic) throw new TransactionSchemaInvalid("settlement da outbox inválido");

  if (request.outcome === "dispatched") {
    if (request.nextAvailableAt !== undefined || request.error !== undefined) {
      throw new TransactionSchemaInvalid("dispatched não aceita retry ou erro");
    }
    return;
  }
  if (!isRecord(request.error) || !nonEmpty(request.error.message)) {
    throw new TransactionSchemaInvalid("falha exige erro estruturado");
  }
  if (request.outcome === "retryable_failure") {
    if (!timestamp(request.nextAvailableAt) || Date.parse(request.nextAvailableAt) <= Date.parse(request.settledAt)
        || request.error.retryable !== true || !retryableCodes.has(request.error.code)) {
      throw new TransactionSchemaInvalid("retry exige erro canônico retryable e próxima disponibilidade futura");
    }
  } else if (request.nextAvailableAt !== undefined || request.error.retryable !== false
      || !terminalCodes.has(request.error.code)) {
    throw new TransactionSchemaInvalid("falha terminal exige erro canônico não retryable");
  }
}

export function validateOutboxSettlementResult(
  request: OutboxSettlementRequest,
  value: unknown,
): asserts value is OutboxSettlementResult {
  if (!isRecord(value) || value.tenantId !== request.tenantId) throw new TenantMismatch();
  if (value.eventTransactionId !== request.eventTransactionId || value.consumerAgent !== request.consumerAgent
      || !["dispatched", "failed", "dead_lettered", "duplicate"].includes(String(value.status))
      || !positiveInteger(value.attempt) || !timestamp(value.settledAt)
      || (value.nextAvailableAt !== undefined && !timestamp(value.nextAvailableAt))) {
    throw new TransactionSchemaInvalid("resultado de settlement da outbox inválido");
  }
}
