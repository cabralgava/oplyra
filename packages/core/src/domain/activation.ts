// Checklist de ativação (I-03, S4). Reflete FATOS reais do tenant, nunca marcação manual:
// cada passo é derivado do estado persistido (marca publicada, equipe convidada).
// Passos de incrementos futuros aparecem como `unavailable`, sem fingir progresso (14 §F-01).
export type ActivationStepKey = "brand_published" | "team_invited" | "objective_defined" | "media_connected";
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

export function montarChecklist(facts: ActivationFacts): ActivationChecklist {
  const steps: ActivationStep[] = [
    {
      key: "brand_published", label: "Cadastrar a marca mínima e publicar a versão 1", optional: false,
      state: facts.brandPublished ? "done" : "pending", href: "marca",
    },
    {
      key: "team_invited", label: "Convidar a equipe", optional: false,
      state: facts.teamInvited ? "done" : "pending", href: "equipe",
    },
    // Dependem de incrementos posteriores (I-04 objetivos, I-06 mídia): honestamente indisponíveis.
    { key: "objective_defined", label: "Definir o objetivo", optional: false, state: "unavailable", href: null },
    { key: "media_connected", label: "Conectar mídia", optional: true, state: "unavailable", href: null },
  ];
  const exigidos = steps.filter((s) => !s.optional && s.state !== "unavailable");
  const feitos = exigidos.filter((s) => s.state === "done").length;
  return {
    steps, done: feitos, total: exigidos.length, complete: feitos === exigidos.length,
    next: exigidos.find((s) => s.state === "pending") ?? null,
  };
}
