import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const directory = fileURLToPath(new URL(".", import.meta.url));
const root = fileURLToPath(new URL("../../../", import.meta.url));
const plan = JSON.parse(readFileSync(new URL("./plan.json", import.meta.url), "utf8"));
const SITE = "45056cd1-6732-40b3-b341-8b9fecca8345";
const ORIGIN = "https://oplyra-develop.netlify.app";
export function eligible(env, constants, now = Date.now()) {
  return constants?.IS_LOCAL === false && constants?.SITE_ID === SITE
    && env.NETLIFY === "true" && env.SITE_ID === SITE
    && env.BRANCH === "develop" && env.CONTEXT === "production"
    && env.URL === ORIGIN && /^[a-f0-9]{40}$/.test(env.COMMIT_REF ?? "")
    && Number.isFinite(now) && now < Date.parse(plan.expiresAt);
}
// Only a fixed, non-sensitive aggregate can leave the private child process.
export function aggregate(value, commit) {
  if (value?.code === "I04_POOL_FIXTURES_ABSENT") return { schema: "oplyra-i04-pool/1", code: value.code, commit, passed: false };
  if (value?.code !== "I04_POOL_OK" || value.sessionUser !== "oplyra_web_login"
    || value.effectiveRole !== "authenticated" || value.tls !== true
    || value.writeCases !== 24 || value.foreignRowsAffected !== 0
    || value.ownWritesRolledBack !== 8 || value.sequentialClients !== 1
    || value.concurrentClients !== 2 || value.concurrentBackends !== 2
    || value.cleanIdleChecks !== 6 || value.directAccessDenied !== true
    || value.rowSecurityOffDenied !== true || value.successAndErrorPaths !== true
    || value.poolMax !== 10) throw Error("I04_POOL_INVALID_REPORT");
  return { schema: "oplyra-i04-pool/1", code: "I04_POOL_OK", commit, passed: true,
    sessionUser: "oplyra_web_login", effectiveRole: "authenticated", tls: true,
    writeCases: 24, foreignRowsAffected: 0, ownWritesRolledBack: 8,
    sequentialClients: 1, concurrentClients: 2, concurrentBackends: 2,
    cleanIdleChecks: 6, directAccessDenied: true, rowSecurityOffDenied: true,
    successAndErrorPaths: true, poolMax: 10, execution: "netlify-build-real-adapter-pool",
    existingSsrInstanceTested: false };
}
export function runAudit({ env, constants, spawn = spawnSync, now = Date.now() }) {
  if (!eligible(env, constants, now)) return null;
  const child = spawn(process.execPath, ["--experimental-strip-types", directory + "run.mts"], {
    cwd: root, env, encoding: "utf8", timeout: 90000, maxBuffer: 32768,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (child.status !== 0 || child.error || child.signal) {
    let phase;
    try { const value = JSON.parse(child.stdout); if (value.code === "I04_POOL_FAILED") phase = value.phase; } catch {}
    if (["PREFLIGHT", "CONNECT", "FIXTURES", "WRITES", "CONTEXT_DENIAL", "SQL_ERROR_RESET", "RLS_OFF_RESET", "DIRECT_ACCESS", "CONCURRENCY"].includes(phase)) throw Error("I04_POOL_AUDIT_FAILED_" + phase);
    throw Error("I04_POOL_AUDIT_FAILED");
  }
  let value;
  try { value = JSON.parse(child.stdout); } catch { throw Error("I04_POOL_AUDIT_FAILED"); }
  return aggregate(value, env.COMMIT_REF);
}
