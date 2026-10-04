import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { contextoDaEmpresa } from "../../../../lib/session";
import { strategyDeps } from "../../../../lib/deps-estrategia";
import {
  archiveObjective, archivePersona, createObjective, createPersona, listObjectives, listPersonas,
} from "@oplyra/core/strategy";
import type { ObjectiveId, PersonaId } from "@oplyra/core";
import { destinoDeErro } from "../../../../lib/marca-form";
import {
  LINHAS_DE_INDICADOR, MENSAGENS_DE_ERRO_ESTRATEGIA, idDoFormulario, lerObjetivoDoFormulario, lerPersonaDoFormulario, rotuloDoCaminhoEstrategia,
} from "../../../../lib/estrategia-form";
import { BotaoEnviar } from "../../../../components/botao-enviar";
import { ErroDaAcao } from "../../../../components/erro-da-acao";

type Props = { params: Promise<{ tenantId: string }>; searchParams: Promise<{ erro?: string; ok?: string; problemas?: string }> };

const dataBR = (iso: string): string => iso.split("-").reverse().join("/");
const numero = (n: number): string => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(n);

/** Estratégia: objetivos com indicadores e personas (14 §Estratégia; I-04). */
export default async function Estrategia({ params, searchParams }: Props) {
  const { tenantId } = await params;
  const { erro, ok, problemas } = await searchParams;
  const ctx = await contextoDaEmpresa(tenantId);
  const base = `/e/${encodeURIComponent(tenantId)}/estrategia`;

  if (!ctx.permissions.has("strategy.read")) {
    return (
      <div className="pilha">
        <h1>Estratégia</h1>
        <div className="card vazio" role="status"><p>Seu papel não permite ver a estratégia desta empresa.</p></div>
      </div>
    );
  }

  const objetivos = await listObjectives(strategyDeps, ctx);
  const personas = await listPersonas(strategyDeps, ctx);
  const podeEditar = ctx.permissions.has("strategy.write");

  async function criarObjetivo(dados: FormData) {
    "use server";
    const contexto = await contextoDaEmpresa(tenantId);
    try {
      await createObjective(strategyDeps, { ctx: contexto, content: lerObjetivoDoFormulario(dados) });
    } catch (e) {
      redirect(destinoDeErro(base, e));
    }
    revalidatePath(base);
    redirect(`${base}?ok=objetivo`);
  }
  async function arquivarObjetivo(dados: FormData) {
    "use server";
    const contexto = await contextoDaEmpresa(tenantId);
    try {
      await archiveObjective(strategyDeps, { ctx: contexto, id: idDoFormulario(dados, "id") as ObjectiveId });
    } catch (e) {
      redirect(destinoDeErro(base, e));
    }
    revalidatePath(base);
    redirect(`${base}?ok=objetivo-arquivado`);
  }
  async function criarPersona(dados: FormData) {
    "use server";
    const contexto = await contextoDaEmpresa(tenantId);
    try {
      await createPersona(strategyDeps, { ctx: contexto, content: lerPersonaDoFormulario(dados) });
    } catch (e) {
      redirect(destinoDeErro(base, e));
    }
    revalidatePath(base);
    redirect(`${base}?ok=persona`);
  }
  async function arquivarPersona(dados: FormData) {
    "use server";
    const contexto = await contextoDaEmpresa(tenantId);
    try {
      await archivePersona(strategyDeps, { ctx: contexto, id: idDoFormulario(dados, "id") as PersonaId });
    } catch (e) {
      redirect(destinoDeErro(base, e));
    }
    revalidatePath(base);
    redirect(`${base}?ok=persona-arquivada`);
  }

  const aviso: Record<string, string> = {
    objetivo: "Objetivo criado.", "objetivo-arquivado": "Objetivo arquivado.", persona: "Persona criada.", "persona-arquivada": "Persona arquivada.",
  };

  return (
    <div className="pilha">
      <div>
        <h1>Estratégia</h1>
        <p className="muted">Objetivos e indicadores que orientam as campanhas, e as personas que elas buscam alcançar.</p>
      </div>

      {ok && aviso[ok] && <p className="sucesso" role="status">{aviso[ok]}</p>}
      <ErroDaAcao erro={erro} problemas={problemas} mensagens={MENSAGENS_DE_ERRO_ESTRATEGIA} rotular={rotuloDoCaminhoEstrategia} />

      <section className="card pilha" aria-labelledby="objetivos">
        <h2 id="objetivos">Objetivos</h2>
        {objetivos.length === 0 ? (
          <div className="vazio">
            <p>Nenhum objetivo definido ainda.</p>
            <p className="muted">Um objetivo diz o que a empresa quer alcançar no período e como medir. Toda campanha parte de um.</p>
          </div>
        ) : (
          <ul className="lista">
            {objetivos.map((o) => (
              <li key={o.id}>
                <div className="entre">
                  <div>
                    <strong>{o.nome}</strong>{" "}
                    <span className="muted">{dataBR(o.periodo.inicio)} a {dataBR(o.periodo.fim)}</span>
                    {o.descricao && <p className="muted texto">{o.descricao}</p>}
                  </div>
                  {podeEditar && (
                    <form action={arquivarObjetivo}>
                      <input type="hidden" name="id" value={o.id} />
                      <BotaoEnviar variante="secundario" rotuloEmEspera="Arquivando…">Arquivar</BotaoEnviar>
                    </form>
                  )}
                </div>
                {o.kpis.length > 0 && (
                  <div className="rolavel" role="region" aria-label={`Indicadores de ${o.nome}`} tabIndex={0}>
                  <table>
                    <thead><tr><th scope="col">Indicador</th><th scope="col">Alvo</th><th scope="col">Situação atual</th></tr></thead>
                    <tbody>
                      {o.kpis.map((k, i) => (
                        <tr key={i}>
                          <td>{k.nome}</td>
                          <td>{numero(k.alvo)} {k.unidade}</td>
                          <td><span className="selo" title="O valor real chega com as fontes de dados (mídia e eventos comerciais)">Indisponível</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {podeEditar ? (
        <form action={criarObjetivo} className="card pilha" aria-labelledby="novo-objetivo">
          <h2 id="novo-objetivo">Novo objetivo</h2>
          <div>
            <label htmlFor="nome">Nome do objetivo</label>
            <input id="nome" name="nome" maxLength={120} required />
          </div>
          <div>
            <label htmlFor="descricao">Descrição</label>
            <input id="descricao" name="descricao" maxLength={1000} />
          </div>
          <div className="grade">
            <div><label htmlFor="inicio">Início</label><input id="inicio" name="inicio" type="date" required /></div>
            <div><label htmlFor="fim">Fim</label><input id="fim" name="fim" type="date" required /></div>
          </div>
          <fieldset className="item">
            <legend>Indicadores (opcional)</legend>
            {Array.from({ length: LINHAS_DE_INDICADOR }, (_, i) => (
              <div key={i} className="grade">
                <div><label htmlFor={`k_name_${i}`}>Indicador {i + 1}</label><input id={`k_name_${i}`} name={`k_name_${i}`} maxLength={80} /></div>
                <div><label htmlFor={`k_unit_${i}`}>Unidade</label><input id={`k_unit_${i}`} name={`k_unit_${i}`} maxLength={20} placeholder="leads, %, R$…" /></div>
                <div><label htmlFor={`k_target_${i}`}>Alvo</label><input id={`k_target_${i}`} name={`k_target_${i}`} inputMode="decimal" /></div>
              </div>
            ))}
          </fieldset>
          <BotaoEnviar rotuloEmEspera="Criando…">Criar objetivo</BotaoEnviar>
        </form>
      ) : (
        <p className="muted">Seu papel permite apenas consultar a estratégia.</p>
      )}

      <section className="card pilha" aria-labelledby="personas">
        <h2 id="personas">Personas</h2>
        {personas.length === 0 ? (
          <div className="vazio">
            <p>Nenhuma persona cadastrada.</p>
            <p className="muted">Persona é um arquétipo de público (não uma pessoa real). É opcional nas campanhas.</p>
          </div>
        ) : (
          <ul className="lista">
            {personas.map((p) => (
              <li key={p.id}>
                <div className="entre">
                  <div>
                    <strong>{p.nome}</strong>
                    {p.descricao && <p className="muted texto">{p.descricao}</p>}
                    {p.dores && <p className="texto">Dores: {p.dores}</p>}
                    {p.objecoes && <p className="texto">Objeções: {p.objecoes}</p>}
                  </div>
                  {podeEditar && (
                    <form action={arquivarPersona}>
                      <input type="hidden" name="id" value={p.id} />
                      <BotaoEnviar variante="secundario" rotuloEmEspera="Arquivando…">Arquivar</BotaoEnviar>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {podeEditar && (
        <form action={criarPersona} className="card pilha" aria-labelledby="nova-persona">
          <h2 id="nova-persona">Nova persona</h2>
          <p className="muted">Descreva um perfil de público. Não inclua nome, e-mail, telefone nem dado de uma pessoa real.</p>
          <div><label htmlFor="p_nome">Nome da persona</label><input id="p_nome" name="nome" maxLength={120} required /></div>
          <div><label htmlFor="p_descricao">Descrição</label><input id="p_descricao" name="descricao" maxLength={1000} /></div>
          <div><label htmlFor="p_dores">Dores</label><textarea id="p_dores" name="dores" rows={2} maxLength={1000} /></div>
          <div><label htmlFor="p_objecoes">Objeções</label><textarea id="p_objecoes" name="objecoes" rows={2} maxLength={1000} /></div>
          <BotaoEnviar rotuloEmEspera="Criando…">Criar persona</BotaoEnviar>
        </form>
      )}
    </div>
  );
}
