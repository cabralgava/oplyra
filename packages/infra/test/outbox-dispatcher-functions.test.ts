import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { criarUnitOfWork } from "../src/db.ts";

const ADMIN = "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const DISPATCHER = "postgresql://oplyra_dispatcher_login:local-dispatcher-2026@127.0.0.1:54422/postgres";
const TA = "33333333-3333-4333-8333-333333333333";
const TB = "44444444-4444-4444-8444-444444444444";
const admin = criarUnitOfWork({ connectionString: ADMIN });
const dispatcher = criarUnitOfWork({ connectionString: DISPATCHER });

type Claim = {
  eventTransactionId: string;
  attempt: number;
  fencingToken: string;
  leaseExpiresAt: string;
};

async function asDispatcher<T>(tenantId: string, callback: (query: (sql: string, params?: unknown[]) => Promise<any>) => Promise<T>): Promise<T> {
  const client = await dispatcher.pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role oplyra_dispatcher_exec");
    await client.query("select set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await callback((sql, params = []) => client.query(sql, params));
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function seedEvent(suffix: string, tenantId = TA): Promise<string> {
  const draftRef = `cr015-draft-${suffix}`;
  const transactionId = `txn_cr015_${suffix}`;
  await admin.pool.query(
    `insert into content.copy_drafts (tenant_id, draft_ref, version, source_action)
     values ($1, $2, 1, 'create_copy_variants')`,
    [tenantId, draftRef],
  );
  await admin.pool.query(
    `insert into content.event_outbox (
       tenant_id, event_transaction_id, event_key, consumer_agent, draft_ref,
       aggregate_version, source_transaction_id, correlation_id, payload
     ) values ($1, $2, 'copy.draft_created', 'design-agent', $3, 1, $4, $5, $6::jsonb)`,
    [tenantId, transactionId, draftRef, `${transactionId}_source`, `corr_${suffix}`, JSON.stringify({
      draftRef,
      version: 1,
      sourceAction: "create_copy_variants",
      variantRefs: [`variant-${suffix}`],
    })],
  );
  return transactionId;
}

async function claim(tenantId: string, dispatcherId: string, requestedAt: string, batchSize = 1): Promise<{ claims: Claim[] }> {
  return asDispatcher(tenantId, async (query) => {
    const { rows } = await query(
      `select app.claim_outbox_events($1, $2, $3, 120, $4::timestamptz) claim`,
      [tenantId, dispatcherId, batchSize, requestedAt],
    );
    return rows[0].claim;
  });
}

async function settle(input: {
  tenantId?: string;
  dispatcherId: string;
  eventTransactionId: string;
  attempt: number;
  fencingToken: string;
  outcome: "dispatched" | "retryable_failure" | "terminal_failure";
  settledAt: string;
  nextAvailableAt?: string | null;
  error?: Record<string, unknown> | null;
}): Promise<Record<string, unknown>> {
  const tenantId = input.tenantId ?? TA;
  return asDispatcher(tenantId, async (query) => {
    const { rows } = await query(
      `select app.settle_outbox_event(
         $1, $2, $3, 'design-agent', $4, $5, $6, $7::timestamptz,
         $8::timestamptz, $9::jsonb
       ) settlement`,
      [tenantId, input.dispatcherId, input.eventTransactionId, input.attempt, input.fencingToken,
       input.outcome, input.settledAt, input.nextAvailableAt ?? null,
       input.error ? JSON.stringify(input.error) : null],
    );
    return rows[0].settlement;
  });
}

async function cleanup(): Promise<void> {
  await admin.pool.query("delete from content.event_consumer_deduplication where event_transaction_id like 'txn_cr015_%'");
  await admin.pool.query("delete from content.event_outbox where event_transaction_id like 'txn_cr015_%'");
  await admin.pool.query("delete from content.copy_drafts where draft_ref like 'cr015-draft-%'");
}

beforeAll(async () => {
  await admin.pool.query(
    `insert into core.tenants (id, name, slug, plan_key) values
       ($1, 'Dispatcher Test A', 'dispatcher-test-a', 'performance'),
       ($2, 'Dispatcher Test B', 'dispatcher-test-b', 'performance')
     on conflict (id) do nothing`,
    [TA, TB],
  );
  await cleanup();
});
afterEach(cleanup);
afterAll(async () => {
  await cleanup();
  await admin.pool.query("delete from core.tenants where id in ($1, $2)", [TA, TB]);
  await Promise.all([admin.encerrar(), dispatcher.encerrar()]);
});

describe("outbox dispatcher SQL boundary", () => {
  it("nega acesso direto às tabelas", async () => {
    await expect(asDispatcher(TA, (query) => query("select * from content.event_outbox")))
      .rejects.toMatchObject({ code: "42501" });
  });

  it("faz claim tenant-scoped e cria deduplicação antes do side effect", async () => {
    const eventTransactionId = await seedEvent("claim");
    const result = await claim(TA, "dispatcher-claim", "2026-09-21T18:00:00Z");
    expect(result.claims).toHaveLength(1);
    expect(result.claims[0]).toMatchObject({ eventTransactionId, attempt: 1 });
    expect(result.claims[0].fencingToken).toBeTruthy();
    const { rows } = await admin.pool.query(
      `select o.status outbox_status, d.status dedup_status,
              o.fencing_token = d.fencing_token same_token,
              o.dispatch_attempts = d.attempt same_attempt
         from content.event_outbox o
         join content.event_consumer_deduplication d using (tenant_id, event_transaction_id, consumer_agent)
        where o.event_transaction_id = $1`,
      [eventTransactionId],
    );
    expect(rows[0]).toEqual({ outbox_status: "dispatching", dedup_status: "processing", same_token: true, same_attempt: true });
  });

  it("SKIP LOCKED permite somente um vencedor concorrente", async () => {
    const eventTransactionId = await seedEvent("concurrent");
    const [left, right] = await Promise.all([
      claim(TA, "dispatcher-left", "2026-09-21T18:01:00Z"),
      claim(TA, "dispatcher-right", "2026-09-21T18:01:00Z"),
    ]);
    const claims = [...left.claims, ...right.claims].filter((item) => item.eventTransactionId === eventTransactionId);
    expect(claims).toHaveLength(1);
  });

  it("não recupera lease ativo e rotaciona token após expiração", async () => {
    const eventTransactionId = await seedEvent("reclaim");
    const first = (await claim(TA, "dispatcher-old", "2026-09-21T18:02:00Z")).claims[0];
    expect((await claim(TA, "dispatcher-new", "2026-09-21T18:02:30Z")).claims).toHaveLength(0);
    const reclaimed = (await claim(TA, "dispatcher-new", "2026-09-21T18:04:01Z")).claims[0];
    expect(reclaimed).toMatchObject({ eventTransactionId, attempt: 2 });
    expect(reclaimed.fencingToken).not.toBe(first.fencingToken);
  });

  it("rejeita settlement com attempt e fencing token obsoletos", async () => {
    const eventTransactionId = await seedEvent("stale");
    const first = (await claim(TA, "dispatcher-old", "2026-09-21T18:05:00Z")).claims[0];
    await claim(TA, "dispatcher-new", "2026-09-21T18:07:01Z");
    await expect(settle({
      dispatcherId: "dispatcher-old", eventTransactionId, attempt: first.attempt,
      fencingToken: first.fencingToken, outcome: "dispatched", settledAt: "2026-09-21T18:07:02Z",
    })).rejects.toMatchObject({ code: "55000", message: expect.stringContaining("INVALID_STATE_TRANSITION") });
  });

  it("persiste retry e permite novo claim somente após nextAvailableAt", async () => {
    const eventTransactionId = await seedEvent("retry");
    const first = (await claim(TA, "dispatcher-retry", "2026-09-21T18:08:00Z")).claims[0];
    await expect(settle({
      dispatcherId: "dispatcher-retry", eventTransactionId, attempt: first.attempt,
      fencingToken: first.fencingToken, outcome: "retryable_failure", settledAt: "2026-09-21T18:08:10Z",
      nextAvailableAt: "2026-09-21T18:10:00Z",
      error: { code: "PROVIDER_TIMEOUT", message: "timeout", retryable: true },
    })).resolves.toMatchObject({ status: "failed" });
    expect((await claim(TA, "dispatcher-retry", "2026-09-21T18:09:59Z")).claims).toHaveLength(0);
    expect((await claim(TA, "dispatcher-retry", "2026-09-21T18:10:00Z")).claims[0]).toMatchObject({ attempt: 2 });
  });

  it("conclui entrega atomicamente e transforma replay em duplicate", async () => {
    const eventTransactionId = await seedEvent("success");
    const current = (await claim(TA, "dispatcher-success", "2026-09-21T18:11:00Z")).claims[0];
    const input = {
      dispatcherId: "dispatcher-success", eventTransactionId, attempt: current.attempt,
      fencingToken: current.fencingToken, outcome: "dispatched" as const, settledAt: "2026-09-21T18:11:05Z",
    };
    await expect(settle(input)).resolves.toMatchObject({ status: "dispatched" });
    await expect(settle({ ...input, settledAt: "2026-09-21T18:11:06Z" })).resolves.toMatchObject({ status: "duplicate" });
    const { rows } = await admin.pool.query(
      `select o.status outbox_status, d.status dedup_status
         from content.event_outbox o join content.event_consumer_deduplication d
           using (tenant_id, event_transaction_id, consumer_agent)
        where o.event_transaction_id = $1`,
      [eventTransactionId],
    );
    expect(rows[0]).toEqual({ outbox_status: "dispatched", dedup_status: "completed" });
  });

  it("persiste falha terminal como dead_lettered", async () => {
    const eventTransactionId = await seedEvent("terminal");
    const current = (await claim(TA, "dispatcher-terminal", "2026-09-21T18:12:00Z")).claims[0];
    await expect(settle({
      dispatcherId: "dispatcher-terminal", eventTransactionId, attempt: current.attempt,
      fencingToken: current.fencingToken, outcome: "terminal_failure", settledAt: "2026-09-21T18:12:05Z",
      error: { code: "EVENT_NOT_REGISTERED", message: "evento desconhecido", retryable: false },
    })).resolves.toMatchObject({ status: "dead_lettered" });
  });

  it("nega tenant de parâmetro diferente do tenant ativo", async () => {
    await expect(asDispatcher(TA, (query) => query(
      "select app.claim_outbox_events($1, 'dispatcher-cross', 1, 120, now())",
      [TB],
    ))).rejects.toMatchObject({ code: "42501" });
  });
});
