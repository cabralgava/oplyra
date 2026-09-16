import type { Deps } from "../ports.ts";
import type { TenantId, UserId, MembershipId } from "../../domain/ids.ts";
import { normalizarSlug, normalizarEmail } from "../../domain/entities.ts";
import { SlugAlreadyTaken, OperatorNotAuthorized } from "../../domain/errors.ts";

export type ProvisionTenantInput = {
  name: string; slug: string; ownerEmail: string; reason: string; operatorId: UserId;
};
export type ProvisionTenantOutput = { tenantId: TenantId; ownerMembershipId: MembershipId };

/**
 * Único caminho para criar uma empresa. Roda com o papel do operador da
 * plataforma, exige motivo e grava auditoria na MESMA transação do efeito.
 */
export async function provisionTenant(deps: Deps, entrada: ProvisionTenantInput): Promise<ProvisionTenantOutput> {
  if (!entrada.reason?.trim()) throw new OperatorNotAuthorized("motivo é obrigatório");
  if (!deps.authAdmin) throw new OperatorNotAuthorized("provisionamento exige identidade de operador");

  const slug = normalizarSlug(entrada.slug);
  const email = normalizarEmail(entrada.ownerEmail);
  const ownerId = await deps.authAdmin.ensureUser(email);

  return deps.uow.withOperatorTransaction(entrada.operatorId, entrada.reason, async (tx) => {
    if (await deps.tenants.findBySlug(tx, slug)) throw new SlugAlreadyTaken(`"${slug}" já está em uso`);

    const tenant = await deps.tenants.create(tx, { name: entrada.name.trim(), slug });
    const vinculo = await deps.memberships.add(tx, { tenantId: tenant.id, userId: ownerId, roleKey: "owner" });

    await deps.audit.record(tx, {
      tenantId: tenant.id, actorType: "operator", actorId: entrada.operatorId,
      action: "tenant.provision", target: tenant.id,
      after: { slug, name: tenant.name, owner: email }, reason: entrada.reason,
    });
    return { tenantId: tenant.id, ownerMembershipId: vinculo.id };
  });
}
