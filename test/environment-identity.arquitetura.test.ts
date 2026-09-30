// CR-028 — a identidade de ambiente fica na infraestrutura e nos composition
// roots. O núcleo não conhece ambiente, Supabase, project ref, fingerprint de
// ambiente nem deployment; nenhum código aceita OPLYRA_ALLOW_REMOTE.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = new URL("..", import.meta.url).pathname;

function fontes(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === ".next") continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) fontes(caminho, saida);
    else if (/\.(tsx?|mjs|ya?ml)$/.test(nome) || nome === ".env.example") saida.push(caminho);
  }
  return saida;
}
const ler = (dir: string) => fontes(join(RAIZ, dir)).map((f) => ({ caminho: relative(RAIZ, f), texto: readFileSync(f, "utf8") }));

describe("identidade de ambiente — fronteiras (CR-028)", () => {
  it("packages/core não referencia ambiente, Supabase, project ref, fingerprint de ambiente ou deployment", () => {
    const proibido = /process\.env|OPLYRA_|supabase|projectRef|project_ref|SUPABASE_PROJECT_REF|TrustedDeployment|deploymentId|ofp1|OPLYRA_ENVIRONMENT_FINGERPRINT/i;
    expect(ler("packages/core/src").filter((a) => proibido.test(a.texto)).map((a) => a.caminho)).toEqual([]);
  });

  it("nenhum código, CI ou exemplo de ambiente define OPLYRA_ALLOW_REMOTE", () => {
    const arquivos = [...ler("apps"), ...ler("packages"), ...ler(".github"), { caminho: ".env.example", texto: readFileSync(join(RAIZ, ".env.example"), "utf8") }];
    const definem = arquivos.filter((a) => /^\s*OPLYRA_ALLOW_REMOTE\s*[:=]/m.test(a.texto)).map((a) => a.caminho);
    expect(definem).toEqual([]);
  });

  it("os composition roots de web e CLI de operações carregam a configuração validada", () => {
    const web = readFileSync(join(RAIZ, "apps/web/src/lib/deps.ts"), "utf8");
    const ops = readFileSync(join(RAIZ, "apps/ops-cli/src/main.ts"), "utf8");
    expect(web).toMatch(/carregarConfig\(process\.env, \{ evidencia: politicaSemProvedorAprovado \}\)/);
    expect(ops).toMatch(/carregarConfig\(process\.env, \{ databaseVar: "DATABASE_URL_OPS" \}\)/);
    expect(ops).not.toMatch(/process\.env\.DATABASE_URL_OPS/);
  });

  it("a infraestrutura não lê evidência de deployment do process.env", () => {
    const config = readFileSync(join(RAIZ, "packages/infra/src/config.ts"), "utf8");
    // O comentário pode citar OPLYRA_DEPLOYMENT_ID como exemplo do que NÃO é evidência; o código não o lê.
    expect(config).not.toMatch(/(bruto|process\.env)(\.|\[")[A-Z_]*(DEPLOY|PROVIDER|EVIDENCE)/);
  });
});
