// Ponto único de acesso ao banco no experimento.
// Nenhuma consulta pode abrir transação por fora destes wrappers: é essa regra
// que o teste de arquitetura do I-01 passará a verificar.
import pg from "pg";

export type AccessContext = { userId: string; tenantId: string };

export type Wrappers = {
  pool: pg.Pool;
  withUserTransaction<T>(ctx: AccessContext, fn: (tx: pg.PoolClient) => Promise<T>): Promise<T>;
  withWorkerTransaction<T>(tenantId: string | null, jobRef: string, fn: (tx: pg.PoolClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

export function createWrappers(connectionString: string, max = 10): Wrappers {
  const pool = new pg.Pool({ connectionString, max });

  async function withUserTransaction<T>(ctx: AccessContext, fn: (tx: pg.PoolClient) => Promise<T>): Promise<T> {
    const tx = await pool.connect();
    try {
      await tx.query("begin");
      // O papel de execução é assumido SÓ dentro da transação.
      await tx.query("set local role authenticated");
      // Claims com escopo de transação: o terceiro argumento true é o que faz
      // o valor morrer no commit/rollback e não vazar para a próxima transação.
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [ctx.userId]);
      // O tenant ATIVO também tem escopo de transação. Sem ele a política não
      // consegue distinguir "usuário tem vínculo" de "usuário está operando nesta empresa".
      await tx.query("select set_config('app.tenant_id', $1, true)", [ctx.tenantId]);
      const out = await fn(tx);
      await tx.query("commit");
      return out;
    } catch (err) {
      await tx.query("rollback").catch(() => {});
      throw err;
    } finally {
      tx.release();
    }
  }

  async function withWorkerTransaction<T>(tenantId: string | null, jobRef: string, fn: (tx: pg.PoolClient) => Promise<T>): Promise<T> {
    const tx = await pool.connect();
    try {
      await tx.query("begin");
      await tx.query("set local role oplyra_worker_exec");
      await tx.query("select set_config('app.tenant_id', $1, true)", [tenantId]);
      await tx.query("select set_config('app.job_ref', $1, true)", [jobRef]);
      const out = await fn(tx);
      await tx.query("commit");
      return out;
    } catch (err) {
      await tx.query("rollback").catch(() => {});
      throw err;
    } finally {
      tx.release();
    }
  }

  return { pool, withUserTransaction, withWorkerTransaction, close: () => pool.end() };
}

export const TENANT_A = "11111111-1111-4111-8111-111111111111";
export const TENANT_B = "22222222-2222-4222-8222-222222222222";
export const A_OWNER = "a0000001-0000-4000-8000-000000000001";
export const A_READONLY = "a0000002-0000-4000-8000-000000000002";
export const A_REMOVED = "a0000003-0000-4000-8000-000000000003";
export const AB_USER = "ab000004-0000-4000-8000-000000000004";
export const B_OWNER = "b0000005-0000-4000-8000-000000000005";
export const CAMP_A = "c0000001-0000-4000-8000-000000000001";
export const CAMP_B = "c0000002-0000-4000-8000-000000000002";
