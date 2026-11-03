// @ts-nocheck — control plane (.mjs sem tipos).
// CENÁRIO 8e — billing/i18n e diretórios de um nível (INTEGRACAO-PR11-E-PERFIS §8, §9; I18N-SPEC; D-E3).
// Componentes REAIS: claude-risk.mjs (classifyPath, classifyChangeWithContent, analyzeTranslationCatalog, contentFindings), validatePaths,
// deriveMissionRecord, CODEOWNERS real (parseCodeowners) e o worker nativeAgent num repositório Git SINTÉTICO (processo Codex e wrappers
// simulados). Nenhum Stripe, nenhum preço real: os valores das fixtures são ilustrativos. Isto NÃO autoriza billing nem acesso externo.
import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { RAIZ, evidencia, importarReal, verificarMutacao, type Mutacao, type Propriedades } from "./developer-harness.mutacao";

const BILLING = [
  "apps/web/src/app/billing/page.tsx", "apps/web/src/app/api/webhooks/stripe/route.ts", "packages/infra/src/stripe/client.ts",
  "packages/core/src/domain/entitlements.ts", "packages/core/src/application/pricing-table.ts", "packages/core/src/domain/subscription.ts",
];
const CATALOGO = "apps/web/src/messages/pt-BR.json";
/** Padrão de catálogo SINTÉTICO, injetado só no teste: o padrão real ainda não foi definido pela frente de idiomas (lacuna). */
const PADRAO_SINTETICO = /^apps\/web\/src\/messages\/[a-z]{2}(-[a-z]{2})?\.json$/;
const cat = (obj) => JSON.stringify(obj);
const ORCAMENTO = { wallClockSeconds: 3600, iterations: 5, logReads: 10 };

const PROPS: Propriedades = {
  async "billing-elevado"(imp) {
    const { classifyPath, parseCodeowners, ownersOf } = await imp("claude-risk.mjs");
    const owners = parseCodeowners(fs.readFileSync(path.join(RAIZ, ".github/CODEOWNERS"), "utf8"));
    for (const p of BILLING) {
      expect(classifyPath(p), p).toMatchObject({ risk: "elevated", reason: "billing" });
      expect(ownersOf(owners, p), `CODEOWNERS: ${p}`).not.toBeNull();
    }
    // documentos em docs/product não são afetados
    for (const d of ["docs/product/marketing-ops/08-billing-entitlements.md", "docs/product/marketing-ops/billing/STRIPE-FLOWS.md"]) expect(classifyPath(d).risk, d).toBe("routine");
    // precedência sobre o perfil de produto: um caminho de billing dentro de packages/core/src/domain/ não entra na missão rotineira
    const { buildStanding, deriveMissionRecord } = await imp("claude-standing.mjs");
    const { PRODUCT_PROFILE } = await imp("codex-authorize.mjs");
    const standing = buildStanding({ ...PRODUCT_PROFILE, confirmation: "AUTORIZAR-DESENVOLVIMENTO-CONTINUO" });
    const missao = { id: "ms-301", type: "feat", title: "Ajustar entitlements", goal: "Alterar regra de entitlements sintética.", paths: ["packages/core/src/domain/entitlements.ts"], dependsOn: [], acceptance: ["ok"] };
    const code = (() => { try { deriveMissionRecord({ standing, standingSha256: "e".repeat(64), mission: missao, baseSha: "b".repeat(40) }); return "OK"; } catch (e) { return e.code; } })();
    expect(code).toBe("ST-RISK");
  },
  async "i18n-catalogo-indefinido"(imp) {
    const { classifyChangeWithContent, I18N_CATALOG_PATTERN, parseCodeowners, ownersOf } = await imp("claude-risk.mjs");
    expect(I18N_CATALOG_PATTERN).toBeNull(); // lacuna registrada: o formato do catálogo não foi definido
    const v = classifyChangeWithContent([{ path: CATALOGO, status: "added", content: cat({ ola: "Olá, {nome}" }) }]);
    expect(v).toMatchObject({ risk: "elevated", elevated: [{ path: CATALOGO, reason: "i18n-catalogo-indefinido" }] });
    expect(ownersOf(parseCodeowners(fs.readFileSync(path.join(RAIZ, ".github/CODEOWNERS"), "utf8")), CATALOGO)).not.toBeNull();
  },
  async "i18n-placeholders-aceitos"(imp) {
    const { classifyChangeWithContent } = await imp("claude-risk.mjs");
    const conteudo = cat({ saudacao: "Olá, {nome}", lista: { itens: "{count} itens selecionados", vazio: "Nenhum item" } });
    expect(classifyChangeWithContent([{ path: CATALOGO, status: "modified", content: conteudo }], { i18nCatalog: PADRAO_SINTETICO })).toMatchObject({ risk: "routine", elevated: [] });
  },
  async "i18n-comercial-recusado"(imp) {
    const { classifyChangeWithContent, analyzeTranslationCatalog } = await imp("claude-risk.mjs");
    const casos = {
      "Plano Pro por R$ 99/mês": "numero-em-traducao",
      "Até 3 marcas": "numero-em-traducao",
      "Exibido em BRL": "moeda-em-traducao",
      "Renovação automática": "termo-comercial-em-traducao",
      "Cancele quando quiser": "termo-comercial-em-traducao",
      "Total: {price}": "placeholder-comercial",
      "Moeda: {currency}": "placeholder-comercial",
      "{count, plural, one {# item} other {# itens}}": "placeholder-nao-permitido",
    };
    for (const [texto, motivo] of Object.entries(casos)) {
      expect(analyzeTranslationCatalog(cat({ chave: texto })), texto).toEqual({ ok: false, reason: motivo });
      const v = classifyChangeWithContent([{ path: CATALOGO, status: "modified", content: cat({ chave: texto }) }], { i18nCatalog: PADRAO_SINTETICO });
      expect(v.risk, texto).toBe("elevated");
    }
    expect(classifyChangeWithContent([{ path: CATALOGO, status: "modified" }], { i18nCatalog: PADRAO_SINTETICO }).elevated[0].reason).toBe("i18n-conteudo-ausente");
  },
  async "locale-define-moeda"(imp) {
    const { contentFindings, classifyChangeWithContent } = await imp("claude-risk.mjs");
    const f = "packages/core/src/application/oferta.ts";
    for (const code of [
      "const currency = locale === 'pt-BR' ? 'BRL' : 'USD';",
      "export const CURRENCY_BY_LOCALE = { 'pt-BR': 'BRL', 'en-US': 'USD' };",
      "switch (lang) { case 'en-US': return 'USD'; }",
      "const planId = plansByLanguage[uiLocale];",
      "return { priceId: prices[preferredLocale] };",
      "const x = uiLocale === 'en-US' ? prices.usd : prices.brl;",
    ]) {
      expect(contentFindings(f, code), code).toContain("locale-define-termo-comercial");
      expect(classifyChangeWithContent([{ path: f, status: "modified", content: code }]).risk, code).toBe("elevated");
    }
    // apresentação: formatar a moeda JÁ contratada com o idioma da tela é permitido
    for (const ok of [
      "const texto = new Intl.NumberFormat(locale, { style: 'currency', currency: assinatura.billingCurrency }).format(valor);",
      "const titulo = t('saudacao', { nome });",
      "const planLabel = labels[locale];",
    ]) expect(contentFindings(f, ok), ok).toEqual([]);
  },
  async "stripe-externo"(imp) {
    const { contentFindings, classifyChangeWithContent } = await imp("claude-risk.mjs");
    const f = "packages/infra/src/pagamentos/adapter.ts";
    for (const code of ["import Stripe from \"stripe\";", "const k = 'sk_test_51Sintetico';", "await fetch('https://api.stripe.com/v1/customers');", "import { loadStripe } from '@stripe/stripe-js';"]) {
      expect(contentFindings(f, code), code).toContain("stripe-acesso-externo");
      expect(classifyChangeWithContent([{ path: f, status: "added", content: code }]).risk, code).toBe("elevated");
    }
    // adapter simulado (padrão): sem SDK, chave ou endpoint
    expect(classifyChangeWithContent([{ path: f, status: "added", content: "export const pagamentos = { criar: async () => ({ id: 'simulado' }) };" }]).risk).toBe("routine");
  },
  async "e2e-aceito"(imp) {
    const { validatePaths } = await imp("claude-delivery-record.mjs");
    expect(validatePaths(["e2e/"], undefined)).toEqual(["e2e/"]);
    const { buildStanding, deriveMissionRecord } = await imp("claude-standing.mjs");
    const standing = buildStanding({ paths: ["e2e/", "packages/core/test/"], missionBudgets: ORCAMENTO, confirmation: "AUTORIZAR-DESENVOLVIMENTO-CONTINUO" });
    const record = deriveMissionRecord({ standing, standingSha256: "e".repeat(64), mission: { id: "ms-302", type: "test", title: "Cobrir fluxo e2e", goal: "Acrescentar um spec e2e sintético.", paths: ["e2e/"], dependsOn: [], acceptance: ["ok"] }, baseSha: "b".repeat(40) });
    expect(record.paths).toEqual(["e2e/", "docs/progresso/ms-302.md"]);
  },
  async "um-nivel-recusado"(imp) {
    const { validatePaths, RecordError } = await imp("claude-delivery-record.mjs");
    for (const ruim of ["test/", "docs/", "apps/", "packages/", "scripts/", "supabase/", "E2E/", "e2e2/", "e2e/../test/", "e2e*/"]) {
      expect(() => validatePaths([ruim], undefined), ruim).toThrow(RecordError);
    }
  },
  async "worker-recusa-conteudo"(imp) {
    // missão rotineira por caminho; o conteúdo faz o idioma escolher a moeda → o worker não entrega
    const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "oplyra-conteudo-")));
    const g = (...a) => spawnSync("git", a, { cwd: repo, encoding: "utf8", env: { PATH: process.env.PATH, HOME: repo, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_AUTHOR_NAME: "f", GIT_AUTHOR_EMAIL: "f@example.test", GIT_COMMITTER_NAME: "f", GIT_COMMITTER_EMAIL: "f@example.test" } });
    fs.writeFileSync(path.join(repo, ".gitignore"), ".oplyra/\n");
    fs.mkdirSync(path.join(repo, "packages/core/src/application"), { recursive: true });
    fs.writeFileSync(path.join(repo, "packages/core/src/application/base.ts"), "export {};\n");
    g("init", "-q", "-b", "main"); g("add", "-A"); g("commit", "-q", "-m", "base");
    const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "oplyra-home-")));
    const recordDir = path.join(home, ".oplyra", "delivery");
    const { buildStanding, deriveMissionRecord } = await imp("claude-standing.mjs");
    const standing = buildStanding({ paths: ["packages/core/src/application/"], missionBudgets: ORCAMENTO, confirmation: "AUTORIZAR-DESENVOLVIMENTO-CONTINUO" });
    const record = deriveMissionRecord({ standing, standingSha256: "e".repeat(64), mission: { id: "ms-303", type: "feat", title: "Exibir oferta", goal: "Exibir a oferta na tela sintética.", paths: ["packages/core/src/application/"], dependsOn: [], acceptance: ["ok"] }, baseSha: "b".repeat(40) });
    (await imp("claude-delivery-record.mjs")).writeRecord(record, { recordDir });
    const { nativeAgent } = await imp("codex-agent.mjs");
    const rodar = async (conteudo) => {
      const chamadas = [];
      const agent = nativeAgent({
        repoRoot: repo, home, recordDir, git: (args) => spawnSync("git", args, { cwd: repo, encoding: "utf8" }),
        wrapper: async (verb, args) => { chamadas.push([verb, args]); return { code: 0, out: "" }; },
        processAgent: async ({ outputFile }) => {
          fs.writeFileSync(path.join(repo, "packages/core/src/application/oferta.ts"), conteudo);
          fs.writeFileSync(outputFile, JSON.stringify({ status: "completed", title: "feat: oferta", commitMessage: "feat: exibir oferta", body: "b", diagnosis: "" }));
          return { exitCode: 0 };
        },
      });
      const prompt = path.join(home, "p.md");
      fs.writeFileSync(prompt, "missão\n");
      return { res: await agent({ ref: "ms-303", kind: "implement", promptFile: prompt, timeoutSeconds: 60, shouldStop: () => false }), chamadas };
    };
    const ruim = await rodar("export const moeda = (locale: string) => { const currency = locale === 'pt-BR' ? 'BRL' : 'USD'; return currency; };\n");
    expect(ruim.res).toMatchObject({ exitCode: 2 });
    expect(ruim.chamadas.map(([v]) => v)).not.toContain("stage");
    const bom = await rodar("export const formatar = (valor: number, moeda: string, locale: string) => new Intl.NumberFormat(locale, { style: 'currency', currency: moeda }).format(valor);\n");
    expect(bom.res).toMatchObject({ exitCode: 0 });
    expect(bom.chamadas.map(([v]) => v)).toContain("stage");
  },
};

const RISK = "claude-risk.mjs";
const MUTACOES: Mutacao[] = [
  { nome: "M8e.1 remove a regra de billing", controle: "ELEVATED_RULES[billing]", arquivo: RISK,
    trocas: [{ de: '  ["billing", (r) => BILLING_CODE.test(r)],\n', para: "" }], detectadaPor: ["billing-elevado"], preservadas: ["i18n-placeholders-aceitos", "e2e-aceito"] },
  { nome: "M8e.2 aceita catálogo sem padrão aprovado", controle: "classifyChangeWithContent: i18n-catalogo-indefinido", arquivo: RISK,
    trocas: [{ de: '      if (!(i18nCatalog instanceof RegExp) || !i18nCatalog.test(rel)) return { ...base, reason: "i18n-catalogo-indefinido" };\n', para: "" }],
    detectadaPor: ["i18n-catalogo-indefinido"], preservadas: ["i18n-placeholders-aceitos"] },
  { nome: "M8e.3 remove a checagem de moeda no catálogo", controle: "analyzeTranslationCatalog: moeda", arquivo: RISK,
    trocas: [{ de: '      if (CURRENCY.test(prose)) return { ok: false, reason: "moeda-em-traducao" };\n', para: "" }], detectadaPor: ["i18n-comercial-recusado"], preservadas: ["i18n-placeholders-aceitos"] },
  { nome: "M8e.4 remove a checagem de números (valores, limites) no catálogo", controle: "analyzeTranslationCatalog: número", arquivo: RISK,
    trocas: [{ de: '      if (/\\d/.test(prose)) return { ok: false, reason: "numero-em-traducao" };\n', para: "" }], detectadaPor: ["i18n-comercial-recusado"], preservadas: ["i18n-placeholders-aceitos"] },
  { nome: "M8e.5 remove os termos comerciais (renovação, cancelamento, preço)", controle: "analyzeTranslationCatalog: termos", arquivo: RISK,
    trocas: [{ de: '      if (COMMERCIAL_WORDS.test(prose.normalize("NFC"))) return { ok: false, reason: "termo-comercial-em-traducao" };\n', para: "" }], detectadaPor: ["i18n-comercial-recusado"], preservadas: ["i18n-placeholders-aceitos"] },
  { nome: "M8e.6 permite placeholder comercial ({price}, {currency})", controle: "analyzeTranslationCatalog: placeholder comercial", arquivo: RISK,
    trocas: [{ de: '        if (COMMERCIAL_PLACEHOLDER.test(name)) return { ok: false, reason: "placeholder-comercial" };\n', para: "" }], detectadaPor: ["i18n-comercial-recusado"], preservadas: ["i18n-placeholders-aceitos"] },
  { nome: "M8e.7 remove a detecção de locale definindo moeda/preço/plano", controle: "contentFindings: locale-define-termo-comercial", arquivo: RISK,
    trocas: [{ de: '  if (LOCALE_DERIVES.some((re) => re.test(text))) out.push("locale-define-termo-comercial");\n', para: "" }], detectadaPor: ["locale-define-moeda", "worker-recusa-conteudo"], preservadas: ["stripe-externo"] },
  { nome: "M8e.8 remove a detecção de acesso ao Stripe", controle: "contentFindings: stripe-acesso-externo", arquivo: RISK,
    trocas: [{ de: '  if (STRIPE_ACCESS.test(text)) out.push("stripe-acesso-externo");\n', para: "" }], detectadaPor: ["stripe-externo"], preservadas: ["locale-define-moeda"] },
  { nome: "M8e.9 amplia a exceção de um nível a qualquer diretório", controle: "validatePaths: ROUTINE_TOP_LEVEL_DIRS", arquivo: "claude-delivery-record.mjs",
    trocas: [{ de: "if (dir && !bare.includes(\"/\") && !ROUTINE_TOP_LEVEL_DIRS.includes(bare)) fail(\"DR-PATHS\");", para: "if (false) fail(\"DR-PATHS\");" }], detectadaPor: ["um-nivel-recusado"], preservadas: ["e2e-aceito"] },
  { nome: "M8e.10 remove a exceção nomeada e2e/", controle: "ROUTINE_TOP_LEVEL_DIRS", arquivo: "claude-delivery-record.mjs",
    trocas: [{ de: 'export const ROUTINE_TOP_LEVEL_DIRS = Object.freeze(["e2e"]);', para: "export const ROUTINE_TOP_LEVEL_DIRS = Object.freeze([]);" }], detectadaPor: ["e2e-aceito"], preservadas: ["um-nivel-recusado"] },
  { nome: "M8e.11 remove a checagem de conteúdo do worker", controle: "nativeAgent: classifyChangeWithContent antes do stage", arquivo: "codex-agent.mjs",
    trocas: [{ de: '      if (files.length && classifyChangeWithContent(withContent).risk !== "routine") throw new Error("codex-content");\n', para: "" }], detectadaPor: ["worker-recusa-conteudo"], preservadas: ["locale-define-moeda"] },
];

describe("cenário 8e — billing/webhook/entitlement, catálogos de tradução, locale × moeda, Stripe e e2e/", () => {
  it("implementação original: billing elevado, tradução só com placeholders, locale não define moeda, e2e/ sim, test/ e docs/ não", async () => {
    const { avaliar } = await import("./developer-harness.mutacao");
    expect(await avaliar(PROPS, importarReal)).toEqual(Object.fromEntries(Object.keys(PROPS).map((k) => [k, null])));
  });
  it("nenhum arquivo atual de apps/ e packages/ é reclassificado pelas regras novas (sem falso positivo no produto existente)", async () => {
    const { classifyChangeWithContent } = await import("../scripts/claude-risk.mjs");
    const listar = spawnSync("git", ["ls-files", "apps", "packages"], { cwd: RAIZ, encoding: "utf8" }).stdout.split("\n").filter((f) => /\.([cm]?[jt]sx?|json)$/.test(f) && !f.endsWith("package.json") && !/tsconfig[^/]*\.json$/.test(f) && !/(vitest|playwright|next)\.config\./.test(f));
    expect(listar.length).toBeGreaterThan(20);
    const v = classifyChangeWithContent(listar.map((f) => ({ path: f, status: "modified", content: fs.readFileSync(path.join(RAIZ, f), "utf8") })));
    expect(v.elevated).toEqual([]);
  });
  for (const m of MUTACOES) it(`mutação — ${m.nome}`, () => verificarMutacao("cenário 8e", PROPS, m));
  afterAll(() => console.log(`\nEVIDÊNCIA DE MUTAÇÕES — cenário 8e\n${evidencia.filter((e) => e.startsWith("[cenário 8e]")).join("\n")}\n`));
});
