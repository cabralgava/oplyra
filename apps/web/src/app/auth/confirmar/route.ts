import { NextResponse, type NextRequest } from "next/server";
import { guardarSessao } from "../../../lib/session";
import { supabaseUrl, chavePublicavel } from "../../../lib/deps";

/**
 * Conclusão do acesso por link. O token chega como token_hash na query e é
 * verificado no servidor: nada depende de fragmento de URL, que o servidor
 * não enxerga, e o token nunca fica exposto ao script da página.
 */
export async function GET(requisicao: NextRequest) {
  const { searchParams, origin } = requisicao.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const tipo = searchParams.get("type") ?? "magiclink";
  if (!tokenHash) return NextResponse.redirect(`${origin}/entrar?erro=link`);

  const r = await fetch(`${supabaseUrl}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: chavePublicavel, "Content-Type": "application/json" },
    body: JSON.stringify({ type: tipo, token_hash: tokenHash }),
    cache: "no-store",
  });
  if (!r.ok) return NextResponse.redirect(`${origin}/entrar?erro=link-invalido`);

  const { access_token: acesso } = (await r.json()) as { access_token?: string };
  if (!acesso) return NextResponse.redirect(`${origin}/entrar?erro=link-invalido`);

  await guardarSessao(acesso);
  return NextResponse.redirect(`${origin}/empresas`);
}
