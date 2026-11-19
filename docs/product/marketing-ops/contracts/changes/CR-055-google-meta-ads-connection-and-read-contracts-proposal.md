# CR-055 — Google Ads e Meta Ads: conexão e leitura — contrato 1.0 incorporado

**Status:** `approved`
**Contract version:** `1.0`
**Migration SHA-256:** `7f10ffeb250d4b44badb058825414b921279e43db7b481ca1a2bffcc7bc87b85`
**Status do contrato:** incorporado no perfil corrente pela manutenção contratual nesta sessão, expressamente autorizada pelo proprietário em 16/11/2026. Release global 2.23 permanece não emitida; nenhuma revisão humana de bytes é alegada. **Escopo de implementação:** conexão e leitura Google/Meta aprovado pelo pedido anexado do proprietário em 16/11/2026, inclusive adapters/testes e migrations específicas em develop após o processo contratual, ver §16. Não equivale a aprovação humana dos bytes, alteração de Freeze ou publicação em produção. As primeiras fatias locais abaixo são histórico, não o limite vigente da autorização.
**Classificação:** `additive_contract_proposal` (marco de **leitura**; escrita fica para CR posterior, ver §6).
**Data:** 2026-11-16. **Origem:** pedido do proprietário neste chat ("abre o CR técnico para Google e Meta"), sobre a prioridade já aprovada em [CR-054](CR-054-paid-media-execution-and-business-presence-documentation.md) e o [plano](../../integrations/PAID-MEDIA-AND-BUSINESS-PRESENCE-PLAN.md) (etapas 0–2).
**Proposto por:** Claude (sessão de frontend, mandato local). Não é revisão humana nem aprovação. CR-054 **não** aprova este delta (plano §6, item 4).

## 1. Situação inicial que motivou o CR (histórico)

O plano (§6) exige um CR técnico específico quando o delta for concreto. Hoje: `googleAds` e `metaAds` existem em `registries/tools.json` (`external_integration`, risco `high`, `read_write`, condição `integration_enabled_and_task_authorized`); as actions de `paid-media-agent` (`prepare_campaign`, `prepare_ad`, `prepare_tracking`, `publication_readiness`, `publish_campaign`, `pause_campaign`, `resume_campaign`, `update_budget`, `media_campaign_status`, `media_performance`, `tracking_status`, `budget_status`, `create_media_plan`, …) seguem `pending_domain_schema`. **Não há** contrato de conexão por tenant/conta, nem schema de campanha/métrica de plataforma. A UI `/demo/midia` (dados sintéticos) já fixa a jornada que o contrato precisa sustentar.

## 2. Fora de escopo (explícito)

ChatGPT Ads (CR próprio: autenticação e acesso distintos); Perfil da Empresa/Business Hub; **qualquer escrita de anúncios** (criar, publicar, pausar, retomar, orçamento); produção. Telas reais pertencem à sessão frontend. A autorização posterior permite preparação/validação de leitura real com contas controladas e credenciais pelo mecanismo seguro, e evolução contratual governada; não permite reescrever snapshots/enums/schemas congelados ou emitir aprovação fictícia da release.

## 3. Requisitos iniciais do marco de leitura — resolução normativa na v1.0 (§17)

| Necessidade | Situação nos registries | Delta proposto |
| --- | --- | --- |
| Iniciar/concluir conexão (OAuth Google; autorização Meta) | Sem action/tool/event | **Lacuna.** Propor serviço de conexão da Oplyra (não ação de agente): `connection.start`, `connection.complete` com `state` anti-CSRF de uso único, expirável e vinculado a tenant, usuário, plataforma e tentativa; consumo atômico no servidor antes da troca de código. Callback inválido não consome a tentativa alheia; repetido/concorrente não repete a troca. State de produção exige geração imprevisível e armazenamento somente do digest, com transporte transitório; nunca logar state/código. IDs finais definidos na revisão, não aqui. |
| Conta externa vinculada ao tenant | Sem entidade | **Lacuna.** Entidade `ad_account_link` (tenant, plataforma, id externo, moeda, fuso, estado de saúde, escopos concedidos, data de coleta). Unicidade por (plataforma, id externo) **global** para impedir a mesma conta em dois tenants sem ato explícito. Transferência exige fluxo próprio autorizado, auditado e atômico, com revogação do vínculo/acesso anterior; não se implementa transferência automática nesta fatia. Política de compartilhamento/transferência permanece proposta. |
| Segredos (refresh token, developer token) | CLAUDE.md: só servidor | Cofre/mecanismo aprovado (pendência: **qual**; ADR). Nunca em URL, log, fixture ou resposta ao navegador. |
| Saúde e permissões | `integrationHealth` (tool) ativa | Reusar; estados mapeados para os da UI: `connected`, `setup_required`, `authorization_expired`, `no_access`, `unavailable`. |
| Leitura de campanhas/anúncios/métricas | `media_campaign_status`, `media_performance`, tools `googleAds`/`metaAds` | Reusar; **schemas pendentes**: campanha de plataforma (origem, status, orçamento com moeda e unidade), métrica (valor **nulo** ≠ 0, moeda, fuso, janela e modelo de atribuição, `dataUntil`, confiança). |
| Vínculo com a campanha da Oplyra | Sem relação | **Lacuna.** `platform_campaign_link` opcional (campanha Oplyra ↔ recurso externo), explícito, auditado. |
| Sincronização, paginação, retry, dead-letter | Padrões de CLAUDE.md | Job idempotente por (conta, janela, cursor); erros classificados (quota, revogação, transitório, parcial); sem sucesso fabricado. Identidade estável por página e recurso; replay da página não duplica dados. Cursor avança somente após gravação durável bem-sucedida de toda a página; dados e checkpoint na mesma transação local. Queda/erro mantém o cursor anterior; parcial não vira sincronização completa. |
| Moeda | DEC/billing não escolhem moeda de conta | Valores **monetários** em unidade menor inteira + código ISO; **sem conversão ou soma entre moedas**. Contagens, percentuais, taxas e razões têm unidade e escala próprias explícitas, sem assumir unidade monetária; null permanece ausente. Escalas e normalizações são registradas pelo adapter versionado, sem inferência silenciosa. |

## 4. Desenho incorporado na v1.0

- Domínio/aplicação com **portas** (`AdPlatformConnectionPort`, `AdPlatformReadPort`); adapters `google-ads` e `meta-ads` em infra; fake determinístico para testes. Nada de SDK de anúncios em componente ou domínio. **Sem proxy genérico** para o navegador: a UI chama só casos de uso tipados.
- Persistência em schema próprio, **sem GRANT de tabela**; acesso por funções `security definer` com tenant ativo da transação (padrão 000018), RLS habilitada e forçada, FK compostas de tenant.
- RBAC incorporado: `media.read` para os quatro papéis existentes; `media.connection.manage` somente owner/admin. SQL revalida membership, papel, tenant ativo e planos existentes Performance/Growth. Nenhum papel ou limite comercial novo.
- Auditoria de conectar/reconectar/desconectar/sincronizar (sem tokens nem conteúdo sensível).
- Versão de API externa registrada por adapter (revalidar na implementação: Google Ads API e Meta Marketing API mudam versões com frequência); **não fixada aqui**.

## 5. Critérios de teste

1. Sessão/conta do tenant A tenta conta, token, campanha ou callback do tenant B: recusa antes do adapter, zero chamada externa, trilha sem vazamento.
2. Callback com `state` ausente, repetido, expirado ou de outro usuário/tenant/plataforma/tentativa: recusado; duas chamadas concorrentes consomem uma única vez e no máximo uma troca de código ocorre. Tentativa inválida não consome a legítima. Falha após consumo não reabre state; recuperação exige nova tentativa. Consumo atômico ainda precisa de prova no adapter persistente.
3. Conexão cancelada, inválida, expirada e revogada: estado correto; nada exibido como conectado sem confirmação do servidor.
4. Permissão insuficiente, conta indisponível, quota e falha transitória: classificação e retry limitado; sincronização parcial marcada, não completa.
5. Moedas distintas não somam; métrica ausente permanece nula; `dataUntil` e atribuição presentes. Testar unidades/escalas de dinheiro, contagem, percentual e razão separadamente. Replay de página não duplica, e falha na gravação não avança cursor. Transferência de conta não deixa dois vínculos ativos e exige autorização/auditoria específicas (quando esse fluxo for aprovado).
6. Nenhum segredo em respostas, bundles do navegador, localStorage, logs e fixtures (`pnpm scan:secrets`).
7. Mutação: remover a checagem de tenant das funções/FK e o `state`; provar falha de teste.
8. Evidência real (conta de teste/sandbox) **separada** de fixtures; sem acesso real a evidência real fica "pendente de validação externa".

## 6. Escrita governada (CR futuro)

`prepare_*`, `publish_campaign`, `pause/resume_campaign`, `update_budget` mantêm approval/idempotência do registry. Exigem CR próprio: criação **pausada** como side effect externo aprovado, aprovação presa à versão/payload exato, reconciliação de efeito incerto, kill switch/revogação. Este CR não os habilita.

## 7. Compatibilidade e governança vigentes

Incorporação **aditiva** autorizada pelo proprietário nesta sessão de manutenção. Registry de serviço, schema 1.0, fixtures, manifest próprio, exports e migration foram acrescentados pelo CR-055; perfil/inventário correntes 2.23 incluem validação explícita. Não reescreve Freeze, snapshots, manifests publicados ou registries agentic. A release global 2.23 continua não emitida. As implementações locais anteriores descritas nas seções9–16 são histórico experimental; somente o API contract1.0 é público em `@oplyra/core/media`.

A política de conexões é owner/admin; leitura para os papéis existentes. Conta externa não é transferida nem compartilhada automaticamente entre tenants. Não habilita publicação, orçamento, execução do agente de mídia ou novo limite comercial. Migração é versionada e testada localmente antes de develop; produção `hysigyhfpyyydycxxpsm` não é destino autorizado.

## 8. Perguntas que dependem do proprietário

**Atualização de 16/11, pedido anexado:** escopo de conexão/leitura autorizado; owner/admin administram; leitura segue contrato de mídia, sem novo papel/limite por conexão. Os itens 1/4 abaixo preservam perguntas históricas, não novo pedido de aprovação por ajuste. Cofre recebe proposta técnica concreta em §16; acesso externo e incorporação pelo mecanismo de manutenção continuam pendentes.

1. **Aprovar o contrato completo** após revisão. Backend/Codex responsável pela primeira fatia local explicitamente autorizada em 16/11/2026; isso não aprova permissões, transferência ou persistência.
2. **Cofre de segredos**: qual mecanismo aprovado (ADR) para refresh tokens e developer token.
3. **Acesso externo**: aplicativo Google (OAuth + developer token, nível de acesso) e aplicativo Meta (permissões e revisão), fornecidos pelo mecanismo seguro; contas de teste.
4. **Permissões/entitlements**: quem pode conectar e quem só lê; se a conexão é limite por plano.

## 9. Primeira fatia local autorizada — 16/11/2026

Revisão técnica e início local pelo backend/Codex a pedido explícito do proprietário. Os quatro ajustes estão nos requisitos/critérios acima; o status do CR completo permanece `proposed`.

Implementado em `packages/core/src/application/ad-platform-connection.ts`: preparação de tentativa e consumo de callback com portas de identidade vigente, autorização, entitlement, geração/digest de state, armazenamento e troca de código. Sem autorização **e** entitlement configurados e explicitamente permissivos, recusa. Ambas as etapas revalidam identidade/acesso. Armazena somente digest e os vínculos; callback divergente não consome a tentativa legítima. Expiração estrita, uso único e consumo anterior à troca; falha posterior exige nova tentativa. Sucesso é somente `aguardando_selecao`, nunca `connected`.

Fakes em `packages/testing/src/ad-platform-connection.ts`, 24 testes em `packages/testing/test/ad-platform-connection.test.ts`: dois tenants, usuários/plataformas/tentativas divergentes, dez callbacks concorrentes, replay, expiração, perda de acesso, falha do adapter e minimização de dados nas portas. Mutações de tenant e uso único detectadas e restauradas. Evidências/checkpoint em BACKEND.md.

**Limites:** gerador de state do fake é determinístico, impróprio para produção. Digest usa SHA-256, sem substituir geração imprevisível real. Atomicidade só no fake dentro de um processo; falta adapter persistente e prova entre conexões. Não há rota OAuth, URL de autorização real, SDK, seleção/vínculo/transferência de contas, tokens, cofre, auditoria persistente ou sincronização. Read port e unidades/escalas de métricas ficam para fatia seguinte. Nenhuma permissão ou limite por plano foi presumido: são portas com recusa por padrão. Sem package export governado novo, registry, schema, migration ou integração real. Classificação do CR no inventário continua pendente do processo de manutenção.

## 10. Contrato normalizado local de leitura de métricas — 16/11/2026

Fatia autorizada pelo proprietário: `packages/core/src/application/ad-platform-metrics.ts`, fake em `packages/testing/src/ad-platform-metrics.ts` e testes em `packages/testing/test/ad-platform-metrics.test.ts`. Status do contrato completo permanece `proposed`, sem schema/registry ou export de pacote aprovado.

- `AdPlatformReadPort` recebe conta externa, moeda e fuso obtidos pelo servidor a partir do vínculo escopado ao tenant/plataforma; nenhum ID externo é escolhido diretamente pelo pedido. Identidade vigente, autorização e entitlement são obrigatórios e revalidados a cada leitura. Sem portas ou sem resposta estritamente permissiva, recusa antes do repositório/adapter. Conta alheia e inexistente têm a mesma recusa; resposta divergente do repositório também é recusada antes do adapter.
- Proposta técnica de escala: **valor expresso = valor bruto / escala**. Percentual expresso em pontos percentuais (1250 / 100 = 12,5%), razão sem unidade monetária, taxa com base explícita. Escala é inteiro positivo seguro. Contagem tem escala 1; dinheiro em unidade menor e contagem exigem valor inteiro seguro. Percentuais/taxas/razões aceitam números finitos, sem impor limiar ou faixa de produto. Não se converte/arredonda o valor recebido.
- `null` é ausência em todas as unidades e permanece distinto de zero. Confiança usa os níveis já existentes de metric-confidence; não é recalculada pela leitura. Moeda só pertence à unidade monetária; moeda de cada métrica deve coincidir com a conta. Leituras de contas BRL/USD permanecem separadas. Não há agregação/soma/conversão nesta fatia.
- Janela [início, fim), fuso, dataUntil, modelo de atribuição e indicador booleano de completude são explícitos. Resposta deve corresponder a tenant/plataforma/conta/moeda/fuso/janela consultados. Métrica malformada ou chave duplicada recusa a página inteira; ausência não é fabricada como zero. Parcial continua parcial. Resposta é reconstruída por campos conhecidos, sem repassar campos extras do adapter.
- Prova: 41 testes novos; mutações de null→0 e remoção da conferência de moeda detectadas/restauradas. Validação ampliada sem banco: 1090 testes e typecheck passaram, conforme BACKEND.md.

**Limites:** escala, nomes de campos e categorias desta fatia são desenho técnico local reversível, não formato de Google/Meta ou novo schema aprovado. Código de moeda valida somente três letras ASCII maiúsculas, não catálogo ISO/expoente por moeda. Fuso é obrigatório mas ainda sem validação de catálogo IANA; não se faz cálculo de horário de verão. dataUntil exige Date válida, sem criar regra de frescor/maturação. Unicidade de chave vale nesta página normalizada sem dimensões: breakdowns futuros exigem contrato próprio. Sem seleção/vínculo real de contas, SDK, cofre, tokens, chamadas externas, persistência, cursor/paginação durável, retry ou sincronização. Papéis de leitura/conexão e limites por plano continuam decisões pendentes, representadas por portas que recusam por padrão.

## 11. Paginação e sincronização locais — 16/11/2026

Fatia autorizada: `ad-platform-sync.ts` no core/testing e seus testes. Reutiliza autorização/validação da leitura anterior, sem alterar sua assinatura pública ou decisões de acesso. Portas locais `AdPlatformPagedReadPort` e `GravacaoDePaginas`, sem export de pacote governado, schema ou migration.

Uma chamada processa no máximo uma página. O checkpoint é escopado por tenant, plataforma, conta externa, moeda/fuso, janela e sincronizacaoId. Cursor e paginaId são opacos; ID de página deve ser estável para replay. Cada recurso contém seu snapshot de métricas normalizado, validado com o contrato da seção 10. Recursos/chaves são ordenados antes de confirmar; recurso repetido entre páginas substitui o snapshot pela mesma identidade, sem somar métricas. Duplicação dentro da página é recusada.

`confirmar` exige uma única transação no futuro adapter: reconferir escopo/revisão/cursor, deduplicar ID+conteúdo da página, gravar os snapshots dos recursos e o novo checkpoint, tudo ou nada. Não existe operação separada para avançar cursor. Replay idêntico é no-op; mesmo ID com conteúdo/cursor divergente é conflito. Versão obsoleta ou ciclo de cursor não avança dados/checkpoint. Não se faz retry automático irrestrito.

O checkpoint separa paginação encerrada de dados parciais: `encerrado` só indica cursor final null; `parcial` acumula qualquer página ou recurso incompleto. Esgotar páginas não torna fonte parcial em completa. Página vazia terminal é válida, sem fabricar recursos. Nova chamada após encerramento não consulta o provedor. Uma nova sincronização exige outra identidade de execução; não há rewind automático do checkpoint existente.

Prova local: 27 testes novos e 1117 testes na seleção ampliada passaram, junto com typecheck. Falhas simuladas antes/depois dos dados e ao preparar cursor deixam tudo intacto. Perda de resposta após publicação conjunta retoma do cursor persistido. Dez chamadas concorrentes gravam uma vez; replay não duplica. Mutações de publicação prematura e ausência de comparação de revisão detectadas/restauradas; o primeiro ensaio de mutação da revisão revelou lacuna de teste, fechada com versão obsoleta e cursor correto.

**Limites:** fake serializa a operação dentro de um processo e usa staging/cópia de estado; não prova transação, durabilidade, concorrência entre conexões ou RLS. O adapter real ainda precisa desses testes e de enforcement de tenant/autorização no banco, sem confiar no chamador. Cursores/checkpoints são internos ao caso de uso, não contrato de navegador; a proteção/validade dos cursores reais depende do adapter. Sem API/SDK, credenciais, persistência, agendamento, backoff/dead-letter, limites de quota, watermark real ou política de remoção de recursos ausentes. Snapshots sem breakdown substituem o recurso inteiro; não se mesclam fragmentos ou agregam séries. CR completo permanece proposed.

## 12. Revalidação após leitura em andamento — 16/11/2026

Sincronização local revalida o contexto original antes de chamar `GravacaoDePaginas.confirmar`: identidade/membership, autorização, entitlement e conta são consultados novamente após a resposta do provedor. A porta de contas deve resolver apenas vínculos ativos; vínculo revogado/desativado deve aparecer como inexistente, sem exigir apagar uma linha real. Consulta atual deve coincidir com tenant/plataforma/conta externa/moeda/fuso/janela usados para buscar a página. Remoção/divergência recusa sem gravar, migrar dados ou avançar cursor. A identidade e o ID do pedido original são capturados antes das esperas; o conteúdo do provedor não serve como autoridade.

12 testes novos suspendem a resposta do provedor, alteram o estado local e liberam a resposta: remoção ou mudança de tenant/plataforma/id/conta externa/moeda/fuso; revogação de membership/autorização/entitlement; falha na releitura; controle positivo inalterado. Dados/checkpoint já gravados na primeira página permanecem intactos nos casos de recusa. Antes da correção os 12 casos falharam (incluindo o controle que exige a segunda consulta); depois a seleção ampliada passou 1129 testes e typecheck.

**Limite obrigatório:** rechecagem na aplicação e confirmação são operações separadas. O futuro adapter persistente precisa revalidar identidade/acesso e vínculo **na própria transação** da gravação, com mecanismo de versão/fencing para detectar alteração intermediária, inclusive troca e restauração do vínculo entre consultas (ABA). A comparação local de conteúdo não prova essa proteção. Nenhuma política de transferência foi aprovada; esta fatia não cria versão de vínculo, tabela, permissão ou integração real. Leitura simples não paginada não foi alterada nesta entrega. CR completo permanece proposed.

## 13. Geração do vínculo e proteção contra ABA — 16/11/2026

Evolução local autorizada: `ContaDeLeitura` exige `versaoVinculo` inteira segura positiva, emitida pela autoridade de vínculos. `ConsultaDeMetricas` carrega o ID interno da conta e essa geração; resposta precisa corresponder aos dois. Sem versão válida, recusa antes do adapter. Não há fallback para versão 1. São metadados internos do contrato proposto, não campos enviados a uma API real ou alterações de registry/schema.

A revalidação após leitura compara também ID interno/geração. Checkpoints/dados são escopados pela geração: uma chamada explicitamente autorizada sob nova geração não reutiliza cursor ou snapshot da anterior. Históricos anteriores permanecem separados; não se migram/transferem dados automaticamente.

`GravacaoDePaginas.confirmar` exige vínculo ativo, geração e metadados vigentes **dentro da mesma operação atômica**, antes até de reconhecer replay idêntico. O fake recebe a mesma autoridade em memória usada pela leitura e consulta seu estado sincronamente, sem await até publicar a gravação. Ausência dessa autoridade recusa por padrão. Vínculo ausente/divergente retorna `vinculo_alterado` (resultado local da porta), mapeado à recusa CONTA_INEXISTENTE já existente; nunca grava nem avança cursor.

O fake de contas ganhou operações de definir/revogar: geração aumenta ao alterar ou restaurar, e um tombstone retém a geração após revogação. Reaplicar um objeto com versão antiga não faz a geração regredir. A coleção pública continua apenas mecanismo de seed/adulteração dos testes; ciclo de vida versionado deve usar essas operações. Exaustão/corrupção do contador falha sem reiniciar sua numeração.

Prova local: 14 novos casos (sete de sync, sete de validação de métricas). Troca/restauração e revogação/restauração durante leitura são recusadas; também mudanças/ABA na janela após revalidação local e antes da gravação. Replay antigo não ignora a geração, gravador sem autoridade recusa, e nova geração usa escopo próprio preservando histórico. Versões inválidas e resposta de outra geração são recusadas. Antes da conferência final, seis casos falharam; depois 1143 testes da seleção ampliada e typecheck passaram. Remover só a conferência de geração do gravador foi detectado; fake restaurado.

**Compatibilidade/limites:** campo obrigatório novo no modelo local ainda proposto; snapshots/fakes sem versão deixam de ser aceitos. Fixtures locais existentes foram explicitamente atualizadas com geração inicial 1; não houve migração/limpeza de dados persistidos. Garantia demonstrada só na vida desta instância em memória. Produção exige contador/tombstone duráveis não reutilizáveis, mutações restritas de vínculo e checagem sob a mesma transação/lock da escrita, além de autorização/identidade/entitlement na própria transação. Esta fatia implementa a conferência atômica simulada do vínculo, não a transação SQL ou o enforcement atômico de todos os controles de acesso. Nenhuma política comercial de transferência foi aprovada. CR completo permanece proposed.

## 14. Acesso vigente na gravação simulada — 16/11/2026

`GravacaoDePaginas.confirmar` recebe `ator.usuarioId` como identidade original esperada, não como prova de autenticação. O fake recebe uma autoridade de acesso compartilhada com a leitura (`AcessoDeMidiaEmMemoria`), que mantém sessão autenticada sintética, membership por tenant/usuário, autorização por tenant/usuário/plataforma e entitlement por tenant/plataforma. Estado inicial não tem sessão ou concessão; fixtures configuram cada condição explicitamente, sem presumir papel, permissão canônica ou limite de plano.

Dentro da operação síncrona de gravação, antes de conferir vínculo, replay ou escrever, a autoridade compara o ator com sua sessão vigente e verifica membership/autorização/entitlement atuais. Ausência da autoridade ou retorno diferente de `true` estrito recusa. Promise não vale como concessão síncrona. Sem await entre essas verificações e a publicação conjunta dos dados/checkpoint. Resultado local `acesso_revogado` vira NAO_AUTORIZADO existente. Replay idêntico também exige acesso atual; não revela checkpoint nem estado do vínculo ao recusado. A prioridade da recusa sem autoridade passa a ser acesso_revogado, antes da conferência de vínculo.

20 casos novos: cinco revogações após revalidação local (sessão encerrada, troca de usuário inclusive por outro membro autorizado, membership, autorização, entitlement), quatro replays após revogação, autoridade ausente/sem concessões, ator declarado diferente da sessão, escopo alheio, controle positivo, erro privado da autoridade, ator null/em branco e quatro retornos inválidos (undefined, número, texto, Promise). Primeira reprodução: 15 falharam/47 passaram (62); revisão adicional reproduziu três aceitações por retorno truthy. Depois, 1163 testes na seleção ampliada e typecheck passaram. Mutações removendo separadamente identidade, autorização e entitlement foram detectadas e restauradas.

**Limites/compatibilidade:** ator é campo obrigatório novo da porta local ainda proposta; não houve criação de permissão/registry/schema ou export de pacote. Fonte real deve derivar identidade da sessão/credencial/transação, nunca confiar no texto do ator nem em flags trazidas pelo pedido. O fake só demonstra atomicidade dentro de um processo, sem autenticação real, RLS, locks entre conexões ou durabilidade. O adapter SQL precisa usar sua autoridade real na mesma transação de geração/revisão/recursos/cursor. A leitura direta do checkpoint ainda depende da verificação da aplicação; esta entrega cobre a confirmação/gravação. Sem UI, API real, credenciais, banco ou produção; CR completo permanece proposed.

## 15. Leitura autorizada do checkpoint e revogação durante espera — 16/11/2026

A porta `GravacaoDePaginas.ler` agora recebe ator esperado e escopo, devolvendo `LeituraDeCheckpoint`: `lido` com cópia do estado, ou recusa sem checkpoint (`acesso_revogado`/`vinculo_alterado`). Não permanece uma leitura irrestrita na interface da aplicação. No fake, leitura e gravação reutilizam a mesma checagem síncrona de sessão/membership/autorização/entitlement e geração vigente do vínculo. Recusa acontece antes de procurar o checkpoint, inclusive quando o estado seria vazio ou encerrado. `inspecionar` é só ferramenta privilegiada de asserção do fake, fora da porta; não é endpoint ou fallback.

Uma resposta autorizada pode aguardar entrega e ter o acesso revogado nesse intervalo. O caso de uso revalida o contexto original e o vínculo após receber a leitura e antes de devolver checkpoint encerrado ou consultar o provedor para uma página pendente. Nenhuma recusa encaminha cursor, revisão ou completude. Falha técnica vira resultado fixo, sem detalhes privados. Checagem da gravação e controle de versão permanecem independentes.

25 casos novos: revogações antes da leitura e após sua captura (sessão, troca de usuário, membership, autorização, entitlement), checkpoint pendente sem nova consulta ao provedor, vínculo removido/ABA após captura, porta com ator/escopo divergentes, autoridades ausentes e retornos não booleanos, exceção privada e controles positivos/cópia defensiva. Antes: 24 falharam/67 passaram (91); depois sync 91/91, métricas 48/48 e conexão 24/24. Remover a proteção da porta ou a revalidação após espera foi detectado. Seleção ampliada: 1188 testes e typecheck passaram.

**Compatibilidade/limites:** mudança da assinatura/resultado da porta local proposta; mocks e asserções existentes foram atualizados explicitamente. Inspeção do estado após revogação é feita apenas no helper do fake para provar preservação, não pela porta da aplicação. Prova em memória, não banco/autenticação/transportes reais. Autorização é avaliada nos pontos de leitura/revalidação, sem prometer revogação retroativa de dados já entregues. Futuro adapter precisa derivar identidade real e aplicar isolamento/acesso na transação. Não altera política de produto, registry/schema/permite acesso real; CR completo continua proposed.

## 16. Primeira continuação de conexão/leitura — histórico, supersedido por §17

Pedido anexado do proprietário autoriza continuar o backend, fechar interfaces com frontend e aplicar migrations específicas não destrutivas no Supabase develop `eqpvjydnqbbawpkeizys` **depois** do processo contratual. Produção não autorizada. Sem nova permissão ou binding do runtime presumidos.

[Pacote técnico e repasse](../../integrations/CR-055-IMPLEMENTATION-HANDOFF.md) e [DTOs candidatos v1](../../integrations/CR-055-FRONTEND-CONTRACT.ts) especificam operações, estados distintos de configuração/desconexão/seleção/expiração/acesso/falha, semântica HTTP, paginação, datas, precisão monetária, ownership, armazenamento cifrado, migração e recuperação. São material de incorporação/revisão, não schema publicado ou alinhamento confirmado pelo Claude. `media.connection.manage`/`media.read` permanecem propostas.

Implementação independente: clients HTTP internos Google v26/Meta v25.0 para contas/campanhas/métricas; transporte limitado com deadline, sem redirect/retry/log ou erro privado; URL de consentimento fixa por origem; CSPRNG/digest real de state; AES-256-GCM vinculado ao tenant/usuário/plataforma/tentativa; adapter Google para troca/refresh com POST e gravação cifrada por porta de persistência condicional. Sem implementação dessa persistência, sem conexão montada em rota, seleção, desconexão ou job real. Cifra não substitui cofre/RLS. Meta OAuth completo permanece pendente de mecanismo oficial compatível, conforme pacote.

Leitura simples revalida identidade/acesso/entitlement/conta/geração após aguardar o provedor; não entrega resposta se o vínculo/acesso mudou. Entrada original é capturada antes da espera. Nove regressões cobrem revogações, metadados, ABA e mutação do pedido. Garantia apenas nos pontos de autorização executados, sem revogação retroativa.

Precisão: micros Google podem não ser representáveis por inteiro em unidade menor. Clients preservam valores brutos exatos e distinguem ausência de zero; o DTO candidato propõe decimal exato da menor unidade como string. Não há conversão/rounding silencioso nem binding desse DTO ao domínio aprovado. Revisão/incorporação deve resolver a compatibilidade com a proposta anterior da UI antes de consumo.

Evidências, limitações e bloqueios estão em BACKEND.md. Nenhum artefato frozen, registry/schema publicado, migration, control plane, package export ou frontend alterado nesta continuação; release 2.23 não emitida.

## 17. Incorporação governada v1.0 — manutenção autorizada em 16/11/2026

O proprietário autorizou explicitamente a manutenção contratual nesta sessão e a continuidade do backend no develop. Registry aditivo `registries/ad-platform-services.json` registra o serviço humano media, onze operações, schemas 1.0, owner/backend, RBAC e referências às tools existentes. Não modifica registries agentic publicados nem habilita paid-media-agent. Permissões app `media.read` (quatro papéis existentes) e `media.connection.manage` (owner/admin) formalmente incorporadas; sem papel/capability comercial nova ou limite por conexão. Entitlement usa os planos existentes Performance/Growth com tenant ativo, validado no SQL.

Schema em `schemas/media/ad-platform-service.schema.json`, fixtures em `fixtures/media`, tipos `@oplyra/core/media`, adapters `@oplyra/infra/media`. Dinheiro decimal exato da unidade menor; micros e contagens não passam por float. Contrato 1.0 é aditivo em relação às identidades publicadas; substitui as propostas locais ainda não publicadas, sem declarar compatibilidade com os DTOs de fakes antigos. Eventos e publicações de anúncios continuam fora.

Migration: `supabase/migrations/20261116210007_media_connection_read.sql`. Operações privadas, RLS forçada, sem GRANT de tabelas, autenticação derivada da transação, locks de membership/conexão/job, fencing, gerações, replay e histórico. Estratégia de migração: aplicar após baseline 000001–000018 e validar local antes de develop eqpvjydnqbbawpkeizys; sem reset/remover dados. Recuperação: desabilitar composição de mídia e preservar schema/histórico; correções por migration posterior em develop, nunca reescrever bytes remotos.

Manifesto próprio `media-contract-manifest-v1.0.json` fixa os bytes desta incorporação. Perfil corrente 2.23 passa a validar o domínio e a migration explicitamente; inventário corrente atualizado, históricos 2.22/Freeze preservados. Sem emitir receita, snapshot ou evidência fictícia de release global. Callback e endpoints são implementações montáveis, não prova de hospedagem/configuração. OAuth Meta e credenciais reais continuam dependências externas explicitadas no repasse.

**Precisões da implementação v1.0:** envelopes HTTP têm schemas explícitos por operação; solicitação de sync responde202. `confianca` reutiliza os cinco níveis existentes; watermark/atribuição desconhecidos são null e não produzem confiança confirmada. Descoberta Google inclui clientes transitivos de MCC e preserva login-customer-id privado por conta. Cache marca contas não acessíveis e seleção revalida descoberta; revisão de descoberta/geração/dataset cercam cursores. Fila técnica de coleta usa o padrão existente UoW/role/lease/fencing em schema media, sem submeter ação agentic pendente ou criar runtime paralelo. Auditoria de job usa o próprio UUID como correlation_id. Desconexão destrói ciphertext local e preserva históricos; revogação remota Google não é automática, pois pode atingir a concessão compartilhada do aplicativo e exige tratamento próprio.

### Patch físico após advisor de develop

A migration principal foi aplicada em develop como `20261116214247_media_connection_read_cr055_v1`, mantendo SHA-256 `7f10ffeb250d4b44badb058825414b921279e43db7b481ca1a2bffcc7bc87b85`. Não foi reescrita. Complemento `supabase/migrations/20261116214433_media_fk_indexes.sql`, SHA-256 `6ae6fa4ae3041ff1805bd01e7ea1b1e7a3b81966860b4b0ff0ad8ee9d33c8df5`, acrescenta somente os três índices de apoio às FKs de account_claims, campaign_links e sync_jobs. Sem mudança de schema público/contrato1.0, dados ou privilégios. Validação local precede a aplicação; o perfil corrente autoriza ambos os arquivos explicitamente e recusa migrations alheias.

### Resultado da manutenção autorizada — 2026-11-16T18:57:06-03:00

Ambas as migrations foram aplicadas em develop eqpvjydnqbbawpkeizys; complemento de índices registrado remotamente como 20261116214625_media_fk_indexes_cr055_v1. Dez tabelas com RLS forçada, quatro funções com hashes locais conferidos e teste negativo remoto de autorização revertido. Nenhum dado de integração real inserido. Evidência: deploy/develop/media-cr055-evidence.json; repasse: integrations/CR-055-IMPLEMENTATION-HANDOFF.md. Gates:2614 Vitest,561pgTAP,41contratos após índices, typecheck e build isolado aprovados. BFF/worker não implantados; OAuth Meta completo e validação com provedores reais pendentes. Produção preservada.
