// Parser do formulário da tela "Marca" (I-03, S3). Sem Next nem navegador.
import { describe, it, expect } from "vitest";
import {
  lerConteudoDoFormulario, evidenciasDeTexto, evidenciasParaTexto, FormularioInvalido,
  codificarProblemas, decodificarProblemas, rotuloDoCaminho, destinoDeErro,
} from "../apps/web/src/lib/marca-form.ts";

const PK = "c0000001-0000-4000-8000-000000000001";
const CK = "d0000001-0000-4000-8000-000000000001";
const form = (campos: Record<string, string>): FormData => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
};
const base = { positioning: "Posicionamento", tone: "Tom", p_n: "0", c_n: "0" };

describe("evidências por linha", () => {
  it("URL http(s) vira url; o resto vira texto; linhas vazias somem", () => {
    expect(evidenciasDeTexto("https://a.test/x\n\n  estudo interno  \r\nhttp://b.test")).toEqual([
      { kind: "url", value: "https://a.test/x" }, { kind: "text", value: "estudo interno" }, { kind: "url", value: "http://b.test" },
    ]);
  });
  it("ftp e javascript não viram URL: ficam como texto e o domínio decide", () => {
    expect(evidenciasDeTexto("ftp://x.test")).toEqual([{ kind: "text", value: "ftp://x.test" }]);
    expect(evidenciasDeTexto("javascript:alert(1)")).toEqual([{ kind: "text", value: "javascript:alert(1)" }]);
  });
  it("ida e volta", () => {
    const e = evidenciasDeTexto("https://a.test\nnota");
    expect(evidenciasDeTexto(evidenciasParaTexto(e))).toEqual(e);
  });
});

describe("leitura do formulário", () => {
  it("lê posicionamento, tom, produtos e afirmações; chaves existentes são preservadas", () => {
    const c = lerConteudoDoFormulario(form({
      ...base, p_n: "1", c_n: "1",
      p_key_0: PK, p_name_0: "Produto", p_desc_0: "Desc", p_avail_0: "future",
      c_id_0: CK, c_product_0: PK, c_kind_0: "availability", c_pol_0: "forbidden", c_text_0: "Texto", c_rule_0: "Regra", c_evid_0: "https://e.test",
    }));
    expect(c).toEqual({
      positioning: "Posicionamento", tone: "Tom",
      products: [{ productKey: PK, name: "Produto", description: "Desc", availability: "future" }],
      claims: [{ id: CK, productKey: PK, kind: "availability", polarity: "forbidden", text: "Texto", usageRule: "Regra", evidence: [{ kind: "url", value: "https://e.test" }] }],
    });
  });

  it("ignora linhas novas em branco e as marcadas para remover; mantém linha nova preenchida sem chave", () => {
    const c = lerConteudoDoFormulario(form({
      ...base, p_n: "3", c_n: "2",
      p_key_0: PK, p_name_0: "Remover", p_avail_0: "available", p_remove_0: "on",
      p_name_1: "", p_desc_1: "", p_avail_1: "available",
      p_name_2: "Novo", p_avail_2: "available",
      c_text_0: "", c_rule_0: "", c_evid_0: "", c_kind_0: "benefit", c_pol_0: "allowed",
      c_text_1: "Nova", c_kind_1: "benefit", c_pol_1: "forbidden", c_rule_1: "Regra",
    }));
    expect(c.products).toEqual([{ name: "Novo", description: "", availability: "available" }]);
    expect(c.claims).toEqual([{ productKey: null, kind: "benefit", polarity: "forbidden", text: "Nova", usageRule: "Regra", evidence: [] }]);
  });

  it("recusa formulário adulterado: contagem, uuid, enum", () => {
    expect(() => lerConteudoDoFormulario(form({ ...base, p_n: "-1" }))).toThrow(FormularioInvalido);
    expect(() => lerConteudoDoFormulario(form({ ...base, p_n: "999" }))).toThrow(FormularioInvalido);
    expect(() => lerConteudoDoFormulario(form({ ...base, p_n: "x" }))).toThrow(FormularioInvalido);
    expect(() => lerConteudoDoFormulario(form({ ...base, p_n: "1", p_key_0: "não-é-uuid", p_name_0: "A", p_avail_0: "available" }))).toThrow(FormularioInvalido);
    expect(() => lerConteudoDoFormulario(form({ ...base, p_n: "1", p_name_0: "A", p_avail_0: "beta" }))).toThrow(FormularioInvalido);
    expect(() => lerConteudoDoFormulario(form({ ...base, c_n: "1", c_text_0: "x", c_kind_0: "invalido", c_pol_0: "allowed" }))).toThrow(FormularioInvalido);
    expect(() => lerConteudoDoFormulario(form({ ...base, c_n: "1", c_product_0: "x", c_text_0: "x", c_kind_0: "benefit", c_pol_0: "allowed" }))).toThrow(FormularioInvalido);
  });

  it("campos ausentes viram texto vazio, não 'undefined'", () => {
    const c = lerConteudoDoFormulario(form({ p_n: "0", c_n: "0" }));
    expect(c).toEqual({ positioning: "", tone: "", products: [], claims: [] });
  });
});

describe("destino de erro das ações", () => {
  it("usa só o código do domínio e os pontos listados; erro desconhecido vira ERRO sem vazar a mensagem", () => {
    expect(destinoDeErro("/x", new FormularioInvalido("p_n"))).toBe("/x?erro=FORMULARIO_INVALIDO");
    expect(destinoDeErro("/x", Object.assign(new Error("segredo interno"), { code: "CONFLICT_VERSION" }))).toBe("/x?erro=CONFLICT_VERSION");
    expect(destinoDeErro("/x", new Error("senha=abc em postgres://"))).toBe("/x?erro=ERRO");
    expect(destinoDeErro("/x", Object.assign(new Error("m"), { code: "minúsculo; drop" }))).toBe("/x?erro=ERRO");
    expect(destinoDeErro("/x", null)).toBe("/x?erro=ERRO");
    const com = destinoDeErro("/x", Object.assign(new Error("m"), { code: "BRAND_NOT_PUBLISHABLE", issues: [{ code: "A", path: "tone", message: "informe o tom" }] }));
    expect(com).toMatch(/^\/x\?erro=BRAND_NOT_PUBLISHABLE&problemas=/);
    expect(decodificarProblemas(com.split("problemas=")[1])).toEqual([{ caminho: "tone", mensagem: "informe o tom" }]);
  });
});

describe("problemas na URL de retorno", () => {
  it("ida e volta limitada a 8 itens e sem lixo", () => {
    const issues = Array.from({ length: 12 }, (_, i) => ({ code: "X", path: `products[${i}].name`, message: `m${i}` }));
    const volta = decodificarProblemas(codificarProblemas(issues));
    expect(volta).toHaveLength(8);
    expect(volta[0]).toEqual({ caminho: "products[0].name", mensagem: "m0" });
  });
  it("entrada adulterada nunca lança e vira lista vazia", () => {
    for (const lixo of [undefined, "", "%", "%7B%7D", encodeURIComponent("[1,2]"), encodeURIComponent('[["a"]]')]) {
      expect(decodificarProblemas(lixo)).toEqual([]);
    }
  });
  it("rotula o caminho em português", () => {
    expect(rotuloDoCaminho("products[1].name")).toBe("Produto 2 · nome");
    expect(rotuloDoCaminho("claims[0].evidence[2]")).toBe("Afirmação 1 · evidência 3");
    expect(rotuloDoCaminho("positioning")).toBe("Posicionamento");
    expect(rotuloDoCaminho("products")).toBe("Produtos");
  });
});
