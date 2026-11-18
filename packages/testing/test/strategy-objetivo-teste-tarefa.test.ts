// I-04 S2b — objetivo/KPI, teste por hipótese e tarefa (casos de uso com fakes).
import { describe, it, expect } from "vitest";
import { criarStrategyDeps, contextoDeEstrategia as contexto } from "../src/strategy.ts";
import {
  createCampaignDraft, activateCampaign, pauseCampaign, completeCampaign, cancelCampaign,
} from "../../core/src/application/use-cases/strategy.ts";
import {
  listObjectives, createObjective, saveObjective, setPrimaryObjective, archiveObjective,
} from "../../core/src/application/use-cases/strategy-objectives.ts";
import {
  listExperiments, planExperiment, startExperiment, concludeExperiment, cancelExperiment,
} from "../../core/src/application/use-cases/strategy-experiments.ts";
import { listTasks, createTask, saveTask, changeTaskStatus } from "../../core/src/application/use-cases/strategy-tasks.ts";
import {
  problemasDoObjetivo, problemasDaTarefa,
  type CampaignContent, type ExperimentPlan, type ObjectiveContent, type TaskContent,
} from "../../core/src/domain/strategy.ts";
import type { TenantId, TaskId } from "@oplyra/core";

const TA = "11111111-1111-4111-8111-111111111111" as TenantId;
const TB = "22222222-2222-4222-8222-222222222222" as TenantId;
const gestor = contexto({ tenantId: TA, roleKey: "marketing_manager" });
const leitor = contexto({ tenantId: TA, roleKey: "viewer" });
const gestorB = contexto({ tenantId: TB, roleKey: "marketing_manager" });

const kpi = (over = {}) => ({ key: "reunioes", name: "Reuniões", metric: "reuniões marcadas", unit: "reuniões", target: 20, ...over });
const objetivoBase = (over: Partial<ObjectiveContent> = {}): ObjectiveContent => ({
  name: "Gerar demanda no 4º trimestre", description: "", periodStart: "2026-10-01", periodEnd: "2026-12-31", kpis: [kpi()], ...over,
});
const campanha = (over: Partial<CampaignContent> = {}): CampaignContent => ({
  name: "Lançamento", objectiveId: null, productKey: null,
  method: { situation: "S", pain: "D", consequence: "C", desire: "E", mechanism: "M", proof: "P", offer: "O" },
  trackingKey: "lancamento", ...over,
});
const plano = (over: Partial<ExperimentPlan> = {}): ExperimentPlan => ({
  hypothesis: "Abrir pela dor aumenta reuniões.", dimension: "hook", dimensionNote: "",
  variants: ["Gancho pela dor", "Gancho pelo ganho"], decisionMetric: "reuniões marcadas", minimumSample: 30, ...over,
});
const tarefa = (over: Partial<TaskContent> = {}): TaskContent => ({
  title: "Revisar a oferta", description: "", campaignId: null, dueDate: null, assignee: null, dependsOn: [], ...over,
});
const codigos = (xs: readonly { code: string }[]) => xs.map((x) => x.code);

async function campanhaAtiva(deps: ReturnType<typeof criarStrategyDeps>, chave = "lancamento") {
  const c = await createCampaignDraft(deps, { ctx: gestor, content: campanha({ trackingKey: chave }) });
  return activateCampaign(deps, { ctx: gestor, campaignId: c.id, expectedRevision: c.revision });
}

describe("objetivo e indicadores (proposta local)", () => {
  it("objetivo completo é aceito; vazio lista o que falta", () => {
    expect(problemasDoObjetivo(objetivoBase())).toEqual([]);
    expect(codigos(problemasDoObjetivo(objetivoBase({ name: " ", kpis: [] })))).toEqual(expect.arrayContaining(["NAME_REQUIRED", "KPI_REQUIRED"]));
  });

  it("período: datas civis válidas e fim não anterior ao início", () => {
    expect(codigos(problemasDoObjetivo(objetivoBase({ periodStart: "2026-02-30" })))).toContain("PERIOD_INVALID");
    expect(codigos(problemasDoObjetivo(objetivoBase({ periodStart: "01/10/2026" })))).toContain("PERIOD_INVALID");
    expect(codigos(problemasDoObjetivo(objetivoBase({ periodStart: "2026-12-31", periodEnd: "2026-10-01" })))).toContain("PERIOD_INVALID");
    expect(problemasDoObjetivo(objetivoBase({ periodStart: "2026-12-31", periodEnd: "2026-12-31" }))).toEqual([]);
  });

  it("indicador: alvo positivo e finito, chave única, campos obrigatórios", () => {
    for (const target of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(codigos(problemasDoObjetivo(objetivoBase({ kpis: [kpi({ target })] })))).toContain("KPI_TARGET_INVALID");
    }
    expect(codigos(problemasDoObjetivo(objetivoBase({ kpis: [kpi(), kpi()] })))).toContain("KPI_KEY_DUPLICATE");
    expect(codigos(problemasDoObjetivo(objetivoBase({ kpis: [kpi({ key: "Reuniões!" })] })))).toContain("KPI_KEY_INVALID");
    expect(codigos(problemasDoObjetivo(objetivoBase({ kpis: [kpi({ name: "", metric: "", unit: "" })] }))))
      .toEqual(expect.arrayContaining(["KPI_NAME_REQUIRED", "KPI_METRIC_REQUIRED", "KPI_UNIT_REQUIRED"]));
  });

  it("cria, edita com concorrência otimista, define o principal único e arquiva", async () => {
    const deps = criarStrategyDeps();
    const a = await createObjective(deps, { ctx: gestor, content: objetivoBase() });
    const b = await createObjective(deps, { ctx: gestor, content: objetivoBase({ name: "Outro" }) });
    expect(a).toMatchObject({ status: "active", primary: false, revision: 1 });
    const salvo = await saveObjective(deps, { ctx: gestor, objectiveId: a.id, expectedRevision: 1, content: objetivoBase({ name: "Novo nome" }) });
    expect(salvo).toMatchObject({ name: "Novo nome", revision: 2 });
    await expect(saveObjective(deps, { ctx: gestor, objectiveId: a.id, expectedRevision: 1, content: objetivoBase() })).rejects.toMatchObject({ code: "CONFLICT_VERSION" });

    await setPrimaryObjective(deps, { ctx: gestor, objectiveId: a.id, expectedRevision: salvo.revision });
    await setPrimaryObjective(deps, { ctx: gestor, objectiveId: b.id, expectedRevision: 1 });
    const lista = await listObjectives(deps, gestor);
    expect(lista.filter((o) => o.primary).map((o) => o.id)).toEqual([b.id]);

    const arq = await archiveObjective(deps, { ctx: gestor, objectiveId: b.id, expectedRevision: lista.find((o) => o.id === b.id)!.revision });
    expect(arq).toMatchObject({ status: "archived", primary: false });
    await expect(setPrimaryObjective(deps, { ctx: gestor, objectiveId: b.id, expectedRevision: arq.revision })).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    await expect(saveObjective(deps, { ctx: gestor, objectiveId: b.id, expectedRevision: arq.revision, content: objetivoBase() })).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    expect(deps.estado.auditoria.map((x) => x.action)).toEqual(expect.arrayContaining(["objective.create", "objective.save", "objective.set_primary", "objective.archive"]));
  });

  it("permissões e isolamento", async () => {
    const deps = criarStrategyDeps();
    await expect(createObjective(deps, { ctx: leitor, content: objetivoBase() })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    const a = await createObjective(deps, { ctx: gestor, content: objetivoBase() });
    await expect(listObjectives(deps, leitor)).resolves.toHaveLength(1);
    await expect(listObjectives(deps, gestorB)).resolves.toEqual([]);
    await expect(saveObjective(deps, { ctx: gestorB, objectiveId: a.id, expectedRevision: 1, content: objetivoBase() })).rejects.toMatchObject({ code: "OBJECTIVE_NOT_FOUND" });
    await expect(setPrimaryObjective(deps, { ctx: gestorB, objectiveId: a.id, expectedRevision: 1 })).rejects.toMatchObject({ code: "OBJECTIVE_NOT_FOUND" });
    await expect(archiveObjective(deps, { ctx: gestorB, objectiveId: a.id, expectedRevision: 1 })).rejects.toMatchObject({ code: "OBJECTIVE_NOT_FOUND" });
    await expect(createObjective(deps, { ctx: gestor, content: objetivoBase({ kpis: [] }) })).rejects.toMatchObject({ code: "OBJECTIVE_INVALID" });
  });

  it("principal é por empresa: definir em B não afeta A", async () => {
    const deps = criarStrategyDeps();
    const a = await createObjective(deps, { ctx: gestor, content: objetivoBase() });
    const b = await createObjective(deps, { ctx: gestorB, content: objetivoBase() });
    await setPrimaryObjective(deps, { ctx: gestor, objectiveId: a.id, expectedRevision: 1 });
    await setPrimaryObjective(deps, { ctx: gestorB, objectiveId: b.id, expectedRevision: 1 });
    expect((await listObjectives(deps, gestor))[0]!.primary).toBe(true);
  });
});

describe("teste por hipótese (I-HYP)", () => {
  it("a hipótese é registrada antes: planeja sem rodar; só roda com a campanha ativa", async () => {
    const deps = criarStrategyDeps();
    const draft = await createCampaignDraft(deps, { ctx: gestor, content: campanha() });
    const t = await planExperiment(deps, { ctx: gestor, campaignId: draft.id, plan: plano() });
    expect(t).toMatchObject({ status: "planned", startedAt: null, result: null });
    await expect(startExperiment(deps, { ctx: gestor, experimentId: t.id, expectedRevision: 1 })).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    const ativa = await activateCampaign(deps, { ctx: gestor, campaignId: draft.id, expectedRevision: draft.revision });
    const rodando = await startExperiment(deps, { ctx: gestor, experimentId: t.id, expectedRevision: 1 });
    expect(rodando).toMatchObject({ status: "running", startedAt: deps.estado.agora });
    expect(rodando.createdAt.getTime()).toBeLessThanOrEqual(rodando.startedAt!.getTime());
    await pauseCampaign(deps, { ctx: gestor, campaignId: draft.id, expectedRevision: ativa.revision });
    const t2 = await planExperiment(deps, { ctx: gestor, campaignId: draft.id, plan: plano() });
    await expect(startExperiment(deps, { ctx: gestor, experimentId: t2.id, expectedRevision: 1 })).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  });

  it("variação cosmética e plano incompleto não são registrados", async () => {
    const deps = criarStrategyDeps();
    const c = await createCampaignDraft(deps, { ctx: gestor, content: campanha() });
    await expect(planExperiment(deps, { ctx: gestor, campaignId: c.id, plan: plano({ variants: ["única"] }) })).rejects.toMatchObject({ code: "EXPERIMENT_HYPOTHESIS_INVALID" });
    await expect(planExperiment(deps, { ctx: gestor, campaignId: c.id, plan: plano({ hypothesis: "" }) })).rejects.toMatchObject({ code: "EXPERIMENT_HYPOTHESIS_INVALID" });
    expect(deps.estado.experimentos).toHaveLength(0);
  });

  it("campanha encerrada não recebe teste", async () => {
    const deps = criarStrategyDeps();
    const a = await campanhaAtiva(deps);
    const fim = await completeCampaign(deps, { ctx: gestor, campaignId: a.id, expectedRevision: a.revision });
    await expect(planExperiment(deps, { ctx: gestor, campaignId: fim.id, plan: plano() })).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    const b = await createCampaignDraft(deps, { ctx: gestor, content: campanha({ trackingKey: "outra" }) });
    const canc = await cancelCampaign(deps, { ctx: gestor, campaignId: b.id, expectedRevision: b.revision });
    await expect(planExperiment(deps, { ctx: gestor, campaignId: canc.id, plan: plano() })).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  });

  async function rodando(deps: ReturnType<typeof criarStrategyDeps>) {
    const a = await campanhaAtiva(deps);
    const t = await planExperiment(deps, { ctx: gestor, campaignId: a.id, plan: plano({ minimumSample: 30 }) });
    return startExperiment(deps, { ctx: gestor, experimentId: t.id, expectedRevision: 1 });
  }

  it("sem amostra suficiente só conclui como inconclusivo, com a limitação", async () => {
    const deps = criarStrategyDeps();
    const t = await rodando(deps);
    await expect(concludeExperiment(deps, { ctx: gestor, experimentId: t.id, expectedRevision: t.revision, result: { outcome: "supported", observedSample: 12, limitations: "" } }))
      .rejects.toMatchObject({ code: "EXPERIMENT_RESULT_INVALID" });
    expect((await listExperiments(deps, gestor, t.campaignId))[0]!.status).toBe("running");
    const ok = await concludeExperiment(deps, { ctx: gestor, experimentId: t.id, expectedRevision: t.revision, result: { outcome: "inconclusive", observedSample: 12, limitations: "Janela curta." } });
    expect(ok).toMatchObject({ status: "concluded", result: { outcome: "inconclusive" }, concludedAt: deps.estado.agora });
  });

  it("conclui com amostra mínima e registra o aprendizado com evidência e versão", async () => {
    const deps = criarStrategyDeps();
    const t = await rodando(deps);
    const ok = await concludeExperiment(deps, {
      ctx: gestor, experimentId: t.id, expectedRevision: t.revision,
      result: { outcome: "supported", observedSample: 31, limitations: "" },
      learning: { summary: "A dor converte mais.", evidence: ["https://exemplo.test/relatorio"], campaignVersion: 1 },
    });
    expect(ok.learning).toMatchObject({ campaignVersion: 1 });
    expect(deps.estado.auditoria.at(-1)).toMatchObject({ action: "experiment.conclude", after: { status: "concluded", outcome: "supported" } });
  });

  it("aprendizado sem evidência não passa, e o teste continua em execução", async () => {
    const deps = criarStrategyDeps();
    const t = await rodando(deps);
    await expect(concludeExperiment(deps, {
      ctx: gestor, experimentId: t.id, expectedRevision: t.revision,
      result: { outcome: "supported", observedSample: 40, limitations: "" },
      learning: { summary: "x", evidence: [], campaignVersion: 1 },
    })).rejects.toMatchObject({ code: "EXPERIMENT_LEARNING_INVALID" });
    expect(deps.estado.experimentos[0]!.status).toBe("running");
  });

  it("concluído e cancelado são terminais; planejado não conclui", async () => {
    const deps = criarStrategyDeps();
    const a = await campanhaAtiva(deps);
    const p = await planExperiment(deps, { ctx: gestor, campaignId: a.id, plan: plano() });
    await expect(concludeExperiment(deps, { ctx: gestor, experimentId: p.id, expectedRevision: 1, result: { outcome: "inconclusive", observedSample: 0, limitations: "x" } }))
      .rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    const c = await cancelExperiment(deps, { ctx: gestor, experimentId: p.id, expectedRevision: 1 });
    expect(c.status).toBe("cancelled");
    await expect(startExperiment(deps, { ctx: gestor, experimentId: p.id, expectedRevision: c.revision })).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  });

  it("concorrência, permissão e isolamento", async () => {
    const deps = criarStrategyDeps();
    const a = await campanhaAtiva(deps);
    const p = await planExperiment(deps, { ctx: gestor, campaignId: a.id, plan: plano() });
    await expect(planExperiment(deps, { ctx: leitor, campaignId: a.id, plan: plano() })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    await expect(startExperiment(deps, { ctx: gestor, experimentId: p.id, expectedRevision: 9 })).rejects.toMatchObject({ code: "CONFLICT_VERSION" });
    await expect(listExperiments(deps, gestorB, a.id)).rejects.toMatchObject({ code: "CAMPAIGN_NOT_FOUND" });
    await expect(planExperiment(deps, { ctx: gestorB, campaignId: a.id, plan: plano() })).rejects.toMatchObject({ code: "CAMPAIGN_NOT_FOUND" });
    await expect(startExperiment(deps, { ctx: gestorB, experimentId: p.id, expectedRevision: 1 })).rejects.toMatchObject({ code: "EXPERIMENT_NOT_FOUND" });
    await expect(cancelExperiment(deps, { ctx: gestorB, experimentId: p.id, expectedRevision: 1 })).rejects.toMatchObject({ code: "EXPERIMENT_NOT_FOUND" });
  });
});

describe("tarefas", () => {
  it("validação estrutural", () => {
    expect(problemasDaTarefa(tarefa())).toEqual([]);
    expect(codigos(problemasDaTarefa(tarefa({ title: " ", dueDate: "2026-13-01" })))).toEqual(expect.arrayContaining(["TITLE_REQUIRED", "DUE_DATE_INVALID"]));
    const d = "e0000000-0000-4000-8000-000000000001" as TaskId;
    expect(codigos(problemasDaTarefa(tarefa({ dependsOn: [d, d] })))).toContain("DEPENDENCY_DUPLICATE");
  });

  it("cria, lista e muda de estado com auditoria", async () => {
    const deps = criarStrategyDeps();
    const t = await createTask(deps, { ctx: gestor, content: tarefa() });
    expect(t).toMatchObject({ status: "todo", revision: 1 });
    let r = await changeTaskStatus(deps, { ctx: gestor, taskId: t.id, expectedRevision: 1, to: "in_progress" });
    r = await changeTaskStatus(deps, { ctx: gestor, taskId: t.id, expectedRevision: r.revision, to: "done" });
    expect(r.status).toBe("done");
    await expect(changeTaskStatus(deps, { ctx: gestor, taskId: t.id, expectedRevision: r.revision, to: "todo" })).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    // reabrir é permitido (done → in_progress), mas com a revisão antiga é conflito de versão
    await expect(changeTaskStatus(deps, { ctx: gestor, taskId: t.id, expectedRevision: 1, to: "in_progress" })).rejects.toMatchObject({ code: "CONFLICT_VERSION" });
    await expect(changeTaskStatus(deps, { ctx: gestor, taskId: t.id, expectedRevision: r.revision, to: "cancelled" })).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    await expect(listTasks(deps, leitor)).resolves.toHaveLength(1);
    expect(deps.estado.auditoria.map((a) => a.action)).toEqual(["task.create", "task.status", "task.status"]); // recusas não auditam
  });

  it("dependências: existentes na empresa, sem ciclo", async () => {
    const deps = criarStrategyDeps();
    const a = await createTask(deps, { ctx: gestor, content: tarefa({ title: "A" }) });
    const b = await createTask(deps, { ctx: gestor, content: tarefa({ title: "B", dependsOn: [a.id] }) });
    const c = await createTask(deps, { ctx: gestor, content: tarefa({ title: "C", dependsOn: [b.id] }) });
    const ciclo = { code: "TASK_DEPENDENCY_CYCLE" };
    await expect(saveTask(deps, { ctx: gestor, taskId: a.id, expectedRevision: 1, content: tarefa({ title: "A", dependsOn: [a.id] }) })).rejects.toMatchObject(ciclo);
    await expect(saveTask(deps, { ctx: gestor, taskId: a.id, expectedRevision: 1, content: tarefa({ title: "A", dependsOn: [c.id] }) })).rejects.toMatchObject(ciclo);
    expect((await listTasks(deps, gestor)).find((t) => t.id === a.id)!.dependsOn).toEqual([]);
    await expect(saveTask(deps, { ctx: gestor, taskId: c.id, expectedRevision: 1, content: tarefa({ title: "C", dependsOn: [a.id, b.id] }) })).resolves.toMatchObject({ revision: 2 });
    await expect(createTask(deps, { ctx: gestor, content: tarefa({ dependsOn: ["e0000000-0000-4000-8000-0000000000ff" as TaskId] }) })).rejects.toMatchObject({ code: "REFERENCE_NOT_FOUND" });
  });

  it("dependência e campanha de outra empresa respondem como inexistentes (I-TEN)", async () => {
    const deps = criarStrategyDeps();
    const deB = await createTask(deps, { ctx: gestorB, content: tarefa({ title: "de B" }) });
    await expect(createTask(deps, { ctx: gestor, content: tarefa({ dependsOn: [deB.id] }) })).rejects.toMatchObject({ code: "REFERENCE_NOT_FOUND" });
    const campB = await createCampaignDraft(deps, { ctx: gestorB, content: campanha() });
    await expect(createTask(deps, { ctx: gestor, content: tarefa({ campaignId: campB.id }) })).rejects.toMatchObject({ code: "REFERENCE_NOT_FOUND" });
    const campA = await createCampaignDraft(deps, { ctx: gestor, content: campanha() });
    await expect(createTask(deps, { ctx: gestor, content: tarefa({ campaignId: campA.id }) })).resolves.toMatchObject({ campaignId: campA.id });
  });

  it("responsável agente só se habilitado na empresa", async () => {
    const deps = criarStrategyDeps();
    deps.estado.agentesHabilitados.set(TA, new Set(["copywriting"]));
    await expect(createTask(deps, { ctx: gestor, content: tarefa({ assignee: { kind: "agent", agentKey: "copywriting" } }) })).resolves.toBeDefined();
    await expect(createTask(deps, { ctx: gestor, content: tarefa({ assignee: { kind: "agent", agentKey: "design" } }) })).rejects.toMatchObject({ code: "TASK_ASSIGNEE_INVALID" });
    // habilitado em A não vale em B
    await expect(createTask(deps, { ctx: gestorB, content: tarefa({ assignee: { kind: "agent", agentKey: "copywriting" } }) })).rejects.toMatchObject({ code: "TASK_ASSIGNEE_INVALID" });
  });

  it("permissão, isolamento e tarefa cancelada", async () => {
    const deps = criarStrategyDeps();
    await expect(createTask(deps, { ctx: leitor, content: tarefa() })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    const t = await createTask(deps, { ctx: gestor, content: tarefa() });
    await expect(listTasks(deps, gestorB)).resolves.toEqual([]);
    await expect(saveTask(deps, { ctx: gestorB, taskId: t.id, expectedRevision: 1, content: tarefa() })).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
    await expect(changeTaskStatus(deps, { ctx: gestorB, taskId: t.id, expectedRevision: 1, to: "cancelled" })).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
    const c = await changeTaskStatus(deps, { ctx: gestor, taskId: t.id, expectedRevision: 1, to: "cancelled" });
    await expect(saveTask(deps, { ctx: gestor, taskId: t.id, expectedRevision: c.revision, content: tarefa() })).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  });
});
