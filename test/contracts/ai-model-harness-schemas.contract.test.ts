// Contratos canônicos do AI Model Harness (CR-026, Release 2.16): schemas,
// fixtures válidas e inválidas, registry de Model Profiles e catálogo
// operacional. Fixture `-business-invariant` é aceita pelo schema e recusada
// pela invariante de runtime correspondente.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSchemaRegistry, unsupportedKeywords, validateSchema } from "./json-schema-subset.ts";
import {
  attemptCallId, validateInvocationRequest, validateModelProfiles, validateModelRegistry, validateProviderResult,
} from "../../packages/core/src/index.ts";
import type { ModelInvocationRequest, ModelProfile } from "../../packages/core/src/index.ts";
import {
  InMemoryBudgetGuard, InMemoryDataClassifier, InMemoryModelCallRecorder, SetAiEntitlements, steppingClock,
} from "../../packages/testing/src/index.ts";
import { createLocalModelHarness } from "../../packages/infra/src/ai-model-harness/local-composition.ts";
import { HmacRequestFingerprinter } from "../../packages/infra/src/ai-model-harness/hmac-fingerprint.ts";
import { loadFrozenAgentActionCatalog } from "../../packages/infra/src/ai-model-harness/frozen-registry-catalog.ts";
import { LOCAL_TEST_MODEL_REGISTRY } from "../../packages/infra/src/ai-model-harness/local-test-catalog.ts";
import { loadModelProfileRegistry } from "../../packages/infra/src/ai-model-harness/model-profile-registry.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const C = join(ROOT, "docs/product/marketing-ops/contracts");
const ler = (p: string): Record<string, any> => JSON.parse(readFileSync(join(C, p), "utf8"));

const common10 = ler("schemas/common-definitions.schema.json");
const common = ler("schemas/common-definitions-1.1.schema.json");
const contextPackage = ler("schemas/context-package.schema.json");
const NOMES = ["model-invocation-request", "provider-response", "model-registry-entry", "model-profile", "model-call-record"] as const;
const harness = Object.fromEntries(NOMES.map((n) => [n, ler(`schemas/ai-model-harness/${n}.schema.json`)])) as Record<(typeof NOMES)[number], Record<string, any>>;
const registro = createSchemaRegistry([common10, common, contextPackage, ...Object.values(harness)]);

const TA = "11111111-1111-4111-8111-111111111111";
const TB = "22222222-2222-4222-8222-222222222222";
const catalogo = loadFrozenAgentActionCatalog();

/** Prefixo do nome da fixture → schema. */
const SCHEMA_DA_FIXTURE: [string, Record<string, any>][] = [
  ["model-invocation-request", harness["model-invocation-request"]],
  ["provider-response", harness["provider-response"]],
  ["model-registry-entry", harness["model-registry-entry"]],
  ["model-profile", harness["model-profile"]],
  ["model-call-record", harness["model-call-record"]],
  ["context-package-copywriting-classified", contextPackage],
  ["context-package-invalid-data-classification", contextPackage],
];
const schemaDe = (arquivo: string) => SCHEMA_DA_FIXTURE.find(([p]) => arquivo.startsWith(p))?.[1];
const fixtures = (tipo: "valid" | "invalid") => readdirSync(join(C, "fixtures", tipo))
  .filter((f) => schemaDe(f) && (f.startsWith("model-") || f.startsWith("provider-") || f.includes("classif")))
  .map((f) => ({ arquivo: f, conteudo: ler(`fixtures/${tipo}/${f}`) }));

function invariantesDoRegistro(r: Record<string, any>): string[] {
  const p: string[] = [];
  if (r.outcome === "succeeded" && r.failureKind !== null) p.push("succeeded exige failureKind null");
  if (r.outcome === "failed" && r.failureKind === null) p.push("failed exige failureKind");
  if (r.costStatus === "settled" && r.costMicroUsd === null) p.push("settled exige custo");
  if (r.costStatus === "pending_reconciliation" && r.costMicroUsd !== null) p.push("pendente exige custo null");
  if (r.outputAssetIds !== null && r.outcome !== "succeeded") p.push("assets só em sucesso");
  if (r.classificationProvenance.some((x: { tenantId: string }) => x.tenantId !== r.tenantId)) p.push("proveniência de outro tenant");
  if (r.callId !== attemptCallId(r.tenantId, r.actionKey, r.invocationId, r.attempt)) p.push("callId fora do escopo do registro");
  return p;
}

function invariantesDeRuntime(arquivo: string, f: Record<string, any>): string[] {
  if (arquivo.startsWith("model-invocation-request")) return validateInvocationRequest(f);
  if (arquivo.startsWith("provider-response")) {
    const visual = f.output?.modality === "visual" || arquivo.includes("visual");
    return validateProviderResult(f, { maxOutputTokens: 1_024, requestedImages: visual ? 2 : 0, imageRoute: visual });
  }
  if (arquivo.startsWith("model-registry-entry")) return validateModelRegistry({ registryVersion: "fixture", models: [f as never] }).map((i) => i.problem);
  if (arquivo.startsWith("model-profile")) return validateModelProfiles([f as ModelProfile], LOCAL_TEST_MODEL_REGISTRY, catalogo).map((i) => i.problem);
  if (arquivo.startsWith("model-call-record")) return invariantesDoRegistro(f);
  return [];
}

/** Harness local com Test Adapter, chave sintética explícita e fonte de classificação sintética. */
function harnessLocal() {
  const classifier = new InMemoryDataClassifier()
    .register(TA, { kind: "context_package", ref: "ctx-fixture-1" }, "synthetic")
    .register(TB, { kind: "context_package", ref: "ctx-fixture-1" }, "synthetic");
  const recorder = new InMemoryModelCallRecorder();
  const h = createLocalModelHarness({
    budget: new InMemoryBudgetGuard({ tenants: { [TA]: 100_000, [TB]: 100_000 } }), recorder,
    entitlements: new SetAiEntitlements(), classifier, clock: steppingClock(),
    fingerprints: new HmacRequestFingerprinter({ active: { keyId: "synthetic-contract-v1", secret: new TextEncoder().encode("oplyra-synthetic-contract-fingerprint-key-not-a-secret") } }),
  });
  return { h, recorder };
}

describe("schemas do AI Model Harness", () => {
  it("usam apenas keywords suportadas pelo validador executável", () => {
    for (const s of [common, ...Object.values(harness)]) expect(unsupportedKeywords(s)).toEqual([]);
  });

  it("Context Package 1.1 não introduz keyword nova fora do subconjunto; o campo novo é totalmente executável", () => {
    // Conjunto herdado do Freeze v1, validado então por outro validador; o subconjunto os ignora.
    expect(unsupportedKeywords(contextPackage)).toEqual(["allOf", "anyOf", "contains", "default", "if", "minContains", "oneOf", "propertyNames", "then"]);
    expect(unsupportedKeywords(contextPackage.properties.dataClassification)).toEqual([]);
    expect(contextPackage.required).not.toContain("dataClassification");
  });

  it("têm $id versionado e draft 2020-12", () => {
    for (const n of NOMES) {
      expect(harness[n].$id).toBe(`https://schemas.oplyra.com/ai-model-harness/${n}/1.0`);
      expect(harness[n].$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    }
    expect(contextPackage.$id).toBe("https://schemas.oplyra.com/core/context-package/1.1");
    expect(ler("schema-integration-manifest.json").schemas.find((s: { file: string }) => s.file === "context-package.schema.json").id).toBe(contextPackage.$id);
  });

  it("common-definitions: 1.0 publicado sem mudança; 1.1 é superconjunto compatível com as definições novas", () => {
    expect(common10.$id).toBe("https://schemas.oplyra.com/core/common-definitions/1.0");
    expect(common.$id).toBe("https://schemas.oplyra.com/core/common-definitions/1.1");
    for (const [k, v] of Object.entries(common10.$defs)) expect(common.$defs[k], k).toEqual(v);
    for (const d of ["dataClassification", "nonNegativeSafeInteger", "identifierLimits", "traceContext", "classificationSourceRef", "requestFingerprint", "attemptCallId"]) {
      expect(common10.$defs[d], `${d} não pode ser publicado sob 1.0`).toBeUndefined();
    }
    const manifesto = ler("schema-integration-manifest.json").schemas;
    expect(manifesto).toContainEqual({ file: "common-definitions.schema.json", id: common10.$id, role: "shared_definitions" });
    expect(manifesto).toContainEqual({ file: "common-definitions-1.1.schema.json", id: common.$id, role: "shared_definitions" });
  });

  it("schemas da Release 2.16 referenciam somente common-definitions 1.1", () => {
    for (const s of [contextPackage, ...Object.values(harness)]) {
      expect(JSON.stringify(s)).not.toContain("common-definitions/1.0");
    }
  });

  it("definições compartilhadas aprovadas existem em common-definitions 1.1", () => {
    for (const d of ["dataClassification", "nonNegativeSafeInteger", "identifierLimits", "traceContext", "classificationSourceRef", "requestFingerprint", "attemptCallId"]) {
      expect(common.$defs[d], d).toBeDefined();
    }
    expect(Object.keys(common.$defs.identifierLimits.$defs).sort()).toEqual(["actionKey", "agentKey", "attempt", "invocationId", "tenantId", "traceField", "wellFormedText", "workflowKey"]);
  });

  it("maxLength de attemptCallId cobre o pior caso sob identifierLimits", () => {
    const controle = "\u0001";
    const pior = attemptCallId(controle.repeat(128), "a".repeat(64), controle.repeat(255), 5);
    expect(pior.length).toBe(common.$defs.attemptCallId.maxLength);
    expect(validateSchema({ $ref: "https://schemas.oplyra.com/core/common-definitions/1.1#/$defs/attemptCallId" }, pior, registro)).toEqual([]);
  });

  it("Context Package 1.1 aceita documento sem o campo novo (compatível)", () => {
    expect(validateSchema(contextPackage, ler("fixtures/valid/context-package-copywriting.json"), registro)).toEqual([]);
  });
});

describe("fixtures válidas", () => {
  const validas = fixtures("valid");
  it("existem para cada schema novo e para o Context Package 1.1", () => {
    for (const [prefixo] of SCHEMA_DA_FIXTURE.filter(([p]) => !p.includes("invalid"))) {
      expect(validas.some((v) => v.arquivo.startsWith(prefixo)), prefixo).toBe(true);
    }
  });
  it.each(validas.map((v) => [v.arquivo, v.conteudo] as const))("%s: aceita pelo schema e pelo runtime", (arquivo, f) => {
    expect(validateSchema(schemaDe(arquivo)!, f, registro)).toEqual([]);
    expect(invariantesDeRuntime(arquivo, f)).toEqual([]);
  });
});

describe("fixtures inválidas", () => {
  const invalidas = fixtures("invalid");
  const schemaLevel = invalidas.filter((i) => !i.arquivo.includes("business-invariant"));
  const negocio = invalidas.filter((i) => i.arquivo.includes("business-invariant"));

  it("cobrem as categorias exigidas", () => {
    const nomes = invalidas.map((i) => i.arquivo).join(" ");
    for (const t of ["negative", "decimal", "above-safe-integer", "lone-surrogate", "too-many-messages", "above-byte-limit", "unkeyed-fingerprint", "raw-call-id", "inline-binary", "data-url", "idempotency-conflict", "other-tenant", "zero-assets", "above-requested"]) {
      expect(nomes, t).toContain(t);
    }
  });

  /** Keyword que cada fixture inválida precisa violar: falha pelo motivo certo, não por acidente. */
  const MOTIVO: Record<string, string> = {
    "model-invocation-request-negative-hint.json": "minimum",
    "model-invocation-request-decimal-requested-images.json": "type",
    "model-invocation-request-invocation-id-too-long.json": "maxLength",
    "model-invocation-request-too-many-messages.json": "maxItems",
    "model-invocation-request-selects-model.json": "additionalProperties",
    "model-invocation-request-lone-surrogate-invocation-id.json": "pattern",
    "model-invocation-request-lone-surrogate-message.json": "pattern",
    "provider-response-negative-usage.json": "minimum",
    "provider-response-decimal-reported-cost.json": "type",
    "provider-response-reported-cost-above-safe-integer.json": "maximum",
    "provider-response-unknown-error-kind.json": "enum",
    "provider-response-visual-inline-binary.json": "additionalProperties",
    "provider-response-visual-data-url.json": "pattern",
    "provider-response-visual-zero-assets.json": "minItems",
    "model-registry-entry-negative-tariff.json": "minimum",
    "model-registry-entry-decimal-tariff.json": "type",
    "model-profile-temperature-above-range.json": "maximum",
    "model-profile-max-attempts-above-limit.json": "maximum",
    "model-call-record-unkeyed-fingerprint.json": "pattern",
    "model-call-record-raw-call-id.json": "pattern",
    "model-call-record-lone-surrogate-tenant.json": "pattern",
    "context-package-invalid-data-classification.json": "enum",
  };
  it("toda fixture inválida de schema tem motivo declarado", () => {
    expect(schemaLevel.map((i) => i.arquivo).sort()).toEqual(Object.keys(MOTIVO).sort());
  });
  it.each(schemaLevel.map((i) => [i.arquivo, i.conteudo] as const))("%s: recusada pelo schema pelo motivo declarado", (arquivo, f) => {
    const erros = validateSchema(schemaDe(arquivo)!, f, registro);
    expect(erros.map((e) => e.keyword)).toContain(MOTIVO[arquivo]);
  });

  const harnessDependentes = new Set([
    "model-invocation-request-classification-downgrade-business-invariant.json",
    "model-invocation-request-idempotency-conflict-business-invariant.json",
  ]);
  it.each(negocio.filter((i) => !harnessDependentes.has(i.arquivo)).map((i) => [i.arquivo, i.conteudo] as const))(
    "%s: aceita pelo schema, recusada pela invariante de runtime", (arquivo, f) => {
      expect(validateSchema(schemaDe(arquivo)!, f, registro)).toEqual([]);
      expect(invariantesDeRuntime(arquivo, f).length).toBeGreaterThan(0);
    });

  it("downgrade de classificação: aceito pelo schema, MODEL_INVOCATION_INVALID no harness", async () => {
    const f = ler("fixtures/invalid/model-invocation-request-classification-downgrade-business-invariant.json");
    expect(validateSchema(harness["model-invocation-request"], f, registro)).toEqual([]);
    const { h, recorder } = harnessLocal();
    const r = await h.invoke(f as ModelInvocationRequest);
    expect(!r.ok && r.failure.contract).toEqual({ registered: true, code: "MODEL_INVOCATION_INVALID" });
    expect(recorder.records).toHaveLength(0);
  });

  it("conflito de idempotência: mesma chave e action, material diferente → IDEMPOTENCY_CONFLICT sem nova chamada", async () => {
    const original = ler("fixtures/valid/model-invocation-request.json") as ModelInvocationRequest;
    const conflito = ler("fixtures/invalid/model-invocation-request-idempotency-conflict-business-invariant.json") as ModelInvocationRequest;
    expect(validateSchema(harness["model-invocation-request"], conflito, registro)).toEqual([]);
    expect(conflito.invocationId).toBe(original.invocationId);
    const { h } = harnessLocal();
    expect((await h.invoke(original)).ok).toBe(true);
    const r = await h.invoke(conflito);
    expect(!r.ok && r.failure.contract).toEqual({ registered: true, code: "IDEMPOTENCY_CONFLICT" });
    expect(h.testAdapter.calls).toHaveLength(1);
  });

  it("mesma chave em outro tenant não conflita (isolamento)", async () => {
    const original = ler("fixtures/valid/model-invocation-request.json") as ModelInvocationRequest;
    const { h } = harnessLocal();
    await h.invoke(original);
    expect((await h.invoke({ ...original, tenantId: TB, messages: [{ role: "user", content: "outro tenant" }] })).ok).toBe(true);
  });
});

describe("registry canônico de Model Profiles", () => {
  const reg = ler("registries/model-profiles.json");

  it("envelope segue o precedente dos registries", () => {
    expect(reg).toMatchObject({ registry: "oplyra-model-profiles", registryVersion: "1.0", schemaVersion: "1.0", status: "active" });
    expect(reg.rules.atMostOneActiveProfilePerAgentAction).toBe(true);
    expect(reg.rules.modelCatalogTariffsAndAvailabilityOutsideFreeze).toBe(true);
  });

  it("cada entrada valida contra o schema e o vínculo agent + action contra os registries congelados", () => {
    for (const e of reg.entries) {
      expect(validateSchema(harness["model-profile"], e, registro), e.profileId).toEqual([]);
      expect(catalogo.hasAgent(e.agentKey) && catalogo.hasAction(e.actionKey) && catalogo.canAgentCallAction(e.agentKey, e.actionKey), e.profileId).toBe(true);
    }
    expect(validateModelProfiles(reg.entries, LOCAL_TEST_MODEL_REGISTRY, catalogo)).toEqual([]);
  });

  it("no máximo um perfil ativo por agent + action e versões únicas", () => {
    const ativos = reg.entries.filter((e: ModelProfile) => e.status === "active").map((e: ModelProfile) => `${e.agentKey}::${e.actionKey}`);
    expect(new Set(ativos).size).toBe(ativos.length);
    const refs = reg.entries.map((e: ModelProfile) => `${e.profileId}@${e.version}`);
    expect(new Set(refs).size).toBe(refs.length);
  });

  it("o loader devolve exatamente as entradas canônicas", () => {
    expect(loadModelProfileRegistry().entries).toEqual(reg.entries);
  });

  it("catálogo operacional local valida contra model-registry-entry e continua fora do freeze", () => {
    for (const m of LOCAL_TEST_MODEL_REGISTRY.models) expect(validateSchema(harness["model-registry-entry"], m, registro), m.modelId).toEqual([]);
    expect(validateModelRegistry(LOCAL_TEST_MODEL_REGISTRY)).toEqual([]);
  });
});
