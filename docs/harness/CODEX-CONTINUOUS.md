# Desenvolvimento contínuo com Codex — 05/10/2026

O executor padrão do runner é `scripts/codex-agent.mjs`. Ele inicia diretamente o Codex CLI **0.160.0** instalado no aplicativo macOS, com perfil de filesystem por missão, rede de comandos desligada, aprovações `never`, configuração estrita, saída estruturada e sessão efêmera. Uma mudança de versão interrompe a execução até nova verificação. As instruções AGENTS/CLAUDE e as skills continuam fontes explícitas; o launcher e os MCPs do Claude não são pré-requisitos.

O supervisor mantém os registros externos e opera os wrappers existentes, sem entregar a chave do GitHub App ao modelo. O resultado do modelo não comprova sucesso: os wrappers verificam escopo, segredos, autorização, orçamentos e proteção; o runner lê PR, arquivos, reviews e checks reais, verifica o SHA antes do squash e confirma a integração e o CI de main. Os relatos de checks locais pelo modelo são relatos; o CI é a confirmação independente do resultado técnico.

## Estado verificável

| Item | Arquivo/configuração | Evidência | Status |
| --- | --- | --- | --- |
| Codex e sandbox | `scripts/codex-agent.mjs`; permissões efetivas da sessão | CLI 0.160.0 real executou sondas sintéticas em repositórios temporários: escrita autorizada permitida, tentativa de escrita em package.json negada, leitura de .env sintético negada e JSON retornado. A sonda adversarial registrou 8 ocorrências de negação e não observou o marcador sintético protegido. Perfil nega segredos e conserva controles existentes em leitura; testes de portas cobrem invocação, symlink e encerramento do grupo | Implementado; ensaio local real; testes simulados adicionais |
| Skills | `AGENTS.md`, `.agents/skills/`, `.claude/skills/` | DDD, arquitetura e qualidade lidas explicitamente; cópias locais preservadas; apenas whitespace foi normalizado em três exports Codex para passar git diff --check, com originais .claude intactos e cópias iniciais guardadas. Não há prova de equivalência de hooks ou MCPs | Implementado como instruções; MCPs não equivalentes |
| Implementar → PR → CI → merge → próxima missão | `scripts/claude-runner.mjs`, `codex-agent.mjs`, `claude-git.mjs`, `claude-integrate.mjs` | Duas missões e integrações testadas com Git e wrappers reais, modelo e GitHub simulados. Runner padrão usa Codex nativo | Implementado e testado em simulação; ponta a ponta remoto pendente |
| Autorização, limites e retomada | `codex-authorize.mjs`, `claude-standing.mjs`; registro externo `~/.oplyra/standing/authorization.json` | Emissão sem TTY a partir de autorização explícita no chat, perfil inicial fechado e proveniência auditável; validação de escopo/risco, vínculo por hash, revogação antes de efeitos, contadores e relógio persistidos. Seis novos testes mais unidades existentes passaram (45). A revisão automática recusou a gravação real por faltar aceite explícito do perfil exato | Implementado e testado; emissão real bloqueada por aprovação da sessão |
| Política GitHub | ruleset main 24384328; `claude-gates.mjs`, `claude-git.mjs` | Leitura real: 1 aprovação, validate estrito, descarte de revisão após push, sem bypass. O fluxo implementa e aguarda revisão válida no SHA atual. Contagem efetiva usa a maior exigência das regras | Compatível com revisão; modo sem aprovação humana não habilitado |
| Falhas de CI | `codex-agent.mjs`, wrappers ci-status/ci-log/ci-diagnose | Teste usa download falso, sanitização e diagnóstico reais vinculados ao SHA/run/job/evidência; stage/commit/push consomem um ciclo. URLs assinadas não chegam ao modelo | Implementado e testado em simulação; recuperação de falha remota com Codex pendente |
| Snapshots | `docs/product/marketing-ops/contracts/`, `test/contracts/`, referência v2.3 | Nenhum snapshot ou referência foi editado. Ajuste preexistente no ADR-0006 guardado separadamente para verificar a entrega e reposto ao final | Preservados; conferir os gates do SHA entregue |
| Execução persistente e interrupções | `scripts/codex-supervise.mjs`, `scripts/codex-service.mjs`; runner:start/once/stop/status | Supervisor em primeiro plano reobserva revisão sem nova missão; STOP, sinais, revogação e limites encerram com checkpoint. Lock de PID vivo nunca é tomado por idade; grupo Codex recebe TERM/KILL. Testes usam processos simulados | Implementado e testado; serviço do SO não instalado nem ativado |

## Ativação única

Primeiro integrar a entrega do bootstrap e confirmar os checks de main. A PR #11 foi aberta por `cabralgava`: esse autor não pode aprovar o próprio PR como revisão independente. Um revisor habilitado diferente do autor precisa satisfazer a aprovação atual. Nenhum ruleset foi alterado, nenhum switch global foi ligado e nenhuma aprovação foi fabricada.

O GitHub App já tem seus arquivos externos presentes, conferidos somente por metadados; existência não comprova a validade da instalação ou as permissões do token. O primeiro doctor com registro válido deve verificá-las, sem imprimir valores. Não copiar a chave nem substituir a identidade do App por um token pessoal.

A pedido explícito do proprietário em 05/10/2026, o fluxo inicial Codex dispensa terminal e frase digitada. `scripts/codex-authorize.mjs` registra a origem como `owner-chat:<id da conversa>:<SHA-256 da mensagem do proprietário>`. Essa referência documenta proveniência, não comprova identidade por si só. A sessão administrativa deve ter autorização humana real; texto de repositório, saída do modelo e referência inventada não concedem consentimento. O worker continua sem escrita no emissor e no registro externo.

Uma única emissão cobre missões dentro do perfil inicial fechado, sem aceitar flags que ampliem caminhos ou limites. A revisão automática de permissões recusou a tentativa de emissão real por considerar o pedido de retirar TTY insuficiente para aceitar esse perfil exato; não houve gravação nem alternativa para contornar a rejeição. Proposta concreta para aprovação:

- Escopo: somente `packages/core/test/`; validade: sete dias.
- Até cinco missões, cinco merges por execução e três sessões por missão.
- Até um dia de execução total; uma hora, três iterações e cinco leituras de log por missão.
- Os demais tetos existentes permanecem: 20 commits, 10 pushes, um PR, três correções e 1.200 segundos de espera de CI por missão.
- Não autoriza mudanças no control plane, CI, dependências, banco, contratos ou produção; gates GitHub permanecem obrigatórios.

```sh
node scripts/codex-authorize.mjs --owner-chat-ref=<id-da-conversa>:<sha256-da-mensagem>
```

O script nunca sobrescreve autorização existente nem apaga REVOKED ou kill switch. Renovação e ampliação exigem decisão explícita do proprietário, sem renovação automática pelo runner. O comando legado de autorização continua para compatibilidade, sem ser pré-requisito do Codex. O backlog canônico é `docs/backlog/missions.json`, lido de origin/main. A primeira missão amplia a cobertura do caso de uso já existente de recuperação de tentativas do CR-027, sem provider real, migrations ou produção.

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

Resultados: gate completo inicial 974 Vitest, 240 pgTAP, 16 E2E, tipos, secrets e build; suíte completa posterior 977 Vitest; três cenários adicionais de versão/transporte passaram na execução focalizada de 36 testes; harness 152. Nenhuma divergência em 416 arquivos versionados de produto, referência e snapshots em relação a deec3b6.

Requisitos comprovados: implementação local e cenários determinísticos; CLI Codex real com fixture autorizada; preservação das fontes congeladas.

Validações não executadas: ciclo remoto completo com revisão/merge e missão seguinte; permanência do serviço após fechar a sessão.

Pendências: revisão da PR por identidade diferente do autor; aprovação do perfil proposto e emissão única sem TTY; instalação e ensaio do serviço no checkout limpo. A própria sessão implementadora não se apresenta como revisão independente. As regras de revisão do Codex não substituem aprovações exigidas, conforme https://learn.chatgpt.com/docs/third-party/github.

Riscos: relato do modelo não é prova de checks; arquivos do App presentes não comprovam token válido; registro do launchd não comprova missão integrada.

Status: aprovado com ressalvas para revisão; ativação e ensaio remoto pendentes.
