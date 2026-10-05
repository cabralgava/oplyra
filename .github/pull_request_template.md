## Resumo

<!-- Assunto do squash commit: Conventional Commit, até 72 caracteres. -->

## Proveniência

- Missão / incremento / CR: <!-- ex.: ms-001, cr-033 -->
- Branch: <!-- agent/<tipo>/<ref>-<slug> -->
- SHA da base:
- Hash (SHA-256) do registro de autorização (da missão ou da autorização contínua): <!-- impresso pelo wrapper/runner -->
- Modo de permissão e versões das ferramentas:
- Autor: <!-- proprietário | identidade do App (entrega delegada) -->

## Evidências

- Comandos exatos, resultados e SHA testado:
- O que **não** foi verificado:
- CI (`validate` e `risk-gate`) verde no SHA da cabeça: <!-- sim/não; evidência anterior a uma mudança de SHA não vale -->

## Escopo e limites

- [ ] Nenhum arquivo fora dos caminhos permitidos da missão/registro
- [ ] Control plane, CI, banco/RLS, dependências, contratos e harness alterados apenas em sessão de manutenção do proprietário (risco elevado: exige a revisão do dono do código)
- [ ] Sem segredos, credenciais, produção ou migração remota
- [ ] Nenhum teste removido ou enfraquecido

## Integração

Política de 04/10/2026 ([AUTONOMOUS-BUILD](../docs/harness/AUTONOMOUS-BUILD.md)): mudança **rotineira** é integrada por squash pelo runner quando todos os gates passam no SHA atual (CI `validate` e `risk-gate` verdes, sem conflito, sem `hold` nem `changes requested`). Mudança de **risco elevado** não é integrada automaticamente e aguarda o dono do código. O rótulo `hold` e um pedido de alterações interrompem a integração automática.

Revisão por IA é **consultiva**: não é revisão humana independente e não substitui a revisão exigida de risco elevado (HB-13 segue não atendido).
