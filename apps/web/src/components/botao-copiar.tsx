"use client";
import { useState } from "react";

/**
 * Copia um texto para a área de transferência e avisa o resultado a leitores de tela.
 * Sem permissão ou sem suporte, o texto continua visível e selecionável ao lado do botão.
 */
export function BotaoCopiar({ texto, rotulo = "Copiar", rotuloAcessivel }: { texto: string; rotulo?: string; rotuloAcessivel?: string }) {
  const [estado, setEstado] = useState<"parado" | "copiado" | "falhou">("parado");
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setEstado("copiado");
    } catch {
      setEstado("falhou");
    }
    setTimeout(() => setEstado("parado"), 2500);
  }
  return (
    <button type="button" className="btn secundario" onClick={copiar} aria-label={rotuloAcessivel ?? rotulo}>
      <span aria-live="polite">{estado === "copiado" ? "Copiado" : estado === "falhou" ? "Não foi possível copiar" : rotulo}</span>
    </button>
  );
}
