// CR-068: preparação exclusiva do PostgreSQL descartável da CI; nunca usa conexão hospedada.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const LOCAL_URL = 'postgresql://postgres:postgres@127.0.0.1:54422/postgres';
export const OVERLAYS = Object.freeze([
  Object.freeze({path:'deploy/develop/supabase/migrations/20261116202506_harden_application_function_search_paths.sql',sha256:'1eb1ff59a19625fac34f73371e1dee1224f9b6cfe4087f37b8050b1312d26908'}),
  Object.freeze({path:'deploy/develop/supabase/migrations/20261116211348_harden_domain_validator_search_paths.sql',sha256:'a65156b4e48fb3176997290e05630a0da2e41602408f4ad09debaeb53878881a'}),
]);
const signatures = ['app.current_user_id()','app.current_tenant()','app.is_worker()','app.is_operator()',
  'app.tenant_is_authorized()','app.forbid_tenant_change()','brand.evidence_valid(jsonb)',
  'strategy.kpis_valid(jsonb)','strategy.method_valid(jsonb)','strategy.method_complete(jsonb)','strategy.variants_valid(jsonb)'];
const metadata = `select p.oid::regprocedure::text as signature,p.prosrc,p.proowner,p.proacl,p.prosecdef,p.provolatile,p.proconfig
  from pg_catalog.pg_proc p where p.oid=any($1::regprocedure[]) order by p.oid`;
class CiSecurityError extends Error {}
const deny = code => {throw new CiSecurityError(code);};
async function connectLocal() {
  const require = createRequire(new URL('../../packages/infra/package.json',import.meta.url));
  const {Client} = require('pg');
  const client = new Client({connectionString:LOCAL_URL,connectionTimeoutMillis:15000,application_name:'oplyra-ci-security'});
  await client.connect();
  return client;
}

export async function prepareCiSecurity({env=process.env,read=readFileSync,connect=connectLocal}={}) {
  if(env.CI!=='true'||env.GITHUB_ACTIONS!=='true'||env.OPLYRA_ENV!=='ci')deny('CI_SECURITY_ENV');
  if(env.DATABASE_URL_MIGRATIONS!==LOCAL_URL)deny('CI_SECURITY_TARGET');
  // Todos os bytes são conferidos antes de abrir a conexão; o chamador não escolhe SQL ou caminhos.
  const sql=OVERLAYS.map(entry=>{
    const bytes=read(new URL('../../'+entry.path,import.meta.url));
    if(createHash('sha256').update(bytes).digest('hex')!==entry.sha256)deny('CI_SECURITY_HASH');
    return bytes.toString('utf8');
  });
  let client,transaction=false;
  try {
    client=await connect();
    const identity=(await client.query('select current_database() as database, session_user as login')).rows;
    if(identity.length!==1||identity[0].database!=='postgres'||identity[0].login!=='postgres')deny('CI_SECURITY_IDENTITY');
    await client.query('BEGIN');transaction=true;
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='15s'");
    const before=(await client.query(metadata,[signatures])).rows;
    if(before.length!==signatures.length)deny('CI_SECURITY_FUNCTIONS');
    for(const statement of sql)await client.query(statement);
    const after=(await client.query(metadata,[signatures])).rows;
    if(after.length!==before.length)deny('CI_SECURITY_METADATA');
    for(let i=0;i<after.length;i++) {
      const {proconfig:prior,...original}=before[i];
      const {proconfig:current,...actual}=after[i];
      if(JSON.stringify(original)!==JSON.stringify(actual)||JSON.stringify(current)!==JSON.stringify(['search_path=pg_catalog, pg_temp']))deny('CI_SECURITY_METADATA');
    }
    await client.query('COMMIT');transaction=false;
    return {ciSecurityPrepared:true,overlays:2,target:'loopback-ci'};
  } catch(error) {
    if(transaction)await client.query('ROLLBACK').catch(()=>{});
    throw error instanceof CiSecurityError?error:new CiSecurityError('CI_SECURITY_APPLY_FAILED');
  } finally {await client?.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  prepareCiSecurity().then(result=>console.log(JSON.stringify(result))).catch(error=>{
    console.error(error instanceof CiSecurityError?error.message:'CI_SECURITY_FAILED');process.exitCode=2;
  });
}
