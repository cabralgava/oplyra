# Template — Prompt Lovable com Clean Architecture

```txt
Objetivo:

Contexto:

Diretriz arquitetural:
Aplicar Clean Architecture de forma incremental. Separar regra de negócio, caso de uso, adapter e detalhe de infraestrutura. Não deixar lógica central presa a componentes de UI, hooks, Supabase client, SDKs externos ou framework.

Escopo:
1.
2.
3.

Regras de negócio:
1.
2.
3.

Estrutura esperada:
- domain/
- application/use-cases/
- application/ports/
- adapters/
- infrastructure/
- ui/
- main/

Cuidados técnicos:
- Não quebrar funcionalidades existentes.
- Não alterar tabelas/policies/edge functions sem necessidade.
- Não criar abstrações genéricas sem uso real.
- Manter autenticação, permissões e fluxos existentes.

Critérios de aceite:
- [ ]
- [ ]
- [ ]
```
