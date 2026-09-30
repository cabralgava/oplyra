# Estado do trabalho — Oplyra

Checkpoint operacional deste repositório. Validar o conteúdo contra os arquivos reais e contra a autorização vigente ao retomar. Não substituir este registro por checkpoint de outro workspace.

## Situação atual — 30/09/2026

- **Etapa:** incremento **I-01 aceito pelo usuário em 16/09/2026**, com os dezessete critérios atendidos. Fase 0 concluída antes disso.
- **Autorização vigente:** execução local do I-01 conforme [PREPARACAO-I01](PREPARACAO-I01.md) §5, autorizada em 15/09/2026, começando pelo EXP-01. Em 29/09/2026 o usuário autorizou a execução local do **primeiro slice controlado do I-02** (Product AI Model Harness: portas, Test Adapter, Registry, Model Profiles, Router, contratos de resultado/erro, testes e documentação). Publicação, deploy, contas externas, `OPENROUTER_API_KEY`, chamadas reais ou pagas, dados reais e cobrança continuam **não autorizados**. Em 29/09/2026 o proprietário aprovou explicitamente o **CR-026**, aplicado na **Contract Registry Release 2.16**; a aprovação cobre só a aplicação do CR e não autoriza Cost Ledger persistido, migrations, adapter real, OpenRouter, Stripe, serviços externos, chaves reais, publicação ou commit. Em 29/09/2026 o proprietário aprovou o **CR-027** (Cost Ledger persistente), implementado somente no Supabase local e aplicado na **Contract Registry Release 2.17**, commitada em `8063131`; em seguida autorizou apenas a preparação local e documental do primeiro Supabase de produção ([PREPARACAO-SUPABASE-PRODUCAO](PREPARACAO-SUPABASE-PRODUCAO.md)), sem criar projeto, aplicar migration remota ou publicar. Em 29/09/2026 o proprietário aprovou o **CR-028** (endurecimento de prontidão para produção) e as decisões D-14 a D-18, aplicado somente localmente e empacotado na **Contract Registry Release 2.18** nessa mesma data; em 30/09/2026 a release foi commitada em `fe058f3fad7621a9431943f5e7d9d1727d08d92b`. A aprovação não cobre criar projeto Supabase, aplicar migration remota, publicar, chaves reais ou chamadas externas. Em 30/09/2026 o proprietário aprovou o **CR-029** (reconciliação documental; **Contract Registry Release 2.19**, commit `38ec4af36b704d8c3aa49efc89a6393e5ddb5e42`), o **CR-030** (alinhamento da documentação de produto de IA; **Release 2.20**, commit `e1aa0793a91c8fe340a2f662a606e1489f6c9779`) e o **CR-031** (Developer Harness e baseline de tooling; **Contract Registry Release 2.21**, `approved_and_applied`, commit `d73d817159177fd0bc31e0b1502578fc1262384a`); todos publicados depois em `origin/main` (ver **Repositório**). Os CR-029 e CR-030 não alteram código, migrations, registries, schemas nem comportamento; o CR-031 altera só o tooling de desenvolvimento e dois testes de integração, sem tocar produto, registries, schemas ou migrations. **A Release 2.21 é a vigente.** Em 30/09/2026 foi preparada, somente como documento, a proposta **CR-032** (ciclo de vida Git do Developer Harness e avaliação do DP-02b2), hoje `approved` (**aprovado, ainda não aplicado**: política e decisões D-1 a D-10 aprovadas pelo proprietário em 30/09/2026; os slices S1–S7 **não estão autorizados** nem implementados e exigem autorização individual; o **HB-13 não está atendido**), sem efeito sobre `AUTONOMOUS-BUILD.md` (`draft`, `executionEnabled: false`), scripts, hooks, settings, registries, schemas ou manifests, e fora do manifest da Release 2.21.
- **Referência protegida:** [00 — v2.3, de 16/09/2026](../product/marketing-ops/00-documento-transicao.md), SHA-256 `59a2b9495d770f4fc621dc626369a86aed55d03e77d616c3f4ad5f69e9c78bfc`, confirmada pelo usuário em 29/09/2026.
- **Repositório:** Git com remoto `origin` no GitHub; `main` **sincronizada com `origin/main` no commit `fd19716`** (`fd1971656657bb49a9f8b4473f5ab61de62198fc`, `docs(harness): update operational state`), verificado em 30/09/2026 (`HEAD` = `origin/main`, worktree e staging limpos). Estão publicados em `origin/main` os sete commits `7e00d89`, `8063131`, `fe058f3`, `38ec4af`, `e1aa079`, `d73d817` e `fd19716`. O push atualizou apenas o repositório GitHub já existente: **nenhuma publicação de aplicação, deploy, migration remota ou serviço externo de produto**.
- **Infraestrutura própria:** Supabase local nas portas 544xx e web na 3100. Outro projeto desta máquina ocupa 3000 e 543xx e **não foi tocado**.
- **Developer Harness:** implementado e **isolado do produto** (CR-031, Release 2.21): Claude Code, Context7 MCP e Playwright MCP vivem em `tools/developer-harness/`, projeto privado fora do workspace e do lockfile do produto. Detalhes na tabela abaixo e em [DEVELOPMENT-TOOLS](DEVELOPMENT-TOOLS.md). O primeiro slice local do Product AI Model Harness foi implementado com Test Adapter; OpenRouter permanece definido como gateway inicial padrão não exclusivo, mas seu adapter real não foi implementado nem ativado. Autonomous Build permanece `draft` e `executionEnabled: false`. **Nenhuma** chave, conta, crédito, chamada paga, adapter real, chamada real de provider ou recurso de produção foi habilitado.

### O que existe agora

| Peça | Situação |
| --- | --- |
| EXP-01 | Executado e **aprovado**; relatório em [`experiments/exp-01/RESULTADO.md`](../../experiments/exp-01/RESULTADO.md) |
| Banco | 15 migrations (000013–000014: schema `finops` do Cost Ledger, CR-027; 000015: guarda de Owner e exclusão em cascata de tenant, CR-028), RLS habilitada/forçada onde aplicável e seeds sintéticos com duas empresas e três períodos de orçamento sintéticos |
| Domínio e casos de uso | `packages/core`: entidades, invariantes, portas, os oito casos de uso do I-01 e o caso de uso `invokeModel` do Product AI Model Harness (I-02, slice 1) |
| Infraestrutura | `packages/infra`: wrappers de transação, repositórios, Auth por JWKS, Storage, auditoria |
| Operação | `apps/ops-cli`: provisionar empresa e primeiro Owner, `--dry-run` padrão, auditado |
| Interface | `apps/web`: entrada, escolha de empresa, equipe, convite e aceite, no tema escuro do guia |
| Verificação | Último gate integral (`pnpm verificar`, 30/09/2026, Release 2.21, banco reiniciado do zero): 810 Vitest em 50 arquivos, 240 pgTAP, 16 Playwright, secret scan e build aprovados; 275 testes de contrato; cross-validation 86/86; `pnpm test:harness` 53/53 |
| Prontidão de produção | CR-028 aprovado e aplicado localmente em 29/09/2026 (Release 2.18; hoje herdada pela 2.19); commit `fe058f3fad7621a9431943f5e7d9d1727d08d92b` em 30/09/2026. `local`/`ci` recusam qualquer host remoto e `OPLYRA_ALLOW_REMOTE` foi removida; produção exige project ref, fingerprint e `TrustedDeploymentContext`. **Produção continua bloqueada por desenho:** não há provedor aprovado de `TrustedDeploymentContext` (allowlist vazia). Nenhum projeto Supabase remoto foi criado e nenhuma migration remota foi aplicada |
| Developer Harness | **CR-031 `approved_and_applied`, Release 2.21.** Tooling isolado em `tools/developer-harness/` (3 arquivos, versões exatas: Claude Code `2.1.284`, Playwright MCP `0.0.83`, Context7 MCP `4.1.1`), fora do workspace e do lockfile do produto; o lock raiz é o da Release 2.20. Única exceção de supply chain: `allowBuilds` do Claude Code; nenhuma exceção de idade. Launcher oficial `pnpm claude:local` (falha fechado); permission mode **`dontAsk` somente após as provas P1–P6** da sonda offline, vinculado à versão instalada (sem prova vigente, o modo é `manual`). `pnpm claude:maintenance` é **sempre manual**, com confirmação digitada. **Context7 negado em sessões autônomas e permitido somente em manutenção manual.** O guard é defesa em profundidade, não sandbox; invocar `claude` diretamente fica fora das garantias. **Git mutável** (`add`, `commit`, ramos, `push`…) permanece sob responsabilidade do proprietário. Playwright Test/CLI implementados no I-01. `.claude/settings.local.json` permanece local e ignorado pelo Git, fora do manifest; as permissões temporárias da manutenção foram removidas (conforme o proprietário) |
| Product AI Model Harness | Slice 1 do I-02 implementado localmente e com contratos canônicos desde a Release 2.16 (CR-026 `approved_and_applied`): Error Registry 1.4, registry `model-profiles.json` 1.0, cinco schemas, Context Package 1.1 ([AI-MODEL-HARNESS](AI-MODEL-HARNESS.md), [AI-MODEL-HARNESS-CONTRACTS](../product/marketing-ops/contracts/AI-MODEL-HARNESS-CONTRACTS.md)). Sem adapter real, sem chave produtiva, saída visual bloqueada. Cost Ledger persistente implementado **somente no Supabase local** pelo CR-027 (Release 2.17, Error Registry 1.5, Model Profile Registry 1.1) ([COST-LEDGER-CONTRACTS](../product/marketing-ops/contracts/COST-LEDGER-CONTRACTS.md)) |

### Aceite do I-01

**Aceito em 16/09/2026.** Os dezessete critérios de [PREPARACAO-I01](PREPARACAO-I01.md) §5.9 estão atendidos; os dois que estavam parciais foram fechados no mesmo dia: entrega real do link por e-mail, verificada pelo Mailpit, e verificação de interface com 16 testes Playwright mais o checklist `apple-design` aplicado à aplicação ([14 §9.1](../product/marketing-ops/14-ux-flows.md)).

Última evidência integral (30/09/2026, Release 2.21, CR-031, commit `d73d817`): `pnpm verificar` aprovado, com banco local reiniciado do zero, com tipos, 810 testes Vitest em 50 arquivos, 240 pgTAP em 8 arquivos, 16 cenários Playwright, varredura de segredos e build de produção; 275 testes de contrato em 17 arquivos; cross-validation 86/86; `pnpm test:harness` 53/53 (guard, launcher e avaliação da sonda). O manifest contratual vigente é o v2.21 (SHA-256 `e83544f159f15dfd3d48b406ede0b91e3d4617f9c550866082cd11666619330f`, aggregate digest `306cfd3b48b8fe2d2943499a43205d9606517d523ca1020cf4072b101c7d7bb2`, relatório `8d049bc23a262bd9228d94798f469d206d1ee95eac002dfd7fd925c9cfc57408`; classificação 487 artefatos: 458 herdados, 6 modificados, 23 adicionados, 0 não classificados). As v2.20 (commit `e1aa079`), v2.19 (`38ec4af`), v2.18 (`fe058f3`), v2.17, v2.16 e v2.15 permanecem preservadas como base histórica, com as contagens registradas nas suas seções.

**Pendências registradas, não bloqueantes para o I-01:** a revisão de segurança independente do código de conexão herdada do EXP-01 (resolver antes de dados reais); teste com leitor de tela real; e a inspeção dos frames do Figma (DP-35), que limita afirmar fidelidade visual.

## Reconciliação de 15/09/2026

> **Registro histórico, superado quanto à autoridade vigente.** Em 29/09/2026 o usuário confirmou a v2.3 de 16/09/2026 como referência protegida atual. O relato abaixo permanece para explicar o estado e as decisões tomadas em 15/09.

**Motivo.** Entre 13/09 e 15/09 a referência protegida foi substituída (v2.2 no lugar da v2.3 que sustentava os documentos derivados) e as instruções e o checkpoint foram sobrescritos por versões de outro workspace, que não continha os documentos 01–18, os ADRs, o registro de decisões, as skills nem os protótipos. Isso produziu afirmações falsas para este repositório e quebrou a ancoragem das decisões, porque os identificadores DEC mudaram de significado entre versões.

**Aplicado nesta reconciliação:**

- Referência corrigida para v2.2 em CLAUDE, README, ATUALIZACOES e índice de produto.
- Ancoragem das decisões normalizada: `DEC-0xx` apenas quando corresponde à numeração da v2.2 §27; Stripe, budgets, imagens e arquitetura multimodelo passam a citar ATUALIZACOES, sem identificador inventado.
- Índice de produto refeito com os arquivos que existem; removida a afirmação de que apenas o 00 estaria disponível.
- Este checkpoint restaurado, preservando as definições de 15/09 sobre domínios e referência visual; removida a referência a `entregaveis/`, pasta que pertence ao ambiente de preparação e não existe aqui.
- Escopo de vídeo reconciliado nos documentos derivados: análise de ativo enviado permitida, geração nativa não.
- Método de campanha (DEC-017) incorporado a requisitos, fluxos, agentes, testes e experimentos.
- Direção visual unificada no guia de interface; protótipo claro preservado como histórico e versão realinhada publicada.

## Entregas existentes

| Entrega | Situação | Evidência |
| --- | --- | --- |
| Instruções e README | Atualizados nesta reconciliação | [CLAUDE](../../CLAUDE.md), [README](../../README.md) |
| Documentos de produto 01–20 | Presentes; referência corrente reconciliada com a v2.3; 19–20 aprovados | [Índice](../product/marketing-ops/README.md) |
| ADRs 0001–0009 e registro de decisões | Presentes; estados individuais registrados no índice | [Decisões](../decisions/README.md) |
| Harness | Documentado | [DESENVOLVIMENTO](DESENVOLVIMENTO.md), [VERIFICACOES](VERIFICACOES.md), [PRODUTO](PRODUTO.md), [PUBLICACAO](PUBLICACAO.md) |
| Preparação do I-01 | Contratos e critérios de aceite definidos; stack decidida; I-01 executado e aceito em 16/09/2026 | [PREPARACAO-I01](PREPARACAO-I01.md) |
| Developer / AI Harness | Ferramentas, limites Local First, versionamento e separação de camadas documentados | [DEVELOPMENT-TOOLS](DEVELOPMENT-TOOLS.md) |
| Identidades sintéticas | Tenants/personas reais do seed e taxonomia de sistema documentados | [SYSTEM-TEST-USERS](SYSTEM-TEST-USERS.md) |
| Autonomous Build | Draft desativado, hard blockers e DoD documentados | [AUTONOMOUS-BUILD](AUTONOMOUS-BUILD.md) |
| Skills | Quatro presentes e aplicadas; duas adaptadas | [SKILLS-COMPATIBILIDADE](SKILLS-COMPATIBILIDADE.md) |
| Protótipo vigente | Realinhado ao guia de interface | [performance-mvp.html](../product/marketing-ops/prototypes/performance-mvp.html) |
| Protótipo histórico | Tema claro, preservado sem uso normativo | [performance-mvp-legacy-claro.html](../product/marketing-ops/prototypes/performance-mvp-legacy-claro.html) |
| Marca e interface | Fornecidas pelo usuário | [Manual de marca](../brand/oplyra_brand_system.md), [Guia Figma](../product/marketing-ops/GUIA-INTERFACE-FIGMA.md) |
| Relatório da reconciliação anterior | Histórico de 11/09 | [RELATORIO-RECONCILIACAO](RELATORIO-RECONCILIACAO.md) |

Existência de arquivo não equivale a aplicação de skill, nem a verificação executada, nem a aprovação.

## Verificações executadas

| Data | Verificação | Resultado e limite |
| --- | --- | --- |
| 11/09 | Links e âncoras Markdown, títulos 01–18, nomes antigos, rastreabilidade FX/TST/EXP/I-0x | Sem pendências no conjunto de então |
| 11/09 | Protótipo conceitual no navegador, estado lido no DOM: geração, edição, falha, limite, consumo, aprovação por versão, troca de empresa, viewport 768 px | Aprovado; teclado por injeção não confirmado; sem leitor de tela nem dispositivo real |
| 15/09 | Inventário do repositório, SHA-256 da referência, mapeamento dos identificadores DEC entre versões, varredura de domínios e de menções a vídeo | Base desta reconciliação |
| 15/09 | Revarredura de links e âncoras após as alterações | Registrada na entrega correspondente |
| 29/09 | `pnpm test:harness` | 4/4 cenários passaram: escrita local permitida; referência/secrets/saída do repo bloqueados; comandos remotos/destrutivos bloqueados; Playwright externo bloqueado |
| 29/09 | `pnpm harness:tools` e health check dos MCPs | Claude Code `2.1.284`, Playwright MCP `0.0.83`, Context7 MCP `4.1.1`; Context7 e Playwright conectados |
| 29/09 | Context7 MCP via protocolo stdio | Handshake, catálogo e resolução version-aware de Next.js executados com sucesso |
| 29/09 | Playwright MCP via protocolo stdio | Chrome headless isolado abriu `/entrar`, autenticou `a-owner@local.test` e confirmou `Alfa Software (fictícia)`/`owner` em `/empresas` |
| 29/09 | Revisão documental do gateway OpenRouter | 17 Markdown alterados com links locais válidos; `git diff --check` limpo; secret scan sem achados; nenhum arquivo do registry frozen alterado |
| 29/09 | Reconciliação da referência protegida | Usuário confirmou v2.3; SHA-256 `59a2b949…9c78bfc` verificado; documentos normativos e checkpoints correntes atualizados; registros históricos da v2.2 preservados como históricos |
| 29/09 | I-02 slice 1 — `pnpm verificar` (primeira entrega) | Aprovado: tipos, 308 Vitest (96 novos do harness), 87 pgTAP, 16 E2E, secret scan e build. Uma primeira execução falhou no E2E por regressão causada pelo slice (barrel do infra levava o catálogo de registries ao bundle da web); corrigida e travada por teste de arquitetura |
| 29/09 | I-02 slice 1 — mutações | Cinco mutações (allowlist do tenant, privacidade, adapter não habilitado, repetição de tentativa, modelo resolvido diferente) detectadas pelos testes; código restaurado |
| 29/09 | I-02 slice 1 — integridade (primeira entrega) | Hashes de `agents`, `actions`, `errors`, `events`, `tools` e `permissions` iguais ao manifest v2.15 (teste de contrato); nenhum arquivo sob `contracts/` alterado além do CR-026 novo; `git diff --check` limpo; `pnpm test:harness` 4/4 |
| 29/09 | I-02 slice 1 — correção: `pnpm verificar` | Aprovado: tipos, 376 Vitest (68 novos na correção), 87 pgTAP, 16 E2E, secret scan e build |
| 29/09 | I-02 slice 1 — correção: mutações | Seis mutações detectadas: aquisição em andamento tratada como adquirida, sem validação da resposta, sem validação do pedido, sem semântica de imagens, trace parcial, decimal aceito como quantidade; código restaurado |
| 29/09 | I-02 slice 1 — correção: higiene | `pnpm test:harness` 4/4; `git diff --check` limpo; `pnpm scan:secrets` limpo nos versionados e os mesmos padrões, mais atribuição de `OPENROUTER_API_KEY`, sem ocorrência também nos 31 arquivos não versionados (`git grep --untracked`) |
| 29/09 | I-02 slice 1 — lacunas contratuais: `pnpm verificar` | Aprovado: tipos, 429 Vitest (53 novos), 87 pgTAP, 16 E2E, secret scan e build |
| 29/09 | I-02 slice 1 — lacunas contratuais: mutações | Onze mutações detectadas: fake sem comparação de fingerprint, fingerprint sem mensagens, downgrade permitido, ausência de fonte tratada como `synthetic`, dica de tokens autoritativa, zero outputs visuais aceitos, assets acima do pedido aceitos, rota visual sem bloqueio, binário inline aceito, sem limite por mensagem, asset de outro tenant aceito; código restaurado byte a byte |
| 29/09 | I-02 slice 1 — lacunas contratuais: SHA-256 e higiene | SHA-256 puro do núcleo igual aos vetores do FIPS 180-4 e a `node:crypto` (implementação removida na rodada seguinte); `pnpm test:harness` 4/4; `git diff --check` limpo; varredura de segredos limpa nos versionados e nos não versionados; hashes dos registries iguais ao manifest v2.15 |
| 29/09 | I-02 slice 1 — divergências finais: `pnpm verificar` | Aprovado: tipos, 445 Vitest, 87 pgTAP, 16 E2E, secret scan e build |
| 29/09 | I-02 slice 1 — divergências finais: mutações | Oito mutações detectadas: chave de aquisição sem action, `callId` sem action, `outputAssetIds` ignorando falha, saída pública com descriptor interno, HMAC ignorando o segredo, comparação sem chaves anteriores (rotação), harness aceitando formato não protegido, formato sem `keyId`. Uma primeira versão da mutação do formato foi ineficaz por precedência de operadores e foi refeita; código restaurado byte a byte |
| 29/09 | I-02 slice 1 — divergências finais: higiene | `pnpm test:harness` 4/4; `git diff --check` limpo; varredura de segredos limpa nos versionados e nos não versionados; hashes dos registries iguais ao manifest v2.15; nenhum arquivo sob `contracts/` alterado além do CR-026 |
| 29/09 | I-02 slice 1 — identidade da tentativa | `pnpm verificar` aprovado (464 Vitest, 87 pgTAP, 16 E2E, secret scan, build); `pnpm test:harness` 4/4; `git diff --check` limpo; varredura de segredos limpa em versionados e não versionados; registries, schemas, fixtures e manifests sem diferença contra `HEAD`. Seis mutações detectadas: `callId` sem tenant, `callId` por concatenação simples, surrogate isolado aceito, sem limite de identificador, chave externa com `callId` cru, chave externa sem separação de domínio |
| 29/09 | CR-026 aplicado — Release 2.16 (primeiro empacotamento, substituído) | Error Registry 1.3 → 1.4 (46 → 58 códigos); registry `model-profiles.json` 1.0 (3 perfis); schemas 24 → 29; fixtures 29/56 → 40/92 válidas/inválidas; Context Package 1.1; cross-validation versionada 60/60; manifest v2.16 com 373 artefatos, conferidos de forma independente por `shasum -a 256` (0 divergências) e `aggregateDigest` recalculado em shell; v2.15 idêntico ao `HEAD` |
| 29/09 | CR-026 aplicado — gates (primeiro empacotamento) | `pnpm verificar` aprovado (536 Vitest em 35 arquivos, 87 pgTAP, 16 E2E, secret scan, build); 171 testes de contrato; `pnpm test:harness` 4/4; `git diff --check` limpo; varredura de segredos limpa em versionados e 101 não versionados; nenhuma chamada externa, chave real ou dado real |
| 29/09 | Release 2.16 — correção de empacotamento | `common-definitions` 1.0 restaurado byte a byte (idêntico ao `HEAD`) e definições do CR-026 publicadas só em `common-definitions/1.1`; manifest reconstruído como mudança lógica sobre a 2.15: 268 herdados (conferidos contra `HEAD`), 10 modificados e 95 adicionados pelo CR-026 (conferidos contra o disco), 0 não classificados, `aggregateDigest` recalculado em shell; nenhuma edição pendente do usuário no digest |
| 29/09 | Release 2.16 — gates da correção | `pnpm verificar` aprovado (542 Vitest em 35 arquivos, 87 pgTAP, 16 E2E, secret scan, build); 177 testes de contrato; cross-validation 62/62; `pnpm test:harness` 4/4; `git diff --check` limpo; varredura de segredos limpa em versionados e 102 não versionados |

As linhas de 11/09 e 15/09 são históricas da reconciliação documental e foram superadas pelo aceite do I-01 e pelas evoluções contratuais até o manifest v2.15; as de 29/09 são a evidência corrente. Estado atual: hoje existem código, Git/GitHub, CI, Supabase local, componentes parciais de runtime e testes executáveis. EXP-01 foi aprovado; EXP-02 foi aprovado com notas em 21/09/2026; EXP-03 a EXP-05 continuam dependentes de seus incrementos e das autorizações correspondentes. O Product Agent Runtime não está completo nem ativado.

## Skills

As quatro skills citadas em CLAUDE existem em `.claude/skills/`: `ddd-rapido-arquiteto`, `clean-architecture-arquiteto`, `verificacao-qualidade-codigo` e `apple-design`. Foram lidas e aplicadas neste repositório na ordem DDD → Clean Architecture → verificação, com `apple-design` no trabalho de UX. Duas receberam adaptação autorizada: escopo da skill de qualidade e delimitador YAML de `apple-design`. Trechos de CRM Imob L4S, L4S e Lovable foram desconsiderados e estão registrados em [SKILLS-COMPATIBILIDADE](SKILLS-COMPATIBILIDADE.md).

## Domínios oficiais — 15/09/2026

Landing page e site institucional em `https://oplyra.io`; aplicativo em `https://app.oplyra.io`. Substitui `oplyra.com.br` e `app.oplyra.com.br` (DEC-009) para novas especificações. Registro documental: não comprova registro de domínio, DNS, TLS ou publicação, e desenvolvimento local continua em endereços locais.

## Referência visual — 15/09/2026

O [Guia de interface Figma](../product/marketing-ops/GUIA-INTERFACE-FIGMA.md) é a referência visual vigente, coerente com o [manual de marca](../brand/oplyra_brand_system.md): tema escuro, roxo `#5B3DF5`, Manrope em títulos e Inter no produto, comparação em 1440 px.

**Frames inspecionados: nenhum.** A abertura do arquivo Figma falhou; os nodes `4:9`, `4:268` e `4:492` seguem por conferir. Medidas, grid, espaçamentos, raios, sombras, tamanhos tipográficos, ícones e composição de gráficos permanecem pendentes, assim como a confirmação da sidebar no Dashboard. Os valores do guia vieram do material fornecido pelo usuário, não de extração dos frames.

## Ambientes e publicação

- Desenvolvimento: Supabase local via Docker configurado e validado no I-01.
- Produção: projeto Supabase separado, não criado. Prontidão documentada em [PREPARACAO-SUPABASE-PRODUCAO](PREPARACAO-SUPABASE-PRODUCAO.md) (`not_ready_for_publication_proposal`: bloqueios B-1, B-2 e B-6 e decisões pendentes do proprietário; o B-4, identidade de ambiente e Local First, foi atendido localmente pelo CR-028, que também aprovou D-14 a D-18).
- Versão publicada: nenhuma. Aprovação de deploy: nenhuma. Até o commit `fd19716` (publicado em `origin/main`) não houve deploy, projeto remoto, migration remota, chave real nem chamada de provider; o push atualizou só o repositório GitHub.
- Nenhum recurso de aplicação em Supabase/Netlify/Railway de produção, deploy, cobrança ou benchmark pago foi criado nesta tarefa. O repositório GitHub já existia antes dela.

## Preparação dos harnesses — 29/09/2026

- Context7: `@upstash/context7-mcp@4.1.1` pinado, configurado e validado com consulta version-aware.
- Playwright Test/CLI: já implementados; 16 cenários do I-01 compõem a evidência corrente registrada.
- Playwright MCP: `@playwright/mcp@0.0.83` pinado, configurado e validado em fluxo real local com usuário sintético.
- Claude Code: `@anthropic-ai/claude-code@2.1.284` pinado; MCPs do projeto aprovados. O comando `pnpm claude:local` usa configuração MCP estrita e não carrega conectores pessoais/globais.
- Local First: hook executável bloqueia referências protegidas, secrets, escrita externa, comandos remotos/destrutivos conhecidos e navegação Playwright não local. É defesa complementar, não sandbox absoluta.
- Usuários/tenants sintéticos: baseline real do seed documentado, sem replicar senha ou token.
> Registro da preparação, anterior ao I-02. O estado corrente do Product AI Model Harness está na seção do slice 1, abaixo.

- Product AI Model Harness: arquitetura multiprovider, Model Profiles propostos, provider ports/adapters, OpenRouter como gateway inicial padrão não exclusivo, Test Adapter, fallback, observabilidade, Eval Engine e Cost Ledger consolidados no documento 13. A decisão não configura conta, chave, créditos, chamadas reais ou uso em produção.
- Contratos frozen: nenhuma alteração na preparação nem no slice 1. Alterados somente pela aplicação aprovada do CR-026 na Release 2.16 (ver seção própria).
- Autonomous Build: `status: draft`, `executionEnabled: false`.
- Skills aplicadas nesta revisão: DDD para preservar linguagem/catálogos existentes; Clean Architecture para manter providers na borda; verificação de qualidade para revisão documental adversarial. Trechos de Lovable/CRM das skills foram desconsiderados conforme [SKILLS-COMPATIBILIDADE](SKILLS-COMPATIBILIDADE.md).
- Verificação da preparação (antes do I-02): ferramentas e MCPs saudáveis, consulta Context7 real, smoke Playwright MCP real, quatro testes do guard e `pnpm verificar` aprovados. O gate integral confirmou 212 Vitest, 87 pgTAP, 16 E2E, secret scan e build; dois seeds de teste do dispatcher foram tornados independentes da data do calendário. A revisão documental de OpenRouter preservou o registry frozen e não alterou arquivo sob `contracts/`.

## I-02 — slice 1 do Product AI Model Harness — 29/09/2026

> **Registro histórico.** O bloco abaixo é o checkpoint ao fim do slice 1, em 29/09/2026; "Sem commit", "nenhum … commit" e as pendências listadas valem só para aquele momento e **não descrevem o estado atual**. Desde então: Release 2.17 commitada em `8063131` (CR-027, Cost Ledger persistente local) e Release 2.18 em `fe058f3fad7621a9431943f5e7d9d1727d08d92b` (CR-028, 30/09/2026). Ver a situação atual e as seções das Releases 2.17 e 2.18.

```text
Etapa e status: slice 1 do I-02 implementado e verificado localmente; CR-026 aprovado pelo proprietário e aplicado na Contract Registry Release 2.16 em 29/09/2026. Sem commit (naquela data; histórico).
Objetivo e escopo autorizado: portas do provider, Test Adapter determinístico, Registry, Model Profiles por agent + action, Router com capability/allowlist/budget/privacidade/fallback, contratos de resultado e erro, testes e documentação. Correção autorizada em 29/09: aquisição concorrente por tentativa, validação em runtime do pedido e da resposta, semântica de requestedImages, TraceContext, revisão do CR-026 e deste checkpoint. Segunda correção autorizada em 29/09: fingerprint de idempotência, proveniência da classificação, estimativa de tokens e saída visual por referência a asset. Terceira correção autorizada em 29/09: escopo tenant + action + chave, `outputAssetIds` só aceitos, contrato visual público separado e fingerprint HMAC na infraestrutura. Correção final autorizada em 29/09: `callId` sobre o escopo completo, Unicode bem formado, limites de identificador e chave externa opaca. Somente local; sem aplicar o CR-026.
Arquivos/versão de referência: CLAUDE, ESTADO, AUTONOMOUS-BUILD, ATUALIZACOES, 00 v2.3, 12, 13, 18, 20, ADR-0006; Contract Registry Release 2.15 (errors 1.3, agents 1.0, actions 2.0).
Entregas concluídas:
  - packages/core/src/ai-model-harness/: outcomes, model-registry, model-profile, ports, router, invoke-model
  - packages/infra/src/ai-model-harness/: Test Adapter, catálogo somente leitura dos registries congelados, catálogo local sintético, composition root local (entrada própria `@oplyra/infra/ai-model-harness`)
  - packages/core/src/ai-model-harness/invocation-validation.ts (correções): TraceContext, validação do pedido e limites, semântica de imagens, cota conservadora de tokens, fingerprint e validação da resposta por modalidade
  - packages/core/src/ai-model-harness/utf8.ts: tamanho UTF-8 (o SHA-256 puro da rodada anterior foi removido do núcleo)
  - packages/infra/src/ai-model-harness/hmac-fingerprint.ts: HMAC-SHA-256 da plataforma com keyring e `keyId`
  - packages/testing/src/ai-model-harness.ts: fakes de orçamento com aquisição atômica, recorder, política, disponibilidade, prazo e provider
  - testes: unidade (core, testing, infra), fronteiras (concorrência, números, resposta do adapter, imagens, trace), integração local, arquitetura e contrato
  - docs: AI-MODEL-HARNESS.md, CR-026 (proposed), nota em 13 §1.2
Verificações: ver tabela acima (29/09, primeira entrega e correção). Limitação: fakes voláteis provam atomicidade só dentro de um processo; nada exercita adapter real.
Trabalho parcial e efeitos já executados: nenhum efeito externo; nenhuma conta, chave, chamada paga, migration, deploy ou commit.
Bloqueios ou decisões pendentes: nenhum para o slice 1. Continuavam fora naquela data: contrato de asset (saída visual), carregamento de chave de fingerprint de cofre, Cost Ledger persistido com migrations e RLS (**resolvido depois: CR-027, Release 2.17, Supabase local**), adapter real e vínculos de perfil de produção (EXP-05).
Aprovação: autorização local do slice 1 e, depois, da sua correção, ambas em 29/09/2026 pelo usuário; sem aceite do incremento, sem aplicação do CR-026 e sem autorização de publicação ou commit.
Próxima ação autorizada: nenhuma além da revisão da Release 2.16; commit, publicação e os itens bloqueados exigem nova autorização.
```

Decisões locais tomadas no slice (reversíveis):

- Model Registry e Profiles existem como tipos internos e catálogo local sintético; **não** como registry canônico, até o CR-026.
- Falhas sem código registrado não inventam código: apontam para `CR-026` e não são reexecutadas automaticamente.
- Valores monetários em micro-USD inteiros; estimativa de pior caso com tarifa versionada; tarifa ausente bloqueia a chamada.
- Perfis locais com teto de custo zero por chamada: um candidato pago acrescentado por engano é recusado.
- Prazo do perfil aplicado pelo caso de uso por meio de `DeadlinePort`, porque o núcleo não conhece timers do host.
- Aquisição atômica de `invocationId#attempt` junto com a reserva: `acquired` chama o provider; `in_progress` e `closed` não chamam; `insufficient` é orçamento. Tentativa deixada em andamento por queda fica para a conciliação do Ledger persistido, sem nova chamada.
- Pedido e resposta do adapter validados em runtime; quantidades e valores monetários só como inteiros seguros não negativos. Resposta inválida retém a reserva, não liquida e encerra sem fallback.
- `requestedImages`: obrigatório e >= 1 em rota visual; ausente ou 0 nas demais; imagens entregues acima do pedido invalidam a resposta.
- `TraceContext` com sete chaves sempre presentes (`null` quando não se aplica), copiado para cada registro e não enviado ao fornecedor.
- Idempotência no escopo `(tenantId, actionKey, invocationId, tentativa)`, como o `IDEMPOTENCY_CONFLICT` congelado. O `callId` é `att1.` + base64url do JSON do escopo completo: inequívoco entre tenants e actions, limitado e interno; nunca vai cru ao fornecedor, e a chave externa é `oik1-<hex>` (HMAC com separação de domínio, na infraestrutura).
- Identificadores, trace, refs e mensagens exigem Unicode bem formado; surrogate isolado é `MODEL_INVOCATION_INVALID` sem efeitos. `invocationId` reutiliza o limite canônico de `idempotency.key` (255); `actionKey`/`agentKey` reutilizam os padrões canônicos; os tetos de `tenantId`, `workflowKey`, `actionKey`, `agentKey` e trace são locais e propostos no CR-026.
- O núcleo só monta o material canônico; o fingerprint é HMAC-SHA-256 da plataforma, na infraestrutura, no formato `hmac-sha256:v1:<keyId>:<hex>`, comparado na aquisição atômica contra as chaves ativa e anteriores do keyring. `sha256:v1` não é formato persistido. Sem carregamento de segredo neste slice: chaves fornecidas pelo chamador, sintéticas nos testes; uso produtivo bloqueado.
- Classificação resolvida por `DataClassificationPort`; sem fonte, `personal_data`; o chamador só eleva. Fonte ausente ou de outro tenant é `REFERENCE_NOT_FOUND` (já registrado).
- `inputTokensHint` substitui `estimatedInputTokens` e só aumenta a estimativa; o harness usa contagem exata do modelo ou cota conservadora em bytes UTF-8; limites de 64 mensagens, 256 KiB por mensagem e 1 MiB no total.
- Saída por modalidade; visual somente por referência a asset conferida no tenant e na tentativa; capability visual bloqueada (`visual_capability_blocked`, CR-026) enquanto não houver contrato canônico de asset.
- Saída visual pública só `{assetId, mediaType}`; `tenantId`/`producedByCallId` apenas no descriptor interno. `outputAssetIds` só com assets aceitos; `null` em qualquer falha ou descarte.
- O `tsconfig` do pacote `testing` declara os tipos do Node, porque os testes usam o adapter HMAC real da infraestrutura.

## Contract Registry Release 2.16 — CR-026 — 29/09/2026

- **Aprovação:** proprietário do projeto, 29/09/2026, somente para aplicar o CR-026. CR-026 em `approved_and_applied`.
- **Manifest:** `contract-registry-manifest-v2.16.json`, `status: active`, base v2.15 (preservado) e Freeze v1. Representa o commit seletivo do CR-026, não o worktree: 268 artefatos herdados com a entrada exata da 2.15, 10 modificados e 95 adicionados pelo CR-026, listados em `changeSet.modifiedArtifacts`/`addedArtifacts`. As edições pendentes do usuário (docs 13/16/17/18, índice de decisões, `package.json`, `pnpm-lock.yaml`, dois testes do dispatcher) seguem em disco, intocadas, e fora do digest. A nota que eu havia acrescentado ao doc 13 continua no arquivo de trabalho, mas o doc 13 não faz parte da release.
- **Versões:** Error Registry 1.3 → 1.4; `commonDefinitions` 1.0 → 1.1 (1.0 continua publicado sem mudança; 1.1 em `common-definitions-1.1.schema.json`); Context Package 1.0 → 1.1; Model Profiles 1.0 (novo). Schemas 24 → 30.
- **Canônico agora:** 12 códigos `MODEL_*`; definições compartilhadas do harness; schemas de pedido, resposta, catálogo, Model Profile e Model Call; registry de Model Profiles; `dataClassification` opcional no Context Package 1.1; `maxLength` no validador de subconjunto.
- **Continua bloqueado ou adiado:** saída visual (sem contrato de asset), chave produtiva de fingerprint, Cost Ledger persistido (adiado na 2.16; **resolvido depois pelo CR-027, Release 2.17**), adapter real, vínculos de perfil de produção e preenchimento de `dataClassification` pelo Context Builder.
- **Correção factual registrada no CR:** a estimativa da revisão 5 ("bem abaixo de 1 KiB") para o `attemptCallId` estava incorreta; o pior caso é 3171 caracteres, que é o `maxLength` canônico. A regra aprovada não mudou.
- **Correção de empacotamento (antes de qualquer commit):** o primeiro empacotamento republicava definições novas sob `common-definitions/1.0` e absorvia edições pendentes do worktree no digest; ambos foram corrigidos e cobertos por testes (classificador de artefatos e guarda contra hash fora do change set).

## Contract Registry Release 2.17 — CR-027 — 29/09/2026 (histórica; substituída pela 2.18)

Contagens e hashes desta seção descrevem a Release 2.17 na data do seu commit; o estado vigente está em "Contract Registry Release 2.18" e na tabela de situação atual.

- **Aprovação:** proprietário, 29/09/2026: CR-027 revisado integralmente, somente implementação local. CR-027 em `approved_and_applied`.
- **Commit:** `8063131` (`feat(finops): add persistent cost ledger`), seletivo, 79 arquivos iguais à allowlist do manifest; sem PR ou publicação de aplicação (publicado depois em `origin/main`).
- **Manifest:** `contract-registry-manifest-v2.17.json` (sha256 `0870c3af…3076`, aggregateDigest `1d7bdc7c…b7d5`): 426 artefatos, 348 herdados da 2.16, 25 modificados e 53 adicionados pelo CR-027, 0 não classificados. Hashes de um rascunho anterior da 2.17 registrados como substituídos, nunca publicados.
- **Versões:** Error Registry 1.4 → 1.5 (60 códigos: `BUDGET_NOT_CONFIGURED`, `MODEL_ATTEMPT_CLOSE_UNCONFIRMED`); Model Profile Schema 1.1 (`timeoutMs` ≤ 840 000; 1.0 preservado); Model Profile Registry 1.1; schemas `budget-period`, `cost-ledger-entry`, `model-attempt` 1.0.
- **Implementado só no Supabase local:** schema `finops`, 14 migrations no total, funções `security definer` com EXECUTE mínimo, aquisição idempotente, fechamento atômico com o Model Call Record, replay idempotente do fechamento, sweep, conciliação auditada, isolamento por tenant.
- **Último gate integral:** 592 Vitest, 193 pgTAP, 16 Playwright, secret scan e build aprovados; 195 testes de contrato; cross-validation 75/75; concorrência estável em 3 execuções; 19/19 mutações dirigidas detectadas; `git diff --check` limpo.
- **Continua pendente:** OpenRouter Adapter real, cofre produtivo de fingerprint, contrato de asset e publicação; nenhum projeto remoto, deploy, push, chave real ou chamada de provider.

## Contract Registry Release 2.18 — CR-028 — 29/09/2026 (histórica; substituída pela 2.19)

- **Aprovação e aplicação local (29/09/2026):** proprietário: CR-028 integral e decisões D-14, D-15, D-16, D-17 e D-18, somente para implementação local. CR-028 em `approved_and_applied`; a Release 2.18 está `active`.
- **Commit (30/09/2026):** `fe058f3fad7621a9431943f5e7d9d1727d08d92b` (`feat(security): harden production readiness`), seletivo, 21 arquivos; sem PR ou publicação de aplicação (publicado depois em `origin/main`).
- **Manifest:** `contract-registry-manifest-v2.18.json`, SHA-256 `2fca9e53d241430005cf5091fd98be063d5de4e98031d84701ec3dfab3bcd7b2`, aggregate digest `fbfbb06a65a8915ac64e184eb47ff6b604359076e4a2e6a978c4fffd34d04a01`; 440 artefatos: 420 herdados da 2.17, 6 modificados e 14 adicionados pelo CR-028, 0 não classificados. Mudança lógica sobre a 2.17, sem alteração de registries ou schemas. Relatório de cross-validation v2.18: 78/78, SHA-256 `686ee7e880f33646fda1e447b732927ad6b02191c7a76b8d3dab4bb9e68914eb`.
- **Banco (local):** 15 migrations; a 000015 (SHA-256 `0884972aa649dc6629cb3538b5f1203c0d5ab3aa67cf87ec805a0eed3e8cc342`) troca `pg_trigger_depth()` pela regra uniforme de existência do tenant nas guardas de Owner e do Ledger (D-18); migrations 000001–000014 inalteradas.
- **Configuração:** `local`/`ci` só aceitam endpoints locais; `OPLYRA_ALLOW_REMOTE` removida (presença impede a inicialização); parsing estrito de URLs (protocolo, userinfo, query, fragmento, path, percent-encoding); issuer e JWKS derivados da `SUPABASE_URL` e overrides só se idênticos ao canônico; produção exige `SUPABASE_PROJECT_REF`, `OPLYRA_ENVIRONMENT_FINGERPRINT` e `TrustedDeploymentContext` de uma política do composition root.
- **Produção bloqueada por desenho:** a allowlist de provedores de evidência de deployment está vazia, então o runtime `production` não sobe até haver destino web/worker aprovado e seu adapter.
- **Gate integral (30/09/2026):** 716 Vitest (43 arquivos), 240 pgTAP, 16 Playwright, secret scan e build; 211 testes de contrato; cross-validation 78/78; 34 mutações dirigidas do CR-028 detectadas.
- **Efeitos externos:** nenhum projeto Supabase remoto criado, nenhuma migration remota aplicada, nenhum PR, deploy, chave real ou chamada externa (o push posterior atualizou só o repositório GitHub).
- **Reconciliação documental:** adiada nesta release por causa do worktree misto e **resolvida pelo CR-029 (Release 2.19, 30/09/2026)**.

## Contract Registry Release 2.19 — CR-029 — 30/09/2026 (histórica; substituída pela 2.20 e pela 2.21; commit `38ec4af36b704d8c3aa49efc89a6393e5ddb5e42`)

- **Aprovação e aplicação local:** proprietário, 30/09/2026, com decisões: governança opção B (PREPARACAO-I01 e VERIFICACOES seguem documentos operacionais fora do manifest), hunks H16-1, HP-1, HV-1 e HV-6 aprovados sem alteração, estados do HV-2 atualizados só onde contraditos por CR-026/027/028, contagens voláteis substituídas por ponteiro a este arquivo, TST-19 reescrito, DEVELOPMENT-TOOLS adiado. CR-029 em `approved_and_applied`. Commitada em `38ec4af` (publicada depois em `origin/main`).
- **Manifest:** `contract-registry-manifest-v2.19.json`, SHA-256 `fb509e10f1561f0ffbcae277bc9b14281b0a72d794f377e7c4f5050404b67858`, aggregate digest `a15b086e9c6fb2209a8a950e94974a00a76ae67980effab6b4d34ae478660c38`, relatório de cross-validation v2.19 (80/80) SHA-256 `495550e1fd6bb39a4e9dfc834d3eb777ef4c272054d6e9ece777316e19510c34`. 444 artefatos: 436 herdados da 2.18, 4 modificados e 4 adicionados pelo CR-029, 0 não classificados. Base lógica: Release 2.18 (manifest `2fca9e53…cc7b2` preservado); registries, schemas, fixtures, código e migrations intactos.
- **No manifest:** modificados `16-environments-release.md`, `PREPARACAO-SUPABASE-PRODUCAO.md` (só o parágrafo que anunciava a reconciliação adiada, agora registro de conclusão; categoria `environment_plan` herdada), `cross-registry-validation.ts` e o teste da 2.18; adicionados `15-test-plan.md` (`contract_documentation`), o CR-029, o relatório v2.19 e o teste da 2.19.
- **Fora do digest (documentos operacionais):** `PREPARACAO-I01.md` (item 2 e A14 marcados como superados pelo CR-028, aceite histórico preservado), `VERIFICACOES.md` (estados e ponteiro a este arquivo) e este `ESTADO.md`. `DEVELOPMENT-TOOLS.md` permanece adiado e intocado; sua frase sobre host remoto "sem autorização explícita" é pendência documental.
- **Testes:** o teste da 2.18 valida o manifest congelado (SHA-256, digest, classificação e cadeia para a 2.17), sem Git nem worktree; o da 2.19 valida os documentos reconciliados atuais. 8 mutações dirigidas detectadas (inclui a reintrodução de "Reconciliação documental adiada" em `PREPARACAO-SUPABASE-PRODUCAO.md`).
- **Gate integral:** 736 Vitest (44 arquivos), 240 pgTAP, 16 Playwright, secret scan e build; 231 testes de contrato; cross-validation 80/80; `pnpm test:harness` 4/4.
- **Efeitos externos:** nenhum PR, deploy, projeto Supabase remoto, migration remota, chave real ou chamada externa (o push posterior atualizou só o repositório GitHub).
- **Pendência operacional separada (registro histórico):** `DEVELOPMENT-TOOLS.md` ficou adiado e fora da release; foi tratado pelo CR-031 (Release 2.21).

## Contract Registry Release 2.20 — CR-030 — 30/09/2026 (histórica; substituída pela 2.21)

- **Aprovação e aplicação local:** proprietário, 30/09/2026: escopo de 20 arquivos, os 63 hunks preexistentes, as correções N-1 a N-7, `ATUALIZACOES` e doc 13. CR-030 em `approved_and_applied`.
- **Commit:** `e1aa0793a91c8fe340a2f662a606e1489f6c9779` (`docs(contracts): reconcile product AI baseline`), 26 arquivos (publicado depois em `origin/main`).
- **Conteúdo:** documentação de decisões e de produto alinhada ao estado aplicado pelos CR-026 e CR-027: Product AI Model Harness (slice 1) e Cost Ledger persistente **somente locais**; OpenRouter gateway inicial, **não exclusivo**; modelos e parâmetros condicionados ao EXP-05; Product Agent Runtime, filas/scheduler de produto, Stripe, adapters reais e produção pendentes ou não autorizados. Sem mudança de código, migrations, registries, schemas ou comportamento.
- **Manifest:** `contract-registry-manifest-v2.20.json`, SHA-256 `04933b7deded99000ce2f9dcae926fa50608650123dcfbe3ba4f44d1414b28c6`, aggregate digest `60344effb0632b78b777500b8faacfcbf332ae3a3ebfccbcf59a564f2ebc8d61`, relatório (82/82) `28399aba1930e2c4ecbda949b4410d8a06bd2afc55aaec0e72e15b26d987b34a`; 464 artefatos: 439 herdados, 5 modificados, 20 adicionados, 0 não classificados.
- **Gate integral (30/09/2026):** 758 Vitest (45 arquivos), 240 pgTAP, 16 Playwright, secret scan e build; 253 testes de contrato; 20 mutações documentais detectadas.

## Contract Registry Release 2.21 — CR-031 — 30/09/2026

- **Aprovação e aplicação local:** proprietário, 30/09/2026. CR-031 em `approved_and_applied`; Release 2.21 `active` e vigente. Correções de auditoria de segurança incorporadas ao CR no mesmo dia, sem novo CR: versão instalada do Claude Code vinculada à evidência de `dontAsk` (sem prova vigente: `manual`), leituras (`Read`, `Glob`, `Grep` e utilitários Bash) restritas ao repositório e Context7 negado em sessão autônoma.
- **Commit:** `d73d817159177fd0bc31e0b1502578fc1262384a` (`feat(tooling): add secure developer harness`), 30 arquivos (publicado depois em `origin/main`; `main` sincronizada em `fd19716`).
- **Manifest:** `contract-registry-manifest-v2.21.json`, SHA-256 `e83544f159f15dfd3d48b406ede0b91e3d4617f9c550866082cd11666619330f`; aggregate digest `306cfd3b48b8fe2d2943499a43205d9606517d523ca1020cf4072b101c7d7bb2`; relatório de cross-validation v2.21 (86/86) SHA-256 `8d049bc23a262bd9228d94798f469d206d1ee95eac002dfd7fd925c9cfc57408`. **487 artefatos: 458 herdados, 6 modificados, 23 adicionados, 0 não classificados.** Manifest 2.20 preservado.
- **Developer Harness:** projeto isolado `tools/developer-harness/` (`package.json`, `pnpm-workspace.yaml` só com `allowBuilds` do Claude Code, `pnpm-lock.yaml` próprio), fora do workspace e do lock do produto; lock e workspace da raiz voltaram ao conteúdo governado da 2.20/HEAD. CI instala o produto sem o tooling, falha se o projeto isolado existir no install e roda `pnpm test:harness`. Guard endurecido (política `autonomous`/`maintenance`, allowlist fechada, códigos de recusa fixos), launcher oficial, sonda offline de permission mode, `.claude/settings.json` e `.mcp.json` invocando o projeto por diretório.
- **Permission mode:** Claude Code `2.1.284`; `dontAsk` somente após P1–P6 (sonda offline em sandbox sem rede exceto loopback, stub local, sem chave nem serviço real); `pnpm claude:maintenance` sempre `manual`. Context7 negado em sessões autônomas e permitido somente em manutenção manual.
- **Testes de integração:** fixtures de `available_at` determinísticas nos dois testes do dispatcher e regressões T2–T4 (relógio, fuso, ordenação); sem mudança funcional do dispatcher.
- **Gate integral:** ver a evidência acima (810 Vitest em 50 arquivos, 240 pgTAP, 16 Playwright, secret scan e build; 275 testes de contrato; cross-validation 86/86; `pnpm test:harness` 53/53).
- **Efeitos externos:** nenhuma chave, conta, chamada paga, adapter real ou produção habilitados; nenhum serviço do produto, modelo, Context7, WebFetch ou WebSearch usado; acesso ao registry de pacotes limitado ao install isolado e aos testes de exceção (CR-031).
- **Limitações:** o guard é defesa em profundidade, não sandbox, e `claude` direto fica fora das garantias; a prova de `dontAsk` é específica da versão 2.1.284 e da plataforma macOS e precisa ser refeita a cada atualização do CLI; Git mutável permanece com o proprietário.

## Pendências e próximo passo

1. **DP-02b2 (Turborepo):** avaliada no [CR-032 §15](../product/marketing-ops/contracts/changes/CR-032-developer-harness-git-lifecycle.md) (aprovado como política). Não há medição de duração dos gates no repositório; recomendação: **não adotar agora** e manter como decisão separada e adiada, com protocolo de medição a cargo do proprietário. Nada foi instalado nem configurado.
2. **Atualizado em 30/09:** Releases 2.16 a 2.21 commitadas localmente (2.17 em `8063131`, Cost Ledger persistente local do CR-027; 2.18 em `fe058f3`, CR-028; 2.19 em `38ec4af`, CR-029; 2.20 em `e1aa079`, CR-030; 2.21 em `d73d817`, CR-031); `main` **sincronizada com `origin/main` em `fd19716`**, sete commits publicados (branches, PRs e novos pushes dependem de autorização do proprietário). Continuam sem autorização: filas/runtime, OpenRouter Adapter real, Stripe em teste, cofre produtivo de chaves de fingerprint, contrato de asset e publicação. A publicação depende de resolver os bloqueios e as decisões de [PREPARACAO-SUPABASE-PRODUCAO](PREPARACAO-SUPABASE-PRODUCAO.md) e de autorizações separadas para criar o projeto e para aplicar migrations.
3. Pendências econômicas e comerciais: medidores e período, quinta ocorrência semanal, COGS e rateio, limites por workflow, cobrança de pilotos. Cada uma bloqueia a capacidade correspondente, não o trabalho local.
4. Pendências criadas pelo escopo de vídeo: provedor de análise multimodal, medidor e franquia, custo por ativo, limites de formato e retenção dos derivados.
5. Inspecionar os nodes do Figma quando houver acesso e registrar medidas reais, substituindo as propostas.
6. Próximo incremento recomendado do harness: a política de branch/PR/review/merge e recuperação e os hard blockers executáveis estão definidos no [CR-032](../product/marketing-ops/contracts/changes/CR-032-developer-harness-git-lifecycle.md) (`approved`, **ainda não aplicado**: política e decisões D-1 a D-10 aprovadas pelo proprietário em 30/09/2026; D-4: a atestação do proprietário não é revisão independente e o **HB-13 não está atendido**). **Nenhum slice (S1–S7) está implementado nem autorizado**: cada um exige autorização individual, e o S1 será o próximo mediante a sua; `AUTONOMOUS-BUILD.md` permanece `draft` com `executionEnabled: false`.
7. **Atualizado em 29/09:** o Change Proposal do harness foi emitido como CR-026 (`proposed`) e o slice 1 começou pelo Test Adapter. Texto original: preparar o Change Proposal controlado do Product AI Model Harness no I-02, incluindo Model Registry, Profiles por `agent + action`, Router, Provider Ports, Test Adapter, OpenRouter Adapter inicial, Eval Engine e Cost Ledger. A implementação começa pelo Test Adapter; ativação do adapter real exige conta, chave, budget e autorização próprios. Qualquer impacto no registry frozen passa por Change Request.

8. **Resolvido em 29/09:** a divergência entre o SHA-256 da referência protegida (`59a2b949…9c78bfc`) e o valor antigo `79a25138…` foi resolvida pelo usuário, que confirmou a v2.3 de 16/09/2026 como referência vigente (ver Situação atual). O arquivo protegido não foi alterado.

## Modelo para próxima atualização

```text
Etapa e status:
Objetivo e escopo autorizado:
Arquivos/versão de referência:
Entregas concluídas:
Verificações: resultado, evidência e limitações
Trabalho parcial e efeitos já executados:
Bloqueios ou decisões pendentes:
Aprovação: referência, escopo e versão, se houver
Próxima ação autorizada:
```
