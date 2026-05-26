-- Webhook idempotency cache for netwatch entries.
--
-- Problem: the sync cycle re-injects the webhook script into MikroTik
-- every cycle (~30s) even when the script is already correct. Each
-- modification briefly resets the netwatch entry status, firing UP/DOWN
-- events that flood Telegram and create MikroTik log noise.
--
-- Root cause: the existing idempotency check compares substrings of the
-- script returned by MikroTik. Some edge case in that comparison fails
-- repeatedly even when the script content is fine.
--
-- Fix: cache a signature (hash of host + webhook_url + webhook_secret)
-- and the timestamp of the last successful sync per netwatch entry. If
-- the signature matches and the last sync was within 24h, skip the
-- MikroTik webhook config call entirely — no API hit, no log noise.
--
-- After 24h, re-verify regardless (safety: catches manual MikroTik
-- edits or token rotations not yet propagated).

ALTER TABLE router_netwatch
    ADD COLUMN IF NOT EXISTS webhook_signature text,
    ADD COLUMN IF NOT EXISTS webhook_last_synced_at timestamp;
