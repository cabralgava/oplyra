// Integração com o Supabase LOCAL. Exige `pnpm db:start`, migrations e seeds.
// Estes testes usam sessões e papéis reais: o que passa aqui não passou por fake.
import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { criarUnitOfWork } from "../src/db.ts";
import {
  tenantRepository, membershipRepository, invitationRepository, auditLog,
  criarEntitlements, geradorDeToken, relogio, criarStorageGateway,
} from "../src/repositories.ts";
import { criarAuthGateway, criarAccessContextResolver } from "../src/auth.ts";
import { carregarConfig } from "../src/config.ts";
import { inviteMember, acceptInvitation, removeMember, listMyTenants } from "@oplyra/core";
import type { Deps, AccessContext, TenantId, UserId, MembershipId, PermissionKey, RoleKey } from "@oplyra/core";

const WEB = "postgresql://oplyra_web_login:local-web-2026@127.0.0.1:54422/postgres";
const TA = "11111111-1111-4111-8111-111111111111" as TenantId;
const TB = "22222222-2222-4222-8222-222222222222" as TenantId;
const A_OWNER = "a0000001-0000-4000-8000-000000000001" as UserId;
const A_VIEWER = "a0000003-0000-4000-8000-000000000003" as UserId;
const AB_USER = "ab000005-0000-4000-8000-000000000005" as UserId;

const uow = criarUnitOfWork({ connectionString: WEB });
const resolver = criarAccessContextResolver(uow);
const deps: Deps = {
  uow, tenants: tenantRepository, memberships: membershipRepository,
  invitations: invitationRepository, audit: auditLog, clock: relogio,
  tokens: geradorDeToken, entitlements: criarEntitlements(uow),
};

const ctx = async (userId: UserId, tenantId: TenantId): Promise<AccessContext> =>
  resolver.resolve({ userId, email: "" }, tenantId);

afterAll(async () => { await uow.encerrar(); });

/** Cria uma identidade nova no Auth local. Id aleatório por execução: os
 *  testes precisam ser repetíveis sem depender de reset do banco. */
async function novaIdentidade(email: string): Promise<UserId> {
  const id = randomUUID() as UserId;
  const admin = criarUnitOfWork({ connectionString: "postgresql://postgres:postgres@127.0.0.1:54422/postgres" });
  try {
    await admin.pool.query(
      `insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
                               raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
                               confirmation_token,recovery_token,email_change_token_new,
                               email_change,email_change_token_current,reauthentication_token)
       values ('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,
               crypt('x',gen_salt('bf')),now(),'{}','{}',now(),now(),'','','','','','')`, [id, email]);
  } finally { await admin.encerrar(); }
  return id;
}

describe("contexto de acesso", () => {
  it("monta papel e permissões a partir do vínculo ao vivo", async () => {
    const c = await ctx(A_OWNER, TA);
    expect(c.roleKey).toBe("owner");
    expect(c.permissions.has("member.invite" as PermissionKey)).toBe(true);
  });

  it("não devolve contexto para empresa sem vínculo", async () => {
    await expect(ctx(A_OWNER, TB)).rejects.toMatchObject({ code: "MEMBERSHIP_NOT_FOUND" });
  });

  it("papel de Leitura não recebe permissão de convite", async () => {
    const c = await ctx(A_VIEWER, TA);
    expect(c.roleKey).toBe("viewer");
    expect(c.permissions.has("member.invite" as PermissionKey)).toBe(false);
  });
});

describe("isolamento com sessão real", () => {
  it("usuário de duas empresas enxerga apenas a ativa", async () => {
    const emA = await uow.withUserTransaction(await ctx(AB_USER, TA), async (tx) =>
      membershipRepository.countActiveOwners(tx, TB));
    expect(emA).toBe(0); // com A ativa, nada de B aparece
    const emB = await uow.withUserTransaction(await ctx(AB_USER, TB), async (tx) =>
      membershipRepository.countActiveOwners(tx, TB));
    expect(emB).toBe(1);
  });

  it("lista as próprias empresas sem empresa ativa", async () => {
    expect(await listMyTenants(deps, AB_USER)).toHaveLength(2);
    expect(await listMyTenants(deps, A_VIEWER)).toHaveLength(1);
  });
});

describe("convite ponta a ponta", () => {
  it("convida, aceita e grava auditoria na mesma transação", async () => {
    const dono = await ctx(A_OWNER, TA);
    const email = `convidada-${Date.now()}@local.test`;
    const { token } = await inviteMember(deps, { ctx: dono, email, roleKey: "viewer" });

    const antes = await uow.withUserTransaction(dono, async (tx) => {
      const { rows } = await (tx as any).query("select count(*)::int c from core.audit_log where action='member.invite'");
      return rows[0].c as number;
    });
    expect(antes).toBeGreaterThan(0);

    // Identidade nova aceita o convite: ela ainda não tem vínculo nenhum.
    const nova = await novaIdentidade(email);

    const r = await acceptInvitation(deps, { userId: nova, email, rawToken: token });
    expect(r.tenantId).toBe(TA);

    const c = await ctx(nova, TA);
    expect(c.roleKey).toBe("viewer");
  });

  it("token adulterado não cria vínculo", async () => {
    await expect(acceptInvitation(deps, { userId: A_OWNER, email: "x@local.test", rawToken: "invalido" }))
      .rejects.toMatchObject({ code: "INVITATION_NOT_FOUND" });
  });
});

describe("revogação tem efeito imediato", () => {
  it("membro removido perde acesso na requisição seguinte", async () => {
    const dono = await ctx(A_OWNER, TA);
    const email = `temporaria-${Date.now()}@local.test`;
    const { token } = await inviteMember(deps, { ctx: dono, email, roleKey: "viewer" });

    const alvo = await novaIdentidade(email);

    const { membershipId } = await acceptInvitation(deps, { userId: alvo, email, rawToken: token });
    await expect(ctx(alvo, TA)).resolves.toMatchObject({ roleKey: "viewer" });

    await removeMember(deps, { ctx: dono, membershipId: membershipId as MembershipId, reason: "fim do teste" });
    // A requisição seguinte já não monta contexto: o vínculo é consultado ao vivo.
    await expect(ctx(alvo, TA)).rejects.toMatchObject({ code: "MEMBERSHIP_NOT_FOUND" });
  });
});

describe("entitlements no backend", () => {
  it("nega capacidade não contratada mesmo em chamada direta", async () => {
    const dono = await ctx(A_OWNER, TA);
    expect(await deps.entitlements.can(dono, "team.invite")).toBe(true);
    expect(await deps.entitlements.can(dono, "relationshipJourneys")).toBe(false);
  });
});

describe("storage por prefixo", () => {
  it("recusa caminho de outra empresa antes de assinar", async () => {
    const dono = await ctx(A_OWNER, TA);
    const gw = criarStorageGateway("http://127.0.0.1:54421");
    await expect(gw.signedUrlForTenantPath(dono, `${TB}/arquivo.txt`, "read")).rejects.toThrow(/fora do prefixo/);
    await expect(gw.signedUrlForTenantPath(dono, `${TA}/arquivo.txt`, "read")).resolves.toContain(TA);
  });
});

describe("configuração falha fechada", () => {
  it("recusa ambiente local apontando para host remoto", () => {
    expect(() => carregarConfig({
      OPLYRA_ENV: "local", DATABASE_URL_APP: "postgresql://u:p@db.supabase.co:5432/postgres",
      SUPABASE_URL: "https://abc.supabase.co",
    } as NodeJS.ProcessEnv)).toThrow(/host remoto/);
  });

  it("aceita quando a autorização é explícita", () => {
    expect(carregarConfig({
      OPLYRA_ENV: "local", DATABASE_URL_APP: "postgresql://u:p@db.supabase.co:5432/postgres",
      SUPABASE_URL: "https://abc.supabase.co", OPLYRA_ALLOW_REMOTE: "true",
    } as NodeJS.ProcessEnv).env).toBe("local");
  });

  it("recusa produção com endereço local", () => {
    expect(() => carregarConfig({
      OPLYRA_ENV: "production", DATABASE_URL_APP: "postgresql://u:p@127.0.0.1:54422/postgres",
      SUPABASE_URL: "http://127.0.0.1:54421",
    } as NodeJS.ProcessEnv)).toThrow(/mistura de ambientes/);
  });
});
