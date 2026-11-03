#!/usr/bin/env node
// Ajuste administrativo do GitHub para a integração rotineira (política de 04/10/2026). Control plane.
//
// EXECUTADO PELO PROPRIETÁRIO, com a autenticação do `gh` dele (nenhum token passa por aqui, nem pela conversa). Nunca roda dentro de uma
// sessão de agente. Faz uma única coisa: tornar o ruleset `main-protection` compatível com a entrega rotineira SEM operação humana e SEM
// perder proteção, e permitir desfazer:
//   - CR-041 (03/11/2026): aprovações numéricas 1 → 0 e sem revisão de CODEOWNER; responsáveis e gates de risco permanecem;
//   - novos checks obrigatórios `risk-gate` (prova, por PR, que o classificador e o CODEOWNERS concordam) e `structural-gate` (controle,
//     escopo e documento da base confiável; 29/10/2026), ao lado de `validate`;
//   - squash como único método; demais regras (histórico linear, bloqueio de force push e exclusão, descarte de aprovação obsoleta, check estrito) preservadas;
//   - nenhum bypass é adicionado; bypass existente é apenas informado.
// Pré-condições verificadas ANTES de aplicar: o check `risk-gate` já passou em `main` (senão todo PR ficaria esperando um check inexistente) e o
// ruleset resultante é avaliado pelo mesmo `assessRuleset` que o runner usa.
//
// Uso: node scripts/claude-admin.mjs ruleset-plan | ruleset-apply | ruleset-rollback <arquivo-de-backup>

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { pathToFileURL } from "node:url";

import { REPOSITORY } from "./claude-delivery-record.mjs";
import { assessRuleset } from "./claude-gates.mjs";

export const RULESET_NAME = "main-protection";
export const APPLY_PHRASE = "APLICAR-RULESET";
export const ROLLBACK_PHRASE = "DESFAZER-RULESET";
export const WRITABLE_FIELDS = Object.freeze(["name", "target", "enforcement", "conditions", "rules", "bypass_actors"]);
const clone = (x) => JSON.parse(JSON.stringify(x));

/** Núcleo puro: ruleset atual → ruleset desejado (só os campos graváveis) e avaliação do resultado. Não muta a entrada. */
export function planRuleset(current) {
  if (!current || typeof current !== "object" || !Array.isArray(current.rules)) throw new Error("ruleset ilegível");
  const next = {};
  for (const k of WRITABLE_FIELDS) if (k in current) next[k] = clone(current[k]);
  if (next.enforcement !== "active") throw new Error("o ruleset não está ativo (enforcement != active): recuse mexer");
  const pr = next.rules.find((r) => r?.type === "pull_request");
  const checks = next.rules.find((r) => r?.type === "required_status_checks");
  if (!pr || !checks) throw new Error("ruleset sem pull_request ou required_status_checks");
  pr.parameters = { ...pr.parameters, required_approving_review_count: 0, require_code_owner_review: false, dismiss_stale_reviews_on_push: true, allowed_merge_methods: ["squash"] };
  const list = checks.parameters.required_status_checks ?? [];
  const validate = list.find((c) => c.context === "validate");
  if (!validate) throw new Error("o check obrigatório `validate` não consta do ruleset");
  // `structural-gate` (29/10/2026): o GitHub também exige o gate da base confiável; sem ele o runner não integra missão estrutural
  for (const context of ["risk-gate", "structural-gate"]) if (!list.some((c) => c.context === context)) list.push({ context, ...(validate.integration_id ? { integration_id: validate.integration_id } : {}) });
  checks.parameters = { ...checks.parameters, required_status_checks: list, strict_required_status_checks_policy: true };
  const effective = assessRuleset(next.rules.map((r) => ({ type: r.type, parameters: r.parameters })));
  return { next, assessment: effective, before: assessRuleset(current.rules.map((r) => ({ type: r.type, parameters: r.parameters }))), bypass: next.bypass_actors ?? [] };
}

/** `gh api` por `spawnSync` sem shell, argumentos fixos. `input` vai pela entrada padrão (nunca em argv). */
export function defaultGh() {
  return (args, input) => {
    const r = spawnSync("gh", args, { encoding: "utf8", shell: false, input, maxBuffer: 16 * 1024 * 1024, timeout: 60_000 });
    return { status: r.status ?? 1, stdout: String(r.stdout ?? ""), stderr: String(r.stderr ?? "") };
  };
}

const jsonOf = (r, what) => {
  if (r.status !== 0) throw new Error(`gh falhou em ${what}`);
  try {
    return JSON.parse(r.stdout);
  } catch {
    throw new Error(`resposta ilegível em ${what}`);
  }
};

function findRuleset(gh) {
  const list = jsonOf(gh(["api", `repos/${REPOSITORY}/rulesets`]), "listar rulesets");
  const found = list.filter((r) => r?.name === RULESET_NAME && r?.target === "branch");
  if (found.length !== 1) throw new Error(`esperado exatamente um ruleset ${RULESET_NAME}`);
  return jsonOf(gh(["api", `repos/${REPOSITORY}/rulesets/${found[0].id}`]), "ler o ruleset");
}

/** `risk-gate` e `structural-gate` precisam ter passado no HEAD atual de `main`: sem isso exigi-los travaria todo PR. */
export function riskGateOnMain(gh) {
  const main = jsonOf(gh(["api", `repos/${REPOSITORY}/commits/main`]), "ler main");
  const runs = jsonOf(gh(["api", `repos/${REPOSITORY}/commits/${main.sha}/check-runs?per_page=100`]), "ler checks de main");
  const passed = (name) => (runs.check_runs ?? []).some((c) => c.name === name && c.status === "completed" && c.conclusion === "success");
  const missing = ["risk-gate", "structural-gate"].filter((n) => !passed(n));
  return { sha: main.sha, ok: !missing.length, missing };
}

export async function run({
  argv = process.argv.slice(2), env = process.env, isTTY = Boolean(process.stdin.isTTY && process.stdout.isTTY), gh = defaultGh(),
  confirm = async (prompt) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise((resolve) => rl.question(prompt, resolve));
    rl.close();
    return answer;
  },
  write = (s) => process.stdout.write(s), now = new Date(), backupDir = path.join(os.homedir(), ".oplyra", "admin"), fsImpl = fs,
} = {}) {
  const refuse = (text) => {
    write(`Oplyra admin: ${text}\n`);
    return 2;
  };
  if (env.CLAUDECODE || env.CLAUDE_PROJECT_DIR || env.CLAUDE_CODE_ENTRYPOINT) return refuse("não roda dentro de uma sessão de agente");
  const [cmd, arg, ...extra] = argv;
  if (extra.length || !["ruleset-plan", "ruleset-apply", "ruleset-rollback"].includes(cmd ?? "") || (cmd !== "ruleset-rollback" && arg !== undefined)) return refuse("uso: ruleset-plan | ruleset-apply | ruleset-rollback <backup>");
  try {
    if (cmd === "ruleset-rollback") {
      if (!isTTY) return refuse("exige terminal interativo");
      if (!arg || path.dirname(path.resolve(arg)) !== path.resolve(backupDir) || !/^ruleset-\d+-\d{8}T\d{6}Z\.json$/.test(path.basename(arg))) return refuse("o backup precisa estar em ~/.oplyra/admin");
      const saved = JSON.parse(fsImpl.readFileSync(arg, "utf8"));
      const body = {};
      for (const k of WRITABLE_FIELDS) if (k in saved.ruleset) body[k] = saved.ruleset[k];
      write(`Restaurar o ruleset ${saved.id} ao conteúdo salvo em ${saved.savedAt}.\n`);
      if ((await confirm(`Digite ${ROLLBACK_PHRASE} para restaurar: `)) !== ROLLBACK_PHRASE) return refuse("confirmação não recebida");
      const put = gh(["api", "-X", "PUT", `repos/${REPOSITORY}/rulesets/${saved.id}`, "--input", "-"], JSON.stringify(body));
      if (put.status !== 0) return refuse("gh falhou ao restaurar");
      write("Ruleset restaurado.\n");
      return 0;
    }
    const current = findRuleset(gh);
    const plan = planRuleset(current);
    write(`Ruleset ${current.id} (${current.name}) — hoje: modo=${plan.before.mode}, aprovações=${plan.before.approvals}${plan.before.problems.length ? `, pendências=${plan.before.problems.join(",")}` : ""}\n`);
    write(`Depois: modo=${plan.assessment.mode}, aprovações=${plan.assessment.approvals}, revisão do dono do código obrigatória=${plan.next.rules.find((r) => r.type === "pull_request").parameters.require_code_owner_review}, checks obrigatórios: validate + risk-gate + structural-gate (estritos), squash apenas.\n`);
    if (plan.bypass.length) write(`ATENÇÃO: o ruleset tem ${plan.bypass.length} bypass; este script NÃO o altera.\n`);
    if (plan.assessment.mode !== "routine-capable") return refuse(`o resultado planejado não é seguro (${plan.assessment.problems.join(",")}): nada será aplicado`);
    if (cmd === "ruleset-plan") {
      write("Somente leitura. Para aplicar: node scripts/claude-admin.mjs ruleset-apply\n");
      return 0;
    }
    if (!isTTY) return refuse("exige terminal interativo");
    const gate = riskGateOnMain(gh);
    if (!gate.ok) return refuse(`os checks ${gate.missing.join(", ")} ainda não passaram em main (${gate.sha.slice(0, 12)}): integre o PR do bootstrap e aguarde a CI de main antes`);
    write(`risk-gate e structural-gate passaram em main (${gate.sha.slice(0, 12)}). Um backup do ruleset atual será gravado em ${backupDir} antes de aplicar.\n`);
    write("Verificação após aplicar: releia o ruleset e confira PR obrigatório, squash, histórico linear, bloqueios de exclusão/force push e checks estritos. A política CR-041 dispensa revisão de outro usuário; caminhos elevados continuam sujeitos aos gates de risco e escopo do runner.\n");
    if ((await confirm(`Digite ${APPLY_PHRASE} para aplicar: `)) !== APPLY_PHRASE) return refuse("confirmação não recebida");
    fsImpl.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    fsImpl.chmodSync(backupDir, 0o700);
    const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    const backup = path.join(backupDir, `ruleset-${current.id}-${stamp}.json`);
    fsImpl.writeFileSync(backup, `${JSON.stringify({ id: current.id, savedAt: now.toISOString(), ruleset: current }, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    const put = gh(["api", "-X", "PUT", `repos/${REPOSITORY}/rulesets/${current.id}`, "--input", "-"], JSON.stringify(plan.next));
    if (put.status !== 0) return refuse(`gh falhou ao aplicar (o backup está em ${backup})`);
    write(`Aplicado. Backup: ${backup}\nDesfazer: node scripts/claude-admin.mjs ruleset-rollback ${backup}\n`);
    return 0;
  } catch (e) {
    return refuse(e instanceof Error ? e.message : "falha inesperada");
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = await run();
}
