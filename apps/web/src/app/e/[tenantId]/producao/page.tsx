import { contextoDaEmpresa } from "../../../../lib/session";
import { ModuloIndisponivel } from "../../../../components/modulo-indisponivel";

/** Produção (14 §2, F-04, F-11.1, F-12, F-13): entregas, biblioteca de ativos, imagens. */
export default async function Producao({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  await contextoDaEmpresa(tenantId);
  return (
    <ModuloIndisponivel
      titulo="Produção"
      descricao="Briefings, entregas e ativos. Conteúdo gerado por IA é sempre identificado e passa por revisão humana."
      fluxo="F-04, F-11.1, F-12 e F-13"
      itens={[
        { rotulo: "Entregas", detalhe: "Copy de anúncio com variações lado a lado, selo Gerado por IA, versão da marca usada e verificações." },
        { rotulo: "Ativos", detalhe: "Envio de arquivos, inclusive vídeo. A Oplyra produz texto a partir do vídeo; não edita nem renderiza vídeo." },
        { rotulo: "Imagens", detalhe: "Gerar e editar imagens, mostrando antes o consumo (1 geração, 1 edição). Imagem aprovada não é anúncio publicado." },
      ]}
    />
  );
}
