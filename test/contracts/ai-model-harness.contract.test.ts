// O harness emite somente códigos do Error Registry 1.5 (Release 2.17: CR-026
// e CR-027 aplicados). Os hashes das Releases 2.15 e 2.16 permanecem como
// referência histórica.
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HARNESS_FAILURE_CONTRACT, HARNESS_REGISTERED_ERROR_CODES } from "../../packages/core/src/index.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const CONTRACTS = "docs/product/marketing-ops/contracts";
const readJson = (p: string): Record<string, any> => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const sha = (p: string) => createHash("sha256").update(readFileSync(join(ROOT, p))).digest("hex");
const errors = readJson(`${CONTRACTS}/registries/errors.json`);
const porCodigo = new Map<string, Record<string, unknown>>(errors.entries.map((e: Record<string, unknown>) => [e.code, e]));

const APROVADOS_CR027 = ["BUDGET_NOT_CONFIGURED", "MODEL_ATTEMPT_CLOSE_UNCONFIRMED"];
const APROVADOS_CR026 = [
  "MODEL_ATTEMPT_ALREADY_EXECUTED", "MODEL_ATTEMPT_IN_PROGRESS", "MODEL_ATTEMPTS_EXHAUSTED", "MODEL_CAPABILITY_BLOCKED",
  "MODEL_INVOCATION_INVALID", "MODEL_OUTPUT_INVALID", "MODEL_PARAMETER_NOT_APPLIED", "MODEL_PROFILE_NOT_FOUND",
  "MODEL_PROVIDER_RESPONSE_INVALID", "MODEL_REQUEST_REJECTED", "MODEL_RESOLUTION_MISMATCH", "MODEL_ROUTE_UNAVAILABLE",
];

describe("AI Model Harness × Error Registry 1.5", () => {
  it("o registry está na versão 1.5 com os 12 códigos do CR-026 e os 2 do CR-027, cada um uma vez", () => {
    expect(errors.registryVersion).toBe("1.5");
    expect(errors.entries).toHaveLength(60);
    for (const c of [...APROVADOS_CR026, ...APROVADOS_CR027]) expect(errors.entries.filter((e: { code: string }) => e.code === c), c).toHaveLength(1);
  });

  it("BUDGET_NOT_CONFIGURED tem exatamente os atributos aprovados (CR-027 D-2)", () => {
    expect(porCodigo.get("BUDGET_NOT_CONFIGURED")).toMatchObject({ category: "budget", severity: "high", retryable: false, defaultNextAction: "request_approval" });
    expect(HARNESS_FAILURE_CONTRACT.budget_not_configured.contract.code).toBe("BUDGET_NOT_CONFIGURED");
  });

  it("MODEL_ATTEMPT_CLOSE_UNCONFIRMED tem exatamente os atributos aprovados e é distinto da rejeição explícita", () => {
    expect(porCodigo.get("MODEL_ATTEMPT_CLOSE_UNCONFIRMED")).toMatchObject({
      category: "integration", severity: "high", retryable: false, defaultNextAction: "escalate",
    });
    expect(HARNESS_FAILURE_CONTRACT.attempt_close_unconfirmed).toMatchObject({ contract: { code: "MODEL_ATTEMPT_CLOSE_UNCONFIRMED" }, retryable: false });
    expect(HARNESS_FAILURE_CONTRACT.attempt_close_rejected).toMatchObject({ contract: { code: "INVALID_STATE_TRANSITION" }, retryable: false });
  });

  it("os 12 códigos têm exatamente categoria, severidade, retryable e próxima ação aprovados", () => {
    const esperado: Record<string, [string, string, string]> = {
      MODEL_INVOCATION_INVALID: ["validation", "high", "revise_input"],
      MODEL_PROFILE_NOT_FOUND: ["runtime", "high", "stop"],
      MODEL_CAPABILITY_BLOCKED: ["runtime", "high", "stop"],
      MODEL_ROUTE_UNAVAILABLE: ["runtime", "high", "escalate"],
      MODEL_ATTEMPTS_EXHAUSTED: ["runtime", "high", "escalate"],
      MODEL_REQUEST_REJECTED: ["external_provider", "high", "stop"],
      MODEL_PARAMETER_NOT_APPLIED: ["validation", "high", "stop"],
      MODEL_OUTPUT_INVALID: ["validation", "medium", "revise_input"],
      MODEL_RESOLUTION_MISMATCH: ["integration", "critical", "stop"],
      MODEL_PROVIDER_RESPONSE_INVALID: ["integration", "critical", "stop"],
      MODEL_ATTEMPT_IN_PROGRESS: ["idempotency", "medium", "stop"],
      MODEL_ATTEMPT_ALREADY_EXECUTED: ["idempotency", "high", "stop"],
    };
    for (const [code, [category, severity, defaultNextAction]] of Object.entries(esperado)) {
      expect(porCodigo.get(code), code).toMatchObject({ category, severity, retryable: false, defaultNextAction });
    }
  });

  it("toda falha do harness aponta para um código registrado com o mesmo retryable", () => {
    expect(HARNESS_REGISTERED_ERROR_CODES.filter((c) => !porCodigo.has(c))).toEqual([]);
    for (const [kind, spec] of Object.entries(HARNESS_FAILURE_CONTRACT)) {
      expect(spec.contract.registered, kind).toBe(true);
      expect({ kind, retryable: spec.retryable }).toEqual({ kind, retryable: porCodigo.get(spec.contract.code)!.retryable });
    }
    const usados = new Set<string>(Object.values(HARNESS_FAILURE_CONTRACT).map((s) => s.contract.code));
    for (const c of APROVADOS_CR026) expect(usados.has(c), c).toBe(true);
  });

  it("o CR-026 está aplicado, com a aprovação do proprietário registrada", () => {
    const cr = readFileSync(join(ROOT, `${CONTRACTS}/changes/CR-026-product-ai-model-harness-contracts.md`), "utf8");
    expect(cr).toMatch(/\*\*Status:\*\* `approved_and_applied`/);
    expect(cr).toContain("29/09/2026");
    expect(cr).toMatch(/\*\*Target:\*\* Contract Registry Release 2\.16/);
  });
});

describe("premissas do CR-026 sobre o Error Registry", () => {
  it("external_provider existe no enum de categoria do error.schema.json", () => {
    const schema = readJson(`${CONTRACTS}/schemas/error.schema.json`);
    expect(schema.properties.category).toEqual({ $ref: "#/$defs/errorCategory" });
    expect(schema.$defs.errorCategory.enum).toContain("external_provider");
  });

  it("errors.validation.json é relatório derivado: categories é o conjunto em uso, não uma allow-list", () => {
    const relatorio = readJson(`${CONTRACTS}/registries/errors.validation.json`);
    const emUso = [...new Set(errors.entries.map((e: { category: string }) => e.category))].sort();
    expect([...relatorio.categories].sort()).toEqual(emUso);
    expect(relatorio.canonicalErrors).toBe(errors.entries.length);
    expect(relatorio.registryVersion).toBe(errors.registryVersion);
    expect(relatorio.addedCodes).toEqual(APROVADOS_CR027);
  });
});

describe("Release 2.15 como referência histórica", () => {
  const v215 = readJson(`${CONTRACTS}/contract-registry-manifest-v2.15.json`);
  const hash215 = (nome: string) => v215.artifacts.find((a: { path: string }) => a.path.endsWith(`registries/${nome}`))?.sha256;

  it.each(["agents.json", "actions.json", "events.json", "tools.json", "permissions.json"])(
    "%s não mudou desde a Release 2.15",
    (nome) => expect(sha(`${CONTRACTS}/registries/${nome}`)).toBe(hash215(nome)),
  );

  it("errors.json mudou somente pelas Releases 2.16 (CR-026) e 2.17 (CR-027)", () => {
    const entrada = (v: string) => readJson(`${CONTRACTS}/contract-registry-manifest-v${v}.json`).artifacts
      .find((x: { path: string }) => x.path.endsWith("registries/errors.json"));
    expect(entrada("2.16")).toMatchObject({ source: "cr_026" });
    expect(entrada("2.16").sha256).not.toBe(hash215("errors.json"));
    expect(entrada("2.17")).toMatchObject({ sha256: sha(`${CONTRACTS}/registries/errors.json`), source: "cr_027" });
    expect(entrada("2.17").sha256).not.toBe(entrada("2.16").sha256);
  });
});
