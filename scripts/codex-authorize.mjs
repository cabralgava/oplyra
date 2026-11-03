#!/usr/bin/env node
// Emissão administrativa a partir de consentimento explícito do proprietário no chat.
// A referência é proveniência auditável, não prova criptográfica da identidade.
// O worker de implementação não tem escrita neste script nem no registro externo.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildStanding, defaultStandingDir, defaultKillFile, revokedFile, writeStanding } from "./claude-standing.mjs";

export const OWNER_CHAT_REFERENCE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{64}$/;
// Perfil inicial já apresentado ao proprietário. A CLI não aceita ampliar escopo ou tetos.
export const INITIAL_OWNER_CHAT_PROFILE = Object.freeze({
  paths: Object.freeze(["packages/core/test/"]), expiresInDays: 7,
  limits: Object.freeze({ maxMissions: 5, mergesPerRun: 5, maxAgentSessionsPerMission: 3, wallClockSeconds: 86_400 }),
  missionBudgets: Object.freeze({ wallClockSeconds: 3600, iterations: 3, logReads: 5 }),
});

/**
 * Perfil de PRODUTO (docs/harness/INTEGRACAO-PR11-E-PERFIS.md §2): caminhos concretos, aceitos pelos validadores reais. Apenas
 * DISPONÍVEL: a CLI acima continua emitindo só o perfil inicial; usar este perfil exige decisão do proprietário (D-E4) e emissão única.
 * Somente classe rotineira: escopos estruturais entram por `structuralScopes`, também por decisão do proprietário.
 */
export const PRODUCT_PROFILE = Object.freeze({
  paths: Object.freeze([
    "apps/web/src/app/", "apps/web/src/components/", "apps/web/src/lib/",
    "packages/core/src/domain/", "packages/core/src/application/",
    "packages/infra/src/", "packages/testing/src/",
    "packages/core/test/", "packages/infra/test/", "packages/testing/test/",
    "docs/progresso/",
  ]),
  expiresInDays: 30,
  limits: Object.freeze({ maxMissions: 20, mergesPerRun: 10, maxAgentSessionsPerMission: 5, wallClockSeconds: 172_800 }),
  missionBudgets: Object.freeze({ wallClockSeconds: 7200, iterations: 5, logReads: 10 }),
});

export function issueOwnerChatAuthorization({ reference, home = os.homedir(), now = new Date() }) {
  if (typeof reference !== "string" || !OWNER_CHAT_REFERENCE.test(reference)) throw new Error("consent-reference");
  const dir = defaultStandingDir(home);
  // Não substitui nem remove revogação, kill switch ou autorização existente.
  for (const file of [defaultKillFile(home), revokedFile(dir)]) if (fs.existsSync(file)) throw new Error("consent-stopped");
  for (const folder of [path.join(home, ".oplyra"), dir]) {
    if (!fs.existsSync(folder)) continue;
    const stat = fs.lstatSync(folder);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (process.getuid && stat.uid !== process.getuid()) || (stat.mode & 0o077)) throw new Error("consent-directory");
  }
  const standing = buildStanding({ ...INITIAL_OWNER_CHAT_PROFILE, confirmation: `owner-chat:${reference}` }, { now });
  const written = writeStanding(standing, { dir });
  return { ...written, expiresAt: standing.expiresAt };
}

export function run({ argv = process.argv.slice(2), home = os.homedir(), now = new Date(), write = (s) => process.stdout.write(s) } = {}) {
  try {
    if (argv.length !== 1 || !argv[0].startsWith("--owner-chat-ref=")) throw new Error("consent-arguments");
    const result = issueOwnerChatAuthorization({ reference: argv[0].slice("--owner-chat-ref=".length), home, now });
    write(`Autorização inicial registrada com origem owner-chat; escopo packages/core/test/; validade ${result.expiresAt}; até 5 missões, 5 merges, 3 sessões por missão, 1 hora por missão e 1 dia de execução.\n`);
    write("Sem confirmação em terminal. Revisão e CI do GitHub continuam obrigatórios. Serviço não iniciado.\n");
    return 0;
  } catch (e) {
    write(`Codex authorize: ${/^(consent-[a-z-]+|ST-[A-Z-]+)$/.test(e.code ?? e.message) ? e.code ?? e.message : "consent-failed"}\n`);
    return 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = run();
