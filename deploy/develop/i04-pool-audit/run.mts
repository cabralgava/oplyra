import { readFileSync } from "node:fs";
import { criarUnitOfWork, comoCliente } from "../../../packages/infra/src/db.ts";
import { carregarConfigDevelop } from "../../../packages/infra/src/develop-config.ts";
import { SUPABASE_DEVELOP_CA } from "../../../packages/infra/src/supabase-develop-ca.ts";
import { eligible } from "./guard.mjs";

const plan: { actors: Actor[] } = JSON.parse(readFileSync(new URL("./plan.json", import.meta.url), "utf8"));
type Actor = { tenantId: string; userId: string; objectId: string };
const tables = ["objectives", "campaigns", "experiments", "tasks"] as const;
const expected = Symbol("intentional rollback");
let phase = "PREFLIGHT";
let web: ReturnType<typeof criarUnitOfWork> | undefined;
const ids = new WeakMap<object, number>();
let next = 0;
const sequential = new Set<number>();
let idleChecks = 0;
function id(client: object) { if (!ids.has(client)) ids.set(client, ++next); return ids.get(client)!; }
function check(condition: unknown) { if (!condition) throw Error("I04_POOL_ASSERTION"); }
async function idle() {
  const c = await web!.pool.connect();
  try {
    sequential.add(id(c));
    const { rows: [r] } = await c.query(`select session_user as login, current_user as role,
      nullif(current_setting('app.tenant_id',true),'') as tenant,
      nullif(current_setting('request.jwt.claim.sub',true),'') as actor,
      (select rolsuper or rolbypassrls from pg_roles where rolname=current_user) as bypass`);
    check(r.login === "oplyra_web_login" && r.role === r.login && r.tenant === null && r.actor === null && !r.bypass);
    check((c as unknown as { connection: { stream: { encrypted: boolean } } }).connection.stream.encrypted === true);
    idleChecks++;
  } finally { c.release(); }
}
async function context(tx: ReturnType<typeof comoCliente>, actor: Actor) {
  const { rows: [r] } = await tx.query(`select session_user as login, current_user as role,
    app.current_tenant() as tenant, app.current_user_id() as actor,
    (select rolsuper or rolbypassrls from pg_roles where rolname=current_user) as bypass,
    pg_backend_pid() as pid`);
  check(r.login === "oplyra_web_login" && r.role === "authenticated" && !r.bypass);
  check(r.tenant === (actor.tenantId || null) && r.actor === actor.userId);
  return r.pid;
}
async function rollback(actor: Actor, work: (tx: ReturnType<typeof comoCliente>) => Promise<void>) {
  let rolled = false;
  try {
    await web!.withUserTransaction(actor as never, async transaction => {
      const tx = comoCliente(transaction);
      sequential.add(id(tx));
      await tx.query("set local lock_timeout='1s'");
      await tx.query("set local statement_timeout='10s'");
      await context(tx, actor);
      await work(tx);
      throw expected;
    });
  } catch (error) { if (error !== expected) throw error; rolled = true; }
  check(rolled);
}
try {
  check(eligible(process.env, { IS_LOCAL: false, SITE_ID: process.env.SITE_ID }));
  // These are the public develop values used by the web. Build-only loopback
  // markers are not runtime configuration. The private DB value stays in Netlify.
  const config = carregarConfigDevelop({
    OPLYRA_ENV: "develop", SUPABASE_PROJECT_REF: "eqpvjydnqbbawpkeizys",
    SUPABASE_URL: "https://eqpvjydnqbbawpkeizys.supabase.co",
    NEXT_PUBLIC_SUPABASE_URL: "https://eqpvjydnqbbawpkeizys.supabase.co",
    NEXT_PUBLIC_APP_URL: "https://oplyra-develop.netlify.app",
    OPLYRA_NETLIFY_SITE_ID: process.env.SITE_ID, SITE_ID: process.env.SITE_ID,
    SITE_NAME: process.env.SITE_NAME, URL: process.env.URL,
    DATABASE_URL_APP: process.env.DATABASE_URL_APP,
  });
  const db = new URL(config.databaseUrl);
  check(db.hostname === "aws-1-sa-east-1.pooler.supabase.com" && db.port === "6543");
  phase = "CONNECT";
  web = criarUnitOfWork({ connectionString: config.databaseUrl, max: 10,
    ssl: { ca: SUPABASE_DEVELOP_CA, rejectUnauthorized: true } });
  web.pool.on("error", () => {}); // No unhandled driver logging with connection details.
  await idle();
  phase = "FIXTURES";
  let fixtures = true;
  for (const actor of plan.actors) {
    await web.withUserTransaction(actor as never, async transaction => {
      const tx = comoCliente(transaction);
      await context(tx, actor);
      const { rows: [r] } = await tx.query("select count(*)::int as n from strategy.campaigns where id=$1", [actor.objectId]);
      if (r.n !== 1) fixtures = false;
    });
  }
  if (!fixtures) {
    console.log(JSON.stringify({ code: "I04_POOL_FIXTURES_ABSENT" }));
  } else {
    phase = "WRITES";
    let writes = 0, rolledBackWrites = 0;
    for (let i = 0; i < 2; i++) {
      const actor = plan.actors[i], foreign = plan.actors[1-i];
      for (const table of tables) {
        await rollback(actor, async tx => {
          check((await tx.query(`select count(*)::int as n from strategy.${table} where id=$1`, [foreign.objectId])).rows[0].n === 0);
          check((await tx.query(`select revision from strategy.${table} where id=$1`, [actor.objectId])).rows[0]?.revision === 1);
          check((await tx.query(`update strategy.${table} set revision=2 where id=$1`, [foreign.objectId])).rowCount === 0); writes++;
          check((await tx.query(`update strategy.${table} set revision=2 where id=$1`, [actor.objectId])).rowCount === 1); writes++;
          check((await tx.query(`select revision from strategy.${table} where id=$1`, [actor.objectId])).rows[0]?.revision === 2);
        });
        await web.withUserTransaction(actor as never, async transaction => {
      const tx = comoCliente(transaction);
          sequential.add(id(tx));
          check((await tx.query(`select revision from strategy.${table} where id=$1`, [actor.objectId])).rows[0]?.revision === 1);
        });
        rolledBackWrites++;
      }
      await idle();
    }
    phase = "CONTEXT_DENIAL";
    // Missing membership and missing tenant remain denied by the database.
    for (const actor of [
      { ...plan.actors[0], userId: "fe07d364-494d-4331-b956-45185ac48a50" },
      { ...plan.actors[0], tenantId: "" },
    ]) {
      await rollback(actor, async tx => {
        for (const table of tables) {
          check((await tx.query(`update strategy.${table} set revision=2 where id=any($1::uuid[])`, [plan.actors.map((a: Actor) => a.objectId)])).rowCount === 0); writes++;
        }
      });
    }
    await idle();
    phase = "SQL_ERROR_RESET";
    let divisionDenied = false;
    try {
      await web.withUserTransaction(plan.actors[0] as never, async transaction => { const tx = comoCliente(transaction); sequential.add(id(tx)); await tx.query("select 1/0"); });
    } catch (error) { divisionDenied = (error as { code?: string }).code === "22012"; }
    check(divisionDenied);
    await idle();
    phase = "RLS_OFF_RESET";
    let offDenied = false;
    try {
      await web.withUserTransaction(plan.actors[1] as never, async transaction => { const tx = comoCliente(transaction);
        sequential.add(id(tx));
        await context(tx, plan.actors[1]);
        await tx.query("set local row_security=off");
        await tx.query("select id from strategy.campaigns where id=$1", [plan.actors[1].objectId]);
      });
    } catch (error) { offDenied = (error as { code?: string }).code === "42501"; }
    check(offDenied);
    await idle();
    check(sequential.size === 1 && idleChecks === 6);
    phase = "DIRECT_ACCESS";
    let directDenied = false;
    const raw = await web.pool.connect();
    try { await raw.query("select count(*) from strategy.campaigns"); }
    catch (error) { directDenied = (error as { code?: string }).code === "42501"; }
    finally { raw.release(); }
    check(directDenied);
    phase = "CONCURRENCY";
    const clients = new Set<number>(), backends = new Set<number>();
    let arrived = 0;
    let release!: () => void;
    let rejectTogether!: (error: Error) => void;
    const together = new Promise<void>((resolve, reject) => { release = resolve; rejectTogether = reject; });
    const barrierTimeout = setTimeout(() => rejectTogether(Error("I04_POOL_BARRIER")), 8000);
    barrierTimeout.unref();
    await Promise.all(plan.actors.map((actor: Actor) => web!.withUserTransaction(actor as never, async transaction => {
      const tx = comoCliente(transaction);
      clients.add(id(tx)); backends.add(await context(tx, actor));
      if (++arrived === 2) { clearTimeout(barrierTimeout); release(); }
      await together;
      for (const table of tables) {
        const r = await tx.query(`select count(*)::int as n from strategy.${table} where id=$1`, [actor.objectId]);
        check(r.rows[0].n === 1);
        const other = plan.actors.find((a: Actor) => a.tenantId !== actor.tenantId);
        check((await tx.query(`select count(*)::int as n from strategy.${table} where id=$1`, [other.objectId])).rows[0].n === 0);
      }
    })));
    check(clients.size === 2 && backends.size === 2 && writes === 24 && rolledBackWrites === 8);
    console.log(JSON.stringify({ code: "I04_POOL_OK", sessionUser: "oplyra_web_login",
      effectiveRole: "authenticated", tls: true, writeCases: writes, foreignRowsAffected: 0,
      ownWritesRolledBack: rolledBackWrites, sequentialClients: sequential.size,
      concurrentClients: clients.size, concurrentBackends: backends.size,
      cleanIdleChecks: idleChecks, directAccessDenied: directDenied, rowSecurityOffDenied: offDenied,
      successAndErrorPaths: true, poolMax: 10 }));
  }
} catch {
  console.log(JSON.stringify({ code: "I04_POOL_FAILED", phase }));
  process.exitCode = 1;
} finally {
  await web?.encerrar().catch(() => { process.exitCode = 1; });
}
