import { describe, expect, it } from "vitest";
import { carregarConfig, politicaSemProvedorAprovado, ConfigError } from "../src/config.ts";
import { carregarConfigDevelop, DEVELOP_TARGET } from "../src/develop-config.ts";

// Reprodução do HTTP 500 em /entrar no site oplyra-develop (17/11/2026).
// `apps/web/src/lib/deps.ts` valida a configuração ao ser importado; qualquer ConfigError derruba TODA rota
// que o importe (inclusive /entrar). A versão commitada em HEAD usa só `carregarConfig` (local/ci/production).
// Não prova a causa no site hospedado (sem acesso aos logs da função); mostra que cada cenário abaixo vira 500.
const ref = DEVELOP_TARGET.projectRef;
const SEGREDO = "SOMENTE-TESTE-500";
const completo = (): NodeJS.ProcessEnv => ({
  OPLYRA_ENV: "develop", SUPABASE_PROJECT_REF: ref,
  SUPABASE_URL: `https://${ref}.supabase.co`, NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
  NEXT_PUBLIC_APP_URL: DEVELOP_TARGET.appOrigin, SITE_NAME: "oplyra-develop",
  SITE_ID: DEVELOP_TARGET.netlifySiteId, OPLYRA_NETLIFY_SITE_ID: DEVELOP_TARGET.netlifySiteId, URL: DEVELOP_TARGET.appOrigin,
  DATABASE_URL_APP: `postgresql://oplyra_web_login.${ref}:${SEGREDO}@aws-1-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require`,
});
const antigo = (env: NodeJS.ProcessEnv) => carregarConfig(env, { evidencia: politicaSemProvedorAprovado });

describe("500 em /entrar: cenários de configuração", () => {
  it("HEAD (carregarConfig) não conhece develop: a configuração completa de develop é recusada", () => {
    expect(() => antigo(completo())).toThrow("OPLYRA_ENV inválido");
  });
  it("sem variáveis de runtime, o import falha por configuração incompleta", () => {
    expect(() => antigo({})).toThrow(/configuração incompleta: OPLYRA_ENV, DATABASE_URL_APP, SUPABASE_URL/);
  });
  it("marcadores do build (netlify.toml) vazando para o runtime recusam endpoint remoto", () => {
    const env = { ...completo(), OPLYRA_ENV: "local" };
    expect(() => antigo(env)).toThrow(/aceita somente endpoints locais/);
    expect(() => carregarConfigDevelop(env)).toThrow("este loader exige OPLYRA_ENV=develop");
  });
  it("develop sem a senha do login web (DATABASE_URL_APP ausente) falha no loader de develop", () => {
    const env = completo(); delete env.DATABASE_URL_APP;
    expect(() => carregarConfigDevelop(env)).toThrow("DATABASE_URL_APP inválida");
  });
  it("com a configuração completa, o loader de develop sobe", () => {
    expect(carregarConfigDevelop(completo()).env).toBe("develop");
  });
  it("nenhuma mensagem de erro repete valor de segredo", () => {
    const casos: NodeJS.ProcessEnv[] = [completo(), { ...completo(), SITE_NAME: "x" }, { ...completo(), SUPABASE_URL: SEGREDO }];
    for (const env of casos) {
      for (const f of [antigo, carregarConfigDevelop]) {
        try { f(env); } catch (e) {
          expect(e).toBeInstanceOf(ConfigError);
          expect((e as Error).message).not.toContain(SEGREDO);
        }
      }
    }
  });
});
