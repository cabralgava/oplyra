# Especificação de internacionalização

**Incorporação documental:** CR-040, 28/10/2026. Diretrizes comerciais aprovadas e documentação salva localmente; desenho técnico permanece proposto. Este arquivo é a referência de trabalho; o pacote de preparação é preservado como histórico. Não há implantação ou nova release contratual.

**Status:** idiomas de lançamento aprovados; políticas de resolução e campos propostos. **Destino previsto na preparação:** `docs/product/marketing-ops/i18n/I18N-SPEC.md`, vinculado a 14, 19, 20 e ADR de incorporação. **Requisitos:** R-01, R-05, R-06, R-11, R-12.

## Escopo de lançamento

`pt-BR` e `en-US` devem cobrir site público, produto entregue, onboarding/autenticação/convites, avisos e estados, billing, ajuda e comunicações transacionais aplicáveis. Conteúdo jurídico e comercial terá versão em cada idioma revisada; o idioma contratualmente prevalente é pendência jurídica, não escolhido automaticamente pela UI. Documentação técnica interna pode continuar em pt-BR.

Não é necessária tradução retrospectiva automática de dados digitados, provas, arquivos, mensagens antigas ou histórico de tenant. Recursos Growth continuam na fase e entitlement próprios. Suportar dois idiomas na UI não promete tradução perfeita ou cobertura de qualquer idioma por todos os modelos.

## Campos e semântica

Os nomes abaixo são **candidatos de modelo**, não campos adicionados ao envelope ou schemas publicados. Reutilizar equivalentes reais após avaliação em [06](../change-packages/2026-10-28-i18n-billing-us/06-CONTRACTS-AND-IMPACT.md).

| Conceito | Nome candidato | Autoridade e efeito |
| --- | --- | --- |
| Idioma da pessoa | `preferredLocale` | Preferência autenticada da pessoa; apresentação, sem efeito financeiro |
| Idioma efetivo da tela | `uiLocale` | Resolvido por sessão/rota suportada; não é verdade empresarial |
| Padrão do tenant | `tenant.locale` existente | Mantém significado e valor atual; fallback de apresentação até revisão explícita |
| Idioma do documento de cobrança | `billingDocumentLocale` | Preferência do destinatário responsável de billing, com versão e suporte do provedor |
| Idioma da entrega | `outputLocale` | Requisito explícito da tarefa/canal, sujeito à verdade de marca aprovada |
| Idiomas e mercados da empresa | L1 `identity.language` e `operatingMarkets` existentes | Declaração empresarial governada; sem inferência por navegador |
| Voz, claims e oferta por mercado | L2 Brand & Business Truth | Conteúdo aprovado e suas restrições; tradução é novo derivado versionado |
| Moeda de assinatura | `billingCurrency` | Termo financeiro confirmado em Subscription; nunca resolvido por locale |
| Moeda de análise | `reportingCurrency` candidato ou moeda da fonte | Métricas explícitas; conversão exige política própria |
| Fuso | `tenant.timezone` existente | Agenda e período operacional, não variante de idioma |

## Resolução proposta

**Site público:** seleção explícita por rota → escolha persistida → idioma do navegador reconhecido → `pt-BR` como fallback proposto. Não forçar moeda pelo IP. Rotas candidatas `/pt-br/` e `/en-us/` no site; avaliar roteamento e SEO antes de aplicar. Links canônicos e `hreflang` devem apontar para páginas equivalentes; não criar rotas supostamente já existentes.

**Produto autenticado:** seleção explícita da pessoa/sessão → preferência persistida da pessoa → padrão do tenant ativo → idioma suportado do navegador → fallback `pt-BR` proposto. Uma pessoa pode acessar dois tenants sem transportar dados privados entre caches. Trocar de tenant refaz membership e fallback; não troca assinatura.

**Billing:** resolver moeda separadamente pelo snapshot de assinatura ou pela oferta selecionada e confirmada. UI pode sugerir BRL ou USD antes da compra, mas sempre mostrar seletor e confirmação; a elegibilidade por país/mercado é regra comercial pendente. Seleção explícita não pode contornar restrição comercial/legal. Para assinatura existente, mostrar a moeda contratada.

**Conteúdo gerado:** pedido explícito válido da tarefa → configuração da iniciativa/canal aprovada → padrão de conteúdo da marca → idioma empresarial declarado no L1. Se a entrega externa exigir idioma não resolvido ou conflitar com política da marca, registrar `missingContext`/conflito e obter resolução. O locale da tela não determina o idioma da campanha. Idiomas adicionais ao lançamento exigem avaliação/modelo/template habilitados e não ampliam o suporte contratado.

**Comunicações:** notificações pessoais seguem destinatário; mensagens do tenant seguem configuração de destinatário/tarefa; avisos de billing seguem o contato de billing. Mensagens de marketing permanecem Growth-only. Aviso transacional de pagamento não depende do módulo de e-mail marketing e não concede consentimento para marketing.

## Formatos, mensagens e acessibilidade

Usar chaves estáveis, pluralização e interpolação com parâmetros nomeados. Não concatenar frases traduzidas, montar preço por separadores manuais ou traduzir keys de agent/action/event/error. Catálogos dos dois idiomas devem ter as mesmas chaves e parâmetros e revisão humana de mensagens críticas. Não escolher nova biblioteca neste pacote; confirmar stack e versão antes da implementação.

| Dado de origem | `pt-BR` | `en-US` | Regra |
| --- | --- | --- | --- |
| Valor ilustrativo BRL 123456 minor units | R$ 1.234,56 | BRL 1,234.56 | Exemplo de formato, não preço de plano; exibir ISO quando houver ambiguidade |
| Valor ilustrativo USD 123456 minor units | US$ 1.234,56 | USD 1,234.56 | Moeda original preservada |
| Data de calendário 2026-10-28 | 28/10/2026 | 10/28/2026 | Não interpretar string formatada como dado de integração |
| Instante e agenda | Hora local e fuso identificável | Hora local e fuso identificável | Armazenar instante em UTC; fuso do tenant para agenda |
| Dado ausente | Indisponível | Unavailable | `null` preservado; zero só quando observado |

Usar recursos Intl/CLDR da stack validada. Campos monetários aceitam entrada localizada nas bordas e retornam valor tipado/moeda; rejeitar ambiguidade. Percentuais, datas, números negativos, plural, texto longo e leitores de tela integram QA. Atualizar `lang`, labels acessíveis e mensagens de validação. Layout deve comportar expansão de texto sem modificar a marca ou presumir medidas Figma.

Fallback silencioso em mensagens de cobrança/consentimento/erro de autorização não é aceitável: ausência de tradução crítica bloqueia a liberação da superfície. Para texto não crítico, fallback com telemetria e identificação suficiente para corrigir, sem PII.

## Agentes e Context Stack

| Camada | Tratamento |
| --- | --- |
| L0 | Regras globais e protocolo mantêm identidade, enums e controles |
| L1 | Idioma, mercado, moeda empresarial e fuso mantêm origem/status/versão; não viram moeda da assinatura |
| L2 | Traduções de claims, oferta e voz preservam origem, direitos e revisão por mercado |
| L3 | Moedas das fontes, freshness e períodos explícitos; não converter receita por locale |
| L4 | Recorte de domínio e capacidade preservados; não entregar documentos financeiros privados a todo especialista |
| L5/L6 | Target locale/mercado da iniciativa e constantes do experimento explícitos; tradução pode alterar hipótese |
| L7 | Idioma da tarefa e evidências selecionadas, sem promover conversa a L1/L2 |
| L8 | Pedido imediato interpretado no escopo e permissão do ator; não altera contexto superior por si |

Todos os 12 agentes preservam agent.key e catálogo. Orchestrator coordena; especialistas produzem; Strategy & Quality revisa outros executores e não se autoaprova. Tradução de peça aprovada gera nova versão derivada, preserva evidência e requer nova revisão/aprovação quando o conteúdo executado mudar. Não traduzir valores jurídicos, preços de ofertas ou provas como se fossem livres adaptações.

A promoção continua `Learning Record → Context Update Candidate → Review/Approval → Context Promotion`. Alterar preferência pessoal de UI não é promoção de verdade de marca; alterar L1/L2 segue governança. Não colocar `outputLocale` como propriedade nova na raiz do Transaction Envelope: usar input/output específico ou slice contextual cujo contrato tenha sido publicado.

## Superfícies Stripe

O adapter traduzirá locales BCP 47 internos para os valores efetivamente aceitos pela API/SDK escolhidos em Checkout, Portal e Customer. O mapping `pt-BR → pt-BR` e `en-US → en` é **candidato a validar**, não contrato verificado neste pacote. Não assumir que todos esses produtos aceitam os mesmos códigos ou traduzem descriptions livres de Products/Prices. Invoices/recibos precisam de amostras verificadas em ambos os idiomas; se o provedor impuser restrição, documentá-la e resolver antes da promessa comercial. [Checkout Session API](https://docs.stripe.com/api/checkout/sessions/create).

Histórico de documentos e aceite mantém idioma/versão originais. Links de billing são disponibilizados somente após autorização por tenant. Testes e critérios completos em [09](../change-packages/2026-10-28-i18n-billing-us/09-ACCEPTANCE-AND-TESTS.md).
