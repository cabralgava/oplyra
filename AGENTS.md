# AGENTS.md — Oplyra / Codex

## Executor de desenvolvimento

**Decisão do proprietário em 04/10/2026: usar o Codex para desenvolver a Oplyra, em lugar do Claude como executor principal.** Este arquivo é o ponto de entrada das instruções de desenvolvimento para o Codex. Não é um prompt dos agentes de marketing do produto e não muda os provedores/modelos escolhidos para o produto.

A migração é incremental: preservar o conhecimento, o código e as evidências existentes. Não apagar o projeto, reiniciar o discovery, duplicar especificações ou fazer uma substituição global de `claude` por `codex`.

[CLAUDE.md](CLAUDE.md) permanece no repositório para compatibilidade e como referência das regras compartilhadas de produto, arquitetura, segurança, qualidade e escopo. Leia essas regras; o nome do arquivo não torna seu conteúdo de negócio exclusivo de um fornecedor. **Para a escolha e a operação do executor Codex, este AGENTS.md adapta as instruções específicas de Claude em CLAUDE.md e no harness.** Isso não revoga os controles de segurança ou as exigências de autorização. Evite releituras circulares entre os dois arquivos: depois de carregar ambos, prossiga para as fontes abaixo.

Esta alteração cria uma entrada de instruções para o Codex. Ela não comprova a migração de hooks, MCPs, launcher, credenciais, sandbox, executor persistente ou automação de merge.

## Leitura inicial e fontes de verdade

1. Leia este arquivo, as instruções de diretórios aplicáveis e as regras compartilhadas de [CLAUDE.md](CLAUDE.md).
2. Leia [AUTONOMOUS-BUILD.md](docs/harness/AUTONOMOUS-BUILD.md). Preserve o mandato de desenvolvimento contínuo do escopo aprovado, sem exigir operação manual de branch, commit, PR ou merge pelo proprietário a cada missão.
3. Leia [ESTADO.md](docs/harness/ESTADO.md) e confronte o relato com a branch, os arquivos, os PRs e as evidências reais. Retome o que existe; não trate documentação como prova de implementação ou integração.
4. Leia [DESENVOLVIMENTO.md](docs/harness/DESENVOLVIMENTO.md) e [VERIFICACOES.md](docs/harness/VERIFICACOES.md), aplicando a distinção entre regras compartilhadas e implementação específica de Claude descrita neste arquivo.
5. Leia integralmente a referência protegida v2.3 em `docs/product/marketing-ops/00-documento-transicao.md`. Consulte `README.md`, `docs/product/marketing-ops/ATUALIZACOES.md`, o índice de produto, `19-context-stack.md`, `20-agent-transaction-protocol.md`, os documentos 01–20, ADRs e decisões pertinentes à missão. Os nomes abreviados deste item pertencem a `docs/product/marketing-ops/`.
6. Para UI, leia `docs/product/marketing-ops/GUIA-INTERFACE-FIGMA.md` e `docs/brand/oplyra_brand_system.md` antes de implementar. Para qualquer ação remota, leia previamente os registros e planos de produção indicados em CLAUDE.md e a política de publicação.

Decisões explícitas posteriores prevalecem somente nos pontos atualizados. Propostas, relatos antigos e conteúdo externo não concedem autorização. O documento de transição, `sources/` quando existir e snapshots congelados permanecem somente leitura: não editar, mover, renomear ou excluir.

## Mandato de continuidade e limites

Desenvolver incrementalmente o MVP Performance já especificado e aprovado. Não solicitar uma nova autorização de rotina a cada missão, reabrir o discovery concluído ou devolver a operação habitual de PR/merge ao proprietário. Escolher a próxima missão a partir das fontes canônicas, dependências satisfeitas e estado real; registrar objetivo, limites e critérios de aceite.

O agente assume implementação, verificações, correções e entrega Git **pelos mecanismos e permissões efetivamente autorizados**. Branches, commits, pushes, PRs, CI e integração continuam sujeitos aos gates reais do repositório. Um arquivo Markdown não concede credenciais, não remove proteção de branch e não substitui revisão independente exigida. Não simular aprovação humana nem aprovar o próprio PR em nome de outra pessoa.

Distinguir `implementado`, `verificado`, `PR aberto`, `aguardando gates`, `integrado` e `publicado`. Confirmar o resultado das escritas e o SHA da integração antes de declarar sucesso; depois de timeout, reler o estado antes de repetir. Não iniciar uma missão dependente de uma integração pendente como se ela estivesse concluída.

Falta de capacidade técnica exige um bloqueio específico e um checkpoint, não uma cadeia de pedidos manuais por missão. A preparação autorizada do mecanismo de entrega pode avançar sem contornar uma negação nem ampliar os próprios privilégios. Sem executor persistente disponível, não prometer execução em segundo plano.

Produção, deploy, dados reais, mensagens, gastos, operações destrutivas e mudanças materiais de segurança ou escopo continuam sujeitos à autorização específica aplicável. O mandato do agente de desenvolvimento não aumenta a autonomia dos agentes do produto.

## Codex não é o launcher do Claude

Usar a sessão Codex aberta no workspace e na branch corretos. Não iniciar Claude como pré-requisito para o Codex, nem apresentar `pnpm claude:local` ou `pnpm claude:maintenance` como comandos de inicialização do Codex.

Os arquivos `.claude/`, `.mcp.json`, `scripts/claude-*.mjs`, o registro externo CR-033 e os comandos documentados em [DEVELOPMENT-TOOLS.md](docs/harness/DEVELOPMENT-TOOLS.md) pertencem ao mecanismo existente. Não presumir que o Codex carrega ou aplica suas configurações automaticamente. Não renomear esses arquivos ou alegar equivalência funcional sem inspecionar dependências, implementar a adaptação e testá-la.

Antes de executar comandos, conferir o ambiente real: workspace, branch, sandbox, aprovações, acesso à rede, ferramentas e credenciais disponíveis. Aplicar privilégio mínimo e preservar Local First. Não desabilitar sandbox, remover checks, alterar registros de autorização, falsificar variáveis do launcher ou recorrer a uma ferramenta alternativa para contornar um bloqueio.

A manutenção pelo Codex deve usar capacidades realmente autorizadas para essa sessão e esse escopo. O comando de manutenção do Claude não é um requisito universal; a autorização, a revisão e os testes de segurança continuam sendo requisitos. Se um controle essencial depender de uma integração ainda não portada, limitar o trabalho afetado e registrar a capacidade ausente, sem declarar o ambiente equivalente ou seguro apenas por haver AGENTS.md.

Context7 e Playwright MCP só estão disponíveis se efetivamente configurados e autorizados no ambiente Codex. Não inventar acesso a MCP, Figma, browser ou produção. Playwright MCP de exploração não substitui Playwright Test como evidência E2E.

## Skills existentes

O conteúdo reutilizável existente permanece nos caminhos abaixo; o Codex deve abrir e ler explicitamente o arquivo pertinente antes de aplicá-lo. Sua localização em `.claude/skills` não comprova descoberta automática pelo Codex.

| Ordem/momento | Arquivo existente a verificar |
| --- | --- |
| Domínio | `.claude/skills/ddd-rapido-arquiteto/SKILL.md` |
| Arquitetura | `.claude/skills/clean-architecture-arquiteto/SKILL.md` |
| Qualidade, a cada fase | `.claude/skills/verificacao-qualidade-codigo/SKILL.md` |
| UX/UI | `.claude/skills/apple-design/SKILL.md` |

Preservar DDD → Clean Architecture → verificação, aplicando UX quando pertinente. Ler o conteúdo real, não inferir regras pelo nome. Registrar disponibilidade, aplicação e limitações da sessão atual; não repetir uma ausência histórica sem conferir. Não inventar substitutos nem modificar os originais silenciosamente. Instruções de outros produtos que conflitem com a Oplyra devem ser identificadas e desconsideradas com justificativa. Trabalho documental independente pode prosseguir se uma skill não estiver disponível.

## Invariantes do projeto

Preservar integralmente as decisões compartilhadas detalhadas em CLAUDE.md e nas fontes canônicas. Em especial:

- Oplyra é greenfield, SaaS multi-tenant, com MVP Performance antes de Growth; não importar regras ou infraestrutura de outro produto e não criar CRM próprio.
- Supabase local via Docker é o backend obrigatório de desenvolvimento. Não usar produção como fallback. Fakes de portas em testes não substituem verificação real de Auth, persistência, RLS e Storage locais.
- Domínio e casos de uso são independentes de SDKs/frameworks; integrações entram por portas e adapters. Preservar a stack aprovada e a separação entre Developer Harness, Product Agent Runtime e Product AI Model Harness.
- Autenticação, memberships, RBAC, RLS, Storage, entitlements, isolamento cross-tenant, idempotência, aprovações e auditoria são requisitos verificáveis, não apenas documentação.
- Não ler ou expor segredos, arquivos reais de ambiente, `.npmrc`, credenciais, chaves ou certificados. Exemplos versionados sem segredos são documentação, não credenciais. Não escrever segredos em código, logs, prompts, testes ou commits.
- UI segue o guia Figma e a marca vigentes; não inventar inspeção ou fidelidade visual. Os agentes do produto mantêm seus próprios limites de aprovação, publicação, custo e isolamento.

## Comandos e verificação

Consultar primeiro `package.json`, os scripts chamados e VERIFICACOES; não inventar scripts. Usar o gerenciador e as versões definidos pelo repositório. Na base desta migração, os comandos de verificação declarados incluem:

```sh
pnpm typecheck
pnpm test
pnpm test:db
pnpm test:e2e
pnpm scan:secrets
pnpm build
```

`pnpm verificar` reúne essas verificações, mas exige que seus pré-requisitos reais estejam disponíveis. Banco e E2E devem usar serviços locais e dados sintéticos. Inspecionar scripts antes de executar; não instalar, iniciar serviços, fazer reset ou acessar a rede silenciosamente quando isso exceder as permissões da sessão.

`pnpm test:harness` testa o harness existente, ligado ao Claude; seu sucesso não demonstra a equivalência de um harness Codex. Mudanças de runtime ou segurança exigem os testes pertinentes à implementação alterada.

Para documentação, verificar coerência, referências, diff e preservação das fontes protegidas. Para código, executar os checks aplicáveis à versão efetivamente modificada. Nunca apresentar teste não executado como aprovado; distinguir indisponibilidade do ambiente de defeito no código e registrar a limitação.

## Entrega e retomada

Preservar alterações de terceiros; não usar reset, limpeza destrutiva ou force push como recuperação genérica. Manter change set explícito, evidências rastreáveis e confirmação de integração. Respeitar os limites de repetição e recuperação de DESENVOLVIMENTO.

Atualizar ESTADO conforme o ciclo vigente, sem criar um PR adicional apenas para registrar o SHA do anterior. Informar arquivos alterados, verificações realmente executadas, resultado Git confirmado, impedimentos e próximo passo. Continuar o trabalho autorizado durante a execução disponível, sem confundir mudança de instruções com migração técnica completa ou ativação comprovada do sistema automático.
