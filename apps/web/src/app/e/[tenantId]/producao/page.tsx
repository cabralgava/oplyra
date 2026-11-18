import { contextoDaEmpresa } from "../../../../lib/session";

/**
 * Produção (14 §2, F-04, F-11.1, F-12, F-13): entregas, biblioteca de ativos, imagens.
 * Capacidade ainda não entregue: estado indisponível honesto (14 §6), sem exemplo, sem dado simulado e
 * sem ação falsa. O estado fica nesta página para o pedido depender só de arquivos já existentes em develop.
 */
const ITENS = [
  { rotulo: "Entregas", detalhe: "Copy de anúncio com variações lado a lado, selo Gerado por IA, versão da marca usada e verificações." },
  { rotulo: "Ativos", detalhe: "Envio de arquivos, inclusive vídeo. A Oplyra produz texto a partir do vídeo; não edita nem renderiza vídeo." },
  { rotulo: "Imagens", detalhe: "Gerar e editar imagens, mostrando antes o consumo (1 geração, 1 edição). Imagem aprovada não é anúncio publicado." },
];

export default async function Producao({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  await contextoDaEmpresa(tenantId);
  return (
    <div className="pilha">
      <div>
        <h1>Produção</h1>
        <p className="muted">Briefings, entregas e ativos. Conteúdo gerado por IA é sempre identificado e passa por revisão humana.</p>
      </div>
      <section className="card vazio" role="status" aria-labelledby="indisp-titulo">
        <h2 id="indisp-titulo">Ainda não disponível</h2>
        <p className="muted">Esta área (F-04, F-11.1, F-12 e F-13) está definida no produto, mas a capacidade ainda não foi entregue. Nenhum dado é simulado aqui.</p>
      </section>
      <section aria-label="O que esta área vai mostrar">
        <p className="rotulo-secao">O que esta área vai mostrar</p>
        <ul className="camp-grade">
          {ITENS.map((i) => (
            <li key={i.rotulo} className="camp">
              <h3>{i.rotulo}</h3>
              <p className="muted">{i.detalhe}</p>
              <span className="selo">Em breve</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
