# Rollback and Recovery Plan v1

**Status:** `approved_for_planning`  
**RPO/RTO:** pending `DP-07b`  
**Restore evidence:** pending EXP-04

## Principle

Rollback of application code is not rollback of database state or confirmed external effects. Recovery always identifies the affected component and preserves audit evidence.

## Component strategy

| Component | Recovery |
|---|---|
| Web | Promote the last compatible immutable deployment |
| Worker | Disable activation/kill switch, then restore the last compatible image revision |
| Database schema | Forward corrective migration; never edit or blindly reverse an applied migration |
| Data | Authorized restore/PITR only after declaring the loss window and reconciliation plan |
| Storage | Restore from the separately validated object strategy; database backup alone is insufficient |
| Auth/config | Reapply the previous versioned configuration checklist |
| Secrets | Rotate/revoke and redeploy; never restore an exposed value |
| Queues/outbox | Pause claims, preserve messages, reconcile leases and fencing; never purge as routine rollback |
| Agent definitions | Kill switch and restore prior version; persisted historical outputs remain immutable |
| External effects | Reconcile with provider and apply an explicit compensation when available; never promise automatic reversal |

## Recovery order

1. stop new claims/effects with the narrowest kill switch;
2. declare incident, environment, version and affected tenants without exposing them in public telemetry;
3. preserve logs, traces, queue/outbox and database evidence;
4. classify whether the effect is absent, confirmed or uncertain;
5. choose component rollback, forward fix, restore or compensation;
6. obtain specific authorization for destructive restore or data loss;
7. execute from an immutable artifact;
8. run isolation and integrity verification;
9. reconcile pending/uncertain effects before resuming;
10. record outcome and follow-up.

## Mandatory drills before real data

- web and worker rollback;
- failed migration interruption and forward repair;
- database restore and, if contracted, PITR;
- Storage object recovery;
- custom login-role credential reconstruction;
- dead-letter/manual reconciliation without automatic replay;
- kill switch during an in-flight delivery;
- loss of observability backend without loss of product audit truth.

## Stop and escalation

Do not resume on failed isolation, unknown migration state, missing restore evidence, ambiguous authorization, unresolved secret exposure or uncertain external effect. Repetition must preserve the original transaction and receive a new audited idempotency identity where appropriate.

## Limits

No restore was executed by this plan. Provider backup claims, PITR, retention and Storage recovery are not considered validated until EXP-04 is authorized and passes against the contracted configuration.
