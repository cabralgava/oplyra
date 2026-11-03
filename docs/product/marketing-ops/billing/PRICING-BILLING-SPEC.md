# Especificação de preços e assinaturas

**Incorporação documental:** CR-040, 28/10/2026. Diretrizes comerciais aprovadas e documentação salva localmente; desenho técnico permanece proposto. Este arquivo é a referência de trabalho; o pacote de preparação é preservado como histórico. Não há implantação ou nova release contratual.

**Status:** estrutura BRL/USD e seller aprovados; modelo operacional e lifecycle propostos. **Destino previsto na preparação:** `docs/product/marketing-ops/billing/PRICING-BILLING-SPEC.md`, complemento de 08 e ADR-0007. **Requisitos:** R-02 a R-06, R-08 a R-10.

## Catálogo e moeda

Manter `performance` e `growth`; nenhum preço da proposta de assessoria é preço do software. Valores de US$ 40 e US$ 85 continuam budgets internos de COGS operacional, fora das taxas Stripe, não preços de venda ou créditos ao cliente. Preservar 08 §§3, 9 e as pendências de 17/DP-31.

| Plano | BRL | USD | Periodicidade | Oferta no lançamento |
| --- | --- | --- | --- | --- |
| `performance` | Pendente | Pendente | Pendente DP-11a | Núcleo inicial conforme roadmap; venda só depois dos gates |
| `growth` | Pendente | Pendente | Pendente DP-11a | Configuração futura; não habilitar por este pacote |

Cada combinação aprovada de plano, moeda, intervalo e versão tem valor explícito. Não calcular BRL multiplicando USD por câmbio, nem aceitar valor enviado pelo navegador. Um intervalo anual não pode ser inferido de 12 mensalidades; desconto, trial, cupom, add-on, seat e overage requerem configuração aprovada. Não publicar matriz com `null` como zero.

O arquivo [pricing-catalog.proposed.json](../change-packages/2026-10-28-i18n-billing-us/pricing-catalog.proposed.json) é planilha lógica editável, não registry operacional. Campos pendentes impedem publicação. Requer schema próprio e validador determinístico na fase contratual; `status` desse arquivo não é status de Transaction Envelope.

## Modelo proposto

| Conceito | Dados mínimos e regra |
| --- | --- |
| Plan existente | ID interno, capacidades/limites versionados, disponibilidade por fase; preço separado |
| PriceVersion proposto | ID interno, planKey, currency, amountMinor, intervalo/count, versão, vigência, tax behavior, situação e aprovação |
| Oferta aceita | PriceVersion, total/tributos/descontos, seller, termos/idioma/versão, data/ator, validade da oferta, trace e idempotência |
| Billing profile por tenant | Tenant, responsável, país/endereço declarado para billing, dados mínimos de comprador e preferência de documento; acesso restrito |
| Mapping do provider | Ambiente, conta Stripe, tipo/ID interno, ID externo, versão e data; IDs test/live nunca intercambiáveis |
| Subscription interna | Tenant, plano/preço aceito, moeda contratada, período financeiro, estado normalizado, provider refs, cancelamento efetivo, versão e última conciliação |
| Invoice/payment projection | Tenant, moeda/valores, período, tributos/descontos/créditos, estado externo e normalizado, IDs e links controlados |
| Entitlement snapshot | Tenant, capabilities/limites, política/versão, origem e validade; override separado da assinatura |

Preferir Customer separado por tenant dentro de cada conta/ambiente Stripe, mesmo quando a mesma pessoa paga duas empresas. Um Customer compartilhado ampliaria visibilidade de Portal e exige desenho específico; não é proposto para v1. Relações e caches são escopados por tenant; não fazer lookup apenas por e-mail ou metadata.

Cobrança de assinatura usa inteiro em minor units e currency explícita (`BRL`/`USD` no domínio; adapter faz normalização). Custo de IA mantém microUSD existentes. Não unificar as unidades por nome de campo `amount` nem reutilizar o ledger econômico como ledger de receita. Totais multimoeda são separados; consolidação financeira usa taxa, fonte, data, regra e origem, sem mudar preço contratado. Arredondamento proposto: cálculo determinístico em decimal/inteiro, rounding definido no schema e alinhado ao total do provider; nunca ponto flutuante binário para dinheiro.

## Preços e mudanças de moeda

Preços novos são novas versões imutáveis. Proposta de adapter: um Product por plano e Prices separados por moeda, intervalo e versão. A Stripe permite múltiplos preços; não editar retroativamente invoices ou supor que criar/arquivar Price migra assinaturas. [Gestão de produtos e preços](https://docs.stripe.com/products-prices/manage-prices).

Reajuste em uma moeda não muda a outra automaticamente. Cada proposta deve informar versão anterior/nova, segmentos afetados, vigência, margem e condições de comunicação/aceite. A decisão entre manter condições antigas ou migrar é DP-11a, não default implícito.

Troca de moeda não é troca de locale nem alteração de formatação. **Proposta v1:** impedir troca self-service em assinatura vigente até haver fluxo homologado; oferecer solicitação governada. Plano de troca exige novo aceite, tratamento do fim do período antigo, créditos/refunds na moeda original, novo preço e prevenção de duas assinaturas simultâneas. Verificar limitações do provider sem assumir que basta atualizar o currency da Subscription. Não somar saldo BRL e USD ou transferi-lo por cotação implícita.

## Lifecycle comercial

As linhas abaixo especificam comportamentos candidatos e pontos de bloqueio. Nenhum prazo de grace, multa, obrigação de reembolso ou trial é aprovado por este documento.

| Situação | Regra proposta | Decisão ainda necessária |
| --- | --- | --- |
| Primeiro checkout | Confirmar oferta/seller/moeda/intervalo e iniciar aquisição idempotente | Preços, meios elegíveis, tributos, termos |
| Pagamento confirmado | Reconciliar vínculo, invoice e assinatura; aplicar direitos compatíveis | Política de ativação para invoice zero, créditos e trial |
| Incomplete/ação requerida | Não conceder plano pago novo; permitir resolver billing | Prazo de expiração e experiência |
| Renovação | Usar PriceVersion contratado; refresh idempotente do período | Reajuste, comunicação e autorização aplicáveis |
| Falha inicial | Não iniciar capacidade paga nova | Tentativas e aviso |
| Falha em renovação | Separar acesso administrativo/billing da capacidade paga; política explícita de grace | Prazo, canais, restrições e encerramento |
| Upgrade | Propor preview e aceite de preço/prorrata; ampliar direito só após condição financeira aprovada | Imediato ou próximo ciclo, prorrata e franquia |
| Downgrade | Propor vigência no próximo ciclo; preservar dados existentes e bloquear novas operações incompatíveis | Tratamento de recursos acima do limite e retenção |
| Cancelamento | Propor fim do período já pago, com data explícita e caminho de reversão antes da efetivação | Cancelamento imediato, refund e requisitos jurídicos |
| Reembolso | Operação aprovada e idempotente, parcial/total com moeda original e vínculo financeiro | Elegibilidade, prazo, tributos, credit note e direito remanescente |
| Disputa/fraude | Revisão de risco; não apagar tenant ou cancelar cegamente | Política de restrição, defesa e escalonamento |
| Trial/cortesia | Direito temporário explícito separado de estado financeiro | Duração, cartão, renovação, expiração e comunicação |

Preview é estimativa até o aceite e confirmação financeira. Nas mudanças na mesma moeda, substituir o item de assinatura correto em vez de adicionar outro acidentalmente; uso de prorrata deve ser explícito e testado. [Mudança de preço em assinaturas Stripe](https://docs.stripe.com/billing/subscriptions/change-price).

## Estado e entitlement

Preservar `Tenant.status = active|suspended` na identidade. Estados Stripe como `incomplete`, `trialing`, `active`, `past_due`, `unpaid`, `paused`, `canceled` e `incomplete_expired` pertencem à borda financeira e precisam de mapping versionado; não são novos status transacionais. Pausa de collection pode diferir de pausa da assinatura. Estados não reconhecidos impedem concessão automática e geram investigação.

Função de política proposta: `direito efetivo = capacidade contratada elegível ∩ disponibilidade do produto ∩ política de acesso financeiro`, combinada com overrides válidos expressos e limites existentes. A chamada ainda exige permission/autonomy/approval/budget/consent/asset rights aplicáveis. Override não transforma cobrança falhada em paga; assinatura paga não libera Growth indisponível ou publicação sem approval.

Antes da implementação, definir política explícita para assinatura `active` com invoice em aberto, invoice zero, cupom de 100%, crédito, pagamento marcado fora do Stripe, trial e disputa. Não assumir que um booleano `paid` basta para todos os casos. Na ausência de configuração, negar novas concessões/ampliações; não revogar às cegas direitos já comprovados por uma indisponibilidade transitória. Retenção do último snapshot só até sua validade; expiração e tolerância exigem política, observabilidade e recuperação.

Reavaliar entitlement na entrada e no momento da execução de job; invalidar caches por versão e tenant. Mudança de plano não reinicia medidores automaticamente. Período comercial proposto em 08 §11 é mês civil no timezone do tenant e permanece distinto do ciclo Stripe, pendente DP-29. Preservar reservas concorrentes, custos de tentativas e DP-30 para quinta ocorrência de check-in.

## Auditoria financeira

Cada mudança registra tenant, ator/identidade de serviço, permissão e política/approval, estado/versão anterior e posterior, PriceVersion, moeda/valores, instantes, correlation/causation, operação idempotente e IDs externos. Aceite guarda versões de preço e termos, locale exibido e evidência do total confirmado, sem armazenar cartão ou segredos. Dados pessoais e URLs de documentos não vão para prompts ou logs gerais. Retenção e exclusão financeiras seguem decisão jurídica própria; exclusão de tenant não deve apagar prova obrigatória sem política validada.
