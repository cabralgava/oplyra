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
| Aprovações em `main` | **Atual (nova verificação do Codex no ruleset 24384328, 02/10/2026): `required_approving_review_count: 1`, `dismiss_stale_reviews_on_push: true`, `validate` obrigatório e estrito, bypass vazio.** Histórico: na janela de bootstrap a exigência foi temporariamente 0, para a entrega inicial | ver §2 |

## 2. Diferenças em relação à configuração final (registradas, não aceitas como finais)

1. **Aprovações em `main`: resolvida.** A configuração final do CR (§4 D-4, §9 Tier 1) é 1 aprovação e o Codex a verificou no ruleset 24384328 (`required_approving_review_count: 1`, `dismiss_stale_reviews_on_push: true`, `validate` obrigatório e estrito, bypass vazio); o D-26 agora exige esses valores no `gh:doctor`. *Histórico:* durante a janela de bootstrap a exigência foi 0, o que deixava as PRs do App sem barreira de aprovação humana no servidor. Isso não vale mais, mas a verificação **não foi feita pelo agente de desenvolvimento**; o `gh:doctor` a repete no ensaio.
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
**Dois registros, um por PR.** O registro é de **um único PR e uma única branch** (`pullRequests` ≤ 1; `ref` único, `DR-EXISTS` impede reuso). O ensaio usa `ops-1` (PR do ensaio) e, depois do merge, `ops-2` (PR de reversão), com `baseSha` novo. Nunca reaproveitar `ops-1` para a reversão.

1. Criar com `scripts/claude-authorize.mjs` (terminal normal do proprietário, TTY, frase digitada) o registro `ops-1`: `repository` `cabralgava/oplyra`; `baseRef` `main` e `baseSha` = `origin/main` **no momento**; `branch` `agent/chore/ops-1-ensaio-cr-033`; `paths` = **um único arquivo** fora do control plane, `docs/harness/ensaios/ensaio-cr-033.md`; sem `contractsCr`/`contractsScope`; commits 4, pushes 4, correções 2, espera de CI 1200 s, duração 10800 s, iterações 4, leituras de log 6, expiração 1 dia. Comandos exatos em §4A.
2. **Habilitação temporária: pela concessão de ensaio D-25 (§4B; aprovada pelo proprietário e implementada offline), que só vale depois de revisada por outra pessoa e integrada em `main` — até lá, BLOQUEADA.** Editar `.claude/delegated-delivery.json` no worktree torna a árvore suja e o `git:branch` recusa (`DD-DIRTY`); esconder a alteração (`skip-worktree`, `assume-unchanged`) **não é aceito**, nem afrouxar a checagem de worktree. O repositório permanece com `delegatedDelivery: false` durante todo o ensaio. Kill switch `~/.oplyra/KILL-DELIVERY` à mão.
3. O wrapper recusa qualquer outro branch, caminho ou verbo.

### Fase 5 — Ensaio (proprietário presente)
Na ordem, registrando a saída (sem segredos) e o registro de auditoria de cada passo:
1. `gh:doctor`: mapa de permissões do token e `repository_selection` exatamente como o esperado; leitura das regras efetivas de `main` (PR, `validate` estrito, sem force push, sem exclusão, linear). Confirma as expectativas A-9.
2. `git:branch`, `git:stage`, `git:commit`, `git:push` (sem force) no branch do registro; `gh:pr-create` **draft**; `gh:ci-status`.
3. **CI falha de propósito e correção**, só com o arquivo autorizado (§4A.3): o primeiro push leva uma linha com espaços no final, que reprova o passo `git diff --check` (C-1) do `validate` sem tocar workflow nem control plane. Diagnóstico por `gh:ci-log` + `gh:ci-diagnose` (D-8, D-22, D-24); a lista de hosts de log é preenchida **pelo proprietário** (§4A.4); a correção remove os espaços.
4. **Recusas intencionais**, apenas as que o wrapper e o guard recusam localmente (nenhuma escrita remota): caminho fora de `paths` (`README.md`) e control plane (`package.json`) em `git:stage`, com `gh:doctor` entre elas para não abrir o disjuntor antes da hora; verbo inexistente (`git:force-push`, `git:delete`) pelo guard; kill switch; e, por último, o disjuntor (3 recusas seguidas, encerra `ops-1`). **Não são tentadas** push para `main`, force push, exclusão de branch nem push que toque `.github/workflows/**`: ficam provadas pela leitura das regras efetivas (`gh:doctor`) e pelo mapa de permissões sem `Workflows`; a tentativa real é **decisão em aberto do proprietário** (§4A.5) e, sem ela, a lacuna é registrada (R-8).
5. **Interrupção e retomada** (kill switch; encerrar e relançar `pnpm claude:local --increment=ops-1`; o relógio e os contadores persistem em `~/.oplyra/delivery-state/`).
6. **Aprovação e merge do PR `ops-1` (proprietário):** "Ready for review" (um PR draft não faz merge), aprovação **depois do último push** (`dismiss_stale_reviews_on_push` descarta a anterior), conferir 1 aprovação exigida, `validate` verde no head e squash. O PR é do bot; por isso o proprietário pode aprová-lo.
7. **PR de reversão com `ops-2`** (§4A.6): outro registro, outra branch, `baseSha` novo. O agente **não tem como excluir arquivo** (o guard não admite `rm`), então a reversão devolve o arquivo a um marcador neutro; a exclusão de fato não faz parte do ensaio (§4A.5). Mesmo rito de aprovação e merge. Confirma o Tier 0 (D-17 segue adiado).

### Fase 6 — Encerrar a janela temporária (owner)
Revogar as concessões do §4B (remover os arquivos fora do repositório; o repositório já está em `false`), arquivar os registros `ops-1` e `ops-2` e **preservar as branches `agent/chore/ops-1-ensaio-cr-033` e `agent/revert/ops-2-ensaio-cr-033`**: o ruleset `agent/**` proíbe exclusão, sem bypass, e **não se afrouxa a proteção para limpar**. As branches ficam como evidência; novas entregas usam nomes novos. Registrar no `ESTADO.md` por PR do App com um terceiro registro `ops-3` restrito a `docs/harness/ESTADO.md` e a este roteiro (o proprietário não aprova PR própria, §4A.7): saídas do `gh:doctor`, auditoria, resultado de cada recusa, tempos e orçamentos consumidos. Falha em qualquer item: **não** habilitar; registrar a lacuna (R-8).

### Fase 7 — Habilitação **definitiva** (owner, sessão de manutenção; somente se as fases 2, 3 e 5 estiverem registradas)
PR do proprietário que muda `delegatedDelivery` para `true` (control plane), com a evidência do ensaio no corpo. Só então a Release 2.23 pode ser empacotada com a ferramenta (§13 passo 8), **em incremento próprio**. Merge pelo agente, loop sem supervisão (`executionEnabled`), produção e acesso ao Supabase de produção continuam **fora**.

## 4A. Fase 4 em comandos (preparada, não executada)

Terminal normal do proprietário (Terminal.app), na raiz do repositório; nunca dentro de uma sessão do Claude Code (`DA-AGENT`).

**Estado: rascunho BLOQUEADO.** O mecanismo do §4B (D-25 e D-26) está aprovado pelo proprietário e implementado offline; os passos 2 e 3 só valem depois que ele for revisado por outra pessoa e integrado em `main`. Nada abaixo foi executado nem deve ser antes disso.

**1. Pré-condições.** `main` limpa e igual a `origin/main`; kill switch ausente. Se houver alterações locais (inclusive este roteiro), **o proprietário decide explicitamente o destino delas** (por exemplo commit numa branch local que não será enviada); nenhum `stash` automático e nenhuma checagem de worktree relaxada, porque `git:branch` recusa árvore suja:
```bash
git fetch origin main && git switch main && git merge --ff-only origin/main
test -z "$(git status --porcelain --untracked-files=all)" && echo LIMPO
test ! -e ~/.oplyra/KILL-DELIVERY && echo SEM-KILL
BASE=$(git rev-parse origin/main); echo "$BASE"   # fc906a214ef0a49c07e5c00678a3e037d67dff39, salvo avanço registrado
```
Se `origin/main` avançar depois de gravado o registro, `git:branch` recusa com `DD-BASE`: gravar outro registro com outro `ref`.

**2. Registro `ops-1`** (pede a frase `AUTORIZAR-ENTREGA-DELEGADA`; imprime o SHA-256 do registro, que deve ser anotado):
```bash
node scripts/claude-authorize.mjs --ref=ops-1 --branch=agent/chore/ops-1-ensaio-cr-033 --base-sha="$BASE" \
  --paths=docs/harness/ensaios/ensaio-cr-033.md --max-commits=4 --max-pushes=4 --max-fix-attempts=2 \
  --max-ci-wait=1200 --max-wall-clock-seconds=10800 --max-iterations=4 --max-log-reads=6 --expires-days=1
```

**3. Habilitação:** pelo mecanismo do §4B (concessão fora do repositório, vinculada ao registro), com o repositório em `delegatedDelivery: false`. Terminal normal do proprietário, depois do passo 2 (pede a frase `HABILITAR-ENSAIO`; vale ≤ 24 h e ≤ a do registro; arquivo 0600 em diretório 0700, sem symlink; imprime o SHA-256 da concessão; `--log-hosts` só depois de observar e aprovar o hostname, regravando a concessão **com a janela original preservada, sem renovar** (se já expirou, o proprietário a apaga de propósito antes de emitir outra); revogar = apagar `~/.oplyra/delivery/ops-1.enable.json`):
```bash
node scripts/claude-authorize.mjs --enable-rehearsal=ops-1
pnpm claude:local --increment=ops-1   # confira o SHA-256 impresso contra o do passo 2
```
Dentro da sessão, a primeira ação do agente é `pnpm gh:doctor`; só com `doctor: ok` seguem `pnpm git:branch` e o resto. O proprietário confere à parte `required_approving_review_count = 1` nas regras de `main`, que o `gh:doctor` **não** verifica.

**4. Falha de CI provocada só com o arquivo autorizado.** O agente escreve `docs/harness/ensaios/ensaio-cr-033.md` com uma linha terminando em espaços. `git diff --check "origin/main...HEAD"` (passo C-1 do `ci.yml`) reprova o `validate` logo no início, sem workflow, control plane nem segredo. As anotações da falha só dizem "exit code 2" e o wrapper exige diagnóstico, então é necessário o log: o primeiro `pnpm gh:ci-log --check validate` recusa com `DD-LOG-HOST` e **mostra o hostname** do redirecionamento (consome uma leitura e conta como recusa; intercalar `gh:doctor`). O proprietário confere o hostname observado e, **se o aprovar**, o concede pelo mesmo mecanismo do §4B (lista de hosts exatos na concessão do `ops-1`, fora do repositório; nenhuma edição local de código, que sujaria a árvore). `LOG_HOSTS` em `scripts/claude-git.mjs` continua **vazia** e fechada. Estado e relógio persistem entre sessões. Se o host variar entre execuções (listas de host exato podem não bastar), parar e registrar. Depois: `gh:ci-diagnose`, correção (retirar os espaços), `git:stage`, `git:commit`, `git:push`.

**5. Decisões em aberto antes do ensaio (do proprietário):** (a) tentativa real de push para `main`/force/exclusão/`.github/workflows` — recomendado **não** fazer nesta rodada e registrar a lacuna; (b) aceitar o marcador permanente do arquivo do ensaio, já que o agente não exclui arquivos e uma exclusão por PR do proprietário precisa de outro revisor; (c) `LOG_HOSTS` definitivo vira PR de control plane (item 7).

**6. Registro `ops-2` (reversão), só depois do merge de `ops-1`:** repetir os passos 1–3 com `--ref=ops-2 --branch=agent/revert/ops-2-ensaio-cr-033`, o `BASE` novo, os mesmos `--paths`, `--max-commits=2 --max-pushes=2 --max-fix-attempts=1 --max-iterations=2 --max-log-reads=2 --max-wall-clock-seconds=5400`. A branch segue o padrão `agent/revert/ops-2-…`.

**7. Mudanças de control plane por PR do proprietário** (`delegatedDelivery: true`, `LOG_HOSTS`, qualquer ajuste em `.github/**`) exigem **uma aprovação de outra pessoa**, porque o autor não aprova a própria PR; o bypass fica vazio e a exigência de 1 aprovação **não** será reduzida. Enquanto não houver um segundo revisor humano com acesso de escrita, a fase 7 fica bloqueada; o ensaio em si não depende disso, porque as PRs dele são do bot e o proprietário as aprova. Se `CODEOWNERS` exigir revisão de dono de código, conferir que o arquivo do ensaio não cai nessa regra. Documentação e `ESTADO.md` podem ir por PR do App (registro próprio, fora do control plane). Quem será o segundo revisor é **decisão do proprietário**. *Emenda de 02/10/2026 (ver a seção ao fim do §4B):* só a PR que integra D-25/D-26 tem a exceção procedimental autorizada; as demais continuam como aqui.

## 4B. D-25 e D-26 — aprovadas pelo proprietário e implementadas offline

Aprovação relatada pelo proprietário (conversa com o Codex; o agente de desenvolvimento não a observou), com requisitos adicionais incorporados abaixo. Registrada no [CR-033 §16.11](../product/marketing-ops/contracts/changes/CR-033-delegated-delivery-git-github.md). Implementadas em `scripts/claude-git.mjs`, `scripts/claude-delivery-record.mjs` e `scripts/claude-authorize.mjs`, com testes e mutações; **ainda sem revisão de outra pessoa e sem integração em `main`**. Os trechos abaixo descrevem o que foi implementado.

### D-25 (aprovada) — concessão temporária de ensaio, fora do repositório e vinculada ao registro
- **Arquivo** `~/.oplyra/delivery/<ref>.enable.json` (diretório 0700, arquivo 0600, dono atual, sem symlink), criado só por `scripts/claude-authorize.mjs --enable-rehearsal=<ref>` em terminal normal, com frase digitada (`HABILITAR-ENSAIO`). Campos: `schema`, `ref`, `recordSha256` (hash do registro carregado), `issuedAt`, `expiresAt`, `logHosts` (opcional, §abaixo), `authorizedBy`, `confirmation`.
- **Vínculo:** vale só se `recordSha256` for o hash do registro que o launcher fixou; outro registro, ou registro regravado, não a satisfaz. Só para `ref` do tipo `ops-<n>` (nunca `iNN`, `cr-NNN`, `dp-*`). Validade ≤ 24 h e ≤ a do registro.
- **Modos exatos e escopo:** arquivo exatamente 0600 e diretório exatamente 0700, dono atual, sem symlink (0400, 0700, 0500 e 0640 também recusam). A concessão **nunca amplia** caminhos, orçamentos nem branch: não tem esses campos (campo extra recusa) e tudo isso continua vindo só do registro.
- **Regravar não renova:** acrescentar `logHosts` regrava a concessão **preservando `issuedAt` e `expiresAt` originais**, sem tocar em estado, relógio, contadores nem auditoria da entrega. Concessão existente expirada, adulterada, insegura ou symlink recusa a regravação e o arquivo fica como está; nova janela só depois de o proprietário apagá-la.
- **No wrapper:** `assertEnabled` aceita **ou** `delegatedDelivery: true` no repositório (habilitação definitiva, inalterada) **ou** a concessão válida. Cada chamada reverifica tudo e grava na auditoria `enabledBy: "rehearsal-grant"` com o SHA-256 da concessão. O kill switch continua prevalecendo; revogar = apagar o arquivo. O arquivo do repositório fica `false` e a árvore limpa: **a checagem de worktree não muda**.
- **Impacto na política:** emenda ao CR-033 (registrada no §16.11: a chave deixa de ser a única forma de habilitar, mas a definitiva continua exclusivamente a do repositório); os testes que exigem `false` no arquivo do repositório continuam valendo; `claude-authorize.mjs`, `claude-delivery-record.mjs` e `claude-git.mjs` são control plane.
- **Testes e mutações (implementados):** concessão ausente, de outro `ref`, de outro hash de registro, expirada (fronteira exata), com modo/dono inseguro, symlink, campo extra (inclusive `paths`/`budgets`/`branch`), `ref` fora de `ops-*`, sem frase, com kill switch; repositório `false` + concessão válida habilita, e sem concessão continua `DD-DISABLED`; regravação preserva a janela; mutações (G01–G18) cobrem comparar `recordSha256`, expiração, `ref` não `ops-*`, kill switch, auditoria, modos exatos, validade e a janela preservada.
- **`logHosts` na concessão:** substitui a edição local de `LOG_HOSTS`. Fechada por padrão; o proprietário a preenche **depois de observar e aprovar** o hostname, com a mesma validação de host exato (`validateLogHosts`). A lista em código segue vazia.
- **Revisão humana adicional (bloqueante):** a implementação altera control plane e precisa chegar a `main` por PR do proprietário **com aprovação de outra pessoa**. Enquanto isso não existir, o ensaio não começa.

### D-26 (aprovada) — `checkProtection` exige aprovação, descarte de aprovação obsoleta e `validate` estrito
Antes, `checkProtection` só conferia os **tipos** de regra e a presença do contexto `validate`. Agora, em `scripts/claude-git.mjs`, mantendo falha fechada (`DD-PROTECTION`, com o motivo):
- regra `pull_request`: `parameters.required_approving_review_count` **inteiro seguro ≥ 1**; ausente, `null`, string, decimal, negativo ou `NaN` recusam. Qualquer regra `pull_request` com valor malformado recusa, mesmo havendo outra válida.
- regra `required_status_checks`: **na mesma regra** que lista `validate`, `parameters.strict_required_status_checks_policy === true` (booleano estrito). `"true"`, `1`, ausente ou `false` recusam; `validate` numa regra não estrita não é compensado por outra regra estrita sem `validate`.
- **requisito adicional do proprietário:** toda regra `pull_request` exige `dismiss_stale_reviews_on_push === true` (booleano estrito; ausente, `false` ou outro tipo recusa). Isso é o que o §4 passo 5.6 supõe.
- `gh:doctor` imprime os valores efetivos lidos (contagem mínima, estrito e descarte de aprovação obsoleta), sem segredos.
- **Testes negativos** (em `scripts/claude-delivery.test.mjs`): contagem ausente/0/negativa/decimal/string/`null`/`NaN`/infinita/insegura; `parameters` ausente; `dismiss_stale` ausente/`false`/string/número/`null`/objeto, inclusive em regra duplicada; estrito ausente/`false`/string/número; `validate` não estrito mais regra estrita sem `validate`; regra duplicada malformada; lista de checks que não é lista. Positivo: contagem 1 ou 2, `dismiss_stale` e estrito `true`.
- **Mutações (P01–P15), todas detectadas:** `≥ 1` por `≥ 0`; remover a checagem de contagem; aceitar contagem em string, decimal ou infinita; ignorar regra duplicada malformada; usar o máximo em vez do mínimo; remover a checagem de estrito, afrouxá-la ou aceitá-la de outra regra; remover, afrouxar ou limitar a checagem de `dismiss_stale`; deixar de imprimir os valores.
- **Revisão humana adicional (bloqueante):** control plane; mesma exigência de PR com aprovação de outra pessoa. D-26 é pré-requisito do ensaio mesmo sem D-25, porque a stop condition "aprovação ≠ 1" antes dependia de conferência manual.

### Ordem
D-26 e D-25 foram aprovados e implementados; falta a integração (sessão de manutenção, PR do proprietário; a revisão do proprietário é procedimental, não independente, conforme a emenda ao fim deste §4B); só depois a Fase 4 é retomada. **Estado:** implementados na branch `chore/cr-033-d25-d26-rehearsal-grant`, com testes e mutações, **sem** integração em `main` (revisão independente não houve; ver a emenda abaixo); a emenda ao CR-033 está registrada nos §16.11 e §16.12. O ensaio não foi executado, nenhuma concessão foi criada e a automação continua desabilitada. **R-11 preservado:** a concessão e o registro ficam em `~/.oplyra`, ao alcance de um processo do mesmo usuário; é defesa em profundidade, não sandbox.

### Emenda de operação com um único responsável humano (autorizada pelo proprietário, 02/10/2026; CR-033 §16.12)

- PRs do App continuam exigindo **1 aprovação do proprietário**.
- **Exceção única** para a PR do proprietário que integra D-25/D-26 (os sete arquivos): o proprietário pode reduzir `required_approving_review_count` de `main-protection` (24384328) de 1 para **0 só durante a integração** e **restaurar 1 imediatamente após o merge**, conferindo 1 e `dismiss_stale_reviews_on_push: true` antes de qualquer outro passo.
- Durante a janela a entrega delegada permanece **desligada**, nenhuma concessão existe e o ensaio **não** é executado. O `gh:doctor` recusa com contagem 0 (D-26 não foi afrouxado): é o esperado.
- Continuam obrigatórios: `validate` verde no head SHA, squash, histórico linear, force push e exclusão bloqueados, bypass vazio.
- A revisão do proprietário é **procedimental, não independente**; o **HB-13 segue não atendido**.
- **Não é autorização permanente:** outras PRs de control plane (`delegatedDelivery: true`, `LOG_HOSTS`, `.github/**`, o wrapper) não recebem exceção automática; cada uma exige autorização expressa do proprietário. Isto ajusta o §4A.7 e a linha "revisão humana adicional" acima **somente** para esta PR de integração.

## 5. Condições de parada do ensaio
Qualquer permissão do token diferente da esperada; leitura das regras de `main` ausente ou só com proteção clássica; aprovação final ≠ 1 na fase 5; qualquer escrita fora do branch do registro; segredo em saída, auditoria, commit ou PR; três recusas consecutivas (disjuntor); kill switch acionado. Em qualquer uma: parar, registrar, **não** ligar a chave definitiva.

## 6. O que este incremento não faz
Não executa nenhuma fase; não valida a fixação por SHA no CI remoto; não liga `delegatedDelivery`; não gera a Release 2.23; não faz commit, push ou PR; não toca em `CLAUDE.md`, `.github/**`, scripts do harness, `SUPABASE-PRODUCTION-REGISTRO.md` nem na chave do App.
