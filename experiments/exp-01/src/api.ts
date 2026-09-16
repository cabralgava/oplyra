// EXP-01 — E1-05 (claims forjadas), E1-10 (Storage) e E1-11 (Data API).
import pg from "pg";
import { createRemoteJWKSet, jwtVerify, SignJWT, generateKeyPair, decodeJwt } from "jose";
import { createWrappers, TENANT_A, TENANT_B } from "./db.ts";

const API = process.env.API_URL ?? "http://127.0.0.1:54421";
const ANON = process.env.ANON_KEY ?? "";
const SERVICE = process.env.SERVICE_ROLE_KEY ?? "";
const WEB = "postgresql://oplyra_web_login:exp01_local_web@127.0.0.1:54422/postgres";

const results: { id: string; desc: string; pass: boolean; detail: string }[] = [];
function check(id: string, desc: string, pass: boolean, detail = "") {
  results.push({ id, desc, pass, detail });
  process.stdout.write(`${pass ? "  ok  " : " FALHA"} ${id}  ${desc}${detail ? " — " + detail : ""}\n`);
}

async function adminCreateUser(email: string, password: string): Promise<string> {
  const r = await fetch(`${API}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const body = await r.json();
  if (r.ok) return body.id;
  // já existe: recupera pela listagem
  const list = await fetch(`${API}/auth/v1/admin/users?per_page=200`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  }).then((x) => x.json());
  const found = (list.users ?? []).find((u: any) => u.email === email);
  if (!found) throw new Error(`não foi possível criar nem localizar ${email}: ${JSON.stringify(body)}`);
  return found.id;
}

async function signIn(email: string, password: string): Promise<string> {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(`login falhou para ${email}: ${JSON.stringify(body)}`);
  return body.access_token;
}

const jwks = createRemoteJWKSet(new URL(`${API}/auth/v1/.well-known/jwks.json`));

/** Fronteira de autenticação: só devolve claims se a assinatura for válida. */
async function verifiedSub(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, jwks, { issuer: `${API}/auth/v1` });
  if (!payload.sub) throw new Error("token sem sub");
  return payload.sub;
}

const web = createWrappers(WEB, 5);
let dbTouched = 0;
async function authenticateAndRead(token: string, tenantId: string) {
  const userId = await verifiedSub(token); // rejeita ANTES de qualquer acesso ao banco
  dbTouched++;
  return web.withUserTransaction({ userId, tenantId }, (tx) =>
    tx.query("select count(*)::int c from exp01.campaigns"));
}

const pass = "exp01-local-senha";
const idA = await adminCreateUser("owner-a@local.test", pass);
const idB = await adminCreateUser("owner-b@local.test", pass);

// Liga as identidades reais do Auth às empresas do experimento.
const admin = new pg.Pool({ connectionString: "postgresql://postgres:postgres@127.0.0.1:54422/postgres" });
await admin.query(
  `insert into exp01.memberships (tenant_id,user_id,role_key,status) values ($1,$2,'owner','active'),($3,$4,'owner','active')
   on conflict (tenant_id,user_id) do update set status='active'`, [TENANT_A, idA, TENANT_B, idB]);
await admin.end();

const tokenA = await signIn("owner-a@local.test", pass);
const tokenB = await signIn("owner-b@local.test", pass);

// ----------------------------------------------------------------- E1-05
{
  const ok = await authenticateAndRead(tokenA, TENANT_A);
  check("E1-05a", "token legítimo é aceito e enxerga a própria empresa", ok.rows[0].c > 0, `${ok.rows[0].c} linhas`);

  const casos: { nome: string; token: string }[] = [];
  const [h, p, s] = tokenA.split(".");
  const payload = JSON.parse(Buffer.from(p, "base64url").toString());

  // sub alterado, assinatura original
  const alterado = { ...payload, sub: "00000000-0000-4000-8000-000000000000" };
  casos.push({ nome: "sub alterado", token: `${h}.${Buffer.from(JSON.stringify(alterado)).toString("base64url")}.${s}` });
  // alg none, sem assinatura
  casos.push({ nome: "alg none", token: `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")}.${p}.` });
  // assinado com chave própria (outro emissor/kid desconhecido)
  const { privateKey } = await generateKeyPair("ES256");
  casos.push({
    nome: "assinado por chave estranha",
    token: await new SignJWT({ sub: payload.sub, role: "authenticated" }).setProtectedHeader({ alg: "ES256", kid: "intruso" })
      .setIssuer(`${API}/auth/v1`).setExpirationTime("1h").sign(privateKey),
  });
  // expirado, assinado por chave própria
  casos.push({
    nome: "expirado",
    token: await new SignJWT({ sub: payload.sub, role: "authenticated" }).setProtectedHeader({ alg: "ES256" })
      .setIssuer(`${API}/auth/v1`).setExpirationTime(Math.floor(Date.now() / 1000) - 60).sign(privateKey),
  });

  const antes = dbTouched;
  const rejeitados: string[] = [];
  for (const c of casos) {
    try { await authenticateAndRead(c.token, TENANT_A); } catch { rejeitados.push(c.nome); }
  }
  check("E1-05b", "todo token forjado é rejeitado", rejeitados.length === casos.length, rejeitados.join(", "));
  check("E1-05c", "nenhuma claim chega ao banco quando o token é inválido", dbTouched === antes,
    `${dbTouched - antes} acessos após rejeição`);
}

// ----------------------------------------------------------------- E1-10
{
  const put = (token: string, path: string, corpo: string) =>
    fetch(`${API}/storage/v1/object/tenant-assets/${path}`, {
      method: "POST",
      headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "text/plain" },
      body: corpo,
    });
  const get = (token: string, path: string) =>
    fetch(`${API}/storage/v1/object/tenant-assets/${path}`, {
      headers: { apikey: ANON, Authorization: `Bearer ${token}` },
    });

  // Caminho único por execução: o Storage recusa duplicata, o que faria o
  // cenário falhar por repetição e não por isolamento.
  const nome = `nota-a-${Date.now()}.txt`;
  const proprio = await put(tokenA, `${TENANT_A}/${nome}`, "conteudo da empresa A");
  check("E1-10a", "A grava no próprio prefixo", proprio.ok, `HTTP ${proprio.status}`);
  const invasao = await put(tokenA, `${TENANT_B}/invasao-${Date.now()}.txt`, "tentativa");
  check("E1-10b", "A não grava no prefixo de B", !invasao.ok, `HTTP ${invasao.status}`);
  const leituraPropria = await get(tokenA, `${TENANT_A}/${nome}`);
  check("E1-10c", "A lê o próprio arquivo", leituraPropria.ok, `HTTP ${leituraPropria.status}`);
  const leituraCruzada = await get(tokenB, `${TENANT_A}/${nome}`);
  check("E1-10d", "B não lê arquivo de A", !leituraCruzada.ok, `HTTP ${leituraCruzada.status}`);
}

// ----------------------------------------------------------------- E1-11
{
  const r1 = await fetch(`${API}/rest/v1/campaigns?select=*`, { headers: { apikey: ANON } });
  check("E1-11a", "tabela de domínio não acessível pela Data API", !r1.ok, `HTTP ${r1.status}`);
  const r2 = await fetch(`${API}/rest/v1/campaigns?select=*`, { headers: { apikey: ANON, "Accept-Profile": "exp01" } });
  check("E1-11b", "schema exp01 não exposto nem com Accept-Profile", !r2.ok, `HTTP ${r2.status}`);
  const r3 = await fetch(`${API}/rest/v1/campaigns?select=*`, { headers: { apikey: ANON, Authorization: `Bearer ${tokenA}`, "Accept-Profile": "exp01" } });
  check("E1-11c", "nem com sessão válida o schema é exposto", !r3.ok, `HTTP ${r3.status}`);
}

await web.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} cenários conforme o esperado`);
if (failed.length) { console.log("REPROVADOS:", failed.map((f) => f.id).join(", ")); process.exit(1); }
