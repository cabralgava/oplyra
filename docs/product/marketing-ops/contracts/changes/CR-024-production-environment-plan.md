# CR-024 — Staging and production environment plan

**Status:** `approved_and_applied`  
**Classification:** `planning_package_no_external_resource_creation`  
**Issued at:** 2026-09-21T22:00:00Z  
**Base:** Contract Registry Release 2.13  
**Target:** Contract Registry Release 2.14

## Objective

Create the complete planning package for staging and production without selecting unapproved providers, creating resources, deploying software, accepting real data or activating runtime.

## Artifacts

1. environment architecture;
2. production readiness checklist;
3. secrets and service identities plan;
4. database provisioning plan;
5. observability plan;
6. rollback and recovery plan;
7. executable environment-plan schema, fixtures, validation and tests;
8. DEC-RUNTIME-007 provisioning boundary.

## Conflict resolution

The current canonical documentation describes local + production and leaves remote staging open under `DP-28b`. CR-024 does not silently reverse that decision. It plans staging because E2-09 must be repeated in a production-equivalent environment before activation, but marks staging `planned_not_created` and blocks creation until explicit approval.

## Provider status

- Supabase/`sa-east-1`: proposed, `DP-07a` + EXP-03;
- Vercel/`gru1`: proposed, `DP-05a/b` + EXP-03;
- Cloud Run worker pools/`southamerica-east1`: proposed, `DP-06a/b` + EXP-03;
- GitHub private/Actions: proposed, `DP-14b`;
- observability: pending `DP-15b`;
- transactional email: pending `DP-08a`.

No price, feature or availability claim is treated as currently validated.

## Explicit non-changes

- no provider selected or contracted;
- no organization, project, repository, queue, cron, bucket, domain or secret created;
- no migration or database change;
- no deployment;
- no real data;
- no runtime activation.

## Remaining blockers

1. explicit provider, region and budget decisions;
2. `DP-28b` staging decision;
3. EXP-03 hosting/network/cost evidence;
4. EXP-04 backup/restore evidence before real data;
5. RPO/RTO, observability and email decisions;
6. implementation of retry, dead-letter publisher/consumer and composition root;
7. E2-09 in approved production-equivalent staging;
8. separate creation, deployment and activation approvals.

## Rollback

Reactivate Release 2.13 and remove CR-024 planning artifacts. No external rollback is required because no resource was created.
