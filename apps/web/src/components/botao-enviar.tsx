"use client";
import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

/**
 * Botão de envio com estado de espera. Ações de servidor levam um tempo
 * perceptível: sem isto, a pessoa clica e a tela não responde. O botão
 * desabilita durante o envio e anuncia a mudança a leitores de tela.
 */
export function BotaoEnviar({ children, variante = "primario", rotuloEmEspera = "Enviando…" }: {
  children: ReactNode;
  variante?: "primario" | "secundario";
  rotuloEmEspera?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      className={variante === "primario" ? "btn" : "btn secundario"}
      type="submit"
      disabled={pending}
      aria-busy={pending}
    >
      <span aria-live="polite">{pending ? rotuloEmEspera : children}</span>
    </button>
  );
}
