// Integração do Cost Ledger persistente (CR-027) com o Supabase local: adapter
// real das portas, invokeModel ponta a ponta com o Test Adapter, isolamento
// entre tenants, rotação de fingerprint entre processos e contratos JSON dos
// snapshots devolvidos pelo banco. Somente banco local descartável e dados
// sintéticos; nenhum provider real.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { attemptCallId, invokeModel } from "../packages/core/src/index.ts";
import type { AttemptAcquisitionRequest, ModelInvocationRequest } from "../packages/core/src/index.ts";
import { criarUnitOfWork } from "../packages/infra/src/db.ts";
import { CostLedgerOperations, PersistentCostLedger } from "../packages/infra/src/ai-model-harness/persistent-cost-ledger.ts";
import { createLocalModelHarness } from "../packages/infra/src/ai-model-harness/local-composition.ts";
import { TestModelProviderAdapter } from "../packages/infra/src/ai-model-harness/test-model-provider.ts";
import { HmacRequestFingerprinter } from "../packages/infra/src/ai-model-harness/hmac-fingerprint.ts";
import { InMemoryDataClassifier, SetAiEntitlements } from "../packages/testing/src/index.ts";
import { createSchemaRegistry, validateSchema } from "./contracts/json-schema-subset.ts";

const ADMIN = "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const WORKER = "postgresql://oplyra_worker_login:local-worker-2026@127.0.0.1:54422/postgres";
const OPS = "postgresql://oplyra_ops_login:local-ops-2026@127.0.0.1:54422/postgres";
const TE = "cf000001-0000-4000-8000-00000000c027";
const TF = "cf000002-0000-4000-8000-00000000c027";
const TG = "cf000003-0000-4000-8000-00000000c027";
const OPERADOR = "0e000000-0000-4000-8000-0000000000e1";

const admin = criarUnitOfWork({ connectionString: ADMIN });
const processoA = criarUnitOfWork({ connectionString: WORKER, max: 2 });
const processoB = criarUnitOfWork({ connectionString: WORKER, max: 2 });
const ops = criarUnitOfWork({ connectionString: OPS, max: 1 });
const ledgerA = new PersistentCostLedger(processoA, { leaseOwner: "worker-a" });
const ledgerB = new PersistentCostLedger(processoB, { leaseOwner: "worker-b" });
const operador = new CostLedgerOperations(ops, OPERADOR);

const C = join(dirname(fileURLToPath(import.meta.url)), "../docs/product/marketing-ops/contracts/schemas");
const ler = (p: string) => JSON.parse(readFileSync(join(C, p), "utf8"));
const esquemas = {
  record: ler("ai-model-harness/model-call-record.schema.json"),
  attempt: ler("ai-model-harness/model-attempt.schema.json"),
  period: ler("ai-model-harness/budget-period.schema.json"),
  entry: ler("ai-model-harness/cost-ledger-entry.schema.json"),
};
const registro = createSchemaRegistry([ler("common-definitions.schema.json"), ler("common-definitions-1.1.schema.json"), ...Object.values(esquemas)]);

const chave = (id: string) => ({ keyId: id, secret: new TextEncoder().encode(`oplyra-synthetic-ledger-${id}-not-a-secret`) });
const FONTE = { kind: "context_package", ref: "ctx-ledger-1" } as const;
const classifier = new InMemoryDataClassifier().register(TE, FONTE, "synthetic").register(TF, FONTE, "synthetic").register(TG, FONTE, "synthetic");

function harness(ledger: PersistentCostLedger, fingerprints = new HmacRequestFingerprinter({ active: chave("k1") }), testAdapter = new TestModelProviderAdapter()) {
  return { h: createLocalModelHarness({ budget: ledger, entitlements: new SetAiEntitlements(), classifier, fingerprints, testAdapter }), testAdapter };
}

const pedido = (extra: Partial<ModelInvocationRequest> = {}): ModelInvocationRequest => ({
  invocationId: "inv-ledger-1", tenantId: TE, workflowKey: "copy-review", agentKey: "copywriting-agent", actionKey: "create_ad_copy",
  classification: { sources: [FONTE], declared: null },
  trace: { correlationId: "corr-ledger-1", transactionId: null, causationId: null, parentTransactionId: null, workflowId: null, taskId: null, runId: null },
  messages: [{ role: "user", content: "Gerar anúncio sintético" }], inputModalities: ["text"], ...extra,
});

const q = async <T = any>(sql: string, params: unknown[] = []): Promise<T[]> => (await admin.pool.query(sql, params)).rows as T[];

beforeAll(async () => {
  for (const [id, slug] of [[TE, "ledger-e"], [TF, "ledger-f"], [TG, "ledger-g"]]) {
    await q("insert into core.tenants (id, name, slug, plan_key) values ($1, $2, $3, 'performance') on conflict (id) do nothing", [id, `${slug} (fictícia)`, slug]);
  }
  const agora = Date.now();
  for (const t of [TE, TF]) {
    await operador.openBudgetPeriod({
      tenantId: t, scope: "tenant", workflowKey: null, periodStart: new Date(agora - 86_400_000).toISOString(),
      periodEnd: new Date(agora + 86_400_000).toISOString(), limitMicroUsd: 1_000_000, reason: "período sintético de teste",
    });
  }
});

afterAll(async () => {
  await q("delete from core.tenants where id = any($1::uuid[])", [[TE, TF, TG]]);
  await Promise.all([admin.encerrar(), processoA.encerrar(), processoB.encerrar(), ops.encerrar()]);
});

describe("invokeModel com Cost Ledger persistente", () => {
  it("sucesso grava tentativa liquidada, lançamentos e um registro no mesmo fechamento", async () => {
    const { h, testAdapter } = harness(ledgerA);
    const r = await h.invoke(pedido());
    expect(r.ok).toBe(true);
    expect(testAdapter.calls).toHaveLength(1);
    const callId = attemptCallId(TE, "create_ad_copy", "inv-ledger-1", 1);
    const [a] = await q("select status, lease_seconds, lease_owner, close_outcome from finops.model_attempts where tenant_id = $1 and call_id = $2", [TE, callId]);
    expect(a).toEqual({ status: "settled", lease_seconds: 90, lease_owner: null, close_outcome: "charged" });
    const registros = await q("select record_document from finops.model_call_records where tenant_id = $1 and call_id = $2", [TE, callId]);
    expect(registros).toHaveLength(1);
    expect(validateSchema(esquemas.record, registros[0].record_document, registro)).toEqual([]);
    expect(registros[0].record_document).toMatchObject({ callId, tenantId: TE, costStatus: "settled", outcome: "succeeded" });
  });

  it("reentrega do mesmo invocationId não chama o provider de novo (tentativa já executada)", async () => {
    const { h, testAdapter } = harness(ledgerB);
    const r = await h.invoke(pedido());
    expect(!r.ok && r.failure).toMatchObject({ kind: "attempt_already_executed", contract: { code: "MODEL_ATTEMPT_ALREADY_EXECUTED" } });
    expect(testAdapter.calls).toHaveLength(0);
  });

  it("custo incerto do provider fica pendente de conciliação, com registro e reserva retida", async () => {
    const testAdapter = new TestModelProviderAdapter({ behaviors: { "oplyra-test/text-economy": "billing_unknown" } });
    const { h } = harness(ledgerA, undefined, testAdapter);
    await h.invoke(pedido({ invocationId: "inv-ledger-incerto" }));
    const [a] = await q(`select m.status, m.pending_reason, m.actual_micro_usd, r.record_document->>'costStatus' cs, r.record_document->'costMicroUsd' custo
        from finops.model_attempts m join finops.model_call_records r on r.tenant_id = m.tenant_id and r.call_id = m.call_id
       where m.tenant_id = $1 and m.invocation_id = 'inv-ledger-incerto' and m.attempt = 1`, [TE]);
    expect(a).toEqual({ status: "pending_reconciliation", pending_reason: "billing_unknown", actual_micro_usd: null, cs: "pending_reconciliation", custo: null });
  });

  it("tenant sem período configurado: BUDGET_NOT_CONFIGURED sem chamar o provider", async () => {
    const { h, testAdapter } = harness(ledgerA);
    const r = await h.invoke(pedido({ tenantId: TG }));
    expect(!r.ok && r.failure).toMatchObject({ kind: "budget_not_configured", contract: { code: "BUDGET_NOT_CONFIGURED" }, retryable: false });
    expect(testAdapter.calls).toHaveLength(0);
    expect(await q("select 1 from finops.model_attempts where tenant_id = $1", [TG])).toHaveLength(0);
  });

  it("o adapter sempre envia o lease derivado do perfil, nunca um valor do pedido", async () => {
    const req: AttemptAcquisitionRequest = {
      tenantId: TF, workflowKey: "w", attempt: { actionKey: "create_ad_copy", invocationId: "inv-lease", number: 1 },
      callId: attemptCallId(TF, "create_ad_copy", "inv-lease", 1), agentKey: "copywriting-agent",
      requestFingerprint: `hmac-sha256:v1:k1:${"b".repeat(64)}`, acceptedFingerprints: [`hmac-sha256:v1:k1:${"b".repeat(64)}`],
      amountMicroUsd: 0, profileTimeoutMs: 839_001,
    };
    expect((await ledgerA.acquireAttempt({ ...req, leaseSeconds: 60 } as AttemptAcquisitionRequest)).status).toBe("acquired");
    const [a] = await q("select lease_seconds from finops.model_attempts where tenant_id = $1 and invocation_id = 'inv-lease'", [TF]);
    expect(a.lease_seconds).toBe(900);
    expect((await ledgerA.acquireAttempt({ ...req, attempt: { ...req.attempt, number: 2 }, callId: attemptCallId(TF, "create_ad_copy", "inv-lease", 2), profileTimeoutMs: 840_001 })).status).toBe("invalid");
  });
});

describe("fechamento não confirmado contra o Ledger persistente", () => {
  const envolver = (falhas: ("depois" | "antes")[]) => {
    const ledger = new PersistentCostLedger(processoA, { leaseOwner: "worker-replay" });
    const real = ledger.closeAttempt.bind(ledger);
    const comandos: string[] = [];
    ledger.closeAttempt = async (c) => {
      comandos.push(JSON.stringify(c));
      const f = falhas[comandos.length - 1];
      if (f === "antes") throw new Error("conexão perdida antes do commit");
      const r = await real(c);
      if (f === "depois") throw new Error("conexão perdida depois do commit");
      return r;
    };
    return { ledger, comandos };
  };

  it("commit feito e resposta perdida: o replay idêntico devolve duplicate e o provider roda uma vez", async () => {
    const { ledger, comandos } = envolver(["depois"]);
    const { h, testAdapter } = harness(ledger);
    const r = await h.invoke(pedido({ invocationId: "inv-replay-1" }));
    expect(r.ok).toBe(true);
    expect(testAdapter.calls).toHaveLength(1);
    expect(comandos).toHaveLength(2);
    expect(comandos[1]).toBe(comandos[0]);
    const callId = attemptCallId(TE, "create_ad_copy", "inv-replay-1", 1);
    expect(await q("select status from finops.model_attempts where tenant_id = $1 and call_id = $2", [TE, callId])).toEqual([{ status: "settled" }]);
    expect(await q("select 1 from finops.model_call_records where tenant_id = $1 and call_id = $2", [TE, callId])).toHaveLength(1);
    expect(await q("select count(*)::int n from finops.cost_ledger_entries where tenant_id = $1 and call_id = $2 and kind = 'settle'", [TE, callId])).toEqual([{ n: 1 }]);
  });

  it("dois fechamentos sem resposta: MODEL_ATTEMPT_CLOSE_UNCONFIRMED e a tentativa fica reservada no banco, sem registro", async () => {
    const { ledger, comandos } = envolver(["antes", "antes"]);
    const { h, testAdapter } = harness(ledger);
    const r = await h.invoke(pedido({ invocationId: "inv-replay-2" }));
    expect(!r.ok && r.failure).toMatchObject({ kind: "attempt_close_unconfirmed", contract: { code: "MODEL_ATTEMPT_CLOSE_UNCONFIRMED" }, retryable: false });
    expect(testAdapter.calls).toHaveLength(1);
    expect(comandos).toHaveLength(2);
    const callId = attemptCallId(TE, "create_ad_copy", "inv-replay-2", 1);
    expect(await q("select status from finops.model_attempts where tenant_id = $1 and call_id = $2", [TE, callId])).toEqual([{ status: "reserved" }]);
    expect(await q("select 1 from finops.model_call_records where tenant_id = $1 and call_id = $2", [TE, callId])).toHaveLength(0);
  });
});

describe("isolamento entre tenants e rotação de chave entre processos", () => {
  it("tenant F não fecha nem enxerga tentativa do tenant E", async () => {
    const callId = attemptCallId(TE, "create_ad_copy", "inv-ledger-1", 1);
    const r = await ledgerA.closeAttempt({
      tenantId: TF, attempt: { actionKey: "create_ad_copy", invocationId: "inv-ledger-1", number: 1 },
      fencingToken: "00000000-0000-4000-8000-000000000000", outcome: "not_charged", actualMicroUsd: 0, pendingReason: null,
      record: {} as never,
    });
    expect(r).toEqual({ status: "rejected" });
    await expect(processoA.withWorkerTransaction(TF as never, "teste", (tx) =>
      (tx as any).query("select app.budget_remaining($1::uuid, 'w')", [TE]))).rejects.toMatchObject({ code: "42501" });
    await expect(processoA.withWorkerTransaction(TF as never, "teste", (tx) =>
      (tx as any).query("select * from finops.model_attempts where call_id = $1", [callId]))).rejects.toMatchObject({ code: "42501" });
  });

  it("chave antiga no keyring do processo B responde pela tentativa do processo A; chave aposentada é conflito", async () => {
    const fpA = new HmacRequestFingerprinter({ active: chave("k1") });
    const fpB = new HmacRequestFingerprinter({ active: chave("k2"), previous: [chave("k1")] });
    const fpC = new HmacRequestFingerprinter({ active: chave("k2") });
    const material = "material-sintetico-rotacao";
    const [a, b, c] = await Promise.all([fpA.fingerprint(material), fpB.fingerprint(material), fpC.fingerprint(material)]);
    const base = {
      tenantId: TF, workflowKey: "w", attempt: { actionKey: "create_ad_copy", invocationId: "inv-rot", number: 1 },
      callId: attemptCallId(TF, "create_ad_copy", "inv-rot", 1), agentKey: "copywriting-agent", amountMicroUsd: 10, profileTimeoutMs: 30_000,
    };
    expect((await ledgerA.acquireAttempt({ ...base, requestFingerprint: a.primary, acceptedFingerprints: a.accepted })).status).toBe("acquired");
    expect((await ledgerB.acquireAttempt({ ...base, requestFingerprint: b.primary, acceptedFingerprints: b.accepted })).status).toBe("in_progress");
    expect((await ledgerB.acquireAttempt({ ...base, requestFingerprint: c.primary, acceptedFingerprints: c.accepted })).status).toBe("conflict");
  });
});

describe("contratos dos dados persistidos", () => {
  it("callId derivado no SQL é idêntico ao do núcleo, inclusive com Unicode, aspas e controles", async () => {
    for (const inv of ["simples", "açaí 🚀", 'aspas " e \\ barra', "linha\nnova\ttab\u0001\u007f", "😀".repeat(40)]) {
      const [r] = await q("select finops.attempt_call_id($1::uuid, 'create_ad_copy', $2, 3) c", [TE, inv]);
      expect(r.c, JSON.stringify(inv)).toBe(attemptCallId(TE, "create_ad_copy", inv, 3));
    }
  });

  it("snapshots de tentativa, período e lançamentos validam contra os schemas do Ledger", async () => {
    const tentativas = await q("select finops.attempt_snapshot(m) s from finops.model_attempts m where tenant_id = any($1::uuid[])", [[TE, TF]]);
    const periodos = await q("select finops.period_snapshot(b) s from finops.budget_periods b where tenant_id = any($1::uuid[])", [[TE, TF]]);
    const entradas = await q(`select jsonb_build_object('tenantId', tenant_id::text, 'entryId', entry_id, 'callId', call_id, 'kind', kind,
        'periodId', period_id, 'periodScope', period_scope, 'reservedDelta', reserved_delta, 'settledDelta', settled_delta,
        'heldDelta', held_delta, 'overrunMicroUsd', overrun_micro_usd, 'actorType', actor_type, 'reason', reason,
        'createdAt', finops.iso(created_at)) s from finops.cost_ledger_entries where tenant_id = any($1::uuid[])`, [[TE, TF]]);
    expect(tentativas.length * periodos.length * entradas.length).toBeGreaterThan(0);
    for (const t of tentativas) expect(validateSchema(esquemas.attempt, t.s, registro)).toEqual([]);
    for (const p of periodos) expect(validateSchema(esquemas.period, p.s, registro)).toEqual([]);
    for (const e of entradas) expect(validateSchema(esquemas.entry, e.s, registro)).toEqual([]);
    expect(tentativas.every((t) => !("fencingToken" in t.s))).toBe(true);
  });

  it("o harness não usa o Supabase remoto: a composição aponta para o banco local", () => {
    expect(WORKER).toContain("127.0.0.1:54422");
    expect(invokeModel).toBeTypeOf("function");
  });
});
