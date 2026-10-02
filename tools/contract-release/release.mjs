#!/usr/bin/env node
// CLI da ferramenta de release (CR-033 §8). Gramática fechada:
//   release.mjs reproduce <versão>             # release congelada: reproduz e compara byte a byte
//   release.mjs build <versão> intermediate    # release em andamento
//   release.mjs build <versão> final
//   release.mjs gates <versão>                 # roda os gates da receita e escreve a evidência
// Qualquer outra forma é recusada. Imprime JSON ou apenas um código fixo.

import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ReleaseError, buildRelease, loadRecipe, reproduceFrozen } from "./lib.mjs";
import { runGates } from "./gates.mjs";

export function main(argv, repoRoot) {
  const [cmd, version, phase, ...extra] = argv;
  if (extra.length) throw new ReleaseError("CR-ARGS");
  const recipe = loadRecipe(repoRoot, version);
  if (cmd === "reproduce" && phase === undefined) return reproduceFrozen({ repoRoot, recipe });
  if (cmd === "build" && (phase === "intermediate" || phase === "final")) {
    return buildRelease({ repoRoot, recipe, phase, evidencePath: phase === "final" ? join(".oplyra", "release", version, "evidence.json") : null });
  }
  if (cmd === "gates" && phase === undefined) return runGates({ repoRoot, recipe });
  throw new ReleaseError("CR-ARGS");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  try {
    process.stdout.write(`${JSON.stringify(main(process.argv.slice(2), root), null, 2)}\n`);
  } catch (e) {
    process.stderr.write(`Oplyra contract-release: ${e instanceof ReleaseError ? e.message : "falha inesperada"}\n`);
    process.exitCode = 2;
  }
}