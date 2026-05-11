-- Fase A scale prep: retention helpers + dedupe support.
-- All operations are idempotent and non-destructive (no DROP COLUMN/TABLE).

-- 1. Retention helper functions for non-Timescale Postgres.
-- We keep them as plain SQL functions so they can be called from a scheduler
-- task. Each prunes by recorded_at older than the threshold.
CREATE OR REPLACE FUNCTION prune_client_bandwidth_history(retention_days int DEFAULT 30)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE deleted int;
BEGIN
    DELETE FROM client_bandwidth_history
        WHERE recorded_at < NOW() - (retention_days || ' days')::interval;
    GET DIAGNOSTICS deleted = ROW_COUNT;
    RETURN deleted;
END $$;

CREATE OR REPLACE FUNCTION prune_router_metrics(retention_days int DEFAULT 90)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE deleted int;
BEGIN
    DELETE FROM router_metrics
        WHERE recorded_at < NOW() - (retention_days || ' days')::interval;
    GET DIAGNOSTICS deleted = ROW_COUNT;
    RETURN deleted;
END $$;

CREATE OR REPLACE FUNCTION prune_resolved_alerts(retention_days int DEFAULT 30)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE deleted int;
BEGIN
    DELETE FROM alerts
        WHERE resolved = true
          AND resolved_at IS NOT NULL
          AND resolved_at < NOW() - (retention_days || ' days')::interval;
    GET DIAGNOSTICS deleted = ROW_COUNT;
    RETURN deleted;
END $$;

-- 2. Dedupe index for packet_loss alert lookup.
-- Lets the alert service do a fast existence check on
-- (router_id, type, resolved=false) when deciding whether to suppress a
-- duplicate packet_loss event within a short time window.
CREATE INDEX IF NOT EXISTS alerts_dedupe_idx
    ON alerts (router_id, type, resolved, created_at DESC)
    WHERE resolved = false;
