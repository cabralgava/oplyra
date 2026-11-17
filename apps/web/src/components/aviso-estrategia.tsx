import { MENSAGENS_ESTRATEGIA, decodificarProblemas } from "../lib/estrategia-form";

/** Faixa de erro das telas de Estratégia/Operação: código fixo traduzido e, se o domínio listou pontos, os pontos. */
export function AvisoDeErro({ erro, problemas }: { erro?: string | undefined; problemas?: string | undefined }) {
  if (!erro) return null;
  const pontos = decodificarProblemas(problemas);
  return (
    <div className="erro" role="alert">
      <p>{MENSAGENS_ESTRATEGIA[erro] ?? "Não foi possível concluir a ação."}</p>
      {pontos.length > 0 && (
        <ul>{pontos.map((p, i) => <li key={i}>{p.caminho ? `${p.caminho}: ` : ""}{p.mensagem}</li>)}</ul>
      )}
    </div>
  );
}

export function AvisoSemPermissao({ titulo, oque }: { titulo: string; oque: string }) {
  return (
    <div className="pilha">
      <h1>{titulo}</h1>
      <div className="card vazio" role="status">
        <p>Seu papel não permite {oque} desta empresa.</p>
        <p className="muted">Peça a quem administra a empresa para ajustar seu acesso.</p>
      </div>
    </div>
  );
}
