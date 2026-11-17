import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { RunId } from "@oplyra/core";
import { contextoDaEmpresa } from "../../../../../lib/session";
import { runtimeDeps } from "../../../../../lib/deps-runtime";
import {
  getRun, cancelRun, destinoDeErro, rascunhoDeCopy, ROTULO_VEREDITO, ROTULO_GATE, ROTULO_STATUS_GATE, formatarCusto, formatarDuracao, objetoDaExecucao, resumirPassos, resumirContexto,
  descreverEscalonamento, ROTULO_EXECUCAO, SELO_EXECUCAO, ROTULO_GATILHO, ROTULO_AUTONOMIA, ESTADOS_ABERTOS, MENSAGENS_EXECUCAO,
} from "../../../../../lib/execucoes";
import { BotaoEnviar } from "../../../../../components/botao-enviar";
import { AvisoSemPermissao } from "../../../../../components/aviso-estrategia";

type Props = { params: Promise<{ tenantId: string; runId: string }>; searchParams: Promise<{ erro?: string; ok?: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Detalhe de uma execução (14 F-10): passos, custo, contexto, escalonamento e cancelamento com motivo. */
export default async function DetalheDaExecucao({ params, searchParams }: Props) {
  const { tenantId, runId } = await params;
  const { erro, ok } = await searchParams;
  if (!UUID.test(runId)) notFound();
  const ctx = await contextoDaEmpresa(tenantId);
  const base = `/e/${encodeURIComponent(tenantId)}/execucoes`;
  const aqui = `${base}/${runId}`;

  if (!ctx.permissions.has("runtime.read")) return <AvisoSemPermissao titulo="Execução" oque="ver as execuções" />;

  let detalhe: Awaited<ReturnType<typeof getRun>>;
  try {
    detalhe = await getRun(runtimeDeps, ctx, runId as RunId);
  } catch (e) {
    if ((e as { code?: string } | null)?.code === "RUN_NOT_FOUND") notFound();
    throw e;
  }
  const { run, steps } = detalhe;
  const resumo = resumirPassos(steps);
  const contexto = resumirContexto(run.input);
  const copia = run.actionKey === "create_copy_variants" ? rascunhoDeCopy(steps) : null;
  const escalonamento = run.status === "failed" && run.needsHuman ? descreverEscalonamento(run) : null;
  const podeCancelar = ctx.permissions.has("runtime.operate") && ESTADOS_ABERTOS.includes(run.status);

  async function cancelar(dados: FormData) {
    "use server";
    const contexto2 = await contextoDaEmpresa(tenantId);
    const motivo = dados.get("motivo");
    try {
      await cancelRun(runtimeDeps, contexto2, runId as RunId, typeof motivo === "string" ? motivo : "");
    } catch (e) {
      redirect(destinoDeErro(aqui, e));
    }
    revalidatePath(base);
    redirect(`${aqui}?ok=cancelada`);
  }

  return (
    <div className="pilha">
      <p><Link href={base}>← Execuções</Link></p>
      <div>
        <h1>{run.agentKey}</h1>
        <p><span className={SELO_EXECUCAO[run.status]}>{ROTULO_EXECUCAO[run.status]}</span> <span className="muted">{objetoDaExecucao(run)} · ação {run.actionKey}</span></p>
      </div>

      {ok === "cancelada" && <p className="sucesso" role="status"><strong>Execução cancelada.</strong></p>}
      {erro && <div className="erro" role="alert"><p>{MENSAGENS_EXECUCAO[erro] ?? "Não foi possível concluir a ação."}</p></div>}

      {escalonamento && (
        <section className="card pilha" aria-labelledby="escalonamento">
          <h2 id="escalonamento">Precisa de uma pessoa</h2>
          <p>{escalonamento.motivo}</p>
          <ul>{escalonamento.acoes.map((a) => <li key={a}>{a}</li>)}</ul>
        </section>
      )}

      <section className="card pilha" aria-labelledby="resumo">
        <h2 id="resumo">Resumo</h2>
        <dl className="grade">
          <div><dt>Gatilho</dt><dd>{ROTULO_GATILHO[run.trigger]}</dd></div>
          <div><dt>Autonomia</dt><dd>{ROTULO_AUTONOMIA[run.autonomy]}</dd></div>
          <div><dt>Custo (limite {formatarCusto(run.limits.maxCostMicroUsd)})</dt><dd>{formatarCusto(run.usage.costMicroUsd)}</dd></div>
          <div><dt>Duração</dt><dd>{formatarDuracao(run.startedAt, run.finishedAt, new Date())}</dd></div>
          <div><dt>Turnos</dt><dd>{run.usage.turns} de {run.limits.maxTurns}</dd></div>
          <div><dt>Ferramentas</dt><dd>{run.usage.toolCalls} de {run.limits.maxToolCalls}</dd></div>
          <div><dt>Tentativa</dt><dd>{run.attempt} de {run.limits.maxAttempts}</dd></div>
        </dl>
        {run.error && <p className="muted">Último erro: {run.error.code} — {run.error.message}</p>}
      </section>

      <section className="card pilha" aria-labelledby="passos">
        <h2 id="passos">Passos</h2>
        <p className="muted">{resumo.total} no total · {resumo.concluidos} concluídos · {resumo.abortados} interrompidos com falha conhecida · {resumo.emAberto} em aberto</p>
        {steps.length === 0 ? <div className="vazio"><p>Nenhum passo registrado.</p></div> : (
          <ul className="lista">
            {steps.map((s) => (
              <li key={`${s.stepKey}-${s.attempt}`}>
                <strong>{s.stepKey}</strong> <span className="muted">tentativa {s.attempt}{s.effectful ? " · com efeito" : ""}</span>{" "}
                <span className={s.checkpoint ? "selo ok" : s.abortedAt ? "selo proibido" : "selo pendente"}>{s.checkpoint ? "Concluído" : s.abortedAt ? "Interrompido" : "Em aberto"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {copia && (
        <section className="card pilha" aria-labelledby="copia">
          <h2 id="copia">Rascunho de copy</h2>
          <p><span className="selo pendente">Gerado por IA</span> <span className="selo pendente">Não aprovado</span> <span className="muted">{copia.rascunho ? "Rascunho gravado." : "Nenhum rascunho foi gravado."}</span></p>
          <p><strong>Verificações:</strong> {ROTULO_VEREDITO[copia.veredito]}</p>
          {copia.revisoes.length > 0 && (
            <div>
              <p><strong>Revisão independente</strong> <span className="muted">(Estratégia e Qualidade, só verificações determinísticas; não aprova)</span></p>
              <ul className="lista">
                {copia.revisoes.map((r) => (
                  <li key={r.gate}>
                    {ROTULO_GATE[r.gate] ?? r.gate}: <strong>{ROTULO_STATUS_GATE[r.status] ?? r.status}</strong>
                    {r.limitacao ? <span className="muted"> · {r.limitacao}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {copia.achados.length > 0 && (
            <ul className="lista">
              {copia.achados.map((a, i) => (
                <li key={i}>
                  <span className={a.gravidade === "note" ? "selo pendente" : "selo proibido"}>{a.gravidade === "note" ? "Aviso" : a.gravidade === "blocked" ? "Bloqueia" : "Exige ajuste"}</span>{" "}
                  {a.variante ? `${a.variante}: ` : ""}{a.mensagem}
                </li>
              ))}
            </ul>
          )}
          <ul className="lista">
            {copia.variantes.map((v) => (
              <li key={v.id} className="pilha">
                <strong>{v.id}</strong>{v.papel ? <span className="muted"> · {v.papel === "reference" ? "referência" : "desafiante"}</span> : null}
                <p><strong>{v.titulo}</strong></p>
                <p className="texto">{v.texto}</p>
                <p className="muted">CTA: {v.cta}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card pilha" aria-labelledby="contexto">
        <h2 id="contexto">Contexto usado</h2>
        {contexto ? (
          <>
            <p className="muted">Pacote {contexto.id} · resolução {contexto.resolucao}</p>
            <ul className="lista">{contexto.camadas.map((c) => <li key={c.camada}>{c.camada}: {c.estado}</li>)}</ul>
          </>
        ) : <div className="vazio"><p>Esta execução não tem pacote de contexto.</p></div>}
      </section>

      {podeCancelar && (
        <section className="card pilha" aria-labelledby="cancelar">
          <h2 id="cancelar">Cancelar execução</h2>
          <form action={cancelar} className="pilha">
            <div><label htmlFor="motivo">Motivo (obrigatório)</label><input id="motivo" name="motivo" maxLength={300} required /></div>
            <BotaoEnviar rotuloEmEspera="Cancelando…">Cancelar execução</BotaoEnviar>
          </form>
        </section>
      )}
    </div>
  );
}
