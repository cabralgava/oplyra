import type { ReactNode } from "react";

const ico = (d: ReactNode) => (
  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);

/** Ícones da navegação lateral, compartilhados entre as telas da empresa e a demonstração. */
export const ICONES_NAV: Record<string, ReactNode> = {
  inicio: ico(<><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></>),
  campanhas: ico(<><path d="M3 11v2a1 1 0 001 1h2l7 4V6L6 10H4a1 1 0 00-1 1z" /><path d="M17 9a4 4 0 010 6" /></>),
  estrategia: ico(<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /></>),
  producao: ico(<><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>),
  aprovacoes: ico(<><circle cx="12" cy="12" r="9" /><path d="M8 12.5l3 3 5-6" /></>),
  midia: ico(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /></>),
  resultados: ico(<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>),
  configuracoes: ico(<><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>),
  operacao: ico(<><path d="M4 6h16M4 12h16M4 18h10" /></>),
  execucoes: ico(<><path d="M8 5l11 7-11 7z" /></>),
  marca: ico(<><path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" /></>),
  equipe: ico(<><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 5a3 3 0 010 6M18 14.5c1.9.8 3 2.6 3 5.5" /></>),
  biblioteca: ico(<><path d="M5 4h4v16H5zM11 4h4v16h-4z" /><path d="M17 5l3.5 1-3.5 14-3.5-1z" /></>),
  agentes: ico(<><rect x="5" y="8" width="14" height="11" rx="3" /><path d="M12 4v4M9 13h.01M15 13h.01" /></>),
  growth: ico(<><path d="M4 17l6-6 4 4 6-8" /><path d="M15 7h5v5" /></>),
  cobertura: ico(<><path d="M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2z" /><path d="M9 4v14M15 6v14" /></>),
};
