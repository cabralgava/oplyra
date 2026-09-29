# Product AI Model Harness — primeiro slice local do I-02

**Data:** 29/09/2026
**Status:** implementado e testado localmente; contratos canônicos desde a Contract Registry Release 2.16 ([CR-026](../product/marketing-ops/contracts/changes/CR-026-product-ai-model-harness-contracts.md) `approved_and_applied` em 29/09/2026; resumo em [AI-MODEL-HARNESS-CONTRACTS](../product/marketing-ops/contracts/AI-MODEL-HARNESS-CONTRACTS.md)). Não publicado, sem adapter real.

**Canônico × bloqueado (Release 2.16).**

| Canônico | Continua bloqueado ou adiado |
| --- | --- |
| Error Registry 1.4 com os 12 códigos `MODEL_*`; todo resultado do harness mapeado para código registrado | Saída visual (sem contrato de asset: `MODEL_CAPABILITY_BLOCKED`) |
| Registry `model-profiles.json` 1.0 (3 vínculos sintéticos locais), carregado pelo `loadModelProfileRegistry` | Carregamento de chave de fingerprint de cofre (uso produtivo bloqueado) |
| Schemas de pedido, resposta do provider, entrada de catálogo, Model Profile e Model Call; definições compartilhadas em `common-definitions` 1.1 (`traceContext`, `requestFingerprint`, `attemptCallId`, `identifierLimits` etc.; a 1.0 segue publicada sem mudança) | Cost Ledger persistido, migrations e RLS |
| Context Package 1.1 com `dataClassification` opcional | Adapter real (OpenRouter ou direto) |
| Catálogo de modelos validado por schema como configuração operacional, fora do freeze | Vínculos de perfil de produção (dependem do EXP-05) |
**Revisões (29/09/2026):** (1) aquisição atômica por tentativa, validação em runtime do pedido e da resposta, semântica de imagens e `TraceContext`; (2) fingerprint de idempotência, classificação com proveniência verificável, estimativa de tokens do harness e saída visual por referência a asset (bloqueada); (3) escopo tenant + action + chave, fingerprint HMAC com chave identificada na infraestrutura, saída visual pública sem tenant/proveniência e `outputAssetIds` só com assets aceitos; (4) `callId` sobre o escopo completo, limites de identificadores, Unicode bem formado e chave externa de idempotência opaca.
**Arquitetura de referência:** [13 — AI Model Routing & FinOps](../product/marketing-ops/13-ai-model-routing-finops.md), [20 — Agent Transaction Protocol](../product/marketing-ops/20-agent-transaction-protocol.md) §6 e [ADR-0006](../decisions/ADR-0006-runtime-de-agentes.md).

Este é o Product AI Model Harness, não o Developer / AI Harness de [DEVELOPMENT-TOOLS](DEVELOPMENT-TOOLS.md).

## 1. O que existe

```text
chamador (workflow/agent step)
  → invokeModel(agent, action, tenant, trace, fontes de classificação, mensagens)  packages/core
      → validação estrutural do pedido (inclui limites de mensagens)
      → Model Profile ativo de agent + action
      → semântica de requestedImages; rota visual bloqueada sem porta de assets
      → entitlement do perfil e política de IA do tenant
      → classificação efetiva via DataClassificationPort (downgrade proibido)
      → material canônico (core) → RequestFingerprintPort (HMAC, infra)
      → estimativa de tokens por candidato (exata do modelo ou cota conservadora)
      → AI Model Router (puro, determinístico)
      → aquisição atômica (tenant, action, invocationId, tentativa) com fingerprint + reserva
      → ModelProviderPort ── Test Adapter                 packages/infra
      → validação da resposta do adapter por modalidade (assets conferidos no tenant)
      → liquidação (somente valores válidos) e verificações pós-chamada
      → ModelCallRecord de cada tentativa, com TraceContext
```

| Peça | Arquivo | Papel |
| --- | --- | --- |
| Contratos de resultado e erro | `packages/core/src/ai-model-harness/outcomes.ts` | Cada uma das 24 falhas internas mapeada para um código do Error Registry 1.4 |
| Model Registry | `…/model-registry.ts` | Capacidade, modalidades, parâmetros suportados, limites, tarifa versionada em micro-USD inteiros, política de dados, evidência de qualidade |
| Model Profiles | `…/model-profile.ts` | Versão, `agent + action`, requisitos, candidatos, allowlists, amostragem, limites, entitlement; validação e configuração com falha fechada |
| Validação de fronteira | `…/invocation-validation.ts` | `TraceContext`, pedido e limites, semântica de imagens, cota conservadora de tokens, fingerprint e resposta do adapter por modalidade; quantidades como inteiros seguros não negativos |
| UTF-8 | `…/utf8.ts` | Tamanho e bytes UTF-8, detecção de surrogate isolado e base64url para o `callId`; codificação, não criptografia |
| Portas | `…/ports.ts` | Provider, orçamento (aquisição por `AttemptRef` com fingerprint e aceitos), fingerprint, recorder, política do tenant, entitlement, disponibilidade/kill switch, prazo, classificação, estimador de tokens, assets gerados |
| Router | `…/router.ts` | Elegibilidade e escolha; `ordered_preference` ou `lowest_cost_above_threshold` |
| Caso de uso | `…/invoke-model.ts` | Tentativas, retry técnico, fallback revalidado, liquidação, registro |
| Test Adapter | `packages/infra/src/ai-model-harness/test-model-provider.ts` | Determinístico, no processo, sem rede, com falhas roteirizáveis; estimador exato dos próprios modelos; não produz assets visuais |
| Catálogo congelado | `…/frozen-registry-catalog.ts` | Lê `agents.json`/`actions.json` somente para validar vínculos |
| Catálogo local | `…/local-test-catalog.ts` | Três modelos do Test Adapter e três perfis sintéticos; tarifa zero e teto de custo zero |
| Fingerprint HMAC | `…/hmac-fingerprint.ts` | HMAC-SHA-256 de `node:crypto`, keyring com chave ativa e anteriores, formato `hmac-sha256:v1:<keyId>:<hex>`; chave externa de idempotência opaca `oik1-<hex>` derivada do `callId` com separação de domínio; chaves fornecidas pelo chamador (sem cofre neste slice) |
| Composition root | `…/local-composition.ts` | Habilita só o adapter `test`; exige as portas de classificação e de fingerprint; não fornece porta de assets (visual bloqueado); não lê ambiente |
| Fakes | `packages/testing/src/ai-model-harness.ts` | Orçamento com aquisição atômica por tenant (`acquired`/`conflict`/`in_progress`/`closed`/`insufficient`), classificador por tenant, assets gerados, estimador fixo, recorder, políticas, disponibilidade, prazo manual, provider roteirizado |

## 2. Regras garantidas por código e teste

1. O chamador nunca escolhe modelo, fornecedor, temperatura ou outro parâmetro: o request não tem esses campos.
2. Perfil só é aceito se `agent` e `action` existem nos registries congelados e o agent é dono ou chamador autorizado da action. Dois perfis ativos na mesma rota invalidam a configuração.
3. Cada tentativa, inclusive retry e fallback, roda o Router outra vez com orçamento e disponibilidade atualizados. Fallback nunca repete modelo esgotado e não relaxa allowlist, privacidade, kill switch ou orçamento.
4. Política do tenant só restringe; política devolvida para outro tenant é recusada.
5. Modelo `experimental` só recebe dado `synthetic`, e só se o perfil permitir.
6. Sem tarifa válida não há chamada; rota de imagem exige tarifa por imagem.
7. Cada tentativa `invocationId#attempt` é adquirida numa única operação atômica, junto com a reserva de orçamento. Só a execução que recebe `acquired` chama o provider; outra execução simultânea recebe `in_progress` e uma posterior recebe `closed`, ambas sem chamada. Cobrança incerta retém a reserva e registra custo `null`/`pending_reconciliation`, nunca zero.
8. O prazo do perfil vale mesmo que o adapter trave.
9. O pedido é validado em runtime antes de catálogo, orçamento ou provider: identificadores não vazios, em Unicode bem formado (surrogate isolado é `MODEL_INVOCATION_INVALID`, sem fingerprint, reserva, registro ou provider) e dentro dos limites (`invocationId` até 255, como `idempotency.key` do envelope; `actionKey`/`agentKey` nos padrões canônicos e até 64; `tenantId`/`workflowKey` até 128; campos de trace até 255 — tetos propostos no CR-026), `TraceContext` completo, fontes de classificação, mensagens (até 64, 256 KiB cada, 1 MiB no total), modalidades, `inputTokensHint` e `requestedImages` como inteiros seguros não negativos (recusa negativo, decimal, `NaN`, infinito e acima do inteiro seguro).
10. Rota visual (`image_generation`/`image_edit`) exige `requestedImages >= 1` e reserva por essa quantidade; rota sem imagem não aceita imagens pedidas nem cobradas.
11. A resposta do adapter é validada antes da liquidação: usage, imagens (nunca acima do pedido), custo informado, identificadores, parâmetros ignorados e forma do resultado. Resposta inválida não é liquidada nem liberada: a reserva fica retida para conciliação, a saída é descartada e a invocação para sem fallback. Custo calculado fora do inteiro seguro também fica pendente.
12. O `TraceContext` (`correlationId`, `transactionId`, `causationId`, `parentTransactionId`, `workflowId`, `taskId`, `runId`) é copiado integralmente para cada registro, inclusive retry e fallback, e não é enviado ao fornecedor.
13. A resposta é descartada se o modelo efetivo diferir do roteado, se algum parâmetro foi ignorado ou se a saída estruturada não for um objeto JSON.
14. `ModelCallRecord` não guarda prompt, resposta nem PII.
15. **Idempotência:** escopo `(tenantId, actionKey, invocationId, tentativa)`, como o `IDEMPOTENCY_CONFLICT` congelado (mesmo tenant e action); o `callId` entregue ao adapter é `att1.` + base64url do JSON `[tenantId, actionKey, invocationId, tentativa]`: cobre o escopo completo (tenants diferentes nunca compartilham id), é inequívoco para `/`, `#`, `%`, aspas e Unicode, e limitado pelos limites de identificador. É interno: o adapter não o encaminha ao fornecedor; chave externa, quando houver, é `oik1-<hex>` derivada na infraestrutura. O núcleo monta o material canônico, que cobre tenant, workflow, agent, action, perfil (`profileId@version`), classificação efetiva e declarada, fontes (ordenadas), modalidades (ordenadas), `requestedImages` e mensagens `[role, content]` em ordem; excluem-se `invocationId`/`attempt` (a chave), `trace` e `inputTokensHint`. A `RequestFingerprintPort` devolve o HMAC sob a chave ativa (`primary`) e sob as anteriores do keyring (`accepted`); a comparação ocorre na mesma operação atômica da aquisição e antes do estado: fingerprint gravado fora de `accepted` é `IDEMPOTENCY_CONFLICT`, sem provider e sem reserva nova; duplicata equivalente segue `in_progress`/`closed`; a mesma chave em outra action é outra tentativa. O material nunca é guardado nem registrado.
16. **Classificação:** resolvida por `DataClassificationPort` a partir de fontes do próprio tenant (Context Package, asset). Fonte inexistente ou de outro tenant é `REFERENCE_NOT_FOUND`; proveniência de outro tenant é `TENANT_MISMATCH`; vale a fonte mais sensível; sem fonte vale `personal_data`. O chamador só eleva: declarar abaixo é downgrade rejeitado.
17. **Tokens:** a estimativa por candidato é a contagem exata do estimador do modelo ou, na falta dela, a cota conservadora (bytes UTF-8 + 16 por mensagem + 32). `inputTokensHint` só aumenta. Mensagem grande com dica zero reserva pela cota.
18. **Saída visual:** sucesso por modalidade; rota visual devolve só referências `{assetId, mediaType}` (sem binário nem data URL), de 1 a `requestedImages`, com `usage.images` igual ao entregue, cada asset confirmado no tenant e produzido pela mesma tentativa. A saída pública não expõe `tenantId` nem `producedByCallId`, que ficam no descriptor interno do `GeneratedAssetPort`. `outputAssetIds` só recebe assets aceitos; qualquer falha ou descarte grava `null`. Sem `GeneratedAssetPort` a rota visual é bloqueada antes de qualquer tentativa.
19. O núcleo não importa nada fora de si, não cita fornecedor/modelo concreto, não fixa amostragem e não lê ambiente. Os adapters do harness não fazem rede. Nenhum código referencia chave de gateway.

## 3. Uso local

```ts
// Chaves de fingerprint vêm do chamador; em teste, somente chave sintética explícita.
const fingerprints = new HmacRequestFingerprinter({ active: { keyId, secret } });
const harness = createLocalModelHarness({ budget, recorder, entitlements, classifier, fingerprints });
const r = await harness.invoke({
  invocationId, tenantId, workflowKey: "copy-review",
  agentKey: "copywriting-agent", actionKey: "create_ad_copy",
  trace: { correlationId, transactionId, causationId: null, parentTransactionId: null, workflowId, taskId, runId },
  classification: { sources: [{ kind: "context_package", ref: contextPackageId }], declared: null },
  messages, inputModalities: ["text"],
});
// r.ok && r.output.modality === "text" && r.output.text
```

`budget`, `recorder`, `classifier` e `fingerprints` são obrigatórios porque ainda não há Cost Ledger persistido, campo canônico de classificação no Context Package nem carregamento de segredo; em teste, usar os fakes de `@oplyra/testing`. Comportamentos de falha: `new TestModelProviderAdapter({ behaviors: { "oplyra-test/text-economy": ["timeout", "success"] } })`.

## 4. Verificação

| Suíte | Arquivo | Cobertura |
| --- | --- | --- |
| Unidade — Router e configuração | `packages/core/test/ai-model-harness-router.test.ts` | Seleção, determinismo, capability, allowlists, kill switch, privacidade, tarifa, orçamento, validação de perfis e registry |
| Unidade — caso de uso e isolamento | `packages/testing/test/ai-model-harness-invoke.test.ts` | Retry/fallback revalidados, liquidação, prazo, repetição, contrato de erro, isolamento entre tenants |
| Unidade — fronteiras | `packages/testing/test/ai-model-harness-boundaries.test.ts` | Concorrência (2 e 10 execuções → 1 chamada), números inválidos no pedido, resposta inválida do adapter sem liquidação, semântica de imagens, propagação de trace |
| Unidade — lacunas contratuais | `packages/testing/test/ai-model-harness-contract-gaps.test.ts` | Material e fingerprint protegido (campos, formato, sem prompt), `callId` no escopo completo (tenants, actions, `/`, `#`, `%`, Unicode, limite), surrogate isolado sem efeitos, limites de identificador, `callId` recebido pelo adapter, mesma invocation em actions diferentes, rotação de chave, prompt ausente de registro/reserva/logs, mesma chave com pedido igual/diferente, conflito com tentativa em andamento, escopo por tenant, downgrade e proveniência de classificação, estimativa com dica zero/subestimada, limites de mensagens, saída visual (bloqueio, zero outputs, refs válidos, excesso, binário inline, outro tenant, outra tentativa) |
| Fingerprint HMAC | `packages/infra/test/hmac-fingerprint.test.ts` | Determinismo com a mesma chave, equivalência com `createHmac`, digest diferente com outro segredo ou outra chave/versão, rotação, validação das chaves, saída sem material nem segredo; chave externa opaca, determinística, com separação de domínio; Test Adapter sem identificador interno cru |
| Adapter | `packages/infra/test/test-model-provider.test.ts` | Determinismo, independência entre chamadas, roteiros de falha |
| Integração local | `test/ai-model-harness.integration.test.ts` | Composition root + Test Adapter + registries congelados reais |
| Arquitetura | `test/ai-model-harness.arquitetura.test.ts` | Regra de dependência, ausência de fornecedor/amostragem/ambiente/rede |
| Contrato | `test/contracts/ai-model-harness.contract.test.ts` | Error Registry 1.4 com os 12 códigos aprovados; toda falha do harness com código registrado e mesmo `retryable`; CR-026 aplicado; hashes da Release 2.15 como referência histórica; `external_provider` no enum do schema; `errors.validation.json` derivado; hashes dos registries iguais ao manifest v2.15 |
| Contrato — schemas e fixtures | `test/contracts/ai-model-harness-schemas.contract.test.ts` | Schemas novos só com keywords executáveis; fixtures válidas aceitas por schema e runtime; inválidas recusadas pelo motivo declarado; `-business-invariant` recusadas pelo runtime ou pelo harness (downgrade, conflito de idempotência); registry de Model Profiles e catálogo operacional |
| Release 2.16 | `test/contracts/contract-registry-release-2.16.contract.test.ts` | Reexecuta a cross-validation (62 checks) e confere o relatório; artefatos herdados idênticos à Release 2.15 e artefatos do CR-026 idênticos ao disco; falha se um hash diferente da base entrar sem pertencer ao change set autorizado; recalcula o `aggregateDigest` |

## 5. Fora deste slice

- Cost Ledger persistido, reserva transacional no Supabase e RLS correspondente: exigem migrations e CR próprio.
- OpenRouter Adapter e qualquer adapter real: exigem conta, chave, budget e autorização.
- Eval Engine e evidências de qualidade: dependem do EXP-05.
- (Aplicado na Release 2.16) contratos canônicos de Model Profile, catálogo, Model Call, pedido, resposta, fingerprint, classificação e códigos de erro.
- Saída visual executável: depende de contrato canônico de asset e de uma implementação de `GeneratedAssetPort`; até lá, bloqueada.
- (Aplicado na Release 2.16) campo opcional de classificação no Context Package 1.1; o Context Builder ainda não o preenche.
- Escalonamento progressivo por qualidade (13 §4): não implementado; apenas fallback por falha/incompatibilidade.
- Integração com filas/runtime de agentes e com o entitlements service do I-01.

## 6. Limitações conhecidas

- A classificação só é tão confiável quanto a porta que a resolve; sem campo canônico no Context Package, a composição local depende de um classificador fornecido pelo chamador. O conteúdo das mensagens não é inspecionado pelo harness.
- A cota conservadora supõe tokenizer de nível de byte e não cobre entradas de imagem; um estimador "exato" defeituoso pode subestimar (valor inválido é ignorado, valor plausível é confiado).
- A exclusividade por tentativa só vale enquanto a aquisição for atômica no armazenamento; os fakes garantem isso dentro de um processo. Tentativa deixada `in_progress` por queda não é retomada: a recuperação cabe à conciliação do Cost Ledger persistido.
- O fingerprint usa HMAC com chave, mas o carregamento de segredo de um cofre não existe: sem adapter produtivo de chaves, o uso em produção fica bloqueado. Chave retirada do keyring antes do fim da retenção das tentativas faz reentregas legítimas virarem conflito (falha fechada, sem chamada).
- Resposta visual descartada pode deixar assets órfãos já gravados pelo adapter; por decisão, seus ids não entram no registro (`outputAssetIds: null`), então a limpeza depende do armazenamento de assets, pela proveniência `producedByCallId`.
- O `tsconfig` do pacote `testing` passou a declarar os tipos do Node, porque os testes do harness usam o adapter HMAC real da infraestrutura.
- Os fakes de orçamento e o recorder não provam atomicidade sob concorrência real entre processos.
