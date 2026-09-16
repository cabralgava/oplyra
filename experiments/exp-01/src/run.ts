// EXP-01 — execução dos cenários obrigatórios de 18-technical-experiments.md
// Ambiente: Supabase local da Oplyra (127.0.0.1:54422). Dados sintéticos.
import pg from "pg";
import {
  createWrappers, TENANT_A, TENANT_B, A_OWNER, A_READONLY, A_REMOVED, AB_USER, B_OWNER, CAMP_A, CAMP_B,
} from "./db.ts";

const WEB = "postgresql://oplyra_web_login:exp01_local_web@127.0.0.1:54422/postgres";
const WORKER = "postgresql://oplyra_worker_login:exp01_local_worker@127.0.0.1:54422/postgres";

type Result = { id: string; desc: string; pass: boolean; detail: string };
const results: Result[] = [];
function check(id: string, desc: string, pass: boolean, detail = "") {
  results.push({ id, desc, pass, detail });
  process.stdout.write(`${pass ? "  ok  " : " FALHA"} ${id}  ${desc}${detail ? " — " + detail : ""}\n`);
}
async function expectError(fn: () => Promise<unknown>): Promise<string | null> {
  try { await fn(); return null; } catch (e: any) { return e.code ?? e.message; }
}

const web = createWrappers(WEB, 10);
const worker = createWrappers(WORKER, 5);

// ----------------------------------------------------------------- E1-01
async function e1_01() {
  const raw = await web.pool.connect();
  try {
    const err = await expectError(() => raw.query("select count(*) from exp01.campaigns"));
    check("E1-01", "consulta pelo login sem assumir papel de execução", err === "42501", `código ${err}`);
  } finally { raw.release(); }
}

// ----------------------------------------------------------------- E1-02
async function e1_02() {
  const ctxA = { userId: A_OWNER, tenantId: TENANT_A };
  await web.withUserTransaction(ctxA, async (tx) => {
    const own = await tx.query("select name from exp01.campaigns where id=$1", [CAMP_A]);
    check("E1-02a", "A lê a própria campanha", own.rowCount === 1, own.rows[0]?.name ?? "");
    const other = await tx.query("select name from exp01.campaigns where id=$1", [CAMP_B]);
    check("E1-02b", "A não enxerga campanha de B", other.rowCount === 0, `${other.rowCount} linhas`);
    const canary = await tx.query("select count(*)::int c from exp01.campaigns where name like 'CANARIO-BETA%'");
    check("E1-02c", "canário de B ausente no resultado de A", canary.rows[0].c === 0);
    const ins = await tx.query("insert into exp01.campaigns (tenant_id,name) values ($1,$2) returning id", [TENANT_A, "nova-de-A"]);
    check("E1-02d", "A insere no próprio tenant", ins.rowCount === 1);
  });
  const insB = await expectError(() => web.withUserTransaction({ userId: A_OWNER, tenantId: TENANT_A }, (tx) =>
    tx.query("insert into exp01.campaigns (tenant_id,name) values ($1,$2)", [TENANT_B, "invasora"])));
  check("E1-02e", "A não insere no tenant de B", insB === "42501", `código ${insB}`);

  await web.withUserTransaction({ userId: A_OWNER, tenantId: TENANT_A }, async (tx) => {
    const upB = await tx.query("update exp01.campaigns set name='hack' where id=$1", [CAMP_B]);
    check("E1-02f", "update em linha de B não afeta nada", upB.rowCount === 0, `${upB.rowCount} linhas`);
    const delB = await tx.query("delete from exp01.campaigns where id=$1", [CAMP_B]);
    check("E1-02g", "delete em linha de B não afeta nada", delB.rowCount === 0, `${delB.rowCount} linhas`);
  });
  const move = await expectError(() => web.withUserTransaction({ userId: A_OWNER, tenantId: TENANT_A }, (tx) =>
    tx.query("update exp01.campaigns set tenant_id=$1 where id=$2", [TENANT_B, CAMP_A])));
  check("E1-02h", "trocar o tenant_id de um registro é negado", move === "42501", `código ${move}`);
  const fk = await expectError(() => web.withUserTransaction({ userId: A_OWNER, tenantId: TENANT_A }, (tx) =>
    tx.query("insert into exp01.tasks (tenant_id,campaign_id,title) values ($1,$2,$3)", [TENANT_A, CAMP_B, "cruzada"])));
  check("E1-02i", "tarefa de A apontando para campanha de B é negada", fk === "23503", `código ${fk}`);
}

// ----------------------------------------------------------------- E1-03
async function e1_03() {
  await web.withUserTransaction({ userId: A_REMOVED, tenantId: TENANT_A }, async (tx) => {
    const r = await tx.query("select count(*)::int c from exp01.campaigns");
    check("E1-03", "vínculo revogado não enxerga nada", r.rows[0].c === 0, `${r.rows[0].c} linhas`);
  });
  const ins = await expectError(() => web.withUserTransaction({ userId: A_REMOVED, tenantId: TENANT_A }, (tx) =>
    tx.query("insert into exp01.campaigns (tenant_id,name) values ($1,$2)", [TENANT_A, "x"])));
  check("E1-03b", "vínculo revogado não escreve", ins === "42501", `código ${ins}`);
}

// ----------------------------------------------------------------- E1-04
async function e1_04() {
  await web.withUserTransaction({ userId: A_OWNER, tenantId: TENANT_B }, async (tx) => {
    const r = await tx.query("select count(*)::int c from exp01.campaigns where tenant_id=$1", [TENANT_B]);
    check("E1-04", "empresa forjada no contexto não devolve linhas", r.rows[0].c === 0, `${r.rows[0].c} linhas`);
  });
  await web.withUserTransaction({ userId: AB_USER, tenantId: TENANT_B }, async (tx) => {
    const r = await tx.query("select count(*)::int c from exp01.campaigns where tenant_id=$1", [TENANT_B]);
    check("E1-04b", "usuário de duas empresas enxerga B quando tem vínculo", r.rows[0].c > 0, `${r.rows[0].c} linhas`);
  });
}

// ----------------------------------------------------------------- E1-06
async function e1_06() {
  const single = createWrappers(WEB, 1);
  try {
    await single.withUserTransaction({ userId: A_OWNER, tenantId: TENANT_A }, (tx) => tx.query("select 1"));
    await expectError(() => single.withUserTransaction({ userId: B_OWNER, tenantId: TENANT_B }, async () => { throw new Error("falha proposital"); }));
    const raw = await single.pool.connect();
    try {
      const r = await raw.query("select current_user::text u, coalesce(current_setting('request.jwt.claim.sub', true),'') s, coalesce(current_setting('app.tenant_id', true),'') t");
      const { u, s, t } = r.rows[0];
      check("E1-06a", "conexão reutilizada não carrega claims nem papel", u === "oplyra_web_login" && s === "" && t === "", `papel=${u} sub="${s}" tenant="${t}"`);
      const err = await expectError(() => raw.query("select count(*) from exp01.campaigns"));
      check("E1-06b", "conexão reutilizada volta sem privilégio", err === "42501", `código ${err}`);
    } finally { raw.release(); }
    await single.withUserTransaction({ userId: B_OWNER, tenantId: TENANT_B }, async (tx) => {
      const r = await tx.query("select count(*)::int c from exp01.campaigns where name like 'CANARIO-ALFA%'");
      check("E1-06c", "após reutilização, B não enxerga canário de A", r.rows[0].c === 0);
    });
  } finally { await single.close(); }
}

// ----------------------------------------------------------------- E1-07
async function e1_07(
  rounds = Number(process.env.EXP01_ROUNDS ?? 3),
  perRound = Number(process.env.EXP01_PER_ROUND ?? 10000),
  concurrency = 50,
) {
  const actors = [
    { userId: A_OWNER, tenantId: TENANT_A, visible: TENANT_A, canary: "CANARIO-BETA" },
    { userId: A_READONLY, tenantId: TENANT_A, visible: TENANT_A, canary: "CANARIO-BETA" },
    { userId: AB_USER, tenantId: TENANT_A, visible: TENANT_A, canary: "CANARIO-BETA" },
    { userId: AB_USER, tenantId: TENANT_B, visible: TENANT_B, canary: "CANARIO-ALFA" },
    { userId: B_OWNER, tenantId: TENANT_B, visible: TENANT_B, canary: "CANARIO-ALFA" },
  ];
  for (let round = 1; round <= rounds; round++) {
    let violations = 0;
    const started = Date.now();
    for (let done = 0; done < perRound; done += concurrency) {
      const batch = Array.from({ length: Math.min(concurrency, perRound - done) }, (_, i) => {
        const a = actors[(done + i) % actors.length];
        return web.withUserTransaction({ userId: a.userId, tenantId: a.tenantId }, async (tx) => {
          const r = await tx.query(
            "select tenant_id, name from exp01.campaigns where tenant_id=$1 order by created_at limit 5", [a.visible]);
          for (const row of r.rows) {
            if (row.tenant_id !== a.visible) violations++;
            if (String(row.name).startsWith(a.canary)) violations++;
          }
          const leak = await tx.query("select count(*)::int c from exp01.campaigns where name like $1", [a.canary + "%"]);
          if (leak.rows[0].c !== 0) violations++;
        });
      });
      await Promise.all(batch);
    }
    check(`E1-07/${round}`, `${perRound} transações concorrentes misturando empresas`, violations === 0,
      `${violations} violações em ${((Date.now() - started) / 1000).toFixed(1)}s`);
  }
}

// ----------------------------------------------------------------- E1-08/09
async function e1_08_09() {
  await worker.withWorkerTransaction(null, "job-sem-tenant", async (tx) => {
    const r = await tx.query("select count(*)::int c from exp01.campaigns");
    check("E1-08", "worker sem app.tenant_id não enxerga linha", r.rows[0].c === 0, `${r.rows[0].c} linhas`);
  });
  const w = await expectError(() => worker.withWorkerTransaction(null, "job-sem-tenant", (tx) =>
    tx.query("insert into exp01.campaigns (tenant_id,name) values ($1,$2)", [TENANT_A, "x"])));
  check("E1-08b", "worker sem empresa não escreve", w === "42501", `código ${w}`);
  await worker.withWorkerTransaction(TENANT_A, "job-a", async (tx) => {
    const r = await tx.query("select count(*)::int c from exp01.campaigns where name like 'CANARIO-BETA%'");
    check("E1-09a", "worker de A não enxerga canário de B", r.rows[0].c === 0);
  });
  const cross = await expectError(() => worker.withWorkerTransaction(TENANT_A, "job-a", (tx) =>
    tx.query("insert into exp01.campaigns (tenant_id,name) values ($1,$2)", [TENANT_B, "invasora"])));
  check("E1-09b", "worker de A não grava linha de B", cross === "42501", `código ${cross}`);
}

// ----------------------------------------------------------------- E1-12
async function e1_12(samples = 300) {
  const withRls: number[] = [];
  for (let i = 0; i < samples; i++) {
    const t0 = performance.now();
    await web.withUserTransaction({ userId: A_OWNER, tenantId: TENANT_A }, (tx) =>
      tx.query("select id,name from exp01.campaigns where tenant_id=$1 order by created_at limit 20", [TENANT_A]));
    withRls.push(performance.now() - t0);
  }
  const admin = new pg.Pool({ connectionString: "postgresql://postgres:postgres@127.0.0.1:54422/postgres", max: 10 });
  const baseline: number[] = [];
  for (let i = 0; i < samples; i++) {
    const t0 = performance.now();
    const c = await admin.connect();
    try {
      await c.query("begin");
      await c.query("select id,name from exp01.campaigns where tenant_id=$1 order by created_at limit 20", [TENANT_A]);
      await c.query("commit");
    } finally { c.release(); }
    baseline.push(performance.now() - t0);
  }
  await admin.end();
  const p95 = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length * 0.95)];
  const overhead = p95(withRls) - p95(baseline);
  check("E1-12", "p95 do overhead de autorização ≤ 20 ms", overhead <= 20,
    `com RLS ${p95(withRls).toFixed(2)}ms, base ${p95(baseline).toFixed(2)}ms, overhead ${overhead.toFixed(2)}ms`);
}

// ----------------------------------------------------------------------
const t0 = Date.now();
try {
  await e1_01(); await e1_02(); await e1_03(); await e1_04(); await e1_06();
  await e1_08_09(); await e1_12(); await e1_07();
} finally {
  await web.close(); await worker.close();
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} cenários conforme o esperado em ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (failed.length) { console.log("REPROVADOS:", failed.map((f) => f.id).join(", ")); process.exit(1); }
