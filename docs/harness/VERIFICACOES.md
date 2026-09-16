# Gates e verificações — Oplyra

## Situação e registro de evidências

Este documento especifica o que verificar. A aplicação não existe e nenhum script, CI ou teste de runtime é apresentado como implementado. Comandos reais serão definidos com a stack aprovada e validados localmente.

Para cada verificação executada, registrar: identificador do gate, cenário, comando ou procedimento real, ambiente, versão/commit ou arquivos verificados, data, resultado e evidência sem dados sensíveis.

Resultados permitidos: `passou`, `falhou`, `não executado`, `não aplicável` com justificativa. Uma revisão documental não comprova isolamento, idempotência ou segurança em execução. Não declarar um gate aprovado se um cenário obrigatório está sem execução.

## Gates por etapa

| Gate | Critério de saída |
| --- | --- |
| G0 — Preparação documental | Referências preservadas, links válidos, Supabase local e limite de discovery claros, disponibilidade real das skills e incompatibilidades registradas, estado real documentado. |
| G1 — Discovery | MVP delimitado; domínio, arquitetura, UX, integrações, RLS, agentes, custos, riscos e plano de testes propostos; evidências de validação separadas de hipóteses; revisão com skills disponíveis e pendências identificadas. Distinguir existência de arquivo, aplicação de skill e verificação executada. |
| G2 — Autorização estrutural | Aprovação explícita da proposta identificando versão, escopo e pendências aceitas. G1 não concede G2 automaticamente. |
| G3 — Fundação local | Ambiente reproduzível com Supabase local e cenários de identidade, tenancy, RLS, Storage, entitlements e auditoria aprovados. |
| G4 — Runtime e integrações | Contratos, isolamento, autorização de ferramentas, aprovações, limites e recuperação testados em ambiente local. |
| G5 — Incremento Performance | Fluxo do usuário e critérios de aceite do incremento aprovados; Meta/Google em leitura; qualidade dos dados explícita e regressões relevantes verificadas. |
| G6 — Publicação do incremento | Versão e destino aprovados para deploy, migrations/configurações revisadas, dependências compatíveis e recuperação definida; após deploy, verificações não destrutivas e versão publicada registradas. |

G3–G5 são incrementais: verificar capacidades conforme forem implementadas. Nenhum gate autoriza antecipar o Growth ou dispensa aprovação de ações externas.

## Cenários obrigatórios para a implementação futura

| Área | Cenário e resultado esperado |
| --- | --- |
| Domínio | Invariante violada é rejeitada; caminho válido preserva regras sem depender do SDK do fornecedor. |
| Dependências | Domínio e aplicação não importam SDKs/frameworks de infraestrutura; adapters implementam portas internas. |
| Auth e tenancy | Sessão inválida, tenant forjado e membership removida não permitem acesso; usuário de dois tenants acessa apenas o contexto autorizado. |
| RLS | Usuário de A não lê, cria, altera ou remove dados de B; não troca ownership para outro tenant. Caminho legítimo de A funciona com credencial não privilegiada. |
| Relações e Storage | Relações indevidas entre tenants são rejeitadas; arquivos de B não são listados, lidos ou alterados por A; acesso legítimo funciona. |
| Entitlements | Capacidade indisponível é negada no backend mesmo com chamada direta; limites são aplicados também em concorrência. |
| Webhooks | Origem/autenticação inválida é rejeitada; evento duplicado não duplica efeitos; falha tem trilha de recuperação. |
| Agentes | Memória, recuperação, resultados, caches e jobs não vazam entre tenants; contexto forjado não amplia acesso. |
| Ferramentas | Ferramenta fora da allowlist é negada pelo executor mesmo que o modelo a solicite; conteúdo malicioso não altera autorização. |
| Aprovação | Ação crítica sem aprovação é negada; aprovação de uma versão não autoriza payload, destinatário ou orçamento alterado. |
| Revogação | Membership, integração ou permissão revogada após agendamento impede a ação no momento da execução. |
| Recuperação | Timeout de ação externa não causa repetição cega; reconciliação ou revisão humana resolve estado incerto. |
| Concorrência | Entrega duplicada de job, retry e retomada após queda não duplicam efeito; tentativa obsoleta não sobrescreve resultado válido. |
| Limites | Limite de custo/turnos/tempo bloqueia novas chamadas; kill switch interrompe novos efeitos e registra o motivo. |
| Dados e UX | Ausência de dados aparece como limitação; rascunho não aparece como publicado; fato e inferência são diferenciados. |
| Regressão de agentes | Mudança de modelo, prompt, ferramenta ou política reexecuta os cenários afetados, incluindo casos adversariais e revisão humana pertinente. |

## Verificação de publicação incremental

Seguir [PUBLICACAO.md](PUBLICACAO.md). Antes de publicar: conferir destino de produção, versão aprovada, histórico de migrations, compatibilidade com módulos ativos, configurações Auth/Storage, secrets, recuperação e gates locais. Depois: verificar saúde, autenticação, acesso autorizado e negado em contas controladas, fluxo principal e jobs sem disparos reais não autorizados. Não executar reset, seeds de teste nem suítes destrutivas em produção. Falha pós-deploy impede declarar publicação verificada.

## Catálogo de comandos

Comandos reais do incremento I-01, executados em 15/09/2026. Pré-requisitos:
Docker em execução, Supabase CLI e `corepack enable pnpm`.

| Verificação | Comando | Estado |
| --- | --- | --- |
| Subir e parar o Supabase local | `pnpm db:start` · `pnpm db:stop` | Implementado. Portas 544xx, próprias da Oplyra; passam pela trava de projeto |
| Recriar o banco do zero por migrations e seeds | `pnpm db:reset` | Implementado. 8 migrations + seeds sintéticos |
| Definir senhas locais dos papéis de login | `pnpm db:roles` | Implementado. Senhas nunca entram no versionamento |
| Tipos | `pnpm typecheck` | Implementado |
| Unidade, integração e arquitetura | `pnpm test` | Implementado. 36 testes |
| Banco: matriz de isolamento | `pnpm test:db` | Implementado. 19 testes pgTAP |
| Varredura de segredos | `pnpm scan:secrets` | Implementado |
| Build de produção da web | `pnpm build` | Implementado |
| Tudo acima em sequência | `pnpm verificar` | Implementado |
| Experimento EXP-01 | `cd experiments/exp-01&& pnpm setup && node src/run.ts && node src/api.ts` | Executado e aprovado |
| Aplicação local | `pnpm --filter @oplyra/web dev` (porta 3100) | Implementado |
| Publicar e verificar produção | A definir com o destino aprovado | Não implementado |

### Convivência com outro stack Supabase na mesma máquina

Esta máquina roda outro projeto Supabase local. Os dois são independentes:
containers, volumes de banco e de Storage, redes Docker e portas são
separados, e um não alcança o outro nem por nome de container.

O que **não** é separado são os comandos do operador: a CLI escolhe o stack
pelo `project_id` do `config.toml` da pasta atual, então `supabase stop` ou
`supabase db reset` na pasta errada acertam o projeto errado, e
`supabase stop --all` derruba os dois.

Por isso `db:start`, `db:stop`, `db:status` e `db:reset` passam por
`scripts/db-guard.sh`, que se ancora na raiz deste repositório, confere
`project_id` e porta antes de repassar o comando e usa `--project-id`
explícito ao parar. Usar a CLI crua continua possível e continua sem rede de
proteção: prefira os comandos do `package.json`.

Antes de usar cada comando, inspecionar seu destino e efeitos. Não apontar checks locais para produção. A configuração falha fechada: ambiente local apontando para host remoto sem `OPLYRA_ALLOW_REMOTE=true` impede a inicialização.

## Cenários adicionais de IA, FinOps e Stripe

Estes são critérios para implementação futura, não testes já executados. Usar os contratos de [PRODUTO](PRODUTO.md) e as decisões/pendências de [ATUALIZACOES](../product/marketing-ops/ATUALIZACOES.md). G4 inclui estes cenários antes da ativação de workflows pagos; os fluxos visuais correspondentes integram G5.

| Área | Cenário e resultado esperado |
| --- | --- |
| Registry e roteamento | Modelo sem capacidade, avaliação válida ou autorização é excluído; escolha respeita política versionada e limiar de qualidade, com justificativa registrada. |
| Escalonamento e fallback | Falha do provedor e qualidade insuficiente seguem políticas distintas; alternativas revalidam dados, prazo e orçamento; ausência de alternativa elegível encerra ou escala sem contornar controles. |
| Regra determinística | Workflow resolvível pela regra prevista conclui sem chamar LLM e sem lançamento fictício de custo de modelo. |
| Ledger | Texto, imagens, edições, revisões e retries faturados geram registros rastreáveis; reentrega de evento não duplica custo; custo desconhecido permanece pendente; conciliação preserva histórico. |
| Budget concorrente | Chamadas simultâneas, subexecuções e retomadas disputam reservas atômicas por workflow e tenant; falta de saldo impede nova chamada; liberação não ocorre enquanto custo/efeito estiver incerto. |
| Kill switch | Bloqueio por provedor/modelo impede novas chamadas e impede fallback para o alvo bloqueado; chamadas já iniciadas são conciliadas. |
| Configuração incompleta | Falta de limites numéricos, tarifa ou política válida impede ativação paga; não há default ilimitado. |
| Eval Engine | Primeiro workflow e mudanças de prompt/modelo/política têm avaliações versionadas; falha de segurança ou limiar obrigatório impede liberação. |
| Medidores | Reaprovação, retry, edição e adaptação composta seguem regras explícitas sem duplicação; mudança de período/fuso/plano tem resultado definido. Políticas ainda pendentes impedem concluir este cenário. |
| Check-ins | Mês com cinco ocorrências semanais segue política explicitamente definida frente à franquia; não omite entrega nem excede consumo silenciosamente. |
| Imagens e UX | Geração, edição, falha, repetição e aprovação preservam versões, revisão e medição; usuário vê consumo da capacidade e estado real da entrega. |
| Stripe | Webhook com assinatura inválida é rejeitado; evento repetido não duplica efeitos; ordem invertida não regride estado; conciliação resolve divergências. Testar com fixtures/sandbox, sem cobrança real. |
| Baseline | Cálculo reproduzível separa volumes, tarifas datadas, tentativas, reserva e infraestrutura; não duplica custo fixo/franquias nem apresenta estimativa como medição. |
| Vídeo como ativo de entrada | Upload e análise respeitam tenant, permissão e limite de formato/tamanho; transcrição, resumo e derivados herdam tenant e retenção do ativo; derivado de um tenant nunca alcança contexto de outro; nenhuma rota de geração/renderização nativa existe; custo de processamento é registrado no Ledger. |
| Método de campanha | Campanha exige situação, dor, consequência, desejo, mecanismo, prova e oferta antes da produção; teste declara a hipótese e a dimensão variada; resultado sem dado suficiente é reportado como inconclusivo, não como sucesso; aprendizado registrado retorna a Brand OS e personas com versão e evidência. |

Estes cenários são detalhados em [15](../product/marketing-ops/15-test-plan.md), TST-22 a TST-28. Cenário especificado não é teste executado: o runtime não existe.

## Interface baseada no Figma — 15/09/2026

Usar o [Guia de interface](../product/marketing-ops/GUIA-INTERFACE-FIGMA.md) em G1, para especificação de UX, e G5, quando houver implementação autorizada. Estes são critérios futuros, não testes já executados na aplicação.

| Área | Procedimento e resultado esperado |
| --- | --- |
| Rastreabilidade | Identificar tela, node, data de inspeção e origem das medidas; marcar propostas e acesso indisponível. |
| Fidelidade visual | Comparar implementação com frame em 1440 px; conferir composição, paleta, Inter/Manrope, hierarquia, espaçamentos e diferenças intencionais. |
| Navegação | Verificar sidebar desktop e topbar conforme composição confirmada; registrar eventual divergência no Dashboard. |
| Responsividade | Verificar larguras menores, páginas longas, conteúdo sem corte, navegação recolhida quando necessária e rolagem localizada de tabelas. |
| Acessibilidade | Verificar teclado, foco, nomes acessíveis, contraste das combinações reais e status compreensível sem depender só de cor. |
| Estados e dados | Verificar carregamento, vazio, erro, indisponibilidade, estados desabilitados e dados demonstrativos separados dos reais. |
| Produto | Controles respeitam autorização, entitlements e aprovação; frame não habilita funcionalidade fora do incremento. |
| Consistência | Tokens e componentes compartilhados; bibliotecas seguem stack aprovada. |

Registrar evidências por tela e viewport. Sem acesso ao Figma, registrar a limitação e as verificações feitas com a especificação textual; não declarar fidelidade visual aprovada.
