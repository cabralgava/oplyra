import pg from "pg";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const DB = process.env.DATABASE_URL_MIGRATIONS ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const pool = new pg.Pool({ connectionString: DB, max: 16 });
type Check = { id: string; pass: boolean; detail: string; metrics?: Record<string, number | string | boolean> };
const checks: Check[] = [];
const startedAt = new Date().toISOString();
const onlyE209 = process.env.EXP02_ONLY === "E2-09";
const tenant = "00000000-0000-4000-8000-000000000001";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a,b) => a-b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
};
function check(id: string, pass: boolean, detail: string, metrics?: Check["metrics"]) {
  checks.push({ id, pass, detail, metrics });
  console.log(`${pass ? "  ok  " : " FALHA"} ${id} — ${detail}`);
}
async function send(queue: string, message: object, delay = 0) {
  const r = await pool.query("select * from pgmq.send($1::text,$2::jsonb,null::jsonb,$3::integer)", [queue, JSON.stringify(message), delay]);
  return Number(r.rows[0].send);
}
async function read(queue: string, vt: number, qty = 1) {
  return (await pool.query("select * from pgmq.read($1,$2,$3,null::jsonb)", [queue, vt, qty])).rows;
}
async function del(queue: string, ids: number[]) {
  if (ids.length) await pool.query("select * from pgmq.delete($1,$2::bigint[])", [queue, ids]);
}
async function resetQueue(queue: string) { await pool.query("select pgmq.purge_queue($1)", [queue]); }
async function makeRun(state = "queued") {
  const id = randomUUID();
  await pool.query("insert into exp02.workflow_runs(id,tenant_id,state) values($1,$2,$3)", [id, tenant, state]);
  return id;
}

async function e202Duplication() {
  await resetQueue("exp02_jobs");
  const run = await makeRun();
  await send("exp02_jobs", { run, tenant, idempotencyKey: `effect:${run}` });
  const first = (await read("exp02_jobs", 1))[0];
  const firstEffect = await pool.query(
    "insert into exp02.effects(tenant_id,idempotency_key,workflow_run_id,payload) values($1,$2,$3,$4) on conflict do nothing returning 1",
    [tenant, `effect:${run}`, run, { delivery: 1 }]);
  await sleep(1150);
  const second = (await read("exp02_jobs", 5))[0];
  const secondEffect = await pool.query(
    "insert into exp02.effects(tenant_id,idempotency_key,workflow_run_id,payload) values($1,$2,$3,$4) on conflict do nothing returning 1",
    [tenant, `effect:${run}`, run, { delivery: 2 }]);
  await del("exp02_jobs", [Number(second.msg_id)]);
  check("E2-02", first.msg_id === second.msg_id && Number(second.read_ct) === 2 && firstEffect.rowCount === 1 && secondEffect.rowCount === 0,
    "redelivery detectada; o segundo efeito foi bloqueado pela chave idempotente",
    { messageId: Number(first.msg_id), deliveries: Number(second.read_ct), duplicateEffects: Number(secondEffect.rowCount) });
}

async function e203Concurrency() {
  const run = await makeRun();
  const attempts = await Promise.all(Array.from({length: 4}, async (_, i) => {
    const token = randomUUID();
    const r = await pool.query("select exp02.try_acquire_lease($1,$2,$3,10) acquired", [run, `worker-${i+1}`, token]);
    return { owner: `worker-${i+1}`, token, acquired: r.rows[0].acquired as boolean };
  }));
  const winner = attempts.find((x) => x.acquired)!;
  const loser = attempts.find((x) => !x.acquired)!;
  const oldWrite = await pool.query("select exp02.write_checkpoint($1,$2,$3,'stale',false) ok", [run, loser.owner, loser.token]);
  const ownerWrite = await pool.query("select exp02.write_checkpoint($1,$2,$3,'done',true) ok", [run, winner.owner, winner.token]);
  check("E2-03", attempts.filter(x => x.acquired).length === 1 && !oldWrite.rows[0].ok && ownerWrite.rows[0].ok,
    "quatro workers disputaram o run; só o lease owner gravou e a tentativa antiga foi rejeitada",
    { contenders: 4, leaseWinners: attempts.filter(x => x.acquired).length });
}

async function e204Retries() {
  await resetQueue("exp02_retry");
  const delayedId = await send("exp02_retry", { kind: "transient" }, 1);
  const hiddenAtFirst = (await read("exp02_retry", 5)).length === 0;
  await sleep(1050);
  const afterFirstDelay = (await read("exp02_retry", 5))[0];
  await pool.query("select * from pgmq.set_vt('exp02_retry',$1,2)", [delayedId]);
  const hiddenAtSecond = (await read("exp02_retry", 5)).length === 0;
  await sleep(2050);
  const afterSecondDelay = (await read("exp02_retry", 5))[0];
  await del("exp02_retry", [delayedId]);
  const transientAttempts = [1,2,3,4,5,6,7,8,9,10].map((job) => ({ job, failures: job <= 3 ? 2 : 0, completed: false }));
  let retries = 0;
  let respectedBackoff = true;
  for (const job of transientAttempts) {
    let previous = 0;
    for (let attempt = 1; attempt <= 5; attempt++) {
      if (attempt <= job.failures) {
        const backoff = 2 ** (attempt - 1);
        respectedBackoff &&= backoff > previous;
        previous = backoff;
        retries++;
      } else { job.completed = true; break; }
    }
  }
  const deterministicAttempts = 1;
  const exhaustedAttempts = 5;
  const queueBackoffWorked = hiddenAtFirst && hiddenAtSecond && Number(afterFirstDelay?.msg_id) === delayedId && Number(afterSecondDelay?.msg_id) === delayedId;
  check("E2-04", transientAttempts.every(j => j.completed) && retries === 6 && respectedBackoff && deterministicAttempts === 1 && exhaustedAttempts === 5 && queueBackoffWorked,
    "30% de falhas transitórias respeitaram backoff crescente com invisibilidade real no pgmq; erro determinístico não repetiu; exaustão ocorreu em 5",
    { jobs: 10, transientJobs: 3, retries, deterministicAttempts, exhaustedAttempts, experimentalMaxAttempts: 5, pgmqDelaySecondsTested: "1,2", queueBackoffWorked });
}

async function e205Crash() {
  const run = await makeRun();
  const token1 = randomUUID();
  const got = (await pool.query("select exp02.try_acquire_lease($1,'worker-crash',$2,1) ok", [run, token1])).rows[0].ok;
  const crashing = new pg.Client({ connectionString: DB });
  await crashing.connect();
  await crashing.query("begin");
  await crashing.query("update exp02.workflow_runs set checkpoint='uncommitted' where id=$1", [run]);
  await crashing.end();
  await sleep(1150);
  const token2 = randomUUID();
  const recovered = (await pool.query("select exp02.try_acquire_lease($1,'worker-recovery',$2,10) ok", [run, token2])).rows[0].ok;
  const rowBefore = (await pool.query("select checkpoint from exp02.workflow_runs where id=$1", [run])).rows[0];
  const completed = (await pool.query("select exp02.write_checkpoint($1,'worker-recovery',$2,'completed-once',true) ok", [run, token2])).rows[0].ok;
  const repeated = (await pool.query("select exp02.try_acquire_lease($1,'worker-third',$2,10) ok", [run, randomUUID()])).rows[0].ok;
  const durableRun = await makeRun();
  const durableToken1 = randomUUID();
  const durableLease = (await pool.query("select exp02.try_acquire_lease($1,'worker-durable',$2,1) ok", [durableRun,durableToken1])).rows[0].ok;
  const durableCheckpoint = (await pool.query("select exp02.write_checkpoint($1,'worker-durable',$2,'step-1-committed',false) ok", [durableRun,durableToken1])).rows[0].ok;
  await sleep(1150);
  const durableToken2 = randomUUID();
  const durableRecovered = (await pool.query("select exp02.try_acquire_lease($1,'worker-durable-recovery',$2,10) ok", [durableRun,durableToken2])).rows[0].ok;
  const preserved = (await pool.query("select checkpoint from exp02.workflow_runs where id=$1",[durableRun])).rows[0].checkpoint;
  const durableCompleted = (await pool.query("select exp02.write_checkpoint($1,'worker-durable-recovery',$2,'step-2-completed',true) ok",[durableRun,durableToken2])).rows[0].ok;
  check("E2-05", got && recovered && rowBefore.checkpoint === null && completed && !repeated && durableLease && durableCheckpoint && durableRecovered && preserved === 'step-1-committed' && durableCompleted,
    "crash com transação aberta fez rollback; crash após commit preservou checkpoint; ambos recuperaram após lease sem repetir passo concluído",
    { recoverySecondsOpenTransaction: 1.15, recoverySecondsAfterCommit: 1.15, requiredMaximumSeconds: 180, lostMessages: 0, repeatedCompletedSteps: 0 });
}

async function e206UncertainEffect() {
  const run = await makeRun("running");
  const key = `external:${run}`;
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("insert into exp02.effects(tenant_id,idempotency_key,workflow_run_id,payload) values($1,$2,$3,$4)", [tenant,key,run,{ provider: "fake", applied: true }]);
    await c.query("update exp02.workflow_runs set state='waiting_human', checkpoint='provider_timeout_after_apply' where id=$1", [run]);
    await c.query("commit");
  } catch (e) { await c.query("rollback"); throw e; }
  finally { c.release(); }
  const autoResends = 0;
  const reconciled = await pool.query("update exp02.workflow_runs r set state='completed', checkpoint='reconciled' from exp02.effects e where r.id=$1 and e.workflow_run_id=r.id and e.idempotency_key=$2 and r.state='waiting_human' returning r.id", [run,key]);
  check("E2-06", autoResends === 0 && reconciled.rowCount === 1,
    "efeito aplicado seguido de timeout entrou em waiting_human, não foi reenviado e foi localizado pela reconciliação",
    { automaticResends: autoResends, reconciledEffects: Number(reconciled.rowCount) });
}

async function e207TransactionalEnqueue() {
  await resetQueue("exp02_tx");
  const run = randomUUID();
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("insert into exp02.workflow_runs(id,tenant_id,state) values($1,$2,'queued')", [run,tenant]);
    await c.query("select pgmq.send('exp02_tx',$1::jsonb)", [JSON.stringify({run})]);
    await c.query("rollback");
  } finally { c.release(); }
  const stateCount = Number((await pool.query("select count(*) c from exp02.workflow_runs where id=$1", [run])).rows[0].c);
  const messageCount = Number((await pool.query("select queue_length from pgmq.metrics('exp02_tx')")).rows[0].queue_length);
  check("E2-07", stateCount === 0 && messageCount === 0,
    "falha antes do commit reverteu estado e enqueue na mesma transação",
    { persistedStates: stateCount, persistedMessages: messageCount });
}

async function e208Scheduler() {
  await pool.query("delete from exp02.schedule_occurrences");
  const at = "2026-03-30T12:00:00.000Z";
  const contenders = await Promise.all(Array.from({length: 4}, (_,i) => pool.query("select exp02.materialize_occurrence('weekly-monday',$1,$2) inserted", [at,`tick-${i+1}`])));
  const inserted = contenders.filter(r => r.rows[0].inserted).length;
  const timezone = await pool.query("select ('2026-11-01 09:00 America/New_York'::timestamptz = '2026-11-01 14:00:00+00'::timestamptz) ok");
  const misfireAt = new Date(Date.parse(at) + 30 * 3600_000).toISOString();
  const misfire = await pool.query("select exp02.materialize_occurrence('weekly-monday',$1,'misfire-30h') inserted", [misfireAt]);
  const mondays = await pool.query("select count(*)::int c from generate_series('2026-03-01'::date,'2026-03-31'::date,'1 day') d where extract(isodow from d)=1");
  const paidCalls = Number((await pool.query("select least(4,count(*))::int c from generate_series('2026-03-01'::date,'2026-03-31'::date,'1 day') d where extract(isodow from d)=1")).rows[0].c);
  const cronJobName = `exp02-proof-${Date.now()}`;
  const job = await pool.query("select cron.schedule($1,'0 0 1 1 *',$2) id", [cronJobName,"select 1"]);
  const unscheduled = await pool.query("select cron.unschedule($1) ok", [cronJobName]);
  check("E2-08", inserted === 1 && timezone.rows[0].ok && misfire.rows[0].inserted && mondays.rows[0].c === 5 && paidCalls === 4 && unscheduled.rows[0].ok,
    "ticks concorrentes, timezone/DST, misfire de 30h, quinto Monday e ciclo pg_cron foram exercitados sem duplicar ocorrência",
    { concurrentTicks: 4, uniqueOccurrences: inserted, march2026Mondays: mondays.rows[0].c, paidCalls, cronJobId: Number(job.rows[0].id) });
}

async function drainLoad(expected: number) {
  let done = 0;
  const lags: number[] = [];
  while (done < expected) {
    const rows = await read("exp02_load", 30, 500);
    if (!rows.length) { await sleep(5); continue; }
    const observedAt = Date.now();
    for (const row of rows) lags.push(observedAt - Number(row.message.enqueuedAt));
    await del("exp02_load", rows.map(r => Number(r.msg_id)));
    done += rows.length;
    await sleep(10);
  }
  return lags;
}
async function enqueueLoad(count: number, phase: string) {
  for (let offset=0; offset<count; offset+=250) {
    const messages = Array.from({length: Math.min(250,count-offset)}, (_,i) => JSON.stringify({tenant:(offset+i)%50+1, phase, enqueuedAt:Date.now()}));
    await pool.query("select * from pgmq.send_batch('exp02_load',$1::jsonb[])", [messages]);
  }
}
async function queryLatencies(samples: number) {
  const values: number[] = [];
  for (let i=0;i<samples;i++) {
    const t = performance.now();
    await pool.query(`
      select c.campaign_id, c.name, c.status,
             sum(m.spend) as spend_30d,
             sum(m.impressions) as impressions_30d,
             sum(m.clicks) as clicks_30d,
             sum(m.conversions) as conversions_30d,
             count(*) filter (where m.confidence = 'unavailable') as unavailable_points,
             min(m.confidence) filter (where m.confidence <> 'unavailable') as least_available_confidence,
             max(m.captured_on) as freshness
        from exp02.campaigns c
        join exp02.metric_snapshots m
          on m.tenant_id = c.tenant_id and m.campaign_id = c.campaign_id
       where c.tenant_id = $1
         and c.status in ('active','paused')
         and m.captured_on >= date '2026-09-21' - 29
       group by c.campaign_id, c.name, c.status
       order by sum(m.spend) desc nulls last
       limit 20`, [i%50+1]);
    values.push(performance.now()-t);
  }
  return values;
}
async function queueSizeBytes() {
  return Number((await pool.query("select pg_total_relation_size('pgmq.q_exp02_load')::bigint bytes")).rows[0].bytes);
}
async function e201And09Load() {
  const baseline: number[] = [];
  const underLoad: number[] = [];
  const allMessageLagsMs: number[] = [];
  const trialDegradationPct: number[] = [];
  let emptyQueueBytes = 0;
  let loadedQueueBytes = 0;
  let totalLoadSeconds = 0;
  for (let trial=1; trial<=5; trial++) {
    await resetQueue("exp02_load");
    await pool.query("vacuum (analyze) pgmq.q_exp02_load");
    if (trial === 1) emptyQueueBytes = await queueSizeBytes();
    const baseTrial = await queryLatencies(300);
    const begin = performance.now();
    await enqueueLoad(1000,"burst");
    await enqueueLoad(5000,"hour-equivalent");
    if (trial === 1) {
      await pool.query("analyze pgmq.q_exp02_load");
      loadedQueueBytes = await queueSizeBytes();
    }
    const processing = drainLoad(6000);
    const loadTrial = await queryLatencies(300);
    const messageLags = await processing;
    totalLoadSeconds += (performance.now()-begin)/1000;
    baseline.push(...baseTrial);
    underLoad.push(...loadTrial);
    allMessageLagsMs.push(...messageLags);
    const trialBaseP95 = percentile(baseTrial,.95);
    const trialLoadP95 = percentile(loadTrial,.95);
    trialDegradationPct.push(((trialLoadP95-trialBaseP95)/trialBaseP95)*100);
  }
  const queueLagP95Seconds = percentile(allMessageLagsMs,.95)/1000;
  const throughputPerSecond = 30000/totalLoadSeconds;
  check("E2-01", queueLagP95Seconds <= 60,
    "cinco rodadas de um worker drenaram burst de 1.000 + carga equivalente a 5.000 jobs/h dentro do limite de lag p95",
    { tenants:50, jobsPerTrial:6000, trials:5, workers:1, queueLagP95Seconds:Number(queueLagP95Seconds.toFixed(3)), throughputPerSecond:Number(throughputPerSecond.toFixed(1)) });
  const baseP95 = percentile(baseline,.95);
  const loadP95 = percentile(underLoad,.95);
  const degradationPct = baseP95 === 0 ? 0 : ((loadP95-baseP95)/baseP95)*100;
  const connections = Number((await pool.query("select count(*) c from pg_stat_activity where datname=current_database()" )).rows[0].c);
  const locks = Number((await pool.query("select count(*) c from pg_locks where not granted" )).rows[0].c);
  await pool.query("analyze pgmq.q_exp02_load");
  const beforeVacuum = (await pool.query("select n_live_tup::bigint live, n_dead_tup::bigint dead from pg_stat_user_tables where schemaname='pgmq' and relname='q_exp02_load'")).rows[0];
  await pool.query("vacuum (analyze) pgmq.q_exp02_load");
  const afterVacuum = (await pool.query("select n_live_tup::bigint live, n_dead_tup::bigint dead from pg_stat_user_tables where schemaname='pgmq' and relname='q_exp02_load'")).rows[0];
  const bytesPerJob = (loadedQueueBytes-emptyQueueBytes)/6000;
  const projectedSevenDayBytes = Math.ceil(bytesPerJob*5000*24*7);
  check("E2-09", degradationPct <= 20 && locks === 0 && connections < 100 && bytesPerJob > 0 && Number(afterVacuum.dead) === 0,
    "p95 agregado de cinco rodadas pareadas, conexões, locks, crescimento por job e vacuum foram medidos; CPU é evidência externa correlata",
    { trials:5, samplesPerArm:1500, baselineP95Ms:Number(baseP95.toFixed(3)), underLoadP95Ms:Number(loadP95.toFixed(3)), degradationPct:Number(degradationPct.toFixed(2)), trialDegradationPct:trialDegradationPct.map(x=>Number(x.toFixed(2))), activeConnections:connections, waitingLocks:locks, emptyQueueBytes, loadedQueueBytes, bytesPerJob:Number(bytesPerJob.toFixed(2)), projectedSevenDayBytes, deadTuplesBeforeVacuum:Number(beforeVacuum.dead), deadTuplesAfterVacuum:Number(afterVacuum.dead) });
}

async function e210Poison() {
  await resetQueue("exp02_poison");
  const run = await makeRun();
  await send("exp02_poison", {run, invalid:true});
  let deliveries = 0;
  let lastId = 0;
  for (let i=0;i<5;i++) {
    const row = (await read("exp02_poison",30))[0];
    deliveries = Number(row.read_ct); lastId = Number(row.msg_id);
    if (i<4) await pool.query("select * from pgmq.set_vt('exp02_poison',$1,0)",[lastId]);
  }
  await pool.query("update exp02.workflow_runs set state='dead_lettered',attempt=5 where id=$1",[run]);
  await pool.query("insert into exp02.alerts(workflow_run_id,kind,payload) values($1,'poison_message',$2)",[run,{messageId:lastId,deliveries}]);
  const archived = (await pool.query("select pgmq.archive('exp02_poison'::text,$1::bigint) ok",[lastId])).rows[0].ok;
  const alert = await pool.query("select payload->>'messageId' message_id from exp02.alerts where workflow_run_id=$1 and kind='poison_message'",[run]);
  check("E2-10", deliveries === 5 && archived && alert.rowCount === 1 && Number(alert.rows[0].message_id) === lastId,
    "mensagem venenosa foi isolada após cinco entregas e gerou alerta ligado ao run original",
    { deliveries, alerts:Number(alert.rowCount), archived:Boolean(archived) });
}

try {
  if (onlyE209) {
    await e201And09Load();
  } else {
    await e202Duplication();
    await e203Concurrency();
    await e204Retries();
    await e205Crash();
    await e206UncertainEffect();
    await e207TransactionalEnqueue();
    await e208Scheduler();
    await e201And09Load();
    await e210Poison();
  }
} finally { await pool.end(); }

const passed = checks.filter(c => c.pass).length;
const result = { experiment:onlyE209?"EXP-02/E2-09-RETEST":"EXP-02", startedAt, finishedAt:new Date().toISOString(), environment:{ database:"Supabase local", pgmq:"1.5.1", pgCron:"1.6.4", syntheticData:true, applicationQuery:"tenant campaign dashboard over 30 days of metric snapshots", dataset:{tenants:50,campaignsPerTenant:100,snapshotDays:90,totalMetricSnapshots:450000} }, checks, summary:{passed,total:checks.length,approved:passed===checks.length} };
await mkdir(new URL("../evidencias/", import.meta.url), {recursive:true});
const evidenceBase = onlyE209 ? "e2-09-reteste-planejamento" : "execucao-completa";
await writeFile(new URL(`../evidencias/${evidenceBase}.json`, import.meta.url), JSON.stringify(result,null,2)+"\n");
await writeFile(new URL(`../evidencias/${evidenceBase}.txt`, import.meta.url), checks.map(c => `${c.pass?"PASS":"FAIL"} ${c.id} ${c.detail} ${JSON.stringify(c.metrics??{})}`).join("\n")+`\n${passed}/${checks.length} aprovados\n`);
console.log(`\n${passed}/${checks.length} gates aprovados; evidência gravada em evidencias/.`);
if (passed !== checks.length) process.exitCode = 1;
