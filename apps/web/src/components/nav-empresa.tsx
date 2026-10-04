"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Navegação entre as seções da empresa. Marca a seção atual com aria-current, sem depender só
 * de cor. Adaptação provisória à sidebar do guia (DP-35: frames do Figma ainda não inspecionados):
 * abaixo de 48rem os itens quebram em linhas, sem rolagem horizontal.
 */
export function NavEmpresa({ tenantId }: { tenantId: string }) {
  const caminho = usePathname();
  const base = `/e/${encodeURIComponent(tenantId)}`;
  const itens = [
    { href: base, rotulo: "Início", exato: true },
    { href: `${base}/marca`, rotulo: "Marca", exato: false },
    { href: `${base}/equipe`, rotulo: "Equipe", exato: false },
  ];
  return (
    <nav aria-label="Seções da empresa" className="nav-secoes">
      <ul>
        {itens.map((i) => {
          const ativo = i.exato ? caminho === i.href : caminho === i.href || caminho.startsWith(`${i.href}/`);
          return (
            <li key={i.href}>
              <Link href={i.href} aria-current={ativo ? "page" : undefined} className={ativo ? "ativo" : undefined}>{i.rotulo}</Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
