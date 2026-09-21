# DEC-RUNTIME-007 — Environment planning and provisioning boundary

**Status:** `approved_for_planning`  
**Approved at:** 2026-09-21  
**Scope:** local, staging and production environment preparation
**Updated by:** CR-025 / ADR-0009

## Decision

Approve the environment architecture, readiness, secrets/identities, database, observability and recovery plans as the reviewable basis for future decisions. This approval does not authorize resource creation, deployment, real data or runtime activation.

Environment creation, software deployment and runtime activation are separate authorization boundaries. Production must start with runtime disabled. Production-equivalent staging is required before activation, but its creation remains dependent on resolving `DP-28b` because the prior two-environment decision is still canonical.

## Provider status

Netlify is selected for web/BFF, Supabase for the managed backend, Railway for the continuous worker and GitHub private/Actions for source control and CI. Provider selection does not authorize provisioning or deployment. Regions, plans, budgets and EXP-03/04 evidence remain pending where applicable. Observability and transactional email have no selected provider.

## Safety

Environments use separate projects, credentials, secrets, queues and synthetic/real data policies. Production data cannot be copied to staging. Database changes use immutable migrations and expand/contract. Backup/PITR is never assumed; restore evidence is required before real data.

## Compatibility

This decision is refined by ADR-0009 and CR-025. It does not override unresolved region, budget, recovery, staging or activation gates. It creates no application hosting resource and changes no runtime or database state.
