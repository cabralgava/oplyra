import { FormularioInvalido } from "./estrategia-form";
import type { OperationTaskFilter } from "./estrategia";
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
/** Só recebe destinos locais construídos pela tela, nunca um retorno fornecido pelo navegador. */
export function manterFiltroOperacao(destino: string, filtro: FiltroOperacao): string {
  if (filtro.kind === "all") return destino;
  const url = new URL(destino, "https://oplyra.invalid");
  const query = new URLSearchParams();
  query.set("campanha", valorFiltroOperacao(filtro));
  for (const [key, value] of url.searchParams) if (key !== "campanha") query.append(key, value);
  return `${url.pathname}?${query.toString()}${url.hash}`;
}
