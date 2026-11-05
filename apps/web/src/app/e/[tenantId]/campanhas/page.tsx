import Link from "next/link";
import { contextoDaEmpresa } from "../../../../lib/session";
import { strategyDeps } from "../../../../lib/deps-estrategia";
import { brandDeps } from "../../../../lib/deps-marca";
import { getBrandOverview } from "@oplyra/core/brand";
import { listCampaigns, listObjectives, ROTULO_ESTADO_CAMPANHA } from "@oplyra/core/strategy";
import { CLASSE_DO_ESTADO, MENSAGENS_DE_ERRO_ESTRATEGIA } from "../../../../lib/estrategia-form";

type Props = { params: Promise<{ tenantId: string }>; searchParams: Promise<{ erro?: string; ok?: string }> };

const dataBR = (iso: string): string => iso.split("-").reverse().join("/");

/** Campanhas: lista com estado, objetivo, período e chave de rastreamento. */
export default async function Campanhas({ params, searchParams }: Props) {
  const { tenantId } = await params;
  const { erro, ok } = await searchParams;
  const ctx = await contextoDaEmpresa(tenantId);
  const base = `/e/${encodeURIComponent(tenantId)}`;

  if (!ctx.permissions.has("strategy.read")) {
    return (
      <div className="pilha">
        <h1>Campanhas</h1>
        <div className="card vazio" role="status"><p>Seu papel não permite ver as campanhas desta empresa.</p></div>
      </div>
    );
  }

  const campanhas = await listCampaigns(strategyDeps, ctx);
  const objetivos = await listObjectives(strategyDeps, ctx, { includeArchived: true });
  const marca = ctx.permissions.has("brand.read") ? (await getBrandOverview(brandDeps, ctx)).current : null;
  const podeCriar = ctx.permissions.has("strategy.write");
  const nomeDoObjetivo = new Map(objetivos.map((o) => [o.id, o.nome]));
  const ativos = objetivos.filter((o) => o.status === "active");

  // Pré-requisitos da primeira campanha, dito com clareza em vez de um botão que falha.
  const faltaMarca = !marca;
  const faltaObjetivo = ativos.length === 0;

  return (
    <div className="pilha">
      <div className="entre">
        <div>
          <h1>Campanhas</h1>
          <p className="muted">Cada campanha parte de um objetivo e de um produto da marca, e tem uma chave de rastreamento.</p>
        </div>
        {podeCriar && !faltaMarca && !faltaObjetivo && <Link className="btn" href={`${base}/campanhas/nova`}>Nova campanha</Link>}
      </div>

      {ok === "criada" && <p className="sucesso" role="status">Campanha criada como planejada.</p>}
      {erro && <p className="erro" role="alert">{MENSAGENS_DE_ERRO_ESTRATEGIA[erro] ?? "Não foi possível concluir a ação."}</p>}

      {campanhas.length === 0 ? (
        <div className="card vazio">
          <h2>Nenhuma campanha ainda</h2>
          {faltaMarca ? (
            <p className="muted">Antes de criar uma campanha, <Link href={`${base}/marca`}>publique a marca</Link>: a campanha escolhe um produto dela.</p>
          ) : faltaObjetivo ? (
            <p className="muted">Antes de criar uma campanha, <Link href={`${base}/estrategia`}>defina um objetivo</Link>.</p>
          ) : podeCriar ? (
            <p className="muted">Crie a primeira campanha: objetivo, produto, método e período. Ela nasce planejada e só ativa com o método completo.</p>
          ) : (
            <p className="muted">Seu papel permite apenas consultar. Peça a quem edita a estratégia para criar a primeira campanha.</p>
          )}
        </div>
      ) : (
        <div className="card rolavel" role="region" aria-label="Lista de campanhas" tabIndex={0}>
          <table>
            <thead>
              <tr><th scope="col">Campanha</th><th scope="col">Estado</th><th scope="col">Objetivo</th><th scope="col">Período</th><th scope="col">Chave</th></tr>
            </thead>
            <tbody>
              {campanhas.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`${base}/campanhas/${c.id}`}>{c.nome}</Link></td>
                  <td><span className={CLASSE_DO_ESTADO[c.status]}>{ROTULO_ESTADO_CAMPANHA[c.status]}</span></td>
                  <td>{nomeDoObjetivo.get(c.objectiveId) ?? "—"}</td>
                  <td>{dataBR(c.periodo.inicio)} a {dataBR(c.periodo.fim)}</td>
                  <td><code>{c.chave}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
