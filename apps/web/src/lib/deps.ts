// Composition root da web. É o único lugar que conhece adapters concretos.
import {
  carregarConfig, criarUnitOfWork, tenantRepository, membershipRepository,
  invitationRepository, auditLog, relogio, geradorDeToken, criarEntitlements,
  criarAuthGateway, criarAccessContextResolver,
} from "@oplyra/infra";
import type { Deps } from "@oplyra/core";

const config = carregarConfig();
const uow = criarUnitOfWork({ connectionString: config.databaseUrl, max: 10 });

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
