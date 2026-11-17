import "./globals.css";
import type { ReactNode } from "react";
import { rotuloAmbiente } from "../lib/rotulo-ambiente";

export const metadata = {
  title: "Oplyra",
  description: "Sua operação de marketing, da estratégia à receita.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const rotulo = rotuloAmbiente();
  return (
    <html lang="pt-BR">
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
