// Executado em processo filho com `--experimental-strip-types`: carrega o validador cruzado DO SNAPSHOT exportado
// (nunca o da árvore de trabalho) e imprime o resultado em JSON. Sem rede.
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(process.argv[2] ?? "");
const mod = await import(pathToFileURL(join(root, "test", "contracts", "cross-registry-validation.ts")).href);
process.stdout.write(JSON.stringify(mod.runCrossRegistryValidation(root)));
