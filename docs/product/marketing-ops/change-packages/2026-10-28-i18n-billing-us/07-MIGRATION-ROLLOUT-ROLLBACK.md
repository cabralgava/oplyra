# Plano de migração e liberação

**Status:** proposto; nenhuma migration executada. **Destino recomendado:** `docs/product/marketing-ops/billing/MIGRATION-ROLLOUT.md`. **Requisitos:** R-05 a R-12.

## Fases e condições de saída

| Fase | Trabalho | Condição para avançar |
| --- | --- | --- |
| M0 Baseline | Reconciliar fontes/working tree/release aplicável; preservar Freeze e manifests | Base identificada, conflitos registrados, sem integrar estágios antigos por suposição |
| M1 Decisão documental | Incorporar adendo, ADR/CR e contratos propostos | Diretrizes aprovadas rastreáveis; detalhes essenciais decididos ou explicitamente bloqueados |
| M2 Contratos | Definir schemas, owners/identidades, versões, políticas e fixtures | Cross-validation completa do delta e consumidores, nova release/manifest conforme Freeze |
| M3 Local | Implementar locale e billing por portas/fakes; migrations aditivas; políticas, RLS e UI | Testes locais com dois tenants, dados sintéticos e gates pertinentes aprovados |
| M4 Stripe teste | Homologar conta, preços de teste, documentos, webhooks, Portal, lifecycle e reconciliação | Autorização de sandbox aplicável; evidência por API/SDK/conta/ambiente e caso; sem dados reais |
| M5 Prontidão comercial | Preços/termos, trial/inadimplência, impostos, dados legais, banco e atendimento | Pendências bloqueantes resolvidas e checklist de lançamento aprovado |
| M6 Liberação | Deploy e ativação graduais com configuração e rollback verificados | Autorização correspondente de ambiente/efeitos; reconciliação saudável e evidência de versão |

M0 e preparação de M1 são cobertas por este pedido. Nenhuma fase é comprovada por estar escrita no plano. O Freeze já encontrado é antecedente; M2 é governança pós-Freeze, sem reabertura do discovery.

## Estratégia de dados e convivência

1. Inventariar apenas no ambiente autorizado: tenants, locales, timezone, entitlements/overrides, histórico, assinaturas e preço/moeda reais se existirem. Não assumir base vazia por ser greenfield nem assumir clientes pagos por haver tabelas.
2. Preservar `tenant.locale`. Valores pt-BR/en-US válidos são mantidos. Valores inesperados geram relatório e decisão de mapping; não usar `UPDATE` global silencioso. Preferência individual pode começar ausente e usar fallback sem modificar L1.
3. Não backfill de `billingCurrency` por idioma, timezone, IP ou país. Sem assinatura, manter ausência/pendência e exigir escolha/aceite no primeiro checkout. Havendo assinatura, reconciliar moeda/Price/conta e preservar condições originais antes de preencher.
4. Havendo `tenant.currency` em outro contrato/base, mantê-la com semântica anterior e criar novo campo explícito. A implementação local inspecionada não o persiste. Não inventar migration de rename em coluna inexistente.
5. Expandir com entidades/mappings novos, campos inicialmente opcionais e leitores compatíveis. Validar/backfill por lotes escopados ao tenant, com dry run, checkpoints, contagens e auditoria. Só depois tornar obrigatório no contrato específico aplicável; major se quebrar consumidores.
6. Separar dados de conta Stripe/test-live e mappings. Só importar IDs do ambiente correspondente. Ausência, duplicidade ou divergência de seller/moeda/assinatura entra em quarentena.
7. Preservar documentos emitidos, aceite e versão de preço. Reprocessamento usa política histórica ou migração explícita de política, nunca reinterpretação silenciosa.

Controles propostos: unicidade de mapping por conta/ambiente/tipo/ID externo; FK/constraint que preserve tenant nos vínculos operacionais; aquisição concorrente por tenant/política; inbox única e outbox consistente; permissões mínimas e RLS para novos dados. Migrations e grants serão desenhados e testados no incremento, não simulados como já definidos neste pacote.

## Catálogo e contratos antigos

Criar preços nas duas moedas somente após aprovar valores e intervalo. Cada ambiente recebe IDs próprios. Catálogo novo referencia mappings conhecidos e habilita apenas ofertas completas. Preços antigos deixam de ser escolhidos por novas aquisições quando for o caso, mas assinaturas existentes seguem o aceite até migração comercial específica.

Não atualizar todos os clientes para novo Price nem mudar moeda automaticamente. Segmentar assinaturas a migrar; produzir preview, comunicar/obter aceite conforme política jurídica, controlar data efetiva e monitorar cada operação idempotente. Falha em uma assinatura não autoriza refazer todas. Compensações são operações financeiras novas e auditadas.

## Liberação gradual proposta

Primeiro liberar apresentação bilíngue e preview de oferta sem cobranças; depois fake local; depois sandbox autorizado; então habilitar tenant/coorte live autorizada, com métricas e atendimento. Feature flags de UI, checkout, mudanças e refunds devem ter escopo e owner; negar caminhos pelo servidor quando desligados. Flags não substituem permissões.

Antes de live, confirmar configuração de Adaptive Pricing/canais, Price IDs, API version, assinatura do webhook, testes de conta e banco alvo. Não usar produção como fallback de local/CI. O conjunto de documentos e termos exibido no aceite deve corresponder ao que foi homologado nos dois idiomas.

## Rollback e recuperação

| Falha | Resposta proposta | Dado/efeito a preservar |
| --- | --- | --- |
| Tradução/layout | Reverter versão de catálogo de UI e desabilitar superfície defeituosa | Preferências e documentos históricos |
| Preço incorreto ou currency divergente | Suspender novas compras e mudanças afetadas; identificar sessões abertas e avaliar expiração segura | Todas as operações, aceitações, pagamentos e versões |
| Webhook/entitlement divergente | Parar concessões incorretas; manter ingestão durável e reconciliação controlada | Inbox, cursor, auditoria e último snapshot válido |
| Adapter indisponível | Bloquear novas mutações financeiras; mostrar estado verificável e recuperar fila | Operações de efeito incerto sem duplicação |
| Migration incompatível | Voltar leitor compatível quando seguro; preferir forward fix e expansão | Não dropar tabelas financeiras ou apagar audit trail |
| Cobrança indevida confirmada | Abrir caso e compensação/refund autorizado na moeda original | Prova do efeito inicial e vínculo com compensação |

Kill switch financeiro não deve desligar o único caminho de ingestão e reconciliação dos pagamentos já ocorridos. Se o receptor precisar parar por segurança, garantir reentrega/backfill e alertas. Desligar checkout não cancela assinaturas ou evita renovações já programadas no Stripe; a estratégia de incidente deve tratar separadamente aquisições e cobranças existentes.

Rollback de código não desfaz efeito externo; não reativar release antiga que interprete campos novos incorretamente. RPO/RTO e retenção de evidências dependem das políticas existentes e de decisão de operação, sem números presumidos. Após recuperação, comparar Stripe, estado interno e direitos, documentar divergências e só reabrir o fluxo após evidência.
