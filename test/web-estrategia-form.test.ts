// Parsers dos formulários de Estratégia e Operação (I-04, S4). Sem Next nem navegador.
import { describe, it, expect } from "vitest";
import {
  lerCampanha, lerObjetivo, lerPlano, lerResultado, lerTarefa, lerRevisao, lerId, numeroDeTexto, FormularioInvalido,
  destinoDeErro, MENSAGENS_ESTRATEGIA,
} from "../apps/web/src/lib/estrategia-form.ts";
import { problemasDoObjetivo, problemasDaHipotese, ELEMENTOS_DO_METODO } from "../apps/web/src/lib/estrategia.ts";

const UUID = "c0000001-0000-4000-8000-000000000001";
const form = (campos: Record<string, string | string[]>): FormData => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  return f;
};
const metodo = Object.fromEntries(ELEMENTOS_DO_METODO.map((e) => [`m_${e}`, `texto ${e}`]));

describe("campanha", () => {
  it("lê o método, a chave e as referências opcionais", () => {
    const c = lerCampanha(form({ name: "Lançamento", trackingKey: "  lancamento-x  ", objectiveId: UUID, productKey: "", ...metodo }));
    expect(c).toMatchObject({ name: "Lançamento", trackingKey: "lancamento-x", objectiveId: UUID, productKey: null });
    expect(c.method.offer).toBe("texto offer");
    expect(Object.keys(c.method)).toHaveLength(7);
  });
  it("referência que não é UUID é formulário adulterado", () => {
    expect(() => lerCampanha(form({ name: "x", objectiveId: "não-é-uuid", ...metodo }))).toThrow(FormularioInvalido);
    expect(() => lerCampanha(form({ name: "x", productKey: "1; drop table", ...metodo }))).toThrow(FormularioInvalido);
  });
  it("campos ausentes viram vazios (o domínio cobra na ativação), não exceção", () => {
    const c = lerCampanha(form({}));
    expect(c).toMatchObject({ name: "", trackingKey: "", objectiveId: null, productKey: null });
    expect(c.method.pain).toBe("");
  });
});

describe("objetivo", () => {
  const base = { name: "Demanda", description: "", periodStart: "2026-10-01", periodEnd: "2026-12-31", k_n: "3" };
  it("ignora linhas de indicador em branco e aceita vírgula decimal", () => {
    const o = lerObjetivo(form({ ...base, k_key_0: "reunioes", k_name_0: "Reuniões", k_metric_0: "reuniões", k_unit_0: "un", k_target_0: "20,5" }));
    expect(o.kpis).toEqual([{ key: "reunioes", name: "Reuniões", metric: "reuniões", unit: "un", target: 20.5 }]);
    expect(problemasDoObjetivo(o)).toEqual([]);
  });
  it("alvo não numérico chega ao domínio como NaN e é recusado com o ponto", () => {
    const o = lerObjetivo(form({ ...base, k_key_0: "a", k_name_0: "A", k_metric_0: "m", k_unit_0: "u", k_target_0: "muitos" }));
    expect(Number.isNaN(o.kpis[0]!.target)).toBe(true);
    expect(problemasDoObjetivo(o).map((p) => p.code)).toContain("KPI_TARGET_INVALID");
  });
  it("contagem de linhas adulterada é recusada", () => {
    expect(() => lerObjetivo(form({ ...base, k_n: "9999" }))).toThrow(FormularioInvalido);
    expect(() => lerObjetivo(form({ ...base, k_n: "-1" }))).toThrow(FormularioInvalido);
    expect(() => lerObjetivo(form({ ...base, k_n: "x" }))).toThrow(FormularioInvalido);
  });
});

describe("plano de teste e resultado", () => {
  const plano = { hypothesis: "H", dimension: "hook", dimensionNote: "", variants: "A\n\n  B  \r\nC", decisionMetric: "reuniões", minimumSample: "30" };
  it("separa as variantes por linha, descartando linhas vazias", () => {
    const p = lerPlano(form(plano));
    expect(p.variants).toEqual(["A", "B", "C"]);
    expect(p.minimumSample).toBe(30);
    expect(problemasDaHipotese(p)).toEqual([]);
  });
  it("dimensão fora da lista é formulário adulterado", () => {
    expect(() => lerPlano(form({ ...plano, dimension: "cor" }))).toThrow(FormularioInvalido);
  });
  it("amostra não numérica chega como NaN e o domínio recusa", () => {
    expect(problemasDaHipotese(lerPlano(form({ ...plano, minimumSample: "trinta" }))).map((p) => p.code)).toContain("MINIMUM_SAMPLE_INVALID");
  });
  it("aprendizado só existe se algum campo dele foi preenchido", () => {
    const sem = lerResultado(form({ outcome: "inconclusive", observedSample: "5", limitations: "curto", learningVersion: "" }));
    expect(sem.learning).toBeNull();
    // a versão vem pré-preenchida pela tela e, sozinha, não cria aprendizado
    expect(lerResultado(form({ outcome: "inconclusive", observedSample: "5", limitations: "curto", learningVersion: "3" })).learning).toBeNull();
    // resumo sem evidência chega ao domínio, que o recusa
    expect(lerResultado(form({ outcome: "supported", observedSample: "40", learningSummary: "ok", learningVersion: "1" })).learning)
      .toEqual({ summary: "ok", evidence: [], campaignVersion: 1 });
    const com = lerResultado(form({ outcome: "supported", observedSample: "40", limitations: "", learningSummary: "ok", learningEvidence: "https://a.test\nnota", learningVersion: "2" }));
    expect(com.learning).toEqual({ summary: "ok", evidence: ["https://a.test", "nota"], campaignVersion: 2 });
  });
  it("resultado desconhecido é formulário adulterado", () => {
    expect(() => lerResultado(form({ outcome: "sucesso", observedSample: "5" }))).toThrow(FormularioInvalido);
  });
});

describe("tarefa", () => {
  it("lê prazo, campanha e várias dependências; nunca atribui agente", () => {
    const t = lerTarefa(form({ title: "T", description: "", campaignId: UUID, dueDate: "2026-11-30", dep: [UUID, "c0000002-0000-4000-8000-000000000002"] }));
    expect(t).toMatchObject({ title: "T", campaignId: UUID, dueDate: "2026-11-30", assignee: null });
    expect(t.dependsOn).toHaveLength(2);
  });
  it("prazo vazio vira nulo; dependência adulterada é recusada", () => {
    expect(lerTarefa(form({ title: "T", dueDate: " " })).dueDate).toBeNull();
    expect(() => lerTarefa(form({ title: "T", dep: ["x"] }))).toThrow(FormularioInvalido);
  });
  it("mesmo que o formulário envie um responsável, ele é ignorado", () => {
    expect(lerTarefa(form({ title: "T", assignee: "agent:copywriting", assigneeKind: "agent", assigneeRef: "copywriting" })).assignee).toBeNull();
  });
});

describe("auxiliares", () => {
  it("revisão e ids obrigatórios", () => {
    expect(lerRevisao(form({ revisao: "3" }))).toBe(3);
    for (const r of ["0", "-1", "1.5", "", "x"]) expect(() => lerRevisao(form({ revisao: r }))).toThrow(FormularioInvalido);
    expect(lerId(form({ x: UUID }), "x")).toBe(UUID);
    expect(() => lerId(form({}), "x")).toThrow(FormularioInvalido);
  });
  it("numeroDeTexto", () => {
    expect(numeroDeTexto(" 1,5 ")).toBe(1.5);
    expect(Number.isNaN(numeroDeTexto(""))).toBe(true);
  });
  it("o destino de erro usa só o código e os pontos do domínio, nunca a mensagem interna", () => {
    const e = Object.assign(new Error("segredo interno"), { code: "CAMPAIGN_NOT_ACTIVATABLE", issues: [{ code: "X", path: "method.pain", message: "informe: pain" }] });
    const url = destinoDeErro("/e/t/estrategia", e);
    expect(url).toContain("erro=CAMPAIGN_NOT_ACTIVATABLE");
    expect(url).not.toContain("segredo");
    expect(decodeURIComponent(url)).toContain("method.pain");
  });
  it("todo código de erro de estratégia tem mensagem em português", () => {
    for (const cod of ["CAMPAIGN_NOT_ACTIVATABLE", "CAMPAIGN_TRACKING_KEY_TAKEN", "EXPERIMENT_RESULT_INVALID", "TASK_DEPENDENCY_CYCLE", "PERMISSION_DENIED"]) {
      expect(MENSAGENS_ESTRATEGIA[cod]).toBeTruthy();
    }
  });
});
