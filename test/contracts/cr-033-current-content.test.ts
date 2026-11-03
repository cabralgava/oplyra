// CR-033 — conteúdo CORRENTE. As releases congeladas são verificadas contra o snapshot (frozen-snapshot.ts); este
// arquivo olha a árvore de trabalho para que ler o snapshot nunca esconda uma regressão na implementação atual.
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./frozen-snapshot.ts";

const ler = (p: string) => readFileSync(join(REPO_ROOT, p), "utf8");
const sha = (p: string) => createHash("sha256").update(readFileSync(join(REPO_ROOT, p))).digest("hex");
const CONTRACTS = "docs/product/marketing-ops/contracts";
const m22 = JSON.parse(ler(`${CONTRACTS}/contract-registry-manifest-v2.22.json`)) as { artifacts: { path: string; sha256: string }[] };

/** Arquivos que o escopo aprovado do CR-033 (§13, passos 1 a 5) pode alterar em relação à Release 2.22. Qualquer outro desvio é regressão. */
const AUTORIZADOS_PELO_CR033 = new Set([
  ".claude/settings.json", "package.json", "scripts/claude-launch.mjs", "scripts/claude-launch.test.mjs", "scripts/claude-local-first-guard.mjs",
  "CLAUDE.md", ".github/workflows/ci.yml", "docs/harness/DESENVOLVIMENTO.md", "docs/harness/DEVELOPMENT-TOOLS.md", "docs/harness/AUTONOMOUS-BUILD.md",
  "test/contracts/contract-registry-release-2.22.contract.test.ts", "test/developer-harness.supply-chain.test.ts",
  // CR-034 (Brand OS, I-03; aprovado em 04/10/2026, Release 2.24 ainda não gerada): duas entradas `./brand` e o ajuste da exceção da 2.16.
  "packages/core/package.json", "packages/infra/package.json", "test/contracts/contract-registry-release-2.16.contract.test.ts",
]);

describe("CR-033: a árvore corrente só diverge da Release 2.22 onde o escopo aprovado permite", () => {
  it("todo artefato do manifest 2.22 fora do escopo do CR-033 continua idêntico no disco", () => {
    const divergentes = m22.artifacts.filter((a) => !existsSync(join(REPO_ROOT, a.path)) || sha(a.path) !== a.sha256).map((a) => a.path);
    expect(divergentes.filter((p) => !AUTORIZADOS_PELO_CR033.has(p))).toEqual([]);
  });

  it("manifests, relatórios, registries, schemas e migrations das releases 2.16–2.22 não mudaram", () => {
    const manifestos = readdirSync(join(REPO_ROOT, CONTRACTS)).filter((n) => /^contract-registry-manifest-v2\.\d+\.json$/.test(n));
    for (const v of ["2.16", "2.17", "2.18", "2.19", "2.20", "2.21", "2.22"]) expect(manifestos, v).toContain(`contract-registry-manifest-v${v}.json`);
    for (const a of m22.artifacts.filter((x) => /(\/registries\/|\/schemas\/|\/fixtures\/|supabase\/migrations\/)/.test(x.path))) expect(sha(a.path), a.path).toBe(a.sha256);
  });

  it("a Release 2.23 não foi gerada antes da etapa autorizada (§13, passo 8)", () => {
    expect(existsSync(join(REPO_ROOT, CONTRACTS, "contract-registry-manifest-v2.23.json"))).toBe(false);
    expect(existsSync(join(REPO_ROOT, CONTRACTS, "cross-registry-validation-v2.23.json"))).toBe(false);
    expect(existsSync(join(REPO_ROOT, "tools/contract-release/recipes/2.23.json"))).toBe(false);
  });
});

describe("CR-033: restrições em vigor no conteúdo corrente", () => {
  it("delegatedDelivery desligado, executionEnabled false e merge automático ausente", () => {
    const sw = JSON.parse(ler(".claude/delegated-delivery.json"));
    expect(sw).toEqual({ schema: "oplyra-delegated-delivery/1", delegatedDelivery: false });
    expect(ler("docs/harness/AUTONOMOUS-BUILD.md")).toMatch(/```yaml\nstatus: draft\nexecutionEnabled: false\n```/);
    expect(ler("docs/harness/AUTONOMOUS-BUILD.md")).not.toMatch(/executionEnabled:\s*true/);
    const wrapper = ler("scripts/claude-git.mjs");
    for (const proibido of ["/merge", "auto_merge", "enable_auto_merge", "/reviews", "ready_for_review", "/rerun", "--force", "force-with-lease"]) expect(wrapper, proibido).not.toContain(proibido);
  });

  it("o CR-033 continua `approved` (não aplicado) e preservado", () => {
    const cr = ler(`${CONTRACTS}/changes/CR-033-delegated-delivery-git-github.md`);
    expect(cr).toMatch(/\*\*Status:\*\* `approved`/);
    expect(cr).not.toMatch(/\*\*Status:\*\* `approved_and_applied`/);
    expect(cr).toContain("**D-17 (merge ceiling) stays deferred; automatic merge is not authorized.**");
  });

  it("o launcher e o guard atuais carregam as barreiras do CR-033", () => {
    const guard = ler("scripts/claude-local-first-guard.mjs");
    expect(guard).toContain("DELIVERY_PNPM_SCRIPTS");
    expect(guard).toContain('ctx.policy === "autonomous" && deliveryArgsOk');
    const launch = ler("scripts/claude-launch.mjs");
    for (const nome of ["GH_TOKEN", "GITHUB_TOKEN", "GIT_ASKPASS", "OPLYRA_DELIVERY_RECORD_SHA256"]) expect(launch, nome).toContain(`"${nome}"`);
    expect(ler(".claude/settings.json")).toContain('"Bash(gh *)"');
  });
});
