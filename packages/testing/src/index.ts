// Fakes em memória das portas. Servem a testes de unidade de casos de uso;
// não substituem a verificação com Supabase local.
import type {
  Deps, Tx, UnitOfWork, TenantRepository, MembershipRepository, InvitationRepository,
  AuditLogPort, AuditEntry, EntitlementsPort, Clock, TokenGenerator, AuthAdminPort,
} from "@oplyra/core";
import type { TenantId, UserId, MembershipId, InvitationId } from "@oplyra/core";
import type { RoleKey, PermissionKey } from "@oplyra/core";
import type { AccessContext } from "@oplyra/core";
import type { Tenant, Membership, Invitation, TenantSummary } from "@oplyra/core";

const TX: Tx = {};
let sequencia = 0;
const novoId = (p: string): string =>
  `${p}${(++sequencia).toString().padStart(7, "0")}-0000-4000-8000-000000000001`.slice(0, 36);

export type Estado = {
  tenants: Tenant[]; memberships: Membership[]; invitations: (Invitation & { tokenHash: string })[];
  auditoria: AuditEntry[]; agora: Date;
};

export function criarDeps(inicial?: Partial<Estado>): Deps & { estado: Estado } {
  const estado: Estado = {
    tenants: [], memberships: [], invitations: [], auditoria: [],
    agora: new Date("2026-09-15T12:00:00Z"), ...inicial,
  };

  let identidadeAtual: UserId | null = null;
  const uow: UnitOfWork = {
    withUserTransaction: (_ctx, fn) => fn(TX),
    withIdentityTransaction: (u, fn) => { identidadeAtual = u; return fn(TX); },
    withWorkerTransaction: (_t, _j, fn) => fn(TX),
    withDispatcherTransaction: (_t, _d, fn) => fn(TX),
    withOperatorTransaction: (_o, _m, fn) => fn(TX),
  };

  const tenants: TenantRepository = {
    async create(_tx, e) {
      const t: Tenant = { id: novoId("t") as TenantId, name: e.name, slug: e.slug, status: "active", timezone: "America/Sao_Paulo", locale: "pt-BR" };
      estado.tenants.push(t); return t;
    },
    async findBySlug(_tx, slug) { return estado.tenants.find((t) => t.slug === slug) ?? null; },
    async findById(_tx, id) { return estado.tenants.find((t) => t.id === id) ?? null; },
  };

  const memberships: MembershipRepository = {
    async findActive(_tx, u, t) { return estado.memberships.find((m) => m.userId === u && m.tenantId === t && m.status === "active") ?? null; },
    async findById(_tx, t, id) { return estado.memberships.find((m) => m.tenantId === t && m.id === id) ?? null; },
    async listActiveByUser(_tx) {
      return estado.memberships.filter((m) => m.userId === identidadeAtual && m.status === "active")
        .map((m): TenantSummary => ({ tenantId: m.tenantId, name: estado.tenants.find((t) => t.id === m.tenantId)?.name ?? "", roleKey: m.roleKey }));
    },
    async listByTenant(_tx, t) { return estado.memberships.filter((m) => m.tenantId === t); },
    async countActiveOwners(_tx, t) { return estado.memberships.filter((m) => m.tenantId === t && m.roleKey === "owner" && m.status === "active").length; },
    async add(_tx, e) {
      const m: Membership = { id: novoId("m") as MembershipId, tenantId: e.tenantId, userId: e.userId, roleKey: e.roleKey, status: "active" };
      estado.memberships.push(m); return m;
    },
    async changeRole(_tx, t, id, papel) {
      const i = estado.memberships.findIndex((m) => m.tenantId === t && m.id === id);
      if (i >= 0) estado.memberships[i] = { ...estado.memberships[i]!, roleKey: papel };
    },
    async revoke(_tx, t, id) {
      const i = estado.memberships.findIndex((m) => m.tenantId === t && m.id === id);
      if (i >= 0) estado.memberships[i] = { ...estado.memberships[i]!, status: "revoked" };
    },
    async permissionsOf() { return []; },
  };

  const invitations: InvitationRepository = {
    async create(_tx, e) {
      if (estado.invitations.some((i) => i.tenantId === e.tenantId && i.email === e.email && i.status === "pending")) {
        throw new Error("duplicate key: convite pendente");
      }
      const inv = { id: novoId("i") as InvitationId, tenantId: e.tenantId, email: e.email, roleKey: e.roleKey, expiresAt: e.expiresAt, status: "pending" as const, tokenHash: e.tokenHash };
      estado.invitations.push(inv); return inv;
    },
    async accept(_tx, hash, email) {
      const userId = identidadeAtual!;
      const inv = estado.invitations.find((i) => i.tokenHash === hash);
      if (!inv || inv.status !== "pending") throw new Error("convite inexistente ou já utilizado");
      if (inv.expiresAt <= estado.agora) throw new Error("convite expirado");
      if (inv.email !== email.toLowerCase()) throw new Error("convite emitido para outro e-mail");
      if (estado.memberships.some((m) => m.tenantId === inv.tenantId && m.userId === userId && m.status === "active")) {
        throw new Error("já existe vínculo ativo");
      }
      const m = await memberships.add(TX, { tenantId: inv.tenantId, userId, roleKey: inv.roleKey });
      const i = estado.invitations.indexOf(inv);
      estado.invitations[i] = { ...inv, status: "accepted" };
      return { tenantId: inv.tenantId, membershipId: m.id };
    },
  };

  const audit: AuditLogPort = { async record(_tx, e) { estado.auditoria.push(e); } };
  const clock: Clock = { now: () => estado.agora };
  const tokens: TokenGenerator = {
    gerar: () => { const b = `token-${++sequencia}`; return { bruto: b, hash: `hash:${b}` }; },
    hash: (b) => `hash:${b}`,
  };
  const entitlements: EntitlementsPort = { async can(_ctx, c) { return c !== "relationshipJourneys"; } };
  const authAdmin: AuthAdminPort = { async ensureUser() { return novoId("u") as UserId; } };

  return { uow, tenants, memberships, invitations, audit, clock, tokens, entitlements, authAdmin, estado };
}

export function contexto(over: Partial<AccessContext> & Pick<AccessContext, "tenantId">): AccessContext {
  const papel: RoleKey = over.roleKey ?? "owner";
  const todas: readonly PermissionKey[] = ["tenant.read", "member.read", "member.invite", "member.role.change", "member.remove", "entitlement.read", "asset.read", "asset.write"];
  const porPapel: Record<RoleKey, readonly PermissionKey[]> = {
    owner: todas, admin: todas.filter((p) => p !== "member.remove"),
    marketing_manager: ["tenant.read", "member.read", "entitlement.read", "asset.read", "asset.write"],
    viewer: ["tenant.read", "member.read", "entitlement.read", "asset.read"],
  };
  return {
    userId: (over.userId ?? novoId("u")) as UserId,
    tenantId: over.tenantId,
    membershipId: (over.membershipId ?? novoId("m")) as MembershipId,
    roleKey: papel,
    permissions: new Set<PermissionKey>(porPapel[papel]),
    resolvedAt: over.resolvedAt ?? new Date("2026-09-15T12:00:00Z"),
  };
}
