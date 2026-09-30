# Oplyra

> Sua operação de marketing, da estratégia à receita.

Oplyra é uma plataforma SaaS multi-tenant de Marketing Operations, construída do zero para conectar estratégia, execução, mídia, relacionamento, dados comerciais e receita. Sua arquitetura multiagentes coordena especialistas digitais com supervisão estratégica, aprovação humana e auditoria.

- **Marca:** Oplyra — Operations + Lyra; pronúncia O-plí-ra.
- **Landing page e site institucional:** `https://oplyra.io`.
- **Aplicativo:** `https://app.oplyra.io`.
- **Mercado inicial:** empresas SaaS B2B, mantendo o domínio preparado para outros segmentos.
- **Estado do trabalho:** consultar `docs/harness/ESTADO.md` e conferir as entregas no repositório em uso; não inferir o estágio a partir de outro workspace.

## Referência e decisões

Leia [Atualizações documentais](docs/product/marketing-ops/ATUALIZACOES.md) para as decisões posteriores e para a regra de ancoragem: Stripe, budgets internos, geração/edição de imagens, arquitetura multimodelo e gateway OpenRouter são decisões **sem identificador DEC** na referência e devem citar esse complemento. Mercado SaaS B2B (DEC-018), Context Stack (DEC-019) e protocolo transacional (DEC-020) estão numerados na v2.3. O [índice do produto](docs/product/marketing-ops/README.md) lista os documentos 00–20, os ADRs, as skills e os protótipos presentes neste repositório.

Este README deriva do [Documento de Transição v2.3, de 16/09/2026](docs/product/marketing-ops/00-documento-transicao.md), confirmado como referência protegida vigente em 29/09/2026. O caminho canônico é `docs/product/marketing-ops/00-documento-transicao.md`. Preserve o documento de referência como somente leitura, independentemente da pasta. A existência de `sources/` não é requisito do projeto.

A definição de **Supabase como backend padrão obrigatório, com desenvolvimento local via Docker e publicação incremental no Supabase de produção após aprovação**,  complementa o documento por orientação explícita do projeto. Os demais componentes da stack seguem as decisões registradas no [estado do trabalho](docs/harness/ESTADO.md) e nos ADRs.

Decisões que orientam toda implementação:

1. **Greenfield:** código, banco, autenticação, infraestrutura, design system e deploy próprios. Não herdar tabelas, migrations, credenciais, componentes ou regras de outros sistemas.
2. **SaaS multi-tenant desde a fundação:** usuários podem participar de mais de uma empresa, com memberships, papéis, permissões e isolamento verificável.
3. **DDD e Clean Architecture:** domínio independente de frameworks, SDKs, persistência e integrações externas.
4. **Supabase desde o início:** PostgreSQL, autenticação e armazenamento da aplicação terão Supabase como base, com Supabase local via Docker para desenvolvimento e Supabase de produção recebendo cada incremento aprovado para publicação.
5. **Integrações por portas e adapters:** fornecedores e CRMs externos não definem o modelo interno. Não haverá CRM próprio no MVP.
6. **Multiagentes desde a fundação:** orquestrador, especialistas, revisão independente, limites de autonomia e rastreabilidade.
7. **Performance primeiro:** Growth será adicionado progressivamente, sem construir os dois planos completos simultaneamente.
8. **Entitlements configuráveis:** capacidades e limites não devem depender de condicionais de plano espalhadas pelo código. Preços e políticas comerciais permanecem pendentes; budgets definidos e limites relatados estão separados em ATUALIZACOES.
9. **Implementação por incremento autorizado:** o discovery foi concluído e o I-01 aceito em 16/09/2026; cada novo incremento exige autorização explícita do escopo antes de migrations ou de estrutura nova, e a publicação segue o processo aprovado.
10. **Gateway de IA substituível:** OpenRouter é o gateway inicial padrão por adapter atrás do AI Model Router interno, sem exclusividade. Test Adapter permanece obrigatório; modelos e parâmetros pertencem a perfis versionados por `agent + action`, condicionados ao EXP-05.

## Interface e referência Figma

O [Guia de interface Figma](docs/product/marketing-ops/GUIA-INTERFACE-FIGMA.md) é a referência visual vigente — tema escuro, roxo `#5B3DF5`, Manrope e Inter — e reúne projeto, nodes de Dashboard, Campanhas Lista e Central Estratégica, paleta, layout e critérios de implementação. O [manual de marca](docs/brand/oplyra_brand_system.md) é a fonte da identidade. Leia ambos antes de trabalhar nas telas; não manter referência visual concorrente.

Documentado a partir do material fornecido em 15/09/2026; inspeção visual dos frames pendente. A stack sugerida deve ser conciliada com decisões aprovadas no repositório ativo.

## Produto e escopo inicial

O produto poderá atender equipes próprias, agências, consultores e operações assistidas. Serviços humanos opcionais devem ser comercialmente separados da capacidade do software. Empresas piloto não recebem privilégios arquiteturais nem introduzem regras específicas nos padrões globais.

| Plano | Escopo |
| --- | --- |
| **Performance** | Estratégia, campanhas, projetos, copy, ativos, aprovações, mídia paga, dashboards, check-ins e integração comercial básica. |
| **Growth** | Performance mais agenda editorial, social media, e-mail, segmentos, réguas de relacionamento, automações e atribuição avançada. |

Os valores da proposta de assessoria que originou o conceito não são preços da Oplyra. Preços comerciais e a viabilidade dos limites dependem de validação; a diferença funcional entre os planos deve permanecer clara.

Campanhas seguem o método da referência (DEC-017): situação, dor, consequência, desejo, mecanismo, prova e oferta; testes expressam hipóteses explícitas; resultados priorizam lead qualificado, reunião, proposta, contrato e receita quando disponíveis; o aprendizado retorna à estratégia e ao Brand OS.

### MVP Performance

- Tenant, usuários, memberships, permissões e onboarding.
- Brand OS por empresa, com posicionamento, produtos, personas, tom de voz, claims e evidências.
- Objetivos, campanhas, projetos e tarefas.
- Copiloto de copy, geração e edição de imagens, biblioteca de ativos, versionamento e aprovações.
- Vídeo como ativo de entrada: análise de vídeos enviados pelo cliente para transcrição, resumo, copy, hooks, CTAs, roteiros derivados e configuração de campanha. A Oplyra não gera, edita nem renderiza vídeo nativamente.
- Meta Ads e Google Ads em **modo leitura**.
- Dashboard e relatório semanal, com qualidade e limitações dos dados explícitas.
- Orquestrador e agentes Account, Copywriting, Design, Mídia Paga, Estratégia e Qualidade.
- Entrada genérica de conversões comerciais por API ou webhook.

A fundação também deve contemplar entitlements, billing, auditoria, filas, scheduler, observabilidade e runtime de agentes. A atribuição básica first touch/last touch e o aprofundamento operacional seguem a evolução do Performance. A capacidade visual integra o MVP: Design executa geração, edição e análise de ativos, e Estratégia e Qualidade revisa de forma independente. Performance e Relatórios evoluem incrementalmente. Registry, Router, Eval Engine e Cost Ledger acompanham a fundação e a ativação dos primeiros workflows pagos.

Ficam para etapas posteriores: automação de mídia com execução controlada, módulos completos de social media, e-mail marketing, jornadas multietapas e atribuição avançada. O MVP não inclui CRM próprio.

## Backend, desenvolvimento local e produção incremental

**Supabase é a escolha obrigatória de backend desde a primeira configuração. O desenvolvimento usa Supabase local via Docker; cada módulo aprovado para publicação segue para Supabase de produção, enquanto os próximos continuam em desenvolvimento local.** Não adotar um backend provisório alternativo nem deixar a adoção de Supabase para uma migração futura.

O plano técnico deverá prever:

- Supabase PostgreSQL para persistência, com migrations versionadas e aplicadas por incremento autorizado.
- Supabase Auth para identidade e autenticação; memberships e permissões continuam sendo conceitos explícitos do domínio.
- Supabase Storage para ativos, com políticas de acesso por tenant.
- RLS como defesa obrigatória nas tabelas de dados dos tenants e políticas correspondentes para Storage.
- Adapters de infraestrutura encapsulando o acesso ao Supabase; domínio e casos de uso não importam seu SDK.
- Configuração local de aplicação, autenticação, callbacks, banco, storage, workers e testes, sem dependência de projeto Supabase remoto para desenvolvimento.
- Variáveis de ambiente documentadas em `.env.example`, somente com nomes e valores de exemplo; segredos locais em arquivo ignorado pelo Git.
- Chaves privilegiadas restritas ao backend e a processos confiáveis; nunca no frontend, nos logs ou no repositório.
- Seeds sintéticos com pelo menos dois tenants para validar isolamento; não copiar dados privados de clientes.
- Integrações externas simuladas por adapters locais e fixtures por padrão. Testes com sandboxes de fornecedores, quando necessários, devem ser explícitos e separados da rotina local.

### Sequência de preparação

1. Ler o documento de transição, [CLAUDE.md](CLAUDE.md), o [estado do trabalho](docs/harness/ESTADO.md) e as skills disponíveis.
2. Conferir a autorização vigente e o próximo incremento no estado do trabalho; o discovery e o I-01 (fundação local) já estão concluídos e aceitos.
3. **Parar e submeter a proposta para aprovação** sempre que o trabalho sair do escopo autorizado. Não criar nem aplicar migrations ou estrutura nova fora dele.
4. Usar a instância local própria da Oplyra (Supabase CLI e o ambiente de contêineres compatível, versões registradas) e os comandos reais de inicialização, verificação e testes documentados em [VERIFICACOES](docs/harness/VERIFICACOES.md).
5. Implementar adapters, migrations, RLS e seeds conforme o desenho aprovado do incremento autorizado.
6. Verificar autenticação, autorização, armazenamento e acesso entre tenants no ambiente local.
7. Preparar a publicação do incremento, obter aprovação que inclua versão e destino, publicar e verificar em produção conforme [o fluxo de publicação](docs/harness/PUBLICACAO.md). Continuar o próximo módulo localmente.

O repositório já fornece workspace pnpm, scripts de execução/verificação, Supabase local, CI e componentes parciais de filas/runtime. O estado implementado e os limites de ativação estão em [ESTADO](docs/harness/ESTADO.md); runtime completo, scheduler e ambientes de aplicação remotos continuam condicionados aos incrementos, decisões e autorizações correspondentes. Essa evolução não reabre a escolha do Supabase. A primeira publicação continua dependendo de fundação validada e aprovação que inclua o deploy.

## Arquitetura e isolamento

DDD orientará linguagem ubíqua, subdomínios, bounded contexts, agregados e invariantes. A lista de entidades do documento é conceitual, não um schema pronto para gerar migrations.

Na Clean Architecture, domínio e aplicação ficam no centro; interface e infraestrutura dependem de contratos internos. Adapters traduzem modelos do Supabase, provedores de IA, anúncios, billing e fontes comerciais para os contratos da Oplyra. A organização física do código será definida no discovery.

Requisitos de isolamento:

- Identificar o tenant ativo a partir de uma sessão autenticada e de uma membership válida; nunca confiar apenas em um `tenantId` recebido do cliente.
- Validar permissões no backend, nas ferramentas dos agentes, nas integrações e no acesso a arquivos, além da interface.
- Usar RLS e testar acessos permitidos e negados entre empresas, incluindo usuários com múltiplas memberships.
- Isolar dados, credenciais, Brand OS, memórias, contexto de IA, arquivos, caches, jobs, relatórios e consumo por tenant.
- Restringir operações privilegiadas, que podem contornar RLS, com autorização explícita e auditoria.
- Manter suporte e impersonation temporários, autorizados e auditados.

Conteúdo de uma empresa nunca poderá compor prompts globais nem ser reutilizado por outro cliente. Prever menor privilégio, proteção de webhooks, idempotência, controle de orçamento, retenção, exportação, exclusão e requisitos de privacidade e LGPD.

## Arquitetura multiagentes

O Orquestrador decompõe objetivos e coordena especialistas. Account organiza a operação; Mídia, Copywriting e Design preparam entregas; Estratégia e Qualidade revisa de forma independente; Performance e Relatórios consolidam resultados. Growth acrescenta Social Media, E-mail Marketing, Lifecycle e Revenue Intelligence.

Cada agente terá contratos estruturados de entrada e saída, ferramentas permitidas, permissões, contexto mínimo por tenant, memória isolada, prompts versionados, limites de custo e execução e registro de evidências.

- Estratégia e orçamento começam em **recomendação**; publicação e comunicação externa começam em **rascunho**.
- Níveis superiores de autonomia exigem regras explícitas por ação, tenant e integração.
- Quem produz não aprova irrestritamente o próprio trabalho. A revisão independente complementa validações determinísticas e aprovação humana quando exigida.
- Scheduler persistente dispara workflows versionados e idempotentes; tarefas agendadas não concentram regras de negócio.
- Prever locks, retries limitados, dead-letter, timeouts, limites de turnos, circuit breaker, kill switch e escalonamento humano.
- Medir custo, qualidade e latência por agente, tenant e workflow. Salvar relatórios no tenant antes de qualquer envio.

Análises distinguem fato, inferência, hipótese, recomendação e limitação. Atribuição deve indicar se o dado é confirmado, provável, estimado, parcial ou indisponível; ausência de dados não pode ser preenchida por suposição.

## Skills do projeto

As skills devem estar em `.claude/skills/<nome>/SKILL.md`. Leia integralmente os arquivos reais antes de aplicá-los. As orientações abaixo definem seu uso esperado; não substituem nem presumem seu conteúdo.

| Skill | Uso esperado |
| --- | --- |
| `ddd-rapido-arquiteto` | Primeiro: domínio, linguagem ubíqua, bounded contexts e invariantes. |
| `clean-architecture-arquiteto` | Depois de DDD: camadas, dependências, portas, adapters e limites de infraestrutura. |
| `verificacao-qualidade-codigo` | Em seguida e em cada fase: revisar decisões e entregas, com evidências de qualidade proporcionais ao estágio. |
| `apple-design` | Ao trabalhar UX/UI: orientar fluxos, protótipos, hierarquia visual e design system; submeter a entrega à verificação de qualidade. |

Preservar a sequência base DDD → Clean Architecture → verificação de qualidade. Aplicar `apple-design` nas atividades de design, inclusive protótipos. A experiência deve usar linguagem de negócio, onboarding progressivo, estados claros de rascunho/aprovação/publicação, revisão humana e foco operacional desktop com responsividade.

**Disponibilidade:** verificar os arquivos reais no repositório em uso e registrar o resultado em `docs/harness/ESTADO.md`; não presumir ausência com base em outro workspace. Se alguma skill estiver ausente, procurar fonte autorizada e registrar a limitação, sem inventar conteúdo ou alegar leitura.

Aplicar apenas as orientações compatíveis com a Oplyra. Trechos específicos de CRM Imob L4S, L4S ou Lovable não autorizam importar stack, regras de negócio ou dependências desses produtos. Registrar os trechos desconsiderados e o motivo; a decisão greenfield e as instruções explícitas da Oplyra prevalecem.

## Estágio atual e roadmap

### Harness: orientação, execução e verificação dos agentes

A documentação do harness está organizada em:

- [Desenvolvimento](docs/harness/DESENVOLVIMENTO.md): ciclo de trabalho, contexto, permissões, decisões, recuperação e critérios de conclusão.
- [Developer / AI Harness](docs/harness/DEVELOPMENT-TOOLS.md): ferramentas, Context7, Playwright, Local First, versionamento e separação do runtime do produto.
- [Usuários sintéticos](docs/harness/SYSTEM-TEST-USERS.md): tenants, personas, roles reais e taxonomia de testes de sistema.
- [Autonomous Build](docs/harness/AUTONOMOUS-BUILD.md): preparação em draft, desativada, com hard blockers e critérios de ativação.
- [Estado do trabalho](docs/harness/ESTADO.md): situação real, pendências, aprovações e próximo passo para retomada.
- [Verificações](docs/harness/VERIFICACOES.md): gates documentais e cenários que deverão se tornar checks executáveis por incremento.
- [Publicação incremental](docs/harness/PUBLICACAO.md): ambientes, aprovação por versão, migrations, configuração, verificação e recuperação.
- [Agentes do produto](docs/harness/PRODUTO.md): contratos e requisitos de execução, autorização, memória, avaliação e recuperação dos agentes de marketing.

O Developer Harness possui scripts locais, CI, Claude Code, Context7 MCP e Playwright MCP configurados em versões fixas, com guard Local First e checks registrados no [estado](docs/harness/ESTADO.md). Inicie uma sessão com `pnpm claude:local`, o launcher oficial (falha fechado, MCPs do projeto e tooling isolado em `tools/developer-harness/`, fora do workspace do produto); o guard é defesa em profundidade, não sandbox. Quanto ao produto: a **arquitetura** do Product AI Model Harness segue o documento 13 e o ADR-0006; o **slice 1 do Product AI Model Harness** (portas, Test Adapter, Registry, Model Profiles, Router) e o **Cost Ledger persistente** estão implementados **somente localmente**; o **Product Agent Runtime** (existem componentes parciais), filas e scheduler de produto, integração Stripe, adapters reais e produção continuam **pendentes ou não autorizados**. Instruções em Markdown não substituem controles executáveis. A disponibilidade e a aplicação das skills devem ser verificadas no repositório em uso e registradas no estado do trabalho.

O discovery entregou (registro histórico): problema e jornada validados, recorte do MVP, linguagem ubíqua, contextos e contratos, arquitetura com Supabase local via Docker e produção incremental, proposta de isolamento/RLS, billing e entitlements, integrações, catálogo e governança dos agentes, UX inicial, custos, riscos e questões abertas.

A documentação fica em `docs/product/marketing-ops/`: requisitos, discovery, domínio, arquitetura, modelo de dados conceitual, integrações, segurança, billing/entitlements, arquitetura e catálogo de agentes, governança e roadmap. Conferir o índice e o estado antes de produzir ou atualizar entregas; preservar o documento de transição original.

**Fora do escopo de um incremento autorizado, parar e apresentar a proposta para aprovação explícita antes de migrations ou implementação estrutural.** Aprovar um documento não equivale a autorizar sua implementação.

| Fase | Resultado esperado |
| --- | --- |
| 0 — Discovery | Concluída: produto validado e arquitetura proposta; aprovação registrada no estado do trabalho. |
| 1 — Fundação SaaS | Supabase local, identidade, tenancy, RBAC, entitlements, integração Stripe, auditoria e contratos de runtime/Registry/Router/Eval Engine/Cost Ledger, validados antes da ativação paga. |
| 2 — Performance MVP | Estratégia, copy, geração/edição de imagens, aprovações, mídia em leitura, dashboard e conversões; avaliações e medição de custo dos workflows ativos. |
| 3 — Performance operacional | Recomendações, alertas, atribuição básica, experimentos e relatórios agendados. |
| 4 — Growth MVP | Agenda, social, e-mail, segmentos, réguas, n8n e visão cross-channel. |
| 5 — Comercialização | Onboarding self-service, templates, suporte, trial, billing completo e clientes beta. |
| 6 — Escala | Conectores, parceiros, white-label, automação controlada e novos segmentos. |

Permanecem abertas decisões sobre preços, excedentes, cobrança de pilotos, semântica e viabilidade dos limites, serviço humano, fornecedor de e-mail, modelos concretos e parâmetros após o EXP-05, adapters diretos adicionais, primeiro conector dedicado, stack complementar, política de dados para IA, suporte e SLAs. OpenRouter como gateway inicial não exclusivo, mercado SaaS B2B, Stripe, Supabase, greenfield, multi-tenancy e Performance primeiro não são escolhas em aberto. Consulte ATUALIZACOES para budgets e pendências econômicas.
