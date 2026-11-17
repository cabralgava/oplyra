// Portas do Product Agent Runtime. A infraestrutura as implementa; domínio e casos de uso nunca
// importam SDK, HTTP ou SQL. Toda operação recebe o tenant: "inexistente" e "de outro tenant" são
// indistinguíveis (I-TEN, 20 §47). Cada método é UMA operação atômica; o caso de uso nunca mantém
// transação aberta durante uma chamada de modelo ou ferramenta.
import type { RunId, TenantId, UserId } from "../domain/ids.ts";
import type { AuditLogPort, Clock, Tx, UnitOfWork } from "../application/ports.ts";
import type {
  AgentCatalog, AgentRun, KillSwitchState, NewRun, RunError, RunLease, RunUsage, StepRecord,
} from "./domain.ts";

export type RequestedBy = { readonly type: "user" | "system" | "schedule" | "agent"; readonly id: string | null };

export type ClaimedRun = { readonly run: AgentRun; readonly lease: RunLease; readonly steps: readonly StepRecord[] };

export type SettleOutcome =
  | { readonly kind: "completed" }
  | { readonly kind: "waiting_approval" }
  | { readonly kind: "retry"; readonly availableAt: Date; readonly error: RunError }
  | { readonly kind: "failed"; readonly error: RunError; readonly needsHuman: boolean };

export interface RunRepository {
  /** Idempotente por (tenant, idempotencyKey): a segunda entrega devolve a execução existente, sem criar outra. */
  enqueue(tx: Tx, e: { tenantId: TenantId; run: NewRun; requestedBy: RequestedBy; now: Date }): Promise<{ run: AgentRun; duplicate: boolean }>;
  findById(tx: Tx, tenantId: TenantId, id: RunId): Promise<AgentRun | null>;
  list(tx: Tx, tenantId: TenantId, limit: number): Promise<AgentRun[]>;
  /**
   * Toma a próxima execução elegível do tenant com SKIP LOCKED: `queued` disponível OU `running` com lease
   * vencido (recuperação). Incrementa a tentativa, rotaciona o fencing token e fixa o prazo na primeira vez.
   * Esgotadas as tentativas de uma execução abandonada, ela vai a `failed` (dead-letter) em vez de ser entregue.
   */
  claimNext(tx: Tx, e: { tenantId: TenantId; workerId: string; now: Date; leaseSeconds: number }): Promise<ClaimedRun | null>;
  /** Estende o lease. RunAttemptStale se a tentativa ou o token não forem os atuais. */
  heartbeat(tx: Tx, e: { lease: RunLease; now: Date; leaseSeconds: number }): Promise<void>;
  /** Registra a intenção do passo. Se já houver checkpoint, devolve-o (retomada não repete). RunAttemptStale se obsoleto. */
  beginStep(tx: Tx, e: { lease: RunLease; stepKey: string; effectful: boolean; now: Date }): Promise<StepRecord>;
  /**
   * Registra que o passo FALHOU de forma conhecida e classificada (o resultado do efeito é sabido). Tira-o do estado
   * "incerto"; não apaga a trilha. RunAttemptStale se obsoleto.
   */
  abortStep(tx: Tx, e: { lease: RunLease; stepKey: string; now: Date }): Promise<void>;
  /**
   * Grava o checkpoint e soma o uso, na MESMA operação atômica. Repetido para o mesmo passo, não duplica
   * checkpoint nem uso. RunAttemptStale se obsoleto.
   */
  completeStep(tx: Tx, e: { lease: RunLease; stepKey: string; result: unknown; usageDelta: RunUsage; now: Date }): Promise<{ run: AgentRun; replayed: boolean }>;
  steps(tx: Tx, tenantId: TenantId, runId: RunId): Promise<StepRecord[]>;
  /** Encerra/transiciona a tentativa atual. RunAttemptStale se obsoleto. */
  settle(tx: Tx, e: { lease: RunLease; outcome: SettleOutcome; now: Date }): Promise<AgentRun>;
  /** Cancela execução não terminal. Uma tentativa em andamento perde o lease e é barrada na próxima gravação. */
  cancel(tx: Tx, e: { tenantId: TenantId; id: RunId; now: Date; reason: string }): Promise<AgentRun>;
}

export interface KillSwitchRepository {
  /** O estado efetivo: o global prevalece sobre o do tenant. Nulo = nenhum ativo. */
  effective(tx: Tx, tenantId: TenantId): Promise<KillSwitchState | null>;
  activate(tx: Tx, e: { tenantId: TenantId; reason: string; by: UserId; now: Date }): Promise<void>;
  release(tx: Tx, e: { tenantId: TenantId; by: UserId; now: Date }): Promise<void>;
}

/** Catálogo de agentes e ações vindo dos registries congelados; o runtime não define agentes. */
export interface AgentCatalogPort {
  catalog(): AgentCatalog;
}

export type RuntimeDeps = {
  uow: UnitOfWork;
  runs: RunRepository;
  killSwitch: KillSwitchRepository;
  agents: AgentCatalogPort;
  audit: AuditLogPort;
  clock: Clock;
};
