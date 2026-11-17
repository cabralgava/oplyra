// Adapter Postgres do Product Agent Runtime (I-02, local). Toda operação chama UMA função de fronteira
// `app.runtime_*` (SECURITY DEFINER) dentro da transação já aberta pelo UnitOfWork: o papel da transação
// (`authenticated` ou `oplyra_worker_exec`) e o tenant ativo decidem o que é permitido, no banco. Nenhuma
// tabela é tocada diretamente. Traduz as recusas do banco para erros de domínio.
//
// Sem entrada pública no package.json (arquivo governado): consumidores usam o caminho relativo até a evolução
// governada de `@oplyra/infra/runtime`.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { comoCliente } from "./db.ts";
import { InvalidStateTransition, PermissionDenied } from "@oplyra/core";
import type { RunId, TenantId } from "@oplyra/core";
import type { KillSwitchRepository, RunRepository, ClaimedRun } from "../../core/src/runtime/ports.ts";
import type { AgentCatalog, AgentRun, Autonomy, StepRecord } from "../../core/src/runtime/domain.ts";
import { RunAttemptStale, RunNotFound, RunRejected } from "../../core/src/runtime/errors.ts";

const codigoPg = (e: unknown): string | undefined => (e as { code?: string } | null)?.code;
const mensagem = (e: unknown): string => (e as { message?: string } | null)?.message ?? "";

/** Recusas do banco → erros de domínio. O que não é reconhecido segue como está. */
function traduzir(e: unknown): never {
  const msg = mensagem(e);
  switch (codigoPg(e)) {
    case "42501": throw new PermissionDenied();
    case "P0002": throw new RunNotFound();
    case "55000":
      if (msg.startsWith("RUN_ATTEMPT_STALE")) throw new RunAttemptStale();
      throw new InvalidStateTransition(msg.replace(/^INVALID_STATE_TRANSITION: /, ""));
    case "22023": throw new RunRejected("DB_PARAMETER", msg);
    case "23514": throw new RunRejected("DB_CHECK", msg);
  }
  throw e;
}

async function chamar<T>(tx: Parameters<typeof comoCliente>[0], sql: string, params: unknown[]): Promise<T> {
  try {
    const { rows } = await comoCliente(tx).query(sql, params);
    return (rows[0] as { r: T }).r;
  } catch (e) {
    return traduzir(e);
  }
}

const data = (v: unknown): Date | null => (typeof v === "string" ? new Date(v) : null);
const dataObrigatoria = (v: unknown): Date => new Date(String(v));

type Json = Record<string, unknown>;
export function execucaoDeJson(j: Json): AgentRun {
  return {
    id: j.id as RunId, tenantId: j.tenantId as TenantId, agentKey: String(j.agentKey), actionKey: String(j.actionKey),
    trigger: j.trigger as AgentRun["trigger"], autonomy: j.autonomy as AgentRun["autonomy"], status: j.status as AgentRun["status"],
    correlationId: String(j.correlationId), causationId: (j.causationId as string | null) ?? null,
    workflowId: (j.workflowId as string | null) ?? null, taskId: (j.taskId as string | null) ?? null,
    idempotencyKey: String(j.idempotencyKey), input: (j.input as Json) ?? {}, limits: j.limits as AgentRun["limits"],
    attempt: Number(j.attempt), usage: j.usage as AgentRun["usage"], deadlineAt: data(j.deadlineAt),
    availableAt: dataObrigatoria(j.availableAt), leaseOwner: (j.leaseOwner as string | null) ?? null,
    leaseExpiresAt: data(j.leaseExpiresAt), fencingToken: (j.fencingToken as string | null) ?? null,
    needsHuman: Boolean(j.needsHuman), error: (j.error as AgentRun["error"]) ?? null,
    createdAt: dataObrigatoria(j.createdAt), startedAt: data(j.startedAt), finishedAt: data(j.finishedAt),
  };
}

export function passoDeJson(j: Json): StepRecord {
  const cp = j.checkpoint as { result: unknown; at: string } | null;
  return {
    stepKey: String(j.stepKey), attempt: Number(j.attempt), effectful: Boolean(j.effectful), startedAt: dataObrigatoria(j.startedAt),
    checkpoint: cp === null ? null : { result: cp.result, at: dataObrigatoria(cp.at) }, abortedAt: data(j.abortedAt),
  };
}

export const runRepository: RunRepository = {
  async enqueue(tx, e) {
    const r = await chamar<{ run: Json; duplicate: boolean }>(tx,
      `select app.runtime_enqueue($1::uuid, $2::jsonb, $3, $4, $5::timestamptz) as r`,
      [e.tenantId, JSON.stringify({ ...e.run, availableAt: e.run.availableAt.toISOString() }), e.requestedBy.type, e.requestedBy.id, e.now]);
    return { run: execucaoDeJson(r.run), duplicate: r.duplicate };
  },
  async findById(tx, tenantId, id) {
    const r = await chamar<Json | null>(tx, `select app.runtime_get($1::uuid, $2::uuid) as r`, [tenantId, id]);
    return r ? execucaoDeJson(r) : null;
  },
  async list(tx, tenantId, limit) {
    const r = await chamar<Json[]>(tx, `select app.runtime_list($1::uuid, $2::integer) as r`, [tenantId, limit]);
    return r.map(execucaoDeJson);
  },
  async claimNext(tx, e): Promise<ClaimedRun | null> {
    const r = await chamar<{ run: Json; lease: { runId: string; tenantId: string; attempt: number; fencingToken: string; workerId: string }; steps: Json[] } | null>(tx,
      `select app.runtime_claim($1::uuid, $2, $3::timestamptz, $4::integer) as r`, [e.tenantId, e.workerId, e.now, e.leaseSeconds]);
    if (!r) return null;
    return {
      run: execucaoDeJson(r.run), steps: r.steps.map(passoDeJson),
      lease: { runId: r.lease.runId as RunId, tenantId: r.lease.tenantId as TenantId, attempt: r.lease.attempt, fencingToken: r.lease.fencingToken, workerId: r.lease.workerId },
    };
  },
  async heartbeat(tx, e) {
    await chamar(tx, `select app.runtime_heartbeat($1::uuid, $2::uuid, $3::integer, $4, $5::timestamptz, $6::integer) as r`,
      [e.lease.tenantId, e.lease.runId, e.lease.attempt, e.lease.fencingToken, e.now, e.leaseSeconds]);
  },
  async beginStep(tx, e) {
    return passoDeJson(await chamar<Json>(tx, `select app.runtime_begin_step($1::uuid, $2::uuid, $3::integer, $4, $5, $6::boolean, $7::timestamptz) as r`,
      [e.lease.tenantId, e.lease.runId, e.lease.attempt, e.lease.fencingToken, e.stepKey, e.effectful, e.now]));
  },
  async abortStep(tx, e) {
    await chamar(tx, `select app.runtime_abort_step($1::uuid, $2::uuid, $3::integer, $4, $5, $6::timestamptz) as r`,
      [e.lease.tenantId, e.lease.runId, e.lease.attempt, e.lease.fencingToken, e.stepKey, e.now]);
  },
  async completeStep(tx, e) {
    const r = await chamar<{ run: Json; replayed: boolean }>(tx,
      `select app.runtime_complete_step($1::uuid, $2::uuid, $3::integer, $4, $5, $6::jsonb, $7::bigint, $8::integer, $9::integer, $10::timestamptz) as r`,
      [e.lease.tenantId, e.lease.runId, e.lease.attempt, e.lease.fencingToken, e.stepKey, JSON.stringify(e.result ?? null),
        e.usageDelta.costMicroUsd, e.usageDelta.toolCalls, e.usageDelta.turns, e.now]);
    return { run: execucaoDeJson(r.run), replayed: r.replayed };
  },
  async steps(tx, tenantId, runId) {
    const r = await chamar<Json[]>(tx, `select app.runtime_steps($1::uuid, $2::uuid) as r`, [tenantId, runId]);
    return r.map(passoDeJson);
  },
  async settle(tx, e) {
    const o = e.outcome;
    const [outcome, erro, disponivel, humano] =
      o.kind === "retry" ? ["retry", o.error, o.availableAt, false]
        : o.kind === "failed" ? ["failed", o.error, null, o.needsHuman] : [o.kind, null, null, false];
    return execucaoDeJson(await chamar<Json>(tx,
      `select app.runtime_settle($1::uuid, $2::uuid, $3::integer, $4, $5, $6::jsonb, $7::timestamptz, $8::boolean, $9::timestamptz) as r`,
      [e.lease.tenantId, e.lease.runId, e.lease.attempt, e.lease.fencingToken, outcome, erro ? JSON.stringify(erro) : null, disponivel, humano, e.now]));
  },
  async cancel(tx, e) {
    return execucaoDeJson(await chamar<Json>(tx, `select app.runtime_cancel($1::uuid, $2::uuid, $3, $4::timestamptz) as r`,
      [e.tenantId, e.id, e.reason, e.now]));
  },
};

export const killSwitchRepository: KillSwitchRepository = {
  async effective(tx, tenantId) {
    return chamar<{ active: boolean; scope: "tenant" | "global"; reason: string } | null>(tx, `select app.runtime_kill_effective($1::uuid) as r`, [tenantId]);
  },
  async activate(tx, e) { await chamar(tx, `select app.runtime_kill_activate($1::uuid, $2, $3::timestamptz) as r`, [e.tenantId, e.reason, e.now]); },
  async release(tx, e) { await chamar(tx, `select app.runtime_kill_release($1::uuid, $2::timestamptz) as r`, [e.tenantId, e.now]); },
};

// ───────────────────────── catálogo a partir dos registries congelados ─────────────────────────

const REGISTRIES_PADRAO = join(dirname(fileURLToPath(import.meta.url)), "../../../docs/product/marketing-ops/contracts/registries");

/** Domínio do agente (L4) lido dos registries congelados, somente leitura. Agente desconhecido ou inativo: nulo. */
export function dominioDoAgenteCongelado(dir: string = REGISTRIES_PADRAO): (agentKey: string) => string | null {
  const agentes = (JSON.parse(readFileSync(join(dir, "agents.json"), "utf8")) as { entries: { key: string; status: string; domain: string }[] }).entries;
  const dominios = new Map(agentes.filter((a) => a.status === "active").map((a) => [a.key, a.domain] as const));
  return (agentKey) => dominios.get(agentKey) ?? null;
}

type AgenteReg = { key: string; status: string };
type AcaoReg = { action: string; ownerAgent: string; callableByAgents?: string[]; risk?: string; sideEffect?: boolean };

/**
 * Catálogo de admissão derivado dos registries congelados (somente leitura): agente ATIVO × ações que ele pode
 * chamar (dono ou `callableByAgents`). O teto de autonomia é DERIVADO de forma conservadora e local: `draft`
 * por padrão (09 §5: comunicação/publicação preparam) e `recommend` para ação de risco alto com efeito
 * colateral. Não existe, ainda, motor de política nem concessão por empresa: `approval_required` e
 * `policy_execute` NÃO são concedíveis por este catálogo.
 */
export function catalogoDeAgentesCongelado(dir: string = REGISTRIES_PADRAO): AgentCatalog {
  const ler = <T>(nome: string): { entries: T[] } => JSON.parse(readFileSync(join(dir, nome), "utf8"));
  const agentes = ler<AgenteReg>("agents.json").entries.filter((a) => a.status === "active");
  const acoes = ler<AcaoReg>("actions.json").entries;
  const catalogo = new Map<string, { actions: Map<string, Autonomy> }>();
  for (const ag of agentes) {
    const permitidas = new Map<string, Autonomy>();
    for (const ac of acoes) {
      if (ac.ownerAgent === ag.key || (ac.callableByAgents ?? []).includes(ag.key)) {
        permitidas.set(ac.action, ac.risk === "high" && ac.sideEffect === true ? "recommend" : "draft");
      }
    }
    catalogo.set(ag.key, { actions: permitidas });
  }
  return catalogo;
}
