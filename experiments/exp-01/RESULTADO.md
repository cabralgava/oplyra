# EXP-01 — resultado

**Data:** 15/09/2026 · **Ambiente:** Supabase local da Oplyra, PostgreSQL 17.6, portas 544xx, dados sintéticos com duas empresas · **Veredito: aprovado, com uma ressalva.**

Especificação: [18 — EXP-01](../../docs/product/marketing-ops/18-technical-experiments.md). Evidências brutas em `evidencias/`.

## Cenários

| ID | Resultado |
| --- | --- |
| E1-01 | Consulta pelo papel de login, sem assumir papel de execução: negada (42501) |
| E1-02 | Matriz de acesso cruzado: leitura, escrita, update, delete, troca de `tenant_id` e FK cruzada — todas as operações indevidas negadas; caminho legítimo funciona |
| E1-03 | Vínculo revogado com sessão ainda válida: nenhuma linha, escrita negada |
| E1-04 | Empresa forjada no contexto: nenhuma linha. Usuário com duas empresas enxerga apenas a ativa |
| E1-05 | `sub` alterado, `alg: none`, chave estranha e token expirado: todos rejeitados na fronteira, sem tocar o banco |
| E1-06 | Reutilização de conexão após exceção: papel e claims vazios na transação seguinte; sem privilégio residual |
| E1-07 | **3 rodadas de 10.000 transações concorrentes** misturando cinco atores: **0 violações** (30,5 s, 30,5 s, 30,3 s) |
| E1-08 | Worker sem `app.tenant_id`: nenhuma linha visível, escrita negada |
| E1-09 | Worker da empresa A gravando linha de B: negado |
| E1-10 | Storage: A grava e lê o próprio prefixo; não grava no prefixo de B; B não lê arquivo de A |
| E1-11 | Data API com chave publicável: 404 na tabela de domínio; 406 com `Accept-Profile: exp01`, mesmo com sessão válida |
| E1-12 | p95 com RLS 8,46 ms contra 7,34 ms sem RLS: **overhead de 1,12 ms** (critério: ≤ 20 ms) |

## Duas falhas encontradas e corrigidas durante o experimento

A primeira versão do desenho reprovou. O registro fica porque o valor do experimento está nelas.

**1. Usuário com vínculo em duas empresas enxergava as duas ao mesmo tempo.** O wrapper gravava apenas o `sub`; a política perguntava "este usuário tem vínculo com o tenant *desta linha*?". O `tenantId` do `AccessContext` nunca chegava ao banco. Resultado: 80 violações em 200 transações. **Correção:** o tenant ativo passou a ter escopo de transação (`app.tenant_id`) e toda política exige `tenant_id = exp01.current_tenant()` **e** autorização nesse tenant. Consequência para o produto: o tenant ativo é parte do contexto de autorização, não um filtro de aplicação.

**2. Custo proibitivo da verificação de vínculo.** A função recebia a coluna `tenant_id` e era avaliada por linha: p95 de 116 ms contra 6,7 ms sem RLS, isto é, 110 ms de overhead em 50 mil linhas. **Correção:** a igualdade com o tenant ativo é indexável pela PK `(tenant_id, id)` e a verificação de vínculo virou `(select ...)`, avaliada uma vez por consulta. O overhead caiu para 1,12 ms — 98% menor.

Arquivo reprovado preservado em `evidencias/01-setup-v1-reprovado.sql`.

## Ressalva

A **revisão de segurança independente do código de conexão** exigida pelo critério não foi feita: a revisão disponível é a do próprio autor. Fica registrada como pendência antes de dados reais.

## Consequência para as decisões

- **DP-03b — aprovada pela evidência:** conexão direta com papéis restritos, papel de execução assumido na transação, claims e tenant ativo com escopo de transação, RLS habilitada e forçada. A alternativa PostgREST com `SECURITY INVOKER` fica arquivada, sem necessidade.
- **DP-02d — Kysely viável, não comprovado:** o experimento usou o driver `pg` diretamente. A estratégia de acesso está validada; o construtor de consultas tipado não foi testado por si. Adotar no I-01 com a restrição de que ele recebe a transação do wrapper e nunca abre conexão própria.
