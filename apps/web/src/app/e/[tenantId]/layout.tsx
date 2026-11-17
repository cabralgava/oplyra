import type { ReactNode } from "react";
import Link from "next/link";
import { NavEmpresa } from "../../../components/nav-empresa";
import { BannerInterrupcao } from "../../../components/banner-interrupcao";
import { contextoDaEmpresa, exigirClaims } from "../../../lib/session";
import { lerEmpresa } from "../../../lib/consultas";
import { deps } from "../../../lib/deps";
import { rotuloAmbiente } from "../../../lib/rotulo-ambiente";
import { listMyTenants } from "@oplyra/core";

/**
 * Moldura das seções da empresa (sidebar + topbar, 14 §2). A autorização continua em cada página;
 * aqui o contexto só identifica empresa e papel para o seletor. Busca e notificações ainda não
 * têm capacidade: ficam desabilitadas e dizem isso.
 */
export default async function EmpresaLayout({ children, params }: { children: ReactNode; params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const ctx = await contextoDaEmpresa(tenantId);
  const empresa = await lerEmpresa(ctx);
  const claims = await exigirClaims();
  const minhas = await listMyTenants(deps, claims.userId);
  const base = `/e/${encodeURIComponent(tenantId)}`;
  return (
    <div className="shell">
      <a className="skip-link" href="#conteudo-principal">Pular para o conteúdo</a>
      <NavEmpresa tenantId={tenantId} />
      <div className="shell-main">
        <div className="topbar">
          <details className="seletor-menu">
            <summary className="seletor-empresa" aria-label={`Empresa atual: ${empresa?.name ?? "Empresa"} (${ctx.roleKey}). Escolher empresa`}>
              <span className="avatar-empresa" aria-hidden="true">{(empresa?.name ?? "E").slice(0, 1).toUpperCase()}</span>
              <span><strong>{empresa?.name ?? "Empresa"}</strong><small>{ctx.roleKey}</small></span>
            </summary>
            <ul className="seletor-lista" aria-label="Suas empresas">
              {minhas.map((e) => (
                <li key={e.tenantId}>
                  <Link href={`/e/${e.tenantId}`} aria-current={e.tenantId === tenantId ? "true" : undefined}>
                    <strong>{e.name}</strong> <span className="muted">{e.roleKey}</span>
                  </Link>
                </li>
              ))}
              <li><Link href="/empresas">Ver todas as empresas</Link></li>
            </ul>
          </details>
          <input className="busca-topbar" type="search" disabled placeholder="Buscar na operação…" aria-label="Buscar na operação (ainda não disponível)" title="Busca ainda não disponível" />
          <Link className="btn secundario" href={`${base}/execucoes`}>Execuções e escalonamentos</Link>
          {rotuloAmbiente() && <span className="selo-ambiente" role="note">{rotuloAmbiente()}</span>}
        </div>
        <div id="conteudo-principal" tabIndex={-1} className="shell-conteudo pilha">
          <BannerInterrupcao tenantId={tenantId} />
          {children}
        </div>
      </div>
    </div>
  );
}
