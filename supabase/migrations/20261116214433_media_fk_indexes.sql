-- CR-055: patch físico, sem alteração de contrato, dados ou privilégios.
-- Três FKs de mídia apontadas pelo advisor após aplicação em develop.
create index media_account_claims_tenant_platform on media.account_claims(tenant_id,platform);
create index media_campaign_links_campaign on media.campaign_links(tenant_id,campaign_id);
create index media_sync_jobs_account on media.sync_jobs(tenant_id,platform,account_id);
