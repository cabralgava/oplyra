# Fluxos Stripe de assinatura e liquidação

**Incorporação documental:** CR-034, 28/10/2026. Diretrizes comerciais aprovadas e documentação salva localmente; desenho técnico permanece proposto. Este arquivo é a referência de trabalho; o pacote de preparação é preservado como histórico. Não há implantação ou nova release contratual.

**Status:** desenho proposto; nenhum acesso à conta Stripe. **Destino previsto na preparação:** `docs/product/marketing-ops/billing/STRIPE-FLOWS.md`, complemento de 06 e 08. **Requisitos:** R-02 a R-06, R-08 a R-10, R-12.

## Preparação e fronteira do adapter

Usar a conta americana da LLC como seller; não criar Stripe Connect ou arquitetura marketplace. Confirmar identidade legal, conta Stripe, país, capacidades de cobrança, banco e currency de payout antes de ativar. Test/live têm credenciais, assinaturas de webhook e mappings distintos. Escolher e fixar versão suportada de SDK/API e formato de eventos no incremento; não adotar versões preview copiadas de exemplos externos.

Proposta: Checkout hospedado em modo assinatura; Portal apenas para funções já homologadas. Catálogo manual com um Price por moeda/intervalo/versão, resolvido exclusivamente no servidor. Desativar Adaptive Pricing e verificar a configuração efetiva da sessão e dos canais. Não usar Payment Links no fluxo v1 proposto: a documentação consultada indica Adaptive Pricing sempre habilitado nesse canal. [Adaptive Pricing](https://docs.stripe.com/payments/currencies/localize-prices/adaptive-pricing?payment-ui=stripe-hosted).

Meios de pagamento precisam de interseção verificada entre conta US, moeda, comprador e recorrência. BRL não garante Pix, boleto, parcelamento ou disponibilidade local. Nenhum meio específico é habilitado por este documento. Tax behavior e eventual Stripe Tax dependem de decisão fiscal e testes; não assumir cobrança sem tributos como default.

## Aquisição e checkout

1. Autenticar pessoa e resolver membership e tenant ativo no servidor. Validar permissão específica de billing, cuja definição ainda depende da etapa contratual; `owner/admin` não é atalho implícito.
2. Receber intenção com plano, moeda escolhida e referência da oferta. Ignorar montante e ID externo fornecidos como autoridade pelo cliente. Resolver PriceVersion elegível/vigente, intervalo, impostos, disponibilidade do produto e termos.
3. Mostrar seller Oplyra LLC, moeda ISO, valor, periodicidade, tributos/descontos, renovação, cancelamento e documento comercial. Guardar versão e aceite. Preço desatualizado exige novo preview/aceite.
4. Criar operação interna durável com ID aleatório, fingerprint do payload normalizado e estado de execução. Reservar unicidade de aquisição por tenant/política para impedir cliques concorrentes gerando assinaturas duplas.
5. Obter/criar Customer do mapping interno de tenant/conta/ambiente, de forma idempotente. Criar Checkout Session com Price conhecido, quantidade e configuração permitidas. Enviar referências internas mínimas no Customer/Session/Subscription conforme suporte validado; metadata é pista de reconciliação, nunca autorização de tenant.
6. Gravar external IDs e devolver URL de sessão ao usuário autorizado. URLs de retorno são allowlist por ambiente e não incluem destino arbitrário do cliente. Tokens/URLs temporárias não vão para logs.
7. Retorno do navegador mostra processamento e consulta o estado pelo backend. Não concede entitlement por query string, redirect ou `checkout.session.completed` isoladamente. Autenticação de pagamento pode continuar após o checkout.
8. Expiração da sessão libera a aquisição pendente somente após verificar que não há assinatura/pagamento equivalente concluído. Tentativa nova tem nova intenção/aceite; retry da mesma operação conserva identidade.

## Idempotência e resultado incerto

A Stripe API v1 aceita chave de idempotência em POST e retém o resultado inicial, inclusive erro 500, nas condições documentadas; sua janela não substitui um registro interno durável. [Idempotent requests](https://docs.stripe.com/api/idempotent_requests).

Proposta interna: escopo por tenant, conta, ambiente, tipo da operação e versão; usar chave opaca sem PII. Persistir fingerprint, estado, tentativas, external refs e resultado. Mesma chave/payload retorna o resultado conhecido; mesma chave com payload diferente é conflito, sem nova chamada externa. Chaves de suboperações, como criar Customer e criar Session, são distintas e vinculadas à mesma intenção.

Depois de timeout/queda após chamada ao Stripe, marcar efeito como incerto no estado específico de billing e reconciliar pelo mapping/operação. Não gerar nova chave para “tentar de novo” e não supor que 500 prova ausência de efeito. Antes de retry após a janela do provider, consultar recursos e resolver unicidade interna. Lookup vazio eventual não basta para duplicar uma cobrança. Resultado não resolvido exige escalonamento e bloqueio daquela operação financeira, sem paralisar todos os tenants.

## Entrada de webhook

A Stripe documenta entregas duplicadas e sem garantia de ordem; eventos distintos podem ter o mesmo `created`. Verificação deve usar corpo bruto e assinatura. [Webhooks Stripe](https://docs.stripe.com/webhooks).

Fluxo proposto:

1. Endpoint exclusivo do ambiente identifica a conta configurada, limita tamanho e valida assinatura/tolerância temporal sobre bytes originais antes de interpretar dados. Não confiar em tenant do request ou metadata.
2. Persistir o evento validado em inbox durável com unicidade `(provider, account, livemode, event.id)`, API version, tipo, object ID, horário recebido e referência protegida ao payload. Payload bruto tem minimização/retenção e acesso específico; logs gerais guardam somente metadados seguros.
3. Responder 2xx somente após commit da aceitação durável. Se persistência falhar, retornar falha para reentrega. Evento já persistido pode receber 2xx, mantendo o processamento pendente recuperável. Não marcar “processado” antes do efeito confirmado.
4. Worker reivindica item com lease/fencing conforme contratos existentes. Recupera mapping confiável Customer/Subscription/conta/ambiente → tenant e valida ownership de todos os recursos. Evento válido sem mapping entra em quarentena com rastreio; não cria tenant automaticamente.
5. Dentro de serialização por assinatura, obter estado financeiro atual do provider e validar Price, currency, invoice, período e vínculo. Revalidar versão interna ao aplicar. Se dois workers buscaram snapshots em paralelo, o perdedor refaz a leitura sob a serialização; não aplica snapshot antigo por último. Não ordenar por `event.created` nem tratar timestamp como versão de negócio.
6. Em transação local, atualizar projeção, marcar efeito semântico já aplicado, recalcular entitlement pela política, registrar auditoria e outbox quando aplicável. Inbox só conclui após checkpoint consistente. Chamadas externas adicionais seguem operações idempotentes próprias, sem fingir uma transação distribuída entre banco e Stripe.
7. Falha transiente segue retry limitado; falha de contrato/ownership/política exige classificação e escalonamento. Dead-letter/reprocessamento respeitam versões e política canônica. Reprocessar entrada verificada não exige fabricar assinatura Stripe; identidade de serviço e trilha de replay substituem a origem de rede naquele caminho interno.

Deduplicar o transporte por event ID e o **efeito** por identidade/versão de negócio, por exemplo concessão referente a invoice/período/política. Dois eventos diferentes do mesmo pagamento não concedem duas vezes. Não deduplicar indiscriminadamente todos os `customer.subscription.updated` pelo mesmo object ID/tipo: atualizações legítimas posteriores seriam perdidas.

## Matriz de eventos externos candidata

Estes são nomes do Stripe, não novas entries do Event Registry da Oplyra. Confirmar existência/formato na API fixada. Consumidor inicial proposto: adapter e serviço interno de Subscription & Entitlements; ownership de mensagens normalizadas ainda depende do contrato específico.

| Evento ou família externa | Uso proposto | Efeito que exige política |
| --- | --- | --- |
| `checkout.session.completed` | Associar aquisição e reconciliar objetos | Não ativar apenas pelo evento |
| `checkout.session.expired` | Encerrar tentativa sem pagamento confirmado | Não apagar registro financeiro |
| `customer.subscription.created/updated/deleted` | Reconciliar estado, plano/preço, período e fim efetivo | Concessão/restrição conforme política |
| `invoice.paid` | Verificar invoice/período/subscription atual e refresh de direitos | Invoice zero, crédito e pagamento externo têm regras específicas |
| `invoice.payment_failed` | Registrar falha e iniciar política de recuperação | Grace, comunicação e bloqueio |
| `invoice.payment_action_required` | Mostrar ação necessária ao responsável | Aviso transacional idempotente |
| `invoice.finalized/finalization_failed` | Acompanhar documento pronto ou falha de emissão | Não inventar recibo de pagamento |
| `customer.updated` | Reconciliar preferências/dados de billing quando usados | Nunca alterar L1/L2 automaticamente |
| `charge.refunded` e eventos de refund aplicáveis | Reconciliar refund parcial/total e estado final | Crédito e entitlement não são presumidos |
| `charge.dispute.created/closed` | Abrir/reconciliar caso de risco | Restrição e resposta humana por política |
| `payout.paid/failed` | Conciliação de tesouraria da plataforma | Sem conceder/revogar entitlement do tenant |

A Stripe documenta eventos de assinatura, invoice, refund e disputa e recomenda provisionamento com verificação do estado financeiro correspondente. A aplicação acima é política proposta da Oplyra. [Subscriptions webhooks](https://docs.stripe.com/billing/subscriptions/webhooks).

Stripe Entitlements não substitui o serviço interno e não é adotado automaticamente. A assinatura da Oplyra é receita da plataforma; não publicar `revenue.recorded` para o tenant por esse pagamento. Receita dos clientes importada por integrações mantém domínio, fonte, confiança e entitlement próprios.

## Invoices, recibos e Portal

Subscriptions geram invoices; recibos correspondem a pagamentos/refunds e dependem das configurações de envio. Testes não demonstram automaticamente envio de recibo live. [Receipts and paid invoices](https://docs.stripe.com/receipts).

Proposta: configurar identidade legal e contato comercial da LLC e descrição clara do serviço. Reconciliar número/ID, moeda, valor, período, tributos, estado, idioma solicitado e links do documento. UI distingue invoice em aberto de comprovante pago e informa que a documentação comercial é da LLC. Não rotular invoice como NFS-e.

Portal Session só é criada no servidor para Customer mapeado ao tenant autorizado, com return URL permitida e configuração limitada. Não permitir que o cliente envie Customer ID livre. Desabilitar troca de plano/moeda/cancelamento/refund no Portal enquanto a política correspondente não estiver homologada. Conferir que o Portal não exibe informações de outro tenant da mesma pessoa.

Reembolso aprovado referencia pagamento original e valor ainda reembolsável, currency e motivo. Concorrência não pode exceder o saldo do pagamento. A resposta pendente não é refund concluído: reconciliar o estado final. Cancelamento de assinatura e reembolso são efeitos separados. Ajuste de invoice/credit note depende do caso e do parecer contábil.

## Liquidação e reconciliação

Separar quatro conjuntos: oferta/preço; cobrança/invoice; saldo/balance transaction; payout bancário. Payouts agrupam movimentos e não têm relação um-para-um com tenants. A Stripe transfere saldo disponível conforme configuração e exige banco/moeda compatíveis. [Payouts](https://docs.stripe.com/payouts).

Reconciliação proposta em duas trilhas:

- **Subscription:** comparar mapping, preço/moeda, período, invoice, estado e entitlement; detectar webhooks ausentes, objetos órfãos, assinatura dupla e deltas manuais feitos no Dashboard. Cursor/paginação duráveis, janela sobreposta e processamento idempotente. Frequência e limite de defasagem são pendências operacionais com owner definido em [08](../change-packages/2026-10-28-i18n-billing-us/08-RISKS-ASSUMPTIONS-OPEN-ITEMS.md).
- **Tesouraria:** relacionar cobranças/refunds/disputas a balance transactions, taxas, conversão e payout, depois ao extrato da conta EUA. Registrar montante e currency de origem e de settlement, taxa/fonte/data quando disponíveis e diferenças investigáveis. Não somar moedas; não inferir bruto/fee a partir apenas do líquido.

Métricas propostas: idade máxima de inbox, lag de entitlement, reconciliação atrasada, mapping ausente, efeito incerto, preço/moeda divergente, retry esgotado, falha de invoice e payout. Logs não contêm cartões, payloads financeiros integrais ou links sensíveis. Alertas devem ter responsável, limiar e ação, sem depender de interpretação do LLM.
