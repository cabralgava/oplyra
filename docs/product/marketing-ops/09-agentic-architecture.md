# Oplyra — Agentic Architecture

**Versão documental:** 0.2  
**Data:** 11 de setembro de 2026  
**Autoridade:** detalhamento do 00 v2.2, com decisões posteriores e regra de ancoragem em [ATUALIZACOES](ATUALIZACOES.md). Citar `DEC-0xx` apenas quando o identificador existir na v2.2. Propostas técnicas permanecem propostas.

## 1. Objetivo

A Oplyra será agentic e multiagente desde a fundação. Os agentes representam funções especializadas, trabalham sobre o mesmo contexto empresarial e são coordenados por workflows, governança e quality gates.

## 2. Princípio central

A plataforma não é uma coleção de chatbots independentes.

```text
Objetivo
  ↓
Orquestrador
  ↓
Agentes especialistas
  ↓
Entregas / análises
  ↓
Estratégia & Qualidade
  ↓
Aprovação / execução
  ↓
Resultados / relatórios
  ↺
```

## 3. Multiagente ≠ modelo fixo

Cada agente deve declarar:

- objetivo;
- ferramentas;
- contexto necessário;
- input/output schemas;
- autonomia;
- quality gate;
- limites de custo e tempo.

Não deve declarar dependência permanente de GPT, Claude ou outro fornecedor. A escolha passa pelo Model Router.

## 4. Contexto compartilhado

Conforme permissão, agentes podem consultar:

- Brand OS;
- produtos/ofertas;
- públicos;
- objetivos e KPIs;
- campanhas;
- histórico de tarefas/decisões;
- resultados;
- integrações autorizadas.

Recuperar somente o contexto necessário para a tarefa.

## 5. Níveis de autonomia

1. **Recomendar** — análise sem execução.
2. **Preparar** — rascunho editável.
3. **Executar com aprovação** — ação preparada, aguarda autorização.
4. **Executar por política** — baixo risco dentro de limites aprovados.

Padrão inicial:

- orçamento/estratégia: recomendar;
- comunicação/publicação: preparar;
- autonomia superior liberada por tenant, ação e integração.

## 6. Segregação de funções

- Orquestrador delega e acompanha;
- especialistas produzem;
- Estratégia & Qualidade revisa;
- regras determinísticas validam formato, UTMs, links, permissões e budgets;
- humano aprova ações externas críticas;
- toda etapa gera trilha de auditoria.

## 7. Workflows agendados

Scheduler persistente dispara workflows versionados e idempotentes.

### Semanal

- resultados;
- entregas;
- atrasos;
- riscos;
- decisões pendentes;
- recomendações;
- próximos sete dias.

### Mensal

- metas x resultados;
- investimento;
- receita;
- CAC/ROAS;
- conversões;
- aprendizados;
- hipóteses;
- riscos;
- próximo mês.

## 8. Limites operacionais

Cada workflow precisa de:

- budget máximo;
- max turns;
- max tokens;
- max tool calls;
- max retries;
- timeout;
- circuit breaker;
- fallback;
- escalonamento humano.

## 9. Imagem e ativos enviados

O Agente de Design pode acionar ferramentas de geração/edição de imagem dentro dos limites comerciais e econômicos. Cada render/edição deve ser mensurável.

Ferramentas de geração, edição ou renderização de vídeo não são permitidas. A análise de ativo enviado, inclusive vídeo, é ferramenta permitida quando o workflow a declara: produz transcrição, resumo e derivados textuais, com custo medido e derivados herdando tenant e retenção do ativo.

## 10. Relação com FinOps

Cada Agent Run deve produzir telemetria para o Cost Ledger e Eval Engine. O sucesso econômico deve ser avaliado por ação aprovada, não apenas por custo de chamada.

## 11. Contratos, scheduler e alertas

Agent Run: [05 §9](05-data-model.md#9-agentic-operations). Registry/Router/Eval/Ledger e limites numéricos: [13 §§14–15](13-ai-model-routing-finops.md#14-contratos-e-contabilização). Autonomia: [11](11-agent-governance.md). A lista de tipos de limite em §8 não substitui a configuração numérica.

Scheduler materializa ocorrência única por tenant/schedule/horário, persiste antes de enfileirar e aplica política de capacidade de [08 §12](08-billing-entitlements.md#12-cadência-dos-check-ins--proposta-dp-30). Não gerar quinta chamada paga silenciosamente. Lease, fencing por tentativa, checkpoints e efeitos incertos são verificados em EXP-02. `waiting_human` pertence ao Workflow Run; Agent Run suspenso para aprovação usa `waiting_approval`.

Alertas mínimos: budget esgotado, custo pendente de conciliação, taxa anômala de retries/escalonamento, modelo/provedor indisponível, dead-letter crescente e coleta atrasada. Thresholds e destino operacional são configuração de DP-15/DP-32; não habilitar alertas fictícios como observabilidade implementada.
