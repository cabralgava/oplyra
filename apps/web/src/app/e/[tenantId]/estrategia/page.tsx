import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { contextoDaEmpresa } from "../../../../lib/session";
import { strategyDeps } from "../../../../lib/deps-estrategia";
import {
  listCampaigns, listObjectives, createObjective, createCampaignDraft, setPrimaryObjective, archiveObjective,
  campanhaVazia,
} from "../../../../lib/estrategia";
import type { ObjectiveId } from "@oplyra/core";
import {
  LINHAS_NOVAS_KPI, ROTULO_CAMPANHA, destinoDeErro, lerCampanha, lerId, lerObjetivo, lerRevisao,
} from "../../../../lib/estrategia-form";
import { BotaoEnviar } from "../../../../components/botao-enviar";
import { AvisoDeErro, AvisoSemPermissao } from "../../../../components/aviso-estrategia";

type Props = { params: Promise<{ tenantId: string }>; searchParams: Promise<{ erro?: string; ok?: string; problemas?: string }> };

const SELO_CAMPANHA = { draft: "selo pendente", active: "selo ok", paused: "selo pendente", completed: "selo", cancelled: "selo proibido" } as const;

/** Estratégia: objetivos e indicadores, e campanhas (14 §2, F-03; I-04). Objetivo/KPI são proposta local. */
export default async function Estrategia({ params, searchParams }: Props) {
  const { tenantId } = await params;
  const { erro, ok, problemas } = await searchParams;
  const ctx = await contextoDaEmpresa(tenantId);
  const base = `/e/${encodeURIComponent(tenantId)}/estrategia`;

  if (!ctx.permissions.has("strategy.read")) return <AvisoSemPermissao titulo="Estratégia" oque="ver a estratégia" />;

  const [objetivos, campanhas] = await Promise.all([listObjectives(strategyDeps, ctx), listCampaigns(strategyDeps, ctx)]);
  const podeEditar = ctx.permissions.has("strategy.write");
  const ativos = objetivos.filter((o) => o.status === "active");

  async function novoObjetivo(dados: FormData) {
    "use server";
    const contexto = await contextoDaEmpresa(tenantId);
    try {
      await createObjective(strategyDeps, { ctx: contexto, content: lerObjetivo(dados) });
    } catch (e) {
      redirect(destinoDeErro(base, e));
    }
    revalidatePath(base);
    redirect(`${base}?ok=objetivo`);
  }

  async function principal(dados: FormData) {
    "use server";
    const contexto = await contextoDaEmpresa(tenantId);
    try {
      await setPrimaryObjective(strategyDeps, { ctx: contexto, objectiveId: lerId(dados, "objetivo") as ObjectiveId, expectedRevision: lerRevisao(dados) });
    } catch (e) {
      redirect(destinoDeErro(base, e));
    }
    revalidatePath(base);
    redirect(`${base}?ok=principal`);
  }

  async function arquivar(dados: FormData) {
    "use server";
    const contexto = await contextoDaEmpresa(tenantId);
    try {
      await archiveObjective(strategyDeps, { ctx: contexto, objectiveId: lerId(dados, "objetivo") as ObjectiveId, expectedRevision: lerRevisao(dados) });
    } catch (e) {
      redirect(destinoDeErro(base, e));
    }
    revalidatePath(base);
    redirect(`${base}?ok=arquivado`);
  }

  async function novaCampanha(dados: FormData) {
    "use server";
    const contexto = await contextoDaEmpresa(tenantId);
    let destino: string;
    try {
      const vazia = campanhaVazia();
      const lida = lerCampanha(dados);
      // A criação pede só o essencial; o método é preenchido na página da campanha.
      const criada = await createCampaignDraft(strategyDeps, {
        ctx: contexto, content: { ...vazia, name: lida.name, objectiveId: lida.objectiveId, trackingKey: lida.trackingKey },
      });
      destino = `${base}/campanhas/${criada.id}`;
    } catch (e) {
      redirect(destinoDeErro(base, e));
    }
    revalidatePath(base);
    redirect(destino);
  }

  return (
    <div className="pilha">
      <div>
        <h1>Central Estratégica</h1>
        <p className="muted">Objetivos e indicadores, e as campanhas que os perseguem. Ativar uma campanha não publica anúncio.</p>
      </div>

      <nav aria-label="Seções da Central Estratégica" className="nav-secoes">
        <ul>
          <li><a href="#meta-principal" className="ativo">Visão geral</a></li>
          <li><a href="#objetivos">Objetivos</a></li>
          <li><a href="#campanhas">Campanhas</a></li>
          <li><Link href={`/e/${encodeURIComponent(tenantId)}/marca`}>Brand OS</Link></li>
          <li><span className="aba-indisponivel" aria-disabled="true">Personas · em breve</span></li>
          <li><span className="aba-indisponivel" aria-disabled="true">Hipóteses · em breve</span></li>
        </ul>
      </nav>

      {(() => {
        const principalAtivo = ativos.find((o) => o.primary);
        return (
          <section className="card destaque" aria-labelledby="meta-principal">
            <p className="camp-rotulo">Meta primária</p>
            <h2 id="meta-principal">{principalAtivo ? principalAtivo.name : "Nenhum objetivo principal definido"}</h2>
            {principalAtivo ? (
              <ul className="evidencias">
                {principalAtivo.kpis.map((k) => <li key={k.key}>{k.name}: alvo {k.target} {k.unit}</li>)}
              </ul>
            ) : (
              <p className="muted">Defina um objetivo e torne-o principal para acompanhar a meta aqui. Progresso e projeção ainda não estão disponíveis.</p>
            )}
          </section>
        );
      })()}

      {ok && <p className="sucesso" role="status"><strong>Feito.</strong></p>}
      <AvisoDeErro erro={erro} problemas={problemas} />

      <section className="card pilha" aria-labelledby="objetivos">
        <h2 id="objetivos">Objetivos</h2>
        {objetivos.length === 0 ? (
          <div className="vazio">
            <p>Nenhum objetivo definido.</p>
            <p className="muted">Defina o que a operação precisa alcançar e como medir; as campanhas se ligam a um objetivo.</p>
          </div>
        ) : (
          <ul className="lista">
            {objetivos.map((o) => (
              <li key={o.id}>
                <div className="entre">
                  <div>
                    <strong>{o.name}</strong>{" "}
                    {o.primary && <span className="selo ok">Principal</span>}
                    {o.status === "archived" && <span className="selo">Arquivado</span>}
                    <p className="muted">{o.periodStart} a {o.periodEnd}</p>
                  </div>
                  {podeEditar && o.status === "active" && (
                    <form className="entre">
                      <input type="hidden" name="objetivo" value={o.id} />
                      <input type="hidden" name="revisao" value={o.revision} />
                      {!o.primary && <button className="btn secundario" type="submit" formAction={principal}>Tornar principal</button>}
                      <button className="btn secundario" type="submit" formAction={arquivar}>Arquivar</button>
                    </form>
                  )}
                </div>
                <ul className="evidencias">
                  {o.kpis.map((k) => <li key={k.key}>{k.name}: alvo {k.target} {k.unit} <span className="muted">({k.metric})</span></li>)}
                </ul>
              </li>
            ))}
          </ul>
        )}

        {podeEditar && (
          <form action={novoObjetivo} className="pilha">
            <input type="hidden" name="k_n" value={LINHAS_NOVAS_KPI + 1} />
            <h3>Novo objetivo</h3>
            <div><label htmlFor="o_name">Nome</label><input id="o_name" name="name" maxLength={160} required /></div>
            <div><label htmlFor="o_desc">Descrição</label><input id="o_desc" name="description" maxLength={1000} /></div>
            <div className="grade">
              <div><label htmlFor="o_ini">Início</label><input id="o_ini" name="periodStart" type="date" required /></div>
              <div><label htmlFor="o_fim">Fim</label><input id="o_fim" name="periodEnd" type="date" required /></div>
            </div>
            <p className="muted">Indicadores: ao menos um, com alvo numérico maior que zero. Linhas em branco são ignoradas.</p>
            {Array.from({ length: LINHAS_NOVAS_KPI + 1 }, (_, i) => (
              <fieldset key={i} className="item">
                <legend>Indicador {i + 1}</legend>
                <div className="grade">
                  <div><label htmlFor={`k_key_${i}`}>Chave</label><input id={`k_key_${i}`} name={`k_key_${i}`} maxLength={40} placeholder="reunioes" /></div>
                  <div><label htmlFor={`k_name_${i}`}>Nome</label><input id={`k_name_${i}`} name={`k_name_${i}`} maxLength={120} /></div>
                  <div><label htmlFor={`k_metric_${i}`}>Métrica</label><input id={`k_metric_${i}`} name={`k_metric_${i}`} maxLength={120} placeholder="reuniões marcadas" /></div>
                  <div><label htmlFor={`k_unit_${i}`}>Unidade</label><input id={`k_unit_${i}`} name={`k_unit_${i}`} maxLength={30} /></div>
                  <div><label htmlFor={`k_target_${i}`}>Alvo</label><input id={`k_target_${i}`} name={`k_target_${i}`} inputMode="decimal" /></div>
                </div>
              </fieldset>
            ))}
            <BotaoEnviar rotuloEmEspera="Salvando…">Criar objetivo</BotaoEnviar>
          </form>
        )}
      </section>

      <section className="card pilha" aria-labelledby="campanhas">
        <h2 id="campanhas">Campanhas</h2>
        {campanhas.length === 0 ? (
          <div className="vazio">
            <p>Nenhuma campanha ainda.</p>
            <p className="muted">Toda campanha parte de situação, dor, consequência, desejo, mecanismo, prova e oferta. Crie a campanha e complete o método na página dela.</p>
          </div>
        ) : (
          <table>
            <thead><tr><th scope="col">Campanha</th><th scope="col">Situação</th><th scope="col">Chave de rastreamento</th></tr></thead>
            <tbody>
              {campanhas.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`${base}/campanhas/${c.id}`}>{c.name || "(sem nome)"}</Link></td>
                  <td><span className={SELO_CAMPANHA[c.status]}>{ROTULO_CAMPANHA[c.status]}</span></td>
                  <td>{c.trackingKey || <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {podeEditar && (
          <form action={novaCampanha} className="pilha">
            <h3>Nova campanha</h3>
            <div><label htmlFor="c_name">Nome</label><input id="c_name" name="name" maxLength={160} required /></div>
            <div>
              <label htmlFor="c_key">Chave de rastreamento</label>
              <input id="c_key" name="trackingKey" maxLength={60} placeholder="lancamento-relatorios" aria-describedby="c_key_ajuda" />
              <p id="c_key_ajuda" className="muted">Letras minúsculas, números e hífens (3 a 60). Vira o <code>utm_campaign</code> e <strong>fica fixa depois que a campanha for ativada</strong>. Não use nomes de pessoas nem dados pessoais.</p>
            </div>
            <div>
              <label htmlFor="c_obj">Objetivo (opcional)</label>
              <select id="c_obj" name="objectiveId" defaultValue="">
                <option value="">Sem objetivo</option>
                {ativos.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <BotaoEnviar rotuloEmEspera="Criando…">Criar campanha</BotaoEnviar>
          </form>
        )}
      </section>
    </div>
  );
}
