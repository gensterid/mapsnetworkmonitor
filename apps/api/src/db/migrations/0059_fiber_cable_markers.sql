-- Penanda jarak (cek putus) untuk kabel fiber — ukur X meter dari ujung, lintas
-- ODP (kabel sudah 1 polyline menerus). Format: [{ side, meters, label }].
-- Lihat docs/FIBER-CABLE-DESIGN.md (fase C5).

ALTER TABLE "fiber_cables" ADD COLUMN IF NOT EXISTS "distance_markers" jsonb DEFAULT '[]'::jsonb NOT NULL;
