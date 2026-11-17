// Estratégia e Operação (I-04) — campanha, teste por hipótese, tarefa e rastreamento.
// Linguagem ubíqua: *campanha*, *método* (situação, dor, consequência, desejo, mecanismo, prova,
// oferta — DEC-017), *chave de rastreamento*, *hipótese*, *dimensão variada*, *aprendizado*.
// Domínio puro: sem SDK, banco ou framework.
//
// Invariantes protegidas aqui (o banco as repetirá como defesa em profundidade):
//  - ativar exige os sete elementos do método e uma chave de rastreamento válida (TST-30);
//  - a chave de rastreamento não muda depois da ativação (I-CMP);
//  - o teste declara hipótese e dimensão variada ANTES de executar; variação cosmética não é teste (I-HYP);
//  - resultado sem amostra suficiente é inconclusivo, nunca sucesso (I-HYP);
//  - aprendizado cita a evidência e a versão da campanha;
//  - dependências de tarefa não formam ciclo; responsável agente só se habilitado;
//  - UTM usa a chave de rastreamento como utm_campaign (06 §11.1); o formato restrito dos valores
//    reduz, mas não comprova, a ausência de PII.
import type { CampaignId, ExperimentId, ObjectiveId, ProductKey, TaskId, TenantId, UserId } from "./ids.ts";
import {
  CampaignContentInvalid, CampaignNotActivatable, CampaignTrackingKeyImmutable, ExperimentResultInvalid,
  HypothesisInvalid, ObjectiveInvalid, TaskAssigneeInvalid, TaskDependencyCycle, TaskInvalid, UtmInvalid,
  type StrategyIssue,
} from "./strategy-errors.ts";

const issue = (code: string, path: string, message: string): StrategyIssue => ({ code, path, message });
const vazio = (s: string): boolean => s.trim().length === 0;

// ───────────────────────── Campanha ─────────────────────────

/** Os sete elementos estruturados antes da produção (DEC-017). */
export const ELEMENTOS_DO_METODO = [
  "situation", "pain", "consequence", "desire", "mechanism", "proof", "offer",
] as const;
export type MethodElement = (typeof ELEMENTOS_DO_METODO)[number];
export type CampaignMethod = Readonly<Record<MethodElement, string>>;

/**
 * Estados internos. Vocabulário exibido (14 §5): draft = Planejada · active = Ativa · paused = Pausada ·
 * completed = Concluída · cancelled = Cancelada.
 */
export type CampaignStatus = "draft" | "active" | "paused" | "completed" | "cancelled";

export type CampaignContent = {
  readonly name: string;
  /** Objetivo da MESMA empresa (I-CMP); a FK composta repete a regra no banco. */
  readonly objectiveId: ObjectiveId | null;
  /** Produto da marca vigente da MESMA empresa; nulo quando a campanha é geral. */
  readonly productKey: ProductKey | null;
  readonly method: CampaignMethod;
  /** Única por empresa; vira o utm_campaign. Imutável depois da ativação. */
  readonly trackingKey: string;
};

export type Campaign = CampaignContent & {
  readonly id: CampaignId;
  readonly tenantId: TenantId;
  readonly status: CampaignStatus;
  /** Contador de gravações; controle de concorrência otimista. */
  readonly revision: number;
  readonly createdBy: UserId;
  readonly createdAt: Date;
  readonly activatedAt: Date | null;
};

/**
 * Ciclo de vida: planejada → ativa ⇄ pausada → concluída; cancelar vale de qualquer estado não
 * terminal. Concluída e cancelada são terminais e mantêm a chave reservada. Ativar não publica
 * anúncio (DEC-016): é o estado interno que fixa a chave de rastreamento para os UTMs.
 */
const TRANSICOES: Readonly<Record<CampaignStatus, readonly CampaignStatus[]>> = {
  draft: ["active", "cancelled"],
  active: ["paused", "completed", "cancelled"],
  paused: ["active", "completed", "cancelled"],
  completed: [],
  cancelled: [],
};
export const transicaoPermitida = (de: CampaignStatus, para: CampaignStatus): boolean => TRANSICOES[de].includes(para);

export const LIMITES_DA_CAMPANHA = Object.freeze({
  name: 160, methodElement: 1000, trackingKeyMin: 3, trackingKeyMax: 60,
});

// Slug minúsculo com hífens: seguro em URL, sem espaço, acento ou '@'. Restringir o formato reduz o
// risco de PII em UTM, mas NÃO o elimina: um nome ("ana-souza") é um slug válido. A ausência de PII
// não é garantida por esta validação (07/DP-27).
const CHAVE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const chaveDeRastreamentoValida = (k: string): boolean =>
  k.length >= LIMITES_DA_CAMPANHA.trackingKeyMin && k.length <= LIMITES_DA_CAMPANHA.trackingKeyMax && CHAVE.test(k);

export const metodoVazio = (): CampaignMethod => ({
  situation: "", pain: "", consequence: "", desire: "", mechanism: "", proof: "", offer: "",
});

/** Regras estruturais, válidas para qualquer gravação do rascunho (mesmo incompleto). */
export function problemasEstruturaisDaCampanha(c: CampaignContent): StrategyIssue[] {
  const out: StrategyIssue[] = [];
  if (c.name.length > LIMITES_DA_CAMPANHA.name) out.push(issue("TEXT_TOO_LONG", "name", `máximo de ${LIMITES_DA_CAMPANHA.name} caracteres`));
  for (const el of ELEMENTOS_DO_METODO) {
    if (c.method[el].length > LIMITES_DA_CAMPANHA.methodElement) {
      out.push(issue("TEXT_TOO_LONG", `method.${el}`, `máximo de ${LIMITES_DA_CAMPANHA.methodElement} caracteres`));
    }
  }
  if (c.trackingKey !== "" && !chaveDeRastreamentoValida(c.trackingKey)) {
    out.push(issue("TRACKING_KEY_INVALID", "trackingKey", "use de 3 a 60 caracteres: letras minúsculas, números e hífens"));
  }
  return out;
}

/** Requisitos para ATIVAR, além dos estruturais (TST-30: método completo). */
export function problemasDeAtivacaoDaCampanha(c: CampaignContent): StrategyIssue[] {
  const out = problemasEstruturaisDaCampanha(c);
  if (vazio(c.name)) out.push(issue("NAME_REQUIRED", "name", "informe o nome da campanha"));
  for (const el of ELEMENTOS_DO_METODO) {
    if (vazio(c.method[el])) out.push(issue("METHOD_ELEMENT_REQUIRED", `method.${el}`, `informe: ${el}`));
  }
  if (c.trackingKey === "") out.push(issue("TRACKING_KEY_REQUIRED", "trackingKey", "informe a chave de rastreamento"));
  return out;
}

export function exigirCampanhaValida(c: CampaignContent): void {
  const problemas = problemasEstruturaisDaCampanha(c);
  if (problemas.length) throw new CampaignContentInvalid(problemas);
}

export function exigirCampanhaAtivavel(c: CampaignContent): void {
  const problemas = problemasDeAtivacaoDaCampanha(c);
  if (problemas.length) throw new CampaignNotActivatable(problemas);
}

/**
 * A chave pode mudar enquanto a campanha é rascunho; ativa ou arquivada, nunca
 * (arquivada já foi ativa e seus UTMs circulam).
 */
export function exigirChaveEstavel(
  campanha: Pick<Campaign, "status" | "trackingKey">, novaChave: string,
): void {
  if (campanha.status !== "draft" && campanha.trackingKey !== novaChave) throw new CampaignTrackingKeyImmutable();
}

// ───────────────────────── Teste por hipótese (I-HYP) ─────────────────────────

/** Dimensões que um teste pode variar (DEC-017). `other` exige descrição. */
export const DIMENSOES = ["angle", "pain", "hook", "proof", "visual", "cta", "other"] as const;
export type ExperimentDimension = (typeof DIMENSOES)[number];

export type ExperimentPlan = {
  readonly hypothesis: string;
  readonly dimension: ExperimentDimension;
  /** Obrigatória em `other`: o que exatamente varia. */
  readonly dimensionNote: string;
  /** O que de fato difere entre as variantes; "texto do botão em azul" não é hipótese. */
  readonly variants: readonly string[];
  /** Métrica de decisão; prioriza as comerciais disponíveis (DEC-017). */
  readonly decisionMetric: string;
  /** Observações mínimas para qualquer conclusão além de "inconclusivo". */
  readonly minimumSample: number;
};

export const LIMITES_DO_TESTE = Object.freeze({
  hypothesis: 1000, dimensionNote: 300, variant: 500, decisionMetric: 120, variants: 10,
});

export function problemasDaHipotese(p: ExperimentPlan): StrategyIssue[] {
  const out: StrategyIssue[] = [];
  if (vazio(p.hypothesis)) out.push(issue("HYPOTHESIS_REQUIRED", "hypothesis", "declare a hipótese antes de executar"));
  else if (p.hypothesis.length > LIMITES_DO_TESTE.hypothesis) out.push(issue("TEXT_TOO_LONG", "hypothesis", `máximo de ${LIMITES_DO_TESTE.hypothesis} caracteres`));
  if (!(DIMENSOES as readonly string[]).includes(p.dimension)) out.push(issue("DIMENSION_INVALID", "dimension", "dimensão desconhecida"));
  else if (p.dimension === "other" && vazio(p.dimensionNote)) out.push(issue("DIMENSION_NOTE_REQUIRED", "dimensionNote", "descreva a dimensão variada"));
  if (p.dimensionNote.length > LIMITES_DO_TESTE.dimensionNote) out.push(issue("TEXT_TOO_LONG", "dimensionNote", `máximo de ${LIMITES_DO_TESTE.dimensionNote} caracteres`));
  if (p.variants.length < 2) out.push(issue("VARIANTS_REQUIRED", "variants", "um teste compara ao menos duas variantes"));
  if (p.variants.length > LIMITES_DO_TESTE.variants) out.push(issue("LIMIT_EXCEEDED", "variants", `máximo de ${LIMITES_DO_TESTE.variants} variantes`));
  const vistas = new Set<string>();
  p.variants.forEach((v, i) => {
    const chave = v.trim().toLowerCase();
    if (chave === "") out.push(issue("VARIANT_EMPTY", `variants[${i}]`, "descreva a variante"));
    else if (vistas.has(chave)) out.push(issue("VARIANT_DUPLICATE", `variants[${i}]`, "variante repetida: sem diferença não há teste"));
    vistas.add(chave);
    if (v.length > LIMITES_DO_TESTE.variant) out.push(issue("TEXT_TOO_LONG", `variants[${i}]`, `máximo de ${LIMITES_DO_TESTE.variant} caracteres`));
  });
  if (vazio(p.decisionMetric)) out.push(issue("DECISION_METRIC_REQUIRED", "decisionMetric", "informe a métrica de decisão"));
  else if (p.decisionMetric.length > LIMITES_DO_TESTE.decisionMetric) out.push(issue("TEXT_TOO_LONG", "decisionMetric", `máximo de ${LIMITES_DO_TESTE.decisionMetric} caracteres`));
  if (!Number.isSafeInteger(p.minimumSample) || p.minimumSample < 1) out.push(issue("MINIMUM_SAMPLE_INVALID", "minimumSample", "a amostra mínima é um inteiro de 1 em diante"));
  return out;
}

/** Ao registrar o plano (antes de executar). */
export function exigirHipoteseValida(p: ExperimentPlan): void {
  const problemas = problemasDaHipotese(p);
  if (problemas.length) throw new HypothesisInvalid(problemas);
}

export type ExperimentOutcome = "supported" | "refuted" | "inconclusive";

export type ExperimentResult = {
  readonly outcome: ExperimentOutcome;
  /** Observações efetivamente coletadas para a métrica de decisão. */
  readonly observedSample: number;
  /** Limitações conhecidas (atribuição estimada, janela curta, dado parcial…). */
  readonly limitations: string;
};

/**
 * Resultado sem dado suficiente é inconclusivo, não sucesso (I-HYP). Quem conclui `supported` ou
 * `refuted` com amostra abaixo do mínimo declarado no plano é recusado, em vez de ser rebaixado em
 * silêncio: a decisão de rebaixar é de quem registra, e a recusa deixa isso visível.
 */
export function exigirResultadoCoerente(plano: Pick<ExperimentPlan, "minimumSample">, r: ExperimentResult): void {
  if (!["supported", "refuted", "inconclusive"].includes(r.outcome)) throw new ExperimentResultInvalid("resultado desconhecido");
  if (!Number.isSafeInteger(r.observedSample) || r.observedSample < 0) throw new ExperimentResultInvalid("a amostra observada é um inteiro não negativo");
  if (r.outcome !== "inconclusive" && r.observedSample < plano.minimumSample) {
    throw new ExperimentResultInvalid(`amostra insuficiente (${r.observedSample} de ${plano.minimumSample}): registre como inconclusivo`);
  }
  if (r.outcome === "inconclusive" && vazio(r.limitations)) {
    throw new ExperimentResultInvalid("resultado inconclusivo exige a limitação que impediu a conclusão");
  }
}

export type Learning = {
  readonly summary: string;
  /** Evidência (texto ou URL http/https) que sustenta o aprendizado. */
  readonly evidence: readonly string[];
  /** Versão da campanha/da marca em que o aprendizado foi obtido. */
  readonly campaignVersion: number;
};

export function problemasDoAprendizado(l: Learning): StrategyIssue[] {
  const out: StrategyIssue[] = [];
  if (vazio(l.summary)) out.push(issue("LEARNING_SUMMARY_REQUIRED", "summary", "registre o aprendizado"));
  if (l.evidence.length === 0 || l.evidence.some(vazio)) out.push(issue("LEARNING_EVIDENCE_REQUIRED", "evidence", "aprendizado exige evidência"));
  if (!Number.isSafeInteger(l.campaignVersion) || l.campaignVersion < 1) out.push(issue("LEARNING_VERSION_REQUIRED", "campaignVersion", "informe a versão a que o aprendizado se refere"));
  return out;
}

// ───────────────────────── Objetivo e indicadores ─────────────────────────
// PROPOSTA local: 01 §4.1 e 14 §2–3 dizem apenas "objetivos, metas e indicadores", "objetivo
// principal" e "indicadores com alvo". Modelo mínimo, a confirmar com o proprietário.

export type Kpi = {
  /** Identidade estável dentro do objetivo (slug). */
  readonly key: string;
  readonly name: string;
  /** Métrica comercial ou de mídia medida (ex.: "reuniões marcadas"); texto livre nesta proposta. */
  readonly metric: string;
  readonly unit: string;
  /** Alvo numérico finito e positivo no fim do período. */
  readonly target: number;
};

export type ObjectiveStatus = "active" | "archived";

export type ObjectiveContent = {
  readonly name: string;
  readonly description: string;
  /** Datas civis ISO (AAAA-MM-DD) no fuso da empresa. */
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly kpis: readonly Kpi[];
};

export type Objective = ObjectiveContent & {
  readonly id: ObjectiveId;
  readonly tenantId: TenantId;
  readonly status: ObjectiveStatus;
  /** No máximo um principal ativo por empresa (14 §3 "objetivo principal"). */
  readonly primary: boolean;
  readonly revision: number;
  readonly createdBy: UserId;
  readonly createdAt: Date;
};

export const LIMITES_DO_OBJETIVO = Object.freeze({
  name: 160, description: 1000, kpis: 10, kpiName: 120, kpiMetric: 120, kpiUnit: 30, kpiKey: 40,
});

const DATA_CIVIL = /^\d{4}-\d{2}-\d{2}$/;
function dataCivilValida(s: string): boolean {
  if (!DATA_CIVIL.test(s)) return false;
  const [a, m, d] = s.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** O objetivo é sempre completo: nome, período e ao menos um indicador com alvo. */
export function problemasDoObjetivo(o: ObjectiveContent): StrategyIssue[] {
  const out: StrategyIssue[] = [];
  const L = LIMITES_DO_OBJETIVO;
  if (vazio(o.name)) out.push(issue("NAME_REQUIRED", "name", "informe o nome do objetivo"));
  else if (o.name.length > L.name) out.push(issue("TEXT_TOO_LONG", "name", `máximo de ${L.name} caracteres`));
  if (o.description.length > L.description) out.push(issue("TEXT_TOO_LONG", "description", `máximo de ${L.description} caracteres`));
  const iniOk = dataCivilValida(o.periodStart), fimOk = dataCivilValida(o.periodEnd);
  if (!iniOk) out.push(issue("PERIOD_INVALID", "periodStart", "informe uma data válida (AAAA-MM-DD)"));
  if (!fimOk) out.push(issue("PERIOD_INVALID", "periodEnd", "informe uma data válida (AAAA-MM-DD)"));
  if (iniOk && fimOk && o.periodEnd < o.periodStart) out.push(issue("PERIOD_INVALID", "periodEnd", "o fim não pode ser anterior ao início"));
  if (o.kpis.length === 0) out.push(issue("KPI_REQUIRED", "kpis", "defina ao menos um indicador"));
  if (o.kpis.length > L.kpis) out.push(issue("LIMIT_EXCEEDED", "kpis", `máximo de ${L.kpis} indicadores`));
  const chaves = new Set<string>();
  o.kpis.forEach((k, i) => {
    const base = `kpis[${i}]`;
    if (!CHAVE.test(k.key) || k.key.length > L.kpiKey) out.push(issue("KPI_KEY_INVALID", `${base}.key`, "chave em minúsculas, números e hífens, até 40 caracteres"));
    else if (chaves.has(k.key)) out.push(issue("KPI_KEY_DUPLICATE", `${base}.key`, "indicador repetido"));
    chaves.add(k.key);
    if (vazio(k.name)) out.push(issue("KPI_NAME_REQUIRED", `${base}.name`, "informe o nome do indicador"));
    else if (k.name.length > L.kpiName) out.push(issue("TEXT_TOO_LONG", `${base}.name`, `máximo de ${L.kpiName} caracteres`));
    if (vazio(k.metric)) out.push(issue("KPI_METRIC_REQUIRED", `${base}.metric`, "informe a métrica"));
    else if (k.metric.length > L.kpiMetric) out.push(issue("TEXT_TOO_LONG", `${base}.metric`, `máximo de ${L.kpiMetric} caracteres`));
    if (vazio(k.unit)) out.push(issue("KPI_UNIT_REQUIRED", `${base}.unit`, "informe a unidade"));
    else if (k.unit.length > L.kpiUnit) out.push(issue("TEXT_TOO_LONG", `${base}.unit`, `máximo de ${L.kpiUnit} caracteres`));
    if (typeof k.target !== "number" || !Number.isFinite(k.target) || k.target <= 0) out.push(issue("KPI_TARGET_INVALID", `${base}.target`, "o alvo é um número positivo"));
  });
  return out;
}

export function exigirObjetivoValido(o: ObjectiveContent): void {
  const problemas = problemasDoObjetivo(o);
  if (problemas.length) throw new ObjectiveInvalid(problemas);
}

// ───────────────────────── Teste: ciclo de vida ─────────────────────────

/** Planejado (hipótese registrada) → em execução → concluído; cancelável antes de concluir. */
export type ExperimentStatus = "planned" | "running" | "concluded" | "cancelled";

const TRANSICOES_DO_TESTE: Readonly<Record<ExperimentStatus, readonly ExperimentStatus[]>> = {
  planned: ["running", "cancelled"], running: ["concluded", "cancelled"], concluded: [], cancelled: [],
};
export const transicaoDoTestePermitida = (de: ExperimentStatus, para: ExperimentStatus): boolean =>
  TRANSICOES_DO_TESTE[de].includes(para);

export type Experiment = {
  readonly id: ExperimentId;
  readonly tenantId: TenantId;
  readonly campaignId: CampaignId;
  readonly plan: ExperimentPlan;
  readonly status: ExperimentStatus;
  readonly result: ExperimentResult | null;
  readonly learning: Learning | null;
  readonly revision: number;
  readonly createdBy: UserId;
  readonly createdAt: Date;
  /** Instante em que passou a `running`; a hipótese precisa preceder este instante (I-HYP). */
  readonly startedAt: Date | null;
  readonly concludedAt: Date | null;
};

// ───────────────────────── Tarefas ─────────────────────────

export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";

const TRANSICOES_DA_TAREFA: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  todo: ["in_progress", "cancelled"],
  in_progress: ["todo", "done", "cancelled"],
  done: ["in_progress"],
  cancelled: [],
};
export const transicaoDaTarefaPermitida = (de: TaskStatus, para: TaskStatus): boolean =>
  TRANSICOES_DA_TAREFA[de].includes(para);

export type TaskContent = {
  readonly title: string;
  readonly description: string;
  /** Campanha da MESMA empresa; nula para tarefa avulsa. */
  readonly campaignId: CampaignId | null;
  /** Data civil ISO (AAAA-MM-DD) ou nula. */
  readonly dueDate: string | null;
  readonly assignee: TaskAssignee | null;
  readonly dependsOn: readonly TaskId[];
};

export type Task = TaskContent & {
  readonly id: TaskId;
  readonly tenantId: TenantId;
  readonly status: TaskStatus;
  readonly revision: number;
  readonly createdBy: UserId;
  readonly createdAt: Date;
};

export const LIMITES_DA_TAREFA = Object.freeze({ title: 200, description: 2000, dependencies: 50 });

export function problemasDaTarefa(t: TaskContent): StrategyIssue[] {
  const out: StrategyIssue[] = [];
  const L = LIMITES_DA_TAREFA;
  if (vazio(t.title)) out.push(issue("TITLE_REQUIRED", "title", "informe o título da tarefa"));
  else if (t.title.length > L.title) out.push(issue("TEXT_TOO_LONG", "title", `máximo de ${L.title} caracteres`));
  if (t.description.length > L.description) out.push(issue("TEXT_TOO_LONG", "description", `máximo de ${L.description} caracteres`));
  if (t.dueDate !== null && !dataCivilValida(t.dueDate)) out.push(issue("DUE_DATE_INVALID", "dueDate", "informe uma data válida (AAAA-MM-DD)"));
  if (t.dependsOn.length > L.dependencies) out.push(issue("LIMIT_EXCEEDED", "dependsOn", `máximo de ${L.dependencies} dependências`));
  if (new Set(t.dependsOn).size !== t.dependsOn.length) out.push(issue("DEPENDENCY_DUPLICATE", "dependsOn", "dependência repetida"));
  return out;
}

export function exigirTarefaValida(t: TaskContent): void {
  const problemas = problemasDaTarefa(t);
  if (problemas.length) throw new TaskInvalid(problemas);
}

export type TaskAssignee =
  | { readonly kind: "user"; readonly userId: string }
  | { readonly kind: "agent"; readonly agentKey: string };

/**
 * Responsável agente só se o agente estiver habilitado para a empresa (entitlement); a lista
 * vem da porta de capacidades, nunca de condicional por plano no domínio.
 */
export function exigirResponsavelValido(a: TaskAssignee | null, agentesHabilitados: ReadonlySet<string>): void {
  if (a === null) return;
  if (a.kind === "agent" && !agentesHabilitados.has(a.agentKey)) {
    throw new TaskAssigneeInvalid(`o agente ${a.agentKey} não está habilitado para esta empresa`);
  }
  if (a.kind === "user" && vazio(a.userId)) throw new TaskAssigneeInvalid();
}

/** Mapa tarefa → tarefas de que ela depende. */
export type DependencyGraph = ReadonlyMap<TaskId, readonly TaskId[]>;

/**
 * Valida que `tarefa` passar a depender de `dependencias` não cria ciclo. Auto-dependência é um
 * ciclo de tamanho 1. Dependência fora do grafo conhecido é aceita aqui (a existência e o tenant
 * são conferidos pela persistência).
 */
export function exigirSemCiclo(grafo: DependencyGraph, tarefa: TaskId, dependencias: readonly TaskId[]): void {
  const alcanca = new Set<TaskId>();
  const pilha: TaskId[] = [...dependencias];
  while (pilha.length) {
    const atual = pilha.pop()!;
    if (atual === tarefa) throw new TaskDependencyCycle();
    if (alcanca.has(atual)) continue;
    alcanca.add(atual);
    for (const prox of grafo.get(atual) ?? []) pilha.push(prox);
  }
}

// ───────────────────────── UTM (06 §11.1) ─────────────────────────

/** Versão da regra de normalização; é guardada junto do valor original. */
export const REGRA_DE_UTM = "utm-1";

/**
 * Canal → utm_source/utm_medium. PROPOSTA inicial para SaaS B2B (06 §11.1 deixa source/medium
 * "por canal/versão" sem tabela); alterar exige nova versão da regra.
 */
export const CANAIS_DE_UTM = Object.freeze({
  meta_ads: { source: "meta", medium: "paid-social" },
  google_ads: { source: "google", medium: "cpc" },
  linkedin_ads: { source: "linkedin", medium: "paid-social" },
  email: { source: "email", medium: "email" },
} as const);
export type UtmChannel = keyof typeof CANAIS_DE_UTM;

export type UtmResult = {
  readonly url: string;
  readonly params: Readonly<Record<"utm_source" | "utm_medium" | "utm_campaign" | "utm_content", string>>;
  readonly originalUrl: string;
  readonly ruleVersion: typeof REGRA_DE_UTM;
};

const CONTEUDO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// `URL` é padrão WHATWG em Node, navegadores e workers, mas o núcleo não carrega DOM nem tipos do
// Node (regra de dependência). Declara-se só a parte usada; a declaração não gera código.
interface UrlWhatwg {
  protocol: string; username: string; password: string; hash: string;
  readonly searchParams: { keys(): Iterable<string>; set(nome: string, valor: string): void };
  toString(): string;
}
declare const URL: new (url: string) => UrlWhatwg;

/**
 * Gera a URL com UTMs. `content` identifica a versão da entrega (por exemplo `v2` ou `hook-a-v2`) e
 * segue o mesmo formato restrito da chave, o que barra e-mail e texto livre, mas não impede que um
 * nome próprio em slug passe: a ausência de PII não é garantida aqui. Parâmetros utm_* já presentes na URL são recusados, não sobrescritos em silêncio.
 */
export function gerarUtm(e: { baseUrl: string; channel: UtmChannel; trackingKey: string; content: string }): UtmResult {
  const canal = CANAIS_DE_UTM[e.channel];
  if (!canal) throw new UtmInvalid("canal desconhecido");
  if (!chaveDeRastreamentoValida(e.trackingKey)) throw new UtmInvalid("chave de rastreamento inválida");
  if (!CONTEUDO.test(e.content) || e.content.length > 60) throw new UtmInvalid("utm_content deve ser um slug de até 60 caracteres");
  let alvo: UrlWhatwg;
  try { alvo = new URL(e.baseUrl); } catch { throw new UtmInvalid("URL de destino inválida"); }
  if (alvo.protocol !== "https:" && alvo.protocol !== "http:") throw new UtmInvalid("a URL de destino deve ser http ou https");
  if (alvo.username !== "" || alvo.password !== "") throw new UtmInvalid("a URL de destino não pode conter credenciais");
  for (const nome of alvo.searchParams.keys()) {
    if (nome.toLowerCase().startsWith("utm_")) throw new UtmInvalid(`a URL de destino já contém ${nome}`);
  }
  const params = {
    utm_source: canal.source, utm_medium: canal.medium, utm_campaign: e.trackingKey, utm_content: e.content,
  } as const;
  const final = new URL(alvo.toString());
  for (const [k, v] of Object.entries(params)) final.searchParams.set(k, v);
  return { url: final.toString(), params, originalUrl: e.baseUrl, ruleVersion: REGRA_DE_UTM };
}
