// PostgreSQL e papéis reais no banco descartável da CI. Identidades/memberships são fixtures;
// isto não comprova login JWT hospedado. IDs/slugs exclusivos, sem fixture compartilhada.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { TenantId, UserId, AccessContext } from "@oplyra/core";
import { criarUnitOfWork, comoCliente } from "../src/db.ts";
import { criarAccessContextResolver } from "../src/auth.ts";
import { auditLog, relogio } from "../src/repositories.ts";
import { brandRepository, geradorDeIds } from "../src/brand-repository.ts";
import {
  taskRepository, campaignRepository, objectiveRepository, experimentRepository, agentCapabilities,
} from "../src/strategy-repository.ts";
import type { StrategyDeps } from "../../core/src/application/strategy-ports.ts";
import type { TaskContent } from "../../core/src/domain/strategy.ts";
import {
  createTask, listTasks, saveTask, saveTaskDetails, changeTaskStatus, type TaskDetails,
} from "../../core/src/application/use-cases/strategy-tasks.ts";
import { createCampaignDraft } from "../../core/src/application/use-cases/strategy.ts";

const TA = randomUUID() as TenantId;
const TB = randomUUID() as TenantId;
const OWNER = randomUUID() as UserId;
const MEMBER = randomUUID() as UserId;
const OTHER = randomUUID() as UserId;
const LEITOR = randomUUID() as UserId;
// Constantes locais: este arquivo nunca recebe URL/credencial hospedada por ambiente.
const uow = criarUnitOfWork({ connectionString: "postgresql://oplyra_web_login:local-web-2026@127.0.0.1:54422/postgres" });
const admin = criarUnitOfWork({ connectionString: "postgresql://postgres:postgres@127.0.0.1:54422/postgres" });
const resolver = criarAccessContextResolver(uow);
const deps: StrategyDeps = {
  uow, tasks: taskRepository, campaigns: campaignRepository, objectives: objectiveRepository,
  experiments: experimentRepository, agents: agentCapabilities, brand: brandRepository,
  audit: auditLog, clock: relogio, ids: geradorDeIds,
};
let own: AccessContext;
let other: AccessContext;
let viewer: AccessContext;
const details = (over: Partial<TaskDetails> = {}): TaskDetails => ({
  title: "Detalhes de tarefa", description: "", campaignId: null, dueDate: null, dependsOn: [], ...over,
});
const content = (over: Partial<TaskContent> = {}): TaskContent => ({ ...details(), assignee: { kind: "user", userId: OWNER }, ...over });
const read = async (id: string) => (await listTasks(deps, own)).find(t => t.id === id)!;
const saves = async (id: string) => uow.withUserTransaction(own, async tx => {
  const r = await comoCliente(tx).query("select count(*)::int as n from core.audit_log where tenant_id=$1 and target=$2 and action='task.save'", [TA, id]);
  return Number(r.rows[0]!.n);
});

beforeAll(async () => {
  await admin.pool.query(
    "insert into core.tenants(id,name,slug) values($1,$2,$3),($4,$5,$6)",
    [TA, "Task details A", `td-a-${TA}`, TB, "Task details B", `td-b-${TB}`],
  );
  await admin.pool.query(
    "insert into core.memberships(tenant_id,user_id,role_key) values($1,$2,'owner'),($1,$3,'marketing_manager'),($1,$4,'viewer'),($5,$6,'owner')",
    [TA, OWNER, MEMBER, LEITOR, TB, OTHER],
  );
  own = await resolver.resolve({ userId: OWNER, email: "" }, TA);
  other = await resolver.resolve({ userId: OTHER, email: "" }, TB);
  viewer = await resolver.resolve({ userId: LEITOR, email: "" }, TA);
});

afterAll(async () => {
  try {
    await admin.pool.query("delete from core.tenants where id=any($1::uuid[])", [[TA, TB]]);
  } finally { await Promise.all([uow.encerrar(), admin.encerrar()]); }
});

describe("edição de detalhes — transação e isolamento reais", () => {
  it("preserva responsável e estado, incrementa uma revisão e recusa replay obsoleto", async () => {
    let task = await createTask(deps, { ctx: own, content: content() });
    task = await changeTaskStatus(deps, { ctx: own, taskId: task.id, expectedRevision: 1, to: "in_progress" });
    const supplied = { ...details({ title: "Atualizada", dueDate: "2028-02-29" }), assignee: null, status: "cancelled", revision: 100 };
    const saved = await saveTaskDetails(deps, { ctx: own, taskId: task.id, expectedRevision: task.revision, content: supplied });
    expect(saved).toMatchObject({ title: "Atualizada", assignee: task.assignee, status: "in_progress", revision: 3, dueDate: "2028-02-29" });
    expect(await read(task.id)).toEqual(saved);
    await expect(saveTaskDetails(deps, { ctx: own, taskId: task.id, expectedRevision: 2, content: details({ title: "Obsoleta" }) })).rejects.toMatchObject({ code: "CONFLICT_VERSION" });
    expect(await read(task.id)).toEqual(saved);
    expect(await saves(task.id)).toBe(1);
  });

  it("duas conexões disputam a mesma revisão e só uma edição/auditoria persiste", async () => {
    const task = await createTask(deps, { ctx: own, content: content() });
    const results = await Promise.allSettled(["Primeira", "Segunda"].map(title => saveTaskDetails(deps, {
      ctx: own, taskId: task.id, expectedRevision: 1, content: details({ title }),
    })));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(r => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "CONFLICT_VERSION" });
    expect(await read(task.id)).toMatchObject({ assignee: task.assignee, status: "todo", revision: 2 });
    expect(await saves(task.id)).toBe(1);
  });

  it("mudança concorrente de responsável após a leitura é preservada e a edição antiga falha", async () => {
    let task = await createTask(deps, { ctx: own, content: content() });
    task = await changeTaskStatus(deps, { ctx: own, taskId: task.id, expectedRevision: 1, to: "in_progress" });
    const changing: StrategyDeps = {
      ...deps,
      tasks: {
        ...taskRepository,
        async findById(tx, tenant, id) {
          const snapshot = await taskRepository.findById(tx, tenant, id);
          // Outra withUserTransaction abre uma conexão distinta; o SELECT anterior não bloqueia a linha.
          await saveTask(deps, { ctx: own, taskId: task.id, expectedRevision: 2, content: content({
            title: "Mudança concorrente", assignee: { kind: "user", userId: MEMBER },
          }) });
          return snapshot;
        },
      },
    };
    await expect(saveTaskDetails(changing, { ctx: own, taskId: task.id, expectedRevision: 2, content: details({ title: "Sobrescrita antiga" }) })).rejects.toMatchObject({ code: "CONFLICT_VERSION" });
    expect(await read(task.id)).toMatchObject({ title: "Mudança concorrente", assignee: { kind: "user", userId: MEMBER }, status: "in_progress", revision: 3 });
    expect(await saves(task.id)).toBe(1);
  });

  it("falha de auditoria reverte campos, revisão e troca de dependências", async () => {
    const predecessor = await createTask(deps, { ctx: own, content: content() });
    const task = await createTask(deps, { ctx: own, content: content() });
    const failure = new Error("task-details-audit-fixture");
    const failing: StrategyDeps = { ...deps, audit: { async record() { throw failure; } } };
    await expect(saveTaskDetails(failing, { ctx: own, taskId: task.id, expectedRevision: 1, content: details({
      title: "Não pode persistir", dependsOn: [predecessor.id],
    }) })).rejects.toBe(failure);
    expect(await read(task.id)).toEqual(task);
    expect(await saves(task.id)).toBe(0);
  });

  it("cancelamento concorrente após leitura não é revertido pela edição antiga", async () => {
    const task = await createTask(deps, { ctx: own, content: content() });
    const changing: StrategyDeps = {
      ...deps,
      tasks: {
        ...taskRepository,
        async findById(tx, tenant, id) {
          const snapshot = await taskRepository.findById(tx, tenant, id);
          await changeTaskStatus(deps, { ctx: own, taskId: task.id, expectedRevision: 1, to: "cancelled" });
          return snapshot;
        },
      },
    };
    await expect(saveTaskDetails(changing, { ctx: own, taskId: task.id, expectedRevision: 1, content: details({ title: "Edição antiga" }) })).rejects.toMatchObject({ code: "CONFLICT_VERSION" });
    expect(await read(task.id)).toMatchObject({ title: task.title, assignee: task.assignee, status: "cancelled", revision: 2 });
    expect(await saves(task.id)).toBe(0);
  });

  it("campanha/dependência alheias, tarefa alheia e Leitor não alteram dados", async () => {
    const task = await createTask(deps, { ctx: own, content: content() });
    const foreign = await createTask(deps, { ctx: other, content: content({ assignee: null }) });
    const campaign = await createCampaignDraft(deps, { ctx: other, content: {
      name: "Campanha B", trackingKey: `task-details-${randomUUID()}`, objectiveId: null, productKey: null,
      method: { situation: "", pain: "", consequence: "", desire: "", mechanism: "", proof: "", offer: "" },
    } });
    await expect(saveTaskDetails(deps, { ctx: own, taskId: foreign.id, expectedRevision: 1, content: details() })).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
    await expect(saveTaskDetails(deps, { ctx: viewer, taskId: task.id, expectedRevision: 1, content: details() })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    for (const edited of [details({ campaignId: campaign.id }), details({ dependsOn: [foreign.id] })]) {
      await expect(saveTaskDetails(deps, { ctx: own, taskId: task.id, expectedRevision: 1, content: edited })).rejects.toMatchObject({ code: "REFERENCE_NOT_FOUND" });
    }
    expect(await read(task.id)).toEqual(task);
    expect(await saves(task.id)).toBe(0);
    expect((await listTasks(deps, other)).find(t => t.id === foreign.id)).toEqual(foreign);
  });

  it("ciclo e edição de cancelada não mudam conteúdo/revisão/auditoria", async () => {
    const first = await createTask(deps, { ctx: own, content: content() });
    const second = await createTask(deps, { ctx: own, content: content({ dependsOn: [first.id] }) });
    await expect(saveTaskDetails(deps, { ctx: own, taskId: first.id, expectedRevision: 1, content: details({ dependsOn: [second.id] }) })).rejects.toMatchObject({ code: "TASK_DEPENDENCY_CYCLE" });
    expect(await read(first.id)).toEqual(first);
    const cancelled = await changeTaskStatus(deps, { ctx: own, taskId: first.id, expectedRevision: 1, to: "cancelled" });
    await expect(saveTaskDetails(deps, { ctx: own, taskId: first.id, expectedRevision: 2, content: details() })).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    expect(await read(first.id)).toEqual(cancelled);
    expect(await saves(first.id)).toBe(0);
  });
});
