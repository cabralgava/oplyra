import { contextoDaEmpresa } from "../../../../../../lib/session";
import { strategyDeps } from "../../../../../../lib/deps-estrategia";
import { getTaskDetails, TaskNotFound, classifyTaskDueDate, isValidCivilDate, summarizeTaskDependencies } from "../../../../../../lib/estrategia";
import { ROTULO_TAREFA, FormularioInvalido } from "../../../../../../lib/estrategia-form";
import { hojeDaOperacao } from "../../../../../../lib/operacao-prazos";
import { lerRetornoOperacao, destinoRetornoOperacao, linkCampanhaDaOperacao, type RetornoOperacao } from "../../../../../../lib/operacao-navegacao";
import { validarRetornoDaTarefa } from "../../../../../../lib/operacao-tarefa-navegacao";
import { AvisoSemPermissao } from "../../../../../../components/aviso-estrategia";
import type { TaskId } from "@oplyra/core";
import styles from "./tarefa-detalhe.module.css";

type Props = {
  params: Promise<{ tenantId: string; taskId: string }>;
  searchParams: Promise<{ origem?: unknown; op_campanha?: unknown; op_prazo?: unknown; op_tarefa?: unknown }>;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function ErroDaTarefa({ base, retorno = false }: { base: string; retorno?: boolean }) {
  return <div className="pilha"><h1>Tarefa</h1><div className="erro" role="alert"><p>{retorno ? "Contexto de retorno à Operação inválido ou indisponível." : "Tarefa não encontrada ou indisponível nesta empresa."}</p></div><a className="btn secundario" href={base}>Abrir Operação</a></div>;
}

/** Detalhe oficial somente de leitura; autorização vem do caso de uso, não da navegação. */
export default async function DetalheDaTarefa({ params, searchParams }: Props) {
  const { tenantId, taskId } = await params;
  const ctx = await contextoDaEmpresa(tenantId);
  const base = `/e/${encodeURIComponent(tenantId)}/operacao`;
  if (!ctx.permissions.has("strategy.read")) return <AvisoSemPermissao titulo="Tarefa" oque="ver tarefas" />;
  let retorno: RetornoOperacao | null;
  try { retorno = lerRetornoOperacao(await searchParams); }
  catch (error) { if (error instanceof FormularioInvalido) return <ErroDaTarefa base={base} retorno />; throw error; }
  if (!UUID.test(taskId)) return <ErroDaTarefa base={base} />;
  let details: Awaited<ReturnType<typeof getTaskDetails>>;
  try { details = await getTaskDetails(strategyDeps, ctx, taskId.toLowerCase() as TaskId); }
  catch (error) { if (error instanceof TaskNotFound) return <ErroDaTarefa base={base} />; throw error; }
  const { task, campaign, dependencies, unavailableDependencyCount } = details;
  try { validarRetornoDaTarefa(retorno, task); }
  catch (error) { if (error instanceof FormularioInvalido) return <ErroDaTarefa base={base} retorno />; throw error; }
  const contextoDeRetorno: RetornoOperacao = retorno ? { ...retorno, tarefaId: task.id } : { campanha: { kind: "all" }, prazo: "all", tarefaId: task.id };
  const hoje = await hojeDaOperacao(ctx);
  const prazo = classifyTaskDueDate(task, hoje);
  const sinal = summarizeTaskDependencies(task, dependencies);
  const responsavel = task.assignee === null ? "Sem responsável" : task.assignee.kind === "agent" ? "Agente" : task.assignee.userId === ctx.userId ? "Você" : "Outra pessoa";
  const registroValido = task.createdAt instanceof Date && Number.isFinite(task.createdAt.getTime());
  const registro = registroValido ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(task.createdAt) : null;
  return (
    <div className={`pilha ${styles.detalhe}`}>
      <header className={`entre ${styles.cabecalho}`}>
        <div><p className="muted">Tarefa · somente leitura</p><h1>{task.title}</h1></div>
        <a className="btn secundario" href={destinoRetornoOperacao(tenantId, contextoDeRetorno)}>{retorno ? "Voltar à Operação" : "Abrir na Operação"}</a>
      </header>
      {retorno && <p className="muted">Os filtros de origem são mantidos. A tarefa pode ficar fora desse recorte ao voltar.</p>}
      <section className="card" aria-labelledby="dados-tarefa">
        <h2 id="dados-tarefa">Dados da tarefa</h2>
        <dl className={styles.dados}>
          <div><dt>Descrição</dt><dd className="texto">{task.description || "Nenhuma descrição informada."}</dd></div>
          <div><dt>Estado</dt><dd><span className={`selo ${task.status === "done" ? "ok" : task.status === "cancelled" ? "proibido" : "pendente"}`}>{ROTULO_TAREFA[task.status]}</span></dd></div>
          <div><dt>Prazo</dt><dd data-testid="prazo-tarefa">{task.dueDate === null ? "Sem prazo" : isValidCivilDate(task.dueDate) ? <time dateTime={task.dueDate}>{task.dueDate.split("-").reverse().join("/")}</time> : "Prazo indisponível"}{prazo === "overdue" ? " · Atrasada" : prazo === "today" ? " · Hoje" : prazo === "upcoming" ? " · Prazo futuro" : ""}</dd></div>
          <div><dt>Campanha</dt><dd>{campaign ? <><span>{campaign.name || "Campanha sem nome"}</span> <a className="btn secundario" href={linkCampanhaDaOperacao(tenantId, campaign.id, contextoDeRetorno)}>Ver campanha</a></> : task.campaignId === null ? "Tarefa avulsa" : "Campanha indisponível"}</dd></div>
          <div><dt>Responsável</dt><dd>{responsavel}</dd></div>
          <div><dt>Revisão</dt><dd>{task.revision}</dd></div>
          <div><dt>Registro</dt><dd>{registro ? <><time dateTime={task.createdAt.toISOString()}>{registro}</time> UTC</> : "Data de registro indisponível."}</dd></div>
        </dl>
        {!hoje && <p className="aviso" role="note" aria-label="Classificação dos prazos">Classificação de prazos indisponível.</p>}
      </section>
      <section className="card" aria-labelledby="dependencias-tarefa">
        <h2 id="dependencias-tarefa">Dependências da tarefa</h2>
        {task.dependsOn.length === 0 ? <p>Nenhuma dependência registrada.</p> : <>
          {dependencies.length > 0 && <ul className={styles.dependencias}>{dependencies.map(dependency => <li key={dependency.id}><span>{dependency.title}</span> <span>{ROTULO_TAREFA[dependency.status]}</span></li>)}</ul>}
          {unavailableDependencyCount > 0 && <p>{unavailableDependencyCount} {unavailableDependencyCount === 1 ? "dependência indisponível" : "dependências indisponíveis"}.</p>}
          <div className="aviso" role="note" aria-label="Situação das dependências"><strong>{sinal.attentionRequired ? "Dependências sem conclusão" : sinal.completed === sinal.total ? "Dependências concluídas" : "Dependências registradas"}</strong><p>Concluídas: {sinal.completed} · Pendentes: {sinal.pending} · Canceladas: {sinal.cancelled} · Indisponíveis: {sinal.unavailable}</p>{sinal.attentionRequired && <p>Esta indicação não impede alterar o estado da tarefa.</p>}</div>
        </>}
      </section>
    </div>
  );
}
