// Fake em memória do Product Agent Runtime. Reproduz a semântica de lease, fencing, idempotência e
// checkpoint para os testes de unidade dos casos de uso; a concorrência real (SKIP LOCKED, locks) é
// verificada contra o Supabase local. O relógio é controlável: avançar `estado.agora` simula o tempo
// passar (queda de worker = lease vencendo sem settle).
import type { AccessContext, AuditEntry, PermissionKey, RoleKey, RunId, TenantId, Tx, UnitOfWork } from "@oplyra/core";
import { InvalidStateTransition } from "@oplyra/core";
import { contexto } from "./index.ts";
import type { AgentCatalogPort, KillSwitchRepository, RunRepository, RuntimeDeps } from "../../core/src/runtime/ports.ts";
import { RunAttemptStale, RunNotFound } from "../../core/src/runtime/errors.ts";
import { ehTerminal, usoVazio, type AgentCatalog, type AgentRun, type Autonomy, type KillSwitchState, type RunLease, type StepRecord } from "../../core/src/runtime/domain.ts";

const RUNTIME_POR_PAPEL: Record<RoleKey, readonly PermissionKey[]> = {
  owner: ["runtime.read", "runtime.operate"],
  admin: ["runtime.read", "runtime.operate"],
  marketing_manager: ["runtime.read", "runtime.operate"],
  viewer: ["runtime.read"],
};

/** `contexto()` do I-01 acrescido das permissões do runtime (espelho do seed de papéis da migration). */
export function contextoDeRuntime(over: Parameters<typeof contexto>[0]): AccessContext {
  const base = contexto(over);
  return { ...base, permissions: new Set<PermissionKey>([...base.permissions, ...RUNTIME_POR_PAPEL[base.roleKey]]) };
}

export const CATALOGO_SINTETICO: AgentCatalog = new Map([
  ["copywriting-agent", { actions: new Map<string, Autonomy>([["create_copy_variants", "draft"]]) }],
  ["paid-media-agent", { actions: new Map<string, Autonomy>([["analyze_campaign_performance", "recommend"]]) }],
]);

const TX: Tx = {};
let sequencia = 0;
const uuid = (): string => `d${(++sequencia).toString().padStart(7, "0")}-0000-4000-8000-${sequencia.toString().padStart(12, "0")}`;

export type EstadoRuntime = {
  runs: AgentRun[];
  passos: Map<string, StepRecord[]>;
  killTenant: Map<TenantId, KillSwitchState>;
  killGlobal: KillSwitchState | null;
  auditoria: AuditEntry[];
  agora: Date;
};

export function criarRuntimeDeps(inicial?: Partial<EstadoRuntime>): RuntimeDeps & { estado: EstadoRuntime; avancar(ms: number): void } {
  const estado: EstadoRuntime = {
    runs: [], passos: new Map(), killTenant: new Map(), killGlobal: null, auditoria: [],
    agora: new Date("2026-11-11T12:00:00Z"), ...inicial,
  };
  const chave = (t: string, r: string) => `${t}|${r}`;

  const uow: UnitOfWork = {
    withUserTransaction: (_c, fn) => fn(TX),
    withIdentityTransaction: (_u, fn) => fn(TX),
    withWorkerTransaction: (_t, _j, fn) => fn(TX),
    withDispatcherTransaction: (_t, _d, fn) => fn(TX),
    withOperatorTransaction: (_o, _m, fn) => fn(TX),
  };

  const buscar = (t: TenantId, id: string): AgentRun | undefined => estado.runs.find((r) => r.tenantId === t && r.id === id);
  const trocar = (r: AgentRun): AgentRun => { estado.runs[estado.runs.findIndex((x) => x.tenantId === r.tenantId && x.id === r.id)] = r; return r; };
  const stepsDe = (t: string, r: string): StepRecord[] => estado.passos.get(chave(t, r)) ?? [];

  /** Só o dono do lease ATUAL grava: tentativa e token precisam coincidir e a execução precisa estar rodando. */
  function exigirLease(l: RunLease): AgentRun {
    const r = buscar(l.tenantId, l.runId);
    if (!r || r.status !== "running" || r.attempt !== l.attempt || r.fencingToken !== l.fencingToken) throw new RunAttemptStale();
    return r;
  }
  const semLease = (r: AgentRun): AgentRun => ({ ...r, leaseOwner: null, leaseExpiresAt: null, fencingToken: null });

  const runs: RunRepository = {
    async enqueue(_tx, e) {
      const existente = estado.runs.find((r) => r.tenantId === e.tenantId && r.idempotencyKey === e.run.idempotencyKey);
      if (existente) return { run: existente, duplicate: true };
      const nova: AgentRun = {
        ...e.run, id: uuid() as RunId, tenantId: e.tenantId, status: "queued", attempt: 0, usage: usoVazio(), deadlineAt: null,
        leaseOwner: null, leaseExpiresAt: null, fencingToken: null, needsHuman: false, error: null, createdAt: e.now, startedAt: null, finishedAt: null,
      };
      estado.runs.push(nova);
      return { run: nova, duplicate: false };
    },
    async findById(_tx, t, id) { return buscar(t, id) ?? null; },
    async list(_tx, t, limite) { return estado.runs.filter((r) => r.tenantId === t).slice(-limite).reverse(); },
    async claimNext(_tx, e) {
      const candidatas = estado.runs
        .filter((r) => r.tenantId === e.tenantId && (
          (r.status === "queued" && r.availableAt <= e.now) || (r.status === "running" && r.leaseExpiresAt !== null && r.leaseExpiresAt <= e.now)))
        .sort((a, b) => a.availableAt.getTime() - b.availableAt.getTime() || a.createdAt.getTime() - b.createdAt.getTime());
      for (const r of candidatas) {
        // Abandonada com as tentativas esgotadas: dead-letter, nunca entregue de novo.
        if (r.status === "running" && r.attempt >= r.limits.maxAttempts) {
          trocar({
            ...semLease(r), status: "failed", needsHuman: true, finishedAt: e.now,
            error: { code: "RETRY_ATTEMPTS_EXHAUSTED", category: "system", retryable: false, message: "lease expirado com as tentativas esgotadas" },
          });
          continue;
        }
        const tomada: AgentRun = {
          ...r, status: "running", attempt: r.attempt + 1, leaseOwner: e.workerId, fencingToken: uuid(),
          leaseExpiresAt: new Date(e.now.getTime() + e.leaseSeconds * 1000),
          deadlineAt: r.deadlineAt ?? new Date(e.now.getTime() + r.limits.timeoutMs), startedAt: r.startedAt ?? e.now,
        };
        trocar(tomada);
        return {
          run: tomada, steps: stepsDe(e.tenantId, r.id),
          lease: { runId: r.id, tenantId: e.tenantId, attempt: tomada.attempt, fencingToken: tomada.fencingToken!, workerId: e.workerId },
        };
      }
      return null;
    },
    async heartbeat(_tx, e) {
      const r = exigirLease(e.lease);
      trocar({ ...r, leaseExpiresAt: new Date(e.now.getTime() + e.leaseSeconds * 1000) });
    },
    async beginStep(_tx, e) {
      exigirLease(e.lease);
      const lista = stepsDe(e.lease.tenantId, e.lease.runId);
      const existente = lista.find((s) => s.stepKey === e.stepKey);
      if (existente?.checkpoint) return existente;
      const passo: StepRecord = { stepKey: e.stepKey, attempt: e.lease.attempt, effectful: e.effectful, startedAt: e.now, checkpoint: null, abortedAt: null };
      estado.passos.set(chave(e.lease.tenantId, e.lease.runId), [...lista.filter((s) => s.stepKey !== e.stepKey), passo]);
      return passo;
    },
    async abortStep(_tx, e) {
      exigirLease(e.lease);
      const lista = stepsDe(e.lease.tenantId, e.lease.runId);
      const passo = lista.find((s) => s.stepKey === e.stepKey);
      if (!passo || passo.checkpoint) throw new InvalidStateTransition("passo inexistente ou já concluído");
      estado.passos.set(chave(e.lease.tenantId, e.lease.runId), lista.map((s) => (s.stepKey === e.stepKey ? { ...s, abortedAt: e.now } : s)));
    },
    async completeStep(_tx, e) {
      const r = exigirLease(e.lease);
      const lista = stepsDe(e.lease.tenantId, e.lease.runId);
      const passo = lista.find((s) => s.stepKey === e.stepKey);
      if (!passo) throw new InvalidStateTransition("passo não iniciado");
      if (passo.checkpoint) return { run: r, replayed: true };
      if (passo.abortedAt) throw new InvalidStateTransition("passo abortado; inicie-o de novo");
      estado.passos.set(chave(e.lease.tenantId, e.lease.runId), lista.map((s) => (s.stepKey === e.stepKey ? { ...s, checkpoint: { result: e.result, at: e.now } } : s)));
      const nova = trocar({
        ...r, usage: {
          costMicroUsd: r.usage.costMicroUsd + e.usageDelta.costMicroUsd,
          toolCalls: r.usage.toolCalls + e.usageDelta.toolCalls, turns: r.usage.turns + e.usageDelta.turns,
        },
      });
      return { run: nova, replayed: false };
    },
    async steps(_tx, t, id) { return stepsDe(t, id); },
    async settle(_tx, e) {
      const r = semLease(exigirLease(e.lease));
      const o = e.outcome;
      if (o.kind === "completed") return trocar({ ...r, status: "completed", finishedAt: e.now });
      if (o.kind === "waiting_approval") return trocar({ ...r, status: "waiting_approval" });
      if (o.kind === "retry") return trocar({ ...r, status: "queued", availableAt: o.availableAt, error: o.error });
      return trocar({ ...r, status: "failed", error: o.error, needsHuman: o.needsHuman, finishedAt: e.now });
    },
    async cancel(_tx, e) {
      const r = buscar(e.tenantId, e.id);
      if (!r) throw new RunNotFound();
      if (ehTerminal(r.status)) throw new InvalidStateTransition("a execução já terminou");
      return trocar({
        ...semLease(r), status: "cancelled", finishedAt: e.now,
        error: { code: "CANCELLED", category: "governance", retryable: false, message: e.reason },
      });
    },
  };

  const killSwitch: KillSwitchRepository = {
    async effective(_tx, t) {
      if (estado.killGlobal?.active) return estado.killGlobal;
      const k = estado.killTenant.get(t);
      return k?.active ? k : null;
    },
    async activate(_tx, e) { estado.killTenant.set(e.tenantId, { active: true, scope: "tenant", reason: e.reason }); },
    async release(_tx, e) { estado.killTenant.delete(e.tenantId); },
  };
  const agents: AgentCatalogPort = { catalog: () => CATALOGO_SINTETICO };

  return {
    uow, runs, killSwitch, agents, estado,
    audit: { async record(_tx, entrada) { estado.auditoria.push(entrada); } },
    clock: { now: () => estado.agora },
    avancar(ms) { estado.agora = new Date(estado.agora.getTime() + ms); },
  };
}
