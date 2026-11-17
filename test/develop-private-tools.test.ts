import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";

describe("ferramentas privadas de develop — testes sem rede ou credenciais",()=>{
  it("executa a suíte Node do provisionador, saída segura e operador temporário",()=>{
    const r=spawnSync(process.execPath,["--test",
      "deploy/develop/provision-web-login.test.mjs",
      "deploy/develop/hosted-safe-reporter.test.mjs",
      "deploy/develop/provision-tenant.test.mjs"],
      {cwd:new URL("..",import.meta.url),encoding:"utf8",timeout:30_000});
    expect(r.status,r.stderr).toBe(0);
  });
});
