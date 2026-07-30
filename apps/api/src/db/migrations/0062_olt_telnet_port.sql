-- Override port Telnet untuk provisioning OLT. Diperlukan saat OLT dijangkau
-- lewat VPN port-forward yang tidak memetakan port eksternal ke 23. Null →
-- driver provisioning pakai default 23.
ALTER TABLE "olts" ADD COLUMN IF NOT EXISTS "telnet_port" integer;
