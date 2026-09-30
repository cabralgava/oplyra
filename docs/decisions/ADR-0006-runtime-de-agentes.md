# ADR-0006 — Runtime de agentes e roteamento multimodelo/multiprovedor

**Status:** runtime próprio permanece proposta não aprovada; arquitetura multimodelo, política de menor custo acima do limiar, FinOps e OpenRouter como gateway inicial padrão não exclusivo são diretrizes aprovadas, registradas em [ATUALIZACOES](../product/marketing-ops/ATUALIZACOES.md) §2 — não possuem identificador DEC na referência v2.3. Seleção de modelos e parâmetros continua condicionada ao EXP-05. **Estado aplicado:** o Product AI Model Harness (portas, Test Adapter, Registry, Model Profiles por `agent + action`, Router e `invokeModel`) e o Cost Ledger persistente estão implementados **somente localmente** e com contratos canônicos (CR-026 e CR-027; ver [AI-MODEL-HARNESS](../harness/AI-MODEL-HARNESS.md)); o Product Agent Runtime, filas e scheduler de produto, adapters reais, contas, chaves, chamadas pagas e produção permanecem propostos ou não autorizados.

## Contexto e alternativas

Agentes precisam de workflows persistentes, executor de ferramentas, isolamento, revisão independente e limites. Runtime próprio fino, frameworks e plataformas hospedadas são alternativas técnicas; a escolha ainda depende da validação de custo, recuperação e autorização. Nenhuma delas pode introduzir SDK de fornecedor no domínio ou remover controles.

## Proposta técnica e requisitos vinculantes

1. Workflows determinísticos versionados coordenam passos delimitados. Ferramentas são casos de uso autorizados. Agentes não publicam anúncios, enviam campanhas nem alteram orçamento no MVP; geração/edição de imagem e chamadas de IA são operações pagas limitadas, não publicação externa.
2. Portas internas de linguagem, de imagem e de análise de ativo enviado (transcrição e visão multimodal), com OpenRouter Adapter como gateway inicial padrão, Test Adapter obrigatório e adapters diretos possíveis. Nenhuma porta de geração ou renderização de vídeo (DEC-014). Fake/replay são o padrão local. OpenRouter não entra no domínio, nos casos de uso ou nos prompts dos agentes.
3. Model Registry mantém capacidade, elegibilidade, tarifa e disponibilidade. Router escolhe por workflow, `agent + action`, qualidade, custo, prazo, privacidade e risco; fallback/escalonamento revalidam os mesmos limites. Modelos concretos, temperaturas e demais parâmetros só entram em Model Profiles versionados após verificação de IDs, tarifas, suporte, política de dados e ciclo de vida.
4. Eval Engine compara candidatos por modalidade, com conjuntos sintéticos, revisão humana e critérios de 15 §5.3. EXP-05 registra evidências; benchmark não é preferência subjetiva por fornecedor.
5. Cost Ledger registra produção, revisões, retries, falhas faturadas e imagens por tenant/workflow/run/call. Reservas e conciliação seguem 13 §14. Agent Run segue 05 §9.
6. Política de dados, retenção, residência e eventual ZDR por fornecedor permanecem DP-09c/DP-22. DP-27 é proposta de exclusão de PII; não assumir equivalência contratual entre provedores.

## Histórico substituído

A versão anterior propunha adapter inicial Anthropic e listava modelos, preços, datas de retirada e condições de dados como fatos. A exclusividade foi retirada para conciliar a decisão de arquitetura multimodelo registrada em ATUALIZACOES. As alegações de fornecedor não foram revalidadas; não sustentam seleção ou política jurídica. Referências históricas FX-10/16/17/18 estão qualificadas no 02 §9. Não há vencedor de benchmark nem autorização de gasto.

## Consequências e aprovações

- DP-09a: gateway inicial decidido como OpenRouter; conta, chave, créditos e custos da rodada de avaliação ainda exigem autorização, sem reabrir a arquitetura multiprovedor.
- DP-09b: selecionar rotas após EXP-05.
- DP-09c: dados e contrato por fornecedor antes de dados reais.
- DP-09d: orçamento da avaliação; separado do budget dos tenants.
- Product Agent Runtime, filas/scheduler de produto e stack permanecem propostas; não há implementação autorizada desses itens. O Product AI Model Harness (slice 1) e o Cost Ledger persistente foram implementados localmente e estão descritos no Status; adapter real, conta, chave e chamada paga não estão autorizados.

## Referências

[05](../product/marketing-ops/05-data-model.md#9-agentic-operations), [09](../product/marketing-ops/09-agentic-architecture.md), [13](../product/marketing-ops/13-ai-model-routing-finops.md), [15](../product/marketing-ops/15-test-plan.md#5-avaliação-dos-agentes), [18](../product/marketing-ops/18-technical-experiments.md), [decisões](README.md).

Responsável pela decisão técnica: responsável pelo projeto, pendente. As DEC aprovadas não aprovam o runtime proposto. Revisão documental de 11/09/2026 substitui os trechos incompatíveis; ID da ADR preservado.
