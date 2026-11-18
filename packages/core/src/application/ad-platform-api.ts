import type { Confianca } from "../domain/metric-confidence.ts";
/** CR-055 — contrato de serviço de mídia v1.0 incorporado em manutenção.
 * Sem import de infraestrutura. Tipos publicados não comprovam endpoint hospedado.
 * tenantId seleciona contexto; servidor deriva usuarioId da sessão e confere membership vigente.
 */
export type Plataforma = "googleAds" | "metaAds";
export type EstadoDeConexao = "setup_required" | "disconnected" | "authorizing" | "awaiting_account_selection" |
  "connected" | "authorization_expired" | "no_access" | "unavailable";
export type Recuperacao = "sign_in" | "configure_application" | "connect" | "select_account" | "reconnect" | "request_access" | "retry_later" | "none";
export type Falha = {
  readonly codigo: "unauthenticated" | "forbidden" | "not_found" | "invalid_input" | "invalid_state" |
    "authorization_cancelled" | "authorization_expired" | "no_access" | "not_configured" | "conflict" |
    "quota" | "provider_unavailable" | "contract_unavailable";
  readonly mensagem: string; readonly recuperacao: Recuperacao; readonly correlationId: string;
  readonly retryAfterSeconds: number | null;
};
export type Resultado<T> = { readonly ok: true; readonly dados: T } | { readonly ok: false; readonly erro: Falha };
export type Conta = { readonly id: string; readonly nome: string; readonly moeda: string; readonly fuso: string };
export type Conexao = {
  readonly plataforma: Plataforma; readonly estado: EstadoDeConexao; readonly conta: Conta | null;
  readonly escopos: readonly string[]; readonly proximaAcao: Recuperacao;
  readonly ultimaTentativaEm: string | null; readonly ultimaSincronizacaoBemSucedidaEm: string | null;
};
export type Pagina<T> = { readonly itens: readonly T[]; readonly proximoCursor: string | null };
export type Periodo = { readonly inicio: string; readonly fimExclusivo: string }; // YYYY-MM-DD no fuso da conta; [início,fim).
export type Sincronizacao = {
  readonly id: string; readonly estado: "queued" | "running" | "complete" | "partial" | "failed";
  readonly ultimaTentativaEm: string | null; readonly ultimaSincronizacaoBemSucedidaEm: string | null;
  readonly motivo: "quota" | "authorization_expired" | "no_access" | "transient" | "invalid_response" | null;
  readonly dadosAnterioresDisponiveis: boolean;
};
/** Exatidão antes de apresentação. Inteiro seguro quando representável; nunca arredondar micros.
 * Decimal da menor unidade é string exata (ex.: BRL cost_micros=1234567 => "123.4567").
 * null é somente ausência de dado, nunca perda de precisão. ISO/escala vêm da conta/provedor.
 * Precisão exata; apresentação arredondada deve ser explícita e não alterar o valor persistido.
 */
export type Dinheiro = { readonly moeda: string; readonly valorMenorExato: string | null; readonly casasDecimaisDaMoeda: number };
export type Campanha = {
  readonly id: string; readonly nome: string; readonly statusDoProvedor: string;
  readonly campanhaOplyraId: string | null; readonly plataforma: Plataforma; readonly contaId: string;
};
export type Metricas = {
  readonly confianca: Confianca;
  readonly campanhaId: string; readonly gasto: Dinheiro; readonly impressoes: string | null; readonly cliques: string | null;
  // Não igualar conversions Google, actions Meta ou eventos comerciais da Oplyra.
  readonly conversoes: { readonly valor: string | null; readonly definicao: string; readonly modelo: string | null; readonly janela: string | null };
  readonly periodo: Periodo; readonly fuso: string; readonly dataUntil: string | null;
  readonly coletadoEm: string; readonly completa: boolean; readonly dadosAntigos: boolean;
  readonly limitacoes: readonly string[];
};
export interface ContratoDeMidia {
  listarConexoes(e: { tenantId: string }): Promise<Resultado<readonly Conexao[]>>;
  iniciarConexao(e: { tenantId: string; plataforma: Plataforma; idempotencyKey: string }): Promise<Resultado<{ authorizationUrl: string; expiraEm: string }>>;
  // Conclusão exclusivamente pelo callback fixo no servidor; a UI não recebe code/state/tokens.
  listarContasAutorizadas(e: { tenantId: string; plataforma: Plataforma; cursor: string | null }): Promise<Resultado<Pagina<Conta>>>;
  selecionarConta(e: { tenantId: string; plataforma: Plataforma; contaId: string; idempotencyKey: string }): Promise<Resultado<Conexao>>;
  desconectar(e: { tenantId: string; plataforma: Plataforma; idempotencyKey: string }): Promise<Resultado<Conexao>>;
  solicitarSincronizacao(e: { tenantId: string; plataforma: Plataforma; periodo: Periodo; idempotencyKey: string }): Promise<Resultado<Sincronizacao>>;
  consultarSincronizacao(e: { tenantId: string; sincronizacaoId: string }): Promise<Resultado<Sincronizacao>>;
  listarCampanhasPlataforma(e: { tenantId: string; plataforma: Plataforma; cursor: string | null }): Promise<Resultado<Pagina<Campanha>>>;
  consultarCampanha(e: { tenantId: string; plataforma: Plataforma; campanhaId: string }): Promise<Resultado<Campanha>>;
  vincularCampanha(e: { tenantId: string; plataforma: Plataforma; campanhaId: string; campanhaOplyraId: string | null; idempotencyKey: string }): Promise<Resultado<Campanha>>;
  lerMidia(e: { tenantId: string; plataforma: Plataforma; campanhaId: string | null; periodo: Periodo; cursor: string | null }): Promise<Resultado<Pagina<Metricas> & { sincronizacao: Sincronizacao | null }>>;
}
