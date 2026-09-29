// Fronteiras do Product AI Model Harness verificadas por teste.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = new URL("..", import.meta.url).pathname;

function fontes(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules") continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) fontes(caminho, saida);
    else if (/\.tsx?$/.test(nome)) saida.push(caminho);
  }
  return saida;
}
const ler = (dir: string) => fontes(join(RAIZ, dir)).map((f) => ({ caminho: relative(RAIZ, f), texto: readFileSync(f, "utf8") }));
const importes = (texto: string): string[] => [...texto.matchAll(/(?:from|import)\s+["']([^"']+)["']/g)].map((m) => m[1]!);

const harnessCore = ler("packages/core/src/ai-model-harness");
const core = ler("packages/core/src");
const harnessInfra = ler("packages/infra/src/ai-model-harness");
const apps = ler("apps");
const pacotes = [...core, ...ler("packages/infra/src"), ...ler("packages/testing/src"), ...apps];

// Laboratórios, gateways e famílias de modelo conhecidos. Não pertencem ao núcleo.
const FORNECEDOR = /openrouter|openai|anthropic|gemini|gemma|claude|gpt-|mistral|llama|deepseek|qwen/i;

describe("Product AI Model Harness — regra de dependência", () => {
  it("o núcleo do harness só importa arquivos do próprio núcleo", () => {
    const externos = harnessCore.flatMap((a) => importes(a.texto).filter((i) => !i.startsWith("./") && !i.startsWith("../")).map((i) => `${a.caminho} → ${i}`));
    expect(externos).toEqual([]);
  });

  it("domínio e casos de uso não citam fornecedor, gateway ou modelo concreto", () => {
    expect(core.filter((a) => FORNECEDOR.test(a.texto)).map((a) => a.caminho)).toEqual([]);
  });

  it("domínio e casos de uso não fixam temperatura nem outro parâmetro de amostragem", () => {
    const fixados = core.filter((a) => /\b(temperature|topP|top_p)\s*[:=]\s*\d/.test(a.texto)).map((a) => a.caminho);
    expect(fixados).toEqual([]);
  });

  it("nenhum código lê chave de gateway; o harness não lê ambiente", () => {
    expect(pacotes.filter((a) => /OPENROUTER|_API_KEY/.test(a.texto)).map((a) => a.caminho)).toEqual([]);
    expect([...harnessCore, ...harnessInfra].filter((a) => /process\.env/.test(a.texto)).map((a) => a.caminho)).toEqual([]);
  });

  it("os adapters do harness não fazem rede", () => {
    const rede = /\bfetch\s*\(|node:https?|node:net|node:dns|undici|axios|XMLHttpRequest|WebSocket/;
    expect(harnessInfra.filter((a) => rede.test(a.texto)).map((a) => a.caminho)).toEqual([]);
  });

  it("o núcleo não implementa nem importa criptografia; o HMAC fica na infraestrutura", () => {
    const cripto = /node:crypto|createHash|createHmac|0x428a2f98|0x6a09e667|sha256Hex/;
    expect(core.filter((a) => cripto.test(a.texto)).map((a) => a.caminho)).toEqual([]);
    const usamHmac = harnessInfra.filter((a) => /createHmac/.test(a.texto)).map((a) => a.caminho);
    expect(usamHmac).toEqual(["packages/infra/src/ai-model-harness/hmac-fingerprint.ts"]);
  });

  it("nenhum código produz fingerprint sem chave (`sha256:v1`) como formato persistido", () => {
    expect([...core, ...harnessInfra, ...ler("packages/testing/src")].filter((a) => /["'`]sha256:v1:/.test(a.texto)).map((a) => a.caminho)).toEqual([]);
  });

  it("nenhum adapter usa o callId interno cru como chave externa de idempotência", () => {
    const cru = /(idempot\w*|Idempotency-Key|external\w*Key)\s*[:=]\s*[^,;\n]*\bcall\.callId\b/i;
    expect(harnessInfra.filter((a) => cru.test(a.texto)).map((a) => a.caminho)).toEqual([]);
  });

  it("o barrel geral do infra não arrasta o harness para a aplicação web", () => {
    const barrel = readFileSync(join(RAIZ, "packages/infra/src/index.ts"), "utf8");
    expect(importes(barrel).filter((i) => i.includes("ai-model-harness"))).toEqual([]);
  });

  it("aplicações não chamam provider diretamente: só pelo caso de uso", () => {
    const diretos = apps.filter((a) => /\.invoke\(\s*\{[^}]*providerModelId/.test(a.texto) || /TestModelProviderAdapter/.test(a.texto)).map((a) => a.caminho);
    expect(diretos).toEqual([]);
  });
});
