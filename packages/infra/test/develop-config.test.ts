import { describe,expect,it } from "vitest";
import { carregarConfigDevelop,DEVELOP_TARGET } from "../src/develop-config.ts";
import { carregarConfig } from "../src/config.ts";
const SITE=DEVELOP_TARGET.netlifySiteId;
const SECRET="SOMENTE-TESTE-CR057";
const ref=DEVELOP_TARGET.projectRef;
const valid=():NodeJS.ProcessEnv=>({OPLYRA_ENV:"develop",SUPABASE_PROJECT_REF:ref,
  SUPABASE_URL:`https://${ref}.supabase.co`,NEXT_PUBLIC_SUPABASE_URL:`https://${ref}.supabase.co`,
  NEXT_PUBLIC_APP_URL:DEVELOP_TARGET.appOrigin,SITE_NAME:"oplyra-develop",SITE_ID:SITE,OPLYRA_NETLIFY_SITE_ID:SITE,URL:DEVELOP_TARGET.appOrigin,
  DATABASE_URL_APP:`postgresql://oplyra_web_login.${ref}:${SECRET}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require`});
describe("CR-057: develop remoto isolado",()=>{
  it("aceita conexão mínima e metadados coerentes; Auth vem do projeto develop",()=>{
    expect(carregarConfigDevelop(valid())).toMatchObject({env:"develop",projectRef:ref,jwtIssuer:`https://${ref}.supabase.co/auth/v1`,appUrl:DEVELOP_TARGET.appOrigin});
  });
  it("aceita conexão direta do mesmo projeto e verify-full",()=>{
    const env=valid();env.DATABASE_URL_APP=`postgresql://oplyra_web_login:${SECRET}@db.${ref}.supabase.co:5432/postgres?sslmode=verify-full`;
    expect(carregarConfigDevelop(env).env).toBe("develop");
  });
  it.each(["OPLYRA_ENV","SUPABASE_PROJECT_REF","SUPABASE_URL","NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_APP_URL","SITE_NAME","SITE_ID","OPLYRA_NETLIFY_SITE_ID","URL","DATABASE_URL_APP"])("recusa ausência de %s",key=>{
    const env=valid();delete env[key];expect(()=>carregarConfigDevelop(env)).toThrow();
  });
  it.each([
    ["OPLYRA_ENV","local"],["OPLYRA_ENV","production"],["SUPABASE_PROJECT_REF",DEVELOP_TARGET.parentProjectRef],
    ["SUPABASE_URL",`https://${DEVELOP_TARGET.parentProjectRef}.supabase.co`],["NEXT_PUBLIC_SUPABASE_URL","https://outro.supabase.co"],
    ["NEXT_PUBLIC_APP_URL","https://app.oplyra.io"],["URL","https://outro.netlify.app"],["SITE_NAME","oplyra-production"],
    ["SITE_ID","00000000-2222-4333-8444-555555555555"],["OPLYRA_NETLIFY_SITE_ID","falso"],
    ["SUPABASE_URL",`https://${ref}.supabase.co/?x=1`],["SUPABASE_URL",`https://${ref}.supabase.co/auth`],
    ["SUPABASE_JWT_ISSUER","https://outro/auth/v1"],["SUPABASE_JWKS_URL","http://127.0.0.1/jwks"],
    ["OPLYRA_ALLOW_REMOTE",""],["DATABASE_URL_MIGRATIONS",""]
  ])("recusa %s divergente",(key,value)=>{expect(()=>carregarConfigDevelop({...valid(),[key]:value})).toThrow();});
  it.each([
    `postgresql://postgres:${SECRET}@db.${ref}.supabase.co/postgres?sslmode=require`,
    `postgresql://oplyra_web_login:${SECRET}@db.${DEVELOP_TARGET.parentProjectRef}.supabase.co/postgres?sslmode=require`,
    `postgresql://oplyra_web_login.outro:${SECRET}@aws-0-sa-east-1.pooler.supabase.com/postgres?sslmode=require`,
    `postgresql://oplyra_web_login:${SECRET}@127.0.0.1:54422/postgres?sslmode=require`,
    `postgresql://oplyra_web_login:${SECRET}@db.${ref}.supabase.co/postgres`,
    `postgresql://oplyra_web_login:${SECRET}@db.${ref}.supabase.co/postgres?sslmode=disable`,
    `postgresql://oplyra_web_login:${SECRET}@db.${ref}.supabase.co/postgres?sslmode=require&sslmode=disable`,
    `postgresql://oplyra_web_login:${SECRET}@db.${ref}.supabase.co/postgres?sslmode=require&options=evil`,
    `postgresql://oplyra_web_login:${SECRET}@db.${ref}.supabase.co/postgres?sslmode=require#fragmento`,
    `postgresql://oplyra_web_login:${SECRET}@db.${ref}.supabase.co:54422/postgres?sslmode=require`,
    `postgresql://oplyra_web_login:${SECRET}@db.${ref}.supabase.co/outro?sslmode=require`,
    `postgresql://oplyra_web_login@db.${ref}.supabase.co/postgres?sslmode=require`,
    `postgresql://%ZZ:${SECRET}@db.${ref}.supabase.co/postgres?sslmode=require`,
  ])("recusa banco/role/SSL malformado sem vazar conexão",url=>{
    try {carregarConfigDevelop({...valid(),DATABASE_URL_APP:url});expect.fail("deveria recusar");}
    catch(error){expect(error).toBeInstanceOf(Error);expect(String(error)).not.toContain(SECRET);expect(String(error)).not.toContain(url);}
  });
  it("dois IDs coerentes entre si não substituem o site fixado",()=>{
    expect(()=>carregarConfigDevelop({...valid(),SITE_ID:"11111111-2222-4333-8444-555555555555",OPLYRA_NETLIFY_SITE_ID:"11111111-2222-4333-8444-555555555555"})).toThrow(/SITE_ID/);
  });
  it.each(["local","ci"])("loader existente de %s continua recusando o remoto",env=>{
    expect(()=>carregarConfig({...valid(),OPLYRA_ENV:env})).toThrow(/somente endpoints locais/);
  });
  it("loader legado não ativa develop nem libera produção por associação",()=>{
    expect(()=>carregarConfig(valid())).toThrow(/OPLYRA_ENV inválido/);
    expect(()=>carregarConfig({...valid(),OPLYRA_ENV:"production"})).toThrow(/sem evidência/);
  });
});
