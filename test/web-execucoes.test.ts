// Apresentação da tela de execuções (I-02, 14 F-10). Funções puras, sem Next nem navegador.
import { describe, it, expect } from "vitest";
import {
  rascunhoDeCopy, lerLimite, proximoLimite, paginar, LIMITE_PADRAO, LIMITE_MAXIMO, lerFiltro, filtrar, escalonadas, formatarCusto, formatarDuracao, objetoDaExecucao, resumirPassos, resumirContexto, descreverEscalonamento,
  ROTULO_EXECUCAO, SELO_EXECUCAO, type AgentRun, type StepRecord,
} from "../apps/web/src/lib/execucoes.ts";
import { ERRO_EFEITO_INCERTO } from "../packages/core/src/runtime/domain.ts";

const run = (over: Partial<AgentRun> = {}): AgentRun => ({
  id: "r1", tenantId: "t1", agentKey: "copywriting-agent", actionKey: "create_ad_copy", trigger: "user", autonomy: "draft", status: "queued",
  correlationId: "c", causationId: null, workflowId: null, taskId: null, idempotencyKey: "k", input: {},
  limits: { maxCostMicroUsd: 1, maxToolCalls: 1, maxTurns: 1, maxAttempts: 1, timeoutMs: 1 }, attempt: 0,
  usage: { costMicroUsd: 0, toolCalls: 0, turns: 0 }, deadlineAt: null, availableAt: new Date(0), leaseOwner: null, leaseExpiresAt: null,
  fencingToken: null, needsHuman: false, error: null, createdAt: new Date(0), startedAt: null, finishedAt: null, ...over,
} as AgentRun);

describe("filtros", () => {
  const todas = [run({ status: "queued" }), run({ status: "running" }), run({ status: "failed" }), run({ status: "cancelled" }), run({ status: "completed" })];
  it("cada filtro separa os estados esperados", () => {
    expect(filtrar(todas, "abertas").map((r) => r.status)).toEqual(["queued", "running"]);
    expect(filtrar(todas, "falhas").map((r) => r.status)).toEqual(["failed", "cancelled"]);
    expect(filtrar(todas, "concluidas").map((r) => r.status)).toEqual(["completed"]);
    expect(filtrar(todas, "todas")).toHaveLength(5);
  });
  it("valor inesperado na URL cai no padrão", () => {
    expect(lerFiltro("abertas")).toBe("abertas");
    expect(lerFiltro("<script>")).toBe("todas");
    expect(lerFiltro(undefined)).toBe("todas");
  });
  it("todo estado tem rótulo e selo (nunca só cor)", () => {
    for (const s of ["queued", "running", "waiting_approval", "completed", "failed", "cancelled"] as const) {
      expect(ROTULO_EXECUCAO[s]).toBeTruthy();
      expect(SELO_EXECUCAO[s]).toMatch(/^selo /);
    }
  });
});

describe("paginação", () => {
  it("lê o limite da URL: inválido, pequeno ou gigante vira valor seguro", () => {
    expect(lerLimite(undefined)).toBe(LIMITE_PADRAO);
    for (const ruim of ["", "abc", "-5", "1.5", "99999", "<script>"]) expect(lerLimite(ruim) >= LIMITE_PADRAO && lerLimite(ruim) <= LIMITE_MAXIMO, ruim).toBe(true);
    expect(lerLimite("abc")).toBe(LIMITE_PADRAO);
    expect(lerLimite("10")).toBe(LIMITE_PADRAO);
    expect(lerLimite("100")).toBe(100);
    expect(lerLimite("9999")).toBe(LIMITE_MAXIMO);
  });
  it("o limite pedido ao servidor (limite + 1) nunca passa de 200", () => {
    expect(LIMITE_MAXIMO + 1).toBeLessThanOrEqual(200);
  });
  it("o próximo limite sobe de 50 em 50 e para no máximo", () => {
    expect(proximoLimite(50)).toBe(100);
    expect(proximoLimite(150)).toBe(LIMITE_MAXIMO);
    expect(proximoLimite(LIMITE_MAXIMO)).toBeNull();
  });
  it("separa o excedente: recebendo limite+1, mostra `limite` e sinaliza que há mais", () => {
    const itens = Array.from({ length: 51 }, (_, i) => i);
    expect(paginar(itens, 50)).toMatchObject({ haMais: true });
    expect(paginar(itens, 50).visiveis).toHaveLength(50);
    expect(paginar(itens.slice(0, 50), 50)).toMatchObject({ haMais: false });
    expect(paginar([], 50)).toEqual({ visiveis: [], haMais: false });
  });
});

describe("escalonamento", () => {
  it("só falha com `needsHuman` é escalonada", () => {
    const lista = [run({ status: "failed", needsHuman: true }), run({ status: "failed" }), run({ status: "completed", needsHuman: true })];
    expect(escalonadas(lista)).toHaveLength(1);
  });
  it("efeito incerto explica por que não repetiu e manda conferir o destino", () => {
    const d = descreverEscalonamento(run({ status: "failed", needsHuman: true, error: { ...ERRO_EFEITO_INCERTO, message: "x" } }));
    expect(d.motivo).toContain("não repetir");
    expect(d.acoes[0]).toContain("Confira");
  });
  it("bloqueio e esgotamento usam a mensagem registrada ou um texto fixo", () => {
    expect(descreverEscalonamento(run({ error: { code: "RUN_BLOCKED_KILL_SWITCH", category: "governance", retryable: false, message: "IA interrompida" } })).motivo).toBe("IA interrompida");
    expect(descreverEscalonamento(run({ error: { code: "RETRY_ATTEMPTS_EXHAUSTED", category: "system", retryable: false, message: "m" } })).motivo).toContain("esgotaram");
  });
});

describe("formatação", () => {
  it("custo em dólares sem esconder frações pequenas", () => {
    expect(formatarCusto(0)).toBe("US$ 0,00");
    expect(formatarCusto(1_000)).toBe("US$ 0,001");
    expect(formatarCusto(12_300)).toBe("US$ 0,0123");
    expect(formatarCusto(1_500_000)).toBe("US$ 1,50");
  });
  it("duração: sem início é traço; em andamento usa o relógio", () => {
    const t = new Date("2026-11-11T10:00:00Z");
    expect(formatarDuracao(null, null, t)).toBe("—");
    expect(formatarDuracao(t, new Date("2026-11-11T10:00:42Z"), t)).toBe("42 s");
    expect(formatarDuracao(t, null, new Date("2026-11-11T10:03:05Z"))).toBe("3 min 5 s");
    expect(formatarDuracao(t, new Date("2026-11-11T12:10:00Z"), t)).toBe("2 h 10 min");
  });
  it("objeto: tarefa, fluxo ou ação", () => {
    expect(objetoDaExecucao(run({ taskId: "abcdef12-0000" }))).toBe("Tarefa abcdef12");
    expect(objetoDaExecucao(run({ workflowId: "schedule:checkin" }))).toBe("Fluxo schedule:checkin");
    expect(objetoDaExecucao(run())).toBe("create_ad_copy");
  });
});

describe("rascunho de copy a partir dos checkpoints", () => {
  const passo = (stepKey: string, result: unknown): StepRecord => ({ stepKey, attempt: 1, effectful: false, startedAt: new Date(0), checkpoint: { result, at: new Date(0) }, abortedAt: null });
  const verify = passo("verify", {
    result: { verdict: "passed_with_notes", checks: [], findings: [{ check: "claim_safety_terms", severity: "note", variantId: "v1", message: "contém o termo de cautela \"sempre\"" }] },
    variants: [{ id: "v1", headline: "Relatórios sempre prontos", primaryText: "Menos tempo.", cta: "Agende", role: "reference" }],
  });
  it("lê veredito, achados, variantes e a referência do rascunho gravado; nunca expõe aprovação", () => {
    const r = rascunhoDeCopy([verify, passo("persist", { draftRef: "draft-copy-1", version: 1, persistence: "created" })])!;
    expect(r).toMatchObject({ veredito: "passed_with_notes", rascunho: "draft-copy-1" });
    expect(r.achados).toEqual([{ regra: "claim_safety_terms", gravidade: "note", variante: "v1", mensagem: expect.stringContaining("sempre") }]);
    expect(r.variantes).toEqual([{ id: "v1", titulo: "Relatórios sempre prontos", texto: "Menos tempo.", cta: "Agende", papel: "reference" }]);
    expect(JSON.stringify(r)).not.toMatch(/aprovad|approved/i);
  });
  it("lê a revisão independente quando o passo existe; sem ele, lista vazia", () => {
    const rev = passo("review", { status: "changes_required", reviews: [{ gateType: "claim_gate", gateStatus: "changes_required", reviewerAgent: "strategy-quality-agent", limitations: [{ description: "agentic não executada" }] }] });
    expect(rascunhoDeCopy([verify, rev])!.revisoes).toEqual([{ gate: "claim_gate", status: "changes_required", revisor: "strategy-quality-agent", limitacao: "agentic não executada" }]);
    expect(rascunhoDeCopy([verify])!.revisoes).toEqual([]);
  });
  it("sem passo de gravação, o rascunho é nulo; sem verificação ou com veredito desconhecido, não há rascunho", () => {
    expect(rascunhoDeCopy([verify])!.rascunho).toBeNull();
    expect(rascunhoDeCopy([])).toBeNull();
    expect(rascunhoDeCopy([passo("verify", { result: { verdict: "approved" }, variants: [] })])).toBeNull();
    expect(rascunhoDeCopy([passo("verify", "lixo")])).toBeNull();
  });
});

describe("passos e contexto", () => {
  const passo = (o: Partial<StepRecord>): StepRecord => ({ stepKey: "s", attempt: 1, effectful: false, startedAt: new Date(0), checkpoint: null, abortedAt: null, ...o });
  it("resume concluídos, interrompidos com falha conhecida e em aberto", () => {
    expect(resumirPassos([passo({ checkpoint: { result: 1, at: new Date(0) } }), passo({ abortedAt: new Date(0) }), passo({})])).toEqual({ total: 3, concluidos: 1, abortados: 1, emAberto: 1 });
  });
  it("resume o contexto sem expor dados das camadas", () => {
    const r = resumirContexto({ contextPackage: { id: "ctx_1", metadata: { resolution: "execute" }, layers: { l0: { status: "included", data: { segredo: "x" } }, l2: { status: "missing" } } } });
    expect(r).toEqual({ id: "ctx_1", resolucao: "execute", camadas: [{ camada: "L0", estado: "included" }, { camada: "L2", estado: "missing" }] });
    expect(JSON.stringify(r)).not.toContain("segredo");
    expect(resumirContexto({})).toBeNull();
    expect(resumirContexto({ contextPackage: "lixo" })).toBeNull();
  });
});
