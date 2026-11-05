// Checklist de ativação (I-03 S4, ampliado no I-04). Reflete FATOS reais do tenant, nunca marcação manual:
// cada passo é derivado do estado persistido (marca publicada, objetivo, equipe, campanha).
// Passos de incrementos futuros aparecem como `unavailable`, sem fingir progresso (14 §F-01).
export type ActivationStepKey =
  | "brand_published" | "objective_defined" | "team_invited" | "campaign_created" | "media_connected" | "copy_requested";
export type ActivationStepState = "done" | "pending" | "unavailable";

export type ActivationStep = {
  readonly key: ActivationStepKey;
  readonly label: string;
  readonly state: ActivationStepState;
  readonly optional: boolean;
  /** Rota relativa à empresa em que o passo se resolve; ausente quando indisponível. */
  readonly href: string | null;
};

/** Fatos lidos do estado real da empresa. */
export type ActivationFacts = {
  /** Existe ao menos uma versão publicada da marca. */
  readonly brandPublished: boolean;
  /** Já houve convite, ou a empresa tem mais de uma pessoa ativa. */
  readonly teamInvited: boolean;
  /** Existe ao menos um objetivo (ativo ou arquivado). */
  readonly objectiveDefined: boolean;
  /** Existe ao menos uma campanha, em qualquer estado. */
  readonly campaignCreated: boolean;
};

export type ActivationChecklist = {
  readonly steps: readonly ActivationStep[];
  /** Quantos passos disponíveis e obrigatórios já estão feitos, e o total deles. */
  readonly done: number;
  readonly total: number;
  readonly complete: boolean;
  /** Passo obrigatório e disponível mais importante ainda pendente; nulo se não houver. */
  readonly next: ActivationStep | null;
};

const estado = (feito: boolean): ActivationStepState => (feito ? "done" : "pending");

export function montarChecklist(facts: ActivationFacts): ActivationChecklist {
  const steps: ActivationStep[] = [
    { key: "brand_published", label: "Cadastrar a marca mínima e publicar a versão 1", optional: false, state: estado(facts.brandPublished), href: "marca" },
    { key: "objective_defined", label: "Definir o objetivo", optional: false, state: estado(facts.objectiveDefined), href: "estrategia" },
    { key: "team_invited", label: "Convidar a equipe", optional: false, state: estado(facts.teamInvited), href: "equipe" },
    { key: "campaign_created", label: "Criar a primeira campanha", optional: false, state: estado(facts.campaignCreated), href: "campanhas" },
    // Dependem de incrementos posteriores (I-06 mídia, I-05 copy): honestamente indisponíveis.
    { key: "media_connected", label: "Conectar mídia", optional: true, state: "unavailable", href: null },
    { key: "copy_requested", label: "Pedir a primeira copy", optional: false, state: "unavailable", href: null },
  ];
  const exigidos = steps.filter((s) => !s.optional && s.state !== "unavailable");
  const feitos = exigidos.filter((s) => s.state === "done").length;
  return {
    steps, done: feitos, total: exigidos.length, complete: feitos === exigidos.length,
    next: exigidos.find((s) => s.state === "pending") ?? null,
  };
}
