import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { contextoDaEmpresa } from "../../../../../lib/session";
import { brandDeps } from "../../../../../lib/deps-marca";
import { getBrandOverview, saveBrandDraft, publishBrandVersion } from "@oplyra/core/brand";
import type { BrandVersion } from "@oplyra/core/brand";
import type { BrandVersionId } from "@oplyra/core";
import {
  LINHAS_NOVAS_AFIRMACAO, LINHAS_NOVAS_PRODUTO, MENSAGENS_DE_ERRO, ROTULO_DISPONIBILIDADE, ROTULO_POLARIDADE, ROTULO_TIPO,
  decodificarProblemas, destinoDeErro, evidenciasParaTexto, lerConteudoDoFormulario, rotuloDoCaminho,
} from "../../../../../lib/marca-form";
import { BotaoAcao } from "../../../../../components/botao-acao";

type Props = { params: Promise<{ tenantId: string }>; searchParams: Promise<{ erro?: string; ok?: string; problemas?: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Fica no escopo do módulo, não dentro do componente: uma ação de servidor só pode fechar sobre valores
 * serializáveis (aqui, strings); uma função local capturada não atravessa a fronteira cliente/servidor.
 */
async function salvarRascunho(dados: FormData, contexto: Awaited<ReturnType<typeof contextoDaEmpresa>>): Promise<BrandVersion> {
  const versao = String(dados.get("versao") ?? "");
  const revisao = Number(dados.get("revisao"));
  if (!UUID.test(versao) || !Number.isInteger(revisao) || revisao < 1) {
    throw Object.assign(new Error("formulário inválido"), { code: "FORMULARIO_INVALIDO" });
  }
  return saveBrandDraft(brandDeps, {
    ctx: contexto, versionId: versao as BrandVersionId, expectedRevision: revisao, content: lerConteudoDoFormulario(dados),
  });
}

/** Editor do rascunho da marca. Funciona sem JavaScript no cliente: o formulário traz as linhas salvas e algumas em branco. */
export default async function Rascunho({ params, searchParams }: Props) {
  const { tenantId } = await params;
  const { erro, ok, problemas } = await searchParams;
  const ctx = await contextoDaEmpresa(tenantId);
  const base = `/e/${encodeURIComponent(tenantId)}/marca`;
  const destino = `${base}/rascunho`;

  if (!ctx.permissions.has("brand.write")) {
    return (
      <div className="pilha">
        <h1>Rascunho da marca</h1>
        <div className="card vazio" role="status">
          <p>Seu papel não permite editar a marca.</p>
          <p className="muted">Você pode consultar a versão publicada.</p>
          <Link className="btn secundario" href={base}>Voltar à marca</Link>
        </div>
      </div>
    );
  }

  const { draft } = await getBrandOverview(brandDeps, ctx);
  if (!draft) {
    return (
      <div className="pilha">
        <h1>Rascunho da marca</h1>
        <div className="card vazio" role="status">
          <p>Não há rascunho aberto.</p>
          <p className="muted">Abra um rascunho na página da marca para começar a editar.</p>
          <Link className="btn" href={base}>Ir para a marca</Link>
        </div>
      </div>
    );
  }

  const podePublicar = ctx.permissions.has("brand.publish");

  async function salvar(dados: FormData) {
    "use server";
    const contexto = await contextoDaEmpresa(tenantId);
    try {
      await salvarRascunho(dados, contexto);
    } catch (e) {
      redirect(destinoDeErro(destino, e));
    }
    revalidatePath(base);
    redirect(`${destino}?ok=salvo`);
  }

  async function salvarEPublicar(dados: FormData) {
    "use server";
    const contexto = await contextoDaEmpresa(tenantId);
    try {
      const salvo = await salvarRascunho(dados, contexto);
      await publishBrandVersion(brandDeps, { ctx: contexto, versionId: salvo.id, expectedRevision: salvo.revision });
    } catch (e) {
      redirect(destinoDeErro(destino, e));
    }
    revalidatePath(base);
    redirect(`${base}?ok=publicado`);
  }

  const pontos = decodificarProblemas(problemas);
  const nProdutos = draft.products.length + LINHAS_NOVAS_PRODUTO;
  const nAfirmacoes = draft.claims.length + LINHAS_NOVAS_AFIRMACAO;

  return (
    <div className="pilha">
      <div className="entre">
        <div>
          <h1>Rascunho da marca</h1>
          <p className="muted">Versão {draft.number}{draft.derivedFromId ? " · cópia da versão vigente" : " · primeira versão"}. Nada aqui afeta a marca publicada até você publicar.</p>
        </div>
        <Link className="btn secundario" href={base}>Voltar à marca</Link>
      </div>

      {ok === "salvo" && <p className="sucesso" role="status"><strong>Rascunho salvo.</strong></p>}
      {erro && (
        <div className="erro" role="alert">
          <p>{MENSAGENS_DE_ERRO[erro] ?? "Não foi possível concluir a ação."}</p>
          {pontos.length > 0 && (
            <ul>
              {pontos.map((p, i) => <li key={i}>{rotuloDoCaminho(p.caminho) || "Geral"}: {p.mensagem}</li>)}
            </ul>
          )}
        </div>
      )}

      <form action={salvar} className="pilha">
        <input type="hidden" name="versao" value={draft.id} />
        <input type="hidden" name="revisao" value={draft.revision} />
        <input type="hidden" name="p_n" value={nProdutos} />
        <input type="hidden" name="c_n" value={nAfirmacoes} />

        <section className="card pilha" aria-labelledby="voz">
          <h2 id="voz">Voz da marca</h2>
          <div>
            <label htmlFor="positioning">Posicionamento</label>
            <textarea id="positioning" name="positioning" rows={4} maxLength={2000} defaultValue={draft.positioning} aria-describedby="positioning-ajuda" />
            <p id="positioning-ajuda" className="muted">Para quem é, o que resolve e por que é diferente. Obrigatório para publicar.</p>
          </div>
          <div>
            <label htmlFor="tone">Tom de voz</label>
            <textarea id="tone" name="tone" rows={3} maxLength={1000} defaultValue={draft.tone} aria-describedby="tone-ajuda" />
            <p id="tone-ajuda" className="muted">Como a marca fala e o que ela evita. Obrigatório para publicar.</p>
          </div>
        </section>

        <section className="card pilha" aria-labelledby="produtos">
          <h2 id="produtos">Produtos</h2>
          <p className="muted">Ao menos um produto é obrigatório para publicar. Produtos novos só aparecem na lista de afirmações depois de salvar.</p>
          {Array.from({ length: nProdutos }, (_, i) => {
            const p = draft.products[i];
            return (
              <fieldset key={p?.productKey ?? `novo-${i}`} className="item">
                <legend>{p ? `Produto ${i + 1}` : `Novo produto`}</legend>
                {p && <input type="hidden" name={`p_key_${i}`} value={p.productKey} />}
                <div>
                  <label htmlFor={`p_name_${i}`}>Nome</label>
                  <input id={`p_name_${i}`} name={`p_name_${i}`} maxLength={120} defaultValue={p?.name ?? ""} />
                </div>
                <div>
                  <label htmlFor={`p_desc_${i}`}>Descrição</label>
                  <input id={`p_desc_${i}`} name={`p_desc_${i}`} maxLength={1000} defaultValue={p?.description ?? ""} />
                </div>
                <div>
                  <label htmlFor={`p_avail_${i}`}>Disponibilidade</label>
                  <select id={`p_avail_${i}`} name={`p_avail_${i}`} defaultValue={p?.availability ?? "available"}>
                    <option value="available">{ROTULO_DISPONIBILIDADE.available}</option>
                    <option value="future">{ROTULO_DISPONIBILIDADE.future}</option>
                  </select>
                </div>
                {p && (
                  <label className="inline" htmlFor={`p_remove_${i}`}>
                    <input id={`p_remove_${i}`} name={`p_remove_${i}`} type="checkbox" /> Remover este produto ao salvar
                  </label>
                )}
              </fieldset>
            );
          })}
        </section>

        <section className="card pilha" aria-labelledby="afirmacoes">
          <h2 id="afirmacoes">Afirmações</h2>
          <p className="muted">
            O que a marca pode e o que não pode dizer. Toda afirmação precisa de regra de uso; as permitidas precisam de evidência.
            Afirmação de disponibilidade permitida não é aceita para produto futuro.
          </p>
          {Array.from({ length: nAfirmacoes }, (_, i) => {
            const a = draft.claims[i];
            return (
              <fieldset key={a?.id ?? `nova-${i}`} className="item">
                <legend>{a ? `Afirmação ${i + 1}` : "Nova afirmação"}</legend>
                {a && <input type="hidden" name={`c_id_${i}`} value={a.id} />}
                <div className="grade">
                  <div>
                    <label htmlFor={`c_pol_${i}`}>Uso</label>
                    <select id={`c_pol_${i}`} name={`c_pol_${i}`} defaultValue={a?.polarity ?? "allowed"}>
                      <option value="allowed">{ROTULO_POLARIDADE.allowed}</option>
                      <option value="forbidden">{ROTULO_POLARIDADE.forbidden}</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`c_kind_${i}`}>Tipo</label>
                    <select id={`c_kind_${i}`} name={`c_kind_${i}`} defaultValue={a?.kind ?? "benefit"}>
                      {Object.entries(ROTULO_TIPO).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`c_product_${i}`}>Produto relacionado</label>
                    <select id={`c_product_${i}`} name={`c_product_${i}`} defaultValue={a?.productKey ?? ""}>
                      <option value="">Geral da marca</option>
                      {draft.products.map((p) => <option key={p.productKey} value={p.productKey}>{p.name || "(sem nome)"}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label htmlFor={`c_text_${i}`}>Afirmação</label>
                  <textarea id={`c_text_${i}`} name={`c_text_${i}`} rows={2} maxLength={500} defaultValue={a?.text ?? ""} />
                </div>
                <div>
                  <label htmlFor={`c_rule_${i}`}>Regra de uso</label>
                  <input id={`c_rule_${i}`} name={`c_rule_${i}`} maxLength={500} defaultValue={a?.usageRule ?? ""} />
                </div>
                <div>
                  <label htmlFor={`c_evid_${i}`}>Evidências</label>
                  <textarea id={`c_evid_${i}`} name={`c_evid_${i}`} rows={3} defaultValue={a ? evidenciasParaTexto(a.evidence) : ""} aria-describedby={`c_evid_ajuda_${i}`} />
                  <p id={`c_evid_ajuda_${i}`} className="muted">Uma por linha. Endereços que começam com http:// ou https:// viram links; o resto é texto.</p>
                </div>
                {a && (
                  <label className="inline" htmlFor={`c_remove_${i}`}>
                    <input id={`c_remove_${i}`} name={`c_remove_${i}`} type="checkbox" /> Remover esta afirmação ao salvar
                  </label>
                )}
              </fieldset>
            );
          })}
        </section>

        <div className="linha">
          <BotaoAcao acao={salvar} rotuloEmEspera="Salvando…">Salvar rascunho</BotaoAcao>
          {podePublicar
            ? <BotaoAcao acao={salvarEPublicar} variante="secundario" rotuloEmEspera="Publicando…">Salvar e publicar</BotaoAcao>
            : <span className="muted">Seu papel edita o rascunho, mas só Owner e Administrador publicam.</span>}
        </div>
      </form>
    </div>
  );
}
