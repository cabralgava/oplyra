// Regras puras do cookie de sessão (sem I/O): testáveis sem banco nem Next.
export const DURACAO_MAXIMA_S = 3600;

/** HTTP puro só nos ambientes locais validados (local/ci). Qualquer outro, inclusive develop e produção, exige HTTPS. */
export function cookieSeguro(env: string | undefined = process.env.OPLYRA_ENV): boolean {
  return env !== "local" && env !== "ci";
}

/** Segundos até `exp` do JWT (já verificado por assinatura); nunca excede o máximo. Sem `exp` válido ou expirado, recusa. */
export function duracaoDaSessao(token: string, agoraS: number = Math.floor(Date.now() / 1000)): number {
  let exp: unknown;
  try {
    exp = (JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as { exp?: unknown }).exp;
  } catch { throw new Error("sessão inválida"); }
  if (typeof exp !== "number" || !Number.isFinite(exp)) throw new Error("sessão inválida");
  const restante = Math.floor(exp - agoraS);
  if (restante <= 0) throw new Error("sessão expirada");
  return Math.min(restante, DURACAO_MAXIMA_S);
}
