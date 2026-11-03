// @ts-nocheck — apoio dos testes de fronteira com mutações do control plane (INTEGRACAO-PR11-E-PERFIS §3, §4, §10).
//
// Uma MUTAÇÃO altera deliberadamente a implementação de um controle, nunca a entrada: copia `scripts/*.mjs` para um diretório
// temporário, aplica trocas textuais que precisam casar EXATAMENTE uma vez (senão a mutação falha alto, em vez de virar um no-op que
// "sobrevive") e importa os módulos mutantes de lá. Os arquivos reais do repositório nunca são alterados.
//
// Cada cenário declara PROPRIEDADES (funções com asserções) que recebem um importador de módulos. A implementação real precisa
// satisfazer todas; cada mutação precisa derrubar as propriedades que a detectam, e as que são declaradas preservadas (em geral o
// caso permitido) continuam passando: a mutação não é "detectada" por uma recusa genérica.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { expect } from "vitest";

export const RAIZ = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const SCRIPTS = path.join(RAIZ, "scripts");

export type Importar = (modulo: string) => Promise<any>;
export type Propriedades = Record<string, (importar: Importar) => unknown | Promise<unknown>>;
export type Mutacao = {
  nome: string;
  controle: string;
  arquivo: string;
  trocas: Array<{ de: string; para: string }>;
  /** Propriedades que PRECISAM falhar com a mutação. Vazio só com `redundancia` explicada. */
  detectadaPor: string[];
  /** Propriedades que precisam continuar passando (o caso permitido não vira recusa genérica). */
  preservadas?: string[];
  /** Defesa redundante que mantém a proteção quando esta mutação isolada sobrevive. */
  redundancia?: string;
};

export const importarReal: Importar = Object.assign((modulo) => import(pathToFileURL(path.join(SCRIPTS, modulo)).href), { scripts: SCRIPTS });
/** Diretório dos scripts (reais ou mutantes) por trás de um importador: para executar o CLI da mesma versão sob teste. */
export const scriptsDe = (importar: Importar): string => (importar as any).scripts;

/** Cria a cópia mutante em diretório temporário e devolve o importador dela. */
export function criarMutante(m: Mutacao): { dir: string; importar: Importar } {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "oplyra-mutante-")));
  const destino = path.join(dir, "scripts");
  fs.mkdirSync(destino);
  for (const f of fs.readdirSync(SCRIPTS)) if (f.endsWith(".mjs") && !f.endsWith(".test.mjs")) fs.copyFileSync(path.join(SCRIPTS, f), path.join(destino, f));
  const alvo = path.join(destino, m.arquivo);
  let texto = fs.readFileSync(alvo, "utf8");
  for (const t of m.trocas) {
    const n = texto.split(t.de).length - 1;
    if (n !== 1) throw new Error(`mutação "${m.nome}": trecho encontrado ${n} vez(es) em ${m.arquivo}`);
    texto = texto.replace(t.de, () => t.para);
  }
  if (texto === fs.readFileSync(alvo, "utf8")) throw new Error(`mutação "${m.nome}" não alterou ${m.arquivo}`);
  fs.writeFileSync(alvo, texto);
  return { dir, importar: Object.assign((modulo) => import(pathToFileURL(path.join(destino, modulo)).href), { scripts: destino }) };
}

/** Roda todas as propriedades; devolve, por nome, `null` (passou) ou a primeira linha da asserção que falhou. */
export async function avaliar(props: Propriedades, importar: Importar): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  for (const [nome, fn] of Object.entries(props)) {
    try {
      await fn(importar);
      out[nome] = null;
    } catch (e) {
      out[nome] = String(e?.message ?? e).split("\n")[0].slice(0, 240);
    }
  }
  return out;
}

/** Evidência legível (impressa pelo reporter): mutação → propriedades que falharam e a asserção. */
export const evidencia: string[] = [];

/** Asserção padrão de uma mutação: detectada pelas propriedades declaradas, preservando as declaradas. */
export async function verificarMutacao(cenario: string, props: Propriedades, m: Mutacao) {
  const { importar } = criarMutante(m);
  const r = await avaliar(props, importar);
  const falhas = Object.keys(r).filter((k) => r[k] !== null);
  for (const p of m.preservadas ?? []) expect(r[p], `${m.nome}: "${p}" deveria continuar passando`).toBeNull();
  if (m.detectadaPor.length) {
    for (const d of m.detectadaPor) expect(falhas, `${m.nome}: deveria ser detectada por "${d}"`).toContain(d);
  } else {
    expect(m.redundancia, `${m.nome}: mutação sobrevivente sem redundância explicada`).toBeTruthy();
  }
  const linhas = falhas.map((f) => `    ✗ ${f}: ${r[f]}`).join("\n") || "    (nenhuma propriedade falhou)";
  evidencia.push(`[${cenario}] ${m.nome}\n  controle alterado: ${m.controle} (${m.arquivo})\n${linhas}${m.redundancia ? `\n  redundância: ${m.redundancia}` : ""}`);
  return r;
}

/* ------------------------------------------------------------ fixtures de decisão */

export const REPO = "cabralgava/oplyra";
export const verdes = (sha: string, nomes = ["validate", "risk-gate", "structural-gate"]) =>
  nomes.map((name) => ({ name, status: "completed", conclusion: "success", head_sha: sha }));

/** Observação SIMULADA do GitHub (nenhuma chamada real): PR aberto, limpo, ruleset routine-capable. */
export function observacao({ branch, sha, files, checks, mergeable = "clean" }) {
  return {
    pr: { number: 7, node_id: "PR_sintetico", state: "open", merged: false, draft: false, title: "feat: sintetico", author: "oplyra-bot[bot]", labels: [], mergeable_state: mergeable, base: { ref: "main" }, head: { ref: branch, sha, repo: { full_name: REPO } } },
    checks, files, reviews: [], ruleset: { mode: "routine-capable", problems: [], approvals: 0, structuralGate: true },
  };
}
