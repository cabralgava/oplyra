/**
 * Catálogo de agentes para a visão do produto: 12 agentes definidos (Performance usa 8; Growth acrescenta 4).
 * Fonte dos nomes/escopos: 10-agent-catalog e o plano (08). O ESTADO DE OPERAÇÃO abaixo é uma avaliação editorial do repositório
 * em 16/11/2026, NÃO telemetria: um módulo, handler ou teste não significa operação de ponta a ponta. Atualizar ao mudar a implementação.
 * Quem habilita o agente por empresa é o serviço de entitlements (ainda sem fonte na aplicação real); este arquivo não decide isso.
 */
export type PlanoId = "performance" | "growth";
export type EstadoAgente = "operando" | "parcial" | "nao_funciona";

export type AgenteCatalogo = {
  chave: string; nome: string; resumo: string;
  /** Planos que incluem o agente (Growth herda o núcleo de Performance). */
  planos: readonly PlanoId[];
  estado: EstadoAgente;
  /** O que existe hoje e o que falta; texto para a equipe e para a apresentação. */
  situacao: string;
  limites: string;
};

export const AVALIACAO_EM = "16/11/2026";

export const AGENTES: readonly AgenteCatalogo[] = [
  { chave: "orchestrator-agent", nome: "Orquestrador", resumo: "Coordena intenção, decomposição, roteamento e próximos passos.", planos: ["performance", "growth"], estado: "parcial",
    situacao: "Plano de orquestração e avaliação rodam em teste local com adaptador de teste.", limites: "Sem modelo real conectado e sem operação de ponta a ponta. Não aprova o próprio trabalho." },
  { chave: "strategy-quality-agent", nome: "Estratégia & Qualidade", resumo: "Revisa alinhamento estratégico, mensagem, evidências e qualidade.", planos: ["performance", "growth"], estado: "parcial",
    situacao: "Regras de revisão de qualidade existem no domínio e rodam em teste local.", limites: "Sem modelo real. Revisão independente dos executores; não concede autoridade de publicação." },
  { chave: "account-projects-agent", nome: "Account & Projetos", resumo: "Organiza tarefas, responsáveis, prazos, riscos e acompanhamento.", planos: ["performance", "growth"], estado: "nao_funciona",
    situacao: "Definido nos contratos; sem implementação própria de execução.", limites: "Tarefas e riscos existem como telas da empresa, mas o agente não opera." },
  { chave: "copywriting-agent", nome: "Copywriting", resumo: "Produz e revisa copy, variações, hooks, CTAs e roteiros textuais.", planos: ["performance", "growth"], estado: "parcial",
    situacao: "Fluxo de copy (variações, verificações e rascunho) roda em teste local.", limites: "Sem modelo real. Nada é publicado; toda copy passa por revisão e aprovação humana." },
  { chave: "design-agent", nome: "Design", resumo: "Produz direção visual, briefing, imagens e adaptações de marca.", planos: ["performance", "growth"], estado: "parcial",
    situacao: "Consome rascunhos de copy em teste local.", limites: "Geração e edição de imagem reais ainda não existem. Vídeo é ativo de entrada, sem geração nativa." },
  { chave: "paid-media-agent", nome: "Mídia Paga", resumo: "Analisa contas, métricas, recomendações e preparação de campanhas.", planos: ["performance", "growth"], estado: "nao_funciona",
    situacao: "Conexão e leitura de Google Ads e Meta Ads em construção (CR-055), só com adaptadores de teste.", limites: "Nenhuma conta real conectada. Escrita e publicação fora desta etapa." },
  { chave: "performance-intelligence-agent", nome: "Performance & Inteligência", resumo: "Interpreta resultados, testes, qualidade dos dados e oportunidades.", planos: ["performance", "growth"], estado: "nao_funciona",
    situacao: "Definido nos contratos; depende de mídia e conversões.", limites: "Sem fontes de dados reais." },
  { chave: "reporting-checkins-agent", nome: "Relatórios & Check-ins", resumo: "Sintetiza resultados, operação, limitações, decisões e próximos passos.", planos: ["performance", "growth"], estado: "nao_funciona",
    situacao: "Há verificação de domínio do check-in; não há geração nem persistência do relatório.", limites: "Depende de dados de mídia e de decisão pendente sobre recorrência." },
  { chave: "social-media-agent", nome: "Social Media", resumo: "Planeja pauta, calendário, adaptação e distribuição orgânica.", planos: ["growth"], estado: "nao_funciona",
    situacao: "Definido; Growth ainda não iniciado.", limites: "Fora do MVP Performance." },
  { chave: "email-marketing-agent", nome: "E-mail Marketing", resumo: "Cria campanhas, segmentos, testes e leitura de resultados de e-mail.", planos: ["growth"], estado: "nao_funciona",
    situacao: "Definido; Growth ainda não iniciado.", limites: "Fora do MVP Performance." },
  { chave: "lifecycle-agent", nome: "Lifecycle", resumo: "Modela e acompanha jornadas, nutrição e reativação por eventos.", planos: ["growth"], estado: "nao_funciona",
    situacao: "Definido; Growth ainda não iniciado.", limites: "Fora do MVP Performance." },
  { chave: "revenue-intelligence-agent", nome: "Revenue Intelligence", resumo: "Conecta touchpoints e dados comerciais para inteligência de receita.", planos: ["growth"], estado: "nao_funciona",
    situacao: "Definido; Growth ainda não iniciado.", limites: "Fora do MVP Performance." },
];

export const incluidoNoPlano = (a: AgenteCatalogo, plano: PlanoId): boolean => a.planos.includes(plano);
export const rotuloPlanos = (a: AgenteCatalogo): string => (a.planos.length === 2 ? "Performance + Growth" : "Growth-only");
export const contagemPorEstado = (lista: readonly AgenteCatalogo[]): Record<EstadoAgente, number> =>
  lista.reduce((acc, a) => { acc[a.estado] += 1; return acc; }, { operando: 0, parcial: 0, nao_funciona: 0 } as Record<EstadoAgente, number>);
