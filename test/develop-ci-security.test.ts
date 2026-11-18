import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
// @ts-ignore — ferramenta de CI sem declarações públicas.
import {prepareCiSecurity,OVERLAYS} from '../deploy/develop/prepare-ci-security.mjs';
const env={CI:'true',GITHUB_ACTIONS:'true',OPLYRA_ENV:'ci',DATABASE_URL_MIGRATIONS:'postgresql://postgres:postgres@127.0.0.1:54422/postgres'};
function fixture({failure=false,changed=false,count=11,login='postgres'}={}) {
 const calls:string[]=[];let reads=0,closed=false;
 const row=(i:number)=>({signature:String(i),prosrc:'body',proowner:10,proacl:null,prosecdef:true,provolatile:'s',proconfig:['search_path=pg_catalog, pg_temp']});
 const client={query:async(sql:string)=>{
  calls.push(sql);
  if(sql.includes('current_database()'))return {rows:[{database:'postgres',login}]};
  if(sql.includes('from pg_catalog.pg_proc')){reads++;return {rows:Array.from({length:count},(_,i)=>({...row(i),...(changed&&reads===2&&i===0?{proowner:20}:{})}))};}
  if(failure&&sql.includes('alter function brand.evidence_valid'))throw new Error('synthetic-private-driver-detail');
  return {rows:[]};
 },end:async()=>{closed=true;}};
 return {calls,closed:()=>closed,run:(over={})=>prepareCiSecurity({env,connect:async()=>client,...over})};
}
describe('CR068: overlays só no banco descartável da CI',()=>{
 it('consumidor não pode trocar caminhos ou hashes pela lista exportada',()=>{
  expect(Object.isFrozen(OVERLAYS)).toBe(true);
  for(const entry of OVERLAYS){expect(Object.isFrozen(entry)).toBe(true);expect(Reflect.set(entry,'path','outro.sql')).toBe(false);expect(Reflect.set(entry,'sha256','0'.repeat(64))).toBe(false);}
 });
 it('recusa ambiente e destino antes de abrir qualquer conexão',async()=>{
  for(const override of [{CI:'false'},{GITHUB_ACTIONS:'false'},{OPLYRA_ENV:'develop'},{DATABASE_URL_MIGRATIONS:'postgresql://postgres:synthetic@db.example.invalid/postgres'},{DATABASE_URL_MIGRATIONS:env.DATABASE_URL_MIGRATIONS+'?sslmode=require'}]){
   const f=fixture();await expect(f.run({env:{...env,...override}})).rejects.toThrow(/CI_SECURITY_ENV|CI_SECURITY_TARGET/);expect(f.calls).toEqual([]);
  }
 });
 it('recusa bytes alterados antes da conexão, sem aceitar SQL escolhido pelo chamador',async()=>{
  const f=fixture();await expect(f.run({read:(p:URL)=>Buffer.concat([readFileSync(p),Buffer.from('\n-- alterado')])})).rejects.toThrow('CI_SECURITY_HASH');expect(f.calls).toEqual([]);
 });
 it('aplica os dois overlays em transação, preserva metadados e fecha o cliente',async()=>{
  const f=fixture();expect(await f.run()).toEqual({ciSecurityPrepared:true,overlays:2,target:'loopback-ci'});
  for(const entry of OVERLAYS)expect(f.calls).toContain(readFileSync(new URL('../'+entry.path,import.meta.url),'utf8'));
  expect(f.calls).toContain('COMMIT');expect(f.calls).not.toContain('ROLLBACK');expect(f.closed()).toBe(true);
  expect(f.calls.some(s=>/insert into supabase_migrations|alter role|grant /i.test(s))).toBe(false);
 });
 it('falha no segundo overlay reverte o primeiro, sem repetir e sem devolver detalhe do driver',async()=>{
  const f=fixture({failure:true});await expect(f.run()).rejects.toThrow(/^CI_SECURITY_APPLY_FAILED$/);
  expect(f.calls).toContain('ROLLBACK');expect(f.calls).not.toContain('COMMIT');expect(f.closed()).toBe(true);
 });
 it('mudança de corpo, owner ou direitos é recusada antes do commit',async()=>{
  const f=fixture({changed:true});await expect(f.run()).rejects.toThrow('CI_SECURITY_METADATA');expect(f.calls).toContain('ROLLBACK');expect(f.calls).not.toContain('COMMIT');
 });
 it('função obrigatória ausente e identidade divergente não viram sucesso',async()=>{
  const f=fixture({count:10});await expect(f.run()).rejects.toThrow('CI_SECURITY_FUNCTIONS');expect(f.calls).not.toContain('COMMIT');
  const g=fixture({login:'outro'});await expect(g.run()).rejects.toThrow('CI_SECURITY_IDENTITY');expect(g.calls).not.toContain('BEGIN');expect(g.closed()).toBe(true);
 });
 it('workflow prepara segurança depois dos papéis locais e antes da suíte completa',()=>{
  const ci=readFileSync(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8');
  const roles=ci.indexOf('run: pnpm db:roles'),security=ci.indexOf('run: node deploy/develop/prepare-ci-security.mjs'),tests=ci.indexOf('run: pnpm verificar');
  expect(roles).toBeGreaterThan(0);expect(security).toBeGreaterThan(roles);expect(tests).toBeGreaterThan(security);
 });
});
