# Baseline e precedência da mudança

**Status:** levantamento documental verificado em 28/10/2026; limitações abaixo. **Destino recomendado:** este pacote, sem alterar snapshots.

## Fontes e estado observado

O diretório `sources/` do espelho estava vazio. As evidências locais de 12/10/2026 apontavam para `/Users/cmii/Documents/Projetos/Oplyra`; esse repositório foi localizado e consultado somente em leitura. HEAD observado: `6d0dfe486292e05fade19a93b650bb54c1bde732`, branch `agent/docs/20261004-continuous-development`. Havia alterações de terceiros; não foram modificadas. O hash do HEAD não representa os arquivos já modificados no working tree: por isso [source-audit.json](source-audit.json) registra hashes individuais.

O Documento de Transição v2.3 foi lido integralmente. Seus pontos pertinentes são §7–10, §13.2, §19 e DEC-006/007/019/020. Também foram consultados os trechos relevantes dos documentos 19–20, agentes, contracts, documentos de billing/integrações/modelo/testes, ADR-0007, ATUALIZACOES e implementação local de tenancy. O inventário de hashes é mais amplo que a leitura textual; não implica leitura integral ou teste de cada arquivo.

O README contratual real é `docs/product/marketing-ops/contracts/contracts-README.md`; `contracts/README.md` não foi localizado. Também não foram localizados `OPLYRA-MIGRATION-PACK/00-START-HERE.md` e `06-OPEN-ITEMS.md` no espelho ou no repositório consultado. Sua ausência fica registrada para reconciliação; o pacote não inventa seu conteúdo.

## Divergências que precisam permanecer explícitas

| Tema | Instrução ou registro anterior | Evidência atual e tratamento |
| --- | --- | --- |
| Freeze | Instruções do Project dizem que ainda falta criar quality gates e Freeze | `CONTRACT-REGISTRY-FREEZE-v1.md` declara `frozen` em 18/09/2026; manifest original presente. Não recriar ou sobrescrever |
| Cross-validation | Relatório histórico diz `not_frozen` | É anterior ao Freeze. Preservar como evidência histórica, sem tratá-lo como estado atual |
| Registries | Project cita 136 events e 42 errors | Arquivos atuais têm 137 events e 60 errors; nove registries coincidem em hash com manifest v2.22 |
| Releases | Espelho tem estágios até CR-024 | Repositório principal contém releases posteriores até manifest v2.22. Não concatenar estágios do espelho para construir uma suposta release vigente |
| Implementação | Exemplos conceituais incluem tenant.currency e status financeiros | Código atual de Tenant e SQL de I-01 têm locale e status `active/suspended`; não têm billing currency. Não substituir status de identidade pelos status Stripe |
| Domínios públicos | Referência protegida usa `.com.br` | ATUALIZACOES §9 define `oplyra.io` e `app.oplyra.io`. Preservar o original histórico |

Não há conflito que autorize mutação automática de contratos. A decisão do usuário atualiza as diretrizes comerciais nos pontos indicados; o mecanismo pós-Freeze continua obrigatório. Antes de incorporar, conferir novamente a release aplicável ao checkout de destino e a presença dos arquivos ausentes.

## Verificações pontuais realizadas

| Registry | Versão | Entries |
| --- | --- | ---: |
| agents | 1.0 | 12 |
| permissions | 1.0 | 6 |
| tools | 1.0 | 58 |
| actions | 2.0 | 171 |
| events | 1.2 | 137 |
| errors | 1.5 | 60 |
| handoffs | 1.0 | 43 |
| quality-gates | 1.0 | 11 |
| model-profiles | 1.1 | 3 |

Conferidos: hashes dos nove registries contra o manifest v2.22; existência e ownership de 364 bindings `handoffs.allowedActions`; exigência de idempotência nas actions marcadas com side effect. Os checks pontuais passaram. Não são reexecução dos 70 checks históricos nem cross-validation integral da release, tampouco confirmação de deploy.

## Regras de preservação

1. Aprovações do usuário prevalecem no escopo atualizado; detalhes técnicos propostos não adquirem status de aprovado por associação.
2. O Documento de Transição, `sources/`, Freeze e manifests históricos continuam imutáveis.
3. Este pacote não altera identidade, ownership, autonomy, permissions, enums ou contratos existentes.
4. Mudança incompatível exige major e migração; adição compatível pode exigir minor, conforme avaliação de consumidores reais. Versão do pacote não é versão de registry.
5. Os oito agentes Performance e quatro Growth-only mantêm limites. Catálogo comercial Growth não significa que sua operação foi liberada no MVP.
