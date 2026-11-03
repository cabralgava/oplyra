# Autonomous Build — desenvolvimento e entrega contínuos

## 1. Autorização vigente e capacidade real

**Mandato aprovado pelo proprietário em 04/10/2026:** produzir o sistema já especificado no automático, sem exigir operação manual de branch, commit, PR e merge a cada missão. A autorização cobre o desenvolvimento incremental do escopo aprovado e a correção do seu mecanismo de entrega; não é autorização irrestrita para serviços externos, custos, produção ou ações destrutivas.

**Decisão posterior em 05/10/2026:** o proprietário pediu remover a confirmação inicial em terminal. O bootstrap Codex oferece emissão administrativa com proveniência da autorização explícita no chat, pelo `scripts/codex-authorize.mjs`. Isso substitui o requisito de TTY para esse fluxo inicial; não elimina o registro externo, escopo, validade, limites, revogação nem os gates GitHub. A referência da conversa é uma atestação de origem, não autenticação criptográfica. O worker de implementação não pode escrever no emissor nem no diretório externo. A emissão efetiva do perfil proposto continua pendente de aprovação da sessão: a revisão automática recusou a gravação por não considerar explícito o aceite dos limites exatos. A revisão técnica pelo Codex permanece identificada como IA e não é uma aprovação humana fabricada.

A política de continuidade está aprovada. A ativação técnica ainda não foi comprovada. O bloco abaixo descreve o **estado da implementação do loop**, não uma pendência de nova autorização de negócio:

```yaml
status: draft
executionEnabled: false
```

Não trocar esse valor para true apenas para obedecer ao objetivo textual. A declaração de execução ativa depende do bootstrap, dos testes e de uma demonstração ponta a ponta. Não dizer que o sistema está automático enquanto houver handoff manual obrigatório ou capacidade ausente.

### 1.1 Precedência e limites da mudança

Esta decisão posterior substitui a atribuição de tarefas Git rotineiras exclusivamente ao proprietário presente em CR-032/CR-033, no fluxo antigo `ready for owner`, em READMEs, templates e relatos anteriores. Também substitui a necessidade de nova autorização para cada missão que apenas implementa uma fatia do escopo já aprovado. Os textos/snapshots históricos permanecem preservados; não são reescritos para aparentar que a nova política existia antes.

A substituição é normativa, não uma alteração invisível de permissões, rulesets, registros externos ou executáveis. Não revoga contratos frozen, Local First, isolamento de tenants, revisão independente quando exigida, controles de segredos, critérios de aceite ou aprovações dos agentes do produto. Deploy e merge são operações distintas.

### 1.2 Diagnóstico verificado nesta revisão

Base inspecionada: `28978cb3aa9539f27407bceafce48b8aa96f7de6` de `cabralgava/oplyra`, em 04/10/2026.

- O texto anterior encerrava o agente em `ready for owner` e atribuía branch/PR/merge ao proprietário.
- `.claude/delegated-delivery.json` mantém `delegatedDelivery: false`.
- Os verbos tipados existentes fazem entrega delegada limitada; `package.json` não oferece verbos de ready-for-review ou merge. Eles dependem de registro de autorização externo por incremento.
- `test/contracts/cr-033-current-content.test.ts` verifica os switches desligados e a ausência de merge no wrapper. A migração técnica precisa atualizar os testes do comportamento CORRENTE com evidências, sem modificar snapshots congelados nem simplesmente remover testes.
- O repositório reportou `allow_auto_merge: false`.
- O ruleset `main-protection` (`24384328`) exige PR, uma aprovação de revisão, histórico linear, squash e check `validate` da integração 15368, com branch atualizada. Não há bypass configurado.
- A leitura administrativa da proteção clássica retornou HTTP 403 à integração desta sessão. A leitura do ruleset permitiu confirmar as regras acima; não comprova capacidade de editá-las.

Esses fatos são bloqueios de bootstrap, não evidência de que o código do produto precisa ser descartado. Conferir novamente a configuração antes de qualquer ação; este registro não é monitoramento permanente.

## 2. Fluxo obrigatório após o bootstrap

```text
retomar estado e escopo aprovado
→ escolher próxima missão com dependências satisfeitas
→ criar branch pelo executor autorizado
→ implementar uma entrega revisável
→ verificar localmente e revisar o diff
→ commit e push restritos ao change set
→ criar ou atualizar PR automaticamente
→ acompanhar CI do SHA atual
→ diagnosticar, corrigir e repetir checks necessários
→ retirar draft quando pronto, se aplicável
→ integrar por squash quando TODOS os gates reais forem satisfeitos
→ confirmar merge e SHA efetivo
→ registrar checkpoint e resultado
→ continuar na próxima missão autorizada
```

PR é artefato técnico de rastreabilidade, não uma tarefa a ser entregue ao proprietário. A automação é responsável por criação, atualização, acompanhamento e integração. Não exigir que o usuário dê `continuar`, aprove uma missão já coberta ou repita os mesmos comandos.

Não confundir autorização permanente com execução ilimitada. Cada execução deve ter limites explícitos de tempo, tentativas e consumo e um mecanismo de interrupção. Sem runner persistente, manter um checkpoint recuperável e informar a interrupção; uma documentação ou conversa não executa trabalho em segundo plano.

### 2.1 Seleção e continuidade

Derivar missões da transição, atualizações, contratos e backlog canônicos, não inventar produto. Priorizar dependências e o MVP Performance. Cada missão registra objetivo, áreas/arquivos, critérios de aceite, base, limites e evidências. Não iniciar missão dependente de um PR não integrado como se ele já estivesse em main. Não duplicar PRs ou refazer efeitos sem conferir seu estado real.

Escolhas rotineiras compatíveis com a arquitetura são do executor. Mudança material de produto, contrato ou efeito externo não coberto continua exigindo decisão específica. Registrar trabalho independente, mas não fugir para novas funcionalidades para esconder um bloqueio da missão atual.

### 2.2 Git, revisão e integração

Usar identidade de automação autorizada, com privilégio mínimo e credenciais fora do código e do contexto do agente. Manter branches por missão, commits rastreáveis, PRs revisáveis, histórico linear e squash conforme as regras reais. Não escrever diretamente em main, forçar push ou reescrever histórico como atalho.

A decisão de merge deve verificar o SHA atual, checks obrigatórios concluídos, ausência de conflito e requisitos de revisão aplicáveis. Fazer a operação com proteção contra mudança de head; depois reler o PR e confirmar `merged` e o SHA. Um pedido de auto-merge aceito não é comprovação de integração. Se a base mudar, atualizar por mecanismo autorizado e repetir a evidência afetada.

Revisão por IA é identificada como tal, não aprovação humana nem substituição automática de revisão independente. Não fabricar atestação do proprietário. Enquanto o GitHub exigir aprovação humana, isso é um bloqueio real de configuração para o modo sem operação humana; não tentar contorná-lo. A política administrativa para entregas rotineiras e exceções precisa estar explicitamente configurada e testada.

Checkpoint de estado vai na própria entrega e/ou no próximo checkpoint consolidado. Registrar SHA real após conhecê-lo, com comentário/status automatizado ou no checkpoint seguinte. **Não criar uma cadeia recursiva de PRs só para registrar o SHA do PR anterior.**

### 2.3 Recuperação

Falhas de typecheck, teste, build ou CI causadas pela missão devem ser diagnosticadas e corrigidas pela automação. Limite: até três tentativas fundamentadas por check; sem repetição cega, ampliação silenciosa de escopo ou redução de critérios. Rerun só por capacidade autorizada e após diagnóstico; falha transitória deve ser distinguida de defeito.

Conferir estado após timeout antes de repetir uma escrita. Conflito fora do próprio change set, alterações de terceiros, merge/rebase/cherry-pick em andamento ou inconsistência do registro exigem parada segura. Não usar reset destrutivo, clean ou force push para recuperação. Rollback de integração deve preservar histórico e ter validação própria.

## 3. Bootstrap único — trabalho de implementação já solicitado

Não pedir nova aprovação de negócio para preparar essa correção. Executá-la no ambiente de manutenção autorizado quando as capacidades necessárias existirem. Não retirar defesas para simular que ela foi concluída.

1. **Consolidar a política:** CLAUDE e DESENVOLVIMENTO apontam para este contrato; trechos históricos de operação manual ficam explicitamente substituídos. Preservar requisitos do produto e fontes protegidas.
2. **Implementar o executor:** completar o ciclo branch → PR → CI → merge → retomada por componentes com fronteiras claras. Separar decisão de próxima missão, testes e checkpoint dos adapters Git/GitHub/runner. Não conceder shell irrestrito ao coding agent.
3. **Autorizar uma vez o escopo contínuo:** registrar fora da área editável pelo agente a identidade, repositório, escopo, limites e revogação. O mecanismo atual por incremento não deve exigir que o proprietário renove a mesma autorização manualmente a cada missão. Sua evolução exige implementação/testes; este Markdown não fabrica o registro.
4. **Configurar GitHub por administração autorizada:** disponibilizar a capacidade de integração automática e uma política de revisão compatível com entregas rotineiras sem operação do proprietário. Manter PR, checks obrigatórios, histórico protegido e tratamento separado das exceções de alto risco. Não desligar todo o ruleset, ampliar bypass geral ou inserir tokens em workflow/repositório. Permissões administrativas são para bootstrap, não para o runner de rotina.
5. **Garantir CI realmente disparado:** validar identidade/eventos usados para criar e atualizar PRs. Não presumir que um token de workflow dispara outro workflow sem restrições. O teste de aceite deve usar o mesmo mecanismo que será usado nas missões reais.
6. **Atualizar o contrato de implementação:** testes do código corrente, configuração, templates e documentação técnica precisam refletir a nova capacidade. Preservar manifests/snapshots históricos e seguir o mecanismo de evolução/versionamento aplicável.
7. **Ensaiar e ativar:** provar uma entrega pequena ponta a ponta e a retomada da seguinte, sem branch, PR, ready ou merge operados pelo proprietário. Só então registrar execução habilitada e o SHA/evidências do ensaio.

Se a integração não puder alterar configuração administrativa ou iniciar o runner, registrar exatamente a capacidade ausente e o estado alcançado. Não atribuir esse impedimento ao escopo da missão nem alegar ativação parcial como automação completa.

## 4. Exceções reais que exigem parada

Parar quando houver segredo ou acesso indispensável ausente; necessidade de produção/dados reais/gasto não coberto; mudança material não aprovada de arquitetura, contrato, autonomia ou permissão; risco de isolamento cross-tenant; ação destrutiva/irreversível; conflito externo ao change set; limite de tentativas/consumo alcançado; ou impossibilidade de cumprir um gate obrigatório.

Perguntar somente pela decisão/capacidade realmente ausente. Criar PR, esperar checks e fazer merge de uma entrega elegível não são, por si, motivos para transferir a rotina ao proprietário. Não confundir autonomia de desenvolvimento com autorização de marketing, billing, publicação externa ou deploy produtivo.

## 5. Definition of Done da ativação

- [ ] Mandato e limites reconciliados em todas as entradas operacionais, sem exigência normativa de handoff manual por missão.
- [ ] Executor e registro de autorização contínua implementados, com limites e revogação testados.
- [ ] Segredos, produção, dados reais e operações destrutivas protegidos por controles executáveis.
- [ ] Criação/atualização de PR e transição de draft funcionam sem operação humana de rotina.
- [ ] Todos os checks determinísticos aplicáveis rodam com a identidade/eventos reais do executor.
- [ ] Falha de check bloqueia integração; correção limitada e novo SHA invalidam evidência anterior.
- [ ] Política GitHub compatível com o modo automático e exceções testadas, sem bypass geral.
- [ ] Merge verificado por leitura de estado e SHA, sem inventar aprovação/revisão humana.
- [ ] Retomada, concorrência, repetição após timeout e kill switch testados.
- [ ] Uma entrega e a passagem à próxima missão demonstradas sem cliques/comandos do proprietário.

A aprovação do mandato está registrada. Os itens acima são comprovações técnicas pendentes, não uma lista de novas autorizações por missão. Não marcar um item com base apenas neste documento.
