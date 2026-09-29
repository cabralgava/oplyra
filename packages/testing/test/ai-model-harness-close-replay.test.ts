// Fechamento da tentativa (CR-027): rejeição explícita versus resultado
// desconhecido. Uma exceção provoca no máximo um replay do mesmo comando
// idempotente do Ledger; o provider nunca é chamado de novo, não há fallback
// e a saída não é reconstruída.
import { describe, expect, it } from "vitest";
import { invokeModel } from "@oplyra/core";
import type { AttemptCloseCommand, AttemptCloseResult } from "@oplyra/core";
import { InMemoryBudgetGuard, ScriptedModelProvider } from "@oplyra/testing";
import { TA, TB, montar, pedido } from "./ai-model-harness-fixtures.ts";

type Passo = "commit_then_throw" | "throw_before_commit" | "real" | "rejected";

/** Envolve o fechamento do Ledger em memória com um roteiro por chamada e grava cada comando recebido. */
function roteirizarFechamento(budget: InMemoryBudgetGuard, passos: readonly Passo[]) {
  const real = budget.closeAttempt.bind(budget);
  const comandos: AttemptCloseCommand[] = [];
  const serializados: string[] = [];
  budget.closeAttempt = async (c: AttemptCloseCommand): Promise<AttemptCloseResult> => {
    comandos.push(c);
    serializados.push(JSON.stringify(c));
    const passo = passos[comandos.length - 1] ?? "real";
    if (passo === "throw_before_commit") throw new Error("conexão perdida antes do commit");
    if (passo === "rejected") return { status: "rejected" };
    const r = await real(c);
    if (passo === "commit_then_throw") throw new Error("conexão perdida depois do commit");
    return r;
  };
  return { comandos, serializados };
}

const cenario = (passos: readonly Passo[]) => {
  const budget = new InMemoryBudgetGuard({ tenants: { [TA]: 1_000_000, [TB]: 1_000_000 } });
  const ctx = montar({ budget });
  const fechamento = roteirizarFechamento(budget, passos);
  return { ...ctx, ...fechamento, provider: ctx.provider as ScriptedModelProvider };
};

describe("fechamento com replay idempotente do comando", () => {
  it("1. primeiro fechamento lança depois do commit e o replay devolve duplicate: sucesso com uma chamada ao provider", async () => {
    const c = cenario(["commit_then_throw", "real"]);
    const r = await invokeModel(c.deps, pedido());
    expect(r.ok).toBe(true);
    expect(c.provider.calls).toHaveLength(1);
    expect(c.comandos).toHaveLength(2);
    expect(c.comandos[1]).toBe(c.comandos[0]);
    expect(c.serializados[1]).toBe(c.serializados[0]);
    expect(await c.budget.closeAttempt(c.comandos[0]!)).toEqual({ status: "duplicate" });
    expect(c.recorder.records).toHaveLength(1);
    expect(c.budget.reservations(TA)).toMatchObject([{ status: "settled" }]);
  });

  it("2. primeiro fechamento lança antes do commit e o replay devolve closed: sucesso com uma chamada ao provider", async () => {
    const c = cenario(["throw_before_commit", "real"]);
    const r = await invokeModel(c.deps, pedido());
    expect(r.ok).toBe(true);
    expect(c.provider.calls).toHaveLength(1);
    expect(c.comandos).toHaveLength(2);
    expect(c.serializados[1]).toBe(c.serializados[0]);
    expect(c.recorder.records).toHaveLength(1);
    expect(c.budget.reservations(TA)).toMatchObject([{ status: "settled" }]);
  });

  it("3. os dois fechamentos lançam: MODEL_ATTEMPT_CLOSE_UNCONFIRMED, sem saída, sem fallback, tentativa reservada", async () => {
    const c = cenario(["throw_before_commit", "throw_before_commit", "real"]);
    const r = await invokeModel(c.deps, pedido());
    expect(r.ok).toBe(false);
    expect(!r.ok && r.failure).toMatchObject({
      kind: "attempt_close_unconfirmed", contract: { registered: true, code: "MODEL_ATTEMPT_CLOSE_UNCONFIRMED" }, retryable: false, attempts: 1,
    });
    expect("output" in r).toBe(false);
    expect(c.provider.calls).toHaveLength(1);
    expect(c.comandos).toHaveLength(2);
    expect(c.serializados[1]).toBe(c.serializados[0]);
    expect(c.budget.reservations(TA)).toMatchObject([{ status: "reserved" }]);
    expect(c.recorder.records).toHaveLength(0);
  });

  it("4. fechamento devolve rejected explicitamente: INVALID_STATE_TRANSITION, sem replay", async () => {
    const c = cenario(["rejected"]);
    const r = await invokeModel(c.deps, pedido());
    expect(!r.ok && r.failure).toMatchObject({
      kind: "attempt_close_rejected", contract: { registered: true, code: "INVALID_STATE_TRANSITION" }, retryable: false, attempts: 1,
    });
    expect(c.comandos).toHaveLength(1);
    expect(c.provider.calls).toHaveLength(1);
  });

  it("replay que devolve rejected: INVALID_STATE_TRANSITION, sem terceira tentativa de fechamento", async () => {
    const c = cenario(["throw_before_commit", "rejected", "real"]);
    const r = await invokeModel(c.deps, pedido());
    expect(!r.ok && r.failure).toMatchObject({ kind: "attempt_close_rejected", contract: { code: "INVALID_STATE_TRANSITION" } });
    expect(c.comandos).toHaveLength(2);
    expect(c.provider.calls).toHaveLength(1);
  });

  it.each([
    ["commit_then_throw", "real"], ["throw_before_commit", "real"], ["throw_before_commit", "throw_before_commit"], ["rejected"],
    ["throw_before_commit", "rejected"],
  ] as Passo[][])("5. roteiro %j não repete o provider nem faz fallback", async (...passos) => {
    const c = cenario(passos);
    await invokeModel(c.deps, pedido());
    expect(c.provider.calls).toHaveLength(1);
    expect(new Set(c.provider.calls.map((x) => x.providerModelId)).size).toBe(1);
    expect(c.comandos.length).toBeLessThanOrEqual(2);
  });
});
