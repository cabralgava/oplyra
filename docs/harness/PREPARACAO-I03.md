# Preparação do I-03 — Brand OS e onboarding

**Estado (04/10/2026): escopo S1–S4 aprovado pelo proprietário com as recomendações de D-1 a D-8; implementado localmente. Resultados e desvios em [ESTADO](ESTADO.md#i-03--brand-os-e-onboarding--implementado-localmente-04102026).** O texto abaixo é a proposta original; ela não previu que dois `package.json` são artefatos governados (CR-034). Desenvolvimento e validação somente no Supabase local; sem deploy, sem projeto remoto, sem serviço externo, sem IA real.

## 1. Fontes lidas

[CLAUDE.md](../../CLAUDE.md); [ESTADO](ESTADO.md); [12 roadmap §2.1](../product/marketing-ops/12-roadmap.md) (I-03 depende só do I-01, aceito em 16/09/2026); [03 modelo de domínio](../product/marketing-ops/03-domain-model.md) (contexto Brand, invariantes I-TEN, I-MEM, I-DLV, I-APR); [05 modelo de dados §4](../product/marketing-ops/05-data-model.md); [14 fluxos F-01](../product/marketing-ops/14-ux-flows.md); [15 aceite do I-03](../product/marketing-ops/15-test-plan.md). **Não relidos nesta preparação, a conferir antes do slice 1:** 01 (requisitos), 07 (LGPD), 08 (entitlements), o guia Figma e o código do I-01 (RBAC, entitlements, Storage).

## 2. Critérios de aceite do I-03 (15 §6)

1. Versão publicada **imutável**; **uma** vigente; publicação exige campos mínimos.
2. Afirmações (claims) com regra de uso e evidência; produto `future` **bloqueia** afirmação de disponibilidade (teste de unidade).
3. Checklist de ativação reflete **eventos reais**.
4. Estados vazio, erro e sem permissão nas telas de marca.

Mais os critérios transversais do projeto: RLS desde a primeira tabela, teste com dois tenants, acesso permitido e negado com sessões reais, sem chamadas externas.

## 3. Linguagem e modelo propostos (conceituais)

Contexto **Brand**. Termos: *perfil de marca* (um por empresa), *versão de marca* (rascunho ou publicada), *produto*, *afirmação* (claim) e *evidência*.

- **Agregado `BrandProfile`** (raiz: empresa). Contém a sequência de versões e o ponteiro para a vigente.
- **`BrandVersion`**: voz/tom, posicionamento, produtos, afirmações. Estados `draft` → `published`; publicada é imutável (alterar = novo rascunho derivado, preservando a origem, como I-DLV). Publicar torna a versão vigente e aposenta a anterior atomicamente.
- **`Product`** com `availability`: `available`, `future` (outros valores a decidir, D-3).
- **`Claim`**: texto, tipo (permitido / proibido), regra de uso, evidências, produto relacionado opcional.
- **Invariantes:** (a) uma única versão vigente por empresa; (b) publicada não muda; (c) publicar exige os campos mínimos (proposta do F-01: posicionamento, tom e ao menos 1 produto); (d) claim de disponibilidade sobre produto `future` é inválida; (e) claim permitida exige evidência; (f) tudo pertence a um tenant e não troca de tenant (I-TEN); (g) o editor não publica sem permissão (I-MEM).
- **Regras no domínio, sem SDK;** persistência atrás de portas, com adapter Supabase na infraestrutura (Clean Architecture, como no I-01).

## 4. Fatias propostas (cada uma com gate de verificação)

| Fatia | Conteúdo | Evidência |
| --- | --- | --- |
| S1 | Domínio e casos de uso de Brand (criar rascunho, editar, publicar, listar versões) com testes de unidade e de invariantes | Vitest; mutações das invariantes |
| S2 | Migrations versionadas, RLS e constraints (uma vigente, FK composta com tenant, imutabilidade da publicada) | pgTAP com dois tenants, anônimo, membro removido, multi-tenant |
| S3 | Telas "Marca" no tema escuro do guia: versão publicada, rascunho, produtos, afirmações; estados vazio, erro e sem permissão | Playwright; checklist `apple-design` |
| S4 | Checklist de ativação a partir de eventos reais do tenant (dados da empresa, marca publicada, equipe) | Testes de integração e E2E |

Cada fatia exige autorização antes de começar; `pnpm verificar` ao fim de cada uma, com resultados reais registrados no ESTADO.

## 5. Fora do I-03

Agentes e geração por IA (I-05), objetivos, campanhas e tarefas (I-04), conexão de mídia e eventos comerciais (I-06/I-07), Stripe, Product Agent Runtime, filas, qualquer deploy ou acesso ao Supabase de produção. **Personas e *message frameworks*** aparecem no contexto Brand do 03, mas o critério de aceite do I-03 não as exige: ver D-1.

## 6. Decisões necessárias antes de implementar

- **D-1.** Personas e *message frameworks* entram no I-03 ou ficam para o I-04, que as consome? Recomendação: ficar para o I-04, com o I-03 limitado a perfil, versão, produto e claim.
- **D-2.** Campos mínimos para publicar. Proposta: posicionamento, tom e 1 produto (F-01). Confirmar ou ampliar.
- **D-3.** Valores de disponibilidade do produto além de `available` e `future` (ex.: `beta`, `discontinued`) e a regra exata de bloqueio de claims.
- **D-4.** Permissões: quais papéis do RBAC do I-01 editam e quais publicam. Verificar o catálogo existente antes de propor novos.
- **D-5.** Evidência de claim: texto/URL ou arquivo no Storage (com a política de retenção do ativo)? Recomendação: texto e URL no I-03; arquivo depois.
- **D-6.** Eventos que alimentam o checklist: quais existem hoje no I-01 e quais precisam ser emitidos.
- **D-7.** Entitlements: o Brand OS é capacidade de todos os planos ou limitada (ex.: número de produtos)? Conferir o doc 08.
- **D-8.** Auditoria e LGPD: o que da marca é dado pessoal (provavelmente nada) e o que entra no log de auditoria.

## 7. Riscos e limites

A fidelidade visual das telas continua limitada: os frames do Figma não foram inspecionados (DP-35, ver ESTADO). A inspeção por leitor de tela segue pendente. Não se declara conformidade LGPD.

## 8. Próximo passo

Aguardar a aprovação do escopo (fatias S1–S4 ou subconjunto) e as respostas a D-1 a D-8. Em seguida, uma sessão de leitura dos pontos listados em §1 e o início da S1.
