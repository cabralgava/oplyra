# Guia rápido de conceitos DDD

Este guia resume os conceitos operacionais que devem orientar a skill.

## Domínio

A área real de negócio que o software precisa apoiar. O software deve refletir os conceitos essenciais desse domínio.

## Modelo de domínio

Abstração seletiva e organizada do domínio. Não é apenas diagrama; pode aparecer em conversas, documentos, código e testes.

## Linguagem Ubíqua

Linguagem comum usada por especialistas de negócio, produto e tecnologia. Deve aparecer em conversas, documentação, nomes de classes, métodos, módulos, eventos e regras.

## Model-Driven Design

A implementação deve refletir o modelo. O código não deve se afastar do modelo a ponto de o modelo virar apenas documentação obsoleta.

## Arquitetura em Camadas

- Interface: apresentação e comandos do usuário.
- Aplicação: coordenação de casos de uso.
- Domínio: regras, entidades, objetos de valor, agregados e invariantes.
- Infraestrutura: banco, APIs, storage, webhooks, mensageria e detalhes técnicos.

## Entidade

Objeto com identidade contínua. A identidade importa mais do que os atributos.

## Objeto de Valor

Objeto definido pelos atributos. Normalmente imutável. Não possui identidade própria.

## Serviço de Domínio

Operação de domínio que não pertence naturalmente a uma entidade ou objeto de valor.

## Módulo

Agrupamento coeso de conceitos do domínio. O nome do módulo deve fazer sentido para o negócio.

## Agregado

Conjunto de objetos tratado como unidade de consistência. Tem uma raiz que protege invariantes.

## Factory

Responsável por criar objetos ou agregados complexos sem espalhar lógica de construção.

## Repository

Abstrai recuperação e persistência de agregados, sem vazar detalhes técnicos para o domínio.

## Bounded Context

Limite dentro do qual um modelo e uma linguagem têm significado consistente.

## Context Map

Mapa das relações entre contextos: integração, dependência, conformidade, camada anticorrupção, caminhos separados etc.

## Camada Anticorrupção

Camada de tradução entre o modelo interno e um modelo externo. Protege a linguagem e as regras internas.

## Refatoração para visão mais profunda

Refatoração motivada por aprendizado do domínio. Busca revelar conceitos escondidos, simplificar relações e tornar regras explícitas.

## Destilação

Separação entre core domain e partes secundárias. O foco deve estar no que gera vantagem ou resolve o problema central.
