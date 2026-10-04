# Preparação do I-04 — Estratégia, campanhas e tarefas

**Estado (04/10/2026): escopo aprovado pelo proprietário com as recomendações de D-1 a D-10; S1, S2, S3 e S5 implementadas localmente; S4 (tarefas) adiada, pelo D-2. Resultados e desvios em [ESTADO](ESTADO.md#i-04--estratégia-campanhas-e-testes--implementado-localmente-04102026).** O texto abaixo é a proposta original. Desenvolvimento e validação somente no Supabase local; sem deploy, sem projeto remoto, sem serviço externo, sem IA real.

**Pré-requisitos:** I-03 integrado em `main` (o I-04 depende dele: [12 §2.1](../product/marketing-ops/12-roadmap.md)); CR-034 aplicado na Release 2.24; decisão D-1 sobre as entradas de pacote (§6), porque o I-03 mostrou que `package.json` de core e infra são artefatos governados.

## 1. Fontes lidas

[CLAUDE.md](../../CLAUDE.md); [ESTADO](ESTADO.md); [PREPARACAO-I03](PREPARACAO-I03.md); [12 roadmap](../product/marketing-ops/12-roadmap.md) (I-04 depende só do I-03); [01 §4.3](../product/marketing-ops/01-product-requirements.md) (método de campanha, DEC-017); [03 modelo de domínio](../product/marketing-ops/03-domain-model.md) (contextos Strategy e Work Management; I-CMP, I-HYP); [05 §5](../product/marketing-ops/05-data-model.md); [06 §11.1](../product/marketing-ops/06-integrations.md) (chave de rastreamento e UTMs); [14 F-01, F-03 e §5](../product/marketing-ops/14-ux-flows.md) (fluxo e estados de campanha); [15 §6](../product/marketing-ops/15-test-plan.md) (aceite do I-04 e TST-30).
**Não lidos nesta preparação, a conferir antes da primeira fatia:** 07 (LGPD: o que persona pode conter), 08 (entitlements e limites de campanha), 09 e 11 (habilitação de agente como responsável de tarefa), o guia Figma (telas de Campanhas e Central Estratégica, nodes `4:268` e `4:492`), os códigos do I-03 já integrados.

## 2. Critérios de aceite do I-04 (15 §6)

1. Chave de rastreamento **única por empresa** e **imutável após a ativação**.
2. **TST-30:** campanha sem situação, dor, consequência, desejo, mecanismo, prova ou oferta é rejeitada; teste exige hipótese e dimensão declaradas.
3. Campanha **não referencia objetivo ou produto de outra empresa** (FK composta + teste).
4. Dependências de tarefa **sem ciclo**; responsável **agente só se habilitado**.
5. UTMs gerados conforme a convenção de 06 §11.1.

Mais os transversais do projeto: RLS desde a primeira tabela, dois tenants, acesso permitido e negado com sessões reais, estados vazio/erro/sem permissão, estados de campanha do vocabulário de 14 §5 (Planejada · Ativa · Pausada · Concluída · Cancelada), auditoria, sem chamadas externas.

## 3. Linguagem e modelo propostos (conceituais)

Contexto **Strategy** (com o recorte de **Work Management** necessário a tarefas). Termos: *objetivo*, *indicador* (KPI), *persona*, *campanha*, *método da campanha*, *chave de rastreamento*, *teste* (hipótese), *tarefa*.

| Conceito | Tipo | Regras principais |
| --- | --- | --- |
| **Objetivo** (raiz) | agregado | nome, período, status; contém **indicadores** (nome, unidade, alvo). O progresso real vem de I-06/I-07/I-08: no I-04 aparece como **indisponível**, nunca como zero (06 §11.1) |
| **Persona** | entidade | arquétipo de público (nome, dores, objeções); **não é dado pessoal** de pessoa real (a confirmar em 07) |
| **Campanha** (raiz) | agregado | referencia **um objetivo** e **um produto de uma versão publicada da marca** (`brand_version_id` + `product_key`, FK composta com o tenant); persona opcional; **método** (situação, dor, consequência, desejo, mecanismo, prova, oferta), período, orçamento planejado, mensagem-chave; estado Planejada → Ativa ↔ Pausada → Concluída \| Cancelada |
| **Chave de rastreamento** | objeto de valor | gerada na criação, única por empresa, sem PII; **fixa ao ativar** |
| **Teste** | entidade da campanha | **hipótese** + **dimensão variada** (ângulo, dor, hook, prova, visual, CTA, outra) declaradas antes de executar (I-HYP); resultado e aprendizado ficam para I-08 |
| **Tarefa** (raiz) | agregado | título, estado, prazo, responsável (pessoa; agente só se habilitado), vínculo opcional com campanha, **dependências** formando um grafo sem ciclo |

**Invariantes:** (a) chave única por tenant e imutável após ativar; (b) o método completo é exigido para **ativar** (a campanha em rascunho pode estar incompleta); (c) objetivo e produto são do mesmo tenant e a versão da marca citada é **publicada**; (d) produto de marca com disponibilidade `future` não vira alvo de campanha ativa sem aviso (a decidir, D-7); (e) teste exige hipótese e dimensão para sair de "planejado"; (f) dependência não cria ciclo nem cruza tenants; (g) agente responsável só se habilitado; (h) tudo é do tenant e não o troca (I-TEN).
**Regras no domínio, sem SDK;** persistência atrás de portas, com adapter Supabase (Clean Architecture, como no I-03).

## 4. Fatias propostas

| Fatia | Conteúdo | Evidência |
| --- | --- | --- |
| S1 | Objetivos, indicadores e personas: domínio, casos de uso, migrations, RLS | Vitest; pgTAP com dois tenants |
| S2 | Campanhas: método, chave, UTMs, vínculo à marca, ciclo de vida, auditoria | Vitest + mutações; pgTAP (unicidade e imutabilidade da chave, FK entre tenants) |
| S3 | Testes (hipótese e dimensão) dentro da campanha | TST-30 em Vitest e pgTAP |
| S4 | Tarefas: dependências sem ciclo, responsável humano/agente habilitado | Vitest (grafo), pgTAP |
| S5 | Telas Estratégia, Campanhas (lista e criação em etapas, F-03), Tarefas; checklist de ativação com "Definir objetivo" e "Criar primeira campanha" passando a refletir fatos reais | Playwright; checklist `apple-design` |

Cada fatia exige autorização antes de começar; `pnpm verificar` ao fim de cada uma, com resultados reais registrados no ESTADO. S3 e S4 são separáveis (podem virar um I-04b), ver D-2.

## 5. Fora do I-04

Geração de copy e imagem, aprovação de entregas e Eval Engine (I-05); leitura de mídia, métricas e confiança de dados (I-06); eventos comerciais (I-07); resultados, aprendizado e dashboard (I-08); planejamento pelo Orquestrador (I-09); projetos, riscos, decisões e comentários; publicação ou escrita em qualquer plataforma externa; Stripe, filas e Product Agent Runtime.

## 6. Decisões necessárias antes de implementar

- **D-1. Entradas de pacote.** Cada contexto novo precisaria de `exports` em dois `package.json` governados. Recomendação: **CR-035** (ou emenda do CR-034 antes da Release 2.24) criando `./strategy` em core e infra, no mesmo padrão; testing não é governado.
- **D-2. Tamanho do incremento.** Recomendação: entregar S1, S2, S3 e S5 como I-04 e tratar S4 (tarefas) como fatia final autorizada à parte, se o ritmo exigir.
- **D-3. Convenção de UTMs.** 06 §11.1 é "proposta". Recomendação: `utm_campaign` = chave de rastreamento; `utm_source` e `utm_medium` por canal de uma lista fechada (a definir: ex. `meta`/`paid_social`, `google`/`paid_search`, `linkedin`/`paid_social`, `email`/`email`); `utm_content` = versão da entrega; sem PII; valores minúsculos e sem espaços, preservando o original e a versão da regra.
- **D-4. Formato da chave.** Recomendação: `cmp-<slug do nome>-<4 caracteres>`, único por empresa, regenerável enquanto a campanha não estiver ativa.
- **D-5. Orçamento planejado.** Recomendação: valor inteiro em centavos mais moeda (BRL no MVP), apenas informativo; sem vínculo com o Cost Ledger de IA.
- **D-6. Permissões.** Recomendação: `strategy.read` (todos), `strategy.write` (Gestor, Admin, Owner) e `campaign.activate` (Gestor, Admin, Owner). Ativar não publica nada fora da Oplyra.
- **D-7. Produto futuro em campanha.** Recomendação: bloquear a **ativação** de campanha cujo produto está `future` (aviso no rascunho), coerente com a regra de afirmações do I-03.
- **D-8. Persona.** Campos mínimos recomendados: nome, descrição, dores, objeções; opcional na campanha; sem dado de pessoa real. Confirmar 07 antes.
- **D-9. Responsável por tarefa.** Recomendação: apenas pessoa no I-04; o campo de agente existe no modelo, mas só aceita valor quando houver mecanismo de habilitação de agente (hoje inexistente), coberto por teste com porta falsa.
- **D-10. Checklist de ativação.** "Definir objetivo" e "Criar primeira campanha" deixam de ser "Em breve" e passam a fatos reais (existe objetivo; existe campanha). "Pedir primeira copy" continua indisponível até o I-05.

## 7. Riscos e limites

Os frames do Figma de Campanhas e Central Estratégica seguem sem inspeção (DP-35); a fidelidade visual não pode ser afirmada. A confiança dos dados (confirmado, provável, estimado, parcial, indisponível) só aparece quando houver fonte (I-06+); no I-04, alvos e progresso mostram "indisponível". A convenção de UTMs e a lista de canais são decisões abertas que afetam relatórios futuros. Não se declara conformidade LGPD.

## 8. Próximo passo

Aguardar: merge do I-03 e Release 2.24; aprovação do escopo (fatias S1–S5 ou subconjunto) e respostas a D-1 a D-10. Em seguida, leitura dos pontos pendentes de §1 e início da S1.
