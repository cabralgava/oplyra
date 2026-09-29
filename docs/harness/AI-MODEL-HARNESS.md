# Product AI Model Harness — primeiro slice local do I-02

**Data:** 29/09/2026
**Status:** implementado e testado localmente; contratos canônicos desde a Contract Registry Release 2.16 ([CR-026](../product/marketing-ops/contracts/changes/CR-026-product-ai-model-harness-contracts.md) `approved_and_applied` em 29/09/2026; resumo em [AI-MODEL-HARNESS-CONTRACTS](../product/marketing-ops/contracts/AI-MODEL-HARNESS-CONTRACTS.md)). Não publicado, sem adapter real.

**Canônico × bloqueado (Release 2.16).**

| Canônico | Continua bloqueado ou adiado |
| --- | --- |
| Error Registry 1.4 com os 12 códigos `MODEL_*`; todo resultado do harness mapeado para código registrado | Saída visual (sem contrato de asset: `MODEL_CAPABILITY_BLOCKED`) |
| Registry `model-profiles.json` 1.0 (3 vínculos sintéticos locais), carregado pelo `loadModelProfileRegistry` | Carregamento de chave de fingerprint de cofre (uso produtivo bloqueado) |
| Schemas de pedido, resposta do provider, entrada de catálogo, Model Profile e Model Call; definições compartilhadas em `common-definitions` 1.1 (`traceContext`, `requestFingerprint`, `attemptCallId`, `identifierLimits` etc.; a 1.0 segue publicada sem mudança) | Cost Ledger persistido no Supabase local (CR-027, Release 2.17): ver [COST-LEDGER-CONTRACTS](../product/marketing-ops/contracts/COST-LEDGER-CONTRACTS.md) |
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
| Contratos de resultado e erro | `packages/core/src/ai-model-harness/outcomes.ts` | Cada uma das 28 falhas internas mapeada para um código do Error Registry 1.5 (`budget_not_configured` → `BUDGET_NOT_CONFIGURED`; `ledger_unavailable` → `INTEGRATION_UNAVAILABLE`, só antes da aquisição; `attempt_close_rejected` → `INVALID_STATE_TRANSITION`, só para rejeição explícita; `attempt_close_unconfirmed` → `MODEL_ATTEMPT_CLOSE_UNCONFIRMED`) |
| Model Registry | `…/model-registry.ts` | Capacidade, modalidades, parâmetros suportados, limites, tarifa versionada em micro-USD inteiros, política de dados, evidência de qualidade |
| Model Profiles | `…/model-profile.ts` | Versão, `agent + action`, requisitos, candidatos, allowlists, amostragem, limites (`timeoutMs` ≤ 840 000, Model Profile Schema 1.1), entitlement; validação e configuração com falha fechada; `leaseSecondsFor(timeoutMs) = max(60, ceil(timeoutMs/1000) + 60)` |
| Validação de fronteira | `…/invocation-validation.ts` | `TraceContext`, pedido e limites, semântica de imagens, cota conservadora de tokens, fingerprint e resposta do adapter por modalidade; quantidades como inteiros seguros não negativos |
| UTF-8 | `…/utf8.ts` | Tamanho e bytes UTF-8, detecção de surrogate isolado e base64url para o `callId`; codificação, não criptografia |
| Portas | `…/ports.ts` | Provider, Cost Ledger (`acquireAttempt` com `callId`, `agentKey`, fingerprint, aceitos e `profileTimeoutMs`; `closeAttempt` atômico com o Model Call Record; `remaining` consultivo), recuperação (`AttemptRecoveryPort.expireNext`), fingerprint, política do tenant, entitlement, disponibilidade/kill switch, prazo, classificação, estimador de tokens, assets gerados |
| Router | `…/router.ts` | Elegibilidade e escolha; `ordered_preference` ou `lowest_cost_above_threshold` |
| Caso de uso | `…/invoke-model.ts` | Tentativas, retry técnico, fallback revalidado, fechamento atômico (liquidação + registro) |
| Recuperação | `…/recover-expired-attempts.ts` | Sweep em lote, uma tentativa por operação do Ledger, sem instante informado |
| Cost Ledger persistente | `packages/infra/src/ai-model-harness/persistent-cost-ledger.ts` | `PersistentCostLedger` (worker: acquire, close, remaining, sweep) e `CostLedgerOperations` (operador: períodos e conciliação) sobre as funções `app.*` do schema `finops`; lease derivado do perfil no adapter |
| Test Adapter | `packages/infra/src/ai-model-harness/test-model-provider.ts` | Determinístico, no processo, sem rede, com falhas roteirizáveis; estimador exato dos próprios modelos; não produz assets visuais |
| Catálogo congelado | `…/frozen-registry-catalog.ts` | Lê `agents.json`/`actions.json` somente para validar vínculos |
| Catálogo local | `…/local-test-catalog.ts` | Três modelos do Test Adapter e três perfis sintéticos; tarifa zero e teto de custo zero |
| Fingerprint HMAC | `…/hmac-fingerprint.ts` | HMAC-SHA-256 de `node:crypto`, keyring com chave ativa e anteriores, formato `hmac-sha256:v1:<keyId>:<hex>`; chave externa de idempotência opaca `oik1-<hex>` derivada do `callId` com separação de domínio; chaves fornecidas pelo chamador (sem cofre neste slice) |
| Composition root | `…/local-composition.ts` | Habilita só o adapter `test`; exige as portas de classificação e de fingerprint; não fornece porta de assets (visual bloqueado); não lê ambiente |
| Fakes | `packages/testing/src/ai-model-harness.ts` | Ledger em memória com as regras do persistente (aquisição por tenant, `budget_not_configured`, fechamento com token, replay exato, registro no fechamento), classificador por tenant, assets gerados, estimador fixo, políticas, disponibilidade, prazo manual, provider roteirizado |

## 2. Regras garantidas por código e teste

1. O chamador nunca escolhe modelo, fornecedor, temperatura ou outro parâmetro: o request não tem esses campos.
2. Perfil só é aceito se `agent` e `action` existem nos registries congelados e o agent é dono ou chamador autorizado da action. Dois perfis ativos na mesma rota invalidam a configuração.
3. Cada tentativa, inclusive retry e fallback, roda o Router outra vez com orçamento e disponibilidade atualizados. Fallback nunca repete modelo esgotado e não relaxa allowlist, privacidade, kill switch ou orçamento.
4. Política do tenant só restringe; política devolvida para outro tenant é recusada.
5. Modelo `experimental` só recebe dado `synthetic`, e só se o perfil permitir.
6. Sem tarifa válida não há chamada; rota de imagem exige tarifa por imagem.
7. Cada tentativa `invocationId#attempt` é adquirida numa única operação atômica, junto com a reserva de orçamento. Só a execução que recebe `acquired` chama o provider; outra execução simultânea recebe `in_progress` e uma posterior recebe `closed`, ambas sem chamada. Cobrança incerta retém a reserva e registra custo `null`/`pending_reconciliation`, nunca zero. O fechamento (transição, contadores, lançamentos e Model Call Record) é uma única operação; fechamento recusado explicitamente encerra a invocação com `INVALID_STATE_TRANSITION`; fechamento que lança é reenviado uma única vez com o mesmo comando (mesmo token, valores e registro) — replay idempotente do Ledger, não retry da invocação: o provider não é chamado de novo e não há fallback. `closed`/`duplicate` confirmam; nova exceção devolve `MODEL_ATTEMPT_CLOSE_UNCONFIRMED`, sem saída, e a tentativa fica reservada para o sweep ou a conciliação. Tenant sem período vigente recebe `BUDGET_NOT_CONFIGURED` sem chamada.
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
// Cost Ledger persistente no Supabase local (ou o fake em memória nos testes unitários).
const budget = new PersistentCostLedger(criarUnitOfWork({ connectionString: workerLocal }), { leaseOwner });
const harness = createLocalModelHarness({ budget, entitlements, classifier, fingerprints });
const r = await harness.invoke({
  invocationId, tenantId, workflowKey: "copy-review",
  agentKey: "copywriting-agent", actionKey: "create_ad_copy",
  trace: { correlationId, transactionId, causationId: null, parentTransactionId: null, workflowId, taskId, runId },
  classification: { sources: [{ kind: "context_package", ref: contextPackageId }], declared: null },
  messages, inputModalities: ["text"],
});
// r.ok && r.output.modality === "text" && r.output.text
```

`budget`, `classifier` e `fingerprints` são obrigatórios: o Cost Ledger é `PersistentCostLedger` (Supabase local) ou o fake `InMemoryBudgetGuard`; ainda não há campo canônico de classificação no Context Package nem carregamento de segredo. O Model Call Record é gravado pelo `closeAttempt`, não por uma porta separada. Comportamentos de falha: `new TestModelProviderAdapter({ behaviors: { "oplyra-test/text-economy": ["timeout", "success"] } })`.

## 4. Verificação

| Suíte | Arquivo | Cobertura |
| --- | --- | --- |
| Unidade — Router e configuração | `packages/core/test/ai-model-harness-router.test.ts` | Seleção, determinismo, capability, allowlists, kill switch, privacidade, tarifa, orçamento, validação de perfis e registry |
| Unidade — caso de uso e isolamento | `packages/testing/test/ai-model-harness-invoke.test.ts` | Retry/fallback revalidados, liquidação, prazo, repetição, contrato de erro, isolamento entre tenants |
| Unidade — fechamento | `packages/testing/test/ai-model-harness-close-replay.test.ts` | Exceção depois/antes do commit com replay idêntico (`duplicate`/`closed`), duas exceções (`MODEL_ATTEMPT_CLOSE_UNCONFIRMED`), `rejected` explícito (`INVALID_STATE_TRANSITION`), provider chamado uma vez e sem fallback |
| Unidade — fronteiras | `packages/testing/test/ai-model-harness-boundaries.test.ts` | Concorrência (2 e 10 execuções → 1 chamada), números inválidos no pedido, resposta inválida do adapter sem liquidação, semântica de imagens, propagação de trace |
| Unidade — lacunas contratuais | `packages/testing/test/ai-model-harness-contract-gaps.test.ts` | Material e fingerprint protegido (campos, formato, sem prompt), `callId` no escopo completo (tenants, actions, `/`, `#`, `%`, Unicode, limite), surrogate isolado sem efeitos, limites de identificador, `callId` recebido pelo adapter, mesma invocation em actions diferentes, rotação de chave, prompt ausente de registro/reserva/logs, mesma chave com pedido igual/diferente, conflito com tentativa em andamento, escopo por tenant, downgrade e proveniência de classificação, estimativa com dica zero/subestimada, limites de mensagens, saída visual (bloqueio, zero outputs, refs válidos, excesso, binário inline, outro tenant, outra tentativa) |
| Fingerprint HMAC | `packages/infra/test/hmac-fingerprint.test.ts` | Determinismo com a mesma chave, equivalência com `createHmac`, digest diferente com outro segredo ou outra chave/versão, rotação, validação das chaves, saída sem material nem segredo; chave externa opaca, determinística, com separação de domínio; Test Adapter sem identificador interno cru |
| Adapter | `packages/infra/test/test-model-provider.test.ts` | Determinismo, independência entre chamadas, roteiros de falha |
| Integração local | `test/ai-model-harness.integration.test.ts` | Composition root + Test Adapter + registries congelados reais |
| Arquitetura | `test/ai-model-harness.arquitetura.test.ts` | Regra de dependência, ausência de fornecedor/amostragem/ambiente/rede |
| Contrato | `test/contracts/ai-model-harness.contract.test.ts` | Error Registry 1.5 com os 12 códigos do CR-026, `BUDGET_NOT_CONFIGURED` e `MODEL_ATTEMPT_CLOSE_UNCONFIRMED`; toda falha do harness com código registrado e mesmo `retryable`; CR-026 aplicado; hashes da Release 2.15 como referência histórica; `external_provider` no enum do schema; `errors.validation.json` derivado; hashes dos registries iguais ao manifest v2.15 |
| Contrato — schemas e fixtures | `test/contracts/ai-model-harness-schemas.contract.test.ts` | Schemas novos só com keywords executáveis; fixtures válidas aceitas por schema e runtime; inválidas recusadas pelo motivo declarado; `-business-invariant` recusadas pelo runtime ou pelo harness (downgrade, conflito de idempotência); registry de Model Profiles e catálogo operacional |
| Release 2.16 (histórico) | `test/contracts/contract-registry-release-2.16.contract.test.ts` | Relatório 2.16 íntegro pelo manifest; artefatos herdados idênticos à Release 2.15; artefatos do CR-026 não tocados pelo CR-027 idênticos ao disco; recalcula o `aggregateDigest` |
| Release 2.17 | `test/contracts/contract-registry-release-2.17.contract.test.ts` | Reexecuta a cross-validation (75 checks) e confere o relatório; manifest como mudança lógica sobre a 2.16 |
| Cost Ledger — banco | `supabase/tests/finops_ledger_privileges.test.sql`, `supabase/tests/finops_ledger_behavior.test.sql` | RLS forçada, privilégios efetivos, hardening; transições, relógio, lease, replay, sweep, conciliação, períodos, contadores = diário |
| Cost Ledger — integração | `test/cost-ledger.integration.test.ts` | Adapter persistente, `invokeModel` ponta a ponta, isolamento, rotação entre processos, snapshots contra os schemas |
| Cost Ledger — concorrência | `packages/infra/test/cost-ledger-concurrency.integration.test.ts` | 20 aquisições da mesma chave, disputa de saldo, backend morto, close × sweep, carga mista sem deadlock, relógio manipulado, grafo de locks |

## 5. Fora deste slice

- (Aplicado na Release 2.17, somente local) Cost Ledger persistido, reserva transacional e RLS forçada (CR-027). Escopos de workflow run e plataforma, geração automática de períodos, retenção e conciliação automática continuam fora (D-1, D-3, D-5).
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
- A exclusividade por tentativa entre processos é garantida pelo Ledger persistente (lock de identidade + linha); os fakes só dentro de um processo. Tentativa deixada `reserved` por queda vai para `pending_reconciliation (lease_expired)` pelo sweep, sem registro, e só sai por conciliação do operador.
- O fingerprint usa HMAC com chave, mas o carregamento de segredo de um cofre não existe: sem adapter produtivo de chaves, o uso em produção fica bloqueado. Chave retirada do keyring antes do fim da retenção das tentativas faz reentregas legítimas virarem conflito (falha fechada, sem chamada).
- Resposta visual descartada pode deixar assets órfãos já gravados pelo adapter; por decisão, seus ids não entram no registro (`outputAssetIds: null`), então a limpeza depende do armazenamento de assets, pela proveniência `producedByCallId`.
- O `tsconfig` do pacote `testing` passou a declarar os tipos do Node, porque os testes do harness usam o adapter HMAC real da infraestrutura.
- Os fakes de orçamento não provam atomicidade sob concorrência real; essa prova está nos testes de concorrência do Ledger persistente.
- O Ledger persistente só aceita tenant em UUID canônico (minúsculas); outro formato é recusado (`invalid`) antes do banco.
