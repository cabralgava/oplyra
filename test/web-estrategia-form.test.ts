// Parser dos formulários da Estratégia (I-04). Sem Next nem navegador.
import { describe, it, expect } from "vitest";
import {
  reaisParaCentavos, centavosParaReais, centavosParaCampo, numeroDoCampo, lerObjetivoDoFormulario, lerPersonaDoFormulario,
  lerCampanhaDoFormulario, lerTesteDoFormulario, estadoDaCampanha, idDoFormulario, revisaoDoFormulario, rotuloDoCaminhoEstrategia,
} from "../apps/web/src/lib/estrategia-form.ts";
import { FormularioInvalido } from "../apps/web/src/lib/marca-form.ts";

const O = "05000000-0000-4000-8000-000000000001";
const P = "c0000001-0000-4000-8000-000000000001";
const PE = "05100000-0000-4000-8000-000000000001";
const form = (c: Record<string, string>): FormData => {
  const f = new FormData();
  for (const [k, v] of Object.entries(c)) f.set(k, v);
  return f;
};

describe("valores em reais", () => {
  it("converte formatos brasileiros para centavos inteiros", () => {
    expect(reaisParaCentavos("5000")).toBe(500000);
    expect(reaisParaCentavos("5.000,50")).toBe(500050);
    expect(reaisParaCentavos("R$ 1.234.567,89")).toBe(123456789);
    expect(reaisParaCentavos("0,5")).toBe(50);
    expect(reaisParaCentavos("12,3")).toBe(1230);
  });
  it("recusa o que não é valor monetário (vira NaN para o domínio recusar)", () => {
    for (const ruim of ["", "abc", "-5", "5,555", "1,000.50", "5.00", "1e3", "10,5,5"]) expect(reaisParaCentavos(ruim), ruim).toBeNaN();
  });
  it("formata de volta", () => {
    expect(centavosParaCampo(500050)).toBe("5000,50");
    expect(centavosParaReais(500050).replace(/\s/g, " ")).toBe("R$ 5.000,50");
  });
  it("número de indicador aceita vírgula e rejeita lixo", () => {
    expect(numeroDoCampo("2,5")).toBe(2.5);
    expect(numeroDoCampo(" 120 ")).toBe(120);
    for (const ruim of ["", "x", "-1", "1,2,3", "Infinity"]) expect(numeroDoCampo(ruim), ruim).toBeNaN();
  });
});

describe("objetivo, persona e teste", () => {
  it("lê objetivo com indicadores e ignora linhas de indicador em branco", () => {
    const o = lerObjetivoDoFormulario(form({
      nome: "Gerar demanda", descricao: "d", inicio: "2026-11-01", fim: "2026-12-31",
      k_name_0: "Leads", k_unit_0: "leads", k_target_0: "120", k_name_1: "", k_unit_1: "", k_target_1: "", k_name_2: "Conversão", k_unit_2: "%", k_target_2: "2,5",
    }));
    expect(o).toEqual({
      nome: "Gerar demanda", descricao: "d", periodo: { inicio: "2026-11-01", fim: "2026-12-31" },
      kpis: [{ nome: "Leads", unidade: "leads", alvo: 120 }, { nome: "Conversão", unidade: "%", alvo: 2.5 }],
    });
  });
  it("indicador com alvo inválido chega ao domínio como NaN", () => {
    expect(lerObjetivoDoFormulario(form({ nome: "x", k_name_0: "L", k_target_0: "muitos" })).kpis[0]!.alvo).toBeNaN();
  });
  it("persona e teste", () => {
    expect(lerPersonaDoFormulario(form({ nome: "P", descricao: "d", dores: "x", objecoes: "y" }))).toEqual({ nome: "P", descricao: "d", dores: "x", objecoes: "y" });
    expect(lerTesteDoFormulario(form({ hipotese: "H", dimensao: "hook", nota: "" }))).toEqual({ hipotese: "H", dimensao: "hook", notaDaDimensao: "" });
  });
});

describe("campanha", () => {
  const base = {
    nome: "Lançamento", objetivo: O, produto: P, persona: "", inicio: "2026-11-01", fim: "2026-12-31", orcamento: "5.000,00", mensagem: "Veja",
    m_situacao: "s", m_dor: "d", m_consequencia: "c", m_desejo: "e", m_mecanismo: "m", m_prova: "p", m_oferta: "o",
  };
  it("lê o plano completo", () => {
    expect(lerCampanhaDoFormulario(form(base))).toEqual({
      nome: "Lançamento", objectiveId: O, productKey: P, personaId: null,
      metodo: { situacao: "s", dor: "d", consequencia: "c", desejo: "e", mecanismo: "m", prova: "p", oferta: "o" },
      periodo: { inicio: "2026-11-01", fim: "2026-12-31" }, orcamento: { centavos: 500000, moeda: "BRL" }, mensagemChave: "Veja",
    });
    expect(lerCampanhaDoFormulario(form({ ...base, persona: PE, orcamento: "" }))).toMatchObject({ personaId: PE, orcamento: null });
  });
  it("método ausente vira texto vazio; orçamento inválido chega como NaN", () => {
    const p = lerCampanhaDoFormulario(form({ ...base, m_dor: "", orcamento: "muito" }));
    expect(p.metodo.dor).toBe("");
    expect(p.orcamento!.centavos).toBeNaN();
  });
  it("recusa ids adulterados", () => {
    expect(() => lerCampanhaDoFormulario(form({ ...base, objetivo: "x" }))).toThrow(FormularioInvalido);
    expect(() => lerCampanhaDoFormulario(form({ ...base, produto: "" }))).toThrow(FormularioInvalido);
    expect(() => lerCampanhaDoFormulario(form({ ...base, persona: "nao-uuid" }))).toThrow(FormularioInvalido);
  });
  it("estado, id e revisão do formulário", () => {
    expect(estadoDaCampanha(form({ para: "paused" }))).toBe("paused");
    expect(() => estadoDaCampanha(form({ para: "planned" }))).toThrow(FormularioInvalido);
    expect(() => estadoDaCampanha(form({ para: "x" }))).toThrow(FormularioInvalido);
    expect(idDoFormulario(form({ id: O }), "id")).toBe(O);
    expect(() => idDoFormulario(form({ id: "" }), "id")).toThrow(FormularioInvalido);
    expect(revisaoDoFormulario(form({ revisao: "3" }))).toBe(3);
    for (const ruim of ["0", "-1", "x", "1.5", ""]) expect(() => revisaoDoFormulario(form({ revisao: ruim })), ruim).toThrow(FormularioInvalido);
  });
});

describe("rótulos dos problemas", () => {
  it("traduz caminhos do domínio", () => {
    expect(rotuloDoCaminhoEstrategia("metodo.dor")).toBe("Dor");
    expect(rotuloDoCaminhoEstrategia("kpis[0].alvo")).toBe("Indicador 1 · Alvo");
    expect(rotuloDoCaminhoEstrategia("periodo.inicio")).toBe("Período · Início");
    expect(rotuloDoCaminhoEstrategia("productKey")).toBe("Produto");
    expect(rotuloDoCaminhoEstrategia("")).toBe("");
  });
});
