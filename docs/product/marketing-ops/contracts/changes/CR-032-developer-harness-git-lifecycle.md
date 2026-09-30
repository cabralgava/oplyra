# CR-032 — Developer Harness Git Lifecycle Policy

**Status:** `approved`
**Approved by:** project owner, 2026-09-30 — approval of the policy text and of decisions D-1 to D-10 of §16, as revised. The CR is approved but **not applied**. **Slices S1–S7 of D-10 are not authorized and none is implemented**: each one needs its own individual authorization. `AUTONOMOUS-BUILD.md` stays `draft` with `executionEnabled: false`, and HB-13 stays unmet.
**Classification:** `developer_tooling_git_lifecycle_policy_approved_not_applied_no_registry_or_schema_change`
**Issued at:** 2026-09-30
**Base:** commit `fd1971656657bb49a9f8b4473f5ab61de62198fc` (`origin/main`, synchronized), Contract Registry Release 2.21 (CR-031)
**Target:** none yet. When one or more authorized slices are implemented, a later release packages the result; Release 2.21 and its manifest stay unchanged.
**Origin:** next Developer Harness increment recorded in [ESTADO](../../../../harness/ESTADO.md) (pending items 1 and 6); open Definition-of-Done items of [AUTONOMOUS-BUILD](../../../../harness/AUTONOMOUS-BUILD.md) §4.

## 1. Objective and non-goals

Define, **without executing or implementing anything**, the Git lifecycle the Developer Harness must follow: branches, commits, pull requests, required checks, independent review, merge, recovery, rollback, force-push protection, owner-only responsibilities, the behavior of the autonomous and maintenance modes, and the **executable hard blockers** that must exist before anyone proposes `executionEnabled: true`. It also evaluates DP-02b2 (Turborepo) against current evidence (§15).

This CR does **not**: change `AUTONOMOUS-BUILD.md` (still `draft`, `executionEnabled: false`), scripts, hooks, settings, registries, schemas, manifests, CI, contracts or code; create branches, commits, PRs, tags or releases; push; touch GitHub settings; install or configure Turborepo. Approval of this CR covers the **policy text and decisions D-1 to D-10 only**; each implementation slice of D-10 needs its own authorization.

## 2. Audit of the current state (2026-09-30)

Facts below were read in this session with read-only tools; items marked **unverified** could not be checked with the tools available and are listed in §14.

| ID | Fact | Evidence |
| --- | --- | --- |
| A-1 | `main` is synchronized with `origin/main` at `fd19716`; the seven commits `7e00d89`, `8063131`, `fe058f3`, `38ec4af`, `e1aa079`, `d73d817`, `fd19716` are published. The worktree and the index were clean before this work. | `git status -b` (`## main...origin/main`), `git rev-parse HEAD origin/main` (equal), `git log origin/main` |
| A-2 | The only local branch is `main`; there are no tags. | `.git/refs/heads/`, `.git/refs/tags/` |
| A-3 | No Git hook is active (only `*.sample` files); no `CODEOWNERS`, no pull-request template, no `.githooks/` in the repository. | `.git/hooks/`, `.github/` (only `workflows/ci.yml`) |
| A-4 | The CI has one workflow and one job, `validate` (`ubuntu-latest`, `timeout-minutes: 30`, `contents: read`), triggered by `pull_request` and by `push` to `main`, with `cancel-in-progress: true` per ref. Steps: checkout, pnpm/Node 22, frozen install, tooling-exclusion assertion, `pnpm test:harness`, Supabase CLI `2.114.0`, Playwright Chromium, `db:start`, `db:roles`, `pnpm verificar` (typecheck, Vitest, pgTAP, Playwright E2E, secret scan, build), `db:stop`. Third-party actions are referenced by tag (`@v6`, `@v3`, `@v2`), not by commit SHA. | `.github/workflows/ci.yml` |
| A-5 | Git writes are owner-only: the autonomous guard allows only `status`, `diff`, `show`, `log`, `rev-parse`, `ls-files`, `ls-tree`, `cat-file` (CR-031 §12 item 1) and refused `git branch -a -vv`, `git config --get-regexp` and `git rev-list` as `LF-GIT-MUTATION`/`LF-CMD-NOT-ALLOWED` during this audit. `gh` is denied. | guard behavior observed in this session; [DEVELOPMENT-TOOLS §5](../../../../harness/DEVELOPMENT-TOOLS.md) |
| A-6 | `AUTONOMOUS-BUILD` §1 describes a loop that **creates branch, commits, opens a PR and merges**; the current guard forbids every one of those steps. The loop therefore cannot run as written, by design. Slice S1 of D-10 reconciles that text with the owner-only policy (keeping `status: draft` and `executionEnabled: false`). | [AUTONOMOUS-BUILD §1](../../../../harness/AUTONOMOUS-BUILD.md), CR-031 §12 |
| A-7 | Definition-of-Done items still open in `AUTONOMOUS-BUILD` §4: remote-service blockers sufficient for the loop; CI running all applicable deterministic checks; approved and tested branch/PR/review/merge/recovery policy; hard blockers with an executable stop mechanism and evidence. | [AUTONOMOUS-BUILD §4](../../../../harness/AUTONOMOUS-BUILD.md) |
| A-8 | `DESENVOLVIMENTO.md` already states: no identical retries of deterministic failures, at most two retries for transient read failures, revert only own changes, no destructive cleanup, author self-review is not independent review. No rule exists for branches, PRs, merges or rollback of published commits. | [DESENVOLVIMENTO](../../../../harness/DESENVOLVIMENTO.md) |
| A-9 | The history uses Conventional-Commit-style subjects (`feat(tooling): …`, `docs(contracts): …`), one selective commit per Contract Registry release, and a separate `docs(harness): update operational state` commit after each release (the recorded SHA cannot be known inside its own commit). The first commit of the log carries a PR suffix (`(#1)`); whether the later seven were pushed straight to `main` or merged through PRs is **unverified**. | `git log origin/main` |
| A-10 | Branch protection / rulesets, required-review settings, Actions permissions, repository visibility and plan on GitHub are **unverified** (`gh` and network are not available to the agent). | — |
| A-11 | There is no recorded duration of any gate or CI run in the repository (see §15). | repository documents read |
| A-12 | `package.json` defines `test` as `vitest run` and `verificar` calls `pnpm test`, so contract tests are in the gate as long as Vitest discovers `test/contracts`. An independent run of `pnpm test test/contracts` passed: **275 tests in 17 files**. | `package.json`; independent execution reported by the owner |

## 3. Branch policy

**Creation.** One branch per authorized increment or change request, created by the **owner** (decision D-1) from an up-to-date `origin/main`. A branch never mixes two increments or a CR with unrelated work. Preconditions recorded in the PR: base SHA, authorization reference (owner message or CR id), scope.

**Naming.** Lowercase ASCII, at most 60 characters:

```text
[agent/]<type>/<ref>-<slug>
type ∈ feat | fix | docs | test | refactor | chore | ci | revert
ref  ∈ i01..i99 | cr-NNN | dp-<id> | ops-<n>
slug = 1–6 words, [a-z0-9] separated by "-"
regex: ^(agent/)?(feat|fix|docs|test|refactor|chore|ci|revert)/(i[0-9]{2}|cr-[0-9]{3}|dp-[0-9a-z]+|ops-[0-9]+)(-[a-z0-9]+){1,6}$
examples: feat/i02-openrouter-adapter · docs/cr-032-git-lifecycle · agent/fix/i02-ledger-sweep-retry
```

The `agent/` prefix marks any branch whose content was produced by an autonomous session, so review depth and provenance are visible without opening the diff. Branches named `main`, `master`, `release/*`, `hotfix/*` or starting with `-` are not created under this policy (hotfixes use `fix/…` and the normal PR path, §9).

**No structural work directly on `main`.** "Structural" means any change to: application or package code, migrations or `supabase/**`, registries, schemas, fixtures, manifests, `contracts/**`, scripts, hooks, settings, CI, dependencies or lockfiles, `.claude/**`, `.mcp.json`, `CLAUDE.md`, `tools/**`, and the harness control plane (DEVELOPMENT-TOOLS §5). Every structural change enters `main` only through a PR. Under D-6 option A there is **no** exception: even `docs/harness/ESTADO.md` checkpoints enter through a PR.

**Lifetime.** Branches are short-lived. A branch without commits for 14 days is `stale` and handled by §8. After merge, the remote and local branch are deleted by the owner.

**Enforcement (layered, see §10):** GitHub ruleset on `main` (server side, primary), the autonomous guard (Git writes refused), a preflight check that the working branch is not `main` and matches the regex (future, slice S5 of D-10).

## 4. Commit policy

- **Who commits.** Under the current guard only the owner commits (A-5). In autonomous mode the agent prepares the change set and a **handoff package** (branch name, file list, proposed commit message(s), verification evidence, PR body draft); the owner stages, commits and pushes (D-1 option A). The agent never runs `add`, `commit`, `push`.
- **Format.** Conventional Commits, matching the existing history: `<type>(<scope>): <imperative summary>`, subject ≤ 72 characters, English, no trailing period. Types as in §3. Body explains *why* and cites the CR/increment, the authorization and the verification evidence; footers follow the attribution configured for the session (`Co-Authored-By`), never a forged owner identity.
- **Granularity.** One logical change per commit; a commit must build and pass the gates it claims. A Contract Registry release remains one selective commit whose file list equals the manifest allowlist (existing practice).
- **Content rules.** No secrets, real data or credentials (secret scan covers tracked and untracked files); no generated artifacts that are git-ignored; no changes outside the declared scope; unrelated owner edits are preserved byte for byte and never swept into a commit.
- **Signing.** Commit signing is **not proposed now** (no key-management decision exists); it may be revisited with the agent-identity decision of D-4.
- **Amending and rewriting.** Only unpublished commits on the author's own branch may be amended or squashed locally. Published commits are never rewritten (§10).

## 5. Pull request

- **Creation.** By the owner from the pushed branch (D-1). Draft while incomplete; "ready for review" only when the gates of §6 pass locally and the evidence is attached.
- **Title.** The Conventional Commit subject of the eventual squash commit.
- **Template** (`.github/pull_request_template.md`, to be added by a later slice; `.github/**` is control plane, so via maintenance session or owner): (1) increment/CR and authorization reference; (2) scope statement and explicit out-of-scope; (3) what changed and files; (4) verification: exact commands, results, tested commit SHA, what was **not** verified; (5) risks, rollback note (§9); (6) provenance: human / AI-assisted / autonomous, permission mode, tool versions; (7) checklist: frozen contracts untouched or CR cited, no secrets, no remote effects, no change of permission/autonomy/approval semantics, migrations compatible; (8) links to decision records.
- **Size and focus.** A PR must be reviewable in one sitting and carry one increment; larger diffs require a written justification in the PR and are candidates for splitting. No numeric limit is proposed (no evidence to set one).
- **Labels (optional).** `cr-governed`, `migration`, `control-plane`, `agent-authored` drive the stricter review rules of §7.

## 6. Required checks

**Required status check (server side):** `validate` — the existing job, with its name frozen so a rename cannot silently drop the requirement. The branch must be up to date with `main` before merge (strict status checks). Today `validate` covers: harness guard/launcher tests, tooling-exclusion assertion, typecheck, Vitest, pgTAP (RLS and isolation), Playwright E2E, secret scan and production build.

**Approved additions, not implemented** (none implemented; each is a separate slice and, where it touches CI or scripts, a control-plane change):

| ID | Check | Why | Notes |
| --- | --- | --- | --- |
| C-1 | `git diff --check` against the PR base | whitespace/conflict-marker hygiene | trivial; no new dependency |
| C-2 | Local-link check for changed Markdown | documentation coherence (DESENVOLVIMENTO "critérios de conclusão") | no script exists today; a small Node script is needed |
| C-3 | Frozen-contract guard: fail if a file listed in an active manifest changes without an approved CR id in the PR | HB-01 of §12 | compares the PR diff to the manifest and to `contracts/changes/` |
| C-4 | Branch-name and commit-subject lint | §3, §4 | regex above |
| C-5 | Migration safety lint: flag destructive DDL without expand/contract; verify RLS enabled and forced on every tenant-owned table | HB-04, HB-07 | complements pgTAP, does not replace it |
| C-6 | Test-integrity gate: no added `.skip`, `.only`, `.todo`; test count may not fall without a cited CR | HB-10 | baseline kept in a versioned file |
| C-7 | Architecture/CI test that fails if `test/contracts` is excluded from Vitest discovery, if `test` stops being `vitest run` (or equivalent covering it), or if `validate` stops running `pnpm verificar`/`pnpm test` | DoD "CI executes all deterministic checks"; prevents silent loss of the 275 contract tests (A-12) | evidence of inclusion exists today (A-12); the regression guard does not |
| C-8 | Pin third-party actions by commit SHA; keep `permissions: contents: read` | supply chain | tags are mutable |
| C-9 | `cancel-in-progress` disabled for `push` to `main` | post-merge evidence must not be cancelled | keep it for PRs |

Checks are evidence, not approval: a green `validate` is necessary and never sufficient for merge.

## 7. Independent review and approval rule

1. **Independent review** means a human reviewer who is not the author of the change **and** is not the agent session that produced it. Author self-review, including AI self-review, is never independent review (AUTONOMOUS-BUILD §3, DESENVOLVIMENTO).
2. **Two different things are kept apart.** (i) **Owner procedural attestation:** the owner's explicit comment, bound to the head SHA, that the PR is acceptable to merge. It is a governance record and a merge gate, **not** independent review. (ii) **Independent review:** item 1. When the owner is also the author of the PR (the owner opens it, or authored the change), the owner's comment is an attestation only and **never counts as independent review**. Human approval/attestation is mandatory for every PR; it cannot be waived by any automated signal.
3. **AI review is advisory only.** A fresh-context AI review of the diff (for example `/code-review`) is recorded in the PR, may inform the human, cannot approve, cannot count as independent review and cannot waive the attestation.
4. **Attestation is bound to the head SHA.** A new push dismisses it (stale-review dismissal). It is given only after the last green `validate` run on that SHA, and conversations must be resolved.
5. **Stricter path-based scrutiny** (the attestation must name the CR) for: `contracts/**` and manifests, registries `permissions`/`agents`/`actions`, migrations and RLS, CI and the control plane, dependency and lockfile changes, and any change to permission, autonomy or approval semantics. `.github/CODEOWNERS` (new file, slice S4) maps these paths to the owner. **Under the provisional model D-4(a) it serves ownership and visibility only; "Require review from Code Owners" and "at least one approval" must NOT be enabled**, because the owner is also the author and the rule would deadlock every PR. Both technical requirements are enabled **only when the independent arrangement D-4(b) exists**. Until then the owner's procedural attestation applies, explicitly not independent, and HB-13 stays unmet.
6. **Solo-owner constraint (decision D-4).** GitHub does not let a PR's author approve it. If the owner opens the PR, a technical "1 required approval" rule would deadlock. Two arrangements: (a) **provisional rule, explicitly not independent** — 0 required approvals in GitHub, an owner attestation comment quoting the head SHA (item 2), recorded in the PR and in `ESTADO`, no permanent bypass actor; it satisfies the merge gate only and **does not satisfy HB-13**; (b) **independent arrangement** — another human reviewer, or a separate author identity (a dedicated agent identity with a fine-grained, repository-scoped, non-admin token that authors the PRs) so that the owner reviews a PR they did not author. **HB-13 stays unmet until (b) exists.** Decision: (a) now; (b) required before any `executionEnabled: true` proposal.

## 8. Recovery of failures and interrupted branches

**Branch states:** `active` → `parked` (intentionally paused, reason recorded) → `abandoned` (closed, tip SHA recorded) or → `merged`. Every non-merged branch with work is listed in `ESTADO` under "Trabalho parcial" with: branch, base SHA, tip SHA, last verified commit, effects already executed, and next step.

**Resume protocol** (extends DESENVOLVIMENTO "Estado, interrupção e retomada"):

1. Verify with read-only Git: current branch, `status -b`, `log` against the base, `diff --stat`; stop if a rebase/merge/cherry-pick is in progress (`.git/rebase-merge`, `.git/rebase-apply`, `MERGE_HEAD`, `CHERRY_PICK_HEAD`) or the worktree is dirty with changes that are not the branch's own.
2. Check the authorization reference still exists and covers the remaining scope; if it cannot be verified, continue only with actions that do not depend on it.
3. If `main` moved, the **owner** updates the branch (merge or rebase of an unpublished branch); all evidence produced before the update is invalidated and the affected gates re-run.
4. Re-run the gates; do not reuse an earlier result for a different SHA.
5. For any action with uncertain effect, inspect the real state before repeating (timeouts do not prove non-execution).

**CI failure.** A fixable failure (typecheck, test, build, local bug, missing test, failure caused by the increment) is diagnosed and fixed inside the declared scope; it is not a hard blocker. Each attempt must change something based on a stated diagnosis (no identical retries). Budget: **at most three diagnosed fix attempts per failing check** (D-8, approved), then stop and record the blocker. A failing check is re-run at most once to classify it as flaky; a flaky pass is recorded as such and never as a clean pass, and quarantining or deleting a test requires a CR.

**Conflicts.** The agent does not resolve merge conflicts that touch files outside its own change set; it stops and reports.

**Stale and abandoned branches.** A branch stale for 14 days is reviewed by the owner: resume, park or abandon. Abandoning means: close the PR with a note, record the tip SHA in `ESTADO`, then delete the remote branch; an unmerged branch is never deleted without that record.

## 9. Rollback and reversion

- **Code.** Revert by a **new PR containing `git revert` of the squash commit** (§11), through the same checks and review. `reset --hard`, history rewrite and force-push on `main` are never a rollback method.
- **Migrations.** Migrations are forward-only and backward-compatible (PUBLICACAO expand/contract). Reverting a PR that contains a migration already applied to any shared or remote database requires a **new forward migration**, not deletion of the file. Today all migrations are local-only (no remote project exists), so a revert before any remote application is safe; this must be re-checked at revert time.
- **Contracts.** A Contract Registry release is immutable (frozen artifacts, preserved manifests). Undoing a release is done by a **superseding CR and release**, never by editing or deleting the manifest or the CR.
- **Deploy.** Application rollback follows [PUBLICACAO](../../../../harness/PUBLICACAO.md); nothing is deployed today and this CR adds nothing to it.
- **Urgent fixes.** Same PR path and required checks; expedited only in review latency. **There is no authorization to ignore or skip a check.**
- **Exceptional incident (CI blocks any fix).** If the CI itself prevents every possible correction (for example a broken workflow that blocks the PR fixing it), a **temporary change of the ruleset is an exceptional owner-only incident**, recorded in `ESTADO` with: justification, the previous ruleset state, the change applied, **immediate restoration** once the fix is merged, and a later review. It grants no permanent bypass actor and **does not authorize force push, rewriting `main` or waiving tests**; the fixing PR still runs and passes the restored checks.
- **Tags/releases.** None are created now. Whether Contract Registry releases receive immutable tags is a separate owner decision (not proposed here).

## 10. Force-push and history protection

Defense in depth; no layer is relied on alone.

1. **Server side (primary, owner action):** a GitHub ruleset for `main` that requires a PR, the `validate` check (strict), linear history, blocks force pushes and branch deletion, and has **no permanent bypass actor**, administrators included (D-3); the only exception is the owner's incident procedure of §9. An equivalent tag ruleset if tags are ever used. Whether the repository's plan supports these rulesets is **unverified** (A-10) and is the owner's first verification.
2. **Session guard (existing):** the autonomous and maintenance guards refuse every mutating or remote Git operation (`push`, `fetch`, `pull`, `reset`, `rebase`, `merge`, `tag`, `checkout`…), including `-C`, `-c` and `--git-dir` forms. **Proposed regression tests (not written):** `push --force`, `-f`, `--force-with-lease`, `+refspec`, `push origin +main`, `--mirror`, `--delete`, `:main`, and aliases, each must be refused.
3. **Client side (optional, owner):** a versioned pre-push hook under `.githooks/` activated by the owner's `core.hooksPath` that rejects non-fast-forward pushes to protected refs. It is bypassable (`--no-verify`) and therefore only a convenience.
4. **Credentials:** no token with write or admin rights is available in a session; `gh` stays outside the allowlist; any future agent identity has repository-scoped, non-admin, non-bypass permissions (D-4).
5. **Rules of use:** `--force-with-lease` only by the owner and only on the owner's own unreviewed feature branch, never `--force`, never on `main` or a tag.

## 11. Merge strategy

**Proposed: squash merge**, performed **only by the owner** (D-5): one PR = one increment/CR = one commit on `main`, with the Conventional Commit title and the PR body as the message, keeping the `Co-Authored-By` trailer; linear history; no merge commits and no rebase merges; source branch deleted afterwards. This matches the existing "one selective commit per release" practice and keeps `git revert` of a single commit sufficient for rollback (§9).

After the merge the owner syncs `main` with a fast-forward only update, and the post-merge `validate` run on `main` must be green before the increment is recorded as integrated.

**Recording the SHA (D-6, option A).** The squash SHA is unknown inside the PR. The PR number is recorded in the PR itself, and a small documentary PR (`docs(harness): record <id>`) records the SHA of the **previous** increment. That documentary PR **does not create a recursive obligation** to open another PR just to record its own SHA: the SHA of that checkpoint is proven by the PR record and the commit integrated into `main`, protected against rewriting by the approved policy (GitHub metadata is not treated as absolutely immutable). Option (b), a direct owner commit of `ESTADO.md` on `main`, is not adopted.

## 12. Executable hard blockers before any `executionEnabled: true` proposal

A hard blocker is **executable** only when a mechanism stops the run (non-zero exit or refusal), emits a fixed machine-readable code and a handoff record without secrets, and a test proves it, including a mutation that disables it. The table maps each blocker of [AUTONOMOUS-BUILD §2](../../../../harness/AUTONOMOUS-BUILD.md) and each open DoD item to what must exist. **Status today: none of HB-01…HB-15 is implemented as a dedicated mechanism**, except where noted.

| ID | Blocker / requirement | Required executable mechanism | Evidence required | Today |
| --- | --- | --- | --- | --- |
| HB-01 | Change needed in a frozen contract | C-3 frozen-contract guard in CI and in preflight (diff vs manifest) | test with a modified registry file fails; mutation of the guard detected | not implemented |
| HB-02 | Conflict between normative documents | Not mechanically decidable: a fixed `STOP` record format plus a required "sources consulted" section; cross-registry validation stays as a gate | handoff record schema test; explicitly **procedural** | procedural only |
| HB-03 | Essential architectural decision missing | Preflight verifies that every DP/DEC/CR cited by the increment exists in the decision registry with an approved status | preflight test with a missing/`proposed` reference stops | not implemented |
| HB-04 | Breaking change without approved migration path | C-5 migration lint (destructive DDL without expand/contract) | test with `drop column` fails | not implemented |
| HB-05 | Indispensable secret unavailable | Fail closed with a fixed code, never a fallback value | launcher/preflight test | partly (launcher refuses real keys; no stop record) |
| HB-06 | Production or real data needed | Local First guard, `local`/`ci` remote-endpoint refusal (CR-028), no production runtime without `TrustedDeploymentContext` | existing CR-031/CR-028 tests; add a CI assertion of zero remote egress | implemented in part |
| HB-07 | Tenant isolation cannot be preserved | pgTAP cross-tenant suite as a required check; C-5 RLS enabled+forced lint for new tenant tables | suite red on a planted leak; lint mutation | pgTAP exists; lint not implemented |
| HB-08 | Material change of permission, autonomy or approval | CODEOWNERS (visibility) plus path rules; hash comparison of the `permissions`, `agents`, `actions` registries against the manifest; owner attestation naming the CR now, required code-owner review after D-4(b) | test that a change to these paths fails without the attestation signal | not implemented |
| HB-09 | Destructive or irreversible action | Guard denies (`rm`, Git mutation, remote tools); `db:reset` only through `db-guard.sh`; C-5 | existing guard tests; add migration lint | implemented in part |
| HB-10 | Reducing acceptance criteria to show success | C-6 test-integrity gate; acceptance list copied into the PR and compared | mutation: delete a test, gate fails | not implemented |
| HB-11 | Stopping itself | Kill switch: an owner-created sentinel in a control-plane path checked at preflight and before each loop iteration (the guard denies agent writes there); circuit breaker on consecutive failures; iteration, time and cost ceilings (CLAUDE.md governance item 8) | test: sentinel present ⇒ no iteration starts; breaker opens | not implemented |
| HB-12 | Git policy enforcement | Branch-regex and "not on `main`" preflight; §10 regression tests; ruleset export recorded by the owner | tests plus owner-recorded settings evidence | not implemented |
| HB-13 | Independent review evidence | Merge requires the owner attestation on the head SHA **and** an independent review (§7 item 1) by another human or by the owner on a PR authored by a separate identity; PR records provenance and both | owner-recorded evidence of the settings; one rehearsal PR with a non-owner author or reviewer. The provisional attestation alone does **not** meet it | **not met** (no second reviewer or author identity exists) |
| HB-14 | Recovery tested | Rehearsal on a scratch branch: interrupted branch resume, failed CI with the fix budget, revert PR — no production, no real service | rehearsal report in `ESTADO` | not done |
| HB-15 | CI covers all applicable deterministic checks | Inventory of gates vs `validate`; C-1, C-2, C-6, C-7, C-8 added as decided | inventory table and a green run | not done |

Only when HB-01…HB-15 have evidence, the DoD items of AUTONOMOUS-BUILD can be ticked by a separate documented change, and only then may a **separate** proposal for `executionEnabled: true` be written. This CR neither ticks those items nor proposes the flip.

## 13. Behavior of the modes

**Autonomous mode (`pnpm claude:local`, permission mode `dontAsk` only with the proven CLI version; `executionEnabled: false` today).**
- Read-only Git; no `add`, `commit`, branch, `push`, PR or merge; no `gh`; no Context7.
- Works only on a branch the owner created for the authorized increment; the preflight (future) stops if the branch is `main`, does not match §3 or the worktree/index is not clean at start.
- Ends each iteration with the **handoff package** of §4 and stops at "ready for owner". It never merges, deploys, approves its own work or edits the control plane.
- One increment, one branch, one PR per iteration; limits on turns, delegation, time and cost; circuit breaker and kill switch (HB-11); any hard blocker ends the run with a `STOP` record.
- If a future CR introduces constrained Git operations (D-1 option B, e.g. a fixed-policy wrapper such as a hypothetical `pnpm git:*` family that refuses `main`, non-matching branch names, non-allowlisted paths and any push), those scripts are control plane and need their own CR, tests and mutation evidence. **Push, PR creation, approval and merge stay owner-only in every option.**

**Maintenance mode (`pnpm claude:maintenance`, always `manual`, owner-started, typed confirmation).**
- May edit the control plane (scripts, settings, CI, policy documents) under the owner's direction; does not authorize staging, commit, push or any remote action, and is never used to run loop iterations.
- Changes to this policy's own enforcement land only through a PR. Under the provisional model D-4(a) that means: green checks, the owner's procedural attestation bound to the head SHA (**not** independent review, since the owner authors the PR) and an advisory AI review. Once D-4(b) exists, independent review becomes mandatory and technically enforced. None of these rules lets a maintenance session or a PR change `executionEnabled`, which stays `false`.
- Context7 remains available only here, per CR-031.

## 14. Owner-exclusive responsibilities

All Git writes (under D-1 option A: `add`, `commit`, branch creation/deletion, `fetch`, `pull`, `push`, `tag`); creating, approving, merging and closing PRs; every GitHub setting (rulesets, required checks, Actions permissions, secrets, tokens, agent identities, bypass actors); approving CRs and packaging Contract Registry releases; starting maintenance sessions and changing the control plane; editing `executionEnabled` or ticking the DoD; any deploy, Supabase project, migration on a remote database, key, account or paid call; CLI version upgrades and re-running the permission probe; recording supply-chain exceptions; any temporary change of the ruleset, only under the incident procedure of §9.

**Unverified items the owner should confirm** (none could be checked by the agent): A-10 (ruleset/branch-protection availability and current settings, Actions permissions, repository visibility/plan); whether the seven published commits went through PRs (A-9); the durations of recent CI runs (§15); the current Git/GitHub identity and permissions the owner intends to give any future agent (D-4).

## 15. DP-02b2 (Turborepo) — evaluation and recommendation

**Criterion on record.** ADR-0002 adopts Turborepo *only if* the I-01 shows a **measurable gain in CI time or reliability**, otherwise "use only workspace scripts"; DP-02b2 was postponed to be re-evaluated "with measured CI time" ([ADR-0002](../../../../decisions/ADR-0002-stack-typescript-monorepo-nextjs.md), [decisions registry](../../../../decisions/README.md), [PREPARACAO-I01](../../../../harness/PREPARACAO-I01.md)).

**Current evidence (and its limits).**
- **Durations: no current measurement exists in the repository** (A-11). `ESTADO` records test counts, not wall-clock times; the CI run history is not reachable by the agent (`gh` and network denied), and no gate was run for this audit because the scope of this task is documentary and Git/CI timing tools are outside the allowlist. **The criterion therefore cannot be evaluated; no duration is asserted here.**
- **Topology (read from the repository).** Workspaces: `apps/*` (2: `ops-cli`, `web`), `packages/*` (3: `core`, `infra`, `testing`), `experiments/*` (2). One root Vitest run (`vitest run`) already spans the workspace; `typecheck` already runs the three packages in parallel (`pnpm --parallel --filter …`); `build` builds only `web`; `apps/worker` does not exist yet (PREPARACAO-I01).
- **CI shape.** One sequential job. Its expensive steps by nature are the Supabase stack start, the Playwright browser install, pgTAP, E2E and the Next.js build. The database-backed suites, pgTAP and E2E depend on external mutable state and are **not hermetic**, so a task cache would be unsafe or useless for them; the plausibly cacheable tasks are typecheck, pure unit tests and build.
- **Cost of adopting.** A new root dependency (root `package.json` and `pnpm-lock.yaml` are governed artifacts of the manifest and of the supply-chain tests), a `turbo.json` whose task inputs/env must stay correct, an addition to the guard allowlist (control-plane change), and no acceptable remote cache (external egress is forbidden by Local First), so benefits would be local/CI-cache only.
- **Cheaper alternatives that need no new dependency:** split `validate` into parallel jobs (static checks / unit / database + E2E), cache the pnpm store and the Playwright browsers, and use pnpm's changed-since filter for unit-level work.

**Recommendation.** **Do not adopt Turborepo now, and keep DP-02b2 as a separate, postponed decision** rather than folding it into this CR. Reasons: (1) the decisive evidence (measured durations) does not exist, so adoption would be a guess contrary to ADR-0002's own criterion; (2) the evidenced topology and the non-hermetic nature of the slowest steps predict a small gain; (3) the adoption touches governed artifacts and the control plane, which belong in their own change. Nothing was installed or configured.

**Proposed evaluation protocol (owner-read, no code).** Record in `ESTADO` the per-step durations of the last 10 successful `validate` runs (visible in the GitHub Actions UI; `gh` by the owner also works), and one local `pnpm verificar` timing from a clean database. **Proposed thresholds** (assumptions, not evidence; the owner may change them): reconsider Turborepo only if the median `validate` exceeds 15 minutes **and** at least 30 % of that time is in hermetic, cacheable tasks, **and** the parallel-jobs/caching alternatives above were tried first; revisit anyway when `apps/worker` or a second deployable exists. Otherwise mark DP-02b2 `rejected for now` in the registry through the usual decision process.

## 16. Decisions for the owner — approved (2026-09-30)

The owner approved the decisions below, with the corrections of this revision, on 2026-09-30. Approval covers the policy only; nothing is implemented. **Slices S1–S7 of D-10 remain unauthorized and each requires an individual authorization** before any work on it starts.

| ID | Decision | Approved decision | Alternatives not adopted |
| --- | --- | --- | --- |
| D-1 | Who performs Git writes | **A approved:** owner-only; the agent delivers a handoff package | B: constrained wrapper scripts (separate CR); C: general Git/`gh` for the agent (rejected) |
| D-2 | Branch naming | **Approved:** regex of §3, `agent/` prefix for autonomous work | free naming |
| D-3 | Ruleset on `main` | **Approved with corrections:** PR required, strict `validate`, linear history, no force push/deletion, **no permanent bypass actor**, stale-review dismissal; **"require at least one approval" and "Require review from Code Owners" stay disabled under D-4(a)** (owner = author, deadlock) and are enabled only when D-4(b) exists; no authorization to skip a check; a temporary ruleset change only as the owner's exceptional incident of §9 (justification, prior state, change, immediate restoration, later review), never authorizing force push, rewriting `main` or waiving tests | fewer rules if the plan does not support them (record the gap) |
| D-4 | Review model | **Approved:** provisional rule = owner procedural attestation on the head SHA, **explicitly not independent review**, with CODEOWNERS for visibility only and no technical approval/code-owner requirement; HB-13 stays unmet; another human reviewer or a separate author identity is **required before any `executionEnabled` proposal** | second identity immediately |
| D-5 | Merge strategy | **Approved:** squash, owner-only, branch deleted | rebase merge; merge commits |
| D-6 | Recording the merge SHA | **Option A approved, without recursion:** the documentary PR records the SHA of the previous increment and creates no obligation to record its own; its SHA is proven by the PR record and the commit integrated into `main`, protected against rewriting by the approved policy | (b) direct `ESTADO.md` commit on `main` |
| D-7 | Additional checks | **Approved**, with C-7 reformulated (architecture/CI regression guard): C-1 to C-9 as separate slices, in this order: C-7, C-1, C-8, C-4, C-9, C-2, C-3, C-6, C-5 | subset |
| D-8 | Fix budget per failing check | **Approved:** 3 diagnosed attempts, then stop | other number |
| D-9 | DP-02b2 | **Approved:** separate and postponed; measurement protocol adopted; thresholds of §15 remain **hypothetical** | adopt now; reject now |
| D-10 | Implementation slicing | **Approved after adding `AUTONOMOUS-BUILD.md` to S1:** S1 textual reconciliation of `DESENVOLVIMENTO.md`, `DEVELOPMENT-TOOLS.md` **and** `AUTONOMOUS-BUILD.md` (maintenance session), preserving `status: draft` and `executionEnabled: false` and replacing the old "agent creates branch, commits, opens PR and merges" description with this CR's owner-only policy (the loop stops at "ready for owner"; DoD items stay unchecked); S2 GitHub settings (owner); S3 CI additions; S4 PR template and CODEOWNERS (visibility only until D-4(b); no code-owner/approval requirement enabled); S5 preflight and guard regression tests; S6 executable blockers HB-01…HB-15; S7 recovery rehearsal; each with its own authorization | one large slice |

## 17. Risks

| ID | Risk | Mitigation |
| --- | --- | --- |
| R-1 | A merge rule that only exists in documents and the owner's habit | Server-side ruleset first (D-3); documents describe, they do not enforce |
| R-2 | Solo-owner attestation is not independent review (author = attester); enabling approval/code-owner requirements early would deadlock | D-4: stated as not independent; those requirements stay disabled until D-4(b); HB-13 unmet; second reviewer or author identity before any `executionEnabled` proposal |
| R-3 | A future agent identity with excessive rights | Fine-grained, repository-scoped, non-admin token; no bypass; `gh` stays denied |
| R-4 | A red CI that blocks urgent work, or blocks its own fix | No check may be skipped; fix through the normal PR; only the owner's exceptional ruleset incident of §9, restored immediately and reviewed |
| R-5 | Squash merge loses per-commit granularity | PR body keeps the step list; releases are already one commit |
| R-6 | Thresholds of §15 are assumptions | Labeled as proposals; revisited with real data |
| R-7 | Policy gives a false sense of autonomy readiness | §12 states that none of the blockers is implemented and that this CR does not propose the flip |
| R-8 | This CR was written with limited tools (no `gh`, no network, no gate run) | §2 and §14 list every unverified item |

## 18. Preservation and scope of this document

Delivered as a new file only. No CR, registry, schema, manifest, script, hook, setting, CI file, contract or code was modified; `AUTONOMOUS-BUILD.md` is unchanged; nothing was staged, committed, tagged, pushed or deployed; no external call was made. The CR is not part of Contract Registry Release 2.21 and will enter a manifest only if approved and packaged in a later release.
