// Ambiente remoto de desenvolvimento separado do local/CI e da produção (CR-057).
// Este módulo não abre conexão nem integra automaticamente a composição da web.
import { ConfigError } from "./config.ts";

export const DEVELOP_TARGET = Object.freeze({
  projectRef: "eqpvjydnqbbawpkeizys",
  parentProjectRef: "hysigyhfpyyydycxxpsm",
  branch: "develop",
  netlifySiteName: "oplyra-develop",
  netlifySiteId: "45056cd1-6732-40b3-b341-8b9fecca8345",
  appOrigin: "https://oplyra-develop.netlify.app",
});
export type DevelopConfig = {
  env: "develop"; databaseUrl: string; supabaseUrl: string; projectRef: string;
  jwtIssuer: string; jwksUrl: string; appUrl: string; netlifySiteId: string;
};
const has = (env: NodeJS.ProcessEnv, key: string) => Object.prototype.hasOwnProperty.call(env,key);
const fail = (message: string): never => { throw new ConfigError(message); };
function publicOrigin(value: string | undefined, expected: string, label: string): string {
  if (!value || /[\s?#]/.test(value)) return fail(`${label} inválida`);
  let url: URL;
  try { url = new URL(value); } catch { return fail(`${label} inválida`); }
  if (url.origin !== expected || url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || value.includes("@")) return fail(`${label} não corresponde ao destino develop`);
  return url.origin;
}
/**
 * SITE_NAME, SITE_ID e URL são metadados reservados disponíveis nas Functions Netlify.
 * Mitigação de mistura acidental de ambientes, não prova criptográfica do provedor.
 * Acesso a dados continua dependendo de JWT, membership, RBAC, transação e RLS.
 */
export function carregarConfigDevelop(env: NodeJS.ProcessEnv): DevelopConfig {
  if (env.OPLYRA_ENV !== "develop") return fail("este loader exige OPLYRA_ENV=develop");
  if (has(env,"OPLYRA_ALLOW_REMOTE")) return fail("OPLYRA_ALLOW_REMOTE é obsoleta");
  if (has(env,"DATABASE_URL_MIGRATIONS")) return fail("credencial de migrations não pertence ao runtime develop");
  if (env.SUPABASE_PROJECT_REF !== DEVELOP_TARGET.projectRef) return fail("SUPABASE_PROJECT_REF não corresponde a develop");
  const supabaseUrl = publicOrigin(env.SUPABASE_URL,`https://${DEVELOP_TARGET.projectRef}.supabase.co`,"SUPABASE_URL");
  publicOrigin(env.NEXT_PUBLIC_SUPABASE_URL,supabaseUrl,"NEXT_PUBLIC_SUPABASE_URL");
  const appUrl = publicOrigin(env.NEXT_PUBLIC_APP_URL,DEVELOP_TARGET.appOrigin,"NEXT_PUBLIC_APP_URL");
  if (env.SITE_NAME !== DEVELOP_TARGET.netlifySiteName) return fail("site Netlify diferente do destino develop");
  if (env.OPLYRA_NETLIFY_SITE_ID !== DEVELOP_TARGET.netlifySiteId || env.SITE_ID !== DEVELOP_TARGET.netlifySiteId) return fail("SITE_ID Netlify não conferido");
  publicOrigin(env.URL,appUrl,"URL reservada do Netlify");
  const raw = env.DATABASE_URL_APP;
  if (!raw || /\s/.test(raw)) return fail("DATABASE_URL_APP inválida");
  let db: URL, user: string;
  try { db = new URL(raw); user = decodeURIComponent(db.username); } catch { return fail("DATABASE_URL_APP inválida"); }
  const ref = DEVELOP_TARGET.projectRef;
  const direct = db.hostname === `db.${ref}.supabase.co` && ["oplyra_web_login",`oplyra_web_login.${ref}`].includes(user);
  const pooler = db.hostname.endsWith(".pooler.supabase.com") && user === `oplyra_web_login.${ref}`;
  if (!["postgres:","postgresql:"].includes(db.protocol) || (!direct && !pooler) || !db.password || db.pathname !== "/postgres" || db.hash || !["","5432","6543"].includes(db.port)) return fail("DATABASE_URL_APP não é conexão mínima do projeto develop");
  const entries = [...db.searchParams.entries()];
  if (entries.length !== 1 || entries[0]![0] !== "sslmode" || !["require","verify-full"].includes(entries[0]![1])) return fail("DATABASE_URL_APP exige SSL e não aceita opções livres");
  const jwtIssuer = `${supabaseUrl}/auth/v1`, jwksUrl = `${jwtIssuer}/.well-known/jwks.json`;
  if ((env.SUPABASE_JWT_ISSUER !== undefined && env.SUPABASE_JWT_ISSUER !== jwtIssuer) || (env.SUPABASE_JWKS_URL !== undefined && env.SUPABASE_JWKS_URL !== jwksUrl)) return fail("identidade Auth divergente de develop");
  return { env:"develop",databaseUrl:raw,supabaseUrl,projectRef:ref,jwtIssuer,jwksUrl,appUrl,netlifySiteId:env.SITE_ID! };
}
