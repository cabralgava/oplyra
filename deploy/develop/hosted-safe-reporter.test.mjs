import {test} from 'node:test';
import assert from 'node:assert/strict';
import Reporter from './hosted-safe-reporter.mjs';

function capture(fn) { const output=[]; const original=console.log; console.log=s=>output.push(s);
  try { const result=fn(); return {output:output.join('\n'),result}; } finally { console.log=original; } }
test('falha não publica mensagens, cookies, entrada, títulos ou attachments privados',()=>{
  const r=new Reporter(); const secret='synthetic-only-private-value';
  r.onError(new Error(secret));r.onStdOut(secret);r.onStdErr(secret);
  r.onTestEnd({title:secret},{status:'failed',error:{message:secret},attachments:[{body:secret}]});
  const got=capture(()=>r.onEnd({status:'failed',error:secret}));
  assert.ok(!got.output.includes(secret));assert.equal(got.result.status,'failed');
});
test('teste ignorado ou seleção incompleta não vira aceite hospedado',()=>{
  for(const n of [0,7,9]) { const r=new Reporter();for(let i=0;i<n;i++)r.onTestEnd({title:'test'},{status:'passed'});
    assert.equal(capture(()=>r.onEnd({status:'passed'})).result.status,'failed'); }
  const r=new Reporter();for(let i=0;i<8;i++)r.onTestEnd({title:'test'},{status:i===0?'skipped':'passed'});
  assert.equal(capture(()=>r.onEnd({status:'passed'})).result.status,'failed');
});
test('somente oito testes hospedados aprovados satisfazem o resumo',()=>{
  const r=new Reporter();for(let i=0;i<8;i++)r.onTestEnd({title:'test'},{status:'passed'});
  const got=capture(()=>r.onEnd({status:'passed'}));assert.equal(got.result.status,'passed');
  assert.deepEqual(JSON.parse(got.output),{target:'oplyra-develop',counts:{passed:8},complete:true});
});
