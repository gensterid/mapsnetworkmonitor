-- Migration: make_netwatch_host_nullable
-- Created at: 2026-04-04 12:20:00

ALTER TABLE "router_netwatch" ALTER COLUMN "host" DROP NOT NULL;
