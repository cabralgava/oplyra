// Cross-registry validation executável da Contract Registry Release 2.16.
// Reproduz as categorias da validação do Freeze v1 (envelope, identidade,
// contagem, nomenclatura, referências, schemas, manifest de integração) e
// acrescenta as verificações do CR-026 (Error Registry 1.4, Model Profiles,
// mapeamento de erros do harness, fixtures e relatórios derivados).
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createSchemaRegistry, unsupportedKeywords, validateSchema } from "./json-schema-subset.ts";
import {
  attemptCallId, HARNESS_FAILURE_CONTRACT, validateInvocationRequest, validateModelProfiles, validateModelRegistry,
  validateProviderResult,
} from "../../packages/core/src/index.ts";
import type { AgentActionCatalog } from "../../packages/core/src/index.ts";
import { LOCAL_TEST_MODEL_REGISTRY } from "../../packages/infra/src/ai-model-harness/local-test-catalog.ts";

export type Check = { id: string; category: string; status: "passed" | "failed"; details: Record<string, unknown> };
type Json = Record<string, any>;

export const CONTRACTS_DIR = "docs/product/marketing-ops/contracts";
export const REGISTRY_NAMES = ["agents", "permissions", "tools", "actions", "events", "errors", "handoffs", "quality-gates", "model-profiles"] as const;
type RegistryName = (typeof REGISTRY_NAMES)[number];

/** Contagem esperada: Release 2.15 mais o delta declarado pelo CR-026 (+12 erros, +3 perfis no registry novo). */
export const EXPECTED_COUNTS: Record<RegistryName, number> = {
  agents: 12, permissions: 6, tools: 58, actions: 171, events: 137, errors: 58, handoffs: 43, "quality-gates": 11, "model-profiles": 3,
};
const EXPECTED_VERSIONS: Record<RegistryName, string> = {
  agents: "1.0", permissions: "1.0", tools: "1.0", actions: "2.0", events: "1.2", errors: "1.4", handoffs: "1.0", "quality-gates": "1.0", "model-profiles": "1.0",
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
const HARNESS_SCHEMAS = ["model-invocation-request", "provider-response", "model-registry-entry", "model-profile", "model-call-record"] as const;
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

  // Manifest de integração
  const sim = ler("schema-integration-manifest.json");
  entrada("schema-integration-manifest.json");
  const faltando = sim.schemas.filter((s: Json) => !docs.some((d) => d.file === `schemas/${s.file}`)).map((s: Json) => s.file);
  const idDivergente = sim.schemas.filter((s: Json) => docs.find((d) => d.file === `schemas/${s.file}`)?.doc.$id !== s.id).map((s: Json) => s.file);
  add("MANIFEST-files", "schema_manifest", faltando.length === 0, { missing: faltando });
  add("MANIFEST-ids", "schema_manifest", idDivergente.length === 0, { mismatched: idDivergente });

  // Fixtures dos schemas novos
  const esquemas = Object.fromEntries(HARNESS_SCHEMAS.map((n) => [n, docs.find((d) => d.file === `schemas/ai-model-harness/${n}.schema.json`)!.doc]));
  const runtime = (n: string, f: Json, arq: string): unknown[] => {
    if (n === "model-invocation-request") return validateInvocationRequest(f);
    if (n === "provider-response") { const v = f.output?.modality === "visual" || arq.includes("visual"); return validateProviderResult(f, { maxOutputTokens: 1024, requestedImages: v ? 2 : 0, imageRoute: v }); }
    if (n === "model-registry-entry") return validateModelRegistry({ registryVersion: "x", models: [f as never] });
    if (n === "model-profile") return validateModelProfiles([f as never], LOCAL_TEST_MODEL_REGISTRY, catalogo);
    return recordInvariants(f);
  };
  for (const n of HARNESS_SCHEMAS) {
    const val = readdirSync(join(C, "fixtures/valid")).filter((f) => f.startsWith(n)).sort();
    const inv = readdirSync(join(C, "fixtures/invalid")).filter((f) => f.startsWith(n)).sort();
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

  // Registries não alterados pelo CR-026
  const v215 = ler("contract-registry-manifest-v2.15.json");
  const alterados = UNCHANGED_SINCE_2_15.filter((n) => v215.artifacts.find((a: Json) => a.path === `${CONTRACTS_DIR}/registries/${n}.json`)?.sha256 !== sha256File(root, `${CONTRACTS_DIR}/registries/${n}.json`));
  add("FROZEN-registries-unchanged", "freeze", alterados.length === 0, { changed: alterados });

  counts.schemas = docs.length;
  counts.errorCategoriesInUse = emUso.length;
  return { checks, counts, inputs };
}
