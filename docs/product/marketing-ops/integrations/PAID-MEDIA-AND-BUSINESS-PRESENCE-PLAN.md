# Mídia paga via API e presença empresarial — plano de implementação

**Data:** 16/11/2026. **Versão documental:** 1.0.
**Escopo e prioridade:** aprovados pelo proprietário neste chat: incluir as cinco funcionalidades e começar por Google Ads e Meta Ads via API.
**Estado:** incorporação documental; implementação pendente. Desenho técnico, contratos específicos, formatos adicionais, entitlements e liberação continuam propostos/pendentes.
**Change Request:** [CR-054](../contracts/changes/CR-054-paid-media-execution-and-business-presence-documentation.md). Precedência em [ATUALIZACOES §11](../ATUALIZACOES.md#11-mídia-paga-via-api-e-presença-empresarial--16112026).

## 1. Direção aprovada e limites

A Oplyra deverá criar e gerenciar campanhas por APIs de Google Ads, Meta Ads e ChatGPT Ads, além de ajudar a configurar/manter o Perfil da Empresa no Google e o perfil empresarial em Businesses in ChatGPT/Business Hub. A primeira frente é **Google Ads e Meta Ads**; ChatGPT Ads vem em seguida. A reivindicação/configuração assistida de perfis é uma trilha distinta, dependente da elegibilidade de cada cliente.

O mercado inicial continua SaaS B2B; os perfis locais não ampliam o mercado-alvo por associação. Performance mantém estratégia, criação e mídia; Growth herda esse núcleo, sem antecipar social, e-mail ou Lifecycle. A alocação comercial de ChatGPT Ads e dos perfis, franquias e eventual add-on ainda precisa de definição; não alterar entitlements ou limites de 08 automaticamente.

A direção amplia a capacidade desejada, não comprova implementação, concede acesso às contas ou autoriza gasto/publicação em nome de clientes. Não altera o mandato do executor de desenvolvimento, a autonomia dos agentes nem autoriza produção. **Nenhuma API de cliente, conta de anúncio ou perfil foi operado para produzir este plano.**

## 2. Relação com o roadmap aprovado

O **I-06 permanece como marco inicial de leitura**, preservando o aceite histórico TST-17. Criar/alterar/ativar recursos de mídia é o **marco posterior de escrita governada**, coerente com DEC-016, e não passa a estar disponível por haver um adapter de leitura. O detalhe abaixo complementa I-02/I-04/I-05/I-06/I-07/I-08/I-09; não renumera incrementos nem cria um roadmap concorrente.

O caminho de escrita depende dos controles aplicáveis de identidade/tenant, credenciais, permissão, entitlement, risco, approval/policy, budget de mídia, consentimento, direitos do ativo, versão/estado, idempotência e auditoria. A preparação local por portas/fakes pode avançar enquanto faltarem acessos reais. A ausência de uma decisão bloqueia só a capacidade dependente.

## 3. Ordem de implementação

As etapas abaixo são rótulos documentais deste plano, **não IDs de action, workflow, schema ou registry**.

| Ordem | Entrega | Recorte e dependências | Critério para passar à próxima capacidade |
| --- | --- | --- | --- |
| 0 | Fronteira comum e contratos | Inventariar registries; preparar interfaces/fixtures e controle de conexão por tenant/conta; preview versionado, autorização de side effect e reconciliação. Reusar I-02/I-04/I-05, sem fingir que estão completos. | Proposta de schemas e mudanças contratuais identificada; fakes provam isolamento, recusa e retry seguro. Antes de implementar estruturalmente o contrato afetado, cumprir sua validação/evolução pós-Freeze. |
| 1 | **Google Ads via API — primeiro** | Recorte técnico proposto: Search com anúncios de texto e destino no site. Conectar conta autorizada; leitura; preparar plano/peça/tracking; criar recursos pausados quando suportado; ativação, pausa/retomada e ajustes governados; coletar resultados. | Fluxo verificável por fake e depois por conta de teste/acesso autorizado; preview corresponde aos recursos externos; não há duplicação nem gasto sem autorização. Tipos como Performance Max não entram por associação. |
| 2 | **Meta Ads via API — segunda** | Campanha → conjunto → criativo → anúncio. Recorte proposto: aquisição pelo site, com imagem aprovada ou vídeo fornecido pelo cliente; objetivos/placements efetivos conforme versão/API e acesso validados. Mesma jornada de review e autorização. | Matriz de capacidades por conta e objetivo; ativos/identidades corretos; recursos inicialmente pausados quando suportado; falha parcial e retomada conciliadas; métricas identificadas por origem. |
| 3 | **ChatGPT Ads via Advertiser API** | Conta de anúncios e chave do cliente, distintas da API de modelos. Campanhas/grupos/anúncios e medição conforme recursos habilitados. | Elegibilidade e habilitações confirmadas; revisão da conta/marca quando exigida; campanha pausada antes de ativação; reporting e conversões sem misturar dados de tenants. |
| 4 | **Perfil da Empresa no Google** | Onboarding com elegibilidade, representação e reivindicação/verificação assistida; manutenção dos campos suportados após acesso às APIs. | Cliente elegível, autorização de representação e acesso aprovados. Negar fluxo para empresa exclusivamente online; não fabricar endereço, local ou propriedade. |
| 5 | **Businesses in ChatGPT / Business Hub** | Perfil empresarial, conteúdo aprovado de marca e configuração assistida. Business Agent é possibilidade separada, não pré-requisito nem capacidade automaticamente liberada. | Confirmar elegibilidade, acesso e consentimento do representante. Gestão automatizada só após confirmar interface oficial e delegação suportada; caso contrário, manter assistência e passos humanos. |

A ordem 1→2 prioriza entrega sem fazer o acesso da Meta depender tecnicamente da conclusão da integração Google: levantamento de acessos e fakes de ambos pode ocorrer em paralelo pelo executor autorizado. Perfis podem ter preparação assistida independente, **sem atrasar Google/Meta nem habilitar escrita automaticamente**. Não há prazo ou esforço contratado inferido deste plano.

## 4. Jornada comum de uma campanha

1. Resolver usuário/serviço, tenant, conta externa autorizada, saúde e capacidades do conector.
2. Preparar campanha vinculada a objetivo, marca, hipótese, copy/ativo, destino, público, tracking, período, budget e moeda explícitos conforme o canal. Campos ainda ausentes no I-04 devem ser implementados/contratados antes de depender deles.
3. Exibir preview com diferenças, recursos previstos, conta/canal, orçamento, moeda e efeitos. Quality review não substitui aprovação de execução.
4. Obter autorização válida para o efeito e payload exatos. **Criar recurso pausado também é side effect externo**: a aprovação deve cobrir essa criação, mesmo sem gasto. Se o fornecedor não suportar criação segura pausada, não usar criação ativa como fallback silencioso.
5. Persistir intenção e chave idempotente; criar recursos e registrar IDs externos/status. Usar idempotência nativa onde existir; complementar com controle/reconciliação da Oplyra. Não presumir garantia de exactly-once externa.
6. Revalidar acesso, versão, autorização, integração, limite de mídia e direitos antes de ativar, retomar ou alterar orçamento. Mudança material exige nova autorização conforme política.
7. Reconciliar respostas assíncronas, recusas/revisões e estado incerto. Timeout após possível criação não autoriza criar de novo. Em falha parcial, registrar os recursos criados e só compensar quando a compensação for suportada e autorizada.
8. Coletar custo/resultados e vínculo com conversões com origem, janela, moeda, cobertura e limitações. Conversão da plataforma não é automaticamente oportunidade qualificada ou receita; atribuição não implica causalidade.

**Orçamentos separados:** verba do anunciante, limites de conta/campanha e custos comerciais do fornecedor não são os budgets internos de IA de US$ 40/85 nem créditos do cliente Oplyra. Tetos, alertas, margem de atraso do reporting e política de alteração devem ser propostos e configurados, sem inventar valor comercial.

## 5. Responsabilidade e arquitetura

- `paid-media-agent`: planejamento, preparação e operação de mídia dentro do catálogo/política; não recebe liberdade para gastar.
- `copywriting-agent` e `design-agent`: peças e ativos dentro das specs existentes; vídeo continua input, sem renderização nativa.
- `strategy-quality-agent`: revisão independente; não self-approve nem concede autoridade de publicação.
- `performance-intelligence-agent`: análise de resultados com limitações; `reporting-checkins-agent`: síntese por contratos existentes.
- `orchestrator-agent`: coordena, não absorve trabalho especialista.
- Integrações: adapters independentes por fornecedor atrás de portas; identidade interna, consentimento, approval e audit são da Oplyra. Não criar microserviço ou novo agente para cada canal.
- **Perfis empresariais:** owner operacional e producer/consumer do serviço devem ser explicitados na proposta contratual. Account pode coordenar tarefas e pessoas conforme sua spec; isso não lhe concede edição externa. Não atribuir silenciosamente perfil orgânico a Paid Media ou Social Growth-only.

Credenciais ficam no servidor/cofre, escopadas por tenant e conta, nunca em frontend/prompts. Token ou chave válida não substitui autorização, entitlement ou representação. ChatGPT Ads, API de modelos e Business Hub são superfícies distintas; não compartilhar credenciais nem inferir acesso entre elas.

## 6. Compatibilidade pós-Freeze e migração

A conferência inicial encontrou as actions existentes de `paid-media-agent`: `prepare_campaign`, `prepare_ad`, `prepare_tracking`, `publication_readiness`, `publish_campaign`, `pause_campaign`, `resume_campaign`, `update_budget` e queries de estado/performance. **Essas actions continuam `pending_domain_schema`**; registrá-las não implementa seus contratos. As de publicação/pausa/retomada/budget mantêm approval/idempotência conforme o registry. Os tools `googleAds` e `metaAds` já existem; isso não habilita escrita no marco de leitura.

Antes de publicar contratos específicos:

1. Mapear cada operação a action/tool/event/error/handoff existente e registrar lacunas reais. Não inventar IDs neste documento nem reutilizar Google/Meta para representar ChatGPT/perfis.
2. Propor input/output, capability por canal, conta/destino, versionamento de payload, riscos, autoria, producers/consumers, autorização e efeitos incertos. Operações de perfil sem owner ficam bloqueadas para execução.
3. Avaliar compatibilidade do envelope e dos enums de canal. Não adicionar campo/enum em schema congelado por inferência. Usar mudança aditiva versionada quando possível; mudança incompatível exige migração explícita.
4. Emitir CR técnico específico quando o delta for concreto, fixtures válidas/inválidas e contract tests; executar validações cruzadas afetadas e evolução de release. **CR-054 aprova esta documentação e prioridade, não aprova automaticamente esse delta futuro.**
5. Preservar snapshots, manifests, Freeze v1 e perfis históricos. Leitura permanece disponível durante rollout de escrita por capability/tenant; revogação/kill switch suspende novos efeitos. Não reintroduzir produção como fallback local.

Este documento não emite release, não fixa nova versão de API do fornecedor nem fecha a composição da 2.23. O inventário de transição **não congelado** recebe apenas os bytes desta documentação; não é manifest ou evidência de publicação.

## 7. Critérios mínimos de aceite e testes a implementar

São critérios documentais, não testes novos já executados. Vinculação aos TST existentes em [15](../15-test-plan.md); nenhum novo TST canônico é criado aqui.

| Caso | Resultado exigido |
| --- | --- |
| Sessão/token de A tenta conta/ativo/campanha de B | Recusa antes do adapter; zero leitura/efeito externo e trilha sem vazamento. |
| Sem permissão, entitlement, approval, direito do ativo ou conexão válida | Recusa determinística; modelo não amplia acesso. |
| Draft/recommend ou configuração read-only tenta escrita | Bloqueio mesmo por chamada direta; TST-17 continua válido no marco de leitura. |
| Preview/aprovação de uma versão/canal/conta reutilizado em outro | Recusa; edição material invalida ou exige novo aceite conforme contrato. |
| Duas execuções concorrentes, replay ou timeout | Um efeito lógico; mapear recursos externos e reconciliar antes de repetir. |
| Falha após campanha e antes do anúncio | Recursos parciais rastreados; sem ativação acidental; retomada/compensação autorizada. |
| Quota, token revogado, revisão pendente/rejeitada, estado remoto mudou | Falha classificada, atualização de saúde e escalonamento; sem sucesso fabricado. |
| Ativar/retomar/aumentar verba após revogação ou kill switch | Recusa no momento do efeito. Pausar também requer autoridade aplicável. |
| Fornecedor usa outra moeda, fuso ou unidade monetária | Conversão apenas na borda com unidade explícita, sem somar moedas ou budgets de IA. |
| Conversão duplicada ou incompleta | Deduplicação e limitações visíveis; consentimento/dados permitidos verificados antes do envio. |
| Google Business Profile para SaaS exclusivamente online | Informar inelegibilidade; não criar perfil/endereço falso. |
| Business Hub sem gestão delegada oficial confirmada | Configuração assistida e identificação dos passos humanos; não usar endpoint privado ou scraping como contrato. |

Ordem dos gates: testes locais/fakes e contratos → leitura/validação em conta de teste e escopo autorizado → criação pausada autorizada → ativação limitada aprovada → rollout por tenant/capability. A falta de sandbox ou acesso ao fornecedor deve ser registrada, sem substituir por gasto real. Critérios de produção e segurança do projeto, inclusive o achado histórico de UPDATE aberto, permanecem aplicáveis.

## 8. Pendências delimitadas

**Antes do código estrutural dependente:** contratos e ownership concretos, esquema de conexão/consentimento, modelo de aprovação aplicável, capability de escrita e vínculo campanha→conta/recurso. Preparar fakes não exige habilitar contas reais.

**Antes da integração real:** Google OAuth/developer token e acessos; Meta app/permissões/revisões; conta e chave ChatGPT Ads e habilitações; acesso Business Profile; delegação/representação de perfis. Nenhuma destas contas foi criada por este documento.

**Antes de ativação/comercialização:** política de aprovação DP-12 e efeitos aplicáveis, orçamento/limites de mídia, tratamento de conversões/dados e retenção, direitos, entitlements/franquias, condições comerciais e autorizações produtivas. As decisões BRL/USD de billing não escolhem a moeda de uma conta de anúncios.

## 9. Fontes oficiais consultadas em 16/11/2026

- [Google Ads — criação de campanhas](https://developers.google.com/google-ads/api/docs/campaigns/create-campaigns) e [OAuth/developer token](https://developers.google.com/google-ads/api/docs/oauth/overview).
- [Meta Marketing API](https://developers.facebook.com/documentation/ads-commerce/marketing-api).
- [OpenAI Advertiser API](https://developers.openai.com/ads/api-overview) e [API Partner Setup](https://developers.openai.com/ads/api-partner-setup): conta de anúncios/credenciais próprias e recursos dependentes de habilitação.
- [Google Business Profile — pré-requisitos de API](https://developers.google.com/my-business/content/prereqs) e [elegibilidade](https://support.google.com/business/answer/7039811).
- [Businesses in ChatGPT](https://openai.com/index/introducing-businesses-chatgpt/): beta, Business Hub e Business Agents com elegibilidade distinta. **Não foi confirmada nesta revisão uma API pública de gestão delegada de perfis**; isso não é afirmação de inexistência.

As fontes comprovam superfícies externas, não acesso ou capacidade da conta Oplyra/cliente. Revalidar versão, escopos, formatos e disponibilidade na implementação do adapter. Não foi executada chamada dessas APIs nesta incorporação.
