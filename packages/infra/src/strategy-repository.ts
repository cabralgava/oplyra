// Adapter Supabase/Postgres do contexto Strategy (I-04). Toda leitura e escrita passa pela transação do
// tenant ativo, portanto pela RLS; os triggers do banco repetem as regras do domínio.
import { comoCliente } from "./db.ts";
import type { Tx, TenantId, UserId, BrandVersionId, ObjectiveId, PersonaId, CampaignId, ExperimentId, ProductKey } from "@oplyra/core";
import type {
  StrategyRepository, Objective, Persona, Campaign, Experiment, CampaignStatus, ExperimentStatus, Dimensao,
} from "@oplyra/core/strategy";
import {
  CampaignLocked, CampaignNotActivatable, CampaignNotFound, ConflictVersion, InvalidCampaignTransition, InvalidExperimentTransition,
  TrackingKeyLocked, TrackingKeyTaken,
} from "@oplyra/core/strategy";

const dbDe = (tx: Tx) => comoCliente(tx);
const codigoPg = (e: unknown): string | undefined => (e as { code?: string } | null)?.code;
const restricao = (e: unknown): string => (e as { constraint?: string } | null)?.constraint ?? "";

/** Um erro de constraint aborta a transação inteira; o savepoint devolve o controle ao chamador. */
async function comSavepoint<T>(tx: Tx, fn: () => Promise<T>, traduz: (e: unknown) => Error | null): Promise<T> {
  const db = dbDe(tx);
  await db.query("savepoint estrategia");
  try {
    return await fn();
  } catch (e) {
    await db.query("rollback to savepoint estrategia");
    throw traduz(e) ?? e;
  }
}

/* ------------------------------------------------------------------ linhas */

const DATA = (coluna: string, alias: string) => `to_char(${coluna}, 'YYYY-MM-DD') as "${alias}"`;

const COLUNAS_OBJETIVO = `id, tenant_id as "tenantId", name as nome, description as descricao, status, created_by as "createdBy",
  created_at as "createdAt", ${DATA("period_start", "inicio")}, ${DATA("period_end", "fim")}`;

type LinhaObjetivo = { id: string; tenantId: string; nome: string; descricao: string; status: "active" | "archived"; createdBy: string; createdAt: Date; inicio: string; fim: string };

async function objetivosDe(tx: Tx, linhas: LinhaObjetivo[]): Promise<Objective[]> {
  if (!linhas.length) return [];
  const { rows } = await dbDe(tx).query(
    `select objective_id as "objectiveId", name as nome, unit as unidade, target::float8 as alvo
       from strategy.kpis where tenant_id = $1 and objective_id = any($2::uuid[]) order by position, name`,
    [linhas[0]!.tenantId, linhas.map((l) => l.id)]);
  const kpis = rows as { objectiveId: string; nome: string; unidade: string; alvo: number }[];
  return linhas.map((l): Objective => ({
    id: l.id as ObjectiveId, tenantId: l.tenantId as TenantId, nome: l.nome, descricao: l.descricao, status: l.status,
    periodo: { inicio: l.inicio, fim: l.fim }, createdBy: l.createdBy as UserId, createdAt: l.createdAt,
    kpis: kpis.filter((k) => k.objectiveId === l.id).map(({ nome, unidade, alvo }) => ({ nome, unidade, alvo })),
  }));
}

const COLUNAS_PERSONA = `id, tenant_id as "tenantId", name as nome, description as descricao, pains as dores, objections as objecoes,
  status, created_by as "createdBy", created_at as "createdAt"`;
const comoPersona = (l: Record<string, unknown>): Persona => l as unknown as Persona;

const COLUNAS_CAMPANHA = `id, tenant_id as "tenantId", name as nome, status, revision, objective_id as "objectiveId",
  brand_version_id as "brandVersionId", product_key as "productKey", persona_id as "personaId", tracking_key as chave,
  situation, pain, consequence, desire, mechanism, proof, offer, ${DATA("period_start", "inicio")}, ${DATA("period_end", "fim")},
  budget_minor::float8 as "budgetMinor", key_message as "mensagemChave", activated_at as "activatedAt",
  created_by as "createdBy", created_at as "createdAt"`;

type LinhaCampanha = {
  id: string; tenantId: string; nome: string; status: CampaignStatus; revision: number; objectiveId: string; brandVersionId: string;
  productKey: string; personaId: string | null; chave: string; situation: string; pain: string; consequence: string; desire: string;
  mechanism: string; proof: string; offer: string; inicio: string; fim: string; budgetMinor: number | null; mensagemChave: string;
  activatedAt: Date | null; createdBy: string; createdAt: Date;
};
const comoCampanha = (l: LinhaCampanha): Campaign => ({
  id: l.id as CampaignId, tenantId: l.tenantId as TenantId, nome: l.nome, status: l.status, revision: l.revision,
  objectiveId: l.objectiveId as ObjectiveId, brandVersionId: l.brandVersionId as BrandVersionId, productKey: l.productKey as ProductKey,
  personaId: l.personaId as PersonaId | null, chave: l.chave,
  metodo: { situacao: l.situation, dor: l.pain, consequencia: l.consequence, desejo: l.desire, mecanismo: l.mechanism, prova: l.proof, oferta: l.offer },
  periodo: { inicio: l.inicio, fim: l.fim }, orcamento: l.budgetMinor === null ? null : { centavos: Number(l.budgetMinor), moeda: "BRL" },
  mensagemChave: l.mensagemChave, activatedAt: l.activatedAt, createdBy: l.createdBy as UserId, createdAt: l.createdAt,
});

const COLUNAS_TESTE = `id, tenant_id as "tenantId", campaign_id as "campaignId", hypothesis as hipotese, dimension as dimensao,
  dimension_note as "notaDaDimensao", status, created_by as "createdBy", created_at as "createdAt", started_at as "startedAt"`;
const comoTeste = (l: Record<string, unknown>): Experiment => l as unknown as Experiment;

export const strategyRepository: StrategyRepository = {
  /* ---------------------------------------------------------------- objetivos */
  async insertObjective(tx, e) {
    const db = dbDe(tx);
    const { rows } = await db.query(
      `insert into strategy.objectives (tenant_id, name, description, period_start, period_end, created_by)
       values ($1, $2, $3, $4, $5, $6) returning ${COLUNAS_OBJETIVO}`,
      [e.tenantId, e.content.nome, e.content.descricao, e.content.periodo.inicio, e.content.periodo.fim, e.createdBy]);
    const linha = rows[0] as LinhaObjetivo;
    for (const [i, k] of e.content.kpis.entries()) {
      await db.query(
        `insert into strategy.kpis (tenant_id, objective_id, position, name, unit, target) values ($1, $2, $3, $4, $5, $6)`,
        [e.tenantId, linha.id, i, k.nome, k.unidade, k.alvo]);
    }
    return (await objetivosDe(tx, [linha]))[0]!;
  },
  async listObjectives(tx, tenantId, { includeArchived }) {
    const { rows } = await dbDe(tx).query(
      `select ${COLUNAS_OBJETIVO} from strategy.objectives where tenant_id = $1 and ($2 or status = 'active') order by created_at desc, id`,
      [tenantId, includeArchived]);
    return objetivosDe(tx, rows as LinhaObjetivo[]);
  },
  async findObjective(tx, tenantId, id) {
    const { rows } = await dbDe(tx).query(`select ${COLUNAS_OBJETIVO} from strategy.objectives where tenant_id = $1 and id = $2`, [tenantId, id]);
    return rows[0] ? (await objetivosDe(tx, [rows[0] as LinhaObjetivo]))[0]! : null;
  },
  async archiveObjective(tx, tenantId, id) {
    await dbDe(tx).query(`update strategy.objectives set status = 'archived' where tenant_id = $1 and id = $2 and status = 'active'`, [tenantId, id]);
  },

  /* ----------------------------------------------------------------- personas */
  async insertPersona(tx, e) {
    const { rows } = await dbDe(tx).query(
      `insert into strategy.personas (tenant_id, name, description, pains, objections, created_by) values ($1, $2, $3, $4, $5, $6)
       returning ${COLUNAS_PERSONA}`,
      [e.tenantId, e.content.nome, e.content.descricao, e.content.dores, e.content.objecoes, e.createdBy]);
    return comoPersona(rows[0]);
  },
  async listPersonas(tx, tenantId, { includeArchived }) {
    const { rows } = await dbDe(tx).query(
      `select ${COLUNAS_PERSONA} from strategy.personas where tenant_id = $1 and ($2 or status = 'active') order by created_at desc, id`,
      [tenantId, includeArchived]);
    return rows.map(comoPersona);
  },
  async findPersona(tx, tenantId, id) {
    const { rows } = await dbDe(tx).query(`select ${COLUNAS_PERSONA} from strategy.personas where tenant_id = $1 and id = $2`, [tenantId, id]);
    return rows[0] ? comoPersona(rows[0]) : null;
  },
  async archivePersona(tx, tenantId, id) {
    await dbDe(tx).query(`update strategy.personas set status = 'archived' where tenant_id = $1 and id = $2 and status = 'active'`, [tenantId, id]);
  },

  /* ---------------------------------------------------------------- campanhas */
  async insertCampaign(tx, e) {
    const m = e.plan.metodo;
    const { rows } = await comSavepoint(tx, () => dbDe(tx).query(
      `insert into strategy.campaigns (tenant_id, name, objective_id, brand_version_id, product_key, persona_id, tracking_key,
         situation, pain, consequence, desire, mechanism, proof, offer, period_start, period_end, budget_minor, key_message, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) returning ${COLUNAS_CAMPANHA}`,
      [e.tenantId, e.plan.nome, e.plan.objectiveId, e.brandVersionId, e.plan.productKey, e.plan.personaId, e.chave,
       m.situacao, m.dor, m.consequencia, m.desejo, m.mecanismo, m.prova, m.oferta, e.plan.periodo.inicio, e.plan.periodo.fim,
       e.plan.orcamento?.centavos ?? null, e.plan.mensagemChave, e.createdBy]),
    (err) => (codigoPg(err) === "23505" && /tracking_key/.test(restricao(err)) ? new TrackingKeyTaken() : null));
    return comoCampanha(rows[0] as LinhaCampanha);
  },
  async listCampaigns(tx, tenantId) {
    const { rows } = await dbDe(tx).query(`select ${COLUNAS_CAMPANHA} from strategy.campaigns where tenant_id = $1 order by created_at desc, id`, [tenantId]);
    return (rows as LinhaCampanha[]).map(comoCampanha);
  },
  async findCampaign(tx, tenantId, id) {
    const { rows } = await dbDe(tx).query(`select ${COLUNAS_CAMPANHA} from strategy.campaigns where tenant_id = $1 and id = $2`, [tenantId, id]);
    return rows[0] ? comoCampanha(rows[0] as LinhaCampanha) : null;
  },
  async updateCampaignPlan(tx, e) {
    const m = e.plan.metodo;
    const { rows } = await dbDe(tx).query(
      `update strategy.campaigns set name = $3, objective_id = $4, brand_version_id = $5, product_key = $6, persona_id = $7,
         situation = $8, pain = $9, consequence = $10, desire = $11, mechanism = $12, proof = $13, offer = $14,
         period_start = $15, period_end = $16, budget_minor = $17, key_message = $18, revision = revision + 1
        where tenant_id = $1 and id = $2 and status = 'planned' and revision = $19 returning ${COLUNAS_CAMPANHA}`,
      [e.tenantId, e.id, e.plan.nome, e.plan.objectiveId, e.brandVersionId, e.plan.productKey, e.plan.personaId,
       m.situacao, m.dor, m.consequencia, m.desejo, m.mecanismo, m.prova, m.oferta, e.plan.periodo.inicio, e.plan.periodo.fim,
       e.plan.orcamento?.centavos ?? null, e.plan.mensagemChave, e.expectedRevision]);
    if (rows[0]) return comoCampanha(rows[0] as LinhaCampanha);
    const atual = await strategyRepository.findCampaign(tx, e.tenantId, e.id);
    if (!atual) throw new CampaignNotFound();
    throw atual.status !== "planned" ? new CampaignLocked() : new ConflictVersion();
  },
  async replaceTrackingKey(tx, e) {
    const { rows } = await comSavepoint(tx, () => dbDe(tx).query(
      `update strategy.campaigns set tracking_key = $3, revision = revision + 1
        where tenant_id = $1 and id = $2 and activated_at is null and revision = $4 returning ${COLUNAS_CAMPANHA}`,
      [e.tenantId, e.id, e.chave, e.expectedRevision]),
    (err) => (codigoPg(err) === "23505" && /tracking_key/.test(restricao(err)) ? new TrackingKeyTaken() : null));
    if (rows[0]) return comoCampanha(rows[0] as LinhaCampanha);
    const atual = await strategyRepository.findCampaign(tx, e.tenantId, e.id);
    if (!atual) throw new CampaignNotFound();
    throw atual.activatedAt !== null ? new TrackingKeyLocked() : new ConflictVersion();
  },
  async transitionCampaign(tx, e) {
    const { rows } = await comSavepoint(tx, () => dbDe(tx).query(
      `update strategy.campaigns set status = $4, activated_at = $5
        where tenant_id = $1 and id = $2 and status = $3 returning ${COLUNAS_CAMPANHA}`,
      [e.tenantId, e.id, e.from, e.to, e.activatedAt]),
    // O domínio deveria ter barrado antes; a recusa do banco chega como regra violada, com o motivo do próprio banco.
    (err) => (codigoPg(err) === "23514" ? new CampaignNotActivatable([{ code: "DB_RULE", path: "", message: (err as Error).message }]) : null));
    if (!rows[0]) throw new InvalidCampaignTransition();
    return comoCampanha(rows[0] as LinhaCampanha);
  },

  /* ------------------------------------------------------------------- testes */
  async insertExperiment(tx, e) {
    const { rows } = await dbDe(tx).query(
      `insert into strategy.experiments (tenant_id, campaign_id, hypothesis, dimension, dimension_note, created_by)
       values ($1, $2, $3, $4, $5, $6) returning ${COLUNAS_TESTE}`,
      [e.tenantId, e.campaignId, e.content.hipotese, e.content.dimensao as Dimensao, e.content.notaDaDimensao, e.createdBy]);
    return comoTeste(rows[0]);
  },
  async listExperiments(tx, tenantId, campaignId) {
    const { rows } = await dbDe(tx).query(
      `select ${COLUNAS_TESTE} from strategy.experiments where tenant_id = $1 and campaign_id = $2 order by created_at, id`, [tenantId, campaignId]);
    return rows.map(comoTeste);
  },
  async findExperiment(tx, tenantId, id) {
    const { rows } = await dbDe(tx).query(`select ${COLUNAS_TESTE} from strategy.experiments where tenant_id = $1 and id = $2`, [tenantId, id]);
    return rows[0] ? comoTeste(rows[0]) : null;
  },
  async transitionExperiment(tx, e) {
    const { rows } = await dbDe(tx).query(
      `update strategy.experiments set status = $4, started_at = $5 where tenant_id = $1 and id = $2 and status = $3 returning ${COLUNAS_TESTE}`,
      [e.tenantId, e.id, e.from satisfies ExperimentStatus, e.to, e.startedAt]);
    if (!rows[0]) throw new InvalidExperimentTransition();
    return comoTeste(rows[0]);
  },
};
