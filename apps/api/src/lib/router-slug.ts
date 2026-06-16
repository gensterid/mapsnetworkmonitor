import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { routers } from '../db/schema/index.js';

/**
 * Slugify router name untuk URL public:
 *   "ADY27"            → "ady27"
 *   "WiFi Cabang Pemalang" → "wifi-cabang-pemalang"
 *   "ROUTER-01_Cabang B"   → "router-01-cabang-b"
 */
export function slugifyRouterName(name: string): string {
    return String(name || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64);
}

/**
 * Resolve router by slug. Lookup global (lintas tenant) karena public URL —
 * slug ambigu antar tenant adalah risiko yang di-mitigate dengan warning di
 * operator UI (lihat plan V1).
 *
 * Return null kalau tidak ada atau slug ambigu (multiple match).
 */
export async function resolveRouterBySlug(slug: string): Promise<{ id: string; name: string; tenantId: string } | null> {
    const target = slug.toLowerCase();
    // Postgres pakai regex untuk slugify on-the-fly: lower + replace non-alphanumeric → "-"
    // Pakai ekspresi yang sama dengan slugifyRouterName supaya konsisten.
    const matches = await db.execute(sql`
        SELECT id, name, tenant_id AS "tenantId"
        FROM routers
        WHERE regexp_replace(regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'), '^-+|-+$', '', 'g') = ${target}
        LIMIT 2
    `) as any[];
    if (matches.length !== 1) return null;
    return matches[0];
}
