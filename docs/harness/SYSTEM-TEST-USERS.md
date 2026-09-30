# Usuários e tenants sintéticos de sistema

**Status:** baseline documentado do ambiente local.  
**Fonte executável:** `supabase/seed.sql`. Este documento não contém senha, token ou segredo; credenciais locais são geridas pelo seed/configuração local e nunca devem ser reutilizadas fora desse ambiente.

## 1. Tenants sintéticos canônicos

| Chave documental | Tenant atual no seed | Slug | Situação |
| --- | --- | --- | --- |
| Tenant A | Alfa Software (fictícia) | `alfa-software` | Implementado no seed local |
| Tenant B | Beta Cloud (fictícia) | `beta-cloud` | Implementado no seed local |

Os tenants canônicos são os de `supabase/seed.sql`, recriados por `pnpm db:reset` e `pnpm db:roles`. Nomes exemplificativos como `synthetic-acme` e `synthetic-northstar` não são nomenclatura canônica e não substituem os tenants implementados.

## 2. Papéis canônicos

O catálogo real do I-01 é `owner`, `admin`, `marketing_manager` e `viewer`. “marketing/operator” e “read-only” são personas conceituais mapeadas respectivamente para `marketing_manager` e `viewer`; não criam novos roles. “Operador da plataforma” é uma identidade operacional separada e não um role de membership do tenant.

| Persona de teste | Identidade sintética atual | Membership/estado | Situação |
| --- | --- | --- | --- |
| Owner do Tenant A | `a-owner@local.test` | Tenant A · `owner` · ativa | Implementada |
| Marketing do Tenant A | `a-manager@local.test` | Tenant A · `marketing_manager` · ativa | Implementada |
| Leitura do Tenant A | `a-viewer@local.test` | Tenant A · `viewer` · ativa | Implementada |
| Membership removida | `a-removido@local.test` | Tenant A · `admin` · revogada | Implementada |
| Usuário multi-tenant | `ab-duas-empresas@local.test` | Tenant A · `marketing_manager`; Tenant B · `viewer` | Implementada |
| Owner do Tenant B | `b-owner@local.test` | Tenant B · `owner` · ativa | Implementada |
| Usuário sem tenant | `sem-empresa@local.test` | sem membership | Implementada |
| Anônimo | nenhuma identidade autenticada | sem sessão | Implementado em testes E2E |
| Admin ativo | a definir sem duplicar persona existente | role `admin` ativo | Planejado |
| Tenant/usuário suspenso | depende de fluxo de suspensão executável | `tenant.status=suspended`; usuário Auth disabled ainda não está modelado como persona canônica | Planejado/parcial |

## 3. Regras para fixtures e credenciais

- somente domínios e dados inequivocamente fictícios;
- IDs estáveis podem existir para testes determinísticos, mas não autorizam confiança em `tenantId` vindo do cliente;
- este documento não replica a senha sintética do ambiente; nenhuma credencial real pode aparecer em documento, log, screenshot ou fixture versionada;
- reset local recria o estado; seeds não são promovidos para produção;
- todos os usuários e tenants são **sintéticos** e existem apenas no Supabase local; não há senha real em lugar algum e este documento **não autoriza** criar conta, usuário ou tenant em ambiente remoto;
- qualquer nova persona deve usar role existente ou passar pelo processo de mudança controlada correspondente.

## 4. Taxonomia inicial de testes de sistema

“Implementado” exige teste executável no repositório; “planejado” é apenas especificação.

| ID | Cenário | Estado | Evidência/pendência |
| --- | --- | --- | --- |
| `SYS-AUTH-001` | login válido | Implementado | Playwright I-01 |
| `SYS-AUTH-002` | anônimo é redirecionado de rota protegida | Implementado | Playwright I-01 |
| `SYS-TENANT-001` | membro do Tenant A acessa Tenant A | Implementado | Playwright + pgTAP |
| `SYS-TENANT-002` | membro do Tenant A não acessa Tenant B nem recebe vazamento de nome | Implementado | Playwright + pgTAP |
| `SYS-TENANT-003` | usuário multi-tenant lista/troca contexto preservando isolamento | Parcial | listagem e roles implementados; ampliar cobertura por recurso nos próximos incrementos |
| `SYS-TENANT-004` | membership removida perde acesso | Implementado no banco/casos de uso | manter E2E explícito como incremento futuro |
| `SYS-RLS-001` | tentativa direta cross-tenant é negada | Implementado | pgTAP do I-01 |
| `SYS-ROLE-001` | viewer não convida nem remove membros | Implementado | Playwright I-01 |
| `SYS-APPROVAL-001` | ação protegida exige approval apropriado | Planejado | depende do Product Agent Runtime |
| `SYS-FENCING-001` | lease/fencing obsoleto não confirma execução como válida | Parcial | settlement obsoleto é rejeitado no dispatcher; efeitos externos e composition root ainda exigem cobertura ponta a ponta |
| `SYS-IDEMPOTENCY-001` | replay não duplica side effect | Implementado para `create_copy_variants` | testes cobrem replay e concorrência; revalidar por nova action/adapter |
| `SYS-SUSPENSION-001` | tenant suspenso e, se suportado, usuário disabled perdem acesso | Planejado | fechar semântica e teste executável |

Novos testes devem preservar o vínculo com o gate e a versão/commit executados.
