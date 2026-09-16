// Validação de configuração na inicialização. Falha fechada: sem variável,
// com mistura de ambientes ou apontando para host remoto sem autorização
// explícita, o processo não sobe (critério A14 / TST-19).
const LOCAIS = ["127.0.0.1", "localhost", "::1", "host.docker.internal"];

export type Config = {
  env: "local" | "ci" | "production";
  databaseUrl: string;
  supabaseUrl: string;
  jwksUrl: string;
  jwtIssuer: string;
};

function ehLocal(url: string): boolean {
  try { return LOCAIS.includes(new URL(url).hostname); }
  catch { return LOCAIS.some((h) => url.includes(`@${h}:`) || url.includes(`//${h}:`)); }
}

export function carregarConfig(bruto: NodeJS.ProcessEnv = process.env): Config {
  const faltando = ["OPLYRA_ENV", "DATABASE_URL_APP", "SUPABASE_URL"].filter((k) => !bruto[k]);
  if (faltando.length) throw new Error(`configuração incompleta: ${faltando.join(", ")}`);

  const env = bruto.OPLYRA_ENV as Config["env"];
  if (!["local", "ci", "production"].includes(env)) throw new Error(`OPLYRA_ENV inválido: ${env}`);

  const databaseUrl = bruto.DATABASE_URL_APP!;
  const supabaseUrl = bruto.SUPABASE_URL!;
  const permiteRemoto = bruto.OPLYRA_ALLOW_REMOTE === "true";

  if (env !== "production") {
    const remotos = [databaseUrl, supabaseUrl].filter((u) => !ehLocal(u));
    if (remotos.length && !permiteRemoto) {
      throw new Error(
        `ambiente "${env}" apontando para host remoto sem OPLYRA_ALLOW_REMOTE=true. ` +
        `Recusando para não usar serviço remoto por engano.`,
      );
    }
  } else if (permiteRemoto === false && !ehLocal(databaseUrl)) {
    // produção com host remoto é o esperado; nada a fazer.
  }

  if (env === "production" && [databaseUrl, supabaseUrl].some(ehLocal)) {
    throw new Error("produção configurada com endereço local: mistura de ambientes");
  }

  return {
    env, databaseUrl, supabaseUrl,
    jwksUrl: bruto.SUPABASE_JWKS_URL ?? `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
    jwtIssuer: bruto.SUPABASE_JWT_ISSUER ?? `${supabaseUrl}/auth/v1`,
  };
}
