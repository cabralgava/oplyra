# Atualizações documentais — Oplyra

**Referência protegida:** [Documento de Transição v2.2, de 13/09/2026](00-documento-transicao.md).
**Última atualização:** 15/09/2026.
**Escopo:** complemento documental. Registra decisões explícitas posteriores à referência. Não aprova implementação, cobrança ou publicação.

## 1. Precedência

A v2.2 é a referência protegida deste repositório: somente leitura, não editar, renomear, mover ou excluir. As decisões explícitas posteriores do usuário prevalecem nos pontos que atualizam, sem modificar o arquivo protegido.

Versões anteriores da referência e o pacote v2.3 citado em conversas **não estão disponíveis aqui** e não devem ser usados como fonte, nem ter leitura declarada. Documentos derivados que ainda citarem outra versão devem ser corrigidos para a v2.2.

Ordem de precedência: instrução explícita do usuário → este complemento → v2.2 → documentos derivados 01–18 → propostas técnicas (ADRs e registro de decisões).

## 2. Ancoragem das decisões

Citar `DEC-0xx` **somente** quando o identificador corresponder à numeração real da v2.2 §27. Não renumerar, não reaproveitar IDs de outras versões e não atribuir ID por inferência.

| ID na v2.2 | Conteúdo | Situação |
| --- | --- | --- |
| DEC-001 | Plataforma greenfield, sem herança técnica | Vigente |
| DEC-002 | SaaS multi-tenant desde a fundação | Vigente |
| DEC-003 | Pilotos sem dependências, regras globais ou privilégios | Vigente |
| DEC-004 · DEC-005 | Dois planos por escopo; Performance e Growth | Vigente |
| DEC-006 | Entitlements configuráveis | Vigente |
| DEC-007 | Preços e limites numéricos após validação de mercado e custos | Vigente |
| DEC-008 | Marca Oplyra | Vigente |
| DEC-009 | Domínios `oplyra.com.br` / `app.oplyra.com.br` | **Substituída** pela §9 deste complemento |
| DEC-010 · DEC-011 | Slogan e significado do nome | Vigente |
| DEC-012 | Multiagentes desde a fundação, com autonomia, aprovação humana e auditoria | Vigente |
| DEC-013 | Sem CRM próprio no MVP | Vigente |
| DEC-014 | Vídeo não é gerado, editado ou renderizado nativamente; vídeo enviado é ativo de entrada | Vigente; detalhada na §4 |
| DEC-015 | Derivados de vídeo herdam tenant, permissões e retenção; sem reaproveitamento cross-tenant | Vigente |
| DEC-016 | Preparar e, quando integração e autonomia permitirem, publicar campanhas; gasto e publicação exigem aprovação humana ou política explícita | Vigente; o MVP mantém mídia em leitura |
| DEC-017 | Método de campanha orientado por problema, testes por hipótese e ciclo de aprendizado | Vigente; detalhada na §5 |
| DEC-018 | Mercado inicial SaaS B2B, arquitetura agnóstica de segmento | Vigente |

**Decisões posteriores sem ID na referência.** As quatro abaixo foram tomadas depois da v2.2 e **não possuem DEC correspondente**. Citar este complemento; nunca inventar um identificador para elas.

| Decisão | Conteúdo | Onde é detalhada |
| --- | --- | --- |
| Billing | Stripe Billing e Stripe Payments como provedor inicial, por adapter próprio. Não reabrir a seleção. A escolha não define preço nem autoriza cobrar pilotos | [08](08-billing-entitlements.md) |
| Budgets internos | Teto econômico de referência por tenant/mês: Performance US$ 40, Growth US$ 85. Limite para dimensionar capacidade, não preço nem prova de viabilidade | [08](08-billing-entitlements.md) e [17](17-risks-costs.md) |
| Imagens | Geração e edição de imagens integram o MVP, com revisão, aprovação, estados de falha e consumo visível por ação | [12](12-roadmap.md) e [14](14-ux-flows.md) |
| IA multimodelo | Arquitetura multimodelo e multiprovedor com Model Registry, Router/Gateway, Eval Engine e Cost Ledger atrás de contratos internos. Um primeiro adapter não cria exclusividade | [13](13-ai-model-routing-finops.md) |

Modelos, preços unitários e limiares de qualidade continuam dependendo de evidência e de configuração versionada. A fundação especifica e valida esses contratos antes de ativar workflows pagos; o Eval Engine acompanha o primeiro workflow de IA.

## 3. Supabase, Auth e RLS

Supabase PostgreSQL, Auth, Storage e RLS obrigatória permanecem diretrizes locais registradas em [CLAUDE.md](../../../CLAUDE.md) e [ADR-0001](../../decisions/ADR-0001-supabase-local-e-producao-incremental.md). Não substituir RLS por mecanismo alternativo nem reabrir o fornecedor de autenticação.

## 4. Vídeo como ativo de entrada — reconciliação de 15/09/2026

Decisão explícita do usuário, coerente com DEC-014 e DEC-015 e detalhando-as para os documentos derivados:

- A Oplyra **pode receber e analisar vídeos enviados ou selecionados pelo cliente** e produzir transcrições, resumos, copy, hooks, CTAs, roteiros derivados e configuração de campanha, conforme o suporte do provedor de IA adotado.
- A Oplyra **não gera, edita nem renderiza vídeo nativamente** no escopo inicial. Geração ou edição nativa só existiria por integração ou add-on futuro, sem virar dependência do domínio.
- Vídeos, transcrições, frames, embeddings, análises, resumos e derivados **herdam tenant, permissões e retenção do ativo de origem**; nenhum deles pode enriquecer prompt, memória ou conteúdo de outro tenant (DEC-015).
- **Preparar uma campanha não autoriza publicá-la.** A execução continua sujeita ao roadmap, ao nível de autonomia e à aprovação humana ou política explícita (DEC-016). O MVP mantém Meta e Google em leitura.

Documentos reconciliados: 01, 03, 04, 05, 06, 08, 09, 10, 12, 13, 15 e 18. O incremento I-07 em diante passa a considerar a ingestão de ativos; o recorte exato de cada incremento continua em [12](12-roadmap.md).

Pendências criadas por esta decisão, registradas no [registro de decisões](../../decisions/README.md): provedor e modalidade de análise multimodal, medidor e franquia do processamento, custo por minuto ou por ativo, limites de tamanho e formato, e retenção de transcrições e derivados.

## 5. Método de campanha — DEC-017

Incorporado aos requisitos, fluxos, experimentos e responsabilidades dos agentes:

- Toda campanha parte de **situação, dor, consequência, desejo, mecanismo, prova e oferta**, estruturados antes da produção.
- Testes representam **hipóteses explícitas** sobre ângulo, dor, hook, prova, visual, CTA ou outra dimensão relevante; variação cosmética não é experimento.
- Resultados priorizam as **métricas comerciais disponíveis** — lead qualificado, reunião, proposta, contrato e receita — registrando limitações e resultados inconclusivos em vez de forçar conclusão.
- O aprendizado retorna a personas, dores, objeções, mensagem, Brand OS e próximos experimentos, com evidências, revisão, versionamento e isolamento por tenant.
- Ciclo: **Entender → Hipotetizar → Criar → Testar → Medir → Aprender → Iterar**, aplicável ao núcleo Performance e à extensão Growth.

Documentos reconciliados: 01, 02, 03, 09, 10, 11, 14, 15 e 18.

## 6. Limites relatados e baseline: situação da evidência

Valores relatados em conversa, ainda a conferir antes de publicar entitlements. A fonte canônica dos limites é [08](08-billing-entitlements.md); a memória de cálculo é [17](17-risks-costs.md).

| Capacidade mensal, salvo indicação | Performance | Growth |
| --- | ---: | ---: |
| Contas de anúncio conectadas | 2 | 2 |
| Copies aprovadas | 60 | 80 |
| Gerações de imagem | 60 | 80 |
| Edições de imagem | 30 | 40 |
| Adaptações por canal | — | 60 |
| Análises de mídia | 12 | 12 |
| Check-ins | 4 | 4 |
| Planos estratégicos complexos | 4 | 4 |
| Campanhas de e-mail | — | 6 |
| E-mails enviados | — | 25.000 |
| Jornadas Lifecycle | — | 3 |
| Análises Revenue | — | 6 |
| Classificações de leads/feedback | — | 1.000 |
| Decisões assistidas de automação | — | 200 |
| Revisões estratégicas críticas | — | 2 |

Baselines relatados: US$ 32,65 e US$ 73,19 antes da reserva de 15%. São hipóteses agregadas, não custos medidos. A exclusão das taxas Stripe e o tratamento da infraestrutura compartilhada integram a definição econômica final.

Antes de ativar limites, especificar:

1. Medidor comercial por entrega e medidor econômico por tentativa: aprovação não apaga custo de gerações, edições, falhas, retries ou revisões.
2. Identidade idempotente da ação, versão da entrega e regra para reaprovações. Diferenciar edição visual de adaptação por canal e explicitar quando uma ação composta consome cada franquia.
3. Período de consumo, fuso, reinício, mudança de plano e política no limite. Não inferir que mês civil e ciclo de cobrança coincidem.
4. Compatibilização de quatro check-ins com frequência semanal em meses de cinco ocorrências.
5. Memória de cálculo versionada: volumes, tokens/renders, modelos, tarifas e data, cache, tentativas, falhas, reserva, custos variáveis e infraestrutura compartilhada, com rateio explícito e sem dupla contagem.
6. Limites numéricos por workflow: tempo, tentativas, turnos, delegações e custo. Falta de configuração impede ativação paga.

O processamento de vídeo acrescenta um custo variável próprio, ainda não dimensionado, que deve entrar nesses mesmos itens antes de qualquer promessa comercial.

## 7. Disponibilidade documental

Verificado neste repositório em 15/09/2026:

| Conjunto | Situação |
| --- | --- |
| 00 | Presente, protegido, v2.2 |
| 01–18 | **Presentes**; ver [índice](README.md) |
| ADRs 0001–0008 e registro de decisões | Presentes em [docs/decisions](../../decisions/README.md) |
| Skills | As quatro presentes em `.claude/skills/`; compatibilidade em [SKILLS-COMPATIBILIDADE](../../harness/SKILLS-COMPATIBILIDADE.md) |
| Protótipos | Presentes em [prototypes/](prototypes/) |
| Marca e interface | [Manual de marca](../../brand/oplyra_brand_system.md) e [guia de interface](GUIA-INTERFACE-FIGMA.md) |

Existência de arquivo não é o mesmo que aplicação de skill nem que verificação executada; ver [ESTADO](../../harness/ESTADO.md).

## 8. Referência visual — 15/09/2026

O [Guia de interface Figma](GUIA-INTERFACE-FIGMA.md) é a **referência visual vigente**: tema escuro, roxo primário `#5B3DF5`, Manrope para títulos e Inter para produto, base de comparação em 1440 px. O [manual de marca](../../brand/oplyra_brand_system.md) é a fonte da identidade; guia e manual concordam nas cores e famílias tipográficas.

Não manter duas referências visuais concorrentes: o protótipo conceitual em tema claro passa a ser **histórico**, preservado em `prototypes/performance-mvp-legacy-claro.html`, e seus fluxos válidos foram reaproveitados na versão realinhada ao guia. Detalhes de tipografia, espaçamento e composição continuam pendentes de inspeção dos frames; ver [14 §12](14-ux-flows.md).

**Frames efetivamente inspecionados até esta data: nenhum.** A abertura do arquivo Figma falhou nas sessões anteriores; projeto `i0et0FwrIIYJPodGglQiiC`, nodes `4:9`, `4:268` e `4:492` permanecem por conferir. Os valores do guia vieram do material fornecido pelo usuário, não de extração.

## 9. Domínios oficiais — 15/09/2026

| Finalidade | Endereço |
| --- | --- |
| Landing page e site institucional | `https://oplyra.io` |
| Aplicativo Oplyra | `https://app.oplyra.io` |

Substitui `oplyra.com.br` e `app.oplyra.com.br` (DEC-009) para novas especificações e configurações. As menções antigas na referência protegida permanecem como registro histórico e não prevalecem. Não se presume propriedade, registro ou redirecionamento dos domínios anteriores.

Na implementação, usar configuração por ambiente para URLs públicas, links do site para o app, autenticação, recuperação de senha, URLs de retorno e origens permitidas. Desenvolvimento local continua com endereços locais; não apontar testes para produção por causa desta definição. O registro é documental: não comprova DNS, TLS, hospedagem ou publicação.
