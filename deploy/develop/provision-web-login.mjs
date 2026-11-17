// Provisionamento inicial do login web de DEVELOP. Não é executor de produção.
import { randomBytes, pbkdf2Sync, createHmac, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export const TARGET = Object.freeze({
  ref: 'eqpvjydnqbbawpkeizys', role: 'oplyra_web_login',
  pooler: 'aws-1-sa-east-1.pooler.supabase.com',
  site: '45056cd1-6732-40b3-b341-8b9fecca8345', name: 'oplyra-develop',
  origin: 'https://oplyra-develop.netlify.app', account: 'cabralgava',
});
export class ProvisionError extends Error {
  constructor(code) { super(code); this.name = 'ProvisionError'; }
}
const deny = (code) => { throw new ProvisionError(code); };

// Diagnóstico puramente local. Só retorna nomes de campos e booleanos, nunca valores.
export function inspectAdminUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { return {valid:false, checks:{URL_PARSEAVEL:false}}; }
  const direct = url.hostname === `db.${TARGET.ref}.supabase.co`;
  const pooler = url.hostname === TARGET.pooler;
  const entries = [...url.searchParams];
  const checks = {
    PROTOCOLO_POSTGRES: ['postgres:', 'postgresql:'].includes(url.protocol),
    HOST_DE_DEVELOP: direct || pooler,
    LOGIN_DE_DEVELOP: (direct && url.username === 'postgres') || (pooler && url.username === `postgres.${TARGET.ref}`),
    SENHA_PRESENTE: Boolean(url.password),
    SEM_PLACEHOLDER: !/YOUR.PASSWORD|SENHA_CODIFICADA|\[|\]/i.test(url.password),
    BANCO_POSTGRES: url.pathname === '/postgres',
    PORTA_PERMITIDA: ['', '5432', '6543'].includes(url.port),
    SEM_ESPACOS: typeof raw === 'string' && !/\s/.test(raw),
    SEM_FRAGMENTO: !url.hash,
    SSL_EXPLICITO: entries.length === 1 && entries[0][0] === 'sslmode' && ['require', 'verify-full'].includes(entries[0][1]),
  };
  return {valid:Object.values(checks).every(Boolean),checks};
}

export function adminOptions(raw) {
  let url;
  try { url = new URL(raw); } catch { return deny('ADMIN_URL_INVALIDA'); }
  if (!inspectAdminUrl(raw).valid) deny('ADMIN_URL_INVALIDA');
  // Parâmetros SSL da URL não podem substituir rejectUnauthorized.
  url.search = '';
  return { connectionString: url.href, ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 15000, query_timeout: 20000, application_name: 'oplyra-develop-initial-login' };
}

export function assertSite(site) {
  if (!site || site.id !== TARGET.site || site.name !== TARGET.name
      || (site.ssl_url ?? site.url) !== TARGET.origin || ![TARGET.origin, TARGET.origin.replace('https:', 'http:')].includes(site.url)
      || site.account_slug !== TARGET.account || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(site.account_id)) deny('SITE_DIVERGENTE');
}

export function assertRole(role) {
  if (!role || role.rolname !== TARGET.role || role.rolcanlogin !== true
      || ['rolsuper', 'rolinherit', 'rolbypassrls', 'rolcreaterole', 'rolcreatedb', 'rolreplication'].some(k => role[k] !== false)
      || !Array.isArray(role.memberships) || role.memberships.length !== 1
      || role.memberships[0].name !== 'authenticated' || role.memberships[0].admin !== false
      || role.memberships[0].inherit !== false || role.memberships[0].set !== true) deny('PAPEL_NAO_MINIMO');
  if (role.password_present !== false) deny('SENHA_JA_EXISTENTE_NAO_ROTACIONADA');
}

export function scramVerifier(password, salt = randomBytes(16)) {
  // A senha gerada é ASCII aleatória. Nenhuma normalização Unicode é necessária.
  if (!/^[A-Za-z0-9_-]{43}$/.test(password) || salt.length !== 16) deny('SEGREDO_INVALIDO');
  const salted = pbkdf2Sync(password, salt, 4096, 32, 'sha256');
  const clientKey = createHmac('sha256', salted).update('Client Key').digest();
  const storedKey = createHash('sha256').update(clientKey).digest('base64');
  const serverKey = createHmac('sha256', salted).update('Server Key').digest('base64');
  salted.fill(0); clientKey.fill(0);
  return `SCRAM-SHA-256$4096:${salt.toString('base64')}$${storedKey}:${serverKey}`;
}

export function webUrl(password) {
  return `postgresql://${TARGET.role}.${TARGET.ref}:${encodeURIComponent(password)}@${TARGET.pooler}:6543/postgres?sslmode=verify-full`;
}

export const ROLE_QUERY = `select r.rolname,r.rolcanlogin,r.rolsuper,r.rolinherit,r.rolbypassrls,
 r.rolcreaterole,r.rolcreatedb,r.rolreplication,(a.rolpassword is not null) as password_present,
 coalesce((select jsonb_agg(jsonb_build_object('name',g.rolname,'admin',m.admin_option,
 'inherit',m.inherit_option,'set',m.set_option)) from pg_auth_members m
 join pg_roles g on g.oid=m.roleid where m.member=r.oid),'[]'::jsonb) as memberships
 from pg_roles r join pg_authid a on a.oid=r.oid where r.rolname='oplyra_web_login'`;

function assertSecretMetadata(env) {
  if (!env || env.key !== 'DATABASE_URL_APP' || env.is_secret !== true
      || !Array.isArray(env.scopes) || [...env.scopes].sort().join(',') !== 'builds,functions'
      || !Array.isArray(env.values) || env.values.length !== 1 || env.values[0].context !== 'production'
      || env.values[0].context_parameter) deny('ESCOPO_DO_SEGREDO_DIVERGENTE');
}

// Interfaces injetadas permitem testar recusas e falhas sem rede ou credenciais.
export async function provision({ admin, api, verifyLogin, phase = () => {} }) {
  let transaction = false;
  let attemptedWrite = false;
  let committed = false;
  try {
    const site = await api('GET', `/sites/${TARGET.site}`);
    assertSite(site);
    const envPath = `/accounts/${site.account_id}/env/DATABASE_URL_APP?site_id=${TARGET.site}`;
    if (await api('GET', envPath, undefined, true) !== null) deny('VARIAVEL_JA_EXISTENTE_NAO_SOBRESCRITA');
    await admin.query('BEGIN'); transaction = true;
    await admin.query("SET LOCAL lock_timeout='5s'");
    await admin.query("SET LOCAL statement_timeout='15s'");
    await admin.query("SELECT pg_advisory_xact_lock(hashtextextended('oplyra:develop:initial-web-login',0))");
    const result = await admin.query(ROLE_QUERY);
    if (result.rows.length !== 1) deny('PAPEL_AUSENTE');
    assertRole(result.rows[0]);
    // Revalidar sob o lock: outro provisionador pode ter concluído durante a espera.
    if (await api('GET', envPath, undefined, true) !== null) deny('VARIAVEL_JA_EXISTENTE_NAO_SOBRESCRITA');
    const password = randomBytes(32).toString('base64url');
    const verifier = scramVerifier(password);
    // Somente verificador SCRAM vai para SQL; nunca a senha em claro.
    await admin.query(`ALTER ROLE oplyra_web_login PASSWORD '${verifier}'`);
    const uri = webUrl(password);
    const env = { key: 'DATABASE_URL_APP', scopes: ['builds', 'functions'], is_secret: true,
      values: [{ context: 'production', value: uri }] };
    attemptedWrite = true;
    await api('POST', `/accounts/${site.account_id}/env?site_id=${TARGET.site}`, [env]);
    assertSecretMetadata(await api('GET', envPath));
    // Sem deploy. Se a publicação do segredo falhar, a senha continua NULL.
    await admin.query('COMMIT'); transaction = false; committed = true;
    phase('SEGREDO_INSTALADO_LOGIN_A_VALIDAR');
    await verifyLogin(uri);
    phase('LOGIN_MINIMO_DEVELOP_OK');
    return { loginVerified: true, secretInstalled: true, deployed: false };
  } catch (error) {
    if (transaction) await admin.query('ROLLBACK').catch(() => {});
    if (committed) phase('LOGIN_NAO_VALIDADO_NAO_REPETIR_NEM_PUBLICAR');
    else if (attemptedWrite) phase('INSTALACAO_PARCIAL_POSSIVEL_NAO_REPETIR_NEM_PUBLICAR');
    throw error instanceof ProvisionError ? error : new ProvisionError('PROVISIONAMENTO_FALHOU_SEM_DETALHES_SENSIVEIS');
  }
}

export async function netlifyApi(token, fetcher = fetch) {
  return async (method, path, body, missingIsNull = false) => {
    const response = await fetcher(`https://api.netlify.com/api/v1${path}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.status === 404 && missingIsNull) return null;
    if (!response.ok) deny(`NETLIFY_HTTP_${response.status}`);
    return response.json();
  };
}

// Entrada oculta, sem argumentos/ambiente/arquivo, somente terminal interativo.
export async function hidden(question) {
  const input = process.stdin, output = process.stdout;
  output.write(question);
  return new Promise((resolve, reject) => {
    let value = '';
    const cleanup = () => { input.off('data', read); input.setRawMode(false); input.pause(); output.write('\n'); };
    const read = (chunk) => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\u0003' || char === '\u0004' || char === '\u001b') { cleanup(); reject(new ProvisionError('ENTRADA_CANCELADA')); return; }
        if (char === '\r' || char === '\n') { cleanup(); resolve(value); return; }
        if (char === '\u007f' || char === '\b') value = value.slice(0,-1);
        else if (char >= ' ' && value.length < 8192) value += char;
      }
    };
    input.setRawMode(true); input.resume(); input.on('data', read);
  });
}

async function main() {
  if (process.argv.length !== 3 || !['--apply-develop','--check-admin-url'].includes(process.argv[2])) deny('USE_APPLY_DEVELOP_OU_CHECK_ADMIN_URL');
  if (!process.stdin.isTTY || !process.stdout.isTTY) deny('TERMINAL_INTERATIVO_NECESSARIO');
  if (process.env.NODE_OPTIONS || process.execArgv.length) deny('OPCOES_DE_DEPURACAO_NAO_PERMITIDAS');
  if (process.argv[2] === '--check-admin-url') {
    const diagnostic = inspectAdminUrl(await hidden('URL de DEVELOP para conferir localmente (oculta; nenhuma conexão): '));
    console.log(diagnostic.valid ? 'ADMIN_URL_FORMATO_OK' : 'ADMIN_URL_CAMPOS_RECUSADOS: ' + Object.entries(diagnostic.checks).filter(([,ok])=>!ok).map(([name])=>name).join(','));
    if (!diagnostic.valid) process.exitCode = 1;
    return;
  }
  console.log('Destino exclusivo: develop eqpvjydnqbbawpkeizys / Netlify oplyra-develop. Não executa deploy.');
  const options = adminOptions(await hidden('URL administrativa de DEVELOP (oculta, com sslmode=verify-full): '));
  const token = await hidden('Token temporário da Netlify (oculto): ');
  if (!token || /\s/.test(token)) deny('TOKEN_INVALIDO');
  const require = createRequire(new URL('../../packages/infra/package.json', import.meta.url));
  const { Client } = require('pg');
  const admin = new Client(options);
  admin.on('error', () => {});
  try {
    await admin.connect();
    await provision({ admin, api: await netlifyApi(token), phase: message => console.log(message),
      verifyLogin: async (uri) => {
        const url = new URL(uri); url.search = '';
        const client = new Client({ ...options, connectionString: url.href });
        client.on('error', () => {});
        try {
          await client.connect();
          const result = await client.query(`select session_user, current_user,
            has_schema_privilege(session_user,'core','USAGE') as direct_core,
            has_schema_privilege(session_user,'runtime','USAGE') as direct_runtime`);
          const row = result.rows[0];
          if (row.session_user !== TARGET.role || row.current_user !== TARGET.role
              || row.direct_core !== false || row.direct_runtime !== false) deny('LOGIN_OU_PRIVILEGIOS_DIVERGENTES');
          await client.query('BEGIN READ ONLY');
          await client.query('SET LOCAL ROLE authenticated');
          const check = await client.query('select current_user,app.current_tenant() as tenant');
          if (check.rows[0].current_user !== 'authenticated' || check.rows[0].tenant !== null) deny('CONTEXTO_INICIAL_DIVERGENTE');
          await client.query('ROLLBACK');
        } finally { await client.end().catch(() => {}); }
      },
    });
    console.log('Sem deploy. Revogue o token temporário da Netlify. Próximo: integração do frontend/Auth.');
  } finally { await admin.end().catch(() => {}); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error instanceof ProvisionError ? error.message : 'FALHA_SEM_DETALHES_SENSIVEIS'); process.exitCode = 1; });
}
