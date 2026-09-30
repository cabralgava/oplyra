# CR-030 — Product AI Documentation Baseline Reconciliation

**Status:** `approved_and_applied`
**Approved by:** project owner, 30/09/2026 (scope, all 63 pre-existing hunks, N-1 to N-7 and the two additional corrections; see §11)
**Applied at:** 2026-09-30 (local only; see "Application record")
**Classification:** `documentation_reconciliation_no_registry_or_schema_change`
**Issued at:** 2026-09-30
**Base:** commit `38ec4af36b704d8c3aa49efc89a6393e5ddb5e42`, Contract Registry Release 2.19 (CR-029)
**Target:** Contract Registry Release 2.20 (applied)
**Origin:** worktree audit of 2026-09-30 (36 remaining changes); related applied changes: [CR-026](CR-026-product-ai-model-harness-contracts.md), [CR-027](CR-027-persistent-cost-ledger.md)

## 1. Objective

Consolidate, in the product and decision documentation, the decisions already approved about the multi-provider architecture, **OpenRouter as the initial, non-exclusive gateway**, Model Profiles, Test Adapter, Router and Cost Ledger, aligning the text with the state **actually applied** by CR-026 (Release 2.16) and CR-027 (Release 2.17). No code, migration, registry, schema, fixture, existing manifest or operational behavior changes; no partial implementation is presented as a complete runtime.

**Audit count (corrected).** The 36 remaining files were classified as: A — ready under the original audit: **17**; B — needs CR/Release: **7**; C — needs review: **10**; D — local operational: **0**; E — deferred: **2**. (The counts 24/9 of the first audit message are void.)

## 2. Scope — exactly 20 files

`docs/decisions/ADR-0006-runtime-de-agentes.md`, `docs/decisions/ADR-0007-entitlements-e-billing.md`, `docs/decisions/README.md`, `docs/product/marketing-ops/01-product-requirements.md` … `12-roadmap.md` (twelve files, 01 to 12), `13-ai-model-routing-finops.md`, `17-risks-costs.md`, `18-technical-experiments.md`, `ATUALIZACOES.md` and `README.md` (product index). Nothing else enters this CR or its release.

**Explicitly out of scope:** `CLAUDE.md`, the root `README.md`, the Developer Harness (the future **CR-031**, not defined or implemented here), Claude/MCP configuration, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, the guard scripts, the integration tests, the harness documents (`DEVELOPMENT-TOOLS.md`, `AUTONOMOUS-BUILD.md`, `SYSTEM-TEST-USERS.md`, `DESENVOLVIMENTO.md`) and `ESTADO.md`.

## 3. Rules

1. Every pre-existing hunk of the 20 files is inventoried (§4) and must be **approved by the owner hunk by hunk** before implementation; no earlier edit is approved generically or enters a digest incidentally.
2. Hunks are tagged: **V** (mere v2.2 → v2.3 update), **DEC** (DEC-019/020 and anchoring), **OR** (OpenRouter decision), **MP** (multi-provider architecture), **MPR** (Model Profiles state), **RT** (Router / Test Adapter state), **CL** (Cost Ledger state), **EXP5** (proposals still dependent on EXP-05), **NA** (runtime, queues and real adapters not authorized), **ST** (status of decisions or experiments), **EVAL** (evaluation criteria).
3. Implementation state is described only as evidenced: the **Product AI Model Harness slice 1** (ports, Test Adapter, Registry, Model Profiles by `agent + action`, Router, `invokeModel`) and the **persistent Cost Ledger on local Supabase** are implemented; the **Product Agent Runtime, queues/scheduler at product level, any real provider adapter (OpenRouter or direct), keys, accounts, paid calls, visual output and production** are **not** authorized or enabled.
4. Preserved: OpenRouter as default initial gateway **but not exclusive**; production model and temperature selection conditioned on EXP-05; direct adapters possible; fake/replay as the local default (Test Adapter mandatory); no native video generation, editing or rendering (video is an input asset).

## 4. Inventory of pre-existing hunks (baseline `git diff -U0` against `38ec4af`)

Baseline SHA-256 of the 20 files on the day of this proposal (drift check; regenerated before application):

| File | SHA-256 (first…last 8) |
| --- | --- |
| `docs/decisions/ADR-0006-runtime-de-agentes.md` | `b4243f7f…dc326b3e` |
| `docs/decisions/ADR-0007-entitlements-e-billing.md` | `e5a2ad15…f1d1efc4` |
| `docs/decisions/README.md` | `be62d880…a657175c` |
| `01-product-requirements.md` | `7042ef36…1e561e7d` |
| `02-discovery.md` | `1b11e376…fc62c8de` |
| `03-domain-model.md` | `596b169c…054d6ddc` |
| `04-architecture.md` | `ed8a0153…2461d00b` |
| `05-data-model.md` | `041ccf9d…5552df4a` |
| `06-integrations.md` | `c7230759…8944617d` |
| `07-security-lgpd.md` | `ab264b25…ee7496f3` |
| `08-billing-entitlements.md` | `70382afa…a0295781` |
| `09-agentic-architecture.md` | `092d8a6d…4737b3d1` |
| `10-agent-catalog.md` | `5d7a77dc…02a65455` |
| `11-agent-governance.md` | `f6bee501…4db84e03` |
| `12-roadmap.md` | `918ea018…59a6ff91` |
| `13-ai-model-routing-finops.md` | `ce0b8264…086e36e2` |
| `17-risks-costs.md` | `884768fa…e1508f48` |
| `18-technical-experiments.md` | `38e1b8f9…dcb54f6b` |
| `ATUALIZACOES.md` | `b1098238…748b4eba` |
| `README.md` (product index) | `00b247ac…f4528931` |

### 4.1 Hunks (63 hunks; 200 insertions and 52 deletions across the 20 files)

Hunk ids are `<file>-<n>`; some rows group consecutive hunks of the same nature (for example the header hunks of ATUALIZACOES and the four evaluation hunks of doc 13); the per-file counts at the end of this section are authoritative. Lines are those of the current worktree file. "Mere V" hunks change only the authority/status header from v2.2 to v2.3.

| Hunk | Line(s) | Subject | Tags | Compatible with CR-026/027/028/029? | Proposed treatment |
| --- | --- | --- | --- | --- | --- |
| ADR6-1 | 3 | Status: OpenRouter as initial non-exclusive gateway; reference v2.3; profiles/parameters conditioned on EXP-05 | OR, MP, EXP5, V | yes | Keep; add distinction of §5 (C-4) |
| ADR6-2 | 12–13 | Ports; OpenRouter Adapter initial, Test Adapter mandatory, direct adapters possible; Router by `agent + action`; Model Profiles versioned | OR, MP, MPR, RT, EXP5 | yes | Keep |
| ADR6-3 | 24 | DP-09a: gateway decided; account, key, credits, spend still not authorized | OR, NA | yes | Keep |
| ADR7-1 | 3 | Reference v2.2 → v2.3 | V | yes | Keep |
| DEC-1 | 9 (new) | Reconciliation of 29/09: v2.3 confirmed; DEC-019/020 join the anchoring | V, DEC | yes | Keep |
| DEC-2 | 14 | Protected reference v2.3, DEC-001…020 | V, DEC | yes | Keep |
| DEC-3 | 16 | Anchoring rule; OpenRouter decision without DEC id | OR, V | yes | Keep |
| DEC-4 | 24–25 | ADR-0003 approved by EXP-01 (15/09); ADR-0004 approved for MVP design by EXP-02 (21/09) | ST | yes (matches ESTADO) | Keep |
| DEC-5 | 27 | ADR-0006 row: gateway decided; runtime/models conditioned to I-02/EXP-05 | OR, EXP5, NA | yes | Keep |
| DEC-6 | 32 | EXP-01/EXP-02 executed and approved; EXP-03 to EXP-05 not executed | ST | yes | Keep |
| DEC-7 | 69 | DP-04: pgmq + pg_cron + Node worker approved for MVP design | ST, NA | yes (design only, no product runtime implied) | Keep |
| DEC-8 | 80 | DP-09a: gateway decided 29/09; account, key, credits and spend not authorized | OR, NA | yes | Keep |
| P01-1 | 5 | Authority header v2.3 | V | yes | Keep |
| P01-2 | 7 | Status header v2.3 | V | yes | Keep |
| P01-3 | 97–99 (new) | Requirements: OpenRouter initial non-exclusive gateway; Model Profiles by `agent + action` (EXP-05); Test Adapter default local/CI, real calls need credential/budget/authorization | OR, MPR, RT, EXP5, NA | yes | Keep |
| P02-1, P03-1, P05-1, P07-1, P08-1, P10-1, P11-1 | 5 | Authority header v2.3 (one hunk per file) | V | yes | Keep |
| P04-1 | 5 | Authority header v2.3 | V | yes | Keep |
| P04-2 | 40–44 | Diagram: AI Model Router → OpenRouter Adapter (initial, non-exclusive), direct adapters, Test Adapter | MP, OR, RT | yes | Keep |
| P04-3 | 91 | Text: internal Router applies policy, fallback, budget, privacy; OpenRouter not in the domain | MP, OR, RT | yes | Keep |
| P04-4 | 102–103 (new) | Model, temperature, parameters in Model Profiles by `agent + action` (EXP-05); no account/key/credits/calls | MPR, EXP5, NA | yes | Keep |
| P06-1 | 5 | Authority header v2.3 | V | yes | Keep |
| P06-2 | 115–119 | "Approved initial gateway": OpenRouter via own adapter, non-exclusive | OR, MP | yes | Keep |
| P06-3 | 123 (new) | Candidate providers/models behind the gateway | MP | yes | Keep |
| P06-4 | 125 | No agent depends permanently on OpenRouter, a provider or a model; link via Model Profile; Test Adapter default; direct adapters possible | OR, MPR, RT | yes | Keep |
| P09-1 | 5 | Authority header v2.3 | V | yes | Keep |
| P09-2 | 44 | Agents never depend permanently on a vendor; choice via internal Router; OpenRouter initial | OR, MPR, EXP5 | yes | Keep |
| P12-1 | 5 | Authority header v2.3 | V | yes | Keep |
| P12-2 | 129 | I-02 row: Registry, Router, Model Profiles, OpenRouter Adapter initial, Test Adapter, Cost Ledger, budgets, Stripe test; real adapter disabled without account/key/budget | OR, RT, MPR, CL, NA | partial: does not say what is already delivered | Keep; add N-6 (§5) |
| P13-1 | 3–5 | Version 0.4, date, authority header v2.3 | V | yes | Keep |
| P13-2 | 11 | OpenRouter as initial default non-exclusive gateway; underlying providers | OR, MP | yes | Keep |
| P13-3 | 17–38 | §1.1 Harness boundary (Router → Port → Adapter → OpenRouter / direct / Test); §1.2 contractual status; "local implementation" paragraph | MP, RT, MPR, CL, NA | **partial / contradictory** (line 35 and line 37, §5 C-1, C-2) | Keep §1.1; correct §1.2 and paragraph via N-1, N-2 |
| P13-4 | 77–78 | Agent does not choose provider/model freely; resolution declarative and deterministic | RT | yes | Keep |
| P13-5, P13-6, P13-7, P13-8 | 87–88, 90–91, 96, 99 | Evaluation criteria added (instruction adherence, quality-gate adherence, tool selection, hallucination rate, usage, regressions) | EVAL, EXP5 | yes | Keep |
| P13-9 | 121–198 | §2.5 Model Profiles ("proposta controlada"); §2.5.1 sampling hypotheses (PROPOSED, EXP-05); §2.6 Ports/Adapters and OpenRouter; §2.7 Test Adapter; §2.8 external references | MPR, EXP5, OR, MP, RT, NA | partial: §2.5 heading and text still speak of a "future" profile although the registry exists (§5 C-3) | Keep content; correct state wording via N-3 |
| P13-10 | 227–237 | Fallback governance: revalidation and structured failure | RT | yes (implemented in the local harness) | Keep; state via N-3 |
| P13-11 | 350–355 | Observability of routing and calls; Cost Ledger analysis dimensions | CL | partial: does not mention the persistent local Ledger | Keep; add N-2 |
| P17-1 | 40–41 (new) | R-30 OpenRouter concentration; R-31 `:free` endpoints instability | OR, EXP5 | yes | Keep (governed file) |
| P18-1 | 149 | EXP-05 gateway and candidates via the OpenRouter Adapter, Test Adapter as control | OR, EXP5 | yes | Keep (governed file) |
| P18-2 | 165–167 (new) | Profile validation; `google/gemma-3-27b-it:free` experimental with synthetic data; effective provider/model registered | OR, MPR, EXP5 | yes | Keep (governed file) |
| ATU-1 | 3–4 | Reference v2.3 with SHA-256; last update 29/09 | V | yes | Keep |
| ATU-2 | 9, 11, 13 | v2.3 as protected reference; v2.2 historical only; precedence including docs 19–20 | V, DEC | yes | Keep |
| ATU-3 | 17, 19 | Anchoring against v2.3 §27; table header "ID in v2.3" | V, DEC | yes | Keep |
| ATU-4 | 37–38 (new + changed) | DEC-019 and DEC-020 rows; "five" post-reference decisions | DEC, OR | yes | Keep |
| ATU-5 | 48 (new) | Row "Gateway de IA": OpenRouter initial, non-exclusive; Test Adapter mandatory; profiles conditioned on EXP-05 | OR, MPR, EXP5 | yes | Keep; add N-7 |
| ATU-6 | 122, 124 | Document status table: 00 v2.3; 19–20 present and approved | V, DEC | yes | Keep |
| README-1 | 3 | Protected reference v2.3 | V | yes | Keep |
| README-2 | 12 | Table row 00 v2.3 | V | yes | Keep |
| README-3 | 31–32 (new) | Rows 19 and 20 | DEC | yes | Keep |
| README-4 | 40 | ADR-0001 to ADR-0009 | ST | yes | Keep |

`13-…` hunks P13-1…P13-11 are the 11 hunks of that file; every other file's hunks are listed above; the hunk counts per file at the proposal date are: ADR-0006 3, ADR-0007 1, decisions README 8, doc 01 3, docs 02/03/05/07/08/10/11 1 each, doc 04 4, doc 06 4, doc 09 2, doc 12 2, doc 13 11, doc 17 1, doc 18 2, ATUALIZACOES 11, product README 4.

## 5. Contradictions to correct (new hunks; approved 30/09/2026)

| Id | Where | Contradiction / gap | Correction proposed |
| --- | --- | --- | --- |
| C-1 / N-1 | doc 13 §1.2 (line 35) | Says the executable representation of Model Profiles, provider registry, routing policy and adapters "ainda é proposta" and cites manifest "v2.15 nesta revisão" | State that the **Model Profile registry, Model Profile schemas 1.0/1.1, request/response/catalog/Model Call schemas and Error Registry (1.4 → 1.5) are canonical** (CR-026, CR-027); production bindings of profiles to models depend on EXP-05; real provider adapters remain not implemented; refer to "the current manifest" without hard-coding a version |
| C-2 / N-2 | doc 13 paragraph after §1.2 (line 37) and §12.1 (line 355) | Says the Cost Ledger persisted is "bloqueado"; describes the slice as "tipos internos" | State that the **persistent Cost Ledger is implemented on local Supabase only** (CR-027: schema `finops`, atomic acquire/close, reconciliation, tenant isolation), with production integration pending; keep "no real adapter, no productive fingerprint key, visual output blocked" |
| C-3 / N-3 | doc 13 §2.5 heading and text (line 121 ff.), §12 fallback | "Model Profiles — proposta controlada" and "perfil futuro" although the registry exists | Rename to reflect: contract and registry implemented since Release 2.16; sampling values remain PROPOSED (EXP-05); fallback governance and Router determinism implemented and tested in the local harness; provider real pending |
| C-4 / N-4 | ADR-0006 (Status and line 28) | "Runtime próprio, filas e stack permanecem propostas; não há implementação autorizada nesta revisão" hides that the **Product AI Model Harness slice 1 is implemented locally** | Distinguish: Product AI Model Harness (ports, Test Adapter, Registry, Profiles, Router, `invokeModel`, persistent Ledger) **implemented locally and contractually frozen by CR-026/027**; Product Agent Runtime, product-level queues/scheduler, real adapters (OpenRouter or direct), keys, accounts, paid calls and production **remain proposed / not authorized** |
| N-5 | doc 05 §10 (and pointer in doc 04 §Cost Ledger) | Conceptual model does not point to the implemented `finops` schema | Add a one-line pointer to CR-027 / `COST-LEDGER-CONTRACTS`; conceptual naming unchanged |
| N-6 | doc 12 (I-02 row, line 129) | Row lists Cost Ledger/Router/Profiles as planned without what is already delivered | Add "slice 1 and local persistent Ledger delivered (CR-026/027); runtime, queues, real adapter and Stripe pending" |
| N-7 | ATUALIZACOES gateway row (line 48) | Does not say what is applied | Add pointer to CR-026/CR-027 applied state; no new decision |
| N-8 | all 20 files | No file may suggest a real adapter, key, account, paid call or production as enabled | Textual review; guarded by the check of §8 |

N-1 to N-4 are the corrections requested; N-5 to N-7 were approved as **mandatory** (not optional) on 30/09/2026. Two further corrections were approved with them: **N-9** — `ATUALIZACOES.md` "Última atualização" becomes 30/09/2026 and the document-status table reads ADRs 0001–0009; **N-10** — doc 13 documentary version becomes 0.5 and date 30 de setembro de 2026, because the reconciliation materially changes its contractual state.

## 6. Release 2.20

Logical change set over Release 2.19 (2.19 manifest, aggregate digest and report preserved). Registries, schemas, fixtures, code and migrations stay inherited without change.

**Governed today by the 2.19 manifest (become *modified*, source `cr_030`, category kept):**

| File | Recorded entry | SHA-256 recorded in manifest 2.19 |
| --- | --- | --- |
| `docs/decisions/README.md` | `cr_025` | `3216bcafae7a5fcee223d284cbe871089a8e467765f5064f81aa2b0b2145941e` |
| `17-risks-costs.md` | `cr_025` | `2c473b5800e7520fb162421032c93c36b20b9977cdb94bdf565baf65182fbcd4` |
| `18-technical-experiments.md` | `cr_025` | `35094fb9c712cdb7b8fae2005db8a29aa95f6cffc2df44df0d593372c8a7bc07` |

The disk content of these three differs from the recorded entry because of the pending hunks of §4 (DEC-1…DEC-8, P17-1, P18-1, P18-2): approving CR-030 is what brings them into the digest, hunk by hunk.

**New (become *added*, source `cr_030`):** the other 17 files — `ADR-0006`, `ADR-0007` (category `contract_decision`, as ADR-0004/0009) and docs 01–13, `ATUALIZACOES.md`, `README.md` (category `contract_documentation`, as doc 16).

**Additional artifacts of the release:** this CR (added, `change_proposal`); `contract-registry-manifest-v2.20.json` (not hashed in itself); `cross-registry-validation-v2.20.json` (added, `contract_documentation`); `test/contracts/contract-registry-release-2.20.contract.test.ts` (added, `contract_test`); historical adjustments: `test/contracts/contract-registry-release-2.19.contract.test.ts` and `test/contracts/cross-registry-validation.ts` (modified, source `cr_030`).

**Predicted classification:** 464 artifacts = 439 inherited, 5 modified (three documents, the runner and the 2.19 test), 20 added (17 documents, this CR, the 2.20 report, the 2.20 test), 0 unclassified. Nothing outside the 20 files (and the release artifacts above) may enter; `CLAUDE.md`, root `README.md`, harness documents, `ESTADO.md`, `package.json`, lock, workspace, guard, Claude/MCP configuration and integration tests are asserted absent from the manifest, or inherited unchanged when already present.

## 7. Historical tests

- The **Release 2.19 test becomes a frozen-manifest test** (as done for 2.18): it pins the 2.19 manifest SHA-256, aggregate digest and report SHA-256, recomputes digest and category summary, re-runs the classification against 2.18 (436/4/4/0), keeps the manifest-only guards, and no longer reads mutable worktree content or Git objects.
- The current-content assertions of the 2.19 test (doc 16, TST-19, `PREPARACAO-SUPABASE-PRODUCAO.md`, operational documents) move to the **2.20 test**, which validates the reconciled current documents together with the new ones.
- The runner moves to 2.20; the 2.19 report is preserved as a frozen file.

## 8. Test and mutation plan (documentation)

**New cross-validation checks (80 → 82):** `DOCS-cr030-product-ai-alignment` and `DOCS-cr030-no-enablement-claims`, covering: (a) doc 13 and ADR-0006 no longer say that Model Profiles/registry are only proposed or that the Cost Ledger persisted is blocked, and mention CR-026/CR-027; (b) ADR-0006 separates the Model Harness (implemented locally) from the Agent Runtime/queues (proposed); (c) OpenRouter appears as initial and **non-exclusive** in docs 04, 06, 09, ADR-0006 and ATUALIZACOES; (d) EXP-05 conditioning present for model/temperature; (e) authority headers of the 20 files point to v2.3 (a historical v2.2 mention is allowed only in dated records); (f) no statement that a real adapter, key, account, paid call or production is enabled; (g) no native video generation/editing/rendering.

**2.20 contract test:** cross-validation re-execution equals the report; classification against 2.19 (439/5/20/0, total 464); the 20 files are exactly the governed/added set; out-of-scope files absent; digest recomputation; content checks (a)–(g); documents' local links resolve.

**Directed mutations (documentation):** re-adding "ainda é proposta" for Model Profiles in doc 13; re-adding "Cost Ledger persistido … bloqueados"; ADR-0006 back to "não há implementação autorizada" without the distinction; one file's authority header back to v2.2; removing "não exclusivo" from OpenRouter mentions; adding "OpenRouter Adapter habilitado" / "chave configurada"; adding "geração de vídeo nativa"; a file outside the 20 (`CLAUDE.md`, `ESTADO.md`, `package.json`) entering the manifest; a governed document left unclassified; adulterating the pinned 2.19 hashes in the frozen test.

**Gates:** local link check, contract tests, cross-validation, `pnpm test:harness`, `pnpm verificar`, `git diff --check`, secret scan over tracked and untracked files, and byte-level preservation proof of every hunk not approved.

## 9. Future CR-031

The **Developer Harness** (Claude/MCP configuration, guard, package/lock/workspace, harness documents, `CLAUDE.md`, root `README.md`, integration-test determinism) is registered as a future **CR-031**. It is neither defined nor implemented here, and nothing in CR-030 depends on it.

## 10. Risks

| ID | Risk | Mitigation |
| --- | --- | --- |
| R-1 | An earlier owner hunk enters the digest unapproved | Hunk-by-hunk approval (§3.1, §4); baseline hashes (§4) re-checked before application |
| R-2 | Documentation overstates the implementation (real adapter, runtime) | Rule §3.3, check (f), mutations |
| R-3 | Documentation understates it (Ledger, profiles) | Corrections N-1 to N-4, check (a)/(b) |
| R-4 | Governing 17 docs increases the change-request load | Accepted for these normative documents; operational documents stay outside |
| R-5 | The frozen 2.19 test loses coverage | Coverage moves to the 2.20 test; digest, report and classification stay pinned |

## 11. Owner decisions (30/09/2026)

1. The 20-file scope is approved. 2. All 63 pre-existing hunks of §4 are approved. 3. N-1, N-2, N-3 and N-4 are approved. 4. N-5, N-6 and N-7 are approved as mandatory: docs 04 and 05 receive the factual pointer to CR-027 / `COST-LEDGER-CONTRACTS`; doc 12 distinguishes slice 1 and the Ledger (delivered) from the runtime, queues, real adapter and Stripe (pending); `ATUALIZACOES.md` points to the applied state of CR-026/027. 5. N-9 and N-10 are approved (§5). 6. Preserved without change: OpenRouter as initial default, **non-exclusive** gateway; direct adapters possible; Test Adapter/fake/replay as the local default; production models and parameters conditioned on EXP-05; no real adapter, account, key, credit, paid call or production enabled; video only as an input asset, with no native generation, editing or rendering. 7. The text distinguishes what is **implemented** (Product AI Model Harness slice 1 and the local persistent Cost Ledger) from what is **pending or unauthorized** (Product Agent Runtime, product queues/scheduler, Stripe integration, real adapters and production). 9. Release 2.20 has exactly 464 artifacts: 439 inherited, 5 modified, 20 added, 0 unclassified. 10. The 2.19 historical test validates only the frozen manifest (no Git, no worktree); the 2.20 test assumes the current checks. 11. Every documentary mutation of §8 is executed. 13. Files outside the scope — including everything belonging to the future CR-031 and `ESTADO.md` — are preserved byte for byte.

## Approval requested

(Approved on 30/09/2026 as recorded in §11.) The request was to approve or adjust: the 20-file scope (§2); each hunk of §4 (or groups of them); the corrections N-1 to N-4 and optional N-5 to N-7 (§5); the classification of Release 2.20 (§6); the historical-test treatment (§7); and the test/mutation plan (§8). Without approval nothing here is applied and no Release 2.20 is emitted.

## Application record

**Approval.** Project owner, 30/09/2026, with the decisions of §11.

**Applied hunks (new, over the approved baseline).** Doc 13: §1.2 state paragraph (N-1), CR-026/CR-027 paragraph with the local persistent Cost Ledger and the pending list (N-2), §2.5 heading/state/wording, router determinism and fallback governance sentences (N-3), §12.1 Ledger sentence (N-2), version 0.5 and date 30/09/2026 (N-10). ADR-0006: Status "Estado aplicado" and the consequences line (N-4). Doc 05 §10 and doc 04: pointer to CR-027 / `COST-LEDGER-CONTRACTS` (N-5). Doc 12: I-02 row with delivered/pending (N-6). `ATUALIZACOES.md`: "Estado aplicado" in the gateway row (N-7), date 30/09/2026 and ADRs 0001–0009 (N-9). Files not listed here received no new hunk.

**Preservation proof.** Reversing exactly the applied edits on copies of the six edited files reproduces, byte for byte, the SHA-256 recorded in §4 for each of them; the other 14 files of the scope keep the §4 SHA-256; therefore the 63 approved pre-existing hunks are intact and no new hunk exists beyond those above.

**Release 2.20.** Logical change set over Release 2.19: 464 artifacts, 439 inherited, 5 modified (`decisions/README.md`, `17-risks-costs.md`, `18-technical-experiments.md`, `cross-registry-validation.ts`, the 2.19 test), 20 added (17 documents, this CR, the 2.20 report, the 2.20 test), 0 unclassified. `ESTADO.md` and the future CR-031 files are outside the release and untouched. Manifest, aggregate digest and report hashes are recorded in the manifest itself and in the delivery report.

**Gates (local, 30/09/2026).** Link check of the 20 files (also a test); contract tests 253 in 16 files; full Vitest 758 in 45 files; cross-validation 82/82; 20 of 20 documentary mutations detected (Model Profiles "apenas propostos"; Cost Ledger "bloqueado"; "proposta controlada"; manifest v2.15 pin; ADR-0006 hiding the slice; OpenRouter without "sem exclusividade"/"não exclusivo" in doc 06, ADR-0006 and ATUALIZACOES; adapter, key and production shown as enabled; native video generation; authority v2.2; ATUALIZACOES back to ADRs 0001–0008 and to the old date; doc 13 with the old version/date; doc 12 without the delivered/pending split; doc 05 without the Ledger pointer; an out-of-scope file in the manifest; a governed document missing from the change set; a tampered pinned 2.19 hash). Remaining gates (`pnpm test:harness`, `pnpm verificar`, `git diff --check`, secret scan) are recorded in the delivery report. No commit, push, PR, deploy or remote action.

**Limitations.** The documentary checks are textual (regular expressions over the 20 files); they detect regressions to known wordings and enablement claims, not every possible paraphrase. Product Agent Runtime, product queues/scheduler, Stripe integration, real adapters, accounts, keys, paid calls and production remain pending or unauthorized; the Developer Harness is deferred to CR-031.
