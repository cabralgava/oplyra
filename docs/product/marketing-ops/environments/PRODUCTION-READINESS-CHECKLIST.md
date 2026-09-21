# Production Readiness Checklist v1

**Status:** `template_approved_not_executed`

Every item starts incomplete. A link to evidence, reviewer and timestamp is required before it can pass.

## Decisions and ownership

- [ ] `DP-28b` resolved and staging explicitly authorized.
- [ ] Database, web and worker providers/regions approved after EXP-03.
- [ ] Monthly and experimental budget approved.
- [ ] Transactional email provider approved.
- [ ] Observability provider, region, retention and access approved.
- [ ] Source-control/CI destination approved.
- [ ] Operational owner and incident contact assigned.

## Security and isolation

- [ ] Separate projects, credentials, secrets, queues and storage verified.
- [ ] MFA enforced for provider administrators.
- [ ] Service identities have no interactive administrator login.
- [ ] RLS positive and negative tenant tests pass.
- [ ] Worker has no direct table privilege where controlled functions exist.
- [ ] Data API exposes only approved schemas.
- [ ] Preview/local configuration cannot resolve production credentials.
- [ ] Secret scan and client-bundle secret scan pass.
- [ ] Logs and telemetry contain no credentials, payload bodies or unnecessary PII.

## Database and recovery

- [ ] Migration history matches the approved commit.
- [ ] Expand/contract compatibility review passes.
- [ ] Backup capabilities of the contracted plan are verified directly.
- [ ] RPO, RTO and PITR decision are approved.
- [ ] EXP-04 restore exercise passes for database, Storage and login roles.
- [ ] Recovery instructions are exercised by someone other than the author.
- [ ] No synthetic seed or destructive reset command targets production.

## Runtime and queues

- [ ] Retry/failure runtime implementation matches contract v1.
- [ ] `runtime.dead_lettered` publisher and consumer are implemented.
- [ ] Activation gate and kill switch are tested before every claim.
- [ ] Worker starts healthy and idle while disabled.
- [ ] Queue/outbox lag, retries, dead letters and settlement failures are observable.
- [ ] Graceful shutdown and lease/fencing recovery are demonstrated.
- [ ] E2-01 and E2-09 pass in production-equivalent staging.

## Release and product verification

- [ ] Approved immutable commit/tag identified.
- [ ] Release manifest hashes match deployed artifacts.
- [ ] Web and worker rollback targets are available.
- [ ] Auth redirects, SMTP, domains and webhook callbacks match the target environment.
- [ ] Two internal verification tenants exist through an audited procedure.
- [ ] Cross-tenant negative verification passes after deploy.
- [ ] No external communication, paid AI, media change or billing is enabled by readiness checks.

## Stop conditions

Stop immediately on migration uncertainty, failed isolation, unexpected privilege, missing backup evidence, authentication failure, growing dead letter, settlement failure, secret exposure, anomalous cost or ambiguous external effect. Record the state before any retry.

## Approval record

```text
Environment:
Version / commit / manifest:
Evidence bundle:
Known limitations:
Approver:
Approved scope:
Provisioning authorized: yes/no
Deployment authorized: yes/no
Runtime activation authorized: yes/no
Real data authorized: yes/no
Timestamp:
```
