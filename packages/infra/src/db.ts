// Ponto ÚNICO de acesso ao banco. O lint de fronteiras e o teste de arquitetura
// garantem que nada fora deste arquivo alcança o pool.
import pg from "pg";
import type { AccessContext, TenantId, UserId, UnitOfWork, Tx } from "@oplyra/core";

export type PoolConfig = { connectionString: string; max?: number };

export function criarUnitOfWork(cfg: PoolConfig): UnitOfWork & { pool: pg.Pool; encerrar(): Promise<void> } {
  const pool = new pg.Pool({ connectionString: cfg.connectionString, max: cfg.max ?? 10 });

  async function emTransacao<T>(preparar: (tx: pg.PoolClient) => Promise<void>, fn: (tx: Tx) => Promise<T>): Promise<T> {
    const cliente = await pool.connect();
    try {
      await cliente.query("begin");
      await preparar(cliente);
      const saida = await fn(cliente as unknown as Tx);
      await cliente.query("commit");
      return saida;
    } catch (erro) {
      await cliente.query("rollback").catch(() => {});
      throw erro;
    } finally {
      // O papel e as configurações têm escopo de transação: a conexão volta
      // ao pool sem claims e sem privilégio (comprovado em EXP-01 / E1-06).
      cliente.release();
    }
  }

  return {
    pool,
    encerrar: () => pool.end(),

    withUserTransaction: (ctx: AccessContext, fn) => emTransacao(async (tx) => {
      await tx.query("set local role authenticated");
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [ctx.userId]);
      await tx.query("select set_config('app.tenant_id', $1, true)", [ctx.tenantId]);
    }, fn),

    withWorkerTransaction: (tenantId: TenantId, jobRef: string, fn) => emTransacao(async (tx) => {
      await tx.query("set local role oplyra_worker_exec");
      await tx.query("select set_config('app.tenant_id', $1, true)", [tenantId]);
      await tx.query("select set_config('app.job_ref', $1, true)", [jobRef]);
    }, fn),

    withDispatcherTransaction: (tenantId: TenantId, dispatcherId: string, fn) => emTransacao(async (tx) => {
      await tx.query("set local role oplyra_dispatcher_exec");
      await tx.query("select set_config('app.tenant_id', $1, true)", [tenantId]);
      await tx.query("select set_config('app.dispatcher_id', $1, true)", [dispatcherId]);
    }, fn),

    withIdentityTransaction: (userId: UserId, fn) => emTransacao(async (tx) => {
      await tx.query("set local role authenticated");
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    }, fn),

    withOperatorTransaction: (operadorId: UserId, motivo: string, fn) => emTransacao(async (tx) => {
      await tx.query("set local role oplyra_ops_exec");
      await tx.query("select set_config('app.operator_id', $1, true)", [operadorId]);
      await tx.query("select set_config('app.reason', $1, true)", [motivo]);
    }, fn),
  };
}

export const comoCliente = (tx: Tx): pg.PoolClient => tx as unknown as pg.PoolClient;
