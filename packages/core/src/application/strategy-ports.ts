// Portas do contexto Strategy (I-04). A infraestrutura as implementa; domínio e casos de uso
// nunca importam SDK, HTTP ou SQL.
import type { BrandVersionId, CampaignId, ExperimentId, ObjectiveId, PersonaId, TenantId, UserId } from "../domain/ids.ts";
import type {
  Campaign, CampaignPlan, CampaignStatus, Experiment, ExperimentContent, ExperimentStatus, Objective, ObjectiveContent,
  Persona, PersonaContent,
} from "../domain/strategy.ts";
import type { BrandRepository } from "./brand-ports.ts";
import type { AuditLogPort, Clock, Tx, UnitOfWork } from "./ports.ts";

export interface StrategyRepository {
  insertObjective(tx: Tx, e: { tenantId: TenantId; content: ObjectiveContent; createdBy: UserId }): Promise<Objective>;
  listObjectives(tx: Tx, tenantId: TenantId, opts: { includeArchived: boolean }): Promise<Objective[]>;
  findObjective(tx: Tx, tenantId: TenantId, id: ObjectiveId): Promise<Objective | null>;
  archiveObjective(tx: Tx, tenantId: TenantId, id: ObjectiveId): Promise<void>;

  insertPersona(tx: Tx, e: { tenantId: TenantId; content: PersonaContent; createdBy: UserId }): Promise<Persona>;
  listPersonas(tx: Tx, tenantId: TenantId, opts: { includeArchived: boolean }): Promise<Persona[]>;
  findPersona(tx: Tx, tenantId: TenantId, id: PersonaId): Promise<Persona | null>;
  archivePersona(tx: Tx, tenantId: TenantId, id: PersonaId): Promise<void>;

  /** Lança TrackingKeyTaken se a chave já existir na empresa. */
  insertCampaign(tx: Tx, e: {
    tenantId: TenantId; plan: CampaignPlan; brandVersionId: BrandVersionId; chave: string; createdBy: UserId;
  }): Promise<Campaign>;
  listCampaigns(tx: Tx, tenantId: TenantId): Promise<Campaign[]>;
  findCampaign(tx: Tx, tenantId: TenantId, id: CampaignId): Promise<Campaign | null>;
  /** Só campanha planejada. CampaignLocked se não for; ConflictVersion se a revisão divergir. */
  updateCampaignPlan(tx: Tx, e: {
    tenantId: TenantId; id: CampaignId; expectedRevision: number; plan: CampaignPlan; brandVersionId: BrandVersionId;
  }): Promise<Campaign>;
  /** Só enquanto a campanha nunca foi ativada. TrackingKeyLocked / TrackingKeyTaken / ConflictVersion. */
  replaceTrackingKey(tx: Tx, e: { tenantId: TenantId; id: CampaignId; expectedRevision: number; chave: string }): Promise<Campaign>;
  /** Transição atômica a partir do estado esperado; InvalidCampaignTransition se o estado atual divergir. */
  transitionCampaign(tx: Tx, e: {
    tenantId: TenantId; id: CampaignId; from: CampaignStatus; to: CampaignStatus; activatedAt: Date | null;
  }): Promise<Campaign>;

  insertExperiment(tx: Tx, e: { tenantId: TenantId; campaignId: CampaignId; content: ExperimentContent; createdBy: UserId }): Promise<Experiment>;
  listExperiments(tx: Tx, tenantId: TenantId, campaignId: CampaignId): Promise<Experiment[]>;
  findExperiment(tx: Tx, tenantId: TenantId, id: ExperimentId): Promise<Experiment | null>;
  transitionExperiment(tx: Tx, e: {
    tenantId: TenantId; id: ExperimentId; from: ExperimentStatus; to: ExperimentStatus; startedAt: Date | null;
  }): Promise<Experiment>;
}

export type StrategyDeps = {
  uow: UnitOfWork; strategy: StrategyRepository; brand: BrandRepository;
  audit: AuditLogPort; clock: Clock; ids: { uuid(): string };
};
