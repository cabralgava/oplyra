import React from "react";

type ObjetivoDoResumo = {
  readonly name: string;
  readonly status: string;
  readonly primary: boolean;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly kpis: readonly { readonly key: string; readonly name: string; readonly target: number; readonly unit: string }[];
};

type Props = {
  objetivos: readonly ObjetivoDoResumo[];
  campanhas: readonly { readonly status: string }[];
  className?: string | undefined;
};

/** Apresentação de dados já autorizados. Contagens e alvos não representam resultados medidos. */
export function EstrategiaResumo({ objetivos, campanhas, className }: Props) {
  const ativos = objetivos.filter((o) => o.status === "active");
  const principal = ativos.find((o) => o.primary);
  const contagens = [
    { nome: "Objetivos ativos", valor: ativos.length },
    { nome: "Campanhas ativas", valor: campanhas.filter((c) => c.status === "active").length },
    { nome: "Campanhas planejadas", valor: campanhas.filter((c) => c.status === "draft").length },
  ];

  return (
    <section className={className} aria-labelledby="meta-principal">
      <div>
        <p className="camp-rotulo">Meta primária</p>
        <h2 id="meta-principal">{principal ? principal.name : "Nenhum objetivo principal definido"}</h2>
        {principal ? (
          <>
            <p className="muted">Período: {principal.periodStart} a {principal.periodEnd}</p>
            <ul aria-label="Alvos dos indicadores do objetivo principal">
              {principal.kpis.map((k) => (
                <li key={k.key}><span>{k.name}</span><strong>Alvo: {k.target} {k.unit}</strong></li>
              ))}
            </ul>
            <p className="muted">Alvos definidos no objetivo. Progresso e projeção ainda não estão disponíveis.</p>
          </>
        ) : (
          <p className="muted">Defina um objetivo e torne-o principal para acompanhar a meta aqui. Progresso e projeção ainda não estão disponíveis.</p>
        )}
      </div>
      <dl aria-label="Contagem da operação">
        {contagens.map((c) => <div key={c.nome}><dt>{c.nome}</dt><dd>{c.valor}</dd></div>)}
      </dl>
    </section>
  );
}
