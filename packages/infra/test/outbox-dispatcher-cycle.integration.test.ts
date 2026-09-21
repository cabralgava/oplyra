import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createOutboxDispatcherCycle } from "@oplyra/core";
import type { DeliveryFailurePolicyPort, TenantId } from "@oplyra/core";
import { criarUnitOfWork } from "../src/db.ts";
import { criarOutboxDispatcherAdapter } from "../src/outbox-dispatcher-adapter.ts";

const ADMIN = "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const DISPATCHER = "postgresql://oplyra_dispatcher_login:local-dispatcher-2026@127.0.0.1:54422/postgres";
const TENANT = "77777777-7777-4777-8777-777777777777" as TenantId;
const admin = criarUnitOfWork({ connectionString: ADMIN });
const dispatcherUow = criarUnitOfWork({ connectionString: DISPATCHER });
const dispatcher = criarOutboxDispatcherAdapter(dispatcherUow);

async function seed(suffix: string): Promise<string> {
  const draftRef = `cr017-draft-${suffix}`;
  const eventTransactionId = `txn_cr017_${suffix}`;
  await admin.pool.query(
    "insert into content.copy_drafts (tenant_id, draft_ref, version, source_action) values ($1, $2, 1, 'create_copy_variants')",
    [TENANT, draftRef],
  );
  await admin.pool.query(
    `insert into content.event_outbox (
       tenant_id, event_transaction_id, event_key, consumer_agent, draft_ref,
       aggregate_version, source_transaction_id, correlation_id, payload
     ) values ($1, $2, 'copy.draft_created', 'design-agent', $3, 1, $4, $5, $6::jsonb)`,
    [TENANT, eventTransactionId, draftRef, `${eventTransactionId}_source`, `corr_${suffix}`, JSON.stringify({
      draftRef,
      version: 1,
      sourceAction: "create_copy_variants",
      variantRefs: [`variant-${suffix}`],
    })],
  );
  return eventTransactionId;
}

async function cleanup(): Promise<void> {
  await admin.pool.query("delete from content.event_consumer_deduplication where tenant_id = $1", [TENANT]);
  await admin.pool.query("delete from content.event_outbox where tenant_id = $1", [TENANT]);
  await admin.pool.query("delete from content.copy_drafts where tenant_id = $1", [TENANT]);
}

const unusedFailurePolicy: DeliveryFailurePolicyPort = {
  classify: vi.fn(async () => { throw new Error("não deveria classificar"); }),
};

function cycleAt(iso: string, delivery: Parameters<typeof createOutboxDispatcherCycle>[0]["delivery"], failurePolicy = unusedFailurePolicy) {
  return createOutboxDispatcherCycle({ dispatcher, delivery, failurePolicy, clock: { now: () => new Date(iso) } });
}

beforeAll(async () => {
  await admin.pool.query(
    "insert into core.tenants (id, name, slug, plan_key) values ($1, 'Dispatcher Cycle Test', 'dispatcher-cycle-test', 'performance') on conflict (id) do nothing",
    [TENANT],
  );
  await cleanup();
});
afterEach(cleanup);
afterAll(async () => {
  await cleanup();
  await admin.pool.query("delete from core.tenants where id = $1", [TENANT]);
  await Promise.all([admin.encerrar(), dispatcherUow.encerrar()]);
});

describe("single-cycle dispatcher with PostgreSQL adapter", () => {
  it("claim, delivery e settlement de sucesso fecham o evento", async () => {
    const eventTransactionId = await seed("success");
    const delivery = { deliver: vi.fn(async () => ({ outcome: "delivered" as const })) };
    const result = await cycleAt("2026-09-21T21:00:00Z", delivery).run({
      tenantId: TENANT, dispatcherId: "cycle-success", batchSize: 10, leaseDurationSeconds: 120,
    });
    expect(result).toMatchObject({ claimed: 1, settled: 1, settlementFailures: 0 });
    expect(delivery.deliver).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: TENANT,
      event: expect.objectContaining({ eventTransactionId }),
    }));
    const { rows } = await admin.pool.query(
      `select o.status outbox_status, d.status dedup_status
         from content.event_outbox o join content.event_consumer_deduplication d
           using (tenant_id, event_transaction_id, consumer_agent)
        where o.event_transaction_id = $1`, [eventTransactionId],
    );
    expect(rows[0]).toEqual({ outbox_status: "dispatched", dedup_status: "completed" });
  });

  it("outcome retryable persiste falha e próxima disponibilidade", async () => {
    const eventTransactionId = await seed("retry");
    const delivery = { deliver: vi.fn(async () => ({
      outcome: "retryable_failure" as const,
      nextAvailableAt: "2026-09-21T21:02:00Z",
      error: { code: "PROVIDER_TIMEOUT" as const, message: "timeout", retryable: true },
    })) };
    await cycleAt("2026-09-21T21:01:00Z", delivery).run({
      tenantId: TENANT, dispatcherId: "cycle-retry", batchSize: 10, leaseDurationSeconds: 120,
    });
    const { rows } = await admin.pool.query(
      "select status, available_at as \"availableAt\", last_error as error from content.event_outbox where event_transaction_id = $1",
      [eventTransactionId],
    );
    expect(rows[0]).toMatchObject({ status: "failed", error: { code: "PROVIDER_TIMEOUT", retryable: true } });
    expect(new Date(rows[0].availableAt).toISOString()).toBe("2026-09-21T21:02:00.000Z");
  });

  it("outcome terminal persiste dead-letter sem transporte externo", async () => {
    const eventTransactionId = await seed("terminal");
    const delivery = { deliver: vi.fn(async () => ({
      outcome: "terminal_failure" as const,
      error: { code: "EVENT_NOT_REGISTERED" as const, message: "evento", retryable: false },
    })) };
    const result = await cycleAt("2026-09-21T21:03:00Z", delivery).run({
      tenantId: TENANT, dispatcherId: "cycle-terminal", batchSize: 10, leaseDurationSeconds: 120,
    });
    expect(result.items[0]).toMatchObject({ deliveryOutcome: "terminal_failure", settlement: { status: "dead_lettered" } });
    const { rows } = await admin.pool.query(
      "select status, dead_lettered_at is not null as terminal from content.event_outbox where event_transaction_id = $1",
      [eventTransactionId],
    );
    expect(rows[0]).toEqual({ status: "dead_lettered", terminal: true });
  });

  it("exceção do consumer é classificada por política injetada", async () => {
    const eventTransactionId = await seed("classified");
    const upstream = new Error("upstream indisponível");
    const delivery = { deliver: vi.fn(async () => { throw upstream; }) };
    const failurePolicy: DeliveryFailurePolicyPort = {
      classify: vi.fn(async () => ({
        outcome: "retryable_failure",
        nextAvailableAt: "2026-09-21T21:05:00Z",
        error: { code: "UPSTREAM_SERVICE_UNAVAILABLE", message: "upstream", retryable: true },
      })),
    };
    const result = await cycleAt("2026-09-21T21:04:00Z", delivery, failurePolicy).run({
      tenantId: TENANT, dispatcherId: "cycle-classified", batchSize: 10, leaseDurationSeconds: 120,
    });
    expect(failurePolicy.classify).toHaveBeenCalledWith(upstream, expect.objectContaining({
      tenantId: TENANT,
      event: expect.objectContaining({ eventTransactionId }),
    }), "2026-09-21T21:04:00.000Z");
    expect(result.items[0]).toMatchObject({ deliveryOutcome: "retryable_failure", settlement: { status: "failed" } });
  });
});
