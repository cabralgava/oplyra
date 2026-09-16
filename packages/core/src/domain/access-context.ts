import type { TenantId, UserId, MembershipId } from "./ids.ts";
import type { RoleKey, PermissionKey } from "./roles.ts";
import { PermissionDenied } from "./errors.ts";

/**
 * Contexto de autorização de uma operação. É montado no servidor a partir de
 * um JWT já verificado MAIS a consulta do vínculo ao vivo — nunca a partir de
 * papéis vindos do token. O tenant ativo faz parte dele: foi o que faltou na
 * primeira versão do EXP-01 e permitiu vazamento entre empresas.
 */
export type AccessContext = {
  readonly userId: UserId;
  readonly tenantId: TenantId;
  readonly membershipId: MembershipId;
  readonly roleKey: RoleKey;
  readonly permissions: ReadonlySet<PermissionKey>;
  readonly resolvedAt: Date;
};

export function exigirPermissao(ctx: AccessContext, permissao: PermissionKey): void {
  if (!ctx.permissions.has(permissao)) throw new PermissionDenied();
}
