# Change proposal para idiomas e billing internacional

**Status:** `proposed`, documentação preparada; diretrizes comerciais aprovadas no escopo do pedido. **Destino:** `docs/product/marketing-ops/contracts/changes/CR-<próximo número livre>-i18n-pricing-billing-us.md`. **Base observada:** Freeze v1 e hashes dos nove registries compatíveis com manifest v2.22. **Target release:** a atribuir após reconciliação do checkout de destino. Não presumir CR-034 ou Release 2.23 livres.

## Problema e comportamento esperado

A configuração conceitual atual aproxima idioma e moeda no tenant, enquanto a implementação local só mantém locale e timezone. A nova diretriz exige que uma pessoa use a plataforma em inglês e pague uma assinatura em BRL sem alterar o idioma dos materiais de sua marca, sua moeda operacional ou seus direitos.

## Requisitos identificados neste pacote

Estes IDs servem à rastreabilidade documental e não são novos error codes, actions ou gates.

| ID | Requisito | Status |
| --- | --- | --- |
| R-01 | Lançar `pt-BR` e `en-US` nas superfícies do escopo entregue | Aprovado |
| R-02 | Preço independente BRL/USD por plano, sem cálculo cambial de preço | Aprovado |
| R-03 | LLC americana seller; Stripe americano; liquidação bancária nos EUA | Aprovado; configuração da conta pendente |
| R-04 | Invoices/recibos Stripe; sem emissão NFS-e no fluxo planejado | Aprovado como escopo; enquadramento fiscal pendente |
| R-05 | Locale, billing currency, contexto, timezone e moedas operacionais separados | Aprovado; desenho de campos proposto |
| R-06 | Tenant isolation, entitlement, idempotência e auditoria estruturais | Invariante vigente |
| R-07 | Preservar Freeze e registrar toda mudança contratual | Invariante vigente |
| R-08 | Revisão/versionamento de preços e migração explícita de assinaturas | Proposto |
| R-09 | Reconciliação de eventos duplicados, fora de ordem e efeitos incertos | Invariante vigente; desenho proposto |
| R-10 | Não misturar receita do SaaS com receita dos tenants ou custo de IA | Derivado das fronteiras existentes |
| R-11 | Atualizar canônicos por adendos sem editar a referência protegida | Invariante vigente |
| R-12 | Testes negativos, recuperação e verificação bilíngue antes de ativar | Proposto, detalha gates vigentes |

## Mudanças propostas e exclusões

Incluir especificações de locale e saída por tarefa, modelo de preço manual por moeda, identidade de billing por tenant, tradução de provider locales, catálogo externo por ambiente, políticas de lifecycle, recebimento durável de webhook e reconciliação. Documentação de termos comerciais nos dois idiomas depende de revisão jurídica.

Fora deste change set: editar registries/schemas publicados, executar SQL ou implementação, habilitar Stripe, lançar Growth, adicionar meios locais presumidos, escolher valores, emitir documentos fiscais ou aprovar alterações financeiras reais. Nenhum de seus 12 agentes passa a administrar a receita da Oplyra.

## Avaliação de compatibilidade

| Superfície | Avaliação inicial | Tratamento antes de publicação |
| --- | --- | --- |
| Documentação de idiomas e seller | Adendo às decisões | Registrar em ATUALIZACOES e índices, sem reescrever 00 |
| Preferência opcional nova | Potencial minor | Validar leitores antigos, defaults e propriedades adicionais |
| Novo catálogo de preços separado | Contrato novo, não ligado ao runtime atual | Registrar schema/owner/version/fixtures antes de consumo |
| Campo obrigatório novo em contrato existente | Breaking | Major e migração de produtores/consumidores |
| Reinterpretar currency ou locale existentes | Breaking semântico | Não fazer; adicionar campos distintos e período de convivência |
| Novas capabilities de serviço | Lacuna contratual | Registrar ownership e produtor/consumidor; não fingir que Action Registry agentic já as autoriza |
| Nova permission RBAC de billing | Adição com impacto de segurança | Mapear separadamente das seis permissions abstratas dos agentes e testar todos os roles |
| Novo evento financeiro da plataforma | Contrato novo | Não reutilizar `revenue.recorded`; projetar namespace e ownership na revisão |

SchemaVersion desconhecido deve ser rejeitado. Adição opcional também pode quebrar consumidor com `additionalProperties: false`; compatibilidade só pode ser encerrada com contratos e leitores reais. Não alterar o envelope global para incluir `locale` ou `currency` na raiz.

## Ordem obrigatória e saída

1. Resolver baseline e dependências conforme [00](00-BASELINE-E-PRECEDENCIA.md), preservando Freeze v1 como marco histórico.
2. Revisar esta proposta e o ADR: decisões comerciais já aprovadas não precisam ser reaprovadas; resolver detalhes essenciais ainda abertos.
3. Produzir contratos específicos e avaliar versões/compatibilidade, migrations e leitores.
4. Validar schemas e `$ref`, identidades, ownership, permissions, autonomy, handoff/action binding se afetado, side effects/idempotência, entitlements, eventos, errors, fixtures e consumidores antigos/novos.
5. Emitir evidência da cross-validation completa na base efetiva. Somente então alterar registries e publicar manifest de nova release pelo procedimento canônico, preservando manifests antigos. Trabalhar os deltas candidatos de forma isolada até que passem.
6. Implementar os incrementos compatíveis, executar checks aplicáveis e liberar externamente apenas no ambiente e limites autorizados.

Aceite documental: requisitos rastreáveis, fontes e conflitos explícitos, proposta sem identidade inventada publicada e arquivos anteriores preservados. Aceite contratual/comercial/técnico permanece nos checklists [09](09-ACCEPTANCE-AND-TESTS.md).
