// CR-028 — identidade de ambiente. Configuração de `process.env` não é
// confiável; a evidência do deployment vem de uma política injetada pelo
// composition root. Os testes usam uma política SINTÉTICA própria, que não
// faz parte da allowlist produtiva. Valores de conexão são sintéticos.
import { describe, expect, it } from "vitest";
import {
  APPROVED_DEPLOYMENT_EVIDENCE, carregarConfig, ConfigError, politicaSemProvedorAprovado,
} from "../src/config.ts";
import type { DeploymentEvidencePolicy, TrustedDeploymentContext } from "../src/config.ts";

const REF = "abcdefghij0123456789";
const OUTRO = "zzzzzzzzzz9999999999";
const SENHA = "SENTINELA-senha-nao-pode-vazar-7f3a";
const DEPLOY = "dep-sintetico-42";

const DIRETA = `postgresql://oplyra_web_login:${SENHA}@db.${REF}.supabase.co:5432/postgres`;
const POOLER = `postgresql://oplyra_web_login.${REF}:${SENHA}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`;

const producao = (extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv => ({
  OPLYRA_ENV: "production", SUPABASE_PROJECT_REF: REF, SUPABASE_URL: `https://${REF}.supabase.co`,
  DATABASE_URL_APP: DIRETA, OPLYRA_ENVIRONMENT_FINGERPRINT: `ofp1:production:${REF}:${DEPLOY}`, ...extra,
}) as NodeJS.ProcessEnv;

const local = (extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv => ({
  OPLYRA_ENV: "local", SUPABASE_URL: "http://127.0.0.1:54421",
  DATABASE_URL_APP: `postgresql://oplyra_web_login:${SENHA}@127.0.0.1:54422/postgres`, ...extra,
}) as NodeJS.ProcessEnv;

/** Política sintética de teste: reconhece apenas o provedor fictício abaixo. */
function politicaSintetica(ctx: Partial<TrustedDeploymentContext> | null): DeploymentEvidencePolicy {
  return {
    recognized: [{ provider: "synthetic-test-provider", evidenceSource: "synthetic-reserved-metadata" }],
    readContext: () => ctx === null ? null : {
      environment: "production", deploymentId: DEPLOY, provider: "synthetic-test-provider",
      evidenceSource: "synthetic-reserved-metadata", ...ctx,
    },
  };
}
const CONFIAVEL = politicaSintetica({});

const erro = (f: () => unknown): ConfigError => {
  try { f(); } catch (e) { if (e instanceof ConfigError) return e; throw e; }
  throw new Error("esperava ConfigError");
};

describe("local e ci: somente endpoints locais", () => {
  it.each(["local", "ci"])("%s com banco ou Supabase remoto é sempre recusado", (env) => {
    expect(() => carregarConfig(local({ OPLYRA_ENV: env, DATABASE_URL_APP: DIRETA }))).toThrow(/somente endpoints locais/);
    expect(() => carregarConfig(local({ OPLYRA_ENV: env, SUPABASE_URL: `https://${REF}.supabase.co` }))).toThrow(/somente endpoints locais/);
  });

  it.each(["local", "ci"])("%s local coerente é aceito", (env) => {
    expect(carregarConfig(local({ OPLYRA_ENV: env })).env).toBe(env);
  });

  it("uma evidência confiável não abre exceção para local remoto", () => {
    expect(() => carregarConfig(local({ DATABASE_URL_APP: DIRETA }), { evidencia: CONFIAVEL })).toThrow(/somente endpoints locais/);
  });
});

describe("OPLYRA_ALLOW_REMOTE é obsoleta", () => {
  it.each(["true", "false", "", "1"])("presença com valor %j é recusada em qualquer ambiente", (v) => {
    expect(() => carregarConfig(local({ OPLYRA_ALLOW_REMOTE: v }))).toThrow(/obsoleta/);
    expect(() => carregarConfig(producao({ OPLYRA_ALLOW_REMOTE: v }), { evidencia: CONFIAVEL })).toThrow(/obsoleta/);
  });
});

describe("parsing estrito", () => {
  it.each([
    ["DATABASE_URL_APP", "não é url 127.0.0.1:54422"], ["DATABASE_URL_APP", "postgresql://"],
    ["SUPABASE_URL", "http//127.0.0.1:54421"], ["SUPABASE_URL", "::::"],
  ])("%s malformada é recusada sem busca por substring", (nome, valor) => {
    const e = erro(() => carregarConfig(local({ [nome]: valor })));
    expect(e.message).toMatch(/malformada|sem host|somente endpoints locais/);
    expect(e.message).not.toContain(valor);
  });

  it("host local escondido em URL remota não é aceito", () => {
    expect(() => carregarConfig(local({ DATABASE_URL_APP: `postgresql://u:x@db.${REF}.supabase.co:5432/127.0.0.1` }))).toThrow(/somente endpoints locais/);
    expect(() => carregarConfig(local({ SUPABASE_URL: "https://127.0.0.1.evil.example" }))).toThrow(/somente endpoints locais/);
  });
});

describe("produção", () => {
  it("com endpoint local é recusada", () => {
    expect(() => carregarConfig(producao({ DATABASE_URL_APP: local().DATABASE_URL_APP }), { evidencia: CONFIAVEL })).toThrow(/mistura de ambientes/);
    expect(() => carregarConfig(producao({ SUPABASE_URL: "http://127.0.0.1:54421" }), { evidencia: CONFIAVEL })).toThrow(/mistura de ambientes/);
  });

  it("exige SUPABASE_PROJECT_REF", () => {
    expect(() => carregarConfig(producao({ SUPABASE_PROJECT_REF: undefined }), { evidencia: CONFIAVEL })).toThrow(/SUPABASE_PROJECT_REF/);
  });

  it("refs divergentes entre configuração, Supabase URL, banco direto e pooler são recusados", () => {
    expect(() => carregarConfig(producao({ SUPABASE_URL: `https://${OUTRO}.supabase.co` }), { evidencia: CONFIAVEL })).toThrow(/SUPABASE_URL/);
    expect(() => carregarConfig(producao({ DATABASE_URL_APP: DIRETA.replace(`db.${REF}`, `db.${OUTRO}`) }), { evidencia: CONFIAVEL })).toThrow(/direta nem pooler/);
    expect(() => carregarConfig(producao({ DATABASE_URL_APP: POOLER.replace(`login.${REF}`, `login.${OUTRO}`) }), { evidencia: CONFIAVEL })).toThrow(/pooler/);
    expect(() => carregarConfig(producao({ DATABASE_URL_APP: POOLER.replace(`login.${REF}`, "login") }), { evidencia: CONFIAVEL })).toThrow(/pooler/);
    expect(() => carregarConfig(producao({ SUPABASE_URL: `http://${REF}.supabase.co` }), { evidencia: CONFIAVEL })).toThrow(/SUPABASE_URL/);
  });

  it("conexão direta e pooler coerentes do mesmo ref resolvem para a mesma identidade", () => {
    const d = carregarConfig(producao(), { evidencia: CONFIAVEL });
    const p = carregarConfig(producao({ DATABASE_URL_APP: POOLER }), { evidencia: CONFIAVEL });
    expect([d.env, d.projectRef]).toEqual(["production", REF]);
    expect([p.env, p.projectRef]).toEqual(["production", REF]);
  });

  it("configuração produtiva autocoerente sem evidência confiável é recusada (política padrão)", () => {
    expect(() => carregarConfig(producao())).toThrow(/sem evidência confiável/);
    expect(() => carregarConfig(producao(), { evidencia: politicaSemProvedorAprovado })).toThrow(/sem evidência confiável/);
    expect(() => carregarConfig(producao(), { evidencia: politicaSintetica(null) })).toThrow(/sem evidência confiável/);
  });

  it("a allowlist produtiva está vazia e não contém provedor sintético", () => {
    expect(APPROVED_DEPLOYMENT_EVIDENCE).toEqual([]);
    expect(politicaSemProvedorAprovado.recognized).toBe(APPROVED_DEPLOYMENT_EVIDENCE);
    expect(Object.isFrozen(APPROVED_DEPLOYMENT_EVIDENCE)).toBe(true);
  });

  it.each(["preview", "development", "staging", ""])("evidência de ambiente %j é recusada", (environment) => {
    expect(() => carregarConfig(producao(), { evidencia: politicaSintetica({ environment }) })).toThrow(/não é de produção/);
  });

  it("deployment id divergente é recusado", () => {
    expect(() => carregarConfig(producao(), { evidencia: politicaSintetica({ deploymentId: "outro-deploy" }) })).toThrow(/diverge do deployment/);
    expect(() => carregarConfig(producao(), { evidencia: politicaSintetica({ deploymentId: "" }) })).toThrow(/sem identificador/);
  });

  it("provedor ou fonte de evidência desconhecidos são recusados", () => {
    expect(() => carregarConfig(producao(), { evidencia: politicaSintetica({ provider: "netlify" }) })).toThrow(/não reconhecidos/);
    expect(() => carregarConfig(producao(), { evidencia: politicaSintetica({ evidenceSource: "env:OPLYRA_DEPLOYMENT_ID" }) })).toThrow(/não reconhecidos/);
  });

  it("fingerprint ausente, malformado, de outro ambiente ou de outro projeto é recusado", () => {
    expect(() => carregarConfig(producao({ OPLYRA_ENVIRONMENT_FINGERPRINT: undefined }), { evidencia: CONFIAVEL })).toThrow(/exige OPLYRA_ENVIRONMENT_FINGERPRINT/);
    expect(() => carregarConfig(producao({ OPLYRA_ENVIRONMENT_FINGERPRINT: `ofp2:production:${REF}:${DEPLOY}` }), { evidencia: CONFIAVEL })).toThrow(/formato ofp1/);
    expect(() => carregarConfig(producao({ OPLYRA_ENVIRONMENT_FINGERPRINT: `ofp1:preview:${REF}:${DEPLOY}` }), { evidencia: CONFIAVEL })).toThrow(/outro ambiente/);
    expect(() => carregarConfig(producao({ OPLYRA_ENVIRONMENT_FINGERPRINT: `ofp1:production:${OUTRO}:${DEPLOY}` }), { evidencia: CONFIAVEL })).toThrow(/outro projeto/);
  });

  it("process.env não substitui o contexto confiável", () => {
    const tentativa = producao({
      OPLYRA_DEPLOYMENT_ID: DEPLOY, OPLYRA_DEPLOYMENT_PROVIDER: "synthetic-test-provider",
      OPLYRA_EVIDENCE_SOURCE: "synthetic-reserved-metadata", OPLYRA_TRUSTED_ENVIRONMENT: "production",
    });
    expect(() => carregarConfig(tentativa)).toThrow(/sem evidência confiável/);
  });

  it("configuração produtiva só é aceita com a política sintética injetada pelo teste", () => {
    const c = carregarConfig(producao(), { evidencia: CONFIAVEL });
    expect(c).toMatchObject({ env: "production", projectRef: REF, supabaseUrl: `https://${REF}.supabase.co` });
  });
});

describe("credencial de migrations nunca é credencial da aplicação", () => {
  it("papel postgres (direto ou pooler) é recusado", () => {
    expect(() => carregarConfig(local({ DATABASE_URL_APP: `postgresql://postgres:${SENHA}@127.0.0.1:54422/postgres` }))).toThrow(/papel de migrations/);
    expect(() => carregarConfig(producao({ DATABASE_URL_APP: `postgresql://postgres.${REF}:${SENHA}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres` }), { evidencia: CONFIAVEL })).toThrow(/papel de migrations/);
  });

  it("DATABASE_URL_APP igual a DATABASE_URL_MIGRATIONS é recusada", () => {
    const url = local().DATABASE_URL_APP!;
    expect(() => carregarConfig(local({ DATABASE_URL_MIGRATIONS: url }))).toThrow(/credencial de migrations/);
  });

  it("a CLI de operações valida a própria conexão com as mesmas regras", () => {
    expect(() => carregarConfig(local({ DATABASE_URL_APP: undefined, DATABASE_URL_OPS: DIRETA }), { databaseVar: "DATABASE_URL_OPS" })).toThrow(/somente endpoints locais/);
    expect(carregarConfig(local({ DATABASE_URL_APP: undefined, DATABASE_URL_OPS: `postgresql://oplyra_ops_login:${SENHA}@127.0.0.1:54422/postgres` }), { databaseVar: "DATABASE_URL_OPS" }).env).toBe("local");
  });
});

describe("protocolo, userinfo e percent-encoding (endurecimento do parsing)", () => {
  const BANCO = "postgresql://oplyra_web_login:" + SENHA + "@127.0.0.1:54422/postgres";

  it.each(["postgres", "postgresql"])("banco com protocolo %s é aceito", (proto) => {
    expect(carregarConfig(local({ DATABASE_URL_APP: BANCO.replace("postgresql", proto) })).env).toBe("local");
  });

  it.each(["http", "https", "mysql", "redis", "file", "ftp", "ws"])("banco com protocolo %s é recusado sem repetir o valor", (proto) => {
    const valor = BANCO.replace("postgresql", proto);
    const m = erro(() => carregarConfig(local({ DATABASE_URL_APP: valor }))).message;
    expect(m).toMatch(/protocolo não aceito|malformada/);
    for (const proibido of [SENHA, valor, "oplyra_web_login"]) expect(m).not.toContain(proibido);
  });

  it.each(["postgresql", "ftp", "file", "ws", "redis"])("SUPABASE_URL com protocolo %s é recusada", (proto) => {
    expect(() => carregarConfig(local({ SUPABASE_URL: `${proto}://127.0.0.1:54421` }))).toThrow(/SUPABASE_URL/);
  });

  it.each(["local", "ci"])("SUPABASE_URL http e https locais são aceitas em %s", (env) => {
    expect(carregarConfig(local({ OPLYRA_ENV: env, SUPABASE_URL: "http://127.0.0.1:54421" })).supabaseUrl).toBe("http://127.0.0.1:54421");
    expect(carregarConfig(local({ OPLYRA_ENV: env, SUPABASE_URL: "https://127.0.0.1:54421" })).supabaseUrl).toBe("https://127.0.0.1:54421");
  });

  it("produção recusa SUPABASE_URL em http", () => {
    expect(() => carregarConfig(producao({ SUPABASE_URL: `http://${REF}.supabase.co` }), { evidencia: CONFIAVEL })).toThrow(/exige https/);
  });

  it.each([
    ["usuário e senha", `http://admin:${SENHA}@127.0.0.1:54421`],
    ["somente usuário", `http://SENTINELA-usuario@127.0.0.1:54421`],
    ["somente senha", `http://:${SENHA}@127.0.0.1:54421`],
    ["userinfo vazio", "http://@127.0.0.1:54421"],
    ["query", `http://127.0.0.1:54421?apikey=${SENHA}`],
    ["query vazia", "http://127.0.0.1:54421?"],
    ["fragmento", `http://127.0.0.1:54421#${SENHA}`],
    ["fragmento vazio", "http://127.0.0.1:54421#"],
  ])("SUPABASE_URL com %s é recusada e nada se propaga", (_n, valor) => {
    const m = erro(() => carregarConfig(local({ SUPABASE_URL: valor }))).message;
    expect(m).toMatch(/SUPABASE_URL não aceita/);
    for (const proibido of [SENHA, valor, "SENTINELA-usuario", "admin", "apikey"]) expect(m).not.toContain(proibido);
  });

  it("userinfo, query e fragmento também são recusados em produção", () => {
    for (const sufixo of [`//u:${SENHA}@`, "?x=1", "#x"]) {
      const valor = sufixo.startsWith("//") ? `https://u:${SENHA}@${REF}.supabase.co` : `https://${REF}.supabase.co${sufixo}`;
      expect(() => carregarConfig(producao({ SUPABASE_URL: valor }), { evidencia: CONFIAVEL })).toThrow(/SUPABASE_URL não aceita/);
    }
  });

  it("supabaseUrl, jwksUrl e jwtIssuer aceitos não contêm credencial, query nem fragmento", () => {
    const c = carregarConfig(local());
    for (const v of [c.supabaseUrl, c.jwksUrl, c.jwtIssuer]) {
      expect(v).not.toMatch(/[@?#]/);
      expect(new URL(v).username + new URL(v).password).toBe("");
    }
  });

  it.each([
    ["sem usuário e sem senha", "postgresql://127.0.0.1:54422/postgres"],
    ["arroba sem usuário", "postgresql://@127.0.0.1:54422/postgres"],
    ["usuário vazio com senha", `postgresql://:${SENHA}@127.0.0.1:54422/postgres`],
  ])("banco %s é recusado", (_n, valor) => {
    const m = erro(() => carregarConfig(local({ DATABASE_URL_APP: valor }))).message;
    expect(m).toMatch(/sem usuário/);
    expect(m).not.toContain(SENHA);
  });

  it.each(["%", "%E0%A4%A", "%zz", "abc%", "%C3%28"])("percent-encoding inválido %j no usuário vira ConfigError sem expor o valor", (u) => {
    const valor = `postgresql://${u}:${SENHA}@127.0.0.1:54422/postgres`;
    const e = erro(() => carregarConfig(local({ DATABASE_URL_APP: valor })));
    expect(e).toBeInstanceOf(ConfigError);
    expect(e.message).toMatch(/usuário malformado/);
    for (const proibido of [SENHA, valor, u, "127.0.0.1"]) expect(e.message).not.toContain(proibido);
  });

  it("percent-encoding válido no usuário continua funcionando", () => {
    expect(carregarConfig(local({ DATABASE_URL_APP: `postgresql://oplyra%5Fweb%5Flogin:${SENHA}@127.0.0.1:54422/postgres` })).env).toBe("local");
  });

  it("a validação da conexão da CLI de operações aplica as mesmas regras", () => {
    const ops = (v: string) => carregarConfig(local({ DATABASE_URL_APP: undefined, DATABASE_URL_OPS: v }), { databaseVar: "DATABASE_URL_OPS" });
    expect(() => ops("http://oplyra_ops_login:x@127.0.0.1:54422/postgres")).toThrow(/DATABASE_URL_OPS com protocolo/);
    expect(() => ops("postgresql://:x@127.0.0.1:54422/postgres")).toThrow(/DATABASE_URL_OPS sem usuário/);
    expect(() => ops("postgresql://%zz:x@127.0.0.1:54422/postgres")).toThrow(/DATABASE_URL_OPS com usuário malformado/);
  });
});

describe("identidade dos endpoints de autenticação", () => {
  const LOCAL_ISSUER = "http://127.0.0.1:54421/auth/v1";
  const LOCAL_JWKS = `${LOCAL_ISSUER}/.well-known/jwks.json`;
  const PROD_ISSUER = `https://${REF}.supabase.co/auth/v1`;
  const PROD_JWKS = `${PROD_ISSUER}/.well-known/jwks.json`;
  const prod = (extra: Record<string, string | undefined>) => carregarConfig(producao(extra), { evidencia: CONFIAVEL });
  const SEM_VAZAMENTO = [SENHA, DIRETA, "evil.example", OUTRO, "127.0.0.1", "supabase.co", "apikey", "SENTINELA-usuario"];

  it("valores derivados: local e produção", () => {
    const l = carregarConfig(local());
    expect([l.supabaseUrl, l.jwtIssuer, l.jwksUrl]).toEqual(["http://127.0.0.1:54421", LOCAL_ISSUER, LOCAL_JWKS]);
    const p = prod({});
    expect([p.supabaseUrl, p.jwtIssuer, p.jwksUrl]).toEqual([`https://${REF}.supabase.co`, PROD_ISSUER, PROD_JWKS]);
  });

  it("overrides canônicos são aceitos (compatibilidade), em local, ci e produção", () => {
    for (const env of ["local", "ci"]) {
      expect(carregarConfig(local({ OPLYRA_ENV: env, SUPABASE_JWT_ISSUER: LOCAL_ISSUER, SUPABASE_JWKS_URL: LOCAL_JWKS })).jwksUrl).toBe(LOCAL_JWKS);
    }
    const p = prod({ SUPABASE_JWT_ISSUER: PROD_ISSUER, SUPABASE_JWKS_URL: PROD_JWKS });
    expect([p.jwtIssuer, p.jwksUrl]).toEqual([PROD_ISSUER, PROD_JWKS]);
  });

  it("SUPABASE_URL com barra final é normalizada e deriva os mesmos endpoints", () => {
    const c = carregarConfig(local({ SUPABASE_URL: "http://127.0.0.1:54421/" }));
    expect([c.supabaseUrl, c.jwtIssuer, c.jwksUrl]).toEqual(["http://127.0.0.1:54421", LOCAL_ISSUER, LOCAL_JWKS]);
  });

  it.each([
    ["JWKS remoto", { SUPABASE_JWKS_URL: "https://evil.example/auth/v1/.well-known/jwks.json" }, /SUPABASE_JWKS_URL/],
    ["issuer remoto", { SUPABASE_JWT_ISSUER: "https://evil.example/auth/v1" }, /SUPABASE_JWT_ISSUER/],
    ["JWKS do projeto remoto", { SUPABASE_JWKS_URL: PROD_JWKS }, /SUPABASE_JWKS_URL/],
    ["issuer com userinfo", { SUPABASE_JWT_ISSUER: `http://u:${SENHA}@127.0.0.1:54421/auth/v1` }, /SUPABASE_JWT_ISSUER/],
    ["issuer vazio", { SUPABASE_JWT_ISSUER: "" }, /SUPABASE_JWT_ISSUER/],
  ])("local e ci: %s é recusado sem vazar valores", (_n, extra, re) => {
    for (const env of ["local", "ci"]) {
      const m = erro(() => carregarConfig(local({ OPLYRA_ENV: env, ...extra }))).message;
      expect(m).toMatch(re);
      for (const v of Object.values(extra)) if (v) expect(m).not.toContain(v);
      for (const proibido of SEM_VAZAMENTO) expect(m).not.toContain(proibido);
    }
  });

  const OVERRIDES: [string, "SUPABASE_JWT_ISSUER" | "SUPABASE_JWKS_URL", string][] = [
    ["outro projeto", "SUPABASE_JWT_ISSUER", `https://${OUTRO}.supabase.co/auth/v1`],
    ["outro projeto", "SUPABASE_JWKS_URL", `https://${OUTRO}.supabase.co/auth/v1/.well-known/jwks.json`],
    ["outro host", "SUPABASE_JWT_ISSUER", "https://evil.example/auth/v1"],
    ["outro host", "SUPABASE_JWKS_URL", "https://evil.example/auth/v1/.well-known/jwks.json"],
    ["outro protocolo", "SUPABASE_JWT_ISSUER", `http://${REF}.supabase.co/auth/v1`],
    ["outro protocolo", "SUPABASE_JWKS_URL", `http://${REF}.supabase.co/auth/v1/.well-known/jwks.json`],
    ["outro path", "SUPABASE_JWT_ISSUER", `https://${REF}.supabase.co/auth/v2`],
    ["outro path", "SUPABASE_JWKS_URL", `https://${REF}.supabase.co/keys.json`],
    ["barra final", "SUPABASE_JWT_ISSUER", `${PROD_ISSUER}/`],
    ["query", "SUPABASE_JWKS_URL", `${PROD_JWKS}?x=1`],
    ["fragmento", "SUPABASE_JWKS_URL", `${PROD_JWKS}#x`],
    ["porta explícita", "SUPABASE_JWT_ISSUER", `https://${REF}.supabase.co:8443/auth/v1`],
    ["host local", "SUPABASE_JWKS_URL", LOCAL_JWKS],
  ];
  it.each(OVERRIDES)("produção com project ref, fingerprint e contexto corretos: override de %s em %s é recusado", (_n, nome, valor) => {
    const m = erro(() => prod({ [nome]: valor })).message;
    expect(m).toContain(nome);
    for (const proibido of [...SEM_VAZAMENTO, valor]) expect(m).not.toContain(proibido);
  });

  it.each([
    `https://${REF}.supabase.co/auth/v1`, `https://${REF}.supabase.co/x`, "http://127.0.0.1:54421/rest/v1",
  ])("SUPABASE_URL com path arbitrário é recusada sem vazar valor (%s)", (valor) => {
    const env = valor.includes("supabase.co") ? producao({ SUPABASE_URL: valor }) : local({ SUPABASE_URL: valor });
    const m = erro(() => carregarConfig(env, { evidencia: CONFIAVEL })).message;
    expect(m).toMatch(/SUPABASE_URL não aceita path/);
    for (const proibido of [...SEM_VAZAMENTO, valor, "/x", "rest/v1"]) expect(m).not.toContain(proibido);
  });

  it("caminho equivalente a vazio, após normalização, continua aceito", () => {
    expect(carregarConfig(local({ SUPABASE_URL: "http://127.0.0.1:54421/a/../" })).jwtIssuer).toBe(LOCAL_ISSUER);
  });
});

describe("mensagens de erro sem valores sensíveis", () => {
  const casos: [string, () => unknown][] = [
    ["local remoto", () => carregarConfig(local({ DATABASE_URL_APP: DIRETA }))],
    ["pooler divergente", () => carregarConfig(producao({ DATABASE_URL_APP: POOLER.replace(`login.${REF}`, `login.${OUTRO}`) }), { evidencia: CONFIAVEL })],
    ["sem evidência", () => carregarConfig(producao())],
    ["papel de migrations", () => carregarConfig(local({ DATABASE_URL_APP: `postgresql://postgres:${SENHA}@127.0.0.1:54422/postgres` }))],
    ["malformada", () => carregarConfig(local({ DATABASE_URL_APP: `lixo://${SENHA}` }))],
    ["provedor desconhecido", () => carregarConfig(producao(), { evidencia: politicaSintetica({ provider: `x-${SENHA}` }) })],
  ];
  it.each(casos)("%s: sem senha, usuário, URL completa ou metadado bruto", (_n, f) => {
    const m = erro(f).message;
    for (const proibido of [SENHA, DIRETA, POOLER, "oplyra_web_login", "@db.", "pooler.supabase.com", `x-${SENHA}`]) {
      expect(m).not.toContain(proibido);
    }
  });
});
