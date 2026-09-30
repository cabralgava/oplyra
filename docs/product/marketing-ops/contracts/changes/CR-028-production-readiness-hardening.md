# CR-028 — Production Readiness Hardening

**Status:** `approved_and_applied`
**Approved by:** project owner, 29/09/2026 (CR-028 in full and decisions D-14 to D-18 as recommended)
**Applied at:** 2026-09-29 (local Supabase only; see "Application record")
**Classification:** `runtime_hardening_no_contract_registry_change`
**Issued at:** 2026-09-29
**Base:** commit `80631318e251ddc467f2236b85a5f74e998f8813`, Contract Registry Release 2.17 (CR-027)
**Target:** Contract Registry Release 2.18 (applied)
**Origin:** blockers B-2, B-3, B-4 and B-6 and decisions D-14 to D-17 of [PREPARACAO-SUPABASE-PRODUCAO](../../../../harness/PREPARACAO-SUPABASE-PRODUCAO.md)

## Objective

Remove the two code-level blockers found by the production-readiness audit — tenant deletion blocked by the last-Owner guard (B-3) and the missing environment identity check (B-4) — and record the Auth checklist (B-6), the reclassification of hosting compatibility (B-2) and the recommended decisions D-14 to D-17.

At proposal time nothing in this CR was applied; the SQL and TypeScript descriptions below are the approved specification. The local implementation and Release 2.18 are recorded in "Application record". Approving this CR does not authorize any publication, project creation or remote migration.

## 1. B-3 — Tenant deletion and the last-Owner guard

### 1.1 Problem

Migration `20260915000005_last_owner_guard.sql` defines the constraint trigger `memberships_preserva_owner` (`after update or delete`, `deferrable initially immediate`) with `app.ensure_tenant_keeps_owner()`. Deleting a `core.tenants` row cascades to `core.memberships`; the trigger then counts zero active Owners and raises `a empresa ficaria sem Owner ativo`. Verified locally on 29/09/2026 inside a rolled-back transaction. Consequences: the cascade that CR-027 §12 assumes for `finops` never runs for a tenant with an active Owner, and tenant deletion is impossible for real companies.

A second weakness: the current function runs as the invoker. Under forced RLS, the Owner count may be computed over a filtered view of `core.memberships`. Today this fails closed (a hidden Owner counts as zero), but any existence check added under RLS could fail open: a tenant row hidden by `tenants_select` would look absent. The new check must therefore see the real rows.

### 1.2 Proposed migration `20260929000015_tenant_deletion_owner_guard.sql`

Migrations 000001–000014 stay byte for byte unchanged. The new migration:

1. Creates `app.tenant_owner_guard()` as a trigger function:
   - `security definer`, `set search_path = pg_catalog, pg_temp`, every object fully qualified (`core.tenants`, `core.memberships`);
   - owner set explicitly to the migration role (`postgres`), which reads the real rows independently of the caller's RLS;
   - `revoke all on function app.tenant_owner_guard() from public, anon, authenticated, service_role`; no `EXECUTE` grant (PostgreSQL checks `EXECUTE` on a trigger function only when the trigger is created, not when it fires).
2. Decision rule, evaluated for the affected tenant `t = coalesce(old.tenant_id, new.tenant_id)`:
   - **if `core.tenants` no longer contains `t`** at evaluation time (the parent row was deleted in this transaction, which is what happens during the real cascade from `delete from core.tenants`), allow;
   - otherwise count active `owner` memberships of `t`; if zero, raise `check_violation` with the current message and hint.
   The rule does **not** use `pg_trigger_depth()`: a direct `delete` or `update` of `core.memberships` issued from inside another trigger, while the tenant still exists, is still rejected.
3. Recreates the constraint trigger `memberships_preserva_owner` on `core.memberships` (`after update or delete`, `deferrable initially immediate`, `for each row`) pointing to the new function, and drops `app.ensure_tenant_keeps_owner()` only after the trigger no longer references it.
4. Leaves unchanged: role promotion, invitation acceptance, operator policies and every grant.

**Related weakness recorded for decision (D-18).** CR-027 (migration 000013) uses `pg_trigger_depth() > 1` in `finops.forbid_record_mutation`, `finops.forbid_entry_mutation` and `finops.forbid_direct_delete` to let tenant cascades through. The same objection applies: a delete issued inside another trigger has depth > 1. Recommended: the same migration 000015 replaces those three functions (`create or replace`, same hardening as §1.2 item 1) with one uniform rule for every protected `finops` table (`budget_periods`, `model_attempts`, `model_call_records`, `cost_ledger_entries`):

- `UPDATE` stays rejected wherever it is rejected today (records and entries); nothing else about updates changes;
- `DELETE` is allowed **only** when `core.tenants` no longer contains the `tenant_id` **of the row being deleted** (`old.tenant_id`); while that tenant row exists, every delete is rejected, whatever started it;
- the absence of an intermediate parent (`finops.model_attempts`, `finops.budget_periods` or any other) is **never** evidence of an authorized cascade: `cost_ledger_entries` has foreign keys to both attempts and periods, and attempts reference periods, so the order in which PostgreSQL walks those cascades is not a contract; only the tenant row decides;
- `pg_trigger_depth()` does not take part in the decision;
- the existence check runs as the function owner (`security definer`, fixed `search_path`, fully qualified names), so caller RLS on `core.tenants` cannot hide the tenant and make a direct delete look like a cascade.

This changes CR-027 behavior only by closing a bypass; migration 000013 is not edited.

### 1.3 Explicit non-goals

- No productive tenant-deletion use case, operator command or API.
- Not a claim that LGPD deletion is solved: Auth users, Storage objects under `<tenant_id>/`, external integrations, backups and audit retention (D-5 of CR-027, D-12 of the readiness plan) remain out of scope.
- No change to who may delete a tenant: `core.tenants` has no delete grant for application roles; deletion stays a privileged, audited operation to be designed separately.

### 1.4 Tests (to be written on implementation)

| # | Scenario | Layer |
| --- | --- | --- |
| 1 | Deleting the last active Owner membership directly is rejected | pgTAP |
| 2 | Demoting (`role_key` ≠ `owner`) or revoking (`status = revoked`) the last Owner is rejected | pgTAP |
| 3 | With two active Owners, removing or demoting one is allowed | pgTAP |
| 4 | `delete from core.tenants` cascades through `core` (memberships, invitations, audit log, entitlements), `content` (drafts, variants, idempotency, outbox, deduplication) and `finops` (periods, attempts, records, entries) | pgTAP + integration |
| 5 | No orphan rows remain in any tenant-owned table of `core`, `content` and `finops` | pgTAP + integration |
| 6 | A second tenant with data in all three schemas remains byte-identical (row counts and checksums) | integration |
| 7 | Bypass attempts are rejected: a helper trigger that deletes the last Owner while the tenant exists; a deferred-constraint sequence that removes the Owner before an unrelated statement; a caller under RLS that cannot see `core.tenants` | pgTAP |
| 8 | Rolling back the deleting transaction restores every row | pgTAP + integration |
| 9 | Function hardening: `prosecdef`, fixed `search_path`, owner, no `EXECUTE` for `public`, `anon`, `authenticated`, `service_role` or `oplyra_*` | pgTAP |
| 10 | If D-18 is approved, while the tenant row exists, each cascade started through an intermediate foreign key is rejected as a whole, with no row removed: `delete` of a `finops.budget_periods` row (would cascade to attempts and entries), of a `finops.model_attempts` row (would cascade to records and entries), of a `finops.model_call_records` row and of a `finops.cost_ledger_entries` row | pgTAP |
| 11 | If D-18 is approved: the same intermediate deletes issued from inside another trigger (depth > 1) are rejected while the tenant exists | pgTAP |
| 12 | If D-18 is approved: `delete from core.tenants` removes every `finops` row of that tenant whatever the cascade path, and `update` of records and entries stays rejected before and after | pgTAP + integration |

## 2. B-4 — Environment identity

### 2.1 Problem

`packages/infra/src/config.ts` (`carregarConfig`) lets `local` and `ci` use any remote host when `OPLYRA_ALLOW_REMOTE=true`, and has no environment fingerprint. A local process with that flag and a production credential would reach production. With no permanent remote staging, there is no legitimate reason for `local` or `ci` to reach a remote host.

### 2.2 Proposed rules (infrastructure and composition roots only)

All validation stays in `packages/infra` and in each composition root (web, worker, ops CLI). `packages/core` receives no environment, host or fingerprint concept.

1. `local` and `ci` accept only local endpoints (`127.0.0.1`, `localhost`, `::1`, `host.docker.internal`), with no exception.
2. The presence of `OPLYRA_ALLOW_REMOTE`, with any value, is rejected as obsolete configuration.
3. `production` requires remote endpoints; any local endpoint is rejected.
4. `production` requires `SUPABASE_PROJECT_REF`.
5. The project ref must match the first DNS label of the `SUPABASE_URL` hostname (`<ref>.supabase.co`).
6. Direct connection: the database hostname must be `db.<ref>.supabase.co`.
7. Pooler connection: the ref must match the tenant identity carried by the connection user (`<role>.<ref>`), following the official Supavisor format; the exact host and user formats are confirmed in the B-2 preflight before the first production credential is issued.
8. **Untrusted configuration versus trusted deployment evidence.** Everything read from `process.env` (URLs, project ref, fingerprint, any `OPLYRA_*` variable) is *untrusted application configuration*: a variable does not become evidence of where the process runs just by existing. Trusted evidence is handed to the loader by the composition root, through an infrastructure contract equivalent to:

   ```text
   TrustedDeploymentContext = {
     environment:    string   // as reported by the provider: production, preview, development, ...
     deploymentId:   string   // provider deployment identifier
     provider:       string   // recognized deployment provider key
     evidenceSource: string   // which reserved, documented provider metadata produced it
   }
   ```

   - It is produced by a provider-specific adapter that reads **reserved, documented metadata of the deployment provider**, never a variable invented by the application; `OPLYRA_DEPLOYMENT_ID`, for example, is configuration, not evidence.
   - The loader receives the context as an argument; it never looks it up by name.
   - Only recognized `provider` and `evidenceSource` values are accepted.
9. `OPLYRA_ENVIRONMENT_FINGERPRINT` = `ofp1:<environment>:<projectRef>:<deploymentId>` stays non-secret and is validated **against the trusted context**: the context's `environment` must be `production`, its `deploymentId` must equal the fingerprint's, and `projectRef` must equal the ref validated by rules 4–7.
10. `production` requires a `TrustedDeploymentContext`. A production configuration that is internally coherent (refs, hosts and fingerprint agree) but arrives without trusted evidence is rejected. Configuration and trusted context that diverge in environment, deployment id or ref are rejected. Evidence of a preview or any other non-production environment is rejected for `production`.
11. **Fail-closed until a destination is approved.** While the web and worker destinations are not approved and no adapter exists for their provider metadata, no composition root can build a trusted production context, so the `production` runtime cannot start. Tests may inject a synthetic trusted context through the same contract.
12. The fingerprint is a guard against configuration mistakes. It is neither a secret nor a substitute for secret-store isolation, network restriction or separate credentials.
13. Previews and pull-request CI never receive production credentials; if one did, its trusted context would report a non-production environment and startup would fail.
14. Local scripts (`scripts/db-guard.sh`, `scripts/local-db-roles.sh`) keep refusing remote targets.
15. The migration CLI is a separate operational flow (approved executor, migration credential and CLI commands under the publication runbook). It neither reuses nor bypasses the runtime configuration loader, and the runtime loader never accepts the migration credential.
16. Error messages name the offending variable or evidence field and the rule only: no password, user, full URL, connection string or raw metadata value; at most the host class (`local`/`remote`) and the mismatching ref.

`packages/core` still knows nothing about environment, Supabase, project ref, fingerprint or deployment.

### 2.3 Impacted artifacts on implementation

- `packages/infra/src/config.ts` and its tests (`packages/infra/test/integracao.test.ts` has a test that accepts `OPLYRA_ALLOW_REMOTE=true`; it becomes a rejection test).
- `.env.example` and `.github/workflows/ci.yml` currently set `OPLYRA_ALLOW_REMOTE=false`; both must drop the variable, otherwise CI fails under rule 2.
- A new infrastructure type for `TrustedDeploymentContext` and a loader signature that receives it from the composition root; provider-specific metadata adapters only after the web/worker destination is approved.
- `docs/product/marketing-ops/16-environments-release.md` (§ validation and variable table) and `docs/product/marketing-ops/environments/SECRETS-AND-IDENTITIES.md`; doc 16, `docs/harness/PREPARACAO-I01.md` and `docs/harness/VERIFICACOES.md` also mention the flag; doc 16 and PREPARACAO-I01 carry pending owner edits and must be changed surgically, with preservation proven, when this CR is applied.
- Worker and ops composition roots: the persistent Cost Ledger (`PersistentCostLedger`) is today composed only in tests; any future worker entry point must load configuration through the same validation.

### 2.4 Tests (to be written on implementation)

| # | Scenario |
| --- | --- |
| 1 | `local` with a remote database or Supabase URL is always rejected |
| 2 | `ci` with a remote endpoint is always rejected |
| 3 | `OPLYRA_ALLOW_REMOTE` present (`true`, `false`, empty) is rejected in every environment |
| 4 | `production` with any local endpoint is rejected |
| 5 | Divergent refs between `SUPABASE_PROJECT_REF`, `SUPABASE_URL` and the database host or pooler user are rejected |
| 6 | Missing or malformed fingerprint is rejected |
| 7 | Internally coherent production configuration **without** a trusted deployment context is rejected |
| 8 | Trusted evidence of a preview or any non-production environment is rejected for `production` |
| 9 | Fingerprint deployment id divergent from the trusted context is rejected; environment or ref divergent from the trusted context is rejected |
| 10 | Unrecognized `provider` or `evidenceSource` in the trusted context is rejected |
| 11 | A production configuration is accepted only with a synthetic trusted adapter injected by the test, for direct connection and for pooler |
| 12 | Equivalent direct-connection and pooler values for the same ref resolve to the same identity; a pooler user of another ref is rejected |
| 13 | No error message contains a password, user, full URL, connection string or raw metadata value (checked against synthetic sentinel values) |
| 14 | `OPLYRA_DEPLOYMENT_ID` or any other `process.env` value cannot substitute the trusted context |
| 15 | Architecture test: `packages/core` has no reference to environment, Supabase, project ref, fingerprint or deployment |

## 3. B-2 — Reclassification of hosting compatibility

**Documentary evidence recorded in the technical review**, **without** practical validation. The owner will approve the resulting decision but did not produce the research. The pages were not fetched while writing this proposal (no external access was authorized):

| Point | Source |
| --- | --- |
| Custom PostgreSQL roles with `LOGIN` are supported | https://supabase.com/docs/guides/troubleshooting/fatal-password-authentication-failed |
| `postgres` has `BYPASSRLS` | https://supabase.com/docs/guides/database/postgres/row-level-security |
| Policies on `storage.objects` are supported | https://supabase.com/docs/guides/storage/security/access-control |
| Migrations are ordered and recorded in the migration history; seeds are applied only when requested | https://supabase.com/docs/guides/local-development/cli-workflows |

**New classification of B-2:** from "unknown incompatibility" to **"mandatory preflight on the empty project, before any migration"**, split by authorization.

**Group A — covered by the future authorization to create the project; read-only.**

- PostgreSQL version and region;
- roles, memberships and attributes (`CREATEROLE`, `BYPASSRLS`, admin option on `authenticated`);
- owners of existing objects, including `storage.objects`;
- remote migration history empty;
- schemas exposed by the Data API;
- backup and PITR as configured;
- `supabase db push --dry-run` listing exactly the approved versions, without applying them;
- documented connection formats for direct connection and pooler (host and user formats used by §2.2 rule 7).

**Group B — only after the separate authorization to apply migrations.**

- actual creation of the policies on `storage.objects` (migration 000004);
- transactional behavior observed while applying;
- owners and grants effectively produced by the migrations;
- any DDL, even one intended to be rolled back.

A connection through a custom login role can be tested only after a separate authorization to create and store its password; until then the login roles keep no password. The project-creation authorization does not implicitly authorize any temporary policy, experimental migration or diagnostic DDL.

## 4. B-6 — Production Auth checklist (not applied)

| Item | Recommended setting |
| --- | --- |
| Public signup | off for the invite-only initial launch |
| Anonymous sign-in | off |
| Email confirmation | on |
| Site URL and redirect URLs | production domain only (`https://app.oplyra.io` and exact paths); no wildcards, no local or preview URLs |
| Minimum password length | 12 |
| Password composition | lowercase, uppercase, digit and symbol required |
| Leaked-password protection | on, when the contracted plan offers it |
| SMTP | custom SMTP with a verified domain before any real invitation |
| Email OTP / link expiry | at most 1 hour |
| Rate limits | reviewed and recorded (sign-in, OTP, email sending, token refresh) |
| Administrative MFA | mandatory for every organization member with access to the project |

The local `supabase/config.toml` stays a development configuration and is not a production template.

## 5. Decisions (approved by the owner on 29/09/2026 as recommended; not applied remotely)

| ID | Recommendation |
| --- | --- |
| D-14 | Contiguous migrations: publish content, outbox and dispatcher migrations (000009–000012) as inert schema; after this CR, the publication candidate is 000001–000015 |
| D-15 | No permanent staging; EXP-04 runs on a temporary recovery project with its own authorization and budget, destroyed after the evidence is recorded |
| D-16 | SSL enforced; network restriction configured before any runtime login role receives a password |
| D-17 | Data API exposes only `public` and `graphql_public` |
| D-18 | In migration 000015, replace the `pg_trigger_depth()` exceptions of CR-027 (`finops`) by the uniform rule: a delete is allowed only when `core.tenants` no longer holds the deleted row's own `tenant_id`; no intermediate parent counts; updates stay rejected (§1.2) |

## 6. Impact and versioning

- Migrations 000001–000014 remain immutable; corrections come only through the new migration 000015.
- This proposal changes no schema, no registry and no contract artifact of Release 2.17: no error code, action, event, schema or Model Profile. Configuration errors are startup failures of the composition root, not runtime Error Registry codes.
- Applying CR-028 will add a migration, infrastructure code, tests and documentation, so it must produce **Contract Registry Release 2.18** as a logical change set over 2.17.
- Release 2.17 stays historical and intact (manifest sha256 `0870c3afaea6d0ba40c0185883f8b7ebae7b90789efd58de36fc284eaa983076`).
- Approving this CR authorizes neither project creation nor migration application nor publication; those keep the separate authorizations of the readiness plan (§10).

## 7. Future test plan (after approval)

- Configuration unit tests (§2.4) and architecture test for the core boundary.
- pgTAP for the Owner guard and function hardening (§1.4 items 1–3, 7, 9, 10).
- Integration test of the full tenant cascade across `core`, `content` and `finops`, with a second tenant as control (§1.4 items 4–6, 8).
- Negative bypass tests (§1.4 item 7).
- Directed mutations: guard using `pg_trigger_depth()` instead of tenant existence; `finops` guard accepting the absence of an intermediate parent (attempt or period) as cascade evidence; guard without `security definer` (RLS-filtered existence); Owner count ignoring `status`; acceptance of `OPLYRA_ALLOW_REMOTE`; ref comparison skipped for the pooler; production accepted without trusted context; `OPLYRA_DEPLOYMENT_ID` from `process.env` accepted as evidence; unrecognized evidence source accepted; error message including the URL.
- Local reset from an empty database (`pnpm db:reset`) applying 000001–000015 with synthetic seeds only.
- `pnpm verificar`, `pnpm test:harness`, `git diff --check`, secret scan over tracked and untracked files.
- Controlled reconstruction of Release 2.18 (logical change set over 2.17, classified artifacts, independent hash verification), only after approval and implementation.

## 8. Risks

| ID | Risk | Mitigation |
| --- | --- | --- |
| R-1 | Allowing tenant deletion makes accidental deletion possible for privileged roles | No delete grant for application roles; deletion stays privileged and audited; separate use case later |
| R-2 | Official pooler formats differ from the assumption of §2.2 rule 7 | Rule confirmed in the B-2 preflight before any production credential exists |
| R-3 | Removing `OPLYRA_ALLOW_REMOTE` breaks CI or local habits | Remove it from CI and `.env.example` in the same change; clear error message |
| R-4 | Touching docs with pending owner edits (16, PREPARACAO-I01, VERIFICACOES) | Outcome: the CR-028 hunks were reverted and the reconciliation deferred (item 5) |
| R-5 | Residual: no application can physically tell a local machine apart if every piece of trusted provider identity is deliberately forged | Accepted; the primary barrier stays secret-store isolation, MFA, approvals and the absence of production credentials in any local environment. The trusted context guards against mistakes, not against a deliberate insider |
| R-6 | The production runtime cannot start until a destination and its metadata adapter are approved | Intended (fail-closed); the first publication is schema-only and needs no runtime |

## Review reissue of Release 2.18 (29/09/2026)

Review of the first Release 2.18 found three blockers and a second review one more gap (item 3); all were corrected in place before any commit, with no remote action:

1. **Packaging.** An `active` release cannot contain CR-028 edits deliberately left outside its digest. `changeSet.excludedFromDigestWithCr028Edits` and the test that legitimized it were removed; the CR-028 hunks in doc 16, `PREPARACAO-I01.md` and `VERIFICACOES.md` were reverted so those files keep only the owner's earlier edits, and the documentary reconciliation is deferred (see Implementation decisions, item 5). Manifest, cross-validation report, classification, hashes and tests were rebuilt.
2. **Configuration.** `config.ts` now requires the `postgres:`/`postgresql:` protocol and a non-empty user for database URLs, `http:`/`https:` (`https:` only in production) without userinfo, query or fragment for `SUPABASE_URL`, and turns invalid percent-encoding in the user into a `ConfigError` that never echoes the received value. Negative tests assert that messages contain no URL, user or password.
3. **Authentication endpoint identity (second reissue).** `SUPABASE_JWKS_URL` and `SUPABASE_JWT_ISSUER` could define an authority different from the validated `SUPABASE_URL`. `SUPABASE_URL` is now normalized to its origin and must have an empty or `/` path; issuer (`<origin>/auth/v1`) and JWKS (`<origin>/auth/v1/.well-known/jwks.json`) are derived from it. The two variables remain accepted only as exact copies of those canonical values (any other value, including an empty one, fails closed with a message that carries no value); in `local`/`ci` remote overrides are refused and in production overrides of another project, host, protocol or path are refused even with a correct project ref, fingerprint and `TrustedDeploymentContext`.
4. **False positive.** The CR-027 record-immutability behavior test now reaches the immutability trigger (see Implementation decisions, item 6).

## Approval requested

Approve or adjust §1 (including D-18 with the uniform `core.tenants` rule), §2 (including the trusted deployment context), the reclassification and authorization split of §3, the checklist of §4 and decisions D-14 to D-17. Approval authorizes only the local implementation of §1–§2 and Release 2.18; no remote step.

## Application record

**Approval.** Project owner, 29/09/2026: CR-028 in full and decisions D-14, D-15, D-16, D-17 and D-18 as recommended, for local implementation only (migration 000015, local configuration fixes, tests, documentation, Release 2.18). Not authorized: Supabase organization or project, remote login or link, `db push`, remote migrations, real credentials, push, PR, deploy, production runtime, external providers, external calls, commit.

**Release.** Contract Registry Release 2.18 — manifest `contract-registry-manifest-v2.18.json`, a logical change set over Release 2.17 (manifest sha256 `0870c3af…3076`, preserved). Inherited artifacts keep their 2.17 entry; only paths modified or added by this CR carry current content.

**Applied changes.**

| Area | Change |
| --- | --- |
| Migration 000015 | `app.tenant_owner_guard()` (`security definer`, owner `postgres`, `search_path = pg_catalog, pg_temp`, qualified names, no `EXECUTE` for `public`, `anon`, `authenticated`, `service_role` or any `oplyra_*`); constraint trigger `memberships_preserva_owner` recreated; `app.ensure_tenant_keeps_owner()` dropped afterwards; `finops.forbid_record_mutation`, `finops.forbid_entry_mutation` and `finops.forbid_direct_delete` replaced with the uniform `core.tenants` rule (D-18). Migrations 000001–000014 byte for byte unchanged |
| Configuration | `packages/infra/src/config.ts`: `local`/`ci` accept only local endpoints; `OPLYRA_ALLOW_REMOTE` rejected with any value; strict URL parsing; production requires remote endpoints, `SUPABASE_PROJECT_REF` coherent with `SUPABASE_URL` and with the direct host or pooler user, `OPLYRA_ENVIRONMENT_FINGERPRINT` and a `TrustedDeploymentContext` from a `DeploymentEvidencePolicy` supplied by the composition root; `APPROVED_DEPLOYMENT_EVIDENCE` is empty, so production fails closed; the migration credential is never accepted as the application credential; errors carry no credentials, URLs or raw metadata |
| Composition roots | `apps/web/src/lib/deps.ts` passes `politicaSemProvedorAprovado` explicitly; `apps/ops-cli/src/main.ts` now validates `DATABASE_URL_OPS` and `SUPABASE_URL` through the same loader (it previously read them without any environment check) |
| CI and examples | `OPLYRA_ALLOW_REMOTE` removed from `.github/workflows/ci.yml` and `.env.example` |
| Documentation | CR-028; `SECRETS-AND-IDENTITIES.md`; readiness plan; doc 16, `PREPARACAO-I01.md` and `VERIFICACOES.md` reconciliation deferred (item 5) |
| Configuration hardening | `config.ts` also requires: database URL protocol `postgres:`/`postgresql:` and a non-empty user; `SUPABASE_URL` protocol `http:`/`https:` (`https:` only in production), without userinfo, query or fragment (nothing is propagated to `supabaseUrl`, `jwksUrl` or `jwtIssuer`); invalid percent-encoding in the user is a `ConfigError` that never echoes the value |
| Tests | pgTAP `tenant_deletion_owner_guard.test.sql` (47); integration `tenant-deletion-cascade.integration.test.ts` (4); `config-environment.test.ts` (100) and adjusted `integracao.test.ts`; architecture `environment-identity.arquitetura.test.ts` (4); Release 2.18 contract test; Releases 2.16 and 2.17 tests turned into historical chain checks |
| Release validation | `cross-registry-validation-v2.18.json`, 78 checks (75 of 2.17 + migrations 000001–000014 unchanged, migration 000015 hardening, environment identity) |

**Implementation decisions and findings (recorded, not silent).**

1. **Operations CLI included.** §2.2 names web, worker and ops CLI as composition roots. The ops CLI read `DATABASE_URL_OPS` and `SUPABASE_URL` with no environment check; it now requires `OPLYRA_ENV` and goes through the same validation. No worker entry point exists yet.
2. **Local, ignored configuration.** `apps/web/.env.local` (ignored by Git, local development only) defined `OPLYRA_ALLOW_REMOTE`, which would have stopped local development and E2E under rule 2; that single line was removed, with a backup kept outside the repository. No other line of that file changed.
3. **Formats pending the B-2 preflight.** Project refs are accepted as `^[a-z0-9]{8,40}$`; the pooler is recognized by a host ending in `.pooler.supabase.com` and a user `<role>.<ref>`. Both follow §2.2 rule 7 and must be confirmed in Group A of the preflight before any production credential exists.
4. **Pre-registry migrations.** Migrations 000001–000008 predate the Contract Registry and are in no manifest; the cross-validation pins their hashes from commit `8063131`; 000009–000014 are checked against manifest v2.17.
5. **Documents with pending owner edits.** Doc 16 (in the manifest, source `cr_025`), `PREPARACAO-I01.md` and `VERIFICACOES.md` (in no manifest) carried pending owner edits in a mixed worktree. An `active` release cannot contain CR-028 edits deliberately left outside its digest, so the CR-028 hunks in these three files were **reverted**, leaving only the owner's pre-existing edits (the reversal was verified line by line against the state before the reversal, and no CR-028 text remains in them). **The documentary reconciliation is deferred** because of the mixed worktree: the removal of `OPLYRA_ALLOW_REMOTE` from the doc 16 prose and variable table, the addition of `SUPABASE_PROJECT_REF` and `OPLYRA_ENVIRONMENT_FINGERPRINT` to the doc 16 table, the CR-028 notes in `PREPARACAO-I01.md` (§5 item 2, A14) and the Local First and command-safety wording in `VERIFICACOES.md` must be applied in a later change, once the owner's edits are committed. Until then those three documents still describe the retired `OPLYRA_ALLOW_REMOTE` flag; the authority is this CR, `SECRETS-AND-IDENTITIES.md` and `packages/infra/src/config.ts`. Doc 16 stays inherited with its 2.17 entry because its content on disk no longer contains any CR-028 change; the manifest has no exclusion-from-digest field.
6. **Mutation finding.** The first version of the "record update stays rejected" test updated `latency_ms`, which the record/document coherence constraint of migration 000013 rejects on its own, so a mutation that let the trigger accept updates survived. The CR-028 test now updates `created_at` (outside that constraint) and checks the trigger message. The same masking existed in the CR-027 behavior test (`finops_ledger_behavior.test.sql`, "registro é imutável"); D-18 replaced those functions, so a known false positive was not acceptable. That test now updates `created_at` and asserts the trigger message (`model_call_records é imutável`); the file is therefore a modified artifact of the release (source `cr_028`).
7. **Tenant deletion stays privileged.** No application role gained a delete grant on `core.tenants`; no deletion use case was created; LGPD deletion (Auth users, Storage objects, integrations, backups, retention) remains out of scope.

**Gates (local, 29/09/2026).** `pnpm db:reset` from an empty database applying 000001–000015; `pnpm verificar`: 716 Vitest in 43 files, 240 pgTAP in 8 files, 16 Playwright, secret scan and build; 211 contract tests in 14 files; cross-validation 78/78; Ledger, cascade and concurrency integration 23/23 in three consecutive runs; `pnpm test:harness` 4/4; `git diff --check` clean; secret scan over tracked and untracked files clean.

**Directed mutations (34 of 34 detected).** Owner guard using `pg_trigger_depth()`; Owner guard without `security definer`; Owner count ignoring `status`; FinOps guards back to `pg_trigger_depth()`; FinOps accepting a period with no attempts (intermediate absence); record update accepted (initially survived, see item 6); `OPLYRA_ALLOW_REMOTE` accepted; `ci` not restricted to local endpoints; local host by substring; pooler ref not compared; production without trusted context; `OPLYRA_DEPLOYMENT_ID` from `process.env` accepted as evidence; unknown evidence source accepted; preview evidence accepted; fingerprint deployment id not compared; malformed-URL error echoing the value; migration credential accepted as the application credential; and, in the review reissue: database or API protocol not checked; userinfo accepted in `SUPABASE_URL`; query or fragment accepted in `SUPABASE_URL`; empty database user accepted; invalid percent-encoding rethrown as a raw `URIError`; invalid percent-encoding echoing the received value; `http:` accepted for `SUPABASE_URL` in production; the CR-027 behavior test that used to mask the record-immutability trigger (it passed under a trigger that accepts updates, the corrected one fails); and a `changeSet.excludedFromDigestWithCr028Edits` exception reintroduced in the manifest (rejected by the Release 2.18 test); and CR-028 text reintroduced into doc 16 (rejected by the same test); and, in the second review reissue: remote JWKS override accepted; remote issuer override accepted; override of another project accepted (JWKS and issuer, prefix-only comparison); `SUPABASE_URL` with an arbitrary path accepted; error messages echoing the received JWKS value or the path.

**Still pending.** Creation of the production project and every remote step of the readiness plan (separate authorizations); B-2 preflight; provider adapter for trusted deployment evidence once a web/worker destination is approved; EXP-04 on a temporary recovery project (D-15); LGPD deletion as a whole; update of `docs/harness/ESTADO.md` (not edited in this change).
