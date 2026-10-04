import { describe, it, expect } from "vitest";
import { contextoDeEstrategia as contexto } from "@oplyra/testing/strategy";
import { montarChecklist, getActivationChecklist } from "@oplyra/core/brand";
import type { ActivationDeps, ActivationFacts } from "@oplyra/core/brand";
import type { TenantId } from "@oplyra/core";

const TA = "11111111-1111-4111-8111-111111111111" as TenantId;
const nada: ActivationFacts = { brandPublished: false, teamInvited: false, objectiveDefined: false, campaignCreated: false };

describe("checklist de ativação: derivado de fatos reais", () => {
  it("sem fatos, tudo o que está disponível fica pendente e o próximo passo é publicar a marca", () => {
    const c = montarChecklist(nada);
    expect(c.steps.map((s) => [s.key, s.state])).toEqual([
      ["brand_published", "pending"], ["objective_defined", "pending"], ["team_invited", "pending"], ["campaign_created", "pending"],
      ["media_connected", "unavailable"], ["copy_requested", "unavailable"],
    ]);
    expect(c).toMatchObject({ done: 0, total: 4, complete: false, next: { key: "brand_published", href: "marca" } });
  });

  it("cada fato marca somente o seu passo, e o próximo passo avança na ordem do fluxo F-01", () => {
    const estadoDe = (f: Partial<ActivationFacts>, k: string) => montarChecklist({ ...nada, ...f }).steps.find((s) => s.key === k)!.state;
    expect(estadoDe({ brandPublished: true }, "brand_published")).toBe("done");
    expect(estadoDe({ objectiveDefined: true }, "objective_defined")).toBe("done");
    expect(estadoDe({ teamInvited: true }, "team_invited")).toBe("done");
    expect(estadoDe({ campaignCreated: true }, "campaign_created")).toBe("done");
    expect(estadoDe({ objectiveDefined: true }, "brand_published")).toBe("pending");

    expect(montarChecklist({ ...nada, brandPublished: true }).next).toMatchObject({ key: "objective_defined", href: "estrategia" });
    expect(montarChecklist({ ...nada, brandPublished: true, objectiveDefined: true }).next).toMatchObject({ key: "team_invited", href: "equipe" });
    expect(montarChecklist({ ...nada, brandPublished: true, objectiveDefined: true, teamInvited: true }).next)
      .toMatchObject({ key: "campaign_created", href: "campanhas" });
  });

  it("completo quando os passos disponíveis e obrigatórios estão feitos; o futuro não conta nem finge progresso", () => {
    const c = montarChecklist({ brandPublished: true, teamInvited: true, objectiveDefined: true, campaignCreated: true });
    expect(c).toMatchObject({ done: 4, total: 4, complete: true, next: null });
    for (const k of ["media_connected", "copy_requested"] as const) {
      expect(c.steps.find((x) => x.key === k)).toMatchObject({ state: "unavailable", href: null });
    }
    expect(c.steps.find((s) => s.key === "media_connected")!.optional).toBe(true);
  });
});

describe("caso de uso", () => {
  const deps = (fatos: ActivationFacts): ActivationDeps & { leituras: TenantId[] } => {
    const leituras: TenantId[] = [];
    return {
      leituras,
      uow: {
        withUserTransaction: (_c, fn) => fn({}), withIdentityTransaction: (_u, fn) => fn({}), withWorkerTransaction: (_t, _j, fn) => fn({}),
        withDispatcherTransaction: (_t, _d, fn) => fn({}), withOperatorTransaction: (_o, _m, fn) => fn({}),
      },
      facts: { async read(_tx, t) { leituras.push(t); return fatos; } },
    };
  };

  it("lê os fatos da empresa do contexto e monta o checklist", async () => {
    const d = deps({ ...nada, brandPublished: true, objectiveDefined: true });
    const c = await getActivationChecklist(d, contexto({ tenantId: TA, roleKey: "viewer" }));
    expect(d.leituras).toEqual([TA]);
    expect(c.next?.key).toBe("team_invited");
  });

  it("exige poder ler a marca, a equipe e a estratégia", async () => {
    const d = deps(nada);
    const base = contexto({ tenantId: TA, roleKey: "viewer" });
    for (const faltando of ["brand.read", "member.read", "strategy.read"]) {
      const ctx = { ...base, permissions: new Set([...base.permissions].filter((p) => p !== faltando)) };
      await expect(getActivationChecklist(d, ctx), faltando).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    }
    expect(d.leituras).toEqual([]);
  });
});
