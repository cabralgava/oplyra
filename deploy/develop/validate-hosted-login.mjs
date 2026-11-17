// Executar privadamente no Terminal do proprietário, com contas controladas de DEVELOP.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { hidden, ProvisionError } from './provision-web-login.mjs';
const deny = code => { throw new ProvisionError(code); };
try {
  if (process.argv.length !== 3 || process.argv[2] !== '--test-develop' || !process.stdin.isTTY || !process.stdout.isTTY) deny('TERMINAL_INTERATIVO_E_TEST_DEVELOP_NECESSARIOS');
  if (process.env.NODE_OPTIONS || process.execArgv.length) deny('OPCOES_DE_DEPURACAO_NAO_PERMITIDAS');
  const values = {};
  for (const [key,label] of [
    ['EMAIL','E-mail da conta controlada com vínculo'], ['SENHA','Senha dessa conta'],
    ['SEM_VINCULO_EMAIL','E-mail da conta controlada sem vínculo'], ['SEM_VINCULO_SENHA','Senha dessa conta'],
    ['TENANT_PROPRIO','UUID da empresa da primeira conta'], ['TENANT_ALHEIO','UUID de empresa existente sem vínculo com essa conta'],
  ]) {
    const value = await hidden(`${label} (oculto): `);
    if (!value) deny('DADOS_DE_TESTE_INCOMPLETOS');
    if (key.startsWith('TENANT') && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) deny('EMPRESA_INVALIDA');
    values[`OPLYRA_DEVELOP_${key}`] = value;
  }
  if (values.OPLYRA_DEVELOP_TENANT_PROPRIO === values.OPLYRA_DEVELOP_TENANT_ALHEIO || values.OPLYRA_DEVELOP_EMAIL === values.OPLYRA_DEVELOP_SEM_VINCULO_EMAIL) deny('IDENTIDADES_DE_TESTE_DEVEM_SER_DISTINTAS');
  const require = createRequire(import.meta.url);
  const cli = require.resolve('@playwright/test/cli');
  // Ambiente mínimo; segredo de banco/token administrativo não vai para o navegador.
  const env = {OPLYRA_DEVELOP_E2E:'1',...values};
  for (const key of ['PATH','HOME','TMPDIR','LANG','PLAYWRIGHT_BROWSERS_PATH']) if (process.env[key]) env[key] = process.env[key];
  const child = spawn(process.execPath,[cli,'test','--config',new URL('./playwright.hosted.config.ts',import.meta.url).pathname], {
    cwd:new URL('../../',import.meta.url), env, stdio:['ignore','pipe','ignore'],
  });
  child.stdout.on('data',chunk => {
    for(const line of chunk.toString().split('\n')) {
      try { const r = JSON.parse(line);
        if(r.target==='oplyra-develop' && typeof r.complete==='boolean' && r.counts && Object.values(r.counts).every(v=>Number.isSafeInteger(v)&&v>=0))
          console.log(JSON.stringify({target:r.target,counts:r.counts,complete:r.complete}));
      } catch {}
    }
  });
  child.on('error',()=>{console.error('NAO_FOI_POSSIVEL_INICIAR_TESTES');process.exitCode=1;});
  child.on('exit',code=>{process.exitCode=code===0?0:1;if(code!==0)console.error('ACEITE_HOSPEDADO_PENDENTE_SEM_LOG_SENSIVEL');});
} catch { console.error('VALIDACAO_NAO_INICIADA_CONFERIR_TERMINAL_E_CONTAS_DEVELOP'); process.exitCode=1; }
