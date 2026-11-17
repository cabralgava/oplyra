// Erros de Estratégia e Operação (I-04). Arquivo próprio: `errors.ts` pertence ao conjunto
// governado pelos manifests de contrato. `issues` lista cada regra violada.
import { DomainError } from "./errors.ts";

export type StrategyIssue = { readonly code: string; readonly path: string; readonly message: string };

export class CampaignContentInvalid extends DomainError {
  readonly issues: readonly StrategyIssue[];
  constructor(issues: readonly StrategyIssue[]) {
    super("CAMPAIGN_CONTENT_INVALID", "conteúdo da campanha inválido");
    this.issues = issues;
  }
}
export class CampaignNotActivatable extends DomainError {
  readonly issues: readonly StrategyIssue[];
  constructor(issues: readonly StrategyIssue[]) {
    super("CAMPAIGN_NOT_ACTIVATABLE", "a campanha não atende aos requisitos mínimos de ativação");
    this.issues = issues;
  }
}
export class ObjectiveInvalid extends DomainError {
  readonly issues: readonly StrategyIssue[];
  constructor(issues: readonly StrategyIssue[]) {
    super("OBJECTIVE_INVALID", "objetivo inválido");
    this.issues = issues;
  }
}
export class ObjectiveNotFound extends DomainError {
  constructor(mensagem = "objetivo não encontrado") { super("OBJECTIVE_NOT_FOUND", mensagem); }
}
export class ExperimentNotFound extends DomainError {
  constructor(mensagem = "teste não encontrado") { super("EXPERIMENT_NOT_FOUND", mensagem); }
}
export class TaskNotFound extends DomainError {
  constructor(mensagem = "tarefa não encontrada") { super("TASK_NOT_FOUND", mensagem); }
}
export class TaskInvalid extends DomainError {
  readonly issues: readonly StrategyIssue[];
  constructor(issues: readonly StrategyIssue[]) {
    super("TASK_INVALID", "tarefa inválida");
    this.issues = issues;
  }
}
export class CampaignNotFound extends DomainError {
  constructor(mensagem = "campanha não encontrada") { super("CAMPAIGN_NOT_FOUND", mensagem); }
}
export class CampaignTrackingKeyTaken extends DomainError {
  constructor(mensagem = "esta chave de rastreamento já é usada por outra campanha da empresa") {
    super("CAMPAIGN_TRACKING_KEY_TAKEN", mensagem);
  }
}
export class CampaignTrackingKeyImmutable extends DomainError {
  constructor(mensagem = "a chave de rastreamento não muda depois da ativação") {
    super("CAMPAIGN_TRACKING_KEY_IMMUTABLE", mensagem);
  }
}
export class HypothesisInvalid extends DomainError {
  readonly issues: readonly StrategyIssue[];
  constructor(issues: readonly StrategyIssue[]) {
    super("EXPERIMENT_HYPOTHESIS_INVALID", "hipótese do teste inválida");
    this.issues = issues;
  }
}
export class LearningInvalid extends DomainError {
  readonly issues: readonly StrategyIssue[];
  constructor(issues: readonly StrategyIssue[]) {
    super("EXPERIMENT_LEARNING_INVALID", "aprendizado do teste inválido");
    this.issues = issues;
  }
}
export class ExperimentResultInvalid extends DomainError {
  constructor(mensagem: string) { super("EXPERIMENT_RESULT_INVALID", mensagem); }
}
export class TaskDependencyCycle extends DomainError {
  constructor(mensagem = "a dependência criaria um ciclo entre tarefas") { super("TASK_DEPENDENCY_CYCLE", mensagem); }
}
export class TaskAssigneeInvalid extends DomainError {
  constructor(mensagem = "responsável inválido para a tarefa") { super("TASK_ASSIGNEE_INVALID", mensagem); }
}
export class UtmInvalid extends DomainError {
  constructor(mensagem: string) { super("UTM_INVALID", mensagem); }
}
