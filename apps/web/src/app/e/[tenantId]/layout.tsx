import type { ReactNode } from "react";
import { NavEmpresa } from "../../../components/nav-empresa";

/** Moldura das seções da empresa. A autorização continua em cada página (contextoDaEmpresa); aqui só há navegação. */
export default async function EmpresaLayout({ children, params }: { children: ReactNode; params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  return (
    <div className="pilha">
      <NavEmpresa tenantId={tenantId} />
      {children}
    </div>
  );
}
