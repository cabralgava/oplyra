import { describe, it, expect } from "vitest";
import { criarUnitOfWork } from "../src/db.ts";
import { SUPABASE_DEVELOP_CA } from "../src/supabase-develop-ca.ts";
const url="postgresql://oplyra_web_login.eqpvjydnqbbawpkeizys:synthetic-only@aws-1-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=verify-full";
const ssl={ca:SUPABASE_DEVELOP_CA,rejectUnauthorized:true as const};
describe("TLS do pool develop (sem conexão)",()=>{
  it("CA explícita chega ao driver e sslmode não substitui a validação",async()=>{
    const u=criarUnitOfWork({connectionString:url,ssl});
    try { expect(u.pool.options.ssl).toEqual(ssl);expect(new URL(u.pool.options.connectionString!).search).toBe(""); }finally{await u.encerrar();}
  });
  it("local sem TLS explícito preserva conexão e configuração anteriores",async()=>{
    const local="postgresql://local:synthetic@127.0.0.1:54422/postgres";
    const u=criarUnitOfWork({connectionString:local});
    try{expect(u.pool.options.connectionString).toBe(local);expect(u.pool.options.ssl).toBeFalsy();}finally{await u.encerrar();}
  });
  it("recusa URL que tenta desligar SSL ou substituir certificados",()=>{
    for(const bad of [url.replace('verify-full','disable'),url+'&sslrootcert=/tmp/other',url+'&sslmode=require'])
      expect(()=>criarUnitOfWork({connectionString:bad,ssl})).toThrow('configuração TLS inválida');
    expect(()=>criarUnitOfWork({connectionString:url,ssl:{ca:'',rejectUnauthorized:true}})).toThrow();
    expect(()=>criarUnitOfWork({connectionString:url,ssl:{ca:SUPABASE_DEVELOP_CA,rejectUnauthorized:false} as never})).toThrow();
  });
});
