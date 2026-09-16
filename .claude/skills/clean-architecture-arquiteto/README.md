# Clean Architecture Arquiteto — Claude Skill

Skill criada para apoiar decisões de arquitetura de software com base nos princípios de *Clean Architecture*, SOLID, component principles, boundaries, use cases, entities, adapters, frameworks como detalhes e testabilidade.

## Instalação no Claude Code

Coloque esta pasta em:

```txt
.claude/skills/clean-architecture-arquiteto/
```

Estrutura esperada:

```txt
clean-architecture-arquiteto/
  SKILL.md
  references/
    principles.md
  templates/
    architecture-template.md
    audit-template.md
    lovable-prompt-template.md
    use-case-template.md
```

## Como usar

```txt
/clean-architecture-arquiteto Revise a arquitetura do meu CRM e proponha uma refatoração incremental.
```

```txt
/clean-architecture-arquiteto Crie um prompt para Lovable separar regras de negócio dos componentes React e do Supabase client.
```

```txt
/clean-architecture-arquiteto Modele os casos de uso de transferência de atendimento humano no WhatsApp usando Clean Architecture.
```

## Observação

Esta skill não inclui o PDF original. Ela contém uma síntese operacional dos conceitos para uso em arquitetura, revisão técnica, prompts e refatoração.
