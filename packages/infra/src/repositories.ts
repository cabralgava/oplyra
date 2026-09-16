import { randomBytes, createHash } from "node:crypto";
import { comoCliente } from "./db.ts";
import type {
  Tx, TenantRepository, MembershipRepository, InvitationRepository, AuditLogPort,
  EntitlementsPort, Clock, TokenGenerator, StorageGateway,
} from "@oplyra/core";
import type { TenantId, MembershipId, InvitationId } from "@oplyra/core";
import type { Tenant, Membership, Invitation, TenantSummary } from "@oplyra/core";
import type { RoleKey } from "@oplyra/core";
import type { AccessContext } from "@oplyra/core";

export const tenantRepository: TenantRepository = {
  async create(tx, e) {
    const { rows } = await comoCliente(tx).query(
      `insert into core.tenants (name, slug, plan_key) values ($1,$2,$3)
       returning id, name, slug, status, timezone, locale`, [e.name, e.slug, e.planKey ?? null]);
    return rows[0] as Tenant;
  },
  async findBySlug(tx, slug) {
    const { rows } = await comoCliente(tx).query(
      `select id, name, slug, status, timezone, locale from core.tenants where slug = $1`, [slug]);
    return (rows[0] as Tenant | undefined) ?? null;
  },
  async findById(tx, id) {
    const { rows } = await comoCliente(tx).query(
      `select id, name, slug, status, timezone, locale from core.tenants where id = $1`, [id]);
    return (rows[0] as Tenant | undefined) ?? null;
  },
};

export const membershipRepository: MembershipRepository = {
  async findActive(tx, userId, tenantId) {
    const { rows } = await comoCliente(tx).query(
      `select id, tenant_id as "tenantId", user_id as "userId", role_key as "roleKey", status
         from core.memberships where user_id = $1 and tenant_id = $2 and status = 'active'`, [userId, tenantId]);
    return (rows[0] as Membership | undefined) ?? null;
  },
  async findById(tx, tenantId, id) {
    const { rows } = await comoCliente(tx).query(
      `select id, tenant_id as "tenantId", user_id as "userId", role_key as "roleKey", status
         from core.memberships where tenant_id = $1 and id = $2`, [tenantId, id]);
    return (rows[0] as Membership | undefined) ?? null;
  },
  async listActiveByUser(tx) {
    // Função de escopo mínimo: devolve só as empresas de quem chamou.
    const { rows } = await comoCliente(tx).query(
      `select tenant_id as "tenantId", name, role_key as "roleKey" from core.my_tenants()`);
    return rows as TenantSummary[];
  },
  async countActiveOwners(tx, tenantId) {
    const { rows } = await comoCliente(tx).query(
      `select count(*)::int c from core.memberships
        where tenant_id = $1 and role_key = 'owner' and status = 'active'`, [tenantId]);
    return (rows[0] as { c: number }).c;
  },
  async add(tx, e) {
    const { rows } = await comoCliente(tx).query(
      `insert into core.memberships (tenant_id, user_id, role_key) values ($1,$2,$3)
       returning id, tenant_id as "tenantId", user_id as "userId", role_key as "roleKey", status`,
      [e.tenantId, e.userId, e.roleKey]);
    return rows[0] as Membership;
  },
  async changeRole(tx, tenantId, id, roleKey) {
    await comoCliente(tx).query(
      `update core.memberships set role_key = $3 where tenant_id = $1 and id = $2`, [tenantId, id, roleKey]);
  },
  async revoke(tx, tenantId, id) {
    await comoCliente(tx).query(
      `update core.memberships set status = 'revoked', revoked_at = now()
        where tenant_id = $1 and id = $2`, [tenantId, id]);
  },
  async permissionsOf(tx, roleKey: RoleKey) {
    const { rows } = await comoCliente(tx).query(
      `select permission_key from core.role_permissions where role_key = $1`, [roleKey]);
    return (rows as { permission_key: string }[]).map((r) => r.permission_key);
  },
};

export const invitationRepository: InvitationRepository = {
  async create(tx, e) {
    const { rows } = await comoCliente(tx).query(
      `insert into core.invitations (tenant_id, email, role_key, token_hash, expires_at, invited_by)
       values ($1,$2,$3,$4,$5,$6)
       returning id, tenant_id as "tenantId", email, role_key as "roleKey", expires_at as "expiresAt", status`,
      [e.tenantId, e.email, e.roleKey, e.tokenHash, e.expiresAt, e.invitedBy]);
    return rows[0] as Invitation;
  },
  async accept(tx, tokenHash, email) {
    const { rows } = await comoCliente(tx).query(
      `select tenant_id as "tenantId", membership_id as "membershipId" from core.accept_invitation($1,$2)`,
      [tokenHash, email]);
    return rows[0] as { tenantId: TenantId; membershipId: MembershipId };
  },
};

export const auditLog: AuditLogPort = {
  async record(tx, e) {
    await comoCliente(tx).query(
      `insert into core.audit_log (tenant_id, actor_type, actor_id, action, target, before, after, reason, correlation_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [e.tenantId, e.actorType, e.actorId ?? null, e.action, e.target ?? null,
       e.before ? JSON.stringify(e.before) : null, e.after ? JSON.stringify(e.after) : null,
       e.reason ?? null, e.correlationId ?? null]);
  },
};

export const entitlements: EntitlementsPort = {
  async can(_ctx, _capability) { throw new Error("use criarEntitlements(uow)"); },
};

export function criarEntitlements(uow: { withUserTransaction<T>(c: AccessContext, f: (tx: Tx) => Promise<T>): Promise<T> }): EntitlementsPort {
  return {
    async can(ctx, capability) {
      // A verificação é no backend e passa pela RLS: chamada direta de um
      // cliente sem a capacidade contratada continua negada.
      return uow.withUserTransaction(ctx, async (tx) => {
        const { rows } = await comoCliente(tx).query(
          `select 1 from core.tenant_entitlements
            where tenant_id = $1 and capability_key = $2
              and (valid_until is null or valid_until > now())`, [ctx.tenantId, capability]);
        return rows.length > 0;
      });
    },
  };
}

export const relogio: Clock = { now: () => new Date() };

export const geradorDeToken: TokenGenerator = {
  gerar() {
    const bruto = randomBytes(32).toString("base64url");
    return { bruto, hash: createHash("sha256").update(bruto).digest("hex") };
  },
  hash: (bruto) => createHash("sha256").update(bruto).digest("hex"),
};

/** Recusa qualquer caminho fora do prefixo da empresa do contexto. */
export function criarStorageGateway(supabaseUrl: string): StorageGateway {
  return {
    async signedUrlForTenantPath(ctx: AccessContext, caminho: string) {
      const limpo = caminho.replace(/^\/+/, "");
      if (!limpo.startsWith(`${ctx.tenantId}/`)) {
        throw new Error(`caminho fora do prefixo da empresa: ${limpo}`);
      }
      return `${supabaseUrl}/storage/v1/object/tenant-assets/${limpo}`;
    },
  };
}
