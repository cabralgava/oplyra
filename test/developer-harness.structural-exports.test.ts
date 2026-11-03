// @ts-nocheck — control plane (.mjs sem tipos).
// CENÁRIO 1 — exports autorizado × alteração mista de package.json (INTEGRACAO-PR11-E-PERFIS §4 S-5).
// Componentes REAIS: scripts/claude-structural.mjs (evaluateStructural) e scripts/claude-gates.mjs (decide). Fixtures sintéticas em memória;
// a observação do GitHub é SIMULADA. Elegibilidade estrutural não dispensa CI, evidência do SHA exato nem os demais gates.
import { afterAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { evidencia, importarReal, observacao, verificarMutacao, verdes, type Mutacao, type Propriedades } from "./developer-harness.mutacao";

const DOC = "docs/product/marketing-ops/contracts/changes/CR-040-escopo-sintetico.md";
const DOC_SHA = crypto.createHash("sha256").update("escopo sintético aprovado pelo proprietário\n").digest("hex");
const PKG = "packages/core/package.json";
const SHA = "c".repeat(40);
const BRANCH = "agent/feat/ms-201-exports-sinteticos";

const BASE = {
  name: "@oplyra/core", version: "0.1.0", private: true, type: "module",
  exports: { ".": "./src/index.ts", "./brand": "./src/brand.ts" },
  scripts: { test: "vitest run" }, dependencies: { zod: "^4.0.0" }, devDependencies: { typescript: "^7.0.2" },
};
const ESCOPO = {
  schema: "oplyra-structural-scope/1", id: "sc-sintetico-exports", approvedDocument: { path: DOC, sha256: DOC_SHA },
  packageExports: [{ file: PKG, add: { "./assets": "./src/assets.ts" } }], migrations: [], tests: [],
};
const PERMITIDO = { ...BASE, exports: { ...BASE.exports, "./assets": "./src/assets.ts" } };
const mudanca = (head, file = PKG) => ({ path: file, status: "modified", base: JSON.stringify(BASE, null, 2), head: JSON.stringify(head, null, 2) });
const avaliarCom = (S, head, over = {}) => S.evaluateStructural({ changes: [mudanca(head)], scope: ESCOPO, scopeRef: ESCOPO.id, approvedDocumentSha256: DOC_SHA, ...over });

/** Decisão simulada com o resultado do gate para o head: nunca `merge` quando a mudança não é elegível. */
async function decisao(imp, veredito) {
  const { decide } = await imp("claude-gates.mjs");
  const { buildRecord } = await imp("claude-delivery-record.mjs");
  const record = buildRecord({ ref: "ms-201", branch: BRANCH, baseSha: "b".repeat(40), paths: [PKG], scopeRef: ESCOPO.id, confirmation: "standing:0123456789abcdef", budgets: { wallClockSeconds: 3600, iterations: 5, logReads: 10 } });
  const structural = { ...veredito, sha: SHA, conclusion: veredito.risk === "elevated" ? "failure" : "success" };
  return decide(observacao({ branch: BRANCH, sha: SHA, files: [{ path: PKG, status: "modified" }], checks: verdes(SHA) }), { record, branch: BRANCH, evidence: null, failures: {}, structural });
}

const recusadoElevado = (v, motivo) => {
  expect(v.risk).toBe("elevated");
  expect(v.eligible).toBe(false);
  expect(v.structural).toEqual([]);
  expect(v.elevated.map((e) => e.reason)).toContain(motivo);
};

const PROPS: Propriedades = {
  async permitido(imp) {
    const S = await imp("claude-structural.mjs");
    const v = avaliarCom(S, PERMITIDO);
    expect(v).toMatchObject({ risk: "structural", eligible: true, scopeRef: ESCOPO.id, structural: [PKG], elevated: [] });
    // elegível ≠ integrado: com CI pendente a decisão é esperar; com tudo verde no MESMO SHA, merge desse SHA (simulado)
    const { decide } = await imp("claude-gates.mjs");
    const d = await decisao(imp, v);
    expect(d).toMatchObject({ action: "merge", sha: SHA });
    const { buildRecord } = await imp("claude-delivery-record.mjs");
    const record = buildRecord({ ref: "ms-201", branch: BRANCH, baseSha: "b".repeat(40), paths: [PKG], scopeRef: ESCOPO.id, confirmation: "standing:0123456789abcdef", budgets: { wallClockSeconds: 3600, iterations: 5, logReads: 10 } });
    const pendente = decide(observacao({ branch: BRANCH, sha: SHA, files: [{ path: PKG, status: "modified" }], checks: verdes(SHA, ["validate", "risk-gate"]) }), { record, branch: BRANCH, evidence: null, failures: {}, structural: { ...v, sha: SHA, conclusion: "success" } });
    expect(pendente.action).toBe("wait");
  },
  async "mista-scripts"(imp) {
    const v = avaliarCom(await imp("claude-structural.mjs"), { ...PERMITIDO, scripts: { ...BASE.scripts, postinstall: "node x.js" } });
    recusadoElevado(v, "campo-nao-autorizado:scripts");
    expect((await decisao(imp, v)).action).toBe("owner");
  },
  async "mista-dependencies"(imp) {
    const S = await imp("claude-structural.mjs");
    const v = avaliarCom(S, { ...PERMITIDO, dependencies: { ...BASE.dependencies, "left-pad": "^1.3.0" } });
    recusadoElevado(v, "campo-nao-autorizado:dependencies");
    expect((await decisao(imp, v)).action).toBe("owner");
    recusadoElevado(avaliarCom(S, { ...PERMITIDO, devDependencies: { typescript: "^8.0.0" } }), "campo-nao-autorizado:devDependencies");
  },
  async "exports-fora-dos-alvos"(imp) {
    const S = await imp("claude-structural.mjs");
    recusadoElevado(avaliarCom(S, { ...BASE, exports: { ...BASE.exports, "./assets": "./src/outro.ts" } }), "exports-fora-do-autorizado");
    recusadoElevado(avaliarCom(S, { ...PERMITIDO, exports: { ...PERMITIDO.exports, "./extra": "./src/extra.ts" } }), "exports-fora-do-autorizado");
    recusadoElevado(avaliarCom(S, { ...PERMITIDO, exports: { ...PERMITIDO.exports, "./brand": "./src/brand-v2.ts" } }), "exports-existente-alterado:./brand");
    recusadoElevado(avaliarCom(S, BASE), "exports-fora-do-autorizado");
  },
  async "escopo-ausente-ou-invalido"(imp) {
    const S = await imp("claude-structural.mjs");
    for (const scope of [undefined, null, {}, { ...ESCOPO, extra: 1 }, { ...ESCOPO, packageExports: [{ file: PKG, add: { "./assets": "./dist/assets.js" } }] }, { ...ESCOPO, packageExports: [{ file: "package.json", add: { "./assets": "./src/assets.ts" } }] }]) {
      const v = avaliarCom(S, PERMITIDO, { scope });
      expect(v, JSON.stringify(scope)).toMatchObject({ refused: "SC-SCOPE", eligible: false, risk: "elevated" });
    }
  },
  async "escopo-de-outra-missao"(imp) {
    const v = avaliarCom(await imp("claude-structural.mjs"), PERMITIDO, { scopeRef: "sc-outro-incremento" });
    expect(v).toMatchObject({ refused: "SC-SCOPE", detail: "scope-ref", eligible: false });
  },
  async "documento-aprovado-divergente"(imp) {
    const v = avaliarCom(await imp("claude-structural.mjs"), PERMITIDO, { approvedDocumentSha256: "0".repeat(64) });
    expect(v).toMatchObject({ refused: "SC-SCOPE", detail: "documento-aprovado", eligible: false });
  },
  async "escopo-nao-cobre"(imp) {
    const S = await imp("claude-structural.mjs");
    const escopoInfra = { ...ESCOPO, packageExports: [{ file: "packages/infra/package.json", add: { "./assets": "./src/assets.ts" } }] };
    recusadoElevado(avaliarCom(S, PERMITIDO, { scope: escopoInfra }), "fora-do-escopo");
    // package.json fora de packages/{core,infra,testing} nunca é estrutural
    const web = S.evaluateStructural({ changes: [mudanca(PERMITIDO, "apps/web/package.json")], scope: ESCOPO, scopeRef: ESCOPO.id, approvedDocumentSha256: DOC_SHA });
    recusadoElevado(web, "fora-do-escopo");
  },
};

const SRC = "claude-structural.mjs";
const MUTACOES: Mutacao[] = [
  {
    nome: "M1.1 remove a comparação dos campos não autorizados", controle: "analyzePackageJson: igualdade dos campos fora de exports", arquivo: SRC,
    trocas: [{ de: "  for (const key of otherKeys) if (canon(b[key]) !== canon(h[key])) return no(`campo-nao-autorizado:${key}`);\n", para: "" }],
    detectadaPor: ["mista-scripts", "mista-dependencies"], preservadas: ["permitido", "exports-fora-dos-alvos"],
  },
  {
    nome: "M1.2 aceita qualquer package.json porque exports mudou", controle: "analyzePackageJson: aceitação por mudança em exports", arquivo: SRC,
    trocas: [{ de: '  if (!isObj(b) || !isObj(h)) return no("package-json-ilegivel");\n', para: '  if (!isObj(b) || !isObj(h)) return no("package-json-ilegivel");\n  if (canon(b.exports) !== canon(h.exports)) return yes();\n' }],
    detectadaPor: ["mista-scripts", "mista-dependencies", "exports-fora-dos-alvos"], preservadas: ["permitido"],
  },
  {
    nome: "M1.3a ignora a vinculação ao scopeRef da missão", controle: "evaluateStructural: scope.id === scopeRef", arquivo: SRC,
    trocas: [{ de: '  if (typeof scopeRef !== "string" || s.id !== scopeRef) return refused("scope-ref");\n', para: "" }],
    detectadaPor: ["escopo-de-outra-missao"], preservadas: ["permitido"],
  },
  {
    nome: "M1.3b ignora o hash do documento aprovado", controle: "evaluateStructural: sha256 do documento aprovado (base confiável)", arquivo: SRC,
    trocas: [{ de: '  if (approvedDocumentSha256 !== s.approvedDocument.sha256) return refused("documento-aprovado");\n', para: "" }],
    detectadaPor: ["documento-aprovado-divergente"], preservadas: ["permitido"],
  },
  {
    nome: "M1.3c ignora a cobertura do escopo (qualquer entrada serve)", controle: "evaluateStructural: entrada de exports do MESMO arquivo", arquivo: SRC,
    trocas: [{ de: "analyzePackageJson(ch, s.packageExports.find((e) => e.file === rel))", para: "analyzePackageJson(ch, s.packageExports[0])" }],
    detectadaPor: ["escopo-nao-cobre"], preservadas: ["permitido"],
  },
];

describe("cenário 1 — exports autorizado × package.json misto", () => {
  it("implementação original: caso permitido elegível e todos os casos proibidos recusados", async () => {
    const { avaliar } = await import("./developer-harness.mutacao");
    expect(await avaliar(PROPS, importarReal)).toEqual(Object.fromEntries(Object.keys(PROPS).map((k) => [k, null])));
  });
  for (const m of MUTACOES) it(`mutação detectada — ${m.nome}`, () => verificarMutacao("cenário 1", PROPS, m));
  afterAll(() => console.log(`\nEVIDÊNCIA DE MUTAÇÕES — cenário 1\n${evidencia.filter((e) => e.startsWith("[cenário 1]")).join("\n")}\n`));
});
