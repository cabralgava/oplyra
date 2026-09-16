# ADR-0003 — Tenancy com RLS e acesso a dados por conexão direta

**Status:** **aprovada em 15/09/2026 pelo resultado do EXP-01** (DP-03b). DP-02d fica viável, mas não foi comprovada pelo experimento.

## Contexto e problema

Dados de várias empresas convivem no mesmo projeto Supabase. O isolamento precisa valer:

- no backend;
- no banco (RLS);
- no Storage;
- em jobs e agentes.

Casos de uso precisam gravar agregado, outbox e auditoria **atomicamente**. Cada chamada do `supabase-js` via PostgREST é uma requisição separada, sem transação entre chamadas. Além disso, a Data API pode expor tabelas a quem tem a chave publicável.

**Declarar "claims + RLS" não comprova isolamento.** A proposta só pode ser adotada depois que o EXP-01 demonstrar os critérios abaixo.

## Alternativas consideradas

| Alternativa | Avaliação |
| --- | --- |
| Schema ou banco por empresa | Isolamento forte; operação, migrations e custo multiplicados; desproporcional ao MVP |
| Conexão com papel privilegiado e filtro por `tenant_id` no código | **Rejeitada**: um erro de consulta vaza dados, sem defesa no banco |
| PostgREST com JWT do usuário + funções SQL `SECURITY INVOKER` para gravações atômicas | RLS nativa e comprovada; parte da persistência vira funções SQL. **Alternativa se o EXP-01 falhar** |
| **Conexão direta com papéis restritos, papel de execução assumido na transação e claims verificadas gravadas com escopo de transação** | Transações atômicas na aplicação com RLS efetiva. **Proposta sob teste** |

## Proposta sob teste

Detalhes, cenários e critérios: [18-technical-experiments](../product/marketing-ops/18-technical-experiments.md) EXP-01.

1. **Modelo compartilhado:**
   - `tenant_id` obrigatório;
   - FKs compostas (`tenant_id`, `id`);
   - `tenant_id` imutável;
   - schemas de domínio fora da Data API.
2. **Papéis de login** (`oplyra_web_login`, `oplyra_worker_login`): `NOINHERIT`, `NOBYPASSRLS`, sem posse de tabelas e sem privilégios diretos. Consulta sem assumir papel de execução falha.
3. **Papéis de execução:**
   - `authenticated` para usuários;
   - `oplyra_worker_exec` para jobs;
   - ambos sem `BYPASSRLS`, com privilégios mínimos;
   - assumidos **só dentro da transação**.
4. **RLS habilitada e forçada** em todas as tabelas de empresa. Vínculo ativo e permissão consultados ao vivo.
5. **Claims:** derivadas de JWT validado no servidor com chaves assimétricas (JWKS) do projeto (`iss`, `aud`, `exp`, `sub`, assinatura). Gravadas com escopo de transação. Token não verificado nunca chega ao banco.
6. **Tenant ativo com escopo de transação, para usuário e para worker.** `app.tenant_id` é obrigatório nos dois caminhos: sem ele, nenhuma linha é visível. O tenant ativo faz parte do contexto de autorização e nunca vem do token.
7. **Forma única das políticas:** `tenant_id = current_tenant()` **e** autorização nesse tenant, com a verificação de vínculo avaliada uma vez por consulta, não por linha.
7. **Ponto único de acesso:** `withUserTransaction` e `withWorkerTransaction`, garantidos por teste de arquitetura.
8. **Conexões:**
   - web via pooler em modo transação, sem prepared statements;
   - worker via conexão direta (IPv6, ou add-on IPv4) ou pooler em modo sessão;
   - migrations com credencial própria.
9. **Operações privilegiadas:** catálogo fechado e auditado ([07](../product/marketing-ops/07-security-lgpd.md) §11.1).

## Critérios de aprovação (resumo)

- 100% dos cenários E1-01 a E1-11 conforme esperado: login sem papel, acesso cruzado, vínculo removido, empresa e claims forjadas, reutilização de conexão, worker sem empresa, Storage, Data API.
- 0 violações em 10.000 transações concorrentes, em 3 execuções.
- p95 do overhead de autorização ≤ 20 ms (local).
- Revisão de segurança do código de conexão.

## Resultado do EXP-01 (15/09/2026)

Executado em Supabase local próprio da Oplyra, PostgreSQL 17.6, dados sintéticos com duas empresas. Relatório e evidências em [`experiments/exp-01/RESULTADO.md`](../../experiments/exp-01/RESULTADO.md).

Todos os cenários E1-01 a E1-12 ficaram conforme o esperado. E1-07 acusou **zero violações em três rodadas de 10.000 transações concorrentes**; E1-12 mediu **1,12 ms** de overhead de autorização no p95, contra o teto de 20 ms.

A primeira versão do desenho **reprovou**, e as duas correções passaram a integrar a decisão:

1. Gravar apenas o `sub` deixava um usuário com vínculo em duas empresas enxergar as duas na mesma consulta — 80 violações em 200 transações. O tenant ativo passou a ter escopo de transação e as políticas exigem igualdade com ele.
2. A função de vínculo recebendo a coluna era avaliada por linha: 110 ms de overhead em 50 mil linhas. Com a igualdade indexável e a verificação como subconsulta única, caiu para 1,12 ms.

## Consequências

- Atomicidade na aplicação com RLS como defesa em profundidade; responsabilidade explícita pela infraestrutura de conexão.
- A alternativa PostgREST + funções `SECURITY INVOKER` fica arquivada, sem necessidade de adoção.
- **Pendência:** a revisão de segurança independente do código de conexão exigida pelo critério não foi realizada; a revisão disponível é a do próprio autor. Resolver antes de dados reais.

## Escopo afetado

Todas as tabelas de empresa, repositórios, worker, ingestão, Storage.

## Evidências e referências

FX-12 (conexões e pooler) e FX-13 (chaves de assinatura JWT) em [02-discovery](../product/marketing-ops/02-discovery.md) §9; [05-data-model](../product/marketing-ops/05-data-model.md); [07-security-lgpd](../product/marketing-ops/07-security-lgpd.md) §3–§6; [15-test-plan](../product/marketing-ops/15-test-plan.md) §3.

## Responsável pela decisão

Responsável pelo projeto (pendente).

## Aprovação

- DP-03a: concedida com a autorização do I-01; experimento executado em 15/09/2026.
- DP-03b: **aprovada pelo resultado**, com as duas correções acima incorporadas.
- DP-02d: Kysely permanece viável e não comprovado; adotar com a restrição de receber a transação do wrapper.
- Revisão de segurança independente: pendente.

## Substitui / é substituída por

—
