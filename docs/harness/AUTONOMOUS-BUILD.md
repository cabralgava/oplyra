# Autonomous Build — preparação operacional

```yaml
status: draft
executionEnabled: false
```

## 1. Objetivo futuro

Preparar um coding agent para executar, com rastreabilidade e dentro de autorização explícita:

```text
inspect repository
→ determine canonical next increment
→ create branch
→ implement
→ verify
→ review
→ commit
→ PR
→ CI
→ fix if necessary
→ merge
→ sync main
→ repeat
```

Este loop **não está ativo**. O documento não concede permissão para criar branch, PR, merge, deploy, recurso remoto ou gasto.

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
- nenhum merge ou deploy ocorre sem política/autorização explícita e gates aplicáveis.

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

Somente validação explícita de todos os requisitos aplicáveis e autorização específica podem alterar `executionEnabled: false` para `true`.
