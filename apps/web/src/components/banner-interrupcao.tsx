import Link from "next/link";
import { contextoDaEmpresa } from "../lib/session";
import { runtimeDeps } from "../lib/deps-runtime";
import { getKillSwitchStatus } from "../lib/execucoes";

/**
 * Banner persistente enquanto a IA da empresa está interrompida (14 F-10). Mostra-se em todas as seções da empresa.
 * Quem não pode ver execuções não vê o banner; falha ao consultar nunca derruba a página (a tela de execuções mostra o erro).
 */
export async function BannerInterrupcao({ tenantId }: { tenantId: string }) {
  let estado: Awaited<ReturnType<typeof getKillSwitchStatus>> = null;
  try {
    const ctx = await contextoDaEmpresa(tenantId);
    if (!ctx.permissions.has("runtime.read")) return null;
    estado = await getKillSwitchStatus(runtimeDeps, ctx);
  } catch {
    return null;
  }
  if (!estado?.active) return null;
  return (
    <div className="erro" role="status" data-testid="banner-interrupcao">
      <p>
        <strong>{estado.scope === "global" ? "A IA está interrompida para toda a plataforma." : "A IA desta empresa está interrompida."}</strong>{" "}
        Nenhuma execução nova começa. Motivo: {estado.reason}.{" "}
        <Link href={`/e/${encodeURIComponent(tenantId)}/execucoes`}>Ver execuções</Link>
      </p>
    </div>
  );
}
