-- CR-058, complemento: validadores surgidos nas migrations 000016/000017.
-- Somente search_path; preservar corpo, owner, SECURITY, volatilidade e privilégios.
alter function brand.evidence_valid(jsonb) set search_path = pg_catalog, pg_temp;
alter function strategy.kpis_valid(jsonb) set search_path = pg_catalog, pg_temp;
alter function strategy.method_valid(jsonb) set search_path = pg_catalog, pg_temp;
alter function strategy.method_complete(jsonb) set search_path = pg_catalog, pg_temp;
alter function strategy.variants_valid(jsonb) set search_path = pg_catalog, pg_temp;
