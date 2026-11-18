// Integração do Product Agent Runtime com o Supabase LOCAL e papéis reais (I-02, local): pessoas pelo login
// web (papel `authenticated`), workers pelo login do worker (papel `oplyra_worker_exec`). Exige `pnpm db:start`,
// migrations, `pnpm db:roles` e seeds. Cada execução cria empresas próprias e as remove no fim (cascata).
// O tempo é controlado pelo relógio injetado: as funções do banco recebem `p_now`, então não há `sleep`.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { criarUnitOfWork, comoCliente } from "../src/db.ts";
import { auditLog } from "../src/repositories.ts";
import { criarAccessContextResolver } from "../src/auth.ts";
import { runRepository, killSwitchRepository, catalogoDeAgentesCongelado } from "../src/runtime-repository.ts";
import {
  submitRunAsUser, submitRunAsSystem, executeNextRun, activateKillSwitch, releaseKillSwitch, cancelRun, getRun, listRuns,
  RunStepFailure, type RunHandler,
} from "../../core/src/runtime/use-cases.ts";
import type { NewRun, RunLimits } from "../../core/src/runtime/domain.ts";
import type { RuntimeDeps } from "../../core/src/runtime/ports.ts";
import type { AccessContext, TenantId, UnitOfWork, UserId } from "@oplyra/core";

const WEB = "postgresql://oplyra_web_login:local-web-2026@127.0.0.1:54422/postgres";
const WORKER = "postgresql://oplyra_worker_login:local-worker-2026@127.0.0.1:54422/postgres";
const ADMIN = "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

const GESTOR = randomUUID() as UserId;
const LEITOR = randomUUID() as UserId;
const OWNER_B = randomUUID() as UserId;
const TA = randomUUID() as TenantId;
const TB = randomUUID() as TenantId;

const web = criarUnitOfWork({ connectionString: WEB });
const worker = criarUnitOfWork({ connectionString: WORKER, max: 12 });
const admin = criarUnitOfWork({ connectionString: ADMIN });
// Pessoa pelo login web; worker pelo login do worker: exatamente a separação de papéis do banco.
const uow: UnitOfWork = { ...web, withWorkerTransaction: worker.withWorkerTransaction };
const resolver = criarAccessContextResolver(web);
const ctx = (u: UserId, t: TenantId): Promise<AccessContext> => resolver.resolve({ userId: u, email: "" }, t);

const T0 = Date.UTC(2026, 10, 11, 12, 0, 0);
let offsetMs = 0;
const agora = (): Date => new Date(T0 + offsetMs);
const avancar = (ms: number): void => { offsetMs += ms; };
const deps: RuntimeDeps = {
  uow, runs: runRepository, killSwitch: killSwitchRepository, agents: { catalog: () => catalogoDeAgentesCongelado() },
  audit: auditLog, clock: { now: agora },
};

const LEASE = 30;
const LIMITES: RunLimits = { maxCostMicroUsd: 1_000, maxToolCalls: 5, maxTurns: 5, maxAttempts: 3, timeoutMs: 600_000 };
const nova = (over: Partial<NewRun> = {}): NewRun => ({
  agentKey: "copywriting-agent", actionKey: "create_copy_variants", trigger: "user", autonomy: "draft",
  correlationId: `corr-${randomUUID().slice(0, 8)}`, causationId: null, workflowId: null, taskId: null,
  idempotencyKey: `idem-${randomUUID()}`, input: {}, limits: LIMITES, availableAt: new Date(T0 - 1_000), ...over,
});
const rodar = (handler: RunHandler, w = "w1", tenantId: TenantId = TA) =>
  executeNextRun(deps, { tenantId, workerId: w, leaseSeconds: LEASE, handler });
const model = (api: Parameters<RunHandler>[0], k: string, est = 100, custo = 100, log?: string[]) =>
  api.step(k, { kind: "model", effectful: false, estimateMicroUsd: est }, async () => { log?.push(k); return { result: { k }, costMicroUsd: custo }; });
function trilha() {
  const chamadas: string[] = [];
  const handler: RunHandler = async (api) => { for (const k of ["a", "b", "c"]) await model(api, k, 100, 100, chamadas); return { kind: "completed" }; };
  return { chamadas, handler };
}

/** Esvazia a fila da empresa para o teste seguinte não herdar execuções. */
async function limparFila(): Promise<void> {
  await admin.pool.query(`delete from runtime.agent_runs where tenant_id = any($1::uuid[])`, [[TA, TB]]).catch(async () => {
    // execuções não são removíveis pela aplicação (guarda); como dono, desliga só o gatilho de exclusão nesta limpeza de teste
    await admin.pool.query(`alter table runtime.agent_runs disable trigger runs_guarda`);
    try { await admin.pool.query(`delete from runtime.agent_runs where tenant_id = any($1::uuid[])`, [[TA, TB]]); }
    finally { await admin.pool.query(`alter table runtime.agent_runs enable trigger runs_guarda`); }
  });
  await admin.pool.query(`delete from runtime.kill_switches where tenant_id is null or tenant_id = any($1::uuid[])`, [[TA, TB]]);
  offsetMs = 0;
}

beforeAll(async () => {
  for (const [id, slug] of [[TA, "runtime-it-a"], [TB, "runtime-it-b"]] as const) {
    await admin.pool.query(`insert into core.tenants (id, name, slug) values ($1, $2, $3)`, [id, `Runtime IT ${slug}`, `${slug}-${id.slice(0, 8)}`]);
  }
  await admin.pool.query(
    `insert into core.memberships (tenant_id, user_id, role_key) values ($1,$2,'marketing_manager'), ($1,$3,'viewer'), ($4,$5,'owner')`,
    [TA, GESTOR, LEITOR, TB, OWNER_B]);
});

afterAll(async () => {
  await admin.pool.query(`delete from runtime.kill_switches where tenant_id is null`);
  await admin.pool.query(`delete from core.tenants where id = any($1::uuid[])`, [[TA, TB]]); // cascata: execuções, passos, interrupções
  await web.encerrar(); await worker.encerrar(); await admin.encerrar();
});

describe("submissão, permissões do banco e auditoria", () => {
  it("gestor submete; leitor lê mas não submete; agente/ação/autonomia vêm dos registries congelados", async () => {
    await limparFila();
    const gestor = await ctx(GESTOR, TA), leitor = await ctx(LEITOR, TA);
    const { run } = await submitRunAsUser(deps, gestor, nova());
    expect(run).toMatchObject({ status: "queued", attempt: 0, tenantId: TA, agentKey: "copywriting-agent" });
    await expect(submitRunAsUser(deps, leitor, nova())).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    await expect(listRuns(deps, leitor)).resolves.toHaveLength(1);
    await expect(submitRunAsUser(deps, gestor, nova({ agentKey: "fantasma-agent" }))).rejects.toMatchObject({ reason: "AGENT_UNKNOWN" });
    await expect(submitRunAsUser(deps, gestor, nova({ actionKey: "acao_que_nao_existe" }))).rejects.toMatchObject({ reason: "ACTION_NOT_ALLOWED" });
    await expect(submitRunAsUser(deps, gestor, nova({ autonomy: "policy_execute" }))).rejects.toMatchObject({ reason: "AUTONOMY_EXCEEDED" });
    await expect(submitRunAsUser(deps, gestor, nova({ autonomy: "approval_required" }))).rejects.toMatchObject({ reason: "AUTONOMY_EXCEEDED" });
  });

  it("o banco recusa sozinho o que o domínio deixasse passar (chamada direta à fronteira)", async () => {
    const gestor = await ctx(GESTOR, TA);
    const direta = (limits: Record<string, number>) => uow.withUserTransaction(gestor, (tx) => comoCliente(tx).query(
      `select app.runtime_enqueue($1::uuid, $2::jsonb, 'user', null, now())`,
      [TA, JSON.stringify({ ...nova(), availableAt: new Date().toISOString(), limits: { ...LIMITES, ...limits } })]));
    await expect(direta({ maxCostMicroUsd: 0 })).rejects.toMatchObject({ code: "23514" });
    await expect(direta({ maxAttempts: 11 })).rejects.toMatchObject({ code: "23514" });
    await expect(direta({ timeoutMs: -1 })).rejects.toMatchObject({ code: "23514" });
  });

  it("a mesma mensagem entregue várias vezes AO MESMO TEMPO gera uma execução e uma auditoria", async () => {
    await limparFila();
    const gestor = await ctx(GESTOR, TA);
    const msg = nova({ idempotencyKey: `task-998-${randomUUID()}` });
    const r = await Promise.all([
      submitRunAsUser(deps, gestor, msg), submitRunAsUser(deps, gestor, msg),
      submitRunAsSystem(deps, TA, msg), submitRunAsUser(deps, gestor, msg), submitRunAsSystem(deps, TA, msg),
    ]);
    expect(new Set(r.map((x) => x.run.id)).size).toBe(1);
    expect(r.filter((x) => !x.duplicate)).toHaveLength(1);
    const { rows } = await admin.pool.query(`select count(*)::int as n from core.audit_log where tenant_id = $1 and action = 'run.submit' and target = $2`, [TA, r[0]!.run.id]);
    expect((rows[0] as { n: number }).n).toBe(1);
  });

  it("quem submeteu vem da sessão, não do payload: pessoa não se passa por sistema", async () => {
    await limparFila();
    const gestor = await ctx(GESTOR, TA);
    const { run } = await uow.withUserTransaction(gestor, (tx) => runRepository.enqueue(tx, {
      tenantId: TA, run: nova(), requestedBy: { type: "system", id: "forjado" }, now: agora(),
    }));
    const { rows } = await admin.pool.query(`select requested_by_type as t, requested_by_id as i from runtime.agent_runs where id = $1`, [run.id]);
    expect(rows[0]).toEqual({ t: "user", i: GESTOR });
  });
});

describe("fronteira por papel", () => {
  it("worker não decide pelo humano (cancelar, interromper); pessoa não age como worker; ninguém lê tabela", async () => {
    await limparFila();
    const gestor = await ctx(GESTOR, TA);
    const { run } = await submitRunAsUser(deps, gestor, nova());
    await expect(worker.withWorkerTransaction(TA, "t", (tx) => runRepository.cancel(tx, { tenantId: TA, id: run.id, now: agora(), reason: "x" }))).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    await expect(worker.withWorkerTransaction(TA, "t", (tx) => killSwitchRepository.activate(tx, { tenantId: TA, reason: "x", by: GESTOR, now: agora() }))).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    await expect(uow.withUserTransaction(gestor, (tx) => runRepository.claimNext(tx, { tenantId: TA, workerId: "pessoa", now: agora(), leaseSeconds: 30 }))).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    await expect(uow.withUserTransaction(gestor, (tx) => comoCliente(tx).query(`select * from runtime.agent_runs`))).rejects.toMatchObject({ code: "42501" });
    await expect(worker.withWorkerTransaction(TA, "t", (tx) => comoCliente(tx).query(`select * from runtime.agent_runs`))).rejects.toMatchObject({ code: "42501" });
    await expect(worker.withWorkerTransaction(TA, "t", (tx) => comoCliente(tx).query(`update runtime.agent_runs set attempt = 9`))).rejects.toMatchObject({ code: "42501" });
  });
});

describe("execução ponta a ponta e TST-12 (recuperação) com banco real", () => {
  it("conduz os passos, soma o custo, completa e audita com correlação; passos legíveis pelo leitor", async () => {
    await limparFila();
    const gestor = await ctx(GESTOR, TA), leitor = await ctx(LEITOR, TA);
    const { run } = await submitRunAsUser(deps, gestor, nova({ correlationId: "corr-ponta-a-ponta" }));
    const { chamadas, handler } = trilha();
    expect(await rodar(handler)).toMatchObject({ status: "completed", runId: run.id, attempt: 1 });
    expect(chamadas).toEqual(["a", "b", "c"]);
    const { run: fim, steps } = await getRun(deps, leitor, run.id);
    expect(fim).toMatchObject({ status: "completed", usage: { costMicroUsd: 300, turns: 3, toolCalls: 0 }, fencingToken: null, leaseOwner: null });
    expect(fim.deadlineAt!.getTime()).toBe(fim.startedAt!.getTime() + LIMITES.timeoutMs);
    expect(steps.map((s) => s.stepKey).sort()).toEqual(["a", "b", "c"]);
    expect(steps.every((s) => s.checkpoint !== null)).toBe(true);
    const { rows } = await admin.pool.query(`select action, actor_type as a, after->>'correlationId' as c from core.audit_log where tenant_id = $1 and target = $2 order by created_at`, [TA, run.id]);
    expect(rows.map((r) => (r as { action: string }).action)).toEqual(["run.submit", "run.completed"]);
    expect(rows).toMatchObject([{ a: "user", c: "corr-ponta-a-ponta" }, { a: "worker", c: "corr-ponta-a-ponta" }]);
    expect(await rodar(handler)).toEqual({ status: "idle" });
  });

  async function quedaNoMeio(comEfeito: boolean) {
    const gestor = await ctx(GESTOR, TA);
    const { run } = await submitRunAsUser(deps, gestor, nova());
    const claim = (await worker.withWorkerTransaction(TA, "t", (tx) => runRepository.claimNext(tx, { tenantId: TA, workerId: "morto", now: agora(), leaseSeconds: LEASE })))!;
    await worker.withWorkerTransaction(TA, "t", async (tx) => {
      await runRepository.beginStep(tx, { lease: claim.lease, stepKey: "a", effectful: false, now: agora() });
      await runRepository.completeStep(tx, { lease: claim.lease, stepKey: "a", result: { k: "a" }, usageDelta: { costMicroUsd: 100, toolCalls: 0, turns: 1 }, now: agora() });
      await runRepository.beginStep(tx, { lease: claim.lease, stepKey: "b", effectful: comEfeito, now: agora() });
    });
    return run;
  }

  it("queda no meio: lease válido bloqueia outros; vencido, a retomada NÃO duplica checkpoint nem custo", async () => {
    await limparFila();
    const run = await quedaNoMeio(false);
    expect(await rodar(async () => ({ kind: "completed" }), "w2")).toEqual({ status: "idle" });
    avancar((LEASE + 1) * 1000);
    const { chamadas, handler } = trilha();
    expect(await rodar(handler, "w2")).toMatchObject({ status: "completed", attempt: 2 });
    expect(chamadas).toEqual(["b", "c"]);
    const { run: fim, steps } = await getRun(deps, await ctx(GESTOR, TA), run.id);
    expect(fim.usage).toEqual({ costMicroUsd: 300, toolCalls: 0, turns: 3 });
    expect(steps.filter((s) => s.stepKey === "a")).toHaveLength(1);
  });

  it("efeito incerto: não repete, escala para pessoa e deixa a evidência", async () => {
    await limparFila();
    const run = await quedaNoMeio(true);
    avancar((LEASE + 1) * 1000);
    const { chamadas, handler } = trilha();
    expect(await rodar(handler, "w2")).toMatchObject({ status: "escalated", code: "EFFECT_UNCERTAIN" });
    expect(chamadas).toEqual([]);
    const { run: fim } = await getRun(deps, await ctx(GESTOR, TA), run.id);
    expect(fim).toMatchObject({ status: "failed", needsHuman: true, error: { code: "EFFECT_UNCERTAIN", retryable: false } });
    expect(await rodar(handler, "w3")).toEqual({ status: "idle" });
  });

  it("abandonada com as tentativas esgotadas vai a dead-letter e nunca é entregue de novo", async () => {
    await limparFila();
    const gestor = await ctx(GESTOR, TA);
    const { run } = await submitRunAsUser(deps, gestor, nova({ limits: { ...LIMITES, maxAttempts: 2 } }));
    for (let i = 0; i < 2; i++) {
      await worker.withWorkerTransaction(TA, "t", (tx) => runRepository.claimNext(tx, { tenantId: TA, workerId: `m${i}`, now: agora(), leaseSeconds: LEASE }));
      avancar((LEASE + 1) * 1000);
    }
    const { chamadas, handler } = trilha();
    expect(await rodar(handler, "w9")).toEqual({ status: "idle" });
    expect(chamadas).toEqual([]);
    expect((await getRun(deps, gestor, run.id)).run).toMatchObject({ status: "failed", needsHuman: true, error: { code: "RETRY_ATTEMPTS_EXHAUSTED" } });
  });

  it("política de retentativa: espera 1, 2 s; esgota em RETRY_ATTEMPTS_EXHAUSTED preservando a causa", async () => {
    await limparFila();
    const gestor = await ctx(GESTOR, TA);
    const { run } = await submitRunAsUser(deps, gestor, nova());
    const sempreFalha: RunHandler = async (api) => {
      await api.step("a", { kind: "model", effectful: false, estimateMicroUsd: 10 }, async () => {
        throw new RunStepFailure({ code: "PROVIDER_TIMEOUT", category: "timeout", retryable: true, message: "lento" });
      });
      return { kind: "completed" };
    };
    expect(await rodar(sempreFalha)).toMatchObject({ status: "requeued", attempt: 1 });
    expect(await rodar(sempreFalha)).toEqual({ status: "idle" });
    avancar(1_000);
    expect(await rodar(sempreFalha)).toMatchObject({ status: "requeued", attempt: 2 });
    avancar(2_000);
    expect(await rodar(sempreFalha)).toMatchObject({ status: "failed", attempt: 3, code: "RETRY_ATTEMPTS_EXHAUSTED" });
    expect((await getRun(deps, gestor, run.id)).run).toMatchObject({
      status: "failed", needsHuman: true, error: { code: "RETRY_ATTEMPTS_EXHAUSTED", details: { rootCause: { code: "PROVIDER_TIMEOUT" } } },
    });
  });
});

describe("falha conhecida de passo pago × queda (banco real)", () => {
  it("falha classificada ANTES do efeito: a retentativa roda (não escala); passo abortado fica na trilha", async () => {
    await limparFila();
    const gestor = await ctx(GESTOR, TA);
    const { run } = await submitRunAsUser(deps, gestor, nova());
    let falhou = false;
    const chamadas: string[] = [];
    const h: RunHandler = async (api) => {
      await api.step("pago", { kind: "model", effectful: true, estimateMicroUsd: 10 }, async () => {
        chamadas.push("pago");
        if (!falhou) { falhou = true; throw new RunStepFailure({ code: "INTEGRATION_UNAVAILABLE", category: "integration", retryable: true, message: "fora do ar" }); }
        return { result: "ok", costMicroUsd: 10 };
      });
      return { kind: "completed" };
    };
    expect(await rodar(h)).toMatchObject({ status: "requeued", attempt: 1, code: "INTEGRATION_UNAVAILABLE" });
    const { steps } = await getRun(deps, gestor, run.id);
    expect(steps[0]).toMatchObject({ stepKey: "pago", effectful: true, checkpoint: null });
    expect(steps[0]!.abortedAt).toBeInstanceOf(Date);
    avancar(1_000);
    expect(await rodar(h)).toMatchObject({ status: "completed", attempt: 2 });
    expect(chamadas).toEqual(["pago", "pago"]);
    const fim = await getRun(deps, gestor, run.id);
    expect(fim.run).toMatchObject({ status: "completed", needsHuman: false, usage: { costMicroUsd: 10, turns: 1 } });
    expect(fim.steps[0]!.abortedAt).toBeNull(); // reiniciado e concluído
  });

  it("erro NÃO classificado no passo pago mantém a incerteza (o processo pode ter causado o efeito)", async () => {
    await limparFila();
    const gestor = await ctx(GESTOR, TA);
    const { run } = await submitRunAsUser(deps, gestor, nova());
    const r = await rodar(async (api) => {
      await api.step("pago", { kind: "model", effectful: true, estimateMicroUsd: 10 }, async () => { throw new Error("explodiu no meio"); });
      return { kind: "completed" };
    });
    expect(r).toMatchObject({ status: "failed", code: "STEP_FAILED" });
    const { steps } = await getRun(deps, gestor, run.id);
    expect(steps[0]).toMatchObject({ stepKey: "pago", checkpoint: null, abortedAt: null }); // continua em aberto
  });
});

describe("TST-13 — concorrência REAL", () => {
  it("quatro workers disputando 12 execuções: cada uma roda exatamente uma vez, sem passo repetido", async () => {
    await limparFila();
    const gestor = await ctx(GESTOR, TA);
    const ids = new Set<string>();
    for (let i = 0; i < 12; i++) ids.add((await submitRunAsUser(deps, gestor, nova())).run.id);
    const porRun = new Map<string, string[]>();
    const handler: RunHandler = async (api, run) => {
      for (const k of ["a", "b"]) await api.step(k, { kind: "model", effectful: false, estimateMicroUsd: 10 }, async () => {
        porRun.set(run.id, [...(porRun.get(run.id) ?? []), k]);
        return { result: k, costMicroUsd: 10 };
      });
      return { kind: "completed" };
    };
    const laco = async (w: string) => {
      const feitos: string[] = [];
      for (;;) {
        const r = await rodar(handler, w);
        if (r.status === "idle") return feitos;
        if (r.status === "completed") feitos.push(r.runId);
      }
    };
    const feitos = (await Promise.all(["w1", "w2", "w3", "w4"].map(laco))).flat();
    expect(feitos).toHaveLength(12);
    expect(new Set(feitos)).toEqual(ids);                                 // nenhuma ficou para trás nem foi duplicada
    for (const id of ids) expect(porRun.get(id)).toEqual(["a", "b"]);     // nenhum passo executou duas vezes
    const { rows } = await admin.pool.query(`select count(*)::int as n, max(attempt)::int as maxa from runtime.agent_runs where tenant_id = $1 and status = 'completed'`, [TA]);
    expect(rows[0]).toEqual({ n: 12, maxa: 1 });
  });

  it("worker obsoleto grava com a tentativa antiga e é rejeitado; a execução termina uma única vez", async () => {
    await limparFila();
    const gestor = await ctx(GESTOR, TA);
    const { run } = await submitRunAsUser(deps, gestor, nova());
    const t2 = trilha();
    let r2!: Awaited<ReturnType<typeof rodar>>;
    const lento: RunHandler = async (api) => {
      await model(api, "a");
      avancar((LEASE + 1) * 1000);
      r2 = await rodar(t2.handler, "w2");
      await model(api, "b"); // tentativa 1 está obsoleta
      return { kind: "completed" };
    };
    expect(await rodar(lento, "w1")).toMatchObject({ status: "lease_lost", attempt: 1 });
    expect(r2).toMatchObject({ status: "completed", attempt: 2 });
    expect(t2.chamadas).toEqual(["b", "c"]);
    expect((await getRun(deps, gestor, run.id)).run).toMatchObject({ status: "completed", attempt: 2, usage: { costMicroUsd: 300, turns: 3 } });
    const { rows } = await admin.pool.query(`select count(*)::int as n from core.audit_log where tenant_id = $1 and target = $2 and action = 'run.completed'`, [TA, run.id]);
    expect((rows[0] as { n: number }).n).toBe(1);
  });

  it("a porta rejeita tentativa/token antigos e token adulterado na tentativa atual", async () => {
    await limparFila();
    const gestor = await ctx(GESTOR, TA);
    await submitRunAsUser(deps, gestor, nova());
    const w = <T>(f: Parameters<typeof worker.withWorkerTransaction<T>>[2]) => worker.withWorkerTransaction(TA, "t", f);
    const antigo = (await w((tx) => runRepository.claimNext(tx, { tenantId: TA, workerId: "w1", now: agora(), leaseSeconds: LEASE })))!;
    await w((tx) => runRepository.beginStep(tx, { lease: antigo.lease, stepKey: "a", effectful: false, now: agora() }));
    avancar((LEASE + 1) * 1000);
    const novo = (await w((tx) => runRepository.claimNext(tx, { tenantId: TA, workerId: "w2", now: agora(), leaseSeconds: LEASE })))!;
    expect(novo.lease.attempt).toBe(2);
    expect(novo.lease.fencingToken).not.toBe(antigo.lease.fencingToken);
    const stale = { code: "RUN_ATTEMPT_STALE" };
    await expect(w((tx) => runRepository.heartbeat(tx, { lease: antigo.lease, now: agora(), leaseSeconds: LEASE }))).rejects.toMatchObject(stale);
    await expect(w((tx) => runRepository.completeStep(tx, { lease: antigo.lease, stepKey: "a", result: 1, usageDelta: { costMicroUsd: 1, toolCalls: 0, turns: 1 }, now: agora() }))).rejects.toMatchObject(stale);
    await expect(w((tx) => runRepository.settle(tx, { lease: antigo.lease, outcome: { kind: "completed" }, now: agora() }))).rejects.toMatchObject(stale);
    await expect(w((tx) => runRepository.settle(tx, { lease: { ...novo.lease, fencingToken: "adulterado" }, outcome: { kind: "completed" }, now: agora() }))).rejects.toMatchObject(stale);
    const { run } = await getRun(deps, gestor, antigo.lease.runId);
    expect(run).toMatchObject({ status: "running", attempt: 2, usage: { costMicroUsd: 0 } });
  });

  it("cancelar durante a execução: o worker perde o lease e não grava mais nada", async () => {
    await limparFila();
    const gestor = await ctx(GESTOR, TA);
    const { run } = await submitRunAsUser(deps, gestor, nova());
    const h: RunHandler = async (api) => {
      await model(api, "a");
      await cancelRun(deps, gestor, run.id, "pedido do cliente");
      await model(api, "b");
      return { kind: "completed" };
    };
    expect(await rodar(h)).toMatchObject({ status: "lease_lost" });
    expect((await getRun(deps, gestor, run.id)).run).toMatchObject({ status: "cancelled", error: { code: "CANCELLED", message: "pedido do cliente" }, usage: { costMicroUsd: 100 } });
    await expect(cancelRun(deps, gestor, run.id, "de novo")).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  });
});

describe("TST-14 — limites e kill switch com banco real", () => {
  it("custo, ferramentas, turnos e prazo bloqueiam a PRÓXIMA chamada; ela nunca acontece", async () => {
    for (const [limites, esperado, escolhe] of [
      [{ maxCostMicroUsd: 150 }, "RUN_BLOCKED_COST_EXHAUSTED", "model"],
      [{ maxToolCalls: 1 }, "RUN_BLOCKED_TOOL_CALLS_EXHAUSTED", "tool"],
      [{ maxTurns: 1 }, "RUN_BLOCKED_TURNS_EXHAUSTED", "model"],
      [{ timeoutMs: 10_000 }, "RUN_BLOCKED_DEADLINE_EXCEEDED", "model"],
    ] as const) {
      await limparFila();
      const gestor = await ctx(GESTOR, TA);
      const { run } = await submitRunAsUser(deps, gestor, nova({ limits: { ...LIMITES, ...limites } }));
      const log: string[] = [];
      const r = await rodar(async (api) => {
        for (const k of ["p1", "p2"]) {
          if ("timeoutMs" in limites && k === "p2") avancar(10_000);
          await api.step(k, { kind: escolhe, effectful: false, estimateMicroUsd: 100 }, async () => { log.push(k); return { result: k, costMicroUsd: 100 }; });
        }
        return { kind: "completed" };
      });
      expect(r, esperado).toMatchObject({ status: "failed", code: esperado });
      expect(log, esperado).toEqual(["p1"]);
      expect((await getRun(deps, gestor, run.id)).run).toMatchObject({ status: "failed", needsHuman: true, error: { code: esperado } });
    }
  });

  it("kill switch no meio bloqueia o próximo passo com o motivo; com ele ativo nada novo começa; ao liberar a fila segue", async () => {
    await limparFila();
    const gestor = await ctx(GESTOR, TA);
    const { run } = await submitRunAsUser(deps, gestor, nova());
    const log: string[] = [];
    const r = await rodar(async (api) => {
      await model(api, "a", 0, 0, log);
      await activateKillSwitch(deps, gestor, "incidente de custo");
      await model(api, "b", 0, 0, log);
      return { kind: "completed" };
    });
    expect(r).toMatchObject({ status: "failed", code: "RUN_BLOCKED_KILL_SWITCH" });
    expect(log).toEqual(["a"]);
    expect((await getRun(deps, gestor, run.id)).run.error!.message).toContain("incidente de custo");

    const { run: outra } = await submitRunAsUser(deps, gestor, nova());
    const { chamadas, handler } = trilha();
    const bloqueado = await rodar(handler, "w1");
    expect(bloqueado).toMatchObject({ status: "blocked", reason: "KILL_SWITCH" });
    expect((bloqueado as { message: string }).message).toContain("incidente de custo");
    expect(chamadas).toEqual([]);
    expect((await getRun(deps, gestor, outra.id)).run).toMatchObject({ status: "queued", attempt: 0 }); // nem o lease foi tomado

    await releaseKillSwitch(deps, gestor);
    expect(await rodar(handler, "w1")).toMatchObject({ status: "completed" });
    const { rows } = await admin.pool.query(`select action from core.audit_log where tenant_id = $1 and action like 'runtime.kill_switch.%' order by created_at`, [TA]);
    expect(rows.map((x) => (x as { action: string }).action)).toEqual(["runtime.kill_switch.activate", "runtime.kill_switch.release"]);
  });

  it("interrupção global (só o operador escreve) prevalece sobre qualquer empresa; a da empresa não vaza", async () => {
    await limparFila();
    const gestor = await ctx(GESTOR, TA), donoB = await ctx(OWNER_B, TB);
    await submitRunAsUser(deps, gestor, nova());
    await submitRunAsUser(deps, donoB, nova());
    await activateKillSwitch(deps, gestor, "só da A");
    const { handler } = trilha();
    expect(await rodar(handler, "w", TA)).toMatchObject({ status: "blocked" });
    expect(await rodar(handler, "w", TB)).toMatchObject({ status: "completed" }); // a de A não vazou para B
    await admin.pool.query(`insert into runtime.kill_switches (tenant_id, scope, active, reason) values (null, 'global', true, 'parada geral (teste)')`);
    try {
      await submitRunAsUser(deps, donoB, nova());
      const g = await rodar(handler, "w", TB);
      expect(g).toMatchObject({ status: "blocked", reason: "KILL_SWITCH" });
      expect((g as { message: string }).message).toContain("global");
    } finally {
      await admin.pool.query(`delete from runtime.kill_switches where tenant_id is null`);
    }
  });
});

describe("isolamento entre empresas com sessão real", () => {
  it("a empresa B não enxerga, cancela, nem executa nada da A; fronteira recusa tenant divergente", async () => {
    await limparFila();
    const gestor = await ctx(GESTOR, TA), donoB = await ctx(OWNER_B, TB);
    const { run } = await submitRunAsUser(deps, gestor, nova());
    await expect(getRun(deps, donoB, run.id)).rejects.toMatchObject({ code: "RUN_NOT_FOUND" });
    await expect(listRuns(deps, donoB)).resolves.toEqual([]);
    await expect(cancelRun(deps, donoB, run.id, "invasão")).rejects.toMatchObject({ code: "RUN_NOT_FOUND" });
    const { chamadas, handler } = trilha();
    expect(await rodar(handler, "wb", TB)).toEqual({ status: "idle" });
    expect(chamadas).toEqual([]);
    // pedir o tenant de A com o tenant ativo de B, direto na fronteira
    await expect(uow.withUserTransaction(donoB, (tx) => comoCliente(tx).query(`select app.runtime_get($1::uuid, $2::uuid)`, [TA, run.id]))).rejects.toMatchObject({ code: "42501" });
    await expect(worker.withWorkerTransaction(TB, "t", (tx) => comoCliente(tx).query(`select app.runtime_claim($1::uuid, 'w', now(), 30)`, [TA]))).rejects.toMatchObject({ code: "42501" });
    expect((await getRun(deps, gestor, run.id)).run).toMatchObject({ status: "queued", attempt: 0 });
  });

  it("a mesma chave de idempotência em outra empresa é outra execução", async () => {
    await limparFila();
    const gestor = await ctx(GESTOR, TA), donoB = await ctx(OWNER_B, TB);
    const msg = nova({ idempotencyKey: "chave-compartilhada" });
    const a = await submitRunAsUser(deps, gestor, msg);
    const b = await submitRunAsUser(deps, donoB, msg);
    expect(a.run.id).not.toBe(b.run.id);
    expect([a.duplicate, b.duplicate]).toEqual([false, false]);
  });
});
