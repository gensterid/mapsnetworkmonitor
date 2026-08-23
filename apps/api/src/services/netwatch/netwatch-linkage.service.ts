import { eq, inArray, sql, and, isNull } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { routers, routerNetwatch, onus, olts } from '../../db/schema/index.js';
import { logger } from '../../lib/logger.js';
import { alertService } from '../alert.service.js';

/**
 * Sync netwatch status to ONUs table
 */
export async function syncToOnus(routerId: string, tx: any = db): Promise<void> {
    try {
        const linkedOlts = await tx.select({ id: olts.id }).from(olts).where(eq(olts.parentId, routerId));
        if (linkedOlts.length === 0) {
            const [router] = await tx.select({ tenantId: routers.tenantId }).from(routers).where(eq(routers.id, routerId)).limit(1);
            if (!router?.tenantId) return;
            const activeOnus = await tx.select().from(onus).where(and(eq(onus.tenantId, router.tenantId), isNull(onus.archivedAt)));
            if (activeOnus.length === 0) return;
            // Strict mode: this router has no OLT, so ONUs come from tenant-wide
            // search. Only SN + PPPoE user are safe — host/name can collide cross-router.
            return performLinkage(routerId, activeOnus, tx, true);
        }
 
        const oltIds = linkedOlts.map((o: any) => o.id);
        const activeOnus = await tx.select().from(onus).where(and(inArray(onus.oltId, oltIds), isNull(onus.archivedAt)));
        if (activeOnus.length === 0) return;
 
        return performLinkage(routerId, activeOnus, tx);
    } catch (err: any) { logger.error({ err: err?.message || String(err), routerId }, 'Failed to sync netwatch to onus'); }
}

/**
 * Multi-tier linkage. Each tier is more stable than the next, so we prefer
 * higher tiers when picking a candidate. The picked source is recorded in
 * routerNetwatch.linkSource so the UI can explain WHY a marker is linked
 * to a particular ONU.
 *
 * Tier order (highest priority first) — SEMUA tier exact sebelum tier fuzzy:
 *   1. 'sn'         — SN encoded in netwatch comment (e.g. 'SN:ZTEGxxx')
 *   2. 'pppoe_user' — comment contains 'user:foo@isp' matching onu.pppoeUser
 *   3. 'pppoe_ip'   — netwatch.host = onu.pppoeIp
 *   4. 'mgmt_ip'    — netwatch.host = onu.mgmtIp (TR-069 management)
 *   5. 'host'       — netwatch.host = onu.host (legacy fallback)
 *   6. 'name_exact' — case-insensitive name match
 *   7. 'desc_exact' — case-insensitive match ke onu.description (nama operator
 *                     di OLT: C-Data OnuDesc / HSGQ ont_description)
 *   8. 'name_fuzzy' — netwatch.name contains onu.name (len > 3)
 *   9. 'desc_fuzzy' — netwatch.name contains onu.description (len > 3)
 *
 * Sumber khusus non-tier: 'manual' — link dipilih operator via UI. Diperlakukan
 * sebagai KUAT (bukan fuzzy) sehingga auto-linkage tak pernah menimpanya.
 * Lihat TIER_RANK + shouldUpgradeWeakLink().
 *
 * Filters always applied:
 *   - same router (tenant/router scope)
 *   - device_class = 'onu' (no CPE routers)
 *   - archived_at IS NULL (no ghost ONUs)
 *
 * Tiebreaker within a tier: lastSeenOlt DESC (newest confirmation wins),
 * then createdAt DESC.
 *
 * Operator lock: rows with link_locked=true are skipped entirely. Operator's
 * explicit choice is never overwritten.
 */
const SN_COMMENT_RE = /SN[:=]\s*([A-Z0-9]+)/i;
const USER_COMMENT_RE = /(?:user|pppoe)[:=]\s*(\S+)/i;

// Peringkat tier (angka kecil = lebih kuat/andal). Dipakai untuk meng-upgrade
// link LEMAH (fuzzy) ke match yang lebih tinggi bila kini tersedia.
const TIER_RANK: Record<string, number> = {
    sn: 1, pppoe_user: 2, pppoe_ip: 3, mgmt_ip: 4, host: 5,
    name_exact: 6, desc_exact: 7, name_fuzzy: 8, desc_fuzzy: 9,
};
const tierRank = (s?: string | null): number => TIER_RANK[s || ''] ?? 99;
// Hanya link fuzzy (substring) yang boleh di-upgrade otomatis. Sumber exact,
// IP/SN, dan 'manual' (pilihan operator) dianggap KUAT → tak pernah ditimpa.
const isWeakSource = (s?: string | null): boolean => s === 'name_fuzzy' || s === 'desc_fuzzy';

/**
 * Keputusan murni: bolehkah link yang SUDAH ADA di-reassign ke hasil pickByTier
 * yang baru? Dipakai performLinkage untuk meng-upgrade link LEMAH tanpa
 * mengganggu link kuat/manual dan tanpa churn.
 *
 * true HANYA bila: sumber saat ini lemah (fuzzy) DAN ONU hasil berbeda DAN
 * tier hasil benar-benar lebih tinggi (angka TIER_RANK lebih kecil).
 */
export function shouldUpgradeWeakLink(
    currentSource: string | null | undefined,
    currentOnuId: string | null | undefined,
    pickedSource: string,
    pickedOnuId: string,
): boolean {
    if (!isWeakSource(currentSource)) return false;      // kuat/manual/lock → jangan sentuh
    if (pickedOnuId === currentOnuId) return false;      // ONU sama → no-op (anti-flap)
    return tierRank(pickedSource) < tierRank(currentSource); // hanya naik tier
}

export function pickByTier(entry: any, sortedOnus: any[], strictMode = false): { onu: any | null; source: string | null } {
    const host = (entry.host || '').trim();
    const comment = `${entry.name || ''} ${entry.comment || ''}`;
    const entryNameNormalized = (entry.name || '').toLowerCase().trim();

    // Tier 1 — SN in comment (globally unique, safe cross-router)
    const snMatch = comment.match(SN_COMMENT_RE);
    if (snMatch) {
        const sn = snMatch[1].toUpperCase();
        const o = sortedOnus.find(o => (o.sn || '').toUpperCase() === sn);
        if (o) return { onu: o, source: 'sn' };
    }

    // Tier 2 — PPPoE user in comment (tenant-unique, safe cross-router)
    const userMatch = comment.match(USER_COMMENT_RE);
    if (userMatch) {
        const user = userMatch[1].toLowerCase();
        const o = sortedOnus.find(o => (o.pppoeUser || '').toLowerCase() === user);
        if (o) return { onu: o, source: 'pppoe_user' };
    }

    // Strict mode (router-without-OLT fallback): refuse tier 3-7 because IP/host/name
    // collide across routers within the same tenant (RFC1918, generic names).
    if (strictMode) return { onu: null, source: null };

    if (host && host !== '0.0.0.0') {
        // Tier 3 — PPPoE WAN IP
        const o3 = sortedOnus.find(o => o.pppoeIp === host);
        if (o3) return { onu: o3, source: 'pppoe_ip' };

        // Tier 4 — TR-069 management IP
        const o4 = sortedOnus.find(o => o.mgmtIp === host);
        if (o4) return { onu: o4, source: 'mgmt_ip' };

        // Tier 5 — generic host fallback
        const o5 = sortedOnus.find(o => (o.host || '').trim() === host);
        if (o5) return { onu: o5, source: 'host' };
    }

    if (entryNameNormalized) {
        // Urutan sengaja: SEMUA tier EXACT dulu, baru tier FUZZY. Match exact
        // (name/description) lebih andal daripada fuzzy-substring, sehingga
        // netwatch "ady27 box" harus menang ke ONU deskripsi "ady27 box"
        // (desc_exact) alih-alih ter-fuzzy ke ONU lain berdeskripsi "ADY27".

        // Tier — exact name match (case-insensitive)
        const oNameExact = sortedOnus.find(o => (o.name || '').toLowerCase().trim() === entryNameNormalized);
        if (oNameExact) return { onu: oNameExact, source: 'name_exact' };

        // Tier — exact DESCRIPTION match. Banyak OLT (C-Data OnuDesc, HSGQ
        // ont_description) menyimpan nama pelanggan di `description`, sedangkan
        // `name` justru identifier auto (mis. 'HG6243C_0/0/2:16'). Tanpa tier ini,
        // ONT tanpa-ACS yang namanya cuma di description tak pernah auto-link.
        const oDescExact = sortedOnus.find(o => (o.description || '').toLowerCase().trim() === entryNameNormalized);
        if (oDescExact) return { onu: oDescExact, source: 'desc_exact' };

        // Tier — fuzzy name (substring)
        const oNameFuzzy = sortedOnus.find(o =>
            o.name && o.name.length > 3 &&
            entryNameNormalized.includes(o.name.toLowerCase().trim())
        );
        if (oNameFuzzy) return { onu: oNameFuzzy, source: 'name_fuzzy' };

        // Tier — fuzzy description (substring)
        const oDescFuzzy = sortedOnus.find(o =>
            o.description && o.description.length > 3 &&
            entryNameNormalized.includes(o.description.toLowerCase().trim())
        );
        if (oDescFuzzy) return { onu: oDescFuzzy, source: 'desc_fuzzy' };
    }

    return { onu: null, source: null };
}

export async function performLinkage(routerId: string, activeOnus: any[], tx: any = db, strictMode = false): Promise<void> {
    try {
        const netwatchEntries = await tx.select().from(routerNetwatch).where(eq(routerNetwatch.routerId, routerId));
        if (netwatchEntries.length === 0) return;

        // Only real GPON ONUs participate in linkage. ACS-discovered CPE
        // routers (deviceClass='cpe_router') would otherwise collide on host.
        const linkableOnus = activeOnus.filter((o: any) =>
            !o.deviceClass || o.deviceClass === 'onu'
        );
        // Newest-confirmed-ONU wins when two would match the same tier.
        const sortedOnus = [...linkableOnus].sort((a: any, b: any) => {
            const at = a.lastSeenOlt ? new Date(a.lastSeenOlt).getTime() : 0;
            const bt = b.lastSeenOlt ? new Date(b.lastSeenOlt).getTime() : 0;
            if (bt !== at) return bt - at;
            const ac = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const bc = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return bc - ac;
        });

        let linkedCount = 0;
        let ambiguousCount = 0;
        for (const entry of netwatchEntries) {
            // ODP is a passive splitter — it has no CPE, so it must never be
            // linked to an ONU row.
            if (entry.deviceType === 'odp') continue;

            // Operator lock — never overwrite a manual choice.
            if (entry.linkLocked) continue;

            // Sudah ter-link + sumber tercatat.
            //  - Sumber KUAT (bukan fuzzy) → skip demi stabilitas. Operator bisa
            //    re-link via UI (yang clear link_source / set manual).
            //  - Sumber LEMAH (name_fuzzy/desc_fuzzy) → rawan salah cocok (mis.
            //    netwatch "ady27 box" ter-fuzzy ke ONU deskripsi "ADY27"). Coba
            //    UPGRADE bila kini tersedia match tier lebih tinggi — mis.
            //    desc_exact yang baru muncul setelah deskripsi OLT ter-backfill.
            const alreadyLinked = !!(entry.linkedOnuId && entry.linkSource);
            // Fast-path: link kuat/manual tak pernah berubah → lewati pickByTier.
            // (Sama verdict-nya dengan shouldUpgradeWeakLink, sekadar hemat kerja.)
            if (alreadyLinked && !isWeakSource(entry.linkSource)) continue;

            const { onu: targetOnu, source } = pickByTier(entry, sortedOnus, strictMode);
            if (!targetOnu || !source) continue;

            // Untuk entri yang sudah ter-link lemah: hanya pindah bila hasil baru
            // benar-benar tier LEBIH TINGGI dan ONU berbeda (hindari churn/flap).
            if (alreadyLinked) {
                if (!shouldUpgradeWeakLink(entry.linkSource, entry.linkedOnuId, source, targetOnu.id)) continue;
                logger.info({
                    routerId,
                    netwatch: entry.name,
                    fromSource: entry.linkSource,
                    toSource: source,
                    oldOnuId: entry.linkedOnuId,
                    newOnuSn: targetOnu.sn,
                }, '[Linkage] Upgrade link lemah → tier lebih tinggi');
            }

            // Audit trail: tenant-wide fallback can legitimately match SN/PPPoE user
            // across routers (e.g. uplink router monitoring downstream OLT). Logged
            // so operators can verify these are intended.
            if (strictMode && targetOnu.routerId && targetOnu.routerId !== routerId) {
                logger.info({
                    routerId,
                    entryName: entry.name,
                    onuSn: targetOnu.sn,
                    onuRouterId: targetOnu.routerId,
                    source,
                }, '[Linkage] Strict-mode cross-router match (router has no OLT)');
            }

            // Surface ambiguity: more than one ONU could have matched in the chosen tier.
            // Useful diagnostic without blocking the assignment.
            const tieCount = sortedOnus.filter(o => {
                if (source === 'sn') return (o.sn || '').toUpperCase() === (targetOnu.sn || '').toUpperCase();
                if (source === 'pppoe_user') return (o.pppoeUser || '').toLowerCase() === (targetOnu.pppoeUser || '').toLowerCase();
                if (source === 'pppoe_ip') return o.pppoeIp === targetOnu.pppoeIp;
                if (source === 'mgmt_ip') return o.mgmtIp === targetOnu.mgmtIp;
                if (source === 'host') return (o.host || '').trim() === (targetOnu.host || '').trim();
                return false;
            }).length;
            if (tieCount > 1) {
                ambiguousCount++;
                logger.warn({ routerId, netwatchHost: entry.host, netwatchName: entry.name, picked: targetOnu.sn, source, tieCount }, '[Linkage] Multiple candidates matched same tier; picked newest by lastSeenOlt');
            }

            const status = entry.status === 'up' ? 'online' : (entry.status === 'down' ? 'offline' : targetOnu.status);
            const onuUpdateData: any = { status, lastSeen: status === 'online' ? new Date() : targetOnu.lastSeen, updatedAt: new Date() };

            const host = (entry.host || '').trim();
            // Only update onu.host when matched via host-based tier. SN / user
            // matches don't tell us anything new about the IP.
            if (host && (source === 'host' || source === 'pppoe_ip' || source === 'mgmt_ip') && targetOnu.host !== host) {
                const oldHost = targetOnu.host;
                onuUpdateData.host = host;
                logger.info({ onu: targetOnu.name, sn: targetOnu.sn, oldHost, newHost: host, source }, '[Linkage] Updating host IP from Netwatch match');

                if (oldHost && oldHost !== '0.0.0.0') {
                    await alertService.resolveAlertsByHost(routerId, oldHost, targetOnu.tenantId, tx).catch(e =>
                        logger.warn({ err: e.message || String(e), host: oldHost }, 'Failed to resolve alerts for old host during linkage shift')
                    );
                }
                await tx.update(onus).set({ host: null }).where(and(eq(onus.host, host), sql`id != ${targetOnu.id}::uuid`));
            }

            const sources = (targetOnu.discoverySources as string[]) || [];
            if (!sources.includes('netwatch')) sources.push('netwatch');
            onuUpdateData.discoverySources = sources;
            await tx.update(onus).set(onuUpdateData).where(eq(onus.id, targetOnu.id));

            await tx.update(routerNetwatch).set({
                linkedOnuId: targetOnu.id,
                linkSource: source,
                updatedAt: new Date(),
            }).where(eq(routerNetwatch.id, entry.id));
            linkedCount++;
        }
        if (linkedCount > 0 || ambiguousCount > 0) {
            logger.info({ routerId, linkedCount, ambiguousCount }, '[Unified Linkage] Sync complete');
        }
    } catch (e) { logger.error({ err: e, routerId }, '[Unified Linkage] Failed to sync Netwatch to ONUs'); }
}

export async function ensureNetwatchEntry(routerId: string, host: string, name?: string, type?: 'olt' | 'router' | 'switch', tenantId?: string, tx: any = db) {
    const filters = [eq(routerNetwatch.routerId, routerId), eq(routerNetwatch.host, host)];
    if (name) filters.push(eq(routerNetwatch.name, name));
    const [existing] = await tx.select().from(routerNetwatch).where(and(...filters));

    if (existing) {
        const updatePayload: any = { isAppOnly: true, updatedAt: new Date() };
        if (type) {
            let deviceType: any = 'client';
            if (type === 'olt') deviceType = 'olt';
            else if (type === 'router') deviceType = 'router';
            else if (type === 'switch') deviceType = 'switch';
            updatePayload.deviceType = deviceType;
        }
        await tx.update(routerNetwatch).set(updatePayload).where(eq(routerNetwatch.id, existing.id));
        return existing.id;
    }
 
    const [byHost] = await tx.select().from(routerNetwatch).where(and(eq(routerNetwatch.routerId, routerId), eq(routerNetwatch.host, host)));
    if (byHost) {
        const updatePayload: any = { isAppOnly: true, updatedAt: new Date() };
        if (name && byHost.name !== name) updatePayload.name = name;
        await tx.update(routerNetwatch).set(updatePayload).where(eq(routerNetwatch.id, byHost.id));
        return byHost.id;
    }
 
    let deviceType: any = 'client';
    if (type === 'olt') deviceType = 'olt';
    else if (type === 'router') deviceType = 'router';
    else if (type === 'switch') deviceType = 'switch';
 
    const [inserted] = await tx
        .insert(routerNetwatch)
        .values({ 
            routerId, 
            host, 
            name, 
            deviceType: type || 'client', 
            isAppOnly: true, 
            tenantId, 
            status: 'unknown', 
            interval: 60 
        } as any)
        .onConflictDoUpdate({
            target: [routerNetwatch.routerId, routerNetwatch.host],
            set: {
                isAppOnly: true,
                updatedAt: new Date(),
                // Only update name if it was explicitly provided
                ...(name ? { name } : {})
            }
        })
        .returning();
    return inserted.id;
}
