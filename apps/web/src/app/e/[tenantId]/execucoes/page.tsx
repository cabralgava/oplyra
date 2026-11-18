import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { contextoDaEmpresa } from "../../../../lib/session";
import { rotuloAmbiente } from "../../../../lib/rotulo-ambiente";
import { runtimeDeps } from "../../../../lib/deps-runtime";
import {
  listRuns, LIMITE_PADRAO, LIMITE_MAXIMO, lerLimite, proximoLimite, paginar, getKillSwitchStatus, activateKillSwitch, releaseKillSwitch, destinoDeErro, escalonadas, filtrar, lerFiltro, FILTROS,
  formatarCusto, formatarDuracao, objetoDaExecucao, ROTULO_EXECUCAO, SELO_EXECUCAO, ROTULO_GATILHO, descreverEscalonamento, MENSAGENS_EXECUCAO,
} from "../../../../lib/execucoes";
import type { Filtro } from "../../../../lib/execucoes";
import { BotaoEnviar } from "../../../../components/botao-enviar";
import { AvisoSemPermissao } from "../../../../components/aviso-estrategia";

type Props = { params: Promise<{ tenantId: string }>; searchParams: Promise<{ erro?: string; ok?: string; filtro?: string; limite?: string }> };

const ROTULO_FILTRO: Record<Filtro, string> = { todas: "Todas", abertas: "Em andamento", falhas: "Falhas e canceladas", concluidas: "Concluídas" };

/** Execuções de agentes (14 F-10): lista por estado, escalonamentos e a interrupção da IA da empresa. */
export default async function Execucoes({ params, searchParams }: Props) {
  const { tenantId } = await params;
  const { erro, ok, filtro: filtroBruto, limite: limiteBruto } = await searchParams;
  const ctx = await contextoDaEmpresa(tenantId);
  const base = `/e/${encodeURIComponent(tenantId)}/execucoes`;

  if (!ctx.permissions.has("runtime.read")) return <AvisoSemPermissao titulo="Execuções" oque="ver as execuções" />;

  const filtro = lerFiltro(filtroBruto);
  const limite = lerLimite(limiteBruto);
  const [recebidas, interrupcao] = await Promise.all([listRuns(runtimeDeps, ctx, limite + 1), getKillSwitchStatus(runtimeDeps, ctx)]);
  const { visiveis: todas, haMais } = paginar(recebidas, limite);
  const proximo = proximoLimite(limite);
  const lista = filtrar(todas, filtro);
  const paraRevisar = escalonadas(todas);
  const podeOperar = ctx.permissions.has("runtime.operate");
  const agora = new Date();
  const enderecoDaLista = (f: Filtro, l: number): string => {
    const q = [f === "todas" ? "" : `filtro=${f}`, l === LIMITE_PADRAO ? "" : `limite=${l}`].filter(Boolean).join("&");
    return q ? `${base}?${q}` : base;
  };
  const propria = interrupcao?.active && interrupcao.scope === "tenant";

  async function interromper(dados: FormData) {
    "use server";
    const contexto = await contextoDaEmpresa(tenantId);
    const motivo = dados.get("motivo");
    const confirmou = dados.get("confirmo") === "on";
    if (!confirmou) redirect(`${base}?erro=CONFIRMACAO_OBRIGATORIA`);
    try {
      await activateKillSwitch(runtimeDeps, contexto, typeof motivo === "string" ? motivo : "");
    } catch (e) {
      redirect(destinoDeErro(base, e));
    }
    revalidatePath(base, "layout");
    redirect(`${base}?ok=interrompida`);
  }
  async function liberar() {
    "use server";
    const contexto = await contextoDaEmpresa(tenantId);
    try {
      await releaseKillSwitch(runtimeDeps, contexto);
    } catch (e) {
      redirect(destinoDeErro(base, e));
    }
    revalidatePath(base, "layout");
    redirect(`${base}?ok=liberada`);
  }

  return (
    <div className="pilha">
      <div>
        <h1>Execuções</h1>
        <p className="muted">O que os agentes de IA estão fazendo ou fizeram nesta empresa.{rotuloAmbiente() ? " Dados de desenvolvimento: nenhum provedor real está ligado." : ""}</p>
      </div>

      {ok === "interrompida" && <p className="sucesso" role="status"><strong>A IA desta empresa foi interrompida.</strong></p>}
      {ok === "liberada" && <p className="sucesso" role="status"><strong>A interrupção foi liberada.</strong></p>}
      {erro && <div className="erro" role="alert"><p>{erro === "CONFIRMACAO_OBRIGATORIA" ? "Confirme a interrupção marcando a caixa." : (MENSAGENS_EXECUCAO[erro] ?? "Não foi possível concluir a ação.")}</p></div>}

      <section className="card pilha" aria-labelledby="interrupcao">
        <h2 id="interrupcao">Interromper IA desta empresa</h2>
        {interrupcao?.active ? (
          <>
            <p><span className="selo proibido">Interrompida</span> {interrupcao.scope === "global" ? "Pela plataforma, para todas as empresas." : "Por esta empresa."} Motivo: {interrupcao.reason}.</p>
            {propria && podeOperar && <form action={liberar}><BotaoEnviar rotuloEmEspera="Liberando…">Liberar IA desta empresa</BotaoEnviar></form>}
            {interrupcao.scope === "global" && <p className="muted">A interrupção da plataforma não é controlada por esta tela.</p>}
          </>
        ) : (
          <>
            <p><span className="selo ok">Ativa</span> As execuções seguem normalmente.</p>
            {podeOperar ? (
              <form action={interromper} className="pilha">
                <div><label htmlFor="motivo">Motivo (obrigatório)</label><input id="motivo" name="motivo" maxLength={300} required /></div>
                <label className="inline" htmlFor="confirmo"><input id="confirmo" name="confirmo" type="checkbox" /> Entendo que nenhuma execução nova começará até a liberação.</label>
                <BotaoEnviar rotuloEmEspera="Interrompendo…">Interromper IA desta empresa</BotaoEnviar>
              </form>
            ) : <p className="muted">Seu papel não permite interromper a IA da empresa.</p>}
          </>
        )}
      </section>

      {paraRevisar.length > 0 && (
        <section className="card pilha" aria-labelledby="escalonadas">
          <h2 id="escalonadas">Precisam de uma pessoa</h2>
          <ul className="lista">
            {paraRevisar.map((r) => {
              const e = descreverEscalonamento(r);
              return (
                <li key={r.id} className="pilha">
                  <div><strong>{objetoDaExecucao(r)}</strong> <span className="muted">· {r.agentKey}</span></div>
                  <p>{e.motivo}</p>
                  <Link href={`${base}/${r.id}`}>Abrir execução</Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="card pilha" aria-labelledby="lista">
        <h2 id="lista">Todas as execuções</h2>
        <nav aria-label="Filtrar por estado" className="entre">
          {FILTROS.map((f) => (
            <Link key={f} href={enderecoDaLista(f, limite)} aria-current={f === filtro ? "true" : undefined} className={f === filtro ? "btn" : "btn secundario"}>{ROTULO_FILTRO[f]}</Link>
          ))}
        </nav>
        {lista.length === 0 ? (
          <div className="vazio">
            <p>{todas.length === 0 ? "Nenhuma execução ainda." : "Nenhuma execução neste filtro."}</p>
            <p className="muted">As execuções aparecem aqui quando um agente é acionado por uma pessoa, um evento ou um agendamento.</p>
          </div>
        ) : (
          <ul className="lista">
            {lista.map((r) => (
              <li key={r.id} className="entre">
                <div>
                  <Link href={`${base}/${r.id}`}><strong>{r.agentKey}</strong></Link>{" "}
                  <span className={SELO_EXECUCAO[r.status]}>{ROTULO_EXECUCAO[r.status]}</span>
                  <p className="muted">
                    {objetoDaExecucao(r)} · {ROTULO_GATILHO[r.trigger]} · custo {formatarCusto(r.usage.costMicroUsd)} · duração {formatarDuracao(r.startedAt, r.finishedAt, agora)} · {r.usage.turns} turno(s)
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="muted" role="status" data-testid="paginacao">
          Mostrando as {todas.length} execuções mais recentes{filtro !== "todas" ? `; o filtro vale só para elas (${lista.length})` : ""}.
          {haMais ? (proximo ? " Há execuções mais antigas." : ` Há mais execuções que o máximo de ${LIMITE_MAXIMO} desta tela.`) : ""}
        </p>
        {haMais && proximo && <p><Link href={enderecoDaLista(filtro, proximo)} className="btn secundario">Mostrar mais</Link></p>}
      </section>
    </div>
  );
}
