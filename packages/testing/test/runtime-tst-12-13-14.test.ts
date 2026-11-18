// I-02 (runtime local) — regras do Product Agent Runtime com fakes: TST-12 (recuperação), TST-13
// (concorrência) e TST-14 (limites e kill switch), além de admissão e autorização determinísticas.
// É integração SIMULADA: a concorrência real contra o Supabase local fica no teste de integração.
import { describe, it, expect } from "vitest";
import { criarRuntimeDeps, contextoDeRuntime as contexto } from "../src/runtime.ts";
import {
  submitRunAsUser, submitRunAsSystem, executeNextRun, activateKillSwitch, releaseKillSwitch, cancelRun, getRun, listRuns,
  RunStepFailure, type RunHandler,
} from "../../core/src/runtime/use-cases.ts";
import {
  admitirExecucao, autonomiaPermitida, avaliarChamada, decidirFalha, esperaDaTentativa, exigirLimitesValidos,
  passosIncertos, type NewRun, type RunLimits, type RunError,
} from "../../core/src/runtime/domain.ts";
import { CATALOGO_SINTETICO } from "../src/runtime.ts";
import type { TenantId } from "@oplyra/core";

const TA = "11111111-1111-4111-8111-111111111111" as TenantId;
const TB = "22222222-2222-4222-8222-222222222222" as TenantId;
const gestor = contexto({ tenantId: TA, roleKey: "marketing_manager" });
const leitor = contexto({ tenantId: TA, roleKey: "viewer" });
const gestorB = contexto({ tenantId: TB, roleKey: "marketing_manager" });

const LIMITES: RunLimits = { maxCostMicroUsd: 1_000, maxToolCalls: 5, maxTurns: 5, maxAttempts: 3, timeoutMs: 60_000 };
let n = 0;
const nova = (over: Partial<NewRun> = {}, deps?: { estado: { agora: Date } }): NewRun => ({
  agentKey: "copywriting-agent", actionKey: "create_copy_variants", trigger: "user", autonomy: "draft",
  correlationId: "corr-1", causationId: null, workflowId: null, taskId: null, idempotencyKey: `idem-${++n}`,
  input: {}, limits: LIMITES, availableAt: deps?.estado.agora ?? new Date("2026-11-11T12:00:00Z"), ...over,
});
const LEASE = 30;
const rodar = (deps: ReturnType<typeof criarRuntimeDeps>, handler: RunHandler, worker = "w1", tenantId = TA) =>
  executeNextRun(deps, { tenantId, workerId: worker, leaseSeconds: LEASE, handler });
const falha = (retryable: boolean): RunError => ({ code: retryable ? "PROVIDER_TIMEOUT" : "VALIDATION", category: retryable ? "timeout" : "validation", retryable, message: "x" });

/** Handler de três passos sintéticos; conta quantas vezes cada função de passo realmente rodou. */
function trilha() {
  const chamadas: string[] = [];
  const handler: RunHandler = async (api) => {
    for (const k of ["a", "b", "c"]) {
      await api.step(k, { kind: "model", effectful: false, estimateMicroUsd: 100 }, async () => { chamadas.push(k); return { result: { k }, costMicroUsd: 100 }; });
    }
    return { kind: "completed" };
  };
  return { chamadas, handler };
}

describe("domínio: limites, autonomia e admissão", () => {
  it("limites exigem inteiros positivos; ausência de limite impede a execução", () => {
    expect(() => exigirLimitesValidos(LIMITES)).not.toThrow();
    for (const campo of Object.keys(LIMITES) as (keyof RunLimits)[]) {
      expect(() => exigirLimitesValidos({ ...LIMITES, [campo]: 0 })).toThrowError(expect.objectContaining({ code: "RUN_LIMITS_INVALID" }));
      expect(() => exigirLimitesValidos({ ...LIMITES, [campo]: 1.5 })).toThrow();
      expect(() => exigirLimitesValidos({ ...LIMITES, [campo]: Number.NaN })).toThrow();
    }
    expect(() => exigirLimitesValidos({ ...LIMITES, maxAttempts: 11 })).toThrow();
  });

  it("autonomia nunca excede a concedida", () => {
    expect(autonomiaPermitida("recommend", "draft")).toBe(true);
    expect(autonomiaPermitida("draft", "draft")).toBe(true);
    expect(autonomiaPermitida("policy_execute", "draft")).toBe(false);
    expect(autonomiaPermitida("approval_required", "recommend")).toBe(false);
  });

  it("admissão: agente e ação conhecidos, ação do agente, autonomia dentro do concedido", () => {
    expect(admitirExecucao(CATALOGO_SINTETICO, nova())).toEqual({ ok: true });
    expect(admitirExecucao(CATALOGO_SINTETICO, nova({ agentKey: "fantasma-agent" }))).toMatchObject({ ok: false, reason: "AGENT_UNKNOWN" });
    expect(admitirExecucao(CATALOGO_SINTETICO, nova({ actionKey: "publish_campaign" }))).toMatchObject({ ok: false, reason: "ACTION_NOT_ALLOWED" });
    expect(admitirExecucao(CATALOGO_SINTETICO, nova({ autonomy: "policy_execute" }))).toMatchObject({ ok: false, reason: "AUTONOMY_EXCEEDED" });
    // mídia paga só recomenda: draft já excede
    expect(admitirExecucao(CATALOGO_SINTETICO, nova({ agentKey: "paid-media-agent", actionKey: "analyze_campaign_performance", autonomy: "draft" })))
      .toMatchObject({ ok: false, reason: "AUTONOMY_EXCEEDED" });
  });

  it("avaliarChamada: kill switch primeiro, depois prazo, custo, ferramentas e turnos; estimativa inválida não passa", () => {
    const run = { limits: LIMITES, usage: { costMicroUsd: 0, toolCalls: 0, turns: 0 }, deadlineAt: new Date("2026-11-11T12:01:00Z") };
    const agora = new Date("2026-11-11T12:00:00Z");
    expect(avaliarChamada(run, "model", 100, agora, null)).toEqual({ ok: true });
    expect(avaliarChamada(run, "model", 100, agora, { active: true, scope: "tenant", reason: "incidente" })).toMatchObject({ ok: false, reason: "KILL_SWITCH" });
    expect(avaliarChamada(run, "model", 100, agora, { active: false, scope: "tenant", reason: "x" })).toEqual({ ok: true });
    expect(avaliarChamada(run, "model", 100, new Date("2026-11-11T12:01:00Z"), null)).toMatchObject({ reason: "DEADLINE_EXCEEDED" });
    expect(avaliarChamada({ ...run, usage: { costMicroUsd: 950, toolCalls: 0, turns: 0 } }, "model", 100, agora, null)).toMatchObject({ reason: "COST_EXHAUSTED" });
    expect(avaliarChamada({ ...run, usage: { costMicroUsd: 900, toolCalls: 0, turns: 0 } }, "model", 100, agora, null)).toEqual({ ok: true }); // exatamente no teto
    expect(avaliarChamada({ ...run, usage: { costMicroUsd: 0, toolCalls: 5, turns: 0 } }, "tool", 0, agora, null)).toMatchObject({ reason: "TOOL_CALLS_EXHAUSTED" });
    expect(avaliarChamada({ ...run, usage: { costMicroUsd: 0, toolCalls: 5, turns: 0 } }, "model", 0, agora, null)).toEqual({ ok: true }); // ferramenta não consome turno
    expect(avaliarChamada({ ...run, usage: { costMicroUsd: 0, toolCalls: 0, turns: 5 } }, "model", 0, agora, null)).toMatchObject({ reason: "TURNS_EXHAUSTED" });
    for (const ruim of [-1, 1.5, Number.NaN]) expect(avaliarChamada(run, "model", ruim, agora, null)).toMatchObject({ ok: false });
  });

  it("falha (política v1 do outbox): 1, 2, 4 e 8 s sem jitter; só códigos transitórios; esgotar preserva a causa raiz", () => {
    const agora = new Date("2026-11-11T12:00:00Z");
    const base = { limits: { ...LIMITES, maxAttempts: 5 }, deadlineAt: null };
    for (const [tentativa, ms] of [[1, 1_000], [2, 2_000], [3, 4_000], [4, 8_000]] as const) {
      expect(decidirFalha({ ...base, attempt: tentativa }, falha(true), agora)).toEqual({ status: "queued", availableAt: new Date(agora.getTime() + ms) });
    }
    expect(esperaDaTentativa(30)).toBe(8_000); // teto
    // quinta tentativa falha: esgotamento, com a causa original preservada (não substituída)
    const fim = decidirFalha({ ...base, attempt: 5 }, falha(true), agora);
    expect(fim).toMatchObject({ status: "failed", deadLetter: true, needsHuman: true,
      error: { code: "RETRY_ATTEMPTS_EXHAUSTED", retryable: false, details: { rootCause: { code: "PROVIDER_TIMEOUT" } } } });
    // sem prazo, sem retry
    expect(decidirFalha({ limits: LIMITES, deadlineAt: agora, attempt: 1 }, falha(true), agora)).toMatchObject({ status: "failed", error: { code: "RETRY_ATTEMPTS_EXHAUSTED" } });
  });

  it("falha não transitória é terminal mesmo declarada retryable; código desconhecido nunca é retentado", () => {
    const agora = new Date("2026-11-11T12:00:00Z");
    const base = { limits: LIMITES, deadlineAt: null, attempt: 1 };
    const naoRegistrado: RunError = { code: "ALGO_QUE_EU_INVENTEI", category: "integration", retryable: true, message: "x" };
    const r = decidirFalha(base, naoRegistrado, agora);
    expect(r).toMatchObject({ status: "failed", needsHuman: true, error: { code: "ALGO_QUE_EU_INVENTEI" } }); // causa mantida, sem rótulo de esgotamento
    expect(decidirFalha(base, falha(false), agora)).toMatchObject({ status: "failed", error: { code: "VALIDATION" } });
    for (const codigo of ["INTEGRATION_UNAVAILABLE", "PROVIDER_RATE_LIMITED", "PROVIDER_TIMEOUT", "UPSTREAM_SERVICE_UNAVAILABLE"]) {
      expect(decidirFalha(base, { ...falha(true), code: codigo }, agora)).toMatchObject({ status: "queued" });
    }
  });

  it("passosIncertos: só o passo COM efeito que começou, não concluiu e NÃO foi abortado por falha conhecida", () => {
    const t = new Date();
    expect(passosIncertos([
      { stepKey: "ok", attempt: 1, effectful: true, startedAt: t, checkpoint: { result: 1, at: t }, abortedAt: null },
      { stepKey: "leitura", attempt: 1, effectful: false, startedAt: t, checkpoint: null, abortedAt: null },
      { stepKey: "falhou-sabido", attempt: 1, effectful: true, startedAt: t, checkpoint: null, abortedAt: t },
      { stepKey: "envio", attempt: 1, effectful: true, startedAt: t, checkpoint: null, abortedAt: null },
    ])).toEqual(["envio"]);
  });

  it("falha classificada de um passo com efeito NÃO o deixa incerto: a retentativa roda; a queda continua incerta", async () => {
    const deps = criarRuntimeDeps();
    await submitRunAsUser(deps, gestor, nova());
    let falhou = false;
    const chamadas: string[] = [];
    const h: RunHandler = async (api) => {
      await api.step("pago", { kind: "model", effectful: true, estimateMicroUsd: 10 }, async () => {
        chamadas.push("pago");
        if (!falhou) { falhou = true; throw new RunStepFailure(falha(true)); }
        return { result: "ok", costMicroUsd: 10 };
      });
      return { kind: "completed" };
    };
    expect(await rodar(deps, h)).toMatchObject({ status: "requeued", attempt: 1 });
    deps.avancar(1_000);
    expect(await rodar(deps, h)).toMatchObject({ status: "completed", attempt: 2 }); // não escalou
    expect(chamadas).toEqual(["pago", "pago"]);
    expect(deps.estado.runs[0]).toMatchObject({ status: "completed", needsHuman: false, usage: { costMicroUsd: 10 } });
    // checkpoint de passo abortado sem re-iniciar é recusado
    const d2 = criarRuntimeDeps();
    await submitRunAsUser(d2, gestor, nova());
    const w = <T>(f: Parameters<typeof d2.uow.withWorkerTransaction<T>>[2]) => d2.uow.withWorkerTransaction(TA, "t", f);
    const c = (await w((tx) => d2.runs.claimNext(tx, { tenantId: TA, workerId: "w1", now: d2.clock.now(), leaseSeconds: LEASE })))!;
    await w((tx) => d2.runs.beginStep(tx, { lease: c.lease, stepKey: "p", effectful: true, now: d2.clock.now() }));
    await w((tx) => d2.runs.abortStep(tx, { lease: c.lease, stepKey: "p", now: d2.clock.now() }));
    await expect(w((tx) => d2.runs.completeStep(tx, { lease: c.lease, stepKey: "p", result: 1, usageDelta: { costMicroUsd: 1, toolCalls: 0, turns: 1 }, now: d2.clock.now() })))
      .rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  });
});

describe("submissão e autorização determinística", () => {
  it("leitor consulta, mas não submete; submissão grava auditoria", async () => {
    const deps = criarRuntimeDeps();
    await expect(submitRunAsUser(deps, leitor, nova())).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    const { run } = await submitRunAsUser(deps, gestor, nova());
    expect(run).toMatchObject({ status: "queued", attempt: 0, tenantId: TA });
    expect(deps.estado.auditoria.map((a) => a.action)).toEqual(["run.submit"]);
    await expect(listRuns(deps, leitor)).resolves.toHaveLength(1);
    await expect(getRun(deps, leitor, run.id)).resolves.toMatchObject({ run: { id: run.id } });
    await expect(cancelRun(deps, leitor, run.id, "x")).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("admissão recusa agente desconhecido, ação alheia ao agente e autonomia acima da concedida, sem enfileirar", async () => {
    const deps = criarRuntimeDeps();
    await expect(submitRunAsUser(deps, gestor, nova({ agentKey: "fantasma-agent" }))).rejects.toMatchObject({ code: "RUN_REJECTED", reason: "AGENT_UNKNOWN" });
    await expect(submitRunAsUser(deps, gestor, nova({ actionKey: "publish_campaign" }))).rejects.toMatchObject({ reason: "ACTION_NOT_ALLOWED" });
    await expect(submitRunAsUser(deps, gestor, nova({ autonomy: "policy_execute" }))).rejects.toMatchObject({ reason: "AUTONOMY_EXCEEDED" });
    await expect(submitRunAsUser(deps, gestor, nova({ limits: { ...LIMITES, maxCostMicroUsd: 0 } }))).rejects.toMatchObject({ code: "RUN_LIMITS_INVALID" });
    await expect(submitRunAsUser(deps, gestor, nova({ idempotencyKey: " " }))).rejects.toMatchObject({ code: "RUN_REJECTED" });
    expect(deps.estado.runs).toHaveLength(0);
    expect(deps.estado.auditoria).toHaveLength(0);
  });

  it("a autorização é refeita ao executar: agente retirado do catálogo não roda", async () => {
    const deps = criarRuntimeDeps();
    await submitRunAsUser(deps, gestor, nova());
    deps.agents.catalog = () => new Map();
    const { chamadas, handler } = trilha();
    const r = await rodar(deps, handler);
    expect(r).toMatchObject({ status: "failed", code: "RUN_AGENT_UNKNOWN" });
    expect(chamadas).toEqual([]);
    expect(deps.estado.runs[0]).toMatchObject({ status: "failed", needsHuman: false, error: { category: "authorization" } });
  });

  it("submissão por sistema/agendamento passa pela mesma admissão", async () => {
    const deps = criarRuntimeDeps();
    await expect(submitRunAsSystem(deps, TA, nova({ autonomy: "policy_execute", trigger: "schedule" }), { type: "schedule", id: "sch-1" })).rejects.toMatchObject({ reason: "AUTONOMY_EXCEEDED" });
    const { run } = await submitRunAsSystem(deps, TA, nova({ trigger: "schedule" }), { type: "schedule", id: "sch-1" });
    expect(run.trigger).toBe("schedule");
  });
});

describe("execução feliz, tracing e auditoria", () => {
  it("conduz os passos, soma custo, completa e audita com correlação", async () => {
    const deps = criarRuntimeDeps();
    const { run } = await submitRunAsUser(deps, gestor, nova({ correlationId: "corr-xyz" }));
    const { chamadas, handler } = trilha();
    const r = await rodar(deps, handler);
    expect(r).toMatchObject({ status: "completed", runId: run.id, attempt: 1 });
    expect(chamadas).toEqual(["a", "b", "c"]);
    const fim = deps.estado.runs[0]!;
    expect(fim).toMatchObject({ status: "completed", usage: { costMicroUsd: 300, turns: 3, toolCalls: 0 }, leaseOwner: null, fencingToken: null });
    expect(fim.deadlineAt!.getTime()).toBe(fim.startedAt!.getTime() + LIMITES.timeoutMs);
    expect(deps.estado.auditoria.map((a) => a.action)).toEqual(["run.submit", "run.completed"]);
    // correlationId do OATP é texto livre; vai em `after` (a coluna do audit_log só aceita UUID)
    expect(deps.estado.auditoria.every((a) => (a.after as { correlationId: string }).correlationId === "corr-xyz")).toBe(true);
    expect(deps.estado.auditoria.every((a) => a.correlationId === undefined)).toBe(true);
    await expect(rodar(deps, handler)).resolves.toEqual({ status: "idle" });
  });

  it("waiting_approval suspende sem concluir", async () => {
    const deps = criarRuntimeDeps();
    await submitRunAsUser(deps, gestor, nova());
    const r = await rodar(deps, async () => ({ kind: "waiting_approval" }));
    expect(r).toMatchObject({ status: "waiting_approval" });
    expect(deps.estado.runs[0]!.status).toBe("waiting_approval");
    await expect(rodar(deps, async () => ({ kind: "completed" }))).resolves.toEqual({ status: "idle" }); // não é retomada sozinha
  });
});

describe("TST-12 — recuperação: queda do worker no meio do passo", () => {
  /** Simula a queda de verdade: toma o lease e grava alguns passos pela porta, e o "processo" morre. */
  async function quedaNoMeio(deps: ReturnType<typeof criarRuntimeDeps>, comEfeitoNoPasso: boolean) {
    const { run } = await submitRunAsUser(deps, gestor, nova());
    const claim = (await deps.uow.withWorkerTransaction(TA, "t", (tx) => deps.runs.claimNext(tx, { tenantId: TA, workerId: "morto", now: deps.clock.now(), leaseSeconds: LEASE })))!;
    await deps.uow.withWorkerTransaction(TA, "t", async (tx) => {
      await deps.runs.beginStep(tx, { lease: claim.lease, stepKey: "a", effectful: false, now: deps.clock.now() });
      await deps.runs.completeStep(tx, { lease: claim.lease, stepKey: "a", result: { k: "a" }, usageDelta: { costMicroUsd: 100, toolCalls: 0, turns: 1 }, now: deps.clock.now() });
      await deps.runs.beginStep(tx, { lease: claim.lease, stepKey: "b", effectful: comEfeitoNoPasso, now: deps.clock.now() }); // começou e o processo caiu
    });
    return { run, claim };
  }

  it("retomada sem duplicar checkpoint nem custo; passo sem efeito é refeito", async () => {
    const deps = criarRuntimeDeps();
    const { run } = await quedaNoMeio(deps, false);
    // lease ainda válido: ninguém mais pega
    await expect(rodar(deps, async () => ({ kind: "completed" }), "w2")).resolves.toEqual({ status: "idle" });
    deps.avancar((LEASE + 1) * 1000);
    const { chamadas, handler } = trilha();
    const r = await rodar(deps, handler, "w2");
    expect(r).toMatchObject({ status: "completed", attempt: 2 });
    expect(chamadas).toEqual(["b", "c"]); // "a" veio do checkpoint, não rodou de novo
    const fim = (await getRun(deps, gestor, run.id));
    expect(fim.run.usage).toEqual({ costMicroUsd: 300, toolCalls: 0, turns: 3 }); // 100 de "a" contado uma única vez
    expect(fim.steps.filter((s) => s.stepKey === "a")).toHaveLength(1);
    expect(fim.steps.every((s) => s.checkpoint !== null)).toBe(true);
  });

  it("efeito incerto: não repete o passo, escala para pessoa e registra", async () => {
    const deps = criarRuntimeDeps();
    const { run } = await quedaNoMeio(deps, true);
    deps.avancar((LEASE + 1) * 1000);
    const { chamadas, handler } = trilha();
    const r = await rodar(deps, handler, "w2");
    expect(r).toMatchObject({ status: "escalated", code: "EFFECT_UNCERTAIN" });
    expect(chamadas).toEqual([]); // nada foi executado de novo
    expect(deps.estado.runs[0]).toMatchObject({ id: run.id, status: "failed", needsHuman: true, error: { code: "EFFECT_UNCERTAIN", retryable: false } });
    expect(deps.estado.runs[0]!.error!.message).toContain("b");
    expect(deps.estado.auditoria.at(-1)).toMatchObject({ action: "run.escalated", after: { needsHuman: true, errorCode: "EFFECT_UNCERTAIN" } });
    await expect(rodar(deps, handler, "w3")).resolves.toEqual({ status: "idle" });
  });

  it("execução abandonada repetidamente esgota as tentativas e vai a dead-letter, sem ser entregue de novo", async () => {
    const deps = criarRuntimeDeps();
    await submitRunAsUser(deps, gestor, nova({ limits: { ...LIMITES, maxAttempts: 2 } }));
    for (let i = 0; i < 2; i++) {
      await deps.uow.withWorkerTransaction(TA, "t", (tx) => deps.runs.claimNext(tx, { tenantId: TA, workerId: `m${i}`, now: deps.clock.now(), leaseSeconds: LEASE }));
      deps.avancar((LEASE + 1) * 1000);
    }
    const { chamadas, handler } = trilha();
    await expect(rodar(deps, handler, "w9")).resolves.toEqual({ status: "idle" });
    expect(chamadas).toEqual([]);
    expect(deps.estado.runs[0]).toMatchObject({ status: "failed", needsHuman: true, error: { code: "RETRY_ATTEMPTS_EXHAUSTED" } });
  });

  it("falha retryable volta à fila com espera; só roda depois dela, e esgota em dead-letter", async () => {
    const deps = criarRuntimeDeps();
    await submitRunAsUser(deps, gestor, nova());
    const sempreFalha: RunHandler = async (api) => {
      await api.step("a", { kind: "model", effectful: false, estimateMicroUsd: 10 }, async () => { throw new RunStepFailure(falha(true)); });
      return { kind: "completed" };
    };
    expect(await rodar(deps, sempreFalha)).toMatchObject({ status: "requeued", attempt: 1, code: "PROVIDER_TIMEOUT" });
    expect(await rodar(deps, sempreFalha)).toEqual({ status: "idle" }); // ainda na espera
    deps.avancar(1_000);
    expect(await rodar(deps, sempreFalha)).toMatchObject({ status: "requeued", attempt: 2 });
    deps.avancar(2_000);
    expect(await rodar(deps, sempreFalha)).toMatchObject({ status: "failed", attempt: 3, code: "RETRY_ATTEMPTS_EXHAUSTED" });
    expect(deps.estado.runs[0]).toMatchObject({
      status: "failed", needsHuman: true, error: { code: "RETRY_ATTEMPTS_EXHAUSTED", details: { rootCause: { code: "PROVIDER_TIMEOUT" } } },
    });
    expect(deps.estado.auditoria.map((a) => a.action)).toEqual(["run.submit", "run.retry", "run.retry", "run.dead_letter"]);
  });

  it("falha não classificada NÃO é retentada (falha segura)", async () => {
    const deps = criarRuntimeDeps();
    await submitRunAsUser(deps, gestor, nova());
    const r = await rodar(deps, async (api) => {
      await api.step("a", { kind: "model", effectful: false, estimateMicroUsd: 10 }, async () => { throw new Error("segredo interno do fornecedor"); });
      return { kind: "completed" };
    });
    expect(r).toMatchObject({ status: "failed", code: "STEP_FAILED" });
    expect(deps.estado.runs[0]!.error!.message).not.toContain("segredo");
  });
});

describe("TST-13 — concorrência e idempotência", () => {
  it("a mesma mensagem entregue duas vezes gera uma única execução e uma única auditoria", async () => {
    const deps = criarRuntimeDeps();
    const msg = nova({ idempotencyKey: "task-998-copy-v1" });
    const a = await submitRunAsUser(deps, gestor, msg);
    const b = await submitRunAsUser(deps, gestor, msg);
    const c = await submitRunAsSystem(deps, TA, msg);
    expect([a.duplicate, b.duplicate, c.duplicate]).toEqual([false, true, true]);
    expect(new Set([a.run.id, b.run.id, c.run.id]).size).toBe(1);
    expect(deps.estado.runs).toHaveLength(1);
    expect(deps.estado.auditoria).toHaveLength(1);
  });

  it("a chave de idempotência vale por empresa: igual em outra empresa é outra execução", async () => {
    const deps = criarRuntimeDeps();
    const msg = nova({ idempotencyKey: "mesma-chave" });
    const a = await submitRunAsUser(deps, gestor, msg);
    const b = await submitRunAsUser(deps, gestorB, msg);
    expect(a.run.id).not.toBe(b.run.id);
    expect(b.duplicate).toBe(false);
  });

  it("dois workers disputando a mesma execução: só um a conduz", async () => {
    const deps = criarRuntimeDeps();
    await submitRunAsUser(deps, gestor, nova());
    const { chamadas, handler } = trilha();
    const [r1, r2] = await Promise.all([rodar(deps, handler, "w1"), rodar(deps, handler, "w2")]);
    expect([r1.status, r2.status].sort()).toEqual(["completed", "idle"]);
    expect(chamadas).toEqual(["a", "b", "c"]); // sem execução em dobro
  });

  it("worker obsoleto grava com a tentativa antiga e é rejeitado; a execução termina uma única vez", async () => {
    const deps = criarRuntimeDeps();
    const { run } = await submitRunAsUser(deps, gestor, nova());
    const t2 = trilha();
    let r2!: Awaited<ReturnType<typeof rodar>>;
    const lento: RunHandler = async (api) => {
      await api.step("a", { kind: "model", effectful: false, estimateMicroUsd: 100 }, async () => ({ result: { k: "a" }, costMicroUsd: 100 }));
      // o lease do w1 vence e o w2 retoma e conclui tudo
      deps.avancar((LEASE + 1) * 1000);
      r2 = await rodar(deps, t2.handler, "w2");
      // w1 acorda e tenta continuar: tentativa 1 está obsoleta
      await api.step("b", { kind: "model", effectful: false, estimateMicroUsd: 100 }, async () => ({ result: { k: "b" }, costMicroUsd: 100 }));
      return { kind: "completed" };
    };
    const r1 = await rodar(deps, lento, "w1");
    expect(r1).toMatchObject({ status: "lease_lost", attempt: 1 });
    expect(r2).toMatchObject({ status: "completed", attempt: 2 });
    expect(t2.chamadas).toEqual(["b", "c"]);
    const fim = deps.estado.runs.find((r) => r.id === run.id)!;
    expect(fim).toMatchObject({ status: "completed", attempt: 2, usage: { costMicroUsd: 300, turns: 3 } });
    expect(deps.estado.auditoria.filter((a) => a.action === "run.completed")).toHaveLength(1); // o obsoleto não audita conclusão
  });

  it("porta: heartbeat, passo, checkpoint e settle com tentativa/token antigos são rejeitados", async () => {
    const deps = criarRuntimeDeps();
    await submitRunAsUser(deps, gestor, nova());
    const w = <T>(f: Parameters<typeof deps.uow.withWorkerTransaction<T>>[2]) => deps.uow.withWorkerTransaction(TA, "t", f);
    const antigo = (await w((tx) => deps.runs.claimNext(tx, { tenantId: TA, workerId: "w1", now: deps.clock.now(), leaseSeconds: LEASE })))!;
    await w((tx) => deps.runs.beginStep(tx, { lease: antigo.lease, stepKey: "a", effectful: false, now: deps.clock.now() }));
    deps.avancar((LEASE + 1) * 1000);
    const novo = (await w((tx) => deps.runs.claimNext(tx, { tenantId: TA, workerId: "w2", now: deps.clock.now(), leaseSeconds: LEASE })))!;
    expect(novo.lease.attempt).toBe(2);
    expect(novo.lease.fencingToken).not.toBe(antigo.lease.fencingToken);
    const stale = { code: "RUN_ATTEMPT_STALE" };
    await expect(w((tx) => deps.runs.heartbeat(tx, { lease: antigo.lease, now: deps.clock.now(), leaseSeconds: LEASE }))).rejects.toMatchObject(stale);
    await expect(w((tx) => deps.runs.beginStep(tx, { lease: antigo.lease, stepKey: "b", effectful: false, now: deps.clock.now() }))).rejects.toMatchObject(stale);
    await expect(w((tx) => deps.runs.completeStep(tx, { lease: antigo.lease, stepKey: "a", result: 1, usageDelta: { costMicroUsd: 1, toolCalls: 0, turns: 1 }, now: deps.clock.now() }))).rejects.toMatchObject(stale);
    await expect(w((tx) => deps.runs.settle(tx, { lease: antigo.lease, outcome: { kind: "completed" }, now: deps.clock.now() }))).rejects.toMatchObject(stale);
    // mesma tentativa, token adulterado
    await expect(w((tx) => deps.runs.settle(tx, { lease: { ...novo.lease, fencingToken: "adulterado" }, outcome: { kind: "completed" }, now: deps.clock.now() }))).rejects.toMatchObject(stale);
    // lease de outra empresa não vale
    await expect(w((tx) => deps.runs.settle(tx, { lease: { ...novo.lease, tenantId: TB }, outcome: { kind: "completed" }, now: deps.clock.now() }))).rejects.toMatchObject(stale);
    expect(deps.estado.runs[0]).toMatchObject({ status: "running", attempt: 2, usage: { costMicroUsd: 0 } }); // nada do obsoleto vazou
  });

  it("passo repetido para o mesmo checkpoint não duplica checkpoint nem uso", async () => {
    const deps = criarRuntimeDeps();
    await submitRunAsUser(deps, gestor, nova());
    const w = <T>(f: Parameters<typeof deps.uow.withWorkerTransaction<T>>[2]) => deps.uow.withWorkerTransaction(TA, "t", f);
    const c = (await w((tx) => deps.runs.claimNext(tx, { tenantId: TA, workerId: "w1", now: deps.clock.now(), leaseSeconds: LEASE })))!;
    await w((tx) => deps.runs.beginStep(tx, { lease: c.lease, stepKey: "a", effectful: true, now: deps.clock.now() }));
    const delta = { costMicroUsd: 40, toolCalls: 1, turns: 0 };
    const um = await w((tx) => deps.runs.completeStep(tx, { lease: c.lease, stepKey: "a", result: "x", usageDelta: delta, now: deps.clock.now() }));
    const dois = await w((tx) => deps.runs.completeStep(tx, { lease: c.lease, stepKey: "a", result: "x", usageDelta: delta, now: deps.clock.now() }));
    expect([um.replayed, dois.replayed]).toEqual([false, true]);
    expect(dois.run.usage).toEqual({ costMicroUsd: 40, toolCalls: 1, turns: 0 });
    expect(await w((tx) => deps.runs.steps(tx, TA, c.run.id))).toHaveLength(1);
  });

  it("isolamento: worker de outra empresa não toma nem enxerga a execução", async () => {
    const deps = criarRuntimeDeps();
    const { run } = await submitRunAsUser(deps, gestor, nova());
    const { chamadas, handler } = trilha();
    await expect(rodar(deps, handler, "wb", TB)).resolves.toEqual({ status: "idle" });
    expect(chamadas).toEqual([]);
    await expect(getRun(deps, gestorB, run.id)).rejects.toMatchObject({ code: "RUN_NOT_FOUND" });
    await expect(listRuns(deps, gestorB)).resolves.toEqual([]);
    await expect(cancelRun(deps, gestorB, run.id, "x")).rejects.toMatchObject({ code: "RUN_NOT_FOUND" });
    expect(deps.estado.runs[0]!.status).toBe("queued");
  });

  it("cancelar durante a execução: o worker perde o lease e não grava mais nada", async () => {
    const deps = criarRuntimeDeps();
    const { run } = await submitRunAsUser(deps, gestor, nova());
    const h: RunHandler = async (api) => {
      await api.step("a", { kind: "model", effectful: false, estimateMicroUsd: 100 }, async () => ({ result: 1, costMicroUsd: 100 }));
      await cancelRun(deps, gestor, run.id, "pedido do cliente");
      await api.step("b", { kind: "model", effectful: false, estimateMicroUsd: 100 }, async () => ({ result: 2, costMicroUsd: 100 }));
      return { kind: "completed" };
    };
    expect(await rodar(deps, h)).toMatchObject({ status: "lease_lost" });
    expect(deps.estado.runs[0]).toMatchObject({ status: "cancelled", error: { code: "CANCELLED", message: "pedido do cliente" }, usage: { costMicroUsd: 100 } });
    await expect(cancelRun(deps, gestor, run.id, "de novo")).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    await expect(cancelRun(deps, gestor, run.id, " ")).rejects.toMatchObject({ code: "RUN_REJECTED" });
  });
});

describe("TST-14 — limites e kill switch", () => {
  const passo = (api: Parameters<RunHandler>[0], k: string, kind: "model" | "tool", est: number, custo: number, log: string[]) =>
    api.step(k, { kind, effectful: false, estimateMicroUsd: est }, async () => { log.push(k); return { result: k, costMicroUsd: custo }; });

  it("orçamento de custo esgotado bloqueia a PRÓXIMA chamada (e ela nunca acontece)", async () => {
    const deps = criarRuntimeDeps();
    await submitRunAsUser(deps, gestor, nova({ limits: { ...LIMITES, maxCostMicroUsd: 150 } }));
    const log: string[] = [];
    const r = await rodar(deps, async (api) => {
      await passo(api, "a", "model", 100, 100, log);
      await passo(api, "b", "model", 100, 100, log); // 100 + 100 > 150
      return { kind: "completed" };
    });
    expect(r).toMatchObject({ status: "failed", code: "RUN_BLOCKED_COST_EXHAUSTED" });
    expect(log).toEqual(["a"]);
    expect(deps.estado.runs[0]).toMatchObject({ status: "failed", needsHuman: true, usage: { costMicroUsd: 100 }, error: { code: "RUN_BLOCKED_COST_EXHAUSTED", retryable: false } });
    expect(deps.estado.auditoria.at(-1)).toMatchObject({ action: "run.blocked" });
  });

  it("custo real acima da estimativa também fecha a porta para a chamada seguinte", async () => {
    const deps = criarRuntimeDeps();
    await submitRunAsUser(deps, gestor, nova({ limits: { ...LIMITES, maxCostMicroUsd: 200 } }));
    const log: string[] = [];
    const r = await rodar(deps, async (api) => {
      await passo(api, "a", "model", 50, 190, log); // estimou 50, custou 190
      await passo(api, "b", "model", 50, 10, log);
      return { kind: "completed" };
    });
    expect(r).toMatchObject({ code: "RUN_BLOCKED_COST_EXHAUSTED" });
    expect(log).toEqual(["a"]);
  });

  it("limite de chamadas de ferramenta e de turnos", async () => {
    const d1 = criarRuntimeDeps();
    await submitRunAsUser(d1, gestor, nova({ limits: { ...LIMITES, maxToolCalls: 2 } }));
    const l1: string[] = [];
    expect(await rodar(d1, async (api) => {
      for (const k of ["t1", "t2", "t3"]) await passo(api, k, "tool", 0, 0, l1);
      return { kind: "completed" };
    })).toMatchObject({ code: "RUN_BLOCKED_TOOL_CALLS_EXHAUSTED" });
    expect(l1).toEqual(["t1", "t2"]);

    const d2 = criarRuntimeDeps();
    await submitRunAsUser(d2, gestor, nova({ limits: { ...LIMITES, maxTurns: 1 } }));
    const l2: string[] = [];
    expect(await rodar(d2, async (api) => {
      for (const k of ["m1", "m2"]) await passo(api, k, "model", 0, 0, l2);
      return { kind: "completed" };
    })).toMatchObject({ code: "RUN_BLOCKED_TURNS_EXHAUSTED" });
    expect(l2).toEqual(["m1"]);
  });

  it("tempo esgotado bloqueia a próxima chamada; o prazo é do run, não da tentativa", async () => {
    const deps = criarRuntimeDeps();
    await submitRunAsUser(deps, gestor, nova({ limits: { ...LIMITES, timeoutMs: 10_000 } }));
    const log: string[] = [];
    const r = await rodar(deps, async (api) => {
      await passo(api, "a", "model", 0, 0, log);
      deps.avancar(10_000);
      await passo(api, "b", "model", 0, 0, log);
      return { kind: "completed" };
    });
    expect(r).toMatchObject({ code: "RUN_BLOCKED_DEADLINE_EXCEEDED" });
    expect(log).toEqual(["a"]);
  });

  it("kill switch ativado no meio da execução bloqueia o próximo passo com o motivo", async () => {
    const deps = criarRuntimeDeps();
    await submitRunAsUser(deps, gestor, nova());
    const log: string[] = [];
    const r = await rodar(deps, async (api) => {
      await passo(api, "a", "model", 0, 0, log);
      await activateKillSwitch(deps, gestor, "incidente de custo");
      await passo(api, "b", "model", 0, 0, log);
      return { kind: "completed" };
    });
    expect(r).toMatchObject({ status: "failed", code: "RUN_BLOCKED_KILL_SWITCH" });
    expect(log).toEqual(["a"]);
    expect(deps.estado.runs[0]!.error!.message).toContain("incidente de custo");
    expect(deps.estado.auditoria.map((a) => a.action)).toContain("runtime.kill_switch.activate");
  });

  it("com o kill switch ativo nada novo começa; ao liberar, a fila segue", async () => {
    const deps = criarRuntimeDeps();
    await submitRunAsUser(deps, gestor, nova());
    await activateKillSwitch(deps, gestor, "manutenção");
    const { chamadas, handler } = trilha();
    const bloqueado = await rodar(deps, handler);
    expect(bloqueado).toMatchObject({ status: "blocked", reason: "KILL_SWITCH" });
    expect((bloqueado as { message: string }).message).toContain("manutenção");
    expect(chamadas).toEqual([]);
    expect(deps.estado.runs[0]).toMatchObject({ status: "queued", attempt: 0 }); // nem o lease foi tomado
    await releaseKillSwitch(deps, gestor);
    expect(await rodar(deps, handler)).toMatchObject({ status: "completed" });
  });

  it("kill switch global prevalece e vale para todas as empresas; o da empresa não vaza para a outra", async () => {
    const deps = criarRuntimeDeps();
    await submitRunAsUser(deps, gestor, nova());
    await submitRunAsUser(deps, gestorB, nova());
    await activateKillSwitch(deps, gestor, "só da A");
    const { handler } = trilha();
    expect(await rodar(deps, handler, "w", TA)).toMatchObject({ status: "blocked" });
    expect(await rodar(deps, handler, "w", TB)).toMatchObject({ status: "completed" });
    deps.estado.killGlobal = { active: true, scope: "global", reason: "parada geral" };
    await submitRunAsUser(deps, gestorB, nova());
    const g = await rodar(deps, handler, "w", TB);
    expect(g).toMatchObject({ status: "blocked", reason: "KILL_SWITCH" });
    expect((g as { message: string }).message).toContain("global");
  });

  it("acionar o kill switch exige permissão e motivo; leitor não aciona", async () => {
    const deps = criarRuntimeDeps();
    await expect(activateKillSwitch(deps, leitor, "x")).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    await expect(activateKillSwitch(deps, gestor, "  ")).rejects.toMatchObject({ code: "RUN_REJECTED" });
    await expect(releaseKillSwitch(deps, leitor)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(deps.estado.killTenant.size).toBe(0);
  });
});
