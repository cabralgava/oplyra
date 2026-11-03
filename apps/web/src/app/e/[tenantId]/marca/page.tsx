import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { contextoDaEmpresa } from "../../../../lib/session";
import { brandDeps } from "../../../../lib/deps-marca";
import { lerEmpresa } from "../../../../lib/consultas";
import { getBrandOverview, listBrandVersions, startBrandDraft } from "@oplyra/core/brand";
import type { BrandVersion } from "@oplyra/core/brand";
import {
  ROTULO_DISPONIBILIDADE, ROTULO_POLARIDADE, ROTULO_TIPO, MENSAGENS_DE_ERRO, destinoDeErro,
} from "../../../../lib/marca-form";
import { BotaoEnviar } from "../../../../components/botao-enviar";

type Props = { params: Promise<{ tenantId: string }>; searchParams: Promise<{ erro?: string; ok?: string }> };

const data = (d: Date | null): string =>
  d ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "America/Sao_Paulo" }).format(d) : "—";

/** Marca (Brand OS): versão publicada vigente, rascunho e histórico (14 §Marca; I-03). */
export default async function Marca({ params, searchParams }: Props) {
  const { tenantId } = await params;
  const { erro, ok } = await searchParams;
  const ctx = await contextoDaEmpresa(tenantId);
  const base = `/e/${encodeURIComponent(tenantId)}/marca`;

  if (!ctx.permissions.has("brand.read")) {
    return (
      <div className="pilha">
        <h1>Marca</h1>
        <div className="card vazio" role="status">
          <p>Seu papel não permite ver a marca desta empresa.</p>
          <p className="muted">Peça a quem administra a empresa para ajustar seu acesso.</p>
        </div>
      </div>
    );
  }

  const empresa = await lerEmpresa(ctx);
  const { current, draft } = await getBrandOverview(brandDeps, ctx);
  const versoes = await listBrandVersions(brandDeps, ctx);
  const podeEditar = ctx.permissions.has("brand.write");

  async function iniciarRascunho() {
    "use server";
    const contexto = await contextoDaEmpresa(tenantId);
    try {
      await startBrandDraft(brandDeps, { ctx: contexto });
    } catch (e) {
      // Rascunho já existente não é falha para quem quer editar: segue para ele.
      if (!(e instanceof Error && "code" in e && e.code === "BRAND_DRAFT_ALREADY_EXISTS")) redirect(destinoDeErro(base, e));
    }
    revalidatePath(base);
    redirect(`${base}/rascunho`);
  }

  return (
    <div className="pilha">
      <div>
        <h1>Marca</h1>
        <p className="muted">{empresa?.name ?? "Empresa"} · voz, produtos e afirmações que orientam toda a produção.</p>
      </div>

      {ok === "publicado" && <p className="sucesso" role="status"><strong>Versão publicada.</strong> Ela passa a ser a vigente.</p>}
      {erro && <p className="erro" role="alert">{MENSAGENS_DE_ERRO[erro] ?? "Não foi possível concluir a ação."}</p>}

      {current ? <VersaoPublicada v={current} /> : (
        <div className="card vazio">
          <h2>Sua marca ainda não foi publicada</h2>
          <p className="muted">
            Cadastre o posicionamento, o tom de voz e ao menos um produto, e publique a versão 1.
            {" "}Enquanto isso, nada que dependa da marca fica disponível.
          </p>
        </div>
      )}

      <section className="card" aria-labelledby="rascunho">
        <h2 id="rascunho">Rascunho</h2>
        {draft ? (
          <div className="entre">
            <p>Há um rascunho aberto (versão {draft.number}), criado em {data(draft.createdAt)}.</p>
            {podeEditar
              ? <Link className="btn" href={`${base}/rascunho`}>Editar rascunho</Link>
              : <Link className="btn secundario" href={`${base}/rascunho`}>Ver rascunho</Link>}
          </div>
        ) : podeEditar ? (
          <form action={iniciarRascunho} className="entre">
            <p>{current ? `Para alterar a marca, abra um novo rascunho a partir da versão ${current.number}.` : "Comece pelo rascunho da versão 1."}</p>
            <BotaoEnviar rotuloEmEspera="Abrindo…">{current ? "Abrir novo rascunho" : "Criar rascunho"}</BotaoEnviar>
          </form>
        ) : (
          <p className="muted">Não há rascunho aberto. Seu papel permite apenas consultar a marca.</p>
        )}
      </section>

      {versoes.length > 0 && (
        <section className="card" aria-labelledby="historico">
          <h2 id="historico">Histórico de versões</h2>
          <table>
            <thead><tr><th scope="col">Versão</th><th scope="col">Situação</th><th scope="col">Data</th></tr></thead>
            <tbody>
              {versoes.map((v) => (
                <tr key={v.id}>
                  <td>{v.number}{current?.id === v.id && <span className="muted"> (vigente)</span>}</td>
                  <td><span className={v.status === "published" ? "selo ok" : "selo pendente"}>{v.status === "published" ? "Publicada" : "Rascunho"}</span></td>
                  <td>{data(v.status === "published" ? v.publishedAt : v.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function VersaoPublicada({ v }: { v: BrandVersion }) {
  return (
    <section className="card pilha" aria-labelledby="vigente">
      <div className="entre">
        <h2 id="vigente">Versão {v.number} · vigente</h2>
        <span className="selo ok">Publicada em {data(v.publishedAt)}</span>
      </div>
      <div><h3>Posicionamento</h3><p className="texto">{v.positioning}</p></div>
      <div><h3>Tom de voz</h3><p className="texto">{v.tone}</p></div>

      <div>
        <h3>Produtos</h3>
        <ul className="lista">
          {v.products.map((p) => (
            <li key={p.productKey}>
              <strong>{p.name}</strong>{" "}
              <span className={p.availability === "available" ? "selo ok" : "selo pendente"}>{ROTULO_DISPONIBILIDADE[p.availability]}</span>
              {p.description && <p className="muted texto">{p.description}</p>}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3>Afirmações</h3>
        {v.claims.length === 0 ? <p className="muted">Nenhuma afirmação cadastrada.</p> : (
          <ul className="lista">
            {v.claims.map((a) => {
              const produto = v.products.find((p) => p.productKey === a.productKey);
              return (
                <li key={a.id}>
                  <span className={a.polarity === "allowed" ? "selo ok" : "selo proibido"}>{ROTULO_POLARIDADE[a.polarity]}</span>{" "}
                  <span className="selo">{ROTULO_TIPO[a.kind]}</span>
                  {produto && <span className="muted"> · {produto.name}</span>}
                  <p className="texto">{a.text}</p>
                  <p className="muted texto">Regra de uso: {a.usageRule}</p>
                  {a.evidence.length > 0 && (
                    <ul className="evidencias">
                      {a.evidence.map((e, i) => (
                        <li key={i}>
                          {e.kind === "url"
                            ? <a href={e.value} target="_blank" rel="noopener noreferrer">{e.value}</a>
                            : <span className="texto">{e.value}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
