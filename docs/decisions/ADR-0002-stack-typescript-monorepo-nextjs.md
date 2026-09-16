# ADR-0002 — Stack complementar: TypeScript, monorepo e Next.js

**Status:** proposta — não aprovada (DP-02a/b/c/e, DP-13, DP-14). DP-02d condicionada ao EXP-01.

## Contexto e problema

É preciso escolher linguagem, organização do repositório, framework web e ferramentas de teste complementares ao Supabase.

**DDD e Clean Architecture não exigem monorepo.** A necessidade que motiva a proposta é concreta: o mesmo código de domínio, casos de uso e contratos deve ser usado por três processos implantáveis — `web` (UI, BFF e API pública), `worker` (filas, scheduler, agentes) e `ops-cli` (operações de plataforma) — e por pacotes de apoio (`contracts`, `agents`, `ui`, `testing`).

## Alternativas consideradas

| Alternativa | Avaliação |
| --- | --- |
| Repositórios separados por processo, com pacotes publicados em registry | Versionamento e publicação de pacotes internos a cada mudança de contrato; risco de web e worker rodarem versões diferentes do domínio |
| Um único pacote sem workspaces, com três pontos de entrada | Simples, mas mistura dependências de UI no worker e dificulta lint de fronteiras e builds independentes |
| **pnpm workspaces sem Turborepo** | Atende ao compartilhamento; build, teste e lint de dependentes exigem scripts próprios e sem cache. **Alternativa viável** se o Turborepo não trouxer ganho medido |
| **pnpm workspaces + Turborepo** | Grafo de tarefas por dependência (ex.: alterar `core` reexecuta testes de `web` e `worker`), execução só dos afetados no CI e cache de resultados |
| Nx | Recursos semelhantes, com mais convenções e peso |
| Python no worker + TypeScript na web | Duas linguagens; domínio e contratos duplicados |
| SPA (Vite) + API separada | Mais um deploy no MVP; segue viável se o Next.js se mostrar limitante |
| ORM com schema-como-código (Drizzle/Prisma) | Compete com as migrations SQL da Supabase CLI como fonte de verdade |

## Decisão proposta e consequências

- **TypeScript estrito em Node.js LTS** para web, worker e CLI: um idioma para domínio, contratos e adapters.
- **pnpm workspaces**, necessários para compartilhar `core`, `contracts` e `agents` entre os três processos, com uma única versão do domínio por commit.
- **Turborepo** para orquestrar tarefas dependentes e executar apenas o que foi afetado no CI. **Justificativa:** mudanças em `core` ou `contracts` precisam revalidar web, worker e CLI juntos. É reversível a baixo custo: se no I-01 não houver ganho mensurável de tempo ou confiabilidade no CI, usar apenas scripts de workspace.
- **Next.js (App Router)** como mecanismo de entrega: route handlers e server actions são só controllers; casos de uso ficam em `packages/core`.
- **Kysely** como SQL tipado, **condicionado ao EXP-01** (DP-02d/DP-03b).
- **Vitest, pgTAP, Playwright** e lint de fronteiras.
- **Identificadores em inglês** com glossário PT↔EN (DP-13).
- **Repositório:** o diretório atual **não é** repositório Git (verificado em 11/09/2026). Recomenda-se iniciar Git local no I-01 (DP-14a) e hospedar em GitHub privado com GitHub Actions somente com autorização (DP-14b).
- Versões serão fixadas e registradas no I-01.

## Escopo afetado

Organização do código, CI, todos os incrementos.

## Evidências e referências

[04-architecture](../product/marketing-ops/04-architecture.md) §12; skill `clean-architecture-arquiteto` (princípios de componentes), aplicada conforme [SKILLS-COMPATIBILIDADE](../harness/SKILLS-COMPATIBILIDADE.md).

## Responsável pela decisão

Responsável pelo projeto (pendente).

## Aprovação

Pendente.

## Substitui / é substituída por

—
