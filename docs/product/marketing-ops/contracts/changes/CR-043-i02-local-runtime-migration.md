# CR-043 — I-02: migration local do Product Agent Runtime

**Status:** `approved` — **somente local**, como protótipo em desenvolvimento; não é aprovação arquitetural definitiva ou produtiva
**Classificação:** `additive_local_database_extension`
**Data:** 2026-11-11
**Autoridade e limite:** mandato explícito do proprietário de 11/11/2026 para desenvolvimento contínuo local com Claude, inclusive após o I-04, solicitando autorização antes de publicar em produção. Esta reconciliação aplica o mandato ao protótipo local e ao inventário de migrations; não representa revisão humana destes bytes, escolha definitiva de runtime ou autorização produtiva. A ADR-0006 e as lacunas contratuais abaixo permanecem inalteradas. O agente de implementação não ampliou sua própria allowlist; a atualização foi feita na revisão de manutenção.
**Proposto originalmente por:** Claude; revisão de governança local por Codex em 11/11/2026.
**Migration:** `supabase/migrations/20261111000018_runtime.sql`
**Migration SHA-256:** `583533d6e3a036cf4cda991a13509bb1ac943e657cbe1b2ec1beb90fbb65f2a8`
**Release produtiva/Freeze:** não emitidos.

## Escopo técnico

Schema privado `runtime` com três tabelas (`agent_runs`, `run_steps`, `kill_switches`), permissões RBAC locais `runtime.read`/`runtime.operate`, RLS habilitada e forçada, e quatorze funções de fronteira `app.runtime_*` (SECURITY DEFINER). **Nenhum papel tem privilégio de tabela**; pessoa e worker só chamam as funções, que identificam o chamador pelo papel da transação (`authenticated` ou `oplyra_worker_exec`), exigem o tenant ativo e recusam o restante (o dono do banco fora de papel também é recusado). Funções de uso exclusivo do worker (claim, heartbeat, passos, settle) não são executáveis por pessoa; cancelar e acionar a interrupção são decisões humanas e o worker não as executa.

Invariantes no banco (defesa em profundidade; o domínio em `packages/core/src/runtime` é a fonte): lease + fencing token por tentativa (tentativa/token obsoletos rejeitados), idempotência por (empresa, chave), checkpoint atômico com o uso (repetição não duplica), limites obrigatórios e maiores que zero, execução encerrada imutável, identidade e limites imutáveis, uso que não retrocede, interrupção global escrita apenas pelo operador da plataforma e prevalecendo sobre a da empresa.

## O que este CR NÃO faz

- Não cria, renomeia ou altera action, tool, event, error, permission ou agent dos registries congelados; os códigos `RUN_*`, `EFFECT_UNCERTAIN` e `RETRY_ATTEMPTS_EXHAUSTED` usados são **locais** (o último já existe no Error Registry 1.3; os demais não). Seu registro canônico exige evolução contratual própria.
- Não emite o evento `runtime.dead_lettered` (contrato de dead-letter do outbox): a emissão atômica, o publicador e o consumidor do Orquestrador seguem como lacunas declaradas naquele contrato.
- Não adota `pgmq`/`pg_cron` (aprovados só para o desenho no EXP-02/ADR-0004): a fila é tabela própria com `FOR UPDATE SKIP LOCKED`.
- Não aprova o runtime próprio do ADR-0006, que permanece **proposta não aprovada**.
- Não cria entrada de pacote (`@oplyra/core/runtime`, `@oplyra/infra/runtime`): depende de evolução governada dos `package.json`.

## Evidência executada (local, ver ESTADO)

pgTAP `supabase/tests/runtime.test.sql` (dois tenants, papéis reais) e teste de integração com Supabase local e concorrência real. Mutações no SQL (token ignorado e tenant não comparado) foram detectadas. Não substitui revisão independente do SQL.

## Produção

Nenhum deploy, migration remota, SQL remoto ou acesso ao projeto `hysigyhfpyyydycxxpsm` é autorizado ou solicitado por este documento.

## Vinculação e compatibilidade local

O perfil corrente reconhece apenas o conjunto explícito de migrations e exige o hash acima, o status e o escopo local desta decisão. Alterações posteriores nos bytes exigem nova revisão do vínculo. Uma migration extra, retirada desta autorização ou modificação não reconhecida continua falhando no gate. Validador histórico 2.22, Freeze, manifests, schemas, registries e migrations 000001–000017 são preservados.

O inventário não congelado 2.23 recebe migration, pgTAP, CR e ajustes do validador apenas como preparação. Nenhuma receita/release é emitida nem a composição final da release é declarada aprovada. A aprovação local não promove os códigos de erro locais, a política provisória de retentativas, o teto de autonomia ou a fila própria a contratos canônicos.

## Pendências de aceite

O I-02 continua parcial: modelo contra PersistentCostLedger e Test Adapter locais, scheduler, tela de execuções, Context Assembly (19), carga H-12, adapters reais e Stripe em teste, além de fonte de entitlement e motor de política para qualquer autonomia superior ao teto local. Testes de integração e de concorrência do núcleo não comprovam essas capacidades. E2E anterior ao runtime permanece evidência histórica até ser reexecutado.

O achado histórico de UPDATE entre empresas do I-04 permanece aberto e não é encerrado por esta regularização. Resultados da revisão e testes realmente executados são registrados em `docs/harness/ESTADO.md`, sem substituí-los por esta decisão.
