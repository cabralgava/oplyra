// Developer Harness (CR-031: teste do harness, por isso o prefixo `developer-harness.`; antes `test/perfil-de-produto.paths.test.ts`).
// Valida a PROPOSTA de perfil de autorização contínua do produto (docs/harness/INTEGRACAO-PR11-E-PERFIS.md §2) contra os validadores
// REAIS do executor (PR #11): o que o escopo aceita e o que recusa. Não é prova de integração, de ativação nem de ensaio.
import { describe, it, expect } from "vitest";
// @ts-expect-error módulos .mjs do harness, sem declaração de tipos
import { buildStanding, StandingError } from "../scripts/claude-standing.mjs";
// @ts-expect-error idem
import { validatePaths, RecordError } from "../scripts/claude-delivery-record.mjs";
// @ts-expect-error idem
import { classifyChange } from "../scripts/claude-risk.mjs";

/** Caminhos CONCRETOS da proposta: diretórios de dois ou mais níveis, sem curinga, todos de classe rotineira. */
export const PERFIL_DE_PRODUTO = [
  "apps/web/src/app/", "apps/web/src/components/", "apps/web/src/lib/",
  "packages/core/src/domain/", "packages/core/src/application/",
  "packages/infra/src/", "packages/testing/src/",
  "packages/core/test/", "packages/infra/test/", "packages/testing/test/",
  "docs/progresso/",
];

const agora = new Date("2026-10-28T12:00:00Z");
const confirmacao = "owner-chat:01a10bee-0000-4000-8000-000000000001:" + "a".repeat(64);
const proposta = {
  paths: PERFIL_DE_PRODUTO, expiresInDays: 30, confirmation: confirmacao,
  limits: { maxMissions: 20, mergesPerRun: 10, maxAgentSessionsPerMission: 5, wallClockSeconds: 172_800 },
  missionBudgets: { wallClockSeconds: 7200, iterations: 5, logReads: 10 },
};

describe("perfil de produto proposto × validadores existentes", () => {
  it("é aceito pela autorização contínua e todos os caminhos são de classe rotineira", () => {
    const standing = buildStanding(proposta, { now: agora });
    expect(standing.scope.paths).toEqual(PERFIL_DE_PRODUTO);
    expect(standing.scope.riskClasses).toEqual(["routine"]);
    expect(classifyChange(PERFIL_DE_PRODUTO.map((p) => p.replace(/\/$/, ""))).elevated).toEqual([]);
  });

  it("respeita os tetos: 30 dias, 50 missões, 7 dias de relógio, orçamento por missão", () => {
    const standing = buildStanding(proposta, { now: agora });
    expect(Date.parse(standing.expiresAt) - Date.parse(standing.issuedAt)).toBe(30 * 86_400_000);
    expect(standing.limits).toEqual(proposta.limits);
    expect(() => buildStanding({ ...proposta, limits: { ...proposta.limits, maxMissions: 51 } }, { now: agora })).toThrow(StandingError);
    expect(() => buildStanding({ ...proposta, expiresInDays: 31 }, { now: agora })).toThrow(StandingError);
  });

  it("NÃO aceita curingas nem diretórios de um nível: packages/*/src/, packages/*/test/, test/, docs/, apps/", () => {
    for (const ruim of ["packages/*/src/", "packages/*/test/", "test/", "docs/", "apps/", "scripts/", "E2E/", "e2e*/", "packages/{core,infra}/src/"]) {
      expect(() => validatePaths([ruim], undefined), ruim).toThrow(RecordError);
    }
  });

  it("e2e/ é a ÚNICA exceção nomeada de diretório de um nível (D-E3); arquivo concreto continua aceito", () => {
    expect(validatePaths(["e2e/"], undefined)).toEqual(["e2e/"]);
    expect(validatePaths(["e2e/i06.spec.ts"], undefined)).toEqual(["e2e/i06.spec.ts"]);
    expect(buildStanding({ ...proposta, paths: [...PERFIL_DE_PRODUTO, "e2e/"] }, { now: agora }).scope.paths).toContain("e2e/");
  });

  it("recusa na autorização os caminhos elevados (banco, dependências, contratos, harness, ADR, CI, scripts)", () => {
    for (const elevado of [
      "supabase/migrations/", "supabase/tests/", "packages/core/package.json", "docs/product/marketing-ops/contracts/changes/CR-040-x.md",
      "docs/harness/ESTADO.md", "docs/decisions/ADR-0006-runtime-de-agentes.md", ".github/workflows/ci.yml", "scripts/claude-risk.mjs",
      "playwright.config.ts", "apps/web/next.config.mjs",
    ]) {
      expect(() => buildStanding({ ...proposta, paths: [...PERFIL_DE_PRODUTO, elevado] }, { now: agora }), elevado).toThrow();
    }
  });

  it("o escopo atual NÃO cobre uma entrega estrutural: migration, exports e pgTAP são elevados", () => {
    const entregaEstrutural = [
      "supabase/migrations/20261101000020_exemplo.sql", "supabase/tests/exemplo.test.sql", "packages/core/package.json",
    ];
    const r = classifyChange(entregaEstrutural);
    expect(r.risk).toBe("elevated");
    expect(r.elevated.map((e: { reason: string }) => e.reason)).toEqual(["banco", "banco", "dependencias"]);
  });

  it("o progresso operacional fica em docs/progresso/, rotineiro, e fora de docs/harness (política)", () => {
    expect(classifyChange(["docs/progresso/ms-002.md"]).risk).toBe("routine");
    expect(classifyChange(["docs/harness/ESTADO.md"]).risk).toBe("elevated");
    expect(() => validatePaths(["docs/harness/"], undefined)).toThrow(RecordError);
  });
});
