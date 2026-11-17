/** Carregamento das seções da empresa (14 §6): esqueleto com a estrutura final, sem spinner em tela cheia. */
export default function CarregandoEmpresa() {
  return (
    <div className="pilha" role="status" aria-busy="true" aria-label="Carregando">
      <div className="skel" style={{ height: "2.5rem", maxWidth: "20rem" }} />
      <div className="skel" style={{ height: "6rem" }} />
      <div className="skel" style={{ height: "10rem" }} />
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
