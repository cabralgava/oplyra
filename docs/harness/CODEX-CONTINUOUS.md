# Desenvolvimento contínuo com Codex — 05/10/2026

O executor padrão do runner é `scripts/codex-agent.mjs`. Ele inicia diretamente o Codex CLI **0.160.0** instalado no aplicativo macOS, com perfil de filesystem por missão, rede de comandos desligada, aprovações `never`, configuração estrita, saída estruturada e sessão efêmera. Uma mudança de versão interrompe a execução até nova verificação. As instruções AGENTS/CLAUDE e as skills continuam fontes explícitas; o launcher e os MCPs do Claude não são pré-requisitos.

O supervisor mantém os registros externos e opera os wrappers existentes, sem entregar a chave do GitHub App ao modelo. O resultado do modelo não comprova sucesso: os wrappers verificam escopo, segredos, autorização, orçamentos e proteção; o runner lê PR, arquivos, reviews e checks reais, verifica o SHA antes do squash e confirma a integração e o CI de main. Os relatos de checks locais pelo modelo são relatos; o CI é a confirmação independente do resultado técnico.

## Estado verificável

| Item | Arquivo/configuração | Evidência | Status |
| --- | --- | --- | --- |
| Codex e sandbox | `scripts/codex-agent.mjs`; permissões efetivas da sessão | CLI 0.160.0 real executou sondas sintéticas em repositórios temporários: escrita autorizada permitida, tentativa de escrita em package.json negada, leitura de .env sintético negada e JSON retornado. A sonda adversarial registrou 8 ocorrências de negação e não observou o marcador sintético protegido. Perfil nega segredos e conserva controles existentes em leitura; testes de portas cobrem invocação, symlink e encerramento do grupo | Implementado; ensaio local real; testes simulados adicionais |
| Skills | `AGENTS.md`, `.agents/skills/`, `.claude/skills/` | DDD, arquitetura e qualidade lidas explicitamente; cópias locais preservadas. Não há prova de equivalência de hooks ou MCPs | Implementado como instruções; MCPs não equivalentes |
| Implementar → PR → CI → merge → próxima missão | `scripts/claude-runner.mjs`, `codex-agent.mjs`, `claude-git.mjs`, `claude-integrate.mjs` | Duas missões e integrações testadas com Git e wrappers reais, modelo e GitHub simulados. Runner padrão usa Codex nativo | Implementado e testado em simulação; ponta a ponta remoto pendente |
| Autorização, limites e retomada | `claude-standing.mjs`; registro externo `~/.oplyra/standing/authorization.json` | Validação de escopo/risco, vínculo por hash, revogação antes de efeitos, contadores e relógio persistidos; registro real ausente na auditoria | Implementado e testado; emissão real pendente |
| Política GitHub | ruleset main 24384328; `claude-gates.mjs`, `claude-git.mjs` | Leitura real: 1 aprovação, validate estrito, descarte de revisão após push, sem bypass. O fluxo implementa e aguarda revisão válida no SHA atual. Contagem efetiva usa a maior exigência das regras | Compatível com revisão; modo sem aprovação humana não habilitado |
| Falhas de CI | `codex-agent.mjs`, wrappers ci-status/ci-log/ci-diagnose | Teste usa download falso, sanitização e diagnóstico reais vinculados ao SHA/run/job/evidência; stage/commit/push consomem um ciclo. URLs assinadas não chegam ao modelo | Implementado e testado em simulação; recuperação de falha remota com Codex pendente |
| Snapshots | `docs/product/marketing-ops/contracts/`, `test/contracts/`, referência v2.3 | Nenhum snapshot ou referência foi editado. Ajuste preexistente no ADR-0006 guardado separadamente para verificar a entrega e reposto ao final | Preservados; conferir os gates do SHA entregue |
| Execução persistente e interrupções | `scripts/codex-supervise.mjs`, `scripts/codex-service.mjs`; runner:start/once/stop/status | Supervisor em primeiro plano reobserva revisão sem nova missão; STOP, sinais, revogação e limites encerram com checkpoint. Lock de PID vivo nunca é tomado por idade; grupo Codex recebe TERM/KILL. Testes usam processos simulados | Implementado e testado; serviço do SO não instalado nem ativado |

## Ativação única

Primeiro integrar a entrega do bootstrap e confirmar os checks de main. A PR #11 foi aberta por `cabralgava`: esse autor não pode aprovar o próprio PR como revisão independente. Um revisor habilitado diferente do autor precisa satisfazer a aprovação atual. Nenhum ruleset foi alterado, nenhum switch global foi ligado e nenhuma aprovação foi fabricada.

O GitHub App já tem seus arquivos externos presentes, conferidos somente por metadados; existência não comprova a validade da instalação ou as permissões do token. O primeiro doctor com registro válido deve verificá-las, sem imprimir valores. Não copiar a chave nem substituir a identidade do App por um token pessoal.

A autorização contínua exige terminal do proprietário e a frase de confirmação pelo mecanismo existente. Uma única emissão cobre as missões dentro destes limites; os controles não são repetidos a cada missão. Proposta restrita para iniciar o backlog de testes do I-02:

```sh
node scripts/claude-authorize.mjs --standing=create --paths=packages/core/test/ --expires-days=7 --max-missions=5 --max-merges-per-run=5 --max-agent-sessions=3 --run-wall-clock-seconds=86400 --max-wall-clock-seconds=3600 --max-iterations=3 --max-log-reads=5
```

Conferir o resumo e digitar `AUTORIZAR-DESENVOLVIMENTO-CONTINUO`. Não fabricar TTY, preencher essa confirmação em nome do proprietário ou editar o JSON manualmente. O escopo é somente testes de domínio; ampliar para novas áreas requer uma autorização correspondente. O backlog canônico é `docs/backlog/missions.json`, lido de origin/main. A primeira missão amplia a cobertura do caso de uso já existente de recuperação de tentativas do CR-027, sem provider real, migrations ou produção.

```sh
pnpm runner:start   # supervisor persistente em primeiro plano; Codex nativo
pnpm runner:status  # checkpoint, missão, head, lock e bloqueios
pnpm runner:stop    # cria STOP; preserva trabalho e checkpoint
pnpm runner:once    # execução única; também preserva limites e checkpoint
```

O comando start não instala daemon. Fechar a sessão pode interromper o processo. Para sobrevivência ao fechamento do aplicativo, `node scripts/codex-service.mjs prepare` gera um plist revisável sem instalar ou iniciar serviço. `node scripts/codex-service.mjs install` exige autorização válida, checkout limpo e código do bootstrap idêntico ao de origin/main; usa a identidade do App para buscar a base, instala sem sobrescrever serviço existente e confirma o registro no launchd. O plist usa Node absoluto, logs sem saída bruta e nenhuma credencial. Conferir PID, checkpoint, interrupção e ensaio remoto antes de declarar execução em segundo plano. Revogação exige nova autorização; retomada não renova tempo, tentativas nem contadores.

Deploy, dados reais, mensagens, gastos, mudanças de segurança, modelos produtivos e autonomia dos agentes do produto continuam fora deste mandato. Publicação segue PUBLICACAO.md e o pacote de versão/destino aprovado.

## Verificação de qualidade

Escopo validado: bootstrap do executor Codex e da entrega contínua; sem alterações de produto, banco ou produção.

Arquivos revisados: adaptador Codex, supervisor, serviço, autorização, wrappers, integrador, classificador, CODEOWNERS, CI, testes do harness e backlog.

Testes criados ou atualizados: invocação direta, escopo e symlink, processo em grupo, limites e checkpoint, retomada, revisão no head atual, correção de CI em draft/ready, duas missões com Git real e serviços externos simulados, proveniência Codex e preparo do serviço. Testes existentes foram preservados; as mutações agora removem juntas as barreiras redundantes, sem enfraquecer a proteção.

Comandos executados: pnpm verificar; pnpm test (árvore final); pnpm test:harness; git diff --check; codex-service prepare; plutil -lint; codex-service install (recusado ST-MISSING); sondas Codex reais em repositórios temporários.

Resultados: gate completo inicial 974 Vitest, 240 pgTAP, 16 E2E, tipos, secrets e build; árvore final 977 Vitest; harness 152. Nenhuma divergência em 416 arquivos versionados de produto, referência e snapshots em relação a deec3b6.

Requisitos comprovados: implementação local e cenários determinísticos; CLI Codex real com fixture autorizada; preservação das fontes congeladas.

Validações não executadas: ciclo remoto completo com revisão/merge e missão seguinte; permanência do serviço após fechar a sessão.

Pendências: revisão da PR por identidade diferente do autor; emissão única do registro contínuo; instalação e ensaio do serviço no checkout limpo.

Riscos: relato do modelo não é prova de checks; arquivos do App presentes não comprovam token válido; registro do launchd não comprova missão integrada.

Status: aprovado com ressalvas para revisão; ativação e ensaio remoto pendentes.
