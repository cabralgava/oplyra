import type { Task } from "./estrategia";
import { FormularioInvalido } from "./estrategia-form";
import { destinoRetornoOperacao, type RetornoOperacao } from "./operacao-navegacao";
import { valorFiltroOperacao, valorFiltroPrazo } from "./operacao-filtro";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function id(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new FormularioInvalido("retorno");
  return value.toLowerCase();
}
/** Constrói apenas a rota da tarefa. O contexto é navegação, nunca autorização. */
export function linkDetalheDaTarefa(tenantId: string, taskId: string, retorno: RetornoOperacao): string {
  const tenant = id(tenantId), task = id(taskId);
  // O construtor existente valida o formato inteiro do contexto sem executar navegação.
  destinoRetornoOperacao(tenant, retorno);
  const query = new URLSearchParams({ origem: "operacao", op_campanha: retorno.campanha.kind === "campaign" ? id(retorno.campanha.campaignId) : valorFiltroOperacao(retorno.campanha), op_prazo: valorFiltroPrazo(retorno.prazo), op_tarefa: task });
  return `/e/${tenant}/operacao/tarefas/${task}?${query.toString()}`;
}
/** Só recebe a tarefa já autorizada pelo caso de uso, nunca um objeto enviado pelo navegador. */
export function validarRetornoDaTarefa(retorno: RetornoOperacao | null, task: Task): void {
  if (retorno === null) return;
  destinoRetornoOperacao(task.tenantId, retorno);
  if (retorno.tarefaId !== null && id(retorno.tarefaId) !== id(task.id)) throw new FormularioInvalido("retorno");
  if (retorno.campanha.kind === "campaign" && (task.campaignId === null || id(retorno.campanha.campaignId) !== id(task.campaignId))) throw new FormularioInvalido("retorno");
  if (retorno.campanha.kind === "unlinked" && task.campaignId !== null) throw new FormularioInvalido("retorno");
}

/** Origem tipada; rejeita valores repetidos, vazios ou herdados antes da leitura. */
export function lerTarefaOrigem(query: { tarefa_origem?: unknown }): string | null {
  if ("tarefa_origem" in query && !Object.hasOwn(query, "tarefa_origem")) throw new FormularioInvalido("retorno");
  return query.tarefa_origem === undefined ? null : id(query.tarefa_origem);
}
/** Apenas rota local. A relação entre origem e dependência será conferida pelo caso de uso. */
export function linkDetalheDaDependencia(tenantId: string, dependencyId: string, originTaskId: string, retorno: RetornoOperacao | null): string {
  const tenant = id(tenantId), dependency = id(dependencyId), origin = id(originTaskId);
  const query = retorno === null ? new URLSearchParams() : new URL(linkDetalheDaTarefa(tenant, origin, retorno), "https://oplyra.invalid").searchParams;
  query.set("tarefa_origem", origin);
  return `/e/${tenant}/operacao/tarefas/${dependency}?${query.toString()}`;
}
export function linkTarefaDeOrigem(tenantId: string, originTaskId: string, retorno: RetornoOperacao | null): string {
  return retorno === null ? `/e/${id(tenantId)}/operacao/tarefas/${id(originTaskId)}` : linkDetalheDaTarefa(tenantId, originTaskId, retorno);
}
