// Gates de integração (política de 04/10/2026). Control plane. Funções PURAS: nenhuma rede, nenhum Git, nenhum relógio implícito.
//
// Entrada: uma OBSERVAÇÃO do estado real do GitHub (PR, check-runs do head SHA, arquivos, revisões, ruleset) e o contexto da missão
// (registro, evidência já guardada, tentativas). Saída: UMA decisão determinística. O runner executa a decisão e observa de novo;
// nunca confia em relato do agente, em checks de outro SHA nem em evidência anterior a uma mudança de SHA ou a uma falha.

import { pathAllowedByRecord, REPOSITORY } from "./claude-delivery-record.mjs";
import { RISK, classifyChange } from "./claude-risk.mjs";

/** Checks que precisam estar `success` NO head SHA atual. `validate` é a verificação integral; `risk-gate` prova a cobertura do CODEOWNERS. */
export const REQUIRED_CHECKS = Object.freeze(["validate", "risk-gate"]);
export const HOLD_LABEL = "hold";
export const MAX_FILES = 300;
export const MAX_BRANCH_UPDATES = 2;
const OK_CONCLUSIONS = new Set(["success"]);
const NEUTRAL = new Set(["neutral", "skipped"]);
const PENDING_MERGEABLE = new Set(["unknown", "unstable"]);

/* ------------------------------------------------------------------------ ruleset */

/**
 * Avalia o ruleset efetivo de `main` (resposta de `GET /rules/branches/main`). Modos:
 *  - `routine-capable`: aprovação obrigatória = 0 SOMENTE porque a revisão do dono do código é obrigatória (CODEOWNERS) e `risk-gate` é check
 *    obrigatório; assim mudança rotineira integra sem clique e mudança elevada continua exigindo o proprietário;
 *  - `review-required`: ainda exige ≥ 1 aprovação humana (estado atual): o runner não consegue integrar rotina e para com bloqueio específico;
 *  - `unsafe`: faltam proteções (histórico linear, bloqueio de force push/exclusão, checks estritos, squash) ou a combinação 0 aprovações
 *    sem revisão de dono do código — NUNCA integrar.
 */
export function assessRuleset(rules) {
  const problems = [];
  if (!Array.isArray(rules)) return { mode: "unsafe", problems: ["regras-ilegiveis"], approvals: null };
  const types = new Set(rules.map((r) => r?.type));
  for (const t of ["pull_request", "required_status_checks", "non_fast_forward", "deletion", "required_linear_history"]) if (!types.has(t)) problems.push(`falta-${t}`);
  const prRules = rules.filter((r) => r?.type === "pull_request");
  const counts = prRules.map((r) => r?.parameters?.required_approving_review_count);
  if (!prRules.length || counts.some((n) => !Number.isSafeInteger(n) || n < 0)) problems.push("approving-count");
  if (prRules.some((r) => r?.parameters?.dismiss_stale_reviews_on_push !== true)) problems.push("dismiss_stale_reviews_on_push");
  // só squash: a política exige histórico linear com um commit por entrega
  if (prRules.some((r) => !Array.isArray(r?.parameters?.allowed_merge_methods) || r.parameters.allowed_merge_methods.length !== 1 || r.parameters.allowed_merge_methods[0] !== "squash")) problems.push("allowed_merge_methods");
  const listing = rules.filter((r) => r?.type === "required_status_checks");
  const contexts = (r) => (Array.isArray(r?.parameters?.required_status_checks) ? r.parameters.required_status_checks.map((c) => c?.context) : []);
  if (!listing.some((r) => contexts(r).includes("validate"))) problems.push("falta-validate");
  if (listing.some((r) => contexts(r).includes("validate") && r.parameters.strict_required_status_checks_policy !== true)) problems.push("strict_required_status_checks_policy");
  const approvals = counts.length && counts.every(Number.isSafeInteger) ? Math.max(...counts) : null;
  if (problems.length) return { mode: "unsafe", problems, approvals };
  if (approvals >= 1) return { mode: "review-required", problems: [], approvals };
  // 0 aprovações só é seguro com revisão do dono do código obrigatória e com o risk-gate exigido em TODA regra que lista validate
  const ownerReview = prRules.every((r) => r?.parameters?.require_code_owner_review === true);
  if (!ownerReview) problems.push("require_code_owner_review");
  if (!listing.filter((r) => contexts(r).includes("validate")).every((r) => contexts(r).includes("risk-gate"))) problems.push("falta-risk-gate");
  return { mode: problems.length ? "unsafe" : "routine-capable", problems, approvals };
}

/* ----------------------------------------------------------------------- evidência */

/**
 * Atualiza a evidência de CI de uma missão a partir da observação. A evidência vale SOMENTE para o `headSha` em que foi colhida:
 *  - SHA diferente do guardado → invalidada (`sha-changed`);
 *  - qualquer check obrigatório ou outro check concluído com falha no SHA atual → invalidada (`check-failed`) e a falha é contada por check e SHA;
 *  - todos os obrigatórios `success`, nenhum pendente nem falho → nova evidência para este SHA.
 * Devolve `{ evidence, invalidated, failures }`, sem mutar a entrada.
 */
export function updateEvidence({ evidence, failures = {}, headSha, checks }) {
  const next = { evidence: evidence ?? null, invalidated: null, failures: { ...failures } };
  if (next.evidence && next.evidence.sha !== headSha) {
    next.invalidated = { reason: "sha-changed", was: next.evidence.sha };
    next.evidence = null;
  }
  const own = (checks ?? []).filter((c) => c && typeof c.name === "string");
  const failed = own.filter((c) => c.status === "completed" && !OK_CONCLUSIONS.has(c.conclusion) && !NEUTRAL.has(c.conclusion));
  for (const c of failed) {
    const shas = new Set(next.failures[c.name] ?? []);
    shas.add(headSha);
    next.failures[c.name] = [...shas];
  }
  if (failed.length) {
    if (next.evidence) next.invalidated = { reason: "check-failed", was: next.evidence.sha };
    next.evidence = null;
    return next;
  }
  const byName = new Map(own.map((c) => [c.name, c]));
  const allGreen = REQUIRED_CHECKS.every((n) => byName.get(n)?.status === "completed" && OK_CONCLUSIONS.has(byName.get(n)?.conclusion))
    && own.every((c) => c.status === "completed");
  if (allGreen && !next.evidence) next.evidence = { sha: headSha, checks: Object.fromEntries(REQUIRED_CHECKS.map((n) => [n, "success"])) };
  return next;
}

/* ------------------------------------------------------------------------ decisão */

const wait = (reason) => ({ action: "wait", reason });
const blocked = (code, detail) => ({ action: "blocked", code, detail });
const owner = (code, detail) => ({ action: "owner", code, detail });

function latestReviewStates(reviews) {
  const latest = new Map();
  for (const r of [...(reviews ?? [])].sort((a, b) => String(a.submitted_at ?? "").localeCompare(String(b.submitted_at ?? "")))) {
    if (r?.state === "COMMENTED" || r?.state === "PENDING") continue;
    latest.set(r?.user ?? "?", r?.state);
  }
  return latest;
}

/**
 * Decisão única para a missão. `obs`: `{ pr, checks, files, reviews, ruleset }`. `ctx`: `{ record, branch, evidence, failures, branchUpdates }`.
 * Ordem: estado terminal → identidade → ruleset → arquivos/risco/escopo → freios humanos → CI → mergeabilidade → ready → merge.
 */
export function decide(obs, ctx) {
  const { pr } = obs;
  if (!pr) return blocked("pr-missing");
  if (pr.merged === true) return { action: "integrated", mergeSha: pr.merge_commit_sha ?? null };
  if (pr.state !== "open") return blocked("pr-closed");
  if (pr.base?.ref !== "main" || pr.head?.ref !== ctx.branch || String(pr.head?.repo?.full_name).toLowerCase() !== REPOSITORY) return blocked("pr-identity");
  if (typeof pr.head?.sha !== "string" || !/^[0-9a-f]{40}$/.test(pr.head.sha)) return blocked("pr-head");
  if (!["routine-capable", "review-required"].includes(obs.ruleset?.mode)) return blocked(`ruleset-${obs.ruleset?.mode ?? "unknown"}`, (obs.ruleset?.problems ?? []).join(","));
  const files = obs.files;
  if (!Array.isArray(files) || !files.length) return blocked("files-empty");
  if (files.length > MAX_FILES) return owner("elevated", "mudança grande demais para integração automática");
  const verdict = classifyChange(files.map((f) => ({ path: f.path, status: f.status })));
  if (verdict.risk === RISK.elevated) return owner("elevated", verdict.elevated.slice(0, 5).map((e) => `${e.path}:${e.reason}`).join(","));
  const outside = files.filter((f) => !pathAllowedByRecord(f.path, ctx.record));
  if (outside.length) return blocked("scope", outside.slice(0, 5).map((f) => f.path).join(","));
  if ((pr.labels ?? []).includes(HOLD_LABEL)) return owner("hold", "rótulo hold");
  const states = latestReviewStates(obs.reviews);
  if ([...states.values()].includes("CHANGES_REQUESTED")) return owner("changes-requested");
  const checks = obs.checks ?? [];
  const ev = updateEvidence({ evidence: ctx.evidence, failures: ctx.failures, headSha: pr.head.sha, checks });
  const failing = checks.filter((c) => c.status === "completed" && !OK_CONCLUSIONS.has(c.conclusion) && !NEUTRAL.has(c.conclusion)).map((c) => c.name);
  if (failing.length) {
    const exhausted = failing.filter((n) => (ev.failures[n] ?? []).length > (ctx.record?.budgets?.fixAttempts ?? 3));
    if (exhausted.length) return { ...blocked("fix-budget", exhausted.join(",")), evidenceUpdate: ev };
    return { action: "fix", checks: failing, evidenceUpdate: ev };
  }
  if (REQUIRED_CHECKS.some((n) => !checks.some((c) => c.name === n)) || checks.some((c) => c.status !== "completed")) return { ...wait("ci-pending"), evidenceUpdate: ev };
  if (pr.draft === true && ev.evidence) return { action: "ready", evidenceUpdate: ev };
  if (obs.ruleset.mode === "review-required") {
    if (!Number.isSafeInteger(obs.ruleset.approvals) || obs.ruleset.approvals < 1) return blocked("ruleset-unsafe", "contagem de revisão inválida");
    const latest = new Map();
    for (const r of [...(obs.reviews ?? [])].sort((a, b) => String(a.submitted_at ?? "").localeCompare(String(b.submitted_at ?? "")))) if (!["COMMENTED", "PENDING"].includes(r.state)) latest.set(r.user, r);
    const approved = new Set([...latest.values()].filter((r) => r.state === "APPROVED" && r.commit_id === pr.head.sha && typeof r.user === "string" && r.user !== pr.author && !r.user.endsWith("[bot]")).map((r) => r.user));
    if (approved.size < obs.ruleset.approvals) return { ...owner("review-required", "aguardando as aprovações humanas exigidas no head atual"), evidenceUpdate: ev };
  }
  const state = pr.mergeable_state;
  if (state === "dirty") return { ...blocked("conflict"), evidenceUpdate: ev };
  if (state === "behind") {
    if ((ctx.branchUpdates ?? 0) >= MAX_BRANCH_UPDATES) return { ...blocked("update-budget"), evidenceUpdate: ev };
    return { action: "update-branch", evidenceUpdate: ev };
  }
  if (PENDING_MERGEABLE.has(state)) return { ...wait(`mergeable-${state}`), evidenceUpdate: ev };
  if (state === "blocked") return { ...blocked("protected-blocked", "o GitHub informa mergeable_state=blocked (proteção não satisfeita)"), evidenceUpdate: ev };
  if (!ev.evidence || ev.evidence.sha !== pr.head.sha) return { ...wait("evidence-missing"), evidenceUpdate: ev };
  if (pr.draft === true) return { action: "ready", evidenceUpdate: ev };
  if (state !== "clean" && state !== "has_hooks") return { ...blocked("mergeable-state", String(state)), evidenceUpdate: ev };
  return { action: "merge", sha: pr.head.sha, evidenceUpdate: ev };
}
