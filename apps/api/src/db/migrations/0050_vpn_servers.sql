-- Phase 3.1: Multi-VPN-server management
-- Adds vpn_servers table + vpn_server_id FK to routers.
-- Subnet is UNIQUE to prevent routing conflicts (cannot have 2 VPNs
-- with overlapping CIDR — Linux routing table can't disambiguate).

CREATE TABLE IF NOT EXISTS "vpn_servers" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    "name" text NOT NULL,
    "region" text,
    "type" text NOT NULL,
    "enabled" boolean NOT NULL DEFAULT true,
    "priority" integer NOT NULL DEFAULT 5,
    "notes" text,

    "host" text NOT NULL,
    "port" integer NOT NULL,
    "proto" text NOT NULL DEFAULT 'tcp',

    "username" text NOT NULL,
    "password_encrypted" text NOT NULL,

    "mode" text NOT NULL DEFAULT 'tap',
    "cipher" text NOT NULL DEFAULT 'AES-256-CBC',
    "auth" text NOT NULL DEFAULT 'SHA1',
    "ca_cert_pem" text,
    "verify_server_cert" boolean NOT NULL DEFAULT true,
    "extra_config" text,

    "client_subnet" text NOT NULL,

    "status" text NOT NULL DEFAULT 'disabled',
    "tunnel_ip" text,
    "last_connected_at" timestamp,
    "last_disconnected_at" timestamp,
    "last_error" text,
    "last_checked_at" timestamp,
    "connection_attempts" integer NOT NULL DEFAULT 0,

    "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "vpn_servers_client_subnet_unique" ON "vpn_servers" ("client_subnet");
CREATE UNIQUE INDEX IF NOT EXISTS "vpn_servers_name_unique" ON "vpn_servers" ("name");
CREATE INDEX IF NOT EXISTS "vpn_servers_status_idx" ON "vpn_servers" ("status");
CREATE INDEX IF NOT EXISTS "vpn_servers_enabled_idx" ON "vpn_servers" ("enabled");

-- Add nullable FK on routers so existing rows (no VPN context) stay valid.
ALTER TABLE "routers" ADD COLUMN IF NOT EXISTS "vpn_server_id" uuid
    REFERENCES "vpn_servers"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "routers_vpn_server_id_idx" ON "routers" ("vpn_server_id");
