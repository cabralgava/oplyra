// Validação de configuração na inicialização (critério A14 / TST-19, CR-028).
// Falha fechada. Tudo que vem de `process.env` é configuração NÃO confiável:
// uma variável não prova onde o processo roda. A evidência confiável do
// deployment chega pelo composition root, por uma política de evidência que
// lê metadado reservado do provedor. Esta é uma proteção contra erro de
// configuração, não contra falsificação deliberada, e não substitui o
// isolamento de segredos. O núcleo não conhece nada disto.

export type Ambiente = "local" | "ci" | "production";

export type Config = {
  env: Ambiente;
  databaseUrl: string;
  supabaseUrl: string;
  jwksUrl: string;
  jwtIssuer: string;
  /** Somente em produção: ref validado contra URL, banco e evidência confiável. */
  projectRef: string | null;
};

/**
 * Evidência confiável do deployment, produzida por um adapter do provedor a
 * partir de metadado reservado e documentado — nunca de variável criada pela
 * aplicação (por exemplo, `OPLYRA_DEPLOYMENT_ID` não é evidência).
 */
export type TrustedDeploymentContext = {
  readonly environment: string;
  readonly deploymentId: string;
  readonly provider: string;
  readonly evidenceSource: string;
};

/** Par provedor + fonte de metadado reconhecido por uma política de evidência. */
export type RecognizedEvidence = { readonly provider: string; readonly evidenceSource: string };

/**
 * Política de evidência entregue pelo composition root: quais pares são
 * reconhecidos e como ler o contexto do provedor. Testes podem injetar uma
 * política sintética; a política produtiva só contém adapters aprovados.
 */
export type DeploymentEvidencePolicy = {
  readonly recognized: readonly RecognizedEvidence[];
  readContext(): TrustedDeploymentContext | null;
};

/**
 * Provedores de deployment aprovados para produção. Vazio até existir destino
 * aprovado para web/worker e adapter do seu metadado (CR-028 §2.2 regra 11):
 * enquanto vazio, o runtime `production` não sobe.
 */
export const APPROVED_DEPLOYMENT_EVIDENCE: readonly RecognizedEvidence[] = Object.freeze([]);

/** Política padrão dos composition roots: nenhum provedor aprovado, nenhum contexto. */
export const politicaSemProvedorAprovado: DeploymentEvidencePolicy = Object.freeze({
  recognized: APPROVED_DEPLOYMENT_EVIDENCE,
  readContext: () => null,
});

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

const LOCAIS = new Set(["127.0.0.1", "localhost", "[::1]", "::1", "host.docker.internal"]);
const REF = /^[a-z0-9]{8,40}$/;
const FINGERPRINT = /^ofp1:([a-z]+):([a-z0-9]{8,40}):([A-Za-z0-9._:-]{1,200})$/;
/** Usuários que nunca podem ser a credencial da aplicação (fluxo de migrations é separado). */
const USUARIOS_DE_MIGRATION = new Set(["postgres", "supabase_admin"]);

type Endpoint = { host: string; user: string; protocol: string; origin: string };
type Tipo = "banco" | "api";

const PROTOCOLOS: Record<Tipo, readonly string[]> = { banco: ["postgres:", "postgresql:"], api: ["http:", "https:"] };

/**
 * Parsing estrito: URL malformada falha, sem busca por substring e sem repetir
 * o valor (nem usuário, senha ou trecho da URL) no erro. Banco exige protocolo
 * postgres e usuário não vazio; a URL da API não pode carregar userinfo, query
 * ou fragmento, para que nada disso se propague a `supabaseUrl`, `jwksUrl` ou
 * `jwtIssuer`.
 */
function endpoint(nome: string, valor: string, tipo: Tipo): Endpoint {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    throw new ConfigError(`${nome} malformada`);
  }
  if (!PROTOCOLOS[tipo].includes(url.protocol)) throw new ConfigError(`${nome} com protocolo não aceito`);
  if (!url.hostname) throw new ConfigError(`${nome} sem host`);
  let user: string;
  try {
    user = decodeURIComponent(url.username);
  } catch {
    throw new ConfigError(`${nome} com usuário malformado`);
  }
  if (tipo === "banco") {
    if (!user) throw new ConfigError(`${nome} sem usuário`);
  } else {
    const autoridade = /^[^:]+:\/\/([^/?#]*)/.exec(valor)?.[1] ?? "";
    if (autoridade.includes("@") || url.username || url.password) throw new ConfigError(`${nome} não aceita credenciais na URL`);
    if (/[?#]/.test(valor) || url.search || url.hash) throw new ConfigError(`${nome} não aceita query nem fragmento`);
    if (url.pathname !== "/") throw new ConfigError(`${nome} não aceita path: a base dos endpoints de autenticação seria ambígua`);
  }
  return { host: url.hostname.toLowerCase(), user, protocol: url.protocol, origin: url.origin };
}

const ehLocal = (e: Endpoint) => LOCAIS.has(e.host);

/** Ref do usuário do pooler (`<papel>.<ref>`), ou null se não houver sufixo. */
function refDoUsuario(user: string): string | null {
  const i = user.lastIndexOf(".");
  return i > 0 ? user.slice(i + 1) : null;
}

function validarProducao(db: Endpoint, api: Endpoint, bruto: NodeJS.ProcessEnv, politica: DeploymentEvidencePolicy): string {
  const ref = bruto.SUPABASE_PROJECT_REF;
  if (!ref) throw new ConfigError("produção exige SUPABASE_PROJECT_REF");
  if (!REF.test(ref)) throw new ConfigError("SUPABASE_PROJECT_REF fora do formato");

  if (api.protocol !== "https:" || api.host !== `${ref}.supabase.co`) {
    throw new ConfigError("SUPABASE_URL não corresponde a SUPABASE_PROJECT_REF");
  }
  const direta = db.host === `db.${ref}.supabase.co`;
  const pooler = db.host.endsWith(".pooler.supabase.com");
  if (!direta && !pooler) throw new ConfigError("DATABASE_URL_APP não é conexão direta nem pooler do projeto");
  if (pooler && refDoUsuario(db.user) !== ref) throw new ConfigError("usuário do pooler não corresponde a SUPABASE_PROJECT_REF");
  if (direta && refDoUsuario(db.user) !== null && refDoUsuario(db.user) !== ref) {
    throw new ConfigError("usuário da conexão direta indica outro projeto");
  }

  // Evidência confiável: somente pela política do composition root.
  const ctx = politica.readContext();
  if (!ctx) throw new ConfigError("produção sem evidência confiável do deployment");
  const reconhecido = politica.recognized.some((r) => r.provider === ctx.provider && r.evidenceSource === ctx.evidenceSource);
  if (!reconhecido) throw new ConfigError("provedor ou fonte de evidência não reconhecidos");
  if (ctx.environment !== "production") throw new ConfigError("evidência do deployment não é de produção");
  if (!ctx.deploymentId) throw new ConfigError("evidência do deployment sem identificador");

  const fp = bruto.OPLYRA_ENVIRONMENT_FINGERPRINT;
  if (!fp) throw new ConfigError("produção exige OPLYRA_ENVIRONMENT_FINGERPRINT");
  const m = FINGERPRINT.exec(fp);
  if (!m) throw new ConfigError("OPLYRA_ENVIRONMENT_FINGERPRINT fora do formato ofp1");
  const [, fpEnv, fpRef, fpDeploy] = m;
  if (fpEnv !== "production") throw new ConfigError("fingerprint de outro ambiente");
  if (fpRef !== ref) throw new ConfigError("fingerprint de outro projeto");
  if (fpDeploy !== ctx.deploymentId) throw new ConfigError("fingerprint diverge do deployment confiável");
  return ref;
}

/**
 * Carrega e valida a configuração de runtime. `databaseVar` permite a cada
 * composition root validar a sua conexão (web: DATABASE_URL_APP; CLI de
 * operações: DATABASE_URL_OPS). O fluxo de migrations é separado e não passa aqui.
 */
export function carregarConfig(
  bruto: NodeJS.ProcessEnv = process.env,
  opcoes: { readonly evidencia?: DeploymentEvidencePolicy; readonly databaseVar?: string } = {},
): Config {
  const politica = opcoes.evidencia ?? politicaSemProvedorAprovado;
  const databaseVar = opcoes.databaseVar ?? "DATABASE_URL_APP";

  if (Object.prototype.hasOwnProperty.call(bruto, "OPLYRA_ALLOW_REMOTE")) {
    throw new ConfigError("OPLYRA_ALLOW_REMOTE é obsoleta e não é aceita (CR-028)");
  }
  const faltando = ["OPLYRA_ENV", databaseVar, "SUPABASE_URL"].filter((k) => !bruto[k]);
  if (faltando.length) throw new ConfigError(`configuração incompleta: ${faltando.join(", ")}`);

  const env = bruto.OPLYRA_ENV as Ambiente;
  if (!["local", "ci", "production"].includes(env)) throw new ConfigError("OPLYRA_ENV inválido");

  const databaseUrl = bruto[databaseVar]!;
  const db = endpoint(databaseVar, databaseUrl, "banco");
  const api = endpoint("SUPABASE_URL", bruto.SUPABASE_URL!, "api");
  // Identidade de autenticação: derivada somente da SUPABASE_URL validada e normalizada.
  const supabaseUrl = api.origin;
  const jwtIssuer = `${supabaseUrl}/auth/v1`;
  const jwksUrl = `${jwtIssuer}/.well-known/jwks.json`;
  // Compatibilidade: overrides só são aceitos se idênticos ao endpoint canônico.
  if (bruto.SUPABASE_JWT_ISSUER !== undefined && bruto.SUPABASE_JWT_ISSUER !== jwtIssuer) {
    throw new ConfigError("SUPABASE_JWT_ISSUER não corresponde ao endpoint canônico de SUPABASE_URL");
  }
  if (bruto.SUPABASE_JWKS_URL !== undefined && bruto.SUPABASE_JWKS_URL !== jwksUrl) {
    throw new ConfigError("SUPABASE_JWKS_URL não corresponde ao endpoint canônico de SUPABASE_URL");
  }

  // A credencial de migrations nunca é credencial da aplicação.
  const base = db.user.includes(".") ? db.user.slice(0, db.user.lastIndexOf(".")) : db.user;
  if (USUARIOS_DE_MIGRATION.has(base)) throw new ConfigError(`${databaseVar} usa um papel de migrations`);
  if (bruto.DATABASE_URL_MIGRATIONS && bruto.DATABASE_URL_MIGRATIONS === databaseUrl) {
    throw new ConfigError(`${databaseVar} igual à credencial de migrations`);
  }

  let projectRef: string | null = null;
  if (env === "local" || env === "ci") {
    if (!ehLocal(db) || !ehLocal(api)) {
      throw new ConfigError(`ambiente "${env}" aceita somente endpoints locais`);
    }
  } else {
    if (ehLocal(db) || ehLocal(api)) throw new ConfigError("produção configurada com endpoint local: mistura de ambientes");
    if (api.protocol !== "https:") throw new ConfigError("SUPABASE_URL em produção exige https");
    projectRef = validarProducao(db, api, bruto, politica);
  }

  return {
    env, databaseUrl, supabaseUrl, projectRef,
    jwksUrl, jwtIssuer,
  };
}
