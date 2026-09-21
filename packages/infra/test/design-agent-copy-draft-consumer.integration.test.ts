import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createContentReferenceResolver,
  createDesignAgentCopyDraftConsumer,
  createOutboxDispatcherCycle,
} from "@oplyra/core";
import type { DeliveryFailurePolicyPort, TenantId } from "@oplyra/core";
import { criarUnitOfWork } from "../src/db.ts";
import { criarContentReferenceRepository } from "../src/content-reference-repository.ts";
import { criarOutboxDispatcherAdapter } from "../src/outbox-dispatcher-adapter.ts";

const ADMIN = "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const WORKER = "postgresql://oplyra_worker_login:local-worker-2026@127.0.0.1:54422/postgres";
const DISPATCHER = "postgresql://oplyra_dispatcher_login:local-dispatcher-2026@127.0.0.1:54422/postgres";
const TENANT = "88888888-8888-4888-8888-888888888888" as TenantId;
const admin = criarUnitOfWork({ connectionString: ADMIN });
const worker = criarUnitOfWork({ connectionString: WORKER });
const dispatcherUow = criarUnitOfWork({ connectionString: DISPATCHER });
const dispatcher = criarOutboxDispatcherAdapter(dispatcherUow);
const resolver = createContentReferenceResolver({
  repository: criarContentReferenceRepository(worker),
  authorization: { canRead: async () => true },
  clock: { now: () => new Date("2026-09-21T23:00:00Z") },
});
const delivery = createDesignAgentCopyDraftConsumer({ resolver });
const failurePolicy: DeliveryFailurePolicyPort = {
  classify: async () => ({
    outcome: "retryable_failure",
    nextAvailableAt: "2026-09-21T23:05:00Z",
    error: { code: "INTEGRATION_UNAVAILABLE", message: "resolver indisponível", retryable: true },
  }),
};

async function seed(suffix: string, payloadVersion = 1, payloadVariantRefs = [`cr018-${suffix}-a`, `cr018-${suffix}-b`]) {
  const draftRef = `cr018-draft-${suffix}`;
  const eventTransactionId = `txn_cr018_${suffix}`;
  await admin.pool.query(
    "insert into content.copy_drafts (tenant_id, draft_ref, version, source_action) values ($1, $2, 1, 'create_copy_variants')",
    [TENANT, draftRef],
  );
  await admin.pool.query(
    `insert into content.copy_variants
       (tenant_id, draft_ref, variant_ref, position, headline, primary_text, cta) values
       ($1, $2, $3, 0, 'A', 'Texto A', 'request_demo'),
       ($1, $2, $4, 1, 'B', 'Texto B', 'request_demo')`,
    [TENANT, draftRef, `cr018-${suffix}-a`, `cr018-${suffix}-b`],
  );
  await admin.pool.query(
    `insert into content.event_outbox (
       tenant_id, event_transaction_id, event_key, consumer_agent, draft_ref,
       aggregate_version, source_transaction_id, correlation_id, payload
     ) values ($1, $2, 'copy.draft_created', 'design-agent', $3, 1, $4, $5, $6::jsonb)`,
    [TENANT, eventTransactionId, draftRef, `${eventTransactionId}_source`, `corr_${suffix}`, JSON.stringify({
      draftRef,
      version: payloadVersion,
      sourceAction: "create_copy_variants",
      variantRefs: payloadVariantRefs,
    })],
  );
  return { draftRef, eventTransactionId };
}

async function run(dispatcherId: string) {
  const cycle = createOutboxDispatcherCycle({
    dispatcher,
    delivery,
    failurePolicy,
    clock: { now: () => new Date("2026-09-21T23:01:00Z") },
  });
  return cycle.run({ tenantId: TENANT, dispatcherId, batchSize: 10, leaseDurationSeconds: 120 });
}

async function cleanup(): Promise<void> {
  await admin.pool.query("delete from content.event_consumer_deduplication where tenant_id = $1", [TENANT]);
  await admin.pool.query("delete from content.event_outbox where tenant_id = $1", [TENANT]);
  await admin.pool.query("delete from content.copy_drafts where tenant_id = $1", [TENANT]);
}

beforeAll(async () => {
  await admin.pool.query(
    "insert into core.tenants (id, name, slug, plan_key) values ($1, 'Design Consumer Test', 'design-consumer-test', 'performance') on conflict (id) do nothing",
    [TENANT],
  );
  await cleanup();
});
afterEach(cleanup);
afterAll(async () => {
  await cleanup();
  await admin.pool.query("delete from core.tenants where id = $1", [TENANT]);
  await Promise.all([admin.encerrar(), worker.encerrar(), dispatcherUow.encerrar()]);
});

describe("design-agent internal copy.draft_created consumer", () => {
  it("resolve referências reais e confirma intake sem criar novo artefato", async () => {
    const seeded = await seed("success");
    const before = await admin.pool.query(
      "select count(*)::int drafts, (select count(*)::int from content.copy_variants where tenant_id = $1) variants from content.copy_drafts where tenant_id = $1",
      [TENANT],
    );
    const result = await run("design-consumer-success");
    expect(result.items[0]).toMatchObject({ deliveryOutcome: "delivered", settlement: { status: "dispatched" } });
    const after = await admin.pool.query(
      `select
         (select count(*)::int from content.copy_drafts where tenant_id = $1) drafts,
         (select count(*)::int from content.copy_variants where tenant_id = $1) variants,
         (select status from content.event_outbox where tenant_id = $1 and event_transaction_id = $2) status`,
      [TENANT, seeded.eventTransactionId],
    );
    expect(after.rows[0]).toEqual({ ...before.rows[0], status: "dispatched" });
  });

  it("referência de variante inexistente termina em dead-letter canônico", async () => {
    const { eventTransactionId } = await seed("missing", 1, ["cr018-missing-a", "variant-inexistente"]);
    const result = await run("design-consumer-missing");
    expect(result.items[0]).toMatchObject({
      deliveryOutcome: "terminal_failure",
      settlement: { status: "dead_lettered" },
    });
    const { rows } = await admin.pool.query(
      "select last_error as error from content.event_outbox where tenant_id = $1 and event_transaction_id = $2",
      [TENANT, eventTransactionId],
    );
    expect(rows[0].error).toMatchObject({ code: "INVALID_STATE_TRANSITION", retryable: false });
  });

  it("versão divergente não materializa conteúdo parcial", async () => {
    const { eventTransactionId } = await seed("version", 2);
    const result = await run("design-consumer-version");
    expect(result.items[0]).toMatchObject({ deliveryOutcome: "terminal_failure", settlement: { status: "dead_lettered" } });
    const { rows } = await admin.pool.query(
      `select o.status, d.status dedup_status
         from content.event_outbox o join content.event_consumer_deduplication d
           using (tenant_id, event_transaction_id, consumer_agent)
        where o.tenant_id = $1 and o.event_transaction_id = $2`,
      [TENANT, eventTransactionId],
    );
    expect(rows[0]).toEqual({ status: "dead_lettered", dedup_status: "failed" });
  });
});
