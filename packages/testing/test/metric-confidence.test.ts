// I-08 — confiança derivada dos indicadores (15 §6 I-08: "confiança derivada correta (unidade)"; 06 §11.1; 14 F-07).
import { describe, it, expect } from "vitest";
import {
  CONFIANCA_DA_MAIS_ALTA_PARA_A_MAIS_BAIXA, derivarIndicador, EntradaInvalida, indicadorSimples, menorConfianca, nivel, seloDeConfianca,
  type Confianca, type EntradaDeMetrica,
} from "../../core/src/domain/metric-confidence.ts";

const e = (chave: string, valor: number | null, confianca: Confianca, atualizadoEm: string | null = "2026-11-10T12:00:00Z", limitacao?: string): EntradaDeMetrica =>
  ({ chave, valor, confianca, atualizadoEm, ...(limitacao ? { limitacao } : {}) });
const razao = (v: Readonly<Record<string, number>>) => (v.gasto as number) / (v.leads as number);

describe("selos (14 F-07)", () => {
  it("cada nível tem ícone e texto, e são cinco e distintos", () => {
    const selos = CONFIANCA_DA_MAIS_ALTA_PARA_A_MAIS_BAIXA.map(seloDeConfianca);
    expect(selos.map((s) => s.texto)).toEqual(["Confirmado", "Provável", "Estimado", "Parcial", "Indisponível"]);
    expect(selos.map((s) => s.icone)).toEqual(["●", "◐", "◌", "◑", "—"]);
    expect(new Set(selos.map((s) => s.icone)).size).toBe(5);
  });
});

describe("herança da menor confiança", () => {
  it("o derivado fica com a menor confiança das entradas, para todos os pares", () => {
    const niveis = CONFIANCA_DA_MAIS_ALTA_PARA_A_MAIS_BAIXA.filter((c) => c !== "unavailable");
    for (const a of niveis) for (const b of niveis) {
      const r = derivarIndicador([e("gasto", 100, a), e("leads", 10, b)], razao);
      const esperado = niveis[Math.max(niveis.indexOf(a), niveis.indexOf(b))];
      expect(r.confianca, `${a}+${b}`).toBe(esperado);
      expect(r.valor).toBe(10);
    }
  });
  it("todas confirmadas ⇒ confirmado; a explicação nomeia as entradas limitantes", () => {
    expect(derivarIndicador([e("gasto", 100, "confirmed"), e("leads", 10, "confirmed")], razao).confianca).toBe("confirmed");
    const r = derivarIndicador([e("gasto", 100, "confirmed"), e("leads", 10, "estimated")], razao);
    expect(r.confianca).toBe("estimated");
    expect(r.explicacao).toBe("Estimado porque leads tem essa confiança.");
    const dois = derivarIndicador([e("gasto", 100, "partial"), e("leads", 10, "partial")], razao);
    expect(dois.explicacao).toBe("Parcial porque gasto, leads têm essa confiança.");
  });
  it("menorConfianca de lista vazia é a mais alta (elemento neutro)", () => {
    expect(menorConfianca([])).toBe("confirmed");
  });
});

describe("ausente não é zero", () => {
  it("entrada não recebida torna o derivado indisponível, sem valor, e a conta não roda com zero", () => {
    let chamou = false;
    const r = derivarIndicador([e("gasto", 100, "confirmed"), e("leads", null, "confirmed")], (v) => { chamou = true; return razao(v); });
    expect(r.valor).toBeNull();
    expect(r.confianca).toBe("unavailable");
    expect(r.ausentes).toEqual(["leads"]);
    expect(chamou).toBe(false);
    expect(r.explicacao).toContain("leads");
  });
  it("entrada marcada como indisponível também conta como ausente, mesmo com valor", () => {
    const r = derivarIndicador([e("gasto", 100, "confirmed"), e("leads", 10, "unavailable")], razao);
    expect(r.valor).toBeNull();
    expect(r.ausentes).toEqual(["leads"]);
  });
  it("zero RECEBIDO é um valor válido e mantém a confiança", () => {
    const r = indicadorSimples(e("leads", 0, "confirmed"));
    expect(r.valor).toBe(0);
    expect(r.confianca).toBe("confirmed");
    expect(r.ausentes).toEqual([]);
  });
  it("métrica simples ausente é indisponível (valor nulo, não zero)", () => {
    const r = indicadorSimples(e("leads", null, "confirmed"));
    expect(r.valor).toBeNull();
    expect(r.confianca).toBe("unavailable");
  });
  it("resultado não calculável (divisão por zero) é indisponível com limitação, nunca zero", () => {
    const r = derivarIndicador([e("gasto", 100, "confirmed"), e("leads", 0, "confirmed")], razao);
    expect(r.valor).toBeNull();
    expect(r.confianca).toBe("unavailable");
    expect(r.limitacoes).toContain("resultado não calculável com os valores recebidos");
    expect(r.ausentes).toEqual([]);
  });
  it("a conta que devolve null é tratada como não calculável", () => {
    expect(derivarIndicador([e("a", 1, "confirmed")], () => null).confianca).toBe("unavailable");
  });
});

describe("atualização e limitações em todos os valores (15 §6 I-08)", () => {
  it("o derivado informa a atualização da entrada mais antiga, normalizada em UTC", () => {
    const r = derivarIndicador([e("gasto", 100, "confirmed", "2026-11-10T12:00:00Z"), e("leads", 10, "confirmed", "2026-11-09T09:30:00-03:00")], razao);
    expect(r.atualizadoEm).toBe("2026-11-09T12:30:00.000Z");
  });
  it("indisponível também informa a atualização conhecida; sem nenhuma, é nulo", () => {
    expect(derivarIndicador([e("gasto", 100, "confirmed", "2026-11-10T12:00:00Z"), e("leads", null, "confirmed", null)], razao).atualizadoEm).toBe("2026-11-10T12:00:00.000Z");
    expect(indicadorSimples(e("leads", null, "unavailable", null)).atualizadoEm).toBeNull();
  });
  it("as limitações das entradas são repassadas com a chave de origem", () => {
    const r = derivarIndicador([e("gasto", 100, "confirmed"), e("leads", 10, "estimated", "2026-11-10T12:00:00Z", "22% sem chave de rastreamento")], razao);
    expect(r.limitacoes).toEqual(["leads: 22% sem chave de rastreamento"]);
  });
});

describe("entradas inválidas são recusadas", () => {
  it("sem entradas, chave duplicada, valor não finito e data inválida", () => {
    expect(() => derivarIndicador([], () => 1)).toThrow(EntradaInvalida);
    expect(() => derivarIndicador([e("a", 1, "confirmed"), e("a", 2, "confirmed")], () => 1)).toThrow(/duplicada/);
    expect(() => derivarIndicador([e("a", Number.NaN, "confirmed")], () => 1)).toThrow(/não finito/);
    expect(() => derivarIndicador([e("a", Number.POSITIVE_INFINITY, "confirmed")], () => 1)).toThrow(EntradaInvalida);
    expect(() => derivarIndicador([e("a", 1, "confirmed", "ontem")], () => 1)).toThrow(/inválido/);
  });
});


describe("confiança desconhecida não vira confirmado", () => {
  for (const desconhecida of ["inventada", "", "__proto__", "constructor"]) {
    it(`recusa nível fora do catálogo em todas as entradas públicas (${JSON.stringify(desconhecida)})`, () => {
      const c = desconhecida as Confianca;
      expect(() => nivel(c)).toThrow(EntradaInvalida);
      expect(() => seloDeConfianca(c)).toThrow(EntradaInvalida);
      expect(() => menorConfianca(["confirmed", c])).toThrow(EntradaInvalida);
      expect(() => indicadorSimples(e("m1", 1, c))).toThrow(EntradaInvalida);
    });
  }

  for (const modo of ["valor_presente", "valor_ausente", "outra_entrada_ausente"] as const) {
    it(`valida confiança antes do cálculo e de qualquer fallback (${modo})`, () => {
      let chamadas = 0;
      const entradas = [e("m1", modo === "valor_ausente" ? null : 1, "inventada" as Confianca)];
      if (modo === "outra_entrada_ausente") entradas.push(e("m2", null, "confirmed"));
      expect(() => derivarIndicador(entradas, () => { chamadas++; return 1; })).toThrow(EntradaInvalida);
      expect(chamadas).toBe(0);
    });
  }

  it("não considera buraco na lista de confiança como confirmação", () => {
    expect(() => menorConfianca(new Array<Confianca>(1))).toThrow(EntradaInvalida);
  });

  it("preserva os cinco níveis conhecidos, sua ordem e o elemento neutro", () => {
    for (const [i, c] of CONFIANCA_DA_MAIS_ALTA_PARA_A_MAIS_BAIXA.entries()) {
      expect(nivel(c)).toBe(i);
      expect(menorConfianca(["confirmed", c])).toBe(c);
      expect(seloDeConfianca(c).texto).not.toBe("");
    }
    expect(menorConfianca([])).toBe("confirmed");
  });
});

describe("nomes de métrica não se confundem com propriedades herdadas", () => {
  it("preserva os valores recebidos para __proto__, constructor e toString", () => {
    const r = derivarIndicador([
      e("__proto__", 7, "confirmed"), e("constructor", 9, "confirmed"), e("toString", 11, "confirmed"),
    ], (v) => ["__proto__", "constructor", "toString"].reduce((total, chave) => total + v[chave]!, 0));
    expect(r).toMatchObject({ valor: 27, confianca: "confirmed", ausentes: [] });
  });

  it("não fornece propriedades herdadas como se fossem métricas recebidas", () => {
    let inspecionou = false;
    const r = derivarIndicador([e("m1", 2, "confirmed")], (v) => {
      expect(v.__proto__).toBeUndefined();
      expect(v.constructor).toBeUndefined();
      expect(v.toString).toBeUndefined();
      expect(Object.keys(v)).toEqual(["m1"]);
      inspecionou = true;
      return v.m1!;
    });
    expect(inspecionou).toBe(true);
    expect(r.valor).toBe(2);
  });
});


describe("metadados de entrada: chaves e instantes", () => {
  for (const chave of ["", "   ", null, undefined, 7, {}]) {
    it(`recusa chave inválida antes do cálculo (${JSON.stringify(chave)})`, () => {
      let chamadas = 0;
      const entrada = { ...e("m1", 1, "confirmed"), chave } as EntradaDeMetrica;
      expect(() => derivarIndicador([entrada], () => { chamadas++; return 1; })).toThrow(EntradaInvalida);
      expect(chamadas).toBe(0);
    });
  }

  for (const atualizadoEm of [2026, 0, true, new Date("2026-11-10T12:00:00Z"), {}, undefined]) {
    it(`não aceita instante por coerção de outro tipo (${JSON.stringify(atualizadoEm)})`, () => {
      let chamadas = 0;
      const entrada = { ...e("m1", 1, "confirmed"), atualizadoEm } as EntradaDeMetrica;
      expect(() => derivarIndicador([entrada], () => { chamadas++; return 1; })).toThrow(EntradaInvalida);
      expect(chamadas).toBe(0);
    });
  }

  for (const atualizadoEm of [
    "2026-02-30T12:00:00Z", "2026-04-31T00:00:00Z", "2025-02-29T00:00:00Z", "1900-02-29T00:00:00Z",
    "2026-11-10T12:00:00", "2026-11-10", "11/10/2026 12:00:00", "2026-11-10T24:00:00Z",
    "2026-11-10T12:00:00+24:00", "2026-11-10T12:00:00+00:60",
  ]) {
    it(`recusa calendário/fuso inválido ou ambíguo (${atualizadoEm})`, () => {
      let chamadas = 0;
      expect(() => derivarIndicador([e("m1", 1, "confirmed", atualizadoEm)], () => { chamadas++; return 1; })).toThrow(EntradaInvalida);
      expect(chamadas).toBe(0);
    });
  }

  for (const atualizadoEm of [
    "2024-02-29T00:00:00Z", "2000-02-29T00:00:00Z", "2026-11-10T12:00:00.123Z",
    "2026-11-10T12:00:00.1+05:30", "2026-11-10t12:00:00z", "+010000-01-01T00:00:00Z",
  ]) {
    it(`preserva instante válido e normaliza para UTC (${atualizadoEm})`, () => {
      const r = indicadorSimples(e("m1", 0, "confirmed", atualizadoEm));
      expect(r).toMatchObject({ valor: 0, confianca: "confirmed", atualizadoEm: new Date(atualizadoEm).toISOString() });
    });
  }

  it("mantém null como atualização ausente sem inventar data ou transformar zero em ausente", () => {
    expect(indicadorSimples(e("m1", 0, "confirmed", null))).toMatchObject({ valor: 0, confianca: "confirmed", atualizadoEm: null });
  });

  it("valida sem renomear chaves opacas ou remover seus espaços", () => {
    const entrada = e(" leads:meta/1 ", 2, "confirmed");
    const r = derivarIndicador([entrada], (v) => {
      expect(Object.keys(v)).toEqual([" leads:meta/1 "]);
      return v[" leads:meta/1 "]!;
    });
    expect(r.valor).toBe(2);
    expect(entrada.chave).toBe(" leads:meta/1 ");
  });
});
