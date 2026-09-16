# Oplyra — Product Requirements

**Versão documental:** 0.2  
**Data:** 11 de setembro de 2026  
**Autoridade:** detalhamento do 00 v2.2, com decisões posteriores e regra de ancoragem em [ATUALIZACOES](ATUALIZACOES.md). Citar `DEC-0xx` apenas quando o identificador existir na v2.2. Propostas técnicas permanecem propostas.

**Status:** baseline de produto derivado do Documento de Transição v2.2  
**Documento-mãe:** `00-documento-transicao.md`

## 1. Objetivo

Definir os requisitos funcionais e não funcionais da Oplyra antes da implementação estrutural. A Oplyra é uma plataforma SaaS multiempresa de Marketing Operations que conecta estratégia, execução, mídia, relacionamento, dados comerciais e receita.

## 2. Proposta de valor

> Planeje, execute, automatize e acompanhe sua operação de marketing até a receita.

A plataforma deve estruturar a operação, automatizar tarefas, conectar dados, manter governança e ampliar a capacidade de decisão humana. Não deve ser apresentada como substituição integral de pessoas, agência, CRM ou julgamento profissional.

## 3. Mercado inicial

Mercado inicial: **empresas SaaS B2B**. Templates, métricas, exemplos e workflows iniciais atendem esse contexto; domínio, tenancy, billing e integrações permanecem agnósticos a segmento.

## 4. Planos

### 4.1 Oplyra Performance

Posicionamento: estratégia, criação, mídia e gestão de performance.

Capacidades principais:

- workspace da empresa;
- usuários, equipes e permissões;
- Brand OS;
- objetivos, metas e indicadores;
- campanhas;
- gestão de projetos e tarefas;
- produção de copy;
- criação e edição de imagens;
- análise de vídeos enviados pelo cliente, com transcrição, resumo e derivados textuais;
- biblioteca de ativos;
- fluxo de aprovação;
- Meta Ads e Google Ads;
- dashboard de aquisição;
- alertas e recomendações;
- check-ins semanais e relatório mensal;
- integração básica com dados comerciais externos;
- atribuição first touch e last touch;
- arquitetura multiagente e multimodelo.

### 4.2 Oplyra Growth

Inclui todo o Performance e adiciona:

- planejamento editorial;
- agenda e Kanban de conteúdo;
- social media;
- adaptação de conteúdo por canal;
- publicação orgânica conforme APIs disponíveis;
- campanhas de e-mail;
- segmentos e testes A/B;
- réguas de relacionamento;
- automações multietapas;
- nutrição e reativação;
- webhooks e integração com n8n;
- atribuição avançada;
- visão cross-channel até receita;
- agentes de Social Media, E-mail Marketing, Lifecycle e Revenue Intelligence.

## 4.3 Método de campanha (DEC-017)

Toda campanha parte de **situação, dor, consequência, desejo, mecanismo, prova e oferta**, estruturados antes da produção. Testes representam hipóteses explícitas sobre ângulo, dor, hook, prova, visual, CTA ou outra dimensão relevante; variação cosmética não conta como experimento. Resultados priorizam as métricas comerciais disponíveis — lead qualificado, reunião, proposta, contrato e receita — e registram limitações e resultados inconclusivos. O aprendizado retorna a personas, dores, objeções, mensagem, Brand OS e próximos experimentos, com evidência, revisão e versionamento por tenant.

Ciclo: Entender → Hipotetizar → Criar → Testar → Medir → Aprender → Iterar.

## 5. Limites econômicos iniciais

A tabela canônica de franquias e budgets está em [08 — Limites](08-billing-entitlements.md#4-limites-mensais-iniciais). O baseline econômico, sua memória de cálculo e limitações estão em [17](17-risks-costs.md#2-baseline-econômico-reconstruído). Não copiar valores entre documentos.

## 6. Requisitos transversais

### 6.1 Multi-tenant

- isolamento de dados por tenant;
- memberships e RBAC;
- credenciais e storage por tenant;
- configuração de branding e assinatura por tenant;
- auditoria;
- políticas LGPD;
- consumo de IA por tenant.

### 6.2 IA e agentes

- arquitetura multiagente;
- arquitetura multimodelo e multiprovedor;
- modelos substituíveis;
- seleção de modelo por qualidade, custo, latência, risco e disponibilidade;
- quality gates;
- aprovação humana para ações críticas;
- FinOps de IA antes do beta pago em escala;
- custo por ação bem-sucedida como métrica econômica principal.

### 6.3 Billing

- Stripe Billing e Stripe Payments como provedor inicial;
- integração atrás de adapter próprio;
- planos, entitlements, limites e add-ons configuráveis;
- preço final de venda ainda pendente.

## 7. Não objetivos do MVP

- construir CRM próprio;
- gerar, editar ou renderizar vídeo nativamente (DEC-014); vídeos enviados pelo cliente são analisados como ativo de entrada;
- publicar ou alterar orçamento sem governança;
- suportar todos os conectores possíveis desde o início;
- construir os dois planos completos simultaneamente;
- vender tokens brutos como unidade principal ao cliente.

## 8. MVP comercializável inicial

Priorizar o núcleo do Performance:

1. tenancy, usuários e RBAC;
2. Brand OS;
3. objetivos e campanhas;
4. projetos e tarefas;
5. copy e ativos visuais;
6. criação/edição de imagens;
7. aprovações;
8. Meta/Google read-only;
9. dashboard;
10. check-in semanal;
11. Orquestrador e agentes essenciais;
12. API/webhook para dados comerciais;
13. Model Router, Eval Engine e Cost Ledger;
14. billing/entitlements com Stripe;
15. budgets e circuit breakers.

## 9. Indicadores de sucesso

### Produto

- ativação do tenant;
- campanhas ativas;
- conteúdos criados/aprovados;
- recomendações aceitas;
- integrações saudáveis;
- relatórios visualizados.

### Valor

- tempo economizado;
- redução do tempo de planejamento;
- maior velocidade de produção;
- consistência de marca;
- redução de desperdício;
- rastreabilidade;
- conversões atribuíveis.

### Negócio

- trial para pago;
- MRR;
- churn;
- expansão Performance → Growth;
- receita de add-ons;
- margem por tenant;
- custo de IA por receita.

## 10. Decisões pendentes

Ver [registro de decisões](../../decisions/README.md) e [02](02-discovery.md); o posicionamento imobiliário em aberto no 00 foi substituído.
