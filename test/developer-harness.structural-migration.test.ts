// @ts-nocheck — control plane (.mjs sem tipos).
// CENÁRIO 2 — migration autorizada × alteração de acesso ou isolamento (INTEGRACAO-PR11-E-PERFIS §4 S-2, S-3).
// Componente REAL: scripts/claude-structural.mjs (análise estática da SQL). Migration e escopo SINTÉTICOS, em memória.
// LIMITE: isto prova o CLASSIFICADOR do diff, não o isolamento real entre tenants. Nenhum banco foi usado aqui; a prova do banco é do
// pgTAP (S-4) contra o banco local sintético, registrada à parte. Integrar no Git não autoriza executar em produção.
import { afterAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { evidencia, importarReal, verificarMutacao, type Mutacao, type Propriedades } from "./developer-harness.mutacao";

const DOC = "docs/product/marketing-ops/contracts/changes/CR-040-escopo-sintetico.md";
const DOC_SHA = crypto.createHash("sha256").update("escopo sintético aprovado pelo proprietário\n").digest("hex");
const MIG = "supabase/migrations/20261101000020_assets_sinteticos.sql";
const PGTAP = "supabase/tests/assets_sinteticos.test.sql";
const BASE_MIGRATIONS = ["supabase/migrations/20260929000015_tenant_deletion_owner_guard.sql"];

/**
 * Fixture: `core.assets` pertence a tenants (RLS, FORCE, política com app.current_tenant(), CRUD só para authenticated);
 * `core.asset_kinds` é catálogo global SEM dados de tenant: a fixture não exige RLS nem FORCE nela (nenhuma regra universal inventada).
 */
const ESCOPO_MIG = {
  file: MIG,
  tables: [{ name: "core.asset_kinds", tenantOwned: false, forceRls: false }, { name: "core.assets", tenantOwned: true, forceRls: true }],
  policies: [{ name: "assets_tenant_isolation", table: "core.assets" }],
  grants: [{ table: "core.asset_kinds", to: "authenticated", privileges: ["select"] }, { table: "core.assets", to: "authenticated", privileges: ["select", "insert", "update", "delete"] }],
  indexes: [{ name: "assets_tenant_idx", table: "core.assets" }],
  functions: [{ name: "core.asset_count", securityDefiner: true }],
};
const ESCOPO = { schema: "oplyra-structural-scope/1", id: "sc-sintetico-s6b", approvedDocument: { path: DOC, sha256: DOC_SHA }, packageExports: [], migrations: [ESCOPO_MIG], tests: [PGTAP] };

const FUNCAO = `create or replace function core.asset_count(p_kind smallint)
returns bigint
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select count(*) from core.assets a where a.tenant_id = app.current_tenant() and a.kind_id = p_kind;
$$;`;
const SQL_OK = `-- Fixture sintética: ativos por tenant.
create table core.asset_kinds (
  id smallint primary key,
  label text not null
);
comment on table core.asset_kinds is 'Catálogo global; sem dados de tenant.';
grant select on core.asset_kinds to authenticated;

create table core.assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants (id),
  kind_id smallint not null references core.asset_kinds (id),
  name text not null
);
alter table core.assets enable row level security;
alter table core.assets force row level security;
create policy assets_tenant_isolation on core.assets
  for all to authenticated
  using (tenant_id = app.current_tenant())
  with check (tenant_id = app.current_tenant());
create index assets_tenant_idx on core.assets (tenant_id);
grant select, insert, update, delete on core.assets to authenticated;

${FUNCAO}
`;

const avaliarSql = (S, sql, over = {}) =>
  S.evaluateStructural({
    changes: [{ path: MIG, status: "added", base: null, head: sql }, { path: PGTAP, status: "added", base: null, head: "select plan(1);" }],
    scope: ESCOPO, scopeRef: ESCOPO.id, approvedDocumentSha256: DOC_SHA, baseMigrations: BASE_MIGRATIONS, ...over,
  });
const recusada = (v, motivo) => {
  expect(v.risk, motivo).toBe("elevated");
  expect(v.eligible, motivo).toBe(false);
  expect(v.structural, motivo).not.toContain(MIG);
  expect(v.elevated, motivo).toContainEqual({ path: MIG, reason: motivo });
};
const sem = (sql, trecho) => {
  if (!sql.includes(trecho)) throw new Error(`fixture: trecho ausente ${trecho}`);
  return sql.replace(trecho, "");
};

const PROPS: Propriedades = {
  async permitido(imp) {
    const v = avaliarSql(await imp("claude-structural.mjs"), SQL_OK);
    expect(v).toMatchObject({ risk: "structural", eligible: true, structural: [MIG, PGTAP], elevated: [] });
  },
  async "grant-anon"(imp) {
    const S = await imp("claude-structural.mjs");
    recusada(avaliarSql(S, `${SQL_OK}\ngrant select on core.assets to anon;\n`), "grant-anon-ou-public");
    recusada(avaliarSql(S, `${SQL_OK}\ngrant select on core.asset_kinds to public;\n`), "grant-anon-ou-public");
  },
  async "grant-privilegio-nao-autorizado"(imp) {
    recusada(avaliarSql(await imp("claude-structural.mjs"), `${SQL_OK}\ngrant insert on core.asset_kinds to authenticated;\n`), "grant-fora-do-escopo");
  },
  async "rls-desabilitado"(imp) {
    recusada(avaliarSql(await imp("claude-structural.mjs"), `${SQL_OK}\nalter table core.assets disable row level security;\n`), "rls-desabilitado");
  },
  async "rls-omitido"(imp) {
    recusada(avaliarSql(await imp("claude-structural.mjs"), sem(SQL_OK, "alter table core.assets enable row level security;\n")), "rls-ausente:core.assets");
  },
  async "force-omitido"(imp) {
    recusada(avaliarSql(await imp("claude-structural.mjs"), sem(SQL_OK, "alter table core.assets force row level security;\n")), "force-rls-ausente:core.assets");
  },
  async "security-definer-nao-autorizado"(imp) {
    const S = await imp("claude-structural.mjs");
    const escopoSemDefiner = { ...ESCOPO, migrations: [{ ...ESCOPO_MIG, functions: [{ name: "core.asset_count", securityDefiner: false }] }] };
    recusada(avaliarSql(S, SQL_OK, { scope: escopoSemDefiner }), "security-definer-nao-autorizado");
    const outra = FUNCAO.replace(/core\.asset_count/g, "core.asset_purge");
    recusada(avaliarSql(S, `${SQL_OK}\n${outra}\n`), "funcao-fora-do-escopo");
  },
  async "security-definer-sem-search-path"(imp) {
    const S = await imp("claude-structural.mjs");
    recusada(avaliarSql(S, sem(SQL_OK, "set search_path = pg_catalog, pg_temp\n")), "security-definer-sem-search-path-seguro");
    recusada(avaliarSql(S, SQL_OK.replace("set search_path = pg_catalog, pg_temp", "set search_path = public, pg_temp")), "security-definer-sem-search-path-seguro");
  },
  async "instrucao-nao-coberta"(imp) {
    const S = await imp("claude-structural.mjs");
    recusada(avaliarSql(S, `${SQL_OK}\nalter table core.tenants add column plano text;\n`), "instrucao-nao-coberta");
    recusada(avaliarSql(S, `${SQL_OK}\ncreate table core.extra (id uuid primary key);\n`), "tabela-fora-do-escopo");
    recusada(avaliarSql(S, `${SQL_OK}\ndo $$ begin perform 1; end $$;\n`), "instrucao-nao-coberta");
    recusada(avaliarSql(S, `${SQL_OK}\ncreate policy outra on core.assets using (true);\n`), "politica-fora-do-escopo");
    // conteúdo não classificável não é aprovado por omissão
    recusada(avaliarSql(S, `${SQL_OK}\nselect 'sem fim;\n`), "sql-nao-classificavel");
    recusada(avaliarSql(S, `${SQL_OK}\ncomment on table "core"."assets" is 'x';\n`), "sql-nao-classificavel");
  },
  async "migration-existente-ou-fora-de-ordem"(imp) {
    const S = await imp("claude-structural.mjs");
    const v = S.evaluateStructural({ changes: [{ path: MIG, status: "modified", base: SQL_OK, head: SQL_OK }], scope: ESCOPO, scopeRef: ESCOPO.id, approvedDocumentSha256: DOC_SHA, baseMigrations: BASE_MIGRATIONS });
    recusada(v, "migration-existente-alterada");
    recusada(avaliarSql(S, SQL_OK, { baseMigrations: [...BASE_MIGRATIONS, "supabase/migrations/20261201000001_posterior.sql"] }), "timestamp-nao-posterior");
    recusada(avaliarSql(S, SQL_OK, { baseMigrations: undefined }), "timestamp-nao-verificavel");
  },
  async "migration-fora-do-escopo"(imp) {
    const S = await imp("claude-structural.mjs");
    const outra = "supabase/migrations/20261101000021_nao_listada.sql";
    const v = S.evaluateStructural({ changes: [{ path: outra, status: "added", base: null, head: SQL_OK }], scope: ESCOPO, scopeRef: ESCOPO.id, approvedDocumentSha256: DOC_SHA, baseMigrations: BASE_MIGRATIONS });
    expect(v).toMatchObject({ risk: "elevated", eligible: false });
    expect(v.elevated).toContainEqual({ path: outra, reason: "fora-do-escopo" });
  },
};

const SRC = "claude-structural.mjs";
const MUTACOES: Mutacao[] = [
  {
    nome: "M2.1a neutraliza a verificação de concessão (checkGrant)", controle: "checkGrant: destinatário e privilégios ⊆ escopo", arquivo: SRC,
    trocas: [{ de: "function checkGrant(match, m) {\n", para: "function checkGrant(match, m) {\n  return null;\n" }],
    detectadaPor: ["grant-privilegio-nao-autorizado"], preservadas: ["permitido", "grant-anon"],
    redundancia: "GRANT a anon/public continua recusado pela lista FORBIDDEN_SQL (proibição explícita, independente do escopo).",
  },
  {
    nome: "M2.1b remove TODA a verificação de concessão (checkGrant + proibição explícita)", controle: "checkGrant e FORBIDDEN_SQL[grant-anon-ou-public]", arquivo: SRC,
    trocas: [
      { de: "function checkGrant(match, m) {\n", para: "function checkGrant(match, m) {\n  return null;\n" },
      { de: '  ["grant-anon-ou-public", /^grant\\b.*\\bto\\b[a-z_, ]*\\b(anon|public)\\b/],\n', para: "" },
    ],
    detectadaPor: ["grant-anon", "grant-privilegio-nao-autorizado"], preservadas: ["permitido"],
  },
  {
    nome: "M2.2a remove só a proibição explícita de DISABLE RLS", controle: "FORBIDDEN_SQL[rls-desabilitado]", arquivo: SRC,
    trocas: [{ de: '  ["rls-desabilitado", /\\b(disable|no force) row level security\\b/],\n', para: "" }],
    detectadaPor: ["rls-desabilitado"], preservadas: ["permitido", "rls-omitido"],
    redundancia: "a mudança CONTINUA recusada (elevated): DISABLE não casa nenhuma forma reconhecida e cai na negação por padrão (instrucao-nao-coberta). A suíte detecta a mutação porque exige o motivo explícito rls-desabilitado; a garantia de recusa em si é mantida pela defesa redundante.",
  },
  {
    nome: "M2.2b remove a verificação de RLS (requisito + forma reconhecida aceita DISABLE)", controle: "requisito rls-ausente e reconhecimento de enable-rls", arquivo: SRC,
    trocas: [
      { de: "    if (t.tenantOwned && !seen.rls.has(t.name)) return no(`rls-ausente:${t.name}`);\n", para: "" },
      { de: '  ["rls-desabilitado", /\\b(disable|no force) row level security\\b/],\n', para: "" },
      { de: "enable row level security$`)],", para: "(?:en|dis)able row level security$`)]," },
    ],
    detectadaPor: ["rls-desabilitado", "rls-omitido"], preservadas: ["permitido", "force-omitido"],
  },
  {
    nome: "M2.3a remove a verificação de SECURITY DEFINER autorizado", controle: "checkFunction: definer só se o escopo autoriza", arquivo: SRC,
    trocas: [{ de: '  if (definer && !fn.securityDefiner) return "security-definer-nao-autorizado";\n', para: "" }],
    detectadaPor: ["security-definer-nao-autorizado"], preservadas: ["permitido", "security-definer-sem-search-path"],
  },
  {
    nome: "M2.3b remove a verificação de search_path seguro", controle: "checkFunction: set search_path = pg_catalog, pg_temp", arquivo: SRC,
    trocas: [{ de: '  if (definer && (!sp || sp[1].replace(/\\s+/g, "") !== SAFE_SEARCH_PATH.replace(/\\s+/g, ""))) return "security-definer-sem-search-path-seguro";\n', para: "" }],
    detectadaPor: ["security-definer-sem-search-path"], preservadas: ["permitido"],
  },
  {
    nome: "M2.4 remove a exigência de FORCE da fixture", controle: "requisito force-rls-ausente (forceRls do escopo)", arquivo: SRC,
    trocas: [{ de: "    if (t.forceRls && !seen.forced.has(t.name)) return no(`force-rls-ausente:${t.name}`);\n", para: "" }],
    detectadaPor: ["force-omitido"], preservadas: ["permitido", "rls-omitido"],
  },
  {
    nome: "M2.5 aceita qualquer migration porque o arquivo é novo", controle: "analyzeMigration: aceitação por status added", arquivo: SRC,
    trocas: [{ de: '  if (!m) return no("fora-do-escopo");\n  if (change.status !== "added")', para: '  if (change.status === "added") return yes();\n  if (!m) return no("fora-do-escopo");\n  if (change.status !== "added")' }],
    detectadaPor: ["grant-anon", "rls-desabilitado", "rls-omitido", "force-omitido", "security-definer-nao-autorizado", "security-definer-sem-search-path", "instrucao-nao-coberta", "migration-fora-do-escopo"], preservadas: ["permitido"],
  },
];

describe("cenário 2 — migration autorizada × acesso/isolamento (classificador, sem banco)", () => {
  it("implementação original: caso permitido elegível e cada caso proibido recusado separadamente", async () => {
    const { avaliar } = await import("./developer-harness.mutacao");
    expect(await avaliar(PROPS, importarReal)).toEqual(Object.fromEntries(Object.keys(PROPS).map((k) => [k, null])));
  });
  for (const m of MUTACOES) it(`mutação — ${m.nome}`, () => verificarMutacao("cenário 2", PROPS, m));
  afterAll(() => console.log(`\nEVIDÊNCIA DE MUTAÇÕES — cenário 2\n${evidencia.filter((e) => e.startsWith("[cenário 2]")).join("\n")}\n`));
});
