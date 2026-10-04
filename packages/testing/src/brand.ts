// Fake em memória do contexto Brand. Serve a testes de unidade dos casos de uso;
// a persistência real (RLS, constraints, triggers) é verificada com o Supabase local.
import type { AuditEntry, Tx, UnitOfWork, AccessContext, PermissionKey, RoleKey, BrandVersionId, TenantId } from "@oplyra/core";
import type { BrandDeps, BrandRepository, BrandVersion, BrandVersionSummary } from "@oplyra/core/brand";
import {
  BrandDraftAlreadyExists, BrandVersionImmutable, BrandVersionNotFound, ConflictVersion, versaoVigente,
} from "@oplyra/core/brand";
import { contexto } from "./index.ts";

const BRAND_POR_PAPEL: Record<RoleKey, readonly PermissionKey[]> = {
  owner: ["brand.read", "brand.write", "brand.publish"],
  admin: ["brand.read", "brand.write", "brand.publish"],
  marketing_manager: ["brand.read", "brand.write"],
  viewer: ["brand.read"],
};

/** `contexto()` do I-01 acrescido das permissões da marca, espelhando o seed da migration 000016 (D-4). */
export function contextoDeMarca(over: Parameters<typeof contexto>[0]): AccessContext {
  const base = contexto(over);
  return { ...base, permissions: new Set<PermissionKey>([...base.permissions, ...BRAND_POR_PAPEL[base.roleKey]]) };
}

const TX: Tx = {};
let sequencia = 0;
const uuid = (): string => `b${(++sequencia).toString().padStart(7, "0")}-0000-4000-8000-${sequencia.toString().padStart(12, "0")}`;

export type EstadoBrand = { versoes: BrandVersion[]; auditoria: AuditEntry[]; agora: Date };

export function criarBrandDeps(inicial?: Partial<EstadoBrand>): BrandDeps & { estado: EstadoBrand } {
  const estado: EstadoBrand = { versoes: [], auditoria: [], agora: new Date("2026-10-04T12:00:00Z"), ...inicial };

  const uow: UnitOfWork = {
    withUserTransaction: (_c, fn) => fn(TX),
    withIdentityTransaction: (_u, fn) => fn(TX),
    withWorkerTransaction: (_t, _j, fn) => fn(TX),
    withDispatcherTransaction: (_t, _d, fn) => fn(TX),
    withOperatorTransaction: (_o, _m, fn) => fn(TX),
  };

  const doTenant = (t: TenantId) => estado.versoes.filter((v) => v.tenantId === t);
  const substituir = (v: BrandVersion): BrandVersion => {
    const i = estado.versoes.findIndex((x) => x.tenantId === v.tenantId && x.id === v.id);
    estado.versoes[i] = v;
    return v;
  };
  const achar = (t: TenantId, id: BrandVersionId): BrandVersion => {
    const v = doTenant(t).find((x) => x.id === id);
    if (!v) throw new BrandVersionNotFound();
    return v;
  };

  const brand: BrandRepository = {
    async listSummaries(_tx, t) {
      return doTenant(t).sort((a, b) => b.number - a.number)
        .map((v): BrandVersionSummary => ({ id: v.id, number: v.number, status: v.status, publishedAt: v.publishedAt, createdAt: v.createdAt }));
    },
    async findById(_tx, t, id) { return doTenant(t).find((v) => v.id === id) ?? null; },
    async findDraft(_tx, t) { return doTenant(t).find((v) => v.status === "draft") ?? null; },
    async findCurrent(_tx, t) { return versaoVigente(doTenant(t)); },
    async createDraft(_tx, e) {
      if (doTenant(e.tenantId).some((v) => v.status === "draft")) throw new BrandDraftAlreadyExists();
      const criado: BrandVersion = {
        ...e.content, id: uuid() as BrandVersionId, tenantId: e.tenantId,
        number: Math.max(0, ...doTenant(e.tenantId).map((v) => v.number)) + 1,
        status: "draft", revision: 1, derivedFromId: e.derivedFromId, createdBy: e.createdBy,
        createdAt: estado.agora, publishedBy: null, publishedAt: null,
      };
      estado.versoes.push(criado);
      return criado;
    },
    async replaceDraftContent(_tx, e) {
      const atual = achar(e.tenantId, e.id);
      if (atual.status !== "draft") throw new BrandVersionImmutable();
      if (atual.revision !== e.expectedRevision) throw new ConflictVersion();
      return substituir({ ...atual, ...e.content, revision: atual.revision + 1 });
    },
    async publish(_tx, e) {
      const atual = achar(e.tenantId, e.id);
      if (atual.status !== "draft") throw new BrandVersionImmutable();
      if (atual.revision !== e.expectedRevision) throw new ConflictVersion();
      return substituir({ ...atual, status: "published", publishedBy: e.publishedBy, publishedAt: e.publishedAt });
    },
  };

  return {
    uow, brand, estado,
    audit: { async record(_tx, entrada) { estado.auditoria.push(entrada); } },
    clock: { now: () => estado.agora },
    ids: { uuid },
  };
}
