import { describe, it, expect } from "vitest";
import { criarDeps, contexto } from "@oplyra/testing";
import {
  inviteMember, acceptInvitation, changeMemberRole, removeMember, provisionTenant, listMyTenants,
  normalizarSlug, normalizarEmail, podeConceder,
} from "../src/index.ts";
import type { TenantId, UserId, MembershipId } from "../src/index.ts";

const TA = "11111111-1111-4111-8111-111111111111" as TenantId;

describe("regras de papel", () => {
  it("ninguém concede papel acima do próprio", () => {
    expect(podeConceder("admin", "owner")).toBe(false);
    expect(podeConceder("owner", "admin")).toBe(true);
    expect(podeConceder("viewer", "viewer")).toBe(true);
  });
});

describe("normalização", () => {
  it("rejeita slug e e-mail inválidos", () => {
    expect(() => normalizarSlug("A")).toThrow(/inválido/);
    expect(() => normalizarSlug("com espaço")).toThrow(/inválido/);
    expect(normalizarSlug("  Alfa-Software  ")).toBe("alfa-software");
    expect(() => normalizarEmail("sem-arroba")).toThrow(/inválido/);
    expect(normalizarEmail("  PESSOA@Local.Test ")).toBe("pessoa@local.test");
  });
});

describe("convidar pessoa", () => {
  it("exige permissão", async () => {
    const deps = criarDeps();
    await expect(inviteMember(deps, { ctx: contexto({ tenantId: TA, roleKey: "viewer" }), email: "x@local.test", roleKey: "viewer" }))
      .rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("não concede papel acima do convidante", async () => {
    const deps = criarDeps();
    await expect(inviteMember(deps, { ctx: contexto({ tenantId: TA, roleKey: "admin" }), email: "x@local.test", roleKey: "owner" }))
      .rejects.toMatchObject({ code: "ROLE_EXCEEDS_INVITER_ROLE" });
  });

  it("devolve o token uma única vez e persiste só o hash", async () => {
    const deps = criarDeps();
    const r = await inviteMember(deps, { ctx: contexto({ tenantId: TA }), email: "nova@local.test", roleKey: "viewer" });
    expect(r.token).toBeTruthy();
    expect(deps.estado.invitations[0]!.tokenHash).toBe(`hash:${r.token}`);
    expect(JSON.stringify(deps.estado.invitations)).not.toContain(`"${r.token}"`);
    expect(deps.estado.auditoria.at(-1)).toMatchObject({ action: "member.invite" });
  });

  it("recusa convite duplicado para o mesmo e-mail", async () => {
    const deps = criarDeps();
    const ctx = contexto({ tenantId: TA });
    await inviteMember(deps, { ctx, email: "nova@local.test", roleKey: "viewer" });
    await expect(inviteMember(deps, { ctx, email: "nova@local.test", roleKey: "viewer" }))
      .rejects.toMatchObject({ code: "MEMBER_ALREADY_ACTIVE" });
  });
});

describe("aceitar convite", () => {
  const convidado = "a0000009-0000-4000-8000-000000000009" as UserId;

  it("cria o vínculo com o papel do convite", async () => {
    const deps = criarDeps();
    const { token } = await inviteMember(deps, { ctx: contexto({ tenantId: TA }), email: "nova@local.test", roleKey: "marketing_manager" });
    const r = await acceptInvitation(deps, { userId: convidado, email: "Nova@Local.test", rawToken: token });
    expect(r.tenantId).toBe(TA);
    expect(deps.estado.memberships.at(-1)).toMatchObject({ userId: convidado, roleKey: "marketing_manager", status: "active" });
  });

  it("vale uma única vez", async () => {
    const deps = criarDeps();
    const { token } = await inviteMember(deps, { ctx: contexto({ tenantId: TA }), email: "nova@local.test", roleKey: "viewer" });
    await acceptInvitation(deps, { userId: convidado, email: "nova@local.test", rawToken: token });
    await expect(acceptInvitation(deps, { userId: "b0000009-0000-4000-8000-000000000009" as UserId, email: "nova@local.test", rawToken: token }))
      .rejects.toMatchObject({ code: "INVITATION_NOT_FOUND" });
  });

  it("recusa e-mail diferente do convidado", async () => {
    const deps = criarDeps();
    const { token } = await inviteMember(deps, { ctx: contexto({ tenantId: TA }), email: "nova@local.test", roleKey: "viewer" });
    await expect(acceptInvitation(deps, { userId: convidado, email: "outra@local.test", rawToken: token }))
      .rejects.toMatchObject({ code: "EMAIL_MISMATCH" });
  });

  it("recusa convite expirado", async () => {
    const deps = criarDeps();
    const { token } = await inviteMember(deps, { ctx: contexto({ tenantId: TA }), email: "nova@local.test", roleKey: "viewer" });
    deps.estado.agora = new Date("2026-10-15T12:00:00Z");
    await expect(acceptInvitation(deps, { userId: convidado, email: "nova@local.test", rawToken: token }))
      .rejects.toMatchObject({ code: "INVITATION_EXPIRED" });
  });

  it("recusa token adulterado", async () => {
    const deps = criarDeps();
    await inviteMember(deps, { ctx: contexto({ tenantId: TA }), email: "nova@local.test", roleKey: "viewer" });
    await expect(acceptInvitation(deps, { userId: convidado, email: "nova@local.test", rawToken: "token-falso" }))
      .rejects.toMatchObject({ code: "INVITATION_NOT_FOUND" });
  });
});

describe("último Owner", () => {
  function comDoisMembros(papelSegundo: "owner" | "viewer") {
    const deps = criarDeps({
      memberships: [
        { id: "m1" as MembershipId, tenantId: TA, userId: "u1" as UserId, roleKey: "owner", status: "active" },
        { id: "m2" as MembershipId, tenantId: TA, userId: "u2" as UserId, roleKey: papelSegundo, status: "active" },
      ],
    });
    return deps;
  }

  it("não pode ser rebaixado", async () => {
    const deps = comDoisMembros("viewer");
    await expect(changeMemberRole(deps, { ctx: contexto({ tenantId: TA }), membershipId: "m1" as MembershipId, roleKey: "admin" }))
      .rejects.toMatchObject({ code: "LAST_OWNER_CANNOT_BE_DEMOTED" });
  });

  it("não pode ser removido", async () => {
    const deps = comDoisMembros("viewer");
    await expect(removeMember(deps, { ctx: contexto({ tenantId: TA }), membershipId: "m1" as MembershipId, reason: "saiu" }))
      .rejects.toMatchObject({ code: "LAST_OWNER_CANNOT_BE_REMOVED" });
  });

  it("com dois Owners, um pode sair", async () => {
    const deps = comDoisMembros("owner");
    await removeMember(deps, { ctx: contexto({ tenantId: TA }), membershipId: "m2" as MembershipId, reason: "saiu" });
    expect(deps.estado.memberships.find((m) => m.id === "m2")!.status).toBe("revoked");
    expect(deps.estado.auditoria.at(-1)).toMatchObject({ action: "member.remove", reason: "saiu" });
  });

  it("remover exige permissão própria, que o Gestor não tem", async () => {
    const deps = comDoisMembros("owner");
    await expect(removeMember(deps, { ctx: contexto({ tenantId: TA, roleKey: "marketing_manager" }), membershipId: "m2" as MembershipId, reason: "x" }))
      .rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });
});

describe("provisionar empresa", () => {
  it("exige motivo e grava auditoria com o operador", async () => {
    const deps = criarDeps();
    const operador = "0f000001-0000-4000-8000-000000000001" as UserId;
    await expect(provisionTenant(deps, { name: "Alfa", slug: "alfa", ownerEmail: "o@local.test", reason: "  ", operatorId: operador }))
      .rejects.toMatchObject({ code: "OPERATOR_NOT_AUTHORIZED" });

    const r = await provisionTenant(deps, { name: "Alfa Software", slug: "Alfa-Software", ownerEmail: "o@local.test", reason: "piloto", operatorId: operador });
    expect(deps.estado.tenants[0]!.slug).toBe("alfa-software");
    expect(deps.estado.memberships[0]).toMatchObject({ id: r.ownerMembershipId, roleKey: "owner" });
    expect(deps.estado.auditoria[0]).toMatchObject({ action: "tenant.provision", actorType: "operator", actorId: operador, reason: "piloto" });
  });

  it("recusa slug já utilizado", async () => {
    const deps = criarDeps();
    const operador = "0f000001-0000-4000-8000-000000000001" as UserId;
    await provisionTenant(deps, { name: "Alfa", slug: "alfa-software", ownerEmail: "o@local.test", reason: "piloto", operatorId: operador });
    await expect(provisionTenant(deps, { name: "Outra", slug: "alfa-software", ownerEmail: "p@local.test", reason: "piloto", operatorId: operador }))
      .rejects.toMatchObject({ code: "SLUG_ALREADY_TAKEN" });
  });
});

describe("empresas do usuário", () => {
  it("lista apenas vínculos ativos", async () => {
    const deps = criarDeps({
      tenants: [{ id: TA, name: "Alfa", slug: "alfa", status: "active", timezone: "America/Sao_Paulo", locale: "pt-BR" }],
      memberships: [
        { id: "m1" as MembershipId, tenantId: TA, userId: "u1" as UserId, roleKey: "owner", status: "active" },
        { id: "m2" as MembershipId, tenantId: TA, userId: "u2" as UserId, roleKey: "viewer", status: "revoked" },
      ],
    });
    expect(await listMyTenants(deps, "u1" as UserId)).toHaveLength(1);
    expect(await listMyTenants(deps, "u2" as UserId)).toHaveLength(0);
  });
});
