# PR #11 — integração inicial, perfis de autorização, política estrutural e fila de missões

**Estado (28/10/2026): documento de trabalho, anexo à PR #11 (cabeça auditada `6d0dfe4`), revisado após a crítica do proprietário.** Está em `docs/harness/` (classe elevada): quem o integrar precisa do dono do código. **Não altera nenhum script, ruleset, configuração, autorização ou serviço**, e preserva `docs/decisions/ADR-0006-runtime-de-agentes.md` e os trabalhos locais. Esta sessão tem o guard da política **autônoma**: `scripts/`, `.github/`, `.claude/`, `package.json`, `CLAUDE.md`, `AGENTS.md` e os documentos de política só mudam em sessão de manutenção. Tudo o que depende disso aparece como **especificação pronta para implementação**, não como implementado.

## 0. Quadro: implementado, integrado, autorizado, ativado, ensaiado

| Componente | Implementado | Integrado (`main`) | Autorizado | Ativado | Ensaiado (remoto) |
| --- | --- | --- | --- | --- | --- |
| Executor contínuo (PR #11) | sim, `6d0dfe4` | **não**: PR fora de draft, aguarda revisão independente | não | não | não (houve ensaio local com Codex CLI 0.160.0, registrado no ESTADO; não é o ensaio remoto) |
| Modo `routine-capable` (código em `claude-gates`/`claude-admin`) | sim, na PR #11 | não | não | não: ruleset atual dá `review-required` | não |
| Autorização contínua (perfil inicial `packages/core/test/`) | sim (emissor) | não | **não emitida** | não | não |
| Serviço do SO (`codex-service`) | sim (`prepare`/`install`) | não | não | não | não |
| `docs/progresso/` e `test/developer-harness.perfil-de-produto.test.ts` (esta rodada; antes `test/perfil-de-produto.paths.test.ts`) | **sim, no working tree, sem commit** | não | — | — | — |
| Classe `structural`, perfil de produto, backlog reconciliado | **só especificação** (§§3 a 5) | não | não | não | não |
| Controles dos 4 cenários (§11): `claude-structural.mjs`, `structural-gate` da base confiável, `decide` com SHA exato, progresso vinculado à missão | **sim, no working tree, sem commit** (sessão de manutenção, 29/10/2026) | não | não | não | não |
| Classe `structural` completa (§12): autorização v2, escopos versionados em `docs/harness/scopes/`, CLI e job `structural-gate`, `risk-gate` estrutural, runner com resultado do mesmo head, `requirementsRef`, `e2e/`, regras de billing/i18n/Stripe | **sim, no working tree, sem commit** (29/10/2026) | não | não (nenhum escopo aprovado; autorização v2 não emitida) | não (`structural-gate` não é check obrigatório) | não |
| Proposta D-E1 (CODEOWNERS sem dono para caminhos estruturais) | **só proposta** (§12) | não | não | não | não |
| Teste de perfil duplicado | `test/perfil-de-produto.paths.test.ts` **removido** (30/10/2026); vale `test/developer-harness.perfil-de-produto.test.ts` | — | — | — | — |
| Documentação do CR-034 (idiomas/billing, 22 documentos do manifest 2.22) | **fora da PR #11 por decisão do proprietário**, mas hoje no commit **local** `2394d15` desta branch (não enviado) + `ADR-0006` só no working tree (§14) | não | ADR-0010 aprovada; integração depende do teste de contratos (elevado) | — | — |

**Estado da verificação local (30/10/2026):** `pnpm typecheck` sem erros; `pnpm test` **1056 de 1057**, única falha `cr-033-current-content`, causada exclusivamente pelos 22 documentos do CR-034 (§14). Registro: [`docs/progresso/pr-11-separacao-cr-034-2026-10-30.md`](../progresso/pr-11-separacao-cr-034-2026-10-30.md).

**Evidência corrigida.** A PR #11 está fora de draft e o CI remoto de `6d0dfe4` está **verde** (informação do proprietário; esta sessão não consultou o GitHub). O resultado local desta sessão é **de outro estado de arquivos**: com o `ADR-0006` modificado no working tree, `pnpm test` deu 985 de 986, e a única falha foi `cr-033-current-content` por esse arquivo. Isso descreve o working tree local, **não a cabeça remota** `6d0dfe4`. A mudança no ADR foi preservada. Com o arquivo de teste novo, o único resultado local registrado é `test/perfil-de-produto.paths.test.ts` (hoje `test/developer-harness.perfil-de-produto.test.ts`): 7 de 7.

**Revisão da PR #11.** Continua uma decisão explícita do proprietário. Nenhuma aprovação foi fabricada, nenhum bypass executado, nenhuma regra remota alterada. A revisão independente (identidade diferente do autor, `validate` e `risk-gate` verdes no head final) está **pendente**.

## 1. Progresso operacional separado da política (feito, no working tree)

Problema: hoje o resultado de uma missão iria para `docs/harness/ESTADO.md`, classe elevada, que exige o proprietário. Correção, sem liberar `docs/harness`:

- Criado `docs/progresso/` com [README](../progresso/README.md): **um arquivo por missão** (`docs/progresso/ms-NNN.md`), só fatos observados (branch, PR, SHAs, comandos e resultados reais, orçamentos, pendências), sem política nem autorização, e sempre distinguindo implementado, integrado, autorizado, ativado e ensaiado.
- O classificador atual trata `docs/progresso/` como **rotineiro**, e o validador de escopo o aceita. Ambos provados por `test/developer-harness.perfil-de-produto.test.ts` (7 de 7). `docs/harness/` segue elevado e recusado como escopo de diretório.
- O `ESTADO.md` fica como **resumo consolidado de política**, atualizado pelo proprietário (ou por entrega elevada revisada) a partir de `docs/progresso/`. Uma missão rotineira não precisa mais de intervenção humana para registrar o seu resultado.
- Falta, em sessão de manutenção: o runner incluir o arquivo de progresso entre os `paths` da missão derivada (hoje cada missão declara os seus `paths` à mão), e o prompt do Codex mandar escrevê-lo. Especificação, não implementação.

## 2. Perfil de produto validado com os validadores existentes

`validatePaths` (`claude-delivery-record.mjs`) **recusa**: curingas (`* ? [ ] { } ~`), diretórios de um nível só (`e2e/`, `test/`, `docs/`, `apps/`), control plane, segredos, `docs/harness/` como diretório e caminhos sob `contracts` sem vínculo de CR. Portanto `packages/*/src/`, `packages/*/test/` e `e2e/` **não são aceitos hoje**. Perfil concreto proposto, **aceito pelos validadores reais** (provado em teste):

```json
["apps/web/src/app/", "apps/web/src/components/", "apps/web/src/lib/",
 "packages/core/src/domain/", "packages/core/src/application/",
 "packages/infra/src/", "packages/testing/src/",
 "packages/core/test/", "packages/infra/test/", "packages/testing/test/",
 "docs/progresso/"]
```

Limites propostos, dentro dos tetos: validade 30 dias; `maxMissions` 20, `mergesPerRun` 10, `maxAgentSessionsPerMission` 5, `wallClockSeconds` 172 800; por missão `wallClockSeconds` 7200, `iterations` 5, `logReads` 10.

Lacunas deste perfil (a decidir): (a) `e2e/` e `test/` não cabem como diretórios; especs novos só entram se o arquivo for **concreto** e estiver listado, o que não serve a um escopo permanente. **Evolução controlada da validação proposta:** uma lista fechada de diretórios rotineiros de um nível (`e2e/`) no `validatePaths`, com teste e mutações, em sessão de manutenção. (b) `packages/core/src/` poderia ser diretório único, mas separei `domain/` e `application/` para manter `studio.ts`-style entradas (arquivos na raiz de `src/`) fora do escopo até serem pedidas por missão. (c) O perfil de produto exige um **emissor novo**: `codex-authorize.mjs` só emite o perfil inicial, sem argumentos de escopo.

## 3. Autorização, classificador, gates e GitHub: tratados em conjunto

Hoje: a autorização aceita só `riskClasses: ["routine"]` (`claude-standing.mjs` L71); o classificador marca `supabase/`, `package.json`, contratos, `docs/harness`, ADRs e configs como **elevados** por caminho (`claude-risk.mjs` L28 a 41); `decide` devolve `owner("elevated")` **antes** de avaliar aprovação; e o CODEOWNERS dá `supabase/` e os `package.json` ao proprietário, o que, com `require_code_owner_review` no modo routine-capable, exige a aprovação dele no GitHub. **Ampliar só os caminhos da autorização não resolve**: o classificador e o gate recusariam do mesmo jeito, e o GitHub também.

Para uma implementação estrutural previamente autorizada, as cinco camadas precisam mudar juntas:

| Camada | Mudança proposta | Onde |
| --- | --- | --- |
| Autorização | schema novo: `scope.riskClasses` aceita `["routine","structural"]`; `structural.scopes[]` lista os incrementos cujo escopo estrutural o proprietário aprovou **uma vez** (referência ao documento de escopo aprovado, tabelas e schemas permitidos, máximo de migrations) | `claude-standing.mjs`, emissor novo |
| Missão | `scopeRef` obrigatório para missão estrutural, resolvendo para uma entrada aprovada; sem ele, a missão é recusada | `validateMission` |
| Classificador | três classes: `routine`, `structural`, `elevated`. `structural` só se **todos** os arquivos casarem as regras da §4; qualquer exceção torna o conjunto `elevated`. `banco` e `dependencias` deixam de ser elevados por caminho puro e passam a depender do conteúdo (S-2 a S-5) | `claude-risk.mjs` |
| Gates | `decide` mantém `owner("elevated")`; missão `structural` segue o fluxo normal **e** exige, para o SHA exato, o resultado do novo check `structural-gate` | `claude-gates.mjs` |
| CI e GitHub | novo job `structural-gate` (determinístico, S-2 a S-5) como check obrigatório ao lado de `validate` e `risk-gate`; `risk-gate` passa a aceitar caminho estrutural sem dono **somente** se o `structural-gate` passou; ajuste do CODEOWNERS (decisão D-E1) | `.github/workflows`, `CODEOWNERS` |

Tudo isso é control plane: **uma única entrega elevada, revisada pelo proprietário, com testes de fronteira e mutações**, como a própria PR #11. Depois dela, os incrementos estruturais deixam de exigir uma entrega elevada manual cada um.

## 4. Política: implementação estrutural previamente autorizada × mudança material

**Estrutural (pode ser integrada pelo runner, com gates):** executar um incremento **já aprovado pelo proprietário** em documento de escopo (por exemplo, o que a S6a fez).
- **S-1** a missão cita um `scopeRef` pré-aprovado na autorização (não há aprovação por missão).
- **S-2** só arquivos **novos** em `supabase/migrations/` (timestamp posterior ao último em `main`) e `supabase/tests/`; **nenhuma** migration ou teste existente é modificado ou removido (imutabilidade).
- **S-3** gate estático da SQL: toda `create table` nos schemas do escopo tem `enable` e `force row level security`; políticas referenciam `app.current_tenant()`; sem `grant` a `anon`/`public`; `security definer` sempre com `set search_path`; sem `drop`/`truncate`/`disable row level security`/`bypassrls`/criação de papel ou extensão; só permissões **novas** em `core.permissions`.
- **S-4** pgTAP novo ou alterado no mesmo PR, exercitado pelo `validate` com o banco local recriado.
- **S-5** `package.json`: só **adição** de entradas `exports` do tipo `"./nome": "./src/nome.ts"` em `packages/{core,infra,testing}`; nada de dependências, scripts, engines ou lockfile.

**Continua elevado, sem exceção e sem reclassificação em bloco:** contratos, registries, schemas, fixtures, manifestos, snapshots históricos e documentos de CR (`contracts/`); `CODEOWNERS`, `.github`, `scripts`, `tools`, `CLAUDE.md`, `AGENTS.md`, política em `docs/harness`, ADRs; qualquer alteração de migration existente, enfraquecimento de RLS, ampliação de `grant`, uso de chave de serviço; dependências; configuração de teste e build; produção e Supabase remoto; segredos; remoção de testes. **Mudança material** de contrato, segurança, produção, custo ou autonomia de agente do produto sempre para (AUTONOMOUS-BUILD §4), mesmo dentro de um escopo estrutural aprovado.

Consequência para as entregas de hoje: aplicar o CR-037 ao registry (Error Registry 1.6, schemas) **continua elevado** (Release 2.24); a S6b depende dele.

## 5. Backlog canônico reconciliado, sem recriar entregas

`docs/backlog/missions.json` tem **uma** missão (`ms-001`, `packages/core/test/`). **Não foi alterado** (a fila é lida de `origin/main`). Reconciliação por incremento:

| Incremento | Estado real | Dependências | Caminho |
| --- | --- | --- | --- |
| I-01, I-02 (harness de IA, Cost Ledger) | em `main` | — | nenhum |
| I-03 Brand OS | `a2cfa83` em `feat/i-03-brand`, no GitHub; `3a518b2` em `feat/i-03-brand-os` (duplicados) | — | PR existente; **não recriar**. Contém migration, `package.json` e CR: elevado |
| I-04 Estratégia | `4a86521` em `feat/i-04-strategy` | I-03 em `main` | idem |
| I-05a Estúdio | `wip/backup-i05` (`e086606`), não enviado | I-04 em `main` | idem |
| CRs 037 a 039, escopo da S6a | `wip/backup-i05` | — | PR de documentação/contratos (elevado) |
| I-05b S6a Ativos | `wip/backup-i05` (`353908d`) | I-05a em `main` | idem; o CR-037 só é aplicado na Release |
| I-05b S6b, S7a, S7b | não iniciados | S6a + Release 2.24 (S6b); S6b (S7a) | **missões** do runner quando a classe `structural` existir |

As entregas acima **antecedem** a classe estrutural e contêm partes elevadas (documentos de CR, `ESTADO.md`): entram por PR com o dono do código, **sem serem reescritas** como missões. O runner assume a fila a partir do que estiver em `main`. `dependsOn` só referencia missões, então missões dependentes de PRs não integrados **não entram** no backlog antes do merge. O trabalho local preservado fica em `wip/backup-i05` (backups `e086606` e `353908d`, não enviados). Nenhum requisito novo foi inventado: as missões futuras vêm do roteiro já aprovado (I-05b S6b a S7b; depois I-06 a I-09 do `12-roadmap.md`).

## 6. Decisões que realmente faltam

| ID | Decisão | Quem | Recomendação |
| --- | --- | --- | --- |
| D-E0 | Revisor independente da PR #11, ou exceção procedimental escrita e específica, com contagem restaurada para 1 | proprietário | segunda identidade humana; sem exceção automática |
| D-E1 | CODEOWNERS e estrutural: (A) tirar `supabase/migrations/`, `supabase/tests/` e as entradas de `exports` do dono e confiar no `structural-gate` obrigatório; ou (B) manter o dono e aceitar revisão humana de toda entrega estrutural | proprietário | (A), **somente** com o `structural-gate` obrigatório, imutabilidade das migrations e mutações; ressalva: isso retira uma barreira imposta pelo GitHub |
| D-E2 | Aprovar a política da §4 como normativa e abrir o CR do control plane que a implementa (§3) | proprietário | sim, em uma única entrega elevada revisada |
| D-E3 | Evolução do `validatePaths` para permitir `e2e/` como diretório rotineiro de um nível | proprietário | sim, lista fechada |
| D-E4 | Aprovar o perfil de produto (§2) e o emissor novo | proprietário | sim, depois de D-E2 |

## 7. Ordem de execução e o que continua pendente

1. **Revisão independente e merge da PR #11** (D-E0). Sem isso nada abaixo é ativado.
2. Em sessão de manutenção, **uma entrega elevada**: classe `structural`, `structural-gate`, schema da autorização, `validatePaths` com `e2e/`, emissor do perfil de produto, e o runner incluir o arquivo de progresso nos `paths` da missão. Com testes de fronteira e mutações. **Não implementado nesta sessão**: o guard bloqueia.
3. `claude-admin.mjs ruleset-plan` e `ruleset-apply` (proprietário, TTY), com `risk-gate` e `structural-gate` verdes na `main`; PR descartável tocando `.github/CODEOWNERS` para provar a proteção do que é elevado.
4. Emissão única da autorização contínua de produto.
5. `codex-service.mjs prepare` e `install` no checkout isolado limpo, e o **ensaio remoto**: entrega, falha de CI e correção, merge com SHA esperado, próxima missão e retomada. Cada etapa registrada separadamente em `docs/progresso/`.

Só depois do passo 5 completo o `AUTONOMOUS-BUILD` pode declarar `executionEnabled: true`. CI verde, autorização emitida ou serviço registrado **não** equivalem a "execução automática completa".

## 8. Alinhamento com a frente de internacionalização e billing (critérios do executor)

**Estado: critérios especificados, não implementados.** Direção do proprietário: interface em português e inglês; preços fixos em BRL e USD; Stripe como provedor; sem conversão cambial automática para definir a mensalidade. A documentação aprovada dessa frente é a fonte de verdade e **não foi localizada neste checkout** quando este item foi escrito: nenhum preço, forma de pagamento, regra fiscal ou configuração da LLC é afirmado aqui. Esta seção não implementa o produto, não ativa cobrança, não amplia permissões, não altera regras remotas e não emite autorização.

Critérios a acrescentar ao classificador, ao `structural-gate` e à validação de missões (na sessão de manutenção, junto com a §3):

1. **Idioma não altera moeda nem preço.** Alteração em que o locale determine moeda, preço ou plano é recusada (`elevated`). Moeda e preço pertencem ao plano/contrato de assinatura, nunca ao idioma.
2. **Cobrança não é rotina por estar em `src/`.** Billing, webhooks do Stripe, entitlements e preços (adapters, handlers, serviço de entitlements, tabelas de plano/assinatura/preço) são `elevated` por regra explícita de **caminho e conteúdo**, com precedência sobre os diretórios do perfil de produto (`packages/infra/src/`, `packages/core/src/`), **até existir política específica aprovada**. Nenhuma redução silenciosa de proteção.
3. **Tradução de apresentação ≠ condições comerciais.** Catálogos de tradução podem conter **placeholders de apresentação** (`{nome}`, `{count}`), mas nenhum valor monetário, moeda, preço, limite de plano, prazo ou regra de renovação/cancelamento. O gate **lê o conteúdo** e recusa (`elevated`); o catálogo nunca determina preço ou condição comercial.
4. **Adapters simulados por padrão; nenhuma classe concede acesso externo.** `routine` e `structural` não autorizam chaves live do Stripe, cobrança, cliente ou assinatura reais, nem webhook de produção. **Stripe em modo de teste também conta como acesso externo** e exige autorização aplicável própria; sem ela, só adapter simulado em dev local.
5. **Requisitos aprovados em campo próprio e versionado, não em `dependsOn`.** `dependsOn` continua sendo dependência **entre missões** (`ms-NNN`), sem mudança de semântica. A vinculação a requisitos entra em campo novo da missão (por exemplo `requirementsRef`: documento + versão + `sha256` do arquivo em `main`). O enforcement automático (missão afetada sem o campo não é elegível) só vale **depois da evolução versionada do esquema da missão**; até lá, missão sem o campo continua válida como hoje. Os documentos da outra frente (ADR-0010, `I18N-BILLING-US-INCORPORACAO.md`, CR-034) são referenciados **somente quando aprovados em `main`**; nenhuma decisão é reaberta e nenhum detalhe ausente é inventado.

## 9. Frente de billing/i18n: sem integração autônoma (registro)

Billing, webhooks, entitlements e preços **não têm integração autônoma**: permanecem `elevated` (revisão do dono do código) até haver política específica aprovada. Nenhuma autorização contínua, perfil de produto ou classe `structural` desta especificação os cobre. Isto é registro de estado, não decisão nova.

## 10. Estado da implementação do harness (28/10/2026)

**Não implementado nesta sessão.** A sessão tem o guard da política autônoma, que nega escrita em `scripts/claude-*`, `scripts/codex-*`, `.github/`, `CLAUDE.md`, `AGENTS.md`, `package.json` e nos documentos de política (`LF-WRITE-CONTROL-PLANE`). Os itens abaixo tocam esses caminhos e esperam a sessão de manutenção (`pnpm claude:maintenance`), em uma única entrega elevada: classe `structural` em `claude-risk.mjs`; autorização versionada com `scopes`/`scopeRef` em `claude-standing.mjs`; exceção nomeada para `e2e/` em `validatePaths`; arquivo de progresso em `docs/progresso/` incluído nos `paths` pelo runner e mencionado no prompt do worker; `structural-gate` lendo a versão do controle a partir da base (não do head); `decide`/integrador exigindo o resultado do gate para o SHA exato; regra de billing/i18n (§8) e `requirementsRef`; testes de fronteira com mutações. Nada disso existe como código; nenhum arquivo do control plane, ADR-0006 ou trabalho da outra frente foi alterado.

Coordenação: os arquivos compartilhados com a outra sessão (`CLAUDE.md`, `ATUALIZACOES.md`, `08-billing-entitlements.md`, `docs/backlog/missions.json`) não foram tocados. Serão editados uma única vez, na entrega elevada, depois de ler o estado atual deles.

**Atualização (29/10/2026, sessão de manutenção):** parte do item acima foi implementada no working tree, **sem commit, push ou merge**; ver §11. Continua pendente: schema da autorização contínua com `structural.scopes[]` e `scopeRef` em `validateMission`; job `structural-gate` na CI e ruleset (nada em `.github/` foi alterado); o runner obter `ctx.structural` do check real; exceção `e2e/` em `validatePaths`; regras de billing/i18n (§8) e `requirementsRef`; decisões D-E0 a D-E4. *(Superado na mesma data pela §12: tudo isso foi implementado no working tree, exceto ruleset e decisões D-E0 a D-E4.)*

## 11. Quatro cenários de fronteira com mutações (29/10/2026)

**Estado:** implementado e testado localmente, **sem commit**, não integrado, não autorizado, não ativado. Nenhum ruleset, CODEOWNERS, autorização persistente, serviço, Stripe, banco ou dado de produção foi usado ou alterado. ADR-0006 e os arquivos da frente de idioma/billing não foram tocados.

**Controles alterados (control plane):**
- `scripts/claude-structural.mjs` (novo): esquema fechado do escopo estrutural (`sc-…`, documento aprovado com `sha256`), análise de `package.json` (só a adição exata de `exports` do escopo), análise da migration com negação por padrão (RLS, FORCE quando o escopo o exige, política com `app.current_tenant()`, concessões ⊆ escopo, nunca `anon`/`public`, SECURITY DEFINER só autorizado e com `search_path = pg_catalog, pg_temp`, migration nova e posterior à última da base), e `runStructuralGate`, que carrega o controle e o documento aprovado do **commit base**, com Git em ambiente mínimo.
- `claude-gates.mjs`: missão com `scopeRef` exige o check `structural-gate` e um resultado do gate **para o head exato**, elegível e cobrindo cada caminho elevado; resultado de outro SHA → `wait`; check-runs com `head_sha` de outro commit são ignorados; `requiredSatisfied` nunca trata check ausente como aprovado. Sem `scopeRef`, o comportamento anterior é mantido (`owner("elevated")`).
- `claude-delivery-record.mjs`: `scopeRef` opcional no registro; `pathAllowedByRecord` recusa caminho não normalizado/travessia e, sob `docs/progresso/`, aceita só `docs/progresso/<ref>.md`.
- `claude-standing.mjs`: `deriveMissionRecord` inclui o arquivo de progresso **exato** da missão e recusa (`ST-SCOPE`) o de outra missão ou o diretório, mesmo com `docs/progresso/` na autorização.
- `codex-agent.mjs`: o worker recusa caminho cujo resolvido passa por symlink (`resolvedInside`); prompt do worker e `buildPrompt` (runner) indicam o arquivo de progresso e proíbem escrever no `ESTADO.md`.
- `test/developer-harness.continuous-delivery.units.test.ts`: a asserção do registro derivado passou a esperar também `docs/progresso/ms-001.md` (comportamento novo, especificado no §1).

**Método de mutação** (`test/developer-harness.mutacao.ts`): copia `scripts/*.mjs` para um diretório temporário, aplica trocas textuais que precisam casar **exatamente uma vez** e importa os módulos mutantes de lá. Cada cenário declara propriedades; a implementação real satisfaz todas, e cada mutação precisa derrubar as propriedades declaradas e preservar as indicadas (em geral o caso permitido).

| Cenário | Arquivo | Permitido | Recusados | Mutações (controle alterado → asserção que detectou) | Real × simulado |
| --- | --- | --- | --- | --- | --- |
| 1 exports × package.json misto | `test/developer-harness.structural-exports.test.ts` | `exports` `./assets` exato → `structural`; `decide` com CI pendente → `wait`; tudo verde no mesmo SHA → `merge` (simulado) | scripts; dependencies/devDependencies; alvo diferente, entrada extra, entrada existente alterada, sem mudança; escopo ausente/inválido (`SC-SCOPE`); `scopeRef` de outra missão; documento divergente; escopo de outro pacote | M1.1 comparação dos demais campos → `mista-scripts`, `mista-dependencies` (`structural`≠`elevated`); M1.2 aceitar porque exports mudou → os dois mistos e `exports-fora-dos-alvos`; M1.3a/b/c vínculo `scopeRef`, hash do documento, entrada do mesmo arquivo → `escopo-de-outra-missao`, `documento-aprovado-divergente`, `escopo-nao-cobre`. Caso permitido preservado em todas | real: `evaluateStructural`, `decide`; simulado: observação do GitHub |
| 2 migration × acesso/isolamento | `test/developer-harness.structural-migration.test.ts` | migration da fixture (`core.assets` de tenant com RLS+FORCE+política+CRUD; `core.asset_kinds` global sem exigência de RLS) + pgTAP novo → `structural` | GRANT a anon/public; privilégio não autorizado; DISABLE RLS; ENABLE omitido; FORCE omitido; DEFINER não autorizado ou função fora do escopo; sem `search_path` ou com `public`; instrução, tabela ou política não cobertas; `DO`, literal aberto, identificador entre aspas; migration modificada, fora de ordem ou sem base; migration não listada | M2.1a `checkGrant` neutralizado → `grant-privilegio-nao-autorizado` (anon segue recusado: **redundância** da proibição explícita); M2.1b toda a verificação de concessão → `grant-anon` também; M2.2a só a proibição explícita de DISABLE → detectada pelo motivo exato, mas a mudança **continua recusada** pela negação por padrão (redundância); M2.2b requisito de RLS + forma DISABLE aceita → `rls-desabilitado`, `rls-omitido`; M2.3a/b DEFINER e `search_path` → props correspondentes; M2.4 FORCE → `force-omitido`; M2.5 aceitar por ser novo → 10 propriedades | real: classificador; **nenhum banco usado**. A análise do diff não prova isolamento real entre tenants: isso exige o pgTAP no banco local sintético, **não executado** nesta sessão |
| 3 checkpoint sem política | `test/developer-harness.progress-checkpoint.test.ts` | missão `ms-101` derivada pelo mecanismo real → `["packages/core/test/", "docs/progresso/ms-101.md"]`; worker real escreve teste + progresso → `stage` exatamente esses dois; documentos de política com hash idêntico; `decide` → `merge` (simulado) | progresso de `ms-102` (derivação `ST-SCOPE`, worker recusa, runner `blocked:scope`); `ESTADO.md`, `AUTONOMOUS-BUILD.md`, ADR (worker recusa, runner `owner`); travessia e caminho não normalizado; symlink `ms-101.md → ../harness/ESTADO.md` | M3.1a prefixo `docs/` → derivação falha (`DR-PATHS`): **redundância** de `validatePaths`, que derruba também o caso permitido; M3.1b prefixo `docs/progresso/` → `derivacao-permitida` (worker e runner continuam recusando o alheio: redundância de `pathAllowedByRecord`); M3.2a/b/c vínculo na derivação, no registro e no nome → `derivacao-recusa-progresso-alheio`, `registro-vinculo-progresso`, `derivacao-permitida`/`worker-permitido`; M3.3a normalização → `registro-travessia`; M3.3b `resolvedInside` → `worker-symlink` | real: `deriveMissionRecord`, `pathAllowedByRecord`, `codexConfig`, `nativeAgent`, `buildPrompt`, `decide`, Git local em repositório sintético; simulado: processo Codex e wrappers de entrega (o `git:stage` real tem outra defesa contra symlink, não exercitada aqui) |
| 4 controle confiável e SHA exato | `test/developer-harness.trusted-gate.test.ts` | base confiável com controle e documento aprovado; candidata A cumpre o controle da base; checks e resultado do gate de A → `merge` de A (simulado) | candidata altera o próprio gate (código candidato **não executa**: marcador global ausente); altera a política e o documento aprovado (`politica-do-escopo`, `control-plane`; escopo autoaprovado → `SC-SCOPE`); gate/evidência de A com head B → `wait:structural-gate-stale` e evidência invalidada; check-runs de A com head C → `wait:ci-pending`; `structural-gate` ausente/pendente → `wait`, falho → `fix`, resultado do gate falho → `owner`; base inexistente, malformada, sem controle ou não ancestral → `SG-CONTROL` → `owner`; Git do gate sem nenhuma variável além de PATH/HOME/LANG/GIT_* (sem `GH_TOKEN`) | M4.1 gate da candidata → `candidato-altera-gate` (marcador definido) e `controle-nao-identificado`; M4.2a SHA da evidência em `updateEvidence` → `evidencia-de-outro-commit` (no `decide`, a comparação final mantém `wait`: redundância); M4.2b SHA do resultado do gate → `merge` indevido de B; M4.2c filtro `head_sha` → `merge` indevido de C; M4.3 reetiquetar sucesso antigo → asserção de `updateEvidence` (no `decide`, CI pendente mantém `wait`: redundância); M4.4a ausente como aprovado → `merge` sem `structural-gate`; M4.4b não exigir `structural-gate` → idem | real: `runStructuralGate` com Git local, `decide`, `updateEvidence`; simulado: GitHub. A decisão simulada **não comprova** integração no GitHub nem proteção do ruleset/CODEOWNERS (D-E1) |

**Comandos e resultados (29/10/2026, working tree local):**
- `pnpm test test/developer-harness.structural-exports.test.ts test/developer-harness.structural-migration.test.ts test/developer-harness.progress-checkpoint.test.ts test/developer-harness.trusted-gate.test.ts --reporter=verbose` → 4 arquivos, **31 de 31** (4 originais + 27 mutações); evidência por mutação impressa pelo próprio teste.
- `pnpm test:harness` → **152 de 152**.
- `pnpm test` → **1022 de 1024**. Falhas, ambas fora destes controles: (1) `cr-033-current-content`, pelos documentos da frente de idioma/billing modificados no working tree (já registrada no §0); (2) `developer-harness.arquitetura` "testes do produto não importam scripts", causada por `test/perfil-de-produto.paths.test.ts` (rodada anterior, não rastreado), que importa `scripts/claude-*` sem o prefixo `test/developer-harness.`. Correção: criado `test/developer-harness.perfil-de-produto.test.ts`, a pedido do proprietário; o arquivo antigo **ainda existe** e precisa ser removido fora desta sessão (o guard não permite apagar arquivos).

Estes cenários não concedem autorização para Stripe, produção ou integração autônoma de billing. Os critérios do §8 foram implementados no working tree em 29/10/2026 (§12).

## 12. Classe `structural` completa, billing/i18n e `requirementsRef` (29/10/2026)

**Estado:** implementado no working tree, **sem commit**, não integrado, não autorizado (nenhum escopo aprovado, autorização v2 não emitida), não ativado (o `structural-gate` não é check obrigatório no GitHub), não ensaiado. Resultados reais e limitações: [`docs/progresso/pr-11-manutencao-2026-10-29.md`](../progresso/pr-11-manutencao-2026-10-29.md).

| Item | Implementação | Onde |
| --- | --- | --- |
| Classificador: billing | `elevated` com motivo `billing` para código em `apps/`/`packages/` cujo caminho contenha billing, stripe, entitlement, pricing, subscription ou webhook; precedência sobre o perfil de produto; `docs/` não é afetado. CODEOWNERS local **ganhou** donos para esses caminhos (aumento de proteção; sem eles o `risk-gate` bloquearia esses PRs até para o proprietário) | `claude-risk.mjs`, `.github/CODEOWNERS` |
| Classificador: tradução | o formato do catálogo **não está definido** pela frente de idiomas (I18N-SPEC: "não escolher nova biblioteca neste pacote"). **Lacuna registrada:** `I18N_CATALOG_PATTERN = null`; todo candidato (`locale(s)/`, `messages/`, `i18n/`, `translation(s)/`, `lang/` em `apps/`/`packages/`) é `elevated`. O analisador de conteúdo já existe: JSON só com texto e placeholders `{nome}`/`{count}`; número, moeda, preço/plano/limite, prazo, renovação/cancelamento ou placeholder comercial → `elevated` | `claude-risk.mjs` (`analyzeTranslationCatalog`, `classifyChangeWithContent`) |
| Idioma ≠ moeda/preço | conteúdo em que o locale **define** moeda, preço ou plano (atribuição, ternário, mapa, `case`) → `elevated`; formatar com `Intl` a moeda já contratada é permitido. Heurística: na dúvida, eleva | `contentFindings` (worker antes do stage; gate em modo conteúdo) |
| Stripe | SDK, endpoint ou chave (`sk_/pk_/rk_` test ou live, `whsec_`) → `elevated`. Nenhuma classe autoriza acesso externo; adapters simulados por padrão | idem |
| `e2e/` | exceção nomeada e fechada `ROUTINE_TOP_LEVEL_DIRS = ["e2e"]`; `test/`, `docs/`, `apps/`, curingas e demais diretórios de um nível continuam recusados | `claude-delivery-record.mjs` |
| Autorização v2 | `oplyra-standing-authorization/2` (v1 aceita): `riskClasses` `["routine"]` ou `["routine","structural"]`; `structural.scopes[]` = `{ scopeRef, approvedDocument: { path, sha256 } }`. `deriveMissionRecord` só grava `scopeRef` se a missão o declarar, ele constar da autorização e o escopo lido de main tiver o mesmo id e documento; arquivo estrutural só se listado no escopo e de motivo banco/dependências. `PRODUCT_PROFILE` (§2) exportado pelo emissor, **sem emitir** | `claude-standing.mjs`, `codex-authorize.mjs` |
| Origem do escopo | `docs/harness/scopes/<scopeRef>.json` (elevado; [README](scopes/README.md)). O gate lê escopo e documento SOMENTE de `git show <base>:…`; o chamador não fornece escopo. Alterar o escopo (`escopo-estrutural`), o documento (`politica-do-escopo`) ou os módulos do controle (`control-plane`) no diff é `elevated` | `claude-structural.mjs` |
| CLI e CI | `node scripts/claude-structural.mjs gate --base <sha> --head <sha> [--scope-ref <ref>] [--repo <dir>]` → JSON com `sha`, `scopeRef`, `controlSha256`, `scopeSha256`, `approvedDocumentSha256`, `conclusion`; saída 0/1/2. Job `structural-gate`: checkout sem credenciais persistidas, base = merge-base, **executado de um worktree da base**, sem segredos nem instalação; sem `scopeRef`, modo conteúdo. `risk-gate` roda sempre (`always()`) e aceita caminho estrutural sem dono **somente** com resultado do mesmo head, `success`, elegível e motivo banco/dependências | `.github/workflows/ci.yml`, `claude-risk.mjs` |
| Runner | `structuralForHead`: resultado do gate do MESMO head (cache por SHA, recalculado quando o head muda, de outro SHA descartado → `decide` espera); `bindStructuralResult` confere o documento com a autorização (`SC-AUTH` se diverge). `decide` bloqueia missão estrutural se o ruleset não exigir `structural-gate` (`ruleset-structural`) | `claude-runner.mjs`, `claude-gates.mjs` |
| Missão | `dependsOn` inalterado (só `ms-NNN`). Opcionais: `scopeRef`; `requirementsRef` `{ document, version, sha256 }`: sem ele a missão é válida como antes; com ele, o runner só a inicia se o documento existir em `origin/main` com aquele sha256 (`requirements-ref`). **Nenhuma referência foi criada:** ADR-0010, `I18N-BILLING-US-INCORPORACAO.md` e CR-034 não estão em main | `claude-standing.mjs`, `claude-runner.mjs` |
| Admin | `ruleset-plan/apply` passa a acrescentar `structural-gate` aos checks obrigatórios e exige que `risk-gate` e `structural-gate` tenham passado em main antes de aplicar | `claude-admin.mjs` |

**Billing e entitlements (registro de política vigente):** billing, webhooks do Stripe, entitlements e preços ficam **`elevated` e sem integração autônoma** até haver política específica aprovada. Nenhum escopo estrutural, perfil de produto ou autorização contínua os cobre. Nenhuma proteção foi reduzida: o CODEOWNERS só ganhou donos.

**Proposta D-E1 (não aplicada).** Hoje o CODEOWNERS dá ao proprietário `/supabase/` e `**/package.json`; com `require_code_owner_review`, toda entrega estrutural exige a aprovação dele no GitHub. Opção (A): remover o dono **somente** de `/supabase/migrations/`, `/supabase/tests/` e `/packages/{core,infra,testing}/package.json` (o resto de `/supabase/` e os demais `package.json` continuam com dono), confiando no `structural-gate` obrigatório + `risk-gate` estrutural + imutabilidade de migrations + escopo versionado. Linhas propostas (o subconjunto do parser não aceita `!`, então a forma é sobrescrever com um dono técnico OU reestruturar `/supabase/` em entradas por subdiretório): `/supabase/config.toml`, `/supabase/seed.sql`, `/supabase/functions/` etc. com dono e **sem** `/supabase/migrations/`/`/supabase/tests/`. Risco: retira uma barreira imposta pelo GitHub; com (A), o `risk-gate` executa o script do checkout do PR (mudança nele continua exigindo dono, pois `/scripts/` permanece no CODEOWNERS). Opção (B): manter o dono e aceitar revisão humana de toda entrega estrutural (o runner para em `awaiting-owner:review-required`/`protected-blocked`). **Recomendação:** (B) até o ensaio remoto de uma entrega estrutural completa; depois, (A) por decisão explícita.

## 13. Ajuste administrativo que falta para ativar (descrição; nada foi executado)

Ordem obrigatória. Cada passo é do proprietário, no terminal dele, fora de sessão de agente.

1. **Revisão independente e merge da PR #11** (D-E0), com `validate` e `risk-gate` verdes no head final. O `structural-gate` do próprio PR será neutro (a base ainda não tem o controle) — isso é esperado e não autoriza nada.
2. **CI de `main` verde no SHA do merge**, incluindo os jobs `risk-gate` e `structural-gate` (em push para main, o `structural-gate` só registra "avalia pull requests").
3. **Ruleset:** `node scripts/claude-admin.mjs ruleset-plan` (somente leitura; mostra antes/depois) e `node scripts/claude-admin.mjs ruleset-apply` (TTY, frase `APLICAR-RULESET`). Efeito: aprovações 1 → 0 **somente** com `require_code_owner_review`, checks obrigatórios `validate` + `risk-gate` + `structural-gate` estritos, squash apenas; nenhum bypass adicionado. Pré-condição verificada pelo script: `risk-gate` e `structural-gate` verdes em main. Backup em `~/.oplyra/admin/`. **Verificação imediata:** PR descartável alterando um comentário em `.github/CODEOWNERS` precisa ficar BLOQUEADO; se não ficar, `ruleset-rollback <backup>` (frase `DESFAZER-RULESET`).
4. **CODEOWNERS (D-E1):** só se o proprietário escolher (A), em PR elevado próprio, depois do ensaio estrutural. Sem decisão, nada muda.
5. **Escopo estrutural (quando houver incremento aprovado):** PR elevado criando `docs/harness/scopes/<scopeRef>.json` e o documento aprovado; o proprietário confere o `sha256` do documento em main.
6. **Emissão única da autorização contínua** (D-E4): versão 2 com `PRODUCT_PROFILE` (§2) e, se houver, `structural.scopes[]` com o `scopeRef` e o `sha256` do documento **em main**. Hoje `codex-authorize.mjs` só emite o perfil inicial; o perfil de produto pode ser emitido por `claude-authorize.mjs --standing` (TTY, frase digitada, caminhos explícitos). **Nenhum emissor grava `structural.scopes[]` ainda:** a classe `structural` exige acrescentar essa opção ao emissor, em PR elevado, antes da emissão. Validade máxima 30 dias. **Revogação:** `~/.oplyra/standing/REVOKED` ou `~/.oplyra/KILL-DELIVERY`, verificados a cada passo do runner.
7. **Serviço:** `node scripts/codex-service.mjs prepare` e `install` no checkout isolado e limpo (o plist não carrega credenciais). **Parada:** `pnpm runner:stop`, arquivo STOP, kill switch ou revogação. O script não oferece desinstalação (nem usa `bootout` como recuperação genérica): remover o agente do launchd é operação manual do proprietário.
8. **Ensaio remoto**, cada etapa registrada em `docs/progresso/`: missão rotineira (entrega, falha de CI e correção, merge com SHA esperado, CI de main); depois uma missão estrutural com escopo aprovado; retomada após interrupção. Só depois `AUTONOMOUS-BUILD` pode declarar `executionEnabled: true`.

**Pré-requisito do passo 1 (30/10/2026):** retirar desta branch o commit local `2394d15` (CR-034) e manter fora a modificação de `ADR-0006` antes do push; com eles, o `validate` da PR #11 falha em `cr-033-current-content` (§14).

**Limites que permanecem:** máximo 50 missões, 50 merges por execução, 7 dias de relógio (tetos codificados; a autorização só reduz); por missão, 8 h e 10 iterações no teto. **Recuperação:** missão bloqueada → `runner unblock|abandon <ms-NNN>`; main vermelha após merge → o runner para (`main-red`) e o proprietário reverte por PR; ruleset → `ruleset-rollback`; autorização → revogar e emitir outra (nunca editar a existente).

## 14. Separação da documentação do CR-034 (30/10/2026)

Detalhe completo, hashes e proposta: [`docs/progresso/pr-11-separacao-cr-034-2026-10-30.md`](../progresso/pr-11-separacao-cr-034-2026-10-30.md). Resumo:

- **22 documentos** do manifest 2.22 divergem do sha256 congelado (README raiz; ADR-0006, ADR-0007, `decisions/README`; marketing-ops 01, 03 a 13, 15 a 17; `ATUALIZACOES`; `contracts-README`; `marketing-ops/README`). São a **única** causa da falha de `cr-033-current-content`; as asserções sobre registries, schemas, fixtures, migrations e a inexistência da Release 2.23 passam.
- **Não fazem parte da PR #11** (decisão do proprietário), mas 21 deles estão no commit **local** `2394d15` desta branch (autor: proprietário, 30/10/2026, não enviado) e `ADR-0006` está modificado só no working tree, sem estar no CR-034. Nenhum foi editado, revertido ou movido por esta sessão; nenhum entra em `paths` de missão (o runner recusa `docs/decisions/` e `contracts/` como elevados).
- **O harness não depende deles:** scripts, testes, `ci.yml` e `CODEOWNERS` só citam alguns caminhos como texto em asserções de classificação. A PR #11 pode ser integrada sem eles, desde que `2394d15` saia da branch antes do push.
- **Integração recomendada (elevada, proprietário):** PR separado com o commit do CR-034 e um mapa `AUTORIZADOS_PELO_CR034` (caminho exato → sha256 atual, citando CR-034 e ADR-0010) em `test/contracts/cr-033-current-content.test.ts`, sem tocar manifests, registries, schemas, fixtures, migrations nem snapshots 2.16–2.22; a Release 2.23 depois absorve os hashes e o mapa é removido. Alternativa: aguardar a 2.23 (canônica, mas bloqueada até a etapa autorizada e de escopo muito maior). `ADR-0006` só entra depois de o proprietário confirmar a origem da modificação.

**Ativação:** a lista do §13 continua válida e **nenhum item foi executado**; o pré-requisito novo é a separação acima antes do push (passo 1).
