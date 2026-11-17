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
  // I-03: ler a marca, editar o rascunho e publicar uma versão.
  "brand.read", "brand.write", "brand.publish",
  // I-04: ler e operar estratégia (campanhas, testes, tarefas). Ativar campanha não publica anúncio.
  "strategy.read", "strategy.write",
  // I-02 (runtime local): ver execuções; submeter, cancelar e acionar o kill switch da empresa.
  "runtime.read", "runtime.operate",
  // CR-055: mídia somente leitura; gerir conexão não autoriza alterar anúncios.
  "media.read", "media.connection.manage",
] as const;
export type PermissionKey = (typeof PERMISSOES)[number];
