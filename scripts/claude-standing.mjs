// Autorização contínua do desenvolvimento (política de 04/10/2026). Control plane.
//
// Um único registro aprovado pelo proprietário, FORA do repositório (`~/.oplyra/standing/authorization.json`, diretório 0700,
// arquivo 0600, dono atual), define escopo, classes de risco, limites e validade do desenvolvimento contínuo. Dele o runner DERIVA
// um registro de entrega por missão (mesmo esquema do CR-033, referência `ms-NNN`), de modo que o proprietário não renova nada
// por missão. O agente não cria nem amplia este registro: o diretório está fora do repositório (o guard o recusa) e o script que o
// cria exige terminal do proprietário e frase digitada. Defesa em profundidade, não sandbox (R-11).
//
// Revogação, por qualquer um dos meios (verificados a CADA passo do runner e a cada verbo do agente):
//   - arquivo `~/.oplyra/standing/REVOKED`; - kill switch existente `~/.oplyra/KILL-DELIVERY`; - validade vencida.
// Nunca imprime segredos nem o conteúdo bruto do registro.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  AUTHORIZED_BY, BASE_REF, CEILINGS, MAX_PATHS, OWNER_BUDGETS, OWNER_CEILINGS, REPOSITORY, SHA_PATTERN, RecordError, buildRecord, pathAllowedByRecord, sha256File, validatePaths, validateRecord,
} from "./claude-delivery-record.mjs";
import { RISK, classifyChange } from "./claude-risk.mjs";

export const STANDING_SCHEMA = "oplyra-standing-authorization/1";
export const STANDING_PHRASE = "AUTORIZAR-DESENVOLVIMENTO-CONTINUO";
export const REVOKE_PHRASE = "REVOGAR-DESENVOLVIMENTO-CONTINUO";
export const STANDING_MAX_DAYS = 30;
/** Tetos codificados da autorização contínua: o registro só pode reduzi-los. */
export const STANDING_CEILINGS = Object.freeze({ maxMissions: 50, wallClockSeconds: 7 * 86_400, maxAgentSessionsPerMission: 8, mergesPerRun: 50 });
export const STANDING_DEFAULTS = Object.freeze({ maxMissions: 10, wallClockSeconds: 86_400, maxAgentSessionsPerMission: 5, mergesPerRun: 10 });
export const MISSION_TYPES = Object.freeze(["feat", "fix", "docs", "test", "refactor", "chore"]);

export const STANDING_MESSAGES = Object.freeze({
  "ST-MISSING": "autorização contínua ausente",
  "ST-MODE": "autorização ou diretório com dono ou permissões inseguros (esperado: dono atual, 0600/0700, sem symlink)",
  "ST-INVALID": "autorização contínua inválida",
  "ST-EXPIRED": "autorização contínua expirada",
  "ST-REVOKED": "autorização contínua revogada",
  "ST-HASH": "o conteúdo da autorização mudou desde que o runner a fixou",
  "ST-SCOPE": "caminho da missão fora do escopo da autorização contínua",
  "ST-RISK": "a missão toca caminhos de risco elevado (exigem o proprietário e não são integrados automaticamente)",
  "ST-MISSION": "missão inválida",
  "ST-LIMITS": "limites ausentes ou acima dos tetos",
});

export class StandingError extends Error {
  constructor(code, detail) {
    super(code);
    this.code = code;
    this.detail = detail;
  }
}
const fail = (code, detail) => {
  throw new StandingError(code, detail);
};

export const defaultStandingDir = (home = os.homedir()) => path.join(home, ".oplyra", "standing");
export const standingFile = (dir) => path.join(dir, "authorization.json");
export const revokedFile = (dir) => path.join(dir, "REVOKED");
export const defaultKillFile = (home = os.homedir()) => path.join(home, ".oplyra", "KILL-DELIVERY");

const KEYS = ["schema", "repository", "baseRef", "scope", "limits", "missionBudgets", "issuedAt", "expiresAt", "authorizedBy", "confirmation"];

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const posInt = (n, max) => Number.isInteger(n) && n >= 1 && n <= max;

/** Valida e devolve o registro. Lança StandingError. */
export function validateStanding(s, { now = new Date() } = {}) {
  if (!isObj(s) || Object.keys(s).some((k) => !KEYS.includes(k)) || KEYS.some((k) => !(k in s))) fail("ST-INVALID");
  if (s.schema !== STANDING_SCHEMA || s.repository !== REPOSITORY || s.baseRef !== BASE_REF || s.authorizedBy !== AUTHORIZED_BY) fail("ST-INVALID");
  if (typeof s.confirmation !== "string" || !s.confirmation) fail("ST-INVALID");
  if (!isObj(s.scope) || Object.keys(s.scope).length !== 2 || !Array.isArray(s.scope.paths) || !Array.isArray(s.scope.riskClasses)) fail("ST-INVALID");
  if (s.scope.riskClasses.length !== 1 || s.scope.riskClasses[0] !== RISK.routine) fail("ST-INVALID");
  let normalized;
  try {
    normalized = validatePaths(s.scope.paths, undefined);
  } catch (e) {
    if (e instanceof RecordError) fail("ST-INVALID", e.code);
    throw e;
  }
  if (JSON.stringify(normalized) !== JSON.stringify(s.scope.paths) || normalized.length > MAX_PATHS) fail("ST-INVALID");
  // o escopo permanente nunca inclui caminhos de risco elevado: o runner só integra mudança rotineira
  if (classifyChange(normalized.map((p) => p.replace(/\/$/, ""))).elevated.length) fail("ST-RISK");
  const l = s.limits;
  if (!isObj(l) || Object.keys(l).length !== Object.keys(STANDING_CEILINGS).length) fail("ST-LIMITS");
  for (const [k, ceiling] of Object.entries(STANDING_CEILINGS)) if (!posInt(l[k], ceiling)) fail("ST-LIMITS", k);
  const b = s.missionBudgets;
  if (!isObj(b)) fail("ST-LIMITS");
  for (const [k, ceiling] of Object.entries({ ...CEILINGS, ...OWNER_CEILINGS })) if (!posInt(b[k], ceiling)) fail("ST-LIMITS", k);
  if (Object.keys(b).some((k) => !(k in CEILINGS) && !OWNER_BUDGETS.includes(k))) fail("ST-LIMITS");
  const issued = Date.parse(s.issuedAt);
  const expires = Date.parse(s.expiresAt);
  if (Number.isNaN(issued) || Number.isNaN(expires) || expires <= issued || expires - issued > STANDING_MAX_DAYS * 86_400_000) fail("ST-INVALID");
  if (issued > now.getTime() + 5 * 60_000) fail("ST-INVALID");
  if (expires <= now.getTime()) fail("ST-EXPIRED");
  return s;
}

/** Monta (sem gravar) o registro a partir da entrada do proprietário. Limites sem valor recebem os padrões mostrados na confirmação. */
export function buildStanding(input, { now = new Date() } = {}) {
  const days = input.expiresInDays ?? STANDING_MAX_DAYS;
  if (!Number.isInteger(days) || days < 1 || days > STANDING_MAX_DAYS) fail("ST-INVALID");
  const missionBudgets = { ...CEILINGS, ...(input.missionBudgets ?? {}) };
  for (const k of OWNER_BUDGETS) if (missionBudgets[k] === undefined) missionBudgets[k] = OWNER_ALL_DEFAULTS[k];
  const standing = {
    schema: STANDING_SCHEMA,
    repository: REPOSITORY,
    baseRef: BASE_REF,
    scope: { paths: validatePathsOrFail(input.paths), riskClasses: [RISK.routine] },
    limits: { ...STANDING_DEFAULTS, ...(input.limits ?? {}) },
    missionBudgets,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + days * 86_400_000).toISOString(),
    authorizedBy: AUTHORIZED_BY,
    confirmation: String(input.confirmation ?? ""),
  };
  return validateStanding(standing, { now });
}
const OWNER_ALL_DEFAULTS = Object.freeze({ wallClockSeconds: 14_400, iterations: 6, logReads: 10 });
function validatePathsOrFail(paths) {
  try {
    return validatePaths(paths, undefined);
  } catch (e) {
    if (e instanceof RecordError) fail("ST-INVALID", e.code);
    throw e;
  }
}

function ownedAndPrivate(stat, uid, isDir) {
  if (uid !== undefined && stat.uid !== uid) return false;
  if ((stat.mode & 0o077) !== 0) return false;
  return isDir ? stat.isDirectory() : stat.isFile() && !stat.isSymbolicLink();
}

/** Grava com `wx` (não sobrescreve), diretório 0700 e arquivo 0600. Para alterar o escopo, o proprietário revoga e cria outro. */
export function writeStanding(standing, { dir = defaultStandingDir(), fsImpl = fs } = {}) {
  fsImpl.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fsImpl.chmodSync(dir, 0o700);
  const file = standingFile(dir);
  const body = `${JSON.stringify(standing, null, 2)}\n`;
  try {
    fsImpl.writeFileSync(file, body, { flag: "wx", mode: 0o600 });
  } catch (e) {
    if (e && e.code === "EEXIST") fail("ST-INVALID", "já existe: revogue e arquive antes de criar outra");
    throw e;
  }
  fsImpl.chmodSync(file, 0o600);
  return { file, sha256: sha256File(Buffer.from(body, "utf8")) };
}

/** Revoga: cria o marcador `REVOKED` (0600). Idempotente. */
export function revokeStanding({ dir = defaultStandingDir(), fsImpl = fs, now = new Date() } = {}) {
  fsImpl.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fsImpl.writeFileSync(revokedFile(dir), `${now.toISOString()}\n`, { mode: 0o600 });
}

export function isRevoked({ dir = defaultStandingDir(), killFile = defaultKillFile(), fsImpl = fs } = {}) {
  if (fsImpl.existsSync(revokedFile(dir))) return "ST-REVOKED";
  if (fsImpl.existsSync(killFile)) return "kill-switch";
  return null;
}

/**
 * Carrega e reverifica TUDO a cada chamada: dono, modo, symlink, campos, validade, revogação e o hash fixado (`expectedSha256`, quando
 * informado). Um conteúdo alterado no meio da execução, mesmo válido, é recusado (ST-HASH): ampliar exige novo registro e novo runner.
 */
export function loadStanding({ dir = defaultStandingDir(), killFile = defaultKillFile(), now = new Date(), expectedSha256, uid = typeof process.getuid === "function" ? process.getuid() : undefined, fsImpl = fs } = {}) {
  const file = standingFile(dir);
  let dirStat;
  let fileStat;
  try {
    dirStat = fsImpl.lstatSync(dir);
    fileStat = fsImpl.lstatSync(file);
  } catch {
    fail("ST-MISSING");
  }
  if (dirStat.isSymbolicLink() || fileStat.isSymbolicLink() || !ownedAndPrivate(dirStat, uid, true) || !ownedAndPrivate(fileStat, uid, false)) fail("ST-MODE");
  const bytes = fsImpl.readFileSync(file);
  const sha256 = sha256File(bytes);
  if (expectedSha256 !== undefined && sha256 !== expectedSha256) fail("ST-HASH");
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("ST-INVALID");
  }
  const standing = validateStanding(parsed, { now });
  const revoked = isRevoked({ dir, killFile, fsImpl });
  if (revoked) fail("ST-REVOKED", revoked);
  return { standing, sha256, file };
}

/** Marcador de confirmação gravado nos registros derivados: liga o registro da missão ao hash da autorização que o originou. */
export const standingConfirmation = (standingSha256) => `standing:${standingSha256.slice(0, 16)}`;
export const STANDING_CONFIRMATION = /^standing:[0-9a-f]{16}$/;

function slugOf(title) {
  const words = String(title).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter(Boolean).slice(0, 3);
  return words.length ? words.join("-").slice(0, 40).replace(/-+$/, "") : "missao";
}

/** Valida uma missão do backlog (esquema fechado). */
export function validateMission(m) {
  const keys = ["id", "type", "title", "goal", "paths", "dependsOn", "acceptance"];
  if (!isObj(m) || Object.keys(m).some((k) => !keys.includes(k)) || keys.some((k) => !(k in m))) fail("ST-MISSION", "campos");
  if (typeof m.id !== "string" || !/^ms-[0-9]{3,4}$/.test(m.id)) fail("ST-MISSION", "id");
  if (!MISSION_TYPES.includes(m.type)) fail("ST-MISSION", "type");
  if (typeof m.title !== "string" || m.title.trim().length < 5 || m.title.length > 120 || /[\u0000-\u001f]/.test(m.title)) fail("ST-MISSION", "title");
  if (typeof m.goal !== "string" || m.goal.trim().length < 10 || m.goal.length > 2000) fail("ST-MISSION", "goal");
  if (!Array.isArray(m.paths) || !m.paths.length) fail("ST-MISSION", "paths");
  if (!Array.isArray(m.dependsOn) || m.dependsOn.some((d) => typeof d !== "string" || !/^ms-[0-9]{3,4}$/.test(d) || d === m.id)) fail("ST-MISSION", "dependsOn");
  if (!Array.isArray(m.acceptance) || !m.acceptance.length || m.acceptance.some((a) => typeof a !== "string" || !a.trim() || a.length > 400)) fail("ST-MISSION", "acceptance");
  return m;
}

/**
 * Deriva o registro de entrega (esquema CR-033) de UMA missão a partir da autorização contínua. Recusa a missão cujo caminho saia do
 * escopo (ST-SCOPE) ou seja de risco elevado (ST-RISK). A validade é a menor entre 1 dia e a da autorização. `confirmation` liga o
 * registro ao hash da autorização, e o wrapper só reconhece a habilitação contínua se esse vínculo e a autorização forem válidos.
 */
export function deriveMissionRecord({ standing, standingSha256, mission, baseSha, branchSuffix, now = new Date() }) {
  validateMission(mission);
  if (typeof baseSha !== "string" || !SHA_PATTERN.test(baseSha)) fail("ST-MISSION", "baseSha");
  let paths;
  try {
    paths = validatePaths(mission.paths, undefined);
  } catch (e) {
    if (e instanceof RecordError) fail("ST-SCOPE", e.code);
    throw e;
  }
  const scope = { paths: standing.scope.paths };
  for (const p of paths) {
    // um prefixo de diretório da missão tem de estar contido num item do escopo; um arquivo, coberto por ele
    const covered = scope.paths.some((allowed) => (allowed.endsWith("/") ? p.startsWith(allowed) : p === allowed));
    if (!covered) fail("ST-SCOPE", p);
  }
  if (classifyChange(paths.map((p) => p.replace(/\/$/, ""))).elevated.length) fail("ST-RISK");
  const branch = `agent/${mission.type}/${mission.id}-${branchSuffix ?? slugOf(mission.title)}`;
  const budgets = { ...standing.missionBudgets };
  const record = buildRecord({ ref: mission.id, branch, baseSha, paths, budgets, expiresInDays: 1, confirmation: standingConfirmation(standingSha256) }, { now });
  const cap = Date.parse(standing.expiresAt);
  if (Date.parse(record.expiresAt) > cap) {
    record.expiresAt = new Date(cap).toISOString();
    validateRecord(record, { now });
  }
  return record;
}

export { pathAllowedByRecord };
