"use client";
import Link from "next/link";

export default function ErroOperacao({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <section className="card pilha" role="alert">
    <h1>Operação</h1><p>Não foi possível carregar as tarefas. Tente novamente para conferir o estado atual.</p>
    <div className="linha"><button className="btn" type="button" onClick={() => retry()}>Tentar novamente</button><Link className="btn secundario" href="/empresas">Voltar às empresas</Link></div>
  </section>;
}
