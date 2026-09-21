# Oplyra Context Stack

## Especificação de contexto para a arquitetura multiagentes

**Versão:** 1.0  
**Data:** 16 de setembro de 2026  
**Status:** Aprovado  
**Escopo:** todos os tenants, agentes, workflows e execuções da Oplyra  
**Documento relacionado:** `20-agent-transaction-protocol.md`

---

## 1. Objetivo

O **Oplyra Context Stack** define como o conhecimento utilizado pela plataforma é organizado, versionado, recuperado, reduzido e entregue aos agentes em cada execução.

Princípio central:

> **Todo agente deve receber o fundamento necessário para compreender a empresa e apenas o contexto adicional necessário para executar corretamente a atividade atual.**

O contexto não deve ser tratado como um prompt monolítico. A Oplyra organiza contexto em camadas com autoridade, escopo, temporalidade e governança próprios.

```text
L0 — Oplyra Constitution
        ↓
L1 — Tenant Foundation
        ↓
L2 — Brand & Business Truth
        ↓
L3 — Tenant Operational Context
        ↓
L4 — Domain Context
        ↓
L5 — Initiative Context
        ↓
L6 — Experiment Context
        ↓
L7 — Task & Conversation Context
        ↓
L8 — Immediate Request
        ↓
Context Assembly
        ↓
Agent Execution
```

Em paralelo, toda a pilha utiliza um **Evidence & Provenance Layer** transversal.

---

## 2. Princípios do Context Stack

### 2.1 Contexto antes da execução

Nenhum agente deve executar uma tarefa relevante apenas a partir de uma instrução curta quando existirem informações empresariais necessárias para interpretá-la corretamente.

Uma solicitação como:

```text
Crie três anúncios para LinkedIn.
```

deve ser interpretada, quando aplicável, com:

```text
Empresa
→ Produto
→ Público
→ Posicionamento
→ Objetivo
→ Iniciativa
→ Hipótese
→ Tarefa
→ Pedido imediato
```

### 2.2 Fundamento e atividade são diferentes

A Oplyra separa:

- **fundamento:** fatos relativamente estáveis sobre a empresa, negócio, marca, produtos e regras;
- **estado operacional:** o que está acontecendo agora;
- **atividade:** iniciativa, experimento, tarefa e pedido atual.

### 2.3 Relevância é mais importante que volume

```text
relevância > volume
```

Não enviar todo o histórico do tenant para todo agente.

### 2.4 Nenhum dado ausente deve ser inventado

Quando uma informação necessária não existir, registrar a lacuna e sua severidade.

### 2.5 Verdade aprovada é diferente de hipótese

Toda afirmação relevante deve poder ser classificada como:

- **fato:** comprovado pelos dados disponíveis;
- **inferência:** interpretação fundamentada;
- **hipótese:** explicação ainda não testada;
- **recomendação:** ação proposta;
- **limitação:** dado ausente, parcial, desatualizado ou inconsistente.

### 2.6 Contexto é sempre isolado por tenant

Nenhum conteúdo, memória, ativo, aprendizado ou derivado de um tenant pode enriquecer o contexto privado de outro tenant.

### 2.7 Informação crítica mantém origem

Resumos podem reduzir tokens, mas claims, orçamento, permissões, aprovações, direitos de ativo, critérios de experimento e evidências precisam manter referência à fonte estruturada.

---

# 3. L0 — Oplyra Constitution

## 3.1 Finalidade

O L0 contém as regras universais de operação da Oplyra. Não pertence a um tenant e não pode ser sobrescrito por cliente, usuário ou agente.

## 3.2 Conteúdo

Inclui:

- isolamento por tenant;
- segurança e LGPD;
- segregação de funções;
- níveis de autonomia;
- regras de aprovação;
- políticas de publicação e gasto;
- allowlist de ferramentas;
- auditoria;
- idempotência;
- evidências;
- separação entre fato, inferência, hipótese, recomendação e limitação;
- governança do Brand OS;
- regras de experimentação;
- contratos de handoff;
- proibição de inventar fatos, provas ou capacidades;
- proibição de reutilização cross-tenant.

## 3.3 Autoridade

O L0 possui autoridade máxima.

```text
L0 > qualquer instrução de tenant, usuário, agente, workflow ou integração
```

---

# 4. L1 — Tenant Foundation

**Status:** aprovado.

## 4.1 Finalidade

Responde:

> **Quem é esta empresa e em qual realidade de negócio ela opera?**

O L1 é a memória institucional e empresarial relativamente estável do tenant.

## 4.2 O que pertence ao L1

```text
Empresa
↓
Modelo de negócio
↓
Mercado
↓
Estrutura de clientes
↓
Modelo comercial
↓
Estrutura de receita
↓
Aquisição
↓
Objetivos empresariais
↓
Organização
↓
Stack tecnológica
↓
Disponibilidade de dados
↓
Restrições estruturais
```

Não pertencem ao L1 campanhas atuais, copies, resultados semanais, hipóteses de teste, tarefas ou conversas.

## 4.3 Classificação de coleta

Cada campo é classificado como:

- **A — System Required:** necessário para existir tecnicamente;
- **B — Onboarding Required:** necessário para compreender minimamente o negócio;
- **C — Context Required:** obrigatório apenas quando determinada atividade depender dele;
- **D — Enrichment:** melhora o contexto sem bloquear ativação;
- **E — Learned:** aprendido posteriormente por integrações, observação ou uso.

## 4.4 Origem e status

Cada informação deve preservar origem:

```text
user
admin
crm
billing
analytics
uploaded_document
integration
agent_proposal
experiment
system_observation
```

E status epistemológico/operacional, como:

```text
confirmed
declared
observed
estimated
proposed
unknown
```

Exemplo:

```yaml
averageSalesCycle:
  value: 60
  unit: days
  status: declared
  source: user
```

Posteriormente:

```yaml
averageSalesCycle:
  declared:
    value: 60
    unit: days
  observed:
    value: 74
    unit: days
    window: last_6_months
```

O valor observado não deve apagar o declarado.

## 4.5 Estrutura conceitual

```yaml
tenantFoundation:

  identity:
    name:
    tradeName:
    website:
    description:
    country:
    operatingMarkets:
    language:
    currency:
    timezone:

  market:
    category:
    segment:
    subsegment:
    internalCategory:
    buyerCategory:

  businessModel:
    commercialType:
    revenueModel:
    goToMarketMotion:
    purchaseMotion:

  revenue:
    recurring:
    billingFrequency:
    averageContractValue:
    arr:
    mrr:
    averageRevenuePerAccount:

  customers:
    primaryProfile:
    companySize:
    revenueRange:
    industries:
    regions:

  commercial:
    salesCycle:
    pipelineStages:
    qualifiedLeadDefinition:
    opportunityDefinition:
    wonDefinition:

  acquisition:
    channels:
    priorityChannels:
    paidMediaPlatforms:

  products:
    productIds:

  objectives:
    strategicObjectives:

  organization:
    companySize:
    marketingTeamSize:
    salesTeamSize:
    functions:

  technology:
    crm:
    analytics:
    ads:
    email:
    automation:
    billing:
    otherSystems:

  dataAvailability:
    leads:
    qualifiedLeads:
    meetings:
    opportunities:
    proposals:
    contracts:
    revenue:
    dataSources:

  constraints:
    structuralConstraints:

  competition:
    competitors:
    alternatives:

  metadata:
    version:
    completeness:
    createdAt:
    updatedAt:
```

## 4.6 Onboarding progressivo

O onboarding não deve ser um formulário excessivo.

### Etapa 1 — Empresa

- nome;
- site;
- descrição;
- mercado;
- país;
- moeda;
- timezone.

### Etapa 2 — Negócio

- como ganha dinheiro;
- recorrência;
- self-service, consultivo ou híbrido;
- quem compra;
- mercados atendidos.

### Etapa 3 — Produtos

- produtos;
- produto principal;
- disponibilidade/beta/futuro.

### Etapa 4 — Clientes

- tipo de empresa;
- tamanho;
- participantes da compra.

### Etapa 5 — Marketing e vendas

- canais;
- mídia;
- origem de leads;
- CRM;
- etapas entre lead e cliente.

### Etapa 6 — Objetivo

Pergunta central:

> O que você mais precisa melhorar agora?

### Etapa 7 — Sistemas

Conectar, quando aplicável, CRM, Ads, Analytics, Billing e E-mail.

### Etapa 8 — Foundation Review

Mostrar:

> Foi isso que entendemos sobre sua empresa.

Permitir confirmar, editar ou completar depois.

## 4.7 Onboarding mínimo

```text
Nome
+
Descrição
+
Mercado
+
Modelo de negócio
+
Tipo de cliente
+
Produto principal
+
Objetivo
+
País
+
Moeda
+
Timezone
```

## 4.8 Progressive Context Acquisition

A Oplyra pergunta contexto adicional quando ele se torna necessário.

Exemplo: para calcular CAC, solicitar os dados que faltam apenas naquele momento.

## 4.9 IA como proponente

A IA pode sugerir preenchimentos após analisar website ou documentos, mas:

```yaml
status: proposed
source: ai_analysis
```

até aprovação ou evidência suficiente.

## 4.10 Critério de qualidade

O L1 deve permitir responder:

- quem é a empresa;
- o que vende;
- como ganha dinheiro;
- para quem vende;
- como vende;
- onde opera;
- que resultado busca;
- quais dados possui;
- quais sistemas utiliza;
- quais restrições permanentes existem;
- o que ainda não se sabe.

---

# 5. L2 — Brand & Business Truth

**Status:** aprovado.

## 5.1 Finalidade

Responde:

> **O que esta empresa pode dizer sobre si, seus produtos, seus clientes e suas ofertas — e com qual fundamento?**

O L2 é a fonte de verdade aprovada para marca e negócio.

## 5.2 Princípio

> **Agentes não criam verdade empresarial. Eles utilizam, questionam, testam e propõem evoluções da verdade empresarial.**

Aprendizado segue:

```text
Evidência
↓
Análise
↓
Proposta
↓
Revisão
↓
Aprovação
↓
Nova versão
```

## 5.3 Estrutura

```yaml
brandBusinessTruth:

  brandCore:
    positioning:
    centralThesis:
    manifesto:
    valueProposition:
    differentiators:
    brandCategory:

  products:
    - id:
      name:
      status:
      description:
      audienceIds:
      problemIds:
      mechanism:
      features:
      benefits:
      outcomes:
      limitations:
      claimIds:
      proofIds:

  audiences:
    - id:
      icp:
      personas:
      buyingCommittee:
      situations:
      pains:
      consequences:
      desires:
      objections:
      triggers:
      jobsToBeDone:
      awareness:

  mechanisms:
    - id:
      productId:
      description:
      steps:
      evidenceRefs:

  proofs:
    - id:
      type:
      statement:
      source:
      scope:
      limitations:
      authorizedUse:

  offers:
    - id:
      type:
      productIds:
      audienceIds:
      conditions:
      nextStep:
      status:

  messaging:
    thesis:
    pillars:
    angles:
    narrativeFrameworks:

  claims:
    allowed:
    conditional:
    evidenceRequired:
    forbidden:
    deprecated:

  voice:
    attributes:
    preferredTerms:
    forbiddenTerms:
    contextVariations:

  competition:
    competitors:
    alternatives:
    comparisonRules:

  creativeSystem:
    designSystemRef:
    visualPrinciples:
    templates:
    assetUsageRules:

  approval:
    checklists:
    requiredReviewers:

  learning:
    learningRecords:
    proposedUpdates:

  metadata:
    version:
    status:
    completeness:
    createdAt:
    updatedAt:
```

## 5.4 Estados de governança

```text
draft
proposed
approved
active
conditional
disputed
deprecated
archived
```

## 5.5 Knowledge status

```text
declared
documented
observed
validated
hypothesis
inference
unknown
```

Governança e força epistemológica são campos diferentes.

## 5.6 Product Truth

Cada produto deve manter:

- estado real: `available`, `beta`, `pilot`, `future`, `internal`, `paused`, `discontinued`;
- público;
- problema;
- mecanismo;
- features;
- benefícios;
- outcomes;
- limitações;
- claims;
- provas.

Features, benefícios e outcomes são conceitos distintos.

## 5.7 Audience Truth

Separar:

```text
ICP
↓
Buying Committee
↓
Personas
```

Cada persona/contexto pode conter:

- situação;
- dor percebida;
- problema inferido;
- consequência;
- desejo;
- jobs to be done;
- objeções;
- gatilhos;
- nível de consciência;
- papel na compra;
- evidências.

## 5.8 Estrutura narrativa

Campanhas podem usar:

```text
Situação
→ Dor
→ Consequência
→ Desejo
→ Mecanismo
→ Prova
→ Oferta
```

A estrutura orienta estratégia, mas não obriga cada peça a expor todos os elementos.

## 5.9 Proof System

Tipos possíveis:

```text
customer_case
testimonial
internal_metric
external_research
certification
integration
product_demo
benchmark
technical_evidence
experiment
other
```

Toda prova registra fonte, data, escopo, uso autorizado e limitações.

Uma prova local nunca deve ser universalizada indevidamente.

## 5.10 Offers

Produto e oferta não são equivalentes.

Oferta registra o próximo passo:

```text
demo
trial
diagnóstico
webinar
download
lista_de_espera
proposta
```

e condições, disponibilidade e disclosures.

## 5.11 Messaging Architecture

```text
Central Thesis
↓
Message Pillars
↓
Supporting Arguments
↓
Proof
↓
Angles
↓
Hooks
```

Hooks e copies são mais voláteis que tese e pilares.

## 5.12 Claims Governance

Tipos:

```text
allowed
conditional
evidence_required
forbidden
deprecated
```

Claims condicionais devem registrar condições técnicas, comerciais, geográficas ou de plano.

## 5.13 Voice

A marca pode variar por contexto — executivo, social, suporte, mídia — sem sair do Brand OS.

## 5.14 Competition

Concorrentes e alternativas podem ser registrados, mas comparação externa precisa distinguir fato verificável de opinião interna.

## 5.15 Learning governance

Resultados de campanhas criam `learningRecords`, não alteram diretamente a verdade.

```yaml
learningRecord:
  source:
    experimentId:
  audience:
  context:
  observation:
  evidence:
  conclusion:
  confidence:
  proposedChanges:
  reviewStatus:
```

## 5.16 Context completeness

A plataforma deve indicar:

- o que sabemos bem;
- o que acreditamos;
- o que está incompleto;
- o que é desconhecido.

## 5.17 Versionamento

Campanhas e experimentos preservam a versão do L2 utilizada. Uma persona v5 não altera retroativamente testes executados com persona v3.

---

# 6. L3 — Tenant Operational Context

**Status:** aprovado.

## 6.1 Finalidade

Responde:

> **O que está acontecendo agora na operação desta empresa?**

É uma camada temporal e mutável.

## 6.2 Conteúdo

```text
Objetivos atuais
+
Metas
+
KPIs
+
Prioridades
+
Orçamento
+
Iniciativas
+
Campanhas
+
Projetos
+
Capacidade
+
Riscos
+
Blockers
+
Decisões
+
Aprovações
+
Integrações
+
Data Health
+
Resultados recentes
+
Anomalias
+
Aprendizados
+
Mudanças
```

## 6.3 Estrutura

```yaml
tenantOperationalContext:

  period:
    type:
    label:
    startDate:
    endDate:

  objectives:
  priorities:
  kpis:
  budget:
  activeInitiatives:
  activeCampaigns:
  projects:
  capacity:
  risks:
  blockers:
  pendingDecisions:
  recentDecisions:
  approvals:
  integrations:
  dataHealth:
  recentPerformance:
  anomalies:
  alerts:
  learnings:
  changes:
  cadence:
  upcomingMilestones:
  activeRecommendations:
  humanEscalations:
  operationalSummary:

  metadata:
    version:
    capturedAt:
```

## 6.4 Objetivo, meta e KPI

Exemplo:

```text
Objetivo:
Aumentar pipeline qualificado.

Meta:
R$ 3M no Q4.

KPI:
Pipeline qualificado gerado.
```

## 6.5 Hierarquia

```text
Objetivo empresarial
↓
Objetivo de marketing
↓
Objetivo de campanha
↓
Métrica
```

## 6.6 Data semantics

Ausência não é zero.

```yaml
revenue:
  value: null
  status: unavailable
```

## 6.7 Budget

Separar:

```text
approved
allocated
committed
spent
remaining
```

e registrar guardrails.

## 6.8 Risks, issues e blockers

- **risk:** pode acontecer;
- **issue:** já está acontecendo;
- **blocker:** impede execução.

## 6.9 Integration health

Estados:

```text
connected
degraded
error
expired
disconnected
syncing
unknown
```

Registrar freshness e última sincronização bem-sucedida.

## 6.10 Data Health

Estados:

```text
confirmed
probable
estimated
partial
unavailable
```

Também registrar cobertura e freshness.

## 6.11 Anomalia não é causa

Exemplo:

- fato: leads caíram 30%;
- hipótese: fadiga criativa causou a queda.

Nunca misturar os dois.

## 6.12 Context snapshots

Salvar snapshots em eventos como:

- início do trimestre;
- criação/aprovação de campanha;
- início de experimento;
- check-in semanal;
- relatório mensal;
- mudança estratégica.

Isso permite reconstruir o contexto histórico de uma decisão.

## 6.13 Freshness policy

Cada tipo de dado pode possuir SLA de atualização.

Exemplo conceitual:

```yaml
freshnessPolicy:
  paidMediaMetrics:
    maxAge: 24h
  budget:
    maxAge: 24h
  crmPipeline:
    maxAge: 48h
  strategicObjectives:
    maxAge: 30d
```

Ao exceder, marcar `stale`.

## 6.14 Source policy

Fontes preferenciais podem variar por métrica, sem esconder divergências.

Exemplo:

```yaml
sourcePolicy:
  adSpend:
    preferred: advertising_platform
  pipeline:
    preferred: crm
  revenue:
    preferred: billing
```

---

# 7. L4 — Domain Context

**Status:** aprovado.

## 7.1 Finalidade

Responde:

> **Qual parte do contexto completo do tenant é relevante para esta especialidade e para este tipo de trabalho?**

O L4 é o mecanismo de especialização e redução contextual.

## 7.2 Domínios iniciais

```text
orchestration
strategy_quality
project_management
paid_media
copywriting
design
performance
reporting
social_media
email_marketing
lifecycle
revenue_intelligence
assets
experimentation
```

## 7.3 Domain Context não é prompt nem permissão

- **Domain Context:** informa o que o domínio precisa conhecer;
- **Agent Prompt:** define identidade, responsabilidade e modo de trabalho;
- **Permission:** define o que pode ler, escrever, aprovar ou executar.

Conhecer orçamento não significa poder alterá-lo.

## 7.4 Estrutura

```yaml
domainContext:
  domain:
    key:
    version:

  scope:
    tenantId:
    relatedObjects:

  requiredContext:
  optionalContext:
  conditionalContext:
  specializedKnowledge:
  metrics:
  constraints:
  policies:
  dataSources:
  tools:
  missingContext:
  freshness:
  evidence:
  metadata:
```

## 7.5 Context Policy

Exemplo:

```yaml
domainContextPolicy:
  domain: copywriting

  required:
    - product
    - audience
    - brandVoice
    - objective

  conditional:
    campaign_copy:
      - campaign
    experiment_copy:
      - experiment
      - hypothesis
    asset_based_copy:
      - asset
      - assetAnalysis

  optional:
    - historicalPerformance
    - previousCopy

  forbidden:
    - unrelatedTenantData
```

## 7.6 Domínio por agente

| Domínio | Owner principal |
|---|---|
| orchestration | Orquestrador |
| project_management | Account e Projetos |
| paid_media | Mídia Paga |
| copywriting | Copywriting |
| design | Design |
| strategy_quality | Estratégia e Qualidade |
| performance | Performance e Inteligência |
| reporting | Relatórios e Check-ins |
| social_media | Social Media |
| email_marketing | E-mail Marketing |
| lifecycle | Lifecycle |
| revenue_intelligence | Revenue Intelligence |

## 7.7 Exemplos de recorte

### Copywriting

```text
Produto
Público
Situação
Dor
Consequência
Desejo
Mecanismo
Prova
Oferta
Objetivo
Voice
Claims
Canal
Formato
Hipótese, quando aplicável
```

### Paid Media

```text
Objetivo
Campanha
Produto
Público
Oferta
Claims
Provas
Criativos
Orçamento
Canal
Tracking
Conversões
Performance
Experimento
Autonomia
```

### Revenue Intelligence

```text
Campanhas
Touchpoints
Leads
Qualificação
Reuniões
Oportunidades
Propostas
Contratos
Receita
Sales cycle
Attribution
Coverage
CRM
Billing
```

## 7.8 Global knowledge versus tenant context

Separar:

```text
Global Domain Knowledge
```

de:

```text
Tenant Domain Context
```

Boas práticas podem ser globais. Dados privados e aprendizados de clientes nunca são globais.

## 7.9 Handoff por referências

O handoff deve transportar intenção, decisões, referências e output esperado. O agente receptor recupera seu próprio L4.

```yaml
handoff:
  id:
  fromAgent:
  toAgent:
  task:
  objective:
  inputRefs:
  decisionsMade:
  openQuestions:
  constraints:
  expectedOutput:
```

## 7.10 Context quality

Avaliar separadamente:

```text
completeness
freshness
consistency
evidence
authority
```

## 7.11 Context pollution e drift

Riscos:

- excesso de histórico;
- contexto irrelevante;
- dados conflitantes;
- dados stale;
- resumos sucessivos que se afastam da fonte.

Informações críticas sempre preservam provenance.

---

# 8. L5 — Initiative Context

**Status:** aprovado.

## 8.1 Finalidade

Responde:

> **Em qual iniciativa concreta estamos trabalhando e o que precisa ser verdade para que ela alcance seu objetivo?**

A iniciativa é um esforço coordenado, não uma tarefa individual.

## 8.2 Tipos

```text
campaign
launch
growth_program
content_program
lifecycle_program
reactivation
event
project
market_entry
product_marketing
other
```

No MVP Performance, `campaign` é o tipo principal.

## 8.3 Campaign as container

```text
Objetivo
↓
Produto
↓
Público
↓
Problema
↓
Mensagem
↓
Oferta
↓
Produção
↓
Distribuição
↓
Leads
↓
Pipeline
↓
Receita
↓
Aprendizado
```

## 8.4 Estrutura

```yaml
initiativeContext:

  initiative:
    id:
    tenantId:
    type:
    name:
    description:
    status:
    health:

  objective:
    parentObjectiveId:
    description:
    businessOutcome:
    primaryMetric:
    secondaryMetrics:
    target:
    period:

  scope:
    included:
    excluded:
    markets:
    segments:
    products:
    channels:
    constraints:

  product:
  offer:
  audience:
  problemContext:
    situation:
    pain:
    consequence:
    desire:
    objections:
    triggers:
    awarenessLevel:

  mechanism:
  proofContext:
  messageDirection:
  channels:
  timeline:
  commercialMaturation:
  budget:
  budgetGuardrails:
  owners:
  participatingAgents:
  agentAssignments:
  workstreams:
  deliverables:
  assets:
  experiments:
  dependencies:
  blockers:
  risks:
  approvals:
  qualityGates:
  tracking:
  dataSources:
  dataHealth:
  attribution:
  results:
  decisions:
  learnings:
  nextActions:
  phase:
  readiness:
  contextVersions:
  metadata:
```

## 8.5 Initiative não é task nem experiment

```text
Initiative:
O que queremos realizar?

Experiment:
O que queremos aprender?

Task:
Qual unidade de trabalho precisa ser executada?
```

## 8.6 Business outcome

Possíveis:

```text
awareness
engagement
lead
qualified_lead
meeting
opportunity
proposal
contract
revenue
retention
expansion
reactivation
```

## 8.7 Métrica principal

Priorizar o estágio de negócio mais próximo do objetivo real com dados confiáveis.

CTR/CPL podem ser secundários/diagnósticos.

## 8.8 Proof gap

A iniciativa deve registrar se existe falta de prova suficiente, podendo gerar uma tarefa própria.

## 8.9 Message direction

É orientação estratégica, não copy final.

```yaml
messageDirection:
  primaryAngle:
  secondaryAngles:
  primaryPromise:
  keyArguments:
  objectionsToAddress:
  proofRefs:
  CTA:
```

## 8.10 Timeline e maturação

Distinguir:

- fim da distribuição;
- fim da medição;
- janela de maturação comercial.

## 8.11 Quality gates

Exemplo:

```text
Strategy Gate
↓
Creative Gate
↓
Publication Gate
↓
Measurement Gate
```

Podem combinar validação determinística, Strategy & Quality Agent e aprovação humana.

## 8.12 Initiative readiness

Dimensões:

```text
strategy
creative
tracking
budget
approval
data
```

Não reduzir a um percentual cego quando um único blocker impedir lançamento.

## 8.13 Versioning

Toda iniciativa preserva as versões de L1/L2, produto, persona e oferta utilizadas.

---

# 9. L6 — Experiment Context

**Status:** aprovado.

## 9.1 Finalidade

Responde:

> **O que estamos tentando aprender e quais evidências serão necessárias para sustentar uma conclusão?**

## 9.2 Princípio

> Uma variação só é experimento quando existe hipótese explícita e pergunta de aprendizado.

Variações cosméticas podem ser produção, sem serem tratadas como experimento.

## 9.3 Tipos

```text
controlled_ab
controlled_multivariate
sequential_test
holdout
channel_comparison
creative_comparison
message_test
offer_test
landing_page_test
email_test
observational
other
```

O desenho real determina a linguagem causal permitida.

## 9.4 Estrutura

```yaml
experimentContext:

  experiment:
    id:
    tenantId:
    initiativeId:
    name:
    type:
    status:

  question:

  hypothesis:
    audience:
    context:
    change:
    expectedEffect:
    metric:
    rationale:
    source:

  scope:

  variable:
    dimension:
    description:

  constants:
  variants:
  audience:
  channel:
  placements:
  distribution:
    planned:
    actual:
  budget:
  period:
  measurement:
    primaryMetric:
    secondaryMetrics:
    diagnosticMetrics:
    proxyMetric:
    source:
    conversionWindow:
  attribution:
  commercialMaturation:
  sufficiency:
  statisticalContext:
  decisionCriteria:
  guardrails:
  approvals:
  readiness:
  risks:
  limitations:
  externalFactors:
  observations:
  results:
  comparison:
  conclusion:
  learning:
  replication:
  nextExperiment:
  experimentFamily:
  contextVersions:
  metadata:
```

## 9.5 Hypothesis format

```text
Para [público/contexto],
acreditamos que [mudança]
produzirá [efeito]
em [métrica]
porque [justificativa].
```

Deve ser falsificável.

## 9.6 Variable e constants

Quando o objetivo for isolar um efeito, registrar a dimensão alterada e o que permanece constante.

Se várias dimensões mudarem, a conclusão deve se limitar ao conjunto criativo, não a um elemento específico.

## 9.7 Distribution

Preservar planejado e realizado.

```text
planned: 50/50
actual: 62/38
```

Diferenças viram limitações.

## 9.8 Measurement

Métrica primária deve responder à hipótese.

Quando possível, priorizar:

```text
qualified_lead
meeting
opportunity
proposal
contract
revenue
```

Métricas intermediárias apoiam diagnóstico.

## 9.9 Proxy metrics

Quando dados comerciais ainda não estiverem maduros, um proxy pode ser usado, mas a conclusão precisa ser rotulada como provisória.

## 9.10 Maturity

Estados:

```text
too_early
early
maturing
sufficient
final
```

## 9.11 Sufficiency

Critérios dependem do contexto e não devem ser universalizados arbitrariamente.

Podem considerar:

- volume;
- conversões;
- duração;
- maturação;
- qualidade de dados;
- desenho estatístico, quando suportado.

## 9.12 Decision criteria

Definir antes do teste:

```yaml
decisionCriteria:
  supported:
  notSupported:
  inconclusive:
  stopConditions:
```

## 9.13 Conclusion

Estados:

```text
supported
not_supported
inconclusive
invalidated
```

`inconclusive` é resultado válido.

`invalidated` é diferente de `not_supported`.

## 9.14 Causal boundary

Em desenhos observacionais preferir:

```text
associado
observado
apresentou
coincidiu
```

e evitar causalidade indevida.

## 9.15 Learning

Learning Record nunca altera L2 automaticamente.

```yaml
learning:
  summary:
  scope:
  evidence:
  confidence:
  limitations:
  implications:
  proposedUpdates:
```

## 9.16 Audit e change log

Mudanças durante o experimento devem registrar:

- valor anterior;
- novo valor;
- ator;
- motivo;
- horário;
- possível impacto na integridade do experimento.

---

# 10. L7 — Task & Conversation Context

**Status:** aprovado.

## 10.1 Finalidade

Responde:

> **Qual trabalho precisa ser executado agora?**

e:

> **O que já foi dito, decidido, aprovado ou rejeitado sobre esse trabalho?**

O L7 possui:

```text
Task Context
+
Conversation Context
```

## 10.2 Estrutura

```yaml
taskConversationContext:

  task:
    id:
    tenantId:
    initiativeId:
    experimentId:
    type:
    title:
    description:
    status:
    priority:

  objective:

  assignment:
    assignedAgent:
    assignedUser:
    owner:
    requestedBy:
    delegatedBy:

  inputs:
    contextRefs:
    assetRefs:
    documentRefs:
    dataRefs:
    previousOutputs:

  requiredInputs:
  optionalInputs:

  expectedOutput:
    type:
    description:
    schema:
    format:

  acceptanceCriteria:
  constraints:

  tools:
    allowed:
    required:
    forbidden:

  permissions:
    read:
    write:
    execute:
    approve:

  autonomy:
  dependencies:
  blockers:
  timing:
  handoffs:
  decisions:
  approvals:
  conversationContext:
  unresolvedItems:
  readiness:
  completion:
  metadata:
```

## 10.3 Task types

```text
analyze
plan
create
review
approve
publish
optimize
measure
report
investigate
configure
monitor
summarize
classify
research
handoff
other
```

Domínios podem especializar esses tipos.

## 10.4 Status

```text
backlog
ready
in_progress
waiting_dependency
waiting_approval
blocked
completed
cancelled
failed
```

## 10.5 Definition of Done

Output gerado não significa task concluída.

Uma copy criada pode permanecer `waiting_approval`.

## 10.6 Autonomy is task-specific

O mesmo agente pode operar em `draft` numa tarefa e `approval_required` em outra.

## 10.7 Conversation classifications

```text
instruction
information
question
answer
decision
approval
rejection
correction
clarification
suggestion
constraint
preference
handoff
```

Uma frase em conversa não vira verdade empresarial automaticamente.

## 10.8 Conversation scope

Pode ser:

```text
object
task
experiment
initiative
domain
tenant
```

Nunca promover silenciosamente escopo local para tenant-wide.

## 10.9 Retrieval

Priorizar:

```text
mesma task
↓
mesma iniciativa
↓
mesmo experimento
↓
mesmo domínio
```

e relevância/autoridade acima de simples janela de “últimas N mensagens”.

## 10.10 Conversation compression

Conversas extensas podem ser compactadas em:

- decisões;
- restrições;
- aprovações;
- rejeições;
- questões abertas.

Mas resumos preservam referência às mensagens críticas.

## 10.11 Promotion

Uma nova informação relevante pode subir para outra camada apenas por processo governado:

```text
Conversation
↓
Classification
↓
Context Update Candidate
↓
Review/Approval
↓
Promote to L1/L2/L3/L5/etc.
```

## 10.12 Handoffs

Passe decisão, referências, restrições e expected output — não todo o tenant.

## 10.13 Idempotency

Tarefas com side effect devem preservar idempotency key e estado anterior para evitar duplicação de ações.

---

# 11. L8 — Immediate Request

**Status:** aprovado.

## 11.1 Finalidade

Responde:

> **O que o usuário, sistema, workflow ou agente está pedindo exatamente agora?**

O L8 define a ação atual, mas não redefine sozinho a verdade, autorização ou estratégia.

## 11.2 Estrutura

```yaml
immediateRequest:

  id:

  trigger:
    type:
    source:

  actor:
    type:
    id:
    role:

  rawRequest:

  interpretedIntent:
    action:
    target:
    changes:

  requestedAction:
  actionRisk:

  target:
    type:
    id:
    version:

  scope:
  modifiers:
  constraints:

  desiredOutput:
    format:
    language:
    quantity:
    tone:
    schema:

  urgency:

  contextImpact:
    currentOutput:
    task:
    experiment:
    initiative:
    operationalContext:
    brandTruth:
    tenantFoundation:

  requiredChecks:

  contextUpdateCandidate:

  resolution:
    action:
    responsibleAgent:
    taskId:
    requiresNewTask:
    requiresContextUpdate:
    requiresApproval:
    blockers:

  provenance:
  metadata:
```

## 11.3 Raw versus interpreted

Preservar:

```text
o que foi dito
≠
o que o sistema entendeu
```

com `interpretationConfidence` quando necessário.

## 11.4 Trigger types

```text
user
agent
workflow
event
schedule
integration
system
```

## 11.5 Action types

```text
create
revise
analyze
review
approve
reject
compare
summarize
recommend
plan
publish
pause
resume
configure
measure
investigate
delegate
explain
retrieve
update
delete
other
```

## 11.6 Risk-based context expansion

Pedidos simples recebem pacote pequeno. Ações de risco — publicação, gasto, envio, alteração de budget — exigem mais contexto e verificações.

## 11.7 Pre-execution checks

Conforme aplicável:

```text
permission
autonomy
approval
policy
object version
budget
integration health
asset rights
consent
idempotency
```

## 11.8 Read, write, approve e execute são diferentes

“Mostre como ficaria” não significa “publique”.

“Você recomenda aumentar?” não significa “aumente”.

## 11.9 Context impact

O L8 precisa identificar quando uma solicitação afeta uma camada superior.

Exemplos:

- “faça 5 em vez de 3” → L7;
- “mude também o CTA do teste” → L6;
- “inclua e-mail na campanha” → L5;
- “enterprise não é mais prioridade” → L3;
- “não usamos mais este termo” → candidato ao L2;
- “passamos a vender nos EUA” → candidato ao L1.

## 11.10 No redundant questions

Antes de pedir informação, recuperar L1–L7.

Perguntar apenas quando a falta de informação tiver impacto material e não puder ser resolvida do contexto.

## 11.11 Request decomposition

Pedidos compostos devem ser decompostos em ações, podendo envolver diferentes agentes, domínios e níveis de autonomia.

“Faça tudo” não elimina segregação de funções.

## 11.12 Regra principal

> **A última mensagem é a instrução mais recente, não a única fonte de contexto.**

---

# 12. Evidence & Provenance Layer

Este layer atravessa L0–L8.

## 12.1 Objetivo

Permitir responder:

- de onde veio um fato;
- quem o declarou;
- quando foi observado;
- em qual escopo;
- com qual status;
- em qual versão;
- quais limitações possui.

## 12.2 Fontes

```text
user
brand_os
product_record
crm
billing
meta_ads
google_ads
email_provider
analytics
uploaded_document
uploaded_asset
approved_case
experiment
agent_output
external_integration
system_observation
```

## 12.3 Estrutura conceitual

```yaml
evidence:
  id:
  tenantId:

  source:
    type:
    reference:

  statement:

  status:
  scope:

  observedAt:
  validFrom:
  validUntil:

  confidence:

  limitations:

  metadata:
```

## 12.4 Evidence versus claim

Uma evidência pode suportar um claim, mas não se torna automaticamente autorização de uso publicitário.

Uso autorizado permanece governado pelo L2.

---

# 13. Autoridade e precedência

Quando informações entrarem em conflito:

```text
1. L0 — Oplyra Constitution
2. políticas, permissões e segurança do tenant
3. L2 — Brand & Business Truth aprovado
4. L1 — Tenant Foundation
5. decisões operacionais aprovadas
6. L5 — Initiative Context
7. L6 — Experiment Context aprovado
8. L7 — Task Context
9. L7 — Conversation Context
10. L8 — Immediate Request
```

A precedência é aplicada ao escopo relevante. Um pedido imediato pode substituir uma decisão local anterior quando o ator possui autoridade, mas não viola L0, segurança ou políticas.

---

# 14. Temporalidade e versionamento

Cada item relevante pode possuir:

```yaml
validFrom:
validUntil:
observedAt:
updatedAt:
version:
status:
```

Estados possíveis:

```text
draft
proposed
approved
active
deprecated
archived
```

A Oplyra deve distinguir:

- verdade vigente;
- verdade histórica;
- informação expirada;
- hipótese;
- rascunho;
- decisão aprovada.

---

# 15. Context Assembly

## 15.1 Finalidade

`Context Assembly` constrói o pacote final de contexto de uma execução.

Fluxo:

```text
Trigger
↓
Identify Tenant
↓
Identify Agent
↓
Resolve Existing Task
↓
Resolve Domain
↓
Resolve Initiative
↓
Resolve Experiment
↓
Interpret Immediate Request
↓
Load Required Context Policies
↓
Retrieve Context
↓
Apply Permissions
↓
Resolve Versions
↓
Check Freshness
↓
Detect Conflicts
↓
Attach Evidence
↓
Register Missing Context
↓
Compress Non-critical Context
↓
Build Context Package
↓
Execute Agent
```

## 15.2 Context Budget

O Context Assembly deve otimizar relevância, qualidade e custo.

Não há vantagem em enviar informações irrelevantes apenas porque estão disponíveis.

## 15.3 Risk-based expansion

Quanto maior o risco da ação, maior o conjunto obrigatório de verificações e contexto.

---

# 16. Context Package

Estrutura conceitual:

```yaml
contextPackage:

  execution:
    tenantId:
    agentKey:
    taskId:
    trigger:
    timestamp:

  constitution:

  tenantFoundation:
  brandBusinessTruth:
  operationalContext:
  domainContext:
  initiativeContext:
  experimentContext:
  taskConversationContext:
  immediateRequest:

  evidence:

  permissions:
  autonomy:

  missingContext:
  conflicts:

  sourceVersions:

  quality:
    completeness:
    freshness:
    consistency:
    evidence:

  metadata:
```

Nem todos os campos precisam transportar o conteúdo inteiro. Referências estruturadas devem ser preferidas quando apropriado.

---

# 17. Context Policies

Cada agente/domínio deve declarar:

```yaml
agentContextPolicy:
  agent:

  required:
  conditional:
  optional:
  forbidden:

  freshness:
  maxConversationHistory:
  allowedSources:
```

O contexto necessário depende de `agent + domain + taskType + objectRefs + risk`.

---

# 18. Required, optional, conditional e blocking context

### Required

Sem ele a tarefa não pode ser executada corretamente.

### Optional

Enriquece.

### Conditional

Só é obrigatório para determinado tipo de ação.

### Blocking

Sua ausência impede execução.

Exemplos blocking:

- publicação sem aprovação exigida;
- gasto sem budget/policy;
- ativo sem direito de uso;
- e-mail sem consentimento quando necessário.

---

# 19. Missing Context

Estrutura:

```yaml
missingContext:
  - field:
    layer:
    impact:
    reason:
```

Impacto:

```text
low
medium
high
blocking
```

A ausência pode resultar em:

```text
execute_with_limitation
request_information
delegate_investigation
propose_hypothesis
block
```

---

# 20. Context Promotion

Informações podem nascer em camadas inferiores e serem propostas para camadas superiores.

Exemplo:

```text
Conversation
↓
Repeated/Relevant Information
↓
Context Update Candidate
↓
Evidence
↓
Quality/Owner Review
↓
Approval
↓
New Version of Target Layer
```

Nunca promover automaticamente:

- preferência local para regra de marca;
- resultado de um experimento para verdade universal;
- fala casual para decisão;
- inferência para fato.

---

# 21. Context Snapshots

Criar snapshots em eventos importantes:

- aprovação de campanha;
- início de experimento;
- publicação;
- mudança relevante de orçamento;
- pausa;
- check-in;
- relatório mensal;
- conclusão.

Snapshots permitem reconstruir:

> **O que a Oplyra sabia e considerava válido no momento da decisão?**

---

# 22. Observabilidade contextual

Registrar por execução:

- `contextPackageId`;
- layers utilizadas;
- versões;
- fontes;
- itens omitidos por permissão;
- itens stale;
- conflicts;
- missing context;
- tokens/context size;
- agent;
- task;
- runtime/model;
- tempo de assembly;
- custo quando disponível.

Indicadores possíveis:

- Context Completeness;
- Context Freshness;
- Conflict Rate;
- Missing Critical Context;
- Context Utilization;
- Context Token Cost.

Não reduzir qualidade contextual inteira a um único score opaco.

---

# 23. Governança

## 23.1 Alteração de contexto

Mudanças críticas registram:

```yaml
change:
  entity:
  field:
  previousValue:
  newValue:
  changedBy:
  source:
  reason:
  evidenceRefs:
  changedAt:
```

## 23.2 IA

A IA pode:

- identificar lacunas;
- extrair candidatos;
- sugerir atualizações;
- resumir;
- relacionar evidências;
- propor aprendizado.

Por padrão ela não deve transformar propostas em verdades aprovadas sem governança.

## 23.3 Aprovação por versão

Aprovação é associada ao objeto e versão exatos. Versões posteriores não herdam automaticamente aprovação.

---

# 24. Relação com o protocolo JSON transacional

O Context Stack define **o que** cada execução precisa saber.

O protocolo `20-agent-transaction-protocol.md` define **como** agentes, runtime, workflows e serviços trocam comandos, queries, eventos, respostas, referências de contexto, resultados e erros.

Regra:

> **Humanos podem interagir em linguagem natural. Componentes da Oplyra se comunicam por contratos JSON versionados, transacionais e auditáveis.**

Linguagem natural pode ser conteúdo dentro de um contrato, nunca substituto dos campos estruturados necessários para tenant, contexto, autorização, tracing, evidência, resultado e auditoria.

---

# 25. Exemplo completo de Context Stack

```text
L0
Oplyra Constitution

L1
Empresa:
B2B SaaS, sales-led, Brasil.

L2
Produto:
Revenue OS.

Persona:
VP de Marketing.

Situação:
Investimento em aquisição aumentou.

Dor:
Não conecta campanhas a pipeline.

Consequência:
Budget é redistribuído por sinais intermediários.

Desejo:
Saber o que contribui para receita.

Claim permitido:
"Conecte marketing a pipeline e receita."

L3
Q4:
R$ 3M de pipeline.

Situação atual:
31 de 60 reuniões.

CRM:
48h de atraso.

Prioridade:
Enterprise.

L4
Domain:
Copywriting.

L5
Initiative:
Enterprise Pipeline Q4.

Oferta:
Demo.

Canal:
LinkedIn Ads.

L6
Experiment:
Ângulo de receita não atribuída
vs produtividade operacional.

Variável:
angle.

CTA:
constante.

Métrica:
qualified_meetings.

L7
Task:
Criar challenger B.

Constraint:
não mencionar automação.

Decisão:
ângulo de receita aprovado.

L8
Immediate Request:
"Deixe a variante B mais curta."
```

O agente recebe apenas a projeção relevante desse stack, construída pelo Context Assembly.

---

# 26. Critério final de qualidade

Antes de executar um agente, a Oplyra deve ser capaz de determinar:

```text
Para qual tenant estou trabalhando?

Quem é essa empresa?

Quais verdades devo respeitar?

Qual é o estado operacional atual?

Qual domínio está envolvido?

Qual iniciativa está em curso?

Existe hipótese/experimento?

Qual tarefa estou executando?

O que já foi decidido?

O que está sendo solicitado agora?

Quais evidências sustentam o contexto?

O que está faltando?

Há conflitos?

Os dados estão atualizados?

Qual versão é válida?

Quais permissões e autonomia existem?

Qual ação é segura e permitida?
```

---

# 27. Regra final

> **O agente não “sabe tudo”. Ele recebe o contexto correto, na versão correta, para o tenant correto, com a autoridade correta, para executar uma tarefa específica.**

Essa regra é a fundação contextual da arquitetura multiagentes da Oplyra.
