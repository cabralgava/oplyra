import { ConflictVersion, TenantMismatch, TransactionSchemaInvalid } from "../domain/errors.ts";
import type { CopyVariantSnapshot } from "./content-reference-resolver.ts";

export type CreateCopyVariantsActionInput = {
  readonly objective: string;
  readonly quantity: number;
  readonly variantRole?: "reference" | "challenger";
  readonly testedDimension?: string;
  readonly angle?: string;
  readonly channel?: string;
  readonly format?: string;
  readonly language?: string;
  readonly sourceCopyRef?: string;
  readonly assetRefs?: readonly string[];
  readonly supersedesTransactionId?: string;
  readonly objectId?: string;
  readonly expectedVersion?: number;
  readonly extensions?: Readonly<Record<string, unknown>>;
};

export type CreateCopyVariantsActionOutput = {
  readonly variants: readonly CopyVariantSnapshot[];
  readonly extensions?: Readonly<Record<string, unknown>>;
};

export type CreateCopyVariantsTrace = {
  readonly correlationId: string;
  readonly causationId?: string;
  readonly workflowId?: string;
  readonly taskId?: string;
};

export type CreateCopyVariantsWriteCommand = {
  readonly tenantId: string;
  readonly transactionId: string;
  readonly idempotencyKey: string;
  readonly draftRef: string;
  readonly actionInput: CreateCopyVariantsActionInput;
  readonly output: CreateCopyVariantsActionOutput;
  readonly trace: CreateCopyVariantsTrace;
  readonly context?: Readonly<Record<string, unknown>>;
};

export type PersistCreateCopyVariantsInput = CreateCopyVariantsWriteCommand & {
  readonly action: "create_copy_variants";
  readonly requestFingerprint: string;
};

export type StoredCreateCopyVariantsResult = {
  readonly tenantId: string;
  readonly draftRef: string;
  readonly version: number;
  readonly sourceAction: "create_copy_variants";
  readonly output: CreateCopyVariantsActionOutput;
  readonly outboxEventRef: string;
};

export type CreateCopyVariantsWriteResult = StoredCreateCopyVariantsResult & {
  readonly persistence: "created" | "replayed";
};

export interface CreateCopyVariantsWriteRepositoryPort {
  /** Persiste idempotência, draft, variantes e outbox em uma única transação. */
  persistAtomic(input: PersistCreateCopyVariantsInput): Promise<CreateCopyVariantsWriteResult>;
}

export interface CreateCopyVariantsFingerprintPort {
  fingerprint(materialInput: CreateCopyVariantsActionInput): Promise<string>;
}

export interface CreateCopyVariantsWriterPort {
  write(command: CreateCopyVariantsWriteCommand): Promise<CreateCopyVariantsWriteResult>;
}

export type CreateCopyVariantsWriterDependencies = {
  readonly repository: CreateCopyVariantsWriteRepositoryPort;
  readonly fingerprints: CreateCopyVariantsFingerprintPort;
};

const inputKeys = new Set([
  "objective", "quantity", "variantRole", "testedDimension", "angle", "channel", "format",
  "language", "sourceCopyRef", "assetRefs", "supersedesTransactionId", "objectId",
  "expectedVersion", "extensions",
]);
const variantKeys = new Set([
  "id", "headline", "primaryText", "cta", "role", "angle", "changedElements",
  "constantElements", "version", "extensions",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function validOptionalString(value: unknown): boolean {
  return value === undefined || nonEmpty(value);
}

function validStringArray(value: unknown): boolean {
  return value === undefined || (
    Array.isArray(value) && value.every(nonEmpty) && new Set(value).size === value.length
  );
}

function validExtensions(value: unknown): boolean {
  return value === undefined || isRecord(value);
}

function validateVariant(variant: CopyVariantSnapshot): void {
  if (
    !isRecord(variant) ||
    Object.keys(variant).some((key) => !variantKeys.has(key)) ||
    !nonEmpty(variant.id) ||
    !nonEmpty(variant.headline) ||
    !nonEmpty(variant.primaryText) ||
    !nonEmpty(variant.cta) ||
    (variant.role !== undefined && variant.role !== "reference" && variant.role !== "challenger") ||
    !validOptionalString(variant.angle) ||
    !validStringArray(variant.changedElements) ||
    !validStringArray(variant.constantElements) ||
    (variant.version !== undefined && (!Number.isInteger(variant.version) || variant.version < 1)) ||
    !validExtensions(variant.extensions)
  ) {
    throw new TransactionSchemaInvalid("variant não atende ao output de create_copy_variants");
  }
}

function validateOutput(output: CreateCopyVariantsActionOutput, expectedQuantity: number): void {
  if (!isRecord(output) || !Array.isArray(output.variants) || output.variants.length === 0 || !validExtensions(output.extensions)) {
    throw new TransactionSchemaInvalid("output de create_copy_variants inválido");
  }
  output.variants.forEach(validateVariant);
  if (output.variants.length !== expectedQuantity) {
    throw new TransactionSchemaInvalid("quantity diverge de variants.length");
  }
  if (new Set(output.variants.map((variant) => variant.id)).size !== output.variants.length) {
    throw new TransactionSchemaInvalid("variant id duplicado");
  }
}

export function validateCreateCopyVariantsWriteCommand(command: CreateCopyVariantsWriteCommand): void {
  const input = command.actionInput;
  if (
    !nonEmpty(command.tenantId) ||
    !nonEmpty(command.transactionId) ||
    !nonEmpty(command.idempotencyKey) ||
    !nonEmpty(command.draftRef) ||
    !isRecord(input) ||
    Object.keys(input).some((key) => !inputKeys.has(key)) ||
    !nonEmpty(input.objective) ||
    !Number.isInteger(input.quantity) ||
    input.quantity < 1 ||
    (input.variantRole !== undefined && input.variantRole !== "reference" && input.variantRole !== "challenger") ||
    !validOptionalString(input.testedDimension) ||
    !validOptionalString(input.angle) ||
    !validOptionalString(input.channel) ||
    !validOptionalString(input.format) ||
    !validOptionalString(input.language) ||
    !validOptionalString(input.sourceCopyRef) ||
    !validStringArray(input.assetRefs) ||
    !validOptionalString(input.supersedesTransactionId) ||
    !validOptionalString(input.objectId) ||
    (input.expectedVersion !== undefined && (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0)) ||
    !validExtensions(input.extensions) ||
    !isRecord(command.trace) ||
    !nonEmpty(command.trace.correlationId) ||
    !validOptionalString(command.trace.causationId) ||
    !validOptionalString(command.trace.workflowId) ||
    !validOptionalString(command.trace.taskId) ||
    !validExtensions(command.context)
  ) {
    throw new TransactionSchemaInvalid();
  }
  if (input.objectId !== undefined && input.objectId !== command.draftRef) {
    throw new TransactionSchemaInvalid("objectId diverge de draftRef");
  }
  if (input.expectedVersion !== undefined && input.expectedVersion !== 0) {
    throw new ConflictVersion("writer inicial aceita somente criação com expectedVersion 0");
  }
  validateOutput(command.output, input.quantity);
}

function validateStoredResult(command: CreateCopyVariantsWriteCommand, result: CreateCopyVariantsWriteResult): void {
  if (result.tenantId !== command.tenantId) throw new TenantMismatch();
  if (
    !nonEmpty(result.draftRef) ||
    !Number.isInteger(result.version) ||
    result.version < 1 ||
    result.sourceAction !== "create_copy_variants" ||
    !nonEmpty(result.outboxEventRef) ||
    (result.persistence !== "created" && result.persistence !== "replayed")
  ) {
    throw new TransactionSchemaInvalid("resultado persistido inválido");
  }
  validateOutput(result.output, command.actionInput.quantity);
}

export function createCreateCopyVariantsWriter(
  dependencies: CreateCopyVariantsWriterDependencies,
): CreateCopyVariantsWriterPort {
  return {
    async write(command) {
      validateCreateCopyVariantsWriteCommand(command);
      const requestFingerprint = await dependencies.fingerprints.fingerprint(command.actionInput);
      if (!/^[a-f0-9]{64}$/.test(requestFingerprint)) {
        throw new TransactionSchemaInvalid("fingerprint SHA-256 inválido");
      }
      const result = await dependencies.repository.persistAtomic({
        ...command,
        action: "create_copy_variants",
        requestFingerprint,
      });
      validateStoredResult(command, result);
      return result;
    },
  };
}

