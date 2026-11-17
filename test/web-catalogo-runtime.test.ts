import { describe, it, expect, vi } from "vitest";
import { catalogoLazy, CatalogoIndisponivel } from "../apps/web/src/lib/catalogo-runtime.ts";
import { listRuns, getRun, cancelRun, getKillSwitchStatus } from "../packages/core/src/runtime/use-cases.ts";
import type { AgentCatalog } from "../packages/core/src/runtime/domain.ts";

describe("catálogo do runtime na web (carga lazy, falha tipada)", () => {
  it("não carrega nada na criação", () => {
    const carregar = vi.fn(() => new Map() as AgentCatalog);
    catalogoLazy(carregar);
    expect(carregar).not.toHaveBeenCalled();
  });
  it("carrega uma vez e reaproveita", () => {
    const c: AgentCatalog = new Map();
    const carregar = vi.fn(() => c);
    const f = catalogoLazy(carregar);
    expect(f()).toBe(c); expect(f()).toBe(c);
    expect(carregar).toHaveBeenCalledTimes(1);
  });
  it("arquivo ausente vira CatalogoIndisponivel, com a causa preservada, e tenta de novo depois", () => {
    const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    let falha = true;
    const f = catalogoLazy(() => { if (falha) throw enoent; return new Map(); });
    expect(() => f()).toThrow(CatalogoIndisponivel);
    try { f(); } catch (e) { expect((e as CatalogoIndisponivel).code).toBe("CATALOGO_INDISPONIVEL"); expect((e as Error).cause).toBe(enoent); }
    falha = false;
    expect(f()).toBeInstanceOf(Map);
  });
  it("listar, ler, cancelar e consultar a interrupção nunca consultam o catálogo", async () => {
    const catalog = vi.fn(() => { throw new Error("catálogo consultado"); });
    const uow = { withUserTransaction: async (_c: unknown, fn: (tx: unknown) => unknown) => fn({}) };
    const run = { id: "r1" };
    const deps = {
      uow, agents: { catalog }, audit: { record: async () => {} }, clock: { now: () => new Date(0) },
      runs: { list: async () => [], findById: async () => run, steps: async () => [], cancel: async () => run },
      killSwitch: { effective: async () => null },
    } as never;
    const ctx = { tenantId: "t", userId: "u", role: "owner", permissions: new Set(["runtime.read", "runtime.operate"]) } as never;
    await listRuns(deps, ctx); await getRun(deps, ctx, "r1" as never); await cancelRun(deps, ctx, "r1" as never, "x"); await getKillSwitchStatus(deps, ctx);
    expect(catalog).not.toHaveBeenCalled();
  });
});
