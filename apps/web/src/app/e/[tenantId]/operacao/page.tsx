import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { contextoDaEmpresa } from "../../../../lib/session";
import { strategyDeps } from "../../../../lib/deps-estrategia";
import { listTasks, createTask, changeTaskStatus, listCampaigns, saveTaskDetails } from "../../../../lib/estrategia";
import type { TaskStatus, Task } from "../../../../lib/estrategia";
import type { TaskId } from "@oplyra/core";
import { ROTULO_TAREFA, destinoDeErro, lerId, lerRevisao, lerTarefa, lerEdicaoDaTarefa, FormularioInvalido } from "../../../../lib/estrategia-form";
import { BotaoEnviar } from "../../../../components/botao-enviar";
import { TarefaDestino } from "../../../../components/tarefa-destino";
import { AvisoDeErro, AvisoSemPermissao } from "../../../../components/aviso-estrategia";
import estilos from "./operacao.module.css";

type Props = { params: Promise<{ tenantId: string }>; searchParams: Promise<{ erro?: string; ok?: string; problemas?: string; editar?: string }> };
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
  campanhas: Awaited<ReturnType<typeof listCampaigns>>;
  aberta: boolean;
  action: (dados: FormData) => Promise<void>;
};

/** Adaptação ao cartão K01: edição local ao objeto, sem campos de responsável/estado. */
function EditorDaTarefa({ tarefa, tarefas, campanhas, aberta, action }: EditorProps) {
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
        <div className="linha"><BotaoEnviar rotuloEmEspera="Salvando…">Salvar tarefa</BotaoEnviar><a className="btn secundario" href={`?editar=#tarefa-${tarefa.id}`}>Fechar edição</a></div>
      </form>
    </details>
  );
}

async function editarTarefa(tenantId: string, base: string, tarefaEsperada: string, dados: FormData): Promise<void> {
  const ctx = await contextoDaEmpresa(tenantId);
  try {
    const entrada = lerEdicaoDaTarefa(dados);
    if (entrada.taskId !== tarefaEsperada) throw new FormularioInvalido("editar_tarefa");
    await saveTaskDetails(strategyDeps, { ctx, ...entrada });
  } catch (e) {
    redirect(`${destinoDeErro(base, e)}&editar=${encodeURIComponent(tarefaEsperada)}#editar-${tarefaEsperada}`);
  }
  revalidatePath(base);
  redirect(`${base}?ok=salva#tarefa-${tarefaEsperada}`);
}

// A action fecha apenas sobre identificadores e refaz identidade/permissão pelo caso de uso.
async function mudarTarefa(tenantId: string, base: string, para: TaskStatus, dados: FormData): Promise<void> {
  const contexto = await contextoDaEmpresa(tenantId);
  try {
    await changeTaskStatus(strategyDeps, { ctx: contexto, taskId: lerId(dados, "tarefa") as TaskId, expectedRevision: lerRevisao(dados), to: para });
  } catch (e) { redirect(destinoDeErro(base, e)); }
  revalidatePath(base);
  redirect(`${base}?ok=estado`);
}

/** K01 (36:4863): quadro e cartões adaptados aos estados reais de tarefa. */
export default async function Operacao({ params, searchParams }: Props) {
  const { tenantId } = await params;
  const { erro, ok, problemas, editar } = await searchParams;
  const ctx = await contextoDaEmpresa(tenantId);
  const base = `/e/${encodeURIComponent(tenantId)}/operacao`;
  if (!ctx.permissions.has("strategy.read")) return <AvisoSemPermissao titulo="Operação" oque="ver a operação" />;

  const [tarefas, campanhas] = await Promise.all([listTasks(strategyDeps, ctx), listCampaigns(strategyDeps, ctx)]);
  const podeEditar = ctx.permissions.has("strategy.write");
  const titulos = new Map(tarefas.map((t) => [t.id, t.title]));
  const nomesCampanhas = new Map(campanhas.map((c) => [c.id, c.name || "(sem nome)"]));
  const dependencias = tarefas.filter((t) => t.status !== "cancelled");
  const canceladas = tarefas.filter((t) => t.status === "cancelled");

  async function nova(dados: FormData) {
    "use server";
    const contexto = await contextoDaEmpresa(tenantId);
    try { await createTask(strategyDeps, { ctx: contexto, content: lerTarefa(dados) }); }
    catch (e) { redirect(destinoDeErro(base, e)); }
    revalidatePath(base);
    redirect(`${base}?ok=criada`);
  }
  async function iniciar(d: FormData) { "use server"; return mudarTarefa(tenantId, base, "in_progress", d); }
  async function concluir(d: FormData) { "use server"; return mudarTarefa(tenantId, base, "done", d); }
  async function reabrir(d: FormData) { "use server"; return mudarTarefa(tenantId, base, "todo", d); }
  async function cancelar(d: FormData) { "use server"; return mudarTarefa(tenantId, base, "cancelled", d); }
  const acoes = { todo: reabrir, in_progress: iniciar, done: concluir, cancelled: cancelar };

  function cartao(t: typeof tarefas[number]) {
    const tarefaId = t.id;
    async function salvar(dados: FormData) { "use server"; return editarTarefa(tenantId, base, tarefaId, dados); }
    return (
      <li key={t.id} id={`tarefa-${t.id}`} className={estilos.tarefa}>
        <div className={estilos.tituloTarefa}>
          <h3>{t.title}</h3><span className={SELO[t.status]}>{ROTULO_TAREFA[t.status]}</span>
        </div>
        {t.description && <p className="texto">{t.description}</p>}
        <p className={estilos.contexto}>{t.campaignId ? `Campanha: ${nomesCampanhas.get(t.campaignId) ?? "Indisponível"}` : "Tarefa avulsa"}</p>
        {t.dueDate && <p className={estilos.contexto}>Prazo: <time dateTime={t.dueDate}>{t.dueDate.split("-").reverse().join("/")}</time></p>}
        {t.dependsOn.length > 0 && <p className={estilos.contexto}>Depende de: {t.dependsOn.map((id) => titulos.get(id) ?? "Tarefa indisponível").join(", ")}</p>}
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
        {podeEditar && t.status !== "cancelled" && <EditorDaTarefa key={`${t.id}:${t.revision}:${editar === t.id ? "aberta" : "fechada"}`} tarefa={t} tarefas={tarefas} campanhas={campanhas} aberta={editar === t.id} action={salvar} />}
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
      {ok === "criada" && <p className="sucesso" role="status">Tarefa criada.</p>}
      {ok === "estado" && <p className="sucesso" role="status">Estado da tarefa atualizado.</p>}
      {ok === "salva" && <p className="sucesso" role="status">Tarefa atualizada.</p>}
      <AvisoDeErro erro={erro} problemas={problemas} />
      {!podeEditar && <p className="aviso">Você tem acesso de leitura. A criação e a alteração de tarefas exigem permissão de escrita.</p>}
      <section aria-labelledby="tarefas">
        <h2 id="tarefas">Tarefas</h2>
        {tarefas.length === 0 ? <div className="card vazio"><p>Nenhuma tarefa ainda.</p><p>Registre o trabalho que precisa acontecer e o que depende de quê.</p></div> : (
          <div className={estilos.quadro}>
            {COLUNAS.map((estado) => <section key={estado} className={estilos.coluna} aria-labelledby={`coluna-${estado}`}>
              <h2 id={`coluna-${estado}`}>{TITULO[estado]}</h2>
              <ul className={estilos.lista}>{tarefas.filter((t) => t.status === estado).map(cartao)}</ul>
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
            <div><label htmlFor="campaignId">Campanha (opcional)</label><select id="campaignId" name="campaignId" defaultValue=""><option value="">Tarefa avulsa</option>{campanhas.map((c) => <option key={c.id} value={c.id}>{c.name || "(sem nome)"}</option>)}</select></div>
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
