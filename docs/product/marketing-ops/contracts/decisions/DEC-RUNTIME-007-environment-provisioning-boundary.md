# DEC-RUNTIME-007 — Environment planning and provisioning boundary

**Status:** `approved_for_planning`  
**Approved at:** 2026-09-21  
**Scope:** local, staging and production environment preparation

## Decision

Approve the environment architecture, readiness, secrets/identities, database, observability and recovery plans as the reviewable basis for future decisions. This approval does not authorize resource creation, deployment, real data or runtime activation.

Environment creation, software deployment and runtime activation are separate authorization boundaries. Production must start with runtime disabled. Production-equivalent staging is required before activation, but its creation remains dependent on resolving `DP-28b` because the prior two-environment decision is still canonical.

## Provider status

Supabase `sa-east-1`, Vercel `gru1`, Cloud Run worker pools `southamerica-east1` and GitHub private/Actions remain proposals. Observability and transactional email have no selected provider. Historical pricing and capabilities must be revalidated before approval.

## Safety

Environments use separate projects, credentials, secrets, queues and synthetic/real data policies. Production data cannot be copied to staging. Database changes use immutable migrations and expand/contract. Backup/PITR is never assumed; restore evidence is required before real data.

## Compatibility

This decision refines planning only and does not override unresolved DPs, ADR-0005 or EXP-03/04. It creates no resource and changes no runtime or database state.
