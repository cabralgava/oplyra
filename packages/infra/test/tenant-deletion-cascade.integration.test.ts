// CR-028 — exclusão da empresa no Supabase local: a cascata real atravessa
// core, content e finops; uma segunda empresa permanece idêntica; rollback
// restaura tudo; nenhuma linha órfã. Dados sintéticos, empresas próprias.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const ADMIN = "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const TA = "c2810000-0000-4000-8000-0000000000a1";
const TB = "c2810000-0000-4000-8000-0000000000b2";
const OPERADOR = "0e000000-0000-4000-8000-0000000000c3";
const FP = `hmac-sha256:v1:k1:${"d".repeat(64)}`;

const TABELAS = [
  "core.memberships", "core.invitations", "core.audit_log", "core.tenant_entitlements",
  "content.copy_drafts", "content.copy_variants", "content.action_idempotency", "content.event_outbox",
  "content.event_consumer_deduplication",
  "finops.budget_periods", "finops.model_attempts", "finops.model_call_records", "finops.cost_ledger_entries",
] as const;

const pool = new pg.Pool({ connectionString: ADMIN, max: 2 });

async function popular(c: pg.PoolClient, t: string, n: number) {
  await c.query("insert into core.tenants (id, name, slug, plan_key) values ($1, $2, $3, 'performance')", [t, `CR-028 ${n} (fictícia)`, `cr028-cascata-${n}`]);
  await c.query("insert into core.memberships (tenant_id, user_id, role_key) values ($1, $2, 'owner')", [t, `c2810000-0000-4000-8000-00000000010${n}`]);
  await c.query(`insert into core.invitations (tenant_id, email, role_key, token_hash, expires_at, invited_by)
                 values ($1, $2, 'viewer', $3, now() + interval '1 day', $4)`, [t, `convite-${n}@local.test`, `hash-cr028-${n}`, `c2810000-0000-4000-8000-00000000010${n}`]);
  await c.query("insert into core.audit_log (tenant_id, actor_type, action, reason) values ($1, 'system', 'cr028.teste', 'sintético')", [t]);
  await c.query("insert into core.tenant_entitlements (tenant_id, capability_key) values ($1, 'team.invite')", [t]);
  await c.query("insert into content.copy_drafts (tenant_id, draft_ref, version, source_action) values ($1, 'draft-1', 1, 'create_copy_variants')", [t]);
  await c.query(`insert into content.copy_variants (tenant_id, draft_ref, variant_ref, position, headline, primary_text, cta)
                 values ($1, 'draft-1', 'v1', 0, 'h', 'p', 'c')`, [t]);
  await c.query(`insert into content.action_idempotency (tenant_id, action, idempotency_key, request_fingerprint, status, source_transaction_id)
                 values ($1, 'create_copy_variants', 'k1', $2, 'pending', 'txn-src')`, [t, "e".repeat(64)]);
  await c.query(`insert into content.event_outbox (tenant_id, event_transaction_id, event_key, draft_ref, aggregate_version,
                   source_transaction_id, correlation_id, payload)
                 values ($1, 'txn_cr028_1', 'copy.draft_created', 'draft-1', 1, 'txn-src', 'corr', '{}'::jsonb)`, [t]);
  await c.query(`update content.event_outbox set status = 'dispatching', dispatch_attempts = 1, lease_owner = 'd',
                   fencing_token = 'f', lease_expires_at = now() + interval '1 minute' where tenant_id = $1`, [t]);
  await c.query(`insert into content.event_consumer_deduplication (tenant_id, event_transaction_id, consumer_agent, status, attempt,
                   lease_owner, fencing_token, lease_expires_at)
                 values ($1, 'txn_cr028_1', 'design-agent', 'processing', 1, 'd', 'f', now() + interval '1 minute')`, [t]);
  // Ledger pelas funções do CR-027, como dono, com o tenant e o operador da transação.
  await c.query("select set_config('app.tenant_id', $1, true), set_config('app.operator_id', $2, true)", [t, OPERADOR]);
  await c.query("select app.open_budget_period($1, 'tenant', null, now() - interval '1 day', now() + interval '1 day', 100000, 'cr-028')", [t]);
  await c.query("select app.open_budget_period($1, 'workflow_key', 'w', now() - interval '1 day', now() + interval '1 day', 100000, 'cr-028')", [t]);
  const callId = (await c.query("select finops.attempt_call_id($1, 'create_ad_copy', 'inv-cascata', 1) c", [t])).rows[0].c as string;
  await c.query("select app.acquire_model_attempt($1, 'w', 'create_ad_copy', 'inv-cascata', 1, $2, 'copywriting-agent', $3, array[$3], 100, 'w', 90, null)",
    [t, callId, FP]);
  const token = (await c.query("select fencing_token from finops.model_attempts where tenant_id = $1", [t])).rows[0].fencing_token;
  const registro = {
    invocationId: "inv-cascata", attempt: 1, callId, tenantId: t, workflowKey: "w", agentKey: "copywriting-agent", actionKey: "create_ad_copy",
    trace: { correlationId: "c", transactionId: null, causationId: null, parentTransactionId: null, workflowId: null, taskId: null, runId: null },
    requestFingerprint: FP, dataClassification: "synthetic",
    classificationProvenance: [{ kind: "conservative_default", ref: null, tenantId: t, classification: "synthetic" }],
    inputTokensEstimate: 1, inputTokensEstimateMethod: "conservative_bound", profileRef: "p@1", registryVersion: "r", modelId: "m",
    provider: "p", adapterKey: "test", providerModelId: "p/m", tariffVersion: "t", routingReason: "preferred", fallbackOccurred: false,
    resolvedProvider: "p", resolvedProviderModelId: "p/m", externalRequestId: null, outcome: "succeeded", failureKind: null,
    usage: { inputTokens: 1, outputTokens: 1, images: 0 }, outputAssetIds: null, estimatedCostMicroUsd: 100, costMicroUsd: 90,
    costStatus: "settled", startedAt: new Date().toISOString(), latencyMs: 1,
  };
  await c.query("select app.close_model_attempt($1, 'create_ad_copy', 'inv-cascata', 1, $2, 'charged', 90, 'settled', null, $3::jsonb)",
    [t, token, JSON.stringify(registro)]);
}

async function contagens(c: pg.PoolClient | pg.Pool, t: string): Promise<Record<string, number>> {
  const r: Record<string, number> = {};
  for (const tab of TABELAS) r[tab] = Number((await c.query(`select count(*) n from ${tab} where tenant_id = $1`, [t])).rows[0].n);
  return r;
}

async function assinatura(c: pg.PoolClient | pg.Pool, t: string): Promise<string> {
  const partes: string[] = [];
  for (const tab of TABELAS) {
    partes.push((await c.query(`select coalesce(md5(string_agg(x::text, '|' order by x::text)), '-') h from ${tab} x where tenant_id = $1`, [t])).rows[0].h);
  }
  return partes.join(",");
}

beforeAll(async () => {
  await pool.query("delete from core.tenants where id = any($1::uuid[])", [[TA, TB]]);
  const c = await pool.connect();
  try {
    await c.query("begin");
    await popular(c, TA, 1);
    await popular(c, TB, 2);
    await c.query("commit");
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
});

afterAll(async () => {
  await pool.query("delete from core.tenants where id = any($1::uuid[])", [[TA, TB]]);
  await pool.end();
});

describe("exclusão da empresa (CR-028)", () => {
  it("a empresa tem linhas em todas as tabelas de core, content e finops antes da exclusão", async () => {
    const a = await contagens(pool, TA);
    expect(Object.entries(a).filter(([, n]) => n === 0).map(([t]) => t)).toEqual([]);
  });

  it("a cascata real remove tudo da empresa, preserva a outra e o rollback restaura", async () => {
    const antesA = await contagens(pool, TA);
    const antesB = await assinatura(pool, TB);
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("delete from core.tenants where id = $1", [TA]);
      const depois = await contagens(c, TA);
      expect(Object.entries(depois).filter(([, n]) => n !== 0)).toEqual([]);
      expect(await assinatura(c, TB)).toBe(antesB);
      const orfaos = await c.query(`select
          (select count(*) from finops.cost_ledger_entries e where not exists (select 1 from finops.model_attempts a where a.tenant_id = e.tenant_id and a.call_id = e.call_id))
        + (select count(*) from finops.model_call_records r where not exists (select 1 from finops.model_attempts a where a.tenant_id = r.tenant_id and a.call_id = r.call_id))
        + (select count(*) from content.copy_variants v where not exists (select 1 from content.copy_drafts d where d.tenant_id = v.tenant_id and d.draft_ref = v.draft_ref))
        + (select count(*) from core.memberships m where not exists (select 1 from core.tenants t where t.id = m.tenant_id)) n`);
      expect(Number(orfaos.rows[0].n)).toBe(0);
      await c.query("rollback");
    } finally {
      c.release();
    }
    expect(await contagens(pool, TA)).toEqual(antesA);
    expect(await assinatura(pool, TB)).toBe(antesB);
  });

  it("enquanto a empresa existe, nenhuma exclusão intermediária do Ledger nem do último Owner passa", async () => {
    for (const sql of [
      "delete from finops.budget_periods where tenant_id = $1", "delete from finops.model_attempts where tenant_id = $1",
      "delete from finops.model_call_records where tenant_id = $1", "delete from finops.cost_ledger_entries where tenant_id = $1",
      "delete from core.memberships where tenant_id = $1 and role_key = 'owner'",
    ]) {
      await expect(pool.query(sql, [TA]), sql).rejects.toMatchObject({ code: "23514" });
    }
    const a = await contagens(pool, TA);
    expect(Object.entries(a).filter(([, n]) => n === 0)).toEqual([]);
  });

  it("exclusão confirmada: nada da empresa A permanece e a empresa B continua idêntica", async () => {
    const antesB = await assinatura(pool, TB);
    await pool.query("delete from core.tenants where id = $1", [TA]);
    expect(Object.values(await contagens(pool, TA)).every((n) => n === 0)).toBe(true);
    expect(await assinatura(pool, TB)).toBe(antesB);
  });
});
