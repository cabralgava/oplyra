import type { Deps } from "../ports.ts";
import type { InvitationId } from "../../domain/ids.ts";
import type { AccessContext } from "../../domain/access-context.ts";
import { exigirPermissao } from "../../domain/access-context.ts";
import { type RoleKey, podeConceder } from "../../domain/roles.ts";
import { normalizarEmail } from "../../domain/entities.ts";
import { RoleExceedsInviterRole, MemberAlreadyActive } from "../../domain/errors.ts";

export type InviteMemberInput = { ctx: AccessContext; email: string; roleKey: RoleKey };
export type InviteMemberOutput = { invitationId: InvitationId; expiresAt: Date; token: string };

const VALIDADE_DIAS = 7;

/** O convite expira, vale uma vez e nunca concede papel acima do convidante. */
export async function inviteMember(deps: Deps, { ctx, email, roleKey }: InviteMemberInput): Promise<InviteMemberOutput> {
  exigirPermissao(ctx, "member.invite");
  if (!podeConceder(ctx.roleKey, roleKey)) throw new RoleExceedsInviterRole();

  const destino = normalizarEmail(email);
  const { bruto, hash } = deps.tokens.gerar();
  const expiresAt = new Date(deps.clock.now().getTime() + VALIDADE_DIAS * 86_400_000);

  return deps.uow.withUserTransaction(ctx, async (tx) => {
    const convite = await deps.invitations.create(tx, {
      tenantId: ctx.tenantId, email: destino, roleKey, tokenHash: hash, expiresAt, invitedBy: ctx.userId,
    }).catch((e: unknown) => {
      // Vínculo ativo ou convite pendente para o mesmo e-mail colidem no índice.
      if (e instanceof Error && /unique|duplicate/i.test(e.message)) throw new MemberAlreadyActive();
      throw e;
    });

    await deps.audit.record(tx, {
      tenantId: ctx.tenantId, actorType: "user", actorId: ctx.userId,
      action: "member.invite", target: convite.id, after: { email: destino, roleKey },
    });
    // O token bruto sai uma única vez, aqui. Persistimos apenas o hash.
    return { invitationId: convite.id, expiresAt, token: bruto };
  });
}
