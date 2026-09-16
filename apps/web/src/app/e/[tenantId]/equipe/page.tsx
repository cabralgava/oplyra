import Link from "next/link";
import { revalidatePath } from "next/cache";
import { contextoDaEmpresa } from "../../../../lib/session";
import { deps } from "../../../../lib/deps";
import { redirect } from "next/navigation";
import { inviteMember, removeMember, DomainError } from "@oplyra/core";
import { lerEquipe } from "../../../../lib/consultas";
import type { RoleKey, MembershipId } from "@oplyra/core";
import { BotaoEnviar } from "../../../../components/botao-enviar";

type Props = { params: Promise<{ tenantId: string }>; searchParams: Promise<{ erro?: string; convite?: string }> };

export default async function Equipe({ params, searchParams }: Props) {
  const { tenantId } = await params;
  const { erro, convite } = await searchParams;
  const ctx = await contextoDaEmpresa(tenantId);
  const { empresa, membros } = await lerEquipe(ctx);

  const podeConvidar = ctx.permissions.has("member.invite");
  const podeRemover = ctx.permissions.has("member.remove");

  async function convidar(dados: FormData) {
    "use server";
    const contexto = await contextoDaEmpresa(tenantId);
    try {
      const r = await inviteMember(deps, {
        ctx: contexto,
        email: String(dados.get("email") ?? ""),
        roleKey: String(dados.get("papel") ?? "viewer") as RoleKey,
      });
      revalidatePath(`/e/${tenantId}/equipe`);
      // O token aparece uma única vez: só existe aqui.
      redirect(`/e/${tenantId}/equipe?convite=${encodeURIComponent(r.token)}`);
    } catch (e) {
      if (isRedirect(e)) throw e;
      const codigo = e instanceof DomainError ? e.code : "ERRO";
      redirect(`/e/${tenantId}/equipe?erro=${codigo}`);
    }
  }

  async function remover(dados: FormData) {
    "use server";
    const contexto = await contextoDaEmpresa(tenantId);
    try {
      await removeMember(deps, {
        ctx: contexto,
        membershipId: String(dados.get("vinculo") ?? "") as MembershipId,
        reason: "remoção pela tela de equipe",
      });
      revalidatePath(`/e/${tenantId}/equipe`);
    } catch (e) {
      if (isRedirect(e)) throw e;
      const codigo = e instanceof DomainError ? e.code : "ERRO";
      redirect(`/e/${tenantId}/equipe?erro=${codigo}`);
    }
  }

  return (
    <div className="pilha">
      <div className="entre">
        <div>
          <h1>{empresa?.name ?? "Empresa"}</h1>
          <p className="muted">Você está como <strong>{ctx.roleKey}</strong>.</p>
        </div>
        <Link className="btn secundario" href="/empresas">Trocar de empresa</Link>
      </div>

      {erro && <p className="erro">{mensagem(erro)}</p>}
      {convite && (
        <div className="aviso">
          <strong>Convite criado.</strong> Copie o link agora: ele não será exibido de novo.
          <div><code>/convite?token={convite}</code></div>
        </div>
      )}

      <div className="card">
        <h2>Equipe</h2>
        {membros.length === 0 ? (
          <p className="vazio">Ninguém além de você por aqui ainda.</p>
        ) : (
          <table>
            <thead><tr><th scope="col">Pessoa</th><th scope="col">Papel</th><th scope="col">Situação</th><th /></tr></thead>
            <tbody>
              {membros.map((m) => (
                <tr key={m.id}>
                  <td><code className="muted">{m.userId.slice(0, 8)}…</code></td>
                  <td><span className="selo">{m.roleKey}</span></td>
                  <td><span className={m.status === "active" ? "selo" : "selo revogado"}>{m.status === "active" ? "ativo" : "revogado"}</span></td>
                  <td style={{ textAlign: "right" }}>
                    {podeRemover && m.status === "active" && (
                      <form action={remover}>
                        <input type="hidden" name="vinculo" value={m.id} />
                        <BotaoEnviar variante="secundario" rotuloEmEspera="Removendo…">Remover</BotaoEnviar>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Convidar pessoa</h2>
        {podeConvidar ? (
          <form action={convidar} className="pilha">
            <div>
              <label htmlFor="email">E-mail</label>
              <input id="email" name="email" type="email" required />
            </div>
            <div>
              <label htmlFor="papel">Papel</label>
              <select id="papel" name="papel" defaultValue="viewer">
                <option value="viewer">Leitura</option>
                <option value="marketing_manager">Gestor de Marketing</option>
                <option value="admin">Administrador</option>
                <option value="owner">Owner</option>
              </select>
            </div>
            <BotaoEnviar rotuloEmEspera="Gerando…">Gerar convite</BotaoEnviar>
          </form>
        ) : (
          <p className="muted">Seu papel não permite convidar pessoas. Peça a quem administra a empresa.</p>
        )}
      </div>
    </div>
  );
}

function mensagem(codigo: string): string {
  const mapa: Record<string, string> = {
    PERMISSION_DENIED: "Seu papel não permite esta ação.",
    ROLE_EXCEEDS_INVITER_ROLE: "Não é possível conceder um papel acima do seu.",
    MEMBER_ALREADY_ACTIVE: "Já existe vínculo ativo ou convite pendente para este e-mail.",
    INVALID_EMAIL: "E-mail inválido.",
    LAST_OWNER_CANNOT_BE_REMOVED: "A empresa ficaria sem Owner ativo.",
    MEMBERSHIP_NOT_FOUND: "Vínculo não encontrado.",
  };
  return mapa[codigo] ?? "Não foi possível concluir a ação.";
}

/** redirect() do Next sinaliza por exceção: ela não pode ser tratada como falha. */
function isRedirect(e: unknown): boolean {
  return typeof e === "object" && e !== null && "digest" in e &&
    String((e as { digest?: unknown }).digest ?? "").startsWith("NEXT_REDIRECT");
}
