// Casos de uso do Product Agent Runtime (I-02, slice local). Autorização determinística no backend;
// nenhuma decisão de limite, autonomia ou permissão é delegada ao modelo.
import type { AccessContext } from "../domain/access-context.ts";
import { exigirPermissao } from "../domain/access-context.ts";
import type { RunId, TenantId } from "../domain/ids.ts";
import {
  type AgentRun, type CallKind, type NewRun, type RunError, type RunLease, type RunUsage, type StepRecord,
  admitirExecucao, avaliarChamada, decidirFalha, ERRO_EFEITO_INCERTO, exigirLimitesValidos, mensagemDoKillSwitch,
  passosIncertos,
} from "./domain.ts";
import { RunAttemptStale, RunBlocked, RunNotFound, RunRejected } from "./errors.ts";
import type { RequestedBy, RuntimeDeps } from "./ports.ts";

// ───────────────────────── auditoria ─────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `core.audit_log.correlation_id` é UUID, mas o correlationId do OATP (20 §6) é texto livre. A tabela de auditoria
 * é histórica e não é alterada aqui: a coluna recebe o valor só quando ele é UUID; em qualquer caso o valor também
 * vai em `after.correlationId`, que é onde a trilha realmente o encontra. Lacuna registrada no ESTADO.
 */
const correlacao = (correlationId: string): { column: { correlationId?: string }; after: { correlationId: string } } =>
  ({ column: UUID.test(correlationId) ? { correlationId } : {}, after: { correlationId } });

// ───────────────────────── submissão ─────────────────────────

async function enfileirar(
  deps: RuntimeDeps, tenantId: TenantId, run: NewRun, requestedBy: RequestedBy, tx: Parameters<RuntimeDeps["runs"]["findById"]>[0],
): Promise<{ run: AgentRun; duplicate: boolean }> {
  exigirLimitesValidos(run.limits);
  const adm = admitirExecucao(deps.agents.catalog(), run);
  if (!adm.ok) throw new RunRejected(adm.reason, adm.message);
  if (run.idempotencyKey.trim() === "" || run.correlationId.trim() === "") {
    throw new RunRejected("TRANSACTION_SCHEMA_INVALID", "idempotência e correlação são obrigatórias (20 §21)");
  }
  const r = await deps.runs.enqueue(tx, { tenantId, run, requestedBy, now: deps.clock.now() });
  if (!r.duplicate) {
    const c = correlacao(run.correlationId);
    await deps.audit.record(tx, {
      tenantId, actorType: requestedBy.type === "user" ? "user" : "system", action: "run.submit", target: r.run.id,
      ...c.column, after: { ...c.after, agentKey: run.agentKey, actionKey: run.actionKey, trigger: run.trigger, autonomy: run.autonomy },
    });
  }
  return r;
}

/** Submissão por pessoa: exige `runtime.operate`. */
export async function submitRunAsUser(deps: RuntimeDeps, ctx: AccessContext, run: NewRun): Promise<{ run: AgentRun; duplicate: boolean }> {
  exigirPermissao(ctx, "runtime.operate");
  return deps.uow.withUserTransaction(ctx, (tx) => enfileirar(deps, ctx.tenantId, run, { type: "user", id: ctx.userId }, tx));
}

/** Submissão por sistema, agendamento ou evento (já autenticados pela borda); o tenant vem do chamador confiável. */
export async function submitRunAsSystem(
  deps: RuntimeDeps, tenantId: TenantId, run: NewRun, requestedBy: Exclude<RequestedBy, { type: "user" }> = { type: "system", id: null },
): Promise<{ run: AgentRun; duplicate: boolean }> {
  return deps.uow.withWorkerTransaction(tenantId, `submit:${run.idempotencyKey}`, (tx) => enfileirar(deps, tenantId, run, requestedBy, tx));
}

export async function getRun(deps: RuntimeDeps, ctx: AccessContext, id: RunId): Promise<{ run: AgentRun; steps: StepRecord[] }> {
  exigirPermissao(ctx, "runtime.read");
  return deps.uow.withUserTransaction(ctx, async (tx) => {
    const run = await deps.runs.findById(tx, ctx.tenantId, id);
    if (!run) throw new RunNotFound();
    return { run, steps: await deps.runs.steps(tx, ctx.tenantId, id) };
  });
}

export async function listRuns(deps: RuntimeDeps, ctx: AccessContext, limit = 50): Promise<AgentRun[]> {
  exigirPermissao(ctx, "runtime.read");
  return deps.uow.withUserTransaction(ctx, (tx) => deps.runs.list(tx, ctx.tenantId, Math.min(Math.max(1, limit), 200)));
}

export async function cancelRun(deps: RuntimeDeps, ctx: AccessContext, id: RunId, reason: string): Promise<AgentRun> {
  exigirPermissao(ctx, "runtime.operate");
  if (reason.trim() === "") throw new RunRejected("REASON_REQUIRED", "informe o motivo do cancelamento");
  return deps.uow.withUserTransaction(ctx, async (tx) => {
    const cancelada = await deps.runs.cancel(tx, { tenantId: ctx.tenantId, id, now: deps.clock.now(), reason });
    await deps.audit.record(tx, { tenantId: ctx.tenantId, actorType: "user", actorId: ctx.userId, action: "run.cancel", target: id, reason });
    return cancelada;
  });
}

// ───────────────────────── kill switch ─────────────────────────

export async function activateKillSwitch(deps: RuntimeDeps, ctx: AccessContext, reason: string): Promise<void> {
  exigirPermissao(ctx, "runtime.operate");
  if (reason.trim() === "") throw new RunRejected("REASON_REQUIRED", "o motivo da interrupção é obrigatório (14 F-10)");
  await deps.uow.withUserTransaction(ctx, async (tx) => {
    await deps.killSwitch.activate(tx, { tenantId: ctx.tenantId, reason, by: ctx.userId, now: deps.clock.now() });
    await deps.audit.record(tx, { tenantId: ctx.tenantId, actorType: "user", actorId: ctx.userId, action: "runtime.kill_switch.activate", reason });
  });
}

/** Estado da interrupção vigente para a empresa (própria ou global), para o banner persistente (14 F-10). */
export async function getKillSwitchStatus(deps: RuntimeDeps, ctx: AccessContext): Promise<{ active: boolean; scope: "tenant" | "global"; reason: string } | null> {
  exigirPermissao(ctx, "runtime.read");
  return deps.uow.withUserTransaction(ctx, (tx) => deps.killSwitch.effective(tx, ctx.tenantId));
}

export async function releaseKillSwitch(deps: RuntimeDeps, ctx: AccessContext): Promise<void> {
  exigirPermissao(ctx, "runtime.operate");
  await deps.uow.withUserTransaction(ctx, async (tx) => {
    await deps.killSwitch.release(tx, { tenantId: ctx.tenantId, by: ctx.userId, now: deps.clock.now() });
    await deps.audit.record(tx, { tenantId: ctx.tenantId, actorType: "user", actorId: ctx.userId, action: "runtime.kill_switch.release" });
  });
}

// ───────────────────────── execução ─────────────────────────

export type StepOptions = {
  readonly kind: CallKind;
  /** Tem efeito (escrita interna relevante, chamada paga/externa)? Se interrompido, o resultado é incerto. */
  readonly effectful: boolean;
  /** Pior caso, em micro-USD, avaliado ANTES da chamada contra o teto. */
  readonly estimateMicroUsd: number;
};

export type StepResult<T> = { readonly result: T; readonly replayed: boolean };

/** O que o worker entrega a cada passo: tudo que toca estado passa pela porta e carrega o lease. */
export interface RunStepApi {
  readonly lease: RunLease;
  readonly run: () => AgentRun;
  step<T>(stepKey: string, opts: StepOptions, fn: () => Promise<{ result: T; costMicroUsd: number }>): Promise<StepResult<T>>;
}

export type RunHandlerOutcome = { readonly kind: "completed" } | { readonly kind: "waiting_approval" };
export type RunHandler = (api: RunStepApi, run: AgentRun) => Promise<RunHandlerOutcome>;

/** Erro de um passo que já traz a classificação (20 §18/§30); qualquer outro é tratado como falha desconhecida e NÃO retryable. */
export class RunStepFailure extends Error {
  readonly runError: RunError;
  constructor(runError: RunError) { super(runError.message); this.runError = runError; }
}

export type ExecuteResult =
  | { readonly status: "idle" }
  | { readonly status: "blocked"; readonly reason: string; readonly message: string }
  | { readonly status: "completed" | "waiting_approval" | "failed" | "requeued" | "escalated" | "lease_lost"; readonly runId: RunId; readonly attempt: number; readonly code?: string };

const erroDeBloqueio = (reason: string, message: string): RunError =>
  ({ code: `RUN_BLOCKED_${reason}`, category: "governance", retryable: false, message });

/**
 * Uma iteração do worker: toma a próxima execução do tenant e a conduz. Cada gravação reapresenta
 * (attempt, fencingToken); se o lease foi perdido, o worker para sem gravar mais nada.
 */
export async function executeNextRun(
  deps: RuntimeDeps,
  e: { tenantId: TenantId; workerId: string; leaseSeconds: number; handler: RunHandler },
): Promise<ExecuteResult> {
  const w = <T>(job: string, fn: Parameters<typeof deps.uow.withWorkerTransaction<T>>[2]) => deps.uow.withWorkerTransaction(e.tenantId, `${e.workerId}:${job}`, fn);

  // Kill switch: nada novo começa, e o motivo fica visível.
  const kill = await w("kill", (tx) => deps.killSwitch.effective(tx, e.tenantId));
  if (kill?.active) return { status: "blocked", reason: "KILL_SWITCH", message: mensagemDoKillSwitch(kill) };

  const claimed = await w("claim", (tx) => deps.runs.claimNext(tx, { tenantId: e.tenantId, workerId: e.workerId, now: deps.clock.now(), leaseSeconds: e.leaseSeconds }));
  if (!claimed) return { status: "idle" };
  const { run, lease } = claimed;
  const base = { runId: run.id, attempt: lease.attempt } as const;

  const encerrar = async (outcome: Parameters<typeof deps.runs.settle>[1]["outcome"], acao: string): Promise<AgentRun | null> => {
    try {
      return await w("settle", async (tx) => {
        const r = await deps.runs.settle(tx, { lease, outcome, now: deps.clock.now() });
        const c = correlacao(run.correlationId);
        await deps.audit.record(tx, {
          tenantId: e.tenantId, actorType: "worker", action: acao, target: run.id, ...c.column,
          after: { ...c.after, attempt: lease.attempt, status: r.status, needsHuman: r.needsHuman, ...(r.error ? { errorCode: r.error.code } : {}) },
        });
        return r;
      });
    } catch (erro) {
      if (erro instanceof RunAttemptStale) return null;
      throw erro;
    }
  };

  // Autorização determinística no momento de rodar (o catálogo pode ter mudado desde a submissão).
  const adm = admitirExecucao(deps.agents.catalog(), run);
  if (!adm.ok) {
    const r = await encerrar({ kind: "failed", needsHuman: false, error: { code: `RUN_${adm.reason}`, category: "authorization", retryable: false, message: adm.message } }, "run.rejected");
    return r ? { status: "failed", ...base, code: `RUN_${adm.reason}` } : { status: "lease_lost", ...base };
  }

  // TST-12: retomada. Passo com efeito que começou e não concluiu tem resultado incerto: não repete.
  const incertos = passosIncertos(claimed.steps);
  if (incertos.length) {
    const r = await encerrar({ kind: "failed", needsHuman: true, error: { ...ERRO_EFEITO_INCERTO, message: `${ERRO_EFEITO_INCERTO.message} (${incertos.join(", ")})` } }, "run.escalated");
    return r ? { status: "escalated", ...base, code: ERRO_EFEITO_INCERTO.code } : { status: "lease_lost", ...base };
  }

  let atual = run;
  const api: RunStepApi = {
    lease,
    run: () => atual,
    async step<T>(stepKey: string, opts: StepOptions, fn: () => Promise<{ result: T; costMicroUsd: number }>): Promise<StepResult<T>> {
      const agora = deps.clock.now();
      // 1) Passo já concluído numa tentativa anterior: devolve o checkpoint, sem chamada nem custo.
      const antes = await w("begin", async (tx) => {
        await deps.runs.heartbeat(tx, { lease, now: agora, leaseSeconds: e.leaseSeconds });
        const existente = (await deps.runs.steps(tx, e.tenantId, run.id)).find((s) => s.stepKey === stepKey);
        if (existente?.checkpoint) return { replay: existente.checkpoint.result as T };
        // 2) Limites e kill switch ANTES da chamada.
        const kill2 = await deps.killSwitch.effective(tx, e.tenantId);
        const dec = avaliarChamada(atual, opts.kind, opts.estimateMicroUsd, agora, kill2);
        if (!dec.ok) throw new RunBlocked(dec.reason, dec.message);
        await deps.runs.beginStep(tx, { lease, stepKey, effectful: opts.effectful, now: agora });
        return null;
      });
      if (antes) return { result: antes.replay, replayed: true };

      // 3) A chamada acontece fora de qualquer transação.
      let saida: { result: T; costMicroUsd: number };
      try {
        saida = await fn();
      } catch (erro) {
        // Falha CLASSIFICADA = resultado conhecido: o passo deixa de ser "incerto" e a retentativa é legítima.
        // Erro não classificado (ou queda do processo) mantém o passo em aberto: a retomada escala para pessoa.
        if (erro instanceof RunStepFailure) {
          await w("abort", (tx) => deps.runs.abortStep(tx, { lease, stepKey, now: deps.clock.now() }));
        }
        throw erro;
      }
      if (!Number.isSafeInteger(saida.costMicroUsd) || saida.costMicroUsd < 0) {
        throw new RunStepFailure({ code: "COST_INVALID", category: "system", retryable: false, message: "custo reportado inválido" });
      }
      const delta: RunUsage = { costMicroUsd: saida.costMicroUsd, toolCalls: opts.kind === "tool" ? 1 : 0, turns: opts.kind === "model" ? 1 : 0 };
      // 4) Checkpoint + uso, atômicos e com fencing.
      const fim = await w("complete", (tx) => deps.runs.completeStep(tx, { lease, stepKey, result: saida.result, usageDelta: delta, now: deps.clock.now() }));
      atual = fim.run;
      return { result: saida.result, replayed: fim.replayed };
    },
  };

  try {
    const out = await e.handler(api, run);
    const r = await encerrar({ kind: out.kind }, out.kind === "completed" ? "run.completed" : "run.waiting_approval");
    return r ? { status: out.kind, ...base } : { status: "lease_lost", ...base };
  } catch (erro) {
    if (erro instanceof RunAttemptStale) return { status: "lease_lost", ...base };
    if (erro instanceof RunBlocked) {
      const r = await encerrar({ kind: "failed", needsHuman: true, error: erroDeBloqueio(erro.reason, erro.message) }, "run.blocked");
      return r ? { status: "failed", ...base, code: `RUN_BLOCKED_${erro.reason}` } : { status: "lease_lost", ...base };
    }
    const runError: RunError = erro instanceof RunStepFailure ? erro.runError
      : { code: "STEP_FAILED", category: "unknown", retryable: false, message: "falha não classificada no passo" };
    const decisao = decidirFalha({ ...atual, attempt: lease.attempt }, runError, deps.clock.now());
    const r = decisao.status === "queued"
      ? await encerrar({ kind: "retry", availableAt: decisao.availableAt, error: runError }, "run.retry")
      : await encerrar({ kind: "failed", needsHuman: true, error: decisao.error }, "run.dead_letter");
    if (!r) return { status: "lease_lost", ...base };
    return { status: decisao.status === "queued" ? "requeued" : "failed", ...base, code: decisao.status === "queued" ? runError.code : decisao.error.code };
  }
}
