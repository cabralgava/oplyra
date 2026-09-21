import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { IntegrationUnavailable, InvalidStateTransition } from "@oplyra/core";
import type { OutboxEventClaim, TenantId } from "@oplyra/core";
import { criarUnitOfWork } from "../src/db.ts";
import { criarOutboxDispatcherAdapter } from "../src/outbox-dispatcher-adapter.ts";

const ADMIN = "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const DISPATCHER = "postgresql://oplyra_dispatcher_login:local-dispatcher-2026@127.0.0.1:54422/postgres";
const TENANT = "66666666-6666-4666-8666-666666666666" as TenantId;
const admin = criarUnitOfWork({ connectionString: ADMIN });
const dispatcherUow = criarUnitOfWork({ connectionString: DISPATCHER });
const adapter = criarOutboxDispatcherAdapter(dispatcherUow);

async function seed(suffix: string): Promise<string> {
  const draftRef = `cr016-draft-${suffix}`;
  const eventTransactionId = `txn_cr016_${suffix}`;
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

async function claim(dispatcherId: string, requestedAt: string): Promise<OutboxEventClaim[]> {
  const result = await adapter.claim({
    tenantId: TENANT,
    dispatcherId,
    batchSize: 1,
    leaseDurationSeconds: 120,
    requestedAt,
  });
  return [...result.claims];
}

async function cleanup(): Promise<void> {
  await admin.pool.query("delete from content.event_consumer_deduplication where tenant_id = $1", [TENANT]);
  await admin.pool.query("delete from content.event_outbox where tenant_id = $1", [TENANT]);
  await admin.pool.query("delete from content.copy_drafts where tenant_id = $1", [TENANT]);
}

beforeAll(async () => {
  await admin.pool.query(
    "insert into core.tenants (id, name, slug, plan_key) values ($1, 'Dispatcher Adapter Test', 'dispatcher-adapter-test', 'performance') on conflict (id) do nothing",
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

describe("outbox dispatcher PostgreSQL adapter", () => {
  it("retorna claim tipado e vinculado ao evento canônico", async () => {
    const eventTransactionId = await seed("claim");
    const claims = await claim("adapter-claim", "2026-09-21T19:00:00Z");
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({
      eventTransactionId,
      eventKey: "copy.draft_created",
      producerAgent: "copywriting-agent",
      consumerAgent: "design-agent",
      attempt: 1,
    });
  });

  it("preserva vencedor único em claims concorrentes", async () => {
    const eventTransactionId = await seed("concurrent");
    const [left, right] = await Promise.all([
      claim("adapter-left", "2026-09-21T19:01:00Z"),
      claim("adapter-right", "2026-09-21T19:01:00Z"),
    ]);
    expect([...left, ...right].filter((item) => item.eventTransactionId === eventTransactionId)).toHaveLength(1);
  });

  it("mapeia fencing obsoleto para InvalidStateTransition canônico", async () => {
    const eventTransactionId = await seed("stale");
    const first = (await claim("adapter-old", "2026-09-21T19:02:00Z"))[0]!;
    await claim("adapter-new", "2026-09-21T19:04:01Z");
    await expect(adapter.settle({
      tenantId: TENANT,
      dispatcherId: "adapter-old",
      eventTransactionId,
      consumerAgent: "design-agent",
      attempt: first.attempt,
      fencingToken: first.fencingToken,
      outcome: "dispatched",
      settledAt: "2026-09-21T19:04:02Z",
    })).rejects.toBeInstanceOf(InvalidStateTransition);
  });

  it("conclui e reconhece replay como duplicate", async () => {
    const eventTransactionId = await seed("success");
    const current = (await claim("adapter-success", "2026-09-21T19:05:00Z"))[0]!;
    const request = {
      tenantId: TENANT,
      dispatcherId: "adapter-success",
      eventTransactionId,
      consumerAgent: "design-agent" as const,
      attempt: current.attempt,
      fencingToken: current.fencingToken,
      outcome: "dispatched" as const,
      settledAt: "2026-09-21T19:05:05Z",
    };
    await expect(adapter.settle(request)).resolves.toMatchObject({ status: "dispatched" });
    await expect(adapter.settle({ ...request, settledAt: "2026-09-21T19:05:06Z" }))
      .resolves.toMatchObject({ status: "duplicate" });
  });

  it("persiste retry tipado e permite reclaim no instante aprovado", async () => {
    const eventTransactionId = await seed("retry");
    const current = (await claim("adapter-retry", "2026-09-21T19:06:00Z"))[0]!;
    await expect(adapter.settle({
      tenantId: TENANT,
      dispatcherId: "adapter-retry",
      eventTransactionId,
      consumerAgent: "design-agent",
      attempt: current.attempt,
      fencingToken: current.fencingToken,
      outcome: "retryable_failure",
      settledAt: "2026-09-21T19:06:05Z",
      nextAvailableAt: "2026-09-21T19:07:00Z",
      error: { code: "UPSTREAM_SERVICE_UNAVAILABLE", message: "upstream", retryable: true },
    })).resolves.toMatchObject({ status: "failed", nextAvailableAt: "2026-09-21T19:07:00+00:00" });
    expect(await claim("adapter-retry", "2026-09-21T19:06:59Z")).toHaveLength(0);
    expect((await claim("adapter-retry", "2026-09-21T19:07:00Z"))[0]).toMatchObject({ attempt: 2 });
  });

  it("rejeita settlement inválido antes de abrir transação", async () => {
    const withDispatcherTransaction = vi.fn();
    const local = criarOutboxDispatcherAdapter({ withDispatcherTransaction });
    await expect(local.settle({
      tenantId: TENANT,
      dispatcherId: "adapter-invalid",
      eventTransactionId: "txn_invalid",
      consumerAgent: "design-agent",
      attempt: 1,
      fencingToken: "fence",
      outcome: "retryable_failure",
      settledAt: "2026-09-21T19:08:00Z",
      nextAvailableAt: "2026-09-21T19:07:00Z",
      error: { code: "PROVIDER_TIMEOUT", message: "timeout", retryable: true },
    })).rejects.toMatchObject({ code: "TRANSACTION_SCHEMA_INVALID" });
    expect(withDispatcherTransaction).not.toHaveBeenCalled();
  });

  it("mapeia indisponibilidade PostgreSQL sem expor erro de driver", async () => {
    const local = criarOutboxDispatcherAdapter({
      withDispatcherTransaction: async () => {
        throw Object.assign(new Error("connection refused"), { code: "08006" });
      },
    });
    await expect(local.claim({
      tenantId: TENANT,
      dispatcherId: "adapter-down",
      batchSize: 1,
      leaseDurationSeconds: 120,
      requestedAt: "2026-09-21T19:09:00Z",
    })).rejects.toBeInstanceOf(IntegrationUnavailable);
  });
});
