-- Add connection fields to pppoe_sessions table
ALTER TABLE pppoe_sessions ADD COLUMN IF NOT EXISTS connected_to_id UUID REFERENCES netwatch_entries(id) ON DELETE SET NULL;
ALTER TABLE pppoe_sessions ADD COLUMN IF NOT EXISTS connection_type TEXT DEFAULT 'router';
