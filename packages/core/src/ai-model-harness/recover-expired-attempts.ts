// Caso de uso: varrer tentativas abandonadas de um tenant, uma por operação
// atômica do Ledger, até o limite do lote. Nenhum instante é informado: a
// expiração é decidida pelo relógio do Ledger (CR-027 §6.1).
import type { AttemptRecoveryPort } from "./ports.ts";

export const MAX_RECOVERY_BATCH = 100;

export async function recoverExpiredAttempts(
  port: AttemptRecoveryPort, tenantId: string, batchSize: number,
): Promise<{ readonly expiredCallIds: readonly string[] }> {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > MAX_RECOVERY_BATCH) {
    throw new RangeError(`batchSize fora de 1..${MAX_RECOVERY_BATCH}`);
  }
  const expiredCallIds: string[] = [];
  for (let i = 0; i < batchSize; i++) {
    const callId = await port.expireNext(tenantId);
    if (callId === null) break;
    expiredCallIds.push(callId);
  }
  return { expiredCallIds };
}
