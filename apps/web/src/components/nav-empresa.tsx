"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ICONES_NAV as ICONES } from "./icones-nav";

/**
 * Sidebar fixa da empresa (guia §Layout): no desktop fica persistente; abaixo de 60rem vira
 * gaveta acessível aberta por botão, fechada por Esc, por clique no fundo ou ao navegar.
 * Adaptação responsiva não tem frame de referência no Figma (registrada em ESTADO-FRONT).
 * A autorização continua em cada página; aqui só há navegação.
 */
export function NavEmpresa({ tenantId }: { tenantId: string }) {
  const caminho = usePathname();
  const [aberta, setAberta] = useState(false);
  const idPainel = useId();
  const botao = useRef<HTMLButtonElement>(null);
  const base = `/e/${encodeURIComponent(tenantId)}`;
  const itens = [
    { chave: "inicio", href: base, rotulo: "Início", exato: true },
    // Fatia publicada em develop: Central Estratégica. As demais páginas existem no código, mas ficam fora do nav.
    { chave: "estrategia", href: `${base}/estrategia`, rotulo: "Central Estratégica", exato: false },
    { chave: "operacao", href: `${base}/operacao`, rotulo: "Operação", exato: false },
    { chave: "execucoes", href: `${base}/execucoes`, rotulo: "Execuções", exato: false },
    { chave: "marca", href: `${base}/marca`, rotulo: "Marca", exato: false },
    { chave: "equipe", href: `${base}/equipe`, rotulo: "Equipe", exato: false },
  ];

  useEffect(() => { setAberta(false); }, [caminho]);
  useEffect(() => {
    if (!aberta) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setAberta(false); botao.current?.focus(); }
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberta]);

  return (
    <>
      <button
        ref={botao}
        type="button"
        className="menu-toggle"
        aria-expanded={aberta}
        aria-controls={idPainel}
        onClick={() => setAberta((v) => !v)}
      >
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        <span>Menu</span>
      </button>
      {aberta && <div className="sidebar-fundo" aria-hidden="true" onClick={() => setAberta(false)} />}
      <aside id={idPainel} className={aberta ? "sidebar aberta" : "sidebar"}>
        <div className="sidebar-marca">
          <span className="marca-simbolo" aria-hidden="true" />
          <span className="marca-nome">Oplyra</span>
        </div>
        <nav aria-label="Seções da empresa">
          <ul>
            {itens.map((i) => {
              const ativo = i.exato ? caminho === i.href : caminho === i.href || caminho.startsWith(`${i.href}/`);
              return (
                <li key={i.href}>
                  <Link href={i.href} aria-current={ativo ? "page" : undefined} className={ativo ? "ativo" : undefined}>
                    {ICONES[i.chave]}
                    <span>{i.rotulo}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <Link className="sidebar-troca" href="/empresas">Trocar de empresa</Link>
      </aside>
    </>
  );
}
