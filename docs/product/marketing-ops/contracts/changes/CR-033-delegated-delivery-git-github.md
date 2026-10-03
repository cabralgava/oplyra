# CR-033 — Delegated Delivery: Git/GitHub Writes for the Developer Harness

**Status:** `approved` (policy and offline implementation scope only; **not applied**)
**Approved by:** project owner, 2026-10-01 — decisions D-11 to D-16 and D-18 to D-21 of §14, and the implementation scope of §13. **D-17 (merge ceiling) stays deferred; automatic merge is not authorized.** The owner authorized developing and testing offline the wrappers, the authorization record, the guard, the launcher, the CI hygiene and the reproducible release tool. **Enabling real writes depends on the prerequisites P-1…P-6 and on the approved rehearsal (§10); `delegatedDelivery` stays off and `executionEnabled` stays `false`.** No remote write, merge, production access or remote migration is authorized in this phase. The status stays `approved` (not `approved_and_applied`) until the implementation is delivered and packaged. **2026-10-02:** the owner reported the approval of D-25 and D-26 (rehearsal grant and verification of the effective protection of `main`), recorded in §16.11; it does not enable real writes.
**Classification:** `developer_tooling_delegated_delivery_policy_approved_not_applied_no_registry_or_schema_change`
**Issued at:** 2026-10-01 (revision 3 records the approval and two official confirmations; revision 2 was the same day)
**Base:** local commit `7a048ff` on branch `docs/cr-032-s1-policy-reconciliation` (Contract Registry Release 2.22 and its operational record). Reported by the owner: PR #4 for that branch is **Draft, not integrated**, and `validate` passed on head `7a048ffa1c426cc0e395866e0100cab192ddd343` (owner-confirmed on GitHub; not verified by the agent). **This CR is implemented on top of Release 2.22 only after PR #4 is merged into `main`.** Release 2.22 and every earlier release stay unchanged.
**Amends:** [CR-032](CR-032-developer-harness-git-lifecycle.md) decisions D-1 and D-10 and the sentences of §10.4, §13 and §14 that make Git/`gh` writes owner-only. Everything else in CR-032 stays in force.
**Origin:** owner request of 2026-10-01 for a flow in which, once the owner authorizes an increment, the AI implements, tests, fixes failures inside the scope, commits on the working branch, pushes without force, opens a **draft** PR and follows the CI, without repeated approvals for those mechanical steps.

**Revision 2 changes:** (1) an owner-approved **authorization record** replaces the bare `--increment` reference (§6.0); (2) the preflight of `git:branch` is separate from the other verbs (§6.2); (3) GitHub permissions corrected, a **GitHub App** chosen, the `Actions read` versus rerun incompatibility resolved by making rerun owner-only (§5, §6.3); (4) the false claim about `pull_request` and secrets removed and replaced by the real mechanism and limits (§5.2); (5) release reproduction from the **governed snapshot** and historic evidence, with `generatedAt` preserved (§8); (6) offline development proceeds after approval, and only identity and remote protections gate **real** writes (§10, §13).

## 1. Objective and non-goals

Replace "every Git write is owner-only" by a **bounded, mechanical, auditable delegation**: the agent may perform a closed set of Git/GitHub operations, only against `cabralgava/oplyra`, only on one working branch that an owner-approved record names, and only while server-side protections that the agent cannot change are verifiably in place.

This CR does **not**, in this proposal or when approved: enable merge by the agent or by any automation (§9 proposes tiers and keeps it disabled); enable the unattended loop (`executionEnabled` stays `false`; HB-13 stays unmet); touch production, credentials, remote migrations or any service other than the existing GitHub repository; edit the control plane from an autonomous session; or change a registry, schema, fixture, migration, product code or any earlier release. **Nothing was implemented**: no script, hook, setting, CI file, ruleset, GitHub App, token or permission was changed when this document was written.

## 2. Audit of the current state (read in this session, 2026-10-01)

| ID | Fact | Evidence |
| --- | --- | --- |
| A-1 | The guard allows Bash only through a closed allowlist: pnpm scripts, read-only Git (`status`, `diff`, `show`, `log`, `rev-parse`, `ls-files`, `ls-tree`, `cat-file`), and read utilities. Every mutating or remote Git subcommand, `gh`, `curl`, wrappers and shell constructs are refused with a fixed code (`LF-GIT-MUTATION`, `LF-CMD-NOT-ALLOWED`…). It is a lexical filter, not a shell parser. | `scripts/claude-local-first-guard.mjs` |
| A-2 | The guard protects a control plane from autonomous writes: `.claude/**`, `.mcp.json`, `CLAUDE.md`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tools/developer-harness/**`, `scripts/claude-*`, `.github/**`, `DEVELOPMENT-TOOLS.md`, `AUTONOMOUS-BUILD.md`. These change only in an owner-started maintenance session (`pnpm claude:maintenance`, always `manual`, typed confirmation). Reads and writes outside the repository are refused. | guard; `scripts/claude-launch.mjs` |
| A-3 | `.claude/settings.json` denies `git push/add/commit/checkout/switch/reset/…`, `gh *`, `pnpm exec/dlx/add/install`, `rm`, `WebFetch`, `WebSearch`; the project hook is the only `PreToolUse` hook. The launcher refuses extra args, real API keys, alternative endpoints and settings sources that disable hooks. | `.claude/settings.json`; launcher |
| A-4 | CI is one job, `validate` (`ubuntu-latest`, Node 22, 30 min, `contents: read`, triggered by `pull_request` and by `push` to `main`, `cancel-in-progress: true`). It references **no** Actions secret; it uses only `github.token` (for the Supabase CLI setup). Actions are pinned by tag, not by SHA. It installs with `--frozen-lockfile`. | `.github/workflows/ci.yml` |
| A-5 | `playwright.config.ts` sets no `outputDir`, so Playwright uses and **cleans** `test-results/`. The Release 2.22 generator, state and evidence lived there and were deleted by `pnpm verificar` on 2026-10-01 and had to be restored by hand. | `playwright.config.ts`, `.gitignore`; incident in `ESTADO.md` |
| A-6 | The Release 2.22 generator was an unversioned file requiring Node 24 with `--experimental-strip-types`, while CI and `engines` use Node 22. It ran the cross-validation from the **working tree**, so regenerating it later would read future content. Some gate commands (`pnpm test … -t …`) cannot be issued by the autonomous guard, so the owner ran them by hand. | generator; guard `RULES.pnpm` |
| A-7 | Server-side state: owner-reported only that PR #4 exists as Draft and `validate` is green on `7a048ff`. **Unverified:** rulesets or branch protection on `main`, repository visibility and plan, Actions permissions and repository/organization secrets, whether workflow files use `workflow_dispatch`, which identities and tokens exist. | owner message; CR-032 A-10 |
| A-8 | CR-032 approved the policy text, D-1 option A and slice S1 only; S2–S7 are not authorized. `AUTONOMOUS-BUILD.md` is `draft` with `executionEnabled: false`; HB-01…HB-15 are not implemented; HB-13 is unmet. | CR-032 §12, §16, §19 |
| A-9 | The agent could not consult the official GitHub documentation itself (`WebFetch`/`WebSearch` are denied; Context7 is available only in an owner-started maintenance session). **Two points were confirmed by the owner against the official documentation (2026-10-01):** (a) reading the rules that apply to a branch (`GET /repos/{owner}/{repo}/rules/branches/{branch}`) requires **Metadata: read** ([source](https://docs.github.com/en/rest/repos/rules#get-rules-for-a-branch)); (b) installation access tokens **expire after one hour** and their **repositories and permissions can be restricted** when they are created ([source](https://docs.github.com/en/rest/apps/apps#create-an-installation-access-token-for-an-app)). **Still expectations, to be confirmed in the rehearsal or the maintenance session:** that re-running jobs needs `Actions: write`; that a fine-grained token of another user cannot be scoped to a repository owned by a different personal account; that the endpoint of (a) does not cover classic branch protection or bypass actors; that pushes touching `.github/workflows/**` are refused without the `Workflows` permission. The design verifies permissions empirically (§6.3) instead of trusting any of them. | owner message; session tools |

## 3. Recommendation (summary)

1. **Delegate through typed wrappers, not through a wider shell allowlist.** `pnpm git:*` / `pnpm gh:*` scripts (control plane, `scripts/claude-*`) build every operation themselves, with fixed arguments, no shell, a minimal child environment and an audit record. Raw mutating `git`, raw `gh` and `gh api` stay denied. This is CR-032 D-1 **option B**, which CR-032 §13 required to arrive by its own CR.
2. **Authority comes from an owner-approved authorization record** (§6.0) that the agent can neither create nor widen; `--increment=<ref>` only selects which record the session loads.
3. **Server-side protection is the real barrier**; real writes stay off until the owner has created the identity and the rulesets (§5) and the wrapper can read back that `main` is protected (fail closed).
4. **A GitHub App**, owned by the `cabralgava` account and installed only on `cabralgava/oplyra`, is the recommended mechanism, not a machine user with a fine-grained token (§5.1). Its installation tokens are short-lived and are minted per call with the minimal permissions of §5.1.
5. **Rerun of CI jobs is not delegated.** It needs `Actions: write`, which also allows dispatching, cancelling and deleting runs; the agent keeps `Actions: read` and asks the owner to rerun when it suspects a flaky check.
6. **Two concepts stay apart.** *Delegated delivery*: human-started, interactive, one authorized increment, mechanical Git/GitHub steps delegated, own switch `delegatedDelivery` (default disabled). *Unattended loop* (`executionEnabled: true`): not proposed, still blocked by HB-01…HB-15.
7. **Merge stays owner-only** (§9).
8. **Replace the throw-away generator** by a versioned release tool whose recipes pin a **governed snapshot**; prove it reproduces Release 2.22 byte for byte, including `generatedAt` (§8).
9. **Offline development proceeds after approval of the increment**; identity and remote protections gate only the enabling of real writes (§10).

## 4. Decisions of CR-032 that change

| CR-032 | Today | Proposed | Slices affected |
| --- | --- | --- | --- |
| D-1 Who performs Git writes | A: owner-only | **B, extended:** under an authorization record the agent performs only: create/switch to the record's branch, stage explicit paths, commit, push **without force** to that branch, create a **draft** PR, update that PR's title/body, comment on it, and read CI status and logs. Everything else stays owner-only (§7), including CI reruns. The CR-032 §13 sentence "Push, PR creation, approval and merge stay owner-only in every option" is **amended**: push and draft-PR creation are delegated; approval, ready-for-review, rerun and merge are not. | S1b, S5 |
| D-2 Branch naming | regex; `agent/` for autonomous work | regex unchanged; agent-created branches use `agent/` and the record's `ref`, and the branch name is **fixed by the record** | S5 |
| D-3 Ruleset on `main` | approved policy, not created | unchanged rules; now a **hard prerequisite of real writes** (§5); adds a ruleset for `agent/**` | S2 |
| D-4 Review model | provisional attestation; second identity before any `executionEnabled` proposal | unchanged; the App identity is a "separate author identity" (CR-032 §7.6(b)), so the owner can approve a PR the owner did not author, and "require 1 approval" may be enabled **by the owner**; **HB-13 stays unmet** until its recorded evidence exists; AI review never counts as independent | S2, S4 |
| D-5 Merge | squash, owner-only | unchanged; §9 proposes conditions only | — |
| D-6 SHA record | non-recursive documentary PR | unchanged; the agent may prepare and open that PR as draft | — |
| D-7 Checks | C-1…C-9 | order kept; **C-7, C-1, C-8, C-4, C-9 and the new C-10 (§5.2) are prerequisites of enabling real writes**; C-3 and C-6 are prerequisites of delegating anything that touches `contracts/**` or tests | S3 |
| D-8 Fix budget | 3 diagnosed attempts per failing check; one rerun to classify flaky | attempts kept; the flaky rerun becomes an owner action; adds budgets in the record | S5 |
| D-9 DP-02b2 | postponed | unchanged | — |
| D-10 Slices | S1…S7 | S1 re-opened as **S1b** (texts); S2 first and blocking for real writes; S3 partial; S4 template and CODEOWNERS; S5 = authorization, wrappers, guard, launcher, tests; S6 limited to HB-11 and HB-12 for this mode; S7 = real rehearsal before enabling | all |
| §10.4 / §14 | no token with write rights in a session; `gh` outside allowlist | a short-lived App installation token exists only inside the wrapper process; raw `gh` stays outside the allowlist | S5 |

## 5. Server-side prerequisites (owner, GitHub; none done)

They gate **enabling real writes**, not development (§10). Evidence is recorded in `ESTADO.md`.

### 5.1 Identity: GitHub App (recommended) versus fine-grained token

| | GitHub App installation token (recommended) | Machine user + fine-grained PAT |
| --- | --- | --- |
| Identity in PRs and commits | `<app>[bot]`, clearly separate from the owner | a second human-type account |
| Scope | installed on **one** repository; each token request can narrow repositories and permissions further (confirmed, A-9) | limited to the permissions chosen, but the token acts as a collaborator account |
| Lifetime | installation tokens expire after **one hour** (confirmed, A-9); no long-lived token exists after minting | PAT lives until expiry (up to a year) and is a bearer secret |
| Repository owned by a personal account | works: the owner installs the App on the repository | **expected to be unusable**: a fine-grained PAT of another user generally cannot be scoped to a repository owned by a different personal account (to confirm in the official documentation) |
| Long-lived secret | the App private key (kept outside the repository, ideally in the macOS Keychain) | the PAT |
| Cost/seat | none | an extra account to maintain |
| Workflow files | no `Workflows` permission, so GitHub refuses pushes that touch `.github/workflows/**` | same, by omitting the scope |

**Recommendation: a GitHub App** owned by `cabralgava`, **private to the account**, installed only on `cabralgava/oplyra`, with webhooks disabled and no user-authorization flow. The wrapper signs a short JWT with the private key (Node `crypto`, no dependency), requests an installation token for the single repository with the permission map below, and compares the `permissions` and `repository_selection` returned with the expected values **before use** (§6.3).

**Minimum permissions.** *Confirmed by the owner against the official documentation (A-9):* Metadata read is enough to read the rules that apply to `main`; installation tokens last one hour and can be restricted in repositories and permissions at creation. *Other rows remain expectations until the rehearsal or the maintenance-session check:*

| Permission | Level | Needed for |
| --- | --- | --- |
| Metadata | read | mandatory; also expected to be enough for the **effective rules of a branch** (`GET /repos/{owner}/{repo}/rules/branches/{branch}`), which shows the rules that apply to `main` without Administration |
| Contents | write | push to the agent branch; read files |
| Pull requests | write | create/edit the draft PR, comment on it |
| Actions | **read** | list runs and read job logs |
| Checks | read | check runs of the head SHA |
| Commit statuses | read | statuses of the head SHA |
| **Not granted** | — | Administration, Workflows, Secrets, Variables, Environments, Deployments, Pages, Webhooks, Issues, organization scopes, and **Actions write** |

**Limits of the protection check.** The endpoint above reports effective **rulesets**; it is expected not to cover classic branch protection and not to reveal bypass actors or who may push. The wrapper therefore requires the rules it can see on `main` — pull request required, `validate` as required status check, no force push (`non_fast_forward`), no deletion, linear history — and refuses if the answer is missing, errors, or shows only classic protection. **That the App is not a bypass actor, that direct pushes to `main` are restricted, and that the Actions secret list is empty are proven by the owner's export (P-6), not by the wrapper.**

**`ci-rerun` resolved.** Re-running failed jobs is expected to require `Actions: write`, which would also allow dispatching, cancelling and deleting runs and artifacts. It is **removed from the delegated verbs**: the token keeps `Actions: read`; the owner reruns a suspected flaky check, and the evidence records the rerun as owner-made. The alternative (grant `Actions: write` and rely on the wrapper surface) is rejected because the token, not the wrapper, is the boundary.

### 5.2 CI: real mechanism and limits

**Correction of revision 1:** a `pull_request` run for a branch **of the same repository** is not secret-free by itself. Repository and organization Actions secrets are available to such runs; only runs for **forks** are withheld secrets and get a read-only token. Therefore the protection must come from the following, none of which relies on the event type alone:

1. **The agent cannot change workflow files.** The guard denies `.github/**`, and the App has no `Workflows` permission, so GitHub refuses a push touching `.github/workflows/**`. A `pull_request` run uses the workflow definition from the PR merge commit, so this matters.
2. **No Actions secret exists** in the repository or the owner's account for this repository, and none is added without a CR. Today `ci.yml` uses none (A-4). The owner records the empty secret list in P-6. If a secret-bearing job is ever needed, it uses an **environment with required reviewers**, never an unconditional repository secret, and it is a separate CR.
3. **Token and trigger hygiene** enforced by a CI test (C-10): every workflow declares `permissions` at job or workflow level with no write scope; no `pull_request_target`, no `workflow_run`, no `workflow_dispatch`, no `secrets.*` references except `github.token`, no self-hosted runner labels; the install stays `--frozen-lockfile`. The repository default `GITHUB_TOKEN` permission is set to read-only by the owner (P-5).
4. **Code from the agent branch does run in CI** (tests, build, install scripts allowed by the lockfile). Real limits: it can read what the runner can read (the checked-out repository and the read-only token), and it has internet egress from a GitHub-hosted, ephemeral runner. The controls above (no secrets, read-only token, frozen lockfile, which the guard protects as control plane, no new dependency without the owner) are what bound the damage. They are **not** a sandbox for arbitrary code.
5. If the repository is public (unverified, A-7), everything pushed is publicly readable: the pre-push secret scan (§6.2) is then essential.

### 5.3 Checklist of prerequisites

- **P-1** the GitHub App and its installation as in §5.1; private key stored outside the repository with owner-only access; App ID and installation ID in an owner-only configuration file outside the repository.
- **P-2** ruleset on `main`: PR required, `validate` required (strict), linear history, no force push, no deletion, no bypass actor including administrators and the App, stale-review dismissal, direct pushes restricted. If the plan cannot enforce it, real writes are **not** enabled and the gap is recorded.
- **P-3** ruleset on `agent/**`: no force push, no deletion.
- **P-4** the App has no `Workflows` permission (refusal of workflow pushes is tested in the rehearsal).
- **P-5** repository default workflow token permission read-only; no self-hosted runners; secret list empty.
- **P-6** the owner records the ruleset export, the App permission list and installation repositories, and the empty secret list in `ESTADO.md` (never the key).

## 6. Mechanism (design; nothing implemented)

### 6.0 Authorization record (owner-approved, immutable for the session)

`--increment=<ref>` (regex `^(i[0-9]{2}|cr-[0-9]{3}|dp-[0-9a-z]+|ops-[0-9]+)$`) only **selects** a record. Authority is the record, created by the owner with `scripts/claude-authorize.mjs`, a control-plane script the owner runs in a normal terminal (TTY and typed confirmation, like the maintenance session; it is not in the agent allowlist). The record is a JSON file **outside the repository** in an owner-only directory:

| Field | Meaning |
| --- | --- |
| `schema` | `oplyra-delivery-authorization/1` |
| `ref` | the increment reference |
| `repository` | exactly `cabralgava/oplyra` |
| `baseRef`, `baseSha` | `main` and the exact commit the branch may start from |
| `branch` | the **one** branch name allowed (`agent/<type>/<ref>-<slug>`, regex of CR-032 §3) |
| `paths` | closed allowlist of repository-relative paths or directory prefixes the agent may stage; validated at creation: no root wildcard, nothing in the control plane, secrets, `sources/` or the protected reference |
| `contractsCr` | CR id required to touch `contracts/**` manifests, if any *(clarified in §16.4: it identifies the CR whose documents may be touched, may differ from `ref`, and is valid only together with `contractsScope`)* |
| `contractsScope` | *(added, §16.4)* explicit list of files under `contracts` the agent may stage; each must also be in `paths`; never frozen releases, registries, schemas, fixtures, migrations or other CRs |
| `budgets` | limits of §6.4; each value ≤ the hard ceilings coded in the wrapper |
| `issuedAt`, `expiresAt` | expiry ≤ 7 days |
| `authorizedBy` | `project_owner`, with the owner's confirmation text |

**The agent cannot create or widen it:** the directory is outside the repository, which the guard already refuses to read or write (`LF-READ-OUTSIDE`, `LF-WRITE-OUTSIDE`); the creating script is not in the allowlist and needs a TTY and a typed phrase; the launcher loads the record read-only, passes only its path and SHA-256, and every wrapper re-verifies the hash, owner and mode (owner-only, not group/world-writable) on each call; a changed, expired or missing record refuses; widening requires a **new record and a new session**. Residual risk: the agent runs as the same operating-system user, so these checks are defense in depth against accident and tool misuse, not a sandbox (R-11); the barrier that does not depend on the agent's host is server-side (§5), and the record hash is printed in the PR provenance and in `ESTADO` so the owner can compare it with what was issued.

### 6.1 Wrapper scripts (`scripts/claude-git.mjs`, control plane)

One Node script, run as `pnpm git:<verb>` / `pnpm gh:<verb>`, with injectable ports (process runner, filesystem, clock, HTTP client, key store), so it is tested offline. It never uses a shell, never accepts raw Git or API arguments, builds the child environment from an allowlist (`PATH`, `HOME`, locale) instead of inheriting, and talks to GitHub through **REST calls to `api.github.com` on a closed list of endpoints** with Node's HTTP client rather than through the `gh` CLI (smaller surface, simpler to fake in tests). Git network operations use the installation token through child-only configuration, never argv.

| Verb | Does | Closed argument grammar |
| --- | --- | --- |
| `git:branch` | creates and switches to the record's branch at `baseSha` | none (name and base come from the record) |
| `git:stage` | `git add -- <paths>` | explicit paths inside `record.paths` only; no `-A`, `.`, globs |
| `git:commit` | `git commit` with a message file | `--message-file <path inside repo>`; Conventional Commit subject ≤ 72 chars; attribution trailer from the session; author fixed to the App identity |
| `git:push` | `git push origin refs/heads/<branch>:refs/heads/<branch>` | none |
| `gh:pr-create` | opens a **draft** PR `base=main`, `head=<branch>` | `--title`, `--body-file` |
| `gh:pr-update` | edits title/body of **its own** draft PR; adds a comment | `--body-file`, `--comment-file` |
| `gh:ci-status` | reads check runs and statuses of the head SHA; bounded wait; truncated failed-step log excerpt | `--wait <seconds ≤ cap>` |
| `gh:doctor` | read-only self-check of §6.3 (token permissions, repository selection, effective rules of `main`) | none |

Everything else does not exist: no merge, review, ready-for-review, close, rerun, branch deletion, tags, releases, ruleset or secret access, `push --delete`, `config`, `remote`, `reset`, `rebase`, `checkout`, `stash`.

### 6.2 Preflights

**`git:branch` (creation) — its own preflight:**

1. `delegatedDelivery` enabled in the control-plane file; kill-switch sentinel absent (HB-11).
2. A valid, unexpired authorization record loaded by the launcher; hash, owner and mode verified; `record.repository` matches.
3. `origin` is the only remote and its normalized URL equals `github.com/cabralgava/oplyra` (HTTPS or SSH); `url.*.insteadOf`, `core.hooksPath`, credential helpers and `GIT_*` overrides in the environment are refused.
4. The worktree and the index are **clean** (no tracked change, no untracked non-ignored file) and no rebase, merge, cherry-pick or bisect is in progress; the current HEAD is `main` (or a detached HEAD at `baseSha`).
5. A read-only fetch of `baseRef`; the base is permitted only if `origin/main` equals `record.baseSha` (the default, `allowBaseAdvance: false`: if `main` moved, the owner issues a new record). The branch name must equal `record.branch` exactly and must not already exist locally or remotely.
6. `gh:doctor` checks pass (token permission map and repository exactly as expected; effective rules on `main` as required in §5.1).
7. The branch is created at `baseSha`.

**Every other write verb** (`git:stage`, `git:commit`, `git:push`, `gh:pr-create`, `gh:pr-update`):

1. Items 1–3 and 6 above.
2. The current branch equals `record.branch` (the `agent/` regex matches; never `main`, `master`, `release/*`, `hotfix/*`, a detached HEAD or another agent branch) and no operation is in progress.
3. HEAD descends from `record.baseSha` and, if an upstream exists, it is `origin/<branch>`.
4. Budgets and counters within limits (§6.4).
5. **Staging and commit:** every path is inside the repository, matches `record.paths`, is not control plane, secret, git-ignored, `sources/` or the protected reference, symlinks resolved; `contracts/**` only as the explicit files of `record.contractsScope` under `record.contractsCr` (clarified in §16.4; `ref` and `contractsCr` are different things and may differ).
6. **Push and PR text:** the diff of the commits to be sent and the PR text are scanned with the patterns of `scripts/scan-secrets.sh`; a hit refuses and prints only file and pattern id.
7. An append-only audit record (JSON lines, git-ignored directory outside `test-results/`, no secrets, no raw arguments beyond the grammar) is written for every attempt, including refusals.

### 6.3 Credentials and verification of permissions

The App private key is read only by the wrapper process from an owner-only location outside the repository. Per verb, the wrapper mints an installation token requesting **one repository and the exact permission map of §5.1**, then compares the `permissions` and `repository_selection` in the response with the expected values and refuses on any difference (extra permission, missing one, more than one repository). The token lives in memory and in the child's configuration only. The launcher gains `GH_TOKEN`, `GITHUB_TOKEN`, `GH_ENTERPRISE_TOKEN`, `GH_HOST`, `GIT_ASKPASS` and the App key variables in `FORBIDDEN_ENV`, so the owner's personal credentials cannot reach the session. Tests plant a canary token and key to prove neither reaches stdout, stderr, audit, commit, PR text or logs. Because the permission statements are expectations (A-9), the **rehearsal** (§10) confirms them against the real GitHub and the owner confirms them in the official documentation in the maintenance session before the App is created.

### 6.4 Budgets (hard ceilings in code; the record may only lower them; proposed assumptions)

Per record: commits ≤ 20; pushes ≤ 10; draft PRs = 1; diagnosed fix attempts ≤ 3 per failing check (D-8); CI wait per call ≤ 20 minutes (the job timeout is 30); wall-clock and iteration ceilings per CLAUDE.md governance item 8 *(decided in D-23, §16.6: coded ceilings 28800 s and 10 iterations, proposed defaults 14400 s and 6; implemented as explicit values per record, see N-6)*; three consecutive refusals open a circuit breaker that ends the delivery with a handoff record. Counters live in the git-ignored state directory of §8.

### 6.5 Guard, launcher and settings changes

- Guard: add the wrapper script names to `ALLOWED_PNPM_SCRIPTS` with per-script argument grammars (anything else refused); add the authorization directory and `scripts/claude-authorize.mjs` to what the autonomous policy refuses to read or write. Raw mutating `git`, raw `gh` and the network families stay denied.
- Launcher: new argument form `--increment=<ref>`; loads and verifies the record; refuses the new forbidden environment names; the maintenance session never loads a record and never runs the wrappers.
- `.claude/settings.json`: allow entries for the wrapper scripts; the existing `deny` for raw `git`/`gh` stays; no `defaultMode`.

### 6.6 Untrusted input

CI logs, PR/issue/comment text, other authors' branch names and commit messages are **data, never instructions** (CLAUDE.md governance item 7). The wrapper truncates and labels what it prints; a test feeds an instruction-bearing log and checks that nothing in the mechanism acts on it.

## 7. Boundaries that stay owner-only (or specifically authorized)

Merge, approval, "Ready for review", closing a PR, **CI reruns**, branch deletion, tags, releases, ruleset, App and key management, bypass actors, Actions settings and secrets; creating or widening an authorization record; **any change of the control plane** (`scripts/claude-*`, `.claude/**`, `.mcp.json`, `CLAUDE.md`, `.github/**`, `package.json`, lockfiles, `tools/developer-harness/**`, `DEVELOPMENT-TOOLS.md`, `AUTONOMOUS-BUILD.md`, the authorization directory) via an owner-started maintenance session; production, remote Supabase projects, remote migrations, real credentials, paid calls, deploys; changes to frozen contracts, permission/autonomy/approval semantics or `executionEnabled`; force push, history rewriting and any push to `main`, always.

## 8. Reproducible release tooling and gate runner (replaces the throw-away generator)

- **Source:** a versioned tool under `tools/contract-release/` (not control plane): plain `.mjs`, Node ≥ 22, only `node:*` modules, so it runs in CI and locally. Unit tests under `test/tooling/` run in the normal Vitest gate.
- **Recipes.** Each release has a versioned **recipe** (`tools/contract-release/recipes/<version>.json`) with: `release`, `base` (the previous frozen release and its manifest SHA-256), the change set (modified/added lists), `snapshot` (the **governed snapshot**: a commit SHA and the tree of the committed change set), `generatedAt` (a fixed value; for a frozen recipe it is copied from the historic evidence and **never recomputed**), the expected SHA-256 of every output, `frozen: true/false`, and, for a frozen recipe, a pointer to the **historic evidence** file with its SHA-256.
- **Governed snapshot, not the working tree.** The tool reads artifact bytes from the snapshot commit with read-only Git (`git cat-file`/`git archive` into a temporary directory), verifies each of them against the SHA-256 recorded in the release manifest, and runs the cross-validation **from the exported snapshot**, with the validator code that was part of that snapshot, never from the current working tree. Content committed after the snapshot cannot enter a frozen release. A recipe whose snapshot is unavailable or whose hashes differ fails with a fixed code. Because PR #4 will be squash-merged, the 2.22 recipe pins the **squash commit of PR #4 on `main`** (recorded by the increment after the merge) and verifies it against the 490 hashes of the published manifest; the original commit `545d6ea` is recorded as informational only.
- **Release 2.22 reproduction.** A test regenerates 2.22 in a temporary directory from its recipe, the snapshot and the historic evidence (`oplyra-gen-2.22-evidence/1`, committed as a governed historical record with its SHA-256 `0f46329f…7815` and the retired generator's SHA-256 `91ebd4c4…ed52` noted), with `generatedAt` `2026-10-01T13:50:12Z`, and requires byte equality with the published report (`66d0da80…a5fc`) and manifest (`2d68a995…cdd6`) and the digest `6267ff67…98c8`. No gate is re-run for a frozen release; the evidence is the historical one.
- **Future releases.** A new recipe starts with `frozen: false`, names the snapshot commit that contains its committed change set and the previous frozen release as base, runs the gate runner, writes the intermediate and final outputs, and is then frozen by recording the expected hashes. The tool never rewrites a frozen release and never reads newer content into one.
- **State and evidence of in-progress releases** live in a git-ignored directory that Playwright, Vitest and the build do not clean (proposed `.oplyra/release/`); Playwright output moves to `.oplyra/playwright` via `outputDir` in `playwright.config.ts` (a normal file). Both go into `.gitignore`.
- **Gate runner:** `pnpm release:gates` runs a release's gates in the declared order, each as its own process, with test filters set by the runner (not by the agent through `pnpm test -t`), reads counts from machine-readable reporters instead of pasted text, and writes the evidence itself. It enforces `db-reset → db-roles → verificar`, refuses to run Playwright between the intermediate and final phases, and never reuses results of another HEAD or tree hash.
- **Safety kept:** intermediate → gates → final, closed evidence schema, transactional writes.

## 9. Merge: conditions to automate, **not enabled**

Only Tier 0 is in force; this CR proposes no change to it.

| Tier | Behavior | Preconditions | Proposed |
| --- | --- | --- | --- |
| 0 | owner approves and squash-merges | — (today) | in force |
| 1 | owner approves a PR **authored by the App identity** and arms GitHub native auto-merge (squash); GitHub merges when `validate` is green on that SHA | P-1…P-6 evidence; "require 1 approval" enabled by the owner; stale-review dismissal; approval bound to the head SHA; the App has no merge or auto-merge capability; auto-merge not armed for PRs touching the control plane or `contracts/**` unless the owner's approval names the CR | **recommended ceiling**, decided only after the rehearsal |
| 2 | merge without a human approval for classified low-risk paths | HB-13 resolved by an independent human arrangement; HB-01…HB-15 with evidence; a separate CR | **not proposed** |

In no tier does AI review, the agent's own checks or a green status alone count as approval or as independent review; HB-13 stays unmet until its CR-032 evidence exists.

## 10. Sequencing: what proceeds offline and what gates real writes

**After approval of this increment, development and offline tests proceed immediately and do not wait for the owner's GitHub work:** S1b texts, authorization script, wrapper, guard, launcher and settings changes, the release tool and gate runner, Playwright output relocation, the CI prerequisites in the repository (C-7, C-1, C-8, C-4, C-9, C-10), and every test of §11 (they use a local bare repository, a fake HTTP server and fake key store). Implementing these steps is done by the owner in a maintenance session (control plane), without the wrappers, which do not exist yet.

**Only the enabling of real writes is blocked** until all hold, with evidence in `ESTADO.md`: P-1…P-6 done and exported; the offline tests green; the CI prerequisites merged; a **rehearsal** on a scratch branch with the owner present — create the record, branch, commit, push, draft PR, a failing CI and a fix within the budget, an intentional refusal of each §11 negative class against the real protections (including the refusal of a workflow-file push by the App), interruption and resume, and a revert PR. The rehearsal also confirms the permission expectations of A-9 on the real GitHub. Then the owner flips `delegatedDelivery` to enabled in a maintenance session. Until then the wrappers exist but refuse every write with a fixed code.

## 11. Tests (to be written with the implementation; none exist)

Offline, in the normal gate: wrapper against a **local bare repository** acting as `origin` (with a server-side hook simulating the ruleset), a fake HTTP server for the GitHub REST calls and a fake key store. No network, no real key.

| Class | Cases (each refused with a fixed code; a mutation disabling the check must fail the test) |
| --- | --- |
| Authorization record | missing, expired, wrong repository, tampered hash, group-writable file, record created by the agent path, `--increment` ref not matching the record, branch name ≠ `record.branch`, paths outside `record.paths`, budgets above the ceilings, widening attempt mid-session |
| `git:branch` preflight | dirty worktree or index, untracked file, HEAD not on `main`, `origin/main` ≠ `baseSha`, branch exists locally or remotely, operation in progress, wrong remote, `insteadOf` |
| Other verbs' preflight | on `main`, detached, another agent branch, HEAD not descending from `baseSha`, upstream mismatch |
| Push refusals | `main`; `+refspec`; `--force`, `-f`, `--force-with-lease`; `--delete`, `:branch`; `--mirror`, `--all`, `--tags`; other remote or URL; non-fast-forward (bare-remote hook) |
| Argument injection | extra args to every verb; `-c`, `-C`, `--git-dir`, `GIT_*`, `core.hooksPath`, `credential.helper`; shell metacharacters; message-file outside the repository or a symlink |
| Staging | `-A`, `.`, globs; control plane; secrets; git-ignored; `sources/`; protected reference; symlink escapes; `contracts/**` without `contractsCr` |
| Commit | non-conventional or > 72 chars; forged author or trailer; empty commit; commit on `main` |
| GitHub surface | no verb for merge, review, ready, close, rerun, delete, tag, ruleset, secret; comments only on the agent's own PR; REST host pinned to `api.github.com` |
| Token and permissions | token response with an extra or missing permission, several repositories, `Actions: write`, `Workflows`, `Administration` → refused; canary token and key never in any output; owner token variables refused by the launcher |
| Protection check | rules unreadable, only classic protection, missing `validate`, missing no-force-push → refused (fail closed) |
| Secret scan | secret in diff or PR body blocks the push; output has file and pattern id only |
| Untrusted input | instruction-bearing CI log or comment changes nothing |
| Guard and launcher | wrapper scripts allowed only with their grammar; raw `git push`/`gh` still `LF-GIT-MUTATION`/`LF-CMD-NOT-ALLOWED`; `--increment=` grammar; authorization directory unreadable and unwritable by the agent; maintenance session cannot run wrappers; `settings.json` mirrors the guard |
| Release tool | regeneration of Release 2.22 from recipe, snapshot and historic evidence is byte-identical including `generatedAt`; a file changed after the snapshot cannot enter a frozen release; unavailable snapshot or hash mismatch fails; future-release recipe cannot reference a frozen recipe's outputs; gate order enforced; refuses Playwright between phases; stale-HEAD evidence rejected; Playwright output is not `test-results/` |
| CI hygiene (C-10 and subset) | C-7 `test/contracts` stay in Vitest discovery and `validate` runs `pnpm verificar`; C-1; C-4; actions pinned by SHA; no `pull_request_target`, `workflow_run`, `workflow_dispatch`, `secrets.*` (except `github.token`), self-hosted runner or write permission; `--frozen-lockfile` kept; `cancel-in-progress` off for `main` |
| Preservation | existing `release-2.21-congelada` and Release 2.22 tests green; manifests 2.16–2.22 unchanged |

## 12. Risks

| ID | Risk | Mitigation |
| --- | --- | --- |
| R-1 | A wrapper bug writes to `main` or another repository | Server-side rulesets and an App with no bypass are the primary barrier (§5); wrapper preflight is defense in depth; bare-remote tests and mutations |
| R-2 | App key or token leakage, or privilege creep | Key outside the repository and unreadable by the agent tools; per-call tokens narrowed and verified against the expected permission map; canary tests; launcher refuses owner tokens; owner rotates the key |
| R-3 | Prompt injection through CI logs, PR text or branch names | §6.6; no verb acts on content; budgets and refusals |
| R-4 | Secrets or private data in commits or PRs, possibly public (A-7) | Diff and PR-text scan before every push; path allowlist in the record; ignored files excluded |
| R-5 | CI cost, runaway loops, or malicious code from the branch running in CI | Budgets, wait caps, circuit breaker, kill switch; §5.2 limits are real and stated: no secrets, read-only token, no workflow edits, frozen lockfile; **not** a sandbox |
| R-6 | Delegated mode read as the unattended loop | Separate switch and wording; `executionEnabled` stays `false`; HB-13 unmet |
| R-7 | Owner approves agent PRs without real review | PR template with provenance, record hash and evidence; approval bound to SHA; AI review labeled advisory |
| R-8 | Server plan cannot enforce rulesets; documentation expectations in A-9 turn out wrong | Real writes stay disabled; rehearsal confirms; gap recorded |
| R-9 | Tooling regenerates a published release differently or reads future content | Recipes pin a snapshot; hashes verified; byte-for-byte test; releases only verified, never rewritten |
| R-10 | Maintenance-session approvals add friction while implementing this CR | Accepted: the control plane stays protected by design; the single approval covers the scope, the maintenance session still asks per action |
| R-11 | Same-user process can in principle reach the record, the key or the audit log | Guard refuses paths outside the repository; hash checks; barrier that does not depend on the host is server-side; owner compares the printed record hash |
| R-12 | The squash merge of PR #4 makes `545d6ea` unreachable from `main` | The 2.22 recipe pins the squash commit and verifies every artifact hash from the manifest |

## 13. Implementation scope proposed for one approval

One increment, "delegated delivery baseline", delivered on one branch **after PR #4 is merged**, in this order, each step with tests and evidence:

1. **S1b — texts:** `CLAUDE.md` (the sentence "Git e execução fora da allowlist ficam com o proprietário" and the delivery paragraph), `DESENVOLVIMENTO.md`, `DEVELOPMENT-TOOLS.md`, `AUTONOMOUS-BUILD.md` (two-concept wording and the `delegatedDelivery` switch, default disabled).
2. **Authorization** script and record format (§6.0).
3. **Wrapper, guard, launcher, settings** (§6) with the §11 tests, offline.
4. **CI prerequisites** C-7, C-1, C-8, C-4, C-9, C-10, PR template and CODEOWNERS (visibility only).
5. **Release tool, recipes and gate runner** (§8), Playwright output relocation, and the Release 2.22 recipe with its reproduction test.
6. **Owner prerequisites P-1…P-6** (checklist; can run in parallel; gate only the enabling).
7. **Rehearsal** (§10), then the owner enables `delegatedDelivery`.
8. **Contract Registry Release 2.23** packaged with the new tool as a logical change set over 2.22; earlier releases untouched.

Steps 1–5 touch the control plane or its tests and run in an owner-started maintenance session. Nothing in the scope enables merge, the unattended loop, production, remote migrations or any credential other than the App of P-1.

## 14. Decisions requested from the owner

| ID | Decision | Recommended |
| --- | --- | --- |
| D-11 | Adopt delegated delivery through typed wrappers (D-1 option B, extended as in §4) | **Yes** |
| D-12 | **GitHub App** owned by `cabralgava`, installed only on `cabralgava/oplyra`, with the permission map of §5.1 (rerun excluded), instead of a machine user with a PAT | **Yes**; confirm the permissions in the official documentation first |
| D-13 | Rulesets P-2/P-3 as a hard prerequisite of **real writes**; do not enable if the plan cannot enforce them | **Yes** |
| D-14 | Owner-approved authorization record outside the repository, created by an owner-run script; `--increment` only selects it (§6.0) | **Yes** |
| D-15 | Budgets and ceilings of §6.4 | Adopt as proposed; adjust with evidence |
| D-16 | Separate `delegatedDelivery` switch, default disabled; `executionEnabled` unchanged | **Yes** |
| D-17 | Merge ceiling at Tier 1 (§9), decided after the rehearsal | Defer; Tier 2 not proposed |
| D-18 | Release tool with recipes and governed snapshots, gate runner, Playwright output relocation, in the same increment (§8) | **Yes** |
| D-19 | Offline development proceeds after approval; identity and rulesets gate only real writes (§10) | **Yes** |
| D-20 | CI reruns stay an owner action (App has `Actions: read` only) | **Yes** |
| D-21 | Pin the 2.22 recipe to the squash commit of PR #4 and commit the 2.22 historic evidence file as a governed record | **Yes** |

## 15. Preservation and scope of this document

Delivered as a new file only, status `proposed`. No script, hook, setting, CI file, `CLAUDE.md`, ruleset, GitHub App, token, registry, schema, fixture, migration, manifest, code or earlier release was modified; nothing was staged, committed, pushed, opened as a PR or merged by this work, and no external call was made. The CR is outside every manifest until approved and packaged. Unverified items: the GitHub permission and ruleset-endpoint behavior of §5 (official documentation not consulted, A-9), the server-side state of A-7, whether the repository is public, and the real duration of CI runs.

## 16. Implementation notes — offline phase (added 2026-10-01; no decision of §14 changed)

Written after the offline implementation of §13 steps 1–5. Above this section only three places carry a marked clarification (§6.0 table rows `contractsCr` and `contractsScope`, §6.2 item 5, §6.4), each pointing here; nothing else was edited and no decision was changed. The status stays `approved`; **`delegatedDelivery` is off, `executionEnabled` is `false`, automatic merge is not authorized, Release 2.23 is not generated, and no GitHub App, ruleset, token or remote write exists.** Every item below was judged against decisions D-11…D-21; none changes them, so none is escalated.

### 16.1 Deviations from the text, with impact

| ID | Text of the CR | Implemented | Impact and why it stays inside the approved decision |
| --- | --- | --- | --- |
| N-1 | §6.2 item 7 and §6.4: audit and counters live in a git-ignored directory of the repository | They live in `~/.oplyra/delivery-state/` (audit `audit.jsonl`, counters `<ref>.json`), outside the repository, written by the wrapper | **What it does:** the autonomous guard already refuses writes **by the agent's tools** (Write, Edit, redirects) outside the repository, so those tools cannot rewrite the counters, the clock, the circuit breaker or the audit. **What it does not do:** it creates **no operating-system isolation** between processes of the same user. A process running as the owner (including any process the agent could start by a path the guard does not cover) can read and write `~/.oplyra/**`; this is residual risk **R-11**, unchanged and still accepted. The barrier that does not depend on the host remains the server side (§5). Because a corrupted or truncated state file would otherwise reset the clock and the budgets, an existing but unreadable or inconsistent state file now **fails closed** (`DD-STATE`) instead of starting from zero. Cost: the owner reads the audit outside the repo (`~/.oplyra/delivery-state/audit.jsonl`). It is a placement choice inside what D-14/D-15 already approve |
| N-2 | §6.1 `gh:ci-status`: "truncated failed-step log excerpt" | Prints the check-run list, the combined status and up to five **annotations** of each failed check, all labelled untrusted and truncated. It does not download job logs. **Summary and annotations may be insufficient for autonomous diagnosis** (a failing `pnpm verificar` usually produces no annotation at all; the cause is in the step log). When a failed check returns no usable annotation, the wrapper prints `DIAGNÓSTICO INSUFICIENTE`, states the limitation, **does not guess a cause and does not count the failure as a fix attempt (D-8)**, and refuses `git:stage`, `git:commit` and `git:push` (`DD-UNDIAGNOSED`) so no correction is written blind. Reading and commenting (handoff) stay available. The block is lifted when the same check passes, when the agent registers a valid **structured diagnosis** (D-22 complement, §16.8), or by the owner after providing the logs (`node scripts/claude-authorize.mjs --clear-undiagnosed=<ref>`, terminal and typed phrase, audited; only `undiagnosed` is cleared) | Job logs are served through a redirect to another host, which would break the pinned host `api.github.com` (§6.1, §11 "REST host pinned"), the harder constraint. The practical cost is real: for most CI failures the autonomous loop of this mode stops at "ask the owner for the log". That stays true in production until the rehearsal fills the host list. A log-reading verb, `gh:ci-log`, was approved separately (**D-22**, 2026-10-02) and is implemented offline (§16.7); with the production host list empty it resolves the job and then refuses before downloading anything |
| N-3 | §6.2: `gh:doctor` checks in preflight item 6 of every write verb | Implemented for **all** write verbs (`stage` and `commit` included) after the review of §16.2 | Aligns with the text. Cost: one token request per verb |
| N-4 | §6.1: "attribution trailer from the session" | The wrapper **validates** that the only trailers present are a well-formed `Co-Authored-By: Claude … <noreply@anthropic.com>`; it does not append one | The agent supplies the attribution it was told to use; a forged author or trailer is refused (§11 "Commit"). Appending automatically would need the session to hand the wrapper the model name, which no approved mechanism provides |
| N-5 | §6.2 item 5: `contracts/**` "only if `record.contractsCr` is set and the ref matches" | **Clarified (§16.4):** `ref` identifies the **increment** and `contractsCr` identifies the **CR whose documents may be touched**; they may differ. The record now binds both explicitly to the permitted scope: `contractsCr` **and** `contractsScope` (a list of explicit files under `contracts`, each also listed in `paths`) must come together. A well-formed `contractsCr` alone authorizes nothing. Even with a valid binding the wrapper and the record refuse: documents of **other CRs**, frozen release artifacts (`contract-registry-manifest-v*`, `cross-registry-validation*`, `contract-registry-release-*.contract.test.*`, `CONTRACT-REGISTRY-FREEZE-*`), anything under `registries/`, `schemas/`, `fixtures/` or `migrations/` of a `contracts` path, directories (only files), and the release tool with its frozen recipes and evidence (`tools/contract-release/**`) | The earlier text ("the ref matches") was ambiguous. The stricter reading (`ref` = CR id) would block an increment `iNN` from touching the contract document of the CR it was authorized for; the looser reading (any well-formed CR id) would let a record touch anything. The explicit scope removes both problems and keeps authority with the owner, who lists the files |
| N-6 | §6.4: wall-clock and iteration ceilings "per CLAUDE.md governance item 8" | **Implemented with the values approved in D-23 (§16.6).** Every record carries `wallClockSeconds` and `iterations`, **always explicit** (the record never stores "default"; the owner's script proposes 14400 s and 6, requires the typed confirmation, and writes the explicit values); a record without them, with a non-positive value, or **above the coded ceilings (28800 s and 10)** is refused (`DR-BUDGETS`). The wrapper persists both in the state file outside the repository. **The duration includes CI waiting and interruptions.** The existing budgets (commits, pushes, PR, fix attempts, CI wait) keep applying **together** with these. **Wall clock:** starts at the **first call of any verb** with the record loaded (`startedAt`), is not reset by resuming the session or restarting the launcher, and when `now − startedAt ≥ wallClockSeconds` every verb except `doctor`, `ci-status` and the **limited handoff** of `pr-update` is refused (`DD-DEADLINE`). `gh:ci-status --wait` never waits beyond what remains of the clock. **Budget exhausted** means the duration is over **or** all `iterations` were used with no cycle open; from then on `pr-update` allows **exactly one** comment (`--comment-file`, at most 4096 bytes, no title or body edit, audited with `handoff: true`); a second handoff is refused (`DD-HANDOFF-USED`) and any edit or extra comment is refused (`DD-HANDOFF`). Before exhaustion `pr-update` keeps its normal regime (edit of the own draft PR and comments up to the comment cap). **Iteration:** one **delivery cycle**, which opens at the first accepted `git:stage` while no cycle is open and closes at the accepted `git:push`; several commits in one cycle count once, a refused stage opens nothing, and each correction after a CI failure is a new cycle; when `iterations` cycles have been started, a new cycle is refused (`DD-ITERATIONS`). The record's `expiresAt` (≤ 7 days) is **not** a substitute: it bounds the record's validity, the clock bounds the delivery | The text named the ceilings but no value, and CLAUDE.md governance item 8 ("limit turns, delegation, time and budget") governs the **product agents** and fixes no number. The owner supplied the values in **D-23** on 2026-10-02 (§16.6); nothing was invented before that. The wrapper can only see its own calls, so "iteration" is defined over what passes through it. The earlier behavior in which `pr-update` stayed fully available after the deadline was a gap, corrected by the limited handoff above |
| N-7 | §8: Release 2.22 tests unchanged | The Release 2.22 contract test reads the **governed snapshot** (`7107ade`, the squash of PR #4) instead of the working tree; a separate test (`test/contracts/cr-033-current-content.test.ts`) checks the **current** tree and allows divergence from the 2.22 manifest only in a closed list of files this CR authorizes | Required by §8 ("a frozen release is verified from the snapshot") and chosen by the owner on 2026-10-01. Manifests 2.16–2.22 and the 2.19–2.21 tests are untouched. Reading the snapshot cannot hide a regression: the current-content test would fail on any other divergence |
| N-8 | §5.2 / D-7: actions pinned by SHA | **Applied locally (2026-10-02); remote validation still pending.** The offline implementation first left `ci.yml` on tags with `PENDING_SHA_PINS` listing them. The owner's Codex then confirmed the SHAs in the official repositories and `ci.yml` now pins `actions/checkout`, `pnpm/setup` and `supabase/setup-cli` by full commit SHA, with the origin tag kept as a comment (versions, Node 22 and Supabase CLI 2.114.0 unchanged); `pnpm/setup` gets `install: false` because the explicit `pnpm install --frozen-lockfile` step already installs. `PENDING_SHA_PINS` is empty and `test/ci-hygiene.test.ts` fails for any action not pinned by a 40-hex SHA. **No remote CI run has validated this configuration yet**; the first PR does. `delegatedDelivery` stays `false` | Resolving SHAs needs network, which the offline phase did not use; the owner's side supplied them. Prerequisite of enabling (D-7), not of the offline implementation. Local application is not remote validation |

### 16.2 Findings of the control-plane review and what was done

The diff of the control plane was reviewed against §6 and §11 by reading the code (green tests were not taken as proof). Findings, all fixed in this phase with a regression test and, where a mechanism was removed, a mutation test:

1. **Code execution through `.git`.** The autonomous guard allowed writes to `.git/**`. An agent could plant a local hook (`post-commit`, `reference-transaction` and others still run despite `--no-verify`) or a `filter.*.clean` driver with `.gitattributes`, which would run inside the wrapper, in the `fetch` and `push` with the token in the child environment. Fixed: the guard refuses writes (and redirects) to `.git` for the autonomous policy (maintenance unchanged); every Git call of the wrapper now carries `core.hooksPath=/dev/null`, `core.fsmonitor=false`, `core.pager=cat`; the effective-config check now also refuses `core.pager|editor|attributesFile|gitProxy|worktree`, `filter.*`, `diff.*`, `merge.*`, `alias.*`, `gpg.*`, `protocol.*`, `submodule.*`, `http.*`.
2. **PATH hijack.** pnpm prepends `node_modules/.bin` (writable by the agent) to `PATH`; a substituted `git` would have received the token. Fixed: `git` is run by an absolute path from a fixed list and the child `PATH` is fixed, not inherited.
3. **Preflight gap.** `stage` and `commit` did not run the §6.2 item 6 checks. Fixed (N-3).
4. Residual and unchanged: the agent runs as the same operating-system user (R-11); the barrier that does not depend on the host remains the server side (§5), which is not configured yet (P-1…P-6).

### 16.3 Evidence

Offline tests: wrapper, record, authorize, guard and launcher (end to end from `claude:local --increment` to the draft PR against a local bare `origin`, a fake HTTP server and a fake key) in `scripts/claude-delivery.test.mjs`; CI hygiene in `test/ci-hygiene.test.ts`; release tool in `test/tooling/`. Results are recorded in `docs/harness/ESTADO.md`. Mutation evidence: each removed check makes a named scenario fail (the suite lists the mutations by id; the control-plane guard, the record, the wrapper and the launcher are covered).

### 16.4 Normative clarification: `ref`, `contractsCr` and the permitted scope

- `ref` (`iNN`, `cr-NNN`, `dp-…`, `ops-N`) identifies the **increment** and names the branch. `contractsCr` (`cr-NNN`) identifies the **CR whose contract documents the increment is authorized to touch**. They are independent: increment `i07` may be authorized to touch the document of `cr-050`; increment `cr-033` touches `cr-033`.
- **Authority is the record.** The owner binds both explicitly: `contractsCr` and `contractsScope` come **together** (one without the other is refused, `DR-CONTRACTS`); `contractsScope` lists **files** (never directories), each also present in `paths`; every `paths` entry under `contracts` must be in the scope.
- **A well-formed `contractsCr` authorizes only what the scope lists, and never:** a document of another CR (`changes/CR-<other>-*`, or any file in `changes/` that is not `<contractsCr>-*`), a frozen release artifact or its verification (`contract-registry-manifest-v*`, `cross-registry-validation*`, `contract-registry-release-*.contract.test.*`, `CONTRACT-REGISTRY-FREEZE-*`), anything under `registries/`, `schemas/`, `fixtures/` or `migrations/` of a `contracts` path, or the release tool, its recipes and evidence (`tools/contract-release/**`). Rewriting a frozen release, or a registry, schema, fixture or migration, needs its own CR and a maintenance session.
- The checks run twice: when the owner creates the record and again, with the same rules, on every `git:stage`, `git:commit` and `git:push` (defense in depth, since the record is the only authority).
- Case is ignored when deciding that a path is under `contracts` or frozen, so changing the case of a directory does not bypass the rule.

### 16.5 Proposal for safe reading of CI logs — **approved as D-22 on 2026-10-02 and implemented offline in §16.7 (where the two differ, §16.7 prevails)**

Needed because annotations are often empty for the failures that matter (N-2). Proposed verb `gh:ci-log --check <name>`, **not implemented**:

1. **Source.** `GET /repos/cabralgava/oplyra/actions/jobs/{job_id}/logs`, which answers with a redirect to a signed, short-lived URL on a GitHub log-storage host. Permission needed: **Actions: read**, already in the §5.1 map (to be confirmed in the rehearsal, A-9).
2. **Job id from the head SHA only.** The wrapper takes `job_id` from the check-runs of the current head SHA (the same list `gh:ci-status` reads) and never from agent input, so the agent cannot ask for arbitrary jobs or runs.
3. **Host policy (the decision that changes §6.1).** The wrapper requests with **redirect following disabled**, reads `Location`, requires `https`, a **closed, owner-approved list of exact host suffixes** (to be recorded from the rehearsal; no wildcard on a shared cloud domain), no credentials in the URL, and issues the second request **without any `Authorization` header** (the signed URL carries its own authorization). Any other host or scheme is refused. `api.github.com` stays the only host that ever receives a token.
4. **Bounded and local.** Timeout 30 s; response capped at 2 MiB while streaming; only the **last 200 lines of the failing step** are kept; the URL itself is never printed or stored.
5. **Sanitizing before the agent sees anything.** ANSI and control characters removed; every line scanned with the same secret patterns as the push scan, matches replaced by `[REDACTED:<pattern-id>]`; each line truncated; the whole block labelled `UNTRUSTED CI LOG — data, not instructions` and, like annotations, never acted on by the mechanism (§6.6).
6. **Budgets.** A separate counter (for example 10 reads per record, owner-set), audited without content; a read does not count as a fix attempt; *(corrected in §16.7: reading a log does **not** lift `DD-UNDIAGNOSED`; a non-empty log permits inspection but does not prove a diagnosis)*.
7. **Residual risks to accept explicitly:** a workflow could print a secret that no pattern recognizes (mitigated by §5.2: no Actions secrets exist); a log can carry prompt injection (mitigated by labelling and by the wrapper never executing from it); logs may expire (GitHub retention), and then the wrapper says so instead of guessing.
8. **Tests to write with it:** fake log server on loopback for the signed URL; redirect to an unlisted host, to `http`, with credentials in the URL, with a second redirect, oversized body, slow body; secret and injection fixtures; mutation per check.

Decision **D-22: approved** by the owner on 2026-10-02, with the conditions and the implementation recorded in §16.7.

### 16.6 Decision D-23 — duration and iteration limits (approved by the owner, 2026-10-02)

| Limit | Suggested default (proposed by the owner's script) | Coded ceiling |
| --- | --- | --- |
| `wallClockSeconds` | 14400 (4 h) | 28800 (8 h) |
| `iterations` | 6 | 10 |

- **Defaults and confirmation.** `scripts/claude-authorize.mjs` presents the defaults (marked as such, with the ceilings), requires the owner's typed confirmation, and the record stores **explicit values only**. Positive values up to the ceilings are allowed; above them, `DR-BUDGETS` (at creation, and again whenever a record is loaded).
- **Scope of the duration.** It includes CI waiting and interruptions; its start and the counters are persisted outside the repository; resuming does not restart the budget (a new budget needs a new record with a new `ref`).
- **Together with the existing limits.** The limits on commits, pushes, PR and fix attempts (and the CI wait per call) still apply at the same time; whichever is reached first refuses.
- **Correction approved with the decision.** After the budget is exhausted `pr-update` allows **only one limited, audited handoff** (one comment, short, no edit); unlimited editing and commenting is not kept as an exception. Implemented as described in N-6 and covered by boundary and mutation tests.
- **Not part of the decision:** nothing about enabling real writes; `delegatedDelivery` stays off, `executionEnabled` stays `false`, merge stays owner-only.

### 16.7 Decision D-22 — `gh:ci-log`, limited reading of CI logs (approved by the owner, 2026-10-02; implemented offline; production host list **empty** until the rehearsal)

**Conditions approved with the decision.** (1) Verb `gh:ci-log`, restricted to the PR of the authorized record and to the current head SHA. (2) The job is **resolved and checked through the workflow runs/jobs API**; a check-run id is never assumed to be a `job_id` and no id or URL is accepted from the agent. (3) Only `api.github.com` receives the token. (4) The redirected download uses a list of **exact hosts** approved by the owner, no broad suffixes; **the production list stays empty until the rehearsal**. (5) HTTPS, default port, no credentials in the URL, any additional redirect refused; the signed URL is never recorded or printed. (6) Time, bytes and lines are limited and truncation is reported. (7) Controls removed, secrets redacted, content marked as untrusted data. (8) Budget: suggested default **10** reads, coded ceiling **20** per record, persisted across resumptions. (9) A non-empty log permits inspection but does **not** prove a diagnosis: no cause or fix is declared without evidence, and insufficient data is reported. (10) The approved limits of duration, fix attempts and iterations still apply.

**How it works (`scripts/claude-git.mjs`, covered by tests and mutations).**
- *Grammar.* `gh:ci-log --check <name>`; the value is a check **name** (a pure number, a string containing `://` or one starting with `/` is refused by the wrapper and by the guard); `--job`, `--url`, `--run-id` and anything else do not exist.
- *Resolution chain, all through `api.github.com`.* Preflight (branch, ancestry, token permissions, effective rules of `main`) → the PR created by the wrapper for this record must be an open **draft** of this branch and its `head.sha` must equal the current head SHA (`DD-PR`, `DD-LOG-SHA`) → `check-runs` of the head SHA must contain **exactly one** completed failed check with that name (`DD-LOG-NOCHECK`) → `actions/runs?head_sha=<sha>` filtered to runs whose `head_sha`, `head_branch` and `head_repository` are this SHA, this branch and `cabralgava/oplyra` → `actions/runs/{id}/jobs` → **exactly one** job with the same name, `run_id`, `head_sha`, a failed conclusion and a `check_run_url` that ends in the id of that check-run (`DD-LOG-JOB`). The `job_id` comes only from that answer (a test makes the check-run id differ from the job id).
- *Download.* `GET …/actions/jobs/{job_id}/logs` must answer **302** with a `Location`; the URL is checked (`https`, no explicit port other than the default, no user/password, hostname **exactly** in the approved list) and then fetched **once**, by a separate client that carries **no credential** and follows **no redirect** (any 3xx is `DD-LOG-REDIRECT`). Limits: 30 s, **2 MiB**, then **last 200 lines**, each cut at 400 columns; every cut is reported. Refusals print at most the hostname, never the URL.
- *Host list.* `LOG_HOSTS` in `scripts/claude-git.mjs` (control plane, changed only in a maintenance session) is **empty**. An invalid list (wildcard, suffix, IP, port, upper case, duplicate, wrong type) is refused before any Git or network call (`DD-LOG-HOST`); with the empty list a read resolves the job and refuses before downloading.
- *Content.* ANSI sequences, control and invisible/bidirectional characters removed; secrets redacted **before** truncation (the push-scan patterns plus bearer tokens, `Authorization` values, URL credentials, signed-URL query parameters and whole private-key blocks); lines prefixed and the block labelled as untrusted data, never acted on. The token, its base64 form and the signed URL are also registered as known secrets, so they never reach output, audit or state.
- *Budget.* `logReads` is a fourth owner value in every record (default 10 proposed by the script, explicit in the record, ceiling 20, `--max-log-reads`), persisted in the state file; a read is consumed when the log request is made, **even if the URL policy or the download then refuses**; at the limit `DD-LOG-BUDGET` before any network call.
- *Interaction with the approved limits.* `gh:ci-log` is not a handoff verb, so the wall-clock deadline refuses it (`DD-DEADLINE`); exhausted iterations do not block reading; the circuit breaker applies; a read changes no counter of commits, pushes, iterations or fix attempts.

**Corrections to the §16.5 proposal.** (a) **A log read never lifts `DD-UNDIAGNOSED`** (proposal item 6 said it would for a non-empty log). A non-empty log permits inspection but does not prove a diagnosis, so the block is lifted only when the same check passes or by the owner (`--clear-undiagnosed`). Consequence: in this mode the agent can read the log and report to the owner, but cannot write a correction for an undiagnosed check until the owner releases it. *(Refined the same day, §16.8: a log read, alone, still releases nothing; a **structured diagnosis** bound to the collected evidence now releases exactly one correction cycle without the owner.)* (b) The proposal said the job id would come from the check-runs list; it now comes from the runs/jobs API and is cross-checked against the check-run. (c) Responses above 2 MiB are **refused** (`DD-LOG-TOO-LARGE`), not cut: without a range request the last lines of a bigger stream cannot be reached, and no range behavior is assumed. Long logs therefore need the owner. (d) The excerpt is the tail of the whole job log, not of the failing step.

**Residual risks and expectations to confirm in the rehearsal (partly confirmed on 2026-10-02 against the official documentation, see §16.9; what the extracts do not cover is still to be confirmed).** The log endpoint answers one 302 to a host the owner will list exactly; `Actions: read` is enough for it; `actions/runs` accepts `head_sha`; run objects carry `head_sha`, `head_branch`, `head_repository`; job objects carry `run_id`, `head_sha`, `check_run_url`; log retention and size. A secret printed by a workflow in a format no pattern recognizes can still reach the agent (mitigated by §5.2: no Actions secrets exist); a log can carry prompt injection (labelled, never executed by the mechanism). The agent runs as the same operating-system user (R-11).

**Evidence.** `scripts/claude-delivery.test.mjs`: refusals for another SHA's job or run, another branch or repository, an incorrect id, name, run or conclusion, ambiguity, host not in the list (suffix, subdomain, trailing dot, IP, other scheme, other port, credentials, relative or oversize URL), an additional redirect (301/302/303/307/308), download failures, an oversize response (including the exact-limit boundary), token and signed-URL leakage, exhausted budget (also after a refused attempt, across resumptions) and the interaction with deadline, iterations and the circuit breaker; each check has a named mutation.

### 16.8 Decision D-22 (complement) — diagnosed autonomous corrections (approved by the owner, 2026-10-02; implemented offline; `LOG_HOSTS` still empty)

**Approved.** After obtaining logs or annotations that are sufficient, the agent registers a structured diagnosis: check, head SHA, run/job, a reference to the collected evidence, a cause hypothesis, the files of the correction and the validation test. The wrapper verifies the link to the evidence **actually collected**, the SHA, the authorized scope and the budgets; it **does not declare the hypothesis true**. A valid diagnosis allows **one** correction cycle inside the existing budgets **without the owner's release**; the attempt is counted **once** and persisted across resumptions. A non-empty log alone releases nothing. Missing, insufficient, expired or other-SHA evidence keeps the refusal. Changes outside the scope still need a new authorization.

**Mechanism (`scripts/claude-git.mjs`, `scripts/claude-authorize.mjs`, guard and settings; all covered by tests and mutations).**
- *Evidence is recorded by the wrapper, never by the agent.* `gh:ci-status` (annotations) and `gh:ci-log` (log excerpt) store what they **displayed**: id `ev-N`, kind, check, head SHA, check-run id, run and job (logs), time, line count, the sha256 digest of the displayed lines and a 16-hex hash of each displayed line (not the text). The id and digest are printed. Empty annotations or an empty log record **no** evidence. The last 12 are kept.
- *Blocks.* A completed failed check at the head SHA now blocks `git:stage`, `git:commit` and `git:push` in both cases: **no annotation** → `undiagnosed` (`DD-UNDIAGNOSED`, as before); **with annotations** → `unresolved` (`DD-DIAG-REQUIRED`, **new**: annotations are evidence, not a diagnosis; previously they only counted as an attempt). Each block clears when a valid diagnosis for that check is accepted, when the same check passes, or when the owner runs `claude-authorize.mjs --clear-undiagnosed=<ref>` (which now clears both kinds). With no CI result recorded the ordinary flow is not blocked.
- *Verb* `gh:ci-diagnose --diagnosis-file <path>` — a repository file only; evidence, ids, SHAs and URLs never come from the command line. The file is a closed JSON, schema `oplyra-ci-diagnosis/1`, at most 8 KiB, scanned for secrets: `check` (a name), `headSha`, `runId`, `jobId`, `evidence {id, digest, quote}`, `hypothesis` (20–600 chars), `files` (1–20 normalized repository paths) and `validation {test}`.
- *Verification, in this order.* Format (`DD-DIAG-FORMAT`); `headSha` equals the current HEAD (`DD-DIAG-SHA`); budgets (`DD-ITERATIONS`, `DD-BUDGET` for commits and pushes; the duration is refused earlier, `DD-DEADLINE`, because the verb is not a handoff verb); **evidence** exists, belongs to the same check and head SHA, has the same digest, has not expired, and the `quote` is **one of the lines that were actually shown** (`DD-DIAG-EVIDENCE`, `DD-DIAG-SHA`) — all before any network call; the evidence and the check/SHA are not **reused** (`DD-DIAG-REUSED`); **scope**: each file passes the same rules as staging (record paths, no control plane, secrets, `sources/`, frozen contracts, ignored files) and the validation test exists or is among the files (`DD-PATH`, `DD-CONTRACTS`, `DD-DIAG-SCOPE`); then, through the API, token and rules, the PR of the record at the current head SHA, and the run/job that the API resolves for that check, which must equal `runId`/`jobId` (a check-run id is never a job id) and, for log evidence, the job that was read (`DD-DIAG-JOB`); finally the fix-attempt budget (`DD-BUDGET`).
- *Effect.* The diagnosis becomes **active**; stage, commit and push may touch only the union of the files of the active diagnoses (`DD-DIAG-SCOPE`, checked on the paths given, on the index after `git add`, on the staged set at commit and on everything pushed since the last push); the accepted `git:push` **consumes** it (`consumed`, pushed SHA) so it authorizes nothing more. The cycle is an ordinary iteration (stage → push) under the existing counting.
- *Counting once.* The attempt is the failing head SHA added to the per-check set that annotations already used (D-8): the same failure is never counted twice, the count survives resumptions, and a refused diagnosis still records the failure it answered (counted once) but registers nothing. At `fixAttempts` failing SHAs the next diagnosis is refused.
- *Expiry (decision D-24, §16.10).* Evidence stops being usable for a **new** diagnosis when **3600 s** have passed since its collection (the exact boundary already counts as expired), when the head SHA changes, after it supported a diagnosis, and when the delivery duration ends.
- *What the wrapper does not do.* It does not say the hypothesis is true, does not run or verify the validation test (that is the agent's step before the commit; the verdict is the CI's), and does not judge whether the quoted line is the cause: the quote proves **which collected line** the diagnosis rests on, nothing more. A mistaken agent can still cite an irrelevant line; the damage is bounded by `fixAttempts` cycles, the scope of the diagnosis, the record and the other budgets.
- *Production state.* `LOG_HOSTS` is empty, so log evidence is unavailable until the rehearsal; annotation evidence works. The owner's release remains available as a fallback.

**Tests** (`scripts/claude-delivery.test.mjs`): the complete cycle (CI fails → evidence → diagnosis → correction → validation step → commit/push against the bare `origin` → new CI result), including a resumed session; refusals for invented evidence (unknown id, wrong digest, invented or partial quote, boilerplate quote, other check, other SHA, expired, none because the log was empty), run/job mismatch (including the check-run id), reuse (same file, same evidence, same SHA, consumed diagnosis, old evidence on a new SHA), scope (control plane, outside the record, ignored, contracts, missing validation test, files outside the diagnosis at stage, index, commit and push), format (a table of malformed files), secrets, and exhausted budgets (iterations, commits, pushes, duration, fix attempts across a resumption); 32 named mutations.

### 16.9 Confirmations against the official documentation (2026-10-02)

**How obtained, and its limit.** The two pages named by the owner — `docs.github.com/en/rest/actions/workflow-runs` and `…/workflow-jobs` — were queried through Context7 (an indexed copy of the official documentation) in the maintenance session; the pages were **not opened** (`WebFetch` is denied by the guard). What follows is what those extracts state.

**Confirmed.**
1. *List workflow runs for a repository* (`GET /repos/{owner}/{repo}/actions/runs`): accepts **`head_sha`** ("only returns workflow runs that are associated with the specified head_sha"), also `branch`, `event`, `status`, `check_suite_id`, `created`, `exclude_pull_requests`, `per_page` (max 100); filtering returns up to 1,000 results; each run item carries `id`, `head_branch`, `head_sha`, `pull_requests`, `event`, `status`, `conclusion`, `check_suite_id`. Anyone with read access to the repository may call it.
2. *Download job logs for a workflow run* (`GET /repos/{owner}/{repo}/actions/jobs/{job_id}/logs`): answers **302**, the download URL is in the **`Location`** header, and **the link expires after 1 minute**; anyone with read access to the repository may call it.
3. *List jobs for a workflow run* (`GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs`): `filter` (`latest` by default, or `all`), `per_page` (max 100); read access suffices.

**Consequences implemented or recorded.** (a) The 1-minute expiry confirms the design: the wrapper downloads in the same call, immediately, with a 30 s timeout, never stores or reuses the URL; a failed download needs a new `gh:ci-log` (a new read of the budget). (b) `filter` is not sent, so the **default `latest`** applies: only the jobs of the latest attempt of a run are listed; a job from an older attempt does not resolve (`DD-LOG-JOB`). (c) Runs are requested with `per_page=20` and jobs with `per_page=100` and no paging, within the documented maxima.

**Not confirmed by those extracts (still to be confirmed in the rehearsal; the wrapper fails closed on each).** (i) `head_repository` on the run items — the wrapper requires `head_repository.full_name`; if the field is absent every `gh:ci-log` and diagnosis refuses with `DD-LOG-JOB`. (ii) The job fields the wrapper cross-checks: `run_id`, `head_sha`, `name`, `conclusion`, `check_run_url` (the extract says only that the response schema is the one of "list jobs for a workflow run attempt"). (iii) That an **installation token** with `Actions: read` is enough for these three endpoints (the documentation says "anyone with read access"; the permission mapping for installation tokens is not in the extracts). (iv) The exact redirect host(s) and whether a second redirect occurs: the owner lists the host(s) only after observing them in the rehearsal.

### 16.10 Decision D-24 — validity of a diagnosis evidence (approved by the owner, 2026-10-02; implemented)

- **Value.** `EVIDENCE_TTL_SECONDS = 3600`, counted **from the collection** of the evidence (`collectedAt`, kept in the persisted state, so resuming the session or restarting the launcher does not restart it).
- **Boundary.** At exactly 3600 s the evidence is already expired and a new diagnosis is **refused** (`DD-DIAG-EVIDENCE`); 3599 s still valid. This holds for annotation evidence and log evidence alike.
- **Other invalidations.** A change of the head SHA (`DD-DIAG-SHA`) and the consumption of the evidence by a diagnosis (`DD-DIAG-REUSED`) also invalidate it.
- **What expiry does and does not do.** It only prevents **registering** a new diagnosis. A cycle authorized before the expiry may finish inside the other budgets (duration, iterations, commits, pushes, fix attempts, scope of the diagnosis); the expiry **neither renews nor cancels** any of them, does not restart the delivery clock, and does not create or erase an attempt.
- **No renewal by repetition.** A new collection after the expiry (a `gh:ci-log` read, which costs a read of its budget, or an `gh:ci-status` that shows annotations) creates **new evidence** with a new id and a new `collectedAt`; the expired record is never refreshed. Within the validity period an identical collection reuses the same record.
- **Production value only.** The tests exercise the production value and its boundary; a test-only override of the term exists in the wrapper's ports and is not reachable from the command line or the environment.
- **Not part of the decision:** nothing about enabling real writes; `delegatedDelivery` stays off, `executionEnabled` stays `false`, `LOG_HOSTS` stays empty, merge stays owner-only. **No normative decision is pending** about the diagnosis mechanism after this one.

### 16.11 Decisions D-25 and D-26 — rehearsal grant and effective protection of `main` (approved by the owner, reported 2026-10-02; implemented offline)

**Provenance of the approval.** The owner reported that D-25 and D-26 were approved, with the additional requirements below, in a conversation between the owner and Codex. The development agent did not observe that conversation; this section records what the owner relayed. It is not an approval of enabling real writes.

**Amendment to this CR.** Sections 1, 6.1 and 10 say the wrappers refuse every call while `delegatedDelivery` is off. That is amended: while the repository key is `false`, a call is also enabled by a **valid rehearsal grant** bound to the loaded record (D-25). The **definitive** enablement remains exclusively `delegatedDelivery: true` in the repository (control plane, owner PR with approval by another person). Everything else in this CR stays in force.

**D-25 — rehearsal grant (`scripts/claude-delivery-record.mjs`, `scripts/claude-authorize.mjs`, `scripts/claude-git.mjs`).**
- File `~/.oplyra/delivery/<ref>.enable.json`, created only by `node scripts/claude-authorize.mjs --enable-rehearsal=ops-<n> [--log-hosts=…]` in an owner terminal (TTY, typed phrase `HABILITAR-ENSAIO`, refused inside an agent session). Closed fields: `schema`, `ref`, `recordSha256`, `issuedAt`, `expiresAt`, `authorizedBy`, `confirmation`, optional `logHosts`.
- **Exact modes, no symlinks.** The file must be `0600` and the directory `0700`, owned by the current user, neither a symlink; `0400`, `0700`, `0500`, `0640` and similar are refused. Checked on every call.
- **Never widens the record.** The grant carries no `paths`, budgets or branch (extra fields are refused); scope, budgets, branch, expiry and counters come only from the record, which keeps its own hash check. A grant cannot raise a ceiling, add a path or change the branch.
- **Binding and validity.** Valid only for the record whose SHA-256 it carries, only for `ops-<n>` references (never `iNN`, `cr-NNN`, `dp-*`), at most 24 h and never beyond the record's expiry; the exact expiry instant already counts as expired.
- **Rewriting does not renew.** Rewriting the grant (for instance to add `logHosts` after the owner observed and approved a hostname) **preserves the original `issuedAt` and `expiresAt`**: the window is not renewed, and the delivery state, clock, counters and audit are not touched (the script never opens them). If the existing grant is expired, tampered with, unsafe or a symlink the rewrite is refused and the file is left as it is; a new window requires the owner to delete the grant on purpose.
- **In the wrapper.** `assertEnabled` accepts the repository key `true` (definitive; any grant is ignored) **or** a repository file that is readable, has the schema and says exactly `false`, together with a valid grant. With neither, the call refuses `DD-DISABLED` without loading state, touching Git, the network or the keys, and without opening the circuit breaker. Every call re-verifies everything and audits `enabledBy` (`repository` or `rehearsal-grant`) and `grantSha256`. The kill switch prevails over both. Grant `logHosts` (exact hostnames, same validation) are **added** to `LOG_HOSTS`, which stays empty in code. The worktree check is unchanged: the repository file stays `false` and the tree clean.
- Revoking is deleting the file.

**D-26 — `checkProtection` verifies values, not only rule types (`scripts/claude-git.mjs`, fail closed `DD-PROTECTION`).**
- Every `pull_request` rule: `required_approving_review_count` a safe integer ≥ 1 (absent, `null`, string, decimal, negative, `NaN`, infinite or unsafe refuse; one malformed rule refuses even if another is valid), and, **added by the owner's requirement, `dismiss_stale_reviews_on_push === true`** (absent, `false` or any other type refuses, in every `pull_request` rule).
- Every `required_status_checks` rule that lists `validate`: `strict_required_status_checks_policy === true` in the same rule; a strict rule without `validate` does not compensate.
- `gh:doctor` prints the effective values read (minimum approval count, strict flag, stale-review dismissal) and the enablement mode, never secrets.

**Tests.** Negative and positive cases for every point above, and mutations that must all be detected (`P01`–`P15` for D-26, `G01`–`G18` for D-25; the suite lists them in `scripts/claude-delivery.test.mjs`). Phase 4 of the rehearsal script still requires the owner to review and integrate this change before it starts.

### 16.12 Amendment — operation with a single human owner (authorized by the owner, 2026-10-02)

The owner authorized an amendment for operation with **one human responsible**. It changes how the PR that integrates D-25/D-26 may be merged and nothing about the wrapper.

- **App PRs.** Pull requests opened by the App keep requiring **1 approval, given by the owner** (the App is the author, so the owner may approve). No change.
- **One-time exception for the integration PR.** For the **owner's own PR that integrates D-25/D-26** (the seven files listed in §16.11 and the rehearsal script), the owner is authorized, **exceptionally**, to lower `required_approving_review_count` of `main-protection` (ruleset 24384328) from 1 to **0 for the integration only**, and to **restore 1 immediately after the merge**. The owner confirms the restored value (and `dismiss_stale_reviews_on_push: true`) before anything else happens.
- **During the window.** `delegatedDelivery` stays `false`, no grant exists, and the rehearsal is not run. The window is the interval between lowering and restoring the count.
- **What stays mandatory throughout.** `validate` green on the head SHA, squash merge, linear history, force push and deletion blocked, empty bypass, `dismiss_stale_reviews_on_push: true`.
- **Nature of the review.** The owner's review of that PR is **procedural, not independent**. **HB-13 (independent review) stays unmet**; this amendment does not satisfy it and does not change CR-032 D-4.
- **Not a standing authorization.** Other control-plane PRs (for instance `delegatedDelivery: true`, `LOG_HOSTS`, any change under `.github/**` or to the wrapper) receive **no automatic exception**; each needs its own explicit owner authorization, and until then the earlier requirement (§16.11, last paragraph) applies.
- **The wrapper is not loosened.** D-26 still requires at least 1 approval and `dismiss_stale_reviews_on_push === true`, so `gh:doctor` **refuses while the count is 0**. That is intended: the window is for integrating the change, not for running the wrapper.
- **Who changes the ruleset.** Only the owner, outside the agent's tools (the App has no administration permission). The agent changed no ruleset.

**What this does not do.** It does not create any grant, run the rehearsal, enable `delegatedDelivery`, or change a ruleset. The grant and the record live under `~/.oplyra`, reachable by a process of the same operating-system user: **R-11 is unchanged** (defense in depth, not a sandbox; the barrier that does not depend on the host is server-side). The implementation changes control-plane files and must reach `main` by an owner PR with approval from a person other than the author, which is not satisfied; **for this one integration PR only, §16.12 authorizes the owner's procedural exception** (count 0 during the integration, 1 restored right after the merge).
