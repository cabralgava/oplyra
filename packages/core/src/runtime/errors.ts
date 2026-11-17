// Erros do Product Agent Runtime (I-02, slice local). Arquivo próprio: `errors.ts` e o Error Registry
// canônico são governados. Os códigos abaixo são LOCAIS; o registro canônico deles é uma evolução
// contratual pendente (não foram acrescentados ao Error Registry).
import { DomainError } from "../domain/errors.ts";

export class RunAttemptStale extends DomainError {
  constructor(mensagem = "tentativa ou fencing token obsoleto: o lease foi perdido") { super("RUN_ATTEMPT_STALE", mensagem); }
}
export class RunNotFound extends DomainError {
  constructor(mensagem = "execução não encontrada") { super("RUN_NOT_FOUND", mensagem); }
}
export class RunRejected extends DomainError {
  readonly reason: string;
  constructor(reason: string, mensagem: string) { super("RUN_REJECTED", mensagem); this.reason = reason; }
}
export class RunBlocked extends DomainError {
  /** Motivo estável para a trilha de auditoria e para a tela (KILL_SWITCH, COST_EXHAUSTED…). */
  readonly reason: string;
  constructor(reason: string, mensagem: string) { super("RUN_BLOCKED", mensagem); this.reason = reason; }
}
export class RunLimitsInvalid extends DomainError {
  constructor(mensagem: string) { super("RUN_LIMITS_INVALID", mensagem); }
}
