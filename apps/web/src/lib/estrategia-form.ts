// Tradução entre os formulários de Estratégia/Operação e o domínio (I-04). Pura e sem Next: é testada fora do
// navegador. Os formulários funcionam sem JavaScript no cliente. Valores que a tela nunca produz (formulário
// adulterado) viram FormularioInvalido; valores que um humano pode errar vão ao domínio, que lista os problemas.
import type { CampaignId, ObjectiveId, ProductKey, TaskId } from "@oplyra/core";
import type {
  CampaignContent, CampaignStatus, ExperimentDimension, ExperimentOutcome, ExperimentPlan, ExperimentResult,
  ExperimentStatus, Learning, ObjectiveContent, TaskContent, TaskDetails, TaskStatus,
} from "./estrategia";
import { DIMENSOES, ELEMENTOS_DO_METODO, type MethodElement } from "./estrategia";
import { FormularioInvalido } from "./marca-form";

export { FormularioInvalido, destinoDeErro, decodificarProblemas } from "./marca-form";

export const LINHAS_NOVAS_KPI = 2;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ROTULO_CAMPANHA: Record<CampaignStatus, string> = {
  draft: "Planejada", active: "Ativa", paused: "Pausada", completed: "Concluída", cancelled: "Cancelada",
};
export const ROTULO_TESTE: Record<ExperimentStatus, string> = {
  planned: "Planejado", running: "Em execução", concluded: "Concluído", cancelled: "Cancelado",
};
export const ROTULO_TAREFA: Record<TaskStatus, string> = {
  todo: "A fazer", in_progress: "Em andamento", done: "Concluída", cancelled: "Cancelada",
};
export const ROTULO_DIMENSAO: Record<ExperimentDimension, string> = {
  angle: "Ângulo", pain: "Dor", hook: "Gancho", proof: "Prova", visual: "Visual", cta: "Chamada para ação", other: "Outra",
};
export const ROTULO_RESULTADO: Record<ExperimentOutcome, string> = {
  supported: "Hipótese confirmada", refuted: "Hipótese refutada", inconclusive: "Inconclusivo",
};
export const ROTULO_METODO: Record<MethodElement, string> = {
  situation: "Situação", pain: "Dor", consequence: "Consequência", desire: "Desejo",
  mechanism: "Mecanismo", proof: "Prova", offer: "Oferta",
};
export const AJUDA_METODO: Record<MethodElement, string> = {
  situation: "Em que contexto o público está hoje?",
  pain: "O que dói nessa situação?",
  consequence: "O que acontece se nada mudar?",
  desire: "O que a pessoa quer alcançar?",
  mechanism: "Como a solução leva até lá?",
  proof: "Que evidência sustenta o mecanismo?",
  offer: "O que está sendo oferecido, e a que condição?",
};
export const ROTULO_CANAL = {
  meta_ads: "Meta Ads", google_ads: "Google Ads", linkedin_ads: "LinkedIn Ads", email: "E-mail",
} as const;

export const MENSAGENS_ESTRATEGIA: Record<string, string> = {
  PERMISSION_DENIED: "Seu papel não permite esta ação.",
  FORMULARIO_INVALIDO: "O formulário enviado é inválido. Recarregue a página e tente de novo.",
  CONFLICT_VERSION: "Outra pessoa alterou isto antes de você. Recarregue a página e refaça a alteração.",
  INVALID_STATE_TRANSITION: "Esta ação não é possível no estado atual.",
  REFERENCE_NOT_FOUND: "Um item referenciado não existe nesta empresa.",
  CAMPAIGN_NOT_FOUND: "Campanha não encontrada.",
  OBJECTIVE_NOT_FOUND: "Objetivo não encontrado.",
  EXPERIMENT_NOT_FOUND: "Teste não encontrado.",
  TASK_NOT_FOUND: "Tarefa não encontrada.",
  CAMPAIGN_CONTENT_INVALID: "Corrija os pontos abaixo e salve de novo.",
  CAMPAIGN_NOT_ACTIVATABLE: "A campanha ainda não pode ser ativada. Complete os pontos abaixo, salve e tente de novo.",
  CAMPAIGN_TRACKING_KEY_TAKEN: "Esta chave de rastreamento já é usada por outra campanha da empresa.",
  CAMPAIGN_TRACKING_KEY_IMMUTABLE: "A chave de rastreamento não muda depois da ativação.",
  OBJECTIVE_INVALID: "Corrija os pontos abaixo e salve de novo.",
  EXPERIMENT_HYPOTHESIS_INVALID: "Corrija os pontos abaixo: um teste precisa de hipótese, dimensão e variantes distintas.",
  EXPERIMENT_RESULT_INVALID: "O resultado não é coerente com o plano. Sem amostra suficiente, registre como inconclusivo.",
  EXPERIMENT_LEARNING_INVALID: "O aprendizado precisa de resumo, evidência e versão.",
  TASK_INVALID: "Corrija os pontos abaixo e salve de novo.",
  TASK_DEPENDENCY_CYCLE: "Esta dependência criaria um ciclo entre tarefas.",
  TASK_ASSIGNEE_INVALID: "Responsável inválido para a tarefa.",
  UTM_INVALID: "Não foi possível gerar os UTMs com estes dados.",
};

const txt = (f: FormData, nome: string): string => {
  const v = f.get(nome);
  return typeof v === "string" ? v : "";
};

function uuidOuNulo(f: FormData, nome: string): string | null {
  const v = txt(f, nome).trim();
  if (v === "") return null;
  if (!UUID.test(v)) throw new FormularioInvalido(nome);
  return v;
}
function uuidObrigatorio(f: FormData, nome: string): string {
  const v = uuidOuNulo(f, nome);
  if (v === null) throw new FormularioInvalido(nome);
  return v;
}

/** Aceita vírgula decimal. Texto não numérico vira NaN: o domínio recusa e informa o ponto. */
export function numeroDeTexto(s: string): number {
  const limpo = s.trim().replace(",", ".");
  return limpo === "" ? Number.NaN : Number(limpo);
}

export function lerCampanha(f: FormData): CampaignContent {
  const metodo = Object.fromEntries(ELEMENTOS_DO_METODO.map((el) => [el, txt(f, `m_${el}`)])) as Record<MethodElement, string>;
  return {
    name: txt(f, "name"),
    objectiveId: uuidOuNulo(f, "objectiveId") as ObjectiveId | null,
    productKey: uuidOuNulo(f, "productKey") as ProductKey | null,
    method: metodo,
    trackingKey: txt(f, "trackingKey").trim(),
  };
}

export function lerObjetivo(f: FormData): ObjectiveContent {
  const n = Number(txt(f, "k_n"));
  if (!Number.isInteger(n) || n < 0 || n > 40) throw new FormularioInvalido("k_n");
  const kpis: ObjectiveContent["kpis"][number][] = [];
  for (let i = 0; i < n; i++) {
    const chave = txt(f, `k_key_${i}`).trim(), nome = txt(f, `k_name_${i}`), metrica = txt(f, `k_metric_${i}`);
    const unidade = txt(f, `k_unit_${i}`), alvo = txt(f, `k_target_${i}`);
    if (!chave && !nome.trim() && !metrica.trim() && !unidade.trim() && !alvo.trim()) continue; // linha nova em branco
    kpis.push({ key: chave, name: nome, metric: metrica, unit: unidade, target: numeroDeTexto(alvo) });
  }
  return {
    name: txt(f, "name"), description: txt(f, "description"),
    periodStart: txt(f, "periodStart").trim(), periodEnd: txt(f, "periodEnd").trim(), kpis,
  };
}

export function lerPlano(f: FormData): ExperimentPlan {
  const dimensao = txt(f, "dimension");
  if (!(DIMENSOES as readonly string[]).includes(dimensao)) throw new FormularioInvalido("dimension");
  return {
    hypothesis: txt(f, "hypothesis"), dimension: dimensao as ExperimentDimension, dimensionNote: txt(f, "dimensionNote"),
    variants: txt(f, "variants").split(/\r?\n/).map((l) => l.trim()).filter(Boolean),
    decisionMetric: txt(f, "decisionMetric"), minimumSample: numeroDeTexto(txt(f, "minimumSample")),
  };
}

export function lerResultado(f: FormData): { result: ExperimentResult; learning: Learning | null } {
  const resultado = txt(f, "outcome");
  if (resultado !== "supported" && resultado !== "refuted" && resultado !== "inconclusive") throw new FormularioInvalido("outcome");
  const resumo = txt(f, "learningSummary");
  const evidencia = txt(f, "learningEvidence").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const versao = numeroDeTexto(txt(f, "learningVersion"));
  // Aprendizado é opcional: só entra se houver resumo ou evidência. A versão NÃO conta: a tela a preenche por
  // padrão, e um campo pré-preenchido não pode transformar "sem aprendizado" em "aprendizado inválido".
  const learning: Learning | null = !resumo.trim() && evidencia.length === 0 ? null
    : { summary: resumo, evidence: evidencia, campaignVersion: versao };
  return {
    result: { outcome: resultado, observedSample: numeroDeTexto(txt(f, "observedSample")), limitations: txt(f, "limitations") },
    learning,
  };
}

export function lerTarefa(f: FormData): TaskContent {
  const prazo = txt(f, "dueDate").trim();
  return {
    title: txt(f, "title"), description: txt(f, "description"),
    campaignId: uuidOuNulo(f, "campaignId") as CampaignId | null,
    dueDate: prazo === "" ? null : prazo,
    // A tela não oferece responsável agente: nenhum agente é habilitável ainda (sem fonte de entitlement).
    assignee: null,
    dependsOn: f.getAll("dep").map((v) => {
      if (typeof v !== "string" || !UUID.test(v)) throw new FormularioInvalido("dep");
      return v as TaskId;
    }),
  };
}

/**
 * Edição usa campos próprios para não confundir os formulários do quadro.
 * Responsável e estado não vêm do navegador: o caso de uso relê a tarefa.
 */
export function lerEdicaoDaTarefa(f: FormData): { taskId: TaskId; expectedRevision: number; content: TaskDetails } {
  const campos = new FormData();
  for (const chave of ["title", "description", "campaignId", "dueDate", "tarefa", "revisao"]) {
    const valor = f.get(`editar_${chave}`);
    if (valor !== null) campos.set(chave, valor);
  }
  for (const valor of f.getAll("editar_dep")) campos.append("dep", valor);
  const { assignee: _ignorado, ...content } = lerTarefa(campos);
  return { taskId: lerId(campos, "tarefa") as TaskId, expectedRevision: lerRevisao(campos), content };
}

export function lerRevisao(f: FormData): number {
  const r = Number(txt(f, "revisao"));
  if (!Number.isInteger(r) || r < 1) throw new FormularioInvalido("revisao");
  return r;
}
export const lerId = (f: FormData, nome: string): string => uuidObrigatorio(f, nome);
