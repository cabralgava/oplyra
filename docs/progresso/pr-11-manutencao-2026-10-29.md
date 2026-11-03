# PR #11 — sessão de manutenção de 29/10/2026 (control plane do harness)

Registro de fatos observados. Não é missão do runner (não há `ms-NNN`); é a entrega elevada do proprietário descrita em `docs/harness/INTEGRACAO-PR11-E-PERFIS.md` §7 passo 2.

- **Estado:** implementado no working tree da branch `agent/docs/20261004-continuous-development` (PR #11), **sem commit, push ou merge**. Não integrado, não autorizado, não ativado, não ensaiado.
- **Branch / PR / SHA:** cabeça remota auditada anteriormente `6d0dfe4`; nada novo foi enviado. CI remoto desta versão: **não executado**.
- **Nada foi feito em:** rulesets, CODEOWNERS remoto, autorização persistente (`~/.oplyra`), serviço do SO, deploy, Supabase remoto, Stripe, dados reais.

## Verificação executada (working tree local, macOS, Node 22)

| Comando | Resultado real |
| --- | --- |
| `pnpm test` (suíte inteira, execução final) | **1060 de 1064**. 4 falhas, nenhuma no código alterado: 3 causadas pelo arquivo antigo `test/perfil-de-produto.paths.test.ts` (2 nele mesmo, com as expectativas antigas de `e2e/`, e 1 em `developer-harness.arquitetura`, regra CR-031) e `cr-033-current-content` (documentos da frente de idiomas/billing modificados no working tree, falha já conhecida) |
| `pnpm typecheck` | sem erros |
| `pnpm test:harness` | **152 de 152** (depois de incluir `claude-structural.mjs` na cópia de mutação de `scripts/claude-delivery.test.mjs`) |
| 8 arquivos de cenário (`developer-harness.{structural-exports,structural-migration,progress-checkpoint,trusted-gate,billing-i18n,structural-cli,standing-v2,perfil-de-produto}`) | **71 de 71**: 56 mutações verificadas; 55 detectadas e 1 sobrevivente por defesa redundante explicada (M8g.6: o resultado de outro SHA continua descartado por uma segunda comparação); em 6 das detectadas uma redundância também mantém a proteção (M2.1a, M2.2a, M3.1a, M3.1b, M4.2a, M4.3), documentado no próprio teste |
| `pnpm test:db`, `pnpm test:e2e`, `pnpm build` | **não executados** nesta sessão |

## Limitações conhecidas

- A análise de migrations e de `package.json` prova o **classificador**; isolamento real entre tenants exige pgTAP no banco local (não executado).
- O job `structural-gate` e o novo encadeamento do `risk-gate` foram verificados **estaticamente** (texto do workflow); não rodaram no GitHub Actions.
- A decisão `merge` nos testes é **simulada**; não comprova integração no GitHub nem proteção do ruleset/CODEOWNERS.
- `fetch` do head do PR no runner (`defaultStructuralGate`) não foi exercitado contra um remoto; a lógica de vínculo ao SHA foi testada com porta simulada.
- Detecção de "locale define moeda/preço/plano" é **heurística** (atribuição, ternário, mapa e `case`); formas indiretas podem escapar. Defesa em profundidade, não prova.
- Catálogos de tradução: o formato não está definido pela frente de idiomas; todo candidato (`locales/`, `messages/`, `i18n/`, `translations/`, `lang/` em `apps/`/`packages/`) fica **elevado** até o padrão ser aprovado.
- O `risk-gate` continua executando o script do checkout do PR (comportamento anterior); mudanças nele são control plane com dono no CODEOWNERS.

## Pendências e próximo passo

1. Remover `test/perfil-de-produto.paths.test.ts` (o substituto `test/developer-harness.perfil-de-produto.test.ts` já existe): o guard desta sessão não permite apagar arquivos. Comando: `rm test/perfil-de-produto.paths.test.ts`.
2. Revisão independente e decisões D-E0 a D-E4 (§6 do documento de integração), incluindo D-E1 (CODEOWNERS) conforme a proposta em §12.
3. Ativação (§13): só depois do merge da PR #11 e com o proprietário.
