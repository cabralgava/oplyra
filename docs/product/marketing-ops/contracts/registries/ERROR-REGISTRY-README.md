# Oplyra Error Registry — v1

**Status:** validated

O `errors.json` é a fonte canônica de códigos de erro usados pelo runtime, agentes, policies, adapters e validators.

## Regras

```text
todo error.code deve existir em errors.json
retryable = false → runtime não faz retry automático
retryable = true → runtime exige retry policy efetiva
critical → stop/escalation/approval/human intervention
```

## Separação de responsabilidades

`error.schema.json` valida a estrutura de um erro.

`errors.json` valida a existência e a semântica canônica do código.

Exemplo:

```text
schema válido + code desconhecido
→ ERROR_CODE_NOT_REGISTERED
```

Novos códigos devem ser registrados e versionados antes do uso em produção.
