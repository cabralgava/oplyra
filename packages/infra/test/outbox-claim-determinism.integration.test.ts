// CR-031 — regressões de determinismo do claim da outbox (T2–T4). Documentam a
// semântica VIGENTE de `app.claim_outbox_events` (`available_at <= p_requested_at`,
// ordem `available_at, created_at, event_transaction_id`); não a alteram. Usam
// tenant próprio, dados sintéticos e o Supabase local.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { TenantId } from "@oplyra/core";
import { criarUnitOfWork } from "../src/db.ts";
import { criarOutboxDispatcherAdapter } from "../src/outbox-dispatcher-adapter.ts";

const ADMIN = "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const DISPATCHER = "postgresql://oplyra_dispatcher_login:local-dispatcher-2026@127.0.0.1:54422/postgres";
const TENANT = "d1500000-0000-4000-8000-000000000031" as TenantId;
const admin = criarUnitOfWork({ connectionString: ADMIN });

type Semente = { suffix: string; availableAt?: string; createdAt?: string };

async function seed({ suffix, availableAt, createdAt }: Semente): Promise<string> {
  const draftRef = `cr031-draft-${suffix}`;
  const eventTransactionId = `txn_cr031_${suffix}`;
  await admin.pool.query(
    "insert into content.copy_drafts (tenant_id, draft_ref, version, source_action) values ($1, $2, 1, 'create_copy_variants')",
    [TENANT, draftRef],
  );
  // `available_at` e `created_at` omitidos usam o default `now()` (relógio real): é o caso que T2 documenta.
  const colunas = ["tenant_id", "event_transaction_id", "event_key", "consumer_agent", "draft_ref", "aggregate_version", "source_transaction_id", "correlation_id", "payload"];
  const valores: unknown[] = [TENANT, eventTransactionId, "copy.draft_created", "design-agent", draftRef, 1, `${eventTransactionId}_source`, `corr_${suffix}`,
    JSON.stringify({ draftRef, version: 1, sourceAction: "create_copy_variants", variantRefs: [`variant-${suffix}`] })];
  const marcadores = ["$1", "$2", "$3", "$4", "$5", "$6", "$7", "$8", "$9::jsonb"];
  if (availableAt) { colunas.push("available_at"); valores.push(availableAt); marcadores.push(`$${valores.length}::timestamptz`); }
  if (createdAt) { colunas.push("created_at"); valores.push(createdAt); marcadores.push(`$${valores.length}::timestamptz`); }
  await admin.pool.query(`insert into content.event_outbox (${colunas.join(", ")}) values (${marcadores.join(", ")})`, valores);
  return eventTransactionId;
}

async function cleanup(): Promise<void> {
  await admin.pool.query("delete from content.event_consumer_deduplication where tenant_id = $1", [TENANT]);
  await admin.pool.query("delete from content.event_outbox where tenant_id = $1", [TENANT]);
  await admin.pool.query("delete from content.copy_drafts where tenant_id = $1", [TENANT]);
}

/** Dispatcher cuja sessão usa o fuso informado (parâmetro de conexão `options=-c timezone=…`). */
function dispatcherEm(timezone: string | null) {
  const url = timezone ? `${DISPATCHER}?options=${encodeURIComponent(`-c timezone=${timezone}`)}` : DISPATCHER;
  const uow = criarUnitOfWork({ connectionString: url, max: 2 });
  return { uow, port: criarOutboxDispatcherAdapter(uow) };
}

async function claimAt(requestedAt: string, timezone: string | null = null, batchSize = 10) {
  const { uow, port } = dispatcherEm(timezone);
  try {
    return await port.claim({ tenantId: TENANT, dispatcherId: `cr031-${Math.random().toString(36).slice(2, 8)}`, batchSize, leaseDurationSeconds: 60, requestedAt });
  } finally {
    await uow.encerrar();
  }
}

beforeAll(async () => {
  await admin.pool.query(
    "insert into core.tenants (id, name, slug, plan_key) values ($1, 'Outbox Claim Determinism', 'outbox-claim-determinism', 'performance') on conflict (id) do nothing",
    [TENANT],
  );
  await cleanup();
});
afterEach(cleanup);
afterAll(async () => {
  await cleanup();
  await admin.pool.query("delete from core.tenants where id = $1", [TENANT]);
  await admin.encerrar();
});

describe("T2 — relógio: o claim compara `available_at` com o instante injetado", () => {
  it("linha semeada com o default `now()` não é reivindicável por um relógio injetado anterior; a fixture explícita é", async () => {
    const padrao = await seed({ suffix: "default-now" });
    const explicita = await seed({ suffix: "explicita", availableAt: "2026-09-21T23:00:00Z" });
    const { claims } = await claimAt("2026-09-21T23:00:00Z");
    const ids = claims.map((c) => c.eventTransactionId);
    expect(ids).toContain(explicita);
    expect(ids).not.toContain(padrao);
  });

  it("a fronteira é inclusiva: reivindicável em `available_at`, não um segundo antes", async () => {
    const id = await seed({ suffix: "fronteira", availableAt: "2026-09-21T23:00:00Z" });
    expect((await claimAt("2026-09-21T22:59:59Z")).claims).toHaveLength(0);
    expect((await claimAt("2026-09-21T23:00:00Z")).claims.map((c) => c.eventTransactionId)).toEqual([id]);
  });
});

describe("T3 — fuso: o resultado não depende do timezone da sessão", () => {
  it.each(["UTC", "America/Sao_Paulo", "Pacific/Kiritimati"])("mesmas linhas e mesmos instantes com o fuso %s", async (tz) => {
    await cleanup();
    const a = await seed({ suffix: "tz-a", availableAt: "2026-09-21T20:59:00Z" });
    const b = await seed({ suffix: "tz-b", availableAt: "2026-09-21T21:30:00Z" });
    const probe = dispatcherEm(tz);
    try {
      // a opção de conexão realmente aplica o fuso da sessão (senão o teste não provaria nada)
      expect((await probe.uow.pool.query("show timezone")).rows[0].TimeZone).toBe(tz);
    } finally {
      await probe.uow.encerrar();
    }
    const { claims, claimedAt } = await claimAt("2026-09-21T21:00:00Z", tz);
    expect(claims.map((c) => c.eventTransactionId)).toEqual([a]);
    expect(claims.map((c) => c.eventTransactionId)).not.toContain(b);
    expect(new Date(claimedAt).toISOString()).toBe("2026-09-21T21:00:00.000Z");
    expect(new Date(claims[0]!.leaseExpiresAt).toISOString()).toBe("2026-09-21T21:01:00.000Z");
  });
});

describe("T4 — ordenação: `available_at`, `created_at`, `event_transaction_id`", () => {
  it("as linhas são reivindicadas nessa ordem, com empates resolvidos pelas colunas seguintes", async () => {
    const t = (h: string) => `2026-09-21T${h}Z`;
    const ids = {
      tardioCriadoCedo: await seed({ suffix: "o5", availableAt: t("20:10:00"), createdAt: t("19:00:00") }),
      mesmoDisponivelCriadoTarde: await seed({ suffix: "o3", availableAt: t("20:00:00"), createdAt: t("19:30:02") }),
      empateB: await seed({ suffix: "o2b", availableAt: t("20:00:00"), createdAt: t("19:30:01") }),
      empateA: await seed({ suffix: "o2a", availableAt: t("20:00:00"), createdAt: t("19:30:01") }),
      primeiro: await seed({ suffix: "o1", availableAt: t("19:50:00"), createdAt: t("19:59:00") }),
    };
    // A ordem vale para a SELEÇÃO (`limit p_batch_size`); a ordem do array devolvido não é contrato.
    // Por isso cada claim pega um evento (`batchSize` 1) e a sequência das seleções é comparada.
    const seq: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const { claims } = await claimAt(t("21:00:00"), null, 1);
      expect(claims).toHaveLength(1);
      seq.push(claims[0]!.eventTransactionId);
    }
    expect(seq).toEqual([
      ids.primeiro,            // menor available_at
      ids.empateA,             // available_at igual, created_at igual: event_transaction_id crescente
      ids.empateB,
      ids.mesmoDisponivelCriadoTarde, // available_at igual, created_at maior
      ids.tardioCriadoCedo,    // maior available_at, mesmo com created_at menor
    ]);
    expect((await claimAt(t("21:00:00"), null, 1)).claims).toHaveLength(0);
  });
});
