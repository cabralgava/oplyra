import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error harness modules are native JavaScript
import { issueOwnerChatAuthorization, run } from "../scripts/codex-authorize.mjs";
// @ts-expect-error harness modules are native JavaScript
import { loadStanding } from "../scripts/claude-standing.mjs";

const reference = "01a10bee-fa20-75d2-a649-5bf0f9e69353:" + "a".repeat(64);
const roots: string[] = [];
const home = () => { const p = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "oplyra-owner-consent-"))); roots.push(p); return p; };
afterEach(() => { for (const p of roots.splice(0)) fs.rmSync(p, { recursive: true, force: true }); });

describe("consentimento inicial do proprietário pelo chat", () => {
  it("emite em processo real sem TTY e mantém perfil e proveniência auditáveis", () => {
    const h = home();
    const child = spawnSync(process.execPath, [path.resolve("scripts/codex-authorize.mjs"), `--owner-chat-ref=${reference}`], { env: { HOME: h, PATH: path.dirname(process.execPath) }, encoding: "utf8" });
    expect(child.status).toBe(0);
    const { standing } = loadStanding({ dir: path.join(h, ".oplyra/standing"), killFile: path.join(h, ".oplyra/KILL-DELIVERY") });
    expect(standing.confirmation).toBe(`owner-chat:${reference}`);
    expect(standing.scope).toEqual({ paths: ["packages/core/test/"], riskClasses: ["routine"] });
    expect(standing.limits).toEqual({ maxMissions: 5, mergesPerRun: 5, maxAgentSessionsPerMission: 3, wallClockSeconds: 86_400 });
    expect(standing.missionBudgets).toMatchObject({ wallClockSeconds: 3600, iterations: 3, logReads: 5 });
    expect(Date.parse(standing.expiresAt) - Date.parse(standing.issuedAt)).toBe(7 * 86_400_000);
    expect(fs.statSync(path.join(h, ".oplyra/standing/authorization.json")).mode & 0o777).toBe(0o600);
    expect(child.stdout).not.toContain(reference);
  });

  it("recusa referência ausente ou inválida e tentativas de ampliar limites ou escopo", () => {
    const h = home();
    for (const argv of [[], ["--owner-chat-ref=sim"], [`--owner-chat-ref=${reference}`, "--paths=apps/web/"], [`--owner-chat-ref=${reference}`, "--max-missions=50"]]) {
      expect(run({ argv, home: h, write: () => {} })).toBe(2);
      expect(fs.existsSync(path.join(h, ".oplyra/standing/authorization.json"))).toBe(false);
    }
  });

  it("não sobrescreve registro nem renova validade automaticamente", () => {
    const h = home();
    issueOwnerChatAuthorization({ reference, home: h });
    const file = path.join(h, ".oplyra/standing/authorization.json");
    const before = fs.readFileSync(file);
    expect(() => issueOwnerChatAuthorization({ reference, home: h })).toThrow("ST-INVALID");
    expect(fs.readFileSync(file)).toEqual(before);
  });

  it.each(["KILL-DELIVERY", "standing/REVOKED"])("conserva o freio %s e recusa emissão", (marker) => {
    const h = home();
    const file = path.join(h, ".oplyra", marker);
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, "stop", { mode: 0o600 });
    expect(() => issueOwnerChatAuthorization({ reference, home: h })).toThrow("consent-stopped");
    expect(fs.readFileSync(file, "utf8")).toBe("stop");
    expect(fs.existsSync(path.join(h, ".oplyra/standing/authorization.json"))).toBe(false);
  });

  it("recusa diretório público e symlink sem modificar destino", () => {
    const h = home();
    const dir = path.join(h, ".oplyra");
    fs.mkdirSync(dir, { mode: 0o755 });
    expect(() => issueOwnerChatAuthorization({ reference, home: h })).toThrow("consent-directory");
    fs.rmdirSync(dir);
    const destination = home();
    fs.symlinkSync(destination, dir);
    expect(() => issueOwnerChatAuthorization({ reference, home: h })).toThrow("consent-directory");
    expect(fs.readdirSync(destination)).toEqual([]);
  });
});
