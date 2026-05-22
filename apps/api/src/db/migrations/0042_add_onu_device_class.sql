-- Add device_class to onus to distinguish GPON ONUs from CPE routers discovered via ACS.
--
-- Background: OLT sync inserts rows for actual GPON ONU devices (SN seen on the PON tree).
-- The ACS (TR-069) sync ALSO inserts rows into onus when a device informs in but its SN
-- doesn't match any existing row. Those ACS-only rows are typically the CPE router *behind*
-- the ONU, not the ONU itself — they have a different SN. Until now both kinds were stored
-- in the same table without distinction, so map renderers and netwatch linkage flip-flopped
-- between two candidates for one customer IP.

ALTER TABLE onus
    ADD COLUMN IF NOT EXISTS device_class text NOT NULL DEFAULT 'onu';

-- Backfill: rows whose discovery_sources contain only 'acs' (no OLT confirmation) are
-- almost certainly CPE routers, not ONUs. Rows seen by the OLT remain 'onu' regardless of
-- whether ACS has also informed.
UPDATE onus
SET device_class = 'cpe_router'
WHERE discovery_sources::jsonb ? 'acs'
  AND NOT (discovery_sources::jsonb ? 'olt')
  AND name LIKE 'ACS-%';

-- Index for the typical query "list all ONUs of this router" (excludes CPE routers).
CREATE INDEX IF NOT EXISTS onus_device_class_idx ON onus (device_class);
CREATE INDEX IF NOT EXISTS onus_router_id_device_class_idx ON onus (router_id, device_class);
