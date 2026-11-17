import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { TARGET, ROLE_QUERY, adminOptions, assertRole, scramVerifier, webUrl, provision, netlifyApi } from './provision-web-login.mjs';

const minimal = () => ({ rolname: TARGET.role, rolcanlogin: true, rolsuper: false, rolinherit: false,
  rolbypassrls: false, rolcreaterole: false, rolcreatedb: false, rolreplication: false,
  password_present: false, memberships: [{ name: 'authenticated', admin: false, inherit: false, set: true }] });
const site = () => ({ id: TARGET.site, name: TARGET.name, url: TARGET.origin, ssl_url: TARGET.origin, account_slug: TARGET.account,
  account_id: '12345678-1234-1234-1234-123456789abc' });
function fixture({ role = minimal(), target = site(), existing = null, fail, metadata } = {}) {
  const calls = [], phases = [];
  let stored;
  const admin = { query: async sql => {
    calls.push(['sql', sql]);
    if (fail === 'commit' && sql === 'COMMIT') throw new Error('private admin password');
    return { rows: sql.includes('from pg_roles r join pg_authid') ? [role] : [] };
  } };
  const api = async (method, path, body) => {
    calls.push(['api', method, path]);
    if (path.startsWith('/sites/')) return target;
    if (method === 'POST') {
      if (fail === 'post') throw new Error('private token');
      stored = body[0];
      return body;
    }
    return stored ? (metadata ? metadata(stored) : stored) : existing;
  };
  const verifyLogin = async uri => { calls.push(['login', uri]); if (fail === 'login') throw new Error(uri); };
  return { calls, phases, run: () => provision({ admin, api, verifyLogin, phase: p => phases.push(p) }), stored: () => stored };
}

test('URL administrativa aceita exclusivamente develop e força TLS validado', () => {
  for (const authority of [`postgres@db.${TARGET.ref}.supabase.co:5432`, `postgres.${TARGET.ref}@${TARGET.pooler}:6543`]) {
    const [user, host] = authority.split('@');
    const cfg = adminOptions(`postgresql://${user}:synthetic-only@${host}/postgres?sslmode=require`);
    assert.equal(cfg.ssl.rejectUnauthorized, true);
    assert.equal(new URL(cfg.connectionString).search, '');
  }
});
test('recusa produção, outro projeto, TLS ausente/desligado e opções arbitrárias', () => {
  const base = `postgresql://postgres.${TARGET.ref}:synthetic-only@${TARGET.pooler}:6543/postgres?sslmode=verify-full`;
  for (const value of [null, '', base.replace(TARGET.ref,'hysigyhfpyyydycxxpsm'), base.replace(TARGET.ref,'anotherproject'),
    base.replace(TARGET.pooler,'example.com'),base.replace('postgres.',`${TARGET.role}.`),
    base.replace('verify-full','disable'),base.replace('?sslmode=verify-full',''), `${base}&options=-c`,
    `${base}&sslmode=require`,`${base}#x`,base.replace('/postgres?','/other?'),base.replace(':6543',':1234')]) {
    assert.throws(() => adminOptions(value), /ADMIN_URL_INVALIDA/);
  }
});
test('recusa privilégios, papel extra e membership com administração/herança', () => {
  for (const key of ['rolsuper','rolinherit','rolbypassrls','rolcreaterole','rolcreatedb','rolreplication']) {
    assert.throws(() => assertRole({ ...minimal(), [key]: true }), /PAPEL_NAO_MINIMO/);
  }
  for (const memberships of [[],[{name:'postgres',admin:false,inherit:false,set:true}],
    [{name:'authenticated',admin:true,inherit:false,set:true}],
    [{name:'authenticated',admin:false,inherit:true,set:true}],
    [...minimal().memberships,{name:'service_role',admin:false,inherit:false,set:true}]]) {
    assert.throws(() => assertRole({...minimal(),memberships}), /PAPEL_NAO_MINIMO/);
  }
  assert.throws(() => assertRole({...minimal(),password_present:true}), /SENHA_JA_EXISTENTE/);
});
test('verificador SCRAM confere com as primitivas do driver pg instalado', async () => {
  const require = createRequire(new URL('../../packages/infra/package.json', import.meta.url));
  const crypto = require('pg/lib/crypto/utils.js');
  const password = 'a'.repeat(43), salt = Buffer.alloc(16, 7);
  const salted = await crypto.deriveKey(password,salt,4096);
  const client = await crypto.hmacSha256(salted,'Client Key');
  const stored = Buffer.from(await crypto.sha256(client)).toString('base64');
  const server = Buffer.from(await crypto.hmacSha256(salted,'Server Key')).toString('base64');
  assert.equal(scramVerifier(password,salt),`SCRAM-SHA-256$4096:${salt.toString('base64')}$${stored}:${server}`);
  assert.throws(() => scramVerifier("quote'"), /SEGREDO_INVALIDO/);
});
test('sucesso envia somente verificador ao SQL e segredo ao site/contexto exatos, antes do commit', async () => {
  const f = fixture();
  assert.deepEqual(await f.run(),{loginVerified:true,secretInstalled:true,deployed:false});
  const stored = f.stored();
  assert.equal(stored.is_secret,true);
  assert.deepEqual(stored.scopes,['builds','functions']);
  assert.equal(stored.values.length,1); assert.equal(stored.values[0].context,'production');
  const url = new URL(stored.values[0].value);
  assert.equal(url.username,`${TARGET.role}.${TARGET.ref}`);
  assert.equal(url.hostname,TARGET.pooler); assert.equal(url.search,'?sslmode=verify-full');
  const sql = f.calls.filter(c=>c[0]==='sql').map(c=>c[1]).join('\n');
  assert.ok(!sql.includes(url.password)); assert.match(sql,/ALTER ROLE oplyra_web_login PASSWORD 'SCRAM-SHA-256\$/);
  const post = f.calls.findIndex(c=>c[0]==='api'&&c[1]==='POST');
  const commit = f.calls.findIndex(c=>c[1]==='COMMIT');
  const login = f.calls.findIndex(c=>c[0]==='login');
  assert.ok(post < commit && commit < login);
  assert.deepEqual(f.phases,['SEGREDO_INSTALADO_LOGIN_A_VALIDAR','LOGIN_MINIMO_DEVELOP_OK']);
  assert.ok(!f.calls.some(c=>c.join(' ').includes('/deploy')));
});
for (const key of ['id','name','url','ssl_url','account_slug','account_id']) test(`site divergente (${key}) não inicia alteração`, async () => {
  const f = fixture({target:{...site(),[key]:'wrong'}});
  await assert.rejects(f.run(),/SITE_DIVERGENTE/);
  assert.ok(!f.calls.some(c=>c[0]==='sql'||c[1]==='POST'));
});
test('variável existente não é lida em log nem sobrescrita', async () => {
  const f = fixture({existing:{key:'DATABASE_URL_APP',value:'private'}});
  await assert.rejects(f.run(),/VARIAVEL_JA_EXISTENTE/);
  assert.ok(!f.calls.some(c=>c[0]==='sql'||c[1]==='POST'));
});
test('senha existente não é rotacionada', async () => {
  const f = fixture({role:{...minimal(),password_present:true}});
  await assert.rejects(f.run(),/SENHA_JA_EXISTENTE/);
  assert.ok(f.calls.some(c=>c[1]==='ROLLBACK'));
  assert.ok(!f.calls.some(c=>c[1]==='POST'||c[1].startsWith?.('ALTER ROLE')));
});
test('falha de API reverte senha e não repete nem mostra detalhes privados', async () => {
  const f = fixture({fail:'post'});
  await assert.rejects(f.run(),/^ProvisionError: PROVISIONAMENTO_FALHOU_SEM_DETALHES_SENSIVEIS$/);
  assert.equal(f.calls.filter(c=>c[1]==='POST').length,1);
  assert.ok(f.calls.some(c=>c[1]==='ROLLBACK')); assert.ok(!f.calls.some(c=>c[1]==='COMMIT'));
  assert.deepEqual(f.phases,['INSTALACAO_PARCIAL_POSSIVEL_NAO_REPETIR_NEM_PUBLICAR']);
});
for (const metadata of [env=>({...env,is_secret:false}),env=>({...env,scopes:['builds','functions','post-processing']}),
  env=>({...env,values:[{context:'all'}]}),env=>({...env,values:[{context:'production'},{context:'deploy-preview'}]})]) {
  test('escopo ampliado/segredo desmarcado reverte sem commit', async () => {
    const f = fixture({metadata}); await assert.rejects(f.run(),/ESCOPO_DO_SEGREDO_DIVERGENTE/);
    assert.ok(f.calls.some(c=>c[1]==='ROLLBACK')); assert.ok(!f.calls.some(c=>c[1]==='COMMIT'));
  });
}
test('falha de commit fica ambígua, sem repetir/validar/afirmar sucesso', async () => {
  const f = fixture({fail:'commit'}); await assert.rejects(f.run(),/SEM_DETALHES_SENSIVEIS/);
  assert.ok(!f.calls.some(c=>c[0]==='login')); assert.ok(!f.phases.includes('LOGIN_MINIMO_DEVELOP_OK'));
  assert.deepEqual(f.phases,['INSTALACAO_PARCIAL_POSSIVEL_NAO_REPETIR_NEM_PUBLICAR']);
});
test('falha do login após commit não imprime URI nem rotaciona novamente', async () => {
  const f = fixture({fail:'login'}); await assert.rejects(f.run(),/SEM_DETALHES_SENSIVEIS/);
  assert.equal(f.calls.filter(c=>c[1]==='COMMIT').length,1);
  assert.deepEqual(f.phases,['SEGREDO_INSTALADO_LOGIN_A_VALIDAR','LOGIN_NAO_VALIDADO_NAO_REPETIR_NEM_PUBLICAR']);
});
test('cliente Netlify recusa redirect e não expõe erro/resposta/token', async () => {
  let options;
  const api = await netlifyApi('synthetic-token',async (_,o)=>{ options=o;return {status:403,ok:false,json:()=>{throw new Error('must not read');}}; });
  await assert.rejects(api('GET','/sites/synthetic'),/^ProvisionError: NETLIFY_HTTP_403$/);
  assert.equal(options.redirect,'error'); assert.equal(options.headers.Authorization,'Bearer synthetic-token');
});
test('URL da aplicação usa exclusivamente login e branch mínimos', () => {
  const url = new URL(webUrl('a'.repeat(43)));
  assert.equal(url.username,`${TARGET.role}.${TARGET.ref}`); assert.equal(url.port,'6543');
});

test('Netlify pode informar URL HTTP e ssl_url HTTPS canônica sem mudar o destino', async () => {
  const f = fixture({target:{...site(),url:TARGET.origin.replace('https:','http:')}});
  assert.equal((await f.run()).loginVerified,true);
});

// Não há CAS entre PostgreSQL e Netlify: o lock serializa apenas este provisionador.
test('variável criada durante a espera do lock não é sobrescrita', async () => {
  let reads = 0; const writes = [];
  const admin = { query: async sql => { writes.push(sql); return {rows:sql === ROLE_QUERY ? [minimal()] : []}; } };
  const api = async (method,path) => {
    if(path.startsWith('/sites/')) return site();
    assert.equal(method,'GET');
    return ++reads === 1 ? null : {key:'DATABASE_URL_APP'};
  };
  await assert.rejects(provision({admin,api,verifyLogin:async()=>assert.fail('login inesperado')}),/VARIAVEL_JA_EXISTENTE/);
  assert.ok(writes.includes('ROLLBACK'));
  assert.ok(!writes.some(sql=>sql.startsWith('ALTER ROLE')||sql==='COMMIT'));
});
