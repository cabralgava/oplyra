import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  IdempotencyConflict,
  TransactionSchemaInvalid,
  createContentReferenceResolver,
  createCreateCopyVariantsWriter,
} from "@oplyra/core";
import type { CreateCopyVariantsWriteCommand, TenantId } from "@oplyra/core";
import { criarUnitOfWork } from "../src/db.ts";
import { criarContentReferenceRepository } from "../src/content-reference-repository.ts";
import {
  createCopyVariantsFingerprints,
  criarCreateCopyVariantsWriteRepository,
} from "../src/create-copy-variants-write.ts";

const ADMIN = "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const WORKER = "postgresql://oplyra_worker_login:local-worker-2026@127.0.0.1:54422/postgres";
const TA = "11111111-1111-4111-8111-111111111111" as TenantId;
const TB = "22222222-2222-4222-8222-222222222222" as TenantId;
const admin = criarUnitOfWork({ connectionString: ADMIN });
const worker = criarUnitOfWork({ connectionString: WORKER });
const writer = createCreateCopyVariantsWriter({
  repository: criarCreateCopyVariantsWriteRepository(worker),
  fingerprints: createCopyVariantsFingerprints,
});

function command(
  suffix: string,
  options: { tenantId?: TenantId; key?: string; objective?: string; draftRef?: string } = {},
): CreateCopyVariantsWriteCommand {
  const draftRef = options.draftRef ?? `cr012-draft-${suffix}`;
  return {
    tenantId: options.tenantId ?? TA,
    transactionId: `txn_cr012_${suffix}`,
    idempotencyKey: options.key ?? `cr012-key-${suffix}`,
    draftRef,
    actionInput: { objective: options.objective ?? `Objetivo ${suffix}`, quantity: 2, channel: "linkedin" },
    output: {
      variants: [
        { id: `cr012-${suffix}-a`, headline: `Headline ${suffix} A`, primaryText: "Texto A", cta: "request_demo" },
        { id: `cr012-${suffix}-b`, headline: `Headline ${suffix} B`, primaryText: "Texto B", cta: "request_demo" },
      ],
    },
    trace: { correlationId: `corr-cr012-${suffix}`, taskId: `task-cr012-${suffix}` },
    context: { initiativeId: "initiative-cr012" },
  };
}

async function cleanup(): Promise<void> {
  await admin.pool.query("delete from content.action_idempotency where idempotency_key like 'cr012-%'");
  await admin.pool.query("delete from content.event_outbox where draft_ref like 'cr012-%'");
  await admin.pool.query("delete from content.copy_drafts where draft_ref like 'cr012-%'");
}

beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await Promise.all([admin.encerrar(), worker.encerrar()]);
});

describe("create_copy_variants atomic write", () => {
  it("fingerprint canônico independe da ordem das propriedades", async () => {
    const left = await createCopyVariantsFingerprints.fingerprint({ objective: "Mesmo", quantity: 2, channel: "linkedin" });
    const right = await createCopyVariantsFingerprints.fingerprint({ channel: "linkedin", quantity: 2, objective: "Mesmo" });
    const changed = await createCopyVariantsFingerprints.fingerprint({ objective: "Mudou", quantity: 2, channel: "linkedin" });
    expect(left).toBe(right);
    expect(changed).not.toBe(left);
    expect(left).toMatch(/^[a-f0-9]{64}$/);
  });

  it("persiste draft, variantes, idempotência concluída e outbox pendente", async () => {
    const result = await writer.write(command("create"));
    expect(result).toMatchObject({ persistence: "created", draftRef: "cr012-draft-create", version: 1 });
    const { rows } = await admin.pool.query(
      `select
         (select count(*)::int from content.copy_drafts where draft_ref = $1) drafts,
         (select count(*)::int from content.copy_variants where draft_ref = $1) variants,
         (select count(*)::int from content.action_idempotency where draft_ref = $1 and status = 'completed') idempotency,
         (select count(*)::int from content.event_outbox where draft_ref = $1 and status = 'pending') outbox`,
      [result.draftRef],
    );
    expect(rows[0]).toEqual({ drafts: 1, variants: 2, idempotency: 1, outbox: 1 });
    const event = await admin.pool.query(
      `select event_key as "eventKey", producer_agent as "producerAgent", consumer_agent as "consumerAgent", payload
         from content.event_outbox where draft_ref = $1`,
      [result.draftRef],
    );
    expect(event.rows[0]).toMatchObject({
      eventKey: "copy.draft_created",
      producerAgent: "copywriting-agent",
      consumerAgent: "design-agent",
      payload: {
        draftRef: result.draftRef,
        version: 1,
        sourceAction: "create_copy_variants",
        variantRefs: result.output.variants.map((variant) => variant.id),
      },
    });
  });

  it("replay idêntico devolve o primeiro resultado sem nova escrita", async () => {
    const first = await writer.write(command("replay-first", { key: "cr012-key-replay", objective: "Mesmo objetivo" }));
    const replay = await writer.write(command("replay-second", { key: "cr012-key-replay", objective: "Mesmo objetivo" }));
    expect(replay).toMatchObject({ persistence: "replayed", draftRef: first.draftRef, outboxEventRef: first.outboxEventRef });
    const { rows } = await admin.pool.query(
      `select
         (select count(*)::int from content.copy_drafts where draft_ref in ($1, $2)) drafts,
         (select count(*)::int from content.action_idempotency where idempotency_key = 'cr012-key-replay') claims,
         (select count(*)::int from content.event_outbox where draft_ref = $1) events`,
      [first.draftRef, "cr012-draft-replay-second"],
    );
    expect(rows[0]).toEqual({ drafts: 1, claims: 1, events: 1 });
  });

  it("execuções concorrentes da mesma intenção criam uma vez e fazem um replay", async () => {
    const key = "cr012-key-concurrent";
    const [left, right] = await Promise.all([
      writer.write(command("concurrent-a", { key, objective: "Objetivo concorrente" })),
      writer.write(command("concurrent-b", { key, objective: "Objetivo concorrente" })),
    ]);
    expect([left.persistence, right.persistence].sort()).toEqual(["created", "replayed"]);
    expect(left.draftRef).toBe(right.draftRef);
    expect(left.outboxEventRef).toBe(right.outboxEventRef);
    const { rows } = await admin.pool.query(
      `select
         (select count(*)::int from content.action_idempotency where idempotency_key = $1) claims,
         (select count(*)::int from content.copy_drafts where draft_ref in ($2, $3)) drafts,
         (select count(*)::int from content.event_outbox where draft_ref in ($2, $3)) events`,
      [key, "cr012-draft-concurrent-a", "cr012-draft-concurrent-b"],
    );
    expect(rows[0]).toEqual({ claims: 1, drafts: 1, events: 1 });
  });

  it("mesma chave com input diferente falha sem escrita parcial", async () => {
    const first = await writer.write(command("conflict-first", { key: "cr012-key-conflict", objective: "Objetivo A" }));
    await expect(writer.write(command("conflict-second", { key: "cr012-key-conflict", objective: "Objetivo B" })))
      .rejects.toBeInstanceOf(IdempotencyConflict);
    const { rows } = await admin.pool.query(
      `select
         (select count(*)::int from content.copy_drafts where draft_ref in ($1, $2)) drafts,
         (select count(*)::int from content.event_outbox where draft_ref in ($1, $2)) events`,
      [first.draftRef, "cr012-draft-conflict-second"],
    );
    expect(rows[0]).toEqual({ drafts: 1, events: 1 });
  });

  it("draft já existente com outra chave faz rollback do novo claim", async () => {
    const first = await writer.write(command("version-first"));
    await expect(writer.write(command("version-second", { draftRef: first.draftRef })))
      .rejects.toMatchObject({ code: "CONFLICT_VERSION" });
    const { rows } = await admin.pool.query(
      `select count(*)::int count from content.action_idempotency where idempotency_key = 'cr012-key-version-second'`,
    );
    expect(rows[0].count).toBe(0);
  });

  it("a mesma chave pode existir em tenants diferentes", async () => {
    const key = "cr012-key-tenant-scope";
    const inA = await writer.write(command("tenant-a", { tenantId: TA, key, objective: "Mesmo input" }));
    const inB = await writer.write(command("tenant-b", { tenantId: TB, key, objective: "Mesmo input" }));
    expect(inA.persistence).toBe("created");
    expect(inB.persistence).toBe("created");
    const { rows } = await admin.pool.query(
      "select count(*)::int count from content.action_idempotency where idempotency_key = $1",
      [key],
    );
    expect(rows[0].count).toBe(2);
  });

  it("o resolver lê exatamente o draft recém-persistido", async () => {
    const result = await writer.write(command("resolve"));
    const resolver = createContentReferenceResolver({
      repository: criarContentReferenceRepository(worker),
      authorization: { canRead: async () => true },
      clock: { now: () => new Date("2026-09-21T16:00:00Z") },
    });
    await expect(resolver.resolve({
      tenantId: TA,
      requesterAgent: "design-agent",
      requiredPermission: "read",
      repository: "contentRepository",
      draftRef: result.draftRef,
      expectedVersion: 1,
      variantRefs: result.output.variants.map((variant) => variant.id),
    })).resolves.toMatchObject({ draftRef: result.draftRef, version: 1 });
  });

  it("chave ausente é rejeitada antes do banco", async () => {
    await expect(writer.write({ ...command("missing-key"), idempotencyKey: "" }))
      .rejects.toBeInstanceOf(TransactionSchemaInvalid);
    const { rows } = await admin.pool.query(
      "select count(*)::int count from content.copy_drafts where draft_ref = 'cr012-draft-missing-key'",
    );
    expect(rows[0].count).toBe(0);
  });

  it("quantity inconsistente é rejeitada sem claim", async () => {
    const base = command("quantity");
    await expect(writer.write({ ...base, actionInput: { ...base.actionInput, quantity: 3 } }))
      .rejects.toBeInstanceOf(TransactionSchemaInvalid);
    const { rows } = await admin.pool.query(
      "select count(*)::int count from content.action_idempotency where idempotency_key = 'cr012-key-quantity'",
    );
    expect(rows[0].count).toBe(0);
  });
});
