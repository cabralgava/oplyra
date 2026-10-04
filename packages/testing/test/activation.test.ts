import { describe, it, expect } from "vitest";
import { contextoDeMarca as contexto } from "@oplyra/testing/brand";
import { montarChecklist, getActivationChecklist } from "@oplyra/core/brand";
import type { ActivationDeps, ActivationFacts } from "@oplyra/core/brand";
import type { TenantId } from "@oplyra/core";

const TA = "11111111-1111-4111-8111-111111111111" as TenantId;

describe("checklist de ativação: derivado de fatos reais", () => {
  it("sem fatos, tudo o que está disponível fica pendente e o próximo passo é publicar a marca", () => {
    const c = montarChecklist({ brandPublished: false, teamInvited: false });
    expect(c.steps.map((s) => [s.key, s.state])).toEqual([
      ["brand_published", "pending"], ["team_invited", "pending"], ["objective_defined", "unavailable"], ["media_connected", "unavailable"],
    ]);
    expect(c).toMatchObject({ done: 0, total: 2, complete: false, next: { key: "brand_published", href: "marca" } });
  });

  it("cada fato marca somente o seu passo, e o próximo passo avança", () => {
    const soMarca = montarChecklist({ brandPublished: true, teamInvited: false });
    expect(soMarca).toMatchObject({ done: 1, complete: false, next: { key: "team_invited", href: "equipe" } });
    expect(soMarca.steps.find((s) => s.key === "brand_published")!.state).toBe("done");
    const soEquipe = montarChecklist({ brandPublished: false, teamInvited: true });
    expect(soEquipe).toMatchObject({ done: 1, next: { key: "brand_published" } });
  });

  it("completo quando os passos disponíveis e obrigatórios estão feitos; passos de incrementos futuros não contam nem fingem progresso", () => {
    const c = montarChecklist({ brandPublished: true, teamInvited: true });
    expect(c).toMatchObject({ done: 2, total: 2, complete: true, next: null });
    for (const k of ["objective_defined", "media_connected"] as const) {
      const s = c.steps.find((x) => x.key === k)!;
      expect(s).toMatchObject({ state: "unavailable", href: null });
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
    const d = deps({ brandPublished: true, teamInvited: false });
    const c = await getActivationChecklist(d, contexto({ tenantId: TA, roleKey: "viewer" }));
    expect(d.leituras).toEqual([TA]);
    expect(c.next?.key).toBe("team_invited");
  });

  it("exige poder ler a marca e a equipe", async () => {
    const d = deps({ brandPublished: false, teamInvited: false });
    const semMarca = { ...contexto({ tenantId: TA, roleKey: "viewer" }), permissions: new Set(["member.read"] as const) };
    const semEquipe = { ...contexto({ tenantId: TA, roleKey: "viewer" }), permissions: new Set(["brand.read"] as const) };
    await expect(getActivationChecklist(d, semMarca as never)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    await expect(getActivationChecklist(d, semEquipe as never)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(d.leituras).toEqual([]);
  });
});
