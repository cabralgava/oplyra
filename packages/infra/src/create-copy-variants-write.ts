import { createHash, randomUUID } from "node:crypto";
import { comoCliente } from "./db.ts";
import {
  ConflictVersion,
  IdempotencyConflict,
  TransactionSchemaInvalid,
} from "@oplyra/core";
import type {
  CreateCopyVariantsActionInput,
  CreateCopyVariantsFingerprintPort,
  CreateCopyVariantsWriteRepositoryPort,
  CreateCopyVariantsWriteResult,
  PersistCreateCopyVariantsInput,
  StoredCreateCopyVariantsResult,
  TenantId,
  Tx,
  UnitOfWork,
} from "@oplyra/core";

type WriteUnitOfWork = Pick<UnitOfWork, "withWorkerTransaction">;
type IdempotencyRow = {
  requestFingerprint: string;
  status: "pending" | "completed";
  result: StoredCreateCopyVariantsResult | null;
};
type PgFailure = Error & { code?: string; constraint?: string };

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new TransactionSchemaInvalid("número não finito no input material");
  }
  return value;
}

export const createCopyVariantsFingerprints: CreateCopyVariantsFingerprintPort = {
  async fingerprint(materialInput: CreateCopyVariantsActionInput) {
    const canonical = JSON.stringify(canonicalValue(materialInput));
    return createHash("sha256").update(canonical).digest("hex");
  },
};

function json(value: unknown): string {
  return JSON.stringify(value);
}

function eventRef(): string {
  return `txn_evt_${randomUUID().replaceAll("-", "")}`;
}

async function existingIdempotency(
  tx: Tx,
  input: PersistCreateCopyVariantsInput,
): Promise<IdempotencyRow | null> {
  const { rows } = await comoCliente(tx).query<IdempotencyRow>(
    `select request_fingerprint as "requestFingerprint", status, result
       from content.action_idempotency
      where tenant_id = $1::uuid and action = $2 and idempotency_key = $3`,
    [input.tenantId, input.action, input.idempotencyKey],
  );
  return rows[0] ?? null;
}

async function persistInTransaction(
  tx: Tx,
  input: PersistCreateCopyVariantsInput,
  outboxEventRef: string,
): Promise<CreateCopyVariantsWriteResult> {
  const client = comoCliente(tx);
  const claim = await client.query(
    `insert into content.action_idempotency
       (tenant_id, action, idempotency_key, request_fingerprint, status, source_transaction_id)
     values ($1::uuid, $2, $3, $4, 'pending', $5)
     on conflict (tenant_id, action, idempotency_key) do nothing
     returning idempotency_key`,
    [input.tenantId, input.action, input.idempotencyKey, input.requestFingerprint, input.transactionId],
  );

  if (claim.rowCount === 0) {
    const existing = await existingIdempotency(tx, input);
    if (existing === null || existing.status !== "completed" || existing.result === null) {
      throw new TransactionSchemaInvalid("registro de idempotência não possui resultado canônico");
    }
    if (existing.requestFingerprint !== input.requestFingerprint) throw new IdempotencyConflict();
    return { ...existing.result, persistence: "replayed" };
  }

  await client.query(
    `insert into content.copy_drafts (tenant_id, draft_ref, version, source_action)
     values ($1::uuid, $2, 1, 'create_copy_variants')`,
    [input.tenantId, input.draftRef],
  );

  for (const [position, variant] of input.output.variants.entries()) {
    await client.query(
      `insert into content.copy_variants
         (tenant_id, draft_ref, variant_ref, position, headline, primary_text, cta, role,
          angle, changed_elements, constant_elements, version, extensions)
       values ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10::text[], $11::text[], $12, $13::jsonb)`,
      [
        input.tenantId, input.draftRef, variant.id, position, variant.headline, variant.primaryText,
        variant.cta, variant.role ?? null, variant.angle ?? null, variant.changedElements ?? null,
        variant.constantElements ?? null, variant.version ?? null,
        variant.extensions === undefined ? null : json(variant.extensions),
      ],
    );
  }

  const payload = {
    draftRef: input.draftRef,
    version: 1,
    sourceAction: "create_copy_variants" as const,
    variantRefs: input.output.variants.map((variant) => variant.id),
  };
  await client.query(
    `insert into content.event_outbox
       (tenant_id, event_transaction_id, event_key, draft_ref, aggregate_version,
        source_transaction_id, correlation_id, causation_id, workflow_id, task_id, context, payload)
     values ($1::uuid, $2, 'copy.draft_created', $3, 1, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb)`,
    [
      input.tenantId, outboxEventRef, input.draftRef, input.transactionId,
      input.trace.correlationId, input.trace.causationId ?? null, input.trace.workflowId ?? null,
      input.trace.taskId ?? null, json(input.context ?? {}), json(payload),
    ],
  );

  const stored: StoredCreateCopyVariantsResult = {
    tenantId: input.tenantId,
    draftRef: input.draftRef,
    version: 1,
    sourceAction: "create_copy_variants",
    output: input.output,
    outboxEventRef,
  };
  const completed = await client.query(
    `update content.action_idempotency
        set status = 'completed', draft_ref = $4, result = $5::jsonb,
            outbox_event_ref = $6, completed_at = now()
      where tenant_id = $1::uuid and action = $2 and idempotency_key = $3 and status = 'pending'`,
    [input.tenantId, input.action, input.idempotencyKey, input.draftRef, json(stored), outboxEventRef],
  );
  if (completed.rowCount !== 1) throw new TransactionSchemaInvalid("claim idempotente não foi concluído");
  return { ...stored, persistence: "created" };
}

export function criarCreateCopyVariantsWriteRepository(
  uow: WriteUnitOfWork,
): CreateCopyVariantsWriteRepositoryPort {
  return {
    async persistAtomic(input) {
      const outboxEventRef = eventRef();
      try {
        return await uow.withWorkerTransaction(
          input.tenantId as TenantId,
          input.transactionId,
          (tx) => persistInTransaction(tx, input, outboxEventRef),
        );
      } catch (error) {
        const failure = error as PgFailure;
        if (failure.code === "23505") {
          throw new ConflictVersion("draft ou versão do evento já persistidos");
        }
        throw error;
      }
    },
  };
}

