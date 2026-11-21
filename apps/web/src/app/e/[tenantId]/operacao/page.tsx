import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { contextoDaEmpresa } from "../../../../lib/session";
import { hojeDaOperacao } from "../../../../lib/operacao-prazos";
import { strategyDeps } from "../../../../lib/deps-estrategia";
import { filterTasksByDueDate, summarizeOpenTaskDueDates, isValidCivilDate, classifyTaskDueDate, sortTasksByDueDate, summarizeTaskDependencies, getOperationTasks, createTask, changeTaskStatus, saveTaskDetails } from "../../../../lib/estrategia";
import type { TaskStatus, Task, TaskDueDateFilter } from "../../../../lib/estrategia";
import { lerFiltroPrazo, valorFiltroPrazo, lerFiltroOperacao, manterFiltroOperacao, valorFiltroOperacao, type FiltroOperacao } from "../../../../lib/operacao-filtro";
import type { TaskId } from "@oplyra/core";
import { ROTULO_TAREFA, destinoDeErro, lerId, lerRevisao, lerTarefa, lerEdicaoDaTarefa, FormularioInvalido } from "../../../../lib/estrategia-form";
import { BotaoEnviar } from "../../../../components/botao-enviar";
import { TarefaDestino } from "../../../../components/tarefa-destino";
import { AvisoDeErro, AvisoSemPermissao } from "../../../../components/aviso-estrategia";
import estilos from "./operacao.module.css";

type Props = { params: Promise<{ tenantId: string }>; searchParams: Promise<{ erro?: string; ok?: string; problemas?: string; editar?: string; campanha?: string | string[]; prazo?: string | string[] }> };
const SELO = { todo: "selo pendente", in_progress: "selo pendente", done: "selo ok", cancelled: "selo proibido" } as const;
const PROXIMOS: Record<TaskStatus, readonly TaskStatus[]> = {
  todo: ["in_progress", "cancelled"], in_progress: ["done", "todo", "cancelled"], done: ["in_progress"], cancelled: [],
};
const ACAO: Record<TaskStatus, string> = { todo: "Voltar para a fazer", in_progress: "Iniciar", done: "Concluir", cancelled: "Cancelar" };
const COLUNAS = ["todo", "in_progress", "done"] as const;
const TITULO = { todo: "A fazer", in_progress: "Em andamento", done: "Concluídas" } as const;

type EditorProps = {
  tarefa: Task;
  tarefas: readonly Task[];
  campanhas: Awaited<ReturnType<typeof getOperationTasks>>["campaigns"];
  aberta: boolean;
  retorno: string;
  action: (dados: FormData) => Promise<void>;
};

/** Adaptação ao cartão K01: edição local ao objeto, sem campos de responsável/estado. */
function EditorDaTarefa({ tarefa, tarefas, campanhas, aberta, retorno, action }: EditorProps) {
  const prefixo = `editar_${tarefa.id}`;
  const candidatas = tarefas.filter((t) => t.id !== tarefa.id && (t.status !== "cancelled" || tarefa.dependsOn.includes(t.id)));
  const ausentes = tarefa.dependsOn.filter((id) => !tarefas.some((t) => t.id === id));
  return (
    <details id={`editar-${tarefa.id}`} open={aberta} className={estilos.editor}>
      <summary aria-label={`Editar tarefa: ${tarefa.title}`}>Editar tarefa</summary>
      <form action={action} className="pilha" aria-label={`Editar tarefa: ${tarefa.title}`}>
        <p className="muted">Responsável e estado são mantidos. A revisão será conferida ao salvar.</p>
        <input type="hidden" name="editar_tarefa" value={tarefa.id} />
        <input type="hidden" name="editar_revisao" value={tarefa.revision} />
        <div><label htmlFor={`${prefixo}_title`}>Título da tarefa</label><input id={`${prefixo}_title`} name="editar_title" defaultValue={tarefa.title} maxLength={200} required /></div>
        <div><label htmlFor={`${prefixo}_description`}>Descrição da tarefa</label><textarea id={`${prefixo}_description`} name="editar_description" defaultValue={tarefa.description} maxLength={2000} rows={3} /></div>
        <div><label htmlFor={`${prefixo}_campaign`}>Campanha da tarefa</label><select id={`${prefixo}_campaign`} name="editar_campaignId" defaultValue={tarefa.campaignId ?? ""}>
          <option value="">Tarefa avulsa</option>
          {tarefa.campaignId && !campanhas.some((c) => c.id === tarefa.campaignId) && <option value={tarefa.campaignId}>Campanha indisponível</option>}
          {campanhas.map((c) => <option key={c.id} value={c.id}>{c.name || "(sem nome)"}</option>)}
        </select></div>
        <div><label htmlFor={`${prefixo}_due`}>Prazo da tarefa</label><input id={`${prefixo}_due`} name="editar_dueDate" type="date" defaultValue={tarefa.dueDate ?? ""} /></div>
        {(candidatas.length > 0 || ausentes.length > 0) && <fieldset className={`item ${estilos.dependencias}`}>
          <legend>Dependências da tarefa</legend>
          {candidatas.map((t) => <label key={t.id} className="inline" htmlFor={`${prefixo}_dep_${t.id}`}><input id={`${prefixo}_dep_${t.id}`} type="checkbox" name="editar_dep" value={t.id} defaultChecked={tarefa.dependsOn.includes(t.id)} /><span>Depende de {t.title}</span></label>)}
          {ausentes.map((id) => <label key={id} className="inline" htmlFor={`${prefixo}_dep_${id}`}><input id={`${prefixo}_dep_${id}`} type="checkbox" name="editar_dep" value={id} defaultChecked /><span>Dependência indisponível; será conferida ao salvar</span></label>)}
        </fieldset>}
        <div className="linha"><BotaoEnviar rotuloEmEspera="Salvando…">Salvar tarefa</BotaoEnviar><a className="btn secundario" href={`${retorno}#tarefa-${tarefa.id}`}>Fechar edição</a></div>
      </form>
    </details>
  );
}

async function editarTarefa(tenantId: string, base: string, filtro: FiltroOperacao, filtroPrazo: TaskDueDateFilter, tarefaEsperada: string, dados: FormData): Promise<void> {
  const ctx = await contextoDaEmpresa(tenantId);
  try {
    await getOperationTasks(strategyDeps, ctx, filtro);
    const entrada = lerEdicaoDaTarefa(dados);
    if (entrada.taskId !== tarefaEsperada) throw new FormularioInvalido("editar_tarefa");
    await saveTaskDetails(strategyDeps, { ctx, ...entrada });
  } catch (e) {
    redirect(manterFiltroOperacao(`${destinoDeErro(base, e)}&editar=${encodeURIComponent(tarefaEsperada)}#editar-${tarefaEsperada}`, filtro, filtroPrazo));
  }
  revalidatePath(base);
  redirect(manterFiltroOperacao(`${base}?ok=salva#tarefa-${tarefaEsperada}`, filtro, filtroPrazo));
}

// A action fecha apenas sobre identificadores e refaz identidade/permissão pelo caso de uso.
async function mudarTarefa(tenantId: string, base: string, filtro: FiltroOperacao, filtroPrazo: TaskDueDateFilter, para: TaskStatus, dados: FormData): Promise<void> {
  const contexto = await contextoDaEmpresa(tenantId);
  try {
    await getOperationTasks(strategyDeps, contexto, filtro);
    await changeTaskStatus(strategyDeps, { ctx: contexto, taskId: lerId(dados, "tarefa") as TaskId, expectedRevision: lerRevisao(dados), to: para });
  } catch (e) { redirect(manterFiltroOperacao(destinoDeErro(base, e), filtro, filtroPrazo)); }
  revalidatePath(base);
  redirect(manterFiltroOperacao(`${base}?ok=estado`, filtro, filtroPrazo));
}

/** K01 (36:4863): quadro e cartões adaptados aos estados reais de tarefa. */
export default async function Operacao({ params, searchParams }: Props) {
  const { tenantId } = await params;
  const { erro, ok, problemas, editar, campanha, prazo } = await searchParams;
  const ctx = await contextoDaEmpresa(tenantId);
  const base = `/e/${encodeURIComponent(tenantId)}/operacao`;
  if (!ctx.permissions.has("strategy.read")) return <AvisoSemPermissao titulo="Operação" oque="ver a operação" />;

  let filtro: FiltroOperacao;
  let filtroPrazo: TaskDueDateFilter;
  let leitura: Awaited<ReturnType<typeof getOperationTasks>>;
  try {
    filtroPrazo = lerFiltroPrazo(prazo);
    filtro = lerFiltroOperacao(campanha);
    leitura = await getOperationTasks(strategyDeps, ctx, filtro);
  } catch (e) {
    if (!(e instanceof FormularioInvalido) && !(e instanceof Error && "code" in e && e.code === "CAMPAIGN_NOT_FOUND")) throw e;
    return <div className="pilha"><h1>Operação</h1><div className="erro" role="alert"><p>{e instanceof FormularioInvalido && e.message === "prazo" ? "Filtro de prazo inválido." : "Filtro de campanha inválido ou indisponível nesta empresa."}</p></div><a className="btn secundario" href={base}>Limpar filtro</a></div>;
  }
  const { tasks: tarefasDaCampanha, references: referencias, campaigns: campanhas } = leitura;
  const hoje = await hojeDaOperacao(ctx);
  const resumoPrazos = summarizeOpenTaskDueDates(tarefasDaCampanha, hoje, ctx.tenantId);
  const recortePrazo = filterTasksByDueDate(tarefasDaCampanha, hoje, ctx.tenantId, filtroPrazo);
  const tarefas = recortePrazo.tasks;
  const tarefasPorPrazo = sortTasksByDueDate(tarefas);
  const retorno = manterFiltroOperacao(base, filtro, filtroPrazo);
  const podeEditar = ctx.permissions.has("strategy.write");
  const referenciasPorId = new Map(referencias.filter(t => t.tenantId === ctx.tenantId).map(t => [t.id, t]));
  const nomesCampanhas = new Map(campanhas.map((c) => [c.id, c.name || "(sem nome)"]));
  const dependencias = referencias.filter((t) => t.status !== "cancelled");
  const canceladas = tarefas.filter((t) => t.status === "cancelled");

  async function nova(dados: FormData) {
    "use server";
    const contexto = await contextoDaEmpresa(tenantId);
    try { await getOperationTasks(strategyDeps, contexto, filtro); await createTask(strategyDeps, { ctx: contexto, content: lerTarefa(dados) }); }
    catch (e) { redirect(manterFiltroOperacao(destinoDeErro(base, e), filtro, filtroPrazo)); }
    revalidatePath(base);
    redirect(manterFiltroOperacao(`${base}?ok=criada`, filtro, filtroPrazo));
  }
  async function iniciar(d: FormData) { "use server"; return mudarTarefa(tenantId, base, filtro, filtroPrazo, "in_progress", d); }
  async function concluir(d: FormData) { "use server"; return mudarTarefa(tenantId, base, filtro, filtroPrazo, "done", d); }
  async function reabrir(d: FormData) { "use server"; return mudarTarefa(tenantId, base, filtro, filtroPrazo, "todo", d); }
  async function cancelar(d: FormData) { "use server"; return mudarTarefa(tenantId, base, filtro, filtroPrazo, "cancelled", d); }
  const acoes = { todo: reabrir, in_progress: iniciar, done: concluir, cancelled: cancelar };

  function cartao(t: typeof tarefas[number]) {
    const tarefaId = t.id;
    const sinal = summarizeTaskDependencies(t, referencias);
    const prazo = classifyTaskDueDate(t, hoje);
    async function salvar(dados: FormData) { "use server"; return editarTarefa(tenantId, base, filtro, filtroPrazo, tarefaId, dados); }
    return (
      <li key={t.id} id={`tarefa-${t.id}`} className={estilos.tarefa}>
        <div className={estilos.tituloTarefa}>
          <h3>{t.title}</h3><span className={SELO[t.status]}>{ROTULO_TAREFA[t.status]}</span>
        </div>
        {t.description && <p className="texto">{t.description}</p>}
        <p className={estilos.contexto}>{t.campaignId ? `Campanha: ${nomesCampanhas.get(t.campaignId) ?? "Indisponível"}` : "Tarefa avulsa"}</p>
        <p data-testid="prazo-tarefa" className={estilos.contexto}>Prazo: {t.dueDate === null ? "Sem prazo" : isValidCivilDate(t.dueDate) ? <time dateTime={t.dueDate}>{t.dueDate.split("-").reverse().join("/")}</time> : "Prazo indisponível"}
          {prazo === "overdue" && <span className={estilos.prazoAtrasado}> · Atrasada</span>}
          {prazo === "today" && <span className={estilos.prazoHoje}> · Hoje</span>}
          {prazo === "upcoming" && <span> · Prazo futuro</span>}
        </p>
        {t.dependsOn.length > 0 && <p className={estilos.contexto}>Depende de: {t.dependsOn.map((id) => referenciasPorId.has(id) ? `${referenciasPorId.get(id)!.title} — ${ROTULO_TAREFA[referenciasPorId.get(id)!.status]}` : "Dependência indisponível").join(", ")}</p>}
        {sinal.total > 0 && <div role="note" aria-label="Situação das dependências" className={`${estilos.sinalDependencias} ${sinal.attentionRequired ? estilos.atencaoDependencias : ""}`}>
          <p><strong>{sinal.attentionRequired ? "Dependências sem conclusão" : sinal.completed === sinal.total ? "Dependências concluídas" : "Dependências registradas"}</strong></p>
          <p>Concluídas: {sinal.completed} · Pendentes: {sinal.pending} · Canceladas: {sinal.cancelled} · Indisponíveis: {sinal.unavailable}</p>
          {sinal.attentionRequired && <p>Esta indicação não impede alterar o estado da tarefa.</p>}
        </div>}
        {podeEditar && PROXIMOS[t.status].length > 0 && (
          <div className={estilos.acoes}>
            {PROXIMOS[t.status].map((para) => (
              <form key={para} action={acoes[para]}>
                <input type="hidden" name="tarefa" value={t.id} />
                <input type="hidden" name="revisao" value={t.revision} />
                <BotaoEnviar variante={para === "cancelled" || para === "todo" ? "secundario" : "primario"} rotuloEmEspera="Salvando…">
                  {t.status === "done" && para === "in_progress" ? "Reabrir" : ACAO[para]}
                </BotaoEnviar>
              </form>
            ))}
          </div>
        )}
        {podeEditar && t.status !== "cancelled" && <EditorDaTarefa key={`${t.id}:${t.revision}:${editar === t.id ? "aberta" : "fechada"}`} tarefa={t} tarefas={referencias} campanhas={campanhas} retorno={retorno} aberta={editar === t.id} action={salvar} />}
      </li>
    );
  }

  return (
    <div className={`pilha ${estilos.operacao}`}>
      <TarefaDestino taskIds={tarefas.map(t => t.id)} />
      <header className={estilos.cabecalho}>
        <div><h1>Operação</h1><p className="muted">Organize as tarefas da empresa, suas campanhas, prazos e dependências.</p></div>
        {podeEditar && <a className="btn" href="#nova-tarefa">Nova tarefa</a>}
      </header>
      <form method="get" action={base} className={`card ${estilos.filtro}`} aria-label="Filtrar tarefas por campanha">
        <div><label htmlFor="filtro-prazo">Filtrar tarefas por prazo</label><select id="filtro-prazo" name="prazo" defaultValue={valorFiltroPrazo(filtroPrazo)}>
          <option value="todas">Todos os prazos</option><option value="atrasadas">Atrasadas</option><option value="hoje">Hoje</option><option value="futuros">Prazos futuros</option><option value="sem-prazo">Sem prazo</option><option value="indisponiveis">Prazos indisponíveis</option>
        </select></div>
        <div><label htmlFor="filtro-campanha">Filtrar tarefas por campanha</label><select id="filtro-campanha" name="campanha" defaultValue={valorFiltroOperacao(filtro)}>
          <option value="todas">Todas as tarefas</option><option value="avulsas">Somente tarefas avulsas</option>
          {campanhas.map(c => <option key={c.id} value={c.id}>{c.name || "(sem nome)"}</option>)}
        </select></div><button className="btn" type="submit">Aplicar filtro</button>
        {(filtro.kind !== "all" || filtroPrazo !== "all") && <a className="btn secundario" href={base}>Limpar filtro</a>}
      </form>
      {ok === "criada" && <p className="sucesso" role="status">Tarefa criada.</p>}
      {ok === "estado" && <p className="sucesso" role="status">Estado da tarefa atualizado.</p>}
      {ok === "salva" && <p className="sucesso" role="status">Tarefa atualizada.</p>}
      <AvisoDeErro erro={erro} problemas={problemas} />
      {!podeEditar && <p className="aviso">Você tem acesso de leitura. A criação e a alteração de tarefas exigem permissão de escrita.</p>}
      <section className={`card ${estilos.resumoPrazos}`} aria-labelledby="resumo-prazos">
        <h2 id="resumo-prazos">Resumo dos prazos das tarefas abertas</h2>
        <p className="muted">Escopo: {filtro.kind === "all" ? "todas as tarefas abertas desta empresa" : filtro.kind === "unlinked" ? "tarefas abertas avulsas desta empresa" : `tarefas abertas da campanha ${nomesCampanhas.get(filtro.campaignId) ?? "selecionada"}`}.</p>
        <p className="muted">{resumoPrazos.relativeDatesAvailable ? `Referência: ${hoje!.split("-").reverse().join("/")}` : "Referência de data indisponível"}.</p>
        <p className="muted">Concluídas e canceladas não entram neste resumo. O filtro de prazo não altera este resumo.</p>
        <dl className={estilos.contagensPrazos}>
          <div><dt>Tarefas abertas</dt><dd>{resumoPrazos.totalOpen}</dd></div>
          <div><dt>Atrasadas</dt><dd>{resumoPrazos.relativeDatesAvailable ? resumoPrazos.overdue : "Indisponível"}</dd></div>
          <div><dt>Hoje</dt><dd>{resumoPrazos.relativeDatesAvailable ? resumoPrazos.dueToday : "Indisponível"}</dd></div>
          <div><dt>Prazos futuros</dt><dd>{resumoPrazos.relativeDatesAvailable ? resumoPrazos.upcoming : "Indisponível"}</dd></div>
          <div><dt>Sem prazo</dt><dd>{resumoPrazos.undated}</dd></div>
          <div><dt>Prazos indisponíveis</dt><dd>{resumoPrazos.unclassified}</dd></div>
        </dl>
      </section>
      <section aria-labelledby="tarefas">
        <h2 id="tarefas">Tarefas</h2>
        <p className="muted">A fazer e Em andamento: prazos mais próximos primeiro; tarefas sem prazo ao final. Datas iguais mantêm a ordem anterior.</p>
        {!hoje && <p className="aviso" role="note" aria-label="Classificação dos prazos">Classificação de prazos indisponível. As datas informadas continuam visíveis.</p>}
        <p className="muted">Filtro de prazo: {({ all: "Todos os prazos", overdue: "Atrasadas", today: "Hoje", upcoming: "Prazos futuros", undated: "Sem prazo", unclassified: "Prazos indisponíveis" } as const)[filtroPrazo]}.</p>
        {recortePrazo.available && <p className="muted">Tarefas exibidas: {tarefas.length}.</p>}
        {!recortePrazo.available ? <div className="aviso" role="note" aria-label="Filtro de prazo indisponível"><p>O filtro de prazo não pode ser aplicado sem uma data de referência válida.</p></div> : tarefas.length === 0 ? <div className="card vazio"><p>{filtroPrazo !== "all" ? "Nenhuma tarefa aberta corresponde a este filtro de prazo." : filtro.kind === "all" ? "Nenhuma tarefa ainda." : filtro.kind === "unlinked" ? "Nenhuma tarefa avulsa." : "Nenhuma tarefa vinculada a esta campanha."}</p><p>{filtro.kind === "all" && filtroPrazo === "all" ? "Registre o trabalho que precisa acontecer e o que depende de quê." : "Altere ou limpe o filtro para consultar outras tarefas da empresa."}</p></div> : (
          <div className={estilos.quadro}>
            {COLUNAS.map((estado) => <section key={estado} className={estilos.coluna} aria-labelledby={`coluna-${estado}`}>
              <h2 id={`coluna-${estado}`}>{TITULO[estado]}</h2>
              <ul className={estilos.lista}>{(estado === "done" ? tarefas : tarefasPorPrazo).filter((t) => t.status === estado).map(cartao)}</ul>
              {!tarefas.some((t) => t.status === estado) && <p className={estilos.vazioColuna}>Nenhuma tarefa neste estado.</p>}
            </section>)}
          </div>
        )}
      </section>
      {canceladas.length > 0 && <section aria-labelledby="canceladas"><h2 id="canceladas">Canceladas</h2><ul className={estilos.canceladas}>{canceladas.map(cartao)}</ul></section>}
      {podeEditar && <section id="nova-tarefa" className={`card ${estilos.formulario}`} aria-labelledby="nova-tarefa-titulo">
        <h2 id="nova-tarefa-titulo">Nova tarefa</h2>
        <p className="muted">Título obrigatório. A atribuição de responsáveis ainda não está disponível nesta tela.</p>
        <form action={nova} className="pilha">
          <div><label htmlFor="title">Título</label><input id="title" name="title" maxLength={200} required /></div>
          <div><label htmlFor="description">Descrição (opcional)</label><textarea id="description" name="description" rows={3} maxLength={2000} /></div>
          <div className={estilos.campos}>
            <div><label htmlFor="campaignId">Campanha (opcional)</label><select id="campaignId" name="campaignId" defaultValue={filtro.kind === "campaign" ? filtro.campaignId : ""}><option value="">Tarefa avulsa</option>{campanhas.map((c) => <option key={c.id} value={c.id}>{c.name || "(sem nome)"}</option>)}</select></div>
            <div><label htmlFor="dueDate">Prazo (opcional)</label><input id="dueDate" name="dueDate" type="date" /></div>
          </div>
          {dependencias.length > 0 && <fieldset className={`item ${estilos.dependencias}`}>
            <legend>Depende de (opcional)</legend>
            {dependencias.map((t) => <label key={t.id} className="inline" htmlFor={`dep_${t.id}`}><input id={`dep_${t.id}`} name="dep" type="checkbox" value={t.id} /><span>{t.title}</span></label>)}
          </fieldset>}
          <BotaoEnviar rotuloEmEspera="Criando…">Criar tarefa</BotaoEnviar>
        </form>
      </section>}
    </div>
  );
}
