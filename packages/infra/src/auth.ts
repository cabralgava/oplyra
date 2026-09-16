import { createRemoteJWKSet, jwtVerify } from "jose";
import { comoCliente } from "./db.ts";
import type { AuthGateway, VerifiedClaims, AccessContextResolver, Tx, UnitOfWork } from "@oplyra/core";
import type { AccessContext } from "@oplyra/core";
import type { UserId, TenantId, MembershipId } from "@oplyra/core";
import type { RoleKey, PermissionKey } from "@oplyra/core";
import { MembershipNotFound } from "@oplyra/core";

/** Fronteira de autenticação: assinatura assimétrica verificada por JWKS. */
export function criarAuthGateway(jwksUrl: string, issuer: string): AuthGateway {
  const jwks = createRemoteJWKSet(new URL(jwksUrl));
  return {
    async verifyAccessToken(bruto) {
      const { payload } = await jwtVerify(bruto, jwks, { issuer });
      if (!payload.sub) throw new Error("token sem sub");
      return { userId: payload.sub as UserId, email: String(payload.email ?? "") } satisfies VerifiedClaims;
    },
  };
}

/**
 * Monta o AccessContext consultando o vínculo AO VIVO. Papel e permissões
 * nunca vêm do token: vínculo revogado deixa de valer na requisição seguinte.
 */
export function criarAccessContextResolver(uow: UnitOfWork): AccessContextResolver {
  return {
    async resolve(claims, tenantId: TenantId): Promise<AccessContext> {
      return uow.withIdentityTransaction(claims.userId, async (tx: Tx) => {
        const { rows } = await comoCliente(tx).query(
          `select membership_id, role_key, permissions from core.resolve_access_context($1)`, [tenantId]);

        const linha = rows[0] as { membership_id: string; role_key: RoleKey; permissions: string[] } | undefined;
        // Sem vínculo ativo e vínculo inexistente devolvem o mesmo erro: a
        // resposta não revela que a empresa existe.
        if (!linha) throw new MembershipNotFound();

        return {
          userId: claims.userId, tenantId,
          membershipId: linha.membership_id as MembershipId,
          roleKey: linha.role_key,
          permissions: new Set(linha.permissions) as ReadonlySet<PermissionKey>,
          resolvedAt: new Date(),
        };
      });
    },
  };
}
