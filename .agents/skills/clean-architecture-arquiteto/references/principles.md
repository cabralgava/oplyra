# Referência rápida — Clean Architecture

## Objetivo

O objetivo da arquitetura é reduzir o esforço humano necessário para construir, manter e evoluir o sistema.

## Regra de dependência

As dependências de código devem apontar para dentro, em direção às políticas de maior nível.

Camadas internas não devem conhecer nomes, tipos, schemas, DTOs, frameworks ou detalhes das camadas externas.

## Círculos conceituais

1. **Entities**
   - Regras de negócio mais estáveis.
   - Independentes de banco, UI, framework e aplicação específica.

2. **Use Cases**
   - Regras específicas da aplicação.
   - Orquestram entidades, portas, transações e fluxos.

3. **Interface Adapters**
   - Controllers, presenters, gateways, mappers e adapters.
   - Traduzem dados entre o mundo externo e o interno.

4. **Frameworks & Drivers**
   - Banco, web, UI, Supabase, SDKs, APIs, storage, filas e ferramentas.
   - São detalhes plugáveis.

## SOLID aplicado à arquitetura

- SRP: separar o que muda por motivos diferentes.
- OCP: permitir extensão sem modificar código estável.
- LSP: respeitar contratos de substituição.
- ISP: não depender do que não usa.
- DIP: políticas dependem de abstrações; detalhes implementam abstrações.

## Componentes

- REP: o que é reutilizado junto deve ser versionado/liberado junto.
- CCP: o que muda junto deve ficar junto.
- CRP: não force dependência de coisas não usadas.
- ADP: evite ciclos de dependência.
- SDP: dependa na direção da estabilidade.
- SAP: componentes estáveis devem ser abstratos o suficiente.

## Details

Banco de dados, web e frameworks são detalhes. Eles importam, mas não devem comandar a arquitetura.

## Sinais de problema

- Componente React contém regra de negócio crítica.
- Regra de negócio chama Supabase diretamente.
- Caso de uso depende de SDK externo.
- DTO de API externa entra no domínio.
- Mudança de tela quebra regra de negócio.
- Mudança de banco exige alterar entidades.
- Teste de regra de negócio precisa subir infraestrutura.
- Pastas principais gritam framework e não negócio.

## Sinais de boa arquitetura

- Casos de uso aparecem claramente.
- Regras centrais são testáveis isoladamente.
- Infraestrutura pode ser trocada com baixo impacto.
- UI apenas apresenta e captura intenção.
- Adapters traduzem dados e erros.
- Composition root conecta concretos às abstrações.
