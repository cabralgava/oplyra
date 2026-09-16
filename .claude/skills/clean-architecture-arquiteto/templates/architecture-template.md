# Template — Proposta de Arquitetura Limpa

## Objetivo do produto

## Casos de uso

| Caso de uso | Ator | Entrada | Saída | Regras envolvidas |
|---|---|---|---|---|
|  |  |  |  |  |

## Entidades

## Value Objects

## Use Cases / Interactors

## Portas de entrada

## Portas de saída

## Adapters

| Adapter | Responsabilidade | Camada |
|---|---|---|
| Controller | Receber requisição/intenção externa | adapters |
| Presenter | Formatar resposta para UI/API | adapters |
| Gateway | Implementar acesso a banco/API externa | adapters/infrastructure |
| Mapper | Converter modelos externos/internos | adapters |

## Infraestrutura

## Estrutura de pastas

```txt
src/
  domain/
  application/
  adapters/
  infrastructure/
  ui/
  main/
```

## Fluxo de dependências

```txt
UI/Frameworks -> Adapters -> Application -> Domain
Infrastructure -> Application ports
```

## Testes

## Decisões adiadas
