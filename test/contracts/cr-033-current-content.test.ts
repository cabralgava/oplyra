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

/** CR-040 / ADR-0010: conteúdo documental conciliado com main 433e183 em 03/11/2026.
 *  Proveniência: 21 caminhos do rascunho histórico CR-034/billing, conferidos contra o commit 2394d15;
 *  novos hashes refletem apenas o identificador canônico CR-040 e a conciliação revisada da base.
 *  Transitório até absorção em release autorizada, sem reservar uma versão. ADR-0006 e artefatos protegidos ficam de fora. */
const AUTORIZADOS_PELO_CR040 = new Map<string, string>([
  ["README.md", "5a1a823b9e696b3ebf45a74bc903c05f8788caa05fc820c8c1ccfec6812f0702"],
  ["docs/decisions/ADR-0007-entitlements-e-billing.md", "755fbbb0ce5dee751693370c7829cbfa77bc923c65ac255765b38a3a8b800372"],
  ["docs/decisions/README.md", "501100a7ec596926d263b8d27cf1ac91ae27c208a51cdae43b345f4bc535ec03"],
  ["docs/product/marketing-ops/01-product-requirements.md", "ad63edb34fe407b6b33d0710766cc776b06a29fd2250dcd5d3c44fdd1e3db689"],
  ["docs/product/marketing-ops/03-domain-model.md", "c31bfd8204985180fef2cbb17f32832fda9f8a620cf6b5ee315a2627fef64400"],
  ["docs/product/marketing-ops/04-architecture.md", "05f305e204ea38b937c01d31de79b8a56bcd5367186cec574c14d4f081e1e451"],
  ["docs/product/marketing-ops/05-data-model.md", "d08bf888993bfb191d0e8db1c24c258757725fb01757a150c08c96f0e3b03113"],
  ["docs/product/marketing-ops/06-integrations.md", "19b43dc7ac55eb9482c395d4dad30ffe1f24859cf105efff6d96cfc86863fac4"],
  ["docs/product/marketing-ops/07-security-lgpd.md", "e90b7604cf97c819497527cd5e0ab8f59af28d902bb691026a8ada277768938e"],
  ["docs/product/marketing-ops/08-billing-entitlements.md", "bb93e234afe384f8d95bd03a4f7c3b8c3cd7c97a214efd75ddbc692fa76cb790"],
  ["docs/product/marketing-ops/09-agentic-architecture.md", "91b8e8966d43dde82d4a69a39dfec87865911035f5b204dde5a48898548cb761"],
  ["docs/product/marketing-ops/10-agent-catalog.md", "336e1db4232d14b4369169b286fac9f05a6fb1d5d7421a3f0a29d8a2b4ecbbed"],
  ["docs/product/marketing-ops/11-agent-governance.md", "67621124a36a4cac0591e1df9d7609e9cce3fd7645aad5c01506ad5c6e2edf22"],
  ["docs/product/marketing-ops/12-roadmap.md", "e333940a0eb04f67824174041f930d9d4e7b0103c01c5918f2f6f1712acdc3a0"],
  ["docs/product/marketing-ops/13-ai-model-routing-finops.md", "7006af4116992995eec374139bba3fec64241bad3b61d55b49c74ed5f5213ca3"],
  ["docs/product/marketing-ops/15-test-plan.md", "c31b6a31427b273aa06e5f74dea92243efb83267e3d43966a83d7ed88777724f"],
  ["docs/product/marketing-ops/16-environments-release.md", "c6e4beac1acc9d48284afe25c3c293980bc263c73eb8f78c910dcef7f39baeaa"],
  ["docs/product/marketing-ops/17-risks-costs.md", "8e838f74e46b53557163bd1d36d76312c65932feb8b7bfb6d9b6a7f45776d288"],
  ["docs/product/marketing-ops/ATUALIZACOES.md", "09136f4da31d307c0c5d9e0f3bcaa5e846c2f3ec5601b0c5cdf85b2b48757785"],
  ["docs/product/marketing-ops/contracts/contracts-README.md", "ce6d89af6ab39b748d5e1a113dbd1a2777e6d0c6ae7e0a7cf055de8847bf4708"],
  ["docs/product/marketing-ops/README.md", "5b259f4dc554dce92f5bf01375a84e2ebefa77e086e24e166dc8d1ae744e2705"],
]);
const autorizadoCr040 = (p: string) => AUTORIZADOS_PELO_CR040.has(p) && existsSync(join(REPO_ROOT, p)) && sha(p) === AUTORIZADOS_PELO_CR040.get(p);

describe("CR-033: a árvore corrente só diverge da Release 2.22 onde o escopo aprovado permite", () => {
  it("todo artefato do manifest 2.22 fora do escopo do CR-033 continua idêntico no disco", () => {
    const divergentes = m22.artifacts.filter((a) => !existsSync(join(REPO_ROOT, a.path)) || sha(a.path) !== a.sha256).map((a) => a.path);
    expect(divergentes.filter((p) => !AUTORIZADOS_PELO_CR033.has(p) && !autorizadoCr040(p))).toEqual([]);
  });

  it("CR-040: exceção só para 21 documentos do manifest, com conteúdo exato e sem fontes protegidas", () => {
    const paths = new Set(m22.artifacts.map((a) => a.path));
    expect(AUTORIZADOS_PELO_CR040.size).toBe(21);
    for (const [p, hash] of AUTORIZADOS_PELO_CR040) {
      expect(paths.has(p), p).toBe(true);
      expect(p.endsWith(".md"), p).toBe(true);
      expect(p, p).not.toMatch(/registries|schemas|fixtures|migrations|manifest|ADR-0006/i);
      expect(hash, p).toMatch(/^[a-f0-9]{64}$/);
    }
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
