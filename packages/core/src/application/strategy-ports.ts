// Portas do contexto Strategy (I-04). A infraestrutura as implementa; o domínio e os casos de uso
// nunca importam SDK, HTTP ou SQL. Toda leitura/escrita recebe o tenant: "inexistente" e "de outra
// empresa" são indistinguíveis por desenho (I-TEN, I-CMP).
import type { CampaignId, ExperimentId, ObjectiveId, TaskId, TenantId, UserId } from "../domain/ids.ts";
import type {
  Campaign, CampaignContent, CampaignStatus, Experiment, ExperimentPlan, ExperimentResult, ExperimentStatus,
  Learning, Objective, ObjectiveContent, Task, TaskContent, TaskStatus,
} from "../domain/strategy.ts";
import type { BrandRepository, IdGenerator } from "./brand-ports.ts";
import type { AuditLogPort, Clock, Tx, UnitOfWork } from "./ports.ts";

export interface CampaignRepository {
  list(tx: Tx, tenantId: TenantId): Promise<Campaign[]>;
  findById(tx: Tx, tenantId: TenantId, id: CampaignId): Promise<Campaign | null>;
  /** Cria como rascunho. Lança CampaignTrackingKeyTaken se a chave (não vazia) já existir na empresa. */
  create(tx: Tx, e: { tenantId: TenantId; content: CampaignContent; createdBy: UserId }): Promise<Campaign>;
  /**
   * Substitui o conteúdo do rascunho. ConflictVersion se a revisão esperada divergir;
   * InvalidStateTransition se a campanha não for rascunho; CampaignTrackingKeyTaken na colisão de chave.
   */
  replaceDraftContent(tx: Tx, e: {
    tenantId: TenantId; id: CampaignId; expectedRevision: number; content: CampaignContent;
  }): Promise<Campaign>;
  /** Muda o estado. ConflictVersion / InvalidStateTransition como acima; o banco revalida a transição. */
  transition(tx: Tx, e: {
    tenantId: TenantId; id: CampaignId; expectedRevision: number; from: CampaignStatus; to: CampaignStatus; at: Date;
  }): Promise<Campaign>;
}

export interface ObjectiveRepository {
  list(tx: Tx, tenantId: TenantId): Promise<Objective[]>;
  findById(tx: Tx, tenantId: TenantId, id: ObjectiveId): Promise<Objective | null>;
  /** Existência no tenant (qualquer estado). */
  exists(tx: Tx, tenantId: TenantId, id: ObjectiveId): Promise<boolean>;
  create(tx: Tx, e: { tenantId: TenantId; content: ObjectiveContent; createdBy: UserId }): Promise<Objective>;
  /** ConflictVersion se a revisão divergir; InvalidStateTransition se arquivado. */
  replaceContent(tx: Tx, e: { tenantId: TenantId; id: ObjectiveId; expectedRevision: number; content: ObjectiveContent }): Promise<Objective>;
  /** Torna este o principal e retira a marca do anterior, de forma atômica. */
  setPrimary(tx: Tx, e: { tenantId: TenantId; id: ObjectiveId; expectedRevision: number }): Promise<Objective>;
  /** Arquiva e retira a marca de principal. */
  archive(tx: Tx, e: { tenantId: TenantId; id: ObjectiveId; expectedRevision: number }): Promise<Objective>;
}

export interface ExperimentRepository {
  listByCampaign(tx: Tx, tenantId: TenantId, campaignId: CampaignId): Promise<Experiment[]>;
  findById(tx: Tx, tenantId: TenantId, id: ExperimentId): Promise<Experiment | null>;
  create(tx: Tx, e: { tenantId: TenantId; campaignId: CampaignId; plan: ExperimentPlan; createdBy: UserId }): Promise<Experiment>;
  /** Muda o estado e grava o resultado/aprendizado quando houver. ConflictVersion / InvalidStateTransition. */
  transition(tx: Tx, e: {
    tenantId: TenantId; id: ExperimentId; expectedRevision: number; from: ExperimentStatus; to: ExperimentStatus; at: Date;
    result?: ExperimentResult; learning?: Learning | null;
  }): Promise<Experiment>;
}

export interface TaskRepository {
  list(tx: Tx, tenantId: TenantId): Promise<Task[]>;
  findById(tx: Tx, tenantId: TenantId, id: TaskId): Promise<Task | null>;
  /** Quais destes ids existem no tenant. */
  existing(tx: Tx, tenantId: TenantId, ids: readonly TaskId[]): Promise<Set<TaskId>>;
  /** Grafo tarefa → dependências de todo o tenant. */
  dependencyGraph(tx: Tx, tenantId: TenantId): Promise<Map<TaskId, readonly TaskId[]>>;
  create(tx: Tx, e: { tenantId: TenantId; content: TaskContent; createdBy: UserId }): Promise<Task>;
  /** ConflictVersion se a revisão divergir; o banco repete a recusa de ciclo (TaskDependencyCycle). */
  replaceContent(tx: Tx, e: { tenantId: TenantId; id: TaskId; expectedRevision: number; content: TaskContent }): Promise<Task>;
  transition(tx: Tx, e: { tenantId: TenantId; id: TaskId; expectedRevision: number; from: TaskStatus; to: TaskStatus }): Promise<Task>;
}

/** Agentes habilitados para a empresa; vem do serviço de entitlements, nunca de plano no domínio. */
export interface AgentCapabilityPort {
  enabledAgents(tx: Tx, tenantId: TenantId): Promise<ReadonlySet<string>>;
}

export type StrategyDeps = {
  uow: UnitOfWork;
  campaigns: CampaignRepository;
  objectives: ObjectiveRepository;
  experiments: ExperimentRepository;
  tasks: TaskRepository;
  agents: AgentCapabilityPort;
  /** Só a leitura da marca vigente: o produto da campanha é um produto dela. */
  brand: Pick<BrandRepository, "findCurrent">;
  audit: AuditLogPort;
  clock: Clock;
  ids: IdGenerator;
};
