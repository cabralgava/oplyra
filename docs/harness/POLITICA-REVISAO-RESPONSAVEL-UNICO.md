# Política de revisão — responsável único

**Decisão aprovada em 03/11/2026.** O proprietário trabalha sozinho e retirou a exigência de revisão de outro usuário. Implementação governada pelo [CR-041](../product/marketing-ops/contracts/changes/CR-041-single-owner-review-policy.md).

## Estado administrativo confirmado

`main-protection` (24384328), ativo: PR obrigatório; 0 aprovações numéricas; sem revisão de CODEOWNER ou aprovação do último push obrigatórias; squash; histórico linear; bloqueios de force push e exclusão; `validate` da integração 15368 obrigatório, estrito, com branch atualizada; descarte de aprovações antigas; bypass vazio. A mudança de 1 para 0 foi gravada e relida em 03/11/2026. As demais propriedades foram preservadas.

## Precedência

Esta decisão substitui o mínimo humano e a exigência indireta de outro usuário por CODEOWNERS para o fluxo corrente do Developer Harness. Os diagnósticos e decisões anteriores permanecem históricos. CODEOWNERS continua declarando responsáveis; cobertura não equivale a revisão humana, e revisão por IA continua identificada como IA.

## Barreiras preservadas

O runner continua exigindo `validate` e `risk-gate` aprovados no head atual; missões estruturais também dependem de `structural-gate`, escopo aprovado e sua exigência administrativa específica. CI pendente, ausente, falho ou de outro SHA impede integrar. Contagens positivas configuradas no GitHub continuam valendo. Rótulo `hold`, pedidos de alteração e `mergeable_state=blocked` continuam impedindo integração.

Mudanças elevadas continuam passando pelo tratamento separado do proprietário, salvo escopo estrutural já aprovado e validado pelo controle da base confiável. Registros externos, budgets, expiração, revogação, idempotência, Local First e isolamento de tenants não são alterados. O worker não pode emitir sua própria autorização.

## Limite da entrega

Nenhuma flag de ativação foi habilitada, concessão emitida, credencial lida ou serviço persistente instalado. A política compatível com responsável único não comprova que a automação foi ativada. Deploy, produção, cobranças e alterações de contratos frozen continuam sujeitos aos respectivos gates.
