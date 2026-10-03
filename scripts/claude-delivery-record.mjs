// Registro de autorização da entrega delegada (CR-033 §6.0). Control plane.
//
// A autoridade da entrega delegada é um registro JSON aprovado pelo proprietário, criado por
// `scripts/claude-authorize.mjs` e guardado FORA do repositório, em diretório só do proprietário.
// `--increment=<ref>` apenas seleciona qual registro a sessão carrega. O agente não cria nem amplia
// o registro: o diretório está fora do repositório (o guard já recusa ler/escrever ali) e o script
// criador não está na allowlist. Defesa em profundidade, não sandbox (R-11): o mesmo usuário do
// sistema operacional pode, em tese, alcançar o arquivo; a barreira independente do host é o servidor.
//
// Nunca imprime segredos nem o conteúdo bruto do registro.

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { isControlPlane, isProtectedReference, isSensitiveRel } from "./claude-local-first-guard.mjs";

export const RECORD_SCHEMA = "oplyra-delivery-authorization/1";
export const REPOSITORY = "cabralgava/oplyra";
export const BASE_REF = "main";
export const REF_PATTERN = /^(i[0-9]{2}|cr-[0-9]{3}|dp-[0-9a-z]+|ops-[0-9]+)$/;
export const SHA_PATTERN = /^[0-9a-f]{40}$/;
export const AUTHORIZED_BY = "project_owner";
export const MAX_EXPIRY_DAYS = 7;
export const MAX_PATHS = 200;
/** Tetos no código (CR-033 §6.4): o registro só pode reduzi-los. */
export const CEILINGS = Object.freeze({ commits: 20, pushes: 10, pullRequests: 1, fixAttempts: 3, ciWaitSeconds: 1200 });
/**
 * Limites de duração e de iterações (CR-033 N-6, decisão D-23 do proprietário em 02/10/2026).
 *  - Tetos codificados: `wallClockSeconds` 28800 (8 h) e `iterations` 10. Valores positivos até o teto são permitidos; acima, recusados.
 *  - Padrões que o script do proprietário APRESENTA e cuja confirmação exige: `wallClockSeconds` 14400 (4 h) e `iterations` 6.
 *    O registro NUNCA grava "padrão": grava sempre valores explícitos (o padrão só existe no script).
 * Definições (o wrapper só enxerga o que passa por ele):
 *  - `wallClockSeconds`: segundos entre a PRIMEIRA chamada de qualquer verbo com o registro carregado (gravada em `startedAt` no estado
 *    persistido) e agora. Inclui espera de CI e interrupções. Retomar a sessão ou reiniciar o launcher não zera; só um novo registro
 *    (nova `ref`) começa outro relógio.
 *  - `iterations`: número de CICLOS de entrega. Um ciclo começa no primeiro `git:stage` aceito depois de nenhum ciclo aberto e termina no
 *    `git:push` aceito; vários commits no mesmo ciclo contam uma vez, e cada correção após uma falha de CI é um ciclo novo.
 * Os limites de commits, pushes, PR, correções e espera de CI continuam valendo EM CONJUNTO com estes.
 */
export const OWNER_BUDGETS = Object.freeze(["wallClockSeconds", "iterations", "logReads"]);
/** `logReads` (D-22, 02/10/2026): leituras de log de CI por `gh:ci-log` por registro; padrão 10, teto 20, persistido entre retomadas. */
export const OWNER_CEILINGS = Object.freeze({ wallClockSeconds: 28800, iterations: 10, logReads: 20 });
export const OWNER_DEFAULTS = Object.freeze({ wallClockSeconds: 14400, iterations: 6, logReads: 10 });
export const DELIVERY_ENV = Object.freeze({ ref: "OPLYRA_DELIVERY_REF", file: "OPLYRA_DELIVERY_RECORD", sha256: "OPLYRA_DELIVERY_RECORD_SHA256" });

export const RECORD_MESSAGES = Object.freeze({
  "DR-REF": "referência do incremento inválida",
  "DR-MISSING": "registro de autorização ausente",
  "DR-LOCATION": "registro fora do diretório de autorizações do proprietário",
  "DR-MODE": "registro ou diretório com dono ou permissões inseguros (esperado: dono atual, sem acesso de grupo/outros)",
  "DR-HASH": "hash do registro diverge do informado pelo launcher",
  "DR-INVALID": "registro inválido",
  "DR-EXPIRED": "registro expirado",
  "DR-REPOSITORY": "registro não autoriza este repositório",
  "DR-REF-MISMATCH": "referência do registro diverge da selecionada",
  "DR-BRANCH": "nome de branch inválido para a referência",
  "DR-PATHS": "lista de caminhos inválida (curinga, raiz, control plane, segredo, sources, referência protegida ou ferramenta de release)",
  "DR-CONTRACTS": "vínculo de contratos inválido: contractsCr e contractsScope devem vir juntos e explícitos; só arquivos novos ou o documento do próprio CR; nunca release congelada, registry, schema, fixture, migration nem outro CR",
  "DR-BUDGETS": "orçamentos ausentes, acima dos tetos ou sem os limites de duração e iterações definidos pelo proprietário",
  "DR-EXISTS": "já existe um registro para esta referência: crie um novo com outra referência ou remova o antigo manualmente",
  "DR-GRANT": "concessão de ensaio ausente ou inválida (o detalhe indica o motivo)",
});

export class RecordError extends Error {
  constructor(code, detail) {
    super(code);
    this.code = code;
    this.detail = detail;
  }
}
const fail = (code, detail) => {
  throw new RecordError(code, detail);
};

/** Diretório dos registros: fora do repositório, dono apenas. */
export function defaultRecordDir(home = os.homedir()) {
  return path.join(home, ".oplyra", "delivery");
}

export function branchPattern(ref) {
  return new RegExp(`^agent/(feat|fix|docs|test|refactor|chore|ci|revert)/${ref}(-[a-z0-9]+){1,6}$`);
}

export function sha256File(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export const hasContractsSegment = (rel) => rel.toLowerCase().split("/").includes("contracts");
/** Releases congeladas e a infraestrutura que as verifica: nunca reescritas por uma entrega delegada. */
const FROZEN_RELEASE_NAMES = [/contract-registry-manifest-v\d/, /cross-registry-validation/, /contract-registry-release-[^/]*\.contract\.test\./, /contract-registry-freeze/];
const IMMUTABLE_CONTRACT_DIRS = /(^|\/)(registries|schemas|fixtures|migrations)\//;
/**
 * Por que um caminho sob `contracts` NÃO pode ser entregue para o CR `contractsCr`; `null` se pode. Um `contractsCr` bem formado
 * autoriza apenas o documento do PRÓPRIO CR (`changes/<cr>-*.md`) e arquivos explicitamente listados que não sejam release congelada,
 * registry, schema, fixture, migration nem documento de outro CR.
 */
export function contractsPathProblem(relLower, contractsCr) {
  if (FROZEN_RELEASE_NAMES.some((re) => re.test(relLower))) return "release-congelada";
  if (IMMUTABLE_CONTRACT_DIRS.test(relLower)) return "registry-schema-fixture-migration";
  const inChanges = /(^|\/)changes\/([^/]+)$/.exec(relLower);
  if (inChanges) {
    const id = /^(cr-[0-9]{3})[-.]/.exec(inChanges[2]);
    if (!id || id[1] !== contractsCr) return "outro-cr";
  }
  return null;
}

/** `contractsCr` e `contractsScope` vêm juntos; o escopo é uma lista de ARQUIVOS explícitos, todos presentes em `paths`, e cada um sem problema. */
export function validateContractsBinding(paths, contractsCr, contractsScope) {
  const touches = paths.filter((p) => hasContractsSegment(p));
  if (contractsCr === undefined && contractsScope === undefined) {
    if (touches.length) fail("DR-CONTRACTS");
    return undefined;
  }
  if (typeof contractsCr !== "string" || !/^cr-[0-9]{3}$/.test(contractsCr)) fail("DR-CONTRACTS");
  if (!Array.isArray(contractsScope) || !contractsScope.length || contractsScope.length > MAX_PATHS) fail("DR-CONTRACTS");
  const scope = [];
  for (const entry of contractsScope) {
    if (typeof entry !== "string" || !entry || entry.endsWith("/") || path.posix.normalize(entry) !== entry || !hasContractsSegment(entry)) fail("DR-CONTRACTS");
    if (contractsPathProblem(entry.toLowerCase(), contractsCr)) fail("DR-CONTRACTS");
    if (!paths.includes(entry)) fail("DR-CONTRACTS");
    scope.push(entry);
  }
  if (new Set(scope).size !== scope.length) fail("DR-CONTRACTS");
  // todo caminho de `paths` sob contracts precisa estar no escopo explícito, e vice-versa (já garantido acima)
  if (touches.some((p) => !scope.includes(p))) fail("DR-CONTRACTS");
  return scope;
}

/** Valida e normaliza a lista de caminhos permitidos. Retorna os caminhos normalizados. */
export function validatePaths(paths, contractsCr) {
  if (!Array.isArray(paths) || !paths.length || paths.length > MAX_PATHS) fail("DR-PATHS");
  const out = [];
  for (const raw of paths) {
    if (typeof raw !== "string" || !raw || raw.includes("\0") || raw.includes("\\") || /[*?[\]{}~]/.test(raw)) fail("DR-PATHS");
    if (raw.startsWith("/") || raw.startsWith("-")) fail("DR-PATHS");
    const dir = raw.endsWith("/");
    const norm = path.posix.normalize(raw);
    const bare = dir ? norm.replace(/\/$/, "") : norm;
    if (!bare || bare === "." || bare.startsWith("../") || bare === ".." || bare.split("/").includes("..")) fail("DR-PATHS");
    const rel = bare.toLowerCase();
    // sem raiz: um prefixo de diretório precisa ter pelo menos dois níveis (nunca `apps/`, `docs/`, `scripts/`…)
    if (dir && !bare.includes("/")) fail("DR-PATHS");
    if (rel === ".git" || rel.startsWith(".git/") || rel === ".oplyra" || rel.startsWith(".oplyra/")) fail("DR-PATHS");
    if (isControlPlane(rel) || isControlPlane(`${rel}/`) || isSensitiveRel(rel) || isProtectedReference(rel)) fail("DR-PATHS");
    // `docs/harness` contém arquivos de control plane
    if (dir && (rel === "docs/harness" || rel === "tools")) fail("DR-PATHS");
    // a ferramenta de release e as receitas/evidências das releases congeladas não são alteradas por entrega delegada
    if (rel === "tools/contract-release" || rel.startsWith("tools/contract-release/")) fail("DR-PATHS");
    // sob `contracts` só arquivos explícitos (nunca diretório) e só com o vínculo de contratos do registro (validateContractsBinding)
    if (hasContractsSegment(rel) && (dir || !contractsCr)) fail("DR-CONTRACTS");
    out.push(dir ? `${bare}/` : bare);
  }
  return [...new Set(out)];
}

/** Valida um objeto de registro. Lança RecordError. `now`: Date. */
export function validateRecord(record, { now = new Date(), expectedRef } = {}) {
  if (!record || typeof record !== "object" || Array.isArray(record)) fail("DR-INVALID");
  const allowed = new Set(["schema", "ref", "repository", "baseRef", "baseSha", "branch", "paths", "contractsCr", "contractsScope", "budgets", "issuedAt", "expiresAt", "authorizedBy", "confirmation"]);
  if (Object.keys(record).some((k) => !allowed.has(k))) fail("DR-INVALID");
  if (record.schema !== RECORD_SCHEMA) fail("DR-INVALID");
  if (typeof record.ref !== "string" || !REF_PATTERN.test(record.ref)) fail("DR-REF");
  if (expectedRef !== undefined && record.ref !== expectedRef) fail("DR-REF-MISMATCH");
  if (record.repository !== REPOSITORY) fail("DR-REPOSITORY");
  if (record.baseRef !== BASE_REF || typeof record.baseSha !== "string" || !SHA_PATTERN.test(record.baseSha)) fail("DR-INVALID");
  if (typeof record.branch !== "string" || !branchPattern(record.ref).test(record.branch)) fail("DR-BRANCH");
  const normalized = validatePaths(record.paths, record.contractsCr);
  if (JSON.stringify(normalized) !== JSON.stringify(record.paths)) fail("DR-PATHS");
  validateContractsBinding(normalized, record.contractsCr, record.contractsScope);
  const budgets = record.budgets;
  if (!budgets || typeof budgets !== "object" || Array.isArray(budgets)) fail("DR-BUDGETS");
  for (const [key, ceiling] of Object.entries(CEILINGS)) {
    const value = budgets[key];
    if (!Number.isInteger(value) || value < 1 || value > ceiling) fail("DR-BUDGETS");
  }
  // duração e iterações: sempre explícitos no registro (o padrão vive só no script do proprietário) e nunca acima do teto codificado
  for (const key of OWNER_BUDGETS) {
    const value = budgets[key];
    if (!Number.isInteger(value) || value < 1) fail("DR-BUDGETS");
    if (value > OWNER_CEILINGS[key]) fail("DR-BUDGETS");
  }
  if (Object.keys(budgets).some((k) => !(k in CEILINGS) && !OWNER_BUDGETS.includes(k))) fail("DR-BUDGETS");
  const issued = Date.parse(record.issuedAt);
  const expires = Date.parse(record.expiresAt);
  if (Number.isNaN(issued) || Number.isNaN(expires) || expires <= issued || expires - issued > MAX_EXPIRY_DAYS * 86_400_000) fail("DR-INVALID");
  if (issued > now.getTime() + 5 * 60_000) fail("DR-INVALID");
  if (expires <= now.getTime()) fail("DR-EXPIRED");
  if (record.authorizedBy !== AUTHORIZED_BY || typeof record.confirmation !== "string" || !record.confirmation) fail("DR-INVALID");
  return record;
}

/** Cria o objeto do registro a partir da entrada do proprietário (sem gravar). */
export function buildRecord(input, { now = new Date() } = {}) {
  const ref = String(input.ref ?? "");
  if (!REF_PATTERN.test(ref)) fail("DR-REF");
  const budgets = { ...CEILINGS, ...(input.budgets ?? {}) };
  const days = input.expiresInDays ?? MAX_EXPIRY_DAYS;
  if (!Number.isInteger(days) || days < 1 || days > MAX_EXPIRY_DAYS) fail("DR-INVALID");
  const record = {
    schema: RECORD_SCHEMA,
    ref,
    repository: REPOSITORY,
    baseRef: BASE_REF,
    baseSha: String(input.baseSha ?? "").toLowerCase(),
    branch: String(input.branch ?? ""),
    paths: validatePaths(input.paths, input.contractsCr),
    ...(input.contractsCr ? { contractsCr: String(input.contractsCr) } : {}),
    ...(input.contractsScope ? { contractsScope: input.contractsScope.map(String) } : {}),
    budgets,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + days * 86_400_000).toISOString(),
    authorizedBy: AUTHORIZED_BY,
    confirmation: String(input.confirmation ?? ""),
  };
  return validateRecord(record, { now });
}

function ownedAndPrivate(stat, uid, isDir) {
  if (uid !== undefined && stat.uid !== uid) return false;
  if ((stat.mode & 0o077) !== 0) return false;
  return isDir ? stat.isDirectory() : stat.isFile() && !stat.isSymbolicLink();
}

/**
 * Carrega e verifica o registro selecionado. Cada chamada re-verifica tudo: localização, dono, modo,
 * hash e validade. `expectedSha256` vem do launcher (fixado no início da sessão); uma mudança
 * posterior do arquivo, mesmo válida, é recusada (DR-HASH).
 */
export function loadRecord({ ref, file, expectedSha256, recordDir, now = new Date(), uid = typeof process.getuid === "function" ? process.getuid() : undefined, fsImpl = fs }) {
  if (typeof ref !== "string" || !REF_PATTERN.test(ref)) fail("DR-REF");
  if (typeof file !== "string" || !file) fail("DR-MISSING");
  if (typeof expectedSha256 !== "string" || !/^[0-9a-f]{64}$/.test(expectedSha256)) fail("DR-HASH");
  const dir = recordDir ?? defaultRecordDir();
  const wanted = path.join(dir, `${ref}.json`);
  if (path.resolve(file) !== path.resolve(wanted)) fail("DR-LOCATION");
  let dirStat;
  let fileStat;
  try {
    dirStat = fsImpl.lstatSync(dir);
    fileStat = fsImpl.lstatSync(wanted);
  } catch {
    fail("DR-MISSING");
  }
  if (dirStat.isSymbolicLink() || fileStat.isSymbolicLink()) fail("DR-MODE");
  if (!ownedAndPrivate(dirStat, uid, true) || !ownedAndPrivate(fileStat, uid, false)) fail("DR-MODE");
  const bytes = fsImpl.readFileSync(wanted);
  const actual = sha256File(bytes);
  if (actual !== expectedSha256) fail("DR-HASH");
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("DR-INVALID");
  }
  return { record: validateRecord(parsed, { now, expectedRef: ref }), sha256: actual, file: wanted };
}

/** Uso do launcher: seleciona o registro de `ref`, fixa seu hash e valida tudo (dono, modo, validade). */
export function selectRecord({ ref, recordDir, now, uid, fsImpl = fs }) {
  if (typeof ref !== "string" || !REF_PATTERN.test(ref)) fail("DR-REF");
  const dir = recordDir ?? defaultRecordDir();
  const file = path.join(dir, `${ref}.json`);
  let bytes;
  try {
    bytes = fsImpl.readFileSync(file);
  } catch {
    fail("DR-MISSING");
  }
  return loadRecord({ ref, file, expectedSha256: sha256File(bytes), recordDir: dir, now, uid, fsImpl });
}

/** Grava o registro com `wx` (não sobrescreve), dir 0700 e arquivo 0600. Retorna o hash. */
export function writeRecord(record, { recordDir = defaultRecordDir(), fsImpl = fs } = {}) {
  fsImpl.mkdirSync(recordDir, { recursive: true, mode: 0o700 });
  fsImpl.chmodSync(recordDir, 0o700);
  const file = path.join(recordDir, `${record.ref}.json`);
  const body = `${JSON.stringify(record, null, 2)}\n`;
  try {
    fsImpl.writeFileSync(file, body, { flag: "wx", mode: 0o600 });
  } catch (e) {
    if (e && e.code === "EEXIST") fail("DR-EXISTS");
    throw e;
  }
  fsImpl.chmodSync(file, 0o600);
  return { file, sha256: sha256File(Buffer.from(body, "utf8")) };
}

/* ------------------------------------------------------------ concessão de ensaio (D-25) */

/**
 * Concessão TEMPORÁRIA de habilitação para o ensaio (D-25). Arquivo `<ref>.enable.json` ao lado do registro, fora do repositório (diretório
 * 0700, arquivo 0600, dono atual, sem symlink), criado só por `claude-authorize.mjs --enable-rehearsal=<ref>` com frase digitada. Vale
 * apenas para o registro cujo SHA-256 ela carrega, só para referências `ops-<n>`, por no máximo 24 h e nunca além da validade do registro.
 * Não substitui `delegatedDelivery: true` (habilitação definitiva, que continua exclusivamente a chave do repositório); revogar = apagar o arquivo.
 */
export const GRANT_SCHEMA = "oplyra-rehearsal-grant/1";
export const GRANT_PHRASE = "HABILITAR-ENSAIO";
export const GRANT_REF_PATTERN = /^ops-[0-9]+$/;
export const GRANT_MAX_MS = 24 * 3_600_000;
const GRANT_KEYS = ["schema", "ref", "recordSha256", "issuedAt", "expiresAt", "authorizedBy", "confirmation"];
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

/** Hostname EXATO e minúsculo: nenhum sufixo, curinga, IP, porta ou caminho. Compartilhado com `validateLogHosts` (claude-git). */
export function isExactLogHost(h) {
  const label = "[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?";
  return typeof h === "string" && h.length <= 253 && new RegExp(`^${label}(\\.${label})+$`).test(h) && !/^\d+(\.\d+){3}$/.test(h);
}

export function grantFile(recordDir, ref) {
  return path.join(recordDir, `${ref}.enable.json`);
}

function validateGrant(grant, { now, record, recordSha256 }) {
  if (!grant || typeof grant !== "object" || Array.isArray(grant)) fail("DR-GRANT", "formato");
  const keys = Object.keys(grant);
  if (keys.some((k) => !GRANT_KEYS.includes(k) && k !== "logHosts") || GRANT_KEYS.some((k) => !(k in grant))) fail("DR-GRANT", "campos");
  if (grant.schema !== GRANT_SCHEMA) fail("DR-GRANT", "esquema");
  if (typeof grant.ref !== "string" || !GRANT_REF_PATTERN.test(grant.ref)) fail("DR-GRANT", "ref fora de ops-*");
  if (grant.ref !== record.ref) fail("DR-GRANT", "ref diverge do registro");
  if (typeof grant.recordSha256 !== "string" || !SHA256_PATTERN.test(grant.recordSha256) || grant.recordSha256 !== recordSha256) fail("DR-GRANT", "hash do registro");
  if (grant.authorizedBy !== AUTHORIZED_BY || grant.confirmation !== GRANT_PHRASE) fail("DR-GRANT", "confirmação");
  const issued = Date.parse(grant.issuedAt);
  const expires = Date.parse(grant.expiresAt);
  if (Number.isNaN(issued) || Number.isNaN(expires) || expires <= issued || expires - issued > GRANT_MAX_MS) fail("DR-GRANT", "validade");
  if (issued > now.getTime() + 5 * 60_000) fail("DR-GRANT", "emitida no futuro");
  if (expires > Date.parse(record.expiresAt)) fail("DR-GRANT", "além da validade do registro");
  if (expires <= now.getTime()) fail("DR-GRANT", "expirada");
  if ("logHosts" in grant) {
    const hosts = grant.logHosts;
    if (!Array.isArray(hosts) || hosts.length > 20 || new Set(hosts).size !== hosts.length || !hosts.every(isExactLogHost)) fail("DR-GRANT", "logHosts");
  }
  return grant;
}

/**
 * Cria o objeto da concessão para um registro já carregado (sem gravar). `window` ({ issuedAt, expiresAt }) preserva a janela de uma
 * concessão anterior ao regravá-la (ex.: acrescentar `logHosts`): a validade original NÃO é renovada, e a janela passa pelas mesmas
 * verificações (≤ 24 h, ≤ registro, não expirada). A concessão nunca carrega caminhos nem orçamentos: o escopo é sempre o do registro.
 */
export function buildGrant({ record, recordSha256, logHosts, confirmation, window }, { now = new Date() } = {}) {
  const expires = window ? Date.parse(window.expiresAt) : Math.min(now.getTime() + GRANT_MAX_MS, Date.parse(record.expiresAt));
  const grant = {
    schema: GRANT_SCHEMA,
    ref: record.ref,
    recordSha256,
    issuedAt: window ? window.issuedAt : now.toISOString(),
    expiresAt: window ? window.expiresAt : new Date(expires).toISOString(),
    ...(logHosts === undefined ? {} : { logHosts }),
    authorizedBy: AUTHORIZED_BY,
    confirmation: String(confirmation ?? ""),
  };
  return validateGrant(grant, { now, record, recordSha256 });
}

/** Grava a concessão de forma atômica (0600, diretório 0700). Substitui a anterior da mesma `ref` (ex.: para acrescentar `logHosts`). */
export function writeGrant(grant, { recordDir = defaultRecordDir(), fsImpl = fs } = {}) {
  fsImpl.mkdirSync(recordDir, { recursive: true, mode: 0o700 });
  fsImpl.chmodSync(recordDir, 0o700);
  const file = grantFile(recordDir, grant.ref);
  const body = `${JSON.stringify(grant, null, 2)}\n`;
  const tmp = `${file}.tmp`;
  fsImpl.writeFileSync(tmp, body, { mode: 0o600 });
  fsImpl.chmodSync(tmp, 0o600);
  fsImpl.renameSync(tmp, file);
  return { file, sha256: sha256File(Buffer.from(body, "utf8")) };
}

/**
 * Carrega e verifica a concessão do registro `record` (já verificado, com `recordSha256` fixado pelo launcher). Cada chamada reverifica tudo:
 * local, dono, modo, symlink, campos fechados, vínculo com o hash do registro, `ref` ops-*, frase, validade (a fronteira exata já expirou).
 * Qualquer falha lança `RecordError("DR-GRANT", motivo)`.
 */
export function loadGrant({ record, recordSha256, recordDir, now = new Date(), uid = typeof process.getuid === "function" ? process.getuid() : undefined, fsImpl = fs }) {
  if (!record || typeof record.ref !== "string" || !GRANT_REF_PATTERN.test(record.ref)) fail("DR-GRANT", "ref fora de ops-*");
  const dir = recordDir ?? defaultRecordDir();
  const file = grantFile(dir, record.ref);
  let dirStat;
  let fileStat;
  try {
    dirStat = fsImpl.lstatSync(dir);
    fileStat = fsImpl.lstatSync(file);
  } catch {
    fail("DR-GRANT", "ausente");
  }
  if (dirStat.isSymbolicLink() || fileStat.isSymbolicLink() || !ownedAndPrivate(dirStat, uid, true) || !ownedAndPrivate(fileStat, uid, false)) fail("DR-GRANT", "dono, modo ou symlink");
  // modos EXATOS (mais estrito que o do registro): arquivo 0600 e diretório 0700; 0400, 0700 ou 0750 não servem
  if ((fileStat.mode & 0o777) !== 0o600 || (dirStat.mode & 0o777) !== 0o700) fail("DR-GRANT", "modo diferente de 0600/0700");
  const bytes = fsImpl.readFileSync(file);
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("DR-GRANT", "JSON inválido");
  }
  const grant = validateGrant(parsed, { now, record, recordSha256 });
  return { grant, sha256: sha256File(bytes), logHosts: grant.logHosts ?? [] };
}

/** `staged` está dentro da lista permitida do registro? `p`: caminho relativo normalizado, com `/`. */
export function pathAllowedByRecord(p, record) {
  return record.paths.some((allowed) => (allowed.endsWith("/") ? p.startsWith(allowed) : p === allowed));
}
