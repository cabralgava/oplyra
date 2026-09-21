import { describe, expect, it, vi } from "vitest";
import {
  ConflictVersion,
  TransactionSchemaInvalid,
  createCreateCopyVariantsWriter,
} from "../src/index.ts";
import type {
  CreateCopyVariantsWriteCommand,
  CreateCopyVariantsWriteRepositoryPort,
} from "../src/index.ts";

const HASH = "a".repeat(64);
const command = (): CreateCopyVariantsWriteCommand => ({
  tenantId: "11111111-1111-4111-8111-111111111111",
  transactionId: "txn_cr012_01",
  idempotencyKey: "task-copy-v1",
  draftRef: "draft-cr012",
  actionInput: { objective: "Criar variações", quantity: 2, channel: "linkedin" },
  output: {
    variants: [
      { id: "var-a", headline: "A", primaryText: "Texto A", cta: "request_demo" },
      { id: "var-b", headline: "B", primaryText: "Texto B", cta: "request_demo" },
    ],
  },
  trace: { correlationId: "corr-cr012", taskId: "task-cr012" },
});

function repository(): CreateCopyVariantsWriteRepositoryPort {
  return {
    persistAtomic: vi.fn(async (input) => ({
      tenantId: input.tenantId,
      draftRef: input.draftRef,
      version: 1,
      sourceAction: "create_copy_variants" as const,
      output: input.output,
      outboxEventRef: "txn_event_cr012",
      persistence: "created" as const,
    })),
  };
}

describe("create_copy_variants writer", () => {
  it("valida, calcula fingerprint e delega a persistência atômica", async () => {
    const repo = repository();
    const fingerprints = { fingerprint: vi.fn(async () => HASH) };
    const writer = createCreateCopyVariantsWriter({ repository: repo, fingerprints });
    await expect(writer.write(command())).resolves.toMatchObject({ persistence: "created", version: 1 });
    expect(fingerprints.fingerprint).toHaveBeenCalledWith(command().actionInput);
    expect(repo.persistAtomic).toHaveBeenCalledWith(expect.objectContaining({
      action: "create_copy_variants",
      requestFingerprint: HASH,
    }));
  });

  it("rejeita chave de idempotência ausente antes das dependências", async () => {
    const repo = repository();
    const fingerprints = { fingerprint: vi.fn(async () => HASH) };
    const writer = createCreateCopyVariantsWriter({ repository: repo, fingerprints });
    await expect(writer.write({ ...command(), idempotencyKey: "" })).rejects.toBeInstanceOf(TransactionSchemaInvalid);
    expect(fingerprints.fingerprint).not.toHaveBeenCalled();
    expect(repo.persistAtomic).not.toHaveBeenCalled();
  });

  it("rejeita quantity diferente da quantidade de variantes", async () => {
    const writer = createCreateCopyVariantsWriter({ repository: repository(), fingerprints: { fingerprint: async () => HASH } });
    await expect(writer.write({ ...command(), actionInput: { ...command().actionInput, quantity: 3 } }))
      .rejects.toBeInstanceOf(TransactionSchemaInvalid);
  });

  it("rejeita ids de variante duplicados", async () => {
    const base = command();
    const writer = createCreateCopyVariantsWriter({ repository: repository(), fingerprints: { fingerprint: async () => HASH } });
    await expect(writer.write({
      ...base,
      output: { variants: [base.output.variants[0]!, base.output.variants[0]!] },
    })).rejects.toBeInstanceOf(TransactionSchemaInvalid);
  });

  it("limita a primeira implementação a expectedVersion 0", async () => {
    const writer = createCreateCopyVariantsWriter({ repository: repository(), fingerprints: { fingerprint: async () => HASH } });
    await expect(writer.write({ ...command(), actionInput: { ...command().actionInput, expectedVersion: 1 } }))
      .rejects.toBeInstanceOf(ConflictVersion);
  });

  it("exige objectId igual ao draftRef quando informado", async () => {
    const writer = createCreateCopyVariantsWriter({ repository: repository(), fingerprints: { fingerprint: async () => HASH } });
    await expect(writer.write({ ...command(), actionInput: { ...command().actionInput, objectId: "outro-draft" } }))
      .rejects.toBeInstanceOf(TransactionSchemaInvalid);
  });

  it("rejeita fingerprint fora do formato SHA-256", async () => {
    const repo = repository();
    const writer = createCreateCopyVariantsWriter({ repository: repo, fingerprints: { fingerprint: async () => "invalido" } });
    await expect(writer.write(command())).rejects.toBeInstanceOf(TransactionSchemaInvalid);
    expect(repo.persistAtomic).not.toHaveBeenCalled();
  });

  it("rejeita resultado retornado para outro tenant", async () => {
    const repo: CreateCopyVariantsWriteRepositoryPort = {
      persistAtomic: async (input) => ({
        tenantId: "22222222-2222-4222-8222-222222222222",
        draftRef: input.draftRef,
        version: 1,
        sourceAction: "create_copy_variants",
        output: input.output,
        outboxEventRef: "txn_event_cr012",
        persistence: "created",
      }),
    };
    const writer = createCreateCopyVariantsWriter({ repository: repo, fingerprints: { fingerprint: async () => HASH } });
    await expect(writer.write(command())).rejects.toMatchObject({ code: "TENANT_MISMATCH" });
  });
});

