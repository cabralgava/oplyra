// Concorrência do Cost Ledger (CR-027 §6.4, §8, §14) com conexões separadas do
// Supabase local, cada pool representando um processo worker. A passagem do
// tempo do lease é simulada pelo dono da tabela (somente em teste), movendo
// lease_expires_at para o passado; o banco continua decidindo pelo seu relógio.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { attemptCallId } from "@oplyra/core";
import type { AttemptAcquisitionRequest, ModelCallRecord } from "@oplyra/core";
import { criarUnitOfWork } from "../src/db.ts";
import { CostLedgerOperations, PersistentCostLedger } from "../src/ai-model-harness/persistent-cost-ledger.ts";

const ADMIN = "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const WORKER = "postgresql://oplyra_worker_login:local-worker-2026@127.0.0.1:54422/postgres";
const OPS = "postgresql://oplyra_ops_login:local-ops-2026@127.0.0.1:54422/postgres";
const TH = "cf000004-0000-4000-8000-00000000c027";
const TI = "cf000005-0000-4000-8000-00000000c027";
const OPERADOR = "0e000000-0000-4000-8000-0000000000e2";
const FP = `hmac-sha256:v1:k1:${"c".repeat(64)}`;

const admin = new pg.Pool({ connectionString: ADMIN, max: 4 });
const processos = Array.from({ length: 20 }, (_, i) => {
  const uow = criarUnitOfWork({ connectionString: WORKER, max: 1 });
  return { uow, ledger: new PersistentCostLedger(uow, { leaseOwner: `worker-${i}` }) };
});
const opsUow = criarUnitOfWork({ connectionString: OPS, max: 2 });
const operador = new CostLedgerOperations(opsUow, OPERADOR);
const q = async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows;

const pedido = (tenantId: string, inv: string, amountMicroUsd = 1_000, n = 1): AttemptAcquisitionRequest => ({
  tenantId, workflowKey: "w", attempt: { actionKey: "create_ad_copy", invocationId: inv, number: n },
  callId: attemptCallId(tenantId, "create_ad_copy", inv, n), agentKey: "copywriting-agent",
  requestFingerprint: FP, acceptedFingerprints: [FP], amountMicroUsd, profileTimeoutMs: 30_000,
});

const registro = (a: AttemptAcquisitionRequest, custo: number): ModelCallRecord => ({
  invocationId: a.attempt.invocationId, attempt: a.attempt.number, callId: a.callId, tenantId: a.tenantId,
  workflowKey: a.workflowKey, agentKey: a.agentKey, actionKey: a.attempt.actionKey,
  trace: { correlationId: "corr-conc", transactionId: null, causationId: null, parentTransactionId: null, workflowId: null, taskId: null, runId: null },
  requestFingerprint: FP, dataClassification: "synthetic",
  classificationProvenance: [{ kind: "conservative_default", ref: null, tenantId: a.tenantId, classification: "synthetic" }],
  inputTokensEstimate: 10, inputTokensEstimateMethod: "conservative_bound", profileRef: "p@1", registryVersion: "r1",
  modelId: "m-a", provider: "lab-a", adapterKey: "test", providerModelId: "lab-a/m-a", tariffVersion: "t1",
  routingReason: "preferred", fallbackOccurred: false, resolvedProvider: "lab-a", resolvedProviderModelId: "lab-a/m-a",
  externalRequestId: null, outcome: "succeeded", failureKind: null, usage: { inputTokens: 10, outputTokens: 5, images: 0 },
  outputAssetIds: null, estimatedCostMicroUsd: a.amountMicroUsd, costMicroUsd: custo, costStatus: "settled",
  startedAt: new Date().toISOString(), latencyMs: 3,
});

const fechar = (l: PersistentCostLedger, a: AttemptAcquisitionRequest, token: string, custo = 500) =>
  l.closeAttempt({ tenantId: a.tenantId, attempt: a.attempt, fencingToken: token, outcome: "charged", actualMicroUsd: custo, pendingReason: null, record: registro(a, custo) });

const vencer = (tenantId: string, inv: string) =>
  q("update finops.model_attempts set lease_expires_at = acquired_at + interval '1 microsecond' where tenant_id = $1 and invocation_id = $2", [tenantId, inv]);

const deadlocks = async () => Number((await q("select deadlocks from pg_stat_database where datname = current_database()"))[0].deadlocks);

async function abrirPeriodo(tenantId: string, limit: number) {
  const agora = Date.now();
  return operador.openBudgetPeriod({
    tenantId, scope: "tenant", workflowKey: null, periodStart: new Date(agora - 86_400_000).toISOString(),
    periodEnd: new Date(agora + 86_400_000).toISOString(), limitMicroUsd: limit, reason: "período sintético de concorrência",
  });
}

beforeAll(async () => {
  for (const [id, slug] of [[TH, "ledger-conc-h"], [TI, "ledger-conc-i"]]) {
    await q("insert into core.tenants (id, name, slug, plan_key) values ($1, $2, $3, 'performance') on conflict (id) do nothing", [id, `${slug} (fictícia)`, slug]);
  }
  await abrirPeriodo(TH, 1_000_000);
  // Período por workflow_key: acquire, close, sweep e conciliação travam dois períodos (tenant → workflow_key).
  const agora = Date.now();
  await operador.openBudgetPeriod({
    tenantId: TH, scope: "workflow_key", workflowKey: "w", periodStart: new Date(agora - 86_400_000).toISOString(),
    periodEnd: new Date(agora + 86_400_000).toISOString(), limitMicroUsd: 900_000, reason: "período sintético por workflow",
  });
  await abrirPeriodo(TI, 3_000);
});

afterAll(async () => {
  await q("delete from core.tenants where id = any($1::uuid[])", [[TH, TI]]);
  await Promise.all([...processos.map((p) => p.uow.encerrar()), opsUow.encerrar(), admin.end()]);
});

describe("concorrência entre processos", () => {
  it("20 aquisições simultâneas da mesma chave: exatamente uma adquire", async () => {
    const r = await Promise.all(processos.map((p) => p.ledger.acquireAttempt(pedido(TH, "inv-mesma"))));
    expect(r.filter((x) => x.status === "acquired")).toHaveLength(1);
    expect(r.filter((x) => x.status === "in_progress")).toHaveLength(19);
    expect(await q("select count(*)::int n from finops.cost_ledger_entries where tenant_id = $1 and kind = 'reserve'", [TH])).toEqual([{ n: 2 }]);
  });

  it("10 competidores por um limite que comporta 3: exatamente 3 adquirem", async () => {
    const r = await Promise.all(processos.slice(0, 10).map((p, i) => p.ledger.acquireAttempt(pedido(TI, `inv-saldo-${i}`))));
    expect(r.filter((x) => x.status === "acquired")).toHaveLength(3);
    expect(r.filter((x) => x.status === "insufficient")).toHaveLength(7);
    expect(await q("select reserved_micro_usd::int r from finops.budget_periods where tenant_id = $1", [TI])).toEqual([{ r: 3_000 }]);
  });

  it("backend morto dentro da aquisição não deixa nada; morto depois dela deixa a tentativa para o sweep", async () => {
    // Morto dentro da transação: rollback, identidade liberada.
    const cru = new pg.Client({ connectionString: WORKER });
    await cru.connect();
    await cru.query("begin; set local role oplyra_worker_exec");
    await cru.query("select set_config('app.tenant_id', $1, true)", [TH]);
    const p = pedido(TH, "inv-morto");
    await cru.query("select app.acquire_model_attempt($1,$2,$3,$4,$5,$6,$7,$8,$9::text[],$10,$11,$12,null)",
      [TH, p.workflowKey, p.attempt.actionKey, p.attempt.invocationId, 1, p.callId, p.agentKey, FP, [FP], 1000, "cru", 90]);
    const pid = (await cru.query("select pg_backend_pid() p")).rows[0].p;
    cru.on("error", () => {});
    await q("select pg_terminate_backend($1)", [pid]);
    await cru.end().catch(() => {});
    expect(await q("select 1 from finops.model_attempts where tenant_id = $1 and invocation_id = 'inv-morto'", [TH])).toHaveLength(0);

    // Morto depois de adquirir: a tentativa fica reservada; lease vence; sweep retém sem registro.
    const a = await processos[0]!.ledger.acquireAttempt(p);
    expect(a.status).toBe("acquired");
    expect(await processos[1]!.ledger.expireNext(TH)).toBeNull();
    await vencer(TH, "inv-morto");
    expect(await processos[1]!.ledger.expireNext(TH)).toBe(p.callId);
    expect(await q("select status, pending_reason from finops.model_attempts where tenant_id = $1 and invocation_id = 'inv-morto'", [TH]))
      .toEqual([{ status: "pending_reconciliation", pending_reason: "lease_expired" }]);
    if (a.status !== "acquired") throw new Error("esperado acquired");
    expect(await fechar(processos[0]!.ledger, p, a.fencingToken)).toEqual({ status: "rejected" });
    expect(await q("select 1 from finops.model_call_records where tenant_id = $1 and call_id = $2", [TH, p.callId])).toHaveLength(0);
    expect((await processos[2]!.ledger.acquireAttempt(p)).status).toBe("closed");
  });

  it("fechamento em corrida com o sweep: exatamente um vence e o estado é coerente", async () => {
    for (let i = 0; i < 8; i++) {
      const p = pedido(TH, `inv-corrida-${i}`, 100);
      const a = await processos[i]!.ledger.acquireAttempt(p);
      if (a.status !== "acquired") throw new Error("esperado acquired");
      await vencer(TH, p.attempt.invocationId);
      const [f, s] = await Promise.all([fechar(processos[i]!.ledger, p, a.fencingToken, 90), processos[i + 10]!.ledger.expireNext(TH)]);
      const [linha] = await q("select status from finops.model_attempts where tenant_id = $1 and invocation_id = $2", [TH, p.attempt.invocationId]);
      const registros = await q("select 1 from finops.model_call_records where tenant_id = $1 and call_id = $2", [TH, p.callId]);
      if (f.status === "closed") {
        expect(linha.status).toBe("settled");
        expect(registros).toHaveLength(1);
        expect(s === null || s !== p.callId).toBe(true);
      } else {
        expect(f.status).toBe("rejected");
        expect(s).toBe(p.callId);
        expect(linha.status).toBe("pending_reconciliation");
        expect(registros).toHaveLength(0);
      }
    }
  });

  it("carga mista de acquire, close, sweep e conciliação em períodos compartilhados sem deadlock", async () => {
    const antes = await deadlocks();
    const tarefas: Promise<unknown>[] = [];
    for (let i = 0; i < 20; i++) {
      const l = processos[i]!.ledger;
      tarefas.push((async () => {
        const p = pedido(TH, `inv-mista-${i}`, 50);
        const a = await l.acquireAttempt(p);
        if (a.status !== "acquired") return;
        if (i % 3 === 0) {
          await vencer(TH, p.attempt.invocationId);
          await l.expireNext(TH);
          await operador.reconcileAttempt({ tenantId: TH, actionKey: "create_ad_copy", invocationId: p.attempt.invocationId, attempt: 1,
            actualMicroUsd: 40, evidenceRef: `evidencia-${i}`, reason: "conciliação sintética" }).catch((e) => {
            if (e?.code !== "55000") throw e;
          });
        } else {
          await fechar(l, p, a.fencingToken, 45);
          await l.acquireAttempt(p);
        }
      })());
    }
    const r = await Promise.allSettled(tarefas);
    expect(r.filter((x) => x.status === "rejected").map((x) => String((x as PromiseRejectedResult).reason))).toEqual([]);
    expect(await deadlocks()).toBe(antes);
    const divergentes = await q(`select b.period_id from finops.budget_periods b where b.tenant_id = any($1::uuid[]) and (
        b.reserved_micro_usd <> coalesce((select sum(e.reserved_delta) from finops.cost_ledger_entries e where e.tenant_id = b.tenant_id and e.period_id = b.period_id), 0)
     or b.settled_micro_usd <> coalesce((select sum(e.settled_delta) from finops.cost_ledger_entries e where e.tenant_id = b.tenant_id and e.period_id = b.period_id), 0)
     or b.held_micro_usd <> coalesce((select sum(e.held_delta) from finops.cost_ledger_entries e where e.tenant_id = b.tenant_id and e.period_id = b.period_id), 0))`, [[TH, TI]]);
    expect(divergentes).toEqual([]);
  });

  it("worker com relógio manipulado não encurta nem expira lease alheio", async () => {
    const p = pedido(TH, "inv-relogio", 10);
    const a = await processos[0]!.ledger.acquireAttempt(p);
    expect(a.status).toBe("acquired");
    const futuro = new Date(Date.now() + 3_600_000).toISOString();
    expect((await processos[1]!.ledger.acquireAttempt({ ...pedido(TH, "inv-relogio-2", 10), clientObservedAt: futuro })).status).toBe("invalid");
    expect((await processos[1]!.ledger.acquireAttempt({ ...p, clientObservedAt: futuro })).status).toBe("invalid");
    for (let i = 0; i < 3; i++) expect(await processos[1]!.ledger.expireNext(TH)).toBeNull();
    expect(await q("select status from finops.model_attempts where tenant_id = $1 and invocation_id = 'inv-relogio'", [TH])).toEqual([{ status: "reserved" }]);
  });

  it("sweep não toma a linha da tentativa antes da identidade: pula identidade ocupada sem esperar", async () => {
    const p = pedido(TH, "inv-locks", 10);
    const a = await processos[0]!.ledger.acquireAttempt(p);
    expect(a.status).toBe("acquired");
    await vencer(TH, "inv-locks");
    const [{ k }] = await q("select finops.identity_lock_key($1::uuid, 'create_ad_copy', 'inv-locks', 1)::text k", [TH]);
    const dono = new pg.Client({ connectionString: ADMIN });
    await dono.connect();
    try {
      await dono.query("begin");
      await dono.query("select pg_advisory_xact_lock($1::bigint)", [k]);
      // Com a identidade ocupada, o sweep volta sem esperar e sem tocar a linha.
      const inicio = Date.now();
      expect(await processos[1]!.ledger.expireNext(TH)).toBeNull();
      expect(Date.now() - inicio).toBeLessThan(2_000);
      // Um close concorrente espera somente pelo lock consultivo de identidade.
      const pendente = fechar(processos[2]!.ledger, p, a.status === "acquired" ? a.fencingToken : "", 5);
      let espera: any[] = [];
      for (let i = 0; i < 50 && espera.length === 0; i++) {
        espera = await q(`select l.locktype, c.relname from pg_locks l left join pg_class c on c.oid = l.relation
                           join pg_stat_activity s on s.pid = l.pid where not l.granted and s.usename = 'oplyra_worker_login'`);
        if (espera.length === 0) await new Promise((r) => setTimeout(r, 20));
      }
      expect(espera.length).toBeGreaterThan(0);
      expect(espera.every((w) => w.locktype === "advisory")).toBe(true);
      await dono.query("commit");
      expect(await pendente).toEqual({ status: "closed" });
    } finally {
      await dono.end();
    }
  });
});
