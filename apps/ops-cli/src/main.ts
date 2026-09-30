#!/usr/bin/env node
// ops-cli — lista fechada de comandos, cada um chamando UM caso de uso.
// Sem SQL arbitrário, sem "modo administrador", sem shell de banco.
// Alterações são --dry-run por padrão e exigem motivo; tudo é auditado.
import { provisionTenant } from "@oplyra/core";
import type { Deps, UserId } from "@oplyra/core";
import {
  carregarConfig, criarUnitOfWork, tenantRepository, membershipRepository, invitationRepository,
  auditLog, relogio, geradorDeToken, criarEntitlements,
} from "@oplyra/infra";
import { criarAuthAdmin } from "./auth-admin.ts";

type Comando = { nome: string; resumo: string; executar(args: Args, deps: Deps): Promise<void> };
type Args = { valores: Map<string, string>; aplicar: boolean };

function parse(argv: string[]): { comando: string; args: Args } {
  const [comando = "", ...resto] = argv;
  const valores = new Map<string, string>();
  let aplicar = false;
  for (let i = 0; i < resto.length; i++) {
    const a = resto[i]!;
    if (a === "--apply") { aplicar = true; continue; }
    if (a.startsWith("--")) valores.set(a.slice(2), resto[++i] ?? "");
  }
  return { comando, args: { valores, aplicar } };
}

const exigir = (a: Args, chave: string): string => {
  const v = a.valores.get(chave)?.trim();
  if (!v) throw new Error(`faltou --${chave}`);
  return v;
};

const COMANDOS: Comando[] = [
  {
    nome: "provision-tenant",
    resumo: "cria uma empresa e seu primeiro Owner (--name --slug --owner-email --reason --operator [--apply])",
    async executar(args, deps) {
      const entrada = {
        name: exigir(args, "name"), slug: exigir(args, "slug"),
        ownerEmail: exigir(args, "owner-email"), reason: exigir(args, "reason"),
        operatorId: exigir(args, "operator") as UserId,
      };
      if (!args.aplicar) {
        console.log("SIMULAÇÃO (--dry-run é o padrão). Nada foi gravado.");
        console.log(`  empresa: ${entrada.name} (${entrada.slug})`);
        console.log(`  primeiro Owner: ${entrada.ownerEmail}`);
        console.log(`  motivo: ${entrada.reason}`);
        console.log("  Para executar de verdade, repita o comando com --apply.");
        return;
      }
      const r = await provisionTenant(deps, entrada);
      console.log(`empresa criada: ${r.tenantId}`);
      console.log(`vínculo de Owner: ${r.ownerMembershipId}`);
    },
  },
];

async function main(): Promise<void> {
  const { comando, args } = parse(process.argv.slice(2));
  const escolhido = COMANDOS.find((c) => c.nome === comando);
  if (!escolhido) {
    console.log("ops-cli — comandos disponíveis:\n");
    for (const c of COMANDOS) console.log(`  ${c.nome}\n      ${c.resumo}`);
    process.exitCode = comando ? 1 : 0;
    return;
  }

  // Mesma validação de ambiente do runtime (CR-028): local/ci só endpoints
  // locais; produção exige evidência confiável do deployment, ainda sem
  // provedor aprovado, portanto falha fechada.
  const config = carregarConfig(process.env, { databaseVar: "DATABASE_URL_OPS" });
  const conexao = config.databaseUrl;
  const api = config.supabaseUrl;
  const chave = process.env.OPS_ADMIN_CREDENTIAL;
  if (!chave) throw new Error("falta OPS_ADMIN_CREDENTIAL");

  const uow = criarUnitOfWork({ connectionString: conexao, max: 2 });
  const deps: Deps = {
    uow, tenants: tenantRepository, memberships: membershipRepository,
    invitations: invitationRepository, audit: auditLog, clock: relogio,
    tokens: geradorDeToken, entitlements: criarEntitlements(uow),
    authAdmin: criarAuthAdmin(api, chave),
  };
  try { await escolhido.executar(args, deps); } finally { await uow.encerrar(); }
}

main().catch((e: unknown) => {
  console.error(`erro: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
