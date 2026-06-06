-- Phase A10 follow-up: limit_uptime per profile.
--
-- Different concept from `validity` (Masa Berlaku). Validity counts wall
-- clock from first login; limit_uptime counts cumulative connected
-- time. Operators commonly use both: voucher 1d validity + 10h uptime
-- means "expires when EITHER 24h wall-clock OR 10h of actual use
-- passes since first login, whichever first".
--
-- limit_uptime is a RouterOS native field on the hotspot USER (not
-- profile), so the actual enforcement happens by baking the value into
-- /ip/hotspot/user/add at voucher-generation time. The DB column here
-- just holds the per-profile default so the operator doesn't re-type
-- it for every batch.

ALTER TABLE "mikhmon_profile_settings"
    ADD COLUMN IF NOT EXISTS "limit_uptime" text;
