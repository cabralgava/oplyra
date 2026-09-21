# ADR-0009 — Destinos selecionados: Netlify, Supabase, Railway e GitHub

**Status:** parcialmente aprovada; parâmetros de produção condicionados ao EXP-03  
**Data:** 21/09/2026  
**Substitui:** ADR-0005 para seleção de provedores (a ADR-0005 permanece como histórico)

## Contexto

O responsável pelo projeto confirmou o uso do Netlify, selecionou Supabase para o backend gerenciado, Railway para o worker contínuo e autorizou o repositório privado `cabralgava/oplyra` no GitHub. A seleção reduz mudança operacional porque Netlify e Railway já fazem parte da experiência atual do responsável.

Selecionar o provedor não aprova contratação de plano, região, criação de projeto, deploy, dados reais ou ativação do runtime.

## Decisão

| Componente | Decisão aprovada | Condições ainda abertas |
| --- | --- | --- |
| Web, Next.js e BFF | Netlify | Região das Functions, plano, custo e latência até o Supabase; EXP-03 E3-01 |
| PostgreSQL, Auth e Storage | Supabase | `sa-east-1`, plano, backup/PITR, orçamento e EXP-03/04 |
| Worker Node.js contínuo | Railway | Região; US East/Virgínia é apenas candidata; rede, custo ocioso e EXP-03 E3-02/E3-03 |
| Código e CI | GitHub privado + GitHub Actions | Repositório criado e CI local-equivalente configurado; deploy de produção continua desautorizado |

Netlify Functions ficam restritas à execução server-side da web. Elas não substituem o worker, o scheduler ou a fila. O worker no Railway será stateless; estado, leases, deduplicação e jobs permanecem no Supabase.

## Região e rede

Não existe equivalência regional presumida entre os três provedores. A região padrão de Functions do Netlify e a ausência atual de uma região Railway na América do Sul tornam o EXP-03 obrigatório antes de produção. Nenhum limite de latência é declarado atendido sem medição.

Referências verificadas na decisão:

- Netlify Functions — configuração, regiões e limites: https://docs.netlify.com/build/functions/configuration/
- Railway — regiões disponíveis: https://docs.railway.com/deployments/regions
- Railway — health checks e restart policy: https://docs.railway.com/deployments/healthchecks/ e https://docs.railway.com/deployments/restart-policy/
- Supabase — deployment e ambientes: https://supabase.com/docs/guides/deployment

Preços, disponibilidade futura, residência efetiva e recursos do plano contratado devem ser revalidados antes do provisionamento.

## Staging

DP-28b não foi resolvida por esta decisão. Durante a implementação inicial, o fluxo é local + CI + preview efêmero. A necessidade de staging remoto permanente deve ser decidida antes dos pilotos e continua sendo gate da ativação conforme DEC-RUNTIME-007.

## Consequências

- DP-05a: decidida por Netlify.
- DP-05b: redefinida para região/configuração do Netlify e latência até o Supabase; pendente EXP-03.
- DP-06a: decidida por Railway.
- DP-06b: rede, região, custo ocioso, credenciais e observabilidade do Railway; pendente EXP-03.
- DP-07a: Supabase selecionado; região e plano permanecem pendentes.
- DP-14b: decidida; GitHub privado e GitHub Actions autorizados.
- DP-28b: permanece pendente.

## Limites de autorização

Esta ADR autoriza documentação, CI e preparação local. Não autoriza criar Netlify, Supabase ou Railway de produção, contratar planos, configurar DNS/segredos, publicar software, aceitar dados reais ou ativar jobs.
