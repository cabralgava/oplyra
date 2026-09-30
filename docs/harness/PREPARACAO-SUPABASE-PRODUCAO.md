# Preparação do primeiro Supabase de produção — Oplyra

**Status:** `local_corrections_applied_creation_decisions_pending` — correções locais do CR-028 aplicadas (Release 2.18); decisões de criação (§3, D-01…D-13) e preflight B-2 pendentes. **Não autoriza publicação nem proposta de publicação.**
**Natureza:** local e documental. Nada aqui cria, contrata, vincula ou altera recurso remoto.
**Correções:** [CR-028 — Production Readiness Hardening](../product/marketing-ops/contracts/changes/CR-028-production-readiness-hardening.md) `approved_and_applied` localmente na Contract Registry Release 2.18 (B-3, B-4, reclassificação de B-2, checklist de Auth B-6; D-14 a D-18 aprovadas). Nada foi aplicado remotamente.
**Base:** commit `80631318e251ddc467f2236b85a5f74e998f8813` (`8063131`), Contract Registry Release 2.17 (CR-027), manifest `contract-registry-manifest-v2.17.json` sha256 `0870c3afaea6d0ba40c0185883f8b7ebae7b90789efd58de36fc284eaa983076`, aggregateDigest `1d7bdc7c0c6b75268accad353dac4b72a8d7a335ef8808f0506db5a885f0b7d5`.
**Referências:** [PUBLICACAO](PUBLICACAO.md), [VERIFICACOES](VERIFICACOES.md) (G6), [16 — ambientes e release](../product/marketing-ops/16-environments-release.md), [DATABASE-PROVISIONING-PLAN](../product/marketing-ops/environments/DATABASE-PROVISIONING-PLAN.md), [SECRETS-AND-IDENTITIES](../product/marketing-ops/environments/SECRETS-AND-IDENTITIES.md), [ROLLBACK-AND-RECOVERY](../product/marketing-ops/environments/ROLLBACK-AND-RECOVERY.md), [PRODUCTION-READINESS-CHECKLIST](../product/marketing-ops/environments/PRODUCTION-READINESS-CHECKLIST.md), [COST-LEDGER-CONTRACTS](../product/marketing-ops/contracts/COST-LEDGER-CONTRACTS.md).

Este documento não autoriza nenhum passo. Cada passo marcado **[nova autorização]** exige aprovação explícita e específica do proprietário, registrada no formulário da §10.

## 1. Escopo da primeira publicação

| Item | Valor |
| --- | --- |
| Conteúdo pretendido | Fundação do I-01 (identidade, empresas, vínculos, convites, auditoria, entitlements, RLS, Storage) e Cost Ledger do CR-027 (schema `finops` e suas funções) |
| Commit | `80631318e251ddc467f2236b85a5f74e998f8813` |
| Release contratual | 2.17 (CR-027 `approved_and_applied`) |
| Destino | um projeto Supabase de produção, ainda inexistente |
| Forma | somente schema, papéis, funções, políticas e dados de referência transportados por migration; banco vazio de dados de clientes |

### 1.1 Migrations que seriam promovidas

O histórico de migrations do Supabase é linear por versão. As migrations 000009–000012 (CR-009, CR-012, CR-014, CR-015) ficam **entre** a fundação e o Ledger; ver o bloqueio B-1 na §5.4.

| # | Arquivo | Origem | Conteúdo |
| --- | --- | --- | --- |
| 1 | `20260915000001_access_roles_and_context.sql` | I-01 | schemas `app`/`core`; papéis `oplyra_web_login`, `oplyra_worker_login`, `oplyra_worker_exec`; funções de contexto |
| 2 | `20260915000002_identity_and_tenancy.sql` | I-01 | catálogos, empresas, vínculos, convites, auditoria, entitlements; dados de referência (papéis, permissões, planos, capacidades) |
| 3 | `20260915000003_rls_policies.sql` | I-01 | papéis `oplyra_ops_login`/`oplyra_ops_exec`; RLS forçada e políticas; aceite de convite |
| 4 | `20260915000004_storage_isolation.sql` | I-01 | bucket privado `tenant-assets`; políticas em `storage.objects` |
| 5 | `20260915000005_last_owner_guard.sql` | I-01 | invariante de Owner ativo |
| 6 | `20260915000006_identity_scoped_reads.sql` | I-01 | `core.my_tenants`; `core.accept_invitation` pela claim |
| 7 | `20260915000007_resolve_access_context.sql` | I-01 | resolução do contexto de acesso |
| 8 | `20260915000008_operator_read_scope.sql` | I-01 | leitura delimitada do operador |
| 9 | `20260921000009_content_repository.sql` | CR-009 | schema `content`, drafts e variantes |
| 10 | `20260921000010_create_copy_variants_write.sql` | CR-012 | idempotência de action e outbox |
| 11 | `20260921000011_outbox_delivery_persistence.sql` | CR-014 | lease, fencing, dead-letter, deduplicação |
| 12 | `20260921000012_outbox_dispatcher_functions.sql` | CR-015 | papéis do dispatcher; claim e settlement |
| 13 | `20260929000013_finops_ledger_schema.sql` | CR-027 | schema `finops`, tabelas, constraints, triggers, RLS forçada |
| 14 | `20260929000014_finops_ledger_functions.sql` | CR-027 | sete funções `security definer`, grants mínimos |
| 15 | `20260929000015_tenant_deletion_owner_guard.sql` | CR-028 | guarda do último Owner pela existência em `core.tenants`; proteções do `finops` pela mesma regra (D-18) |

### 1.2 Deliberadamente não publicado

Salvo autorização futura específica: `apps/web` (Netlify ou outro destino), worker, dispatcher em execução, scheduler, `apps/ops-cli` apontando para produção, OpenRouter Adapter real, Stripe, providers reais de IA, anúncios, e-mail e análise de ativos, cofre produtivo de fingerprint, contrato de asset e saída visual, dados reais, contas reais de clientes e qualquer ativação de runtime. `supabase/seed.sql` **nunca** é aplicado em produção (§6).

## 2. Topologia

- **Desenvolvimento:** Supabase local via Docker (portas 544xx), recriável, com dados sintéticos. Continua sendo o único ambiente de desenvolvimento e teste.
- **Produção:** **um único** projeto Supabase remoto, separado, com PostgreSQL, Auth, Storage, credenciais e configuração próprios.
- O Supabase local não é um segundo servidor contratado nem uma réplica de produção; nada é copiado entre os dois, em nenhuma direção.
- **Sem homologação remota.** Divergência registrada: o [DATABASE-PROVISIONING-PLAN](../product/marketing-ops/environments/DATABASE-PROVISIONING-PLAN.md) prevê staging e EXP-03/04/E2-09 em staging; a decisão DP-28b continua pendente. Sem homologação, as verificações de hosting, restauração e carga que dependem de staging ficam sem ambiente e precisam de decisão (§3, D-15).
- **Deploy Previews nunca apontam para produção.** Nenhuma credencial de produção fica disponível para previews, branches ou CI de pull request; um preview que receba configuração de produção deve falhar na inicialização (§4.3).

## 3. Decisões ainda necessárias

D-01 a D-13 continuam `pending_owner_decision`. D-14 a D-17 (e D-18, no CR-028) foram **aprovadas** pelo proprietário em 29/09/2026 como recomendadas, sem aplicação remota. Nenhuma decisão foi contratada ou configurada por este documento.

| ID | Decisão | Impacto | Opções | Recomendação |
| --- | --- | --- | --- | --- |
| D-01 | Organização Supabase | Titularidade, faturamento, acesso administrativo e MFA | organização nova da Oplyra; organização existente do proprietário | organização própria da Oplyra, com MFA obrigatório e sem membros de outros produtos |
| D-02 | Nome e identificador do projeto | Rastreabilidade; o project ref é gerado pelo provedor | nome descritivo por ambiente | nome que contenha `oplyra` e `production`; registrar o ref sem segredos após a criação |
| D-03 | Região | Latência, residência de dados e LGPD | São Paulo (`sa-east-1`) ou outra região disponível | região mais próxima dos clientes brasileiros, sujeita à validação do EXP-03 e à política de dados |
| D-04 | Plano | Backups, PITR, limites, suporte e custo | gratuito; pago com add-ons | plano pago que ofereça backup gerenciado verificável antes de qualquer dado real; confirmar capacidades no momento da contratação |
| D-05 | Orçamento mensal | Teto de custo e alertas | valor fixo com alerta; sem teto | teto explícito com alerta de consumo; spend cap ligado quando disponível |
| D-06 | Backup e PITR | Recuperação de dados | backups diários do plano; PITR como add-on | backups ativos antes da primeira migration; PITR decidido junto com RPO; nenhuma dependência antes do EXP-04 |
| D-07 | RPO/RTO (DP-07b) | Perda tolerada e tempo de retorno | valores por criticidade | definir antes de dados reais; primeira publicação vazia pode seguir com RPO/RTO provisórios declarados |
| D-08 | Responsáveis administrativos | Quem cria, aplica migrations e responde a incidentes | uma pessoa; duas pessoas (quatro olhos) | ao menos dois responsáveis nomeados, um executor e um revisor |
| D-09 | Política de acesso | Menor privilégio, MFA, auditoria, break-glass (DP-16b) | acesso individual; conta compartilhada | acesso individual com MFA, sem conta compartilhada; custódia de break-glass definida |
| D-10 | Domínio e URLs de redirect | Auth, e-mails e callbacks | `https://app.oplyra.io` e variantes | só as URLs do app de produção; nenhuma URL local, de preview ou curinga |
| D-11 | SMTP | Entrega dos e-mails do Auth | SMTP padrão do provedor; SMTP próprio | SMTP próprio com domínio verificado antes de convites reais; o padrão do provedor tem limites baixos |
| D-12 | Retenção (D-5 do CR-027, 07 §11.6) | Ledger, auditoria, registros de chamadas, exclusão de tenant | sem TTL; TTL por classe | decidir antes de dados reais, junto com a política de exclusão (ver B-3) |
| D-13 | Janela da primeira publicação | Risco operacional e disponibilidade das pessoas | horário comercial; janela dedicada | janela dedicada com os dois responsáveis presentes, fora de horário de uso (não há usuários ainda) |
| D-14 **(aprovada: 000001–000015 contíguas, content/outbox/dispatcher inertes)** | Escopo das migrations 000009–000012 | Linearidade do histórico (B-1) | publicar as 14 com runtime inerte; adiar o Ledger até aprovar 9–12 | publicar as 14 como schema inerte, com aprovação explícita de que content/outbox/dispatcher entram sem ativação |
| D-15 **(aprovada: sem staging permanente; EXP-04 em projeto temporário autorizado à parte)** | Homologação remota (DP-28b) | EXP-03/04, E2-09 e drills | sem staging; staging separado | registrar formalmente a decisão; sem staging, definir onde o EXP-04 roda antes de dados reais |
| D-16 **(aprovada: SSL obrigatório; restrição de rede antes das senhas de runtime)** | Restrições de rede e SSL | Exposição do Postgres direto e dos logins customizados | sem restrição; allowlist de IPs; SSL obrigatório | SSL obrigatório e allowlist quando os consumidores forem conhecidos |
| D-17 **(aprovada: somente `public` e `graphql_public`)** | Exposição da Data API | Quais schemas o PostgREST expõe | padrão; lista explícita | somente `public` e `graphql_public`, como no local; nunca `app`, `core`, `content` ou `finops` |

## 4. Inventário de configuração e segredos

Somente nomes, finalidade, consumidor e armazenamento. Nenhum valor aparece aqui, no repositório, em logs ou em fixtures. Nomes canônicos vêm do doc 16 e do plano de segredos.

### 4.1 Valores públicos do frontend (não secretos, mas específicos por ambiente)

| Nome | Finalidade | Consumidor | Armazenamento |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto | navegador | configuração do destino do web (não publicado agora) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | chave publicável | navegador | idem |
| `NEXT_PUBLIC_APP_URL` | URL base do app | web | idem |

### 4.2 Credenciais de runtime (não usadas na primeira publicação)

| Nome | Finalidade | Consumidor | Armazenamento |
| --- | --- | --- | --- |
| `OPLYRA_ENV` | `production` | todos | configuração do destino |
| `SUPABASE_URL`, `SUPABASE_JWT_ISSUER`, `SUPABASE_JWKS_URL` | verificação de sessão | web servidor, worker, CLI | configuração do destino |
| `DATABASE_URL_APP` / `DATABASE_URL_POOLED` | conexão como `oplyra_web_login` via pooler | web servidor | secret store do destino do web |
| senha de `oplyra_web_login` | login do web | web servidor | secret store; definida fora de migration |

### 4.3 Credencial exclusiva de migrations

| Nome | Finalidade | Consumidor | Armazenamento |
| --- | --- | --- | --- |
| `DATABASE_URL_MIGRATIONS` | aplicar migrations revisadas como `postgres` | somente o executor autorizado da publicação | secret store pessoal do responsável ou ambiente protegido do pipeline; nunca em web, worker, CI de PR ou `.env` local |

### 4.4 Papéis de worker, dispatcher e operações

| Nome | Finalidade | Consumidor | Armazenamento |
| --- | --- | --- | --- |
| senha de `oplyra_worker_login` (+ `WORKER_DB_ROLE=oplyra_worker_exec`) | Ledger (acquire, close, remaining, sweep) e escrita de conteúdo | worker (não publicado) | secret store do destino do worker |
| senha de `oplyra_dispatcher_login` | claim e settlement da outbox | dispatcher (não publicado) | idem |
| senha de `oplyra_ops_login` / `OPS_ADMIN_CREDENTIAL` | provisionar empresa, períodos de orçamento, conciliação (auditados) | `ops-cli` de um responsável nomeado | secret store pessoal; nunca em web ou worker |

As migrations criam os logins **sem senha** (login impossível até a definição). O script `scripts/local-db-roles.sh` recusa host não local e não serve para produção; a definição de senha em produção é um passo operacional próprio **[nova autorização]**.

### 4.5 Auth e SMTP

| Nome | Finalidade | Consumidor | Armazenamento |
| --- | --- | --- | --- |
| Site URL e Redirect URLs | callbacks do Auth | Auth do projeto | configuração do projeto (painel/CLI), não migration |
| Credenciais SMTP | envio de e-mails do Auth | Auth do projeto | configuração do projeto |
| Chaves de assinatura JWT | emissão de sessões | Auth do projeto | gerenciadas pelo provedor |

### 4.6 Fingerprint HMAC

| Nome | Finalidade | Consumidor | Armazenamento |
| --- | --- | --- | --- |
| keyring de fingerprint (`keyId` ativo e anteriores) | `hmac-sha256:v1:<keyId>:<hex>` das tentativas | worker | **cofre produtivo ainda não implementado**: sem ele o uso produtivo continua bloqueado |

### 4.7 Providers ainda desabilitados

`OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`, `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`, `META_*`, `GOOGLE_ADS_*`, `EMAIL_PROVIDER_API_KEY`, `CREDENTIALS_MASTER_KEY`/`CREDENTIALS_KEY_VERSION`, `API_KEY_PEPPER`, `OTEL_EXPORTER_OTLP_HEADERS`. Nenhum é criado nem configurado na primeira publicação; `AI_EXECUTION_MODE` de produção fica ausente, e ausência bloqueia chamadas pagas.

### 4.8 Validação fail-closed contra mistura local/produção

Estado atual (CR-028, Release 2.18) em `packages/infra/src/config.ts`: `local`/`ci` aceitam somente endpoints locais; `OPLYRA_ALLOW_REMOTE` é rejeitada com qualquer valor; URLs com parsing estrito; produção exige endpoints remotos, `SUPABASE_PROJECT_REF` coerente com a URL e o banco (direto ou pooler), `OPLYRA_ENVIRONMENT_FINGERPRINT` e um `TrustedDeploymentContext` fornecido pelo composition root; sem provedor aprovado, produção falha fechada; a credencial de migrations nunca é aceita como credencial da aplicação. Os itens abaixo eram os requisitos do bloqueio B-4, agora atendidos localmente.

Requisitos do bloqueio B-4 (atendidos pelo CR-028):

1. fingerprint de ambiente não secreto (`OPLYRA_ENVIRONMENT_FINGERPRINT`: ambiente + project ref + identidade do deploy) validado na inicialização; divergência interrompe;
2. `local`/`ci` nunca alcançam host remoto; `OPLYRA_ALLOW_REMOTE` foi removida e sua presença impede a inicialização;
3. `production` só sobe com evidência confiável do deployment, ainda sem provedor aprovado;
4. scripts de banco (`db-guard.sh`, `local-db-roles.sh`) continuam recusando host não local; os testes (Vitest, pgTAP, Playwright) usam somente `127.0.0.1:544xx` e nunca recebem credenciais de produção;
5. previews e CI de pull request sem qualquer segredo de produção.

Endurecimento do parsing (CR-028, Release 2.18): `DATABASE_URL_APP` e `DATABASE_URL_OPS` aceitam somente `postgres:`/`postgresql:` e exigem usuário não vazio; `SUPABASE_URL` aceita `http:`/`https:` em local e CI e somente `https:` em produção, e rejeita usuário, senha, query e fragmento (nada disso chega a `supabaseUrl`, `jwksUrl` ou `jwtIssuer`); percent-encoding inválido no usuário é `ConfigError` sem expor o valor recebido. A `SUPABASE_URL` só admite path vazio ou `/`; issuer e JWKS são derivados dela (`<origem>/auth/v1` e `<origem>/auth/v1/.well-known/jwks.json`) e `SUPABASE_JWT_ISSUER`/`SUPABASE_JWKS_URL`, se presentes, precisam ser idênticos a esses valores canônicos, senão a inicialização falha sem expor o valor recebido.

**Reconciliação documental adiada (worktree misto).** Os documentos 16, `PREPARACAO-I01.md` e `VERIFICACOES.md` já continham alterações anteriores do proprietário e, por isso, as edições do CR-028 nesses três arquivos foram revertidas e ficam para uma mudança posterior, depois de o proprietário consolidar as suas. Enquanto isso eles ainda citam `OPLYRA_ALLOW_REMOTE` como proteção vigente; a fonte de verdade é o CR-028, [SECRETS-AND-IDENTITIES](../product/marketing-ops/environments/SECRETS-AND-IDENTITIES.md) e `config.ts`. Itens a reconciliar: doc 16 (§3 validação e tabela de variáveis: remover `OPLYRA_ALLOW_REMOTE`, incluir `SUPABASE_PROJECT_REF` e `OPLYRA_ENVIRONMENT_FINGERPRINT`), `PREPARACAO-I01.md` (§5 item 2 e A14) e `VERIFICACOES.md` (linha Local First e a frase de segurança dos comandos).

## 5. Auditoria das migrations

Revisão local, em ordem, dos 14 arquivos no commit `8063131`, com checagens pontuais no banco local (Postgres 17.6, `postgres` com `CREATEROLE`, sem superuser). Nenhuma migration foi modificada.

### 5.1 Por migration

| # | Dependências e extensões | Papéis, RLS, grants e definer | Destrutivo / dados | Observações |
| --- | --- | --- | --- | --- |
| 1 | nenhuma extensão; cria `app`, `core` | cria 3 papéis `nobypassrls` sem senha; `grant authenticated to oplyra_web_login`; `revoke all on schema app, core from public` | não | papéis são globais ao cluster e criados com `if not exists` |
| 2 | `gen_random_uuid()` (nativo desde PG 13); depende de `app.*` | RLS aplicada na 3; funções `security definer` com `search_path = core, pg_temp` | insere dados de **referência** (papéis, permissões, planos, capacidades) | não depende de seeds sintéticos |
| 3 | 1–2 | cria `oplyra_ops_*`; RLS habilitada e forçada nas 5 tabelas `core`; grants mínimos por papel | não | aceite de convite `security definer` |
| 4 | `auth.uid()`, `storage.buckets`, `storage.objects`, `storage.foldername` | políticas em `storage.objects` (tabela do `supabase_storage_admin`) | insere o bucket `tenant-assets` com `on conflict do nothing` | suporte documentado; criação das políticas entra no preflight obrigatório do projeto vazio (B-2) |
| 5 | 2 | trigger de restrição, sem definer | não | impede apagar empresa com Owner ativo (B-3) |
| 6 | 2–3 | funções `security definer`, `revoke from public` | `drop function if exists` de versão anterior do próprio histórico | sem efeito em banco vazio |
| 7 | 2 | idem | não | — |
| 8 | 3 | políticas de leitura do operador | não | — |
| 9 | 1–3 | schema `content` fora da Data API; RLS forçada; leitura pelo worker | não | CR-009 |
| 10 | 9 | RLS forçada; insert/update pelo worker | não | fingerprint SHA-256 sem chave em `action_idempotency` (F-1, pré-ativação) |
| 11 | 10 | RLS forçada, sem grants | `drop constraint`/`drop index` em tabela vazia | sem perda em banco vazio |
| 12 | 11 | cria `oplyra_dispatcher_*`; duas funções `security definer` com `search_path = pg_catalog, pg_temp`; EXECUTE só ao dispatcher | não | CR-015 |
| 13 | 1–3 | schema `finops`; RLS forçada nas 4 tabelas; nenhum grant; `revoke ... from public, anon, authenticated` | não | triggers impedem delete direto; cascata só pela exclusão do tenant |
| 14 | 13, `core.audit_log` | 7 funções `security definer`, dono `postgres` explícito, `search_path = pg_catalog, pg_temp`, revokes de `public`, `anon`, `authenticated`, `service_role`; EXECUTE só a `oplyra_worker_exec` ou `oplyra_ops_exec` | não | utilidades `finops.*` sem EXECUTE para papéis de aplicação |

### 5.2 Verificações transversais

- **Projeto vazio:** nenhuma migration exige extensão fora do núcleo do PostgreSQL ou do Supabase; `pgtap` só existe nos testes e não é necessária em produção.
- **Data API:** `app`, `core`, `content` e `finops` ficam fora dos schemas expostos, desde que D-17 mantenha a configuração local (`public`, `graphql_public`).
- **Owners:** tabelas e funções pertencem ao papel que aplica as migrations (`postgres`), que tem `BYPASSRLS` no Supabase local; as funções `security definer` do Ledger e do dispatcher dependem disso. No projeto hospedado, confirmar antes das migrations (B-2).
- **Nenhum papel de aplicação** recebe `BYPASSRLS`, superuser ou ownership (coberto por pgTAP).
- **Dados sintéticos:** nenhuma migration depende de `supabase/seed.sql`.
- **Repetição:** as migrations não são reexecutáveis como scripts (por exemplo, `create table` e `create policy` sem `if not exists`); a proteção é o histórico `supabase_migrations.schema_migrations`. Nenhuma contém `BEGIN/COMMIT` explícito nem `CONCURRENTLY`, portanto admitem execução transacional por arquivo; o comportamento transacional da ferramenta remota deve ser confirmado antes (B-2).
- **Locks e indisponibilidade:** em projeto vazio, sem tráfego, os `alter table` e `create index` não têm contenção relevante.
- **Não transportado por migration:** senhas dos quatro logins; Site URL, Redirect URLs, signup, confirmação de e-mail, tamanho mínimo de senha, rate limits, SMTP e templates do Auth; schemas expostos pela Data API; restrições de rede e SSL; pooler e seus usuários; backups/PITR; limites de Storage; MFA da organização; senha do `postgres`. A configuração local (`supabase/config.toml`: senha mínima 6, confirmações desligadas, signup ligado, redirects locais) **não** é adequada para produção.

### 5.3 Checagens executadas localmente nesta preparação

- `delete` de uma empresa sintética com Owner ativo, dentro de transação desfeita: recusado por `a empresa ficaria sem Owner ativo`.
- `postgres` local: `CREATEROLE`, sem superuser, membro de `authenticated` com `admin option`; `storage.objects` pertence a `supabase_storage_admin`; as 14 migrations aplicam-se com sucesso no banco local recriado (gates do CR-027).

### 5.4 Riscos e bloqueios encontrados — publicação ainda não pode ser proposta

| ID | Risco | Severidade | Tratamento exigido |
| --- | --- | --- | --- |
| B-1 | O escopo pedido (I-01 + CR-027) não é contíguo: 000009–000012 (content, outbox, dispatcher) estão no meio do histórico linear e seriam aplicadas junto, criando também os papéis do dispatcher | **resolvido por decisão** (D-14 aprovada) | publicar 000001–000015 contíguas, com content/outbox/dispatcher inertes; não usar aplicação fora de ordem |
| B-2 | Compatibilidade com o Supabase hospedado. **Reclassificado (CR-028 §3):** de incompatibilidade desconhecida para **preflight obrigatório no projeto vazio antes das migrations**. Evidência documental registrada na revisão técnica, não validada na prática: logins customizados suportados, `postgres` com `BYPASSRLS`, políticas em `storage.objects` suportadas, migrations ordenadas e registradas, seeds só quando pedidos | bloqueante até o preflight | **Grupo A**, somente leitura, coberto pela autorização de criar o projeto (runbook passo 7): versão e região, papéis/memberships/atributos, owners, histórico remoto vazio, schemas expostos, backup/PITR, `db push --dry-run`, formato documentado das conexões. **Grupo B**, só com a autorização separada de aplicar migrations (passo 8): criação real das políticas em `storage.objects`, comportamento transacional, owners e grants produzidos, qualquer DDL. Login customizado só com autorização separada para criar e guardar a senha. Nenhuma política temporária, migration experimental ou DDL de diagnóstico fica autorizada pela criação do projeto (CR-028 §3) |
| B-3 | A trigger de último Owner impede excluir empresa com Owner ativo; a cascata prevista no CR-027 §12 e a exclusão exigida pela LGPD não funcionam para empresas reais | **resolvido localmente** pelo CR-028 (Release 2.18); exclusão LGPD completa continua pendente | migration 000015 proposta no CR-028 §1 (decisão pela existência do tenant em `core.tenants`, sem `pg_trigger_depth()`; D-18 estende a mesma regra às proteções do `finops`); exclusão LGPD completa continua fora, junto com D-12 |
| B-4 | Guarda de configuração sem fingerprint de ambiente: um processo `local` com `OPLYRA_ALLOW_REMOTE=true` e credencial de produção alcançaria produção | **resolvido localmente** pelo CR-028 (Release 2.18); adapter de evidência do provedor pendente do destino web/worker | CR-028 §2: `local`/`ci` só locais, `OPLYRA_ALLOW_REMOTE` rejeitado, `SUPABASE_PROJECT_REF` e fingerprint obrigatórios em produção, validados contra um `TrustedDeploymentContext` fornecido pelo composition root a partir de metadado reservado do provedor; sem destino aprovado, runtime `production` permanece fail-closed |
| B-5 | Sem evidência de restauração (EXP-04) e sem homologação remota | antes de dados reais | D-06, D-07, D-15 |
| B-6 | Configuração de Auth local inadequada para produção | bloqueante para abrir Auth | checklist proposto no CR-028 §4, aplicado no runbook passo 5 |
| B-7 | Logins criados sem senha; nenhum procedimento produtivo de definição e rotação | bloqueante para qualquer runtime | passo 6 do runbook, com cofre definido (D-09) |
| B-8 | Fingerprint SHA-256 sem chave em `content.action_idempotency` (F-1) | antes de ativar `create_copy_variants` | CR próprio |
| B-9 | Cofre produtivo do keyring HMAC inexistente | antes de ativar o harness | incremento próprio |

## 6. Dados iniciais

- **Proibido em produção:** `supabase/seed.sql` (usuários `@local.test`, empresas fictícias Alfa e Beta, vínculos, entitlements e três períodos de orçamento sintéticos). Nunca usar `--include-seed`, `db reset`, `db reset --linked` nem cópia de banco local.
- **Dados de referência necessários:** papéis, permissões, papel→permissão, planos e capacidades (migration 2) e o bucket `tenant-assets` (migration 4) — já transportados por migration, sem dado de cliente.
- **Sem migration nova agora.** Nenhum dado canônico adicional é necessário para um banco vazio.
- **Procedimentos operacionais futuros, cada um com autorização própria:** empresa interna de verificação e seu primeiro Owner pelo `ops-cli` auditado (não por SQL cru); entitlements dessa empresa; períodos de orçamento por `app.open_budget_period` (auditado, operador identificado).
- **Nenhum dado real, nenhuma conta de teste remota** é criado por esta preparação.

## 7. Sequência futura de publicação (runbook não executável)

Não executar. Cada passo marcado **[nova autorização]** exige aprovação explícita; os demais só ocorrem depois da aprovação do pacote.

| Passo | Ação | Autorização |
| --- | --- | --- |
| 1 | Aprovar o pacote (§10) com commit, Release, destino, migrations e decisões D-01…D-17 | **[nova autorização]** |
| 2 | Criar a organização (se D-01) e o projeto vazio na região e no plano aprovados, com MFA | **[nova autorização — criar projeto]** |
| 3 | Registrar em `ESTADO.md` o project ref, a região e o plano, sem segredos; calcular o fingerprint de ambiente | coberto pelo passo 2 |
| 4 | Configurar e confirmar backup (e PITR, se contratado) antes de qualquer migration | coberto pelo passo 2 |
| 5 | Configurar Auth: Site URL, Redirect URLs de produção apenas, signup, confirmação de e-mail, senha mínima, rate limits, SMTP (D-11), templates; Data API somente `public`/`graphql_public`; SSL e rede (D-16) | coberto pelo passo 2 |
| 6 | Guardar a senha do `postgres` e a credencial de migrations no cofre; logins de aplicação continuam sem senha até o runtime correspondente ser autorizado | coberto pelo passo 2; senhas de runtime: **[nova autorização]** |
| 7 | Preflight do Grupo A do B-2, somente leitura: histórico remoto vazio contra o repositório no commit aprovado, versão, região, papéis, owners, schemas expostos, backup/PITR, `db push --dry-run` e formato das conexões; nenhuma DDL | coberto pelo passo 2 |
| 8 | Aplicar as migrations aprovadas, em ordem, sem seed; observar o Grupo B do B-2 (políticas de Storage, comportamento transacional, owners e grants produzidos) | **[nova autorização separada — aplicar migrations]** |
| 9 | Aplicar a configuração não transportada restante e registrar o checklist | coberto pelo passo 8 |
| 10 | Executar as verificações não destrutivas da §8 | coberto pelo passo 8; a parte com empresa interna exige **[nova autorização]** |
| 11 | Registrar em `ESTADO.md`: versão, destino sem segredos, migrations aplicadas, checks, incidentes e o estado `publicado e verificado` ou `publicação com falha` | coberto pelo passo 8 |

## 8. Verificação pós-publicação

Checks não destrutivos. **Nada disto foi executado remotamente.**

| Área | Check |
| --- | --- |
| Saúde do banco | conexão pelo papel de migrations; versão do PostgreSQL; ausência de erros no log da aplicação das migrations |
| Migrations aplicadas | `supabase_migrations.schema_migrations` contém exatamente as versões aprovadas, na ordem, e nenhuma extra |
| Auth | endpoint de JWKS responde; Redirect URLs sem entradas locais ou curinga; signup e confirmação conforme o checklist |
| Isolamento entre tenants | com duas empresas internas futuras autorizadas, leitura e escrita cruzada negadas pelas sessões reais (sem dados reais) |
| RLS | todas as tabelas de `core`, `content` e `finops` com RLS habilitada e forçada; políticas iguais às do local (consulta a `pg_class`/`pg_policies`) |
| Privilégios de worker e ops | `has_function_privilege` e `has_table_privilege` com os mesmos resultados das asserções do pgTAP de privilégios, executados como consultas de leitura, não como suíte de testes |
| Ledger sem acesso direto | nenhum privilégio de tabela em `finops` para `anon`, `authenticated`, `service_role` e os papéis `oplyra_*`; Data API sem `finops` |
| Ledger funcional | somente com uma empresa interna futura e período aberto por operador: aquisição, fechamento e replay idêntico (`duplicate`) com estimativa zero e Test Adapter; nenhum provider real **[nova autorização]** |
| Ausência de seeds | nenhum usuário `@local.test`, nenhuma empresa Alfa/Beta, nenhum período `bp-a…`/`bp-b…` |
| Sem providers e gastos | nenhuma credencial de provider configurada; `AI_EXECUTION_MODE` ausente; nenhuma chamada externa registrada |
| Logs sem segredos | logs do projeto e da execução sem senhas, chaves, tokens ou URLs com credencial |

## 9. Interrupção e recuperação

- **Critérios de parada:** destino, commit ou fingerprint divergentes; histórico remoto não vazio ou divergente; qualquer erro de migration; RLS ou privilégio diferente do esperado; seed ou dado sintético presente; credencial exposta; autorização ambígua; backup não confirmado.
- **Migration parcialmente aplicada:** parar os passos dependentes; registrar a última versão presente no histórico e o estado encontrado; não repetir às cegas; reconciliar antes de continuar.
- **Correção progressiva:** somente por nova migration revisada, aprovada e versionada. **Nunca editar migration já aplicada.**
- **Restauração ou PITR:** somente com autorização específica de incidente e janela de perda declarada.
- **Nunca** usar `db reset`, `reset --linked` ou DDL manual em produção fora de incidente autorizado e reconciliado no repositório.
- **Sem promessa de rollback automático.** Código se reverte por artefato anterior; estado do banco, não.
- **Preservar evidências:** histórico de migrations, logs, estado de papéis e políticas, antes de qualquer correção.

## 10. Gate de autorização

Preencher e aprovar antes de qualquer passo remoto. Campos vazios impedem a execução.

```text
Commit:                          80631318e251ddc467f2236b85a5f74e998f8813
Release:                         Contract Registry Release 2.17 (manifest sha256 0870c3af…3076)
Destino (org / projeto / ref):   ________ / ________ / (registrado após a criação)
Migrations autorizadas:          [ ] 000001–000015 (15, D-14 aprovada)
Região / plano:                  ________ / ________
Backup / PITR:                   ________ / ________   RPO/RTO provisórios: ________
Segredos disponíveis no cofre:   [ ] credencial de migrations  [ ] senha postgres  (runtime: não)
Configuração não transportada:   [ ] checklist Auth/SMTP/Data API/rede aprovado
Janela:                          ________ (início / fim / fuso)
Verificações pós-publicação:     §8 (lista aprovada)
Critérios de interrupção:        §9 (lista aprovada)
Bloqueios da §5.4 resolvidos:    B-1 [x] D-14  B-3 [x] local  B-4 [x] local  B-2 [ ] preflight  B-6 [ ] checklist aplicado
Responsável executor / revisor:  ________ / ________
Autorização para CRIAR o projeto:            [ ] sim  — assinatura/data: ________
Autorização SEPARADA para APLICAR migrations: [ ] sim — assinatura/data: ________
Fora do escopo (confirmar):      web, worker, dispatcher, OpenRouter, Stripe, providers reais, dados reais, seeds
```
