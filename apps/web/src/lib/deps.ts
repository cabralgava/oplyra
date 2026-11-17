// Composition root da web. É o único lugar que conhece adapters concretos.
import {
  carregarConfig, politicaSemProvedorAprovado, criarUnitOfWork, tenantRepository, membershipRepository,
  invitationRepository, auditLog, relogio, geradorDeToken, criarEntitlements,
  criarAuthGateway, criarAccessContextResolver,
} from "@oplyra/infra";
import type { Deps } from "@oplyra/core";
// Loader do ambiente remoto de desenvolvimento (CR-057): import relativo, sem ampliar exports do pacote.
import { carregarConfigDevelop } from "../../../../packages/infra/src/develop-config.ts";
import { SUPABASE_DEVELOP_CA } from "../../../../packages/infra/src/supabase-develop-ca.ts";

/** Verdadeiro só quando OPLYRA_ENV=develop (site oplyra-develop). Falha do loader de develop não tem fallback. */
export const ambienteDevelop = process.env.OPLYRA_ENV === "develop";

// Evidência de deployment: nenhum provedor aprovado ainda (CR-028); em
// produção a inicialização falha fechada até existir adapter aprovado.
const config = ambienteDevelop
  ? carregarConfigDevelop(process.env)
  : carregarConfig(process.env, { evidencia: politicaSemProvedorAprovado });
const uow = criarUnitOfWork({ connectionString: config.databaseUrl, max: 10,
  ...(ambienteDevelop ? { ssl: { ca: SUPABASE_DEVELOP_CA, rejectUnauthorized: true as const } } : {}),
});

export const deps: Deps = {
  uow,
  tenants: tenantRepository,
  memberships: membershipRepository,
  invitations: invitationRepository,
  audit: auditLog,
  clock: relogio,
  tokens: geradorDeToken,
  entitlements: criarEntitlements(uow),
};

export const authGateway = criarAuthGateway(config.jwksUrl, config.jwtIssuer);
export const resolverContexto = criarAccessContextResolver(uow);
export const supabaseUrl = config.supabaseUrl;
export const chavePublicavel = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
