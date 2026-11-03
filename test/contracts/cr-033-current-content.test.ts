// CR-033 — conteúdo CORRENTE. As releases congeladas são verificadas contra o snapshot (frozen-snapshot.ts); este
// arquivo olha a árvore de trabalho para que ler o snapshot nunca esconda uma regressão na implementação atual.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./frozen-snapshot.ts";

const ler = (p: string) => readFileSync(join(REPO_ROOT, p), "utf8");
const CONTRACTS = "docs/product/marketing-ops/contracts";
// @ts-ignore — ferramenta .mjs sem declarações.
import { inspectReleaseState } from "../../tools/contract-release/current-state.mjs";
const transition = JSON.parse(ler("test/contracts/release-2.23-transition.json"));

describe("CR-033: estado derivado sem dispensar integridade", () => {
  it("a árvore corrente corresponde à base e ao conteúdo explicitamente revisto em cada fase", () => {
    const state = inspectReleaseState({repoRoot: REPO_ROOT, transition});
    expect(["unissued", "prepared", "intermediate", "final", "frozen"]).toContain(state.phase);
  }, 180_000);

  it("as releases congeladas 2.16–2.22 permanecem publicadas", () => {
    const names = readdirSync(join(REPO_ROOT, CONTRACTS));
    for (const version of ["2.16", "2.17", "2.18", "2.19", "2.20", "2.21", "2.22"]) {
      expect(names).toContain(`contract-registry-manifest-v${version}.json`);
    }
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
