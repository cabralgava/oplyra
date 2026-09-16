import type { TenantId, UserId, MembershipId, InvitationId } from "./ids.ts";
import type { RoleKey } from "./roles.ts";
import { InvalidSlug, InvalidEmail, InvitationAlreadyUsed, InvitationExpired } from "./errors.ts";

export type Tenant = {
  readonly id: TenantId; readonly name: string; readonly slug: string;
  readonly status: "active" | "suspended"; readonly timezone: string; readonly locale: string;
};

export type Membership = {
  readonly id: MembershipId; readonly tenantId: TenantId; readonly userId: UserId;
  readonly roleKey: RoleKey; readonly status: "active" | "revoked";
};

export type Invitation = {
  readonly id: InvitationId; readonly tenantId: TenantId; readonly email: string;
  readonly roleKey: RoleKey; readonly expiresAt: Date;
  readonly status: "pending" | "accepted" | "revoked";
};

export type TenantSummary = { readonly tenantId: TenantId; readonly name: string; readonly roleKey: RoleKey };

const SLUG = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;
export function normalizarSlug(bruto: string): string {
  const s = bruto.trim().toLowerCase();
  if (!SLUG.test(s)) throw new InvalidSlug(`identificador inválido: "${bruto}"`);
  return s;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function normalizarEmail(bruto: string): string {
  const e = bruto.trim().toLowerCase();
  if (!EMAIL.test(e)) throw new InvalidEmail(`e-mail inválido: "${bruto}"`);
  return e;
}

/** Um convite só vale enquanto está pendente e dentro do prazo. */
export function convitePodeSerAceito(convite: Invitation, agora: Date): void {
  if (convite.status === "accepted") throw new InvitationAlreadyUsed();
  if (convite.expiresAt <= agora) throw new InvitationExpired();
}
