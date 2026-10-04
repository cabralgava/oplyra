// Tradução entre o formulário da tela "Marca" e o conteúdo do domínio (I-03). Pura e sem Next:
// é testada fora do navegador. O formulário tem um número fixo de linhas (as existentes mais
// espaços em branco), funciona sem JavaScript no cliente e ignora linhas novas vazias.
import type { BrandContentInput, BrandIssue, Evidence } from "@oplyra/core/brand";
import type { ClaimId, ProductKey } from "@oplyra/core";

export const LINHAS_NOVAS_PRODUTO = 2;
export const LINHAS_NOVAS_AFIRMACAO = 2;

export const ROTULO_DISPONIBILIDADE = { available: "Disponível", future: "Futuro (ainda não disponível)" } as const;
export const ROTULO_TIPO = { availability: "Disponibilidade", benefit: "Benefício", proof: "Prova", differentiator: "Diferencial" } as const;
export const ROTULO_POLARIDADE = { allowed: "Pode usar", forbidden: "Não usar" } as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const URL_HTTP = /^https?:\/\/\S+$/i;

export class FormularioInvalido extends Error {}

/** Uma evidência por linha: começa com http(s):// vira URL; o resto é texto. */
export function evidenciasDeTexto(texto: string): Evidence[] {
  return texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    .map((valor): Evidence => (URL_HTTP.test(valor) ? { kind: "url", value: valor } : { kind: "text", value: valor }));
}
export const evidenciasParaTexto = (e: readonly Evidence[]): string => e.map((x) => x.value).join("\n");

const txt = (f: FormData, nome: string): string => {
  const v = f.get(nome);
  return typeof v === "string" ? v : "";
};
const marcado = (f: FormData, nome: string): boolean => f.get(nome) === "on";

function inteiro(f: FormData, nome: string, maximo: number): number {
  const v = Number(txt(f, nome));
  if (!Number.isInteger(v) || v < 0 || v > maximo) throw new FormularioInvalido(nome);
  return v;
}

/** Lê o formulário do rascunho. Lança FormularioInvalido para valores que a tela nunca produz (formulário adulterado). */
export function lerConteudoDoFormulario(f: FormData): BrandContentInput {
  const produtos: BrandContentInput["products"][number][] = [];
  for (let i = 0, n = inteiro(f, "p_n", 100); i < n; i++) {
    const chave = txt(f, `p_key_${i}`);
    if (chave && !UUID.test(chave)) throw new FormularioInvalido(`p_key_${i}`);
    const nome = txt(f, `p_name_${i}`);
    const descricao = txt(f, `p_desc_${i}`);
    if (marcado(f, `p_remove_${i}`)) continue;
    if (!chave && !nome.trim() && !descricao.trim()) continue; // linha nova em branco
    const disp = txt(f, `p_avail_${i}`);
    if (disp !== "available" && disp !== "future") throw new FormularioInvalido(`p_avail_${i}`);
    produtos.push({ ...(chave ? { productKey: chave as ProductKey } : {}), name: nome, description: descricao, availability: disp });
  }

  const afirmacoes: BrandContentInput["claims"][number][] = [];
  for (let i = 0, n = inteiro(f, "c_n", 400); i < n; i++) {
    const id = txt(f, `c_id_${i}`);
    if (id && !UUID.test(id)) throw new FormularioInvalido(`c_id_${i}`);
    const produto = txt(f, `c_product_${i}`);
    if (produto && !UUID.test(produto)) throw new FormularioInvalido(`c_product_${i}`);
    const texto = txt(f, `c_text_${i}`);
    const regra = txt(f, `c_rule_${i}`);
    const evidencia = txt(f, `c_evid_${i}`);
    if (marcado(f, `c_remove_${i}`)) continue;
    if (!id && !texto.trim() && !regra.trim() && !evidencia.trim()) continue;
    const tipo = txt(f, `c_kind_${i}`);
    const pol = txt(f, `c_pol_${i}`);
    if (!(tipo in ROTULO_TIPO) || !(pol in ROTULO_POLARIDADE)) throw new FormularioInvalido(`c_kind_${i}`);
    afirmacoes.push({
      ...(id ? { id: id as ClaimId } : {}), productKey: produto ? (produto as ProductKey) : null,
      kind: tipo as keyof typeof ROTULO_TIPO, polarity: pol as keyof typeof ROTULO_POLARIDADE,
      text: texto, usageRule: regra, evidence: evidenciasDeTexto(evidencia),
    });
  }
  return { positioning: txt(f, "positioning"), tone: txt(f, "tone"), products: produtos, claims: afirmacoes };
}

/** Problemas do domínio viajam na URL de retorno (compactos, no máximo 8) e voltam a ser texto na tela. */
export function codificarProblemas(problemas: readonly BrandIssue[]): string {
  return encodeURIComponent(JSON.stringify(problemas.slice(0, 8).map((p) => [p.path, p.message])));
}
export function decodificarProblemas(bruto: string | undefined): { caminho: string; mensagem: string }[] {
  if (!bruto) return [];
  try {
    const lista = JSON.parse(decodeURIComponent(bruto)) as unknown;
    if (!Array.isArray(lista)) return [];
    return lista.slice(0, 8).flatMap((x) => (Array.isArray(x) && typeof x[0] === "string" && typeof x[1] === "string"
      ? [{ caminho: x[0].slice(0, 80), mensagem: x[1].slice(0, 200) }] : []));
  } catch {
    return [];
  }
}

/** `products[1].name` -> "Produto 2 · nome"; `claims[0].evidence[2]` -> "Afirmação 1 · evidência 3". */
export function rotuloDoCaminho(caminho: string): string {
  const partes = [...caminho.matchAll(/(products|claims)\[(\d+)\]|\.?(name|description|availability|text|usageRule|evidence|kind|productKey)(?:\[(\d+)\])?|^(positioning|tone|products|claims)$/g)];
  const campos: Record<string, string> = {
    name: "nome", description: "descrição", availability: "disponibilidade", text: "texto", usageRule: "regra de uso",
    evidence: "evidência", kind: "tipo", productKey: "produto", positioning: "Posicionamento", tone: "Tom de voz",
    products: "Produtos", claims: "Afirmações",
  };
  const out: string[] = [];
  for (const m of partes) {
    if (m[1]) out.push(`${m[1] === "products" ? "Produto" : "Afirmação"} ${Number(m[2]) + 1}`);
    else if (m[3]) out.push(m[4] !== undefined ? `${campos[m[3]]} ${Number(m[4]) + 1}` : campos[m[3]]!);
    else if (m[5]) out.push(campos[m[5]]!);
  }
  return out.join(" · ");
}

/** URL de retorno de uma ação que falhou: código fixo e, se o domínio listou pontos, os pontos. Nunca a mensagem interna. */
export function destinoDeErro(base: string, e: unknown): string {
  if (e instanceof FormularioInvalido) return `${base}?erro=FORMULARIO_INVALIDO`;
  const codigo = typeof e === "object" && e !== null && "code" in e && typeof (e as { code: unknown }).code === "string"
    && /^[A-Z_]{3,60}$/.test((e as { code: string }).code) ? (e as { code: string }).code : "ERRO";
  const issues = typeof e === "object" && e !== null && "issues" in e && Array.isArray((e as { issues: unknown }).issues)
    ? ((e as { issues: BrandIssue[] }).issues) : [];
  return `${base}?erro=${codigo}${issues.length ? `&problemas=${codificarProblemas(issues)}` : ""}`;
}

export const MENSAGENS_DE_ERRO: Record<string, string> = {
  PERMISSION_DENIED: "Seu papel não permite esta ação.",
  BRAND_DRAFT_ALREADY_EXISTS: "Já existe um rascunho da marca.",
  BRAND_VERSION_IMMUTABLE: "Esta versão já foi publicada e não pode ser alterada. Abra um novo rascunho.",
  BRAND_VERSION_NOT_FOUND: "Versão da marca não encontrada.",
  CONFLICT_VERSION: "Outra pessoa salvou o rascunho antes de você. Recarregue a página e refaça a alteração.",
  BRAND_CONTENT_INVALID: "Corrija os pontos abaixo e salve de novo.",
  BRAND_NOT_PUBLISHABLE: "A versão ainda não pode ser publicada. Complete os pontos abaixo, salve e tente de novo.",
  FORMULARIO_INVALIDO: "O formulário enviado é inválido. Recarregue a página e tente de novo.",
};
