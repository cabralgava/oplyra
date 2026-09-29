// Cross-registry validation executável da Contract Registry Release 2.17.
// Reproduz as categorias da validação do Freeze v1 (envelope, identidade,
// contagem, nomenclatura, referências, schemas, manifest de integração),
// mantém as verificações do CR-026 e acrescenta as do CR-027 (Error Registry
// 1.5, Model Profile Schema 1.1 e Registry 1.1, schemas do Cost Ledger,
// migrations do Ledger). A Release 2.16 fica como evidência histórica em
// cross-registry-validation-v2.16.json, conferida pelo manifest v2.16.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createSchemaRegistry, unsupportedKeywords, validateSchema } from "./json-schema-subset.ts";
import {
  attemptCallId, HARNESS_FAILURE_CONTRACT, validateInvocationRequest, validateModelProfiles, validateModelRegistry,
  validateProviderResult,
} from "../../packages/core/src/index.ts";
import type { AgentActionCatalog } from "../../packages/core/src/index.ts";
import { leaseSecondsFor } from "../../packages/core/src/index.ts";
import { LOCAL_TEST_MODEL_REGISTRY } from "../../packages/infra/src/ai-model-harness/local-test-catalog.ts";
import { budgetPeriodInvariants, costLedgerEntryInvariants, modelAttemptInvariants } from "./cost-ledger-invariants.ts";

export type Check = { id: string; category: string; status: "passed" | "failed"; details: Record<string, unknown> };
type Json = Record<string, any>;

export const CONTRACTS_DIR = "docs/product/marketing-ops/contracts";
export const REGISTRY_NAMES = ["agents", "permissions", "tools", "actions", "events", "errors", "handoffs", "quality-gates", "model-profiles"] as const;
type RegistryName = (typeof REGISTRY_NAMES)[number];

/** Contagem esperada: Release 2.16 mais o delta do CR-027 (+2 erros; perfis inalterados). */
export const EXPECTED_COUNTS: Record<RegistryName, number> = {
  agents: 12, permissions: 6, tools: 58, actions: 171, events: 137, errors: 60, handoffs: 43, "quality-gates": 11, "model-profiles": 3,
};
const EXPECTED_VERSIONS: Record<RegistryName, string> = {
  agents: "1.0", permissions: "1.0", tools: "1.0", actions: "2.0", events: "1.2", errors: "1.5", handoffs: "1.0", "quality-gates": "1.0", "model-profiles": "1.1",
};
const IDENTITY: Record<RegistryName, (e: Json) => string> = {
  agents: (e) => e.key, permissions: (e) => e.key, tools: (e) => e.key, actions: (e) => e.action, events: (e) => e.event,
  errors: (e) => e.code, handoffs: (e) => e.key, "quality-gates": (e) => e.key, "model-profiles": (e) => `${e.profileId}@${e.version}`,
};
const NAMING: Partial<Record<RegistryName, RegExp>> = {
  agents: /^[a-z][a-z0-9-]*-agent$/, actions: /^[a-z][a-z0-9_]*$/, events: /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/,
  errors: /^[A-Z][A-Z0-9_]*$/, "model-profiles": /^[a-z0-9][a-z0-9._-]*@[1-9][0-9]*$/,
};
/** Registries que o CR-026 não altera: devem continuar idênticos à Release 2.15. */
export const UNCHANGED_SINCE_2_15 = ["agents", "permissions", "tools", "actions", "events", "handoffs", "quality-gates"] as const;
export const CR026_ERROR_CODES = [
  "MODEL_ATTEMPT_ALREADY_EXECUTED", "MODEL_ATTEMPT_IN_PROGRESS", "MODEL_ATTEMPTS_EXHAUSTED", "MODEL_CAPABILITY_BLOCKED",
  "MODEL_INVOCATION_INVALID", "MODEL_OUTPUT_INVALID", "MODEL_PARAMETER_NOT_APPLIED", "MODEL_PROFILE_NOT_FOUND",
  "MODEL_PROVIDER_RESPONSE_INVALID", "MODEL_REQUEST_REJECTED", "MODEL_RESOLUTION_MISMATCH", "MODEL_ROUTE_UNAVAILABLE",
];
const HARNESS_SCHEMAS = [
  "model-invocation-request", "provider-response", "model-registry-entry", "model-profile", "model-call-record",
  "model-profile-1.1", "budget-period", "cost-ledger-entry", "model-attempt",
] as const;
/** Schemas do CR-027 (Model Profile 1.1 e os três do Cost Ledger). */
export const CR027_SCHEMAS = ["model-profile-1.1", "budget-period", "cost-ledger-entry", "model-attempt"] as const;
/** A fixture pertence ao schema de prefixo mais longo: `model-profile-1.1-*` não é fixture do 1.0. */
const schemaDaFixture = (arquivo: string) =>
  [...HARNESS_SCHEMAS].filter((n) => arquivo.startsWith(n)).sort((a, b) => b.length - a.length)[0];
export const CR027_MIGRATIONS = [
  "supabase/migrations/20260929000013_finops_ledger_schema.sql",
  "supabase/migrations/20260929000014_finops_ledger_functions.sql",
] as const;
const LEDGER_FUNCTIONS = [
  "acquire_model_attempt", "close_model_attempt", "budget_remaining", "expire_next_model_attempt",
  "reconcile_model_attempt", "open_budget_period", "close_budget_period",
] as const;
/** Invariantes que dependem de sequência no harness (fingerprint, classificação); verificados em teste de contrato próprio. */
const HARNESS_DEPENDENT = new Set([
  "model-invocation-request-classification-downgrade-business-invariant.json",
  "model-invocation-request-idempotency-conflict-business-invariant.json",
]);

export const sha256File = (root: string, p: string) => createHash("sha256").update(readFileSync(join(root, p))).digest("hex");

function schemaFiles(dir: string, acc: string[] = []): string[] {
  for (const n of readdirSync(dir).sort()) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) schemaFiles(p, acc);
    else if (n.endsWith(".schema.json")) acc.push(p);
  }
  return acc;
}

function refs(o: unknown, acc: string[] = []): string[] {
  if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) { if (k === "$ref" && typeof v === "string") acc.push(v); else refs(v, acc); }
  return acc;
}

function recordInvariants(r: Json): string[] {
  const p: string[] = [];
  if (r.outcome === "succeeded" && r.failureKind !== null) p.push("succeeded_with_failure");
  if (r.outcome === "failed" && r.failureKind === null) p.push("failed_without_kind");
  if (r.costStatus === "settled" && r.costMicroUsd === null) p.push("settled_without_cost");
  if (r.costStatus === "pending_reconciliation" && r.costMicroUsd !== null) p.push("pending_with_cost");
  if (r.outputAssetIds !== null && r.outcome !== "succeeded") p.push("assets_on_failure");
  if (r.classificationProvenance.some((x: Json) => x.tenantId !== r.tenantId)) p.push("provenance_other_tenant");
  if (r.callId !== attemptCallId(r.tenantId, r.actionKey, r.invocationId, r.attempt)) p.push("call_id_scope");
  return p;
}

export function runCrossRegistryValidation(root: string): { checks: Check[]; counts: Json; inputs: { path: string; sha256: string; evidenceLevel: "direct" }[] } {
  const C = join(root, CONTRACTS_DIR);
  const ler = (p: string): Json => JSON.parse(readFileSync(join(C, p), "utf8"));
  const checks: Check[] = [];
  const add = (id: string, category: string, ok: boolean, details: Record<string, unknown>) =>
    checks.push({ id, category, status: ok ? "passed" : "failed", details });
  const inputs: { path: string; sha256: string; evidenceLevel: "direct" }[] = [];
  const entrada = (rel: string) => inputs.push({ path: `${CONTRACTS_DIR}/${rel}`, sha256: sha256File(root, `${CONTRACTS_DIR}/${rel}`), evidenceLevel: "direct" });

  const regs = Object.fromEntries(REGISTRY_NAMES.map((n) => { entrada(`registries/${n}.json`); return [n, ler(`registries/${n}.json`)]; })) as Record<RegistryName, Json>;
  const counts: Json = {};

  for (const n of REGISTRY_NAMES) {
    const r = regs[n];
    const env = { registry: r.registry, registryVersion: r.registryVersion, schemaVersion: r.schemaVersion, status: r.status, entries: r.entries?.length };
    add(`ENV-${n}`, "registry_envelope", r.registry === `oplyra-${n}` && r.registryVersion === EXPECTED_VERSIONS[n] && r.schemaVersion === "1.0" && r.status === "active" && Array.isArray(r.entries), { actual: env });
    const ids = r.entries.map(IDENTITY[n]);
    const dup = ids.filter((x: string, i: number) => ids.indexOf(x) !== i);
    add(`UNIQUE-${n}`, "identity", dup.length === 0, { duplicates: dup });
    add(`COUNT-${n}`, "count", r.entries.length === EXPECTED_COUNTS[n], { actual: r.entries.length, expected: EXPECTED_COUNTS[n] });
    counts[n] = r.entries.length;
    const re = NAMING[n];
    if (re) { const bad = ids.filter((x: string) => !re.test(x)); add(`NAMING-${n}`, "naming", bad.length === 0, { invalid: bad }); }
  }

  const agentes = new Set(regs.agents.entries.map((e: Json) => e.key));
  const acoes = new Map<string, Json>(regs.actions.entries.map((e: Json) => [e.action, e]));
  const permissoes = new Set(regs.permissions.entries.map((e: Json) => e.key));
  const agenteRef = (v: unknown) => typeof v === "string" && v.endsWith("-agent");

  const acaoSemAgente = regs.actions.entries.flatMap((e: Json) => [e.ownerAgent, ...(e.callableByAgents ?? []), ...(e.declaredByAgents ?? [])].filter((a) => !agentes.has(a)).map((a) => `${e.action}:${a}`));
  const refsAcao = regs.actions.entries.reduce((t: number, e: Json) => t + 1 + (e.callableByAgents ?? []).length + (e.declaredByAgents ?? []).length, 0);
  add("ACTION-agents", "actions", acaoSemAgente.length === 0 && refsAcao > 0, { orphan: acaoSemAgente, checked: refsAcao });
  const eventoSemAgente = regs.events.entries.flatMap((e: Json) => [e.producer, ...(e.initiatedByAgents ?? []), ...(e.consumers ?? [])].filter((a) => agenteRef(a) && !agentes.has(a)).map((a) => `${e.event}:${a}`));
  const refsEvento = regs.events.entries.flatMap((e: Json) => [e.producer, ...(e.initiatedByAgents ?? []), ...(e.consumers ?? [])]).filter(agenteRef).length;
  add("EVENT-agent-refs", "events", eventoSemAgente.length === 0 && refsEvento > 0, { orphan: eventoSemAgente, checked: refsEvento });
  const handoffOrfao = regs.handoffs.entries.flatMap((h: Json) => [
    ...[h.fromAgent, h.toAgent].filter((a) => !agentes.has(a)).map((a) => `${h.key}:${a}`),
    ...(h.allowedActions ?? []).filter((a: unknown) => typeof a === "string" && !acoes.has(a)).map((a: string) => `${h.key}:${a}`),
  ]);
  const bindings = regs.handoffs.entries.reduce((t: number, h: Json) => t + (h.allowedActions ?? []).length, 0);
  add("HANDOFF-refs", "handoffs", handoffOrfao.length === 0 && bindings > 0, { orphan: handoffOrfao, actionBindingsChecked: bindings });
  const toolSemPermissao = regs.tools.entries.flatMap((t: Json) => (t.allowedPermissions ?? []).filter((p: string) => !permissoes.has(p)).map((p: string) => `${t.key}:${p}`));
  const refsTool = regs.tools.entries.reduce((t: number, x: Json) => t + (x.allowedPermissions ?? []).length, 0);
  add("TOOL-permissions", "tools", toolSemPermissao.length === 0 && refsTool > 0, { orphan: toolSemPermissao, checked: refsTool });
  const gateSemAgente = regs["quality-gates"].entries.filter((g: Json) => g.ownerAgent && !agentes.has(g.ownerAgent)).map((g: Json) => g.key);
  add("GATE-agent-refs", "quality_gates", gateSemAgente.length === 0, { orphan: gateSemAgente });

  // Error Registry 1.4
  const errorSchema = ler("schemas/error.schema.json");
  entrada("schemas/error.schema.json");
  const catEnum: string[] = errorSchema.$defs.errorCategory.enum;
  const erros: Json[] = regs.errors.entries;
  add("ERROR-categories", "errors", erros.every((e) => catEnum.includes(e.category)), { invalid: erros.filter((e) => !catEnum.includes(e.category)).map((e) => e.code) });
  add("ERROR-retry-semantics", "errors", erros.every((e) => (e.retryable ? e.defaultNextAction === "retry" : e.defaultNextAction !== "retry")), {});
  add("ERROR-critical-behavior", "errors", erros.filter((e) => e.severity === "critical").every((e) => ["stop", "escalate", "request_approval", "request_human_intervention"].includes(e.defaultNextAction)), {});
  const presentes = CR026_ERROR_CODES.filter((c) => erros.filter((e) => e.code === c).length === 1);
  add("ERROR-cr026-codes", "errors", presentes.length === 12, { registered: presentes.length, expected: 12 });
  const bnc = erros.filter((e) => e.code === "BUDGET_NOT_CONFIGURED");
  add("ERROR-cr027-budget-not-configured", "errors", bnc.length === 1 && bnc[0]!.category === "budget" && bnc[0]!.severity === "high" &&
    bnc[0]!.retryable === false && bnc[0]!.defaultNextAction === "request_approval", { registered: bnc.length });
  const acu = erros.filter((e) => e.code === "MODEL_ATTEMPT_CLOSE_UNCONFIRMED");
  add("ERROR-cr027-close-unconfirmed", "errors", acu.length === 1 && acu[0]!.category === "integration" && acu[0]!.severity === "high" &&
    acu[0]!.retryable === false && acu[0]!.defaultNextAction === "escalate" &&
    HARNESS_FAILURE_CONTRACT.attempt_close_unconfirmed?.contract.code === "MODEL_ATTEMPT_CLOSE_UNCONFIRMED" &&
    HARNESS_FAILURE_CONTRACT.attempt_close_rejected?.contract.code === "INVALID_STATE_TRANSITION", { registered: acu.length });

  // Model Profiles
  const catalogo: AgentActionCatalog = {
    source: "registries",
    hasAgent: (a) => agentes.has(a),
    hasAction: (x) => acoes.has(x),
    canAgentCallAction: (a, x) => agentes.has(a) && (acoes.get(x)?.ownerAgent === a || (acoes.get(x)?.callableByAgents ?? []).includes(a)),
  };
  const perfis: Json[] = regs["model-profiles"].entries;
  add("PROFILE-agent-action-binding", "model_profiles", perfis.every((p) => catalogo.canAgentCallAction(p.agentKey, p.actionKey)), { bindings: perfis.map((p) => `${p.agentKey}::${p.actionKey}`) });
  const ativos = perfis.filter((p) => p.status === "active").map((p) => `${p.agentKey}::${p.actionKey}`);
  add("PROFILE-single-active", "model_profiles", new Set(ativos).size === ativos.length, { active: ativos.length });
  const semantica = validateModelProfiles(perfis as never, LOCAL_TEST_MODEL_REGISTRY, catalogo);
  add("PROFILE-semantics-local-catalog", "model_profiles", semantica.length === 0, { issues: semantica });

  // Mapeamento de erros do harness
  const porCodigo = new Map(erros.map((e) => [e.code, e]));
  const mapa = Object.entries(HARNESS_FAILURE_CONTRACT).filter(([, s]) => !porCodigo.has(s.contract.code) || porCodigo.get(s.contract.code)!.retryable !== s.retryable).map(([k]) => k);
  add("HARNESS-error-mapping", "harness", mapa.length === 0, { mismatched: mapa, kinds: Object.keys(HARNESS_FAILURE_CONTRACT).length });

  // Schemas
  const arquivos = schemaFiles(join(C, "schemas"));
  const docs = arquivos.map((f) => ({ file: relative(C, f), doc: JSON.parse(readFileSync(f, "utf8")) as Json }));
  for (const d of docs) entrada(d.file);
  const idsSchema = docs.map((d) => d.doc.$id);
  add("SCHEMA-draft", "schemas", docs.every((d) => d.doc.$schema === "https://json-schema.org/draft/2020-12/schema"), { invalid: docs.filter((d) => d.doc.$schema !== "https://json-schema.org/draft/2020-12/schema").map((d) => d.file) });
  add("SCHEMA-id-unique", "schemas", new Set(idsSchema).size === idsSchema.length, { duplicates: idsSchema.filter((x, i) => idsSchema.indexOf(x) !== i) });
  const registro = createSchemaRegistry(docs.map((d) => d.doc));
  const naoResolvidos = docs.flatMap((d) => refs(d.doc).filter((r) => validateSchema({ $ref: r.startsWith("#") ? `${d.doc.$id}${r}` : r }, null, registro).some((e) => e.keyword === "$ref")).map((r) => `${d.file} → ${r}`));
  add("SCHEMA-ref-resolution", "schemas", naoResolvidos.length === 0, { unresolved: naoResolvidos, schemas: docs.length });
  const novos = docs.filter((d) => d.file.startsWith("schemas/ai-model-harness/") || d.file === "schemas/common-definitions-1.1.schema.json");
  const kw = novos.flatMap((d) => unsupportedKeywords(d.doc).map((k) => `${d.file}:${k}`));
  add("SCHEMA-cr026-executable-keywords", "schemas", kw.length === 0, { unsupported: kw });
  // common-definitions: 1.0 permanece publicado exatamente como na 2.15; 1.1 é superconjunto com as definições do CR-026.
  const cd10 = docs.find((d) => d.file === "schemas/common-definitions.schema.json")!.doc;
  const cd11 = docs.find((d) => d.file === "schemas/common-definitions-1.1.schema.json")!.doc;
  const base10 = ler("contract-registry-manifest-v2.15.json").artifacts.find((a: Json) => a.path === `${CONTRACTS_DIR}/schemas/common-definitions.schema.json`)?.sha256;
  const superconjunto = Object.entries(cd10.$defs).every(([k, v]) => JSON.stringify(cd11.$defs[k]) === JSON.stringify(v));
  const novasDefs = ["dataClassification", "nonNegativeSafeInteger", "identifierLimits", "traceContext", "classificationSourceRef", "requestFingerprint", "attemptCallId"];
  add("SCHEMA-common-definitions-1.1", "schemas",
    cd10.$id.endsWith("/common-definitions/1.0") && cd11.$id.endsWith("/common-definitions/1.1") && superconjunto &&
    novasDefs.every((d) => d in cd11.$defs && !(d in cd10.$defs)) && sha256File(root, `${CONTRACTS_DIR}/schemas/common-definitions.schema.json`) === base10,
    { from: "1.0", to: "1.1", v10UnchangedFromRelease215: true, definitionsAdded: novasDefs });
  const referencia10 = docs.filter((d) => (d.file.startsWith("schemas/ai-model-harness/") || d.file === "schemas/context-package.schema.json") && JSON.stringify(d.doc).includes("common-definitions/1.0")).map((d) => d.file);
  add("SCHEMA-release-2.16-refs-common-1.1", "schemas", referencia10.length === 0, { referencingOldVersion: referencia10 });
  const cp = docs.find((d) => d.file === "schemas/context-package.schema.json")!.doc;
  add("SCHEMA-context-package-1.1", "schemas", cp.$id.endsWith("/context-package/1.1") && !cp.required.includes("dataClassification") && !!cp.properties.dataClassification, { id: cp.$id });

  // CR-027: Model Profile Schema 1.0 preservado, 1.1 com timeoutMs limitado, schemas do Ledger
  const v216 = ler("contract-registry-manifest-v2.16.json");
  const hash216 = (rel: string) => v216.artifacts.find((a: Json) => a.path === `${CONTRACTS_DIR}/${rel}`)?.sha256;
  const mp10 = docs.find((d) => d.file === "schemas/ai-model-harness/model-profile.schema.json")!.doc;
  const mp11 = docs.find((d) => d.file === "schemas/ai-model-harness/model-profile-1.1.schema.json")!.doc;
  add("SCHEMA-model-profile-1.0-unchanged", "schemas",
    mp10.$id === "https://schemas.oplyra.com/ai-model-harness/model-profile/1.0" &&
    sha256File(root, `${CONTRACTS_DIR}/schemas/ai-model-harness/model-profile.schema.json`) === hash216("schemas/ai-model-harness/model-profile.schema.json"),
    { id: mp10.$id, unchangedFromRelease216: true });
  const semVersao = (d: Json) => { const c = structuredClone(d); delete c.$id; delete c.title; delete c.description; return c; };
  const mp10ComTeto = semVersao(mp10); mp10ComTeto.properties.limits.properties.timeoutMs.maximum = 840_000;
  add("SCHEMA-model-profile-1.1", "schemas",
    mp11.$id === "https://schemas.oplyra.com/ai-model-harness/model-profile/1.1" &&
    mp11.properties.limits.properties.timeoutMs.maximum === 840_000 &&
    JSON.stringify(semVersao(mp11)) === JSON.stringify(mp10ComTeto) &&
    JSON.stringify(mp11).includes("common-definitions/1.1") && !JSON.stringify(mp11).includes("common-definitions/1.0"),
    { id: mp11.$id, timeoutMsMaximum: mp11.properties.limits.properties.timeoutMs.maximum, identicalExceptTimeoutMs: true });
  const regPerfis = regs["model-profiles"];
  add("PROFILE-registry-entry-schema-1.1", "model_profiles",
    regPerfis.rules.entrySchema === "../schemas/ai-model-harness/model-profile-1.1.schema.json", { entrySchema: regPerfis.rules.entrySchema });
  const leases = perfis.map((p) => { try { return leaseSecondsFor(p.limits.timeoutMs); } catch { return null; } });
  const foraDo11 = perfis.filter((p) => validateSchema(mp11, p, registro).length > 0).map((p) => `${p.profileId}@${p.version}`);
  add("PROFILE-entries-valid-schema-1.1", "model_profiles", foraDo11.length === 0 && leases.every((l) => l !== null && l >= 60 && l <= 900),
    { invalid: foraDo11, derivedLeaseSeconds: leases });
  const ledger = ["budget-period", "cost-ledger-entry", "model-attempt"].map((n) => docs.find((d) => d.file === `schemas/ai-model-harness/${n}.schema.json`)?.doc);
  add("SCHEMA-cr027-ledger-schemas", "schemas",
    ledger.every((d, i) => d && d.$id === `https://schemas.oplyra.com/ai-model-harness/${["budget-period", "cost-ledger-entry", "model-attempt"][i]}/1.0` &&
      !JSON.stringify(d).includes("common-definitions/1.0")),
    { schemas: ledger.map((d) => d?.$id ?? null) });
  const relatoriosCr027 = CR027_SCHEMAS.map((n) => `schemas/ai-model-harness/${n}.validation.json`);
  const relatoriosOk = relatoriosCr027.filter((f) => { try { const r = ler(f); return r.status === "passed" && r.schema === `${f.split("/").pop()!.replace(".validation.json", "")}.schema.json`; } catch { return false; } });
  for (const f of relatoriosCr027) { try { entrada(f); } catch { /* ausência já falha o check */ } }
  add("REPORT-cr027-schema-validations", "supporting_artifacts", relatoriosOk.length === relatoriosCr027.length, { present: relatoriosOk.length, expected: relatoriosCr027.length });

  // CR-027: migrations do Ledger (verificação estática; a execução é coberta por pgTAP e integração)
  const sqls = CR027_MIGRATIONS.map((m) => { inputs.push({ path: m, sha256: sha256File(root, m), evidenceLevel: "direct" }); return readFileSync(join(root, m), "utf8"); });
  const tabelas = ["budget_periods", "model_attempts", "model_call_records", "cost_ledger_entries"];
  const rlsForcada = tabelas.filter((t) => new RegExp(`alter table finops\\.${t}\\s+force\\s+row level security`).test(sqls[0]!));
  const semGrantTabela = !/grant\s+(select|insert|update|delete|all)[^;]*on\s+(table\s+)?finops\./i.test(sqls.join("\n"));
  const revogadas = LEDGER_FUNCTIONS.filter((f) => new RegExp(`revoke all on function app\\.${f}\\([^)]*\\) from public;`).test(sqls[1]!));
  const definer = LEDGER_FUNCTIONS.filter((f) => new RegExp(`function app\\.${f}\\([\\s\\S]*?security definer\\s+set search_path = pg_catalog, pg_temp`).test(sqls[1]!));
  add("DATABASE-cr027-ledger-migrations", "database",
    rlsForcada.length === tabelas.length && semGrantTabela && revogadas.length === LEDGER_FUNCTIONS.length && definer.length === LEDGER_FUNCTIONS.length,
    { forcedRls: rlsForcada.length, tableGrants: semGrantTabela ? 0 : "found", revokedFromPublic: revogadas.length, securityDefinerWithFixedSearchPath: definer.length });

  // Manifest de integração
  const sim = ler("schema-integration-manifest.json");
  entrada("schema-integration-manifest.json");
  const faltando = sim.schemas.filter((s: Json) => !docs.some((d) => d.file === `schemas/${s.file}`)).map((s: Json) => s.file);
  const idDivergente = sim.schemas.filter((s: Json) => docs.find((d) => d.file === `schemas/${s.file}`)?.doc.$id !== s.id).map((s: Json) => s.file);
  add("MANIFEST-files", "schema_manifest", faltando.length === 0, { missing: faltando });
  add("MANIFEST-ids", "schema_manifest", idDivergente.length === 0, { mismatched: idDivergente });

  // Fixtures dos schemas novos
  const esquemas = Object.fromEntries(HARNESS_SCHEMAS.map((n) => [n, docs.find((d) => d.file === `schemas/ai-model-harness/${n}.schema.json`)!.doc]));
  const periodosCanonicos = readdirSync(join(C, "fixtures/valid")).filter((f) => schemaDaFixture(f) === "budget-period").map((f) => ler(`fixtures/valid/${f}`));
  const runtime = (n: string, f: Json, arq: string): unknown[] => {
    if (n === "budget-period") return budgetPeriodInvariants(f, periodosCanonicos);
    if (n === "cost-ledger-entry") return costLedgerEntryInvariants(f);
    if (n === "model-attempt") return modelAttemptInvariants(f);
    if (n === "model-invocation-request") return validateInvocationRequest(f);
    if (n === "provider-response") { const v = f.output?.modality === "visual" || arq.includes("visual"); return validateProviderResult(f, { maxOutputTokens: 1024, requestedImages: v ? 2 : 0, imageRoute: v }); }
    if (n === "model-registry-entry") return validateModelRegistry({ registryVersion: "x", models: [f as never] });
    if (n === "model-profile" || n === "model-profile-1.1") return validateModelProfiles([f as never], LOCAL_TEST_MODEL_REGISTRY, catalogo);
    return recordInvariants(f);
  };
  for (const n of HARNESS_SCHEMAS) {
    const val = readdirSync(join(C, "fixtures/valid")).filter((f) => schemaDaFixture(f) === n).sort();
    const inv = readdirSync(join(C, "fixtures/invalid")).filter((f) => schemaDaFixture(f) === n).sort();
    for (const f of [...val.map((v) => `fixtures/valid/${v}`), ...inv.map((v) => `fixtures/invalid/${v}`)]) entrada(f);
    const falhas: string[] = [];
    for (const f of val) { const d = ler(`fixtures/valid/${f}`); if (validateSchema(esquemas[n]!, d, registro).length || runtime(n, d, f).length) falhas.push(f); }
    for (const f of inv) {
      const d = ler(`fixtures/invalid/${f}`);
      const e = validateSchema(esquemas[n]!, d, registro).length;
      if (f.includes("business-invariant")) { if (e || (!HARNESS_DEPENDENT.has(f) && runtime(n, d, f).length === 0)) falhas.push(f); }
      else if (e === 0) falhas.push(f);
    }
    add(`FIXTURE-${n}`, "fixtures", val.length > 0 && inv.length > 0 && falhas.length === 0, { valid: val.length, invalid: inv.length, unexpected: falhas });
  }

  // Relatórios derivados
  const ev = ler("registries/errors.validation.json");
  const emUso = [...new Set(erros.map((e) => e.category))].sort();
  add("REPORT-errors-validation", "supporting_artifacts", ev.registryVersion === regs.errors.registryVersion && ev.canonicalErrors === erros.length && JSON.stringify([...ev.categories].sort()) === JSON.stringify(emUso) && ev.validation.status === "passed", { canonicalErrors: ev.canonicalErrors });
  const mv = ler("registries/model-profiles.validation.json");
  add("REPORT-model-profiles-validation", "supporting_artifacts", mv.registryVersion === regs["model-profiles"].registryVersion && mv.canonicalProfiles === perfis.length && mv.validation.status === "passed", { canonicalProfiles: mv.canonicalProfiles });
  for (const f of ["registries/errors.validation.json", "registries/model-profiles.validation.json"]) entrada(f);

  // Registries não alterados pelo CR-026 nem pelo CR-027
  const v215 = ler("contract-registry-manifest-v2.15.json");
  const alterados = UNCHANGED_SINCE_2_15.filter((n) => v215.artifacts.find((a: Json) => a.path === `${CONTRACTS_DIR}/registries/${n}.json`)?.sha256 !== sha256File(root, `${CONTRACTS_DIR}/registries/${n}.json`));
  add("FROZEN-registries-unchanged", "freeze", alterados.length === 0, { changed: alterados });

  counts.schemas = docs.length;
  counts.errorCategoriesInUse = emUso.length;
  return { checks, counts, inputs };
}
