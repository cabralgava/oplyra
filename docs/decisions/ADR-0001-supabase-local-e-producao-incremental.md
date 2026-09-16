# ADR-0001 — Supabase como backend, local via Docker e produção incremental

**Status:** aprovada (diretriz do projeto)

## Contexto e problema

A Oplyra precisa de persistência, autenticação e armazenamento desde a fundação, com isolamento entre empresas, e de um fluxo de publicação que não espere o MVP completo.

## Alternativas consideradas

Não reabertas neste discovery: a escolha é diretriz explícita do projeto. Registram-se apenas as alternativas vetadas: SQLite, Firebase, mocks como persistência definitiva, backend provisório com migração posterior e projeto remoto como fallback do desenvolvimento.

## Decisão e consequências

- Supabase (PostgreSQL, Auth e Storage) é o backend obrigatório.
- Desenvolvimento e validação com **Supabase local via Docker**, com instância própria da Oplyra.
- Cada incremento aprovado é publicado em **projeto Supabase de produção separado**; os próximos seguem sendo desenvolvidos localmente.
- Consequências:
  - componentes que o Supabase não publica (web, worker, configurações de Auth não transportáveis) precisam de destinos próprios ([ADR-0005](ADR-0005-destinos-de-publicacao.md));
  - não há ambiente remoto de homologação (DP-28);
  - Edge Functions não servem como runtime principal de agentes, por limites de tempo (FX-01).

## Escopo afetado

Toda a plataforma.

## Evidências e referências

[CLAUDE.md](../../CLAUDE.md), [README.md](../../README.md), [PUBLICACAO.md](../harness/PUBLICACAO.md), [02-discovery](../product/marketing-ops/02-discovery.md) §9.

## Responsável pela decisão

Responsável pelo projeto Oplyra (usuário).

## Aprovação

- Diretriz registrada em CLAUDE.md e README.
- Reiterada na solicitação da Fase 0 de 11/09/2026.
- **Não autoriza** configurar instâncias, criar migrations ou publicar: essas ações dependem da aprovação do discovery e de cada incremento.

## Substitui / é substituída por

—
