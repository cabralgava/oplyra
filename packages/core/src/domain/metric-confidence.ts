// Confiança e atualização dos indicadores (I-08, domínio puro; 06 §11.1, 14 F-07, 15 §6 I-08 "confiança derivada correta (unidade)").
//
// Contrato usado: cinco níveis (diretriz de produto; 14 F-07) com selo ícone + texto; "indicador derivado herda a menor confiança das entradas,
// com explicação"; "métricas não recebidas aparecem como indisponíveis, não como zero"; "informa dados ausentes"; atualização em 100% dos
// valores. A ORDEM entre os níveis segue a ordem em que os documentos os listam (confirmado › provável › estimado › parcial › indisponível):
// é leitura da lista, não regra explícita — se o produto definir outra, mudar só CONFIANCA_DA_MAIS_ALTA_PARA_A_MAIS_BAIXA.
//
// DECISÕES LOCAIS (reversíveis): a atualização do derivado é a da entrada MAIS ANTIGA (herança conservadora, análoga à confiança); resultado
// não calculável (divisão por zero, NaN) vira indisponível com limitação, nunca zero; texto da explicação. Não implementado: janela de
// reprocessamento por adapter, fontes por indicador e filtros (dependem de I-06/I-07).
export const CONFIANCA_DA_MAIS_ALTA_PARA_A_MAIS_BAIXA = ["confirmed", "probable", "estimated", "partial", "unavailable"] as const;
export type Confianca = (typeof CONFIANCA_DA_MAIS_ALTA_PARA_A_MAIS_BAIXA)[number];

const ROTULOS: Record<Confianca, { icone: string; texto: string }> = {
  confirmed: { icone: "●", texto: "Confirmado" },
  probable: { icone: "◐", texto: "Provável" },
  estimated: { icone: "◌", texto: "Estimado" },
  partial: { icone: "◑", texto: "Parcial" },
  unavailable: { icone: "—", texto: "Indisponível" },
};

/** Selo de confiança: ícone + texto, nunca só cor (14 F-07 e §7). */
export const seloDeConfianca = (c: Confianca): { icone: string; texto: string } => {
  exigirConfiancaValida(c);
  return ROTULOS[c];
};

const exigirConfiancaValida = (c: Confianca): void => {
  if (!CONFIANCA_DA_MAIS_ALTA_PARA_A_MAIS_BAIXA.includes(c)) throw new EntradaInvalida("nível de confiança inválido");
};

export const nivel = (c: Confianca): number => {
  exigirConfiancaValida(c);
  return CONFIANCA_DA_MAIS_ALTA_PARA_A_MAIS_BAIXA.indexOf(c);
};
export const menorConfianca = (cs: readonly Confianca[]): Confianca => {
  let pior: Confianca = "confirmed";
  for (const c of cs) if (nivel(c) > nivel(pior)) pior = c;
  return pior;
};

export type EntradaDeMetrica = {
  readonly chave: string;
  /** `null` = a métrica não foi recebida. Zero recebido é um valor válido (e diferente de ausente). */
  readonly valor: number | null;
  readonly confianca: Confianca;
  /** Instante ISO da última atualização da fonte. */
  readonly atualizadoEm: string | null;
  readonly limitacao?: string;
};

export type Indicador = {
  readonly valor: number | null;
  readonly confianca: Confianca;
  /** Atualização exibida; `null` só quando nenhuma entrada informou instante (indisponível). */
  readonly atualizadoEm: string | null;
  /** Chaves das entradas ausentes (não recebidas ou indisponíveis). */
  readonly ausentes: readonly string[];
  readonly limitacoes: readonly string[];
  readonly explicacao: string;
};

export class EntradaInvalida extends Error {
  constructor(message: string) { super(message); this.name = "EntradaInvalida"; }
}

const instante = (s: string, chave: string): number => {
  const invalidar = (): never => { throw new EntradaInvalida(`atualizadoEm inválido na entrada "${chave}"`); };
  // Instante explícito com fuso; não aceitar coerção, data local ou rollover de calendário.
  const partes = typeof s === "string"
    ? /^([+-]\d{6}|\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|([+-])(\d{2}):(\d{2}))$/i.exec(s)
    : null;
  if (partes === null) return invalidar();
  const ano = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  const hora = Number(partes[4]);
  const minuto = Number(partes[5]);
  const segundo = Number(partes[6]);
  const fusoHora = Number(partes[10] ?? 0);
  const fusoMinuto = Number(partes[11] ?? 0);
  const bissexto = ano % 4 === 0 && (ano % 100 !== 0 || ano % 400 === 0);
  const diasNoMes = [31, bissexto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (mes < 1 || mes > 12 || dia < 1 || dia > (diasNoMes[mes - 1] ?? 0)
      || hora > 23 || minuto > 59 || segundo > 59 || fusoHora > 23 || fusoMinuto > 59) return invalidar();
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return invalidar();
  return t;
};

/** Indicador de uma métrica recebida diretamente (sem derivação). */
export function indicadorSimples(e: EntradaDeMetrica): Indicador {
  return derivarIndicador([e], (v) => v[e.chave] ?? null);
}

/**
 * Deriva um indicador de N entradas. `calcular` recebe só os valores presentes e devolve o número, ou `null` se não for calculável.
 * Qualquer entrada ausente torna o derivado indisponível (a conta não é feita com zero no lugar) e as ausentes são informadas.
 */
export function derivarIndicador(
  entradas: readonly EntradaDeMetrica[],
  calcular: (valores: Readonly<Record<string, number>>) => number | null,
): Indicador {
  if (entradas.length === 0) throw new EntradaInvalida("indicador sem entradas");
  const chaves = new Set<string>();
  for (const e of entradas) {
    if (typeof e.chave !== "string" || e.chave.trim() === "") throw new EntradaInvalida("chave de entrada ausente ou inválida");
    exigirConfiancaValida(e.confianca);
    if (chaves.has(e.chave)) throw new EntradaInvalida(`entrada duplicada: "${e.chave}"`);
    chaves.add(e.chave);
    if (e.valor !== null && !Number.isFinite(e.valor)) throw new EntradaInvalida(`valor não finito na entrada "${e.chave}"`);
  }

  const ausentes = entradas.filter((e) => e.valor === null || e.confianca === "unavailable").map((e) => e.chave);
  const datas = entradas.filter((e) => e.atualizadoEm !== null).map((e) => instante(e.atualizadoEm as string, e.chave));
  const atualizadoEm = datas.length === 0 ? null : new Date(Math.min(...datas)).toISOString();
  const limitacoes = entradas.filter((e) => e.limitacao).map((e) => `${e.chave}: ${e.limitacao}`);

  if (ausentes.length > 0) {
    return {
      valor: null, confianca: "unavailable", atualizadoEm, ausentes, limitacoes,
      explicacao: `Indisponível porque não recebemos: ${ausentes.join(", ")}.`,
    };
  }

  const valores: Record<string, number> = Object.create(null);
  for (const e of entradas) valores[e.chave] = e.valor as number;
  const resultado = calcular(valores);
  if (resultado === null || !Number.isFinite(resultado)) {
    return {
      valor: null, confianca: "unavailable", atualizadoEm, ausentes: [], limitacoes: [...limitacoes, "resultado não calculável com os valores recebidos"],
      explicacao: "Indisponível porque o resultado não é calculável com os valores recebidos.",
    };
  }

  const confianca = menorConfianca(entradas.map((e) => e.confianca));
  const limitantes = entradas.filter((e) => e.confianca === confianca && confianca !== "confirmed").map((e) => e.chave);
  const explicacao = limitantes.length === 0
    ? "Confirmado: todas as entradas são confirmadas."
    : `${seloDeConfianca(confianca).texto} porque ${limitantes.join(", ")} ${limitantes.length === 1 ? "tem" : "têm"} essa confiança.`;
  return { valor: resultado, confianca, atualizadoEm, ausentes: [], limitacoes, explicacao };
}
