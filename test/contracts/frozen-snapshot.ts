// Release congelada é verificada contra o SNAPSHOT governado (CR-033 §8), não contra a árvore de trabalho:
// o conteúdo posterior ao commit da receita (ex.: mudanças autorizadas do control plane) não pode entrar
// em uma release congelada nem fazê-la falhar. O snapshot é exportado com Git somente leitura.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Raiz do repositório de trabalho: use-a só para o que trata do estado CORRENTE (ex.: arquivos não versionados). */
export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

/** Commit do snapshot de uma release congelada, lido da sua receita versionada. */
export function snapshotCommitOf(version: string): string {
  const recipe = JSON.parse(readFileSync(join(REPO_ROOT, "tools/contract-release/recipes", `${version}.json`), "utf8"));
  const commit = recipe?.snapshot?.commit;
  if (typeof commit !== "string" || !/^[0-9a-f]{40}$/.test(commit)) throw new Error(`receita ${version} sem commit de snapshot válido`);
  return commit;
}

const cache = new Map<string, string>();

/** Exporta a árvore do commit para um diretório temporário e devolve a raiz. Falha fechada se o commit não existe (clone raso). */
export function frozenSnapshotRoot(commit: string): string {
  const cached = cache.get(commit);
  if (cached) return cached;
  try {
    execFileSync("git", ["cat-file", "-e", `${commit}^{commit}`], { cwd: REPO_ROOT, stdio: "ignore" });
  } catch {
    throw new Error(`snapshot ${commit} indisponível neste clone: use o histórico completo (no CI, actions/checkout com fetch-depth: 0)`);
  }
  const dir = mkdtempSync(join(tmpdir(), "oplyra-frozen-"));
  const tar = execFileSync("git", ["archive", "--format=tar", commit], { cwd: REPO_ROOT, maxBuffer: 1024 * 1024 * 1024 });
  execFileSync("tar", ["-x", "-C", dir], { input: tar });
  cache.set(commit, dir);
  return dir;
}
