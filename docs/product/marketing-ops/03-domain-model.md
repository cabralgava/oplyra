# Oplyra — Domain Model

**Versão documental:** 0.2  
**Data:** 11 de setembro de 2026  
**Autoridade:** detalhamento do 00 v2.2, com decisões posteriores e regra de ancoragem em [ATUALIZACOES](ATUALIZACOES.md). Citar `DEC-0xx` apenas quando o identificador existir na v2.2. Propostas técnicas permanecem propostas.

**Status:** modelo conceitual inicial; refinar com DDD durante discovery

## 1. Princípios

- domínio independente de fornecedores;
- integrações externas por adapters;
- planos não devem contaminar regras de negócio;
- entitlements controlam acesso a capacidades;
- tenant é fronteira obrigatória de isolamento;
- agentes e execuções pertencem ao contexto operacional da Oplyra, não a provedores de IA.

## 2. Linguagem ubíqua inicial

| Termo | Significado |
|---|---|
| Tenant | Empresa/organização cliente isolada na plataforma |
| Membership | Relação entre usuário e tenant |
| Brand OS | Regras, verdade de produto, voz e critérios de aprovação da marca |
| Campaign | Contêiner que conecta objetivo, mensagem, execução, mídia e resultado |
| Content | Unidade textual/visual versionada produzida ou gerenciada pela plataforma |
| Approval | Decisão humana ou política explícita que autoriza uma entrega/ação |
| Agent | Papel operacional digital especializado |
| Agent Run | Execução auditável de um agente |
| Workflow | Processo versionado que coordena ações, agentes e regras |
| Entitlement | Direito funcional concedido por assinatura/plano |
| Usage Meter | Medidor de uso comercial/econômico |
| AI Action | Unidade econômica/operacional executada com IA |
| Effective Cost per Successful Action | Custo total de execuções/retries/revisões dividido por ações aprovadas |
| Connection | Integração configurada com sistema externo |
| Touchpoint | Interação atribuível na jornada comercial |
| Attribution Result | Resultado de atribuição com nível de confiança |
| Source Asset | Ativo enviado pelo cliente, inclusive vídeo, usado como entrada de análise |
| Derived Insight | Transcrição, resumo ou análise produzida a partir de um Source Asset |
| Campaign Hypothesis | Suposição explícita que um teste pretende verificar |
| Learning | Conclusão registrada de um teste, com evidência e limitação |

## 3. Bounded contexts candidatos

### Identity & Tenancy

- tenants;
- users;
- memberships;
- roles;
- permissions.

### Subscription & Entitlements

- plans;
- entitlements;
- subscriptions;
- usage meters;
- invoices;
- economic budgets.

### Brand

- brand profiles;
- brand versions;
- products;
- personas;
- message frameworks;
- truth/claims.

### Strategy

- objectives;
- KPIs;
- campaigns;
- experiments.

### Work Management

- projects;
- tasks;
- comments;
- approvals;
- risks;
- decisions.

### Content & Assets

- contents;
- content versions;
- assets;
- image generations;
- image edits;
- asset ingestions;
- asset transcripts;
- asset insights;
- evidence.

Vídeo enviado pelo cliente é ativo de entrada: a plataforma analisa e gera derivados textuais, mas não gera, edita nem renderiza vídeo (DEC-014).

### Paid Media

- ad accounts;
- campaigns/ads espelhados de sistemas externos;
- metric snapshots;
- recommendations.

### Email & Lifecycle — Growth

- sender profiles;
- templates;
- campaigns;
- deliveries/events;
- suppressions;
- automations;
- versions;
- enrollments;
- executions.

### Agentic Operations

- agent definitions;
- agent versions;
- agent runs;
- agent messages;
- evaluations;
- tool calls;
- schedules;
- memories;
- human escalations.

### AI Routing & FinOps

- model registry;
- routing policies;
- eval results;
- AI cost ledger;
- action catalog;
- cost budgets;
- provider health.

### Integrations

- connections;
- credentials;
- webhooks;
- sync runs;
- dead letters.

### Analytics & Attribution

- touchpoints;
- attribution results;
- reports;
- audit logs.

## 4. Regras de domínio importantes

1. Nenhum conteúdo de um tenant pode alimentar contexto de outro tenant.
2. Nenhuma ação crítica deve ser executada sem permissão, política ou aprovação exigida.
3. Entitlements definem acesso; código de domínio não deve usar condicionais espalhadas por nome de plano.
4. Modelos/provedores de IA são infraestrutura substituível.
5. O custo econômico é atributo de execução e deve ser auditável.
6. Atribuição estimada nunca deve ser exibida como exata.
7. Integrações externas não definem o modelo interno do domínio.

## 5. Agregados candidatos

A modelagem final deverá ser confirmada durante DDD. Candidatos:

- Tenant + Memberships;
- Brand Profile + Brand Version;
- Campaign;
- Content + Content Version;
- Approval;
- Subscription + Entitlements + Usage Meter;
- Agent Definition + Agent Version;
- Workflow/Agent Run;
- Connection;
- Automation + Automation Version;
- Report;
- AI Action Cost Record.

## 6. Próximas decisões de DDD

- fronteiras transacionais reais;
- eventos de domínio;
- políticas de consistência;
- contratos entre bounded contexts;
- invariantes de billing/uso;
- modelagem do catálogo econômico de ações.

## 7. Invariantes com IDs estáveis

Consolidação para rastreabilidade desta revisão; não é transcrição das versões antigas ausentes.

| ID | Regra | Cenários |
| --- | --- | --- |
| I-TEN | Dados, referências, jobs, memória e arquivos não cruzam tenants; tenant não pode ser trocado para contornar isolamento. | TST-03/04/05/08 |
| I-MEM | Acesso exige vínculo ativo e permissão no momento da operação; preservar ao menos um Owner conforme proposta de I-01. | TST-03/11 |
| I-CMP | Campanha referencia objetivo/produto do mesmo tenant; chave de rastreamento permanece estável após ativação. | I-04 no plano de testes |
| I-DLV | Entrega e ativo têm versões; alteração cria nova versão, preserva origem e invalida aprovação anterior para o novo conteúdo. | TST-10/15 |
| I-APR | Aprovação é vinculada à versão, escopo, validade e aprovador autorizado; executor não aprova a própria saída automaticamente. | TST-10 |
| I-AST | Derivado de ativo — transcrição, frame, resumo, análise ou copy — herda tenant, permissões e retenção do ativo de origem e nunca alcança contexto de outro tenant (DEC-015). | TST-08 |
| I-HYP | Teste registra a hipótese e a dimensão variada antes da execução; resultado sem dado suficiente é inconclusivo, não sucesso (DEC-017). | I-04 no plano de testes |

## 8. Correspondência dos contextos antigos

| Nome legado nos anexos | Responsabilidade no modelo atual |
| --- | --- |
| Identidade / identity-access | Identity & Tenancy |
| Assinatura / entitlements | Subscription & Entitlements |
| Operação | Work Management |
| Estúdio de Conteúdo | Content & Assets |
| Governança | Políticas transversais em 11; aprovação pertence a Work Management e referencia a versão de Content & Assets |
| Sinais Comerciais / commercial-signals | Integrations recebe/normaliza; Analytics & Attribution interpreta sinais e atribuição, sem CRM próprio |
| Mensuração / reporting | Analytics & Attribution |
| agent-operations | Agentic Operations; seleção e custo em AI Routing & FinOps |

Esses nomes históricos não criam contextos adicionais implicitamente. Contratos cruzam fronteiras por IDs/eventos, sem acesso direto aos agregados internos de outro contexto.
