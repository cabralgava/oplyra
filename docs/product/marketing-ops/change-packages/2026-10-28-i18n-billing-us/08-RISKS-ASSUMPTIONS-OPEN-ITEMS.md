# Riscos assunções e pendências da mudança

**Status:** avaliação documental proposta; não é parecer jurídico/contábil. **Destino recomendado:** manter no pacote e vincular a 17 e `docs/decisions/README.md`. **Requisitos:** R-03, R-04, R-06, R-08, R-09, R-12.

## Limite da decisão aprovada

O fluxo comercial será da LLC americana, com invoices/recibos Stripe e sem integração NFS-e brasileira planejada. Isso define arquitetura e documentação pretendidas; não prova ausência de obrigação tributária, documental ou de cadastro em qualquer jurisdição. O pacote não conclui que “receber nos EUA elimina obrigações no Brasil” ou que invoice comercial equivale a NFS-e.

Stripe documenta cálculo/coleta, monitoramento de obrigações, registros e declaração como etapas próprias da operação fiscal. Sua adoção como processor não encerra o enquadramento da LLC. [Stripe Tax](https://docs.stripe.com/tax), [tributação nos EUA](https://docs.stripe.com/tax/supported-countries/united-states).

## Assunções que precisam de evidência

| ID local | Assunção ou proposta | Evidência exigida antes de live | Responsável proposto |
| --- | --- | --- | --- |
| A-01 | LLC constituída e apta a vender o serviço | Razão social/nome legal, estado de constituição, EIN e dados de contato/endereço validados por responsável | Proprietário e jurídico/contador EUA |
| A-02 | Conta Stripe americana pertence à LLC | Conferência de titularidade, país, capacidades, situação e limites; sem expor credenciais no pacote | Operações de billing |
| A-03 | BRL/USD recorrentes e banco EUA/USD elegíveis na conta | Validação de conta, meio, recorrência, payout currency e amostras de teste | Billing/tesouraria |
| A-04 | Documentação comercial atende às vendas-alvo | Parecer por perfil de comprador/país e amostras de invoice/recibo | Jurídico/contabilidade |
| A-05 | Dois locales suportados em cada superfície Stripe | Mapping de códigos por API/SDK, teste dos textos editáveis e limites do provider | Engenharia/QA |
| A-06 | Produtos/termos bilíngues revisados | Catálogos de mensagens e versões jurídicas/comerciais revisados | Produto/jurídico |
| A-07 | Customer separado por tenant é adequado | Teste de isolamento de Portal e reconciliação; decisão se houver agência/pagador central | Arquitetura/segurança |
| A-08 | Fallback pt-BR e mudança de moeda assistida são adequados | Aceite das políticas técnicas propostas ou ajuste documentado | Produto |

Os IDs desta seção são locais ao pacote, sem alterar o registro DP existente.

## Riscos e mitigação

| Risco | Consequência | Mitigação e condição de saída |
| --- | --- | --- |
| Tratar ausência de NFS-e no produto como inexistência de tributos | Venda/documentação inadequada | Parecer específico; se exigir novo fluxo, change proposal antes de prometer atendimento |
| Obrigações da LLC, sócios ou operação no Brasil não avaliadas | Exposição jurídica/contábil | Profissionais avaliam entidade, residência/operação, tipo de serviço, comprador e jurisdição; não inferir pela moeda |
| Cliente B2B exigir documento local | Perda de venda ou contratação incompatível | Validar perfil contratante e comunicar documentação da LLC antes do checkout; não fabricar NFS-e |
| Preço BRL fixo com custos USD | Margem oscila com câmbio e taxas | Revisão humana de margem por moeda; usar liquidação real e cenários, sem reajuste automático de preço |
| Taxas, impostos, refund e disputa mal modelados | Líquido e margem incorretos | Ledger financeiro separado e conciliação; tarifas e tributos confirmados, sem números genéricos |
| Adaptive Pricing ou canal não homologado ativo | Valor cobrado difere do catálogo | Allowlist de canais e verificação de configuração/sessão; impedir discrepância |
| UI/idioma alterar currency | Cobrança involuntária | Seleção e aceite independentes; snapshot/versionamento; testes dos quatro pares |
| Mapping por e-mail/metadata | Exposição entre tenants | Mapping interno por conta/ambiente/IDs, validação de ownership e Customer separado |
| Retry de efeito financeiro incerto | Dupla cobrança/refund | Registro durável e reconciliação antes de repetir; idempotência sem PII |
| Webhook atrasado sobrescrever estado novo | Direitos incorretos | Serialização, version check e releitura atual; não ordenar por timestamp de evento |
| Dados financeiros em prompts/logs | Privacidade e retenção indevidas | Minimização, campos permitidos, acesso restrito e expurgo aprovado |
| Mudança de plano reiniciar medidor | Bypass de capacidade/budget | DP-29 explícita, reservas e testes de período/concorrência |
| Kill switch ignorar renovações existentes | Cobranças continuarem durante incidente | Runbook separado para aquisições e assinaturas; manter reconciliação |
| Desabilitar tenant apagar trilha financeira | Perda de evidência ou conflito de retenção | Política jurídica de retenção e constraints testadas antes de novas tabelas |
| Evidência de release local tomada como deploy | Decisões baseadas em ambiente imaginado | Vincular checks a artefato/versão/ambiente; confirmar remoto só quando autorizado |

## Decisões remanescentes e bloqueio

| Pendência | Estado nesta mudança | O que bloqueia |
| --- | --- | --- |
| DP-11a preços e condições | Moedas fixas e seller decididos; valores/intervalos, trial, cobranças de pilotos, grace, cancelamento/refunds e prorrata ainda pendentes | Oferta real e os fluxos financeiros correspondentes |
| DP-29 medidores/período/plano | Preservada como proposta; não alterada por idioma/moeda | Ativação de franquias/cobrança dependente |
| DP-30 quinto check-in | Preservada | Agenda com franquia correspondente |
| DP-31 COGS/rateio/margem | Preservada; acrescentar FX/fees na análise comercial | Promessa econômica de preço/limite |
| DP-22 retenção/termos/DPA | Preservada; incluir billing e operação internacional | Dados reais/lançamento conforme política |
| Conta/banco/entidade e documentação | Não verificados neste pacote | Stripe live e alegação de prontidão comercial |
| Política de tax behavior e cobrança de tributos | Pendente por perfil de venda/jurisdição; Stripe Tax não é adoção automática | Preço final/checkout live |
| Permissões e identidades de billing | Contratos de serviço/RBAC ainda não definidos | Implementação e exposição das operações de billing |
| SLA de reconciliação e operação | Frequência, tolerância de defasagem e alertas/plantão pendentes | Operação live segura |
| Fontes Migration Pack ausentes | Reconciliar quando disponíveis | Encerramento da rastreabilidade dessas fontes; não bloqueia documentação presente |

## Perguntas para validação jurídica e contábil

Entregar aos responsáveis o modelo de operação, países dos compradores, local da equipe/gestão, tipo de serviço e documentos pretendidos. Solicitar conclusão escrita sobre: aptidão/obrigações da LLC; tributação e registros por jurisdição; eventual obrigação da entidade, dos sócios e dos compradores brasileiros; retenções ou encargos nas remessas e tratamento contratual do preço; dados exigidos na invoice; cancelamento/renovação/reembolso; versões dos termos e idioma prevalente; retenção e transferência internacional de dados.

Não fixar alíquotas, declarar isenção ou adotar classificação de SaaS por presunção. O [portal oficial NFS-e](https://www.gov.br/nfse/pt-br/canais-de-atendimento) é ponto de consulta documental; sua existência não determina a obrigação da LLC. Caso a conclusão exija emissão local, mudar seller ou novo provider, explicitar impacto e migração antes de alterar contratos.

## Fora de escopo e deprecated

Fora de escopo: constituição da LLC, abertura de banco/Stripe, cadastro fiscal, contratação de Stripe Tax, cálculo jurídico de impostos, operações reais e ativação Growth. Deprecated **para a proposta futura**, sem alterar fontes históricas: inferir moeda pelo locale, precificar por câmbio dinâmico, tratar recibo como prova de ausência de tributos e utilizar `revenue.recorded` para a assinatura da plataforma. Não há rename/deprecation formal de nenhuma identidade contratual nesta entrega.
