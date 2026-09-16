import type { Deps } from "../ports.ts";
import type { TenantId, UserId, MembershipId } from "../../domain/ids.ts";
import { normalizarEmail } from "../../domain/entities.ts";
import {
  InvitationNotFound, InvitationExpired, InvitationAlreadyUsed, EmailMismatch, MemberAlreadyActive,
} from "../../domain/errors.ts";

export type AcceptInvitationInput = { userId: UserId; email: string; rawToken: string };
export type AcceptInvitationOutput = { tenantId: TenantId; membershipId: MembershipId };

/**
 * Quem aceita ainda não tem vínculo, então a autorização é o próprio token.
 * O adapter usa uma função de escopo mínimo no banco; os erros dela viram
 * erros de domínio aqui.
 */
export async function acceptInvitation(deps: Deps, entrada: AcceptInvitationInput): Promise<AcceptInvitationOutput> {
  const email = normalizarEmail(entrada.email);
  const hash = deps.tokens.hash(entrada.rawToken);

  // Sem empresa ativa: o convite é que determina a empresa.
  return deps.uow.withIdentityTransaction(entrada.userId, async (tx) => {
    try {
      return await deps.invitations.accept(tx, hash, email);
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : String(e);
      if (/inexistente|no_data_found/i.test(m)) throw new InvitationNotFound();
      if (/expirado/i.test(m)) throw new InvitationExpired();
      if (/outro e-mail/i.test(m)) throw new EmailMismatch();
      if (/já existe vínculo/i.test(m)) throw new MemberAlreadyActive();
      if (/já utilizado/i.test(m)) throw new InvitationAlreadyUsed();
      throw e;
    }
  });
}
