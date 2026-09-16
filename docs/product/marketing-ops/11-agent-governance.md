# Oplyra — Agent Governance

**Versão documental:** 0.2  
**Data:** 11 de setembro de 2026  
**Autoridade:** detalhamento do 00 v2.2, com decisões posteriores e regra de ancoragem em [ATUALIZACOES](ATUALIZACOES.md). Citar `DEC-0xx` apenas quando o identificador existir na v2.2. Propostas técnicas permanecem propostas.

## 1. Objetivo

Garantir que autonomia, custo, qualidade e risco dos agentes sejam controlados por políticas verificáveis.

## 2. Princípios

- menor privilégio;
- segregação de funções;
- saídas estruturadas;
- evidências;
- fatos separados de inferências;
- aprovação humana para risco relevante;
- auditoria;
- limites econômicos;
- falha segura.

## 3. Classificação das afirmações

Toda análise deve poder distinguir:

- fato;
- inferência;
- hipótese;
- recomendação;
- limitação.

## 4. Quality gates

Podem incluir:

- schema validation;
- Brand OS;
- claims/evidências;
- UTMs;
- links;
- orçamento;
- permissões;
- consentimento;
- políticas de canal;
- quality score por modelo;
- estrutura de campanha completa: situação, dor, consequência, desejo, mecanismo, prova e oferta (DEC-017);
- hipótese explícita e dimensão variada declaradas antes de um teste.

O agente executor não deve aprovar irrestritamente o próprio trabalho.

## 5. Aprovação humana

Obrigatória ou configurável conforme risco para:

- publicação externa;
- aumento relevante de orçamento;
- disparos em massa;
- ações que alterem dados externos de forma relevante;
- automações críticas;
- exceções a budget/política.

## 6. Budgets e circuit breakers

Cada workflow deve definir:

- max cost;
- max turns;
- max tokens;
- max tool calls;
- max retries;
- timeout;
- limite de subagentes;
- comportamento quando excedido.

## 7. Routing e fallback

Política padrão:

> escolher o modelo de menor custo que ultrapasse consistentemente o quality threshold do workflow.

Fallbacks devem ser explícitos. Escalonamento para modelos mais caros ocorre por insuficiência de confiança/qualidade, indisponibilidade ou risco.

## 8. Duplo parecer

Competição entre modelos ou segunda opinião deve ser restrita a casos de alto valor/risco, por exemplo:

- decisão de orçamento relevante;
- inconsistência de dados;
- recomendação de pausar campanha;
- revisão estratégica crítica;
- atribuição duvidosa.

Não usar dois modelos em toda tarefa por padrão.

## 9. Retries

- limitados;
- classificados por causa;
- custo contabilizado;
- idempotentes quando houver ação externa;
- dead-letter quando não resolvido;
- escalonamento humano após limite.

## 10. Governança econômica

Monitorar por tenant, workflow, agente, modelo e provedor:

- custo bruto;
- custo efetivo por sucesso;
- p50/p90/p95;
- consumo do budget;
- anomalias;
- margem.

## 11. Governança de dados

- contexto mínimo necessário;
- isolamento por tenant;
- memória versionada;
- sem reutilização cruzada de dados privados;
- allowlist de ferramentas;
- validação de entradas não confiáveis.

## 12. Autonomia canônica e aprovação por versão

| Valor | Significado |
| --- | --- |
| recommend | Recomenda sem executar alteração externa; suggest é apenas nome histórico equivalente. |
| draft | Produz rascunho para revisão. |
| approval_required | Prepara ação e exige aprovação humana vinculada à versão, destino e prazo. |
| policy_execute | Executa ação de baixo risco dentro de política explícita, limites e permissão; não equivale a publicação irrestrita. |

O `execute` genérico do 00 não é quinto nível nem autorização implícita. Aprovação humana de entrega é distinta do parecer de qualidade emitido por agente. Política pode permitir humano aprovar seu próprio rascunho por ação explícita auditada (DP-12a, proposta); não pode permitir autoaprovação automática do executor.

Duas pessoas (DP-12b, proposta): operações destrutivas/recuperação e exceções que ampliem gasto ou autorização exigem separação entre solicitante e autorizador conforme risco. Definir catálogo antes da capacidade entrar em operação. Aprovação expirada, revogada ou ligada a payload anterior é inválida.

Limites e fallback são definidos em 13; franquias/medidores em 08. Um aceite humano não contorna restrição de tenant, fornecedor ou budget.
