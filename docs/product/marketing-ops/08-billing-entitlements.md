# Oplyra — Billing, Entitlements & Limits

**Versão documental:** 0.2  
**Data:** 11 de setembro de 2026  
**Autoridade:** detalhamento do 00 v2.2, com decisões posteriores e regra de ancoragem em [ATUALIZACOES](ATUALIZACOES.md). Citar `DEC-0xx` apenas quando o identificador existir na v2.2. Propostas técnicas permanecem propostas.

## 1. Decisão de billing

O provedor inicial será **Stripe**, usando Stripe Billing e Stripe Payments por meio de adapter próprio.

O preço final de venda ainda não está definido.

## 2. Princípio de empacotamento

Planos são configurações de capacidades e limites, não estruturas rígidas de código.

```text
entitlements.can(tenantId, capability)
usage.remaining(tenantId, meter)
```

Devem ser possíveis:

- mudança de planos sem refatoração;
- trials;
- add-ons;
- limites personalizados;
- parceiros/agências;
- features beta;
- exceções auditáveis.

## 3. Budgets econômicos internos

| Plano | Teto inicial de COGS operacional |
|---|---:|
| Performance | **US$ 40/tenant/mês** |
| Growth | **US$ 85/tenant/mês** |

Esses valores não são preços de venda nem saldos exibidos ao cliente.

### Baseline atual

Cálculo e limitações em [17](17-risks-costs.md#2-baseline-econômico-reconstruído). Os totais históricos do 00 não comprovam que todos os clientes cabem no budget; substituir hipóteses por distribuições medidas.

## 4. Limites mensais iniciais

### Performance

| Medidor | Limite |
|---|---:|
| Contas de anúncio | 2 |
| Copies aprovadas | 60 |
| Gerações de imagem | 60 |
| Edições/adaptações de imagem | 30 |
| Análises de mídia paga | 12 |
| Check-ins semanais | 4 |
| Planejamentos estratégicos complexos | 4 |

### Growth

| Medidor | Limite |
|---|---:|
| Contas de anúncio | 2 |
| Copies aprovadas | 80 |
| Gerações de imagem | 80 |
| Edições/adaptações de imagem | 40 |
| Adaptações de conteúdo por canal | 60 |
| Análises de mídia paga | 12 |
| Check-ins semanais | 4 |
| Planejamentos estratégicos complexos | 4 |
| Campanhas de e-mail com IA | 6 |
| E-mails enviados | 25.000 |
| Builds/otimizações Lifecycle | 3 |
| Análises Revenue/cross-channel | 6 |
| Classificações de leads/feedback | 1.000 |
| Decisões assistidas de automação | 200 |
| Revisões estratégicas críticas | 2 |

## 5. Outros limites ainda configuráveis

- usuários;
- contas sociais;
- marcas;
- empresas gerenciadas;
- storage;
- conexões comerciais;
- automações ativas;
- contatos ativos em jornadas;
- retenção de histórico.

## 6. AI Credits / capacidade

O cliente não deverá comprar tokens de OpenAI/Anthropic como unidade principal. A Oplyra poderá exibir créditos ou capacidade abstrata.

Internamente:

- cada ação terá peso/custo baseado no action catalog;
- pesos serão recalibrados a partir de telemetria;
- excedentes podem gerar add-on, throttling, downgrade de modelo, fila ou bloqueio controlado.

## 7. Imagens

Geração e edição de imagens entram nos limites e no COGS dos planos.

Vídeo não é gerado nem editado, portanto não há franquia de produção de vídeo. A **análise** de vídeos enviados consome processamento multimídia, cujo medidor, franquia e custo por ativo ou por minuto ainda não estão definidos; ver [ATUALIZACOES](ATUALIZACOES.md) §4. Não ativar a capacidade antes dessa definição.

## 8. E-mail

Growth inclui inicialmente 25.000 envios/mês. Excedentes deverão ser tratados separadamente por política comercial futura.

## 9. Stripe e margem

Taxas percentuais/fixas do Stripe dependem do preço final e ficam fora dos budgets operacionais de US$ 40/85.

Quando o preço for definido, calcular:

```text
preço líquido
- taxas Stripe
- impostos
- COGS operacional
- suporte/serviços humanos atribuíveis
= margem de contribuição
```

## 10. Add-ons candidatos

- créditos/capacidade adicional de IA;
- volume adicional de e-mail;
- conta adicional de anúncio;
- marca adicional;
- novo conector;
- atribuição avançada;
- white-label;
- especialista humano;
- implantação assistida;
- design humano;
- gestão humana de mídia.

## 11. Semântica dos medidores — proposta DP-29

A tabela de §4 é a fonte canônica dos limites numéricos; Growth usa totais próprios, sem somar os limites de Performance. Contas conectadas são quantidade simultânea, não franquia mensal. Aplicação dos medidores e período abaixo é proposta a validar comercialmente antes de ativação.

| Medidor | Evento proposto de consumo | Repetição e falha |
| --- | --- | --- |
| Copy aprovada | Primeira aprovação humana de uma peça/entrega identificada | Reaprovar a mesma entrega não consome novamente; nova peça independente consome. Revisões e tentativas sempre entram no custo econômico. |
| Geração de imagem | Cada imagem nova entregue com sucesso pelo gerador, mesmo ainda não aprovada | Reentrega idempotente não duplica; retry faturado entra no Ledger mesmo quando não há imagem utilizável. |
| Edição de imagem | Cada resultado visual de edição de um ativo existente | Redimensionamento determinístico sem IA não consome edição de IA; operação paga permanece custeada. |
| Adaptação por canal | Nova versão textual de uma entrega para outro canal, no Growth | Exclui edição visual. Pedido composto explicita as duas ações antes de executar; não cobrar dois medidores pelo mesmo evento. |
| Análise de mídia | Análise concluída de uma conta, sob demanda | Consultas internas do check-in integram seu custo e não deduzem adicionalmente esta franquia. |
| Check-in / plano estratégico / Revenue | Entrega concluída e persistida do workflow correspondente | Tentativas internas não são novas entregas comerciais. |
| Campanha de e-mail / Lifecycle | Nova campanha criada/revisada ou jornada criada/otimizada de forma substancial | Edições menores e retry da mesma ação não duplicam; definição de nova entrega tem ID e versão da regra. |
| E-mails enviados | Mensagem por destinatário aceita pelo fornecedor | Reenvio deliberado é novo envio; retry idempotente não duplica. Bounce posterior não desfaz custo de envio. |
| Classificação / decisão assistida / revisão crítica | Resultado concluído da ação identificada | Duplicatas deduplicadas por tenant/actionId. |

### 11.1 Período e limite — proposta

- Mês civil no fuso IANA do tenant, com limites inicial inclusivo e final exclusivo armazenados em UTC. Período do medidor é explícito e separado do ciclo financeiro da Stripe.
- Mudança de fuso vigora apenas no próximo período; não reinicia saldo. Upgrade/downgrade e eventual prorrata exigem política versionada; não liberar capacidade extra por simples troca de configuração.
- Reservar capacidade e custo atomicamente antes de executar; saldo disponível desconta reservas. Liquidar após resultado e reconciliar custo externo; custo incerto mantém reserva até investigação.
- Ao esgotar franquia ou budget, impedir nova ação paga e explicar saldo, próximo reinício e caminho humano. Não cobrar excedente automaticamente. Reexecução não contorna o limite; downgrade só ocorre se continuar elegível em qualidade e budget.
- Cada evento registra tenant, actionId, meterKey, ruleVersion, período, quantidade e estado. Overrides têm motivo, autor e validade; não substituem aprovação comercial de cobrança.

## 12. Cadência dos check-ins — proposta DP-30

Há conflito entre quatro check-ins/mês e execução toda segunda-feira em meses com cinco segundas. Proposta para preservar o teto sem omissão silenciosa: quatro check-ins com IA por mês; na quinta ocorrência, resumo determinístico no app, identificado como tal e sem deduzir outra franquia de IA. Relatório mensal pode consolidar deterministicamente os check-ins já persistidos; um relatório mensal com nova análise por IA exige orçamento explícito e não está demonstrado no baseline.

A agenda deve mostrar antecipadamente o tipo de cada entrega. A política não é aprovação de novo limite nem promessa comercial vigente: decidir DP-30 antes de ativar a recorrência. Testar meses com quatro/cinco ocorrências, mudança de fuso, falhas e reentregas. Nenhum cron pode ignorar a política de capacidade.

## 13. Stripe na Fundação e pilotos

A decisão de billing registrada em [ATUALIZACOES](ATUALIZACOES.md) fixa Stripe. I-02 inclui adapter de assinaturas e conciliação de webhooks em modo teste, preservando IDs internos, entitlements e auditoria. Assinatura, evento e tenant são reconciliados por mapeamento interno; assinatura válida não concede acesso a outro tenant.

DP-11a define quando cobrar pilotos, preço, trial e inadimplência. Integração técnica não autoriza débito real nem exclui provisionamento manual auditado. NFS-e e meios de pagamento locais exigem escopo e capacidade confirmados; não são garantidos apenas pela escolha de Stripe.

Propostas mantidas: uma marca por tenant com limite configurável (DP-24); referenceScope como origem histórica, fora do catálogo persistido (DP-25).
