# Relatório de reconciliação — Oplyra

11/09/2026 · Revisão documental v1.2 · Destino: `/Users/cmii/Documents/Projetos/Oplyra/`.

> **Documento histórico.** Descreve a revisão de 11/09/2026, feita contra a referência v2.3 então presente. Em 13/09 a referência protegida passou a ser a **v2.2**, com numeração DEC diferente, e em 15/09 o conjunto foi reconciliado novamente. Este relatório permanece como registro do que foi feito naquela data; para o estado atual, ver [ESTADO](ESTADO.md) e [ATUALIZACOES](../product/marketing-ops/ATUALIZACOES.md).

As inconsistências foram conferidas contra os arquivos reais e as correções documentais foram aplicadas. A referência protegida 00 permaneceu íntegra. Lacunas comerciais e resultados experimentais não foram convertidos em decisões aprovadas.

## Diagnóstico por item

Severidade: crítica = contraria decisão aprovada com impacto na fundação; alta = pode orientar implementação, custo ou segurança de forma incorreta; média = estrutura, manutenção ou demonstração. “Corrigido” descreve documentação, não capacidade implementada.

| Item | Diagnóstico / severidade | Constatação nos originais | Tratamento nesta revisão |
| --- | --- | --- | --- |
| A1 | Confirmado · média | Títulos dos documentos 14–18 deslocados. | Numeração corrigida; índice e nomes conferidos. |
| A2 | Confirmado · alta | 36 links Markdown apontavam para arquivos inexistentes; havia 45 ocorrências dos cinco nomes antigos, contando menções. | Links e menções atualizados em documentação, ADRs, harness e protótipo. |
| A3 | Confirmado, com limite de recuperação · alta | Seções e IDs herdados perderam sua base após a substituição de 01–13. | Referências remapeadas; invariantes e incrementos definidos. FX/H/T recebem qualificação de origem; texto ou evidência não recuperados não foram inventados (02 §9). |
| A4 | Confirmado · média | Índice não incluía 13/coleção atual. | README do produto lista 00–18, com FinOps. |
| A5 | Confirmado · média | 00 mantém índice antigo e menciona AGENTS inexistente. | ATUALIZACOES declara a ampliação e leitura condicional. 00 preservado. |
| B6 | Confirmado · média | Versões e catálogo de decisões desalinhados. | Referência v2.3 e DEC-001–020 reconciliadas; revisão dos derivados identificada como v1.2/0.2 conforme o arquivo. |
| B7 | Confirmado · alta | Instruções omitiam multimodelo, FinOps, Stripe e imagens. | CLAUDE, README e harness incorporam diretrizes e fontes canônicas. |
| C8 | Confirmado · crítica | ADR-0007/DP-11a reabriam fornecedor e adiavam billing. | Stripe na Fundação/Fase 1, proposta técnica I-02; somente política de cobrança dos pilotos permanece aberta. |
| C9 | Confirmado · alta | Runtime e experimento herdavam preferência exclusiva por Anthropic. | ADR-0006/EXP-05 exigem candidatos elegíveis por modalidade, Registry/Router/Eval/Ledger, sem vencedor presumido. |
| C10 | Confirmado · alta | Supabase/Auth/RLS reapareciam como escolha aberta. | 04/06/07 alinhados à diretriz aprovada; detalhes técnicos continuam propostos. |
| C11 | Confirmado · alta | Design não acompanhava a prioridade de imagens no MVP. | Prioridade explicitada em instruções, roadmap, UX, testes e suplemento do 00. |
| C12 | Confirmado · alta | Eval Engine não estava explícito no roadmap atual. | Fase 2 e I-05 incorporam avaliações iniciais; contratos e gates acrescentados. |
| D13 | Confirmado · alta | Quatro check-ins pagos não cobrem todo mês com cinco ocorrências semanais. | DP-30 propõe quinta ocorrência e consolidação mensal determinísticas. Política comercial ainda depende de decisão. |
| D14 | Confirmado · alta | Unidades, reserva, falha, reaprovação, período/fuso e excedentes insuficientemente definidos. | 08 §11 documenta proposta de medição e casos de borda; DP-29 não aprovada. |
| D15 | Confirmado · alta | Baseline variável e infraestrutura compartilhada não formavam COGS completo. | 17 §2 separa visões e propõe rateio por tenant-dia equivalente; DP-31 requer validação. |
| D16 | Confirmado e qualificado · alta | Totais históricos não tinham memória reproduzível no pacote. | Hipóteses da conversa reconstruídas. Performance resulta em 32,648/37,5452 USD e Growth em 73,190/84,1685 USD; ambos reproduzem os totais históricos por arredondamento. Tarifas não verificadas como atuais. |
| D17 | Confirmado · alta | Cenário antigo de 40 copies/quatro contas/sem imagens conflitava com franquias atuais. | 17 reconstruído para os volumes de 08; cenário antigo não sustenta margem ou promessa comercial. |
| D18 | Confirmado · alta | Limites operacionais eram qualitativos. | 13 §15 contém proposta numérica por workflow; DP-32 exige calibração antes de ativação paga. Ausência de política bloqueia rota paga. |
| E — budgets | Confirmado · média | Valores repetidos favoreciam deriva. | 08 é fonte de franquias/budgets; 17 concentra memória econômica; resumos referenciam essas fontes. |
| E — Agent Run | Confirmado · alta | Contratos tinham campos e granularidades diferentes. | 05 §9 canônico; chamadas/custos granulares em 13 §14, sem custo desconhecido convertido em zero ou dupla contagem. |
| E — roadmap | Confirmado · média | Fases e incrementos não estavam conciliados. | 12 relaciona Fases com I-01–I-09 e delimita I-01 local. |
| E — contextos | Confirmado · média | Nomes herdados não coincidiam com o modelo atual. | 03 §8 mapeia os nomes antigos; não cria contextos duplicados. |
| E — autonomia | Confirmado · alta | Vocabulário de autonomia divergente entre resumos. | 11 concentra os quatro níveis e a aprovação por versão; execute não é um quinto nível. |
| F — estado | Confirmado · alta | Checkpoint continha versão/hash e certificações que não valiam para o pacote recebido. | ESTADO refeito com referência atual e limites das verificações; original preservado no backup. |
| F — contratos/gates | Confirmado · alta | Harness não cobria novos componentes, custos e imagens. | PRODUTO/VERIFICACOES e TST-22–28 ampliados; cenários especificados, não testes de aplicação executados. |
| F — skills | Confirmado · média | Skill de qualidade continha regras CRM e Apple tinha delimitador YAML inválido. | Duas skills corrigidas; validação passou; origem e restrições de DDD/Clean permanecem explícitas. |
| F — protótipo | Confirmado · média | Imagens e consumo ausentes; exemplos de outro segmento. | Telas ilustrativas de geração/edição/consumo, falha, limite e aprovação; exemplos SaaS B2B. Verificação visual ficou bloqueada pelo navegador. |

## Ordem de correção e decisões restantes

1. Precedência, Stripe, Supabase, multimodelo e contratos: corrigidos antes de organizar os demais documentos.
2. Fontes canônicas, seções, IDs e roadmap: reconciliados; evidências históricas não recuperadas permanecem qualificadas.
3. Economia, medidores, calendário e limites: propostas detalhadas; decidir DP-29–32 antes da ativação correspondente e executar EXP-05 antes de escolher/calibrar modelos.
4. Instruções, harness, skills, índice e protótipo: atualizados. A verificação visual/interativa do protótipo ainda precisa ser realizada quando o navegador estiver disponível.

O escopo local I-01 e as escolhas técnicas ainda dependem das decisões indicadas no [registro](../decisions/README.md). Cobrança de pilotos continua pendente em DP-11a; o fornecedor Stripe já está decidido. Não houve aprovação em bloco, implantação de aplicação ou contratação.

## Evidências de verificação

- Original: 193 links Markdown locais analisados; 36 com arquivo inexistente. As 45 menções aos cinco nomes antigos incluíam links e texto.
- Revisão: nenhum link relativo ou âncora Markdown inválido no conjunto analisado; nenhuma ocorrência dos cinco nomes antigos. O 00 protegido fica fora da correção e da certificação de referências.
- Referências numéricas explícitas entre documentos e títulos 01–18 conferidos. Isto não certifica a veracidade de FX nem recupera automaticamente o significado de trechos antigos ausentes.
- Baseline: soma decimal reproduz os subtotais 32,648 / 73,190 e, com 15%, 37,5452 / 84,1685. São hipóteses históricas agregadas por ação, sem medição ou cotação atual.
- Duas skills: `quick_validate.py` passou em Apple Design e Verificação de Qualidade.
- Protótipo: script passou na verificação de sintaxe; não há IDs duplicados ou alvos literais ausentes. Estes checks não comprovam interação, acessibilidade ou aparência.
- Navegador: tentativa de verificação local bloqueada porque não foi possível verificar a política administrativa. Nenhum teste visual, interativo ou responsivo foi concluído, e o bloqueio não foi contornado.
- EXP-01–05 e testes da futura aplicação: não executados nesta revisão.

## Preservação e limites

[ESTADO](ESTADO.md) identifica a cópia de segurança dos originais e o hash integral do 00. A aplicação final confere os hashes dos arquivos recebidos antes de substituí-los e compara o destino com a revisão, evitando sobrescrever alterações concorrentes.

O [suplemento de precedência](../product/marketing-ops/ATUALIZACOES.md) explica por que o 00 ainda contém referências históricas. O [índice 00–18](../product/marketing-ops/README.md) é a entrada atual. As alegações herdadas sobre fornecedores exigem revalidação antes de seleção/contratação; esta correção não realizou pesquisa externa nem benchmarks.
