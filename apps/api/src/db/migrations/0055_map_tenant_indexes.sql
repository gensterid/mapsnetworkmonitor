-- Add tenantId indexes on olts + onus untuk speed up /api/map/layout
-- query yang filter by tenantId (operator daily polling endpoint).
--
-- Sebelumnya: tenantId column exist tapi tidak ada index \xe2\x86\x92 seq scan
-- pada tenant dengan banyak OLT/ONU = slow query (60-200ms vs 5ms).
--
-- Index strategy:
--   - olts_tenant_id_idx          : tenant scope filter (admin/superadmin)
--   - olts_tenant_parent_idx      : tenant + parentId composite (operator scope)
--   - onus_tenant_id_idx          : tenant scope filter
--   - onus_tenant_router_idx      : tenant + routerId composite (operator scope)

CREATE INDEX IF NOT EXISTS "olts_tenant_id_idx" ON "olts" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "olts_tenant_parent_idx" ON "olts" ("tenant_id", "parent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onus_tenant_id_idx" ON "onus" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onus_tenant_router_idx" ON "onus" ("tenant_id", "router_id");
