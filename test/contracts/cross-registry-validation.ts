// Perfis explícitos: a evidência 2.22 preserva suas expectativas históricas.
// O runner usa o perfil corrente exportado PELO snapshot, sem inferi-lo de receitas/outputs.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { runCrossRegistryValidation as historical, sha256File, CONTRACTS_DIR, PRE_REGISTRY_MIGRATIONS, CR028_MIGRATION } from "./cross-registry-validation-2.22.ts";
import type { Check } from "./cross-registry-validation-2.22.ts";
export * from "./cross-registry-validation-2.22.ts";
export const CURRENT_VALIDATION_PROFILE = "2.23";
export const CURRENT_REQUIRED_IDS = [
  "FROZEN-migrations-000001-000014-v2", "DOCS-cr030-product-ai-alignment-v2",
  "DOCS-cr031-harness-documents-v2", "DOCS-cr032-s1-git-lifecycle-v2",
  "HARNESS-cr032-s1-no-executable-mechanism-v2",
] as const;

export function runCrossRegistryValidation(root: string, profile: "2.22" | "2.23" = "2.22") {
  if (profile !== "2.22" && profile !== "2.23") throw new Error("CR-VALIDATION-PROFILE");
  const result = historical(root);
  if (profile === "2.22") return result;
  const text = (p: string) => readFileSync(join(root, p), "utf8");
  const json = (p: string) => JSON.parse(text(p));
  const replacements = new Map<string, Check>();
  const replace = (id: string, details: Record<string, boolean | number | string[]>) => {
    replacements.set(id, { id: `${id}-v2`, category: result.checks.find((c) => c.id === id)!.category,
      status: Object.values(details).every((v) => typeof v === "boolean" ? v : Array.isArray(v) ? v.length === 0 : true) ? "passed" : "failed", details });
  };
  const m17 = json(`${CONTRACTS_DIR}/contract-registry-manifest-v2.17.json`);
  const legacy = [...Object.entries(PRE_REGISTRY_MIGRATIONS).map(([path, sha256]) => ({path, sha256})),
    ...m17.artifacts.filter((a: {path: string}) => /^supabase\/migrations\/\d+_.*\.sql$/.test(a.path))];
  const m22 = json(`${CONTRACTS_DIR}/contract-registry-manifest-v2.22.json`);
  const brand = "supabase/migrations/20261004000016_brand_os.sql";
  const strategy = "supabase/migrations/20261111000017_strategy.sql";
  const runtime = "supabase/migrations/20261111000018_runtime.sql";
  const strategyDecision = `${CONTRACTS_DIR}/changes/CR-042-i04-local-strategy-migration.md`;
  const runtimeDecision = `${CONTRACTS_DIR}/changes/CR-043-i02-local-runtime-migration.md`;
  const reconciliation = "deploy/develop/migrations-17-18-reconciliation.json";
  const reconciliationDecision = `${CONTRACTS_DIR}/changes/CR-067-develop-migrations-17-18-reconciliation.md`;
  const strategyHash = "f925e1ed287cf05f674e07d0f82cc3f8a946aa693465fb38bc236c1ebdd5421c";
  const runtimeHash = "583533d6e3a036cf4cda991a13509bb1ac943e657cbe1b2ec1beb90fbb65f2a8";
  const approvedHash = (p: string, hash: string) => existsSync(join(root, p))
    && text(p).includes("**Status:** `approved`")
    && text(p).includes("**Migration SHA-256:** `" + hash + "`");
  const map = json(reconciliation);
  const expectedEntries = [
    {source: strategy, sourceVersion: "20261111000017", remoteVersion: "20261116211241", remoteName: "strategy", sha256: strategyHash},
    {source: runtime, sourceVersion: "20261111000018", remoteVersion: "20261116211251", remoteName: "runtime", sha256: runtimeHash},
  ];
  const securityMapPath = "deploy/develop/migrations-19-20-security-reconciliation.json";
  const securityDecision = `${CONTRACTS_DIR}/changes/CR-068-develop-media-security-reconciliation.md`;
  const mediaDecision = `${CONTRACTS_DIR}/changes/CR-055-google-meta-ads-connection-and-read-contracts-proposal.md`;
  const hardeningDecision = `${CONTRACTS_DIR}/changes/CR-058-develop-function-search-path-hardening.md`;
  const securityEntries = [
  {
    "source": "supabase/migrations/20261116210007_media_connection_read.sql",
    "sourceVersion": "20261116210007",
    "remoteVersion": "20261116214247",
    "remoteName": "media_connection_read_cr055_v1",
    "sha256": "7f10ffeb250d4b44badb058825414b921279e43db7b481ca1a2bffcc7bc87b85",
    "ci": "canonical_migration"
  },
  {
    "source": "supabase/migrations/20261116214433_media_fk_indexes.sql",
    "sourceVersion": "20261116214433",
    "remoteVersion": "20261116214625",
    "remoteName": "media_fk_indexes_cr055_v1",
    "sha256": "6ae6fa4ae3041ff1805bd01e7ea1b1e7a3b81966860b4b0ff0ad8ee9d33c8df5",
    "ci": "canonical_migration"
  },
  {
    "source": "deploy/develop/supabase/migrations/20261116202506_harden_application_function_search_paths.sql",
    "sourceVersion": "20261116202506",
    "remoteVersion": "20261116211333",
    "remoteName": "harden_application_function_search_paths",
    "sha256": "1eb1ff59a19625fac34f73371e1dee1224f9b6cfe4087f37b8050b1312d26908",
    "ci": "local_ci_overlay"
  },
  {
    "source": "deploy/develop/supabase/migrations/20261116211348_harden_domain_validator_search_paths.sql",
    "sourceVersion": "20261116211348",
    "remoteVersion": "20261116211501",
    "remoteName": "harden_domain_validator_search_paths",
    "sha256": "a65156b4e48fb3176997290e05630a0da2e41602408f4ad09debaeb53878881a",
    "ci": "local_ci_overlay"
  }
];
  const securityMap = json(securityMapPath);
  const mediaFiles = securityEntries.filter((e) => e.ci === "canonical_migration").map((e) => e.source);
  const securityBootstrap = "deploy/develop/prepare-ci-security.mjs";
  const ci = text(".github/workflows/ci.yml");
  const rolesStep = ci.indexOf("run: pnpm db:roles"), securityStep = ci.indexOf("run: node deploy/develop/prepare-ci-security.mjs"), verifyStep = ci.indexOf("run: pnpm verificar");
  const expected = [...legacy.map((a: {path: string}) => a.path), CR028_MIGRATION, brand, strategy, runtime, ...mediaFiles].sort();
  const actual = readdirSync(join(root, "supabase/migrations")).filter((p) => p.endsWith(".sql")).map((p) => `supabase/migrations/${p}`).sort();
  const changed = legacy.filter((a: {path: string; sha256: string}) => !existsSync(join(root, a.path)) || sha256File(root, a.path) !== a.sha256).map((a: {path: string}) => a.path);
  replace("FROZEN-migrations-000001-000014", {
    fourteenPreserved: legacy.length === 14 && changed.length === 0, changed,
    authorizedSet: JSON.stringify(expected) === JSON.stringify(actual),
    migration15Preserved: sha256File(root, CR028_MIGRATION) === m22.artifacts.find((a: {path: string}) => a.path === CR028_MIGRATION)?.sha256,
    brandAuthorized: text(`${CONTRACTS_DIR}/changes/CR-034-brand-os-package-entries.md`).includes(brand),
    strategyApprovedBytes: approvedHash(strategyDecision, strategyHash) && existsSync(join(root, strategy)) && sha256File(root, strategy) === strategyHash,
    runtimeApprovedBytes: approvedHash(runtimeDecision, runtimeHash) && existsSync(join(root, runtime)) && sha256File(root, runtime) === runtimeHash,
    reconciliationAuthorized: text(reconciliationDecision).includes("**Status:** `approved`") && text(reconciliationDecision).includes("`develop_history_reconciliation_no_apply`"),
    reconciliationTarget: map.schema === "oplyra-develop-migration-reconciliation/1" && map.projectRef === "eqpvjydnqbbawpkeizys" && map.mode === "history_only_no_apply" && map.decision === "CR-067",
    reconciliationExact: JSON.stringify(map.entries) === JSON.stringify(expectedEntries),
    mediaSecurityBytes: securityEntries.every((e) => existsSync(join(root, e.source)) && sha256File(root, e.source) === e.sha256),
    mediaAuthority: text(mediaDecision).includes("**Status:** `approved`") && text(mediaDecision).includes("**Contract version:** `1.0`"),
    hardeningAuthority: text(hardeningDecision).includes("**Estado de execução:** aplicado somente em develop"),
    securityAuthority: text(securityDecision).includes("**Status:** `approved`") && text(securityDecision).includes("`develop_history_reconciliation_no_apply`"),
    securityTarget: securityMap.schema === "oplyra-develop-migration-reconciliation/1" && securityMap.projectRef === "eqpvjydnqbbawpkeizys" && securityMap.mode === "history_only_no_apply" && securityMap.decision === "CR-068",
    securityExact: JSON.stringify(securityMap.entries) === JSON.stringify(securityEntries),
    isolatedCiBootstrap: rolesStep > 0 && securityStep > rolesStep && verifyStep > securityStep && existsSync(join(root, securityBootstrap)),
  });
  const priorAi = result.checks.find((c) => c.id === "DOCS-cr030-product-ai-alignment")!.details;
  const updates = text("docs/product/marketing-ops/ATUALIZACOES.md");
  replace("DOCS-cr030-product-ai-alignment", {
    ...Object.fromEntries(Object.entries(priorAi).filter(([k]) => k !== "atualizacoes" && k !== "files")) as Record<string, boolean>,
    currentAuthority: updates.includes("**Referência protegida:**") && updates.includes("v2.3") && updates.includes("instrução explícita do usuário → este complemento → v2.3"),
    billingDecision: updates.includes("CR-040") && updates.includes("ADR-0010") && updates.includes("**Estado aplicado:**"),
  });
  const previousDocs = result.checks.find((c) => c.id === "DOCS-cr031-harness-documents")!.details;
  const claude = text("CLAUDE.md"), agents = text("AGENTS.md");
  replace("DOCS-cr031-harness-documents", {
    ...Object.fromEntries(Object.entries(previousDocs).filter(([k]) => k !== "claudeStage")) as Record<string, boolean>,
    continuousMandate: claude.includes("## Objetivo e mandato vigente") && claude.includes("Relatos históricos não comprovam capacidade atual") && claude.includes("Autorização não é implementação"),
    codexEntry: agents.includes("Executor de desenvolvimento") && agents.includes("não revoga os controles de segurança") && agents.includes("Não simular aprovação humana"),
  });
  const auto = text("docs/harness/AUTONOMOUS-BUILD.md"), policy = text("docs/harness/POLITICA-REVISAO-RESPONSAVEL-UNICO.md");
  const cr41 = text(`${CONTRACTS_DIR}/changes/CR-041-single-owner-review-policy.md`);
  replace("DOCS-cr032-s1-git-lifecycle", {
    historicalProposalPreserved: text(`${CONTRACTS_DIR}/changes/CR-032-developer-harness-git-lifecycle.md`).includes("**Status:** `approved`"),
    currentMandate: auto.includes("executionEnabled: false") && auto.includes("CR-041"),
    singleOwnerPolicy: policy.includes("0 aprovações numéricas") && policy.includes("sem revisão de CODEOWNER") && policy.includes("risk-gate") && policy.includes("structural-gate"),
    reviewDecision: cr41.includes("**Status da decisão:** `approved`") && policy.includes("pedidos de alteração") && policy.includes("CI pendente"),
    noActivationClaim: policy.includes("Nenhuma flag de ativação foi habilitada"),
  });
  const wrapper = text("scripts/claude-git.mjs"), gate = text("scripts/claude-gates.mjs");
  replace("HARNESS-cr032-s1-no-executable-mechanism", {
    barriers: wrapper.includes("DD-NO-RECORD") && wrapper.includes("DD-PROTECTION") && wrapper.includes("DD-PATH") && wrapper.includes("DD-BUDGET") && wrapper.includes("DD-ENV"),
    audit: wrapper.includes("auditoria") && wrapper.includes("audit(run, verb, outcome"),
    failClosedGates: gate.includes("risk-gate") && gate.includes("structural-gate") && gate.includes("CHANGES_REQUESTED"),
    ownership: text(".github/CODEOWNERS").includes("@cabralgava") && existsSync(join(root, ".github/pull_request_template.md")),
    switchNotActivated: json(".claude/delegated-delivery.json").delegatedDelivery === false,
  });
  // As novas entradas também são entradas verificáveis; outputs/receitas da release nunca entram aqui.
  for (const p of [brand, strategy, runtime, strategyDecision, runtimeDecision, reconciliation, reconciliationDecision, securityMapPath, securityDecision, mediaDecision, hardeningDecision, securityBootstrap, ".github/workflows/ci.yml", ...securityEntries.map((e) => e.source), "AGENTS.md", "docs/harness/POLITICA-REVISAO-RESPONSAVEL-UNICO.md",
    `${CONTRACTS_DIR}/changes/CR-034-brand-os-package-entries.md`, `${CONTRACTS_DIR}/changes/CR-041-single-owner-review-policy.md`,
    "scripts/claude-git.mjs", "scripts/claude-gates.mjs", ".github/CODEOWNERS", ".github/pull_request_template.md", ".claude/delegated-delivery.json"]) {
    if (!result.inputs.some((i) => i.path === p)) result.inputs.push({path: p, sha256: sha256File(root, p), evidenceLevel: "direct"});
  }
  return {...result, checks: result.checks.map((c) => replacements.get(c.id) ?? c)};
}
