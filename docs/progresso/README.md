# Progresso operacional das missões

Este diretório guarda **checkpoints e resultados operacionais** de cada missão do executor contínuo. Ele existe para que uma missão rotineira registre o seu resultado **sem tocar** em documentos que definem política (`docs/harness/`, `ESTADO.md`, `CLAUDE.md`, `AGENTS.md`, `docs/decisions/`), que continuam sob o dono do código.

## Regras

- **Um arquivo por missão**: `docs/progresso/<ms-NNN>.md`. Nunca editar o arquivo de outra missão; assim não há conflito entre PRs. O registro derivado da missão inclui só esse arquivo (e o wrapper recusa o de outra referência).
- Sessões de manutenção do proprietário (fora do runner) registram-se em arquivo próprio, `docs/progresso/pr-<n>-manutencao-<data>.md`.
- O arquivo é **somente de fatos observados**: missão, branch, SHAs reais (PR, merge, CI da `main`), comandos de verificação e o resultado realmente obtido, limites e orçamentos consumidos, pendências e próximo passo. Não contém decisão de política, autorização, nem alegação de conformidade.
- Distinguir sempre: **implementado**, **integrado**, **autorizado**, **ativado** e **ensaiado**. Um PR aberto não é integrado; um merge não é deploy.
- Sem segredos, tokens, caminhos privados do usuário nem dados de clientes.
- `docs/harness/ESTADO.md` é o resumo **consolidado e de política**, atualizado pelo proprietário (ou por entrega elevada revisada) a partir destes arquivos; uma missão rotineira não o atualiza.

## Classe de risco

`docs/progresso/` é classe **rotineira** no classificador atual (`claude-risk.mjs`): não está entre as regras elevadas e pode constar do escopo da autorização contínua. Isso foi verificado por `test/developer-harness.perfil-de-produto.test.ts`.

## Modelo de arquivo

```markdown
# ms-NNN — título

- Estado: implementado | integrado | autorizado | ativado | ensaiado (marcar só o que foi comprovado)
- Branch / PR / SHA do merge / CI da main:
- Verificação executada (comando e resultado real):
- Limites e orçamentos consumidos:
- Pendências e próximo passo:
```
