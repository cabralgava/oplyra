# Oplyra Actions Registry — Collision Resolution v1

**Status:** resolved

Durante a construção do Action Registry, foram encontradas cinco colisões de nomes nos contratos dos 12 agentes.

## Colisões de facade/delegação

Estas ações representam a mesma capability operacional. O Account & Projects Agent fica como owner canônico; o Orchestrator pode recebê-las e delegá-las.

```text
resolve_blocker
task_dependencies
pending_approvals
```

## Colisões semanticamente ambíguas

Estas actions tinham o mesmo nome, mas significados de domínio diferentes. Foram separadas no registry:

```text
campaign_status
→ media_campaign_status
→ email_campaign_status

attribution_status
→ performance_attribution_status
→ revenue_attribution_status
```

Os nomes antigos permanecem registrados em `legacyDeclarations` para rastreabilidade e futura atualização dos Markdown dos agentes.

## Regra

O runtime deve resolver sempre a `action` canônica do registry. Uma action executável possui exatamente um `ownerAgent`.
