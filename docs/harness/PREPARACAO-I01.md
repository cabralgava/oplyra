# Preparação para o início da implementação (I-01)

11/09/2026 · Preparação documental concluída · **Nenhuma implementação autorizada por este documento.**

> **Revisado em 15/09/2026, após a reconciliação documental.** A referência protegida passou a ser a **v2.2, de 13/09/2026** (SHA `79a25138…`); a ancoragem das decisões foi normalizada; o escopo de vídeo como ativo de entrada e o método de campanha (DEC-017) foram incorporados aos documentos; a direção visual passou ao guia de interface. As seções 4 (decisões necessárias), 5 (plano do I-01) e 6 (pendências adiadas) continuam válidas: o I-01 é identidade, tenancy, RLS, Storage, entitlements e `ops-cli`, e nenhuma das mudanças acima o altera. **Nenhuma decisão foi aprovada; o I-01 continua aguardando autorização.**

Este registro consolida a releitura integral da documentação reconciliada, a verificação independente da reconciliação, a validação interativa do protótipo conceitual, a classificação das decisões pendentes e o plano executável do incremento I-01. Ele não cria scaffold, migrations, infraestrutura, repositório, integração real ou chamada paga.

Fontes canônicas respeitadas: [00](../product/marketing-ops/00-documento-transicao.md) como referência protegida somente leitura, qualificada por [ATUALIZACOES](../product/marketing-ops/ATUALIZACOES.md); domínio em [03](../product/marketing-ops/03-domain-model.md); Agent Run em [05 §9](../product/marketing-ops/05-data-model.md#9-agentic-operations); franquias e budgets em [08](../product/marketing-ops/08-billing-entitlements.md); autonomia em [11](../product/marketing-ops/11-agent-governance.md); fases e incrementos em [12](../product/marketing-ops/12-roadmap.md); Registry/Router/Eval/Ledger e limites em [13](../product/marketing-ops/13-ai-model-routing-finops.md); testes e aceite em [15](../product/marketing-ops/15-test-plan.md); memória econômica em [17](../product/marketing-ops/17-risks-costs.md); experimentos em [18](../product/marketing-ops/18-technical-experiments.md); pendências em [decisões](../decisions/README.md).

## 1. Diagnóstico de prontidão

| Dimensão | Situação | Consequência |
| --- | --- | --- |
| Direção de produto e mercado | Definida: SaaS B2B (DEC-018), Performance primeiro, sem CRM próprio (DEC-013), imagens no MVP, vídeo apenas como ativo de entrada (DEC-014/015), método de campanha obrigatório (DEC-017) | Não reabrir; orienta templates, fluxos e exemplos |
| Decisões de fornecedor da fundação | Supabase (ADR-0001) e Stripe (decisão de billing em [ATUALIZACOES](../product/marketing-ops/ATUALIZACOES.md) §2) fechados | I-01 e I-02 podem ser planejados sem seleção adicional |
| Domínio e contratos | Modelo conceitual, invariantes com IDs e contrato canônico de Agent Run existem | Suficiente para modelar o I-01; agregados finais se confirmam no DDD do incremento |
| Stack complementar | **Proposta, não aprovada** (ADR-0002) | Bloqueia início da implementação até decisão |
| Isolamento e acesso a dados | **Proposta condicionada ao EXP-01** (ADR-0003) | Tabelas definitivas do I-01 dependem do resultado do experimento |
| Runtime, filas, Registry/Router/Ledger | Propostos, condicionados a EXP-02/EXP-05 | Pertencem ao I-02; não bloqueiam o I-01 |
| Economia e política comercial | Baseline é hipótese reconstruída; medidores, cadência, rateio e limites continuam propostas | Bloqueiam ativação paga e promessa comercial, não o trabalho local |
| Publicação | Destinos propostos, nenhuma conta criada | Bloqueia publicação, não o I-01 local |
| Ferramentas do repositório | Sem Git, sem scripts, sem CI | Decisão DP-14a antes de produzir código revisável |
| Direção visual | Guia de interface e manual de marca vigentes; nenhum frame inspecionado | Telas do I-01 seguem o guia; medidas finais dependem de DP-35 |
| Ativos enviados e vídeo | Escopo definido; provedor, medidor e retenção pendentes (DP-34) | Não bloqueia o I-01; bloqueia a capacidade em I-07 |

**Conclusão:** a documentação está pronta para sustentar o I-01 local. O que falta não é documentação, e sim um conjunto pequeno de decisões do usuário (seção 3) e a execução do EXP-01 dentro do próprio incremento.

## 2. Verificação independente da reconciliação

Executada nesta sessão contra os arquivos reais; não reutiliza as conclusões do [relatório da reconciliação](RELATORIO-RECONCILIACAO.md).

A verificação original, de 11/09, referia-se ao conjunto documental anterior e foi substituída pela tabela abaixo, refeita em 15/09 após a reconciliação.

| Item verificado | Método | Resultado |
| --- | --- | --- |
| Referência protegida | SHA-256 do 00 | `79a25138…435b`; v2.2, de 13/09/2026 |
| Ancoragem das decisões | Cruzamento de cada citação `DEC-0xx` com a numeração real da v2.2 §27 | Citações corrigidas; Stripe, budgets, imagens e IA multimodal passam a citar ATUALIZACOES |
| Versão declarada nos derivados | `grep` por versão nos 01–18 e nas instruções | Todas apontam para a v2.2 |
| Links locais e âncoras | Varredura completa em `.md` | Registrado na entrega desta revisão |
| Escopo de vídeo | 01, 03, 04, 05, 06, 08, 09, 10, 12, 13, 15, 18 | Análise de ativo permitida; geração/renderização ausente em todos |
| Método de campanha | 01, 02, 03, 09, 10, 11, 14, 15, 18 | Incorporado a requisitos, invariantes, gates, fluxos e avaliação |
| Coerência do Stripe | ADR-0007 × 08 §13 × 12 (I-02) | Coerentes; nenhum texto adiando billing para a Fase 5 |
| Arquitetura multiprovedor | ADR-0006 × 13 × EXP-05 × variáveis de 16 §4 | Coerentes; modalidade de análise de ativo acrescentada |
| Supabase/Auth/RLS | 04 §12, 06 §2, 07 §2 | Coerentes com ADR-0001 |
| Direção visual | CLAUDE, README, 14 §12, protótipos | Referência única; protótipo claro movido para histórico |
| Domínios | Repositório inteiro | `oplyra.io` nas especificações; menções antigas só na referência protegida e no registro de substituição |

Limite: estas verificações demonstram consistência documental. **Não demonstram isolamento, segurança, custo ou comportamento de uma aplicação que não existe.**

## 3. Validação interativa do protótipo conceitual

Executada no navegador em 11/09/2026 sobre a versão então vigente do protótipo — hoje preservada como [histórico em tema claro](../product/marketing-ops/prototypes/performance-mvp-legacy-claro.html) — com estado lido no DOM (não apenas por captura de tela). O realinhamento visual de 15/09 alterou apenas tokens de cor e tipografia, sem tocar na lógica exercitada. O protótipo **não é a aplicação** e **não possui integração de IA**: os fluxos abaixo são simulações estáticas, sem persistência, sem chamada externa e sem custo.

| Cenário | Resultado observado |
| --- | --- |
| Geração de imagem (F-12) | Reserva de capacidade antes do resultado; estado "Produzindo"; contador de franquia inalterado enquanto pendente |
| Falha (F-12) | Franquia preservada (12/60), mensagem distingue tentativa sem resultado de custo externo a conciliar |
| Conclusão e versão | Contador vai a 13/60; versão 1 criada como rascunho com revisão independente declarada |
| Aprovação de imagem | "Versão 1 · Aprovada nesta simulação · Não publicada" |
| Edição (F-13) | Consome medidor próprio (edições 4→5), cria versão 2 e reabre a aprovação ("Aprovar versão 2") — aprovação anterior não se estende à nova versão |
| Limite (F-14) | Novas ações bloqueadas, sem cobrança automática de excedente e sem alterar contadores |
| Consumo (F-14) | Tabela reflete 13 gerações e 5 edições; reserva aparece e desaparece conforme o estado |
| Aprovação de entrega (F-05) | Painel lateral paralelo → modal de confirmação por versão → estado "Aprovado", bloco de UTMs visível, botão de aprovar desabilitado, foco movido para o título do resultado, aviso de que nada foi auditado de verdade |
| Teclado | `Esc` fecha o modal de confirmação (verificado); armadilha de foco implementada no diálogo |
| Troca de empresa (F-02) | Passa a exibir apenas a tela da Beta; nenhuma tela da Alfa permanece visível; papel "Leitura" refletido; navegação desabilitada por não haver telas próprias da Beta no protótipo |
| Retorno à empresa anterior (F-02) | Volta para a Alfa pelo seletor, reabilita a navegação e abre o Início; nenhuma tela da Beta permanece; os estados simulados da Alfa (entrega aprovada, versão 2 do visual) continuam consistentes |
| Viewport estreito (768 px) | Navegação vira barra horizontal rolável; conteúdo legível em coluna única |

**Limitações registradas:** ativação de botão por `Enter`/espaço não pôde ser confirmada pelo injetor de teclas do ambiente (o evento chega à página — `Esc` funciona — mas não produziu ativação nativa); sem teste com leitor de tela; sem dispositivo físico; sem análise de animação quadro a quadro; viewport emulado no painel do navegador.

**Correção aplicada nesta preparação:** ao aprovar uma versão visual, a linha de revisão continuava exibindo "Aguarda aprovação humana desta versão", contradizendo o estado aprovado. Corrigida para refletir a aprovação e avisar que nova edição exige nova aprovação. Verificado: sintaxe do script válida, sem IDs duplicados, sem referência de script a elemento inexistente, e o fluxo reexecutado no navegador após a correção (gerar → concluir → aprovar) passou a exibir versão, revisão e estado coerentes entre si.

## 4. Decisões registradas

Decididas pelo usuário em 15/09/2026. O registro canônico é o [registro de decisões](../decisions/README.md); esta tabela é o espelho local.

| ID | Assunto | Situação |
| --- | --- | --- |
| DP-01b | Escopo do I-01, somente local, conforme §5 | **Decidida** — escopo enxuto mantido |
| DP-02a | TypeScript estrito em Node.js LTS (web, CLI; worker no I-02) | **Decidida** |
| DP-02b1 | pnpm workspaces | **Decidida** |
| DP-02b2 | Turborepo | **Adiada** — reavaliar ao fim do I-01, com tempo de CI medido; até lá, scripts de workspace |
| DP-02c | Next.js (App Router); route handlers e server actions apenas como controllers | **Decidida** |
| DP-02e | Vitest, pgTAP, Playwright e lint de fronteiras | **Decidida** |
| DP-14a | Repositório Git local (`git init`, `.gitignore`, commits locais) | **Decidida** — sem repositório remoto (DP-14b segue pendente) |
| DP-03a | EXP-01 como primeira atividade do I-01, local e sintético | Incluída no escopo de §5 |
| DP-13 | Identificadores de código em inglês com glossário PT↔EN | Incluída no escopo de §5 |
| DP-20 | `ops-cli` restrita a provisionar empresa e primeiro Owner, com auditoria | Incluída no escopo de §5 |
| DP-25 | `referenceScope` fora do catálogo persistido | Incluída no escopo de §5 |
| DP-33 | Papéis do I-01: Owner, Administrador, Gestor de Marketing e Leitura | Incluída no escopo de §5 |
| DP-01a | Recorte Must/Should/Won't do Performance | Reclassificada para antes do I-03 |

As cinco marcadas como "incluída no escopo" fazem parte do plano descrito em §5 e são exercidas por ele. Se alguma não estiver coberta pela sua decisão, basta dizer qual e ela volta a pendente.

Continuam **fora** desta etapa: publicação, criação de contas ou serviços externos, APIs pagas, dados de pilotos, cobrança, EXP-02 a EXP-05, runtime de agentes e qualquer consolidação de DP-03b ou DP-02d antes do resultado do EXP-01.

## 5. Contratos e aceite do I-01

Escopo: identidade, empresas, vínculos, autorização, RLS, Storage, entitlements básicos e administração delimitada. Sem runtime de agentes, sem filas, sem integrações externas, sem billing real.

### 5.1 Sequência

1. Repositório: `git init`, `.gitignore`, workspace pnpm, versões fixadas e registradas, `.env.example` sem segredos.
2. Ambiente: Supabase CLI e Docker próprios; `config.toml` versionado; comandos reais de iniciar, parar, recriar e testar registrados em [VERIFICACOES](VERIFICACOES.md); validação de configuração que falha se apontar para host remoto sem `OPLYRA_ALLOW_REMOTE=true`.
3. **EXP-01** em schema descartável, com duas empresas sintéticas.
4. Decidir DP-03b e DP-02d com o resultado e atualizar a ADR-0003.
5. Modelar o domínio (§5.4) e só então escrever as migrations definitivas (§5.7).
6. Implementar portas e adapters (§5.5), casos de uso (§5.6) e `ops-cli`.
7. Interface mínima: login, aceite de convite, troca de empresa, equipe, estados de erro e de sem permissão, no tema escuro do guia.
8. Seeds sintéticos com os atores de teste de [15 §2](../product/marketing-ops/15-test-plan.md).
9. Verificar §5.9 e apresentar para aceite.

### 5.2 Estrutura

```text
apps/web/            Next.js — UI, BFF e API v1; handlers são controllers
apps/ops-cli/        comandos delimitados de plataforma
packages/core/       domínio e aplicação: entidades, invariantes, casos de uso, portas
packages/contracts/  schemas de entrada/saída e tipos compartilhados
packages/infra/      adapters: Auth, repositórios, Storage, transações, auditoria
packages/testing/    fakes, fixtures e construtores de cenário
supabase/migrations/ SQL versionado, fonte de verdade do schema
supabase/tests/      pgTAP, incluindo a matriz de isolamento
supabase/seed/       dados sintéticos com duas empresas
```

`apps/worker` só existe a partir do I-02. Sem Turborepo: as tarefas são scripts de workspace.

### 5.3 Fronteiras

| Camada | Depende de | Nunca depende de |
| --- | --- | --- |
| `core/domain` | Nada além da linguagem | Casos de uso, portas, SDKs, HTTP, SQL |
| `core/application` | Domínio e portas internas | Supabase, Next.js, Stripe, provedores de IA |
| `infra` | Domínio, aplicação, contratos, SDKs | Regras de negócio |
| `apps/*` | Aplicação e contratos, via composition root | Banco ou SDK fora dos adapters |

Regra verificável: qualquer import de `@supabase/*` fora de `packages/infra` falha o lint de fronteiras; o pool de conexões só é alcançável pelos wrappers de §5.5.

### 5.4 Domínio do incremento

**Entidades e agregados:** `Tenant` + `Membership` (raiz `Tenant` para composição do vínculo); `Invitation`; `AuditEntry`; `TenantEntitlements`. `Role` e `Permission` são catálogo global de referência, sem `tenant_id`.

**Objetos de valor:** `TenantId`, `UserId`, `MembershipId`, `RoleKey`, `PermissionKey`, `Slug`, `Email`, `AccessContext`.

**Papéis do I-01 (DP-33):** `owner`, `admin`, `marketing_manager`, `viewer`, em ordem decrescente de precedência. Precedência serve à regra de convite e de alteração de papel.

**Invariantes, com a regra exata:**

| ID | Regra verificável |
| --- | --- |
| I-TEN | `tenant_id` é obrigatório, imutável após a criação e toda referência entre tabelas de empresa usa chave composta `(tenant_id, id)`. RLS habilitada **e forçada** em todas elas. |
| I-MEM | Toda operação resolve vínculo ativo e permissão **no momento da execução**; nenhum papel vem do token. Um `Tenant` mantém ao menos um `Membership` ativo com `owner`. |
| I-INV | Convite tem prazo, uso único e papel de precedência menor ou igual à do convidante; aceite exige correspondência do e-mail. |
| I-AUD | Toda operação privilegiada grava entrada de auditoria com ator, motivo, alvo, antes/depois e correlação, na mesma transação do efeito. |

### 5.5 Portas

Assinaturas conceituais, em TypeScript, para fixar o contrato. Não são código do projeto.

```ts
type AccessContext = {
  userId: UserId; tenantId: TenantId; membershipId: MembershipId;
  roleKey: RoleKey; permissions: ReadonlySet<PermissionKey>; resolvedAt: Date;
};

interface UnitOfWork {
  withUserTransaction<T>(ctx: AccessContext, fn: (tx: Tx) => Promise<T>): Promise<T>;
  withWorkerTransaction<T>(tenantId: TenantId, jobRef: JobRef, fn: (tx: Tx) => Promise<T>): Promise<T>;
}

interface AuthGateway { verifyAccessToken(raw: string): Promise<VerifiedClaims>; }

interface AccessContextResolver {
  resolve(claims: VerifiedClaims, tenantId: TenantId): Promise<AccessContext>; // consulta vínculo ao vivo
}

interface TenantRepository {
  create(tx: Tx, input: NewTenant): Promise<Tenant>;
  findBySlug(tx: Tx, slug: Slug): Promise<Tenant | null>;
}

interface MembershipRepository {
  findActive(tx: Tx, userId: UserId, tenantId: TenantId): Promise<Membership | null>;
  listActiveByUser(tx: Tx, userId: UserId): Promise<TenantSummary[]>;
  countActiveOwners(tx: Tx, tenantId: TenantId): Promise<number>;
  add(tx: Tx, m: NewMembership): Promise<Membership>;
  changeRole(tx: Tx, id: MembershipId, role: RoleKey): Promise<void>;
  deactivate(tx: Tx, id: MembershipId): Promise<void>;
}

interface InvitationRepository {
  create(tx: Tx, inv: NewInvitation): Promise<Invitation>;
  findPendingByTokenHash(tx: Tx, hash: string): Promise<Invitation | null>;
  markAccepted(tx: Tx, id: InvitationId, userId: UserId): Promise<void>;
}

interface EntitlementsPort { can(ctx: AccessContext, capability: CapabilityKey): Promise<boolean>; }
interface StorageGateway { signedUrlForTenantPath(ctx: AccessContext, path: string, op: "read" | "write"): Promise<string>; }
interface AuditLogPort { record(tx: Tx, entry: AuditEntry): Promise<void>; }
interface Clock { now(): Date; }
interface IdGenerator { next(): string; }
interface TokenHasher { hash(raw: string): string; }
```

`StorageGateway` recusa qualquer `path` cujo prefixo não seja o do tenant de `ctx`.

### 5.6 Casos de uso

| Caso de uso | Entrada | Saída | Erros de domínio | Invariantes |
| --- | --- | --- | --- | --- |
| `ProvisionTenant` (só `ops-cli`) | `{ name, slug, ownerEmail, reason, operatorId }` | `{ tenantId, ownerMembershipId }` | `SlugAlreadyTaken`, `InvalidSlug`, `OperatorNotAuthorized` | I-TEN, I-MEM, I-AUD |
| `InviteMember` | `{ ctx, email, roleKey }` | `{ invitationId, expiresAt }` | `PermissionDenied`, `RoleExceedsInviterRole`, `MemberAlreadyActive`, `InvalidEmail` | I-MEM, I-INV, I-AUD |
| `AcceptInvitation` | `{ userId, rawToken }` | `{ membershipId, tenantId }` | `InvitationNotFound`, `InvitationExpired`, `InvitationAlreadyUsed`, `EmailMismatch` | I-INV, I-MEM |
| `ListMyTenants` | `{ userId }` | `TenantSummary[]` | — | I-MEM |
| `ResolveActiveTenant` | `{ claims, tenantId }` | `AccessContext` | `MembershipNotFound`, `MembershipInactive` | I-MEM |
| `ChangeMemberRole` | `{ ctx, membershipId, roleKey }` | `void` | `PermissionDenied`, `RoleExceedsActorRole`, `LastOwnerCannotBeDemoted` | I-MEM, I-AUD |
| `RemoveMember` | `{ ctx, membershipId, reason }` | `void` | `PermissionDenied`, `LastOwnerCannotBeRemoved` | I-MEM, I-AUD |
| `CheckCapability` | `{ ctx, capability }` | `boolean` | — | — |

Erro de domínio nunca vaza detalhe de outro tenant: a resposta de recurso inexistente e a de recurso de outra empresa são indistinguíveis para o cliente.

### 5.7 Schema conceitual

Colunas mínimas e restrições que o aceite verifica. **Não são migrations**; as migrations são escritas no passo 5 da sequência, depois do EXP-01.

| Tabela | Colunas mínimas | Restrições |
| --- | --- | --- |
| `tenants` | `id`, `name`, `slug`, `status`, `timezone`, `locale`, `created_at` | `slug` único; RLS forçada |
| `memberships` | `id`, `tenant_id`, `user_id`, `role_key`, `status`, `created_at`, `revoked_at` | PK composta `(tenant_id, id)`; único `(tenant_id, user_id)` entre ativos; `tenant_id` imutável; RLS forçada |
| `invitations` | `id`, `tenant_id`, `email`, `role_key`, `token_hash`, `expires_at`, `accepted_at`, `invited_by`, `status` | FK composta para `tenants`; `token_hash` único; RLS forçada |
| `audit_log` | `id`, `tenant_id`, `actor_type`, `actor_id`, `action`, `target`, `before`, `after`, `reason`, `correlation_id`, `created_at` | Somente inserção para papéis de aplicação; RLS forçada |
| `tenant_entitlements` | `tenant_id`, `capability_key`, `value`, `source`, `valid_until` | FK composta; RLS forçada |
| `roles`, `permissions`, `role_permissions`, `plans` | catálogo global | Sem `tenant_id`; leitura para papéis de aplicação, escrita só por migration |

Schemas de domínio ficam fora da Data API.

### 5.8 EXP-01

Critérios, decisão dependente e alternativa permanecem os de [18](../product/marketing-ops/18-technical-experiments.md): E1-01 a E1-11 integralmente conforme; E1-07 com zero violações em 10.000 transações concorrentes, em ao menos três execuções; E1-12 com p95 do overhead de autorização ≤ 20 ms local; wrappers garantidos por teste de arquitetura; revisão de segurança do código de conexão. Reprovação estrutural leva à alternativa PostgREST com funções `SECURITY INVOKER`, com revisão dos schemas expostos e reescrita da ADR-0003. **Resultado negativo não autoriza seguir com a proposta original.**

### 5.9 Critérios de aceite

Cada item é verificável e indica como é provado. Item não executado é registrado como tal e impede a conclusão.

| # | Critério | Prova |
| --- | --- | --- |
| A01 | Ambiente sobe, é recriado do zero por migrations e seeds, e os comandos documentados foram realmente executados | Procedimento registrado com saída real |
| A02 | Login por senha e magic link funcionam com e-mail de teste local | Integração com Supabase local |
| A03 | `ops-cli` provisiona empresa e primeiro Owner, com `--dry-run` padrão, motivo obrigatório e auditoria | Integração + inspeção do `audit_log` |
| A04 | Convite expira, é de uso único e não concede papel acima do convidante | Unidade + integração |
| A05 | Último Owner não pode ser removido nem rebaixado | Unidade + pgTAP |
| A06 | Membro removido perde acesso na requisição seguinte, com sessão ainda válida no Auth | Integração com sessão real (TST-03) |
| A07 | Matriz de isolamento de [15 §3](../product/marketing-ops/15-test-plan.md) aprovada para **cada** tabela do incremento | pgTAP gerado por tabela (TST-04) |
| A08 | Arquivo de B não é listado, lido nem gravado por A; caminho legítimo funciona; URL assinada de A não serve a B | Integração de Storage (TST-05) |
| A09 | `tenant_id` não pode ser alterado e FK composta impede referência cruzada entre empresas | pgTAP |
| A10 | Schemas de domínio não expostos pela Data API | Verificação de configuração + tentativa com chave publicável (E1-11) |
| A11 | `can()` nega capacidade ausente mesmo em chamada direta ao backend | Integração (TST-06) |
| A12 | Nenhum acesso ao pool fora dos wrappers; nenhum import de SDK fora de `infra` | Teste de arquitetura + lint de fronteiras (TST-02) |
| A13 | Bundle sem chave privada; logs sem tokens; varredura de segredos limpa | CI (TST-18) |
| A14 | Configuração apontando para host remoto sem flag explícita falha na inicialização | Teste de configuração (TST-19) |
| A15 | EXP-01 executado, resultados brutos registrados e ADR-0003 atualizada com a decisão | Registro do experimento |
| A16 | Telas do incremento com estados vazio, erro e sem permissão, no tema escuro do guia, revisadas com `apple-design` | Revisão de UI + Playwright nos fluxos do incremento |
| A17 | Toda operação privilegiada gera auditoria na mesma transação do efeito | pgTAP + integração |

**Resultado: A01 a A17 atendidos.** Fechados em 16/09/2026 os dois que estavam parciais:

- **A02** — o link por e-mail passou a levar o `token_hash` para uma rota da própria aplicação, que verifica no servidor: nada depende de fragmento de URL e o token não fica exposto ao script da página. Verificado ponta a ponta pelo Mailpit: e-mail entregue, sessão aberta em cookie `httpOnly` e o mesmo link recusado na segunda vez.
- **A16** — 16 testes Playwright cobrem entrada, estado vazio, duas empresas, equipe, convite com token exibido uma única vez, papel sem permissão, empresa de terceiro na URL, teclado, foco, viewport de 768 px, tema e preferências do sistema. O checklist `apple-design` da aplicação está em [14 §9.1](../product/marketing-ops/14-ux-flows.md), com as duas correções que ele produziu.

Permanecem registrados como não verificados: teste com leitor de tela real e a inspeção dos frames do Figma (DP-35).

**Pronto** significa: A01 a A17 aprovados, evidências associadas à versão entregue, diff revisado, gates de lint, tipos, testes e build verdes e [ESTADO](ESTADO.md) atualizado. Gate correspondente: **G3** de [VERIFICACOES](VERIFICACOES.md).

### 5.10 Continuidade em I-02 (não autorizado aqui)

Filas e scheduler com EXP-02, runtime de execução, Registry, Router e Cost Ledger com adapters fake, reservas e budgets, integração Stripe em modo teste e instrumentação. A Fase 1 não se encerra sem Stripe integrado em teste.

## 6. Pendências adiadas e o momento em que bloqueiam

| Pendência | Não bloqueia | Bloqueia exatamente | Quando decidir |
| --- | --- | --- | --- |
| DP-29 — medidores, período, fuso, mudança de plano, excedentes | I-01, modelagem | Ativar contagem de franquia e exibir saldo real ao cliente; qualquer cobrança de excedente | Antes do I-05 (imagens consomem franquia) e antes de cobrar |
| DP-30 — quinta ocorrência semanal e consolidação mensal | I-01, I-02 | Ativar a recorrência automática de check-ins com IA | Antes do I-08 |
| DP-31 — COGS, rateio e validação do baseline | Trabalho local | Afirmar custo por tenant, margem, viabilidade das franquias e pricing | Antes da Fase 5 e de qualquer promessa comercial |
| DP-32 — limites numéricos por workflow | Configuração local com fakes | Ativar rota paga: sem limite e tarifa válidos, nenhuma chamada paga | Antes de habilitar o gateway real (I-02/I-05) |
| DP-11a — cobrança de pilotos, preço, trial, inadimplência | Integração Stripe em teste no I-02 | Débito real de qualquer cliente | Antes de cobrar pilotos |
| DP-34 — provedor, medidor, custo e retenção da análise de ativos | I-01 e I-02 | Ativar a ingestão e a análise de vídeo no I-07 | Antes de habilitar a capacidade |
| DP-35 — tokens visuais definitivos e inspeção dos frames | Trabalho local com os tokens propostos | Declarar fidelidade visual ao Figma | Quando houver acesso aos frames |
| DP-03b / DP-02d | Execução do EXP-01 | Consolidar tabelas definitivas e a camada SQL | Com o resultado do EXP-01 |
| DP-04 | I-01 | Filas e scheduler do I-02 | Início do I-02 |
| DP-05a/b, DP-06a/b, DP-07a, DP-08a, DP-14b | Trabalho local | Publicação (I-01 web; I-02 worker) | Antes de publicar cada um |
| DP-07b–d, DP-09a/c, DP-22, DP-23, DP-26, DP-28b | Trabalho local | Receber dados reais de pilotos | Antes de dados reais |
| DP-09b, DP-09d | I-01, I-02 com fakes | Liberar agentes com modelo escolhido; executar o EXP-05 | I-05 |
| DP-12a/b, DP-18a–d, DP-24, DP-16a/b, DP-19b–e, DP-15b, DP-27a/b | I-01 | Incrementos I-03, I-05, I-06, I-07 e publicação do I-02 | Antes de cada incremento |

## 7. Alterações feitas nesta preparação

**11/09/2026** — criação deste registro; correção do protótipo quanto ao estado de revisão após aprovar uma versão visual; atualização de [14](../product/marketing-ops/14-ux-flows.md) e do checkpoint.

**15/09/2026** — reconciliação documental após a substituição da referência protegida: versão v2.2 fixada, ancoragem das decisões normalizada, escopo de vídeo e método de campanha incorporados, direção visual unificada no guia de interface, checkpoint restaurado. Nesta rodada, as seções 4 e 5 foram reescritas: decisões registradas e contratos, schema conceitual e critérios de aceite verificáveis, sem ampliar o escopo.

## 8. Autorização solicitada

As escolhas de stack e o recorte já foram decididos (§4). Falta apenas o aceite do escopo de execução:

> Autorizo executar localmente o incremento **I-01**, conforme a seção 5 deste documento, começando pelo EXP-01.

Isso autoriza, apenas no ambiente local: inicializar o Git, criar o workspace, subir o Supabase local, executar o EXP-01, escrever migrations, políticas RLS, domínio, casos de uso, adapters, `ops-cli` restrita, telas mínimas, seeds sintéticos e os testes de §5.9.

Continua **não autorizado**: publicar, criar contas ou serviços externos, usar APIs pagas, integrar fornecedores reais, receber dados de pilotos, cobrar, executar EXP-02 a EXP-05, implementar runtime de agentes e consolidar DP-03b ou DP-02d antes do resultado do EXP-01.
