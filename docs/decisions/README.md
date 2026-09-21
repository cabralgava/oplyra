# Registro de decisões — Oplyra

Formato definido em [DESENVOLVIMENTO.md](../harness/DESENVOLVIMENTO.md).

- **"Recomendação" ou "proposta" não autoriza implementação.**
- Ausência de objeção não aprova nada.
- Aprovar uma ADR não aprova a fase inteira, e vice-versa.
- Revisão de 11/09/2026 (Reconciliação documental v1.2): pendências classificadas conforme a orientação do usuário. **Nenhuma DP foi aprovada em bloco.**
- Revisão de 15/09/2026: referência protegida passou a v2.2, ancoragem das decisões normalizada, escopo de vídeo e método de campanha incorporados.
- Decisões de stack e recorte de 15/09/2026: DP-01b, DP-02a, DP-02b1, DP-02c, DP-02e e DP-14a **decididas**; DP-02b2 (Turborepo) **adiada**. DP-03a, DP-13, DP-20, DP-25 e DP-33 integram o escopo do I-01 descrito em [PREPARACAO-I01](../harness/PREPARACAO-I01.md) §5. A execução local ainda depende do aceite do escopo.

## Decisões já aprovadas no documento de transição

A referência protegida é a **v2.2, de 13/09/2026**, que numera **DEC-001 a DEC-018** em [§27](../product/marketing-ops/00-documento-transicao.md): greenfield (001), multi-tenant (002), pilotos sem privilégios (003), dois planos por escopo (004–005), entitlements configuráveis (006), preços após validação (007), marca (008), domínios (009), slogan e nome (010–011), multiagentes (012), ausência de CRM próprio (013), vídeo não gerado nativamente e tratado como ativo de entrada (014), herança de tenant pelos derivados (015), preparação e publicação de campanha sob aprovação (016), método de campanha (017) e mercado SaaS B2B (018).

**Ancoragem obrigatória.** Citar `DEC-0xx` somente quando o identificador existir na v2.2. Stripe, budgets internos, geração/edição de imagens e a arquitetura multimodelo com Registry, Router, Eval Engine e Cost Ledger são decisões posteriores **sem identificador** e devem citar [ATUALIZACOES](../product/marketing-ops/ATUALIZACOES.md) §2. Não renumerar, não reaproveitar IDs de outras versões e não atribuir ID por inferência. DEC-009 foi substituída pelos domínios `oplyra.io` e `app.oplyra.io`.

## ADRs do discovery

| ADR | Título | Status | DPs |
| --- | --- | --- | --- |
| [ADR-0001](ADR-0001-supabase-local-e-producao-incremental.md) | Supabase como backend, local via Docker e produção incremental | **Aprovada** (diretriz do projeto) | DP-28a |
| [ADR-0002](ADR-0002-stack-typescript-monorepo-nextjs.md) | Stack complementar: TypeScript, monorepo, Next.js | Proposta | DP-02, DP-13, DP-14 |
| [ADR-0003](ADR-0003-tenancy-rls-e-acesso-a-dados.md) | Tenancy com RLS e acesso a dados por conexão direta | Proposta condicionada ao EXP-01 | DP-03, DP-02d |
| [ADR-0004](ADR-0004-filas-scheduler-postgres.md) | Filas e scheduler no PostgreSQL | Proposta condicionada ao EXP-02 | DP-04 |
| [ADR-0005](ADR-0005-destinos-de-publicacao.md) | Proposta histórica: Supabase, Vercel e Cloud Run | Substituída pela ADR-0009 quanto aos provedores | DP-05, DP-06, DP-07 |
| [ADR-0006](ADR-0006-runtime-de-agentes.md) | Runtime próprio proposto; arquitetura multimodelo/multiprovedor vigente | Proposta condicionada ao EXP-05 | DP-09, DP-27 |
| [ADR-0007](ADR-0007-entitlements-e-billing.md) | Entitlements e Stripe na Fundação | Diretriz de fornecedor/fase; detalhes propostos | DP-11 |
| [ADR-0008](ADR-0008-autorizacao-rbac-por-vinculo.md) | RBAC por vínculo; CLI delimitada; suporte somente leitura | Proposta | DP-20, DP-23 |
| [ADR-0009](ADR-0009-destinos-netlify-supabase-railway-github.md) | Destinos selecionados: Netlify, Supabase, Railway e GitHub | Parcialmente aprovada; parâmetros condicionados ao EXP-03/04 | DP-05, DP-06, DP-07, DP-14 |

Experimentos especificados: [18-technical-experiments](../product/marketing-ops/18-technical-experiments.md) (EXP-01 a EXP-05). Nenhum foi executado.

## Legenda

**Tipo**

| Código | Significado |
| --- | --- |
| **U** | Decisão do usuário: escopo, orçamento, fornecedor, política ou autorização que exige escolha explícita |
| **T** | Proposta técnica condicionada a teste: recomendação com experimento, critérios de aceite e alternativa |
| **C** | Correção ou registro já autorizado: ajuste documental concluído sem nova aprovação |

**Bloqueio**

| Código | Significado |
| --- | --- |
| **M** | Modelagem ou especificação de um incremento |
| **L** | Implementação local |
| **P** | Publicação em produção |
| **D** | Entrada de dados reais (pilotos) |
| — | Não bloqueia |

## Registro de pendências (DP-01 a DP-28)

| ID | Tipo | Assunto | Status | Bloqueia | Quando decidir | Referência |
| --- | --- | --- | --- | --- | --- | --- |
| DP-01a | U | Recorte do MVP Performance (Must/Should/Won't) | Reclassificada com o escopo enxuto: não bloqueia o I-01 | M (I-03) | Antes do I-03 | [01 §8](../product/marketing-ops/01-product-requirements.md#8-mvp-comercializável-inicial) |
| DP-01b | U | Escopo exato do I-01 (somente local) | **Decidida 15/09/2026**: escopo enxuto mantido | — | Concluída | [12](../product/marketing-ops/12-roadmap.md) §4 |
| DP-01c | U | Sequência I-02 a I-09 | Recomendação — aprovável por incremento, após revisão do roadmap | L do incremento | Antes de cada incremento | [12](../product/marketing-ops/12-roadmap.md) §2 |
| DP-02a | U | TypeScript em Node.js LTS (web, worker, CLI) | **Decidida 15/09/2026** | — | Concluída | [ADR-0002](ADR-0002-stack-typescript-monorepo-nextjs.md) |
| DP-02b1 | U | Monorepo com pnpm workspaces | **Decidida 15/09/2026** | — | Concluída |
| DP-02b2 | U | Turborepo | **Adiada 15/09/2026**: reavaliar ao fim do I-01 com tempo de CI medido; até lá, scripts de workspace | — | Fim do I-01 | ADR-0002 |
| DP-02c | U | Next.js (App Router) para UI, BFF e API v1 | **Decidida 15/09/2026**; handlers apenas como controllers | — | Concluída | ADR-0002 |
| DP-02d | T | Kysely como camada SQL | Viável: a estratégia de acesso foi validada, o construtor tipado não foi testado por si. Adotar recebendo a transação do wrapper | L | No I-01 | ADR-0003 |
| DP-02e | U | Vitest, pgTAP, Playwright e lint de fronteiras | **Decidida 15/09/2026** | — | Concluída | ADR-0002 |
| DP-03a | U | Autorizar o EXP-01 como primeira atividade do I-01 (local, dados sintéticos) | **Concluída**: experimento executado em 15/09/2026 | — | Concluída | [18](../product/marketing-ops/18-technical-experiments.md) EXP-01 |
| DP-03b | T | Adotar acesso por conexão direta com papéis restritos, claims verificadas e RLS | **Aprovada 15/09/2026 pelo resultado do EXP-01**, com tenant ativo em escopo de transação e política por igualdade | — | Concluída | [ADR-0003](ADR-0003-tenancy-rls-e-acesso-a-dados.md) |
| DP-04 | T | pgmq + pg_cron + worker Node | Condicionada ao EXP-02; alternativa pg-boss ou transporte separado | L (I-02) | Início do I-02 | [ADR-0004](ADR-0004-filas-scheduler-postgres.md) |
| DP-05a | U | Netlify como destino da web | **Decidida 21/09/2026**; provisionamento não autorizado | — | Concluída | [ADR-0009](ADR-0009-destinos-netlify-supabase-railway-github.md) |
| DP-05b | T | Região/configuração das Netlify Functions e latência até o banco | Condicionada ao EXP-03 (E3-01); nenhuma região presumida | P (I-01) | Antes de publicar o I-01 | ADR-0009 |
| DP-06a | U | Railway como destino do worker contínuo | **Decidida 21/09/2026**; provisionamento não autorizado | — | Concluída | ADR-0009 |
| DP-06b | T | Região, rede, custo ocioso, credenciais e observabilidade do Railway | Condicionada ao EXP-03 | P (I-02) | Antes de publicar o I-02 | [18](../product/marketing-ops/18-technical-experiments.md) EXP-03 |
| DP-07a | U | Supabase como backend gerenciado; região e plano de produção | **Fornecedor decidido 21/09/2026**; `sa-east-1`, plano e orçamento pendentes | P (I-01) | Antes de publicar o I-01 | ADR-0009 |
| DP-07b | U | Metas de perda aceitável e tempo de recuperação; contratação de PITR | Aberta; proposta em [16](../product/marketing-ops/16-environments-release.md) §8.1 | D | Antes de dados reais | 16 §8 |
| DP-07c | T | Recuperação de objetos do Storage (não incluídos nos backups do banco) | Condicionada ao EXP-04 | D | Antes de dados reais | EXP-04 |
| DP-07d | T | Procedimento e teste de restauração (banco + Storage + papéis) | Condicionada ao EXP-04 | D | Antes de dados reais | EXP-04 |
| DP-08a | U | Provedor de e-mail transacional (SMTP do Auth, convites, avisos) | Aberta; decidir quando for publicar autenticação em produção | P (I-01) | Antes de publicar o I-01 | [06 §11.3](../product/marketing-ops/06-integrations.md#113-e-mail-transacional-e-marketing) |
| DP-08b | C | Separar e-mail transacional (Fundação) de e-mail marketing (Growth) | Concluída na documentação | — | — | [06 §11.3](../product/marketing-ops/06-integrations.md#113-e-mail-transacional-e-marketing) |
| DP-09a | U | Provedores/contas e acesso pago para avaliação de texto/imagem; arquitetura multiprovedor já definida | Aberta para operação externa; não reabre DEC-014 | Uso real de API (sandbox), D | Antes do EXP-05 | [ADR-0006](ADR-0006-runtime-de-agentes.md) |
| DP-09b | T | Modelo configurável por rota, sem padrão universal; liberação só por avaliação | Condicionada ao EXP-05 | P (agentes, I-05) | I-05 | EXP-05 |
| DP-09c | U | Política de dados de IA: retenção, ZDR, residência de inferência, dados permitidos | Aberta | D | Antes de dados reais | ADR-0006, [07](../product/marketing-ops/07-security-lgpd.md) §11.3 |
| DP-09d | U | Orçamento das avaliações (por rodada e por mês) | Aberta | Execução do EXP-05 | Antes do EXP-05 | [15](../product/marketing-ops/15-test-plan.md) §5.4 |
| DP-10 | C | Check-in semanal no app faz parte do MVP; envio por e-mail em etapa posterior | Orientação do usuário registrada (11/09/2026) | — | — | [12](../product/marketing-ops/12-roadmap.md) I-08 |
| DP-11a | U | Momento de cobrança dos pilotos, preço, trial e inadimplência | Aberta; adiamento da integração superado pela decisão de billing em ATUALIZACOES | Cobrança real | Antes de cobrar pilotos | [ADR-0007](ADR-0007-entitlements-e-billing.md) |
| DP-11b | C | Assinaturas, entitlements, limites e auditoria preservados na fundação | Registrado conforme orientação | — | — | ADR-0007 |
| DP-12a | U | Pessoa pode aprovar o próprio rascunho só por ação explícita e auditada, conforme política da empresa | Recomendação — não aprovada | L (I-05) | Antes do I-05 | [11 §12](../product/marketing-ops/11-agent-governance.md#12-autonomia-canônica-e-aprovação-por-versão) |
| DP-12b | U | Ações que exigem duas pessoas | Aberta; proposta em 11 §12 | L (I-05 e ações futuras) | Antes do I-05 | [11 §12](../product/marketing-ops/11-agent-governance.md#12-autonomia-canônica-e-aprovação-por-versão) |
| DP-13 | U | Identificadores de código em inglês com glossário PT↔EN | Coberta pelo escopo do I-01; confirmar no aceite | L | No aceite do I-01 | ADR-0002 |
| DP-14a | U | Inicializar repositório Git local (verificado: o diretório **não é** repositório Git) | **Decidida 15/09/2026**: Git local, sem remoto | — | Concluída | ADR-0002 |
| DP-14b | U | GitHub privado + GitHub Actions | **Decidida 21/09/2026**: `cabralgava/oplyra` criado e CI autorizado | — | Concluída | ADR-0009 |
| DP-15a | T | Instrumentação OpenTelemetry e logs com redação, neutros quanto a fornecedor | Recomendação; verificar no I-02 | L (I-02) | Início do I-02 | [16](../product/marketing-ops/16-environments-release.md) §11 |
| DP-15b | U | Serviço que recebe telemetria (fornecedor, região, retenção, acesso, custo) | Aberta; critérios em 16 §11 | P (I-02) | Antes de publicar o I-02 | 16 §11 |
| DP-16a | T | Cifragem envelope na aplicação (alternativa: Supabase Vault) | Recomendação; testes de rotação e recuperação no I-06 | L (I-06) | Início do I-06 | [07](../product/marketing-ops/07-security-lgpd.md) §11.2 |
| DP-16b | U | Gerenciador de chaves, responsáveis e periodicidade de rotação | Aberta | P (I-06) | Antes de publicar o I-06 | 07 §11.2 |
| DP-17 | C | Mercado inicial SaaS B2B, domínio agnóstico | Decisão explícita do usuário registrada | — | Concluída | [ATUALIZACOES](../product/marketing-ops/ATUALIZACOES.md) |
| DP-18a | U | Responsável pela validação com clientes | Aberta | M (I-05+) | Recomendado já; até o I-04 | [02 §10](../product/marketing-ops/02-discovery.md#10-pesquisa-e-decisões-novas) |
| DP-18b | U | Calendário e amostra das entrevistas | Aberta | M (I-05+) | Idem | [02 §10](../product/marketing-ops/02-discovery.md#10-pesquisa-e-decisões-novas) |
| DP-18c | U | Orçamento, incentivos e ferramenta de registro com consentimento | Aberta | M (I-05+) | Idem | [02 §10](../product/marketing-ops/02-discovery.md#10-pesquisa-e-decisões-novas) |
| DP-18d | U | Quem aprova mudanças de escopo resultantes | Aberta | M (I-05+) | Idem | [02 §10](../product/marketing-ops/02-discovery.md#10-pesquisa-e-decisões-novas) |
| DP-19a | C | Preparação documental e técnica (requisitos, checklists, adapters com fakes) | Concluída na documentação | — | — | [06 §11.2](../product/marketing-ops/06-integrations.md#112-acessos-metagoogle-dp-19) |
| DP-19b | U | Dados da entidade legal e titular das contas nas plataformas | Aberta | L com contas reais de teste; P/D (I-06) | Ao iniciar a trilha T-B | [06 §11.2](../product/marketing-ops/06-integrations.md#112-acessos-metagoogle-dp-19) |
| DP-19c | U | Criar app na Meta e projeto Google Cloud (ações externas) | Aberta — **não autorizado** | Idem | Idem | [06 §11.2](../product/marketing-ops/06-integrations.md#112-acessos-metagoogle-dp-19) |
| DP-19d | U | Submeter Business Verification (Meta) e verificação de marca (Google) | Aberta — **não autorizado** | P/D (I-06) | Após 19b e 19c | [06 §11.2](../product/marketing-ops/06-integrations.md#112-acessos-metagoogle-dp-19) |
| DP-19e | U | Submeter App Review / pedido de nível de acesso | Aberta — **não autorizado** | P/D (I-06) | Após 19d e demonstração funcional | [06 §11.2](../product/marketing-ops/06-integrations.md#112-acessos-metagoogle-dp-19) |
| DP-20 | U | `ops-cli` com operações delimitadas, autorizadas e auditadas; sem acesso irrestrito ao banco; console na Fase 5 | Coberta pelo escopo do I-01, restrita a provisionar empresa e primeiro Owner | L (I-01) | No aceite do I-01 | [ADR-0008](ADR-0008-autorizacao-rbac-por-vinculo.md), 07 §11.1 |
| DP-21a | C | Correções em README, CLAUDE, ESTADO, DESENVOLVIMENTO e VERIFICACOES | Concluída (arquivos atualizados pelo usuário; ESTADO reconciliado em 11/09/2026) | — | — | [ESTADO](../harness/ESTADO.md) |
| DP-21b | C | Registro de trechos incompatíveis, origem e mudanças propostas das skills | Concluída | — | — | [SKILLS-COMPATIBILIDADE](../harness/SKILLS-COMPATIBILIDADE.md) |
| DP-21c | C | Aplicar a adaptação aos arquivos das skills (nova versão ou cópia adaptada com origem) | Aplicada às duas skills no escopo da correção solicitada | — (uso segue o registro) | Concluída | SKILLS-COMPATIBILIDADE §3 |
| DP-22a | U | Validação jurídica das retenções propostas | Aberta | D | Antes de dados reais | [07](../product/marketing-ops/07-security-lgpd.md) §11.6 |
| DP-22b | U | Documentos LGPD (termos, política, DPA, termo de piloto, RIPD, suboperadores) e encarregado | Aberta | D | Antes de dados reais | 07 §11.5–11.6 |
| DP-23 | U | Suporte somente leitura, empresa explícita, autorização, expiração e auditoria; sem impersonation no MVP | Recomendação — não aprovada | L (quando implementado; fora do I-01), D | Antes de suporte com dados reais | 07 §11.1 |
| DP-24 | U | Uma marca por empresa com limite configurável | Recomendação — não aprovada | L (I-03) | Antes do I-03 | [08 §13](../product/marketing-ops/08-billing-entitlements.md#13-stripe-na-fundação-e-pilotos) |
| DP-25 | U | `referenceScope` fora do catálogo persistido de planos | Coberta pelo escopo do I-01 | L (I-01) | No aceite do I-01 | [08 §13](../product/marketing-ops/08-billing-entitlements.md#13-stripe-na-fundação-e-pilotos) |
| DP-26a | U | Meta interna de 99,5% de disponibilidade mensal (não contratual, não comprovada) | Recomendação — não aprovada | D | Antes dos pilotos | [16](../product/marketing-ops/16-environments-release.md) §12 |
| DP-26b | T | Método de medição, janela e resposta a incidentes | Proposta; medição só após publicação | D | Antes dos pilotos | 16 §12 |
| DP-27a | U | Política: nenhuma PII de leads ou contatos em prompts, ferramentas, dados recuperados, logs, memória ou exemplos | Recomendação — não aprovada | M/L (desenho do I-02), D | Antes do I-02 | 07 §11.3 |
| DP-27b | T | Controles contra reintrodução de PII por agregados e campos livres | Proposta; testes TST-20 e TST-21 | P (I-05, I-07) | I-02/I-05 | 07 §11.3, [15](../product/marketing-ops/15-test-plan.md) §4 |
| DP-28a | — | Desenvolvimento local via Docker + produção incremental no Supabase | **Diretriz vigente** (ADR-0001) | — | — | ADR-0001 |
| DP-28b | U | Reavaliar necessidade de homologação remota | Aberta | D | Antes dos pilotos | 16 §1 |
| DP-28c | C | Testes destrutivos, reset e seeds fora da produção | Diretriz registrada | — | — | 16 §7 |

## Resumo por momento de decisão

| Momento | Itens |
| --- | --- |
| **Decididas** | Em 15/09/2026: DP-01b, DP-02a, DP-02b1, DP-02c, DP-02e e DP-14a. Em 21/09/2026: DP-05a, DP-06a e DP-14b; fornecedor de DP-07a selecionado. DP-02b2 adiada |
| Cobertas pelo escopo do I-01 (§5 da preparação) | DP-03a, DP-13, DP-20, DP-25, DP-33 |
| Reclassificada | DP-01a, para antes do I-03 |
| Após experimentos | DP-02d e DP-03b (EXP-01), DP-04 (EXP-02), DP-05b e DP-06b (EXP-03), DP-07c e DP-07d (EXP-04), DP-09b (EXP-05) |
| Antes do I-02 / fechamento da Fase 1 | DP-01c (I-02), DP-15a, DP-27a |
| Antes de publicar o I-01 | DP-05b, parâmetros restantes de DP-07a e DP-08a |
| Antes de publicar o I-02 | DP-06b e DP-15b |
| Antes de incrementos específicos | DP-24 (I-03), DP-12a/b e DP-18 (I-05), DP-16 e DP-19 (I-06), DP-09d (EXP-05) |
| Antes de dados reais ou pilotos | DP-07b a DP-07d, DP-09a (uso real), DP-09c, DP-22, DP-23, DP-26, DP-28b |
| Concluídas ou registradas | DP-08b, DP-10, DP-11b, DP-19a, DP-17, DP-21a, DP-21b, DP-21c, DP-28a, DP-28c |

## Pendências detalhadas pela reconciliação

| ID | Tipo | Assunto | Status | Bloqueia | Referência |
| --- | --- | --- | --- | --- | --- |
| DP-29 | U | Semântica de medidores, período, fuso, mudança de plano e excedentes | Proposta concreta, não aprovada | Ativação dos medidores/cobrança dependente | 08 §11 |
| DP-30 | U | Quinto check-in e consolidação mensal | Proposta: quinta ocorrência e mensal determinísticos | Ativação da agenda com franquia | 08 §12 |
| DP-31 | U/T | COGS variável, rateio e validação do baseline | Reconstrução documentada; viabilidade e política pendentes | Promessa comercial de custo/limite | 17 §2 |
| DP-32 | T | Limites numéricos de workflows e calibração | Proposta para sandbox/evals, não autoriza gasto | Ativação paga da rota | 13 §15 / EXP-05 |
| DP-33 | U | Catálogo mínimo de papéis e permissões do I-01 | Coberta pelo escopo do I-01: `owner`, `admin`, `marketing_manager` e `viewer`, com permissões extensíveis | L (I-01) | [PREPARACAO-I01](../harness/PREPARACAO-I01.md) §4.4, 07 §3 |
| DP-34 | U/T | Análise de ativos enviados: provedor e modalidade, medidor e franquia, custo por ativo ou por minuto, limites de formato e tamanho, retenção dos derivados | Aberta; criada pela decisão de vídeo de 15/09 | Ativação da capacidade (I-07); D | [ATUALIZACOES](../product/marketing-ops/ATUALIZACOES.md) §4, 06 §9, 08 §7 |
| DP-35 | T | Tokens visuais definitivos: bordas, superfícies elevadas, tons de apoio do roxo, grid, espaçamentos, raios e escala tipográfica | Proposta; os valores fora da paleta fornecida são derivados e precisam de confirmação nos frames | L (telas) | [GUIA-INTERFACE-FIGMA](../product/marketing-ops/GUIA-INTERFACE-FIGMA.md), 14 §12 |

A preparação do I-01 também **propõe** reclassificar DP-01a (recorte Must/Should/Won't do Performance) de "agora" para "antes do I-03", por não condicionar a fundação de identidade e isolamento. A reclassificação só vale se o usuário a aceitar; até lá o registro acima permanece como está.

Aprovação documental não equivale a aprovação comercial das propostas acima. DP-11a não bloqueia integração Stripe em teste no escopo técnico aprovado, mas bloqueia cobrança real sem definição.
