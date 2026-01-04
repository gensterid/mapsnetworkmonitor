-- Add escalation tracking columns to alerts table
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS escalation_level INTEGER NOT NULL DEFAULT 0;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS last_escalated_at TIMESTAMP;
