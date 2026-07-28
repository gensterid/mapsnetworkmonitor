-- Tutup celah isolasi tenant di tabel presets (WAN/WiFi ONT, Fase-2):
-- tambah kolom tenant_id agar preset di-scope per tenant (samakan pola audit).
-- Kolom nullable → baris preset lama tetap valid (tenant_id=null = global/legacy).

ALTER TABLE "presets" ADD COLUMN IF NOT EXISTS "tenant_id" uuid REFERENCES "tenants"("id");
--> statement-breakpoint
-- Backfill: pada deployment single-tenant, tetapkan preset lama ke tenant satu-satunya
-- agar tetap terlihat admin/operator (scoping `tenant_id = X` tak match NULL).
-- Multi-tenant: no-op (dibiarkan NULL → hanya superadmin yang mengaturnya).
UPDATE "presets" SET "tenant_id" = (SELECT "id" FROM "tenants" LIMIT 1)
WHERE "tenant_id" IS NULL AND (SELECT count(*) FROM "tenants") = 1;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "presets_tenant_id_idx" ON "presets" ("tenant_id");
