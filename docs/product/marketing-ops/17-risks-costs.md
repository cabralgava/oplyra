# 17 — Riscos e custos estimados

> **Discovery v1.2 — proposta (11/09/2026).** Custos são **estimativas de ordem de grandeza**, com hipóteses herdadas e rastreabilidade em [02](02-discovery.md#9-rastreabilidade-de-evidências-herdadas) e volumes **hipotéticos**. Não são cotações, preços de venda nem compromissos. Reconfirmar antes de decisões comerciais.

## 1. Registro de riscos

Probabilidade (P) e impacto (I): B = baixo, M = médio, A = alto, C = crítico.

| ID | Risco | P | I | Mitigação | Gatilho de revisão |
| --- | --- | :---: | :---: | --- | --- |
| R-01 | Falha de isolamento entre empresas (RLS, claims em conexão direta, Storage) | B | C | Empresa por vínculo ao vivo; RLS forçada; schemas fora da Data API; matriz de testes bloqueante; spike no I-01; revisão de segurança antes dos pilotos | Qualquer teste negativo falhando |
| R-02 | Suíte ampla demais para a capacidade da equipe | A | A | Incrementos pequenos e publicáveis; Growth fora; Orquestrador por último | Incremento acima de 2× o tamanho relativo previsto |
| R-03 | Atraso nos acessos Meta (Business Verification, App Review) e Google Ads API (nível de acesso, verificação de marca) | M | A | Trilha T-B iniciada logo após a aprovação; I-07 antecipável; dashboard com mídia `unavailable` | Pedido sem resposta em 15 dias úteis |
| R-04 | Custo de IA incompatível com o preço aceitável | M | A | Orçamentos e créditos; medição real no I-02 e no I-05; cache e ajuste de esforço; troca de modelo por rota só com avaliação | Custo real ameaça o budget de 08 ou supera hipótese de §2 |
| R-05 | Qualidade das copies insuficiente (H-09) | M | A | Brand OS estruturado; revisão independente; avaliação com limiares; ajuste com pilotos | Aprovação na 1ª versão < 50% no piloto |
| R-06 | Clientes sem dados comerciais integráveis (H-08) | M | A | API simples, CSV, guia para integrações intermediárias; levantamento de CRMs (CS-D4) | < 2 pilotos com eventos em 30 dias |
| R-07 | Veiculação manual rejeitada (H-07) | M | M | Validação cedo; UTMs e cópia facilitadas; avaliar escrita controlada na Fase 6 | CS-D5 < 70% |
| R-08 | Prompt injection ou uso indevido de ferramentas | M | A | Sem publicação/envio/alteração de mídia por agentes; geração paga sob budget; allowlist no executor; conteúdo marcado como não confiável; casos adversariais | Negações de ferramenta em pico |
| R-09 | Loops ou custo multiagente fora de controle | B | M | Limites por execução, workflow, empresa e plataforma; circuit breakers; kill switch | Alerta de anomalia de custo |
| R-10 | Jobs duplicados ou agendamentos perdidos | M | M | Enfileiramento transacional; ocorrências únicas; lease com fencing; testes de concorrência | Duplicidade detectada em produção |
| R-11 | PostgreSQL como fila não escala | B (MVP) | M | Carga sintética no I-02; porta `JobQueue` substituível | Lag > 5 min recorrente |
| R-12 | Dependência de fornecedores (Supabase, Netlify, Railway e provedores de IA) | M | M | Portas e adapters; containers portáveis; SQL padrão; contratos internos | Mudança de preço ou termos |
| R-13 | Documentos jurídicos e LGPD não prontos antes dos pilotos | M | A | Trilha T-C paralela; pilotos com dados reais só após conclusão | T-C incompleta no I-06 |
| R-14 | Produto percebido como agência em software | M | M | Mensagem de capacidade, governança e inteligência; serviços humanos separados | Feedback de entrevistas |
| R-15 | Capacidade e tamanho da equipe desconhecidos tornam o roadmap irreal | A | A | Tamanhos relativos; revisão do plano após o I-01 com velocidade real | Após o I-01 |
| R-16 | Skills com regras de outro produto influenciarem decisões | M | M | Uso apenas de princípios genéricos; adaptação da skill antes do I-01 (DP-21) | Revisão de PR que cite regra L4S |
| R-17 | Métricas das plataformas revisadas retroativamente causam números "que mudam" | A | M | Janela de reprocessamento; confiança `probable`; recorte de dados nos relatórios | Reclamações de divergência |
| R-18 | Revisor e produtor com erros correlacionados | M | M | Verificações determinísticas; rubrica observável; aprovação humana; amostragem e calibração | Concordância revisor × humano < 80% |
| R-19 | Ausência de homologação faz falhas aparecerem só em produção | M | A | CI com Supabase local; empresas internas e flags; expand/contract; verificação pós-deploy; reavaliar antes dos pilotos | Incidente de publicação |
| R-20 | Rate limits do provedor de IA em picos (check-ins de segunda) | M | M | Distribuição dos horários com jitter por empresa; limites de concorrência; Batch API para pré-geração (Fase 3) | 429 persistente |
| R-21 | Mudanças de API e políticas de fornecedores (ex.: tier de acesso da Meta em 05/2026) | A | M | Adapters isolados; testes de contrato; acompanhamento de changelogs | Deprecação anunciada |
| R-22 | Escopo OAuth do Google Ads permite escrita | M | A | Sem código de escrita; testes de arquitetura; tokens cifrados; revogação ao desconectar | Vazamento de credencial |
| R-23 | Retirada ou alteração de modelos candidatos (FX-16; datas a revalidar) | M | M | Não usar em rota crítica sem plano de migração; política de modelo por rota; reavaliação no EXP-05 | Aviso de depreciação |
| R-24 | Backups do banco não incluem objetos do Storage (FX-11) | A | A | Versões imutáveis, exclusão lógica, réplica externa, manifesto; EXP-04 antes de dados reais | Antes de dados reais |
| R-25 | Região das Netlify Functions e do Railway pode ficar distante do Supabase e dos usuários brasileiros | M | M | Região explícita no pacote; EXP-03 mede web→banco e worker→banco antes de produção | EXP-03 e cada mudança de região |
| R-26 | Custo ocioso contínuo do worker Railway | A | B | Serviço stateless no menor tamanho adequado; EXP-03 mede 7 dias; alertas de custo | Fatura acima da estimativa |
| R-27 | Inferência de IA fora do Brasil (FX-18) | A | A | DP-09c e DP-22 antes de dados reais; sem PII (DP-27) | Antes dos pilotos |
| R-28 | Custo da análise de vídeo não dimensionado: cobrança por minuto ou por ativo pode consumir o budget do tenant | A | A | Medidor, franquia e teto próprios antes de ativar (DP-34); adapter fake por padrão; custo por ativo no Ledger | Antes de habilitar a capacidade |
| R-29 | Transcrição de vídeo reintroduz PII fora da política | M | A | Derivados herdam retenção e permissões do ativo (I-AST); redação antes do contexto do agente; TST-29 | Antes de dados reais |

## 2. Baseline econômico reconstruído

Reconstrução aritmética das hipóteses apresentadas na conversa de referência; **não é cotação atual, benchmark ou medição**. Tarifas por ação abaixo agregam hipóteses de modelo, revisão e tentativas da simulação anterior. Precisam ser substituídas por custos observados; não permitem atribuir um vencedor a OpenAI ou Anthropic.

### 2.1 Premissas e subtotais em USD

| Ação | Custo unitário hipotético | Performance: quantidade | Subtotal P | Growth: quantidade | Subtotal G |
| --- | ---: | ---: | ---: | ---: | ---: |
| Copy aprovada (revisões incluídas na hipótese) | 0,274 | 60 | 16,440 | 80 | 21,920 |
| Geração de imagem | 0,050 | 60 | 3,000 | 80 | 4,000 |
| Edição de imagem | 0,080 | 30 | 2,400 | 40 | 3,200 |
| Adaptação textual por canal | 0,051 | 0 | 0,000 | 60 | 3,060 |
| Análise de uma conta | 0,118 | 12 | 1,416 | 12 | 1,416 |
| Check-in até duas contas | 0,480 | 4 | 1,920 | 4 | 1,920 |
| Plano estratégico | 0,618 | 4 | 2,472 | 4 | 2,472 |
| Campanha de e-mail + revisão | 0,128 | 0 | 0,000 | 6 | 0,768 |
| Envio de um e-mail | 0,0009 | 0 | 0,000 | 25.000 | 22,500 |
| Jornada Lifecycle | 0,290 | 0 | 0,000 | 3 | 0,870 |
| Análise Revenue | 0,178 | 0 | 0,000 | 6 | 1,068 |
| Classificação | 0,0018 | 0 | 0,000 | 1.000 | 1,800 |
| Decisão assistida | 0,0022 | 0 | 0,000 | 200 | 0,440 |
| Revisão crítica | 0,378 | 0 | 0,000 | 2 | 0,756 |
| Provisão de infraestrutura variável por tenant | — | — | 5,000 | — | 7,000 |
| **Total reconstruído** | | | **32,648** | | **73,190** |
| **Com reserva de 15%** | | | **37,5452** | | **84,1685** |

Fórmula: soma(quantidade × custo unitário) + provisão variável; depois multiplicar o subtotal por 1,15. Não arredondar cada linha antes da soma. Performance arredonda para US$ 32,65 / 37,55. Growth arredonda para **US$ 73,19 / 84,17**. A soma decimal reproduz os dois baselines históricos por arredondamento, sem ajuste artificial. Isso confirma a aritmética das hipóteses, não a tarifa ou o custo real por tenant.

### 2.2 O que o cálculo não comprova

- Tarifas médias agregadas não documentam completamente tokens, cache, modelos e distribuição de tentativas. A reconstrução melhora rastreabilidade, mas não valida o baseline original.
- Reserva de 15% é contingência adicional, não segunda contabilização de retries já embutidos na tarifa por ação.
- Com as hipóteses acima, sobra ~US$ 2,45 no Performance e ~US$ 0,77 no Growth. Essa folga pequena não garante consumo integral da franquia sob p95 de custo.
- Relatório mensal com nova análise por IA e quinta ocorrência semanal não têm verba separada demonstrada; proposta em 08 §12 evita nova chamada paga até decisão DP-30.
- Contas conectadas (2 por plano) não são chamadas. Análises internas do check-in já compõem seu custo; não somar novamente doze análises por conta sem declarar outra hipótese.
- Cenários antigos com 40 copies, sem imagens, 4,3 check-ins e quatro contas eram simulações históricas; foram retirados do baseline vigente porque não representam a franquia atual.

### 2.3 COGS, infraestrutura e rateio — proposta DP-31

Separar três visões: (a) consumo direto/variável atribuível ao tenant, comparado aos budgets de 08; (b) infraestrutura-base compartilhada de §3; (c) margem após rateio, taxas de pagamento, tributos e suporte atribuível. Custos fixos não consomem automaticamente o teto variável, mas entram na análise econômica total.

Proposta inicial de rateio: custo fixo mensal dividido pelos tenants ativos equivalentes no mês (dias ativos / dias do mês). Sem tenant ativo, custo permanece overhead da plataforma. Consumo acima de franquias de infraestrutura é atribuído por telemetria; não cobrar a mesma parcela no custo fixo e na provisão variável. Substituir a provisão US$ 5/7 por custo apurado, não adicioná-la outra vez. Avaliações de desenvolvimento ficam em orçamento da plataforma, separado dos tenants.

A regra de rateio, serviços humanos e definição final da margem exigem validação de DP-31. Taxas Stripe ficam fora dos budgets operacionais pela decisão de budgets registrada em [ATUALIZACOES](ATUALIZACOES.md), mas entram na formação do preço.

### 2.4 Plano de medição

EXP-05 compara candidatos de texto e imagem, registrando tarifas datadas, quantidades/tokens, cache, tentativas, custo por sucesso e p50/p90/p95. Registrar artefatos brutos e custo de falhas; nenhuma célula TBD vira número medido sem execução. Preço final depende dessa validação.

## 3. Infraestrutura estimada (produção, antes dos pilotos)

Valores antigos de Vercel e Cloud Run foram retirados porque esses provedores deixaram de ser a direção selecionada. Netlify e Railway devem ser cotados no EXP-03 com o plano e a região efetivamente candidatos. **Nenhum valor abaixo é cotação ou orçamento aprovado.**

| Item | Faixa | Observação |
| --- | ---: | --- |
| Supabase Pro + computação | 30–79 | Pro US$ 25 com US$ 10 de crédito; Small US$ 15 (≈ US$ 30 líquido) a Medium US$ 60 (≈ US$ 75); add-on IPv4 US$ 4, se o worker exigir (FX-09, FX-12) |
| PITR de 7 dias (antes de dados reais, DP-07b) | 0 ou 100 | US$ 100/mês por 7 dias; exige Small ou maior (FX-11) |
| Netlify | pendente | Plano, Functions, bandwidth e região a cotar no EXP-03 |
| Railway worker contínuo | pendente | Medir CPU, memória, egress e custo ocioso real por 7 dias no EXP-03 |
| Réplica externa do Storage | 1–5 | Volume inicial pequeno (EXP-04) |
| E-mail transacional | 0–20 | Volume inicial baixo; provedor não escolhido (DP-08a) |
| Observabilidade | 0–50 | Serviço não escolhido (DP-15b) |
| Registry, logs, gerenciador de segredos e domínio | 5–20 | — |
| **Total sem PITR** | **não calculado** | Depende da cotação Netlify/Railway e do plano Supabase |
| **Total com PITR** | **não calculado** | Depende também da decisão DP-07b |

APIs da Meta e do Google: sem cobrança de uso conhecida para acesso de leitura. Os custos indiretos são de verificação, conformidade e tempo.

## 4. Custos não técnicos a levantar

Assessoria jurídica e LGPD (termos, DPA, RIPD), constituição e verificação da entidade legal nas plataformas, design de identidade tipográfica e visual, recrutamento de entrevistas e eventuais incentivos, revisão de segurança independente, suporte aos pilotos. **Não estimados neste discovery.**

## 5. Como validar as estimativas

1. **I-02:** medir tokens, latência e custo reais do adapter de IA em sandbox com casos sintéticos, com teto de gasto aprovado.
2. **I-05:** custo por copy aprovada e distribuição de rodadas de revisão com o conjunto de avaliação.
3. **I-06/I-08:** custo do check-in com dados de contas internas (autorização explícita).
4. Pilotos: custo por empresa ativa × uso real; revisar créditos e limites antes da Fase 5.
5. Atualizar este documento com valores medidos, separando estimativa e medição.
