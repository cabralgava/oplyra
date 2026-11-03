// @ts-nocheck — control plane (.mjs sem tipos).
// CENÁRIO 8g — autorização contínua v2 (classe structural, structural.scopes[]), scopeRef/requirementsRef da missão e vínculo do resultado
// do structural-gate ao head no runner (INTEGRACAO-PR11-E-PERFIS §3, §8.5, §12). REAL: claude-standing.mjs, bindStructuralResult e
// structuralForHead (claude-runner.mjs), decide. SIMULADOS: a porta do gate (devolve resultados sintéticos) e a observação do PR.
// Nenhuma autorização é gravada fora de diretórios temporários; nada é emitido.
import { afterAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { evidencia, importarReal, observacao, verificarMutacao, verdes, type Mutacao, type Propriedades } from "./developer-harness.mutacao";

const DOC = "docs/product/marketing-ops/contracts/changes/CR-040-escopo-sintetico.md";
const DOC_SHA = crypto.createHash("sha256").update("escopo sintético\n").digest("hex");
const MIG = "supabase/migrations/20261101000020_assets_sinteticos.sql";
const PGTAP = "supabase/tests/assets_sinteticos.test.sql";
const ESCOPO = {
  schema: "oplyra-structural-scope/1", id: "sc-sintetico-s6b", approvedDocument: { path: DOC, sha256: DOC_SHA }, packageExports: [],
  migrations: [{ file: MIG, tables: [{ name: "core.assets", tenantOwned: true, forceRls: true }], policies: [{ name: "assets_tenant_isolation", table: "core.assets" }], grants: [], indexes: [], functions: [] }],
  tests: [PGTAP],
};
const AUTORIZACAO = [{ scopeRef: ESCOPO.id, approvedDocument: { path: DOC, sha256: DOC_SHA } }];
const ORC = { wallClockSeconds: 3600, iterations: 5, logReads: 10 };
const BASE = "b".repeat(40);
const HEAD_A = "a".repeat(40);
const HEAD_C = "c".repeat(40);
const missao = (over = {}) => ({ id: "ms-201", type: "feat", title: "Ativos estruturais", goal: "Executar o incremento estrutural sintético.", paths: [MIG, PGTAP, "packages/core/test/"], dependsOn: [], acceptance: ["ok"], scopeRef: ESCOPO.id, ...over });
const codigo = (fn) => { try { fn(); return "OK"; } catch (e) { return e.code ?? `INESPERADO:${e.message}`; } };

async function standing(imp, over = {}) {
  const { buildStanding } = await imp("claude-standing.mjs");
  return buildStanding({ paths: ["packages/core/test/"], missionBudgets: ORC, confirmation: "AUTORIZAR-DESENVOLVIMENTO-CONTINUO", structuralScopes: AUTORIZACAO, ...over });
}
async function derivar(imp, { s, m = missao(), scope = ESCOPO } = {}) {
  const { deriveMissionRecord } = await imp("claude-standing.mjs");
  return deriveMissionRecord({ standing: s ?? (await standing(imp)), standingSha256: "e".repeat(64), mission: m, baseSha: BASE, structuralScope: scope });
}

const PROPS: Propriedades = {
  async "v2-e-v1"(imp) {
    const { validateStanding, STANDING_SCHEMA, STANDING_SCHEMA_V1 } = await imp("claude-standing.mjs");
    const s = await standing(imp);
    expect(s).toMatchObject({ schema: STANDING_SCHEMA, scope: { riskClasses: ["routine", "structural"] }, structural: { scopes: AUTORIZACAO } });
    const so = await standing(imp, { structuralScopes: [] });
    expect(so.scope.riskClasses).toEqual(["routine"]);
    // versão 1 continua aceita (só rotina)
    const { structural, ...semStructural } = so;
    expect(() => validateStanding({ ...semStructural, schema: STANDING_SCHEMA_V1 })).not.toThrow();
  },
  async "v2-invalidas"(imp) {
    const { validateStanding, STANDING_SCHEMA_V1 } = await imp("claude-standing.mjs");
    const s = await standing(imp);
    const casos = [
      { ...s, scope: { ...s.scope, riskClasses: ["structural"] } },
      { ...s, scope: { ...s.scope, riskClasses: ["elevated"] }, structural: { scopes: [] } },
      { ...s, scope: { ...s.scope, riskClasses: ["routine", "elevated"] }, structural: { scopes: [] } },
      { ...s, scope: { ...s.scope, riskClasses: [] }, structural: { scopes: [] } },
      { ...s, scope: { ...s.scope, riskClasses: ["routine", "structural", "elevated"] } },
      { ...s, structural: { scopes: [] } },
      { ...s, scope: { ...s.scope, riskClasses: ["routine"] } },
      { ...s, structural: { scopes: [...AUTORIZACAO, ...AUTORIZACAO] } },
      { ...s, structural: { scopes: [{ ...AUTORIZACAO[0], approvedDocument: { path: DOC, sha256: "x" } }] } },
      { ...s, structural: { scopes: [{ ...AUTORIZACAO[0], approvedDocument: { path: "../fora.md", sha256: DOC_SHA } }] } },
      { ...s, structural: { scopes: [{ ...AUTORIZACAO[0], scopeRef: "SC-X" }] } },
      { ...s, structural: { scopes: AUTORIZACAO, extra: 1 } },
      { ...s, schema: STANDING_SCHEMA_V1 },
    ];
    for (const c of casos) expect(codigo(() => validateStanding(c)), JSON.stringify(c.scope.riskClasses)).toBe("ST-INVALID");
  },
  async "derivacao-estrutural"(imp) {
    const r = await derivar(imp);
    expect(r.scopeRef).toBe(ESCOPO.id);
    expect(r.paths).toEqual([MIG, PGTAP, "packages/core/test/", "docs/progresso/ms-201.md"]);
  },
  async "derivacao-sem-declaracao"(imp) {
    const { scopeRef, ...semRef } = missao();
    expect(await derivar(imp, { m: semRef }).then(() => "OK", (e) => e.code)).toBe("ST-RISK");
    const rotina = await derivar(imp, { m: { ...semRef, paths: ["packages/core/test/"] } });
    expect(rotina).not.toHaveProperty("scopeRef");
  },
  async "derivacao-recusas"(imp) {
    const casos = [
      ["ref não autorizado", { m: missao({ scopeRef: "sc-outro" }) }, "ST-SCOPE"],
      ["autorização só rotina", { s: await standing(imp, { structuralScopes: [] }) }, "ST-SCOPE"],
      ["escopo ausente da base", { scope: null }, "ST-SCOPE"],
      ["escopo de outro id", { scope: { ...ESCOPO, id: "sc-outro" } }, "ST-SCOPE"],
      ["documento divergente", { scope: { ...ESCOPO, approvedDocument: { path: DOC, sha256: "0".repeat(64) } } }, "ST-SCOPE"],
      ["migration não listada", { m: missao({ paths: ["supabase/migrations/20261101000099_outra.sql"] }) }, "ST-RISK"],
      ["diretório estrutural", { m: missao({ paths: ["supabase/migrations/"] }) }, "ST-RISK"],
      ["control plane com scopeRef", { m: missao({ paths: [MIG, "scripts/claude-structural.mjs"] }) }, "ST-SCOPE"],
      ["escopo versionado na missão", { m: missao({ paths: [MIG, `docs/harness/scopes/${ESCOPO.id}.json`] }) }, "ST-RISK"],
    ];
    for (const [nome, args, esperado] of casos) expect(await derivar(imp, args).then(() => "OK", (e) => e.code), nome).toBe(esperado);
  },
  async "requirements-ref"(imp) {
    const { validateMission, requirementsProblem } = await imp("claude-standing.mjs");
    const doc = "Requisitos sintéticos v1\n";
    const ref = { document: "docs/product/marketing-ops/I18N-SINTETICO.md", version: "1.0", sha256: crypto.createHash("sha256").update(doc).digest("hex") };
    const m = missao({ requirementsRef: ref });
    expect(() => validateMission(m)).not.toThrow();
    expect(requirementsProblem(missao(), null)).toBeNull(); // sem o campo: elegível como antes
    expect(requirementsProblem(m, doc)).toBeNull();
    expect(requirementsProblem(m, `${doc}alterado\n`)).toBe("requirements-sha256");
    expect(requirementsProblem(m, null)).toBe("requirements-ausente-em-main");
    for (const ruim of [{ ...ref, sha256: "x" }, { ...ref, document: "/etc/x" }, { ...ref, document: "../x.md" }, { ...ref, extra: 1 }, { document: ref.document, sha256: ref.sha256 }]) {
      expect(codigo(() => validateMission(missao({ requirementsRef: ruim }))), JSON.stringify(ruim)).toBe("ST-MISSION");
    }
    // dependsOn continua sendo dependência ENTRE missões
    expect(codigo(() => validateMission(missao({ dependsOn: ["ADR-0010"] })))).toBe("ST-MISSION");
    expect(codigo(() => validateMission(missao({ dependsOn: ["ms-200"] })))).toBe("OK");
  },
  async "runner-vinculo-ao-head"(imp) {
    const { structuralForHead } = await imp("claude-runner.mjs");
    const { decide } = await imp("claude-gates.mjs");
    const s = await standing(imp);
    const record = await derivar(imp);
    const resultado = (sha, over = {}) => ({ schema: "oplyra-structural-gate/1", sha, baseSha: BASE, scopeRef: ESCOPO.id, approvedDocumentSha256: DOC_SHA, risk: "structural", eligible: true, conclusion: "success", structural: [MIG, PGTAP], elevated: [], routine: [], ...over });
    const pr = (sha) => observacao({ branch: record.branch, sha, files: [{ path: MIG, status: "added" }, { path: PGTAP, status: "added" }], checks: verdes(sha) }).pr;
    let chamadas = 0;
    const porta = (r) => async ({ pr: p, scopeRef }) => { chamadas += 1; expect(scopeRef).toBe(ESCOPO.id); return typeof r === "function" ? r(p) : r; };
    // resultado do mesmo head: usado e guardado; segunda observação do mesmo head não recalcula
    let sg = await structuralForHead({ structuralGate: porta((p) => resultado(p.head.sha)), standing: s, record, pr: pr(HEAD_A) });
    expect(sg.structural).toMatchObject({ sha: HEAD_A, eligible: true });
    sg = await structuralForHead({ structuralGate: porta(null), standing: s, record, pr: pr(HEAD_A), cache: sg.cache });
    expect(sg.structural).toMatchObject({ sha: HEAD_A });
    expect(chamadas).toBe(1);
    // head mudou: o resultado anterior não vale; porta devolve resultado de OUTRO SHA → descartado → decide espera
    const cacheA = sg.cache;
    sg = await structuralForHead({ structuralGate: porta(resultado(HEAD_A)), standing: s, record, pr: pr(HEAD_C), cache: cacheA });
    expect(sg.structural).toBeUndefined();
    // e, com o resultado do novo head disponível, ele é obtido (o cache de A não prende o runner)
    expect((await structuralForHead({ structuralGate: porta((p) => resultado(p.head.sha)), standing: s, record, pr: pr(HEAD_C), cache: cacheA })).structural).toMatchObject({ sha: HEAD_C });
    const obsC = observacao({ branch: record.branch, sha: HEAD_C, files: [{ path: MIG, status: "added" }, { path: PGTAP, status: "added" }], checks: verdes(HEAD_C) });
    expect(decide(obsC, { record, branch: record.branch, evidence: null, failures: {}, structural: sg.structural })).toMatchObject({ action: "wait", reason: "structural-gate-pending" });
    // documento lido da base diferente do registrado na autorização → inelegível (owner)
    sg = await structuralForHead({ structuralGate: porta(resultado(HEAD_C, { approvedDocumentSha256: "0".repeat(64) })), standing: s, record, pr: pr(HEAD_C) });
    expect(sg.structural).toMatchObject({ eligible: false, refused: "SC-AUTH" });
    expect(decide(obsC, { record, branch: record.branch, evidence: null, failures: {}, structural: sg.structural }).action).toBe("owner");
    // resultado válido do head C → merge simulado de C
    sg = await structuralForHead({ structuralGate: porta(resultado(HEAD_C)), standing: s, record, pr: pr(HEAD_C) });
    expect(decide(obsC, { record, branch: record.branch, evidence: null, failures: {}, structural: sg.structural })).toMatchObject({ action: "merge", sha: HEAD_C });
    // barreira independente: sem o GitHub exigir o structural-gate, missão estrutural não é integrada
    const semExigencia = { ...obsC, ruleset: { ...obsC.ruleset, structuralGate: false } };
    expect(decide(semExigencia, { record, branch: record.branch, evidence: null, failures: {}, structural: sg.structural })).toMatchObject({ action: "blocked", code: "ruleset-structural" });
  },
  async "admin-plano"(imp) {
    const { planRuleset } = await imp("claude-admin.mjs");
    const atual = { id: 1, name: "main-protection", target: "branch", enforcement: "active", rules: [
      { type: "pull_request", parameters: { required_approving_review_count: 1, dismiss_stale_reviews_on_push: true, allowed_merge_methods: ["squash"] } },
      { type: "non_fast_forward" }, { type: "deletion" }, { type: "required_linear_history" },
      { type: "required_status_checks", parameters: { strict_required_status_checks_policy: true, required_status_checks: [{ context: "validate", integration_id: 15368 }] } },
    ] };
    const plano = planRuleset(atual);
    const contexts = plano.next.rules.find((r) => r.type === "required_status_checks").parameters.required_status_checks.map((c) => c.context);
    expect(contexts).toEqual(["validate", "risk-gate", "structural-gate"]);
    expect(plano.assessment).toMatchObject({ mode: "routine-capable", structuralGate: true });
    expect(plano.before.structuralGate).toBe(false);
  },
};

const MUTACOES: Mutacao[] = [
  { nome: "M8g.1 autorização aceita só a classe structural", controle: "validateStanding: riskClasses", arquivo: "claude-standing.mjs",
    trocas: [{ de: "  if (classes !== RISK.routine && !(v2 && withStructural)) fail(\"ST-INVALID\", \"riskClasses\");\n", para: "  if (!v2 && classes !== RISK.routine) fail(\"ST-INVALID\", \"riskClasses\");\n" }],
    detectadaPor: ["v2-invalidas"], preservadas: ["v2-e-v1", "derivacao-estrutural"] },
  { nome: "M8g.2 scopeRef da missão não precisa constar da autorização", controle: "authorizedStructuralScope: entrada da autorização", arquivo: "claude-standing.mjs",
    trocas: [{ de: '  if (!entry) fail("ST-SCOPE", "scopeRef-nao-autorizado");\n', para: "" }],
    detectadaPor: ["derivacao-recusas"], preservadas: ["derivacao-estrutural"] },
  { nome: "M8g.3 escopo da base não precisa conferir com a autorização", controle: "authorizedStructuralScope: id e documento", arquivo: "claude-standing.mjs",
    trocas: [{ de: '  if (structuralScope.id !== mission.scopeRef || structuralScope.approvedDocument.path !== entry.approvedDocument.path || structuralScope.approvedDocument.sha256 !== entry.approvedDocument.sha256) fail("ST-SCOPE", "escopo-estrutural-divergente");\n', para: "" }],
    detectadaPor: ["derivacao-recusas"], preservadas: ["derivacao-estrutural"] },
  { nome: "M8g.4 arquivo estrutural fora da lista do escopo", controle: "deriveMissionRecord: arquivo listado no escopo", arquivo: "claude-standing.mjs",
    trocas: [{ de: " || !allowedStructural.has(p)) fail(\"ST-RISK\", p);", para: ") fail(\"ST-RISK\", p);" }],
    detectadaPor: ["derivacao-recusas"], preservadas: ["derivacao-estrutural"] },
  { nome: "M8g.5 requirementsRef não confere o sha256", controle: "requirementsProblem", arquivo: "claude-standing.mjs",
    trocas: [{ de: 'return sha256File(Buffer.from(mainContent)) === ref.sha256 ? null : "requirements-sha256";', para: "return null;" }],
    detectadaPor: ["requirements-ref"], preservadas: ["derivacao-estrutural"] },
  { nome: "M8g.6 runner aceita resultado de outro SHA", controle: "bindStructuralResult: result.sha === headSha", arquivo: "claude-runner.mjs",
    trocas: [{ de: "if (!result || typeof result !== \"object\" || result.sha !== headSha) return null;", para: "if (!result || typeof result !== \"object\") return null;" }],
    detectadaPor: [], preservadas: ["derivacao-estrutural", "runner-vinculo-ao-head"],
    redundancia: "structuralForHead só entrega o resultado se `sha === head` (segunda comparação) e decide ainda compara s.sha com o head (wait structural-gate-stale): resultado de outro SHA continua descartado. Mutação sobrevivente por defesa redundante, não por asserção fraca." },
  { nome: "M8g.7 runner não confere o documento com a autorização", controle: "bindStructuralResult: approvedDocumentSha256", arquivo: "claude-runner.mjs",
    trocas: [{ de: " || result.approvedDocumentSha256 !== entry.approvedDocument.sha256", para: "" }],
    detectadaPor: ["runner-vinculo-ao-head"], preservadas: ["derivacao-estrutural"] },
  { nome: "M8g.9 decide integra missão estrutural sem o GitHub exigir o structural-gate", controle: "decide: ruleset-structural", arquivo: "claude-gates.mjs",
    trocas: [{ de: '  if (ctx.record?.scopeRef && obs.ruleset.structuralGate !== true) return blocked("ruleset-structural", "o ruleset de main não exige o check structural-gate");\n', para: "" }],
    detectadaPor: ["runner-vinculo-ao-head"], preservadas: ["admin-plano"] },
  { nome: "M8g.10 plano administrativo não exige o structural-gate", controle: "planRuleset: checks obrigatórios", arquivo: "claude-admin.mjs",
    trocas: [{ de: 'for (const context of ["risk-gate", "structural-gate"])', para: 'for (const context of ["risk-gate"])' }],
    detectadaPor: ["admin-plano"], preservadas: ["runner-vinculo-ao-head"] },
  { nome: "M8g.8 runner não recalcula quando o head muda", controle: "structuralForHead: cache por SHA", arquivo: "claude-runner.mjs",
    trocas: [{ de: "  if (next?.sha !== pr.head.sha) next =", para: "  if (!next) next =" }],
    detectadaPor: ["runner-vinculo-ao-head"], preservadas: ["derivacao-estrutural"] },
];

describe("cenário 8g — autorização v2, scopeRef/requirementsRef e resultado do gate do mesmo head", () => {
  it("implementação original", async () => {
    const { avaliar } = await import("./developer-harness.mutacao");
    expect(await avaliar(PROPS, importarReal)).toEqual(Object.fromEntries(Object.keys(PROPS).map((k) => [k, null])));
  });
  for (const m of MUTACOES) it(`mutação — ${m.nome}`, () => verificarMutacao("cenário 8g", PROPS, m));
  afterAll(() => console.log(`\nEVIDÊNCIA DE MUTAÇÕES — cenário 8g\n${evidencia.filter((e) => e.startsWith("[cenário 8g]")).join("\n")}\n`));
});
