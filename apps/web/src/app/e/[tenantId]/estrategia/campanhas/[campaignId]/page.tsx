import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { contextoDaEmpresa } from "../../../../../../lib/session";
import { strategyDeps } from "../../../../../../lib/deps-estrategia";
import { brandDeps } from "../../../../../../lib/deps-marca";
import {
  getCampaign, saveCampaignDraft, activateCampaign, pauseCampaign, resumeCampaign, completeCampaign, cancelCampaign,
  listObjectives, listExperiments, planExperiment, startExperiment, concludeExperiment, cancelExperiment,
  gerarUtm, CANAIS_DE_UTM, ELEMENTOS_DO_METODO, DIMENSOES, REGRA_DE_UTM,
} from "../../../../../../lib/estrategia";
import type { UtmChannel, UtmResult } from "../../../../../../lib/estrategia";
import { getBrandOverview } from "@oplyra/core/brand";
import type { CampaignId, ExperimentId } from "@oplyra/core";
import {
  AJUDA_METODO, ROTULO_CAMPANHA, ROTULO_CANAL, ROTULO_DIMENSAO, ROTULO_METODO, ROTULO_RESULTADO, ROTULO_TESTE,
  destinoDeErro, lerCampanha, lerId, lerPlano, lerResultado, lerRevisao,
} from "../../../../../../lib/estrategia-form";
import { BotaoEnviar } from "../../../../../../components/botao-enviar";
import { AvisoDeErro, AvisoSemPermissao } from "../../../../../../components/aviso-estrategia";

type Props = {
  params: Promise<{ tenantId: string; campaignId: string }>;
  searchParams: Promise<{ erro?: string; ok?: string; problemas?: string; destino?: string; canal?: string; conteudo?: string }>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hora = (d: Date | null): string =>
  d ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(d) : "—";

const CASOS_DE_CAMPANHA = {
  ativar: activateCampaign, pausar: pauseCampaign, retomar: resumeCampaign, concluir: completeCampaign, cancelar: cancelCampaign,
} as const;

/**
 * No escopo do módulo, não dentro do componente: uma ação de servidor só pode fechar sobre valores
 * serializáveis (strings); uma função local capturada não atravessa a fronteira cliente/servidor.
 * A autorização é refeita aqui (contextoDaEmpresa), nunca presumida pela página que renderizou o botão.
 */
async function mudarCampanha(tenantId: string, aqui: string, qual: keyof typeof CASOS_DE_CAMPANHA, dados: FormData): Promise<void> {
  const contexto = await contextoDaEmpresa(tenantId);
  try {
    await CASOS_DE_CAMPANHA[qual](strategyDeps, { ctx: contexto, campaignId: lerId(dados, "campanha") as CampaignId, expectedRevision: lerRevisao(dados) });
  } catch (e) {
    redirect(destinoDeErro(aqui, e));
  }
  revalidatePath(aqui);
  redirect(`${aqui}?ok=estado`);
}

async function agirNoTeste(tenantId: string, aqui: string, qual: "iniciar" | "concluir" | "cancelar", dados: FormData): Promise<void> {
  const contexto = await contextoDaEmpresa(tenantId);
  try {
    const base2 = { ctx: contexto, experimentId: lerId(dados, "teste") as ExperimentId, expectedRevision: lerRevisao(dados) };
    if (qual === "iniciar") await startExperiment(strategyDeps, base2);
    else if (qual === "cancelar") await cancelExperiment(strategyDeps, base2);
    else await concludeExperiment(strategyDeps, { ...base2, ...lerResultado(dados) });
  } catch (e) {
    redirect(destinoDeErro(aqui, e));
  }
  revalidatePath(aqui);
  redirect(`${aqui}?ok=teste`);
}

/** Campanha: método (DEC-017), ciclo de vida, UTMs e testes por hipótese (14 F-03; I-04). */
export default async function PaginaDaCampanha({ params, searchParams }: Props) {
  const { tenantId, campaignId } = await params;
  const { erro, ok, problemas, destino, canal, conteudo } = await searchParams;
  const ctx = await contextoDaEmpresa(tenantId);
  const base = `/e/${encodeURIComponent(tenantId)}/estrategia`;
  const aqui = `${base}/campanhas/${encodeURIComponent(campaignId)}`;

  if (!ctx.permissions.has("strategy.read")) return <AvisoSemPermissao titulo="Campanha" oque="ver a estratégia" />;
  if (!UUID.test(campaignId)) redirect(`${base}?erro=CAMPAIGN_NOT_FOUND`);

  let campanha;
  try {
    campanha = await getCampaign(strategyDeps, ctx, campaignId as CampaignId);
  } catch {
    // Inexistente e de outra empresa recebem a mesma resposta.
    redirect(`${base}?erro=CAMPAIGN_NOT_FOUND`);
  }
  const podeEditar = ctx.permissions.has("strategy.write");
  const rascunho = campanha.status === "draft";
  const testes = await listExperiments(strategyDeps, ctx, campanha.id);
  const objetivos = (await listObjectives(strategyDeps, ctx)).filter((o) => o.status === "active" || o.id === campanha.objectiveId);
  const marca = ctx.permissions.has("brand.read") ? (await getBrandOverview(brandDeps, ctx)).current : null;

  async function salvar(dados: FormData) {
    "use server";
    const contexto = await contextoDaEmpresa(tenantId);
    try {
      await saveCampaignDraft(strategyDeps, {
        ctx: contexto, campaignId: lerId(dados, "campanha") as CampaignId, expectedRevision: lerRevisao(dados), content: lerCampanha(dados),
      });
    } catch (e) {
      redirect(destinoDeErro(aqui, e));
    }
    revalidatePath(aqui);
    redirect(`${aqui}?ok=salvo`);
  }

  // Ações de servidor fecham só sobre strings (tenantId, aqui); a lógica vive no escopo do módulo.
  async function ativar(d: FormData) { "use server"; return mudarCampanha(tenantId, aqui, "ativar", d); }
  async function pausar(d: FormData) { "use server"; return mudarCampanha(tenantId, aqui, "pausar", d); }
  async function retomar(d: FormData) { "use server"; return mudarCampanha(tenantId, aqui, "retomar", d); }
  async function concluir(d: FormData) { "use server"; return mudarCampanha(tenantId, aqui, "concluir", d); }
  async function cancelar(d: FormData) { "use server"; return mudarCampanha(tenantId, aqui, "cancelar", d); }

  async function novoTeste(dados: FormData) {
    "use server";
    const contexto = await contextoDaEmpresa(tenantId);
    try {
      await planExperiment(strategyDeps, { ctx: contexto, campaignId: lerId(dados, "campanha") as CampaignId, plan: lerPlano(dados) });
    } catch (e) {
      redirect(destinoDeErro(aqui, e));
    }
    revalidatePath(aqui);
    redirect(`${aqui}?ok=teste`);
  }
  async function iniciarTeste(d: FormData) { "use server"; return agirNoTeste(tenantId, aqui, "iniciar", d); }
  async function concluirTeste(d: FormData) { "use server"; return agirNoTeste(tenantId, aqui, "concluir", d); }
  async function cancelarTeste(d: FormData) { "use server"; return agirNoTeste(tenantId, aqui, "cancelar", d); }

  // UTMs: função pura; o resultado depende só dos parâmetros da URL desta página.
  let utm: UtmResult | null = null;
  let utmErro: string | null = null;
  if (destino && canal && conteudo && campanha.trackingKey) {
    if (!(canal in CANAIS_DE_UTM)) utmErro = "Canal desconhecido.";
    else {
      try { utm = gerarUtm({ baseUrl: destino, channel: canal as UtmChannel, trackingKey: campanha.trackingKey, content: conteudo }); }
      catch (e) { utmErro = e instanceof Error ? e.message : "Não foi possível gerar os UTMs."; }
    }
  }

  return (
    <div className="pilha">
      <div className="entre">
        <div>
          <h1>{campanha.name || "Campanha sem nome"}</h1>
          <p className="muted"><span className="selo">{ROTULO_CAMPANHA[campanha.status]}</span> · versão {campanha.revision} · criada em {hora(campanha.createdAt)}{campanha.activatedAt ? ` · ativada em ${hora(campanha.activatedAt)}` : ""}</p>
        </div>
        <Link className="btn secundario" href={base}>Voltar à estratégia</Link>
      </div>

      {ok && <p className="sucesso" role="status"><strong>Feito.</strong></p>}
      <AvisoDeErro erro={erro} problemas={problemas} />

      {podeEditar && campanha.status !== "completed" && campanha.status !== "cancelled" && (
        <section className="card entre" aria-label="Ciclo de vida da campanha">
          <p className="muted">Ativar fixa a chave de rastreamento e libera os testes. Não publica anúncio.</p>
          <form className="entre">
            <input type="hidden" name="campanha" value={campanha.id} />
            <input type="hidden" name="revisao" value={campanha.revision} />
            {campanha.status === "draft" && <button className="btn" type="submit" formAction={ativar}>Ativar</button>}
            {campanha.status === "active" && <button className="btn secundario" type="submit" formAction={pausar}>Pausar</button>}
            {campanha.status === "paused" && <button className="btn" type="submit" formAction={retomar}>Retomar</button>}
            {(campanha.status === "active" || campanha.status === "paused") && <button className="btn secundario" type="submit" formAction={concluir}>Concluir</button>}
            <button className="btn secundario" type="submit" formAction={cancelar}>Cancelar campanha</button>
          </form>
        </section>
      )}

      <form action={salvar} className="pilha">
        <input type="hidden" name="campanha" value={campanha.id} />
        <input type="hidden" name="revisao" value={campanha.revision} />
        <section className="card pilha" aria-labelledby="geral">
          <h2 id="geral">Dados da campanha</h2>
          {!rascunho && <p className="muted">Campanha {ROTULO_CAMPANHA[campanha.status].toLowerCase()}: o conteúdo não é mais editável.</p>}
          <fieldset disabled={!rascunho || !podeEditar} className="pilha">
            <div><label htmlFor="name">Nome</label><input id="name" name="name" maxLength={160} defaultValue={campanha.name} /></div>
            <div>
              <label htmlFor="trackingKey">Chave de rastreamento</label>
              <input id="trackingKey" name="trackingKey" maxLength={60} defaultValue={campanha.trackingKey} aria-describedby="chave-ajuda" />
              <p id="chave-ajuda" className="muted">Vira o <code>utm_campaign</code>. Fica fixa depois da ativação. O formato restrito reduz, mas não garante, a ausência de dados pessoais: não use nomes de pessoas.</p>
            </div>
            <div>
              <label htmlFor="objectiveId">Objetivo</label>
              <select id="objectiveId" name="objectiveId" defaultValue={campanha.objectiveId ?? ""}>
                <option value="">Sem objetivo</option>
                {objetivos.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="productKey">Produto da marca vigente</label>
              <select id="productKey" name="productKey" defaultValue={campanha.productKey ?? ""}>
                <option value="">Sem produto</option>
                {marca?.products.map((p) => <option key={p.productKey} value={p.productKey}>{p.name}</option>)}
              </select>
              {!marca && <p className="muted">Publique a marca para escolher um produto.</p>}
            </div>
          </fieldset>
        </section>

        <section className="card pilha" aria-labelledby="metodo">
          <h2 id="metodo">Método da campanha</h2>
          <p className="muted">Situação, dor, consequência, desejo, mecanismo, prova e oferta, estruturados antes da produção. Os sete são obrigatórios para ativar.</p>
          <fieldset disabled={!rascunho || !podeEditar} className="pilha">
            {ELEMENTOS_DO_METODO.map((el) => (
              <div key={el}>
                <label htmlFor={`m_${el}`}>{ROTULO_METODO[el]}</label>
                <textarea id={`m_${el}`} name={`m_${el}`} rows={2} maxLength={1000} defaultValue={campanha.method[el]} aria-describedby={`m_${el}_a`} />
                <p id={`m_${el}_a`} className="muted">{AJUDA_METODO[el]}</p>
              </div>
            ))}
          </fieldset>
          {rascunho && podeEditar && <BotaoEnviar rotuloEmEspera="Salvando…">Salvar rascunho</BotaoEnviar>}
        </section>
      </form>

      <section className="card pilha" aria-labelledby="utm">
        <h2 id="utm">UTMs recomendados</h2>
        {!campanha.trackingKey ? <p className="muted">Defina a chave de rastreamento para gerar os UTMs.</p> : (
          <>
            {rascunho && <p className="muted" role="note">A campanha ainda está planejada: a chave pode mudar até a ativação. Só use os UTMs em veiculação depois de ativar.</p>}
            <form method="get" className="pilha">
              <div className="grade">
                <div><label htmlFor="destino">URL de destino</label><input id="destino" name="destino" type="url" placeholder="https://exemplo.com/demo" defaultValue={destino ?? ""} /></div>
                <div>
                  <label htmlFor="canal">Canal</label>
                  <select id="canal" name="canal" defaultValue={canal ?? "meta_ads"}>
                    {(Object.keys(CANAIS_DE_UTM) as UtmChannel[]).map((c) => <option key={c} value={c}>{ROTULO_CANAL[c]}</option>)}
                  </select>
                </div>
                <div><label htmlFor="conteudo">Conteúdo (versão da entrega)</label><input id="conteudo" name="conteudo" placeholder="hook-a-v1" defaultValue={conteudo ?? ""} /></div>
              </div>
              <button className="btn secundario" type="submit">Gerar UTMs</button>
            </form>
            {utmErro && <p className="erro" role="alert">{utmErro}</p>}
            {utm && (
              <div className="pilha">
                <p><strong>URL com UTMs</strong></p>
                <p className="texto"><code>{utm.url}</code></p>
                <p className="muted">Regra {REGRA_DE_UTM}. A tabela de canais é uma proposta local, ainda não aprovada; valores de UTM não são verificados quanto a dados pessoais além do formato.</p>
              </div>
            )}
          </>
        )}
      </section>

      <section className="card pilha" aria-labelledby="testes">
        <h2 id="testes">Testes por hipótese</h2>
        <p className="muted">Um teste declara a hipótese e a dimensão variada antes de rodar. Sem amostra suficiente o resultado é inconclusivo, não sucesso.</p>
        {testes.length === 0 ? <p className="vazio">Nenhum teste nesta campanha.</p> : (
          <ul className="lista">
            {testes.map((t) => (
              <li key={t.id} className="pilha">
                <div className="entre">
                  <div>
                    <strong>{t.plan.hypothesis}</strong>
                    <p className="muted">{ROTULO_DIMENSAO[t.plan.dimension]}{t.plan.dimensionNote ? ` (${t.plan.dimensionNote})` : ""} · métrica: {t.plan.decisionMetric} · amostra mínima {t.plan.minimumSample}</p>
                  </div>
                  <span className="selo">{ROTULO_TESTE[t.status]}</span>
                </div>
                <ul className="evidencias">{t.plan.variants.map((v, i) => <li key={i}>{v}</li>)}</ul>
                {t.result && (
                  <p>
                    <strong>{ROTULO_RESULTADO[t.result.outcome]}</strong> · amostra observada {t.result.observedSample}
                    {t.result.limitations && <span className="muted"> · limitação: {t.result.limitations}</span>}
                  </p>
                )}
                {t.learning && <p className="texto">Aprendizado (versão {t.learning.campaignVersion}): {t.learning.summary}</p>}
                {podeEditar && (t.status === "planned" || t.status === "running") && (
                  <form className="pilha">
                    <input type="hidden" name="teste" value={t.id} />
                    <input type="hidden" name="revisao" value={t.revision} />
                    {t.status === "planned" && (
                      <p className="muted">{campanha.status === "active" ? "Pronto para iniciar." : "O teste só inicia com a campanha ativa."}</p>
                    )}
                    {t.status === "running" && (
                      <fieldset className="item pilha">
                        <legend>Concluir teste</legend>
                        <div className="grade">
                          <div>
                            <label htmlFor={`outcome_${t.id}`}>Resultado</label>
                            <select id={`outcome_${t.id}`} name="outcome" defaultValue="inconclusive">
                              {Object.entries(ROTULO_RESULTADO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                            </select>
                          </div>
                          <div><label htmlFor={`amostra_${t.id}`}>Amostra observada</label><input id={`amostra_${t.id}`} name="observedSample" inputMode="numeric" required /></div>
                        </div>
                        <div><label htmlFor={`lim_${t.id}`}>Limitações</label><input id={`lim_${t.id}`} name="limitations" maxLength={500} /></div>
                        <p className="muted">Aprendizado (opcional): exige resumo, evidência (uma por linha) e a versão da campanha.</p>
                        <div><label htmlFor={`res_${t.id}`}>Resumo do aprendizado</label><input id={`res_${t.id}`} name="learningSummary" maxLength={500} /></div>
                        <div><label htmlFor={`evi_${t.id}`}>Evidência</label><textarea id={`evi_${t.id}`} name="learningEvidence" rows={2} /></div>
                        <div><label htmlFor={`ver_${t.id}`}>Versão da campanha</label><input id={`ver_${t.id}`} name="learningVersion" inputMode="numeric" defaultValue={campanha.revision} /></div>
                      </fieldset>
                    )}
                    <div className="entre">
                      {t.status === "planned" && <button className="btn" type="submit" formAction={iniciarTeste} disabled={campanha.status !== "active"}>Iniciar</button>}
                      {t.status === "running" && <button className="btn" type="submit" formAction={concluirTeste}>Concluir</button>}
                      <button className="btn secundario" type="submit" formAction={cancelarTeste}>Cancelar teste</button>
                    </div>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        {podeEditar && campanha.status !== "completed" && campanha.status !== "cancelled" && (
          <form action={novoTeste} className="pilha">
            <input type="hidden" name="campanha" value={campanha.id} />
            <h3>Novo teste</h3>
            <div><label htmlFor="hypothesis">Hipótese</label><textarea id="hypothesis" name="hypothesis" rows={2} maxLength={1000} required /></div>
            <div className="grade">
              <div>
                <label htmlFor="dimension">Dimensão variada</label>
                <select id="dimension" name="dimension" defaultValue="hook">
                  {DIMENSOES.map((d) => <option key={d} value={d}>{ROTULO_DIMENSAO[d]}</option>)}
                </select>
              </div>
              <div><label htmlFor="dimensionNote">Descrição (obrigatória em “Outra”)</label><input id="dimensionNote" name="dimensionNote" maxLength={300} /></div>
            </div>
            <div><label htmlFor="variants">Variantes (uma por linha, ao menos duas e distintas)</label><textarea id="variants" name="variants" rows={3} required /></div>
            <div className="grade">
              <div><label htmlFor="decisionMetric">Métrica de decisão</label><input id="decisionMetric" name="decisionMetric" maxLength={120} placeholder="reuniões marcadas" required /></div>
              <div><label htmlFor="minimumSample">Amostra mínima</label><input id="minimumSample" name="minimumSample" inputMode="numeric" required /></div>
            </div>
            <BotaoEnviar rotuloEmEspera="Registrando…">Registrar hipótese</BotaoEnviar>
          </form>
        )}
      </section>
    </div>
  );
}
