# Plano de atualização dos documentos canônicos

**Status:** texto e deltas preparados para revisão/incorporação; nenhum canônico alterado. **Destino recomendado:** manter no pacote junto ao CR. **Requisitos:** R-01 a R-12.

## Sequência de edição

1. Confirmar baseline e próximos IDs livres de ADR/CR; vincular os arquivos 01/02 em `docs/decisions/README.md` e no índice contratual.
2. Acrescentar o registro abaixo em `docs/product/marketing-ops/ATUALIZACOES.md`. Não alterar 00, Freeze ou manifests históricos.
3. Atualizar documentos 01–18 nos trechos identificados em [06](06-CONTRACTS-AND-IMPACT.md), com links às specs e sem duplicar regras de preço/meter em várias fontes.
4. Acrescentar clarificações de contexto/idioma em documento específico e referências de 19/agents README; qualquer mudança de contrato publicado requer seu próprio delta e avaliação.
5. Atualizar ADR-0007 e DP-11a por sucessão parcial; não marcar toda a decisão comercial como resolvida.
6. Produzir e validar contratos/deltas, fixtures e versões; só depois aplicar registries e manifest no processo pós-Freeze.
7. Implementação incremental e testes seguem [07](07-MIGRATION-ROLLOUT-ROLLBACK.md), sem autorização implícita de operação externa.

## Texto proposto para ATUALIZACOES

### Idiomas e operação comercial internacional aprovada em 28/10/2026

Por decisão explícita do proprietário, a Oplyra terá lançamento em pt-BR e en-US. Os planos terão preços fixos, explícitos e independentes em BRL e USD, sem conversão cambial dinâmica para determinar o preço cobrado. Os valores por plano, periodicidades e demais condições comerciais permanecem pendentes até definição própria.

A Oplyra LLC americana será a entidade vendedora. Stripe da conta americana da LLC será utilizado para billing, invoices e recibos comerciais, com liquidação bancária nos EUA. O fluxo planejado não inclui emissão de NFS-e brasileira. A diretriz não substitui a validação jurídica e contábil da entidade, das vendas e dos documentos exigíveis nas jurisdições aplicáveis. A conversão financeira necessária à liquidação não altera o preço contratado em BRL ou USD.

Locale de apresentação, idioma de conteúdo, moeda da assinatura, fuso e contexto empresarial são separados. A mudança preserva tenant isolation, entitlements configuráveis, idempotência, auditoria, controle de versões, aprovações e autonomia existentes. Stripe continua atrás de adapter próprio. Não se amplia a autonomia dos agentes nem o escopo Growth.

Os detalhes técnicos estão propostos no pacote CP-I18N-BILLING-US-2026-10-28. A decisão de negócio está aprovada; sua publicação contratual e implementação seguem a política pós-Freeze, com avaliação de compatibilidade, versões, validação cruzada e manifest. Este registro não comprova conta/configuração Stripe, operação fiscal, cobrança, deploy ou ativação.

## Delta proposto para 08 e ADR-0007

No §1 de 08, manter Stripe e a informação de que os valores ainda não estão definidos; acrescentar que cada valor será fixado independentemente em BRL e USD por plano/intervalo/versionamento aprovado. Vincular a especificação de pricing, sem copiar tabela de valores enquanto estiver pendente.

No §13, registrar seller LLC/Stripe US/documentos comerciais e exclusão de NFS-e no fluxo planejado. Preservar a necessidade de validar entidade, meios de pagamento, impostos e documentação; remover apenas eventual interpretação de que haverá emissão NFS-e obrigatoriamente integrada no lançamento. Não substituir o texto por “sem obrigação fiscal no Brasil”.

Em ADR-0007 e DP-11a, acrescentar: “Atualização de 28/10/2026: aprovados idiomas de lançamento, preços independentes BRL/USD como estrutura, seller LLC americana e documentação comercial Stripe. Permanecem pendentes os valores, intervalos, trial, pilotos, inadimplência, cancelamento, reembolsos, prorrata e ativação comercial. Integração de teste não constitui autorização de cobrança real.”

## Delta proposto para contexto e contratos

Em 19, manter L1 `identity.language/currency/timezone` como características da empresa. Acrescentar referência à distinção entre idioma empresarial, locale da pessoa, target locale da tarefa e billingCurrency da assinatura Oplyra. Dados recebidos do billing dos clientes, por sua vez, continuam fontes comerciais do tenant. Não promover country/locale de checkout a identidade empresarial confirmada.

Em agents README, acrescentar regra de saída humana no idioma resolvido pela tarefa e política de conteúdo, sem traduzir keys/enums/identidades ou alterar autonomy. Traduções de ativos passam por versões/revisões. Não reescrever os 12 agentes.

Em 20 e contracts README, preferir links para schemas específicos futuros. Não alterar envelope global para embutir campos de locale/currency. Erros de provider são mapeados para contratos conhecidos; nomes Stripe não entram automaticamente no Event Registry. O `operational_gate` continua determinístico e `strategy-quality-agent` mantém revisão independente.

## Superfícies comerciais bilíngues propostas

Textos abaixo são candidatos de interface e ajuda; exigem revisão comercial/jurídica e devem corresponder à configuração real antes de uso. Não são termos de serviço completos.

| Contexto | pt-BR | en-US |
| --- | --- | --- |
| Seletor de idioma | Idioma da interface | Interface language |
| Seletor de moeda | Moeda da assinatura | Subscription currency |
| Ajuda sobre moeda | O idioma da interface não altera a moeda ou o preço da sua assinatura. | Your interface language does not change your subscription currency or price. |
| Seller/documentos | Assinatura vendida pela Oplyra LLC, dos Estados Unidos. Invoices e recibos comerciais disponibilizados pela Stripe. O fluxo planejado não emite NFS-e brasileira. | Subscription sold by Oplyra LLC, United States. Commercial invoices and receipts are provided through Stripe. The planned billing flow does not issue Brazilian NFS-e documents. |
| Pagamento em verificação | Estamos verificando o pagamento. As capacidades contratadas serão atualizadas após a confirmação aplicável. | We are verifying the payment. Your subscription capabilities will be updated after the applicable confirmation. |
| Cobrança pendente | Seu pagamento precisa de atenção. Consulte as opções de cobrança para continuar. | Your payment needs attention. Review your billing options to continue. |

Nome legal, contatos e quaisquer campos obrigatórios dependem da verificação da LLC. Não publicar placeholders como dados reais. Taxas/tributos e total final precisam de linguagem revisada para cada mercado; não afirmar que cobrar em BRL elimina encargos do emissor do cartão.

## Definition of Done de incorporação documental

Adendo e índices apontam para o mesmo ADR/CR; nenhum ID duplicado; propostas têm status explícito; preços pendentes não aparecem como oferta disponível; todas as refs locais resolvidas; ausência do Migration Pack registrada; schemas/registries publicados somente após validação; Freeze histórico e documento protegido com hashes preservados. Atualizar o estado do repositório somente ao incorporar, relatando o que efetivamente ocorreu, sem declarar runtime ou lançamento.
