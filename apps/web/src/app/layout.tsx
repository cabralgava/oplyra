import "./globals.css";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import { rotuloAmbiente } from "../lib/rotulo-ambiente";

/**
 * Fontes do guia de interface: Inter (texto) e Manrope (títulos). Arquivos variáveis versionados em ./fonts (licença OFL,
 * ver OFL-Inter.txt e OFL-Manrope.txt; origem: github.com/google/fonts, ofl/inter e ofl/manrope). Carregamento local:
 * nenhuma rede em build nem em execução. Os pesos são faixas do eixo `wght`; nenhum peso é sintetizado pelo navegador.
 */
const inter = localFont({
  src: "./fonts/Inter-Variable.ttf",
  weight: "100 900",
  variable: "--font-inter",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});
const manrope = localFont({
  src: "./fonts/Manrope-Variable.ttf",
  weight: "200 800",
  variable: "--font-manrope",
  display: "swap",
  fallback: ["Inter", "system-ui", "sans-serif"],
});

export const metadata = {
  title: "Oplyra",
  description: "Sua operação de marketing, da estratégia à receita.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const rotulo = rotuloAmbiente();
  return (
    <html lang="pt-BR" className={`${inter.variable} ${manrope.variable}`}>
      <body>
        <header style={{ borderBottom: "1px solid var(--line)", padding: ".9rem 1.25rem" }}>
          <strong style={{ fontFamily: "Manrope, Inter, sans-serif", letterSpacing: "-.02em" }}>Oplyra</strong>
          {rotulo && <span className="muted" style={{ marginLeft: ".6rem" }}>{rotulo}</span>}
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
