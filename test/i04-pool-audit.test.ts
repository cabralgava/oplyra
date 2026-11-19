import { describe, it, expect, vi } from "vitest";
import { eligible, aggregate, runAudit } from "../deploy/develop/i04-pool-audit/guard.mjs";

const env = { NETLIFY: "true", SITE_ID: "45056cd1-6732-40b3-b341-8b9fecca8345",
  BRANCH: "develop", CONTEXT: "production", URL: "https://oplyra-develop.netlify.app", COMMIT_REF: "a".repeat(40) };
const constants = { IS_LOCAL: false, SITE_ID: env.SITE_ID };
const now = Date.parse("2026-11-19T21:00:00Z");
const report = { code: "I04_POOL_OK", sessionUser: "oplyra_web_login", effectiveRole: "authenticated",
  tls: true, writeCases: 24, foreignRowsAffected: 0, ownWritesRolledBack: 8,
  sequentialClients: 1, concurrentClients: 2, concurrentBackends: 2, cleanIdleChecks: 6,
  directAccessDenied: true, rowSecurityOffDenied: true, successAndErrorPaths: true, poolMax: 10 };
describe("auditoria privada I04 no build develop", () => {
  it.each([
    { SITE_ID: "production-site" }, { BRANCH: "main" }, { CONTEXT: "deploy-preview" },
    { URL: "https://app.oplyra.io" }, { NETLIFY: "" }, { COMMIT_REF: "develop" },
  ])("não inicia processo em destino/contexto divergente %j", patch => {
    const spawn = vi.fn();
    expect(runAudit({ env: { ...env, ...patch }, constants, now, spawn })).toBeNull();
    expect(spawn).not.toHaveBeenCalled();
  });
  it("recusa execução local, provider divergente e plano expirado", () => {
    expect(eligible(env, { ...constants, IS_LOCAL: true }, now)).toBe(false);
    expect(eligible(env, { ...constants, SITE_ID: "other" }, now)).toBe(false);
    expect(eligible(env, constants, Date.parse("2026-11-20T00:00:00Z"))).toBe(false);
    expect(eligible(env, constants, NaN)).toBe(false);
  });
  it("aceita somente subprocesso fixo, sem shell ou entrada de comando", () => {
    const spawn = vi.fn(() => ({ status: 0, stdout: JSON.stringify(report) }));
    const actual = runAudit({ env, constants, now, spawn });
    expect(actual?.passed).toBe(true);
    expect(spawn).toHaveBeenCalledOnce();
    const [exe, args, options] = spawn.mock.calls[0] as unknown as [string, string[], Record<string, unknown>];
    expect(exe).toBe(process.execPath);
    expect(args[0]).toBe("--experimental-strip-types");
    expect(args[1]).toMatch(/\/deploy\/develop\/i04-pool-audit\/run.mts$/);
    expect(options.shell).toBeUndefined();
    expect(options.stdio).toEqual(["ignore", "pipe", "pipe"]);
    expect(options.timeout).toBe(90000);
  });
  it.each(["status", "error", "signal"])("não propaga stdout/stderr de falha: %s", field => {
    const spawn = vi.fn(() => ({ status: field === "status" ? 1 : 0,
      stdout: "CANARY_PRIVATE_VALUE", stderr: "CANARY_PRIVATE_VALUE",
      ...(field === "error" ? { error: Error("CANARY_PRIVATE_VALUE") } : {}),
      ...(field === "signal" ? { signal: "SIGTERM" } : {}) }));
    expect(() => runAudit({ env, constants, now, spawn })).toThrow(/^I04_POOL_AUDIT_FAILED$/);
  });
  it("não publica valores extras nem declara fixture ausente como sucesso", () => {
    const safe = aggregate({ ...report, secret: "CANARY_PRIVATE_VALUE", query: "CANARY_PRIVATE_VALUE" }, env.COMMIT_REF);
    expect(JSON.stringify(safe)).not.toContain("CANARY_PRIVATE_VALUE");
    expect(safe.existingSsrInstanceTested).toBe(false);
    expect(aggregate({ code: "I04_POOL_FIXTURES_ABSENT" }, env.COMMIT_REF).passed).toBe(false);
  });
  it.each([
    { sessionUser: "postgres" }, { effectiveRole: "postgres" }, { tls: false },
    { foreignRowsAffected: 1 }, { ownWritesRolledBack: 0 }, { sequentialClients: 2 },
    { concurrentClients: 1 }, { concurrentBackends: 1 }, { cleanIdleChecks: 0 },
    { directAccessDenied: false }, { rowSecurityOffDenied: false }, { successAndErrorPaths: false },
    { writeCases: 0 }, { poolMax: 1 },
  ])("não aceita prova incompleta ou privilegiada %j", patch => {
    expect(() => aggregate({ ...report, ...patch }, env.COMMIT_REF)).toThrow("I04_POOL_INVALID_REPORT");
  });
});

