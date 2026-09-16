import type { Deps } from "../ports.ts";
import type { MembershipId, UserId } from "../../domain/ids.ts";
import type { AccessContext } from "../../domain/access-context.ts";
import { exigirPermissao } from "../../domain/access-context.ts";
import { type RoleKey, podeConceder } from "../../domain/roles.ts";
import type { TenantSummary } from "../../domain/entities.ts";
import {
  MembershipNotFound, RoleExceedsActorRole, LastOwnerCannotBeDemoted, LastOwnerCannotBeRemoved,
} from "../../domain/errors.ts";

export async function listMyTenants(deps: Deps, userId: UserId): Promise<TenantSummary[]> {
  // Leitura por identidade, sem empresa ativa: é a tela que permite escolher uma.
  return deps.uow.withIdentityTransaction(userId, (tx) => deps.memberships.listActiveByUser(tx));
}

export async function changeMemberRole(
  deps: Deps, { ctx, membershipId, roleKey }: { ctx: AccessContext; membershipId: MembershipId; roleKey: RoleKey },
): Promise<void> {
  exigirPermissao(ctx, "member.role.change");
  if (!podeConceder(ctx.roleKey, roleKey)) throw new RoleExceedsActorRole();

  await deps.uow.withUserTransaction(ctx, async (tx) => {
    const alvo = await deps.memberships.findById(tx, ctx.tenantId, membershipId);
    if (!alvo || alvo.status !== "active") throw new MembershipNotFound();
    if (alvo.roleKey === roleKey) return;

    // Rebaixar o último Owner deixaria a empresa sem dono.
    if (alvo.roleKey === "owner" && roleKey !== "owner") {
      if (await deps.memberships.countActiveOwners(tx, ctx.tenantId) <= 1) throw new LastOwnerCannotBeDemoted();
    }

    await deps.memberships.changeRole(tx, ctx.tenantId, membershipId, roleKey);
    await deps.audit.record(tx, {
      tenantId: ctx.tenantId, actorType: "user", actorId: ctx.userId, action: "member.role.change",
      target: membershipId, before: { roleKey: alvo.roleKey }, after: { roleKey },
    });
  });
}

export async function removeMember(
  deps: Deps, { ctx, membershipId, reason }: { ctx: AccessContext; membershipId: MembershipId; reason: string },
): Promise<void> {
  exigirPermissao(ctx, "member.remove");

  await deps.uow.withUserTransaction(ctx, async (tx) => {
    const alvo = await deps.memberships.findById(tx, ctx.tenantId, membershipId);
    if (!alvo || alvo.status !== "active") throw new MembershipNotFound();

    if (alvo.roleKey === "owner") {
      if (await deps.memberships.countActiveOwners(tx, ctx.tenantId) <= 1) throw new LastOwnerCannotBeRemoved();
    }

    await deps.memberships.revoke(tx, ctx.tenantId, membershipId);
    await deps.audit.record(tx, {
      tenantId: ctx.tenantId, actorType: "user", actorId: ctx.userId, action: "member.remove",
      target: membershipId, before: { roleKey: alvo.roleKey, status: "active" }, after: { status: "revoked" }, reason,
    });
  });
}

export async function checkCapability(deps: Deps, ctx: AccessContext, capability: string): Promise<boolean> {
  return deps.entitlements.can(ctx, capability);
}
