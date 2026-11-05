import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { contextoDaEmpresa } from "../../../../../lib/session";
import { strategyDeps } from "../../../../../lib/deps-estrategia";
import { brandDeps } from "../../../../../lib/deps-marca";
import { getBrandOverview } from "@oplyra/core/brand";
import { createCampaign, listObjectives, listPersonas } from "@oplyra/core/strategy";
import { destinoDeErro } from "../../../../../lib/marca-form";
import { MENSAGENS_DE_ERRO_ESTRATEGIA, lerCampanhaDoFormulario, rotuloDoCaminhoEstrategia } from "../../../../../lib/estrategia-form";
import { BotaoEnviar } from "../../../../../components/botao-enviar";
import { ErroDaAcao } from "../../../../../components/erro-da-acao";
import { CamposDaCampanha } from "../../../../../components/formulario-campanha";

type Props = { params: Promise<{ tenantId: string }>; searchParams: Promise<{ erro?: string; problemas?: string }> };

/** Nova campanha (F-03): planejamento e método DEC-017. A campanha nasce planejada; ativar é outro passo. */
export default async function NovaCampanha({ params, searchParams }: Props) {
  const { tenantId } = await params;
  const { erro, problemas } = await searchParams;
  const ctx = await contextoDaEmpresa(tenantId);
  const base = `/e/${encodeURIComponent(tenantId)}`;
  const destino = `${base}/campanhas/nova`;

  if (!ctx.permissions.has("strategy.write")) {
    return (
      <div className="pilha">
        <h1>Nova campanha</h1>
        <div className="card vazio" role="status">
          <p>Seu papel não permite criar campanhas.</p>
          <Link className="btn secundario" href={`${base}/campanhas`}>Voltar às campanhas</Link>
        </div>
      </div>
    );
  }

  const objetivos = await listObjectives(strategyDeps, ctx);
  const personas = await listPersonas(strategyDeps, ctx);
  const { current } = await getBrandOverview(brandDeps, ctx);

  if (!current || objetivos.length === 0) {
    return (
      <div className="pilha">
        <h1>Nova campanha</h1>
        <div className="card vazio" role="status">
          {!current
            ? <p>Publique a marca antes de criar uma campanha: ela escolhe um produto da marca. <Link href={`${base}/marca`}>Ir para a marca</Link></p>
            : <p>Defina um objetivo antes de criar uma campanha. <Link href={`${base}/estrategia`}>Ir para a estratégia</Link></p>}
        </div>
      </div>
    );
  }

  async function criar(dados: FormData) {
    "use server";
    const contexto = await contextoDaEmpresa(tenantId);
    let id: string;
    try {
      id = (await createCampaign(strategyDeps, { ctx: contexto, plan: lerCampanhaDoFormulario(dados) })).id;
    } catch (e) {
      redirect(destinoDeErro(destino, e));
    }
    revalidatePath(`${base}/campanhas`);
    redirect(`${base}/campanhas/${id}?ok=criada`);
  }

  return (
    <div className="pilha">
      <div>
        <h1>Nova campanha</h1>
        <p className="muted">Versão da marca usada: {current.number}. A chave de rastreamento é gerada ao salvar e fica fixa depois que a campanha for ativada.</p>
      </div>
      <ErroDaAcao erro={erro} problemas={problemas} mensagens={MENSAGENS_DE_ERRO_ESTRATEGIA} rotular={rotuloDoCaminhoEstrategia} />
      <form action={criar} className="pilha">
        <CamposDaCampanha objetivos={objetivos} produtos={current.products} personas={personas} />
        <div className="linha">
          <BotaoEnviar rotuloEmEspera="Criando…">Criar campanha</BotaoEnviar>
          <Link className="btn secundario" href={`${base}/campanhas`}>Cancelar</Link>
        </div>
      </form>
    </div>
  );
}
