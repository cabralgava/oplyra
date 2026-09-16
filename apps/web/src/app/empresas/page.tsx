import Link from "next/link";
import { redirect } from "next/navigation";
import { exigirClaims, encerrarSessao } from "../../lib/session";
import { deps } from "../../lib/deps";
import { listMyTenants } from "@oplyra/core";
import { BotaoEnviar } from "../../components/botao-enviar";

export default async function Empresas({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const claims = await exigirClaims();
  const { erro } = await searchParams;
  const empresas = await listMyTenants(deps, claims.userId);

  async function sair() {
    "use server";
    await encerrarSessao();
    redirect("/entrar");
  }

  return (
    <div className="pilha">
      <div className="entre">
        <h1>Suas empresas</h1>
        <form action={sair}><BotaoEnviar variante="secundario" rotuloEmEspera="Saindo…">Sair</BotaoEnviar></form>
      </div>

      {erro === "sem-acesso" && (
        <p className="erro">Você não tem mais acesso a essa empresa.</p>
      )}

      {empresas.length === 0 ? (
        <div className="card vazio">
          <p>Nenhuma empresa vinculada a este acesso.</p>
          <p className="muted">Peça um convite a quem administra a empresa, ou fale com o operador da plataforma.</p>
        </div>
      ) : (
        <div className="card">
          <table>
            <thead><tr><th scope="col">Empresa</th><th scope="col">Seu papel</th><th /></tr></thead>
            <tbody>
              {empresas.map((e) => (
                <tr key={e.tenantId}>
                  <td>{e.name}</td>
                  <td><span className="selo">{e.roleKey}</span></td>
                  <td style={{ textAlign: "right" }}>
                    <Link className="btn secundario" href={`/e/${e.tenantId}/equipe`}>Abrir equipe</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
