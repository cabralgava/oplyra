# CR-054 — Mídia paga via API e presença empresarial: incorporação documental

**Status:** `approved` — somente o escopo documental e a prioridade explicitados abaixo.
**Classificação:** `product_scope_documentation_and_implementation_sequence`.
**Data:** 2026-11-16. **Aprovado por:** proprietário, neste chat: “Pode incluir essas funcionalidades na documentação do projeto e organizar a ordem de implementação, começando por Google Ads e Meta Ads via API.”

## 1. Escopo aprovado

Incorporar Google Ads, Meta Ads e ChatGPT Ads via API, Perfil da Empresa no Google e Businesses in ChatGPT/Business Hub à direção funcional da Oplyra. Priorizar Google Ads e Meta Ads; registrar etapas, dependências, critérios de aceite e migração do marco de leitura para escrita governada.

O [plano canônico](../../integrations/PAID-MEDIA-AND-BUSINESS-PRESENCE-PLAN.md) detalha a sequência: fronteira comum → Google Search (recorte técnico proposto) → Meta → ChatGPT Ads → perfis elegíveis/assistidos. Os dois primeiros canais são a prioridade aprovada; formatos/objetivos adicionais, desenho de integração, owner dos perfis e sua alocação comercial permanecem propostos/pendentes.

## 2. Impacto de compatibilidade

- DEC-016 já prevê execução controlada; não se redefine autonomia nem autorização. I-06/TST-17 ficam como marco de leitura, com marco posterior de escrita condicionado aos contratos/controles.
- Contratos existentes de Paid Media possuem actions de preparação/publicação/pausa/retomada/budget, mas schemas de domínio continuam pendentes. A documentação não cria tool de ChatGPT Ads/perfis nem actions/events/errors/handoffs ou IDs de schema.
- APIs externas não concedem capability à conta nem substituem tenant, permission, entitlement, approval/policy, orçamento, consentimento, direitos, idempotência e auditoria.
- A aprovação não cobre release, alteração dos registries/schemas/fixtures frozen, runtime, migrations, contas/credenciais, chamadas reais, publicação ou gastos. Deltas estruturais futuros exigem CR e versionamento próprios.
- O modelo de planos/franquias de 08 não é alterado; perfis locais são opcionais e dependem de elegibilidade. Não antecipar Growth.

## 3. Artefatos desta incorporação

Modificados: `ATUALIZACOES.md`, `01-product-requirements.md`, `06-integrations.md`, `12-roadmap.md`, `15-test-plan.md` e `README.md` do produto; checkpoint factual em `docs/harness/ESTADO.md`. Adicionados: este CR e o plano em `integrations/`.

O inventário de preparação `test/contracts/release-2.23-transition.json` é atualizado estritamente com hashes dos documentos alterados e classificação dos dois novos arquivos. Não há edição de lógica de teste/validator, remoção de checks ou modificação de manifest/receita congelados. Esta atualização **não emite nem reserva release** e não fecha a composição da 2.23.

## 4. Validação e migração

Executar links locais, diff e integridade dos arquivos preservados, validator corrente e testes de contrato de preparação/conteúdo corrente. Registrar resultados reais no checkpoint. Testes de adapter/API, sandbox, banco e runtime não foram implementados por este CR; critérios estão no plano e no adendo de 15.

Migração futura por fornecedor: contratos versionados e acesso → leitura → preparação local → criação pausada autorizada → ativação aprovada → rollout por capability/tenant. A autorização de criação pausada não é autorização irrestrita de veiculação. Falha parcial/efeito incerto exige reconciliação; histórico e caminhos de leitura permanecem preservados.
