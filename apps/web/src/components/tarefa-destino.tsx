"use client";

import { useEffect } from "react";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Guarda de navegação; a autorização continua no servidor, antes de fornecer os IDs. */
export function tarefaPermitidaNoHash(hash: string, permitidos: ReadonlySet<string>): string | null {
  const prefixo = "#tarefa-";
  if (!hash.startsWith(prefixo)) return null;
  const id = hash.slice(prefixo.length);
  if (!UUID.test(id) || !permitidos.has(id.toLowerCase())) return null;
  return `tarefa-${id.toLowerCase()}`;
}

/**
 * O HTML streamed pode conter o cartão ainda sem layout quando o navegador aplica o hash.
 * A operação acompanha somente seus alvos autorizados e encerra a observação após o salto.
 */
export function TarefaDestino({ taskIds }: { taskIds: readonly string[] }) {
  useEffect(() => {
    const permitidos = new Set(taskIds.filter(id => typeof id === "string" && UUID.test(id)).map(id => id.toLowerCase()));
    let interromperPendente = () => {};

    function acompanharHash() {
      interromperPendente();
      interromperPendente = () => {};
      const alvoId = tarefaPermitidaNoHash(window.location.hash, permitidos);
      // Nenhuma procura no DOM ou observação para fragmentos estranhos à lista autorizada.
      if (!alvoId) return;
      const container = document.getElementById("conteudo-principal");
      if (!(container instanceof HTMLElement)) return;

      let ativo = true;
      let frame: number | null = null;
      let observado: HTMLElement | null = null;
      let mutacoes: MutationObserver | null = null;
      let tamanho: ResizeObserver | null = null;

      function encerrar() {
        ativo = false;
        if (frame !== null) window.cancelAnimationFrame(frame);
        frame = null;
        mutacoes?.disconnect();
        tamanho?.disconnect();
      }
      function agendar() {
        if (ativo && frame === null) frame = window.requestAnimationFrame(conferir);
      }
      function conferir() {
        frame = null;
        if (!ativo) return;
        const alvo = document.getElementById(alvoId!);
        if (!(alvo instanceof HTMLElement) || !container!.contains(alvo)) return;
        if (observado !== alvo) {
          tamanho?.disconnect();
          observado = alvo;
          tamanho?.observe(alvo);
        }
        const caixa = alvo.getBoundingClientRect();
        if (caixa.width <= 0 || caixa.height <= 0) return;
        encerrar();
        alvo.scrollIntoView({ block: "start", behavior: "auto" });
      }

      interromperPendente = encerrar;
      mutacoes = new MutationObserver(agendar);
      mutacoes.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "style", "class"] });
      if (typeof ResizeObserver !== "undefined") tamanho = new ResizeObserver(agendar);
      agendar();
    }

    acompanharHash();
    window.addEventListener("hashchange", acompanharHash);
    window.addEventListener("popstate", acompanharHash);
    return () => {
      interromperPendente();
      window.removeEventListener("hashchange", acompanharHash);
      window.removeEventListener("popstate", acompanharHash);
    };
  }, [taskIds]);
  return null;
}
