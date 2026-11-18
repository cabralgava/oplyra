// Operação privada do proprietário: provisionar empresa somente em DEVELOP.
// Nunca recebe credencial pelo chat nem concede papel/grant ao runtime web.
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { TARGET, ProvisionError, adminOptions, hidden, connectAdmin, scramVerifier, ROLE_QUERY, adminConnectionCode } from './provision-web-login.mjs';
import { SUPABASE_DEVELOP_CA } from '../../packages/infra/src/supabase-develop-ca.ts';
import { criarUnitOfWork } from '../../packages/infra/src/db.ts';
import { tenantRepository, membershipRepository, auditLog } from '../../packages/infra/src/repositories.ts';
import { provisionTenant } from '../../packages/core/src/application/use-cases/provision-tenant.ts';
import { criarAuthGateway } from '../../packages/infra/src/auth.ts';

const deny = code => { throw new ProvisionError(code); };
export const OPS_QUERY = ROLE_QUERY.replaceAll('oplyra_web_login','oplyra_ops_login');
export function assertOperatorRole(role, emptyPassword = true) {
  if (!role || role.rolname !== 'oplyra_ops_login' || role.rolcanlogin !== true
      || ['rolsuper','rolinherit','rolbypassrls','rolcreaterole','rolcreatedb','rolreplication'].some(k=>role[k]!==false)
      || !Array.isArray(role.memberships) || role.memberships.length!==1
      || role.memberships[0].name!=='oplyra_ops_exec' || role.memberships[0].admin!==false
      || role.memberships[0].inherit!==false || role.memberships[0].set!==true) deny('OPS_PAPEL_DIVERGENTE');
  if (emptyPassword && role.password_present!==false) deny('OPS_SENHA_EXISTENTE_NAO_ROTACIONADA');
}
async function begin(admin) {
  await admin.query('BEGIN');
  await admin.query("SET LOCAL lock_timeout='5s'");
  await admin.query("SET LOCAL statement_timeout='15s'");
  await admin.query("SELECT pg_advisory_xact_lock(hashtextextended('oplyra:develop:operator-bootstrap',0))");
}
// O segredo aleatório só vive neste processo. Ao terminar, volta ao estado sem senha.
export async function withTemporaryOperator({admin, work, phase=()=>{}}) {
  let inTransaction=false, attempted=false, established=false;
  const password=randomBytes(32).toString('base64url');
  const verifier=scramVerifier(password);
  try {
    inTransaction=true; await begin(admin);
    const role=await admin.query(OPS_QUERY);
    if(role.rows.length!==1) deny('OPS_PAPEL_AUSENTE');
    assertOperatorRole(role.rows[0]);
    const active=await admin.query("select count(*)::int as active from pg_stat_activity where usename='oplyra_ops_login' and state in ('active','idle in transaction','idle in transaction (aborted)')");
    if(active.rows.length!==1 || active.rows[0].active!==0) deny('OPS_OPERADOR_EM_USO');
    await admin.query("ALTER ROLE oplyra_ops_login PASSWORD '"+verifier+"'");
    attempted=true;
    await admin.query('COMMIT'); inTransaction=false; established=true;
  } catch(error) {
    if(inTransaction) await admin.query('ROLLBACK').catch(()=>{});
    if(attempted) phase('OPS_INICIALIZACAO_INCERTA_NAO_REPETIR');
    throw error instanceof ProvisionError?error:new ProvisionError('OPS_INICIALIZACAO_FALHOU');
  }
  try {
    return await work('postgresql://oplyra_ops_login.'+TARGET.ref+':'+password+'@'+TARGET.pooler+':6543/postgres?sslmode=verify-full');
  } catch(error) {
    if(error instanceof ProvisionError) throw error;
    const transport=adminConnectionCode(error);
    if(transport!=='ADMIN_CONEXAO_FALHOU_NAO_CLASSIFICADA') deny(transport.replace('ADMIN_','OPS_'));
    if(['42501','23505','23503','23514','57014','53300','57P03','40001','40P01'].includes(error?.code)) deny('EMPRESA_BANCO_FALHOU_'+error.code);
    deny('EMPRESA_OPERACAO_FALHOU_CONFERIR_ESTADO');
  } finally {
    if(established) {
      try {
        inTransaction=true; await begin(admin);
        const role=await admin.query(OPS_QUERY); assertOperatorRole(role.rows[0],false);
        const own=await admin.query("select rolpassword = $1 as owned from pg_authid where rolname='oplyra_ops_login'",[verifier]);
        if(own.rows.length!==1 || own.rows[0].owned!==true) deny('OPS_CREDENCIAL_MUDOU_NAO_SOBRESCRITA');
        await admin.query('ALTER ROLE oplyra_ops_login PASSWORD NULL');
        await admin.query('COMMIT'); inTransaction=false;
        phase('OPS_TEMPORARIO_ENCERRADO');
      } catch {
        if(inTransaction) await admin.query('ROLLBACK').catch(()=>{});
        phase('OPS_ENCERRAMENTO_PENDENTE_NAO_REPETIR');
        deny('OPS_ENCERRAMENTO_PENDENTE_NAO_REPETIR');
      }
    }
  }
}
export async function confirmedIdentity(admin,email) {
  if(typeof email!=='string' || !email.trim() || email.length>254) deny('EMAIL_INVALIDO');
  const normalized=email.trim().toLowerCase();
  const r=await admin.query('select id,email_confirmed_at from auth.users where lower(email)=$1',[normalized]);
  if(r.rows.length!==1 || !r.rows[0].email_confirmed_at) deny('USUARIO_AUTH_CONFIRMADO_NAO_ENCONTRADO');
  return {id:r.rows[0].id,email:normalized};
}
// Autentica a pessoa no BFF hospedado. JWT fica apenas na memória deste processo.
export async function authenticateOperator({email,password,chromium,verifyAccessToken}) {
  let browser;
  try {
    const env={};for(const key of ['PATH','HOME','TMPDIR','LANG'])if(process.env[key])env[key]=process.env[key];
    browser=await chromium.launch({headless:true,env,timeout:15000});
    const context=await browser.newContext({ignoreHTTPSErrors:false,acceptDownloads:false});
    const page=await context.newPage();page.setDefaultTimeout(15000);
    const isOrigin=()=>new URL(page.url()).origin===TARGET.origin;
    await page.goto(TARGET.origin+'/entrar');
    if(!isOrigin() || new URL(page.url()).pathname!=='/entrar')deny('OPERADOR_AUTH_ORIGEM_DIVERGENTE');
    await page.getByLabel('E-mail',{exact:true}).fill(email);
    if(!isOrigin())deny('OPERADOR_AUTH_ORIGEM_DIVERGENTE');
    await page.getByLabel('Senha',{exact:true}).fill(password);
    if(!isOrigin())deny('OPERADOR_AUTH_ORIGEM_DIVERGENTE');
    await page.getByRole('button',{name:'Entrar',exact:true}).click();
    await page.waitForURL(/\/empresas|\/entrar\?erro=/);
    if(!isOrigin() || new URL(page.url()).pathname!=='/empresas')deny('OPERADOR_AUTH_NAO_VALIDADO');
    const cookie=(await context.cookies(TARGET.origin)).find(c=>c.name==='oplyra_sessao');
    const now=Date.now()/1000;
    if(!cookie || !cookie.secure || !cookie.httpOnly || cookie.sameSite!=='Lax'
        || cookie.expires<=now || cookie.expires>now+3605)deny('OPERADOR_SESSAO_INSEGURA');
    const token=cookie.value;
    const claims=await verifyAccessToken(token);
    return {claims,revalidate:async()=>{
      try{return await verifyAccessToken(token);}catch{deny('OPERADOR_AUTH_EXPIRADO_REFAZER_LOGIN');}
    }};
  } catch(error) {
    throw error instanceof ProvisionError?error:new ProvisionError('OPERADOR_AUTH_NAO_VALIDADO');
  } finally {await browser?.close().catch(()=>{});}
}
async function main() {
  if(process.argv.length!==3 || process.argv[2]!=='--provision-develop') deny('USE_PROVISION_DEVELOP');
  if(!process.stdin.isTTY || !process.stdout.isTTY || process.env.CLAUDECODE || process.env.CODEX_THREAD_ID) deny('TERMINAL_PRIVADO_PROPRIETARIO_NECESSARIO');
  if(process.env.NODE_OPTIONS || process.execArgv.length || process.env.DEBUG || process.env.PWDEBUG) deny('OPCOES_DE_DEPURACAO_NAO_PERMITIDAS');
  console.log('Somente develop. Cria empresa pelo caso de uso aprovado, com auditoria e Owner.');
  console.log('Usa operador existente com senha aleatória apenas em memória, removida ao terminar. Não altera grants ou web login.');
  console.log('Não alterar o papel operacional em paralelo. Em falha/interrupção, conferir estado antes de repetir.');
  const options=adminOptions(await hidden('Mesma URL administrativa de DEVELOP (oculta): '));
  const require=createRequire(new URL('../../packages/infra/package.json',import.meta.url));
  const {Client}=require('pg'); const admin=new Client(options);admin.on('error',()=>{});
  try {
    await connectAdmin(admin);
    const actor=await confirmedIdentity(admin,await hidden('E-mail que você usou para entrar na Oplyra, responsável pela operação (oculto): '));
    const {chromium}=await import('@playwright/test');
    const issuer='https://'+TARGET.ref+'.supabase.co/auth/v1';
    const gateway=criarAuthGateway(issuer+'/.well-known/jwks.json',issuer);
    const verified=await authenticateOperator({email:actor.email,password:await hidden('Senha dessa conta da Oplyra, não a senha do banco (oculta): '),
      chromium,verifyAccessToken:token=>gateway.verifyAccessToken(token)});
    if(verified.claims.userId!==actor.id)deny('OPERADOR_IDENTIDADE_DIVERGENTE');
    const ownerInput=await hidden('E-mail do Owner da empresa (Enter para usar sua conta, oculto): ');
    const owner=ownerInput?await confirmedIdentity(admin,ownerInput):actor;
    const name=(await hidden('Nome da empresa (oculto): ')).trim();
    const rawSlug=(await hidden('Slug da empresa, letras minúsculas/números/hífens (oculto): ')).trim();
    const reason=(await hidden('Motivo desta operação de develop (oculto): ')).trim();
    if(!name || name.length>200 || !reason || reason.length>500) deny('NOME_OU_MOTIVO_INVALIDO');
    // O mesmo validador do domínio recusa slug inválido antes de habilitar operador.
    const {normalizarSlug}=await import('../../packages/core/src/domain/entities.ts'); const slug=normalizarSlug(rawSlug);
    const found=await admin.query('select exists(select 1 from core.tenants where slug=$1) as present',[slug]);
    if(found.rows[0]?.present!==false) deny('EMPRESA_JA_EXISTE_NAO_REPETIR');
    await verified.revalidate();
    if((await confirmedIdentity(admin,actor.email)).id!==actor.id)deny('OPERADOR_IDENTIDADE_MUDOU');
    const result=await withTemporaryOperator({admin,phase:code=>console.log(code),work:async uri=>{
      const uow=criarUnitOfWork({connectionString:uri,max:1,ssl:{ca:SUPABASE_DEVELOP_CA,rejectUnauthorized:true}});
      uow.pool.on('error',()=>{});
      try {
        const authAdmin={ensureUser:async email=>{
          const live=await confirmedIdentity(admin,email);
          if(live.id!==owner.id) deny('IDENTIDADE_OWNER_MUDOU');
          return live.id;
        }};
        return await provisionTenant({uow,tenants:tenantRepository,memberships:membershipRepository,audit:auditLog,authAdmin},
          {name,slug,ownerEmail:owner.email,reason,operatorId:actor.id});
      } finally {await uow.encerrar();}
    }});
    console.log('EMPRESA_DEVELOP_OWNER_OK');
    console.log('tenantId: '+result.tenantId);
    console.log('ownerMembershipId: '+result.ownerMembershipId);
  } finally {await admin.end().catch(()=>{});}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  main().catch(error=>{console.error(error instanceof ProvisionError?error.message:'OPERACAO_FALHOU_SEM_DETALHES_SENSIVEIS');process.exitCode=1;});
}
