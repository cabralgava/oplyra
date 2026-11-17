// Product Agent Runtime (I-02, slice local) — execução auditável de um agente, com lease, fencing,
// checkpoints, limites e kill switch. Domínio puro: sem SDK, banco ou framework.
//
// Fontes: 05 §9 (Agent Run), 09 §8/§11, 11 §6/§9/§12, 20 §18/§28/§30/§46/§52/§57, 15 TST-12/13/14.
// Estado: PROPOSTA local. O ADR-0006 mantém o runtime próprio como "proposta não aprovada"; esta
// implementação existe sob o mandato local de 11/11/2026 e não aprova a decisão arquitetural.
//
// Invariantes protegidas aqui (o banco as repetirá como defesa em profundidade):
//  - nenhuma chamada paga ou ferramenta roda sem passar por `avaliarChamada` (limites e kill switch);
//  - só o dono do lease atual (attempt + fencing token) grava: tentativa obsoleta é rejeitada;
//  - passo já concluído não se repete na retomada (checkpoint por run + passo);
//  - passo com EFEITO que começou e não concluiu tem resultado incerto: escala para pessoa, nunca repete;
//  - o agente nunca excede a autonomia concedida.
import type { RunId, TenantId } from "../domain/ids.ts";
import { RunLimitsInvalid } from "./errors.ts";

// ───────────────────────── Estados ─────────────────────────

/** 05 §9. `waiting_human` pertence ao Workflow Run (09 §11); aqui o escalonamento é a marca `needsHuman`. */
export type RunStatus = "queued" | "running" | "waiting_approval" | "completed" | "failed" | "cancelled";
export type RunTrigger = "user" | "event" | "schedule" | "agent";

/** Autonomia canônica (11 §12). Ordem crescente de capacidade. */
export const AUTONOMIA = ["recommend", "draft", "approval_required", "policy_execute"] as const;
export type Autonomy = (typeof AUTONOMIA)[number];
export const autonomiaPermitida = (pedida: Autonomy, concedida: Autonomy): boolean =>
  AUTONOMIA.indexOf(pedida) <= AUTONOMIA.indexOf(concedida);

/** 20 §18. */
export const CATEGORIAS_DE_ERRO = [
  "validation", "authorization", "governance", "context", "integration", "rate_limit",
  "external_provider", "timeout", "conflict", "idempotency", "system", "unknown",
] as const;
export type ErrorCategory = (typeof CATEGORIAS_DE_ERRO)[number];

export type RunError = {
  readonly code: string;
  readonly category: ErrorCategory;
  readonly retryable: boolean;
  readonly message: string;
  /** Evidência estruturada (ex.: causa raiz preservada no esgotamento). Nunca segredos nem PII. */
  readonly details?: Readonly<Record<string, unknown>>;
};

// ───────────────────────── Limites e uso ─────────────────────────

/** 09 §8 / 11 §6. Valores numéricos por workflow são configuração (DP-15); aqui só a forma. */
export type RunLimits = {
  /** Teto de custo da execução, em micro-USD inteiros (mesma unidade do Cost Ledger). */
  readonly maxCostMicroUsd: number;
  readonly maxToolCalls: number;
  /** Chamadas de modelo (turnos). */
  readonly maxTurns: number;
  /** Tentativas totais, incluindo a primeira. */
  readonly maxAttempts: number;
  /** Tempo total desde a primeira tomada do lease. */
  readonly timeoutMs: number;
};

export type RunUsage = { readonly costMicroUsd: number; readonly toolCalls: number; readonly turns: number };
export const usoVazio = (): RunUsage => ({ costMicroUsd: 0, toolCalls: 0, turns: 0 });

const inteiroSeguro = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n);

export function exigirLimitesValidos(l: RunLimits): void {
  const campos: (keyof RunLimits)[] = ["maxCostMicroUsd", "maxToolCalls", "maxTurns", "maxAttempts", "timeoutMs"];
  for (const c of campos) {
    if (!inteiroSeguro(l[c]) || l[c] < 1) throw new RunLimitsInvalid(`${c} deve ser um inteiro de 1 em diante (falta de limite impede a execução)`);
  }
  if (l.maxAttempts > 10) throw new RunLimitsInvalid("maxAttempts acima de 10 não é aceito");
}

// ───────────────────────── Execução ─────────────────────────

export type NewRun = {
  readonly agentKey: string;
  readonly actionKey: string;
  readonly trigger: RunTrigger;
  readonly autonomy: Autonomy;
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly workflowId: string | null;
  readonly taskId: string | null;
  /** 20 §21: o mesmo efeito desejado reutiliza a chave; mensagem entregue duas vezes não cria duas execuções. */
  readonly idempotencyKey: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly limits: RunLimits;
  readonly availableAt: Date;
};

export type AgentRun = NewRun & {
  readonly id: RunId;
  readonly tenantId: TenantId;
  readonly status: RunStatus;
  /** 0 enquanto ninguém tomou o lease; incrementa a cada tomada (inclusive recuperação). */
  readonly attempt: number;
  readonly usage: RunUsage;
  /** Fixado na primeira tomada: início + timeoutMs. Retentativas compartilham o prazo. */
  readonly deadlineAt: Date | null;
  readonly leaseOwner: string | null;
  readonly leaseExpiresAt: Date | null;
  readonly fencingToken: string | null;
  /** Escalonamento humano (efeito incerto, limite estourado, dead-letter). */
  readonly needsHuman: boolean;
  readonly error: RunError | null;
  readonly createdAt: Date;
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
};

/** Lease entregue ao worker. Toda gravação posterior reapresenta (attempt, fencingToken). */
export type RunLease = { readonly runId: RunId; readonly tenantId: TenantId; readonly attempt: number; readonly fencingToken: string; readonly workerId: string };

export type StepRecord = {
  readonly stepKey: string;
  readonly attempt: number;
  /** Passo com efeito (escrita interna relevante ou chamada paga/externa): incerto se interrompido. */
  readonly effectful: boolean;
  readonly startedAt: Date;
  /** Nulo = começou e não concluiu. */
  readonly checkpoint: { readonly result: unknown; readonly at: Date } | null;
  /** Falha CONHECIDA e classificada: o resultado do efeito é sabido, logo não é incerto. Só a queda deixa incerteza. */
  readonly abortedAt: Date | null;
};

export const TERMINAIS: readonly RunStatus[] = ["completed", "failed", "cancelled"];
export const ehTerminal = (s: RunStatus): boolean => TERMINAIS.includes(s);

// ───────────────────────── Limites e kill switch ─────────────────────────

export type KillSwitchState = { readonly active: boolean; readonly scope: "tenant" | "global"; readonly reason: string };

export const mensagemDoKillSwitch = (k: KillSwitchState): string =>
  `interrupção ${k.scope === "global" ? "global" : "da empresa"} ativa: ${k.reason}`;

/**
 * `internal`: trabalho do próprio runtime (ex.: montar contexto). Não é chamada de modelo nem de ferramenta, então não
 * consome a franquia de turnos nem de ferramentas; continua sujeito ao kill switch, ao prazo e ao teto de custo.
 */
export type CallKind = "model" | "tool" | "internal";
export type BlockReason = "KILL_SWITCH" | "DEADLINE_EXCEEDED" | "COST_EXHAUSTED" | "TOOL_CALLS_EXHAUSTED" | "TURNS_EXHAUSTED";
export type CallDecision = { readonly ok: true } | { readonly ok: false; readonly reason: BlockReason; readonly message: string };

/**
 * Decide se a PRÓXIMA chamada pode acontecer (TST-14). Roda antes de cada chamada de modelo ou
 * ferramenta, com a estimativa de pior caso; esgotar o limite bloqueia a próxima, não a corrente.
 * O kill switch vem primeiro e carrega o motivo informado por quem o acionou.
 */
export function avaliarChamada(
  run: Pick<AgentRun, "limits" | "usage" | "deadlineAt">, kind: CallKind, estimativaMicroUsd: number,
  agora: Date, killSwitch: KillSwitchState | null,
): CallDecision {
  if (killSwitch?.active) {
    return { ok: false, reason: "KILL_SWITCH", message: mensagemDoKillSwitch(killSwitch) };
  }
  if (!inteiroSeguro(estimativaMicroUsd) || estimativaMicroUsd < 0) {
    return { ok: false, reason: "COST_EXHAUSTED", message: "estimativa de custo inválida: sem estimativa não há chamada" };
  }
  if (run.deadlineAt !== null && agora.getTime() >= run.deadlineAt.getTime()) {
    return { ok: false, reason: "DEADLINE_EXCEEDED", message: "o tempo máximo da execução acabou" };
  }
  if (run.usage.costMicroUsd + estimativaMicroUsd > run.limits.maxCostMicroUsd) {
    return { ok: false, reason: "COST_EXHAUSTED", message: "o orçamento da execução não comporta a próxima chamada" };
  }
  if (kind === "tool" && run.usage.toolCalls + 1 > run.limits.maxToolCalls) {
    return { ok: false, reason: "TOOL_CALLS_EXHAUSTED", message: "o limite de chamadas de ferramenta foi atingido" };
  }
  if (kind === "model" && run.usage.turns + 1 > run.limits.maxTurns) {
    return { ok: false, reason: "TURNS_EXHAUSTED", message: "o limite de turnos foi atingido" };
  }
  return { ok: true };
}

// ───────────────────────── Falha e retentativa ─────────────────────────

// Coerente com a política aprovada "Outbox Retry and Failure Policy v1" (contracts/RETRY-FAILURE-POLICY.md):
// espera de 1, 2, 4 e 8 s, sem jitter; só os quatro códigos transitórios são retentáveis; código desconhecido
// é terminal; o esgotamento vira RETRY_ATTEMPTS_EXHAUSTED preservando a causa raiz. A política é do OUTBOX;
// adotá-la no runtime é escolha local de coerência, não extensão do contrato.
export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_MAX_MS = 8_000;
export const esperaDaTentativa = (tentativa: number): number =>
  Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, tentativa - 1), BACKOFF_MAX_MS);

export const CODIGOS_TRANSITORIOS: ReadonlySet<string> = new Set([
  "INTEGRATION_UNAVAILABLE", "PROVIDER_RATE_LIMITED", "PROVIDER_TIMEOUT", "UPSTREAM_SERVICE_UNAVAILABLE",
]);

export type FailureDecision =
  | { readonly status: "queued"; readonly availableAt: Date }
  | { readonly status: "failed"; readonly deadLetter: true; readonly needsHuman: true; readonly error: RunError };

/**
 * 11 §9 / 20 §30: retentativa limitada e classificada. Retentar exige erro declarado retryable E de código
 * transitório registrado; senão (ou esgotadas as tentativas/prazo) vira dead-letter com escalonamento humano.
 * Esgotar tentativas NÃO apaga a causa: o erro terminal é RETRY_ATTEMPTS_EXHAUSTED com a causa raiz em `details`.
 */
export function decidirFalha(run: Pick<AgentRun, "attempt" | "limits" | "deadlineAt">, erro: RunError, agora: Date): FailureDecision {
  const transitorio = erro.retryable && CODIGOS_TRANSITORIOS.has(erro.code);
  const semPrazo = run.deadlineAt !== null && agora.getTime() >= run.deadlineAt.getTime();
  if (transitorio && run.attempt < run.limits.maxAttempts && !semPrazo) {
    return { status: "queued", availableAt: new Date(agora.getTime() + esperaDaTentativa(run.attempt)) };
  }
  const esgotou = transitorio; // transitório que não pôde mais ser retentado: tentativas ou prazo acabaram
  return {
    status: "failed", deadLetter: true, needsHuman: true,
    error: esgotou
      ? { code: "RETRY_ATTEMPTS_EXHAUSTED", category: "system", retryable: false, message: "tentativas esgotadas", details: { rootCause: { code: erro.code, category: erro.category, message: erro.message } } }
      : erro,
  };
}

// ───────────────────────── Autorização determinística ─────────────────────────

export type RunAdmission =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "AGENT_UNKNOWN" | "ACTION_NOT_ALLOWED" | "AUTONOMY_EXCEEDED"; readonly message: string };

/** Por agente ATIVO: as ações que ele pode chamar e o teto de autonomia de cada uma. */
export type AgentCatalog = ReadonlyMap<string, { readonly actions: ReadonlyMap<string, Autonomy> }>;

/**
 * Admissão (20 §46, passos 6–8): agente e ação conhecidos e a ação chamável pelo agente; a autonomia
 * pedida não excede o teto concedido para a ação. O catálogo vem dos registries congelados por uma
 * porta; o payload não é prova de autoridade.
 */
export function admitirExecucao(catalogo: AgentCatalog, run: Pick<NewRun, "agentKey" | "actionKey" | "autonomy">): RunAdmission {
  const agente = catalogo.get(run.agentKey);
  if (!agente) return { ok: false, reason: "AGENT_UNKNOWN", message: `agente desconhecido: ${run.agentKey}` };
  const teto = agente.actions.get(run.actionKey);
  if (teto === undefined) return { ok: false, reason: "ACTION_NOT_ALLOWED", message: `a ação ${run.actionKey} não pertence ao agente ${run.agentKey}` };
  if (!autonomiaPermitida(run.autonomy, teto)) {
    return { ok: false, reason: "AUTONOMY_EXCEEDED", message: `autonomia ${run.autonomy} acima da concedida (${teto})` };
  }
  return { ok: true };
}

// ───────────────────────── Retomada ─────────────────────────

/**
 * Passos com efeito que começaram e não concluíram NEM foram abortados por falha conhecida: o processo caiu no
 * meio, o resultado é incerto e NÃO pode ser repetido (TST-12).
 */
export const passosIncertos = (passos: readonly StepRecord[]): string[] =>
  passos.filter((p) => p.effectful && p.checkpoint === null && p.abortedAt === null).map((p) => p.stepKey);

export const ERRO_EFEITO_INCERTO: RunError = {
  code: "EFFECT_UNCERTAIN", category: "system", retryable: false,
  message: "a execução foi interrompida no meio de um passo com efeito; o resultado é incerto e exige decisão humana",
};
