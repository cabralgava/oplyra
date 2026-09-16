# CLAUDE.md — Oplyra

## Objetivo destas instruções

Orientar o trabalho de agentes de desenvolvimento no projeto Oplyra. Leia este arquivo antes de planejar ou alterar código. Ele não é um prompt dos agentes de marketing do produto.

A Oplyra é uma plataforma greenfield de Marketing Operations, SaaS multi-tenant, independente e comercializável. Sua promessa é: **Sua operação de marketing, da estratégia à receita.** A landing page e o site institucional terão endereço canônico `https://oplyra.io`; a aplicação terá endereço canônico `https://app.oplyra.io`. Essa definição explícita substitui os domínios anteriores nas referências históricas. Ver o registro em [ATUALIZACOES.md](docs/product/marketing-ops/ATUALIZACOES.md).

## Leitura inicial e referência

1. Leia integralmente este arquivo e siga as instruções aqui reunidas.
2. Leia integralmente o Documento de Transição v2.2, de 13/09/2026, em `docs/product/marketing-ops/00-documento-transicao.md`. Se não existir, localize a referência disponível e registre o caminho real; não presuma a existência de `sources/`.
3. Leia `README.md`, `docs/product/marketing-ops/ATUALIZACOES.md` e o [índice de produto](docs/product/marketing-ops/README.md). Os documentos 01–18, os ADRs e o registro de decisões existem neste repositório: revise-os antes de propor mudanças. Decisões explícitas posteriores registradas no complemento prevalecem sobre os pontos correspondentes da v2.2. O pacote v2.3 citado em conversas anteriores não está disponível aqui; não declarar sua leitura. AGENTS.md é lido se existir; não presumir sua presença.
4. Localize e leia as skills reais em `.claude/skills`, conforme a seção de skills abaixo.
5. Leia `docs/harness/ESTADO.md` para retomar o trabalho e `docs/harness/DESENVOLVIMENTO.md` para executar a tarefa. Consulte `docs/harness/VERIFICACOES.md` antes de declarar uma entrega concluída.

O documento de transição é referência somente de leitura, independentemente da pasta: não editar, renomear, mover ou excluir. Se existir `sources/`, a mesma proteção se aplica a todos os arquivos dessa pasta. Não assumir que caminhos de documentação previstos já existem.

Supabase como backend obrigatório desde o início, com desenvolvimento local via Docker e publicação incremental no Supabase de produção após aprovação, é uma decisão explícita adicional do projeto. Preserve as decisões do documento de transição e registre dúvidas ou conflitos reais, sem resolvê-los por suposições silenciosas.

## Referência visual obrigatória para UX/UI

Antes de planejar ou alterar telas, leia [GUIA-INTERFACE-FIGMA.md](docs/product/marketing-ops/GUIA-INTERFACE-FIGMA.md). Esse arquivo concentra projeto Figma, File Key, nodes de Dashboard, Campanhas e Central Estratégica, paleta, tipografia, layout e critérios visuais. Use tema escuro, Inter/Manrope e roxo primário conforme o guia, com tokens e componentes reutilizáveis.

O [manual de marca](docs/brand/oplyra_brand_system.md) é a fonte da identidade e concorda com o guia em paleta e tipografia. Essa é a única referência visual vigente: o protótipo em tema claro foi preservado apenas como histórico. Consulte o node correspondente quando houver acesso; diferencie especificação fornecida, medida inspecionada e proposta. Não invente espaçamentos nem declare fidelidade visual sem comparação. Registre adaptações responsivas e a confirmação da sidebar no Dashboard. O guia complementa as skills de UX disponíveis; suas diretrizes explícitas prevalecem sobre preferências visuais genéricas das skills.

A stack listada no guia é sugerida, não uma nova decisão arquitetural. Preserve a stack já aprovada no repositório ativo, as regras de domínio, permissões, entitlements e aprovações. Um frame não autoriza implementar módulos fora do incremento. Verifique a UI conforme [VERIFICACOES.md](docs/harness/VERIFICACOES.md) e registre evidências em [ESTADO.md](docs/harness/ESTADO.md).

## Limite da etapa atual: discovery antes de implementação

O trabalho inicial é documental e de discovery. A criação de README e CLAUDE não autoriza iniciar a construção da aplicação.

Antes de código estrutural:

1. Defina problema, personas, jornada e critérios de sucesso; diferencie hipóteses de validações reais com clientes.
2. Delimite o MVP Performance e o que ficará para Growth.
3. Modele linguagem ubíqua, subdomínios, bounded contexts, agregados, invariantes e contratos.
4. Proponha Clean Architecture, Supabase local, autenticação, tenancy, RBAC, RLS, Storage, billing, entitlements e integrações.
5. Defina arquitetura multiagentes, contratos, memória, ferramentas, permissões, autonomia, quality gates e escalonamento humano.
6. Proponha filas, scheduler, idempotência, auditoria, observabilidade, testes e controle de custos.
7. Documente fluxos de UX, decisões, riscos, custos, alternativas ainda abertas e sequência de execução.
8. Apresente a proposta com os pontos que exigem decisão e **pare**.

**Não criar nem aplicar migrations, DDL, tabelas, políticas RLS executáveis, scaffold da aplicação, runtime de agentes ou outra implementação estrutural antes da aprovação explícita da proposta de discovery.** Modelos conceituais, contratos propostos, protótipos de UX e especificações são entregas desta fase; não convertê-los automaticamente em implementação.

Registrar quem aprovou, o escopo aprovado e pendências. A aprovação de README/CLAUDE, o silêncio ou o tempo decorrido não substituem a aprovação do discovery. Depois da aprovação, implementar apenas o escopo autorizado, incrementalmente.

## Skills obrigatórias e ordem de aplicação

| Ordem/momento | Arquivo | Aplicação esperada |
| --- | --- | --- |
| 1 | `.claude/skills/ddd-rapido-arquiteto/SKILL.md` | Discovery do domínio, linguagem ubíqua, bounded contexts e invariantes. |
| 2 | `.claude/skills/clean-architecture-arquiteto/SKILL.md` | Limites arquiteturais, direção das dependências, portas e adapters. |
| 3 e a cada fase | `.claude/skills/verificacao-qualidade-codigo/SKILL.md` | Quality gate das entregas e verificação das evidências. |
| Nas atividades de UX/UI | `.claude/skills/apple-design/SKILL.md` | Fluxos, protótipos, componentes e design system, com revisão de qualidade posterior. |

Preservar a ordem DDD → Clean Architecture → verificação de qualidade. A skill `apple-design` complementa esse fluxo quando houver design, inclusive durante o discovery.

- Ler integralmente o conteúdo disponível antes de aplicar cada skill e informar brevemente qual está sendo utilizada.
- Não inferir regras específicas apenas pelo nome. Esta tabela descreve a finalidade esperada, não o conteúdo dos arquivos.
- Se um caminho não existir, procurar a skill nas fontes autorizadas disponíveis e registrar o resultado.
- Verificar disponibilidade no repositório em uso; registrar caminhos, leitura, aplicação e limitações em `ESTADO.md`, sem transportar uma declaração de ausência de outro workspace.
- Se houver ausência real, providenciar instalação/cópia de fonte autorizada antes da implementação; não inventar skills substitutas. A documentação independente dessa ausência pode prosseguir.
- Desconsiderar trechos específicos de CRM Imob L4S, L4S ou Lovable que conflitem com a Oplyra greenfield. Preservar orientações gerais compatíveis, registrar seção/trecho e justificativa e não importar regras de negócio, stack ou dependências de outros produtos. Não alterar silenciosamente as skills originais.
- Distinguir leitura e aplicação verificadas na execução atual de relatos de outra execução; não alegar inspeção própria baseada apenas nesses relatos.

## Decisões arquiteturais obrigatórias

### Direção atual do produto

Mercado inicial: empresas SaaS B2B, sem dependência estrutural de segmento (DEC-018). Stripe é o provedor escolhido para billing, por adapter próprio. A arquitetura de IA contempla múltiplos modelos/provedores, Registry, Router, Eval Engine e Cost Ledger. Geração e edição de imagens integram o MVP. Vídeo não é gerado, editado ou renderizado nativamente, mas vídeos enviados pelo cliente são ativos de entrada para análise (DEC-014, DEC-015). Campanhas seguem o método de DEC-017.

**Ancoragem das decisões:** citar `DEC-0xx` apenas quando o identificador corresponder à numeração real da v2.2 §27. Stripe, budgets, imagens e a arquitetura multimodelo são decisões posteriores **sem ID** na referência: citar [ATUALIZACOES](docs/product/marketing-ops/ATUALIZACOES.md), nunca atribuir um DEC por inferência. Budgets, evidências, limites relatados e pendências comerciais têm fonte única nesse complemento. Contratos e aceite ficam no harness.

### Greenfield

Construir uma plataforma própria. Não importar automaticamente autenticação, schemas, migrations, permissões, componentes, infraestrutura, credenciais, serviços ou regras de CRM ou produto anterior. Integrações não podem criar dependência estrutural nem privilégios para empresas piloto.

O MVP não terá CRM próprio. Receber leads, conversões e dados comerciais por API, webhook, importação controlada ou conector desacoplado.

### DDD e Clean Architecture

- Modelar o domínio antes de escolher tabelas. Entidades e nomes citados no documento de transição são conceituais.
- Manter entidades, objetos de valor, invariantes e regras de negócio independentes de SDKs e frameworks.
- Casos de uso dependem de portas internas. Infraestrutura implementa essas portas, com adapters para Supabase e serviços externos.
- Não importar SDK do Supabase, de IA, billing, anúncios ou CRM no domínio ou nos casos de uso.
- Traduzir contratos externos na fronteira; não deixar payloads de fornecedores definirem o modelo interno.
- Definir a estrutura de pastas no discovery. Não assumir linguagem, framework, ORM, gerenciador de pacotes ou topologia de serviços ainda não aprovados.
- Preferir limites claros e implementação proporcional ao MVP; arquitetura multiagentes não implica microserviços para cada agente.

### Supabase local via Docker e produção incremental

**Supabase é o backend padrão obrigatório da Oplyra. Desenvolver e validar inicialmente com Supabase local via Docker. Publicar cada incremento aprovado para produção no Supabase, mantendo o desenvolvimento dos próximos módulos localmente.** Não começar com SQLite, Firebase, mocks como persistência definitiva ou um backend provisório para migrar depois.

Após a aprovação do discovery:

- Configurar Supabase local via Docker próprio da Oplyra para PostgreSQL, Auth e Storage, sem usar infraestrutura de outro produto. Planejar e preparar também o projeto Supabase de produção conforme o escopo aprovado.
- Documentar pré-requisitos, versões compatíveis de Supabase CLI e Docker e comandos reais de inicialização, parada e testes.
- Fazer aplicação, workers e testes apontarem por padrão para os serviços locais. Não usar projeto remoto como fallback silencioso.
- Documentar as variáveis em `.env.example`, sem segredos reais. Ignorar arquivos locais de segredos no Git e separar variáveis públicas das privadas.
- Restringir chaves privilegiadas ao servidor. Não colocá-las em bundles de frontend, logs, exemplos ou fixtures.
- Versionar migrations e políticas de acesso; validar em banco local recriável com dados sintéticos e pelo menos dois tenants.
- Documentar e verificar RLS desde as primeiras tabelas de dados dos tenants; desenvolvimento local não justifica desabilitá-la.
- Usar adapters de teste para IA, anúncios, billing e outros fornecedores, evitando envios, publicações ou gastos reais na rotina local.
- Validar integrações reais em sandboxes explícitos quando necessário, mantendo o backend da aplicação local.

Mocks e fakes são permitidos para testes unitários de portas e contratos, mas não substituem a verificação de persistência, Auth, RLS e Storage com Supabase local. Filas, scheduler e runtime complementar serão escolhidos no discovery; não presumir que todos os serviços serão fornecidos automaticamente pelo Supabase.

### Publicação por incremento

Seguir [PUBLICACAO.md](docs/harness/PUBLICACAO.md). O discovery deve definir ambientes, destino de frontend/workers, ordem de deploy, migrations compatíveis e recuperação. Após validar cada incremento, apresentar versão, alterações e evidências para aprovação que inclua sua publicação. Uma única aprovação pode cobrir aceite e deploy; não solicitar novamente quando já houver autorização explícita válida. Não esperar concluir todo o MVP para publicar. A fundação de autenticação, tenants, permissões e RLS deve estar validada antes do primeiro módulo.

Manter credenciais, dados e destinos separados; promover alterações versionadas e configurações documentadas, nunca copiar o banco local ou seeds sintéticos para produção. Registrar publicação e verificações pós-deploy no estado do trabalho.

### Tenancy, autorização e RLS

- Todo dado pertencente a uma empresa deve ter associação inequívoca ao tenant, conforme o modelo aprovado. Catálogos globais exigem fronteiras explícitas e não contêm dados privados de clientes.
- Resolver o tenant ativo com autenticação e membership válida; rejeitar acesso baseado apenas em identificador fornecido pelo cliente.
- Suportar usuários com múltiplos tenants, com papéis e permissões por membership.
- Aplicar autorização no backend, RLS no banco e políticas de Storage; a interface não é a barreira de segurança.
- RLS deve restringir leitura e escrita, inclusive impedir troca indevida do tenant de um registro. Prever constraints coerentes para relações entre dados do mesmo tenant.
- Isolar credenciais, arquivos, caches, jobs, webhooks, relatórios, consumo, memórias e contexto de agentes.
- Operações com privilégios que contornam RLS exigem autorização explícita no código, escopo mínimo e auditoria. Não usar esses privilégios como padrão para requisições de usuários.
- Testar acesso permitido e negado com sessões reais de teste, inclusive anônimos, membros removidos e usuários que participam de mais de uma empresa.
- Nunca incorporar Brand OS, dados, campanhas ou memórias de clientes em prompts globais ou reutilizá-los entre tenants.
- Suporte e impersonation devem ser temporários, autorizados e auditados.

### Integrações e entitlements

- Encapsular Supabase, IA, billing, Meta Ads, Google Ads, CRM, e-mail e redes sociais atrás de interfaces/adapters.
- Validar entradas, autenticação e origem dos webhooks; prever idempotência, retries limitados, rate limits, rastreabilidade e dead-letter.
- Normalizar dados comerciais no contrato interno sem implementar um CRM próprio.
- Meta/Google começam em modo leitura no MVP.
- Autorizar capacidades por um serviço de entitlements, por exemplo `entitlements.can(tenantId, "relationshipJourneys")`; não espalhar `if (plan === "growth")` nas regras de negócio.
- Limites comerciais são configuráveis. Não transformar os preços da assessoria de referência em preços do software.

## Arquitetura multiagentes do produto

Planejar desde a fundação, implementando os agentes por etapas:

| Grupo | Agentes |
| --- | --- |
| Coordenação | Orquestrador; Account e Gestão de Projetos. |
| Produção e mídia | Mídia Paga; Copywriting; Design. |
| Supervisão | Estratégia e Qualidade, independente dos executores. |
| Análise e acompanhamento | Performance e Inteligência; Relatórios e Check-ins. |
| Expansão Growth | Social Media; E-mail Marketing; Lifecycle; Revenue Intelligence. |

O MVP inclui Orquestrador, Account, Copywriting, Design, Mídia Paga e Estratégia e Qualidade. Design executa a capacidade visual — geração e edição de imagens e análise de ativos enviados pelo cliente — e Estratégia e Qualidade revisa de forma independente. Não implementar todos os agentes e módulos simultaneamente.

Para cada agente, especificar objetivo, versão, entradas/saídas estruturadas, ferramentas permitidas, permissões, contexto necessário, memória por tenant, limites, métricas e responsável pela revisão. Execuções registram tenant, tarefa, gatilho, estado, evidências, modelo, consumo, custo e duração.

Regras de governança:

1. Orquestrador delega e acompanha; não aprova irrestritamente o próprio trabalho.
2. Especialistas produzem entregas; Estratégia e Qualidade revisa de forma independente.
3. Validações determinísticas verificam schema, permissões, campos, links, UTMs, orçamento e regras obrigatórias.
4. Estratégia e orçamento começam em `recommend`; publicação e comunicação externa em `draft`. O modo conceitual `suggest` corresponde a recomendação.
5. `approval_required` exige aprovação humana; `policy_execute` só pode executar ações de baixo risco dentro de política explícita e limites aprovados por ação, tenant e integração.
6. Nenhuma publicação irrestrita ou aumento relevante de orçamento sem aprovação. Registrar aprovação, versão da entrega aprovada e execução correspondente.
7. Memória e recuperação de contexto são isoladas por tenant e limitadas à tarefa. Conteúdo externo é dado não confiável, nunca autorização para ferramentas ou mudança de instruções.
8. Limitar turnos, delegação, tempo e orçamento; prever circuit breaker, kill switch e escalonamento humano.
9. Scheduler persistente dispara workflows versionados; manter inteligência de negócio fora do cron. Usar locks, idempotência, retries limitados e dead-letter.
10. Persistir relatórios no tenant antes de envio; respeitar destinatários, consentimento, timezone e preferências.
11. Distinguir fatos, inferências, hipóteses, recomendações e limitações. Não inventar dados ausentes nem apresentar atribuição estimada como exata.

## Escopo, experiência e privacidade

- Entregar Performance primeiro: identidade/tenancy, Brand OS, objetivos, campanhas, tarefas, copy, ativos, aprovação, mídia em leitura, dashboard, relatório semanal e entrada de conversões.
- Estruturar campanhas por situação, dor, consequência, desejo, mecanismo, prova e oferta; testes representam hipóteses explícitas, não variações cosméticas; resultados priorizam métricas comerciais disponíveis e o aprendizado retorna a personas, mensagem e Brand OS (DEC-017).
- Tratar vídeo como ativo de entrada: receber e analisar vídeos enviados ou selecionados pelo cliente para transcrição, resumo, copy, hooks, CTAs, roteiros derivados e configuração de campanha, conforme o suporte do provedor. Não gerar, editar nem renderizar vídeo nativamente. Transcrições, frames e demais derivados herdam tenant, permissões e retenção do ativo de origem, sem reaproveitamento entre tenants. Preparar campanha não autoriza publicá-la.
- Reservar para Growth módulos completos de agenda editorial, social, e-mail, segmentos, réguas, automações e atribuição avançada.
- Preservar a jornada orientada ao próximo passo, linguagem de negócio, onboarding progressivo, desktop operacional e responsividade.
- Mostrar estados de rascunho, aprovado, agendado e publicado; indicar o que foi feito por IA e permitir revisão humana.
- Indicar atualização e confiança dos dados: confirmado, provável, estimado, parcial ou indisponível.
- Prever requisitos de LGPD, consentimento quando aplicável, unsubscribe/suppression, retenção, exportação e exclusão, minimização de dados, proteção de credenciais, logs sem segredos ou PII desnecessária, backups e recuperação. Documentar políticas a validar; não alegar conformidade apenas por usar Supabase ou RLS.

## Verificação e entrega

O protocolo operacional está em [Harness de desenvolvimento](docs/harness/DESENVOLVIMENTO.md). Atualize o [estado do trabalho](docs/harness/ESTADO.md) em cada entrega ou interrupção relevante. A especificação do [harness dos agentes do produto](docs/harness/PRODUTO.md) será refinada no discovery; ela não autoriza construir o runtime. Estes documentos complementam este arquivo, sem ampliar a autorização da tarefa nem substituir o gate de discovery.

No discovery, verificar coerência entre requisitos, domínio, arquitetura, escopo e riscos, sem alegar execução de testes de uma aplicação inexistente.

Após aprovação e conforme cada incremento implementado, verificar:

- Invariantes do domínio e casos de uso afetados.
- Direção das dependências e contratos dos adapters.
- Autenticação, RBAC, memberships, RLS e acesso a Storage no Supabase local, com tentativas de acesso cruzado entre tenants.
- Entitlements no backend e limites de consumo.
- Idempotência, falhas, retries, jobs duplicados e isolamento de contexto dos agentes.
- Aprovação humana, ferramentas permitidas, revisão independente e limites de custo/autonomia.
- Fluxos de UX e estados de erro pertinentes à entrega.
- Ausência de segredos e de uso acidental de serviços remotos no fluxo local.

Executar os checks disponíveis e adequados à mudança; registrar resultados reais, falhas e o que não foi possível verificar. Não inventar comandos, cobertura, validações de clientes ou aplicação de skills ausentes.

Ao entregar, informar o que mudou, quais arquivos foram produzidos, o que foi verificado, riscos ou pendências relevantes e o próximo passo autorizado. **Se a entrega conclui o discovery, o próximo passo é apresentar a proposta e aguardar aprovação; não começar migrations ou implementação estrutural.**
