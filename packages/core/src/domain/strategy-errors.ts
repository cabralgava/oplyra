// Erros da Estratégia (I-04). Arquivo próprio: `errors.ts` pertence ao conjunto governado.
// `issues` lista cada regra violada; a fronteira as mostra ao usuário.
import { DomainError, ConflictVersion } from "./errors.ts";

export { ConflictVersion };

export type StrategyIssue = { readonly code: string; readonly path: string; readonly message: string };

const simples = (code: string, padrao: string) =>
  class extends DomainError {
    constructor(mensagem = padrao) { super(code, mensagem); }
  };

const comProblemas = (code: string, padrao: string) =>
  class extends DomainError {
    readonly issues: readonly StrategyIssue[];
    constructor(issues: readonly StrategyIssue[]) {
      super(code, padrao);
      this.issues = issues;
    }
  };

export const ObjectiveNotFound = simples("OBJECTIVE_NOT_FOUND", "objetivo não encontrado");
export const PersonaNotFound = simples("PERSONA_NOT_FOUND", "persona não encontrada");
export const CampaignNotFound = simples("CAMPAIGN_NOT_FOUND", "campanha não encontrada");
export const ExperimentNotFound = simples("EXPERIMENT_NOT_FOUND", "teste não encontrado");
export const NoPublishedBrand = simples("NO_PUBLISHED_BRAND", "publique a marca antes de criar uma campanha");
export const ProductNotInCurrentBrand = simples("PRODUCT_NOT_IN_CURRENT_BRAND", "o produto não existe na versão vigente da marca");
export const ObjectiveArchived = simples("OBJECTIVE_ARCHIVED", "o objetivo está arquivado");
export const PersonaArchived = simples("PERSONA_ARCHIVED", "a persona está arquivada");
export const TrackingKeyLocked = simples("TRACKING_KEY_LOCKED", "a chave de rastreamento é fixa depois de ativada a campanha");
export const TrackingKeyTaken = simples("TRACKING_KEY_TAKEN", "a chave de rastreamento já existe nesta empresa");
export const CampaignLocked = simples("CAMPAIGN_LOCKED", "só campanhas planejadas podem ser editadas por esta operação");
export const InvalidCampaignTransition = simples("INVALID_CAMPAIGN_TRANSITION", "transição de estado da campanha inválida");
export const InvalidExperimentTransition = simples("INVALID_EXPERIMENT_TRANSITION", "transição de estado do teste inválida");
export const CampaignNotOpenForExperiments = simples("CAMPAIGN_NOT_OPEN_FOR_EXPERIMENTS", "campanha concluída ou cancelada não recebe testes");

export const StrategyContentInvalid = comProblemas("STRATEGY_CONTENT_INVALID", "conteúdo inválido");
export const CampaignNotActivatable = comProblemas("CAMPAIGN_NOT_ACTIVATABLE", "a campanha ainda não pode ser ativada");
