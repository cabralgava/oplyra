import { redirect } from "next/navigation";
import { exigirClaims } from "../../lib/session";
import { deps } from "../../lib/deps";
import { acceptInvitation, DomainError } from "@oplyra/core";
import { BotaoEnviar } from "../../components/botao-enviar";

type Props = { searchParams: Promise<{ token?: string; erro?: string }> };

export default async function Convite({ searchParams }: Props) {
  const { token, erro } = await searchParams;
  const claims = await exigirClaims();

  async function aceitar(dados: FormData) {
    "use server";
    const atual = await exigirClaims();
    const bruto = String(dados.get("token") ?? "");
    try {
      const r = await acceptInvitation(deps, { userId: atual.userId, email: atual.email, rawToken: bruto });
      redirect(`/e/${r.tenantId}/equipe`);
    } catch (e) {
      if (typeof e === "object" && e !== null && "digest" in e &&
          String((e as { digest?: unknown }).digest ?? "").startsWith("NEXT_REDIRECT")) throw e;
      redirect(`/convite?token=${encodeURIComponent(bruto)}&erro=${e instanceof DomainError ? e.code : "ERRO"}`);
    }
  }

  return (
    <div className="pilha">
      <h1>Aceitar convite</h1>
      <p className="muted">Você está autenticada como <strong>{claims.email || claims.userId}</strong>.</p>

      {erro && <p className="erro">{mensagem(erro)}</p>}

      {!token ? (
        <div className="card vazio">
          <p>Nenhum convite informado.</p>
          <p className="muted">Abra o link que você recebeu de quem administra a empresa.</p>
        </div>
      ) : (
        <form action={aceitar} className="card pilha">
          <p>O convite concede acesso a uma empresa com o papel definido por quem convidou.</p>
          <input type="hidden" name="token" value={token} />
          <BotaoEnviar rotuloEmEspera="Aceitando…">Aceitar convite</BotaoEnviar>
        </form>
      )}
    </div>
  );
}

function mensagem(codigo: string): string {
  const mapa: Record<string, string> = {
    INVITATION_NOT_FOUND: "Convite inexistente ou já utilizado.",
    INVITATION_EXPIRED: "Este convite expirou. Peça um novo.",
    EMAIL_MISMATCH: "Este convite foi emitido para outro e-mail.",
    MEMBER_ALREADY_ACTIVE: "Você já tem vínculo ativo nesta empresa.",
  };
  return mapa[codigo] ?? "Não foi possível aceitar o convite.";
}
