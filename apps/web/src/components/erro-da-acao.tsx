import { decodificarProblemas } from "../lib/marca-form";

/** Mensagem de erro de uma ação e, se o domínio listou pontos, a lista deles. Lê só códigos fixos da URL. */
export function ErroDaAcao({ erro, problemas, mensagens, rotular }: {
  erro: string | undefined;
  problemas: string | undefined;
  mensagens: Record<string, string>;
  rotular: (caminho: string) => string;
}) {
  if (!erro) return null;
  const pontos = decodificarProblemas(problemas);
  return (
    <div className="erro" role="alert">
      <p>{mensagens[erro] ?? "Não foi possível concluir a ação."}</p>
      {pontos.length > 0 && (
        <ul>
          {pontos.map((p, i) => <li key={i}>{rotular(p.caminho) ? `${rotular(p.caminho)}: ` : ""}{p.mensagem}</li>)}
        </ul>
      )}
    </div>
  );
}
