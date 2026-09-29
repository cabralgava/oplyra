// Invariantes do Cost Ledger (CR-027 §2–§4) fora do subconjunto executável de
// JSON Schema. Espelham as constraints e funções das migrations
// 20260929000013/14, que as impõem no banco (pgTAP); aqui validam as fixtures
// `-business-invariant` dos três schemas do Ledger.
import { attemptCallId } from "../../packages/core/src/index.ts";

type Json = Record<string, any>;
const MAX = Number.MAX_SAFE_INTEGER;

/** Problemas de um período; `outros` são os períodos canônicos já existentes (não sobreposição). */
export function budgetPeriodInvariants(p: Json, outros: readonly Json[] = []): string[] {
  const problemas: string[] = [];
  if ((p.scope === "tenant") !== (p.workflowKey === null)) problemas.push("scope_workflow_key_shape");
  if (!(Date.parse(p.periodEnd) > Date.parse(p.periodStart))) problemas.push("window_not_positive");
  if ((p.status === "closed") !== (p.closedAt !== null)) problemas.push("state_shape");
  if (p.reservedMicroUsd + p.settledMicroUsd + p.heldMicroUsd > MAX) problemas.push("counters_above_safe_integer");
  const sobrepostos = outros.filter((o) => o.periodId !== p.periodId && o.tenantId === p.tenantId && o.scope === p.scope &&
    o.workflowKey === p.workflowKey && Date.parse(o.periodStart) < Date.parse(p.periodEnd) && Date.parse(p.periodStart) < Date.parse(o.periodEnd));
  if (sobrepostos.length > 0) problemas.push("overlapping_period");
  return problemas;
}

export function costLedgerEntryInvariants(e: Json): string[] {
  const problemas: string[] = [];
  if (e.entryId !== `${e.callId}:${e.kind}:${e.periodScope}`) problemas.push("entry_id_not_deterministic");
  const r = e.reservedDelta, s = e.settledDelta, h = e.heldDelta, o = e.overrunMicroUsd;
  const sinais: Record<string, boolean> = {
    reserve: r >= 0 && s === 0 && h === 0 && o === 0,
    settle: r <= 0 && s >= 0 && h === 0,
    release: r <= 0 && s === 0 && h === 0 && o === 0,
    hold: r <= 0 && s === 0 && h >= 0 && r === -h && o === 0,
    reconcile: r === 0 && s >= 0 && h <= 0,
  };
  if (!sinais[e.kind]) problemas.push("forbidden_sign_pattern");
  if ((e.kind === "reconcile") !== (e.actorType === "operator")) problemas.push("actor_for_kind");
  return problemas;
}

export function modelAttemptInvariants(a: Json): string[] {
  const problemas: string[] = [];
  if (a.callId !== attemptCallId(a.tenantId, a.actionKey, a.invocationId, a.attempt)) problemas.push("call_id_scope");
  if (a.fingerprintKeyId !== String(a.requestFingerprint).split(":")[2]) problemas.push("fingerprint_key_id");
  const fechada = a.leaseExpiresAt === null && a.closedAt !== null;
  const semConciliacao = a.reconciledAt === null && a.reconciliationEvidenceRef === null;
  const forma: Record<string, boolean> = {
    reserved: a.leaseExpiresAt !== null && a.closedAt === null && a.actualMicroUsd === null && a.pendingReason === null && semConciliacao,
    settled: fechada && a.actualMicroUsd !== null && a.pendingReason === null && semConciliacao,
    released: fechada && a.actualMicroUsd === 0 && a.pendingReason === null && semConciliacao,
    pending_reconciliation: fechada && a.actualMicroUsd === null && a.pendingReason !== null && semConciliacao,
    reconciled: fechada && a.actualMicroUsd !== null && a.pendingReason !== null && a.reconciledAt !== null && a.reconciliationEvidenceRef !== null,
  };
  if (!forma[a.status]) problemas.push("state_shape");
  return problemas;
}
