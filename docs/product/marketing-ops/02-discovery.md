# Oplyra — Discovery

**Versão documental:** 0.2  
**Data:** 11 de setembro de 2026  
**Autoridade:** detalhamento do 00 v2.2, com decisões posteriores e regra de ancoragem em [ATUALIZACOES](ATUALIZACOES.md). Citar `DEC-0xx` apenas quando o identificador existir na v2.2. Propostas técnicas permanecem propostas.

**Status:** obrigatório antes da implementação estrutural  
**Documento-mãe:** `00-documento-transicao.md`

## 1. Objetivo da fase

Validar problema, mercado inicial, operação, integrações, limites e economia antes de migrations ou decisões arquiteturais irreversíveis.

## 2. Hipóteses já aceitas

- a Oplyra será greenfield;
- será SaaS multi-tenant desde a fundação;
- terá dois planos principais: Performance e Growth;
- não terá CRM próprio no MVP;
- será multiagente, multimodelo e multiprovedor;
- Stripe será o provedor inicial de billing/pagamentos;
- criação e edição de imagens fazem parte do produto;
- vídeo não é gerado, editado ou renderizado nativamente; vídeos enviados pelo cliente são ativos de entrada para análise (DEC-014, DEC-015);
- campanhas seguem o método de DEC-017;
- budgets econômicos iniciais: US$ 40 no Performance e US$ 85 no Growth.

## 3. Hipóteses a validar com mercado

### Segmento

- validar dores e linguagem de empresas SaaS B2B dentro do mercado inicial já escolhido;
- quais dores geram maior disposição a pagar;
- quais integrações comerciais são indispensáveis para o primeiro grupo de clientes.

### Operação

- volume real mensal de copy;
- volume de imagens e edições;
- quantidade de contas de anúncios;
- frequência de análises;
- cadência de check-ins;
- volume de e-mails no Growth;
- volume de automações e jornadas;
- nível de aprovação humana esperado.

### Econômico

- distribuição real de custo por workflow;
- p50/p90/p95 de custo por ação;
- taxa de retries;
- custo de imagem aprovada;
- custo de e-mail por tenant;
- relação entre qualidade e custo dos modelos;
- margem necessária para pricing final.

## 4. Pesquisa recomendada

Entrevistar potenciais clientes e registrar:

- estrutura atual da equipe de marketing;
- ferramentas utilizadas;
- tarefas manuais recorrentes;
- maiores gargalos de aprovação;
- dificuldade de ligar marketing a vendas/receita;
- frequência de produção de conteúdo;
- investimento em mídia;
- canais utilizados;
- volume de e-mail;
- processos de relacionamento;
- sistemas comerciais existentes;
- critérios de confiança para permitir automação.

## 5. Provas técnicas de discovery

Antes de escolher modelos padrão, executar sandbox/evals para:

1. classificação e extração estruturada;
2. copy e revisão de Brand OS;
3. análise de mídia;
4. check-in semanal;
5. planejamento estratégico;
6. geração e edição de imagens;
6.1. análise de vídeo enviado: transcrição, resumo e derivados textuais;
7. e-mail marketing;
8. lifecycle;
9. Revenue Intelligence;
10. quality gate.

Comparar modelos por qualidade, factualidade, aderência ao schema, aderência ao Brand OS, latência, retries e custo efetivo por ação aprovada.

## 6. Baselines econômicos de trabalho

Budgets e franquias: [08](08-billing-entitlements.md). Memória de cálculo: [17](17-risks-costs.md#2-baseline-econômico-reconstruído). Os valores do 00 são hipóteses; a reconstrução atual reproduz Performance e Growth por arredondamento. Nenhum custo foi medido.

## 7. Questões em aberto

- validar proposta de valor em SaaS B2B; o mercado inicial não está em aberto;
- preço final dos planos;
- política de excedentes;
- limites finais de usuários, storage, contas sociais, automações e conexões;
- pesos de créditos/capacidade de IA;
- quality thresholds por workflow;
- nível de serviço humano;
- primeiro conector comercial dedicado;
- provedor de e-mail;
- provedor e modalidade da análise multimodal de vídeo, com limites de formato, tamanho e retenção dos derivados;
- integrações sociais do MVP;
- trial e onboarding;
- stack final;
- política de dados usada por IA;
- suporte e SLAs.

## 8. Critério de saída do discovery

A Fase 0 termina quando houver aprovação explícita de:

- linguagem ubíqua;
- bounded contexts;
- arquitetura macro;
- modelo de tenancy;
- modelo de billing/entitlements;
- arquitetura multiagente e multimodelo;
- integrações do MVP;
- política inicial de segurança/LGPD;
- catálogo inicial de ações e custos;
- roadmap do Performance MVP.

## 9. Rastreabilidade de evidências herdadas

A substituição dos documentos 01–13 removeu o catálogo original FX/H/T, mas anexos e ADRs ainda o citavam. Este registro identifica o tema recuperável pelos usos remanescentes; **não recupera o texto original nem revalida fatos de fornecedor**. Todo FX abaixo requer consulta oficial atual e evidência arquivada antes de decisão dependente. Tarifas/datacenters/modelos relatados não são garantia vigente.

| ID | Tema recuperado | Evidência remanescente / situação |
| --- | --- | --- |
| FX-01 | Limites de execução de Edge Functions | ADR-0001/0004/0005; alegação de limite temporal não revalidada. |
| FX-02 | Não recuperável com precisão | Texto original ausente; não usar como evidência. |
| FX-03 | Filas/scheduler Supabase | ADR-0004 e EXP-02; capacidade sob teste. |
| FX-04 | Hospedagem/região | Referência em ADR-0005; texto original exato não recuperado. |
| FX-05 | Região de funções Vercel | Links oficiais preservados em ADR-0005; configuração a confirmar. |
| FX-06 | Cloud Run worker pools | Links em ADR-0005; operação e região a confirmar no EXP-03. |
| FX-07 | Credenciais/acesso Google Ads | Variável em 16 e trilha T-B; formato e nível de acesso pendentes. |
| FX-08 | Não recuperável com precisão | Texto original ausente; não usar como evidência. |
| FX-09 | Preço Supabase | Hipóteses históricas em 17; não cotação vigente. |
| FX-10 | Preço de modelos de IA | Simulação antiga; substituída por medição por ação de 13/17 e EXP-05. |
| FX-11 | Backup, PITR, Storage e papéis | ADR-0005/EXP-04; confirmar capacidades do plano e testar restauração. |
| FX-12 | Conexões/pooler/IPv4 | ADR-0003 e EXP-01; links de fornecedor preservados em ADR-0005. |
| FX-13 | JWT/JWKS | Desenho de EXP-01; verificar versões/configuração antes de adoção. |
| FX-14 | Preço regional Vercel | Links em ADR-0005; sem recotação nesta revisão. |
| FX-15 | Custo do worker | Explicitamente não cotado; medir no EXP-03. |
| FX-16 | IDs e ciclo de vida de modelos | Lista antiga retirada como recomendação; confirmar candidatos por modalidade antes do EXP-05. |
| FX-17 | Retenção/treinamento/ZDR | Contratos e política pendentes em DP-09c; não inferir condição de um fornecedor para outro. |
| FX-18 | Residência da inferência | Política por fornecedor pendente em DP-09c/DP-22; declaração histórica não comprova residência atual. |

### 9.1 Hipóteses e tensões rastreáveis

Definições operacionais desta reconciliação, derivadas dos anexos, não alegações de validação de mercado:

| ID | Hipótese ou tensão | Destino vigente |
| --- | --- | --- |
| H-05 | Usuários compreendem aprovação por versão | 14 F-05 e pesquisa de 02 §4 |
| H-07 | Pilotos aceitam veiculação manual | 14 F-11; validar em entrevistas |
| H-08 | Clientes conseguem fornecer eventos comerciais | 06 §11.4; validar integração |
| H-09 | Copies atingem qualidade utilizável | EXP-05 e 15 §5 |
| H-12 | Carga sintética representa capacidade necessária | EXP-02; não previsão de demanda real |
| H-14 | Usuários compreendem confiança/limitações | 14 F-07 e pesquisa |
| CS-D4 | Levantamento de sistemas comerciais de pilotos | Entrega de pesquisa, sem resultado ainda |
| CS-D5 | Aceitação da veiculação manual | Percentual observado em entrevistas; limiar de 70% em R-07 é proposta |
| T-02 | Adiamento de billing conflita com Fundação | Resolvido documentalmente pela decisão de billing em [ATUALIZACOES](ATUALIZACOES.md) e por ADR-0007 |
| T-16 | Publicação externa versus uso informado | MVP de mídia só lê; uso informado não significa publicação pela Oplyra |
| T-17 | Requisitos de acesso Google Ads dependem de confirmação | Trilha T-B e DP-19 |
| T-18 | Checkpoint antigo não reflete arquivos novos | ESTADO refeito com evidência desta revisão |

IDs não listados não foram reconstruídos. Nenhum resultado de teste antigo foi transportado como evidência atual.

## 10. Pesquisa e decisões novas

Responsável, calendário, amostra, consentimento, incentivos e aprovação de mudanças de escopo permanecem DP-18a–d. Entrevistas devem usar empresas SaaS B2B e separar hipótese de observação. Não afirmar acesso prévio ao mercado como fato validado.

Propostas operacionais para avaliação: medidores/período (DP-29, 08 §11), cadência (DP-30, 08 §12), COGS/rateio (DP-31, 17 §2), limites numéricos (DP-32, 13 §15). Não bloqueiam a leitura/correção documental; bloqueiam ativação dependente até definição.
