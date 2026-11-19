import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runAudit } from "./guard.mjs";
const root = fileURLToPath(new URL("../../../", import.meta.url));
export async function onPreBuild({ constants, utils }) {
  try {
    const result = runAudit({ env: process.env, constants });
    if (!result) return;
    mkdirSync(root + "apps/web/public", { recursive: true });
    writeFileSync(root + "apps/web/public/__develop-i04-pool.json", JSON.stringify(result) + "\n");
    console.log("I04_POOL_AUDIT_RESULT " + JSON.stringify(result));
  } catch (error) {
    // Never forward driver errors, URLs, child stderr or environment values.
    const phase = /^I04_POOL_AUDIT_FAILED_(PREFLIGHT|CONNECT|FIXTURES|WRITES|CONTEXT_DENIAL|SQL_ERROR_RESET|RLS_OFF_RESET|DIRECT_ACCESS|CONCURRENCY)$/.exec(error?.message ?? "")?.[1];
    utils.build.failBuild("I04_POOL_AUDIT_FAILED_SEM_DETALHES_SENSIVEIS" + (phase ? "_" + phase : ""));
  }
}
