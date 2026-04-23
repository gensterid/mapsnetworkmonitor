-- Backfill per-source freshness timestamps for ONUs created before migration 0035.
-- Without this, existing records have NULL last_seen_olt / last_seen_acs and would
-- falsely appear as "Hilang di OLT" or "Ghost ONU" until the next sync populates
-- the column. We use updated_at as a conservative baseline — it ages naturally
-- from there, so a truly stale ONU will still be flagged after the 2-hour threshold.

UPDATE "onus"
SET "last_seen_olt" = "updated_at"
WHERE "last_seen_olt" IS NULL
  AND "discovery_sources"::text LIKE '%"olt"%';--> statement-breakpoint

UPDATE "onus"
SET "last_seen_acs" = "updated_at"
WHERE "last_seen_acs" IS NULL
  AND "discovery_sources"::text LIKE '%"acs"%';
