import { FormularioInvalido } from "./estrategia-form";
import type { OperationTaskFilter, TaskDueDateFilter } from "./estrategia";
import type { CampaignId } from "@oplyra/core";
/** Filtro de navegação; existência e autorização são conferidas pelo caso de uso. */
export type FiltroOperacao = OperationTaskFilter;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function lerFiltroOperacao(valor: unknown): FiltroOperacao {
  if (valor === undefined || valor === "todas") return { kind: "all" };
  if (valor === "avulsas") return { kind: "unlinked" };
  if (typeof valor === "string" && UUID.test(valor)) return { kind: "campaign", campaignId: valor.toLowerCase() as CampaignId };
  throw new FormularioInvalido("campanha");
}
export function valorFiltroOperacao(filtro: FiltroOperacao): string {
  return filtro.kind === "all" ? "todas" : filtro.kind === "unlinked" ? "avulsas" : filtro.campaignId;
}
const PRAZOS = { todas: "all", atrasadas: "overdue", hoje: "today", futuros: "upcoming", "sem-prazo": "undated", indisponiveis: "unclassified" } as const;
export function lerFiltroPrazo(valor: unknown): TaskDueDateFilter {
  if (valor === undefined) return "all";
  if (typeof valor === "string" && Object.hasOwn(PRAZOS, valor)) return PRAZOS[valor as keyof typeof PRAZOS];
  throw new FormularioInvalido("prazo");
}
export function valorFiltroPrazo(filtro: TaskDueDateFilter): string {
  return Object.entries(PRAZOS).find(([, value]) => value === filtro)![0];
}
/** Só recebe destinos locais construídos pela tela, nunca um retorno fornecido pelo navegador. */
export function manterFiltroOperacao(destino: string, filtro: FiltroOperacao, prazo: TaskDueDateFilter = "all"): string {
  const url = new URL(destino, "https://oplyra.invalid");
  const query = new URLSearchParams();
  if (filtro.kind !== "all") query.set("campanha", valorFiltroOperacao(filtro));
  if (prazo !== "all") query.set("prazo", valorFiltroPrazo(prazo));
  for (const [key, value] of url.searchParams) if (key !== "campanha" && key !== "prazo") query.append(key, value);
  const search = query.toString();
  return `${url.pathname}${search ? `?${search}` : ""}${url.hash}`;
}
