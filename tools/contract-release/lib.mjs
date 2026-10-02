// Ferramenta versionada de release do Contract Registry (CR-033 §8). Substitui o gerador descartável.
// Somente módulos `node:*`, Node >= 22. Sem rede. Git somente leitura (lista fechada).
//
// Princípios:
//  - o conteúdo de uma release vem de um SNAPSHOT (commit) exportado para um diretório temporário,
//    nunca da árvore de trabalho; conteúdo posterior ao snapshot não entra em release congelada;
//  - a validação cruzada roda a partir do snapshot exportado, com o código do próprio snapshot;
//  - release congelada nunca é reescrita: só é reproduzida e comparada byte a byte;
//  - recusas emitem um código fixo (ReleaseError.code) e, no máximo, um caminho/identificador curto.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const RECIPE_SCHEMA = "oplyra-contract-release-recipe/1";
export const EVIDENCE_STATE_DIR = ".oplyra/release";
const HEX64 = /^[0-9a-f]{64}$/;
const HEX40 = /^[0-9a-f]{40}$/;
const VERSION = /^\d+\.\d+$/;
const ISO_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const SAFE_GIT = new Set(["archive", "cat-file", "rev-parse", "status", "ls-tree"]); // somente leitura
const RUNNER = join(dirname(fileURLToPath(import.meta.url)), "validator-runner.mjs");

export class ReleaseError extends Error {
  constructor(code, detail) {
    super(detail ? `${code} ${detail}` : code);
    this.code = code;
  }
}
const must = (cond, code, detail) => {
  if (!cond) throw new ReleaseError(code, detail);
};

export const sha256 = (b) => createHash("sha256").update(b).digest("hex");
export const pretty = (o) => `${JSON.stringify(o, null, 2)}\n`;
export const aggregate = (a) => sha256(Buffer.from([...a].sort((x, y) => x.path.localeCompare(y.path)).map((x) => `${x.path}:${x.sha256}`).join("\n")));

function exactKeys(o, keys, what) {
  must(o && typeof o === "object" && !Array.isArray(o), "CR-SCHEMA", `${what}: objeto esperado`);
  const got = Object.keys(o).sort().join("|");
  const want = [...keys].sort().join("|");
  must(got === want, "CR-SCHEMA", `${what}: campos diferentes do schema fechado`);
}

const safeRel = (p) => typeof p === "string" && p.length > 0 && !p.startsWith("/") && !p.includes("\\") && !p.includes("\0") && !p.split("/").includes("..");

/* ------------------------------------------------------------------ git (somente leitura) */

export function gitRead(repoRoot, args, opts = {}) {
  must(SAFE_GIT.has(args[0]), "CR-GIT-NOT-ALLOWED", args[0]);
  return execFileSync("git", args, { cwd: repoRoot, encoding: opts.buffer ? "buffer" : "utf8", maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}

/** Exporta somente `paths` do commit para `destDir` (git archive -> tar). */
export function exportSnapshot({ repoRoot, commit, paths, destDir, git = gitRead, extract = defaultExtract }) {
  must(HEX40.test(commit), "CR-SNAPSHOT-REF", "commit completo (40 hex) exigido");
  must(Array.isArray(paths) && paths.length > 0 && paths.every(safeRel), "CR-SNAPSHOT-PATHS");
  let type;
  try {
    type = String(git(repoRoot, ["cat-file", "-t", commit])).trim();
  } catch {
    throw new ReleaseError("CR-SNAPSHOT-MISSING", commit.slice(0, 12));
  }
  must(type === "commit", "CR-SNAPSHOT-MISSING", commit.slice(0, 12));
  let tar;
  try {
    tar = git(repoRoot, ["archive", "--format=tar", commit, "--", ...paths], { buffer: true });
  } catch {
    throw new ReleaseError("CR-SNAPSHOT-MISSING", "caminho ausente no snapshot");
  }
  mkdirSync(destDir, { recursive: true });
  extract(tar, destDir);
}

function defaultExtract(tarBuffer, destDir) {
  execFileSync("tar", ["-x", "-f", "-", "-C", destDir], { input: tarBuffer, stdio: ["pipe", "ignore", "pipe"], maxBuffer: 512 * 1024 * 1024 });
}

/* -------------------------------------------------------------------------- receitas */

export function validateRecipe(r) {
  exactKeys(r, ["schema", "release", "frozen", "base", "snapshot", "generatedAt", "changeSet", "crossValidation", "gates", "report", "manifest", "validationMap", "evidence", "expected"], "receita");
  must(r.schema === RECIPE_SCHEMA, "CR-SCHEMA", "schema da receita");
  must(typeof r.release === "string" && VERSION.test(r.release), "CR-SCHEMA", "release");
  must(typeof r.frozen === "boolean", "CR-SCHEMA", "frozen");
  exactKeys(r.base, ["release", "manifestPath", "manifestSha256", "reportPath", "reportSha256", "artifactCount", "aggregateDigest"], "base");
  must(VERSION.test(r.base.release) && HEX64.test(r.base.manifestSha256) && HEX64.test(r.base.reportSha256) && HEX64.test(r.base.aggregateDigest), "CR-SCHEMA", "base");
  must(safeRel(r.base.manifestPath) && safeRel(r.base.reportPath), "CR-SCHEMA", "caminhos da base");
  exactKeys(r.snapshot, ["commit", "exportPaths", "informationalCommits"], "snapshot");
  must(HEX40.test(r.snapshot.commit), "CR-SNAPSHOT-REF", "commit completo (40 hex) exigido");
  must(Array.isArray(r.snapshot.exportPaths) && r.snapshot.exportPaths.every(safeRel), "CR-SNAPSHOT-PATHS");
  exactKeys(r.changeSet, ["source", "modified", "added", "reportPath", "manifestPath"], "changeSet");
  must(safeRel(r.changeSet.reportPath) && safeRel(r.changeSet.manifestPath), "CR-SCHEMA", "caminhos de saída");
  must(r.changeSet.modified.every(safeRel) && r.changeSet.added.every((a) => safeRel(a.path) && typeof a.category === "string"), "CR-SCHEMA", "change set");
  must(r.changeSet.added.some((a) => a.path === r.changeSet.reportPath), "CR-SCHEMA", "o relatório deve constar nos adicionados");
  if (r.frozen) {
    must(typeof r.generatedAt === "string" && ISO_Z.test(r.generatedAt), "CR-SCHEMA", "generatedAt fixo é obrigatório em receita congelada");
    must(r.evidence !== null && r.expected !== null, "CR-SCHEMA", "receita congelada exige evidência histórica e hashes esperados");
  } else {
    must(r.generatedAt === null || (typeof r.generatedAt === "string" && ISO_Z.test(r.generatedAt)), "CR-SCHEMA", "generatedAt");
  }
  if (r.evidence !== null) {
    exactKeys(r.evidence, ["path", "sha256", "schema", "baseCommit", "retiredGeneratorSha256"], "evidence");
    // congelada: arquivo histórico versionado com hash fixo; em andamento: só o schema (a evidência é gerada pelo runner)
    if (r.frozen) must(safeRel(r.evidence.path) && HEX64.test(r.evidence.sha256), "CR-SCHEMA", "evidence");
    else must(typeof r.evidence.schema === "string" && r.evidence.schema.length > 0, "CR-SCHEMA", "evidence.schema");
  } else {
    must(!r.frozen, "CR-SCHEMA", "evidência histórica");
  }
  if (r.expected !== null) {
    exactKeys(r.expected, ["reportSha256", "manifestSha256", "intermediateManifestSha256", "aggregateDigest", "artifactCount", "classification"], "expected");
    must([r.expected.reportSha256, r.expected.manifestSha256, r.expected.intermediateManifestSha256, r.expected.aggregateDigest].every((h) => HEX64.test(h)), "CR-SCHEMA", "expected");
  }
  return r;
}

/** Receita futura nunca referencia saídas de receita congelada, e só parte de uma release congelada intacta. */
export function validateRecipeSet(recipes) {
  const frozen = recipes.filter((r) => r.frozen);
  const outputs = new Map(frozen.flatMap((r) => [[r.changeSet.reportPath, r.release], [r.changeSet.manifestPath, r.release]]));
  const byRelease = new Map(frozen.map((r) => [r.release, r]));
  for (const r of recipes.filter((x) => !x.frozen)) {
    const touched = [...r.changeSet.modified, ...r.changeSet.added.map((a) => a.path), r.changeSet.reportPath, r.changeSet.manifestPath];
    for (const p of touched) must(!outputs.has(p), "CR-FROZEN-OUTPUT", p);
    const base = byRelease.get(r.base.release);
    must(base !== undefined, "CR-BASE-NOT-FROZEN", r.base.release);
    must(r.base.manifestSha256 === base.expected.manifestSha256 && r.base.manifestPath === base.changeSet.manifestPath, "CR-BASE-MISMATCH", r.base.release);
  }
  return true;
}

/* ------------------------------------------------------------------------ evidência */

export function validateEvidence(ev, recipe, state, aggregateDigest) {
  exactKeys(ev, ["schema", "baseCommit", "reportSha256", "intermediateManifestSha256", "aggregateDigest", "gates"], "evidência");
  must(ev.schema === recipe.evidence.schema, "CR-EVIDENCE-SCHEMA");
  must(typeof ev.baseCommit === "string" && /^[0-9a-f]{7,40}$/.test(ev.baseCommit), "CR-EVIDENCE-HEAD");
  // evidência de outro HEAD é rejeitada: congelada -> o commit-base histórico; em andamento -> o snapshot
  const expectedHead = recipe.frozen ? recipe.evidence.baseCommit : recipe.snapshot.commit;
  must(expectedHead.startsWith(ev.baseCommit) || ev.baseCommit.startsWith(expectedHead), "CR-EVIDENCE-HEAD");
  must(HEX64.test(ev.reportSha256) && ev.reportSha256 === state.reportSha, "CR-EVIDENCE-STATE", "relatório");
  must(HEX64.test(ev.intermediateManifestSha256) && ev.intermediateManifestSha256 === state.intermediateManifestSha, "CR-EVIDENCE-STATE", "manifest intermediário");
  must(HEX64.test(ev.aggregateDigest) && ev.aggregateDigest === aggregateDigest, "CR-EVIDENCE-STATE", "aggregate digest");
  must(Array.isArray(ev.gates), "CR-EVIDENCE-SCHEMA", "gates");
  const gates = recipe.gates;
  const seen = new Set();
  const counts = {};
  for (const g of ev.gates) {
    exactKeys(g, ["id", "command", "exitCode", "status", "counts"], "gate");
    must(typeof g.id === "string" && Object.hasOwn(gates, g.id), "CR-EVIDENCE-GATE", "gate desconhecido");
    must(!seen.has(g.id), "CR-EVIDENCE-GATE", `duplicado ${g.id}`);
    seen.add(g.id);
    const spec = gates[g.id];
    must(g.command === spec.cmd, "CR-EVIDENCE-GATE", `comando de ${g.id}`);
    must(g.exitCode === 0 && g.status === "passed", "CR-EVIDENCE-GATE", `${g.id} não aprovado`);
    exactKeys(g.counts, Object.keys(spec.counts), `gate ${g.id}.counts`);
    for (const [k, want] of Object.entries(spec.counts)) {
      const v = g.counts[k];
      must(Number.isSafeInteger(v) && v >= 0, "CR-EVIDENCE-COUNTS", `${g.id}.${k}`);
      if (typeof want === "number") must(v === want, "CR-EVIDENCE-COUNTS", `${g.id}.${k}`);
      else if (want === "pos") must(v > 0, "CR-EVIDENCE-COUNTS", `${g.id}.${k}`);
      else must(typeof want === "object" && v >= want.min, "CR-EVIDENCE-COUNTS", `${g.id}.${k}`);
    }
    for (const [a, b] of spec.eq) must(g.counts[a] === g.counts[b], "CR-EVIDENCE-COUNTS", `${g.id}: ${a} ≠ ${b}`);
    counts[g.id] = g.counts;
  }
  const missing = Object.keys(gates).filter((k) => !seen.has(k));
  must(missing.length === 0, "CR-EVIDENCE-GATE", `faltam ${missing.join(",")}`);
  must(ev.gates.length === Object.keys(gates).length, "CR-EVIDENCE-GATE", "gates em excesso");
  assertGateOrder(ev.gates.map((g) => g.id));
  return counts;
}

/** Sequência normativa: db-reset -> db-roles -> verificar. */
export function assertGateOrder(ids) {
  const pos = (id) => ids.indexOf(id);
  if (pos("verificar") >= 0 || pos("db-reset") >= 0 || pos("db-roles") >= 0) {
    must(pos("db-reset") >= 0 && pos("db-roles") >= 0 && pos("verificar") >= 0 && pos("db-reset") < pos("db-roles") && pos("db-roles") < pos("verificar"), "CR-GATE-ORDER");
  }
}

/* ------------------------------------------------------------------------ construção */

function resolveValue(spec, counts) {
  if (spec && typeof spec === "object" && !Array.isArray(spec)) {
    if (Object.hasOwn(spec, "$count")) return counts[spec.$count[0]][spec.$count[1]];
    if (Object.hasOwn(spec, "$eq")) return counts[spec.$eq[0]][spec.$eq[1]] === spec.$eq[2];
  }
  return spec;
}

/**
 * Constrói relatório e manifest (intermediário e, com evidência, final) a partir do snapshot exportado.
 * `crossValidate(snapshotDir)` devolve `{ checks, counts, inputs }` calculado com o validador DO snapshot.
 */
export function buildFromSnapshot({ recipe, snapshotDir, generatedAt, crossValidate, evidenceCounts = null }) {
  const rd = (p) => readFileSync(join(snapshotDir, p));
  const abs = (p) => join(snapshotDir, p);
  const { base, changeSet: cs, report: rp, manifest: mf } = recipe;
  const MODIFIED = cs.modified;
  const ADDED = cs.added.map((a) => [a.path, a.category]);

  // base preservada (bytes, digest e herdados) lida do snapshot
  must(sha256(rd(base.manifestPath)) === base.manifestSha256, "CR-BASE-MISMATCH", "manifest");
  must(sha256(rd(base.reportPath)) === base.reportSha256, "CR-BASE-MISMATCH", "relatório");
  const prevManifest = JSON.parse(rd(base.manifestPath).toString("utf8"));
  const prevReport = JSON.parse(rd(base.reportPath).toString("utf8"));
  must(prevManifest.releaseVersion === base.release && prevManifest.status === "active" && prevManifest.artifacts.length === base.artifactCount, "CR-BASE-MISMATCH", "release base");
  must(aggregate(prevManifest.artifacts) === prevManifest.artifactSummary.aggregateDigest && prevManifest.artifactSummary.aggregateDigest === base.aggregateDigest, "CR-BASE-MISMATCH", "aggregate digest");
  must(prevManifest.artifacts.every((a) => !/contract-registry-manifest-v\d/.test(a.path)), "CR-BASE-MISMATCH", "manifest como artefato");
  const baseMap = new Map(prevManifest.artifacts.map((a) => [a.path, a]));
  must(MODIFIED.every((p) => baseMap.has(p)), "CR-CHANGESET", "modificado inexistente na base");
  must(ADDED.every(([p]) => !baseMap.has(p)), "CR-CHANGESET", "adicionado já existe na base");
  for (const a of prevManifest.artifacts) {
    if (MODIFIED.includes(a.path)) continue;
    must(existsSync(abs(a.path)), "CR-HASH-MISMATCH", `herdado ausente: ${a.path}`);
    const b = rd(a.path);
    must(b.length === a.sizeBytes && sha256(b) === a.sha256, "CR-HASH-MISMATCH", `herdado divergente: ${a.path}`);
  }
  for (const [p] of ADDED) if (p !== cs.reportPath) must(existsSync(abs(p)), "CR-CHANGESET", `adicionado ausente no snapshot: ${p}`);

  // validação cruzada a partir do snapshot exportado
  const cv = recipe.crossValidation;
  const r = crossValidate(snapshotDir);
  const ids = r.checks.map((c) => c.id);
  must(r.checks.length === cv.expectedChecks && new Set(ids).size === cv.expectedChecks, "CR-CROSS-VALIDATION", `checks esperados ${cv.expectedChecks}`);
  must(r.checks.every((c) => c.status === "passed"), "CR-CROSS-VALIDATION", "check reprovado");
  must(cv.requiredIds.every((id) => ids.includes(id)), "CR-CROSS-VALIDATION", "check obrigatório ausente");

  // relatório
  const scope = structuredClone(prevReport.scope);
  scope.supportingArtifacts.push(...rp.supportingArtifacts);
  const reportText = pretty({
    artifact: prevReport.artifact, artifactVersion: recipe.release, schemaVersion: prevReport.schemaVersion, generatedAt, stage: prevReport.stage, status: "passed",
    releaseVersion: recipe.release, changeSet: rp.changeSetId, appliedSlices: rp.appliedSlices, notAppliedSlices: rp.notAppliedSlices,
    scope, evidencePolicy: { ...prevReport.evidencePolicy, ...rp.evidencePolicy }, counts: r.counts, summary: prevReport.summary,
    decision: rp.decision,
    validation: { checksRun: cv.expectedChecks, checksPassed: cv.expectedChecks, checksFailed: 0, checks: r.checks },
    inputs: r.inputs,
  });
  const reportBytes = Buffer.from(reportText);

  // manifest
  const entryFrom = (p, category, b) => ({ path: p, category, sizeBytes: b.length, sha256: sha256(b), source: cs.source });
  const artifacts = prevManifest.artifacts.map((a) => (MODIFIED.includes(a.path) ? entryFrom(a.path, a.category, rd(a.path)) : a));
  for (const [p, cat] of ADDED) artifacts.push(entryFrom(p, cat, p === cs.reportPath ? reportBytes : rd(p)));
  artifacts.sort((a, b) => a.path.localeCompare(b.path));
  const byCat = {};
  for (const a of artifacts) byCat[a.category] = (byCat[a.category] ?? 0) + 1;
  const byCategory = {};
  for (const k of Object.keys(prevManifest.artifactSummary.byCategory)) if (byCat[k] !== undefined) byCategory[k] = byCat[k];
  for (const k of Object.keys(byCat)) if (byCategory[k] === undefined) byCategory[k] = byCat[k];
  const inherited = artifacts.filter((a) => baseMap.has(a.path) && !MODIFIED.includes(a.path)).length;
  const digest = aggregate(artifacts);

  const changeSet = {
    ...mf.changeSet,
    modifiedArtifacts: [...MODIFIED].sort((a, b) => a.localeCompare(b)),
    addedArtifacts: ADDED.map(([p]) => p).sort((a, b) => a.localeCompare(b)),
  };
  const limits = [mf.newLimit, ...prevManifest.explicitValidationLimits.map((l) => (l.startsWith(mf.replacedLimitPrefix) ? mf.replacementLimit : l))];
  const pendingValidation = { ...mf.pendingValidation };
  const buildManifest = (validation) => pretty({
    manifest: prevManifest.manifest, manifestVersion: recipe.release, schemaVersion: prevManifest.schemaVersion, releaseVersion: recipe.release, generatedAt, status: "active",
    baseRelease: { version: base.release, manifestPath: base.manifestPath, manifestSha256: base.manifestSha256, aggregateDigest: base.aggregateDigest },
    baseFreeze: prevManifest.baseFreeze,
    changeSet,
    registryVersions: prevManifest.registryVersions,
    artifactClassification: { inheritedUnchanged: inherited, [mf.classificationKeys.modified]: MODIFIED.length, [mf.classificationKeys.added]: ADDED.length, unclassified: 0 },
    artifactSummary: { total: artifacts.length, byCategory, aggregateDigest: digest },
    artifacts,
    validation,
    compatibility: mf.compatibility,
    exclusions: [...prevManifest.exclusions, { path: cs.manifestPath, reason: "manifest_self_reference_is_not_hashed" }],
    implementationBoundary: prevManifest.implementationBoundary,
    explicitValidationLimits: limits,
  });
  const intermediateText = buildManifest(pendingValidation);
  let finalText = null;
  if (evidenceCounts) {
    const validation = {};
    for (const [k, spec] of Object.entries(recipe.validationMap)) validation[k] = resolveValue(spec, evidenceCounts);
    finalText = buildManifest(validation);
  }

  // validação do que seria gravado (contra os bytes reais do snapshot)
  const exp = recipe.expected;
  const check = (manifestText) => {
    const rr = JSON.parse(reportText);
    const mm = JSON.parse(manifestText);
    must(pretty(rr) === reportText && pretty(mm) === manifestText, "CR-FORMAT");
    must(JSON.stringify(rr.inputs) === JSON.stringify(r.inputs) && JSON.stringify(rr.validation.checks) === JSON.stringify(r.checks), "CR-CROSS-VALIDATION", "relatório diverge");
    const paths = mm.artifacts.map((a) => a.path);
    must(new Set(paths).size === paths.length && paths.every((p, i) => i === 0 || paths[i - 1].localeCompare(p) < 0), "CR-CHANGESET", "artefatos duplicados ou fora de ordem");
    must(paths.every((p) => !/contract-registry-manifest-v\d/.test(p)), "CR-CHANGESET", "manifest como artefato");
    for (const a of mm.artifacts) {
      const o = baseMap.get(a.path);
      if (!o) must(ADDED.some(([p]) => p === a.path) && a.source === cs.source, "CR-CHANGESET", `novo não autorizado: ${a.path}`);
      else if (JSON.stringify(o) !== JSON.stringify(a)) must(MODIFIED.includes(a.path) && a.source === cs.source && a.category === o.category, "CR-CHANGESET", `diferença fora do change set: ${a.path}`);
      const real = a.path === cs.reportPath ? reportBytes : rd(a.path);
      must(real.length === a.sizeBytes && sha256(real) === a.sha256, "CR-HASH-MISMATCH", a.path);
    }
    for (const p of baseMap.keys()) must(paths.includes(p), "CR-CHANGESET", `herdado ausente: ${p}`);
    must(aggregate(mm.artifacts) === mm.artifactSummary.aggregateDigest && mm.artifactSummary.aggregateDigest === digest, "CR-DIGEST");
    if (exp) {
      must(mm.artifacts.length === exp.artifactCount && mm.artifactSummary.total === exp.artifactCount, "CR-EXPECTED", "total de artefatos");
      must(JSON.stringify(mm.artifactClassification) === JSON.stringify(exp.classification), "CR-EXPECTED", "classificação");
      must(digest === exp.aggregateDigest, "CR-EXPECTED", "aggregate digest");
    }
    return mm;
  };
  check(intermediateText);
  if (finalText) check(finalText);
  return { reportText, intermediateText, finalText, aggregateDigest: digest, reportSha: sha256(reportBytes), intermediateManifestSha: sha256(Buffer.from(intermediateText)), finalManifestSha: finalText ? sha256(Buffer.from(finalText)) : null };
}

/** Validador do snapshot executado em processo filho (TypeScript com type-stripping do Node). */
export function defaultCrossValidate(snapshotDir) {
  const out = execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings", RUNNER, snapshotDir], {
    cwd: snapshotDir, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(out);
}

/* ------------------------------------------------------------------------ reprodução */

const readJsonFile = (p) => JSON.parse(readFileSync(p, "utf8"));

export function loadRecipe(repoRoot, version) {
  must(typeof version === "string" && VERSION.test(version), "CR-ARGS", "versão");
  const file = join(repoRoot, "tools", "contract-release", "recipes", `${version}.json`);
  must(existsSync(file), "CR-RECIPE-MISSING", version);
  const recipe = validateRecipe(readJsonFile(file));
  must(recipe.release === version, "CR-SCHEMA", "release ≠ nome do arquivo");
  // receita futura: confrontada com as receitas CONGELADAS do repositório (saídas congeladas intocáveis, base congelada e íntegra)
  if (!recipe.frozen) {
    const dir = dirname(file);
    const frozen = readdirSync(dir)
      .filter((n) => /^\d+\.\d+\.json$/.test(n) && n !== `${version}.json`)
      .map((n) => readJsonFile(join(dir, n)))
      .filter((r) => r && r.frozen === true)
      .map(validateRecipe);
    validateRecipeSet([...frozen, recipe]);
  }
  return recipe;
}

export function loadEvidence(repoRoot, recipe) {
  const text = readFileSync(join(repoRoot, recipe.evidence.path), "utf8");
  must(sha256(Buffer.from(text)) === recipe.evidence.sha256, "CR-EVIDENCE-HASH");
  const ev = JSON.parse(text);
  must(pretty(ev) === text, "CR-EVIDENCE-SCHEMA", "JSON não canônico");
  return ev;
}

/**
 * Reproduz uma release CONGELADA em memória/temporário: exporta o snapshot, confere o manifest publicado contra o
 * snapshot, reconstrói relatório e manifest com `generatedAt` da receita e exige igualdade byte a byte com os
 * arquivos publicados no snapshot e com os hashes esperados. Não executa gates e não escreve no repositório.
 */
export function reproduceFrozen({ repoRoot, recipe, crossValidate = defaultCrossValidate, git = gitRead, extract, workDir }) {
  must(recipe.frozen === true, "CR-ARGS", "reproduzir exige receita congelada");
  const tmp = workDir ?? mkdtempSync(join(tmpdir(), `oplyra-release-${recipe.release}-`));
  const snapshotDir = join(tmp, "snapshot");
  try {
    exportSnapshot({ repoRoot, commit: recipe.snapshot.commit, paths: recipe.snapshot.exportPaths, destDir: snapshotDir, git, extract });
    const cs = recipe.changeSet;
    const published = { manifest: readFileSync(join(snapshotDir, cs.manifestPath)), report: readFileSync(join(snapshotDir, cs.reportPath)) };
    // o manifest publicado no snapshot é a verdade histórica: seus hashes valem para os bytes do snapshot
    must(sha256(published.manifest) === recipe.expected.manifestSha256, "CR-EXPECTED", "manifest publicado");
    must(sha256(published.report) === recipe.expected.reportSha256, "CR-EXPECTED", "relatório publicado");
    const publishedManifest = JSON.parse(published.manifest.toString("utf8"));
    must(publishedManifest.artifacts.length === recipe.expected.artifactCount, "CR-EXPECTED", "total de artefatos publicados");
    for (const a of publishedManifest.artifacts) {
      const b = a.path === cs.reportPath ? published.report : readFileSync(join(snapshotDir, a.path));
      must(b.length === a.sizeBytes && sha256(b) === a.sha256, "CR-HASH-MISMATCH", a.path);
    }
    const evidence = loadEvidence(repoRoot, recipe);
    const probe = buildFromSnapshot({ recipe, snapshotDir, generatedAt: recipe.generatedAt, crossValidate });
    const state = { reportSha: probe.reportSha, intermediateManifestSha: probe.intermediateManifestSha };
    const counts = validateEvidence(evidence, recipe, state, probe.aggregateDigest);
    const built = buildFromSnapshot({ recipe, snapshotDir, generatedAt: recipe.generatedAt, crossValidate, evidenceCounts: counts });
    must(built.reportSha === recipe.expected.reportSha256 && Buffer.from(built.reportText).equals(published.report), "CR-BYTE-MISMATCH", "relatório");
    must(built.intermediateManifestSha === recipe.expected.intermediateManifestSha256, "CR-BYTE-MISMATCH", "manifest intermediário");
    must(built.finalManifestSha === recipe.expected.manifestSha256 && Buffer.from(built.finalText).equals(published.manifest), "CR-BYTE-MISMATCH", "manifest final");
    must(built.aggregateDigest === recipe.expected.aggregateDigest, "CR-BYTE-MISMATCH", "aggregate digest");
    return { release: recipe.release, reportSha256: built.reportSha, manifestSha256: built.finalManifestSha, aggregateDigest: built.aggregateDigest, artifacts: publishedManifest.artifacts.length };
  } finally {
    if (!workDir) rmSync(tmp, { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------------ release em andamento */

export const stateDirFor = (repoRoot, version) => join(repoRoot, EVIDENCE_STATE_DIR, version);

function transactionalWrite(repoRoot, version, writes) {
  const tmpDir = join(stateDirFor(repoRoot, version), ".tmp");
  mkdirSync(tmpDir, { recursive: true });
  const done = [];
  try {
    writes.forEach(([p, text], i) => {
      const tmp = join(tmpDir, `new-${i}`);
      const bak = join(tmpDir, `bak-${i}`);
      const target = join(repoRoot, p);
      writeFileSync(tmp, text);
      must(sha256(readFileSync(tmp)) === sha256(Buffer.from(text)), "CR-WRITE", "temporário difere do validado");
      done.push({ target, tmp, bak, hadOld: existsSync(target), moved: false });
      if (existsSync(target)) copyFileSync(target, bak);
    });
    for (const d of done) {
      mkdirSync(dirname(d.target), { recursive: true });
      renameSync(d.tmp, d.target);
      d.moved = true;
    }
  } catch (e) {
    for (const d of [...done].reverse()) {
      try {
        if (d.moved) {
          if (d.hadOld) copyFileSync(d.bak, d.target);
          else rmSync(d.target, { force: true });
        }
      } catch { /* melhor esforço */ }
    }
    throw e;
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Release NÃO congelada: fase `intermediate` ou `final`. Lê somente do snapshot da receita; grava o relatório e o
 * manifest nos caminhos da receita (transacional) e o estado em `.oplyra/release/<versão>/state.json`.
 */
export function buildRelease({ repoRoot, recipe, phase, evidencePath = null, crossValidate = defaultCrossValidate, git = gitRead, extract, now = () => new Date().toISOString().replace(/\.\d+Z$/, "Z") }) {
  must(recipe.frozen === false, "CR-FROZEN", "release congelada nunca é reescrita");
  must(phase === "intermediate" || phase === "final", "CR-ARGS", "fase");
  const dir = stateDirFor(repoRoot, recipe.release);
  const rel = (p) => resolve(p).startsWith(resolve(repoRoot, "test-results") + "/");
  must(!rel(dir), "CR-STATE-DIR", "o estado não pode ficar em test-results/");
  const statePath = join(dir, "state.json");
  const state = existsSync(statePath) ? readJsonFile(statePath) : null;
  if (state) exactKeys(state, ["phase", "snapshot", "reportSha", "intermediateManifestSha", "aggregateDigest", "finalManifestSha", "generatedAt"], "estado");
  must(!(phase === "intermediate" && state?.phase === "final"), "CR-PHASE", "a fase inicial não pode rodar depois da final");
  must(!(phase === "final" && !state), "CR-PHASE", "a fase final exige a inicial");
  if (state) must(state.snapshot === recipe.snapshot.commit, "CR-STALE-STATE", "estado de outro snapshot");
  const generatedAt = recipe.generatedAt ?? state?.generatedAt ?? now();
  const tmp = mkdtempSync(join(tmpdir(), `oplyra-release-${recipe.release}-`));
  try {
    const snapshotDir = join(tmp, "snapshot");
    exportSnapshot({ repoRoot, commit: recipe.snapshot.commit, paths: recipe.snapshot.exportPaths, destDir: snapshotDir, git, extract });
    const intermediate = buildFromSnapshot({ recipe, snapshotDir, generatedAt, crossValidate });
    const cs = recipe.changeSet;
    const stateFile = (p, f) => pretty({ phase: p, snapshot: recipe.snapshot.commit, reportSha: intermediate.reportSha, intermediateManifestSha: intermediate.intermediateManifestSha, aggregateDigest: intermediate.aggregateDigest, finalManifestSha: f, generatedAt });
    if (phase === "intermediate") {
      transactionalWrite(repoRoot, recipe.release, [
        [cs.reportPath, intermediate.reportText], [cs.manifestPath, intermediate.intermediateText],
        [`${EVIDENCE_STATE_DIR}/${recipe.release}/state.json`, stateFile("intermediate", null)],
      ]);
      return { phase, reportSha256: intermediate.reportSha, intermediateManifestSha256: intermediate.intermediateManifestSha, aggregateDigest: intermediate.aggregateDigest, generatedAt };
    }
    must(state.reportSha === intermediate.reportSha && state.intermediateManifestSha === intermediate.intermediateManifestSha, "CR-STALE-STATE", "reconstrução difere do estado");
    must(typeof evidencePath === "string" && resolve(repoRoot, evidencePath) === resolve(dir, "evidence.json"), "CR-ARGS", "a evidência deve ser a gerada pelo runner");
    must(existsSync(join(dir, "evidence.json")), "CR-EVIDENCE-MISSING", "execute os gates antes da fase final");
    const evText = readFileSync(join(dir, "evidence.json"), "utf8");
    const ev = JSON.parse(evText);
    must(pretty(ev) === evText, "CR-EVIDENCE-SCHEMA", "JSON não canônico");
    const counts = validateEvidence(ev, recipe, state, intermediate.aggregateDigest);
    const final = buildFromSnapshot({ recipe, snapshotDir, generatedAt, crossValidate, evidenceCounts: counts });
    transactionalWrite(repoRoot, recipe.release, [
      [cs.manifestPath, final.finalText],
      [`${EVIDENCE_STATE_DIR}/${recipe.release}/state.json`, stateFile("final", final.finalManifestSha)],
    ]);
    return { phase, reportSha256: final.reportSha, manifestSha256: final.finalManifestSha, aggregateDigest: final.aggregateDigest, generatedAt };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
