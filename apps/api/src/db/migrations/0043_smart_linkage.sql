-- Smart multi-tier ONU linkage support.
--
-- Background: previous linkage relied on a single host/name match between
-- router_netwatch and onus.host. When operators monitored the customer's
-- TR-069 management IP instead of the PPPoE IP, the match silently failed.
-- Likewise, dynamic PPPoE IP renewal broke linkage even though SN and
-- pppoe_user are stable. This migration adds the fields needed for a
-- tier-based match strategy that prefers stable identifiers over IPs.

-- ============ onus: persist both kinds of WAN IP ============
ALTER TABLE onus
    ADD COLUMN IF NOT EXISTS pppoe_ip text,
    ADD COLUMN IF NOT EXISTS mgmt_ip text;

CREATE INDEX IF NOT EXISTS onus_pppoe_ip_idx ON onus (pppoe_ip);
CREATE INDEX IF NOT EXISTS onus_mgmt_ip_idx ON onus (mgmt_ip);
CREATE INDEX IF NOT EXISTS onus_pppoe_user_idx ON onus (pppoe_user);

-- ============ router_netwatch: lock + provenance ============
ALTER TABLE router_netwatch
    -- Operator-set lock prevents auto-linkage from overwriting a manual choice.
    ADD COLUMN IF NOT EXISTS link_locked boolean NOT NULL DEFAULT false,
    -- Why this entry is linked to its onu: 'sn' | 'pppoe_user' | 'pppoe_ip' |
    -- 'mgmt_ip' | 'host' | 'name_exact' | 'name_fuzzy' | 'manual'. Lets the UI
    -- surface 'why' to the operator and helps debug false matches.
    ADD COLUMN IF NOT EXISTS link_source text;

CREATE INDEX IF NOT EXISTS router_netwatch_link_locked_idx ON router_netwatch (link_locked) WHERE link_locked = true;
