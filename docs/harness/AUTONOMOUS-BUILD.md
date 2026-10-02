# Autonomous Build — preparação operacional

```yaml
status: draft
executionEnabled: false
```

## 1. Objetivo futuro

Preparar um coding agent para executar, com rastreabilidade e dentro de autorização explícita:

```text
owner creates the branch for the authorized increment
→ inspect repository
→ determine canonical next increment
→ implement (on the owner's branch)
→ verify
→ review (advisory only)
→ handoff package
→ ready for owner  (the loop stops here)
```

O que acontece depois é do **proprietário**: staging, commit, push, criação do PR em draft, CI, correção se necessário, Ready for review com os checks verdes, atestação, squash merge, exclusão da branch e sincronização de `main`. Uma nova iteração só começa com nova autorização e nova branch criada pelo proprietário. **Exceção distinta deste loop:** a *entrega delegada* (CR-033), que é outro conceito — sessão iniciada pelo proprietário, para um incremento autorizado, com os verbos tipados `git:branch`, `git:stage`, `git:commit`, `git:push`, `gh:pr-create`, `gh:pr-update`, `gh:ci-status`, `gh:ci-log`, `gh:ci-diagnose` e `gh:doctor` sob registro de autorização aprovado fora do repositório (criado por `scripts/claude-authorize.mjs`; `--increment=<ref>` só o seleciona). Ela tem chave própria, `delegatedDelivery` (`.claude/delegated-delivery.json`), **desligada por padrão**, e não ativa este loop.

Este loop **não está ativo**. O documento não concede permissão para criar branch, fazer staging ou commit, push, abrir ou mesclar PR, deploy, recurso remoto ou gasto: todas as escritas Git permanecem exclusivas do proprietário, exceto as da entrega delegada, que não depende deste documento nem de `executionEnabled` e está desligada por padrão. Merge automático não está autorizado em nenhum dos conceitos.

### 1.1 Política Git do loop (CR-032, slice S1)

Política aprovada no [CR-032](../product/marketing-ops/contracts/changes/CR-032-developer-harness-git-lifecycle.md); esta seção é a reconciliação textual e **não implementa nenhum mecanismo** (preflight, ruleset, template de PR, CODEOWNERS e blockers executáveis são os slices S2–S7, não autorizados).

- **Escritas Git exclusivas do proprietário:** criação de branch, staging, commit, push, criação e fechamento de PR, atestação, merge e exclusão de branch. O agente usa somente Git de leitura. No loop autônomo isso não muda; a entrega delegada (CR-033) é um modo separado e desligado por padrão, e merge, aprovação, ready-for-review, rerun de CI e force push seguem do proprietário nela.
- **Branch:** o agente trabalha somente em branch criada pelo proprietário para o incremento, nunca em `main`; se a branch, o nome ou a limpeza do worktree não corresponderem ao esperado, o loop para.
- **Pacote de handoff:** branch, SHA da base, lista de arquivos, mensagens de commit propostas, evidência de verificação (comandos, resultados, SHA testado, o que não foi verificado), rascunho do corpo do PR e proveniência. Ao entregá-lo, o loop termina em "ready for owner".
- **PR:** começa em draft; Ready for review só com checks verdes; a atestação do proprietário, vinculada ao SHA da cabeça, vem depois dos checks verdes.
- **Atestação não é revisão independente.** Revisão por IA é consultiva. O **HB-13 permanece não atendido**.
- **Merge:** squash, somente pelo proprietário; a branch é excluída por ele.
- **Retomada e recuperação:** conferir o estado com Git de leitura; parar diante de rebase, merge ou cherry-pick em andamento; se `main` avançou, o proprietário atualiza a branch e a evidência é refeita; até três tentativas diagnosticadas por check com falha; conflito fora do próprio change set encerra a execução com relato.
- **Checkpoint D-6:** o PR documental registra o SHA do incremento anterior e **não é recursivo** (não exige outro PR para registrar o próprio SHA).

## 2. Hard blockers

Uma execução futura deve parar diante de:

- mudança necessária em contrato frozen;
- conflito entre documentos normativos;
- decisão arquitetural essencial realmente ausente;
- breaking change sem migration path aprovado;
- segredo indispensável indisponível;
- necessidade de produção ou dados reais;
- impossibilidade de preservar tenant isolation;
- alteração material não autorizada de permission, autonomy ou approval;
- ação destrutiva/irreversível não autorizada;
- necessidade de reduzir critério de aceite para obter sucesso aparente.

Problemas corrigíveis — typecheck, lint, teste, build, bug local, teste ausente ou falha causada pelo próprio incremento — não são hard blockers. Devem ser diagnosticados, corrigidos e reexecutados dentro do escopo.

## 3. Guardrails

- respeitar [DEVELOPMENT-TOOLS.md](DEVELOPMENT-TOOLS.md) e o limite Local First;
- selecionar o próximo incremento apenas de fontes canônicas e autorizações vigentes;
- preservar mudanças alheias e nunca reescrever histórico compartilhado;
- mudanças de contrato seguem change proposal, compatibility assessment, version bump e migration strategy;
- revisão própria não é revisão independente quando esta for exigida;
- falha ou incerteza não pode ser convertida em sucesso aparente;
- merge, deploy e todas as demais escritas Git são exclusivos do proprietário (§1.1); nenhum ocorre sem autorização explícita e gates aplicáveis.

## 4. Definition of Done para futura ativação

- [x] Context7 configurado e consulta version-aware validada.
- [x] Playwright MCP configurado, abre a aplicação local, autentica usuário sintético e navega em fluxo real.
- [x] Playwright Test configurado e ao menos um E2E real executável (16 cenários no I-01).
- [x] Supabase local inicializa deterministicamente por scripts protegidos.
- [x] migrations/seeds locais reproduzíveis no escopo do I-01.
- [x] ao menos dois tenants sintéticos existem.
- [x] isolamento cross-tenant do I-01 possui evidência pgTAP/E2E.
- [x] varredura de segredos existe; ausência de credencial real deve continuar sendo validada a cada incremento.
- [ ] serviços remotos possuem bloqueios executáveis suficientes para o loop autônomo, além da falha fechada local já existente.
- [x] versões do Claude Code, Context7 MCP e Playwright MCP estão deliberadamente controladas/pinadas.
- [ ] CI executa todos os checks determinísticos aplicáveis ao incremento.
- [ ] política de branch/PR/review/merge e recuperação foi aprovada e testada.
- [ ] hard blockers têm mecanismo executável de parada e evidência.

Nota (CR-032, S1): o texto da política de branch/PR/review/merge e recuperação foi aprovado, mas ela **não está implementada nem testada**; o item correspondente e os demais itens abertos permanecem desmarcados.

Somente validação explícita de todos os requisitos aplicáveis e autorização específica podem alterar `executionEnabled: false` para `true`.
