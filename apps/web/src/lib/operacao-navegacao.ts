import type { TaskId } from "@oplyra/core";
import type { Task, TaskDueDateFilter } from "./estrategia";
import { FormularioInvalido } from "./estrategia-form";
import { lerFiltroOperacao, lerFiltroPrazo, manterFiltroOperacao, valorFiltroOperacao, valorFiltroPrazo, type FiltroOperacao } from "./operacao-filtro";

export type RetornoOperacao = { readonly campanha: FiltroOperacao; readonly prazo: TaskDueDateFilter; readonly tarefaId: TaskId | null };
type QueryRetorno = { origem?: unknown; op_campanha?: unknown; op_prazo?: unknown; op_tarefa?: unknown };
const KEYS = ["origem", "op_campanha", "op_prazo", "op_tarefa"] as const;
const UUID_SOURCE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UUID = new RegExp(`^${UUID_SOURCE}$`, "i");
const invalid = (): never => { throw new FormularioInvalido("retorno"); };
function id(value: unknown): string { return typeof value === "string" && UUID.test(value) ? value.toLowerCase() : invalid(); }

/** Apenas estado tipado de navegação; nenhuma URL de retorno vem do navegador. */
export function lerRetornoOperacao(query: QueryRetorno): RetornoOperacao | null {
  if (!query || typeof query !== "object" || Array.isArray(query)) return invalid();
  if (KEYS.some(key => key in query && !Object.hasOwn(query, key))) return invalid();
  if (KEYS.every(key => query[key] === undefined)) return null;
  if (query.origem !== "operacao" || typeof query.op_campanha !== "string" || typeof query.op_prazo !== "string") return invalid();
  try {
    return { campanha: lerFiltroOperacao(query.op_campanha), prazo: lerFiltroPrazo(query.op_prazo), tarefaId: query.op_tarefa === undefined ? null : id(query.op_tarefa) as TaskId };
  } catch (error) {
    if (error instanceof FormularioInvalido) return invalid();
    throw error;
  }
}
function checked(retorno: RetornoOperacao): RetornoOperacao {
  if (!retorno || typeof retorno !== "object" || !Object.hasOwn(retorno, "campanha") || !Object.hasOwn(retorno, "prazo") || !Object.hasOwn(retorno, "tarefaId")) return invalid();
  const campaign = retorno.campanha;
  if (!campaign || typeof campaign !== "object" || !Object.hasOwn(campaign, "kind")) return invalid();
  if (campaign.kind !== "all" && campaign.kind !== "unlinked" && campaign.kind !== "campaign") return invalid();
  if (campaign.kind === "campaign" && (!Object.hasOwn(campaign, "campaignId") || typeof campaign.campaignId !== "string" || !UUID.test(campaign.campaignId))) return invalid();
  if (!["all", "overdue", "today", "upcoming", "undated", "unclassified"].includes(retorno.prazo)) return invalid();
  if (retorno.tarefaId !== null && (typeof retorno.tarefaId !== "string" || !UUID.test(retorno.tarefaId))) return invalid();
  return lerRetornoOperacao({ origem: "operacao", op_campanha: valorFiltroOperacao(campaign), op_prazo: valorFiltroPrazo(retorno.prazo), ...(retorno.tarefaId === null ? {} : { op_tarefa: retorno.tarefaId }) })!;
}
function localCampaignDestination(destino: string, strictTenant: boolean): URL {
  if (typeof destino !== "string" || /[\\\u0000-\u0020\u007f]/.test(destino)) return invalid();
  const path = destino.split(/[?#]/, 1)[0]!;
  const tenant = strictTenant ? UUID_SOURCE : "[A-Za-z0-9_-]+";
  if (!new RegExp(`^/e/${tenant}/estrategia/campanhas/${UUID_SOURCE}$`, "i").test(path)) return invalid();
  const url = new URL(destino, "https://oplyra.invalid");
  if (url.origin !== "https://oplyra.invalid" || url.pathname !== path) return invalid();
  return url;
}
/** Somente destinos internos construídos pela tela; conserva erros, feedback e fragmento. */
export function manterRetornoOperacao(destino: string, retorno: RetornoOperacao | null): string {
  const value = retorno === null ? null : checked(retorno);
  const url = localCampaignDestination(destino, value !== null);
  for (const key of KEYS) url.searchParams.delete(key);
  if (value) {
    url.searchParams.set("origem", "operacao"); url.searchParams.set("op_campanha", valorFiltroOperacao(value.campanha));
    url.searchParams.set("op_prazo", valorFiltroPrazo(value.prazo));
    if (value.tarefaId) url.searchParams.set("op_tarefa", value.tarefaId);
  }
  const search = url.searchParams.toString();
  return `${url.pathname}${search ? `?${search}` : ""}${url.hash}`;
}
export function linkCampanhaDaOperacao(tenantId: string, campaignId: string, retorno: RetornoOperacao): string {
  return manterRetornoOperacao(`/e/${id(tenantId)}/estrategia/campanhas/${id(campaignId)}`, retorno);
}
export function destinoRetornoOperacao(tenantId: string, retorno: RetornoOperacao): string {
  const value = checked(retorno);
  const base = manterFiltroOperacao(`/e/${id(tenantId)}/operacao`, value.campanha, value.prazo);
  return `${base}${value.tarefaId ? `#tarefa-${value.tarefaId}` : ""}`;
}
/** Não autoriza leitura: a lista deve vir do caso de uso tenant-scoped da campanha atual. */
export function validarRetornoDaCampanha(retorno: RetornoOperacao | null, campaignId: string, tarefas: readonly Task[]): void {
  if (retorno === null) return;
  const value = checked(retorno), campaign = id(campaignId);
  if (value.campanha.kind === "campaign" && value.campanha.campaignId !== campaign) return invalid();
  if (value.tarefaId && (value.campanha.kind === "unlinked" || !tarefas.some(task => task.id === value.tarefaId && task.campaignId === campaign))) return invalid();
}
