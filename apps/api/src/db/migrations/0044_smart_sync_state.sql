-- Smart Sync State Tracking for router_netwatch
--
-- Background: app and MikroTik /tool/netwatch can desync silently when
-- either side is edited without the other knowing. Operator had no way
-- to see which rows were in conflict between the two sources of truth.
--
-- This migration adds explicit sync state columns so the UI can show
-- per-row badges (synced / pending / conflict / app_only) and a banner
-- summarizing how many entries need operator attention.
--
-- Design:
--   - mikrotik_host: snapshot of what MikroTik last reported for this row
--   - mikrotik_synced_at: timestamp of the last successful sync from MikroTik
--   - sync_state: explicit lifecycle state
--   - conflict_reason: human-readable explanation when sync_state='conflict'

ALTER TABLE router_netwatch
    ADD COLUMN IF NOT EXISTS mikrotik_host text,
    ADD COLUMN IF NOT EXISTS mikrotik_synced_at timestamp,
    ADD COLUMN IF NOT EXISTS sync_state text NOT NULL DEFAULT 'synced',
    ADD COLUMN IF NOT EXISTS conflict_reason text;

-- Partial index — most queries will scan 'conflict' / 'pending' rows only;
-- 'synced' is the default and dominant case, so we don't need a regular index.
CREATE INDEX IF NOT EXISTS router_netwatch_sync_state_idx
    ON router_netwatch (sync_state)
    WHERE sync_state IN ('conflict', 'pending');

-- Backfill: existing app-only entries should be marked accordingly so the
-- UI distinguishes them from MikroTik-synced rows.
UPDATE router_netwatch
SET sync_state = 'app_only'
WHERE is_app_only = true
  AND sync_state = 'synced';
