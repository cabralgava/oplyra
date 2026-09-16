import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authGateway, resolverContexto, supabaseUrl, chavePublicavel } from "./deps";
import type { AccessContext, TenantId, VerifiedClaims } from "@oplyra/core";

const COOKIE = "oplyra_sessao";

/** O token fica em cookie httpOnly: não é acessível ao script da página. */
export async function guardarSessao(accessToken: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, accessToken, { httpOnly: true, sameSite: "lax", path: "/", secure: false, maxAge: 3600 });
}

export async function encerrarSessao(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

/** Claims verificadas por assinatura. Token inválido derruba a sessão. */
export async function claimsAtuais(): Promise<VerifiedClaims | null> {
  const bruto = (await cookies()).get(COOKIE)?.value;
  if (!bruto) return null;
  try { return await authGateway.verifyAccessToken(bruto); } catch { return null; }
}

export async function exigirClaims(): Promise<VerifiedClaims> {
  const c = await claimsAtuais();
  if (!c) redirect("/entrar");
  return c;
}

/**
 * Contexto da empresa ativa, montado com consulta de vínculo ao vivo.
 * Sem vínculo, a resposta é a mesma de empresa inexistente.
 */
export async function contextoDaEmpresa(tenantId: string): Promise<AccessContext> {
  const claims = await exigirClaims();
  try {
    return await resolverContexto.resolve(claims, tenantId as TenantId);
  } catch {
    redirect("/empresas?erro=sem-acesso");
  }
}

export async function autenticar(email: string, senha: string): Promise<string> {
  const r = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: chavePublicavel, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: senha }),
    cache: "no-store",
  });
  if (!r.ok) throw new Error("e-mail ou senha inválidos");
  return ((await r.json()) as { access_token: string }).access_token;
}

export async function enviarLinkMagico(email: string): Promise<void> {
  const r = await fetch(`${supabaseUrl}/auth/v1/magiclink`, {
    method: "POST",
    headers: { apikey: chavePublicavel, "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
    cache: "no-store",
  });
  if (!r.ok) throw new Error("não foi possível enviar o link");
}
