// Estratégia (I-04) — objetivos, indicadores, personas, campanhas e testes. Domínio puro.
// Linguagem ubíqua: *objetivo*, *indicador* (KPI), *persona*, *campanha*, *método da campanha*
// (DEC-017), *chave de rastreamento*, *teste* (hipótese).
//
// Invariantes protegidas aqui (e repetidas no banco como defesa em profundidade):
//  - a chave de rastreamento é única por empresa e fixa depois de ativada a campanha (I-CMP);
//  - ativar exige o método completo (situação, dor, consequência, desejo, mecanismo, prova, oferta);
//  - campanha referencia objetivo e produto da MESMA empresa; o produto vem de uma versão publicada da marca;
//  - produto de disponibilidade `future` bloqueia a ativação (D-7);
//  - teste declara hipótese e dimensão antes de executar (I-HYP);
//  - estados e transições de campanha seguem o vocabulário de 14 §5.
import type { BrandVersionId, CampaignId, ExperimentId, ObjectiveId, PersonaId, ProductKey, TenantId, UserId } from "./ids.ts";
import type { StrategyIssue } from "./strategy-errors.ts";
import { CampaignNotActivatable, StrategyContentInvalid } from "./strategy-errors.ts";

export const LIMITES_ESTRATEGIA = Object.freeze({
  nome: 120, descricao: 1000, kpiNome: 80, kpiUnidade: 20, kpisPorObjetivo: 20,
  metodo: 1000, mensagemChave: 500, hipotese: 1000, nota: 200, orcamentoMaximo: 100_000_000_000,
});

const issue = (code: string, path: string, message: string): StrategyIssue => ({ code, path, message });
const vazio = (s: string): boolean => s.trim().length === 0;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
function dataValida(s: string): boolean {
  if (!DATA.test(s)) return false;
  const [a, m, d] = s.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(a, m - 1, d));
  return t.getUTCFullYear() === a && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/* ------------------------------------------------------------------ período */

export type Periodo = { readonly inicio: string; readonly fim: string };

function problemasDePeriodo(p: Periodo, base: string): StrategyIssue[] {
  const out: StrategyIssue[] = [];
  if (!dataValida(p.inicio)) out.push(issue("PERIOD_START_INVALID", `${base}.inicio`, "informe uma data de início válida (AAAA-MM-DD)"));
  if (!dataValida(p.fim)) out.push(issue("PERIOD_END_INVALID", `${base}.fim`, "informe uma data de fim válida (AAAA-MM-DD)"));
  if (out.length === 0 && p.fim < p.inicio) out.push(issue("PERIOD_ORDER", base, "o fim não pode ser anterior ao início"));
  return out;
}

/* ----------------------------------------------------------------- objetivos */

export type Kpi = { readonly nome: string; readonly unidade: string; readonly alvo: number };
export type ObjectiveStatus = "active" | "archived";
export type ObjectiveContent = { readonly nome: string; readonly descricao: string; readonly periodo: Periodo; readonly kpis: readonly Kpi[] };
export type Objective = ObjectiveContent & {
  readonly id: ObjectiveId; readonly tenantId: TenantId; readonly status: ObjectiveStatus;
  readonly createdBy: UserId; readonly createdAt: Date;
};

export function problemasDeObjetivo(c: ObjectiveContent): StrategyIssue[] {
  const out: StrategyIssue[] = [];
  if (vazio(c.nome)) out.push(issue("NAME_REQUIRED", "nome", "informe o nome do objetivo"));
  if (c.nome.length > LIMITES_ESTRATEGIA.nome) out.push(issue("TEXT_TOO_LONG", "nome", `máximo de ${LIMITES_ESTRATEGIA.nome} caracteres`));
  if (c.descricao.length > LIMITES_ESTRATEGIA.descricao) out.push(issue("TEXT_TOO_LONG", "descricao", `máximo de ${LIMITES_ESTRATEGIA.descricao} caracteres`));
  out.push(...problemasDePeriodo(c.periodo, "periodo"));
  if (c.kpis.length > LIMITES_ESTRATEGIA.kpisPorObjetivo) out.push(issue("LIMIT_EXCEEDED", "kpis", `máximo de ${LIMITES_ESTRATEGIA.kpisPorObjetivo} indicadores`));
  c.kpis.forEach((k, i) => {
    const base = `kpis[${i}]`;
    if (vazio(k.nome)) out.push(issue("KPI_NAME_REQUIRED", `${base}.nome`, "informe o nome do indicador"));
    if (k.nome.length > LIMITES_ESTRATEGIA.kpiNome) out.push(issue("TEXT_TOO_LONG", `${base}.nome`, `máximo de ${LIMITES_ESTRATEGIA.kpiNome} caracteres`));
    if (k.unidade.length > LIMITES_ESTRATEGIA.kpiUnidade) out.push(issue("TEXT_TOO_LONG", `${base}.unidade`, `máximo de ${LIMITES_ESTRATEGIA.kpiUnidade} caracteres`));
    if (!Number.isFinite(k.alvo) || k.alvo < 0 || k.alvo > 1e12) out.push(issue("KPI_TARGET_INVALID", `${base}.alvo`, "o alvo deve ser um número entre 0 e 1 trilhão"));
  });
  return out;
}

/* ------------------------------------------------------------------ personas */

export type PersonaContent = { readonly nome: string; readonly descricao: string; readonly dores: string; readonly objecoes: string };
export type Persona = PersonaContent & {
  readonly id: PersonaId; readonly tenantId: TenantId; readonly status: ObjectiveStatus;
  readonly createdBy: UserId; readonly createdAt: Date;
};

export function problemasDePersona(c: PersonaContent): StrategyIssue[] {
  const out: StrategyIssue[] = [];
  if (vazio(c.nome)) out.push(issue("NAME_REQUIRED", "nome", "informe o nome da persona"));
  for (const campo of ["nome", "descricao", "dores", "objecoes"] as const) {
    const max = campo === "nome" ? LIMITES_ESTRATEGIA.nome : LIMITES_ESTRATEGIA.descricao;
    if (c[campo].length > max) out.push(issue("TEXT_TOO_LONG", campo, `máximo de ${max} caracteres`));
  }
  return out;
}

/* ------------------------------------------------------------------ campanhas */

export const METODO = ["situacao", "dor", "consequencia", "desejo", "mecanismo", "prova", "oferta"] as const;
export type CampoDoMetodo = (typeof METODO)[number];
export type MetodoDaCampanha = Readonly<Record<CampoDoMetodo, string>>;
export const ROTULO_METODO: Readonly<Record<CampoDoMetodo, string>> = {
  situacao: "Situação", dor: "Dor", consequencia: "Consequência", desejo: "Desejo", mecanismo: "Mecanismo", prova: "Prova", oferta: "Oferta",
};

export const ESTADOS_DE_CAMPANHA = ["planned", "active", "paused", "completed", "cancelled"] as const;
export type CampaignStatus = (typeof ESTADOS_DE_CAMPANHA)[number];
export const ROTULO_ESTADO_CAMPANHA: Readonly<Record<CampaignStatus, string>> = {
  planned: "Planejada", active: "Ativa", paused: "Pausada", completed: "Concluída", cancelled: "Cancelada",
};

/** Transições permitidas (14 §5). Concluída e Cancelada são finais. */
const TRANSICOES: Readonly<Record<CampaignStatus, readonly CampaignStatus[]>> = {
  planned: ["active", "cancelled"],
  active: ["paused", "completed", "cancelled"],
  paused: ["active", "completed", "cancelled"],
  completed: [],
  cancelled: [],
};
export const transicaoDeCampanhaValida = (de: CampaignStatus, para: CampaignStatus): boolean => TRANSICOES[de].includes(para);

export type Orcamento = { readonly centavos: number; readonly moeda: "BRL" };

export type CampaignPlan = {
  readonly nome: string;
  readonly objectiveId: ObjectiveId;
  readonly productKey: ProductKey;
  readonly personaId: PersonaId | null;
  readonly metodo: MetodoDaCampanha;
  readonly periodo: Periodo;
  readonly orcamento: Orcamento | null;
  readonly mensagemChave: string;
};

export type Campaign = CampaignPlan & {
  readonly id: CampaignId; readonly tenantId: TenantId;
  /** Versão publicada da marca de onde veio o produto; fixa a "versão da marca usada". */
  readonly brandVersionId: BrandVersionId;
  readonly chave: string;
  readonly status: CampaignStatus;
  readonly revision: number;
  readonly activatedAt: Date | null;
  readonly createdBy: UserId; readonly createdAt: Date;
};

/** Regras estruturais: valem para qualquer gravação, inclusive de campanha incompleta. */
export function problemasDeCampanha(p: CampaignPlan): StrategyIssue[] {
  const out: StrategyIssue[] = [];
  if (vazio(p.nome)) out.push(issue("NAME_REQUIRED", "nome", "informe o nome da campanha"));
  if (p.nome.length > LIMITES_ESTRATEGIA.nome) out.push(issue("TEXT_TOO_LONG", "nome", `máximo de ${LIMITES_ESTRATEGIA.nome} caracteres`));
  for (const campo of METODO) {
    if (p.metodo[campo].length > LIMITES_ESTRATEGIA.metodo) out.push(issue("TEXT_TOO_LONG", `metodo.${campo}`, `máximo de ${LIMITES_ESTRATEGIA.metodo} caracteres`));
  }
  if (p.mensagemChave.length > LIMITES_ESTRATEGIA.mensagemChave) out.push(issue("TEXT_TOO_LONG", "mensagemChave", `máximo de ${LIMITES_ESTRATEGIA.mensagemChave} caracteres`));
  out.push(...problemasDePeriodo(p.periodo, "periodo"));
  if (p.orcamento !== null && (!Number.isSafeInteger(p.orcamento.centavos) || p.orcamento.centavos < 0 || p.orcamento.centavos > LIMITES_ESTRATEGIA.orcamentoMaximo)) {
    out.push(issue("BUDGET_INVALID", "orcamento", "informe um valor inteiro de centavos, sem negativos"));
  }
  return out;
}

/** Requisitos para ATIVAR (TST-30): o método completo, além das regras estruturais. */
export function problemasDeAtivacao(p: CampaignPlan): StrategyIssue[] {
  const out = problemasDeCampanha(p);
  for (const campo of METODO) {
    if (vazio(p.metodo[campo])) out.push(issue("METHOD_FIELD_REQUIRED", `metodo.${campo}`, `informe ${ROTULO_METODO[campo].toLowerCase()}`));
  }
  return out;
}

export function exigirPlanoValido(p: CampaignPlan): void {
  const problemas = problemasDeCampanha(p);
  if (problemas.length) throw new StrategyContentInvalid(problemas);
}

export function exigirAtivavel(p: CampaignPlan, disponibilidadeDoProduto: "available" | "future"): void {
  const problemas = problemasDeAtivacao(p);
  if (disponibilidadeDoProduto === "future") {
    problemas.push(issue("PRODUCT_NOT_AVAILABLE", "productKey", "o produto ainda não está disponível; ative a campanha quando ele estiver"));
  }
  if (problemas.length) throw new CampaignNotActivatable(problemas);
}

export function exigirConteudoDeObjetivo(c: ObjectiveContent): void {
  const problemas = problemasDeObjetivo(c);
  if (problemas.length) throw new StrategyContentInvalid(problemas);
}
export function exigirConteudoDePersona(c: PersonaContent): void {
  const problemas = problemasDePersona(c);
  if (problemas.length) throw new StrategyContentInvalid(problemas);
}

/* ---------------------------------------------------- chave de rastreamento */

export const FORMATO_DA_CHAVE = /^cmp-[a-z0-9]+(-[a-z0-9]+)*-[0-9a-f]{4}$/;

/** `cmp-<slug do nome>-<4 hex>`: sem PII por construção (só letras e dígitos do nome da campanha), até 60 caracteres. */
export function gerarChaveDeRastreamento(nome: string, sufixoHex: string): string {
  if (!/^[0-9a-f]{4}$/.test(sufixoHex)) throw new TypeError("sufixo da chave deve ter 4 caracteres hexadecimais");
  const slug = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "") || "campanha";
  return `cmp-${slug}-${sufixoHex}`;
}

/* ---------------------------------------------------------------------- UTMs */

export const REGRA_DE_UTM = "utm-rule/1";
/** Lista fechada de canais (D-3); novos canais exigem decisão, não texto livre. */
export const CANAIS = Object.freeze({
  meta: { source: "meta", medium: "paid_social", rotulo: "Meta Ads" },
  google: { source: "google", medium: "paid_search", rotulo: "Google Ads" },
  linkedin: { source: "linkedin", medium: "paid_social", rotulo: "LinkedIn Ads" },
  email: { source: "email", medium: "email", rotulo: "E-mail" },
} as const);
export type Canal = keyof typeof CANAIS;
export const ehCanal = (v: string): v is Canal => Object.prototype.hasOwnProperty.call(CANAIS, v);

export type Utms = {
  readonly utm_campaign: string; readonly utm_source: string; readonly utm_medium: string; readonly utm_content: string;
  readonly regra: typeof REGRA_DE_UTM;
  /** Valor informado antes da normalização, preservado (06 §11.1). */
  readonly conteudoOriginal: string;
  readonly query: string;
};

/** `utm_campaign` = chave de rastreamento; origem e meio vêm do canal; `utm_content` = versão da entrega (minúsculo, sem espaços, sem PII). */
export function montarUtms(chave: string, canal: Canal, versaoDaEntrega = "v1"): Utms {
  if (!FORMATO_DA_CHAVE.test(chave)) throw new TypeError("chave de rastreamento inválida");
  const conteudo = versaoDaEntrega.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "v1";
  const c = CANAIS[canal];
  const partes = { utm_campaign: chave, utm_source: c.source, utm_medium: c.medium, utm_content: conteudo };
  return {
    ...partes, regra: REGRA_DE_UTM, conteudoOriginal: versaoDaEntrega,
    query: Object.entries(partes).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&"),
  };
}

/* -------------------------------------------------------------------- testes */

export const DIMENSOES = ["angle", "pain", "hook", "proof", "visual", "cta", "other"] as const;
export type Dimensao = (typeof DIMENSOES)[number];
export const ROTULO_DIMENSAO: Readonly<Record<Dimensao, string>> = {
  angle: "Ângulo", pain: "Dor", hook: "Gancho (hook)", proof: "Prova", visual: "Visual", cta: "Chamada para ação (CTA)", other: "Outra",
};
export type ExperimentStatus = "planned" | "running" | "stopped";
export type ExperimentContent = { readonly hipotese: string; readonly dimensao: Dimensao; readonly notaDaDimensao: string };
export type Experiment = ExperimentContent & {
  readonly id: ExperimentId; readonly tenantId: TenantId; readonly campaignId: CampaignId;
  readonly status: ExperimentStatus; readonly createdBy: UserId; readonly createdAt: Date; readonly startedAt: Date | null;
};

/** I-HYP: hipótese e dimensão declaradas antes da execução; "outra" exige dizer qual. Variação cosmética não é teste. */
export function problemasDeTeste(c: ExperimentContent): StrategyIssue[] {
  const out: StrategyIssue[] = [];
  if (vazio(c.hipotese)) out.push(issue("HYPOTHESIS_REQUIRED", "hipotese", "declare a hipótese: o que você espera que mude e por quê"));
  if (c.hipotese.length > LIMITES_ESTRATEGIA.hipotese) out.push(issue("TEXT_TOO_LONG", "hipotese", `máximo de ${LIMITES_ESTRATEGIA.hipotese} caracteres`));
  if (!(DIMENSOES as readonly string[]).includes(c.dimensao)) out.push(issue("DIMENSION_REQUIRED", "dimensao", "escolha a dimensão que varia"));
  else if (c.dimensao === "other" && vazio(c.notaDaDimensao)) out.push(issue("DIMENSION_NOTE_REQUIRED", "notaDaDimensao", "diga qual dimensão varia"));
  if (c.notaDaDimensao.length > LIMITES_ESTRATEGIA.nota) out.push(issue("TEXT_TOO_LONG", "notaDaDimensao", `máximo de ${LIMITES_ESTRATEGIA.nota} caracteres`));
  return out;
}
export function exigirTesteValido(c: ExperimentContent): void {
  const problemas = problemasDeTeste(c);
  if (problemas.length) throw new StrategyContentInvalid(problemas);
}
const TRANSICOES_TESTE: Readonly<Record<ExperimentStatus, readonly ExperimentStatus[]>> = { planned: ["running", "stopped"], running: ["stopped"], stopped: [] };
export const transicaoDeTesteValida = (de: ExperimentStatus, para: ExperimentStatus): boolean => TRANSICOES_TESTE[de].includes(para);

export const metodoVazio = (): MetodoDaCampanha => ({ situacao: "", dor: "", consequencia: "", desejo: "", mecanismo: "", prova: "", oferta: "" });
