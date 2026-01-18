-- Add PPPoE sessions table for tracking connect/disconnect events
CREATE TABLE IF NOT EXISTS "pppoe_sessions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "router_id" uuid NOT NULL REFERENCES "routers"("id") ON DELETE CASCADE,
    "name" text NOT NULL,
    "session_id" text,
    "caller_id" text,
    "address" text,
    "service" text,
    "uptime" text,
    "connected_at" timestamp DEFAULT now() NOT NULL,
    "last_seen" timestamp DEFAULT now() NOT NULL
);

-- Add new PPPoE alert types to the enum
-- Note: PostgreSQL requires a workaround to add values to enums
DO $$
BEGIN
    -- Check if the value doesn't exist before adding
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'pppoe_connect' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'alert_type')) THEN
        ALTER TYPE "alert_type" ADD VALUE 'pppoe_connect';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'pppoe_disconnect' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'alert_type')) THEN
        ALTER TYPE "alert_type" ADD VALUE 'pppoe_disconnect';
    END IF;
END$$;
