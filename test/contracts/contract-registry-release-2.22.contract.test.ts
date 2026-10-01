// Contract Registry Release 2.22 (CR-032, slice S1): reconciliação textual da
// política Git do Developer Harness. A cross-validation é reexecutada e o
// manifest é conferido como mudança lógica sobre a Release 2.21 (verificada
// congelada pelo seu próprio teste). Este teste valida o CONTEÚDO CORRENTE:
// artefatos do CR-032 e artefatos herdados dos CR-028 a CR-031 conferem com o
// disco; `ESTADO.md`, `PREPARACAO-I01.md`, `VERIFICACOES.md` e
// `.claude/settings.local.json` ficam fora do manifest. Só o S1 foi aplicado:
// S2–S7 continuam não autorizados e não implementados.
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { avaliarCr032S1, CONTRACTS_DIR, CR030_DOCS, CR032_DOC, runCrossRegistryValidation } from "./cross-registry-validation.ts";

type Artefato = { path: string; category: string; sizeBytes: number; sha256: string; source: string };
type Manifest = Record<string, any> & { artifacts: Artefato[] };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const ler = (p: string): Record<string, any> => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const texto = (p: string) => readFileSync(join(ROOT, p), "utf8");
const sha = (p: string) => createHash("sha256").update(readFileSync(join(ROOT, p))).digest("hex");
const agregado = (artefatos: { path: string; sha256: string }[]) =>
  createHash("sha256").update([...artefatos].sort((a, b) => a.path.localeCompare(b.path)).map((a) => `${a.path}:${a.sha256}`).join("\n")).digest("hex");

const relatorio = ler(`${CONTRACTS_DIR}/cross-registry-validation-v2.22.json`);
const m = ler(`${CONTRACTS_DIR}/contract-registry-manifest-v2.22.json`) as Manifest;
const base = ler(`${CONTRACTS_DIR}/contract-registry-manifest-v2.21.json`) as Manifest;
const FONTE = "cr_032";
const DOC16 = "docs/product/marketing-ops/16-environments-release.md";
const PLANO = "docs/product/marketing-ops/15-test-plan.md";
const PSP = "docs/harness/PREPARACAO-SUPABASE-PRODUCAO.md";
const FORA_DO_ESCOPO = ["pnpm-workspace.yaml", ".claude/settings.local.json", "docs/harness/ESTADO.md"];
const OPERACIONAIS = ["docs/harness/PREPARACAO-I01.md", "docs/harness/VERIFICACOES.md", "docs/harness/ESTADO.md"];
const S1_DOCS = ["docs/harness/DESENVOLVIMENTO.md", "docs/harness/DEVELOPMENT-TOOLS.md", "docs/harness/AUTONOMOUS-BUILD.md"] as const;
const CR032_ADICIONADOS = [
  CR032_DOC,
  "docs/product/marketing-ops/contracts/cross-registry-validation-v2.22.json",
  "test/contracts/contract-registry-release-2.22.contract.test.ts",
] as const;
const CR032_MODIFICADOS = [
  ...S1_DOCS, "test/contracts/contract-registry-release-2.21.contract.test.ts", "test/contracts/cross-registry-validation.ts",
] as const;

/** Classifica cada artefato da release; qualquer caso fora das três classes é violação. */
export function classificar(release: Manifest, anterior: Manifest, fonte = FONTE) {
  const b = new Map(anterior.artifacts.map((a) => [a.path, a]));
  const modificaveis = new Set<string>(release.changeSet.modifiedArtifacts ?? []);
  const adicionaveis = new Set<string>(release.changeSet.addedArtifacts ?? []);
  const herdados: string[] = [], modificados: string[] = [], adicionados: string[] = [], violacoes: string[] = [];
  const presentes = new Set(release.artifacts.map((a) => a.path));
  for (const a of release.artifacts) {
    const o = b.get(a.path);
    if (o) {
      const identico = JSON.stringify([o.path, o.category, o.sizeBytes, o.sha256, o.source]) === JSON.stringify([a.path, a.category, a.sizeBytes, a.sha256, a.source]);
      if (identico && !modificaveis.has(a.path)) herdados.push(a.path);
      else if (!identico && modificaveis.has(a.path) && a.source === fonte && a.category === o.category) modificados.push(a.path);
      else violacoes.push(`${a.path}: difere da base ${anterior.releaseVersion} fora do change set autorizado`);
    } else if (adicionaveis.has(a.path) && a.source === fonte) adicionados.push(a.path);
    else violacoes.push(`${a.path}: novo sem pertencer ao change set autorizado`);
  }
  for (const p of b.keys()) if (!presentes.has(p)) violacoes.push(`${p}: herdado ausente`);
  for (const p of [...modificaveis, ...adicionaveis]) if (!presentes.has(p)) violacoes.push(`${p}: autorizado mas ausente`);
  for (const a of release.artifacts) if (a.source === "worktree_change_outside_cr") violacoes.push(`${a.path}: alteração fora de CR no digest`);
  return { herdados, modificados, adicionados, violacoes };
}

describe("cross-validation da Release 2.22", () => {
  const atual = runCrossRegistryValidation(ROOT);

  it("todos os checks passam", () => {
    expect(atual.checks.filter((c) => c.status !== "passed")).toEqual([]);
    expect(atual.checks.length).toBe(88);
  });

  it("o relatório gravado é exatamente o resultado reexecutado", () => {
    expect(relatorio.validation.checks).toEqual(atual.checks);
    expect(relatorio.inputs).toEqual(atual.inputs);
    expect(relatorio.counts).toEqual(atual.counts);
    expect(relatorio).toMatchObject({ status: "passed", releaseVersion: "2.22", changeSet: "CR-032", validation: { checksFailed: 0, checksRun: 88 } });
  });

  it("a validação do Freeze v1 permanece intacta", () => {
    const freeze = texto(`${CONTRACTS_DIR}/CONTRACT-REGISTRY-FREEZE-v1.md`);
    const citado = freeze.match(/`([0-9a-f]{64})`/)![1];
    expect(sha(`${CONTRACTS_DIR}/cross-registry-validation.json`)).toBe(citado);
  });
});

describe("manifest v2.22 como mudança lógica sobre a 2.21", () => {
  const c = classificar(m, base);

  it("todo artefato é herdado sem mudança, modificado pelo CR-032 ou adicionado pelo CR-032", () => {
    expect(c.violacoes).toEqual([]);
    expect(c.herdados.length + c.modificados.length + c.adicionados.length).toBe(m.artifacts.length);
    expect(m.artifactClassification).toEqual({
      inheritedUnchanged: c.herdados.length, modifiedByCr032: c.modificados.length, addedByCr032: c.adicionados.length, unclassified: 0,
    });
  });

  it("a release só é ativa com todos os artefatos classificados", () => {
    expect(m.status).toBe("active");
    expect(m.artifactClassification.unclassified).toBe(0);
  });

  it("o change set autorizado é exatamente o conjunto de artefatos cr_032", () => {
    const cr = m.artifacts.filter((a) => a.source === FONTE).map((a) => a.path).sort();
    expect([...c.modificados, ...c.adicionados].sort()).toEqual(cr);
    expect([...m.changeSet.modifiedArtifacts, ...m.changeSet.addedArtifacts].sort()).toEqual(cr);
  });

  it("registries, schemas, fixtures, código e migrations são herdados sem mudança", () => {
    for (const a of m.artifacts.filter((x) => ["registry", "schema", "fixture", "database_migration", "runtime_component", "database_seed"].includes(x.category))) {
      expect(c.herdados, a.path).toContain(a.path);
    }
    expect(m.changeSet).toMatchObject({ registriesModified: [], registriesAdded: [], schemasAdded: 0, schemasUpdated: 0, productCodeChanged: false, migrationsAdded: 0, databaseChanged: false });
  });

  it("guarda: hash diferente da base fora do change set, novo não autorizado, herdado ausente ou alteração externa são violações", () => {
    const adulterado = structuredClone(m);
    adulterado.artifacts.find((a) => a.path === "pnpm-lock.yaml")!.sha256 = "0".repeat(64);
    expect(classificar(adulterado, base).violacoes).toContain("pnpm-lock.yaml: difere da base 2.21 fora do change set autorizado");

    for (const operacional of [...OPERACIONAIS, ...FORA_DO_ESCOPO, "docs/harness/RASCUNHO.md"]) {
      const intruso = structuredClone(m);
      intruso.artifacts.push({ path: operacional, category: "environment_plan", sizeBytes: 1, sha256: "1".repeat(64), source: FONTE });
      expect(classificar(intruso, base).violacoes, operacional).toContain(`${operacional}: novo sem pertencer ao change set autorizado`);
    }

    const fora = structuredClone(m);
    fora.artifacts.find((a) => a.path === "pnpm-lock.yaml")!.source = "worktree_change_outside_cr";
    expect(classificar(fora, base).violacoes.some((v) => v.startsWith("pnpm-lock.yaml"))).toBe(true);

    const faltando = structuredClone(m);
    faltando.artifacts = faltando.artifacts.filter((a) => a.path !== "docs/decisions/README.md");
    expect(classificar(faltando, base).violacoes).toContain("docs/decisions/README.md: herdado ausente");

    const migracao = structuredClone(m);
    migracao.artifacts.find((a) => a.path.endsWith("20260929000015_tenant_deletion_owner_guard.sql"))!.sha256 = "2".repeat(64);
    expect(classificar(migracao, base).violacoes.some((v) => v.includes("20260929000015_tenant_deletion_owner_guard.sql"))).toBe(true);

    // o control plane não faz parte do S1: adulterar qualquer um deles na release é violação
    for (const p of [".claude/settings.json", ".mcp.json", "CLAUDE.md", "scripts/claude-local-first-guard.mjs", "scripts/claude-launch.mjs", ".github/workflows/ci.yml", "package.json"]) {
      const cp = structuredClone(m);
      cp.artifacts.find((a) => a.path === p)!.sha256 = "3".repeat(64);
      expect(classificar(cp, base).violacoes.some((v) => v.startsWith(`${p}: difere da base 2.21`)), p).toBe(true);
    }
  });

  it("artefatos do CR-032 e os herdados dos CR-028 a CR-031 conferem com o conteúdo atual em disco", () => {
    const divergentes = m.artifacts.filter((a) => a.source === FONTE || (["cr_028", "cr_029", "cr_030", "cr_031"].includes(a.source) && c.herdados.includes(a.path)))
      .filter((a) => !existsSync(join(ROOT, a.path)) || sha(a.path) !== a.sha256 || readFileSync(join(ROOT, a.path)).length !== a.sizeBytes);
    expect(divergentes.map((a) => a.path)).toEqual([]);
  });

  it("classificação: 482 herdados, 5 modificados, 3 adicionados, 490 no total, exatamente as listas do CR-032 (S1)", () => {
    expect(m.artifactClassification).toEqual({ inheritedUnchanged: 482, modifiedByCr032: 5, addedByCr032: 3, unclassified: 0 });
    expect(m.artifactSummary.total).toBe(490);
    expect(base.artifacts.length).toBe(487);
    expect(c.modificados.sort()).toEqual([...CR032_MODIFICADOS].sort());
    expect(c.adicionados.sort()).toEqual([...CR032_ADICIONADOS].sort());
    const categoria = (p: string) => m.artifacts.find((x) => x.path === p)!.category;
    for (const p of S1_DOCS) expect(categoria(p), p).toBe("development_tool");
    expect(categoria(CR032_DOC)).toBe("change_proposal");
    expect(categoria("docs/product/marketing-ops/contracts/cross-registry-validation-v2.22.json")).toBe("contract_documentation");
    expect(categoria("test/contracts/contract-registry-release-2.22.contract.test.ts")).toBe("contract_test");
    expect(categoria("test/contracts/contract-registry-release-2.21.contract.test.ts")).toBe("contract_test");
    expect(categoria("test/contracts/cross-registry-validation.ts")).toBe("contract_test");
    for (const p of CR032_MODIFICADOS) expect(m.artifacts.find((x) => x.path === p), p).toMatchObject({ source: FONTE });
  });

  it("os 20 documentos do CR-030, o lockfile da raiz e todo o control plane do CR-031 permanecem herdados sem mudança; workspace da raiz e ESTADO fora do manifest", () => {
    for (const p of CR030_DOCS) expect(c.herdados, p).toContain(p);
    for (const p of [
      "pnpm-lock.yaml", "package.json", "CLAUDE.md", "README.md", ".claude/settings.json", ".mcp.json", ".github/workflows/ci.yml", "docs/harness/SYSTEM-TEST-USERS.md",
      "scripts/claude-launch.mjs", "scripts/claude-launch.test.mjs", "scripts/claude-local-first-guard.mjs", "scripts/claude-local-first-guard.test.mjs", "scripts/claude-permission-probe.mjs",
      "tools/developer-harness/package.json", "tools/developer-harness/pnpm-lock.yaml", "tools/developer-harness/pnpm-workspace.yaml",
      "test/developer-harness.arquitetura.test.ts", "test/developer-harness.supply-chain.test.ts", "test/integration-fixtures-determinism.test.ts",
      `${CONTRACTS_DIR}/changes/CR-031-developer-harness-and-tooling-baseline.md`, `${CONTRACTS_DIR}/cross-registry-validation-v2.21.json`,
    ]) expect(c.herdados, p).toContain(p);
    for (const p of FORA_DO_ESCOPO) expect(m.artifacts.some((x) => x.path === p), p).toBe(false);
  });

  it("documentos operacionais ficam fora do manifest e do digest; o change set registra que ESTADO é atualizado fora dele", () => {
    for (const p of OPERACIONAIS) expect(m.artifacts.some((a) => a.path === p), p).toBe(false);
    expect(JSON.stringify(m.artifacts)).not.toMatch(/PREPARACAO-I01|VERIFICACOES|ESTADO\.md|settings\.local/);
    expect(m.changeSet.operationalDocumentsUpdatedOutsideRelease).toEqual(["docs/harness/ESTADO.md"]);
    expect(m.changeSet.operationalDocumentsUntouched).toEqual([".claude/settings.local.json"]);
  });

  it("aggregateDigest, resumo por categoria e ordenação recalculados conferem", () => {
    expect(agregado(m.artifacts)).toBe(m.artifactSummary.aggregateDigest);
    const porCategoria: Record<string, number> = {};
    for (const a of m.artifacts) porCategoria[a.category] = (porCategoria[a.category] ?? 0) + 1;
    expect(m.artifactSummary.byCategory).toEqual(porCategoria);
    expect(m.artifactSummary.total).toBe(m.artifacts.length);
    const caminhos = m.artifacts.map((a) => a.path);
    expect(new Set(caminhos).size).toBe(caminhos.length);
    expect(caminhos).toEqual([...caminhos].sort((a, b) => a.localeCompare(b)));
  });

  it("envelope, versões e base seguem o precedente", () => {
    expect(m).toMatchObject({
      manifest: "oplyra-contract-registry-release", manifestVersion: "2.22", schemaVersion: "1.0", releaseVersion: "2.22",
      changeSet: { id: "CR-032", path: CR032_DOC, appliedSlices: ["S1"], notAppliedSlices: ["S2", "S3", "S4", "S5", "S6", "S7"], crStatus: "approved" },
    });
    expect(m.registryVersions).toEqual(base.registryVersions);
    expect(m.baseRelease).toEqual({
      version: "2.21", manifestPath: `${CONTRACTS_DIR}/contract-registry-manifest-v2.21.json`,
      manifestSha256: sha(`${CONTRACTS_DIR}/contract-registry-manifest-v2.21.json`), aggregateDigest: base.artifactSummary.aggregateDigest,
    });
    expect(m.baseFreeze).toEqual(base.baseFreeze);
    expect(agregado(base.artifacts)).toBe(base.artifactSummary.aggregateDigest);
  });

  it("exclui o próprio manifest e os anteriores do hash", () => {
    for (const v of ["2.15", "2.16", "2.17", "2.18", "2.19", "2.20", "2.21", "2.22"]) {
      expect(m.exclusions).toContainEqual({ path: `${CONTRACTS_DIR}/contract-registry-manifest-v${v}.json`, reason: "manifest_self_reference_is_not_hashed" });
      expect(m.artifacts.some((a) => a.path.endsWith(`contract-registry-manifest-v${v}.json`))).toBe(false);
    }
  });

  it("não autoriza nada além de documentação: sem recurso remoto, migration, credencial, publicação, runtime produtivo, mecanismo Git executável nem executionEnabled", () => {
    expect(m.implementationBoundary).toEqual(base.implementationBoundary);
    expect(m.changeSet).toMatchObject({
      remoteResourcesCreated: false, remoteMigrationsApplied: false, publicationPerformed: false, externalCallsPerformed: false, realKeysUsed: false, realDataUsed: false,
      executableMechanismsCreated: false, executionEnabledChanged: false, gitWritesPerformedByAgent: false,
    });
  });
});

describe("independent-recompute: artefatos do manifest 2.22 contra o disco", () => {
  it("independent-recompute: lê os 490 artefatos do disco, confere SHA-256 e sizeBytes e recalcula o aggregateDigest sem usar o gerador", () => {
    expect(m.artifacts.length).toBe(490);
    const divergentes: string[] = [];
    const porCaminho = new Map<string, string>();
    for (const a of m.artifacts) {
      const buf = readFileSync(join(ROOT, a.path));
      const h = createHash("sha256");
      h.update(buf);
      const hex = h.digest("hex");
      porCaminho.set(a.path, hex);
      if (buf.byteLength !== a.sizeBytes || hex !== a.sha256) divergentes.push(a.path);
    }
    expect(divergentes).toEqual([]);
    const ordem = [...porCaminho.keys()].sort(new Intl.Collator().compare);
    const d = createHash("sha256");
    d.update(ordem.map((p) => `${p}:${porCaminho.get(p)}`).join("\n"));
    expect(d.digest("hex")).toBe(m.artifactSummary.aggregateDigest);
  });
});

// Varredura de segredos nos arquivos NÃO versionados e NÃO ignorados, com os mesmos padrões de scripts/scan-secrets.sh
// (que cobre apenas os versionados). Nunca imprime o trecho encontrado, só arquivo e padrão.
const padroesDoScript = (): RegExp[] => {
  const bloco = texto("scripts/scan-secrets.sh").split("PADROES=(")[1]!.split("\n)")[0]!;
  return [...bloco.matchAll(/^\s*'(.+)'\s*$/gm)].map((x) => new RegExp(x[1]!));
};
const varrer = (arquivos: { caminho: string; conteudo: Buffer }[], padroes: RegExp[]) => {
  const achados: string[] = [];
  for (const { caminho, conteudo } of arquivos) {
    if (/\.lock$/.test(caminho) || caminho === "pnpm-lock.yaml" || conteudo.includes(0)) continue; // mesmas exclusões do script e de `git grep -I`
    const linhas = conteudo.toString("utf8").split("\n");
    padroes.forEach((re, i) => linhas.forEach((l, n) => { if (re.test(l)) achados.push(`${caminho}:${n + 1}:padrao-${i + 1}`); }));
  }
  return achados;
};

describe("secret-scan-untracked: arquivos não versionados e não ignorados", () => {
  it("secret-scan-untracked: o detector reconhece cada um dos padrões do script (valores sintéticos montados em tempo de execução)", () => {
    const padroes = padroesDoScript();
    expect(padroes.length).toBe(5);
    const amostras = [
      "sb_secret_" + "a".repeat(12),
      "eyJ" + "a".repeat(25) + "." + "b".repeat(25),
      "-----BEGIN RSA " + "PRIVATE KEY-----",
      "sk" + "-" + "a".repeat(24),
      "service_role=" + "a".repeat(45),
    ];
    amostras.forEach((s, i) => expect(varrer([{ caminho: "amostra.txt", conteudo: Buffer.from(s) }], padroes), `padrão ${i + 1}`).toContain(`amostra.txt:1:padrao-${i + 1}`));
    expect(varrer([{ caminho: "amostra.txt", conteudo: Buffer.from("texto comum sem credencial") }], padroes)).toEqual([]);
  });

  it("secret-scan-untracked: nenhum arquivo não versionado e não ignorado contém padrão de segredo", () => {
    const lista = execFileSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd: ROOT, encoding: "utf8" }).split("\0").filter(Boolean);
    const arquivos = lista.map((caminho) => ({ caminho, conteudo: readFileSync(join(ROOT, caminho)) }));
    expect(varrer(arquivos, padroesDoScript())).toEqual([]);
  });
});

describe("S1 do CR-032: texto aplicado, S2–S7 intactos, executionEnabled preservado", () => {
  const entrada = () => ({ cr032: texto(CR032_DOC), dev: texto(S1_DOCS[0]), tools: texto(S1_DOCS[1]), auto: texto(S1_DOCS[2]) });
  const reprova = (campo: "cr032" | "dev" | "tools" | "auto", de: string | RegExp, para: string, regra: string) => {
    const t = entrada();
    const original = t[campo];
    t[campo] = original.replace(de, para);
    expect(t[campo], `a mutação de "${regra}" não alterou o texto`).not.toBe(original);
    expect(avaliarCr032S1(t)[regra], regra).toBe(false);
  };

  it("o texto corrente satisfaz todas as regras do S1", () => {
    const r = avaliarCr032S1(entrada());
    expect(Object.entries(r).filter(([, ok]) => !ok)).toEqual([]);
  });

  it("CR-032: status preservado como `approved`, S1 aplicado e S2–S7 não aplicados/não autorizados", () => {
    const cr = texto(CR032_DOC);
    expect(cr).toContain("**Status:** `approved`\n");
    expect(cr).not.toMatch(/\*\*Status:\*\* `(approved_and_applied|applied|partially_applied)`/);
    const linha = (s: string) => cr.split("\n").find((l) => l.startsWith(`| ${s} |`))!;
    expect(linha("S1")).toContain("| **yes** | **applied** (Release 2.22) |");
    for (const s of ["S2", "S3", "S4", "S5", "S6", "S7"]) expect(linha(s), s).toMatch(/\| no \| not applied \|$/);
    expect(cr).toContain("slices S2–S7 are not authorized and none is implemented");
  });

  it("AUTONOMOUS-BUILD: draft, executionEnabled false, DoD intacto e loop encerrado em ready for owner", () => {
    const a = texto(S1_DOCS[2]);
    expect(a).toMatch(/```yaml\nstatus: draft\nexecutionEnabled: false\n```/);
    expect(a).not.toMatch(/executionEnabled:\s*true/);
    const dod = a.split("## 4.")[1]!;
    const marcados = dod.split("\n").filter((l) => l.startsWith("- [x]")).map((l) => l.slice(0, 40));
    const abertos = dod.split("\n").filter((l) => l.startsWith("- [ ]"));
    expect(marcados.length).toBe(9);
    expect(abertos).toEqual([
      "- [ ] serviços remotos possuem bloqueios executáveis suficientes para o loop autônomo, além da falha fechada local já existente.",
      "- [ ] CI executa todos os checks determinísticos aplicáveis ao incremento.",
      "- [ ] política de branch/PR/review/merge e recuperação foi aprovada e testada.",
      "- [ ] hard blockers têm mecanismo executável de parada e evidência.",
    ]);
    expect(a).not.toMatch(/→ (create branch|commit|PR|merge|sync main|repeat)/);
    expect(a).toContain("→ ready for owner  (the loop stops here)");
  });

  it("nenhum mecanismo executável do S2–S7 foi criado e o control plane herdado não mudou", () => {
    for (const p of [".github/CODEOWNERS", ".github/pull_request_template.md", ".github/PULL_REQUEST_TEMPLATE.md", ".githooks", "docs/harness/KILL-SWITCH"]) expect(existsSync(join(ROOT, p)), p).toBe(false);
    for (const p of [".claude/settings.json", ".mcp.json", "CLAUDE.md", "package.json", "pnpm-lock.yaml", ".github/workflows/ci.yml", "scripts/claude-local-first-guard.mjs", "scripts/claude-launch.mjs"]) {
      expect(sha(p), p).toBe(base.artifacts.find((a) => a.path === p)!.sha256);
    }
    expect(readdirSync(join(ROOT, ".github")).sort()).toEqual(["workflows"]);
    expect(readdirSync(join(ROOT, ".github/workflows")).sort()).toEqual(["ci.yml"]);
  });

  it("mutações documentais: cada regra nova é detectada quando o texto é revertido", () => {
    reprova("cr032", "**Status:** `approved`\n", "**Status:** `approved_and_applied`\n", "crStatusPreserved");
    reprova("cr032", "| S1 | Textual reconciliation of `DESENVOLVIMENTO.md`, `DEVELOPMENT-TOOLS.md` and `AUTONOMOUS-BUILD.md` | **yes** | **applied** (Release 2.22) |", "| S1 | x | no | not applied |", "matrixS1Applied");
    reprova("cr032", "| S4 | PR template and CODEOWNERS (visibility only) | no | not applied |", "| S4 | PR template and CODEOWNERS (visibility only) | no | **applied** |", "matrixS2toS7NotApplied");
    reprova("auto", "executionEnabled: false", "executionEnabled: true", "autonomousDraftDisabled");
    reprova("auto", "- [ ] hard blockers têm", "- [x] hard blockers têm", "dodUntouched");
    reprova("auto", "→ ready for owner  (the loop stops here)", "→ commit\n→ PR\n→ merge", "oldAgentFlowRemoved");
    reprova("auto", "→ ready for owner  (the loop stops here)", "→ done", "loopStopsReadyForOwner");
    reprova("dev", /exclusiv\w*/g, "compartilhad@", "ownerOnlyGitWrites");
    reprova("tools", /branch criada pelo proprietário|criar branch/g, "branch", "ownerOnlyBranchCreation");
    reprova("dev", /Ready for review/g, "revisão", "prDraftAndGreenChecks");
    reprova("tools", /não é revisão independente/g, "é revisão independente", "attestationNotIndependent");
    reprova("auto", /HB-13 permanece não atendido/g, "HB-13 foi atendido", "hb13Unmet");
    reprova("dev", /squash/g, "merge commit", "squashOwnerOnly");
    reprova("tools", /não é recursivo/g, "é recursivo", "d6NotRecursive");
    reprova("auto", /três tentativas diagnosticadas/g, "tentativas ilimitadas", "resumeAndRecovery");
    reprova("dev", /S2–S7/g, "S2–S3", "noMechanismClaimed");
  });
});

describe("conteúdo corrente reconciliado (CR-029 herdado e CR-030)", () => {
  it("doc 16 descreve o CR-028 e preserva o hunk aprovado do proprietário", () => {
    const d = texto(DOC16);
    for (const t of ["SUPABASE_PROJECT_REF", "OPLYRA_ENVIRONMENT_FINGERPRINT", "TrustedDeploymentContext", "<origem>/auth/v1", "/auth/v1/.well-known/jwks.json", "CR-028"]) expect(d, t).toContain(t);
    expect(d).not.toMatch(/^\|\s*`OPLYRA_ALLOW_REMOTE`/m);
    expect(d).not.toContain("sem `OPLYRA_ALLOW_REMOTE=true`");
    // H16-1, aprovado sem alteração
    expect(d).toContain("| `OPENROUTER_API_KEY` | Não | Worker | Credencial do gateway inicial;");
    expect(d).toContain("Somente adapters diretos explicitamente habilitados; não são obrigatórias para o caminho inicial via OpenRouter");
  });

  it("PREPARACAO-SUPABASE-PRODUCAO registra a reconciliação como concluída e não a apresenta mais como adiada", () => {
    const p = texto(PSP);
    expect(p).not.toContain("Reconciliação documental adiada");
    expect(p).toContain("**Reconciliação documental concluída (CR-029, Release 2.19, 30/09/2026).**");
    expect(p).toContain("O `DEVELOPMENT-TOOLS.md` permanece como pendência operacional separada");
    expect(p).toContain("nenhuma autorização de produção foi criada");
    // restante do arquivo preservado: o parágrafo do CR-028 sobre o parsing e o requisito B-4 continuam
    expect(p).toContain("Endurecimento do parsing (CR-028, Release 2.18)");
    expect(p).toContain("Requisitos do bloqueio B-4 (atendidos pelo CR-028)");
  });

  it("TST-19 afirma recusa de qualquer endpoint remoto e da flag, sem sugerir opt-in", () => {
    const l = texto(PLANO).split("\n").find((x) => x.startsWith("| TST-19 |"))!;
    expect(l).toMatch(/`local`\/`ci` com qualquer endpoint remoto/);
    expect(l).toMatch(/presença de `OPLYRA_ALLOW_REMOTE`, com qualquer valor, também falha/);
    expect(l).not.toMatch(/opt-in|sem flag explícita|com flag/);
  });

  it("PREPARACAO-I01 preserva o aceite histórico e marca item 2 e A14 como superados", () => {
    const p = texto("docs/harness/PREPARACAO-I01.md");
    const a14 = p.split("\n").find((l) => l.startsWith("| A14 |"))!;
    expect(a14).toContain("Configuração apontando para host remoto sem flag explícita falha na inicialização");
    expect(a14).toMatch(/superado pelo CR-028/);
    expect(p).toContain("validação de configuração que falha se apontar para host remoto sem `OPLYRA_ALLOW_REMOTE=true`. *Superado pelo CR-028");
    expect(p).toContain("**Registro histórico de 15/09/2026.**"); // HP-1
  });

  it("VERIFICACOES usa a barreira Local First vigente, estados sem excesso e ponteiro para o ESTADO no lugar de contagens", () => {
    const v = texto("docs/harness/VERIFICACOES.md");
    expect(v).toContain("| Local First | Nenhum remoto como fallback; `local`/`ci` recusam qualquer endpoint remoto e a presença de `OPLYRA_ALLOW_REMOTE` falha (CR-028) |");
    expect(v).toContain("Fronteira por portas implementada no slice 1 do I-02; adapter real pendente");
    expect(v).toContain("Contratos e registry implementados desde a Release 2.16; vínculos produtivos dependem do EXP-05");
    expect(v).toContain("Implementado no harness local para allowlist, capabilities, privacidade e orçamento; integração completa ao runtime produtivo pendente");
    expect(v).toContain("Implementado e testado no harness local; provider real pendente");
    expect(v).toContain("Cost Ledger persistente implementado no Supabase local pelo CR-027; integração produtiva pendente");
    expect(v).not.toMatch(/\b(12 migrations|212 testes|87 assertions)\b|manifest v2\.15/);
    expect(v).not.toMatch(/opt-in autorizado|sem `OPLYRA_ALLOW_REMOTE=true`/);
    expect(v.match(/\]\(ESTADO\.md\)/g)?.length).toBeGreaterThanOrEqual(3);
    // HV-1 e HV-6, aprovados sem alteração
    expect(v).toContain("A fundação I-01 e seus checks locais existem;");
    expect(v).toContain("| Guard Local First do Claude | `pnpm test:harness` | Implementado; 4 cenários em 29/09/2026 |");
  });
});

describe("documentação de produto de IA alinhada (CR-030)", () => {
  const M = (n: string) => texto(`docs/product/marketing-ops/${n}.md`);
  const adr6 = () => texto("docs/decisions/ADR-0006-runtime-de-agentes.md");

  it("doc 13: registry e schemas canônicos, Cost Ledger persistente local, versão 0.5 de 30/09/2026", () => {
    const d = M("13-ai-model-routing-finops");
    expect(d).toContain("**Versão documental:** 0.5");
    expect(d).toContain("**Data:** 30 de setembro de 2026");
    expect(d).not.toMatch(/representação executável de Model Profiles[^.]*ainda é proposta/);
    expect(d).not.toMatch(/Cost Ledger persistido[^.]*continuam bloqueados/);
    expect(d).not.toMatch(/proposta controlada/);
    expect(d).not.toMatch(/manifest[^.\n]{0,40}v2\.15/);
    for (const t of ["CR-026", "CR-027", "Cost Ledger persistente somente no Supabase local", "Product Agent Runtime, filas e scheduler de produto, integração Stripe, adapters reais"]) expect(d, t).toContain(t);
  });

  it("ADR-0006 distingue o Model Harness implementado do runtime/filas ainda propostos", () => {
    const a = adr6();
    expect(a).toContain("**Estado aplicado:**");
    expect(a).toContain("somente localmente");
    expect(a).not.toContain("não há implementação autorizada nesta revisão");
    expect(a).toContain("Product Agent Runtime, filas/scheduler de produto e stack permanecem propostas");
  });

  it("OpenRouter é gateway inicial padrão e não exclusivo; EXP-05 condiciona modelos e parâmetros", () => {
    for (const n of ["04-architecture", "06-integrations", "09-agentic-architecture", "13-ai-model-routing-finops", "ATUALIZACOES"]) expect(M(n), n).toMatch(/sem exclusividade|não exclusivo/);
    expect(adr6()).toMatch(/não exclusivo/);
    for (const n of ["01-product-requirements", "04-architecture", "13-ai-model-routing-finops", "ATUALIZACOES"]) expect(M(n), n).toContain("EXP-05");
    expect(M("06-integrations")).toContain("adapters diretos");
    expect(M("13-ai-model-routing-finops")).toMatch(/Test Adapter/);
  });

  it("ATUALIZACOES: 30/09/2026, ADRs 0001–0009 e estado aplicado; ponteiros para o Cost Ledger nos docs 04, 05 e 12", () => {
    const t = M("ATUALIZACOES");
    expect(t).toContain("**Última atualização:** 30/09/2026.");
    expect(t).toContain("ADRs 0001–0009");
    expect(t).not.toContain("ADRs 0001–0008");
    expect(t).toContain("**Estado aplicado:**");
    expect(M("04-architecture")).toContain("COST-LEDGER-CONTRACTS");
    expect(M("05-data-model")).toContain("COST-LEDGER-CONTRACTS");
    expect(M("12-roadmap")).toContain("**Entregue localmente (CR-026/027):**");
    expect(M("12-roadmap")).toContain("**Pendentes:** Product Agent Runtime");
  });

  it("autoridade v2.3 nos cabeçalhos dos 20 arquivos; nenhuma afirmação de adapter real, chave, conta, produção ou vídeo nativo habilitados", () => {
    for (const p of CR030_DOCS) {
      const l = texto(p).split("\n").find((x) => x.startsWith("**Autoridade:**"));
      if (l !== undefined) expect(l, p).toMatch(/v2\.3/), expect(l, p).not.toMatch(/v2\.2/);
      const t = texto(p);
      expect(t, p).not.toMatch(/(adapter real|OpenRouter Adapter|adapter direto)[^.|\n]{0,30}\b(habilitad[oa]|ativ[oa]|implementad[oa])\b/i);
      expect(t, p).not.toMatch(/\b(chave|conta|créditos?)\b[^.|\n]{0,25}\b(configurad[oa]s?|criad[oa]s?|ativ[oa]s?)\b/i);
      expect(t, p).not.toMatch(/produção[^.|\n]{0,20}\b(habilitada|ativa)\b/i);
      expect(t, p).not.toMatch(/(suporta|inclui|permite|habilita|oferece|possui)[^.\n]{0,40}(geração|edição|renderização)[^.\n]{0,20}vídeo/i);
    }
    expect(M("01-product-requirements")).toContain("gerar, editar ou renderizar vídeo nativamente (DEC-014)");
  });

  it("links locais dos 20 arquivos resolvem", () => {
    const quebrados: string[] = [];
    for (const p of CR030_DOCS) {
      for (const mt of texto(p).matchAll(/\]\(([^)#\s]+)(#[^)]*)?\)/g)) {
        const alvo = mt[1]!;
        if (/^\w+:\/\/|^mailto:/.test(alvo)) continue;
        if (!existsSync(join(ROOT, dirname(p), alvo))) quebrados.push(`${p}: ${alvo}`);
      }
    }
    expect(quebrados).toEqual([]);
  });
});

describe("Developer Harness reconciliado (CR-031 herdado e S1 do CR-032): conteúdo corrente", () => {
  it("o projeto de tooling está isolado e o produto não o alcança", () => {
    expect(readdirSync(join(ROOT, "tools/developer-harness")).filter((n) => n !== "node_modules").sort()).toEqual(["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"]);
    expect(texto("pnpm-workspace.yaml")).toBe('packages:\n  - "apps/*"\n  - "packages/*"\n  - "experiments/*"\n');
    expect(texto("pnpm-lock.yaml")).not.toMatch(/@anthropic-ai\/claude-code|@playwright\/mcp|@upstash\/context7-mcp|1\.64\.0-alpha/);
    expect(texto("tools/developer-harness/pnpm-workspace.yaml")).toBe("allowBuilds:\n  '@anthropic-ai/claude-code': true\n");
    const raiz = JSON.parse(texto("package.json"));
    expect(Object.keys(raiz.devDependencies).sort()).toEqual(["@playwright/test", "@types/node", "typescript", "vitest"]);
  });

  it("guard, launcher e settings: política autônoma, cinco tools Playwright negados, Git de escrita negado, modo decidido pela evidência", () => {
    const settings = JSON.parse(texto(".claude/settings.json"));
    expect(settings.hooks.PreToolUse[0].hooks[0].command).toMatch(/claude-local-first-guard\.mjs" --policy=autonomous$/);
    for (const t of ["browser_run_code_unsafe", "browser_evaluate", "browser_file_upload", "browser_drag", "browser_drop"]) expect(settings.permissions.deny).toContain(`mcp__playwright__${t}`);
    for (const g of ["push", "pull", "fetch", "add", "commit", "checkout", "switch", "reset", "restore", "clean", "merge", "rebase", "tag"]) expect(settings.permissions.deny).toContain(`Bash(git ${g} *)`);
    expect(settings.permissions.defaultMode).toBeUndefined();
    const launcher = texto("scripts/claude-launch.mjs");
    expect(launcher).toContain("export const PERMISSION_MODE = decidePermissionMode(PROBE_EVIDENCE.proofs);");
    expect(launcher).toContain('ALLOWED_PERMISSION_MODES = Object.freeze(["dontAsk", "manual"])');
    expect(texto("docs/harness/DEVELOPMENT-TOOLS.md")).toContain("o launcher usa `dontAsk`");
  });

  it("auditoria do CR-031: leituras fechadas, Context7 sem egress autônomo e dontAsk vinculado à versão instalada", () => {
    const settings = JSON.parse(texto(".claude/settings.json"));
    const tokens: string[] = settings.hooks.PreToolUse[0].matcher.split("|");
    for (const t of ["Read", "Glob", "Grep", "Bash", "Write", "WebFetch", "mcp__.*"]) expect(tokens).toContain(t);
    expect(settings.permissions.allow.some((r: string) => r.startsWith("mcp__context7"))).toBe(false);
    for (const t of ["resolve-library-id", "query-docs"]) expect(settings.permissions.deny).toContain(`mcp__context7__${t}`);
    for (const d of ["Read(./.env)", "Read(./.npmrc)", "Read(./.netrc)", "Read(./**/*.pem)"]) expect(settings.permissions.deny).toContain(d);
    const guard = texto("scripts/claude-local-first-guard.mjs");
    for (const c of ["LF-READ-OUTSIDE", "LF-READ-SECRET", "LF-READ-PATTERN", "LF-RG-OPTION", "LF-MCP-CONTEXT7", "LF-MCP-UNKNOWN"]) expect(guard).toContain(c);
    const launcher = texto("scripts/claude-launch.mjs");
    for (const c of ["inspectToolingBinding", "resolvePermissionMode", "LA-TOOLING-INVALID", "LA-TOOLING-MISSING", "LA-TOOLING-ESCAPE", "LA-TOOLING-MISMATCH", "LA-CLI-UNPROVEN"]) expect(launcher).toContain(c);
    expect(launcher).toContain("claudeVersion === probedCli && effective === probedCli");
    expect(launcher).toContain("export function readBinaryVersion");
    const cr = texto(`${CONTRACTS_DIR}/changes/CR-031-developer-harness-and-tooling-baseline.md`);
    expect(cr).toContain("## Audit follow-up");
    const tools = texto("docs/harness/DEVELOPMENT-TOOLS.md");
    for (const t of ["**Leituras.**", "não está disponível na sessão autônoma", "vincula o permission mode à versão realmente instalada", "LA-CLI-UNPROVEN"]) expect(tools).toContain(t);
  });

  it("CLAUDE.md, README e documentos do harness refletem o estágio atual e os limites do guard", () => {
    expect(texto("CLAUDE.md")).toContain("## Estágio atual e limite de implementação");
    expect(texto("CLAUDE.md")).not.toContain("Limite da etapa atual: discovery antes de implementação");
    expect(texto("README.md")).not.toContain("permanece arquitetural");
    expect(texto("README.md")).toContain("slice 1 do Product AI Model Harness");
    const tools = texto("docs/harness/DEVELOPMENT-TOOLS.md");
    expect(tools).not.toContain("sem autorização explícita");
    expect(tools).toMatch(/não é sandbox nem fronteira absoluta de segurança/i);
    expect(tools).toContain("A invocação direta de `claude` está fora das garantias");
    expect(texto("docs/harness/SYSTEM-TEST-USERS.md")).not.toContain("do prompt");
    expect(texto("docs/harness/AUTONOMOUS-BUILD.md")).toMatch(/status: draft[\s\S]*executionEnabled: false/);
  });

  it("links locais dos documentos do harness, do CR-031 e do CR-032 resolvem", () => {
    const quebrados: string[] = [];
    for (const p of ["CLAUDE.md", "README.md", "docs/harness/DEVELOPMENT-TOOLS.md", "docs/harness/DESENVOLVIMENTO.md", "docs/harness/SYSTEM-TEST-USERS.md",
      "docs/harness/AUTONOMOUS-BUILD.md", `${CONTRACTS_DIR}/changes/CR-031-developer-harness-and-tooling-baseline.md`, CR032_DOC]) {
      for (const mt of texto(p).matchAll(/\]\(([^)#\s]+)(#[^)]*)?\)/g)) {
        const alvo = mt[1]!;
        if (/^\w+:\/\/|^mailto:/.test(alvo)) continue;
        if (!existsSync(join(ROOT, dirname(p), alvo))) quebrados.push(`${p}: ${alvo}`);
      }
    }
    expect(quebrados).toEqual([]);
  });

  it("as âncoras locais dos três documentos do S1 existem", () => {
    const dev = texto("docs/harness/DESENVOLVIMENTO.md");
    expect(dev).toContain("](#git-entrega-e-retomada)");
    expect(dev).toContain("\n## Git, entrega e retomada\n");
  });

  it("as fixtures determinísticas dos dois testes de integração e as regressões T2–T4 existem; a migration do dispatcher não mudou", () => {
    for (const p of ["packages/infra/test/design-agent-copy-draft-consumer.integration.test.ts", "packages/infra/test/outbox-dispatcher-cycle.integration.test.ts"]) {
      expect(texto(p)).toMatch(/available_at\s*\n?\s*\)\s*values[\s\S]*?'2026-09-21T2[0-3]:\d\d:00Z'::timestamptz\)/);
    }
    const regressao = texto("packages/infra/test/outbox-claim-determinism.integration.test.ts");
    for (const t of ["T2", "T3", "T4"]) expect(regressao).toContain(`${t} —`);
    const mig = "supabase/migrations/20260921000012_outbox_dispatcher_functions.sql";
    expect(sha(mig)).toBe(base.artifacts.find((a) => a.path === mig)!.sha256);
  });
});
