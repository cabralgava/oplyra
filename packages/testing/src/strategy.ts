// Fake em memória do contexto Strategy. Serve a testes de unidade dos casos de uso; a persistência
// real (RLS, constraints, FK composta) é verificada com o Supabase local.
import type {
  AuditEntry, Tx, UnitOfWork, AccessContext, PermissionKey, RoleKey, TenantId, CampaignId, ObjectiveId,
  ExperimentId, TaskId,
} from "@oplyra/core";
import { ConflictVersion, InvalidStateTransition } from "@oplyra/core";
import type { BrandVersion } from "@oplyra/core/brand";
import { contexto } from "./index.ts";
import type {
  StrategyDeps, CampaignRepository, ObjectiveRepository, ExperimentRepository, TaskRepository,
} from "../../core/src/application/strategy-ports.ts";
import type { Campaign, Experiment, Objective, Task } from "../../core/src/domain/strategy.ts";
import {
  CampaignNotFound, CampaignTrackingKeyTaken, ExperimentNotFound, ObjectiveNotFound, TaskNotFound,
} from "../../core/src/domain/strategy-errors.ts";

const ESTRATEGIA_POR_PAPEL: Record<RoleKey, readonly PermissionKey[]> = {
  owner: ["strategy.read", "strategy.write"],
  admin: ["strategy.read", "strategy.write"],
  marketing_manager: ["strategy.read", "strategy.write"],
  viewer: ["strategy.read"],
};

/** `contexto()` do I-01 acrescido das permissões de estratégia (espelho do seed de papéis da migration). */
export function contextoDeEstrategia(over: Parameters<typeof contexto>[0]): AccessContext {
  const base = contexto(over);
  return { ...base, permissions: new Set<PermissionKey>([...base.permissions, ...ESTRATEGIA_POR_PAPEL[base.roleKey]]) };
}

const TX: Tx = {};
let sequencia = 0;
const uuid = (): string => `a${(++sequencia).toString().padStart(7, "0")}-0000-4000-8000-${sequencia.toString().padStart(12, "0")}`;

export type EstadoStrategy = {
  campanhas: Campaign[];
  objetivos: Objective[];
  experimentos: Experiment[];
  tarefas: Task[];
  /** Agentes habilitados por empresa. */
  agentesHabilitados: Map<TenantId, Set<string>>;
  /** Marca vigente por empresa: só o que a campanha consulta (produtos). */
  marcas: Map<TenantId, Pick<BrandVersion, "products">>;
  auditoria: AuditEntry[];
  agora: Date;
};

export function criarStrategyDeps(inicial?: Partial<EstadoStrategy>): StrategyDeps & { estado: EstadoStrategy } {
  const estado: EstadoStrategy = {
    campanhas: [], objetivos: [], experimentos: [], tarefas: [], agentesHabilitados: new Map(), marcas: new Map(),
    auditoria: [], agora: new Date("2026-11-11T12:00:00Z"), ...inicial,
  };

  const uow: UnitOfWork = {
    withUserTransaction: (_c, fn) => fn(TX),
    withIdentityTransaction: (_u, fn) => fn(TX),
    withWorkerTransaction: (_t, _j, fn) => fn(TX),
    withDispatcherTransaction: (_t, _d, fn) => fn(TX),
    withOperatorTransaction: (_o, _m, fn) => fn(TX),
  };

  /** Substitui por (tenant, id) em uma coleção; lança `naoEncontrado` se não existir. */
  function trocar<T extends { tenantId: TenantId; id: string }>(lista: T[], novo: T): T {
    const i = lista.findIndex((x) => x.tenantId === novo.tenantId && x.id === novo.id);
    lista[i] = novo;
    return novo;
  }
  function achar<T extends { tenantId: TenantId; id: string }>(lista: T[], t: TenantId, id: string, nf: () => Error): T {
    const x = lista.find((y) => y.tenantId === t && y.id === id);
    if (!x) throw nf();
    return x;
  }
  const conferirRevisao = (atual: number, esperada: number) => { if (atual !== esperada) throw new ConflictVersion(); };

  const doTenant = (t: TenantId) => estado.campanhas.filter((c) => c.tenantId === t);
  // Mesma regra do índice único parcial: a chave vazia (rascunho sem chave) não colide.
  const exigirChaveLivre = (t: TenantId, chave: string, exceto: CampaignId | null) => {
    if (chave !== "" && doTenant(t).some((c) => c.trackingKey === chave && c.id !== exceto)) throw new CampaignTrackingKeyTaken();
  };

  const campaigns: CampaignRepository = {
    async list(_tx, t) { return doTenant(t); },
    async findById(_tx, t, id) { return doTenant(t).find((c) => c.id === id) ?? null; },
    async create(_tx, e) {
      exigirChaveLivre(e.tenantId, e.content.trackingKey, null);
      const criada: Campaign = {
        ...e.content, id: uuid() as CampaignId, tenantId: e.tenantId, status: "draft", revision: 1,
        createdBy: e.createdBy, createdAt: estado.agora, activatedAt: null,
      };
      estado.campanhas.push(criada);
      return criada;
    },
    async replaceDraftContent(_tx, e) {
      const atual = achar(estado.campanhas, e.tenantId, e.id, () => new CampaignNotFound());
      if (atual.status !== "draft") throw new InvalidStateTransition();
      conferirRevisao(atual.revision, e.expectedRevision);
      exigirChaveLivre(e.tenantId, e.content.trackingKey, e.id);
      return trocar(estado.campanhas, { ...atual, ...e.content, revision: atual.revision + 1 });
    },
    async transition(_tx, e) {
      const atual = achar(estado.campanhas, e.tenantId, e.id, () => new CampaignNotFound());
      if (atual.status !== e.from) throw new InvalidStateTransition();
      conferirRevisao(atual.revision, e.expectedRevision);
      return trocar(estado.campanhas, {
        ...atual, status: e.to, revision: atual.revision + 1,
        activatedAt: e.to === "active" && atual.activatedAt === null ? e.at : atual.activatedAt,
      });
    },
  };

  const objectives: ObjectiveRepository = {
    async list(_tx, t) { return estado.objetivos.filter((o) => o.tenantId === t); },
    async findById(_tx, t, id) { return estado.objetivos.find((o) => o.tenantId === t && o.id === id) ?? null; },
    async exists(_tx, t, id) { return estado.objetivos.some((o) => o.tenantId === t && o.id === id); },
    async create(_tx, e) {
      const criado: Objective = {
        ...e.content, id: uuid() as ObjectiveId, tenantId: e.tenantId, status: "active", primary: false,
        revision: 1, createdBy: e.createdBy, createdAt: estado.agora,
      };
      estado.objetivos.push(criado);
      return criado;
    },
    async replaceContent(_tx, e) {
      const atual = achar(estado.objetivos, e.tenantId, e.id, () => new ObjectiveNotFound());
      if (atual.status !== "active") throw new InvalidStateTransition();
      conferirRevisao(atual.revision, e.expectedRevision);
      return trocar(estado.objetivos, { ...atual, ...e.content, revision: atual.revision + 1 });
    },
    async setPrimary(_tx, e) {
      const atual = achar(estado.objetivos, e.tenantId, e.id, () => new ObjectiveNotFound());
      if (atual.status !== "active") throw new InvalidStateTransition();
      conferirRevisao(atual.revision, e.expectedRevision);
      estado.objetivos.forEach((o, i) => {
        if (o.tenantId === e.tenantId && o.primary && o.id !== e.id) estado.objetivos[i] = { ...o, primary: false, revision: o.revision + 1 };
      });
      return trocar(estado.objetivos, { ...atual, primary: true, revision: atual.revision + 1 });
    },
    async archive(_tx, e) {
      const atual = achar(estado.objetivos, e.tenantId, e.id, () => new ObjectiveNotFound());
      if (atual.status !== "active") throw new InvalidStateTransition();
      conferirRevisao(atual.revision, e.expectedRevision);
      return trocar(estado.objetivos, { ...atual, status: "archived" as const, primary: false, revision: atual.revision + 1 });
    },
  };

  const experiments: ExperimentRepository = {
    async listByCampaign(_tx, t, c) { return estado.experimentos.filter((x) => x.tenantId === t && x.campaignId === c); },
    async findById(_tx, t, id) { return estado.experimentos.find((x) => x.tenantId === t && x.id === id) ?? null; },
    async create(_tx, e) {
      const criado: Experiment = {
        id: uuid() as ExperimentId, tenantId: e.tenantId, campaignId: e.campaignId, plan: e.plan, status: "planned",
        result: null, learning: null, revision: 1, createdBy: e.createdBy, createdAt: estado.agora, startedAt: null, concludedAt: null,
      };
      estado.experimentos.push(criado);
      return criado;
    },
    async transition(_tx, e) {
      const atual = achar(estado.experimentos, e.tenantId, e.id, () => new ExperimentNotFound());
      if (atual.status !== e.from) throw new InvalidStateTransition();
      conferirRevisao(atual.revision, e.expectedRevision);
      return trocar(estado.experimentos, {
        ...atual, status: e.to, revision: atual.revision + 1,
        startedAt: e.to === "running" ? e.at : atual.startedAt,
        concludedAt: e.to === "concluded" ? e.at : atual.concludedAt,
        result: e.result ?? atual.result, learning: e.learning === undefined ? atual.learning : e.learning,
      });
    },
  };

  const tasks: TaskRepository = {
    async list(_tx, t) { return estado.tarefas.filter((x) => x.tenantId === t); },
    async findById(_tx, t, id) { return estado.tarefas.find((x) => x.tenantId === t && x.id === id) ?? null; },
    async existing(_tx, t, ids) {
      return new Set(ids.filter((id) => estado.tarefas.some((x) => x.tenantId === t && x.id === id)));
    },
    async dependencyGraph(_tx, t) {
      return new Map(estado.tarefas.filter((x) => x.tenantId === t).map((x) => [x.id, x.dependsOn] as [TaskId, readonly TaskId[]]));
    },
    async create(_tx, e) {
      const criada: Task = {
        ...e.content, id: uuid() as TaskId, tenantId: e.tenantId, status: "todo", revision: 1,
        createdBy: e.createdBy, createdAt: estado.agora,
      };
      estado.tarefas.push(criada);
      return criada;
    },
    async replaceContent(_tx, e) {
      const atual = achar(estado.tarefas, e.tenantId, e.id, () => new TaskNotFound());
      conferirRevisao(atual.revision, e.expectedRevision);
      return trocar(estado.tarefas, { ...atual, ...e.content, revision: atual.revision + 1 });
    },
    async transition(_tx, e) {
      const atual = achar(estado.tarefas, e.tenantId, e.id, () => new TaskNotFound());
      if (atual.status !== e.from) throw new InvalidStateTransition();
      conferirRevisao(atual.revision, e.expectedRevision);
      return trocar(estado.tarefas, { ...atual, status: e.to, revision: atual.revision + 1 });
    },
  };

  return {
    uow, campaigns, objectives, experiments, tasks, estado,
    agents: { async enabledAgents(_tx, t) { return estado.agentesHabilitados.get(t) ?? new Set<string>(); } },
    brand: { async findCurrent(_tx, t) { return (estado.marcas.get(t) as BrandVersion | undefined) ?? null; } },
    audit: { async record(_tx, entrada) { estado.auditoria.push(entrada); } },
    clock: { now: () => estado.agora },
    ids: { uuid },
  };
}
