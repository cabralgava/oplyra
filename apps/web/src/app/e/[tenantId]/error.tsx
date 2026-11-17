"use client";
import Link from "next/link";
import { useEffect } from "react";

/**
 * Erro recuperável nas seções da empresa (14 §6): mensagem específica, nova tentativa e saída segura.
 * Não exibe `error.message` (pode conter detalhes internos); só o código de rastreio (`digest`) que o Next gera.
 * Nesta versão do Next o boundary recebe `retry` (não `reset`).
 */
export default function ErroDaEmpresa({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("Erro em /e/[tenantId]", error.digest ?? "sem-digest");
  }, [error]);
  return (
    <div className="pilha" role="alert">
      <div className="erro">
        <p><strong>Não foi possível carregar esta área.</strong> Seus dados não foram alterados.</p>
        {error.digest && <p className="muted">Código de rastreio: <code>{error.digest}</code></p>}
      </div>
      <div className="linha">
        <button type="button" className="btn" onClick={() => retry()}>Tentar novamente</button>
        <Link className="btn secundario" href="/empresas">Voltar às empresas</Link>
      </div>
    </div>
  );
}
