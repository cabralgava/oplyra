// Fake em memória do contexto Strategy. Serve a testes de unidade dos casos de uso;
// a persistência real (RLS, constraints, triggers) é verificada com o Supabase local.
import type { AccessContext, PermissionKey, TenantId, UserId, BrandVersionId, ProductKey, ObjectiveId, PersonaId, CampaignId, ExperimentId } from "@oplyra/core";
import type { BrandVersion, ProductAvailability } from "@oplyra/core/brand";
import type {
  StrategyDeps, StrategyRepository, Campaign, Experiment, Objective, Persona, CampaignPlan, MetodoDaCampanha,
} from "@oplyra/core/strategy";
import {
  CampaignLocked, ConflictVersion, InvalidCampaignTransition, InvalidExperimentTransition, TrackingKeyLocked, TrackingKeyTaken,
} from "@oplyra/core/strategy";
import { criarBrandDeps, contextoDeMarca } from "./brand.ts";

let seq = 0;
const uuid = (): string => `e${(++seq).toString().padStart(7, "0")}-0000-4000-8000-${seq.toString().padStart(12, "0")}`;

const ESTRATEGIA_POR_PAPEL: Record<string, readonly PermissionKey[]> = {
  owner: ["strategy.read", "strategy.write", "campaign.activate"],
  admin: ["strategy.read", "strategy.write", "campaign.activate"],
  marketing_manager: ["strategy.read", "strategy.write", "campaign.activate"],
  viewer: ["strategy.read"],
};

/** `contextoDeMarca()` acrescido das permissões da estratégia, espelhando o seed da migration 000017 (D-6). */
export function contextoDeEstrategia(over: Parameters<typeof contextoDeMarca>[0]): AccessContext {
  const base = contextoDeMarca(over);
  return { ...base, permissions: new Set<PermissionKey>([...base.permissions, ...ESTRATEGIA_POR_PAPEL[base.roleKey]!]) };
}

export function criarStrategyDeps() {
  const brandDeps = criarBrandDeps();
  const estado = { objetivos: [] as Objective[], personas: [] as Persona[], campanhas: [] as Campaign[], testes: [] as Experiment[] };
  const doTenant = <T extends { tenantId: TenantId }>(l: T[], t: TenantId) => l.filter((x) => x.tenantId === t);

  const strategy: StrategyRepository = {
    async insertObjective(_tx, e) {
      const o: Objective = { ...e.content, id: uuid() as ObjectiveId, tenantId: e.tenantId, status: "active", createdBy: e.createdBy, createdAt: brandDeps.estado.agora };
      estado.objetivos.push(o);
      return o;
    },
    async listObjectives(_tx, t, { includeArchived }) { return doTenant(estado.objetivos, t).filter((o) => includeArchived || o.status === "active"); },
    async findObjective(_tx, t, id) { return doTenant(estado.objetivos, t).find((o) => o.id === id) ?? null; },
    async archiveObjective(_tx, t, id) {
      const i = estado.objetivos.findIndex((o) => o.tenantId === t && o.id === id);
      if (i >= 0) estado.objetivos[i] = { ...estado.objetivos[i]!, status: "archived" };
    },

    async insertPersona(_tx, e) {
      const p: Persona = { ...e.content, id: uuid() as PersonaId, tenantId: e.tenantId, status: "active", createdBy: e.createdBy, createdAt: brandDeps.estado.agora };
      estado.personas.push(p);
      return p;
    },
    async listPersonas(_tx, t, { includeArchived }) { return doTenant(estado.personas, t).filter((p) => includeArchived || p.status === "active"); },
    async findPersona(_tx, t, id) { return doTenant(estado.personas, t).find((p) => p.id === id) ?? null; },
    async archivePersona(_tx, t, id) {
      const i = estado.personas.findIndex((p) => p.tenantId === t && p.id === id);
      if (i >= 0) estado.personas[i] = { ...estado.personas[i]!, status: "archived" };
    },

    async insertCampaign(_tx, e) {
      if (estado.campanhas.some((c) => c.tenantId === e.tenantId && c.chave === e.chave)) throw new TrackingKeyTaken();
      const c: Campaign = {
        ...e.plan, id: uuid() as CampaignId, tenantId: e.tenantId, brandVersionId: e.brandVersionId, chave: e.chave, status: "planned",
        revision: 1, activatedAt: null, createdBy: e.createdBy, createdAt: brandDeps.estado.agora,
      };
      estado.campanhas.push(c);
      return c;
    },
    async listCampaigns(_tx, t) { return doTenant(estado.campanhas, t); },
    async findCampaign(_tx, t, id) { return doTenant(estado.campanhas, t).find((c) => c.id === id) ?? null; },
    async updateCampaignPlan(_tx, e) {
      const i = estado.campanhas.findIndex((c) => c.tenantId === e.tenantId && c.id === e.id);
      const atual = estado.campanhas[i]!;
      if (atual.status !== "planned") throw new CampaignLocked();
      if (atual.revision !== e.expectedRevision) throw new ConflictVersion();
      return (estado.campanhas[i] = { ...atual, ...e.plan, brandVersionId: e.brandVersionId, revision: atual.revision + 1 });
    },
    async replaceTrackingKey(_tx, e) {
      const i = estado.campanhas.findIndex((c) => c.tenantId === e.tenantId && c.id === e.id);
      const atual = estado.campanhas[i]!;
      if (atual.activatedAt !== null) throw new TrackingKeyLocked();
      if (atual.revision !== e.expectedRevision) throw new ConflictVersion();
      if (estado.campanhas.some((c) => c.tenantId === e.tenantId && c.chave === e.chave)) throw new TrackingKeyTaken();
      return (estado.campanhas[i] = { ...atual, chave: e.chave, revision: atual.revision + 1 });
    },
    async transitionCampaign(_tx, e) {
      const i = estado.campanhas.findIndex((c) => c.tenantId === e.tenantId && c.id === e.id);
      const atual = estado.campanhas[i]!;
      if (atual.status !== e.from) throw new InvalidCampaignTransition();
      return (estado.campanhas[i] = { ...atual, status: e.to, activatedAt: e.activatedAt });
    },

    async insertExperiment(_tx, e) {
      const t: Experiment = {
        ...e.content, id: uuid() as ExperimentId, tenantId: e.tenantId, campaignId: e.campaignId, status: "planned",
        createdBy: e.createdBy, createdAt: brandDeps.estado.agora, startedAt: null,
      };
      estado.testes.push(t);
      return t;
    },
    async listExperiments(_tx, t, campaignId) { return doTenant(estado.testes, t).filter((x) => x.campaignId === campaignId); },
    async findExperiment(_tx, t, id) { return doTenant(estado.testes, t).find((x) => x.id === id) ?? null; },
    async transitionExperiment(_tx, e) {
      const i = estado.testes.findIndex((x) => x.tenantId === e.tenantId && x.id === e.id);
      const atual = estado.testes[i]!;
      if (atual.status !== e.from) throw new InvalidExperimentTransition();
      return (estado.testes[i] = { ...atual, status: e.to, startedAt: e.startedAt });
    },
  };

  const deps: StrategyDeps & { estado: typeof estado; marca: typeof brandDeps } = {
    uow: brandDeps.uow, strategy, brand: brandDeps.brand, audit: brandDeps.audit, clock: brandDeps.clock, ids: brandDeps.ids,
    estado, marca: brandDeps,
  };
  return deps;
}

/** Semeia direto uma marca PUBLICADA com um produto, sem passar pelo caso de uso da marca. */
export function semearMarcaPublicada(
  deps: ReturnType<typeof criarStrategyDeps>, tenantId: TenantId, opcoes: { disponibilidade?: ProductAvailability; numero?: number } = {},
): { brandVersionId: BrandVersionId; productKey: ProductKey } {
  const productKey = uuid() as ProductKey;
  const id = uuid() as BrandVersionId;
  const versao: BrandVersion = {
    id, tenantId, number: opcoes.numero ?? 1, status: "published", revision: 1, positioning: "Posicionamento", tone: "Tom",
    products: [{ productKey, name: "Produto", description: "", availability: opcoes.disponibilidade ?? "available" }], claims: [],
    derivedFromId: null, createdBy: uuid() as UserId, createdAt: deps.marca.estado.agora, publishedBy: uuid() as UserId, publishedAt: deps.marca.estado.agora,
  };
  deps.marca.estado.versoes.push(versao);
  return { brandVersionId: id, productKey };
}

export const metodoCompleto = (): MetodoDaCampanha => ({
  situacao: "Equipe de marketing sem visão de receita.", dor: "Relatórios manuais.", consequencia: "Decisões atrasadas.",
  desejo: "Ver o retorno por campanha.", mecanismo: "Painel unificado.", prova: "Estudo de caso.", oferta: "Demonstração gratuita.",
});

export const planoBase = (objectiveId: ObjectiveId, productKey: ProductKey, over: Partial<CampaignPlan> = {}): CampaignPlan => ({
  nome: "Lançamento Plataforma Pro", objectiveId, productKey, personaId: null, metodo: metodoCompleto(),
  periodo: { inicio: "2026-11-01", fim: "2026-12-31" }, orcamento: { centavos: 500000, moeda: "BRL" }, mensagemChave: "Veja o retorno de cada campanha.", ...over,
});
