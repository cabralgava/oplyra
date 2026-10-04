// Tradução entre os formulários da Estratégia (I-04) e o domínio. Pura e sem Next: é testada fora do navegador.
// Os formulários funcionam sem JavaScript no cliente; linhas novas em branco são ignoradas.
import type {
  CampaignPlan, CampaignStatus, Dimensao, ExperimentContent, ObjectiveContent, PersonaContent,
} from "@oplyra/core/strategy";
import { METODO } from "@oplyra/core/strategy";
import type { ObjectiveId, PersonaId, ProductKey } from "@oplyra/core";
import { FormularioInvalido } from "./marca-form";

export const LINHAS_DE_INDICADOR = 3;

/** Classe do selo de estado da campanha; o texto do estado sempre acompanha, nunca só a cor. */
export const CLASSE_DO_ESTADO: Record<CampaignStatus, string> = {
  planned: "selo", active: "selo ok", paused: "selo pendente", completed: "selo", cancelled: "selo proibido",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const txt = (f: FormData, nome: string): string => {
  const v = f.get(nome);
  return typeof v === "string" ? v : "";
};
const uuid = (f: FormData, nome: string, obrigatorio: boolean): string | null => {
  const v = txt(f, nome).trim();
  if (!v) {
    if (obrigatorio) throw new FormularioInvalido(nome);
    return null;
  }
  if (!UUID.test(v)) throw new FormularioInvalido(nome);
  return v;
};

/** "5.000,50" ou "R$ 5000" -> centavos inteiros; qualquer outra coisa -> NaN (o domínio recusa com BUDGET_INVALID / KPI_TARGET_INVALID). */
export function reaisParaCentavos(bruto: string): number {
  const s = bruto.replace(/R\$/gi, "").replace(/\s/g, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(s)) return Number.NaN;
  return Math.round(Number(s.replace(/\./g, "").replace(",", ".")) * 100);
}
export const centavosParaReais = (c: number): string =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c / 100);
/** Para preencher o campo de edição de volta: "5000,00". */
export const centavosParaCampo = (c: number): string => (c / 100).toFixed(2).replace(".", ",");

/** Número do indicador: aceita vírgula decimal; vazio ou inválido -> NaN. */
export function numeroDoCampo(bruto: string): number {
  const s = bruto.trim().replace(",", ".");
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : Number.NaN;
}

export function lerObjetivoDoFormulario(f: FormData): ObjectiveContent {
  const kpis: ObjectiveContent["kpis"][number][] = [];
  for (let i = 0; i < LINHAS_DE_INDICADOR; i++) {
    const nome = txt(f, `k_name_${i}`);
    const unidade = txt(f, `k_unit_${i}`);
    const alvo = txt(f, `k_target_${i}`);
    if (!nome.trim() && !unidade.trim() && !alvo.trim()) continue; // linha em branco
    kpis.push({ nome, unidade, alvo: numeroDoCampo(alvo) });
  }
  return { nome: txt(f, "nome"), descricao: txt(f, "descricao"), periodo: { inicio: txt(f, "inicio"), fim: txt(f, "fim") }, kpis };
}

export const lerPersonaDoFormulario = (f: FormData): PersonaContent =>
  ({ nome: txt(f, "nome"), descricao: txt(f, "descricao"), dores: txt(f, "dores"), objecoes: txt(f, "objecoes") });

export function lerCampanhaDoFormulario(f: FormData): CampaignPlan {
  const orcamento = txt(f, "orcamento").trim();
  const metodo = Object.fromEntries(METODO.map((c) => [c, txt(f, `m_${c}`)])) as CampaignPlan["metodo"];
  return {
    nome: txt(f, "nome"),
    objectiveId: uuid(f, "objetivo", true) as ObjectiveId,
    productKey: uuid(f, "produto", true) as ProductKey,
    personaId: uuid(f, "persona", false) as PersonaId | null,
    metodo,
    periodo: { inicio: txt(f, "inicio"), fim: txt(f, "fim") },
    orcamento: orcamento ? { centavos: reaisParaCentavos(orcamento), moeda: "BRL" } : null,
    mensagemChave: txt(f, "mensagem"),
  };
}

export function lerTesteDoFormulario(f: FormData): ExperimentContent {
  return { hipotese: txt(f, "hipotese"), dimensao: txt(f, "dimensao") as Dimensao, notaDaDimensao: txt(f, "nota") };
}

export function estadoDaCampanha(f: FormData, nome = "para"): CampaignStatus {
  const v = txt(f, nome);
  if (!["active", "paused", "completed", "cancelled"].includes(v)) throw new FormularioInvalido(nome);
  return v as CampaignStatus;
}

export const idDoFormulario = (f: FormData, nome: string): string => uuid(f, nome, true)!;
export const revisaoDoFormulario = (f: FormData, nome = "revisao"): number => {
  const n = Number(txt(f, nome));
  if (!Number.isInteger(n) || n < 1) throw new FormularioInvalido(nome);
  return n;
};

const CAMPOS: Record<string, string> = {
  nome: "Nome", descricao: "Descrição", inicio: "Início", fim: "Fim", periodo: "Período", orcamento: "Orçamento", mensagemChave: "Mensagem-chave",
  productKey: "Produto", hipotese: "Hipótese", dimensao: "Dimensão", notaDaDimensao: "Nota da dimensão", alvo: "Alvo", unidade: "Unidade",
  kpis: "Indicadores", situacao: "Situação", dor: "Dor", consequencia: "Consequência", desejo: "Desejo", mecanismo: "Mecanismo", prova: "Prova",
  oferta: "Oferta", dores: "Dores", objecoes: "Objeções",
  metodo: "", // prefixo do método: o campo ("Dor", "Prova"…) já se explica
};
/** `metodo.dor` -> "Dor"; `kpis[0].alvo` -> "Indicador 1 · Alvo"; `periodo.fim` -> "Período · Fim". */
export function rotuloDoCaminhoEstrategia(caminho: string): string {
  return caminho.split(".").filter(Boolean).map((parte) => {
    const m = /^([a-zA-Z]+)\[(\d+)\]$/.exec(parte);
    if (m) return `${m[1] === "kpis" ? "Indicador" : (CAMPOS[m[1]!] ?? m[1])} ${Number(m[2]) + 1}`;
    return CAMPOS[parte] ?? parte;
  }).filter(Boolean).join(" · ");
}

export const MENSAGENS_DE_ERRO_ESTRATEGIA: Record<string, string> = {
  PERMISSION_DENIED: "Seu papel não permite esta ação.",
  STRATEGY_CONTENT_INVALID: "Corrija os pontos abaixo e tente de novo.",
  CAMPAIGN_NOT_ACTIVATABLE: "A campanha ainda não pode ser ativada. Complete os pontos abaixo, salve e tente de novo.",
  OBJECTIVE_NOT_FOUND: "Objetivo não encontrado.",
  OBJECTIVE_ARCHIVED: "O objetivo está arquivado. Escolha ou crie outro.",
  PERSONA_NOT_FOUND: "Persona não encontrada.",
  PERSONA_ARCHIVED: "A persona está arquivada.",
  CAMPAIGN_NOT_FOUND: "Campanha não encontrada.",
  EXPERIMENT_NOT_FOUND: "Teste não encontrado.",
  NO_PUBLISHED_BRAND: "Publique a marca antes de criar uma campanha.",
  PRODUCT_NOT_IN_CURRENT_BRAND: "O produto não existe na versão vigente da marca.",
  TRACKING_KEY_LOCKED: "A chave de rastreamento é fixa depois de ativada a campanha.",
  TRACKING_KEY_TAKEN: "Não foi possível gerar uma chave única agora. Tente de novo.",
  CAMPAIGN_LOCKED: "Só campanhas planejadas podem ser editadas.",
  INVALID_CAMPAIGN_TRANSITION: "Esta mudança de estado não é permitida para a campanha.",
  INVALID_EXPERIMENT_TRANSITION: "Esta mudança de estado não é permitida para o teste.",
  CAMPAIGN_NOT_OPEN_FOR_EXPERIMENTS: "Campanha concluída ou cancelada não recebe nem executa testes.",
  CONFLICT_VERSION: "Outra pessoa alterou a campanha antes de você. Recarregue a página e refaça a alteração.",
  FORMULARIO_INVALIDO: "O formulário enviado é inválido. Recarregue a página e tente de novo.",
};
