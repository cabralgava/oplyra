// Ponto único de importação do Product Agent Runtime para a web (I-02, 14 F-10). Os `package.json` de core e infra são
// artefatos governados e ainda não têm as entradas `@oplyra/core/runtime` e `@oplyra/infra/runtime` (evolução governada
// pendente): o caminho relativo fica ISOLADO aqui. Além disso, funções puras de apresentação, testadas fora do navegador.
import type { AgentRun, RunStatus, StepRecord } from "../../../../packages/core/src/runtime/domain.ts";
import { ERRO_EFEITO_INCERTO } from "../../../../packages/core/src/runtime/domain.ts";
export type { AgentRun, RunStatus, StepRecord } from "../../../../packages/core/src/runtime/domain.ts";export type { RuntimeDeps } from "../../../../packages/core/src/runtime/ports.ts";
export {
  listRuns, getRun, cancelRun, activateKillSwitch, releaseKillSwitch, getKillSwitchStatus,
} from "../../../../packages/core/src/runtime/use-cases.ts";
export { FormularioInvalido, destinoDeErro } from "./marca-form";

export const ROTULO_EXECUCAO: Record<RunStatus, string> = {
  queued: "Na fila", running: "Em execução", waiting_approval: "Aguardando aprovação", completed: "Concluída", failed: "Falhou", cancelled: "Cancelada",
};
/** Classes de selo já existentes no CSS global (sem depender só de cor: o rótulo sempre acompanha). */
export const SELO_EXECUCAO: Record<RunStatus, string> = {
  queued: "selo pendente", running: "selo pendente", waiting_approval: "selo pendente", completed: "selo ok", failed: "selo proibido", cancelled: "selo proibido",
};
export const ROTULO_GATILHO: Record<AgentRun["trigger"], string> = { user: "Pessoa", event: "Evento", schedule: "Agendamento", agent: "Outro agente" };
export const ROTULO_AUTONOMIA: Record<AgentRun["autonomy"], string> = {
  recommend: "Recomenda", draft: "Prepara rascunho", approval_required: "Exige aprovação", policy_execute: "Executa por política",
};
export const ESTADOS_ABERTOS: readonly RunStatus[] = ["queued", "running", "waiting_approval"];
export const FILTROS = ["todas", "abertas", "falhas", "concluidas"] as const;
export type Filtro = (typeof FILTROS)[number];

export const MENSAGENS_EXECUCAO: Record<string, string> = {
  PERMISSION_DENIED: "Seu papel não permite esta ação.",
  FORMULARIO_INVALIDO: "O formulário enviado é inválido. Recarregue a página e tente de novo.",
  RUN_NOT_FOUND: "Execução não encontrada nesta empresa.",
  INVALID_STATE_TRANSITION: "Esta execução já terminou ou mudou de estado. Recarregue a página.",
  RUN_REJECTED: "Informe o motivo para continuar.",
};

export const LIMITE_PADRAO = 50;
export const LIMITE_MAXIMO = 199;       // o servidor devolve no máximo 200; pede-se 1 a mais para saber se há excedente
/** Limite da URL: inteiro positivo, em múltiplos do passo, limitado ao máximo. Qualquer outra coisa vira o padrão. */
export function lerLimite(v: string | undefined): number {
  if (v === undefined || !/^\d{1,4}$/.test(v)) return LIMITE_PADRAO;
  const n = Number(v);
  return n < LIMITE_PADRAO ? LIMITE_PADRAO : Math.min(LIMITE_MAXIMO, n);
}
export const proximoLimite = (atual: number): number | null => (atual >= LIMITE_MAXIMO ? null : Math.min(LIMITE_MAXIMO, atual + LIMITE_PADRAO));
/** Separa o que se mostra do excedente: recebeu `limite + 1` itens no máximo. */
export function paginar<T>(itens: readonly T[], limite: number): { visiveis: T[]; haMais: boolean } {
  return { visiveis: itens.slice(0, limite), haMais: itens.length > limite };
}

/** Valor inesperado na URL vira o filtro padrão: nunca erro de página. */
export function lerFiltro(v: string | undefined): Filtro {
  return (FILTROS as readonly string[]).includes(v ?? "") ? (v as Filtro) : "todas";
}

export function filtrar(runs: readonly AgentRun[], f: Filtro): AgentRun[] {
  switch (f) {
    case "abertas": return runs.filter((r) => ESTADOS_ABERTOS.includes(r.status));
    case "falhas": return runs.filter((r) => r.status === "failed" || r.status === "cancelled");
    case "concluidas": return runs.filter((r) => r.status === "completed");
    default: return [...runs];
  }
}

/** Execuções que pedem uma pessoa: falharam e o runtime marcou escalonamento (14 F-10 "escalonamentos"). */
export const escalonadas = (runs: readonly AgentRun[]): AgentRun[] => runs.filter((r) => r.status === "failed" && r.needsHuman);

/** Custo em micro-USD → "US$ 0,0123". Sem arredondar para cima o que o runtime registrou. */
export function formatarCusto(micro: number): string {
  const [inteiro, fracao] = (micro / 1_000_000).toFixed(6).split(".") as [string, string];
  return `US$ ${inteiro},${fracao.replace(/0+$/, "").padEnd(2, "0")}`;
}

/** Duração entre início e fim (ou agora); sem início, "—". */
export function formatarDuracao(inicio: Date | null, fim: Date | null, agora: Date): string {
  if (!inicio) return "—";
  const s = Math.max(0, Math.round(((fim ?? agora).getTime() - inicio.getTime()) / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min ${s % 60} s` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** O "objeto" da execução (14 F-10): tarefa ou fluxo ao qual ela pertence; senão, a ação. */
export const objetoDaExecucao = (r: AgentRun): string => r.taskId ? `Tarefa ${r.taskId.slice(0, 8)}` : r.workflowId ? `Fluxo ${r.workflowId}` : r.actionKey;

export type ResumoDePassos = { total: number; concluidos: number; abortados: number; emAberto: number };
export function resumirPassos(passos: readonly StepRecord[]): ResumoDePassos {
  const concluidos = passos.filter((p) => p.checkpoint !== null).length;
  const abortados = passos.filter((p) => p.checkpoint === null && p.abortedAt !== null).length;
  return { total: passos.length, concluidos, abortados, emAberto: passos.length - concluidos - abortados };
}

export type VeredictoDeCopy = "passed" | "passed_with_notes" | "changes_required" | "blocked";
export const ROTULO_VEREDITO: Record<VeredictoDeCopy, string> = {
  passed: "Sem achados nas regras determinísticas", passed_with_notes: "Com avisos", changes_required: "Exige ajustes", blocked: "Bloqueado",
};
export type RascunhoDeCopy = {
  veredito: VeredictoDeCopy;
  achados: { regra: string; gravidade: string; variante: string | null; mensagem: string }[];
  variantes: { id: string; titulo: string; texto: string; cta: string; papel: string | null }[];
  /** Referência do rascunho gravado; `null` enquanto a gravação não aconteceu. */
  rascunho: string | null;
  /** Revisão independente (só a parte determinística dos gates); vazia se o passo `review` não existe. */
  revisoes: { gate: string; status: string; revisor: string; limitacao: string | null }[];
};
export const ROTULO_GATE: Record<string, string> = { claim_gate: "Afirmações", brand_gate: "Marca" };
export const ROTULO_STATUS_GATE: Record<string, string> = {
  passed: "Passou", passed_with_notes: "Passou com notas", changes_required: "Exige ajustes", blocked: "Bloqueado", escalation_required: "Exige escalonamento",
};
const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Rascunho de copy a partir dos checkpoints do run (passos `verify` e `persist` do workflow de copy). Fonte provisória: as
 * tabelas `content.*` só são legíveis pelo worker, sem leitura por pessoa. Nunca expõe aprovação: ela não existe.
 */
export function rascunhoDeCopy(passos: readonly StepRecord[]): RascunhoDeCopy | null {
  const verificacao = passos.find((p) => p.stepKey === "verify")?.checkpoint?.result;
  if (!ehObjeto(verificacao) || !ehObjeto(verificacao.result) || !Array.isArray(verificacao.variants)) return null;
  const veredito = verificacao.result.verdict;
  if (veredito !== "passed" && veredito !== "passed_with_notes" && veredito !== "changes_required" && veredito !== "blocked") return null;
  const gravado = passos.find((p) => p.stepKey === "persist")?.checkpoint?.result;
  const s = (v: unknown): string => (typeof v === "string" ? v : "");
  return {
    veredito,
    achados: (Array.isArray(verificacao.result.findings) ? verificacao.result.findings : []).filter(ehObjeto).map((f) => ({
      regra: s(f.check), gravidade: s(f.severity), variante: typeof f.variantId === "string" ? f.variantId : null, mensagem: s(f.message),
    })),
    variantes: verificacao.variants.filter(ehObjeto).map((v) => ({
      id: s(v.id), titulo: s(v.headline), texto: s(v.primaryText), cta: s(v.cta), papel: v.role === "reference" || v.role === "challenger" ? v.role : null,
    })),
    rascunho: ehObjeto(gravado) && typeof gravado.draftRef === "string" ? gravado.draftRef : null,
    revisoes: (() => {
      const r = passos.find((p) => p.stepKey === "review")?.checkpoint?.result;
      if (!ehObjeto(r) || !Array.isArray(r.reviews)) return [];
      return r.reviews.filter(ehObjeto).map((x) => ({
        gate: s(x.gateType), status: s(x.gateStatus), revisor: s(x.reviewerAgent),
        limitacao: Array.isArray(x.limitations) && ehObjeto(x.limitations[0]) ? s(x.limitations[0].description) || null : null,
      }));
    })(),
  };
}

export type ContextoResumido = { id: string; resolucao: string; camadas: { camada: string; estado: string }[] } | null;
/** Resumo do snapshot de contexto embutido no input, sem expor os dados das camadas na lista. */
export function resumirContexto(input: Readonly<Record<string, unknown>>): ContextoResumido {
  const c = input["contextPackage"];
  if (typeof c !== "object" || c === null) return null;
  const pacote = c as { id?: unknown; layers?: Record<string, { status?: unknown } | undefined>; metadata?: { resolution?: unknown } };
  if (typeof pacote.id !== "string") return null;
  return {
    id: pacote.id, resolucao: typeof pacote.metadata?.resolution === "string" ? pacote.metadata.resolution : "—",
    camadas: Object.entries(pacote.layers ?? {}).map(([camada, v]) => ({ camada: camada.toUpperCase(), estado: typeof v?.status === "string" ? v.status : "—" })),
  };
}

/** Motivo e próximas ações de uma execução escalonada, em linguagem de produto. */
export function descreverEscalonamento(r: AgentRun): { motivo: string; acoes: string[] } {
  const codigo = r.error?.code ?? "";
  const acoes = ["Revise o contexto e os passos abaixo", "Cancele a execução se ela não for mais necessária"];
  if (codigo === ERRO_EFEITO_INCERTO.code) {
    return { motivo: "Um passo com efeito começou e não terminou. Para não repetir um efeito (por exemplo, uma cobrança), a execução parou.", acoes: ["Confira no sistema de destino se o efeito ocorreu", ...acoes] };
  }
  if (codigo.startsWith("RUN_BLOCKED_")) return { motivo: r.error?.message ?? "A execução foi bloqueada por um limite ou pela interrupção da IA.", acoes };
  if (codigo === "RETRY_ATTEMPTS_EXHAUSTED") return { motivo: "As tentativas automáticas se esgotaram.", acoes };
  return { motivo: r.error?.message ?? "A execução precisa de uma pessoa.", acoes };
}
