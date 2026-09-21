# 18 — Experimentos técnicos condicionantes

> **Discovery v1.4 — execução parcial (21/09/2026).** Especifica os experimentos que condicionam as propostas técnicas DP-03, DP-04, DP-05/06, DP-07 e DP-09. **EXP-01 e EXP-02 foram aprovados com notas**; resultados em [`experiments/exp-01/RESULTADO.md`](../../../experiments/exp-01/RESULTADO.md) e [`experiments/exp-02/RESULTADO.md`](../../../experiments/exp-02/RESULTADO.md). **EXP-03 a EXP-05 continuam não executados** e exigem contas externas, recursos pagos ou gasto; só podem rodar com autorização específica.

## Regras comuns

- Executar em Supabase local via Docker, com dados sintéticos e pelo menos duas empresas, salvo quando o experimento declarar outro ambiente **autorizado**.
- Registrar para cada execução: versão ou commit, ambiente, comandos reais, parâmetros, resultados brutos, critérios atingidos ou não e decisão resultante na ADR correspondente.
- Resultado negativo não é falha do processo: aciona a alternativa documentada e uma nova decisão.
- "Usar claims e RLS", "usar pgmq" ou "usar backups do provedor" **não são evidência**. Evidência é o resultado dos cenários abaixo.

## EXP-01 — Acesso a dados por conexão direta com RLS (DP-03 · [ADR-0003](../../decisions/ADR-0003-tenancy-rls-e-acesso-a-dados.md))

### Hipótese

Web e worker podem executar consultas e transações atômicas por conexão PostgreSQL direta (ou pooler) com **RLS efetiva em toda consulta comum**. O contexto de usuário e empresa fica restrito à transação, sem vazar entre conexões reutilizadas.

### Desenho sob teste

| Aspecto | Proposta a validar |
| --- | --- |
| Papéis de login | `oplyra_web_login` e `oplyra_worker_login`: `LOGIN`, `NOINHERIT`, `NOBYPASSRLS`, sem posse de tabelas e **sem privilégios diretos** em tabelas de domínio |
| Papéis de execução | `authenticated` (padrão Supabase) para requisições de usuário; `oplyra_worker_exec` (`NOLOGIN`, `NOBYPASSRLS`) com privilégios mínimos por tabela para jobs. Cada login só pode assumir o próprio papel de execução |
| Posse e RLS | Tabelas pertencem ao papel de migrations. RLS **habilitada e forçada** em todas as tabelas de empresa. Nenhum papel de aplicação é dono de tabela ou tem `BYPASSRLS` |
| Transação de usuário | `BEGIN` → assumir `authenticated` apenas na transação (`SET LOCAL ROLE`) → gravar claims verificadas com escopo de transação (`set_config(…, true)`) → consultas → `COMMIT`/`ROLLBACK` |
| Transação de worker | `BEGIN` → assumir `oplyra_worker_exec` na transação → `app.tenant_id` e `app.job_ref` com escopo de transação → consultas → fim. As políticas exigem `app.tenant_id` definido e igual ao `tenant_id` da linha |
| Origem das claims | O servidor valida o JWT do Supabase Auth com as chaves públicas (JWKS) do projeto: assinatura assimétrica, `iss`, `aud`, `exp`, `sub`. Nunca repassa um token não verificado ao banco. O legado HS256 não é aceito (FX-13). Grava só as claims mínimas derivadas do token verificado |
| Ponto único de acesso | A infraestrutura expõe só `withUserTransaction(accessContext, fn)` e `withWorkerTransaction(tenantId, jobRef, fn)`. Lint e teste de arquitetura proíbem acesso ao pool fora desses wrappers |
| Vínculo ao vivo | Funções auxiliares das políticas consultam vínculo ativo e permissão a cada verificação, sem confiar em papéis vindos do JWT |

### Estratégia de conexão a validar

| Processo | Opção primária | Motivo | Alternativa |
| --- | --- | --- | --- |
| Web na Vercel (instâncias efêmeras) | Pooler compartilhado em **modo transação** (porta 6543), prepared statements desligados, pool pequeno por instância | Recomendado para conexões curtas; configurações por transação continuam válidas, pois o modo transação só descarta estado de sessão (FX-12) | Pooler em modo sessão, se houver incompatibilidade |
| Worker em container persistente | Conexão direta (recomendada a backends persistentes). **É IPv6 por padrão**: exige saída IPv6 no host ou add-on IPv4 (US$ 4/mês) | Menor latência; permite locks de transação | Pooler em modo sessão (IPv4) |
| Migrations e CLI | Conexão direta ou pooler em modo sessão, com credencial exclusiva de migrations | Separação de privilégios | — |

Restrições conhecidas do modo transação: sem prepared statements; sem estado de sessão (`SET` de sessão, advisory locks de sessão, LISTEN/NOTIFY, tabelas temporárias). O desenho usa apenas escopo de transação e locks de transação.

### Cenários obrigatórios

| ID | Cenário | Resultado esperado |
| --- | --- | --- |
| E1-01 | Consulta pelo login sem assumir papel de execução | Negada por falta de privilégio (falha fechada) |
| E1-02 | Matriz de acesso cruzado ([15](15-test-plan.md) §3): ler, inserir, alterar, remover, trocar `tenant_id`, FK para outra empresa | Todas as operações indevidas negadas; caminho legítimo funciona |
| E1-03 | Vínculo removido com JWT ainda válido | Negado na transação seguinte |
| E1-04 | Empresa forjada (cookie/cabeçalho com empresa sem vínculo) | 403 no servidor **e** RLS sem linhas, se o servidor for contornado em teste |
| E1-05 | Claims forjadas: token não assinado, expirado, de outro projeto, com algoritmo inesperado, `sub` alterado | Rejeitado antes do banco; nenhuma claim gravada |
| E1-06 | Reutilização de conexão: pool de tamanho 1, alternando A e B, incluindo exceção após gravar claims, rollback, timeout de consulta e conexão encerrada no meio | Na transação seguinte, claims e `app.tenant_id` vazios e papel de execução não assumido |
| E1-07 | Concorrência: 10.000 transações mistas (A, B, usuário com duas empresas, worker A, worker sem empresa) em pool de 5–10 conexões, com asserção de visibilidade a cada consulta | 0 violações |
| E1-08 | Worker sem `app.tenant_id` definido | Nenhuma linha visível; escrita negada |
| E1-09 | Worker com `app.tenant_id` de A tentando gravar linha de B | Negado |
| E1-10 | Storage via SDK com sessão de A em prefixo de B | Negado (políticas de Storage) |
| E1-11 | Data API do Supabase com a chave publicável tentando ler tabela de domínio | Negado; schema não exposto |
| E1-12 | Desempenho: overhead das políticas com vínculo ao vivo | Medido em dados sintéticos (2 empresas × 50 mil linhas por tabela principal) |

### Critérios de aprovação

- E1-01 a E1-11: **100% conforme esperado**. Qualquer vazamento reprova.
- E1-07: 0 violações em 10.000 transações, em pelo menos 3 execuções.
- E1-12: p95 do overhead de autorização ≤ 20 ms por transação típica em ambiente local (a recalibrar em produção).
- Wrappers únicos garantidos por teste de arquitetura.
- Revisão de segurança dedicada do código de conexão (preferencialmente independente).

### Alternativa se falhar

1. Se o problema for do pooler: web via pooler em modo sessão ou conexão direta com pool limitado; repetir o experimento.
2. Se o problema for estrutural (vazamento, claims): **PostgREST/`supabase-js` com o JWT do usuário** (RLS nativa) para leituras e **funções SQL com `SECURITY INVOKER`** para gravações atômicas (agregado + outbox + auditoria na mesma função). Regras de negócio permanecem na aplicação; a função só persiste o resultado validado. Nesse caso, o schema exposto à Data API precisa de revisão (ADR-0003 revisada).

## EXP-02 — Filas, scheduler e disputa com o banco (DP-04 · [ADR-0004](../../decisions/ADR-0004-filas-scheduler-postgres.md))

**Executado e revisado em 21/09/2026 — aprovado com notas.** E2-09 foi repetido porque o proxy inicial era uma consulta submilissegundo não representativa. Com dashboard tenant-scoped sobre 450.000 snapshots, cinco rodadas pareadas mediram 12,92% de degradação agregada contra limite de 20%. Nenhum ambiente externo foi criado. Resultado detalhado: [`experiments/exp-02/RESULTADO.md`](../../../experiments/exp-02/RESULTADO.md).

### Hipótese

pgmq + pg_cron + tabelas próprias de execução atendem ao MVP com entrega ao menos uma vez sem efeito duplicado, recuperação após queda e impacto controlado nas consultas da aplicação.

### Cenários obrigatórios

| ID | Cenário | Medição / resultado esperado |
| --- | --- | --- |
| E2-01 | **Carga:** 50 empresas sintéticas; rajada de 1.000 workflows às 07:00 (check-ins) + 5.000 jobs/h de sincronização e normalização | Lag p95 da fila e throughput por worker |
| E2-02 | **Duplicação:** mesma mensagem reentregue por expiração de visibilidade durante processamento lento | 0 efeitos duplicados; segunda entrega detecta checkpoint e encerra |
| E2-03 | **Concorrência:** 4 workers na mesma fila; 2 workers disputando o mesmo `WorkflowRun` | Apenas o dono do lease grava; gravação com `attempt` antigo rejeitada |
| E2-04 | **Retentativas:** erros transitórios injetados (30% das chamadas do fake de IA) | Backoff e limite respeitados; dead-letter após o máximo; nenhuma retentativa de erro determinístico |
| E2-05 | **Queda:** encerrar o worker abruptamente durante um passo, com e sem transação aberta | Retomada após o lease (≤ 3 min) sem repetir passo concluído; nenhuma mensagem perdida |
| E2-06 | **Efeito externo incerto:** fake de adapter externo aplica o efeito e força timeout na resposta | Workflow vai para `waiting_human`/reconciliação; **nenhum reenvio automático**; consulta de reconciliação encontra o efeito |
| E2-07 | **Enfileiramento transacional:** falha após gravar estado e antes do commit | Nem estado nem mensagem persistem |
| E2-08 | **Scheduler:** ticks concorrentes, fuso, misfire de 30 h e meses com cinco segundas | Uma ocorrência por horário; misfire conforme tolerância; franquia/cadência seguem decisão de 08 §12, sem quinta chamada paga implícita. |
| E2-09 | **Disputa de recursos:** consultas típicas da aplicação durante E2-01, no tamanho de computação candidato | p95 das consultas da aplicação, conexões ativas, CPU, locks, crescimento e vacuum das tabelas de fila |
| E2-10 | **Mensagem envenenada** | Dead-letter após 5 entregas, com alerta e vínculo ao run original |

### Critérios de aprovação

- E2-02 a E2-08 e E2-10: 100% conforme esperado.
- E2-01: lag p95 ≤ 60 s na rajada, com no máximo 2 workers do tamanho candidato.
- E2-09: degradação do p95 das consultas da aplicação ≤ 20% durante a carga; sem esgotar conexões.
- Retenção e arquivamento das filas definidos com base no crescimento medido.

### Alternativa se falhar

- Falha funcional (duplicação, perda): corrigir o runtime ou adotar pg-boss (mesmo banco) e repetir.
- Falha por disputa de recursos: primeiro, ajustar computação e concorrência. Se persistir, **separar o transporte de mensagens do banco da aplicação** (fila gerenciada ou instância dedicada), mantendo a outbox transacional no banco da aplicação como fonte de verdade.

## EXP-03 — Hospedagem, rede e custo ocioso (DP-05/DP-06 · [ADR-0005](../../decisions/ADR-0005-destinos-de-publicacao.md))

**Exige contas e recursos pagos. Não autorizado nesta etapa.** Executar apenas com autorização específica, em projeto de teste, sem dados reais.

| ID | Cenário | Medição / critério |
| --- | --- | --- |
| E3-01 | Latência da web em `gru1` → Supabase `sa-east-1` (pooler) | RTT p95 de consulta simples ≤ 15 ms |
| E3-02 | Latência do worker (Cloud Run worker pool `southamerica-east1`) → Supabase (direta via IPv6, ou IPv4 add-on, ou pooler) | Conectividade IPv6 comprovada ou alternativa escolhida; RTT p95 ≤ 15 ms |
| E3-03 | Custo ocioso real: 1 instância do menor tamanho adequado por 7 dias sem carga | Custo extrapolado ao mês dentro do orçamento aprovado |
| E3-04 | Deploy e rollback de revisão do worker e da web | Procedimento documentado; rollback ≤ 10 min |
| E3-05 | Credenciais: deploy do CI sem chave de longa duração (federação de identidade) e segredos no gerenciador | Nenhum segredo em repositório, log ou imagem |
| E3-06 | Observabilidade: traços e logs correlacionados de web e worker no destino de coleta candidato | Correlação ponta a ponta visível; PII redigida |

Alternativa: se custo ocioso, rede ou operação reprovarem, avaliar worker em Fly.io (`gru`) ou AWS ECS Fargate (`sa-east-1`) com os mesmos cenários.

## EXP-04 — Backup e restauração do banco e do Storage (DP-07)

**Exige projeto Supabase descartável e pago** (PITR requer computação Small ou maior, FX-11). Não autorizado nesta etapa.

| ID | Cenário | Critério |
| --- | --- | --- |
| E4-01 | Restaurar backup diário em projeto descartável com dados sintéticos | Tempo de restauração registrado; integridade por contagens e checksums |
| E4-02 | PITR para um instante antes de uma exclusão lógica simulada, se contratado | Dados do instante recuperados; tempo registrado |
| E4-03 | Pós-restauração: redefinir senhas de papéis customizados (não guardadas nos backups, FX-11) e rotacionar segredos na web e no worker | Aplicação volta a operar pelo procedimento documentado |
| E4-04 | **Storage:** objeto removido e objeto sobrescrito | Recuperação pela estratégia própria (§ abaixo), já que backups do banco não restauram objetos do Storage |
| E4-05 | Reconciliação: manifesto de objetos (tabela `asset_versions`) × objetos existentes × cópia externa | 100% dos checksums conferem |

Estratégia de Storage sob teste:

1. Versões imutáveis: nunca sobrescrever, sempre novo caminho por versão.
2. Exclusão lógica com expurgo físico após 30 dias.
3. Replicação diária cifrada para bucket externo em conta separada, com retenção de 30 dias.
4. Manifesto com checksum no banco.

Alternativa: se a replicação externa for inviável, reter versões e exclusões lógicas por mais tempo e declarar a limitação de recuperação em contrato.

## EXP-05 — Avaliação de modelos por rota (DP-09 · [ADR-0006](../../decisions/ADR-0006-runtime-de-agentes.md))

**Exige chave de API e gasto real.** Executar apenas com orçamento aprovado e dados sintéticos.

| Item | Especificação |
| --- | --- |
| Rotas | Copy (produção e revisão por rodada), revisão de Estratégia e Qualidade, análise de mídia, consolidação do check-in, plano do Orquestrador, geração e edição de imagens, análise de ativo enviado (transcrição e derivados textuais) |
| Candidatos | Pelo menos dois candidatos elegíveis por rota quando disponíveis, incluindo OpenAI e Anthropic para texto conforme capacidade; provedores de geração/edição para rotas visuais. Registrar IDs, tarifas datadas e elegibilidade antes da rodada. Não exigir que um modelo textual gere imagens. |
| Conjuntos | [15](15-test-plan.md) §5.1, versionados; mesmo conjunto para todos os candidatos |
| Métricas | Qualidade (determinística, rubrica calibrada, amostra humana), latência p50/p95, **custo por tarefa concluída** (inclui rodadas extras e falhas), taxa de recusa e de saída inválida |
| Critério de escolha | Entre os candidatos que atingem **todos** os limiares de [15](15-test-plan.md) §5.3 com margem, escolher o de menor custo por tarefa concluída que respeite a latência máxima da rota. Empate técnico → o mais barato |
| Repetição | Mínimo de 3 execuções por candidato; decisão só com diferença acima da variação observada |
| Mudança de roteamento | Proibida sem reexecutar a avaliação da rota e registrar o resultado na política de modelo versionada |
| Orçamento | Teto por rodada e por mês aprovado antes (DP-09d) |

Alternativa: se nenhum candidato atingir os limiares, a rota fica desabilitada ou restrita a assistência com revisão humana obrigatória. Registrar a limitação e revisar prompt, contexto ou rubrica antes de nova rodada.

### Casos adicionais do EXP-05

- Comparar imagem gerada e edição preservando elementos solicitados, aderência à marca, direitos de uso e falhas; avaliação humana visual além do schema.
- Para análise de ativo enviado, medir custo por ativo e por minuto, fidelidade da transcrição, utilidade dos derivados e comportamento com áudio ruidoso ou idioma misto. Nenhum candidato é avaliado para gerar ou renderizar vídeo.
- Verificar que a saída respeita o método de campanha quando a rota produz peça: estrutura completa e hipótese declarada (DEC-017).
- Reprovação de qualidade, indisponibilidade, orçamento esgotado e modelo desabilitado exercitam fallback sem contornar regras.
- Conferir que Ledger inclui tentativas, revisão, falhas faturadas e imagens; medidor comercial não duplica retry.
- Rodar caso determinístico sem chamada LLM. Não usar modelo juiz em todas as tarefas sem justificar custo.
- Limites propostos em 13 §15 são avaliados, não automaticamente aprovados pelo sucesso de um único caso.

## Relação com os incrementos

| Experimento | Momento | Autorização necessária |
| --- | --- | --- |
| EXP-01 | **Executado em 15/09/2026**, antes das tabelas definitivas | Concedida com o I-01 |
| EXP-02 | **Executado e aprovado com notas em 21/09/2026** | Aprovação local para desenho; repetir em homologação antes da ativação |
| EXP-03 | Antes da primeira publicação do worker (I-02); latência da web antes da publicação do I-01 | Contas, recursos e orçamento de teste |
| EXP-04 | Antes de dados reais de pilotos; repetição trimestral | Projeto descartável e orçamento |
| EXP-05 | I-05 (antes de liberar agentes); a cada mudança de rota | Chave de API, orçamento de avaliação |
