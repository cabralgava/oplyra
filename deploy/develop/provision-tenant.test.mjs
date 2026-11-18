import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {withTemporaryOperator,assertOperatorRole,confirmedIdentity,authenticateOperator,OPS_QUERY} from './provision-tenant.mjs';
import {TARGET} from './provision-web-login.mjs';

const role=()=>({rolname:'oplyra_ops_login',rolcanlogin:true,rolsuper:false,rolinherit:false,
  rolbypassrls:false,rolcreaterole:false,rolcreatedb:false,rolreplication:false,password_present:false,
  memberships:[{name:'oplyra_ops_exec',admin:false,inherit:false,set:true}]});
function fixture({profile=role(),workError=false,workCode,owned=true,commitFailure=false,cleanupFailure=false,active=0}={}) {
  const calls=[],phases=[];let commits=0;let uri;
  const admin={query:async(sql,params)=>{
    calls.push({sql,params});
    if(sql===OPS_QUERY)return {rows:[profile]};
    if(sql.includes('pg_stat_activity'))return {rows:[{active}]};
    if(sql.includes('rolpassword = $1'))return {rows:[{owned}]};
    if(sql==='COMMIT'&&++commits===1&&commitFailure)throw new Error('synthetic-private-driver-value');
    if(sql==='ALTER ROLE oplyra_ops_login PASSWORD NULL'&&cleanupFailure)throw new Error('synthetic-private-cleanup-value');
    return {rows:[]};
  }};
  return {calls,phases,getUri:()=>uri,run:()=>withTemporaryOperator({admin,phase:s=>phases.push(s),work:async value=>{
    uri=value;if(workCode)throw Object.assign(new Error(value),{code:workCode});if(workError)throw new Error(value);return {tenantId:'synthetic-tenant'};
  }})};
}
test('papel mínimo operacional exige ausência de senha e exatamente o vínculo aprovado',()=>{
  assert.doesNotThrow(()=>assertOperatorRole(role()));
  for(const field of ['rolsuper','rolinherit','rolbypassrls','rolcreaterole','rolcreatedb','rolreplication'])
    assert.throws(()=>assertOperatorRole({...role(),[field]:true}),/OPS_PAPEL_DIVERGENTE/);
  for(const memberships of [[],[{name:'authenticated',admin:false,inherit:false,set:true}],
    [{name:'oplyra_ops_exec',admin:true,inherit:false,set:true}],
    [{name:'oplyra_ops_exec',admin:false,inherit:true,set:true}]])
    assert.throws(()=>assertOperatorRole({...role(),memberships}),/OPS_PAPEL_DIVERGENTE/);
  assert.throws(()=>assertOperatorRole({...role(),password_present:true}),/OPS_SENHA_EXISTENTE/);
});
test('sucesso usa somente login operacional develop e remove sua senha temporária',async()=>{
  const f=fixture();assert.deepEqual(await f.run(),{tenantId:'synthetic-tenant'});
  const url=new URL(f.getUri());assert.equal(url.username,'oplyra_ops_login.'+TARGET.ref);
  assert.equal(url.hostname,TARGET.pooler);assert.equal(url.search,'?sslmode=verify-full');
  const sql=f.calls.map(c=>c.sql).join('\n');
  assert.ok(!sql.includes(url.password));assert.match(sql,/PASSWORD 'SCRAM-SHA-256\$/);
  assert.ok(sql.includes('ALTER ROLE oplyra_ops_login PASSWORD NULL'));
  assert.ok(!/GRANT|oplyra_web_login|hysigyhfpyyydycxxpsm/.test(sql));
  assert.deepEqual(f.phases,['OPS_TEMPORARIO_ENCERRADO']);
});
test('senha já existente não é alterada, nem há chamada ao trabalho operacional',async()=>{
  const f=fixture({profile:{...role(),password_present:true}});
  await assert.rejects(f.run(),/OPS_SENHA_EXISTENTE/);assert.equal(f.getUri(),undefined);
  assert.ok(!f.calls.some(c=>c.sql.startsWith('ALTER ROLE')));
});
test('erro do caso de uso também encerra a credencial, sem imprimir URL privada',async()=>{
  const f=fixture({workError:true});await assert.rejects(f.run(),/^ProvisionError: EMPRESA_OPERACAO_FALHOU_CONFERIR_ESTADO$/);
  assert.ok(f.calls.some(c=>c.sql==='ALTER ROLE oplyra_ops_login PASSWORD NULL'));
  assert.deepEqual(f.phases,['OPS_TEMPORARIO_ENCERRADO']);
});
test('credencial alterada por outro ator não é apagada durante encerramento',async()=>{
  const f=fixture({owned:false});await assert.rejects(f.run(),/OPS_ENCERRAMENTO_PENDENTE_NAO_REPETIR/);
  assert.ok(!f.calls.some(c=>c.sql==='ALTER ROLE oplyra_ops_login PASSWORD NULL'));
  assert.deepEqual(f.phases,['OPS_ENCERRAMENTO_PENDENTE_NAO_REPETIR']);
});
test('commit inicial incerto impede caso de uso e repetição automática',async()=>{
  const f=fixture({commitFailure:true});await assert.rejects(f.run(),/^ProvisionError: OPS_INICIALIZACAO_FALHOU$/);
  assert.equal(f.getUri(),undefined);assert.deepEqual(f.phases,['OPS_INICIALIZACAO_INCERTA_NAO_REPETIR']);
});
test('falha do encerramento não vira sucesso de provisionamento',async()=>{
  const f=fixture({cleanupFailure:true});await assert.rejects(f.run(),/OPS_ENCERRAMENTO_PENDENTE/);
  assert.deepEqual(f.phases,['OPS_ENCERRAMENTO_PENDENTE_NAO_REPETIR']);
});
test('identidade vem de Auth confirmado por consulta parametrizada, nunca do metadata',async()=>{
  const calls=[];
  const admin={query:async(sql,params)=>{calls.push({sql,params});return {rows:[{id:'real-auth-id',email_confirmed_at:new Date()}]};}};
  assert.deepEqual(await confirmedIdentity(admin,'  QA@example.invalid  '),{id:'real-auth-id',email:'qa@example.invalid'});
  assert.deepEqual(calls[0].params,['qa@example.invalid']);assert.ok(!calls[0].sql.includes('QA@example'));
  for(const rows of [[],[{id:'id',email_confirmed_at:null}],[{id:'a',email_confirmed_at:'yes'},{id:'b',email_confirmed_at:'yes'}]])
    await assert.rejects(confirmedIdentity({query:async()=>({rows})},'qa@example.invalid'),/USUARIO_AUTH_CONFIRMADO/);
});

test('operador com transação em andamento não tem senha alterada',async()=>{
  const f=fixture({active:1});await assert.rejects(f.run(),/OPS_OPERADOR_EM_USO/);
  assert.equal(f.getUri(),undefined);assert.ok(!f.calls.some(c=>c.sql.startsWith('ALTER ROLE')));
});

test('falhas de transporte/SQL expõem só código conhecido e encerram a credencial',async()=>{
  for(const [code,expected] of [['28P01','OPS_CONEXAO_FALHOU_28P01'],['42501','EMPRESA_BANCO_FALHOU_42501']]){
    const f=fixture({workCode:code});await assert.rejects(f.run(),new RegExp('^ProvisionError: '+expected+'$'));
    assert.ok(f.calls.some(c=>c.sql==='ALTER ROLE oplyra_ops_login PASSWORD NULL'));
  }
});
test('CLI sem Terminal privado recusa antes de ler credenciais ou conectar',()=>{
  const r=spawnSync(process.execPath,[new URL('./provision-tenant.mjs',import.meta.url).pathname,'--provision-develop'],{encoding:'utf8'});
  assert.equal(r.status,1);assert.equal(r.stdout,'');
  assert.equal(r.stderr.trim(),'TERMINAL_PRIVADO_PROPRIETARIO_NECESSARIO');
});

function authFixture({origin=TARGET.origin,cookie={},failure=false}={}) {
  const calls=[];let closed=false,verified=0;
  let url=origin+'/entrar';
  const page={setDefaultTimeout(){},url:()=>url,goto:async()=>{},
    getByLabel:label=>({fill:async value=>calls.push({label,value})}),
    getByRole:()=>({click:async()=>{if(failure)throw new Error('private-password-and-token');url=origin+'/empresas';}}),
    waitForURL:async()=>{}};
  const context={newPage:async()=>page,cookies:async()=>[{name:'oplyra_sessao',value:'synthetic-private-token',secure:true,httpOnly:true,sameSite:'Lax',expires:Date.now()/1000+1800,...cookie}]};
  const chromium={launch:async options=>{calls.push({launch:options});return {newContext:async options=>{calls.push({context:options});return context;},close:async()=>{closed=true;}};}};
  const run=()=>authenticateOperator({email:'qa@example.invalid',password:'synthetic-private-password',chromium,
    verifyAccessToken:async token=>{verified++;assert.equal(token,'synthetic-private-token');return {userId:'auth-user'};}});
  return {run,calls,closed:()=>closed,verified:()=>verified};
}
test('operador autentica no BFF fixo e verifica JWT antes da operação, sem retornar token',async()=>{
  const f=authFixture();const result=await f.run();
  assert.deepEqual(result.claims,{userId:'auth-user'});assert.equal(f.verified(),1);
  assert.deepEqual(await result.revalidate(),{userId:'auth-user'});assert.equal(f.verified(),2);
  assert.ok(!JSON.stringify(result).includes('synthetic-private-token'));assert.equal(f.closed(),true);
  assert.deepEqual(f.calls.find(c=>c.context).context,{ignoreHTTPSErrors:false,acceptDownloads:false});
});
test('origem divergente recusa antes de preencher a senha e fecha navegador',async()=>{
  const f=authFixture({origin:'https://example.invalid'});
  await assert.rejects(f.run(),/OPERADOR_AUTH_ORIGEM_DIVERGENTE/);
  assert.ok(!f.calls.some(c=>c.label));assert.equal(f.closed(),true);assert.equal(f.verified(),0);
});
test('sessão insegura ou expirada nunca chega à validação do JWT',async()=>{
  for(const cookie of [{secure:false},{httpOnly:false},{sameSite:'None'},{expires:0},{expires:Date.now()/1000+7200}]){
    const f=authFixture({cookie});await assert.rejects(f.run(),/OPERADOR_SESSAO_INSEGURA/);
    assert.equal(f.closed(),true);assert.equal(f.verified(),0);
  }
});
test('erro do navegador não expõe senha ou token',async()=>{
  const f=authFixture({failure:true});await assert.rejects(f.run(),/^ProvisionError: OPERADOR_AUTH_NAO_VALIDADO$/);
  assert.equal(f.closed(),true);
});
