// Preparação da 2.23: nenhum output real é emitido por este teste.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { CURRENT_REQUIRED_IDS, runCrossRegistryValidation } from "./cross-registry-validation.ts";
import { frozenSnapshotRoot, snapshotCommitOf, REPO_ROOT } from "./frozen-snapshot.ts";
// @ts-ignore — módulo .mjs sem declarações.
import { inspectReleaseState } from "../../tools/contract-release/current-state.mjs";
const transition = JSON.parse(readFileSync(join(REPO_ROOT, "test/contracts/release-2.23-transition.json"), "utf8"));

describe("Release 2.23: cobertura corrente e preservação histórica", () => {
  it("release-2.22-preserved: perfil histórico exatamente igual à evidência 2.22", () => {
    const root = frozenSnapshotRoot(snapshotCommitOf("2.22"));
    const report = JSON.parse(readFileSync(join(root, "docs/product/marketing-ops/contracts/cross-registry-validation-v2.22.json"), "utf8"));
    const result = runCrossRegistryValidation(root, "2.22");
    expect(result.checks).toHaveLength(88);
    expect(result.checks).toEqual(report.validation.checks);
    expect(result.inputs).toEqual(report.inputs);
    expect(result.counts).toEqual(report.counts);
  });
  it("o perfil corrente verifica os contratos substitutos com IDs distintos", () => {
    const result = runCrossRegistryValidation(REPO_ROOT, "2.23");
    expect(result.checks.filter((c) => c.status !== "passed")).toEqual([]);
    expect(new Set(result.checks.map((c) => c.id)).size).toBe(result.checks.length);
    for (const id of CURRENT_REQUIRED_IDS) expect(result.checks.find((c) => c.id === id)?.status, id).toBe("passed");
    expect(result.inputs.every((i) => !/v2\.23\.json$|recipes\/2\.23/.test(i.path))).toBe(true);
  });
  it("perfil histórico na árvore corrente e perfil desconhecido não viram aprovação", () => {
    expect(runCrossRegistryValidation(REPO_ROOT, "2.22").checks.filter((c) => c.status === "failed").map((c) => c.id)).toEqual([
      "FROZEN-migrations-000001-000014", "DOCS-cr030-product-ai-alignment", "DOCS-cr031-harness-documents", "DOCS-cr032-s1-git-lifecycle", "HARNESS-cr032-s1-no-executable-mechanism",
    ]);
    expect(() => runCrossRegistryValidation(REPO_ROOT, "inexistente" as "2.23")).toThrow("CR-VALIDATION-PROFILE");
  });
  it("a receita não é necessária para testar a preparação; quando existir sua integridade é obrigatória", () => {
    expect(inspectReleaseState({repoRoot: REPO_ROOT, transition}).release).toBe("2.23");
  }, 180_000);
});

function copyCurrent(root: string) {
  // Base corrente copiada sem dependências, caches, segredos ou Git.
  for (const p of ["docs", "scripts", "tools", "test", "packages", "supabase", ".claude", ".github", "AGENTS.md", "CLAUDE.md", "README.md", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", ".mcp.json", ".env.example"]) {
    cpSync(join(REPO_ROOT, p), join(root, p), {recursive: true, filter: (s) => !/(^|\/)node_modules(\/|$)|\/\.oplyra(\/|$)/.test(s) && !/\/\.env($|\.)/.test(s.replace(/\.env\.example$/, "safe-example"))});
  }

}

// Mutações em cópia do snapshot/arquivos normativos; nunca na árvore real.
const mutations = [
  ["docs/product/marketing-ops/ATUALIZACOES.md", "instrução explícita do usuário → este complemento → v2.3", "precedência removida", "DOCS-cr030-product-ai-alignment-v2"],
  ["CLAUDE.md", "Autorização não é implementação", "autorizar automaticamente", "DOCS-cr031-harness-documents-v2"],
  ["docs/harness/POLITICA-REVISAO-RESPONSAVEL-UNICO.md", "pedidos de alteração", "pedidos ignorados", "DOCS-cr032-s1-git-lifecycle-v2"],
  ["scripts/claude-git.mjs", "DD-NO-RECORD", "DD-SEM-GUARDA", "HARNESS-cr032-s1-no-executable-mechanism-v2"],
] as const;
describe("documentary-mutations: coberturas substitutas da 2.23", () => {
  for (const [path, from, to, id] of mutations) it(`rejeita ${id}`, () => {
    const tmp = mkdtempSync(join(tmpdir(), "oplyra-profile-mutation-"));
    try {
      copyCurrent(tmp);
      const file = join(tmp, path), original = readFileSync(file, "utf8");
      expect(original).toContain(from);
      writeFileSync(file, original.replaceAll(from, to));
      expect(runCrossRegistryValidation(tmp, "2.23").checks.find((c) => c.id === id)?.status).toBe("failed");
    } finally { rmSync(tmp, {recursive: true, force: true}); }
  });
  it("uma migration adicional sem autorização falha no perfil corrente", () => {
    const tmp = mkdtempSync(join(tmpdir(), "oplyra-migration-mutation-"));
    try {
      copyCurrent(tmp);
      writeFileSync(join(tmp, "supabase/migrations/20990101000017_unapproved.sql"), "-- fixture sintética\n");
      expect(runCrossRegistryValidation(tmp, "2.23").checks.find((c) => c.id === "FROZEN-migrations-000001-000014-v2")?.status).toBe("failed");
    } finally { rmSync(tmp, {recursive: true, force: true}); }
  });
  it("o perfil corrente não depende da presença de receita, manifest ou relatório futuro em P", () => {
    const tmp = mkdtempSync(join(tmpdir(), "oplyra-output-invariance-"));
    try {
      copyCurrent(tmp);
      const before = runCrossRegistryValidation(tmp, "2.23");
      for (const p of ["tools/contract-release/recipes/2.23.json", "docs/product/marketing-ops/contracts/contract-registry-manifest-v2.23.json", "docs/product/marketing-ops/contracts/cross-registry-validation-v2.23.json"]) {
        writeFileSync(join(tmp, p), '{"syntheticPublication":true}\n');
      }
      expect(runCrossRegistryValidation(tmp, "2.23")).toEqual(before);
    } finally { rmSync(tmp, {recursive: true, force: true}); }
  });
});

// Seletores destinados aos gates da futura receita, executáveis já no estado sem receita.
const digest = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
const contracts = "docs/product/marketing-ops/contracts";
const selectedManifest = () => {
  const p = `${contracts}/contract-registry-manifest-v2.23.json`;
  return JSON.parse(readFileSync(join(REPO_ROOT, existsSync(join(REPO_ROOT, p)) ? p : `${contracts}/contract-registry-manifest-v2.22.json`), "utf8"));
};
describe("Release 2.23: evidência independente", () => {
  it("independent-recompute: todos os hashes e o digest são recalculados sem o builder", () => {
    const m = selectedManifest();
    const exceptions = m.releaseVersion === "2.22" ? new Map(transition.modified.map((a: {path: string; sha256: string}) => [a.path, a.sha256])) : new Map<string, string>();
    const rows = m.releaseVersion === "2.22" ? [...m.artifacts, ...transition.added] : m.artifacts;
    const actual = rows.map((a: {path: string; sha256: string}) => {
      const hash = digest(readFileSync(join(REPO_ROOT, a.path)));
      expect(hash, a.path).toBe(exceptions.get(a.path) ?? a.sha256);
      return {path: a.path, sha256: hash};
    });
    const aggregate = (rows: {path: string; sha256: string}[]) => digest([...rows].sort((a,b) => a.path.localeCompare(b.path)).map((a) => `${a.path}:${a.sha256}`).join("\n"));
    const expected = rows.map((a: {path: string; sha256: string}) => ({...a, sha256: exceptions.get(a.path) ?? a.sha256}));
    expect(aggregate(actual)).toBe(aggregate(expected));
    if (m.releaseVersion === "2.23") expect(aggregate(actual)).toBe(m.artifactSummary.aggregateDigest);
  });
  it("links: referências locais dos documentos governados existem", () => {
    const m = selectedManifest();
    const paths = [...new Set<string>([...m.artifacts.map((a: {path: string}) => a.path), ...transition.added.map((a: {path: string}) => a.path)])].filter((p) => p.endsWith(".md"));
    const missing: string[] = [];
    for (const p of paths) {
      const text = readFileSync(join(REPO_ROOT, p), "utf8");
      for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
        const target = match[1]!.split("#")[0]!;
        if (!target || /^[a-z][a-z0-9+.-]*:|^\//i.test(target)) continue;
        if (!existsSync(resolve(REPO_ROOT, dirname(p), decodeURIComponent(target)))) missing.push(`${p}: ${target}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
const secretPatterns = () => {
  const script = readFileSync(join(REPO_ROOT, "scripts/scan-secrets.sh"), "utf8");
  return [...script.split("PADROES=(")[1]!.split("\n)")[0]!.matchAll(/^\s*'(.+)'\s*$/gm)].map((m) => new RegExp(m[1]!));
};
const containsSecret = (content: string) => secretPatterns().some((re) => content.split("\n").some((line) => re.test(line)));
describe("secret-scan-untracked: arquivos correntes não versionados", () => {
  it("secret-scan-untracked: cada formato sintético é detectado", () => {
    const samples = ["sb_secret_"+"a".repeat(12), "eyJ"+"a".repeat(25)+"."+"b".repeat(25), "-----BEGIN RSA "+"PRIVATE KEY-----", "sk"+"-"+"a".repeat(24), "service_role="+"a".repeat(45)];
    for (const s of samples) expect(containsSecret(s)).toBe(true);
    expect(containsSecret("conteúdo comum")).toBe(false);
  });
  it("secret-scan-untracked: nenhuma ocorrência, sem imprimir conteúdo", () => {
    const paths = execFileSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], {cwd: REPO_ROOT, encoding: "utf8"}).split("\0").filter(Boolean);
    const found = paths.filter((p) => !/\.lock$/.test(p) && p !== "pnpm-lock.yaml").filter((p) => {
      const b = readFileSync(join(REPO_ROOT, p)); return !b.includes(0) && containsSecret(b.toString("utf8"));
    });
    expect(found).toEqual([]);
  });
});
