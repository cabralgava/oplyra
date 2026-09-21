import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSchemaRegistry, unsupportedKeywords, validateSchema } from "./json-schema-subset.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const readJson = (path: string): Record<string, any> => JSON.parse(readFileSync(join(ROOT, path), "utf8"));
const readText = (path: string): string => readFileSync(join(ROOT, path), "utf8");
const schema = readJson("docs/product/marketing-ops/contracts/schemas/runtime/production-environment-plan.schema.json");
const plan = readJson("docs/product/marketing-ops/contracts/fixtures/valid/production-environment-plan-v1.json");
const registry = createSchemaRegistry([schema]);

describe("staging and production environment plan", () => {
  it("usa keywords suportadas e aceita o plano canônico", () => {
    expect(unsupportedKeywords(schema)).toEqual([]);
    expect(validateSchema(schema, plan, registry)).toEqual([]);
  });

  it("aprova somente planejamento", () => {
    expect(plan.authorization).toEqual({
      planningApproved: true,
      provisioningAuthorized: false,
      deploymentAuthorized: false,
      realDataAuthorized: false,
      runtimeActivationAuthorized: false,
      explicitApprovalRequiredForCreation: true,
    });
    for (const fixture of ["production-environment-plan-provision-authorized.json", "production-environment-plan-runtime-activated.json"]) {
      expect(validateSchema(schema, readJson(`docs/product/marketing-ops/contracts/fixtures/invalid/${fixture}`), registry))
        .toContainEqual(expect.objectContaining({ keyword: "const" }));
    }
  });

  it("registra staging e produção como não criados", () => {
    expect(plan.environments.staging).toMatchObject({ state: "planned_not_created", decisionDependency: "DP-28b", dataPolicy: "synthetic_only" });
    expect(plan.environments.production).toMatchObject({ state: "planned_not_created", runtimeStartsDisabled: true });
    const invalid = readJson("docs/product/marketing-ops/contracts/fixtures/invalid/production-environment-plan-production-created.json");
    expect(validateSchema(schema, invalid, registry)).toContainEqual(expect.objectContaining({ path: "$.environments.production.state", keyword: "const" }));
  });

  it("impõe isolamento integral entre ambientes", () => {
    expect(plan.isolation).toEqual({
      separateDatabaseProjects: true,
      separateCredentials: true,
      separateSecrets: true,
      separateQueues: true,
      crossEnvironmentDataCopyAllowed: false,
      productionFallbackFromPreviewAllowed: false,
    });
    const invalid = readJson("docs/product/marketing-ops/contracts/fixtures/invalid/production-environment-plan-shared-secrets.json");
    expect(validateSchema(schema, invalid, registry)).toContainEqual(expect.objectContaining({ path: "$.isolation.separateSecrets", keyword: "const" }));
  });

  it("mantém todos os destinos como propostas condicionadas ou pendentes", () => {
    expect(plan.destinations).toHaveLength(6);
    expect(plan.destinations.every((item: Record<string, unknown>) => ["proposed_conditioned", "pending_selection"].includes(String(item.status)))).toBe(true);
    expect(plan.destinations.find((item: Record<string, unknown>) => item.component === "observability")).toMatchObject({ proposedProvider: null, status: "pending_selection", decisionDependency: "DP-15b" });
    expect(plan.destinations.find((item: Record<string, unknown>) => item.component === "transactional_email")).toMatchObject({ proposedProvider: null, status: "pending_selection", decisionDependency: "DP-08a" });
  });

  it("não presume PITR e exige restore antes de dados reais", () => {
    expect(plan.database).toMatchObject({
      migrationsOnly: true,
      manualProductionChangesAllowed: false,
      expandContractRequired: true,
      rlsRequired: true,
      directTableAccessForWorkers: false,
      backupCapabilityMustBeVerified: true,
      restoreExerciseRequiredBeforeRealData: true,
      pitrAssumedAvailable: false,
    });
    const invalid = readJson("docs/product/marketing-ops/contracts/fixtures/invalid/production-environment-plan-assumes-pitr.json");
    expect(validateSchema(schema, invalid, registry)).toContainEqual(expect.objectContaining({ path: "$.database.pitrAssumedAvailable", keyword: "const" }));
  });

  it("ordena criação e ativação como autorizações separadas", () => {
    expect(plan.releaseSequence[0]).toBe("approve_destinations_and_budget");
    expect(plan.releaseSequence.indexOf("authorize_resource_creation")).toBeLessThan(plan.releaseSequence.indexOf("create_isolated_staging"));
    expect(plan.releaseSequence.indexOf("run_staging_security_and_E2-09")).toBeLessThan(plan.releaseSequence.indexOf("approve_production_creation"));
    expect(plan.releaseSequence.at(-1)).toBe("separate_runtime_activation_change");
  });

  it("mantém decisões e experimentos externos explicitamente pendentes", () => {
    expect(plan.pendingDecisions).toEqual(expect.arrayContaining(["DP-05a", "DP-06a", "DP-07a", "DP-08a", "DP-14b", "DP-15b", "DP-28b"]));
    expect(plan.activationGates).toEqual(expect.arrayContaining(["EXP-03_passed", "EXP-04_passed_before_real_data", "E2-09_staging_passed", "explicit_runtime_activation_approved"]));
    expect(readText("docs/decisions/ADR-0005-destinos-de-publicacao.md")).toContain("não aprovada");
    expect(readText("docs/product/marketing-ops/18-technical-experiments.md")).toContain("EXP-03 a EXP-05 continuam não executados");
  });

  it("mantém runtime e recursos externos desativados", () => {
    const validation = readJson("docs/product/marketing-ops/contracts/schemas/runtime/production-environment-plan.validation.json");
    expect(validation.status).toBe("passed_with_external_decisions_pending");
    expect(validation.externalResourcesCreated).toBe(false);
    expect(validation.runtimeDispatchEnabled).toBe(false);
    expect(validation.databaseChanged).toBe(false);
  });
});
