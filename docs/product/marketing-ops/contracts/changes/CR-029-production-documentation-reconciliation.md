# CR-029 — Production Documentation Reconciliation

**Status:** `approved_and_applied`
**Approved by:** project owner, 30/09/2026, conditioned on the decisions of §5 (all incorporated below)
**Applied at:** 2026-09-30 (local only; see "Application record")
**Classification:** `documentation_reconciliation_no_registry_or_schema_change`
**Issued at:** 2026-09-30
**Base:** commit `fe058f3fad7621a9431943f5e7d9d1727d08d92b`, Contract Registry Release 2.18 (CR-028)
**Target:** Contract Registry Release 2.19 (applied)
**Origin:** deferral recorded in [CR-028](CR-028-production-readiness-hardening.md) (Implementation decisions, item 5)

## 1. Problem

CR-028 removed `OPLYRA_ALLOW_REMOTE` and introduced project ref, environment fingerprint, `TrustedDeploymentContext` and canonical auth endpoints. The CR-028 hunks in three documents were reverted because those files carried the owner's earlier, uncommitted edits in a mixed worktree. Three documents therefore still described a retired control, and the test plan (TST-19) and the verification protocol carried stale statements. The authority was CR-028, `environments/SECRETS-AND-IDENTITIES.md` and `packages/infra/src/config.ts`.

## 2. Scope

The **set of artifacts of the Contract Registry Release changes** (Release 2.19 modifies and adds governed documents and tests). There is **no change to any registry, schema or fixture, no product code, no migration, no existing manifest and no operational behavior**.

1. **Doc 16 (governed, modified inside Release 2.19).** §3: `local`/`ci` refuse any remote endpoint; `OPLYRA_ALLOW_REMOTE` removed and its presence stops startup; production requires `SUPABASE_PROJECT_REF`, `OPLYRA_ENVIRONMENT_FINGERPRINT` and a `TrustedDeploymentContext` (allowlist empty: production fails closed); `SUPABASE_URL` accepts only an empty or `/` path, without userinfo, query or fragment; issuer and JWKS are derived from it. §4: the `OPLYRA_ALLOW_REMOTE` row is replaced by `SUPABASE_PROJECT_REF` and `OPLYRA_ENVIRONMENT_FINGERPRINT`; the `SUPABASE_JWT_ISSUER` / `SUPABASE_JWKS_URL` row states they are optional and accepted only when identical to the canonical endpoints.
2. **`15-test-plan.md` (governed, added to the manifest as `contract_documentation`).** TST-19 reads: `local`/`ci` with any remote endpoint (database or Supabase) fail at startup; the presence of `OPLYRA_ALLOW_REMOTE`, with any value, also fails (CR-028). No opt-in is suggested. Only that row changes.
3. **`PREPARACAO-I01.md` (operational, outside the manifest).** §5 item 2 and criterion A14 are marked **superseded by CR-028**; the original criterion text and the I-01 acceptance of 16/09/2026 are preserved verbatim.
4. **`VERIFICACOES.md` (operational, outside the manifest).** Only statuses contradicted by CR-026, CR-027 and CR-028 were updated (Local First, Provider independence, Model Profiles, Routing determinism, Fallback governance, Cost observability), without widening any state beyond existing evidence; volatile counts (migrations, tests, last-gate manifest version) were replaced by a pointer to `ESTADO.md`, which keeps the current evidence; the command catalog and its purposes are unchanged; the command-safety sentence states the current Local First barrier.
5. **`ESTADO.md` (operational, outside the manifest).** The 30/09/2026 situation is preserved; after the release is generated, only the factual lines that mark CR-029 as applied and Release 2.19 as current are updated.
6. **`PREPARACAO-SUPABASE-PRODUCAO.md` (governed, modified inside Release 2.19).** Only the paragraph that announced the deferred reconciliation is replaced by a completion record (reconciliation concluded by CR-029, Release 2.19, 30/09/2026; doc 16, PREPARACAO-I01, VERIFICACOES and TST-19 aligned; `DEVELOPMENT-TOOLS.md` remains a separate operational pendency; no remote action or production authorization created). Everything else in the file is preserved byte for byte.
7. **Deferred:** `docs/harness/DEVELOPMENT-TOOLS.md` (untracked, earlier owner content not consolidated) stays out of scope and out of the release; its incompatible sentence is recorded as a documentation pendency (F-2).

## 3. Findings

Search over `docs/`, `supabase/`, `test/`, `packages/`, `apps/`, registries, schemas and fixtures for `OPLYRA_ALLOW_REMOTE`, remote-host opt-in wording, `pg_trigger_depth`, `ensure_tenant_keeps_owner` and non-canonical issuer/JWKS.

| # | Artifact | Finding | Treatment |
| --- | --- | --- | --- |
| F-1 | `15-test-plan.md` (TST-19) | Described the retired flag | **Reconciled** (§2.2) |
| F-2 | `docs/harness/DEVELOPMENT-TOOLS.md` line 89 | "falhar fechada se apontar para host remoto sem autorização explícita" implies an authorization path that no longer exists in `local`/`ci` | **Deferred; documentation pendency.** Untracked file with earlier content not consolidated; it enters no release without a separate, full review of the whole file |
| F-3 | `changes/CR-027-persistent-cost-ledger.md` (§12, application item 5) | Describes the Ledger delete guards with `pg_trigger_depth()`; D-18 replaced the mechanism | Not edited: applied, historical CR |
| F-4 | `supabase/migrations/20260915000005_last_owner_guard.sql` | Still defines `app.ensure_tenant_keeps_owner()` | Not edited: migrations are immutable; 000015 drops the function |
| F-5 | `docs/harness/PREPARACAO-SUPABASE-PRODUCAO.md` (governed, `cr_028`) | Its paragraph announcing the deferral became factually false once this CR was applied (it said the reconciliation was pending and that doc 16, PREPARACAO-I01 and VERIFICACOES still cited the flag as current) | **Reconciled inside Release 2.19** (§2.6): only that paragraph is replaced by a completion record; the rest of the file is byte-identical. Modified artifact, source `cr_029`, inherited category `environment_plan` |
| F-6 | Registries, schemas, fixtures, `contracts-README.md` | No occurrence | None |

## 4. Release 2.19

Logical change set over Release 2.18 (2.18 manifest SHA-256 `2fca9e53d241430005cf5091fd98be063d5de4e98031d84701ec3dfab3bcd7b2` preserved; chain 2.17 → 2.18 → 2.19). Every artifact is classified as inherited, modified or added; none is unclassified.

**Manifest changes.** Modified (source `cr_029`): `16-environments-release.md`, `PREPARACAO-SUPABASE-PRODUCAO.md` (category `environment_plan`), `test/contracts/cross-registry-validation.ts`, `test/contracts/contract-registry-release-2.18.contract.test.ts`. Added (source `cr_029`): `15-test-plan.md`, this CR, `cross-registry-validation-v2.19.json`, `test/contracts/contract-registry-release-2.19.contract.test.ts`. Everything else is inherited with its 2.18 entry.

**Operational documents updated outside the artifact set and outside the digest:** `PREPARACAO-I01.md`, `VERIFICACOES.md`, `ESTADO.md` (also recorded in the manifest at `changeSet.operationalDocumentsUpdatedOutsideRelease`). `DEVELOPMENT-TOOLS.md` is deferred (`changeSet.operationalDocumentsDeferred`).

### 4.1 Historical tests

- The **Release 2.18 test validates the frozen manifest**, not the mutable worktree, and does not depend on Git objects, full history or the availability of commit `fe058f3`: it pins the SHA-256 of the 2.18 manifest, its aggregate digest, the 2.18 report and the 2.17 base; recomputes digest and category summary; re-runs the classification against 2.17 (420 inherited, 6 modified, 14 added, 0 unclassified); and keeps the manifest-only guards (no `excludedFromDigest*` field, doc 16 inherited with its 2.17 entry, operational documents absent, migration 000015 hash).
- The **Release 2.19 test validates the current reconciled documents** and the current content of the artifacts of this CR and of those inherited from CR-028, plus the 80-check cross-validation, the absence of the phrase "Reconciliação documental adiada" in `PREPARACAO-SUPABASE-PRODUCAO.md` and the presence of its completion record, the classification against 2.18, and that operational documents are not in the manifest.
- The cross-validation runner moves to 2.19 with two new checks (governed documents; operational documents outside the digest); the 2.18 report is preserved as a frozen file.

### 4.2 Governance (owner decision: option B)

`PREPARACAO-I01.md` and `VERIFICACOES.md` remain **operational documents outside the manifest**: CR-029 may update them selectively, with preservation proof, but they do not become governed artifacts. Their content changes with every increment (counts, commands, gate status); governing them would require a change request for routine evidence updates. Doc 16 remains governed and is modified inside the release; editing it outside the release is not an option.

## 5. Owner decisions and hunk approvals

| Hunk | File | Subject | Decision |
| --- | --- | --- | --- |
| H16-1 | doc 16 §4 | `OPENROUTER_API_KEY`, direct-provider keys, `AI_EXECUTION_MODE` | Approved unchanged (baseline of Release 2.19) |
| HP-1 | PREPARACAO-I01 line 5 | Historical banner (v2.2 → v2.3) | Approved unchanged |
| HV-1 | VERIFICACOES line 5 | Introduction | Approved unchanged |
| HV-2 | VERIFICACOES gate table | Gate table | Approved; only states contradicted by CR-026/027/028 refreshed (§2.4) |
| HV-3, HV-4, HV-5 | VERIFICACOES | Volatile counts | Replaced by a pointer to `ESTADO.md`; no counts written again |
| HV-6 | VERIFICACOES command rows | `test:harness`, `harness:tools`, `harness:mcp`, `claude:local` | Approved unchanged |
| HV-7 / HP-2 | VERIFICACOES sentence; PREPARACAO-I01 item 2 and A14 | Original text describing the flag | Reconciled / marked superseded; original criterion preserved |

## 6. Risks

| ID | Risk | Mitigation |
| --- | --- | --- |
| R-1 | Line-level edits drop or alter an owner edit | Pre-change copies; line diff limited to the intended hunks; SHA-256 recorded (application record) |
| R-2 | Rewriting the I-01 acceptance history | `PREPARACAO-I01.md` only annotated; criterion text preserved |
| R-3 | Documents contradict each other until the reconciliation | `ESTADO.md`, CR-028 and CR-029 state the authority |
| R-4 | An owner hunk enters the digest without approval | Governed documents touched: doc 16, `15-test-plan.md` and `PREPARACAO-SUPABASE-PRODUCAO.md` (committed, no pending owner edits); the only pre-existing hunk in doc 16 (H16-1) was approved; `15-test-plan.md` had none |
| R-5 | Operational documents drift from the manifest | Not governed by design (option B); the release test and the cross-validation carry non-digest consistency checks |

## Application record

**Approval.** Project owner, 30/09/2026, with the decisions of §5.

**Diffs applied (relative to the pre-change copies).**

| Document | Lines changed | Content |
| --- | --- | --- |
| `16-environments-release.md` | 3 removed, 4 added | §3 startup-validation bullet; `SUPABASE_JWT_ISSUER` / `SUPABASE_JWKS_URL` row; `OPLYRA_ALLOW_REMOTE` row replaced by `SUPABASE_PROJECT_REF` and `OPLYRA_ENVIRONMENT_FINGERPRINT` |
| `15-test-plan.md` | 1 | TST-19 |
| `PREPARACAO-SUPABASE-PRODUCAO.md` | 1 paragraph | "Reconciliação documental adiada" replaced by a completion record (governed; inside Release 2.19) |
| `PREPARACAO-I01.md` | 2 | Item 2 note and A14 marked superseded by CR-028 |
| `VERIFICACOES.md` | 11 | Local First row; Provider independence, Model Profiles, Routing determinism, Fallback governance and Cost observability states; command-section intro, `db:reset`, `test` and `test:db` rows; command-safety sentence |

**Pre-change SHA-256.** doc 16 `7f02df2d44331aad5332183ba3d111b35358a9a523a9e89760146d3c09ab6b43`; `PREPARACAO-I01.md` `aaf05670b4343b29f3d9b34c31abeb5a28cd57b37c5b342f121d3d1494ca4294`; `VERIFICACOES.md` `c319779ea59401869ae69e12f10a7c0cf9834edf66ac5cc42a55c041fee753ee`; `15-test-plan.md` `0a56aac834631a8276a83893755ffeae1fbc86e5d5f7786a22085bd2a0e7bda2`. **Post-change SHA-256 (operational documents, outside the digest).** `PREPARACAO-I01.md` `99194da29e8cd1afa559873151592c493692c3bb689ff312271743e71fee49f9`; `VERIFICACOES.md` `4ede90d92e72da26b7ce70a66a1548ac1e590830de7eb81075f7482344295ef8`.

**Preservation.** Every line outside the listed hunks is byte-identical to the pre-change copy in the four documents; the owner's earlier hunks H16-1, HP-1, HV-1 and HV-6 are unchanged; every other modified or untracked worktree file kept its SHA-256, and the untracked `DEVELOPMENT-TOOLS.md` was not touched.

**Gates (local, 30/09/2026).** Link check of the edited documents; contract tests including the frozen 2.18 test and the 2.19 test; cross-validation 80/80; `pnpm test:harness`; `pnpm verificar`; `git diff --check`; secret scan over tracked and untracked files. Exact results and hashes are recorded in `ESTADO.md` and the Release 2.19 manifest. No remote action, commit, push, deploy or external call.

**Not done / residual.** F-2 (`DEVELOPMENT-TOOLS.md`) remains a separate operational documentation pendency; no other residual from this CR.
