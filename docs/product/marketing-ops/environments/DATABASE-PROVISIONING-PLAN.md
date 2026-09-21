# Database Provisioning Plan v1

**Status:** `approved_for_planning`  
**Database projects created:** none

## Preconditions

Provisioning requires explicit approval of the database provider, region, plan, budget, backup/PITR choice, project name, owner and staging decision. Historical provider capabilities must be revalidated before approval.

## Planned resources

Staging and production each require a separate project with independent PostgreSQL, Auth, Storage, credentials, `pgmq`, `pg_cron`, configuration and audit evidence. Production is never cloned into staging. Staging uses synthetic representative data.

## Provisioning sequence

1. record approved target identifiers without secrets;
2. create the empty project under an MFA-protected organization;
3. capture immutable provider/project identifiers and environment fingerprint;
4. verify database version, extensions, networking, pooling and contracted backup capabilities;
5. configure restricted migration identity;
6. apply committed migrations in order;
7. configure non-migration settings: Auth, Data API, redirect URLs, rate limits and Storage;
8. rotate bootstrap credentials and store runtime credentials separately;
9. execute schema, privilege, RLS and cross-tenant negative tests;
10. in staging only, load synthetic representative data and run EXP-03/04 plus E2-09;
11. leave every runtime activation gate disabled.

## Migration policy

- timestamped, immutable migrations;
- expand → adapt → contract across separate releases;
- no production schema synchronization from local state;
- no editing an applied migration;
- no manual DDL except an explicitly authorized incident action followed by repository reconciliation;
- data migrations must be idempotent, bounded and observable;
- long locks, table rewrites and destructive changes require separate impact evidence;
- failure stops dependent steps; do not rerun blindly.

## Roles and privileges

Migration, web, dispatcher, workflow worker, scheduler and ops identities are separate. Runtime roles receive only controlled functions or tenant-scoped policies. `BYPASSRLS`, superuser and ownership privileges are prohibited for application runtimes.

## Backup and restore

The plan does not assume PITR. Contracted backup capabilities must be verified before dependency. EXP-04 must demonstrate database restore, Storage recovery and role/credential reconstruction before real data. RPO and RTO remain pending `DP-07b`.

## Production data controls

- no synthetic seeds or database reset;
- internal verification tenants created by an audited domain procedure, not raw SQL;
- production export/import requires separate approval and encryption;
- no production-to-staging copy;
- destructive recovery, PITR or backup restore requires explicit incident authorization and stated loss window.

## Exit criteria

Provisioning is not complete until migrations, privileges, RLS isolation, Data API exposure, backup evidence, environment fingerprint and configuration checklist are independently reviewed. Completion still does not authorize runtime activation or real data.
