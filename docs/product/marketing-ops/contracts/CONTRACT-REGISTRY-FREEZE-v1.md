# Oplyra — Contract Registry Freeze v1

**Freeze:** `Contract Registry Freeze v1`  
**Versão:** `1.0`  
**Emitido em:** 2026-09-18T12:58:40Z  
**Status:** `frozen`  
**Escopo:** contratos universais e registries agentic pré-runtime

## Declaração

O Contract Registry v1 da Oplyra está formalmente congelado para início da implementação estrutural.

Freeze significa estabilidade suficiente para implementação. Não significa imutabilidade eterna. Qualquer mudança posterior em identidade, semântica, schema, registry, ownership, permission, autonomy, approval, idempotency ou compatibilidade deverá seguir:

`change proposal → compatibility assessment → version bump → migration strategy`.

## Evidência de entrada

A Final Cross-Registry Validation foi executada e aprovada antes deste Freeze:

- status: `passed`;
- checks: `70/70`;
- blocking issues: `0`;
- unresolved registry gaps: `0`;
- referências órfãs: `0`;
- handoffs sem binding: `0`;
- schemas com falha de referência: `0`.

Artefato de evidência:

`docs/product/marketing-ops/contracts/cross-registry-validation.json`

SHA-256:

`0d9e17e4edd5f373c7d21ca1e9f8a0371f59983b89dc309faa0f668158781fb3`

## Baseline congelada

| Categoria | Quantidade |
|---|---:|
| Agents | 12 |
| Permissions | 6 |
| Tools | 58 |
| Actions | 171 |
| Events | 136 |
| Errors | 42 |
| Handoffs | 43 |
| Quality gates | 11 |
| Schemas integrados | 11 |
| Handoff/action bindings | 364 |
| Fixtures válidas | 12 |
| Fixtures inválidas | 16 |

## Critérios do Freeze v1

- [x] schemas universais válidos;
- [x] agents registry completo;
- [x] actions registry completo;
- [x] events registry completo;
- [x] errors registry completo;
- [x] tools registry completo;
- [x] permissions registry completo;
- [x] handoffs registry completo e vinculado a actions;
- [x] quality gates registry completo;
- [x] fixtures mínimas presentes e parseáveis;
- [x] categorias mínimas de contract tests especificadas;
- [x] zero referências órfãs;
- [x] zero enums desconhecidos;
- [x] zero side effects sem política estrutural.

As 51 actions com side effect exigem idempotência. As nove actions com side effect externo exigem approval. Quality approval não substitui authorization de execução.

## Artefatos canônicos

O conjunto exato de arquivos, tamanhos e hashes está definido em:

`docs/product/marketing-ops/contracts/contract-registry-manifest.json`

O manifest fixa:

- oito registries canônicos;
- oito relatórios de validação dos registries;
- 11 schemas integrados;
- documentação e relatórios normativos do Contract Registry;
- 28 fixtures;
- esta declaração de Freeze;
- seis dependências normativas externas ao diretório de contracts.

## Exclusões explícitas

Não fazem parte da baseline congelada:

- `contracts/handoffs.recovery.json`;
- `contracts/registries/handoffs.recovery.json`;
- `contracts/registries/handoff-action-binding-analysis.json`;
- arquivos `.DS_Store`;
- este próprio manifest como entrada de hash;
- domain-specific schemas ainda não criados;
- event payload schemas ainda não criados;
- action input/output schemas ainda não criados;
- runtime e implementação.

O artefato autoritativo do binding é:

`docs/product/marketing-ops/contracts/handoff-action-binding-analysis.json`.

## Política pós-Freeze

### Mudança backward compatible

Requer change proposal, compatibility assessment e incremento minor quando alterar o contrato publicado.

### Mudança incompatível

Requer change proposal, compatibility assessment, incremento major e estratégia de migração.

### Proibições

Após o Freeze, implementação não pode introduzir silenciosamente:

- agent, action, event, error, permission, tool, handoff ou gate não registrado;
- rename de identidade canônica;
- enum novo fora do schema/registry;
- side effect sem permission, autonomy, approval/policy, idempotency e audit aplicáveis;
- comunicação machine-to-machine não versionada;
- bypass de tenant isolation;
- self-approval de Strategy & Quality;
- promoção direta de inferência para L1/L2.

## Próximas etapas permitidas

O Freeze autoriza avançar para:

1. domain-specific schemas;
2. event payload schemas;
3. action input/output schemas;
4. contract tests executáveis;
5. componentes estruturais do runtime.

Esses itens não são considerados implementados por esta declaração. Cada incremento deverá respeitar a baseline congelada e os controles de compatibilidade.
