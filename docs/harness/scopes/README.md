# Escopos estruturais aprovados

**Classe elevada** (está em `docs/harness/`, dono do código). Cada arquivo `<scopeRef>.json` descreve UM incremento cuja implementação estrutural o proprietário aprovou uma vez (INTEGRACAO-PR11-E-PERFIS §4). Hoje **não há nenhum escopo aprovado**: este diretório só define o formato e o lugar.

## Regras

- Nome: `docs/harness/scopes/<scopeRef>.json`, `scopeRef` no padrão `sc-<palavras>` (ex.: `sc-i05b-s6b`).
- Conteúdo: esquema fechado `oplyra-structural-scope/1`, validado por `validateStructuralScope` (`scripts/claude-structural.mjs`): `id` igual ao `scopeRef`, `approvedDocument` (`path` + `sha256` do documento aprovado), `packageExports` (só adição exata de `exports` em `packages/{core,infra,testing}/package.json`), `migrations` (arquivo, tabelas com `tenantOwned`/`forceRls`, políticas, concessões só a `authenticated`, índices, funções e se podem ser `SECURITY DEFINER`), `tests` (pgTAP novos).
- **Origem única:** o `structural-gate` (CI e runner) lê o escopo e o documento aprovado SOMENTE do commit base confiável (`git show <base>:docs/harness/scopes/<ref>.json`). A versão do PR nunca é lida.
- **Autoaprovação impossível:** um PR que altera qualquer arquivo deste diretório, o documento aprovado ou os módulos do controle (`scripts/claude-structural.mjs`, `claude-risk.mjs`, `claude-local-first-guard.mjs`, `claude-delivery-record.mjs`) é `elevated` e vai ao proprietário.
- **Duplo vínculo:** a autorização contínua (v2, fora do repositório) lista `structural.scopes[]` com o mesmo `scopeRef` e o `sha256` do documento aprovado; a missão declara `scopeRef`. Sem os três (missão, autorização, escopo em main) não há missão estrutural.
- O PR estrutural seleciona o escopo com a linha `Structural-Scope: <scopeRef>` no corpo; isso só seleciona, não define conteúdo.

## Fora do alcance de qualquer escopo

Billing, webhooks do Stripe, entitlements e preços (código em `apps/`/`packages/` cujo caminho indique billing/stripe/entitlement/pricing/subscription/webhook) continuam **elevados e sem integração autônoma** até haver política específica aprovada; nenhum escopo estrutural os cobre. Catálogos de tradução são elevados enquanto o formato não for definido pela frente de idiomas. Stripe, inclusive em modo de teste, é acesso externo: nenhuma classe o autoriza; adapters simulados por padrão.
