# CR-033 — Roteiro do ensaio de entrega delegada

**Preparado em:** 02/10/2026. **Estado:** roteiro, **não executado**. `delegatedDelivery` continua `false`, `executionEnabled` continua `false`, merge automático não autorizado (D-17 adiado), Release 2.23 não gerada. Nenhum commit, push, PR ou escrita real foi feito por este incremento. O projeto Supabase de produção registrado em `SUPABASE-PRODUCTION-REGISTRO.md` **não** é acessado nem autorizado por este roteiro.

Este documento detalha o §10 do [CR-033](../product/marketing-ops/contracts/changes/CR-033-delegated-delivery-git-github.md). Em conflito, prevalece o CR. Ele não é parte do control plane; o proprietário pode ajustá-lo antes do ensaio.

## 1. Evidências recebidas (P-1 a P-6)

Fonte: configuração informada pelo proprietário e verificações feitas **diretamente no GitHub pelo Codex** em 02/10/2026. O agente de desenvolvimento **não** repetiu essas leituras, **não** leu nem exibiu a chave do App e **não** exercitou o App; as permissões do §5.1 do CR seguem como expectativas até o ensaio (A-9).

| Item | Evidência registrada | Pré-requisito |
| --- | --- | --- |
| GitHub App | `oplyra-agent`, App ID `5166824`, Installation ID `167302454`; bot `oplyra-agent[bot]`, ID `337073269` | P-1 |
| Instalação e permissões | Proprietário confirmou as permissões previstas (CR §5.1) e a instalação **somente** em `cabralgava/oplyra` | P-1, P-4 |
| Chave e configuração | Fora do repositório, nos caminhos previstos (`~/.oplyra/github-app/`); **conteúdo não lido e não registrado** | P-1 |
| Ruleset `main-protection` | ID `24384328`; ativa; alvo `main`; bypass vazio; PR obrigatório; somente squash; `validate` obrigatório e estrito; histórico linear; exclusão e force push bloqueados | P-2 |
| Ruleset `agent-branches` | ID `24384510`; ativa; alvo `agent/**`; bypass vazio; exclusão e force push bloqueados | P-3 |
| Actions | `default_workflow_permissions=read`; `can_approve_pull_request_reviews=false` | P-5 |
| Secrets, ambientes, runners | Nenhum secret de repositório, nenhum ambiente, nenhum runner self-hosted | P-5 |
| Aprovações em `main` | **0 aprovações exigidas, temporariamente**, para a entrega inicial | ver §2 |

## 2. Diferenças em relação à configuração final (registradas, não aceitas como finais)

1. **Aprovações em `main`: 0 hoje; a configuração final do CR (§4 D-4, §9 Tier 1) é 1.** O estado atual **não** atende à configuração final. Enquanto for 0, nenhuma PR do App tem barreira de aprovação humana no servidor e a habilitação **definitiva** está bloqueada. O ensaio (fase 3) deve rodar com 1.
2. **Fixação por SHA aplicada localmente, não validada pelo CI remoto** (três actions, §3): `PENDING_SHA_PINS` está vazia (C-8, D-7), mas nenhuma execução do CI remoto validou a configuração; isso ocorre na primeira PR.
3. **Permissões do App e leitura efetiva das regras de `main`** (CR A-9): só confirmadas no ensaio contra o GitHub real; o `gh:doctor` falha fechado se divergirem.
4. **Lista de hosts de produção do `gh:ci-log` (D-22) vazia** até o ensaio.
5. A verificação do GitHub foi feita pelo Codex; esta preparação a **registra**, não a reproduz.

## 3. Actions fixadas por SHA (aplicadas localmente em `.github/workflows/ci.yml`, 02/10/2026)

SHAs confirmados pelo Codex nos repositórios oficiais; a tag de origem fica em comentário. **Ainda não validadas pelo CI remoto.** Versões preservadas: Node 22 e Supabase CLI 2.114.0.

| # | Action | Uso no `ci.yml` | Tag de origem |
| --- | --- | --- | --- |
| 1 | `actions/checkout` | `@d23441a48e516b6c34aea4fa41551a30e30af803 # v6` (`fetch-depth: 0`) | `v6` |
| 2 | `pnpm/setup` | `@fbda4c85fc2e1e08721cd8763afea8f48d60f024 # v3` (`runtime: node@22`, `cache: true`, `install: false`) | `v3` |
| 3 | `supabase/setup-cli` | `@afb1b15109756ea5cf9d8985a359d9095235ca2b # v2` (`version: 2.114.0`) | `v2` |

`install: false` evita instalação duplicada: o passo explícito `pnpm install --frozen-lockfile` continua sendo o único instalador. `PENDING_SHA_PINS` em `test/ci-hygiene.test.ts` está vazia. A validação remota (a action `pnpm/setup` com `runtime`, `cache` e `install: false`) ocorre no primeiro PR da fase 1; se falhar, parar e corrigir antes de habilitar.

## 4. Ordem do ensaio

Princípios: (a) quem escreve em `.github/**` e no control plane é **o proprietário**, nunca o App (sem permissão `Workflows`); (b) o App só opera com um registro de autorização do proprietário, em um branch `agent/**`, e **merge, aprovação, "Ready for review", rerun, exclusão de branch e mudança de ruleset são do proprietário**; (c) nada liga `delegatedDelivery` de forma persistente antes de a pinagem e o ensaio estarem registrados.

### Fase 0 — Verificação local (sem escrita no GitHub)
1. Registrar HEAD, estado do worktree e a branch local `agent/feat/cr-033-delegated-delivery` (hoje sem commit, push, PR).
2. Rodar os gates offline na ordem do CR: `pnpm test:harness`, `pnpm test`, depois `pnpm db:reset` → `pnpm db:roles` → `pnpm verificar` (somente local).
3. Confirmar `.claude/delegated-delivery.json` com `delegatedDelivery: false`.

### Fase 1 — Integrar a base do CR-033 e os pré-requisitos de CI (owner, `main` ainda com 0 aprovações)
1. O proprietário (não o App) faz o commit seletivo, o push e abre a PR da implementação offline: wrappers, guard, launcher, ferramenta de release, **pré-requisitos de CI** (C-7, C-1, C-4, C-9, C-10, `CODEOWNERS`, template de PR, `ci.yml`) e textos S1b, com `delegatedDelivery: false`.
2. `validate` verde no SHA da cabeça; merge por squash pelo proprietário. É o uso previsto da exigência **temporária de 0 aprovações** (entrega inicial); o proprietário é o autor e não pode aprovar a própria PR.
3. **Imediatamente depois**, o proprietário **eleva as aprovações exigidas para 1** (fase 3 pode ser feita aqui) ou registra a exceção com prazo. A Release 2.23 **não** é gerada.

### Fase 2 — Validação remota da fixação por SHA (owner)
A fixação já está aplicada localmente (§3) e entra junto com a fase 1. Esta fase confirma que `validate` ficou verde no CI remoto com as actions fixadas; só então o registro do `ESTADO.md` passa de "não validada" a "validada". É **pré-requisito de habilitar**.

### Fase 3 — Estado final das proteções antes do ensaio (owner)
1. `main-protection` com **1 aprovação exigida** e descarte de aprovação obsoleta; confirmar bypass vazio e histórico linear/squash inalterados.
2. Reexportar e registrar (P-6) o ruleset, as permissões e repositórios do App e a lista vazia de secrets, **sem a chave**.
3. `.claude/delegated-delivery.json` segue `false`.

### Fase 4 — Habilitação **temporária e restrita ao registro de teste** (owner, sessão de manutenção)
1. Criar com `scripts/claude-authorize.mjs` (TTY, frase digitada) um registro **só do ensaio**: `ref` `ops-<n>`; `repository` `cabralgava/oplyra`; `baseRef` `main` e `baseSha` = `main` no momento; `branch` `agent/chore/ops-<n>-ensaio-cr-033` (único permitido); `paths` = **um único arquivo descartável** fora do control plane (por exemplo `docs/harness/ensaios/ensaio-cr-033.md`); sem `contractsCr`/`contractsScope`; orçamentos **abaixo** dos tetos (por exemplo commits ≤ 4, pushes ≤ 4, PR = 1, tentativas de correção ≤ 3); `wallClockSeconds` e `iterations` explícitos; expiração curta (≤ 24 h).
2. Ligar `delegatedDelivery` **apenas na cópia local, não commitada**, durante a janela do ensaio; deixar o kill switch `~/.oplyra/KILL-DELIVERY` à mão. Nada disso vai a commit.
3. Confirmar que o App está habilitado só para esse registro (o wrapper recusa qualquer outro branch, caminho ou verbo).

### Fase 5 — Ensaio (proprietário presente)
Na ordem, registrando a saída (sem segredos) e o registro de auditoria de cada passo:
1. `gh:doctor`: mapa de permissões do token e `repository_selection` exatamente como o esperado; leitura das regras efetivas de `main` (PR, `validate` estrito, sem force push, sem exclusão, linear). Confirma as expectativas A-9.
2. `git:branch`, `git:stage`, `git:commit`, `git:push` (sem force) no branch do registro; `gh:pr-create` **draft**; `gh:ci-status`.
3. **CI falha de propósito e correção** dentro do orçamento (D-8, tentativas diagnosticadas; D-22 `gh:ci-log` com a lista de hosts de produção preenchida **pelo proprietário** só nesta fase; evidência de diagnóstico com validade de 3600 s, D-24).
4. **Recusas intencionais** de cada classe do §11 contra as proteções reais: push para `main`; force push; exclusão de branch; caminho fora de `paths`; push que toca `.github/workflows/**` pelo App (**recusa do GitHub por falta de `Workflows`**; o wrapper não pode preparar esse caso, então o proprietário define e executa a tentativa controlada antes do ensaio — **ponto em aberto a decidir pelo proprietário**, sem mecanismo inventado aqui); budgets esgotados e disjuntor.
5. **Interrupção e retomada** (kill switch e retomada pelo estado em `~/.oplyra/delivery-state/`).
6. **PR de reversão** do commit do ensaio (aberta pelo App como draft; revisão, aprovação e merge pelo proprietário, squash).
7. Proprietário aprova a PR draft do App (1 aprovação, vinculada ao SHA) e faz o merge: confirma o Tier 0 (D-17 segue adiado).

### Fase 6 — Encerrar a janela temporária (owner)
Desligar `delegatedDelivery` na cópia local, expirar/arquivar o registro do ensaio, remover o branch descartável (exclusão é do proprietário) e registrar no `ESTADO.md`: saídas do `gh:doctor`, auditoria, resultado de cada recusa, tempos e orçamentos consumidos. Falha em qualquer item: **não** habilitar; registrar a lacuna (R-8).

### Fase 7 — Habilitação **definitiva** (owner, sessão de manutenção; somente se as fases 2, 3 e 5 estiverem registradas)
PR do proprietário que muda `delegatedDelivery` para `true` (control plane), com a evidência do ensaio no corpo. Só então a Release 2.23 pode ser empacotada com a ferramenta (§13 passo 8), **em incremento próprio**. Merge pelo agente, loop sem supervisão (`executionEnabled`), produção e acesso ao Supabase de produção continuam **fora**.

## 5. Condições de parada do ensaio
Qualquer permissão do token diferente da esperada; leitura das regras de `main` ausente ou só com proteção clássica; aprovação final ≠ 1 na fase 5; qualquer escrita fora do branch do registro; segredo em saída, auditoria, commit ou PR; três recusas consecutivas (disjuntor); kill switch acionado. Em qualquer uma: parar, registrar, **não** ligar a chave definitiva.

## 6. O que este incremento não faz
Não executa nenhuma fase; não valida a fixação por SHA no CI remoto; não liga `delegatedDelivery`; não gera a Release 2.23; não faz commit, push ou PR; não toca em `CLAUDE.md`, `.github/**`, scripts do harness, `SUPABASE-PRODUCTION-REGISTRO.md` nem na chave do App.
