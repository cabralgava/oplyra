# 14 — Fluxos de UX e protótipo conceitual

> **Discovery v1.2 — proposta (11/09/2026).** Elaborado com a skill `apple-design` e os princípios de UX do documento de transição (§21). O protótipo em [prototypes/performance-mvp.html](prototypes/performance-mvp.html) é **conceitual e estático**, com dados fictícios. Não é scaffold da aplicação nem foi testado com usuários.

## 1. Direção de design

**Uma sala de operação calma: cada tela responde "o que precisa de mim agora, com que confiança e qual o próximo passo".**

Pontos da skill aplicados:

- clareza antes de decoração;
- ação principal evidente;
- rótulos específicos ("Aprovações", "Mídia", "Resultados", e não "Início/Mais");
- opções avançadas a um nível de distância;
- feedback imediato;
- movimento que explica relações espaciais;
- materiais só para camadas funcionais;
- acessibilidade como requisito.

## 2. Arquitetura de informação

| Área (navegação lateral) | Conteúdo | Contexto |
| --- | --- | --- |
| **Início** | Próximos passos, aprovações pendentes, alertas, saúde dos dados, checklist de ativação | Processo de onboarding + consultas |
| **Estratégia** | Objetivos e alvos; campanhas | Estratégia |
| **Produção** | Entregas (briefings, versões); Biblioteca de ativos | Content & Assets |
| **Aprovações** | Fila de decisões por versão | Work Management (política em 11) |
| **Operação** | Projetos, tarefas, riscos e decisões | Operação |
| **Mídia** | Contas conectadas, campanhas de mídia, recomendações (leitura) | Mídia Paga |
| **Resultados** | Dashboard, check-ins semanais | Analytics & Attribution |
| **Marca** | Brand OS: versão publicada, rascunho, produtos, personas, afirmações | Marca |
| **Configurações** | Equipe, integrações, fontes comerciais, agentes e autonomia, plano e consumo, auditoria | Vários |

Barra superior: seletor de empresa (com nome e papel), busca, execuções de IA em andamento e escalonamentos. Módulos Growth não aparecem na navegação; upsell só em contexto ([08](08-billing-entitlements.md) §6).

## 3. Início orientado ao próximo passo

Hierarquia, de cima para baixo:

1. **Próximo passo principal:** um único card com a ação mais importante, escolhida por regra determinística. Exemplos: "Aprovar 3 variações da campanha Lançamento Plataforma Pro", "Reconectar Google Ads para o check-in de segunda", "Publicar a primeira versão da marca".
2. **Precisa de você:** aprovações, escalonamentos e recomendações, com contagem e prazo.
3. **Como estamos:** 3 a 4 indicadores do objetivo principal, com alvo, **confiança** e atualização.
4. **Operação da semana:** entregas, atrasos e riscos.
5. **Ativação** (enquanto incompleta): checklist progressivo.

Prioridade do próximo passo:

1. bloqueio de segurança ou conexão;
2. escalonamento;
3. aprovação com prazo;
4. ativação incompleta;
5. recomendação nova;
6. check-in disponível.

## 4. Fluxos

### F-01 Onboarding progressivo (I-01/I-03)

1. Aceitar convite ou login (empresa provisionada por operador no MVP).
2. Início com checklist:
   - completar dados da empresa;
   - **cadastrar marca mínima** (posicionamento, tom, 1 produto) e publicar a versão 1;
   - definir objetivo;
   - convidar equipe;
   - conectar mídia (opcional);
   - criar primeira campanha;
   - pedir primeira copy.
3. Cada item abre o fluxo no próprio contexto e volta ao Início com o item marcado. Nada exige concluir tudo de uma vez.

**Estados:** vazio instrutivo em cada área; sem dados simulados para usuários reais.

### F-02 Troca de empresa (I-01)

Seletor na barra superior mostra empresas com vínculo ativo e o papel em cada uma. A troca recarrega o contexto e deixa a mudança visível (nome e cor de identificação da empresa). Rascunho não salvo gera aviso antes da troca. Vínculo removido durante o uso leva a uma tela "Você não tem mais acesso a esta empresa", sem vazar dados.

### F-03 Criar campanha (I-04)

1. Formulário em etapas curtas: objetivo, produto e persona; **situação, dor, consequência, desejo, mecanismo, prova e oferta** (DEC-017); período e orçamento planejado; mensagem-chave. Campos do método são obrigatórios antes de pedir produção.
2. A **chave de rastreamento** é gerada e exibida com os UTMs recomendados e o botão "copiar". O aviso "fica fixa após ativar" explica a consequência.
3. Ativar a campanha fixa a chave e sugere as próximas ações (pedir copy, vincular campanhas de mídia).

### F-04 Pedir copy à IA e revisar (I-05)

1. Na campanha: **Nova entrega → Copy de anúncio**. O briefing estruturado vem pré-preenchido com campanha, persona e produto.
2. Enviar mostra imediatamente um card de execução com estado "Produzindo", passos previstos (Rascunho → Verificações → Revisão de qualidade) e consumo estimado na capacidade correspondente; pesos de créditos ainda não definidos. O usuário pode sair da tela.
3. Ao concluir, notificação no app. A entrega abre com:
   - variações lado a lado;
   - selo **Gerado por IA**;
   - versão da marca usada;
   - verificações (bloqueantes e avisos);
   - **parecer de Estratégia e Qualidade** com critérios.
4. O usuário pode editar (cria nova versão, origem "IA + edição humana"), pedir nova rodada com instrução ou **solicitar aprovação**.

**Erros:** briefing insuficiente → a IA devolve perguntas objetivas. Orçamento esgotado → escalonamento com resultado parcial marcado. Recusa → mensagem com o motivo e o caminho humano.

### F-05 Aprovar versão (I-05)

1. **Aprovações** lista itens por prazo, com campanha, tipo, origem (IA ou humana) e parecer resumido.
2. O painel de revisão abre **lateralmente** (painel paralelo, sem escurecer o fundo), para comparar com a lista.
3. Mostra:
   - versão N e diferenças para a N−1;
   - verificações;
   - parecer;
   - evidências das afirmações usadas;
   - hash abreviado da versão.
4. Ações: **Aprovar versão N**, **Pedir ajustes** (comentário obrigatório), **Rejeitar**.
5. A confirmação da aprovação é modal curto (com escurecimento, porque é decisão): "Você está aprovando a **versão 3** desta entrega. Edições futuras exigirão nova aprovação."
6. Após aprovar: estado **Aprovado**, UTMs prontos para copiar e botão **Informar uso** (registro manual de veiculação).

### F-06 Conectar Meta Ads / Google Ads (I-06)

1. Explicação antes do OAuth: "A Oplyra só **lê** campanhas e métricas. Nenhuma alteração será feita nas suas contas." No Google, inclui a nota de que a permissão concedida é ampla, mas a Oplyra não executa alterações.
2. OAuth → seleção de contas → primeira coleta com progresso por conta e aviso de que o histórico chega em alguns minutos.
3. Saúde da conexão sempre visível: ativa, com atraso, expirada ou revogada, com a ação correspondente.

### F-07 Dashboard com confiança (I-08)

- Cada número acompanha **selo de confiança** (ícone + texto; nunca só cor):
  - **Confirmado** (●);
  - **Provável** (◐);
  - **Estimado** (◌);
  - **Parcial** (◑);
  - **Indisponível** (—).
- Abaixo do número vem a atualização ("atualizado há 3 h").
- Ao passar o mouse ou focar: fontes, janela de reprocessamento e limitações.
- Indicador derivado herda a menor confiança das entradas, com explicação: "CPQL estimado porque 22% dos leads qualificados não têm chave de rastreamento".
- Filtros: período no fuso da empresa, campanha, canal, produto.

### F-08 Check-in semanal (I-08)

1. Proposta de horário: segunda-feira às 07:00 no fuso da empresa, com aviso no Início. Quatro entregas com IA por mês; quinta ocorrência e relatório mensal seguem proposta DP-30 de 08 §12, ainda a decidir antes da ativação. Mostrar tipo de entrega antecipadamente.
2. Seções fixas:
   - resultados;
   - progresso dos objetivos;
   - entregue;
   - atrasado;
   - aprovações pendentes;
   - riscos;
   - decisões pendentes;
   - recomendações;
   - próximos 7 dias;
   - **limitações dos dados**.
3. Cada declaração tem rótulo (**Fato**, **Inferência**, **Hipótese**, **Recomendação**, **Limitação**) e link para a evidência.
4. Ações: marcar decisão tomada (cria `DecisionRecord`), aceitar tarefa proposta, abrir recomendação.
5. Recorte de dados visível: "Dados até 07/09/2026 23:59". Revisões posteriores ficam no histórico.

### F-09 Fonte comercial e chave de API (I-07)

1. **Configurações → Fontes comerciais → Nova fonte.**
2. A chave aparece **uma única vez**, com cópia e aviso claro. Depois, só o prefixo é exibido.
3. Painel da fonte: eventos aceitos, duplicados, em conflito e rejeitados (com motivo), mais a documentação da API.
4. Rotação com período de sobreposição e revogação imediata com confirmação.

### F-10 Execuções de IA, escalonamentos e interrupção (I-02/I-05)

- **Execuções:** lista por estado com agente, objeto, custo, duração e passos; detalhe com verificações, pareceres e ferramentas negadas.
- **Escalonamentos:** motivo, contexto e ações (fornecer dados, reexecutar, cancelar).
- **Interromper IA desta empresa** (Owner/Admin/Gestor): confirmação com motivo; banner persistente enquanto ativo; liberação auditada.

### F-11 Recomendação de mídia (I-06)

Card com ação proposta, evidências (fatos com números e confiança), impacto esperado **rotulado como hipótese**, risco e validade. Ações: **Aceitar** (registra decisão; a execução é manual na plataforma) ou **Dispensar** (motivo opcional, que alimenta a avaliação).

## 5. Vocabulário de estados na interface

| Objeto | Estados exibidos | Regra |
| --- | --- | --- |
| Entrega | Rascunho · Em revisão · Ajustes solicitados · Aprovado · Uso informado · Arquivado | "Agendado" e "Publicado" **não aparecem no MVP**: não há publicação pela Oplyra (T-16) |
| Campanha | Planejada · Ativa · Pausada · Concluída · Cancelada | — |
| Recomendação | Nova · Aceita · Dispensada · Expirada | Aceita ≠ executada |
| Relatório | Gerando · Rascunho · Publicado · Falhou | Publicado = visível no app |
| Execução de IA | Na fila · Executando · Aguardando aprovação · Precisa de você · Concluída · Falhou · Cancelada | — |
| Conexão | Ativa · Com atraso · Expirada · Revogada | — |

## 6. Estados globais de tela

| Estado | Tratamento |
| --- | --- |
| Carregando | Esqueleto com a estrutura final; sem spinner em tela cheia; feedback no pressionamento em até 100 ms |
| Vazio | Explica o valor e oferece a ação para começar |
| Dados parciais | Conteúdo disponível + faixa de limitação com causa e ação |
| Dados desatualizados | Selo de atualização em destaque e link para a saúde da conexão |
| Erro recuperável | Mensagem específica, ação de nova tentativa e dados preservados |
| Sem permissão | "Seu papel não permite …", sem revelar dados; indica quem pode ajudar |
| Capacidade não contratada | Upsell contextual discreto; nunca em fluxo crítico |
| Limite atingido | O que aconteceu, o que continua funcionando, quem pode resolver |
| IA em execução | Card persistente com passos e possibilidade de sair da tela |
| Kill switch ativo | Banner persistente com motivo e responsável |

## 7. Movimento, materiais e acessibilidade

| Elemento | Comportamento |
| --- | --- |
| Painel de revisão (lateral) | Entra pela direita, spring sem overshoot (~0,35 s), interrompível; fecha pelo mesmo eixo; sem escurecimento (tarefa paralela) |
| Confirmação de aprovação | Modal curto com escurecimento; foco preso no diálogo; `Esc` cancela |
| Menus e popovers | Nascem do controle (`transform-origin` no gatilho); sem bounce |
| Cards de execução | Transição de estado por cross-fade; progresso sem animações chamativas |
| Barra superior | Material translúcido apenas se o conteúdo rolar sob ela; sólido com redução de transparência |
| Botões | Feedback no `pointerdown` (escala 0,97 e opacidade) |
| Redução de movimento | Remove deslocamentos; mantém cross-fades curtos |
| Contraste e foco | Meta WCAG 2.2 AA; foco visível em todos os controles; ordem de tabulação lógica |
| Estados | Nunca só por cor: ícone + texto nos selos de confiança e de estado |
| Responsivo | Desktop ≥ 1280 px como foco. Em ≤ 768 px, navegação recolhida; Aprovações, check-in e Início totalmente usáveis; edição de marca e dashboard detalhado priorizam leitura |
| Tipografia | Manrope nos títulos e Inter no produto, conforme o [guia de interface](GUIA-INTERFACE-FIGMA.md); tamanhos em `rem`; números tabulares em métricas |
| Tema e cor | Tema escuro padrão; roxo `#5B3DF5` nas ações primárias; estados nunca apenas por cor |

## 8. Protótipo conceitual

Arquivo: [prototypes/performance-mvp.html](prototypes/performance-mvp.html), autocontido e sem dependências externas.

| Tela | O que valida |
| --- | --- |
| Início | Próximo passo único, fila "precisa de você", indicadores com confiança, seletor de empresa |
| Entrega em revisão | Selo de IA, versão e hash, verificações, parecer independente, aprovação vinculada à versão |
| Resultados | Selos de confiança, indicador derivado com menor confiança, mídia somente leitura |
| Check-in semanal | Declarações classificadas, limitações explícitas, recorte de dados |

Limitações: dados e empresas fictícios; interações simuladas (troca de tela, abrir painel, confirmar, gerar/editar imagem), sem persistência, chamada externa ou custo; sem testes em dispositivos reais; análise de animação quadro a quadro não realizada. A validação interativa executada em 11/09/2026 e seus limites estão em [PREPARACAO-I01](../../harness/PREPARACAO-I01.md) §3.

## 9. Checklist `apple-design` (protótipo conceitual)

| Item | Situação |
| --- | --- |
| Ação principal evidente | Atendido (card de próximo passo; botão primário único por painel) |
| Resposta imediata ao pressionamento | Atendido no protótipo (estado `:active`) |
| Arrastes acompanham o ponteiro | Não aplicável (sem arraste no MVP) |
| Animações interrompíveis e com velocidade preservada | Parcial: transição CSS simples no painel. **A implementação real deve usar spring interrompível** |
| Entrada e saída no mesmo eixo | Atendido (painel lateral) |
| Bounce só com momentum | Atendido (sem bounce) |
| Blur, sombra e transparência com função | Atendido (apenas barra superior e modal) |
| Tipografia legível em escalas | Atendido (`rem`); famílias Manrope/Inter conforme o guia |
| Estados de carregamento, vazio, sucesso e erro | Especificados (§6); protótipo mostra sucesso, aviso e parcial |
| Teclado, foco e leitores de tela | Parcial: foco visível e rótulos; `Esc` fecha o modal e o foco vai para o resultado após aprovar (verificado em 11/09/2026); ativação por `Enter`/espaço não confirmada pelo ambiente de teste; sem leitor de tela |
| Redução de movimento, transparência e contraste | Atendido via media queries; não testado em dispositivos |
| Viewports pequeno e grande | Parcial: verificado em 1024 px e em 768 px emulados (navegação recolhida em barra rolável, conteúdo em coluna única); não testado em dispositivo real |
| Análise quadro a quadro | Não realizada |

## 10. Validação proposta com usuários

Durante as entrevistas (T-A): tarefas com o protótipo.

1. "O que você faria primeiro hoje?"
2. "Aprove a variação correta e explique o que acabou de aprovar."
3. "Quanto custou cada lead qualificado e quanto você confia nesse número?"
4. "Qual limitação deste check-in muda sua decisão?"

Observar compreensão dos selos de confiança (H-14) e da aprovação por versão (H-05).

## 12. Referência visual vigente

O [guia de interface](GUIA-INTERFACE-FIGMA.md) é a referência visual do produto, coerente com o [manual de marca](../../brand/oplyra_brand_system.md): tema escuro, roxo `#5B3DF5`, Manrope em títulos, Inter no produto, comparação em 1440 px e sidebar persistente no desktop. Não manter referência concorrente: o protótipo em tema claro passou a [histórico](prototypes/performance-mvp-legacy-claro.html) e a versão vigente do [protótipo](prototypes/performance-mvp.html) segue o guia.

Pendências de inspeção, que limitam a fidelidade visual: nenhum frame foi aberto até 15/09/2026; grid, espaçamentos, raios, sombras, tamanhos tipográficos, ícones, composição de gráficos e a confirmação da sidebar no Dashboard continuam por conferir nos nodes `4:9`, `4:268` e `4:492`. Os valores usados vieram da especificação fornecida, não de extração.

## 11. Fluxos visuais e consumo

### F-11.1 Enviar ativo e derivar conteúdo (I-07)

Produção → Ativos → Enviar. O usuário escolhe um arquivo, inclusive vídeo, e vê formato e tamanho aceitos. O envio mostra estado de ingestão e, quando a análise é solicitada, os passos de transcrição, resumo e derivados textuais, com o consumo da capacidade correspondente. Derivados abrem como rascunho vinculado ao ativo de origem, com revisão e aprovação próprias. A interface deixa explícito que a Oplyra **não edita nem renderiza o vídeo**: ela produz texto a partir dele. Falha de análise preserva o ativo e a instrução, sem aparentar entrega.

### F-12 Gerar imagem

Produção → Imagens → briefing e formato. Antes de executar, mostrar “1 geração”, saldo dessa franquia e caráter simulado no protótipo. Execução passa por produzindo, revisão e rascunho; falha conserva instrução e não aparenta aprovação. Design gera; Estratégia e Qualidade revisa; humano aprova a versão. Imagem aprovada não é anúncio publicado.

### F-13 Editar imagem

Selecionar versão de origem, instrução e formato; mostrar “1 edição”, separada de geração e adaptação textual. Resultado é nova versão com aprovação própria. Permitir comparar original/resultado e reter histórico. Retry não apaga custo; política comercial distingue tentativa sem resultado e nova edição deliberada.

### F-14 Plano e consumo

Exibir uso/limite por ação: copy aprovada, geração, edição, análise e check-in. Capacidade em unidades de negócio; não exibir USD interno ou tokens. Pesos de créditos ainda não aprovados não aparecem como números reais. Explicar período, saldo reservado, próximo reinício e limite atingido conforme DP-29. Não vender excedente automaticamente.

Protótipo ampliado: Produção simula geração, edição, conclusão, falha, aprovação de versão e limite; Consumo apresenta contadores por ação. Estados/dados são fictícios, não persistidos e sem chamadas pagas. Troca de tenant não reutiliza a tela da empresa anterior.
