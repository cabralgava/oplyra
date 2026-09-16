// Catálogo de papéis do I-01 (DP-33). A precedência governa convite e mudança
// de papel: ninguém concede acima do próprio nível.
export const PAPEIS = ["owner", "admin", "marketing_manager", "viewer"] as const;
export type RoleKey = (typeof PAPEIS)[number];

const PRECEDENCIA: Record<RoleKey, number> = {
  owner: 100, admin: 80, marketing_manager: 50, viewer: 10,
};

export const ehPapel = (v: string): v is RoleKey => (PAPEIS as readonly string[]).includes(v);
export const precedencia = (p: RoleKey): number => PRECEDENCIA[p];
export const podeConceder = (ator: RoleKey, alvo: RoleKey): boolean => precedencia(alvo) <= precedencia(ator);

export const PERMISSOES = [
  "tenant.read", "member.read", "member.invite", "member.role.change",
  "member.remove", "entitlement.read", "asset.read", "asset.write",
] as const;
export type PermissionKey = (typeof PERMISSOES)[number];
