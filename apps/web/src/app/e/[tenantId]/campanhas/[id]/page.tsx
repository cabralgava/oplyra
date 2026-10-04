import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { contextoDaEmpresa } from "../../../../../lib/session";
import { strategyDeps } from "../../../../../lib/deps-estrategia";
import { brandDeps } from "../../../../../lib/deps-marca";
import { getBrandOverview, listBrandVersions } from "@oplyra/core/brand";
import {
  CANAIS, DIMENSOES, METODO, ROTULO_DIMENSAO, ROTULO_ESTADO_CAMPANHA, ROTULO_METODO, changeCampaignStatus, changeExperimentStatus,
  createExperiment, getCampaign, listObjectives, listPersonas, montarUtms, regenerateTrackingKey, transicaoDeCampanhaValida, updateCampaign,
} from "@oplyra/core/strategy";
import type { CampaignId, ExperimentId } from "@oplyra/core";
import type { CampaignStatus, CampaignDetail } from "@oplyra/core/strategy";
import { destinoDeErro } from "../../../../../lib/marca-form";
import {
  CLASSE_DO_ESTADO, MENSAGENS_DE_ERRO_ESTRATEGIA, centavosParaReais, estadoDaCampanha, idDoFormulario, lerCampanhaDoFormulario,
  lerTesteDoFormulario, revisaoDoFormulario, rotuloDoCaminhoEstrategia,
} from "../../../../../lib/estrategia-form";
import { BotaoEnviar } from "../../../../../components/botao-enviar";
import { BotaoCopiar } from "../../../../../components/botao-copiar";
import { ErroDaAcao } from "../../../../../components/erro-da-acao";
import { CamposDaCampanha } from "../../../../../components/formulario-campanha";

type Props = { params: Promise<{ tenantId: string; id: string }>; searchParams: Promise<{ erro?: string; ok?: string; problemas?: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dataBR = (iso: string): string => iso.split("-").reverse().join("/");
const dataHora = (d: Date): string => new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(d);

/** Fica no escopo do módulo: uma ação de servidor só fecha sobre valores serializáveis, não sobre funções locais. */
async function executar(base: string, ok: string, fn: () => Promise<unknown>): Promise<never> {
  try {
    await fn();
  } catch (e) {
    redirect(destinoDeErro(base, e));
  }
  revalidatePath(base);
  redirect(`${base}?ok=${ok}`);
}

const ACOES_DE_ESTADO: Record<string, readonly { para: CampaignStatus; rotulo: string; primaria?: boolean }[]> = {
  planned: [{ para: "active", rotulo: "Ativar", primaria: true }, { para: "cancelled", rotulo: "Cancelar" }],
  active: [{ para: "paused", rotulo: "Pausar" }, { para: "completed", rotulo: "Concluir" }, { para: "cancelled", rotulo: "Cancelar" }],
  paused: [{ para: "active", rotulo: "Retomar", primaria: true }, { para: "completed", rotulo: "Concluir" }, { para: "cancelled", rotulo: "Cancelar" }],
};

/** Detalhe da campanha: método, chave de rastreamento e UTMs, estado, testes (hipóteses) e, se planejada, edição. */
export default async function Campanha({ params, searchParams }: Props) {
  const { tenantId, id } = await params;
  const { erro, ok, problemas } = await searchParams;
  const ctx = await contextoDaEmpresa(tenantId);
  const base = `/e/${encodeURIComponent(tenantId)}`;
  const aqui = `${base}/campanhas/${encodeURIComponent(id)}`;

  if (!ctx.permissions.has("strategy.read")) {
    return (
      <div className="pilha">
        <h1>Campanha</h1>
        <div className="card vazio" role="status"><p>Seu papel não permite ver as campanhas desta empresa.</p></div>
      </div>
    );
  }

  let detalhe: CampaignDetail | null = null;
  if (UUID.test(id)) {
    try {
      detalhe = await getCampaign(strategyDeps, ctx, id as CampaignId);
    } catch (e) {
      if (!(e instanceof Error && "code" in e && e.code === "CAMPAIGN_NOT_FOUND")) throw e;
    }
  }
  if (!detalhe) {
    return (
      <div className="pilha">
        <h1>Campanha</h1>
        <div className="card vazio" role="status">
          <p>Campanha não encontrada nesta empresa.</p>
          <Link className="btn secundario" href={`${base}/campanhas`}>Voltar às campanhas</Link>
        </div>
      </div>
    );
  }

  const { campaign: c, experiments } = detalhe;
  const objetivos = await listObjectives(strategyDeps, ctx, { includeArchived: true });
  const personas = await listPersonas(strategyDeps, ctx, { includeArchived: true });
  const versoes = ctx.permissions.has("brand.read") ? await listBrandVersions(brandDeps, ctx) : [];
  const marcaAtual = ctx.permissions.has("brand.read") ? (await getBrandOverview(brandDeps, ctx)).current : null;
  const objetivo = objetivos.find((o) => o.id === c.objectiveId);
  const persona = personas.find((p) => p.id === c.personaId);
  const versaoDaMarca = versoes.find((v) => v.id === c.brandVersionId);
  const produto = marcaAtual?.products.find((p) => p.productKey === c.productKey);

  const podeEditar = ctx.permissions.has("strategy.write");
  const podeMudarEstado = ctx.permissions.has("campaign.activate");
  const planejada = c.status === "planned";
  const aberta = c.status !== "completed" && c.status !== "cancelled";
  const ativada = c.activatedAt !== null;

  async function atualizar(dados: FormData) {
    "use server";
    const contexto = await contextoDaEmpresa(tenantId);
    await executar(aqui, "salva", async () => updateCampaign(strategyDeps, {
      ctx: contexto, id: idDoFormulario(dados, "id") as CampaignId, expectedRevision: revisaoDoFormulario(dados), plan: lerCampanhaDoFormulario(dados),
    }));
  }
  async function novaChave(dados: FormData) {
    "use server";
    const contexto = await contextoDaEmpresa(tenantId);
    await executar(aqui, "chave", async () => regenerateTrackingKey(strategyDeps, {
      ctx: contexto, id: idDoFormulario(dados, "id") as CampaignId, expectedRevision: revisaoDoFormulario(dados),
    }));
  }
  async function mudarEstado(dados: FormData) {
    "use server";
    const contexto = await contextoDaEmpresa(tenantId);
    await executar(aqui, "estado", async () => changeCampaignStatus(strategyDeps, {
      ctx: contexto, id: idDoFormulario(dados, "id") as CampaignId, to: estadoDaCampanha(dados),
    }));
  }
  async function criarTeste(dados: FormData) {
    "use server";
    const contexto = await contextoDaEmpresa(tenantId);
    await executar(aqui, "teste", async () => createExperiment(strategyDeps, {
      ctx: contexto, campaignId: idDoFormulario(dados, "id") as CampaignId, content: lerTesteDoFormulario(dados),
    }));
  }
  async function mudarTeste(dados: FormData) {
    "use server";
    const contexto = await contextoDaEmpresa(tenantId);
    const para = String(dados.get("para") ?? "");
    await executar(aqui, "teste-estado", async () => changeExperimentStatus(strategyDeps, {
      ctx: contexto, id: idDoFormulario(dados, "teste") as ExperimentId, to: para === "running" ? "running" : "stopped",
    }));
  }

  const aviso: Record<string, string> = {
    criada: "Campanha criada como planejada.", salva: "Campanha salva.", chave: "Nova chave de rastreamento gerada.",
    estado: "Estado da campanha atualizado.", teste: "Teste criado.", "teste-estado": "Estado do teste atualizado.",
  };

  return (
    <div className="pilha">
      <div className="entre">
        <div>
          <h1>{c.nome}</h1>
          <p>
            <span className={CLASSE_DO_ESTADO[c.status]}>{ROTULO_ESTADO_CAMPANHA[c.status]}</span>{" "}
            <span className="muted">
              {dataBR(c.periodo.inicio)} a {dataBR(c.periodo.fim)}
              {c.orcamento && ` · orçamento planejado ${centavosParaReais(c.orcamento.centavos)}`}
            </span>
          </p>
        </div>
        <Link className="btn secundario" href={`${base}/campanhas`}>Voltar às campanhas</Link>
      </div>

      {ok && aviso[ok] && <p className="sucesso" role="status">{aviso[ok]}</p>}
      <ErroDaAcao erro={erro} problemas={problemas} mensagens={MENSAGENS_DE_ERRO_ESTRATEGIA} rotular={rotuloDoCaminhoEstrategia} />

      <section className="card pilha" aria-labelledby="resumo">
        <h2 id="resumo">Resumo</h2>
        <dl className="definicoes">
          <dt>Objetivo</dt><dd>{objetivo?.nome ?? "—"}{objetivo?.status === "archived" && <span className="muted"> (arquivado)</span>}</dd>
          <dt>Produto</dt>
          <dd>
            {produto?.name ?? "Produto de uma versão anterior da marca"}
            {produto?.availability === "future" && <span className="selo pendente"> Futuro: não ativa até estar disponível</span>}
          </dd>
          <dt>Versão da marca usada</dt><dd>{versaoDaMarca ? `Versão ${versaoDaMarca.number}` : "—"}</dd>
          <dt>Persona</dt><dd>{persona?.nome ?? "Nenhuma"}</dd>
          {c.mensagemChave && (<><dt>Mensagem-chave</dt><dd className="texto">{c.mensagemChave}</dd></>)}
          {ativada && c.activatedAt && (<><dt>Primeira ativação</dt><dd>{dataHora(c.activatedAt)}</dd></>)}
        </dl>
      </section>

      {podeMudarEstado && aberta && (
        <section className="card pilha" aria-labelledby="estado">
          <h2 id="estado">Estado</h2>
          {planejada && <p className="muted">Ativar exige o método completo e um produto disponível, e fixa a chave de rastreamento.</p>}
          <div className="linha">
            {(ACOES_DE_ESTADO[c.status] ?? []).filter((a) => transicaoDeCampanhaValida(c.status, a.para)).map((a) => (
              <form key={a.para} action={mudarEstado}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="para" value={a.para} />
                <BotaoEnviar variante={a.primaria ? "primario" : "secundario"} rotuloEmEspera="Aplicando…">{a.rotulo}</BotaoEnviar>
              </form>
            ))}
          </div>
        </section>
      )}

      <section className="card pilha" aria-labelledby="rastreamento">
        <h2 id="rastreamento">Rastreamento</h2>
        <div className="linha">
          <code id="chave">{c.chave}</code>
          <BotaoCopiar texto={c.chave} rotulo="Copiar chave" />
        </div>
        <p className="muted">
          {ativada ? "A chave é fixa: a campanha já foi ativada." : "A chave fica fixa depois que a campanha for ativada. Até lá, você pode gerar outra."}
        </p>
        {!ativada && podeEditar && (
          <form action={novaChave}>
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="revisao" value={c.revision} />
            <BotaoEnviar variante="secundario" rotuloEmEspera="Gerando…">Gerar nova chave</BotaoEnviar>
          </form>
        )}
        <h3>UTMs recomendados</h3>
        <p className="muted">Anexe ao endereço de destino. O conteúdo é a versão da entrega (v1 por padrão). Sem dados pessoais.</p>
        <div className="rolavel" role="region" aria-label="UTMs recomendados por canal" tabIndex={0} data-testid="utms">
          <table>
          <thead><tr><th scope="col">Canal</th><th scope="col">Origem</th><th scope="col">Meio</th><th scope="col">Conteúdo</th><th scope="col"><span className="so-leitor">Copiar</span></th></tr></thead>
          <tbody>
            {(Object.keys(CANAIS) as (keyof typeof CANAIS)[]).map((canal) => {
              const u = montarUtms(c.chave, canal);
              return (
                <tr key={canal}>
                  <td>{CANAIS[canal].rotulo}</td><td><code>{u.utm_source}</code></td><td><code>{u.utm_medium}</code></td><td><code>{u.utm_content}</code></td>
                  <td><BotaoCopiar texto={u.query} rotulo="Copiar" rotuloAcessivel={`Copiar parâmetros de ${CANAIS[canal].rotulo}`} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </section>

      {planejada && podeEditar ? (
        <form action={atualizar} className="pilha">
          <input type="hidden" name="id" value={c.id} />
          <input type="hidden" name="revisao" value={c.revision} />
          <CamposDaCampanha campanha={c} objetivos={objetivos.filter((o) => o.status === "active" || o.id === c.objectiveId)}
            produtos={marcaAtual?.products ?? []} personas={personas.filter((p) => p.status === "active" || p.id === c.personaId)} />
          <BotaoEnviar rotuloEmEspera="Salvando…">Salvar campanha</BotaoEnviar>
        </form>
      ) : (
        <section className="card pilha" aria-labelledby="metodo-lido">
          <h2 id="metodo-lido">Método da campanha</h2>
          <dl className="definicoes">
            {METODO.map((m) => (<div key={m}><dt>{ROTULO_METODO[m]}</dt><dd className="texto">{c.metodo[m] || "—"}</dd></div>))}
          </dl>
        </section>
      )}

      <section className="card pilha" aria-labelledby="testes">
        <h2 id="testes">Testes</h2>
        <p className="muted">Um teste é uma hipótese: o que você espera que mude e por quê, e qual dimensão varia. Variação cosmética não é teste.</p>
        {experiments.length === 0 ? (
          <div className="vazio"><p>Nenhum teste nesta campanha.</p></div>
        ) : (
          <ul className="lista">
            {experiments.map((t) => (
              <li key={t.id}>
                <div className="entre">
                  <div>
                    <span className={t.status === "running" ? "selo ok" : t.status === "stopped" ? "selo" : "selo pendente"}>
                      {t.status === "planned" ? "Planejado" : t.status === "running" ? "Em execução" : "Interrompido"}
                    </span>{" "}
                    <span className="selo">{ROTULO_DIMENSAO[t.dimensao]}{t.notaDaDimensao ? `: ${t.notaDaDimensao}` : ""}</span>
                    <p className="texto">{t.hipotese}</p>
                    <p className="muted">O resultado só pode ser concluído quando houver dados; sem dados suficientes, ele sai como inconclusivo.</p>
                  </div>
                  {podeEditar && t.status !== "stopped" && (
                    <div className="linha">
                      {t.status === "planned" && aberta && (
                        <form action={mudarTeste}>
                          <input type="hidden" name="teste" value={t.id} /><input type="hidden" name="para" value="running" />
                          <BotaoEnviar rotuloEmEspera="Iniciando…">Iniciar</BotaoEnviar>
                        </form>
                      )}
                      <form action={mudarTeste}>
                        <input type="hidden" name="teste" value={t.id} /><input type="hidden" name="para" value="stopped" />
                        <BotaoEnviar variante="secundario" rotuloEmEspera="Interrompendo…">Interromper</BotaoEnviar>
                      </form>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {podeEditar && aberta && (
          <form action={criarTeste} className="pilha">
            <h3>Novo teste</h3>
            <input type="hidden" name="id" value={c.id} />
            <div>
              <label htmlFor="hipotese">Hipótese</label>
              <textarea id="hipotese" name="hipotese" rows={2} maxLength={1000} required placeholder="Se mudarmos X, esperamos Y porque Z." />
            </div>
            <div className="grade">
              <div>
                <label htmlFor="dimensao">Dimensão que varia</label>
                <select id="dimensao" name="dimensao" required defaultValue="">
                  <option value="" disabled>Escolha</option>
                  {DIMENSOES.map((d) => <option key={d} value={d}>{ROTULO_DIMENSAO[d]}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="nota">Qual (só para “Outra”)</label>
                <input id="nota" name="nota" maxLength={200} />
              </div>
            </div>
            <BotaoEnviar rotuloEmEspera="Criando…">Criar teste</BotaoEnviar>
          </form>
        )}
      </section>
    </div>
  );
}
