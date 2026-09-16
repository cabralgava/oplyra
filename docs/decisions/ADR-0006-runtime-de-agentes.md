# ADR-0006 — Runtime de agentes e roteamento multimodelo/multiprovedor

**Status:** runtime próprio permanece proposta não aprovada; arquitetura multimodelo, política de menor custo acima do limiar e FinOps são diretrizes aprovadas, registradas em [ATUALIZACOES](../product/marketing-ops/ATUALIZACOES.md) §2 — não possuem identificador DEC na referência v2.2. Seleção de modelos condicionada ao EXP-05.

## Contexto e alternativas

Agentes precisam de workflows persistentes, executor de ferramentas, isolamento, revisão independente e limites. Runtime próprio fino, frameworks e plataformas hospedadas são alternativas técnicas; a escolha ainda depende da validação de custo, recuperação e autorização. Nenhuma delas pode introduzir SDK de fornecedor no domínio ou remover controles.

## Proposta técnica e requisitos vinculantes

1. Workflows determinísticos versionados coordenam passos delimitados. Ferramentas são casos de uso autorizados. Agentes não publicam anúncios, enviam campanhas nem alteram orçamento no MVP; geração/edição de imagem e chamadas de IA são operações pagas limitadas, não publicação externa.
2. Portas internas de linguagem, de imagem e de análise de ativo enviado (transcrição e visão multimodal), com adapters candidatos conforme a modalidade suportada. Nenhuma porta de geração ou renderização de vídeo (DEC-014). Fake/replay são o padrão local. Não fixar Anthropic como único provedor inicial nem exigir que todo provedor atenda todas as modalidades.
3. Model Registry mantém capacidade, elegibilidade, tarifa e disponibilidade. Router escolhe por workflow, qualidade, custo, prazo e risco; fallback/escalonamento revalidam os mesmos limites. Modelos concretos só entram após verificação de IDs, tarifas, suporte e ciclo de vida.
4. Eval Engine compara candidatos por modalidade, com conjuntos sintéticos, revisão humana e critérios de 15 §5.3. EXP-05 registra evidências; benchmark não é preferência subjetiva por fornecedor.
5. Cost Ledger registra produção, revisões, retries, falhas faturadas e imagens por tenant/workflow/run/call. Reservas e conciliação seguem 13 §14. Agent Run segue 05 §9.
6. Política de dados, retenção, residência e eventual ZDR por fornecedor permanecem DP-09c/DP-22. DP-27 é proposta de exclusão de PII; não assumir equivalência contratual entre provedores.

## Histórico substituído

A versão anterior propunha adapter inicial Anthropic e listava modelos, preços, datas de retirada e condições de dados como fatos. A exclusividade foi retirada para conciliar a decisão de arquitetura multimodelo registrada em ATUALIZACOES. As alegações de fornecedor não foram revalidadas; não sustentam seleção ou política jurídica. Referências históricas FX-10/16/17/18 estão qualificadas no 02 §9. Não há vencedor de benchmark nem autorização de gasto.

## Consequências e aprovações

- DP-09a: autorizar provedores/contas/custos da rodada de avaliação, sem reabrir a arquitetura multiprovedor.
- DP-09b: selecionar rotas após EXP-05.
- DP-09c: dados e contrato por fornecedor antes de dados reais.
- DP-09d: orçamento da avaliação; separado do budget dos tenants.
- Runtime próprio, filas e stack permanecem propostas; não há implementação autorizada nesta revisão.

## Referências

[05](../product/marketing-ops/05-data-model.md#9-agentic-operations), [09](../product/marketing-ops/09-agentic-architecture.md), [13](../product/marketing-ops/13-ai-model-routing-finops.md), [15](../product/marketing-ops/15-test-plan.md#5-avaliação-dos-agentes), [18](../product/marketing-ops/18-technical-experiments.md), [decisões](README.md).

Responsável pela decisão técnica: responsável pelo projeto, pendente. As DEC aprovadas não aprovam o runtime proposto. Revisão documental de 11/09/2026 substitui os trechos incompatíveis; ID da ADR preservado.
