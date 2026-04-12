DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='routers' AND column_name='use_snmp') THEN
        ALTER TABLE "routers" ADD COLUMN "use_snmp" boolean DEFAULT true NOT NULL;
    END IF;
END $$;
