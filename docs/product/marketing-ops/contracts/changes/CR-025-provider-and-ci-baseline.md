# CR-025 — Provider decisions and development-readiness baseline

**Status:** `approved_and_applied`  
**Classification:** `provider_selection_and_local_ci_readiness_no_provisioning`  
**Issued at:** 2026-09-21T23:00:00Z  
**Base:** Contract Registry Release 2.14  
**Target:** Contract Registry Release 2.15

## Objective

Record the provider selections explicitly made by the project owner, establish a reproducible GitHub CI gate and remove the two known sources of nondeterminism from the local validation baseline. No production resource, deployment, real data or runtime activation is authorized.

## Approved changes

1. select Netlify for web/BFF, Railway for the continuous worker, Supabase for the managed backend and GitHub private/Actions for source control and CI;
2. keep provider region, commercial plan, budget and network acceptance conditioned on EXP-03/04 where applicable;
3. keep DP-28b unresolved and staging unprovisioned;
4. add a CI workflow that starts an isolated local Supabase stack and executes the same `pnpm verificar` gate;
5. make dispatcher fixtures deterministic by setting `available_at` explicitly;
6. run workspace typechecks in parallel because the existing test-support development cycle is intentional and has no runtime edge.

## Compatibility

The production environment plan advances from 1.0 to 1.1. Existing registry identities, actions, events, errors, permissions, schemas and database migrations are unchanged. The destination status vocabulary gains `selected_conditioned` and `selected_active`; older manifests and fixtures remain immutable historical evidence.

## Explicit non-changes

- no Netlify, Supabase or Railway project created;
- no provider plan contracted;
- no production secret, domain or database configured;
- no deployment or runtime activation;
- no real data;
- no decision on permanent staging, observability, transactional email, RPO, RTO or PITR.

## Validation

- complete local gate: `pnpm verificar`;
- schema and contract fixtures for environment plan 1.1;
- secret scan on all tracked files;
- GitHub Actions workflow with read-only repository permissions.

## Rollback

Revert the CR-025 commit and reactivate Release 2.14. External provider rollback is unnecessary because this change does not provision or deploy application infrastructure. The GitHub repository predates this change and is not deleted by rollback.
