import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withTemporaryOperator,assertOperatorRole,confirmedIdentity,OPS_QUERY} from './provision-tenant.mjs';
import {TARGET} from './provision-web-login.mjs';

const role=()=>({rolname:'oplyra_ops_login',rolcanlogin:true,rolsuper:false,rolinherit:false,
  rolbypassrls:false,rolcreaterole:false,rolcreatedb:false,rolreplication:false,password_present:false,
  memberships:[{name:'oplyra_ops_exec',admin:false,inherit:false,set:true}]});
function fixture({profile=role(),workError=false,owned=true,commitFailure=false,cleanupFailure=false,active=0}={}) {
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
    uri=value;if(workError)throw new Error(value);return {tenantId:'synthetic-tenant'};
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

test('operador com conexão existente não tem senha alterada',async()=>{
  const f=fixture({active:1});await assert.rejects(f.run(),/OPS_OPERADOR_EM_USO/);
  assert.equal(f.getUri(),undefined);assert.ok(!f.calls.some(c=>c.sql.startsWith('ALTER ROLE')));
});
