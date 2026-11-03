// Guarda somente leitura da transição. Receita não congelada não dispensa reconstrução nem evidência.
import { existsSync, readFileSync, mkdtempSync, rmSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ReleaseError, sha256, aggregate, pretty, loadRecipe, exportSnapshot, gitRead,
  buildFromSnapshot, defaultCrossValidate, validateEvidence, reproduceFrozen, assertGateOrder,
} from "./lib.mjs";
import { assertNoStandalonePlaywright, parseGateCommand } from "./gates.mjs";
const must = (condition, code, detail) => { if (!condition) throw new ReleaseError(code, detail); };
const bytes = (root, path) => {
  const p = join(root, path);
  const stat = lstatSync(p);
  must(stat.isFile() && !stat.isSymbolicLink(), "CR-INPUT-TYPE", path);
  return readFileSync(p);
};
const json = (root, path) => JSON.parse(bytes(root, path).toString("utf8"));
const safe = (p) => typeof p === "string" && p.length > 0 && !p.startsWith("/") && !p.includes("\\") && !p.includes("\0") && !p.split("/").some((s) => s === ".." || s === "." || !s);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sorted = (values) => [...values].sort((a, b) => a.localeCompare(b));

/** Laço de hashes corrente independente da reprodução histórica. Exceções sempre fixam conteúdo. */
export function assertCurrentArtifacts(root, manifest, exceptions = []) {
  const allowed = new Map(exceptions.map((a) => [a.path, a.sha256]));
  const divergent = manifest.artifacts.filter((a) => !existsSync(join(root, a.path)) || sha256(bytes(root, a.path)) !== (allowed.get(a.path) ?? a.sha256));
  must(divergent.length === 0, "CR-CURRENT-DIVERGENCE", divergent.map((a) => a.path).join(","));
}

/** O escopo desta preparação é um inventário revisado, não receita, manifest ou concessão. */
export function validateTransition(t) {
  must(t && equal(Object.keys(t).sort(), ["schema", "release", "baseRelease", "modified", "added"].sort()), "CR-TRANSITION-SCHEMA");
  must(t.schema === "oplyra-release-transition/1" && /^\d+\.\d+$/.test(t.release) && /^\d+\.\d+$/.test(t.baseRelease), "CR-TRANSITION-SCHEMA");
  must(Array.isArray(t.modified) && Array.isArray(t.added), "CR-TRANSITION-SCHEMA");
  const paths = [...t.modified, ...t.added];
  must(paths.every((a) => a && safe(a.path) && /^[a-f0-9]{64}$/.test(a.sha256)), "CR-TRANSITION-SCHEMA");
  must(t.added.every((a) => typeof a.category === "string" && a.category.length > 0), "CR-TRANSITION-SCHEMA");
  must(new Set(paths.map((a) => a.path)).size === paths.length, "CR-TRANSITION-SCHEMA");
  return t;
}

function baseOf(root, transition) {
  const base = loadRecipe(root, transition.baseRelease);
  must(base.frozen, "CR-BASE-NOT-FROZEN");
  const m = json(root, base.changeSet.manifestPath);
  must(sha256(bytes(root, base.changeSet.manifestPath)) === base.expected.manifestSha256 &&
    sha256(bytes(root, base.changeSet.reportPath)) === base.expected.reportSha256 &&
    aggregate(m.artifacts) === base.expected.aggregateDigest && m.artifacts.length === base.expected.artifactCount, "CR-BASE-MISMATCH");
  const inherited = new Set(m.artifacts.map((a) => a.path));
  const immutable = /(^sources\/|00-documento-transicao\.md$|ADR-0006[^/]*\.md$|\/(registries|schemas|fixtures)\/|^supabase\/migrations\/|contract-registry-manifest-v|cross-registry-validation(?:-v[0-9.]+)?\.json$|CONTRACT-REGISTRY-FREEZE)/;
  must(transition.modified.every((a) => !immutable.test(a.path)), "CR-FROZEN-INPUT");
  const categories = new Set(m.artifacts.map((a) => a.category));
  if (transition.release === "2.23") must(transition.added.every((a) => categories.has(a.category)), "CR-TRANSITION-SCOPE");
  must(transition.modified.every((a) => inherited.has(a.path)) && transition.added.every((a) => !inherited.has(a.path)), "CR-TRANSITION-SCOPE");
  return {base, manifest: m};
}

/** Restrições da emissão futura 2.23; não reserva versão nem executa gate. */
export function assertRelease23Policy(recipe) {
  if (recipe.release !== "2.23") return;
  const expectedCommands = {
    "release-tests": "pnpm test test/contracts/contract-registry-release-2.22.contract.test.ts test/contracts/contract-registry-release-2.23.contract.test.ts",
    "cross-validation": "pnpm test test/contracts/contract-registry-release-2.23.contract.test.ts",
    "contract-tests": "pnpm test test/contracts", "harness": "pnpm test:harness",
    "db-reset": "pnpm db:reset", "db-roles": "pnpm db:roles", "verificar": "pnpm verificar",
    "diff-check": "git diff --check", "secret-scan-tracked": "pnpm scan:secrets",
  };
  for (const [id, command] of Object.entries(expectedCommands)) must(recipe.gates[id]?.cmd === command, "CR-RELEASE-POLICY", id);
  for (const id of ["local-links", "secret-scan-untracked", "independent-recompute", "release-2.22-preserved", "documentary-mutations"]) {
    must(typeof recipe.gates[id]?.cmd === "string", "CR-RELEASE-POLICY", id);
  }
  const ids = ["FROZEN-migrations-000001-000014", "DOCS-cr030-product-ai-alignment", "DOCS-cr031-harness-documents", "DOCS-cr032-s1-git-lifecycle", "HARNESS-cr032-s1-no-executable-mechanism"];
  must(ids.every((id) => recipe.crossValidation.requiredIds.includes(`${id}-v2`)), "CR-RELEASE-POLICY", "perfis");
  must(recipe.manifest.pendingValidation.status === "pending_gate_evidence" && recipe.manifest.pendingValidation.gatesDeclaredPassed === false && recipe.validationMap.status === "passed", "CR-RELEASE-POLICY", "fases");
  for (const id of ["release-tests", "cross-validation", "contract-tests", "harness", "documentary-mutations"]) {
    const g = recipe.gates[id];
    must(g.kind === (id === "harness" ? "node-test" : "vitest-json") && g.counts.run !== undefined && g.counts.passed !== undefined && g.eq.some(([a,b]) => a === "run" && b === "passed"), "CR-RELEASE-POLICY", id);
  }
  const v = recipe.gates.verificar;
  must(v.kind === "verificar" && ["vitestRun", "vitestPassed", "pgRun", "pgPassed", "e2eRun", "e2ePassed"].every((k) => v.counts[k] !== undefined), "CR-RELEASE-POLICY", "verificar");
}

function scopeOf(recipe, t, base) {
  must(recipe.release === t.release && recipe.base.release === t.baseRelease, "CR-TRANSITION-SCOPE");
  assertRelease23Policy(recipe);
  must(recipe.base.manifestPath === base.changeSet.manifestPath && recipe.base.reportPath === base.changeSet.reportPath &&
    recipe.base.manifestSha256 === base.expected.manifestSha256 && recipe.base.reportSha256 === base.expected.reportSha256 &&
    recipe.base.aggregateDigest === base.expected.aggregateDigest && recipe.base.artifactCount === base.expected.artifactCount, "CR-BASE-MISMATCH");
  must(equal(sorted(recipe.changeSet.modified), sorted(t.modified.map((a) => a.path))), "CR-TRANSITION-SCOPE");
  const added = recipe.changeSet.added.filter((a) => a.path !== recipe.changeSet.reportPath);
  const expectedAdded = t.release === "2.23" ? [...t.added, {path: "test/contracts/release-2.23-transition.json", category: "contract_test"}] : t.added;
  const keyed = (a) => a.map(({path, category}) => `${path}:${category}`).sort();
  must(equal(keyed(added), keyed(expectedAdded)), "CR-TRANSITION-SCOPE");
  must(new Set(recipe.changeSet.modified).size === recipe.changeSet.modified.length &&
    new Set(recipe.changeSet.added.map((a) => a.path)).size === recipe.changeSet.added.length, "CR-TRANSITION-SCOPE");
  assertNoStandalonePlaywright(recipe.gates);
  assertGateOrder(Object.keys(recipe.gates));
  for (const spec of Object.values(recipe.gates)) parseGateCommand(spec.cmd);
}

function assertReviewedContent(root, baseManifest, transition, liveRoot) {
  assertCurrentArtifacts(root, baseManifest, transition.modified);
  for (const a of transition.added) must(existsSync(join(root, a.path)) && sha256(bytes(root, a.path)) === a.sha256, "CR-SNAPSHOT-CONTENT", a.path);
  if (transition.release === "2.23") must(bytes(root, "test/contracts/release-2.23-transition.json").equals(bytes(liveRoot, "test/contracts/release-2.23-transition.json")), "CR-TRANSITION-SCOPE");
}

/**
 * Reconstrói os três outputs em G/P em memória. Sem build/gates, escrita de release, alteração de refs ou rede.
 * É usada também para comprovar que a presença de outputs em P não muda a cross-validation.
 */
export function compareGateAndPublication({repoRoot, recipe, gateCommit, publishedCommit, generatedAt, evidenceCounts, crossValidate = defaultCrossValidate, transition = null, baseManifest = null}) {
  const tmp = mkdtempSync(join(tmpdir(), "oplyra-g-p-"));
  try {
    const builds = [gateCommit, publishedCommit].map((commit, i) => {
      const dir = join(tmp, String(i));
      exportSnapshot({repoRoot, commit, paths: recipe.snapshot.exportPaths, destDir: dir});
      if (transition) assertReviewedContent(dir, baseManifest, transition, repoRoot);
      return buildFromSnapshot({recipe, snapshotDir: dir, generatedAt, crossValidate, evidenceCounts});
    });
    for (const key of ["reportText", "intermediateText", "finalText"]) must(builds[0][key] === builds[1][key], "CR-PUBLICATION-DIVERGENCE", key);
    return builds[0];
  } finally { rmSync(tmp, {recursive: true, force: true}); }
}

export function inspectReleaseState({repoRoot, transition, crossValidate = defaultCrossValidate}) {
  const t = validateTransition(transition);
  const {base, manifest: oldManifest} = baseOf(repoRoot, t);
  const contracts = "docs/product/marketing-ops/contracts";
  const output = { report: `${contracts}/cross-registry-validation-v${t.release}.json`, manifest: `${contracts}/contract-registry-manifest-v${t.release}.json` };
  const hasReport = existsSync(join(repoRoot, output.report)), hasManifest = existsSync(join(repoRoot, output.manifest));
  const recipePath = `tools/contract-release/recipes/${t.release}.json`;
  if (!existsSync(join(repoRoot, recipePath))) {
    must(!hasReport && !hasManifest, "CR-UNISSUED-OUTPUT");
    assertCurrentArtifacts(repoRoot, oldManifest, t.modified);
    for (const a of t.added) must(existsSync(join(repoRoot, a.path)) && sha256(bytes(repoRoot, a.path)) === a.sha256, "CR-CURRENT-DIVERGENCE", a.path);
    return {phase: "unissued", release: t.release, baseline: t.baseRelease};
  }
  const recipe = loadRecipe(repoRoot, t.release);
  scopeOf(recipe, t, base);
  must(recipe.changeSet.reportPath === output.report && recipe.changeSet.manifestPath === output.manifest, "CR-TRANSITION-SCOPE");
  must(hasReport === hasManifest, "CR-PARTIAL-OUTPUT");
  if (recipe.frozen) {
    must(hasReport && hasManifest, "CR-PARTIAL-OUTPUT");
    must(/^[a-f0-9]{40}$/.test(recipe.evidence.baseCommit), "CR-EVIDENCE-HEAD");
    const reproduced = reproduceFrozen({repoRoot, recipe, crossValidate});
    const published = json(repoRoot, output.manifest);
    must(sha256(bytes(repoRoot, output.report)) === reproduced.reportSha256 && sha256(bytes(repoRoot, output.manifest)) === reproduced.manifestSha256, "CR-CURRENT-DIVERGENCE");
    const ev = json(repoRoot, recipe.evidence.path);
    const counts = validateEvidence(ev, recipe, {reportSha: reproduced.reportSha256, intermediateManifestSha: recipe.expected.intermediateManifestSha256}, reproduced.aggregateDigest);
    compareGateAndPublication({repoRoot, recipe, gateCommit: recipe.evidence.baseCommit, publishedCommit: recipe.snapshot.commit, generatedAt: recipe.generatedAt, evidenceCounts: counts, crossValidate, transition: t, baseManifest: oldManifest});
    assertCurrentArtifacts(repoRoot, published);
    return {phase: "frozen", release: t.release, baseline: t.release};
  }
  assertCurrentArtifacts(repoRoot, oldManifest, t.modified);
  for (const a of t.added) must(existsSync(join(repoRoot, a.path)) && sha256(bytes(repoRoot, a.path)) === a.sha256, "CR-CURRENT-DIVERGENCE", a.path);
  const tmp = mkdtempSync(join(tmpdir(), "oplyra-current-release-"));
  try {
    exportSnapshot({repoRoot, commit: recipe.snapshot.commit, paths: recipe.snapshot.exportPaths, destDir: tmp});
    // G só pode carregar o conteúdo revisto; não basta existir como objeto Git.
    assertReviewedContent(tmp, oldManifest, t, repoRoot);
    const generatedAt = hasReport ? json(repoRoot, output.report).generatedAt : (recipe.generatedAt ?? "2000-01-01T00:00:00Z");
    must(typeof generatedAt === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(generatedAt), "CR-SCHEMA");
    must(recipe.generatedAt === null || recipe.generatedAt === generatedAt, "CR-BYTE-MISMATCH", "generatedAt");
    const built = buildFromSnapshot({recipe, snapshotDir: tmp, generatedAt, crossValidate});
    if (!hasReport) return {phase: "prepared", release: t.release, baseline: t.baseRelease};
    must(bytes(repoRoot, output.report).equals(Buffer.from(built.reportText)), "CR-BYTE-MISMATCH", "relatório corrente");
    const publishedBytes = bytes(repoRoot, output.manifest);
    if (publishedBytes.equals(Buffer.from(built.intermediateText))) {
      let committed = false;
      try { gitRead(repoRoot, ["cat-file", "-e", `HEAD:${output.manifest}`]); committed = true; } catch { /* saída ainda não commitada, durante gates */ }
      must(!committed, "CR-PUBLICATION-PENDING", "manifest intermediário não é publicação final");
      return {phase: "intermediate", release: t.release, baseline: t.baseRelease};
    }
    const evidencePath = recipe.evidence?.path ?? `.oplyra/release/${t.release}/evidence.json`;
    must(existsSync(join(repoRoot, evidencePath)), "CR-EVIDENCE-MISSING");
    const evidenceBytes = bytes(repoRoot, evidencePath);
    if (recipe.evidence.sha256 !== null) must(sha256(evidenceBytes) === recipe.evidence.sha256, "CR-EVIDENCE-HASH");
    const ev = JSON.parse(evidenceBytes.toString("utf8"));
    must(pretty(ev) === evidenceBytes.toString("utf8"), "CR-EVIDENCE-SCHEMA");
    const counts = validateEvidence(ev, recipe, {reportSha: built.reportSha, intermediateManifestSha: built.intermediateManifestSha}, built.aggregateDigest);
    const final = buildFromSnapshot({recipe, snapshotDir: tmp, generatedAt, crossValidate, evidenceCounts: counts});
    must(publishedBytes.equals(Buffer.from(final.finalText)), "CR-BYTE-MISMATCH", "manifest corrente");
    return {phase: "final", release: t.release, baseline: t.baseRelease};
  } finally { rmSync(tmp, {recursive: true, force: true}); }
}
