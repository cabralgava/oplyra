// Cost Ledger persistente (CR-027) no Supabase local. Implementa as portas do
// harness sobre as funções `app.*` do schema `finops`; nunca lê tabela
// diretamente e nunca informa instante decisório: período, lease e expiração
// vêm do relógio do banco. O lease é derivado do prazo do perfil aqui, pela
// função pura do núcleo, e não por quem chama.
import { ATTEMPT_CALL_ID_PATTERN, leaseSecondsFor } from "@oplyra/core";
import type {
  AttemptAcquisition, AttemptAcquisitionRequest, AttemptCloseCommand, AttemptCloseResult, AttemptRecoveryPort,
  BudgetGuardPort, BudgetScope, TenantId, Tx, UnitOfWork, UserId,
} from "@oplyra/core";
import { comoCliente } from "../db.ts";

type PgFailure = Error & { code?: string };
const codigo = (e: unknown): string | undefined => (e as PgFailure | null)?.code;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** O Ledger persistente só conhece tenants do banco (uuid canônico em minúsculas). */
export const isLedgerTenantId = (tenantId: string): boolean => UUID.test(tenantId);

const COST_STATUS = { charged: "settled", not_charged: "not_charged", unknown: "pending_reconciliation" } as const;

export class CostLedgerContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CostLedgerContractError";
  }
}

async function chamar<T>(tx: Tx, sql: string, params: readonly unknown[]): Promise<T> {
  const { rows } = await comoCliente(tx).query<{ r: T }>(sql, params as unknown[]);
  return rows[0]!.r;
}

export type PersistentCostLedgerOptions = {
  /** Identidade do processo dono dos leases (auditoria, não autorização). */
  readonly leaseOwner: string;
};

/**
 * Adapter do worker: aquisição, fechamento atômico com o Model Call Record,
 * saldo consultivo e sweep, cada operação em uma transação `oplyra_worker_exec`.
 */
export class PersistentCostLedger implements BudgetGuardPort, AttemptRecoveryPort {
  readonly #uow: Pick<UnitOfWork, "withWorkerTransaction">;
  readonly #leaseOwner: string;

  constructor(uow: Pick<UnitOfWork, "withWorkerTransaction">, opts: PersistentCostLedgerOptions) {
    if (opts.leaseOwner.length < 1 || opts.leaseOwner.length > 255) throw new RangeError("leaseOwner entre 1 e 255");
    this.#uow = uow;
    this.#leaseOwner = opts.leaseOwner;
  }

  async remaining(scope: BudgetScope): Promise<{ readonly remainingMicroUsd: number | null }> {
    if (!isLedgerTenantId(scope.tenantId)) return { remainingMicroUsd: null };
    const r = await this.#uow.withWorkerTransaction(scope.tenantId as TenantId, "finops:remaining", (tx) =>
      chamar<{ remainingMicroUsd: number | null }>(tx, "select app.budget_remaining($1::uuid, $2) r", [scope.tenantId, scope.workflowKey]));
    const v = r?.remainingMicroUsd;
    if (v !== null && !Number.isSafeInteger(v)) throw new CostLedgerContractError("budget_remaining fora do contrato");
    return { remainingMicroUsd: v ?? null };
  }

  async acquireAttempt(p: AttemptAcquisitionRequest): Promise<AttemptAcquisition> {
    let leaseSeconds: number;
    try {
      leaseSeconds = leaseSecondsFor(p.profileTimeoutMs);
    } catch {
      return { status: "invalid" };
    }
    if (!isLedgerTenantId(p.tenantId) || !ATTEMPT_CALL_ID_PATTERN.test(p.callId)) return { status: "invalid" };
    try {
      const r = await this.#uow.withWorkerTransaction(p.tenantId as TenantId, `finops:acquire:${p.attempt.number}`, (tx) =>
        chamar<Record<string, unknown>>(tx,
          `select app.acquire_model_attempt($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9::text[], $10::bigint, $11, $12, $13::timestamptz) r`,
          [p.tenantId, p.workflowKey, p.attempt.actionKey, p.attempt.invocationId, p.attempt.number, p.callId, p.agentKey,
            p.requestFingerprint, [...p.acceptedFingerprints], p.amountMicroUsd, this.#leaseOwner, leaseSeconds,
            p.clientObservedAt ?? null]));
      return traduzirAquisicao(r);
    } catch (e) {
      if (codigo(e) === "22023") return { status: "invalid" };
      throw e;
    }
  }

  async closeAttempt(c: AttemptCloseCommand): Promise<AttemptCloseResult> {
    if (!isLedgerTenantId(c.tenantId) || !UUID.test(c.fencingToken)) return { status: "rejected" };
    try {
      const r = await this.#uow.withWorkerTransaction(c.tenantId as TenantId, `finops:close:${c.attempt.number}`, (tx) =>
        chamar<{ status?: unknown }>(tx,
          `select app.close_model_attempt($1::uuid, $2, $3, $4, $5::uuid, $6, $7::bigint, $8, $9, $10::jsonb) r`,
          [c.tenantId, c.attempt.actionKey, c.attempt.invocationId, c.attempt.number, c.fencingToken, c.outcome,
            c.actualMicroUsd, COST_STATUS[c.outcome], c.pendingReason, JSON.stringify(c.record)]));
      if (r?.status === "closed" || r?.status === "duplicate") return { status: r.status };
      throw new CostLedgerContractError("close_model_attempt fora do contrato");
    } catch (e) {
      // Transição inválida, replay divergente ou estouro: nada foi gravado.
      if (codigo(e) === "55000" || codigo(e) === "22003") return { status: "rejected" };
      throw e;
    }
  }

  async expireNext(tenantId: string): Promise<string | null> {
    if (!isLedgerTenantId(tenantId)) return null;
    const r = await this.#uow.withWorkerTransaction(tenantId as TenantId, "finops:sweep", (tx) =>
      chamar<string | null>(tx, "select app.expire_next_model_attempt($1::uuid) r", [tenantId]));
    if (r !== null && !ATTEMPT_CALL_ID_PATTERN.test(r)) throw new CostLedgerContractError("sweep fora do contrato");
    return r;
  }
}

function traduzirAquisicao(r: Record<string, unknown> | null | undefined): AttemptAcquisition {
  switch (r?.status) {
    case "acquired":
      if (typeof r.fencingToken !== "string" || typeof r.leaseExpiresAt !== "string") break;
      return { status: "acquired", fencingToken: r.fencingToken, leaseExpiresAt: r.leaseExpiresAt };
    case "insufficient":
      if (!Number.isSafeInteger(r.remainingMicroUsd)) break;
      return { status: "insufficient", remainingMicroUsd: r.remainingMicroUsd as number };
    case "conflict": case "in_progress": case "closed": case "budget_not_configured":
      return { status: r.status };
  }
  throw new CostLedgerContractError("acquire_model_attempt fora do contrato");
}

export type BudgetPeriodInput = {
  readonly tenantId: string;
  readonly scope: "tenant" | "workflow_key";
  readonly workflowKey: string | null;
  /** Janela de negócio configurada pelo operador, não leitura de relógio. */
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly limitMicroUsd: number;
  readonly reason: string;
};

/**
 * Operações privilegiadas e auditadas (`oplyra_ops_exec`): períodos e
 * conciliação. Cada chamada fixa o tenant da transação e o operador.
 */
export class CostLedgerOperations {
  readonly #uow: Pick<UnitOfWork, "withOperatorTransaction">;
  readonly #operatorId: UserId;

  constructor(uow: Pick<UnitOfWork, "withOperatorTransaction">, operatorId: string) {
    if (!UUID.test(operatorId)) throw new RangeError("operatorId deve ser uuid");
    this.#uow = uow;
    this.#operatorId = operatorId as UserId;
  }

  #emTenant<T>(tenantId: string, reason: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.#uow.withOperatorTransaction(this.#operatorId, reason, async (tx) => {
      await comoCliente(tx).query("select set_config('app.tenant_id', $1, true)", [tenantId]);
      return fn(tx);
    });
  }

  openBudgetPeriod(p: BudgetPeriodInput): Promise<Record<string, unknown>> {
    return this.#emTenant(p.tenantId, p.reason, (tx) => chamar(tx,
      "select app.open_budget_period($1::uuid, $2, $3, $4::timestamptz, $5::timestamptz, $6::bigint, $7) r",
      [p.tenantId, p.scope, p.workflowKey, p.periodStart, p.periodEnd, p.limitMicroUsd, p.reason]));
  }

  closeBudgetPeriod(tenantId: string, periodId: string, reason: string): Promise<Record<string, unknown>> {
    return this.#emTenant(tenantId, reason, (tx) => chamar(tx,
      "select app.close_budget_period($1::uuid, $2, $3) r", [tenantId, periodId, reason]));
  }

  reconcileAttempt(p: {
    readonly tenantId: string; readonly actionKey: string; readonly invocationId: string; readonly attempt: number;
    readonly actualMicroUsd: number; readonly evidenceRef: string; readonly reason: string;
  }): Promise<Record<string, unknown>> {
    return this.#emTenant(p.tenantId, p.reason, (tx) => chamar(tx,
      "select app.reconcile_model_attempt($1::uuid, $2, $3, $4, $5::bigint, $6, $7) r",
      [p.tenantId, p.actionKey, p.invocationId, p.attempt, p.actualMicroUsd, p.evidenceRef, p.reason]));
  }
}
