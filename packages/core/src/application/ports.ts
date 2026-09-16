// Portas internas. A infraestrutura as implementa; domínio e casos de uso
// nunca importam SDK, HTTP ou SQL.
import type { TenantId, UserId, MembershipId, InvitationId } from "../domain/ids.ts";
import type { RoleKey } from "../domain/roles.ts";
import type { AccessContext } from "../domain/access-context.ts";
import type { Tenant, Membership, Invitation, TenantSummary } from "../domain/entities.ts";

/** Handle de transação. O domínio não sabe o que há dentro. */
export type Tx = { readonly __tx: unique symbol } | object;

export type VerifiedClaims = { readonly userId: UserId; readonly email: string };

export interface UnitOfWork {
  withUserTransaction<T>(ctx: AccessContext, fn: (tx: Tx) => Promise<T>): Promise<T>;
  /**
   * Só identidade, sem empresa ativa. Existe para as duas operações que
   * acontecem antes de haver empresa: listar as próprias e aceitar convite.
   */
  withIdentityTransaction<T>(userId: UserId, fn: (tx: Tx) => Promise<T>): Promise<T>;
  withWorkerTransaction<T>(tenantId: TenantId, jobRef: string, fn: (tx: Tx) => Promise<T>): Promise<T>;
  withOperatorTransaction<T>(operadorId: UserId, motivo: string, fn: (tx: Tx) => Promise<T>): Promise<T>;
}

export interface AuthGateway {
  /** Verifica assinatura, emissor e validade. Token inválido nunca vira claims. */
  verifyAccessToken(bruto: string): Promise<VerifiedClaims>;
}

export interface AccessContextResolver {
  resolve(claims: VerifiedClaims, tenantId: TenantId): Promise<AccessContext>;
}

export interface TenantRepository {
  create(tx: Tx, entrada: { name: string; slug: string; planKey?: string }): Promise<Tenant>;
  findBySlug(tx: Tx, slug: string): Promise<Tenant | null>;
  findById(tx: Tx, id: TenantId): Promise<Tenant | null>;
}

export interface MembershipRepository {
  findActive(tx: Tx, userId: UserId, tenantId: TenantId): Promise<Membership | null>;
  findById(tx: Tx, tenantId: TenantId, id: MembershipId): Promise<Membership | null>;
  listActiveByUser(tx: Tx): Promise<TenantSummary[]>;
  listByTenant(tx: Tx, tenantId: TenantId): Promise<Membership[]>;
  countActiveOwners(tx: Tx, tenantId: TenantId): Promise<number>;
  add(tx: Tx, entrada: { tenantId: TenantId; userId: UserId; roleKey: RoleKey }): Promise<Membership>;
  changeRole(tx: Tx, tenantId: TenantId, id: MembershipId, roleKey: RoleKey): Promise<void>;
  revoke(tx: Tx, tenantId: TenantId, id: MembershipId): Promise<void>;
  permissionsOf(tx: Tx, roleKey: RoleKey): Promise<string[]>;
}

export interface InvitationRepository {
  create(tx: Tx, entrada: {
    tenantId: TenantId; email: string; roleKey: RoleKey; tokenHash: string;
    expiresAt: Date; invitedBy: UserId;
  }): Promise<Invitation>;
  /** Aceite: o token é a autorização, não o vínculo. */
  accept(tx: Tx, tokenHash: string, email: string): Promise<{ tenantId: TenantId; membershipId: MembershipId }>;
}

export interface EntitlementsPort {
  can(ctx: AccessContext, capability: string): Promise<boolean>;
}

export interface StorageGateway {
  /** Recusa qualquer caminho fora do prefixo da empresa do contexto. */
  signedUrlForTenantPath(ctx: AccessContext, caminho: string, operacao: "read" | "write"): Promise<string>;
}

export type AuditEntry = {
  tenantId: TenantId; actorType: "user" | "operator" | "worker" | "system"; actorId?: UserId;
  action: string; target?: string; before?: unknown; after?: unknown; reason?: string; correlationId?: string;
};
export interface AuditLogPort { record(tx: Tx, entrada: AuditEntry): Promise<void>; }

export interface Clock { now(): Date; }
export interface TokenGenerator { gerar(): { bruto: string; hash: string }; hash(bruto: string): string; }

export type Deps = {
  uow: UnitOfWork; tenants: TenantRepository; memberships: MembershipRepository;
  invitations: InvitationRepository; audit: AuditLogPort; clock: Clock; tokens: TokenGenerator;
  entitlements: EntitlementsPort; authAdmin?: AuthAdminPort;
};

/** Criação/localização de identidade no provedor de Auth. Só o ops-cli usa. */
export interface AuthAdminPort { ensureUser(email: string): Promise<UserId>; }
