# CR-041 — Revisão de desenvolvimento com um único responsável

**Status da decisão:** `approved` — proprietário, 03/11/2026.
**Status da implementação:** proposta revisável; integração e ativação dependem das evidências e gates reais.
**Escopo:** Developer Harness; não altera contratos ou autonomia dos agentes do produto.
**Base observada:** `main` em `433e183791062ca8d8e614331547463f54504733`.
**Referência normativa:** [política operacional](../../../../harness/POLITICA-REVISAO-RESPONSAVEL-UNICO.md).

## Decisão e proveniência

O proprietário informou que trabalha sozinho e pediu: “esta pedidno review de outro usuário, preciso retirar isso”. Após a alteração administrativa e a identificação da incompatibilidade do harness, respondeu “sim” à retomada que incluía adequar a automação. A autorização é a instrução explícita no chat; não é uma revisão independente nem uma credencial emitida pelo agente.

A regra `main-protection` 24384328 passou de 1 para 0 aprovações. Esta entrega faz o código corrente reconhecer essa configuração sem exigir indiretamente outra pessoa por CODEOWNERS. Não executa uma nova alteração de ruleset.

## Mudança e compatibilidade

- `scripts/claude-git.mjs`: aceita contagens inteiras seguras não negativas; preserva leitura efetiva do GitHub, tipos de regra, descarte de revisão e validate estrito.
- `scripts/claude-gates.mjs`: classifica 0 aprovações como capacidade de rotina quando as demais proteções estão presentes. Contagens positivas continuam exigindo as aprovações reais configuradas.
- `scripts/claude-admin.mjs`: o plano administrativo não reintroduz revisão de CODEOWNER. Continua sendo somente plano até a execução administrativa explicitamente autorizada.
- Testes correntes cobrem 0, valores inválidos, contagens positivas, regras ausentes, CI insuficiente, autorização desabilitada e as barreiras de mutação.
- A classificação de risco, o hold de caminhos elevados, o veto por `CHANGES_REQUESTED`, a evidência por SHA, os limites e o kill switch permanecem ativos.

A decisão sucede o mínimo humano das políticas de 04/10/2026 somente neste ponto. Não reescreve CR-033 histórico, manifests, snapshots ou Freeze. Não há mudança em registry/schema; não cria action/event/error/tool do produto. As identidades e o formato dos resultados existentes são preservados.

## Migração e rollback

Atualizar o código por PR próprio e CI do SHA atual. Não emitir registro externo de autorização, concessão, chave ou ativação nesta entrega. Um runner persistente continua pendente de ensaio e autorização operacional válidos. Reverter esta implementação exige um commit de reversão; restaurar a exigência de 1 aprovação é decisão administrativa separada e não ocorre automaticamente.

## Aceite

Contagem 0 sem revisão de CODEOWNER permite verificar e executar uma missão rotineira sintética autorizada; contagens negativas/malformadas, ausência de proteção, CI falho ou de outro SHA e ausência de autorização continuam impedindo a operação. O suite completo do harness e os testes correntes do runner devem passar. Aprovação documental não comprova ativação de serviço ou entrega autônoma real.
