"use client";
import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

/**
 * Botão de envio com ação própria (`formAction`), para formulários com mais de uma saída
 * (ex.: salvar e salvar-e-publicar). Desabilita durante o envio e anuncia a mudança.
 */
export function BotaoAcao({ children, acao, variante = "primario", rotuloEmEspera = "Enviando…" }: {
  children: ReactNode;
  acao: (dados: FormData) => void | Promise<void>;
  variante?: "primario" | "secundario";
  rotuloEmEspera?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      className={variante === "primario" ? "btn" : "btn secundario"}
      type="submit"
      formAction={acao}
      disabled={pending}
      aria-busy={pending}
    >
      <span aria-live="polite">{pending ? rotuloEmEspera : children}</span>
    </button>
  );
}
