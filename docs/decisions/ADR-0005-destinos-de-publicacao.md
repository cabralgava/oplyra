# ADR-0005 — Destinos: Supabase `sa-east-1`, Vercel `gru1` e Cloud Run worker pools

**Status:** proposta **condicionada ao EXP-03** — não aprovada (DP-05a/b, DP-06a/b, DP-07a). **Nenhum serviço contratado.**

## Contexto e problema

Publicar migrations no Supabase não publica a web, o worker nem configurações não transportáveis. Os destinos devem:

- ficar próximos do banco;
- manter dados principais no Brasil;
- permitir rollback;
- ter custo e operação proporcionais aos pilotos.

O worker é um processo **de longa duração** que consome filas e mantém lease, o que muda o perfil de custo ocioso.

## Alegações e fontes herdadas do discovery anterior

Os links abaixo são fontes registradas anteriormente; preços, disponibilidade e residência não foram revalidados nesta reconciliação. Confirmar antes da decisão dependente.

| Alegação histórica a revalidar | Fonte |
| --- | --- |
| Vercel Pro: US$ 20/mês por assento, com crédito de uso de US$ 20; Active CPU "a partir de" US$ 0,128/h, memória provisionada "a partir de" US$ 0,0106/GB-h, invocações "a partir de" US$ 0,60/milhão (tarifas variam por região) | [Vercel pricing](https://vercel.com/pricing) |
| Vercel: região padrão das funções é **`iad1` (Washington)** para novos projetos; Pro permite até 5 regiões; `gru1` disponível com tabela própria (ex.: transferência de dados "First 1 TB, then $0.22 per 1 GB") | [Vercel regions](https://vercel.com/docs/functions/configuring-functions/region), [gru1 pricing](https://vercel.com/docs/pricing/regional-pricing/gru1) |
| Cloud Run worker pools: GA; **sem autoscaling** (número de instâncias definido manualmente); `southamerica-east1` disponível e classificada como **Tier 2** (mais cara que Tier 1); cobrança por instância. **A tabela de preços oficial não pôde ser extraída nesta verificação** | [Deploy worker pools](https://docs.cloud.google.com/run/docs/deploy-worker-pools), [Cloud Run pricing](https://cloud.google.com/run/pricing) |
| Cloud Run, cobrança por instância: toda a vida da instância é cobrada, com mínimo de 1 minuto. **Não presumir custo zero com o worker ocioso** | [Cloud Run pricing](https://cloud.google.com/run/pricing) (trecho retornado em busca) |
| Supabase: conexão direta é IPv6 por padrão; add-on IPv4 a US$ 4/mês; pooler compartilhado é IPv4 (modo sessão 5432, modo transação 6543) | [Connecting](https://supabase.com/docs/guides/database/connecting-to-postgres), [IPv4](https://supabase.com/docs/guides/platform/manage-your-usage/ipv4) |
| Supabase Pro: US$ 25/mês com US$ 10 de crédito de computação; Small US$ 15, Medium US$ 60; backups diários por 7 dias; PITR US$ 100/mês por 7 dias de retenção, exige computação Small ou maior | [Supabase pricing](https://supabase.com/pricing), [Backups](https://supabase.com/docs/guides/platform/backups) |

## Comparação da combinação proposta

| Critério | Vercel (web) + Cloud Run worker pools (worker) + Supabase | Observações e riscos |
| --- | --- | --- |
| **Custo inicial** | Vercel Pro por assento + uso acima do crédito; Supabase Pro + computação (+ PITR antes de dados reais); worker com 1 instância sempre ativa em Tier 2 | Estimativa em [17](../product/marketing-ops/17-risks-costs.md) §3; worker **não cotado** oficialmente |
| **Custo ocioso** | Web: baixo (cobrança por uso). Worker: **custo contínuo**, pois a instância existe mesmo sem jobs (instance-based, sem autoscaling). Supabase: fixo pelo plano e computação | Reduzir instâncias a zero fora de horário não é viável com scheduler e lease ativos; aceitar custo fixo ou revisar |
| **Operação** | Três painéis (Vercel, Google Cloud, Supabase); deploy da web por git; worker por imagem e revisão; escala manual do worker | Escala manual é adequada à carga previsível do MVP; picos (check-ins de segunda) resolvidos por concorrência e fila |
| **Credenciais** | Segredos em três lugares (Vercel, Secret Manager do Google Cloud, Supabase) + CI. Deploy no Google Cloud via federação de identidade do CI (sem chave de longa duração), **a confirmar** | Mais superfície de segredos; exige inventário e rotação documentados ([07](../product/marketing-ops/07-security-lgpd.md) §11.2) |
| **Rede** | Web `gru1` → Supabase `sa-east-1` pelo pooler (IPv4); worker `southamerica-east1` → Supabase por IPv6 direto (a comprovar), add-on IPv4 ou pooler em modo sessão | Latência entre provedores na mesma metrópole **não medida**; EXP-03 E3-01/E3-02 |
| **Observabilidade** | Logs da web na Vercel; logs do worker no Cloud Logging; banco no Supabase (logs por 7 dias no Pro). Correlação só com instrumentação OpenTelemetry comum e destino único (DP-15) | Sem destino único, a investigação exige três consoles |

## Alternativas consideradas

| Alternativa | Vantagens | Desvantagens | Situação |
| --- | --- | --- | --- |
| Worker em Fly.io (`gru`) | Operação simples; máquinas pequenas | Preço e disponibilidade na região **não verificados** nesta revisão; capacidade de `gru` citada como disputada | Alternativa do EXP-03 |
| Worker em AWS ECS Fargate (`sa-east-1`) | Mesma região AWS do Supabase (latência provável menor) | Mais operação (rede, IAM, balanceamento) | Alternativa do EXP-03 |
| Web e worker no Google Cloud (Cloud Run services + worker pools) | Menos fornecedores e segredos | Perde a integração nativa Next.js/rollback da Vercel; mais configuração de CDN | Avaliar se a operação de três fornecedores pesar |
| Supabase Edge Functions como worker | Um fornecedor a menos | Limite de 400 s (FX-01) | Rejeitada para o worker principal |

## Decisão proposta

1. **Supabase de produção** em `sa-east-1`, plano Pro, computação dimensionada pelo EXP-02 e decisão sobre PITR antes de dados reais (DP-07).
2. **Web na Vercel** com `gru1` **configurado explicitamente**, sem manter o padrão `iad1`, e previews desligados de produção (DP-05).
3. **Worker em Cloud Run worker pools** (`southamerica-east1`), 1 instância do menor tamanho adequado, imagem portável (DP-06).

**Justificativa:**

- serviço gerenciado em São Paulo;
- modelo de pull adequado a consumidores de fila;
- revisões com rollback;
- custo ocioso previsível e aceito como custo fixo;
- carga do MVP previsível, sem necessidade de autoscaling.

**Condição:** EXP-03 aprovado (latência, rede IPv6/IPv4, custo ocioso real em 7 dias, rollback, credenciais sem chave de longa duração, observabilidade correlacionada). Se reprovar, repetir com as alternativas.

## Escopo afetado

Publicação de todos os incrementos.

## Evidências e referências

Fatos acima; FX-04 a FX-06, FX-11, FX-12, FX-14 e FX-15 em [02-discovery](../product/marketing-ops/02-discovery.md) §9; [16-environments-release](../product/marketing-ops/16-environments-release.md).

## Responsável pela decisão

Responsável pelo projeto (pendente).

## Aprovação

Pendente. Contratação e criação de contas exigem autorização específica.

## Substitui / é substituída por

—
