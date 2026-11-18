// I-04 S1 — regras de domínio de Estratégia e Operação (TST-01, TST-30, critérios de aceite do I-04).
// Importa o domínio por caminho relativo: a entrada pública `@oplyra/core/strategy` depende de uma
// mudança em arquivo governado (package.json) ainda não aprovada.
import { describe, it, expect } from "vitest";
import {
  ELEMENTOS_DO_METODO, metodoVazio, problemasEstruturaisDaCampanha, problemasDeAtivacaoDaCampanha,
  exigirCampanhaAtivavel, exigirCampanhaValida, exigirChaveEstavel, chaveDeRastreamentoValida,
  problemasDaHipotese, exigirHipoteseValida, exigirResultadoCoerente, problemasDoAprendizado,
  exigirResponsavelValido, exigirSemCiclo, gerarUtm, REGRA_DE_UTM,
  type CampaignContent, type ExperimentPlan,
} from "../../core/src/domain/strategy.ts";
import type { TaskId } from "../../core/src/domain/ids.ts";

const completa = (): CampaignContent => ({
  name: "Lançamento do módulo de relatórios",
  objectiveId: null,
  productKey: null,
  method: {
    situation: "Times de marketing montam relatórios à mão.",
    pain: "Perdem dois dias por semana consolidando dados.",
    consequence: "Decisões de mídia chegam atrasadas.",
    desire: "Decidir com dados do dia.",
    mechanism: "Relatório semanal gerado a partir das fontes conectadas.",
    proof: "Estudo de caso com redução de 60% do tempo.",
    offer: "Demonstração de 30 minutos.",
  },
  trackingKey: "lancamento-relatorios",
});
const plano = (over: Partial<ExperimentPlan> = {}): ExperimentPlan => ({
  hypothesis: "Abrir pela dor do atraso aumenta reuniões marcadas em relação a abrir pelo ganho de tempo.",
  dimension: "hook",
  dimensionNote: "",
  variants: ["Gancho pela dor do atraso", "Gancho pelo ganho de tempo"],
  decisionMetric: "reuniões marcadas",
  minimumSample: 30,
  ...over,
});
const t = (n: number) => `e0000000-0000-4000-8000-${String(n).padStart(12, "0")}` as TaskId;
const codigos = (xs: readonly { code: string }[]) => xs.map((x) => x.code);

describe("campanha — método obrigatório (TST-30, DEC-017)", () => {
  it("campanha completa é ativável", () => {
    expect(() => exigirCampanhaAtivavel(completa())).not.toThrow();
  });

  it.each(ELEMENTOS_DO_METODO)("ativar sem %s é recusado", (el) => {
    const c = { ...completa(), method: { ...completa().method, [el]: "   " } };
    expect(codigos(problemasDeAtivacaoDaCampanha(c))).toContain("METHOD_ELEMENT_REQUIRED");
    expect(() => exigirCampanhaAtivavel(c)).toThrowError(expect.objectContaining({ code: "CAMPAIGN_NOT_ACTIVATABLE" }));
  });

  it("rascunho incompleto é gravável; só a ativação cobra o método", () => {
    const rascunho: CampaignContent = { ...completa(), method: metodoVazio(), trackingKey: "", name: "" };
    expect(problemasEstruturaisDaCampanha(rascunho)).toEqual([]);
    expect(() => exigirCampanhaValida(rascunho)).not.toThrow();
    expect(codigos(problemasDeAtivacaoDaCampanha(rascunho))).toEqual(
      expect.arrayContaining(["NAME_REQUIRED", "TRACKING_KEY_REQUIRED", "METHOD_ELEMENT_REQUIRED"]),
    );
  });

  it("limites de tamanho valem desde o rascunho", () => {
    const c = { ...completa(), method: { ...completa().method, pain: "x".repeat(1001) } };
    expect(problemasEstruturaisDaCampanha(c)).toContainEqual(expect.objectContaining({ code: "TEXT_TOO_LONG", path: "method.pain" }));
  });
});

describe("chave de rastreamento (I-CMP)", () => {
  it.each(["abc", "lancamento-2027", "a1-b2-c3"])("aceita %s", (k) => expect(chaveDeRastreamentoValida(k)).toBe(true));
  it.each(["ab", "Maiuscula", "com espaço", "acento-ção", "fim-", "-ini", "a--b", "pessoa@exemplo.test", "x".repeat(61)])(
    "recusa %j", (k) => expect(chaveDeRastreamentoValida(k)).toBe(false),
  );

  it("muda livremente no rascunho e nunca depois da ativação", () => {
    expect(() => exigirChaveEstavel({ status: "draft", trackingKey: "a-b-c" }, "outra-chave")).not.toThrow();
    expect(() => exigirChaveEstavel({ status: "active", trackingKey: "a-b-c" }, "a-b-c")).not.toThrow();
    for (const status of ["active", "paused", "completed", "cancelled"] as const) {
      expect(() => exigirChaveEstavel({ status, trackingKey: "a-b-c" }, "outra-chave"))
        .toThrowError(expect.objectContaining({ code: "CAMPAIGN_TRACKING_KEY_IMMUTABLE" }));
    }
  });

  it("chave malformada é recusada já no rascunho", () => {
    expect(codigos(problemasEstruturaisDaCampanha({ ...completa(), trackingKey: "Com Espaço" }))).toContain("TRACKING_KEY_INVALID");
  });
});

describe("teste por hipótese (I-HYP)", () => {
  it("plano completo é aceito", () => {
    expect(() => exigirHipoteseValida(plano())).not.toThrow();
  });

  it("exige hipótese declarada, dimensão, métrica e amostra mínima", () => {
    const c = codigos(problemasDaHipotese(plano({ hypothesis: " ", decisionMetric: "", minimumSample: 0 })));
    expect(c).toEqual(expect.arrayContaining(["HYPOTHESIS_REQUIRED", "DECISION_METRIC_REQUIRED", "MINIMUM_SAMPLE_INVALID"]));
    expect(() => exigirHipoteseValida(plano({ hypothesis: "" }))).toThrowError(expect.objectContaining({ code: "EXPERIMENT_HYPOTHESIS_INVALID" }));
  });

  it("variação cosmética não é teste: uma variante, vazia ou repetida", () => {
    expect(codigos(problemasDaHipotese(plano({ variants: ["única"] })))).toContain("VARIANTS_REQUIRED");
    expect(codigos(problemasDaHipotese(plano({ variants: ["Gancho A", " gancho a "] })))).toContain("VARIANT_DUPLICATE");
    expect(codigos(problemasDaHipotese(plano({ variants: ["Gancho A", ""] })))).toContain("VARIANT_EMPTY");
  });

  it("dimensão `other` exige descrição; dimensão desconhecida é recusada", () => {
    expect(codigos(problemasDaHipotese(plano({ dimension: "other", dimensionNote: "" })))).toContain("DIMENSION_NOTE_REQUIRED");
    expect(problemasDaHipotese(plano({ dimension: "other", dimensionNote: "ordem das provas" }))).toEqual([]);
    expect(codigos(problemasDaHipotese(plano({ dimension: "cor" as never })))).toContain("DIMENSION_INVALID");
  });

  it("amostra não inteira não vale", () => {
    expect(codigos(problemasDaHipotese(plano({ minimumSample: 1.5 })))).toContain("MINIMUM_SAMPLE_INVALID");
    expect(codigos(problemasDaHipotese(plano({ minimumSample: Number.NaN })))).toContain("MINIMUM_SAMPLE_INVALID");
  });
});

describe("resultado do teste (I-HYP)", () => {
  const p = { minimumSample: 30 };
  it("sem amostra suficiente só é aceito como inconclusivo, com a limitação", () => {
    expect(() => exigirResultadoCoerente(p, { outcome: "supported", observedSample: 29, limitations: "" }))
      .toThrowError(expect.objectContaining({ code: "EXPERIMENT_RESULT_INVALID" }));
    expect(() => exigirResultadoCoerente(p, { outcome: "refuted", observedSample: 0, limitations: "" }))
      .toThrowError(expect.objectContaining({ code: "EXPERIMENT_RESULT_INVALID" }));
    expect(() => exigirResultadoCoerente(p, { outcome: "inconclusive", observedSample: 29, limitations: "" }))
      .toThrowError(expect.objectContaining({ code: "EXPERIMENT_RESULT_INVALID" }));
    expect(() => exigirResultadoCoerente(p, { outcome: "inconclusive", observedSample: 29, limitations: "Janela de 3 dias." })).not.toThrow();
  });

  it("com a amostra mínima, aceita suportada e refutada", () => {
    for (const outcome of ["supported", "refuted"] as const) {
      expect(() => exigirResultadoCoerente(p, { outcome, observedSample: 30, limitations: "" })).not.toThrow();
    }
  });

  it("recusa resultado desconhecido e amostra inválida", () => {
    expect(() => exigirResultadoCoerente(p, { outcome: "sucesso" as never, observedSample: 40, limitations: "" })).toThrow();
    expect(() => exigirResultadoCoerente(p, { outcome: "supported", observedSample: -1, limitations: "" })).toThrow();
    expect(() => exigirResultadoCoerente(p, { outcome: "supported", observedSample: 40.5, limitations: "" })).toThrow();
  });

  it("aprendizado cita evidência e versão", () => {
    expect(problemasDoAprendizado({ summary: "Dor do atraso converte mais.", evidence: ["https://exemplo.test/teste"], campaignVersion: 2 })).toEqual([]);
    expect(codigos(problemasDoAprendizado({ summary: "", evidence: [], campaignVersion: 0 })))
      .toEqual(["LEARNING_SUMMARY_REQUIRED", "LEARNING_EVIDENCE_REQUIRED", "LEARNING_VERSION_REQUIRED"]);
    expect(codigos(problemasDoAprendizado({ summary: "x", evidence: [" "], campaignVersion: 1 }))).toContain("LEARNING_EVIDENCE_REQUIRED");
  });
});

describe("tarefas", () => {
  it("dependências sem ciclo são aceitas", () => {
    const g = new Map<TaskId, readonly TaskId[]>([[t(2), [t(1)]], [t(3), [t(2)]]]);
    expect(() => exigirSemCiclo(g, t(4), [t(3), t(1)])).not.toThrow();
    expect(() => exigirSemCiclo(g, t(1), [])).not.toThrow();
  });

  it("recusa auto-dependência, ciclo direto e ciclo transitivo", () => {
    const g = new Map<TaskId, readonly TaskId[]>([[t(2), [t(1)]], [t(3), [t(2)]]]);
    const ciclo = expect.objectContaining({ code: "TASK_DEPENDENCY_CYCLE" });
    expect(() => exigirSemCiclo(g, t(1), [t(1)])).toThrowError(ciclo);
    expect(() => exigirSemCiclo(g, t(1), [t(2)])).toThrowError(ciclo);
    expect(() => exigirSemCiclo(g, t(1), [t(3)])).toThrowError(ciclo);
  });

  it("termina em grafo com diamante e com ciclo preexistente alheio", () => {
    const g = new Map<TaskId, readonly TaskId[]>([[t(2), [t(1)]], [t(3), [t(1)]], [t(4), [t(2), t(3)]], [t(8), [t(9)]], [t(9), [t(8)]]]);
    expect(() => exigirSemCiclo(g, t(5), [t(4)])).not.toThrow();
    expect(() => exigirSemCiclo(g, t(5), [t(8)])).not.toThrow();
  });

  it("responsável agente só se habilitado", () => {
    const habilitados = new Set(["copywriting"]);
    expect(() => exigirResponsavelValido(null, habilitados)).not.toThrow();
    expect(() => exigirResponsavelValido({ kind: "agent", agentKey: "copywriting" }, habilitados)).not.toThrow();
    expect(() => exigirResponsavelValido({ kind: "agent", agentKey: "design" }, habilitados))
      .toThrowError(expect.objectContaining({ code: "TASK_ASSIGNEE_INVALID" }));
    expect(() => exigirResponsavelValido({ kind: "user", userId: "" }, habilitados)).toThrow();
    expect(() => exigirResponsavelValido({ kind: "user", userId: "u-1" }, habilitados)).not.toThrow();
  });
});

describe("UTM (06 §11.1)", () => {
  const base = { baseUrl: "https://exemplo.test/demo", channel: "meta_ads", trackingKey: "lancamento-relatorios", content: "hook-a-v2" } as const;

  it("usa a chave como utm_campaign e preserva o original e a versão da regra", () => {
    const r = gerarUtm(base);
    expect(r.params).toEqual({
      utm_source: "meta", utm_medium: "paid-social", utm_campaign: "lancamento-relatorios", utm_content: "hook-a-v2",
    });
    expect(new URL(r.url).searchParams.get("utm_campaign")).toBe("lancamento-relatorios");
    expect(r.originalUrl).toBe(base.baseUrl);
    expect(r.ruleVersion).toBe(REGRA_DE_UTM);
  });

  it("preserva parâmetros e âncora existentes", () => {
    const r = gerarUtm({ ...base, baseUrl: "https://exemplo.test/demo?plano=pro#form" });
    const u = new URL(r.url);
    expect(u.searchParams.get("plano")).toBe("pro");
    expect(u.hash).toBe("#form");
  });

  it("recusa utm_* preexistente em vez de sobrescrever", () => {
    expect(() => gerarUtm({ ...base, baseUrl: "https://exemplo.test/?UTM_Source=x" })).toThrowError(expect.objectContaining({ code: "UTM_INVALID" }));
  });

  it("sem PII: conteúdo e chave só em slug; sem credenciais na URL", () => {
    expect(() => gerarUtm({ ...base, content: "ana@exemplo.test" })).toThrow();
    expect(() => gerarUtm({ ...base, content: "Ana Souza" })).toThrow();
    expect(() => gerarUtm({ ...base, trackingKey: "ana@exemplo.test" })).toThrow();
    expect(() => gerarUtm({ ...base, baseUrl: "https://user:senha@exemplo.test/" })).toThrow();
  });

  it("recusa canal desconhecido, URL inválida e esquema não web", () => {
    expect(() => gerarUtm({ ...base, channel: "tiktok" as never })).toThrow();
    expect(() => gerarUtm({ ...base, baseUrl: "não é url" })).toThrow();
    expect(() => gerarUtm({ ...base, baseUrl: "javascript:alert(1)" })).toThrow();
    expect(() => gerarUtm({ ...base, baseUrl: "ftp://exemplo.test/" })).toThrow();
  });

  it("cada canal tem source e medium próprios", () => {
    const por = (channel: "meta_ads" | "google_ads" | "linkedin_ads" | "email") => gerarUtm({ ...base, channel }).params;
    expect(por("google_ads")).toMatchObject({ utm_source: "google", utm_medium: "cpc" });
    expect(por("linkedin_ads")).toMatchObject({ utm_source: "linkedin" });
    expect(por("email")).toMatchObject({ utm_medium: "email" });
  });
});
